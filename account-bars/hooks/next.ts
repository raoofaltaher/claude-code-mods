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

/**
 * Chooses the account to suggest when the active one reaches its session
 * limit. Returns its label, or null to suggest none.
 *
 * TODO(you): this placeholder takes the first in line whatever its numbers.
 */
export function pickNext(candidates: readonly Candidate[], now: number): string | null {
  void now
  const inLine = [...candidates].sort((a, b) => a.rank - b.rank)
  return inLine[0]?.label ?? null
}
