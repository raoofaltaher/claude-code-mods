/** One usage window: how full it is (0-100) and when it empties again. */
export type Reading = { percent: number; resetsAt?: string }

/**
 * Where an account's numbers stand: read (`ok`), not yet read (`pending`),
 * its profile's login lapsed (`expired`), the last read failed (`error`),
 * its profile holds no login (`not-signed-in`), or polling is off (`paused`).
 */
export type AccountStatus = 'ok' | 'pending' | 'expired' | 'error' | 'not-signed-in' | 'paused'

/** One row of the sidebar. Labels and numbers only: no e-mail, no token. */
export type AccountView = {
  label: string
  isActive: boolean
  /** Same organization as the active account; null while unknown. */
  isSameOrg: boolean | null
  status: AccountStatus
  session?: Reading
  weekly?: Reading
  /** When the readings were taken, in `$.clock.now()` milliseconds. */
  asOf?: number
}

declare module 'claude-code' {
  interface PluginState {
    'account-bars': {
      accounts: AccountView[]
      isCompact: boolean
      nextUp: string | null
      now: number
      /** A setup problem to show above the bars (claude or the helper not found); null when none. */
      notice: string | null
    }
  }
}
