import { describe, expect, mock, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import type { On } from 'claude-code'

import { POWERSHELL_PROBE, SH_PROBE, parseProbe } from '../hooks/probe'
import { band, effectivePercent, parseUsage, printable } from '../hooks/usage'

// Every identity, token and organization below is synthetic.
const HOME = 'C:\\Users\\tester'
const ROOT = `${HOME}\\.claude-accounts`
const CLAUDE = `${HOME}\\.local\\bin\\claude.exe`
const POWERSHELL = 'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe'
const NOW = Date.parse('2030-01-01T00:00:00Z')
const SOON = '2030-01-01T05:00:00Z'
const LATER = '2030-01-05T00:00:00Z'
const ESCAPED = 'evil\u001b]0;pwned\u0007'

const IDENTITIES: Record<string, { email: string; orgId: string }> = {
  '': { email: 'w1@example.test', orgId: 'org-a' },
  [`${ROOT}\\work2`]: { email: 'w2@example.test', orgId: 'org-a' },
  [`${ROOT}\\personal`]: { email: 'me@example.test', orgId: 'org-b' },
  [`${ROOT}\\lapsed`]: { email: 'w3@example.test', orgId: 'org-a' },
  [`${ROOT}\\${ESCAPED}`]: { email: 'w4@example.test', orgId: 'org-a' },
}
/** What each profile's helper would print: its usage, a lapsed login (401), or no login. */
const PROBES: Record<string, { five: number; seven: number } | 401> = {
  [`${ROOT}\\work2`]: { five: 12, seven: 40 },
  [`${ROOT}\\personal`]: { five: 3, seven: 5 },
  [`${ROOT}\\lapsed`]: 401,
  [`${ROOT}\\${ESCAPED}`]: { five: 1, seven: 1 },
}
/** The tokens the profiles' files would hold: none may ever reach the mod. */
const TOKENS = ['synthetic-token-work2', 'synthetic-token-personal']

const PANE = {
  plugin: 'account-bars',
  component: 'Pane',
  requestId: 'accounts',
  props: {
    title: 'Accounts',
    isFocused: false,
    bodyColumns: 40,
    placement: 'dock',
    scroll: { offset: 0, bodyRows: 40 },
    view: {},
  },
} as const

const LIMIT_HIT = {
  context: { window: 200_000 },
  rateLimits: [
    { kind: 'five_hour', percentUsed: 100, resetsAt: SOON },
    { kind: 'seven_day', percentUsed: 30, resetsAt: LATER },
  ],
  changed: ['rateLimits' as const],
}

type World = {
  runs: { argv: readonly string[]; cwd: string | undefined; env: Record<string, string> | undefined }[]
  fsReads: string[]
  fetches: { url: string; authorization: string | undefined }[]
  toasts: string[]
  notices: string[]
  store: Map<string, unknown>
  state: Map<string, unknown>
}

/** The machine beneath the plugin: five profile folders, one signed out, one lapsed, one oddly named. */
type Setup = { hasClaude?: boolean; files?: readonly string[]; env?: Readonly<Record<string, string>> }

function world(on: On, { hasClaude = true, files = [], env = {} }: Setup = {}): World {
  const w: World = { runs: [], fsReads: [], fetches: [], toasts: [], notices: [], store: new Map(), state: new Map() }
  const dir = (name: string) => ({ name, kind: 'dir' as const, size: 0, mtimeMs: 0, isLink: false })
  const file = { kind: 'file' as const, size: 1, mtimeMs: 0, isLink: false }

  mock.env(on, { USERPROFILE: HOME, SystemRoot: 'C:\\Windows', ...env })
  on('session.start', ($, e) => ({ cwd: e.cwd }))
  on('session.measure', ($, e) => ({ changed: e.changed }))
  on('state.set', { plugin: 'account-bars' }, ($, e, next) => {
    w.state.set(e.key, e.value)
    return next(e)
  })
  on('store.get', ($, e) => ({ value: w.store.get(e.key) }))
  on('store.set', ($, e) => {
    w.store.set(e.key, e.value)
    return { value: undefined }
  })
  on('command.register', ($, e) => ({ value: { command: e.name } }))
  on('ui.open', () => ({ value: { isPlaced: true as const } }))
  on('ui.toast', ($, e) => {
    w.toasts.push(e.text)
    return { value: undefined }
  })
  on('ui.notify', ($, e) => {
    w.notices.push(e.text)
    return { value: { isSent: true as const, channel: 'terminal_bell' } }
  })
  on('fs.stat', ($, e) =>
    e.path === POWERSHELL || (hasClaude && e.path === CLAUDE) || files.includes(e.path)
      ? { value: file }
      : { deny: 'no such file' },
  )
  on('fs.list', ($, e) =>
    e.path === ROOT
      ? { value: ['personal', 'spare', 'work2', 'lapsed', ESCAPED].map(dir) }
      : { deny: 'no such folder' },
  )
  on('fs.read', ($, e) => {
    w.fsReads.push(e.path)
    return { deny: 'no such file' }
  })
  on('process.run', ($, e) => {
    w.runs.push({ argv: e.argv, cwd: e.init?.cwd, env: e.init?.env })
    const out = (stdout: string, exitCode = 0) => ({
      value: { exitCode, stdout, stderr: '', isStdoutTruncated: false, isStderrTruncated: false },
    })
    if (e.argv[0] === CLAUDE) {
      const who = IDENTITIES[e.init?.env?.CLAUDE_CONFIG_DIR ?? '']
      return out(JSON.stringify(who ? { loggedIn: true, ...who } : { loggedIn: false }), who ? 0 : 1)
    }
    if (e.argv[0] === POWERSHELL) {
      const probe = PROBES[e.init?.env?.ACCOUNT_BARS_PROFILE ?? '']
      if (probe === undefined) return out('none')
      if (probe === 401) return out(`expires ${NOW - 1000}\nstatus 401\n`)
      const body = {
        five_hour: { utilization: probe.five, resets_at: SOON },
        seven_day: { utilization: probe.seven, resets_at: LATER },
      }
      return out(`expires ${NOW + 8 * 3_600_000}\r\nstatus 200\r\n${JSON.stringify(body)}\r\n`)
    }
    return { deny: `unexpected program ${e.argv[0]}` }
  })
  on('session.authorize', () => ({ value: null }))
  on('session.usage', () => ({
    value: {
      startedAt: NOW,
      context: { window: 200_000 },
      rateLimits: [
        { kind: 'five_hour', percentUsed: 75, resetsAt: SOON },
        { kind: 'seven_day', percentUsed: 19, resetsAt: LATER },
      ],
    },
  }))
  on('http.fetch', ($, e) => {
    w.fetches.push({ url: e.url, authorization: e.init?.headers?.Authorization })
    return { value: { status: 500, ok: false, headers: {}, text: '' } }
  })
  return w
}

async function start($: Engine, on: On, setup?: Setup) {
  const w = world(on, setup)
  const clock = mock.clock(on, { now: NOW })
  await $.session.start({ cwd: 'C:\\some\\cloned\\repo', surface: 'terminal', isInteractive: true })
  await clock.advance(1) // the first refresh runs detached from session.start
  return { w, clock }
}

describe('readings', () => {
  test('colour bands: green < 50, yellow < 75, orange < 90, red from 90', () => {
    expect([0, 49.9, 50, 74.9, 75, 89.9, 90, 100].map(band)).toEqual([
      'green', 'green', 'yellow', 'yellow', 'orange', 'orange', 'red', 'red',
    ])
  })

  test('a window past its reset time reads empty', () => {
    expect(effectivePercent({ percent: 100, resetsAt: '2030-01-01T00:00:00Z' }, NOW + 1)).toBe(0)
    expect(effectivePercent({ percent: 80, resetsAt: SOON }, NOW)).toBe(80)
  })

  test('an unexpected body is left out, never guessed', () => {
    expect(parseUsage('not json')).toEqual({})
    expect(parseUsage(JSON.stringify({ five_hour: { utilization: 'high' } }))).toEqual({})
    expect(parseUsage(JSON.stringify({ five_hour: { utilization: 42, resets_at: SOON } }))).toEqual({
      session: { percent: 42, resetsAt: SOON },
    })
  })

  test("the helper's output is read line by line, and nothing else is a reading", () => {
    expect(parseProbe('none\r\n')).toEqual({ isSignedIn: false })
    expect(parseProbe('expires 5\nstatus 200\n{"five_hour":{"utilization":7}}')).toEqual({
      isSignedIn: true,
      expiresAt: 5,
      status: 200,
      windows: { session: { percent: 7 } },
    })
    expect(parseProbe('Invoke-WebRequest : something failed')).toBeUndefined()
  })

  test('control and format characters are stripped from outside text', () => {
    expect(printable(ESCAPED)).toBe('evil]0;pwned')
    expect(printable('work‮2​⁦x⁩')).toBe('work2x')
  })

  test('a helper that failed says only "error", and that is no reading', () => {
    expect(parseProbe('error\r\n')).toBeUndefined()
    expect(parseProbe('expires 5\nerror\n')).toBeUndefined()
  })

  test('the helpers keep a failure quiet and use only their own commands', () => {
    // PowerShell: one try around everything, every command named with its module
    expect(POWERSHELL_PROBE.startsWith('try{')).toBe(true)
    expect(POWERSHELL_PROBE.endsWith("}catch{'error'}")).toBe(true)
    expect(POWERSHELL_PROBE).not.toMatch(/(^|[^\\])\b(Join-Path|Test-Path|Get-Content|ConvertFrom-Json|Invoke-WebRequest)\b/)
    expect(POWERSHELL_PROBE).not.toContain('"')
    // sh: PATH pinned first, curl ignores ~/.curlrc, https only, nothing sent without a token
    expect(SH_PROBE.split('\n')[0]).toBe('PATH=/usr/bin:/bin; export PATH')
    expect(SH_PROBE).toContain('/usr/bin/curl -q -s --proto =https')
    expect(SH_PROBE).toContain('[ -n "$t" ]')
  })
})

describe('sidebar', () => {
  test('draws every account, suggests a same-org one, and shows no e-mail, token or escape', async ($, on) => {
    const { w } = await start($, on)
    expect(w.state.get('nextUp')).toBe('evil]0;pwned')
    for (const surface of ['terminal', 'desktop'] as const) {
      const ui = await $.ui.mount({ ...PANE, surface })
      for (const label of ['this session', 'work2', 'personal', 'spare', 'lapsed', 'evil]0;pwned']) {
        expect(await ui.find({ key: `row-${label}` })).toBeDefined()
      }
      expect(await ui.find({ type: 'Text', text: /other org, never suggested/ })).toBeDefined()
      expect(await ui.find({ type: 'Text', text: /not signed in/ })).toBeDefined()
      expect(await ui.find({ type: 'Text', text: /sign-in expired/ })).toBeDefined()
      expect(await ui.find({ text: /@|synthetic-token|org-|[\u0000-\u001f]/ })).toBeUndefined()
      await ui.unmount()
    }
  })

  test('the compact button switches the view and back', async ($, on) => {
    await start($, on)
    const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
    expect(await ui.find({ key: 'mode', text: 'compact' })).toBeDefined()
    await ui.press({ key: 'mode' })
    expect(await ui.find({ key: 'mode', text: 'expand' })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: 'S 5-hour · W weekly' })).toBeDefined()
    await ui.press({ key: 'mode' })
    expect(await ui.find({ key: 'mode', text: 'compact' })).toBeDefined()
    await ui.unmount()
  })
})

describe('what the mod runs and touches', () => {
  test('runs programs only by full path, from the home folder, never from the project', async ($, on) => {
    const { w } = await start($, on)
    expect(w.runs.length).toBeGreaterThan(0)
    for (const run of w.runs) {
      expect([CLAUDE, POWERSHELL]).toContain(run.argv[0])
      expect(run.cwd).toBe(HOME)
    }
  })

  test('no token passes through the mod: no credentials read, no token header, none in any event', async ($, on) => {
    const { w } = await start($, on)
    expect(w.fsReads.filter(path => path.endsWith('.credentials.json'))).toEqual([])
    expect(w.fetches.filter(f => f.authorization !== undefined)).toEqual([])
    const crossed = JSON.stringify([w.runs, [...w.store.entries()], [...w.state.entries()]])
    for (const token of TOKENS) expect(crossed).not.toContain(token)
    expect(crossed).not.toMatch(/Bearer [^'+]/)
    const kept = JSON.stringify([[...w.store.entries()], w.state.get('accounts')])
    expect(kept).not.toMatch(/@example\.test|org-/)
  })

  test('the helper runs with its own module path and the profile folder, nothing else of note', async ($, on) => {
    const { w } = await start($, on)
    const probes = w.runs.filter(run => run.argv[0] === POWERSHELL)
    expect(probes.length).toBeGreaterThan(0)
    for (const run of probes) {
      expect(run.env?.PSModulePath).toBe('C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\Modules')
      expect(run.env?.ACCOUNT_BARS_PROFILE?.startsWith(`${ROOT}\\`)).toBe(true)
    }
  })

  const PLANTED = 'C:\\some\\cloned\\repo\\tools\\claude.exe'
  test('a claudePath inside the project folder is refused, even if the file is there', { options: { claudePath: PLANTED } }, async ($, on) => {
    const { w } = await start($, on, { files: [PLANTED] })
    expect(w.runs.some(run => run.argv[0] === PLANTED)).toBe(false)
    expect(w.runs.some(run => run.argv[0] === CLAUDE)).toBe(true)
    const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
    expect(await ui.find({ type: 'Text', text: /claudePath is ignored/ })).toBeDefined()
    await ui.unmount()
  })

  const ELSEWHERE = 'D:\\tools\\claude\\claude.exe'
  test('a claudePath outside the project is used', { options: { claudePath: ELSEWHERE } }, async ($, on) => {
    const { w } = await start($, on, { files: [ELSEWHERE] })
    expect(w.runs.some(run => run.argv[0] === ELSEWHERE)).toBe(true)
    expect(w.runs.some(run => run.argv[0] === CLAUDE)).toBe(false)
  })

  test('a lapsed login waits for the next identity check instead of every poll', async ($, on) => {
    const { w, clock } = await start($, on)
    const lapsed = () => w.runs.filter(run => run.env?.ACCOUNT_BARS_PROFILE === `${ROOT}\\lapsed`).length
    const before = lapsed()
    expect(before).toBeGreaterThan(0)
    await clock.advance(2 * 60_000)
    await clock.advance(2 * 60_000)
    expect(lapsed()).toBe(before)
    expect(w.runs.filter(run => run.env?.ACCOUNT_BARS_PROFILE === `${ROOT}\\work2`).length).toBeGreaterThan(1)
  })

  test('with non-essential traffic off, other accounts are not touched at all', async ($, on) => {
    const { w } = await start($, on, { env: { CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '1' } })
    expect(w.runs.filter(run => run.argv[0] === POWERSHELL)).toEqual([])
    expect(w.runs.filter(run => run.env?.CLAUDE_CONFIG_DIR !== undefined)).toEqual([])
  })

  test('without claude at its path nothing is run by name, and the sidebar says why', async ($, on) => {
    const { w } = await start($, on, { hasClaude: false })
    expect(w.runs.some(run => /claude/i.test(run.argv[0] ?? ''))).toBe(false)
    const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
    expect(await ui.find({ type: 'Text', text: /claude not found at .*claudePath/ })).toBeDefined()
    await ui.unmount()
  })
})

describe('session limit', () => {
  test('suggests the next same-org account once per window, never switching', async ($, on) => {
    const { w, clock } = await start($, on)
    await $.session.measure(LIMIT_HIT)
    await clock.advance(1)
    expect(w.notices).toHaveLength(1)
    expect(w.notices[0]).toMatch(/Next in line: evil\]0;pwned \(session 1%, weekly 1%\)\. Run \/login/)
    expect(w.toasts).toContain(w.notices[0])
    await $.session.measure(LIMIT_HIT)
    await clock.advance(1)
    expect(w.notices).toHaveLength(1)
    expect(w.notices.join(' ')).not.toMatch(/personal|[\u0000-\u001f]/)
  })
})
