import type { AccountStatus, Reading } from '../types'

/**
 * One account the sidebar may suggest: same organization as the active one,
 * not the active one. Its readings are what the last poll saw.
 */
export type Candidate = {
  label: string
  /** Its place in your `order` setting: 0 is first in line. */
  rank: number
  status: AccountStatus
  /** 0-100, already 0 where the window's reset time has passed; undefined if never read. */
  sessionPercent: number | undefined
  weeklyPercent: number | undefined
  session?: Reading
  weekly?: Reading
  /** When the readings were taken (ms); undefined if never. */
  asOf: number | undefined
}

/** An account at or above this weekly use is never suggested: it would block soon after. */
export const WEEKLY_CEILING = 90

/**
 * Chooses the account to suggest when the active one reaches its session
 * limit. Returns its label, or null to suggest none.
 *
 * Skips lapsed logins and accounts at WEEKLY_CEILING or more; of the rest,
 * the most session room wins (a window past its reset counts as empty), then
 * your `order`. An account never read sorts after every read one.
 */
export function pickNext(candidates: readonly Candidate[], now: number): string | null {
  void now
  const usable = candidates.filter(
    c => c.status !== 'expired' && c.status !== 'not-signed-in' && (c.weeklyPercent ?? 0) < WEEKLY_CEILING,
  )
  const session = (c: Candidate) => c.sessionPercent ?? Number.POSITIVE_INFINITY
  usable.sort((a, b) => session(a) - session(b) || a.rank - b.rank)
  return usable[0]?.label ?? null
}
