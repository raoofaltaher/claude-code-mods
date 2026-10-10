import { describe, expect, mock, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import type { On } from 'claude-code'

import { band, effectivePercent, parseUsage } from '../hooks/usage'

// Every identity, token and organization below is synthetic.
const HOME = 'C:\\Users\\tester'
const ROOT = `${HOME}\\.claude-accounts`
const USAGE_URL = 'https://api.anthropic.com/api/oauth/usage'
const NOW = Date.parse('2030-01-01T00:00:00Z')
const SOON = '2030-01-01T05:00:00Z'
const LATER = '2030-01-05T00:00:00Z'

const IDENTITIES: Record<string, { email: string; orgId: string }> = {
  '': { email: 'w1@example.test', orgId: 'org-a' },
  [`${ROOT}\\work2`]: { email: 'w2@example.test', orgId: 'org-a' },
  [`${ROOT}\\personal`]: { email: 'me@example.test', orgId: 'org-b' },
}
const TOKENS: Record<string, string> = {
  [`${ROOT}\\work2`]: 'synthetic-token-work2',
  [`${ROOT}\\personal`]: 'synthetic-token-personal',
}
const USAGE_BY_TOKEN: Record<string, { five: number; seven: number }> = {
  'synthetic-token-work2': { five: 12, seven: 40 },
  'synthetic-token-personal': { five: 3, seven: 5 },
}

const PANE = {
  plugin: 'account-bars',
  component: 'Pane',
  requestId: 'accounts',
  props: {
    title: 'Accounts',
    isFocused: false,
    bodyColumns: 40,
    placement: 'dock',
    scroll: { offset: 0, bodyRows: 30 },
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
  fetches: { url: string; authorization: string | undefined }[]
  toasts: string[]
  notices: string[]
  store: Map<string, unknown>
  /** What the plugin last wrote to each of its state keys. */
  state: Map<string, unknown>
}

/** The machine beneath the plugin: three profile folders, one of them signed out. */
function world(on: On): World {
  const w: World = { fetches: [], toasts: [], notices: [], store: new Map(), state: new Map() }
  const dir = (name: string) => ({ name, kind: 'dir' as const, size: 0, mtimeMs: 0, isLink: false })

  mock.env(on, { USERPROFILE: HOME })
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
  on('fs.list', ($, e) =>
    e.path === ROOT ? { value: [dir('personal'), dir('spare'), dir('work2')] } : { deny: 'no such folder' },
  )
  on('fs.read', ($, e) => {
    const token = TOKENS[e.path.replace(/\\\.credentials\.json$/, '')]
    return token
      ? { value: JSON.stringify({ claudeAiOauth: { accessToken: token, expiresAt: NOW + 8 * 3_600_000 } }) }
      : { deny: 'no such file' }
  })
  on('process.run', ($, e) => {
    const who = IDENTITIES[e.init?.env?.CLAUDE_CONFIG_DIR ?? '']
    return {
      value: {
        exitCode: who ? 0 : 1,
        stdout: JSON.stringify(who ? { loggedIn: true, ...who } : { loggedIn: false }),
        stderr: '',
        isStdoutTruncated: false,
        isStderrTruncated: false,
      },
    }
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
    const authorization = e.init?.headers?.Authorization
    w.fetches.push({ url: e.url, authorization })
    const usage = USAGE_BY_TOKEN[authorization?.replace(/^Bearer /, '') ?? '']
    if (usage === undefined) return { value: { status: 401, ok: false, headers: {}, text: '' } }
    const body = {
      five_hour: { utilization: usage.five, resets_at: SOON },
      seven_day: { utilization: usage.seven, resets_at: LATER },
    }
    return { value: { status: 200, ok: true, headers: {}, text: JSON.stringify(body) } }
  })
  return w
}

async function start($: Engine, on: On) {
  const w = world(on)
  const clock = mock.clock(on, { now: NOW })
  await $.session.start({ cwd: HOME, surface: 'terminal', isInteractive: true })
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
})

describe('sidebar', () => {
  test('draws every account, suggests a same-org one, and shows no e-mail or token', async ($, on) => {
    const { w } = await start($, on)
    expect(w.state.get('nextUp')).toBe('work2')
    for (const surface of ['terminal', 'desktop'] as const) {
      const ui = await $.ui.mount({ ...PANE, surface })
      for (const label of ['this session', 'work2', 'personal', 'spare']) {
        expect(await ui.find({ key: `row-${label}` })).toBeDefined()
      }
      expect(await ui.find({ type: 'Text', text: /other org, never suggested/ })).toBeDefined()
      expect(await ui.find({ type: 'Text', text: /not signed in/ })).toBeDefined()
      expect(await ui.find({ text: /@|synthetic-token|org-/ })).toBeUndefined()
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

describe('credentials', () => {
  test('tokens go only to the usage endpoint and are never kept', async ($, on) => {
    const { w } = await start($, on)
    const withToken = w.fetches.filter(f => f.authorization !== undefined)
    expect(withToken.length).toBeGreaterThan(0)
    expect(withToken.every(f => f.url === USAGE_URL)).toBe(true)
    const kept = JSON.stringify([...w.store.entries()])
    const shown = JSON.stringify(w.state.get('accounts'))
    for (const text of [kept, shown]) expect(text).not.toMatch(/synthetic-token|@example\.test|org-/)
  })
})

describe('session limit', () => {
  test('suggests the next same-org account once per window, never switching', async ($, on) => {
    const { w, clock } = await start($, on)
    await $.session.measure(LIMIT_HIT)
    await clock.advance(1)
    expect(w.notices).toHaveLength(1)
    expect(w.notices[0]).toMatch(/Next in line: work2 \(session 12%, weekly 40%\)\. Run \/login/)
    expect(w.toasts).toContain(w.notices[0])
    await $.session.measure(LIMIT_HIT)
    await clock.advance(1)
    expect(w.notices).toHaveLength(1)
    expect(w.notices.join(' ')).not.toMatch(/personal/)
  })
})
