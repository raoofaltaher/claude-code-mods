import type { SessionRateLimit } from 'claude-code'

import type { Reading } from '../types'

/** The endpoint Claude Code's own /usage reads (undocumented). */
export const USAGE_URL = 'https://api.anthropic.com/api/oauth/usage'
export const USAGE_BETA = 'oauth-2025-04-20'

export type Band = 'green' | 'yellow' | 'orange' | 'red'

export const BAND_COLOR: Record<Band, string> = {
  green: '#22c55e',
  yellow: '#eab308',
  orange: '#f97316',
  red: '#ef4444',
}

export function band(percent: number): Band {
  if (percent >= 90) return 'red'
  if (percent >= 75) return 'orange'
  if (percent >= 50) return 'yellow'
  return 'green'
}

/** A window whose reset time has passed is empty again, whatever it last read. */
export function effectivePercent(reading: Reading | undefined, now: number): number | undefined {
  if (reading === undefined) return undefined
  if (reading.resetsAt !== undefined) {
    const at = Date.parse(reading.resetsAt)
    if (Number.isFinite(at) && at <= now) return 0
  }
  return reading.percent
}

export type Windows = { session?: Reading; weekly?: Reading }

/** Reads the usage endpoint's body; a field of another shape is left out, never guessed. */
export function parseUsage(text: string): Windows {
  let body: unknown
  try {
    body = JSON.parse(text)
  } catch {
    return {}
  }
  return withWindows(readWindow(body, 'five_hour'), readWindow(body, 'seven_day'))
}

function readWindow(body: unknown, key: string): Reading | undefined {
  if (!isRecord(body)) return undefined
  const window = body[key]
  if (!isRecord(window)) return undefined
  const { utilization, resets_at } = window
  if (typeof utilization !== 'number' || !Number.isFinite(utilization)) return undefined
  return typeof resets_at === 'string'
    ? { percent: Math.max(0, utilization), resetsAt: resets_at }
    : { percent: Math.max(0, utilization) }
}

/** The windows the engine pushes for the session's own account. */
export function fromRateLimits(limits: readonly SessionRateLimit[]): Windows {
  const pick = (kind: string): Reading | undefined => {
    const window = limits.find(limit => limit.kind === kind)
    if (window === undefined) return undefined
    return window.resetsAt === undefined
      ? { percent: window.percentUsed }
      : { percent: window.percentUsed, resetsAt: window.resetsAt }
  }
  return withWindows(pick('five_hour'), pick('seven_day'))
}

function withWindows(session: Reading | undefined, weekly: Reading | undefined): Windows {
  return { ...(session ? { session } : {}), ...(weekly ? { weekly } : {}) }
}

export function bar(percent: number, width: number): { filled: string; empty: string } {
  const cells = Math.max(1, width)
  const filled = Math.round((Math.min(100, Math.max(0, percent)) / 100) * cells)
  return { filled: '█'.repeat(filled), empty: '░'.repeat(cells - filled) }
}

/** "42m", "2h 05m", "3d 4h"; "reset" once due; empty when unknown. */
export function untilText(iso: string | undefined, now: number): string {
  if (iso === undefined) return ''
  const at = Date.parse(iso)
  if (!Number.isFinite(at)) return ''
  const minutes = Math.round((at - now) / 60_000)
  if (minutes <= 0) return 'reset'
  if (minutes < 60) return `${minutes}m`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ${String(minutes % 60).padStart(2, '0')}m`
  return `${Math.floor(hours / 24)}d ${hours % 24}h`
}

export function agoText(asOf: number | undefined, now: number): string {
  if (asOf === undefined) return 'never'
  const seconds = Math.max(0, Math.round((now - asOf) / 1000))
  if (seconds < 10) return 'just now'
  if (seconds < 60) return `${seconds}s ago`
  const minutes = Math.round(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.round(minutes / 60)
  return hours < 48 ? `${hours}h ago` : `${Math.round(hours / 24)}d ago`
}

/**
 * Text from outside the mod (a folder name) with control and format
 * characters removed: terminal escapes, bidi overrides, zero-width marks.
 */
export function printable(text: string): string {
  return text.replace(/[\p{Cc}\p{Cf}]/gu, '')
}

/** A short reason fit to show: token-shaped text replaced, one line, at most 80 characters. */
export function scrub(text: string): string {
  const line = printable(text.replace(/\s+/g, ' ')).trim()
  const safe = line.replace(/sk-ant-[A-Za-z0-9_-]+/g, '[token]').replace(/(Bearer)\s+\S+/gi, '$1 [token]')
  return safe.length > 80 ? `${safe.slice(0, 79)}…` : safe
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
