import { atom, read, update } from 'claude-code'
import type { Register } from 'claude-code'

import type { AccountStatus, AccountView, Reading } from '../types'
import { pickNext } from './next'
import type { Candidate } from './next'
import { POWERSHELL_PROBE, PROFILE_VAR, SH_PROBE, parseProbe } from './probe'
import {
  BAND_COLOR,
  USAGE_BETA,
  USAGE_URL,
  agoText,
  band,
  bar,
  effectivePercent,
  fromRateLimits,
  isRecord,
  parseUsage,
  printable,
  untilText,
} from './usage'
import type { Windows } from './usage'

const PANE = 'accounts'
const PROFILE_ROOT = '.claude-accounts'
const POLL_MS = 2 * 60_000
const IDENTIFY_MS = 10 * 60_000
const CLOCK_MS = 30_000
const RENEW_BEFORE_MS = 30 * 60_000

const accounts = atom({ plugin: 'account-bars', key: 'accounts' } as const, [])
const isCompact = atom({ plugin: 'account-bars', key: 'isCompact' } as const, false)
const nextUp = atom({ plugin: 'account-bars', key: 'nextUp' } as const, null)
const clock = atom({ plugin: 'account-bars', key: 'now' } as const, 0)
const notice = atom({ plugin: 'account-bars', key: 'notice' } as const, null)

/** An absolute path on Windows (`C:\…`, `\\server\…`) or elsewhere (`/…`). */
const isAbsolute = (path: string) => /^([A-Za-z]:[\\/]|\\\\|\/)/.test(path)

type Readings = Windows & { asOf?: number }

/**
 * One account signed in under ~/.claude-accounts/<label>. `email` and `orgId`
 * stay in this module's memory to recognise the active account and its
 * organization; they are never written to state, store or screen.
 */
type Profile = {
  label: string
  dir: string
  email?: string
  orgId?: string
  status: AccountStatus
  readings: Readings
  failures: number
  skipUntil: number
  renewTriedAt: number
}

export const register: Register = (on, options) => {
  const order =
    typeof options.order === 'string'
      ? options.order.split(',').map(label => label.trim()).filter(Boolean)
      : []
  const claudePath = typeof options.claudePath === 'string' ? options.claudePath.trim() : ''

  let profiles: Profile[] = []
  let active: { email?: string; orgId?: string; readings: Readings } = { readings: {} }
  let lastIdentified = 0
  let isBusy = false
  /** The background work session.start sets up; other hooks only nudge it. */
  let background: { refresh: (withIdentify: boolean) => void; republish: () => void } | undefined

  const rank = (label: string) => {
    const at = order.indexOf(label)
    return at === -1 ? order.length : at
  }
  const activeProfile = () =>
    active.email === undefined ? undefined : profiles.find(p => p.email === active.email)
  const sameOrg = (p: Profile) =>
    p.orgId === undefined || active.orgId === undefined ? null : p.orgId === active.orgId
  const backOff = (p: Profile, now: number) => {
    p.failures += 1
    p.status = 'error'
    p.skipUntil = now + POLL_MS * Math.min(8, 2 ** (p.failures - 1))
  }

  on('session.start', async ($, e, next) => {
    const systemRoot = await $.env.get('SystemRoot')
    const isWindows = systemRoot !== undefined
    const home = (isWindows ? await $.env.get('USERPROFILE') : await $.env.get('HOME')) ?? ''
    const sep = isWindows ? '\\' : '/'
    const join = (...parts: string[]) => parts.join(sep)
    const isFile = async (path: string) => {
      try {
        return (await $.fs.stat(path)).kind === 'file'
      } catch {
        return false
      }
    }

    // Programs run only by full path, from the home folder: a name looked up
    // on PATH can resolve to a file a cloned repository planted in its folder.
    const claudeExe = isAbsolute(claudePath)
      ? claudePath
      : join(home, '.local', 'bin', isWindows ? 'claude.exe' : 'claude')
    const probeArgv = isWindows
      ? [join(systemRoot, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe'), '-NoProfile', '-NonInteractive', '-Command', POWERSHELL_PROBE]
      : ['/bin/sh', '-c', SH_PROBE]
    const helpers = isWindows ? [probeArgv[0]!] : [probeArgv[0]!, '/usr/bin/curl']
    const hasClaude = await isFile(claudeExe)
    const missingHelper = (await Promise.all(helpers.map(async path => ((await isFile(path)) ? null : path)))).find(
      path => path !== null,
    )
    const hasProbe = missingHelper === undefined
    const problems = [
      ...(hasClaude ? [] : [`claude not found at ${claudeExe}: set claudePath in /config`]),
      ...(hasProbe ? [] : [`${missingHelper} not found: other accounts cannot be read`]),
    ]

    /** `claude auth status --json` for the session's login, or a profile's: identity only. */
    const authStatus = async (dir?: string) => {
      if (!hasClaude) return undefined
      try {
        const { stdout } = await $.process.run([claudeExe, 'auth', 'status', '--json'], {
          cwd: home,
          timeoutMs: 30_000,
          ...(dir === undefined ? {} : { env: { CLAUDE_CONFIG_DIR: dir } }),
        })
        const status: unknown = JSON.parse(stdout)
        if (!isRecord(status) || status.loggedIn !== true) return undefined
        return {
          email: typeof status.email === 'string' ? status.email : undefined,
          orgId: typeof status.orgId === 'string' ? status.orgId : undefined,
        }
      } catch {
        return undefined
      }
    }

    /** The profile's usage, read by the helper process; its token never reaches this mod. */
    const runProbe = async (dir: string) => {
      if (!hasProbe) return undefined
      try {
        const { stdout } = await $.process.run(probeArgv, {
          cwd: home,
          env: { [PROFILE_VAR]: dir },
          timeoutMs: 30_000,
        })
        return parseProbe(stdout)
      } catch {
        return undefined
      }
    }

    const identify = async () => {
      const root = join(home, PROFILE_ROOT)
      let names: string[] = []
      try {
        names = (await $.fs.list(root)).filter(entry => entry.kind === 'dir').map(entry => entry.name)
      } catch {
        names = []
      }
      const cached = await $.store.get('readings')
      const known = new Map(profiles.map(p => [p.dir, p]))
      profiles = names.map(name => {
        const dir = join(root, name)
        const label = printable(name)
        return (
          known.get(dir) ?? {
            label,
            dir,
            status: 'pending',
            readings: isRecord(cached) && isRecord(cached[label]) ? (cached[label] as Readings) : {},
            failures: 0,
            skipUntil: 0,
            renewTriedAt: 0,
          }
        )
      })
      const me = await authStatus()
      active = { ...active, email: me?.email, orgId: me?.orgId }
      for (const p of profiles) {
        const who = await authStatus(p.dir)
        p.email = who?.email
        p.orgId = who?.orgId
        if (who === undefined) p.status = 'not-signed-in'
        else if (p.status === 'not-signed-in') p.status = 'pending'
      }
      lastIdentified = await $.clock.now()
    }

    /** The session's own account: through the engine's credential handle, never its secret. */
    const pollActive = async (now: number) => {
      try {
        const auth = await $.session.authorize()
        if (auth?.kind === 'bearer') {
          const res = await $.http.fetch(USAGE_URL, {
            auth: auth.handle,
            headers: { 'anthropic-beta': USAGE_BETA },
          })
          const windows = res.ok ? parseUsage(res.text) : {}
          if (windows.session || windows.weekly) {
            active.readings = { ...windows, asOf: now }
            return
          }
        }
      } catch {
        // fall back to the figures the engine already holds
      }
      const windows = fromRateLimits((await $.session.usage()).rateLimits)
      if (windows.session || windows.weekly) active.readings = { ...windows, asOf: now }
    }

    const pollProfile = async (p: Profile, now: number) => {
      let probe = await runProbe(p.dir)
      const expiresAt = probe?.isSignedIn ? probe.expiresAt : undefined
      if (expiresAt !== undefined && expiresAt - now < RENEW_BEFORE_MS && now - p.renewTriedAt > IDENTIFY_MS) {
        p.renewTriedAt = now
        await authStatus(p.dir) // Claude Code renews its own login here, if it does so at all
        probe = await runProbe(p.dir)
      }
      if (probe === undefined) {
        backOff(p, now)
        return
      }
      if (!probe.isSignedIn) {
        p.status = 'not-signed-in'
        return
      }
      if (probe.status === 401 || probe.status === 403) {
        p.status = 'expired'
        return
      }
      const windows: Windows = probe.status === 200 ? probe.windows : {}
      if (!windows.session && !windows.weekly) {
        backOff(p, now)
        return
      }
      p.readings = { ...windows, asOf: now }
      p.status = 'ok'
      p.failures = 0
      p.skipUntil = 0
    }

    const poll = async () => {
      const now = await $.clock.now()
      await pollActive(now)
      const isQuiet = Boolean(await $.env.get('CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC'))
      const mine = activeProfile()
      for (const p of profiles) {
        if (p === mine || p.status === 'not-signed-in' || now < p.skipUntil) continue
        if (isQuiet) p.status = 'paused'
        else await pollProfile(p, now)
      }
    }

    const publish = async () => {
      const now = await $.clock.now()
      const mine = activeProfile()
      if (mine) mine.readings = active.readings
      const view = (p: Profile): AccountView => ({
        label: p.label,
        isActive: false,
        isSameOrg: sameOrg(p),
        status: p.status,
        ...p.readings,
      })
      const others = profiles
        .filter(p => p !== mine)
        .map(view)
      const self: AccountView = {
        label: mine?.label ?? 'this session',
        isActive: true,
        isSameOrg: true,
        status: active.readings.asOf === undefined ? 'pending' : 'ok',
        ...active.readings,
      }
      const byOrder = (a: AccountView, b: AccountView) => rank(a.label) - rank(b.label) || a.label.localeCompare(b.label)
      // an active account with no profile has no place in the order: it leads
      const views = mine === undefined ? [self, ...others.sort(byOrder)] : [self, ...others].sort(byOrder)

      const candidates: Candidate[] = views
        .filter(v => !v.isActive && v.isSameOrg === true && v.status !== 'not-signed-in')
        .map(v => ({
          label: v.label,
          rank: rank(v.label),
          status: v.status,
          sessionPercent: effectivePercent(v.session, now),
          weeklyPercent: effectivePercent(v.weekly, now),
          ...(v.session ? { session: v.session } : {}),
          ...(v.weekly ? { weekly: v.weekly } : {}),
          asOf: v.asOf,
        }))
      const picked = pickNext(candidates, now)
      const suggestion = candidates.some(c => c.label === picked) ? picked : null

      await update($, accounts, () => views)
      await update($, nextUp, () => suggestion)
      await update($, clock, () => now)
      await update($, notice, () => (problems.length === 0 ? null : problems.join(' · ')))
      await $.store.set(
        'readings',
        Object.fromEntries(profiles.filter(p => p.readings.asOf !== undefined).map(p => [p.label, p.readings])),
      )
    }

    /** At the session limit: say who is next, once per window. Switching stays the person's. */
    const checkLimit = async () => {
      const now = await $.clock.now()
      const session = active.readings.session
      if ((effectivePercent(session, now) ?? 0) < 100) return
      const windowId = session?.resetsAt ?? 'unknown'
      if ((await $.store.get('notifiedFor')) === windowId) return
      await $.store.set('notifiedFor', windowId)
      const label = await read($, nextUp)
      const suggested = (await read($, accounts)).find(v => v.label === label)
      const percent = (r: Reading | undefined) => {
        const p = effectivePercent(r, now)
        return p === undefined ? '?' : `${Math.round(p)}%`
      }
      const text = suggested
        ? `Session limit reached. Next in line: ${suggested.label} (session ${percent(suggested.session)}, weekly ${percent(suggested.weekly)}). Run /login and pick it.`
        : 'Session limit reached. No other same-org account is signed in to suggest.'
      $.ui.toast(text, { timeoutMs: 15_000 })
      try {
        await $.ui.notify(text, { title: 'Claude account limit' })
      } catch {
        // a hook above refused the notification; the toast stands
      }
    }

    const refresh = async (withIdentify: boolean) => {
      if (isBusy) return
      isBusy = true
      try {
        if (withIdentify || (await $.clock.now()) - lastIdentified >= IDENTIFY_MS) await identify()
        await poll()
        await publish()
        await checkLimit()
      } finally {
        isBusy = false
      }
    }

    background = {
      refresh: withIdentify => void $.clock.after(0, () => void refresh(withIdentify)),
      republish: () => void $.clock.after(0, () => void publish().then(checkLimit)),
    }

    await $.command.register({
      name: 'accounts',
      description: 'Show or hide the account limits sidebar',
      argumentHint: '[refresh]',
    })
    if ((await $.store.get('paneOpen')) !== false) void $.ui.open({ id: PANE, title: 'Accounts' })
    $.clock.every(POLL_MS, () => void refresh(false))
    $.clock.every(CLOCK_MS, () => void $.clock.now().then(now => update($, clock, () => now)))
    background.refresh(true)
    return next(e)
  })

  on('session.measure', async ($, e, next) => {
    if (e.changed.includes('rateLimits')) {
      const windows = fromRateLimits(e.rateLimits)
      if (windows.session || windows.weekly) {
        active.readings = { ...windows, asOf: await $.clock.now() }
        background?.republish()
      }
    }
    return next(e)
  })

  // after /login the session may be on another account: find out who
  on('command.run', { command: 'login' }, async ($, e, next) => {
    const result = await next(e)
    background?.refresh(true)
    return result
  }).catch(($, e, next) => next(e))

  on('command.run', { command: 'accounts' }, async ($, e) => {
    if (e.args.trim() === 'refresh') {
      background?.refresh(true)
      return { text: 'Refreshing account limits.' }
    }
    if ((await $.ui.panes()).some(pane => pane.id === PANE)) {
      await $.ui.close({ id: PANE })
      await $.store.set('paneOpen', false)
      return { text: 'Accounts sidebar hidden. /accounts brings it back.' }
    }
    await $.store.set('paneOpen', true)
    const opened = await $.ui.open({ id: PANE, title: 'Accounts' })
    return { text: opened.isPlaced ? 'Accounts sidebar shown.' : `Accounts sidebar waits: ${opened.reason}` }
  })

  on('ui.close', { id: PANE }, async ($, e, next) => {
    if (e.origin.kind === 'person') await $.store.set('paneOpen', false)
    return next(e)
  }).catch(($, e, next) => next(e))

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text, Button } = $.ui.resolve(e)
    const list = await read($, accounts)
    const compact = await read($, isCompact)
    const suggested = await read($, nextUp)
    const now = await read($, clock)
    const problem = await read($, notice)
    const cols = Math.max(20, e.props.bodyColumns)
    const labelWidth = Math.min(12, Math.max(4, ...list.map(v => v.label.length)))

    const meter = (reading: Reading | undefined, width: number) => {
      const percent = effectivePercent(reading, now)
      if (percent === undefined) return <Text dimColor>{`${'·'.repeat(width)}   --`}</Text>
      const { filled, empty } = bar(percent, width)
      const color = BAND_COLOR[band(percent)]
      return (
        <Box flexDirection="row">
          <Text color={color}>{filled}</Text>
          <Text dimColor>{empty}</Text>
          <Text color={color}>{` ${String(Math.round(percent)).padStart(3)}%`}</Text>
        </Box>
      )
    }

    const note = (v: AccountView) => {
      const org = v.isSameOrg === false ? ' · other org, never suggested' : ''
      switch (v.status) {
        case 'ok':
          return `as of ${agoText(v.asOf, now)}${org}`
        case 'pending':
          return 'reading…'
        case 'expired':
          return 'sign-in expired: run claude auth login for this profile'
        case 'error':
          return `no reading, retrying · last ${agoText(v.asOf, now)}`
        case 'not-signed-in':
          return 'not signed in'
        case 'paused':
          return 'paused: non-essential traffic is off'
      }
    }

    const mark = (v: AccountView) => (v.isActive ? '▶ ' : '  ')

    const rows = compact
      ? list.map(v => {
          const width = Math.max(3, Math.floor((cols - labelWidth - 2 - 14) / 2))
          return (
            <Box key={`row-${v.label}`} flexDirection="row" gap={1}>
              <Text bold={v.isActive} dimColor={v.isSameOrg === false} wrap="truncate">
                {mark(v) + v.label.slice(0, labelWidth).padEnd(labelWidth)}
              </Text>
              {meter(v.session, width)}
              {meter(v.weekly, width)}
            </Box>
          )
        })
      : list.map(v => {
          const width = Math.max(6, Math.min(28, cols - 20))
          return (
            <Box key={`row-${v.label}`} flexDirection="column" marginBottom={1}>
              <Box flexDirection="row" justifyContent="space-between">
                <Text bold={v.isActive} dimColor={v.isSameOrg === false} wrap="truncate">
                  {mark(v) + v.label}
                </Text>
                <Text color="success" bold>
                  {v.label === suggested ? 'next' : ''}
                </Text>
              </Box>
              <Box flexDirection="row" gap={1}>
                <Text dimColor>{'  S'}</Text>
                {meter(v.session, width)}
                <Text dimColor>{untilText(v.session?.resetsAt, now)}</Text>
              </Box>
              <Box flexDirection="row" gap={1}>
                <Text dimColor>{'  W'}</Text>
                {meter(v.weekly, width)}
                <Text dimColor>{untilText(v.weekly?.resetsAt, now)}</Text>
              </Box>
              <Text dimColor wrap="wrap">{`    ${note(v)}`}</Text>
            </Box>
          )
        })

    return (
      <Box flexDirection="column">
        {problem !== null && (
          <Text color="warning" wrap="wrap">
            {problem}
          </Text>
        )}
        <Text dimColor>{compact ? 'S 5-hour · W weekly' : 'S session (5-hour) · W weekly (7-day)'}</Text>
        <Box flexDirection="column" marginTop={1}>
          {rows}
        </Box>
        {list.length <= 1 && (
          <Box flexDirection="column" marginTop={1}>
            <Text dimColor wrap="wrap">No other accounts yet. In PowerShell:</Text>
            <Text dimColor wrap="wrap">{'$env:CLAUDE_CONFIG_DIR="$HOME\\.claude-accounts\\<label>"; claude auth login'}</Text>
          </Box>
        )}
        <Box flexDirection="row" gap={1} marginTop={1}>
          <Button
            key="mode"
            hotkey="c"
            label={compact ? 'expand' : 'compact'}
            onPress={() => void update($, isCompact, value => !value)}
          />
          <Button key="refresh" hotkey="r" label="refresh" onPress={() => background?.refresh(true)} />
        </Box>
      </Box>
    )
  })
}
