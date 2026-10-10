// A short-lived helper process reads a profile's login and asks the usage
// endpoint itself, so no token ever enters this mod, nor any hook's event
// (another mod hooking file reads or web requests would see it there).
// It prints `expires <ms>`, `status <code>` and the response body, or `none`.

import { USAGE_BETA, USAGE_URL, parseUsage } from './usage'
import type { Windows } from './usage'

/** The profile folder reaches the helper through this variable, never its command line. */
export const PROFILE_VAR = 'ACCOUNT_BARS_PROFILE'

/**
 * Windows PowerShell 5.1, which every Windows has at a fixed path. One line
 * with no double quotes, so it crosses a Windows command line unescaped.
 * Every command is named with its module, so nothing earlier on the module
 * path can stand in for it. Any failure prints `error` and nothing more: an
 * error message could quote the login it failed to read.
 */
export const POWERSHELL_PROBE =
  "try{$ErrorActionPreference='Stop';$ProgressPreference='SilentlyContinue';" +
  `$f=Microsoft.PowerShell.Management\\Join-Path $env:${PROFILE_VAR} '.credentials.json';` +
  "if(-not(Microsoft.PowerShell.Management\\Test-Path -LiteralPath $f)){'none';exit};" +
  '$raw=Microsoft.PowerShell.Management\\Get-Content -Raw -LiteralPath $f;' +
  "if($raw -notmatch '.claudeAiOauth.\\s*:\\s*(\\{[^{}]*\\})'){'none';exit};" +
  '$o=$Matches[1]|Microsoft.PowerShell.Utility\\ConvertFrom-Json;' +
  "'expires '+$o.expiresAt;" +
  `try{$r=Microsoft.PowerShell.Utility\\Invoke-WebRequest -UseBasicParsing -TimeoutSec 20 -Uri '${USAGE_URL}' ` +
  `-Headers @{Authorization='Bearer '+$o.accessToken;'anthropic-beta'='${USAGE_BETA}'};` +
  "'status '+[int]$r.StatusCode;$r.Content}" +
  "catch{$c=0;if($_.Exception.Response){$c=[int]$_.Exception.Response.StatusCode};'status '+$c}" +
  "}catch{'error'}"

/**
 * POSIX sh and curl. PATH is pinned, so `tr`, `sed` and `tail` come from the
 * system's own folders. The token goes to curl on its standard input
 * (`-H @-`), never on a command line; `-q` keeps a ~/.curlrc from adding
 * options (verbose output would print the header), and only https is allowed.
 */
export const SH_PROBE = [
  'PATH=/usr/bin:/bin; export PATH',
  `f="$${PROFILE_VAR}/.credentials.json"`,
  '[ -f "$f" ] || { echo none; exit 0; }',
  `o=$(tr -d '\\r\\n' < "$f" | sed -n 's/.*"claudeAiOauth"[[:space:]]*:[[:space:]]*{\\([^{}]*\\)}.*/\\1/p')`,
  '[ -n "$o" ] || { echo none; exit 0; }',
  `t=$(printf '%s' "$o" | sed -n 's/.*"accessToken"[[:space:]]*:[[:space:]]*"\\([^"]*\\)".*/\\1/p')`,
  `x=$(printf '%s' "$o" | sed -n 's/.*"expiresAt"[[:space:]]*:[[:space:]]*\\([0-9][0-9]*\\).*/\\1/p')`,
  '{ [ -n "$t" ] && [ -n "$x" ]; } || { echo error; exit 0; }',
  'echo "expires $x"',
  `r=$(printf 'Authorization: Bearer %s\\n' "$t" | /usr/bin/curl -q -s --proto =https -m 20 -H @- -H 'anthropic-beta: ${USAGE_BETA}' -w '\\n%{http_code}' '${USAGE_URL}')`,
  `echo "status $(printf '%s\\n' "$r" | tail -n 1)"`,
  `printf '%s\\n' "$r" | sed '$d'`,
].join('\n')

export type Probe =
  | { isSignedIn: false }
  | { isSignedIn: true; expiresAt: number | undefined; status: number; windows: Windows }

/** Reads what a probe printed; anything else is "no reading", never a guess. */
export function parseProbe(stdout: string): Probe | undefined {
  const text = stdout.replace(/\r\n/g, '\n')
  if (text.trim() === 'none') return { isSignedIn: false }
  const expires = /^expires (\d+)\s*$/m.exec(text)
  const status = /^status (\d+)\s*$/m.exec(text)
  if (status === null) return undefined
  const bodyAt = text.indexOf('\n', status.index)
  return {
    isSignedIn: true,
    expiresAt: expires ? Number(expires[1]) : undefined,
    status: Number(status[1]),
    windows: bodyAt === -1 ? {} : parseUsage(text.slice(bodyAt + 1)),
  }
}
