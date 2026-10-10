// What a tool call is, which icon and color it gets, and the short target
// shown after its label. Pure: the hooks module draws with it.

export type Kind =
  | 'read'
  | 'edit'
  | 'write'
  | 'delete'
  | 'shell'
  | 'search'
  | 'web'
  | 'mcp'
  | 'agent'
  | 'skill'
  | 'ask'
  | 'plan'
  | 'other'

export const KINDS: readonly Kind[] = [
  'read', 'edit', 'write', 'delete', 'shell', 'search', 'web', 'mcp', 'agent', 'skill', 'ask', 'plan', 'other',
]

export const LABELS: Readonly<Record<Kind, string>> = {
  read: 'Read',
  edit: 'Edit',
  write: 'Write',
  delete: 'Delete',
  shell: 'Run',
  search: 'Search',
  web: 'Web',
  mcp: 'MCP',
  agent: 'Agent',
  skill: 'Skill',
  ask: 'Ask',
  plan: 'Plan',
  other: 'Tool',
}

// Icon sets. Circled letters and symbols take the theme's colors; emoji
// keep their own. Every emoji here defaults to emoji presentation, so none
// needs a variation selector that some terminals draw half-width. The
// symbols avoid glyphs Windows draws as color emoji (✖ ⚙): those ignore the
// theme and take two cells.
export const STYLES = {
  circled: {
    read: 'Ⓡ', edit: 'Ⓔ', write: 'Ⓦ', delete: 'Ⓧ', shell: 'Ⓣ', search: 'Ⓢ', web: 'Ⓘ',
    mcp: 'Ⓜ', agent: 'Ⓐ', skill: 'Ⓚ', ask: 'Ⓠ', plan: 'Ⓟ', other: 'Ⓞ',
  },
  symbols: {
    read: '▤', edit: '✎', write: '✚', delete: '✕', shell: '❯', search: '◎', web: '⊕',
    mcp: '⬡', agent: '✦', skill: '★', ask: '?', plan: '☰', other: '•',
  },
  emoji: {
    read: '📖', edit: '🔧', write: '📝', delete: '❌', shell: '💻', search: '🔍', web: '🌐',
    mcp: '🔌', agent: '🤖', skill: '🎯', ask: '💬', plan: '📋', other: '🔹',
  },
  // The four designer sets below are Nerd Font glyphs (private-use code
  // points): they draw with a Nerd Font such as Microsoft's Cascadia Mono NF,
  // and as empty boxes without one. Every code point was checked against
  // Cascadia Mono NF 2407.24.
  codicons: {
    read: '\u{ea7b}', edit: '\u{ea73}', write: '\u{ea7f}', delete: '\u{ea81}', shell: '\u{ea85}',
    search: '\u{ea6d}', web: '\u{eb01}', mcp: '\u{eb2d}', agent: '\u{eb08}', skill: '\u{ebcf}',
    ask: '\u{eb32}', plan: '\u{eab3}', other: '\u{eb6d}',
  },
  awesome: {
    read: '\u{f15c}', edit: '\u{f040}', write: '\u{f067}', delete: '\u{f1f8}', shell: '\u{f120}',
    search: '\u{f002}', web: '\u{f0ac}', mcp: '\u{f1e6}', agent: '\u{f21b}', skill: '\u{f0d0}',
    ask: '\u{f059}', plan: '\u{f0ae}', other: '\u{f013}',
  },
  material: {
    read: '\u{f0219}', edit: '\u{f03eb}', write: '\u{f0752}', delete: '\u{f01b4}', shell: '\u{f018d}',
    search: '\u{f0349}', web: '\u{f059f}', mcp: '\u{f06a5}', agent: '\u{f06a9}', skill: '\u{f0674}',
    ask: '\u{f02d7}', plan: '\u{f014e}', other: '\u{f0493}',
  },
  octicons: {
    read: '\u{f4a5}', edit: '\u{f448}', write: '\u{f4d0}', delete: '\u{f48e}', shell: '\u{f489}',
    search: '\u{f422}', web: '\u{f484}', mcp: '\u{f492}', agent: '\u{f4b8}', skill: '\u{f51b}',
    ask: '\u{f420}', plan: '\u{f45e}', other: '\u{f423}',
  },
} as const satisfies Record<string, Record<Kind, string>>

/** The styles that need a Nerd Font installed and chosen in the terminal. */
export const NERD_STYLES: ReadonlySet<string> = new Set(['codicons', 'awesome', 'material', 'octicons'])

export type StyleName = keyof typeof STYLES

// Color themes: one family per theme, a shade per kind. Delete is always
// the warmest, most alarming shade of its family.
export const THEMES = {
  ocean: {
    read: '#5FB3F9', edit: '#4DD0C8', write: '#3FA7D6', delete: '#F47174', shell: '#7AA2F7', search: '#89DDFF',
    web: '#64B5F6', mcp: '#A78BFA', agent: '#2DD4BF', skill: '#93C5FD', ask: '#FBBF24', plan: '#67E8F9', other: '#94A3B8',
  },
  sunset: {
    read: '#FFB86B', edit: '#FF8E72', write: '#FF6F91', delete: '#E5484D', shell: '#FFC75F', search: '#F9A26C',
    web: '#FF9671', mcp: '#D65DB1', agent: '#FF7EB6', skill: '#FFD580', ask: '#FFE066', plan: '#F7A072', other: '#C9A9A6',
  },
  neon: {
    read: '#00E5FF', edit: '#39FF14', write: '#B3FF00', delete: '#FF2E63', shell: '#FFE600', search: '#00FFC6',
    web: '#3DA5FF', mcp: '#FF00E5', agent: '#BF5AF2', skill: '#FF9F0A', ask: '#FFD60A', plan: '#64D2FF', other: '#8E8E93',
  },
  forest: {
    read: '#8FBC8F', edit: '#A3BE8C', write: '#6B8E23', delete: '#BF616A', shell: '#D08770', search: '#88C0D0',
    web: '#81A1C1', mcp: '#B48EAD', agent: '#9CCFA0', skill: '#EBCB8B', ask: '#E5C07B', plan: '#8FBCBB', other: '#7F8C8D',
  },
  claude: {
    read: '#E3A587', edit: '#D97757', write: '#C96442', delete: '#B5442B', shell: '#F0A884', search: '#E8B9A0',
    web: '#D9906F', mcp: '#BF6A4C', agent: '#E08A66', skill: '#F2C3A8', ask: '#F5D0B5', plan: '#CC8566', other: '#A89080',
  },
  aurora: {
    read: '#7FDBCA', edit: '#C792EA', write: '#82AAFF', delete: '#FF5370', shell: '#ADDB67', search: '#89DDFF',
    web: '#7FB3FF', mcp: '#F78CFF', agent: '#B2CCD6', skill: '#FFCB6B', ask: '#F3E5AB', plan: '#80CBC4', other: '#8C9DB5',
  },
  pastel: {
    read: '#A0C4FF', edit: '#BDB2FF', write: '#9BF6FF', delete: '#FFADAD', shell: '#CAFFBF', search: '#B5EAD7',
    web: '#A0E7E5', mcp: '#FFC6FF', agent: '#E2C2FF', skill: '#FDFFB6', ask: '#FFD6A5', plan: '#C7CEEA', other: '#D3D3D3',
  },
} as const satisfies Record<string, Record<Kind, string>>

export type ThemeName = keyof typeof THEMES

// Where a gradient label ends: each label fades from its kind's color to this.
export const GLOW: Readonly<Record<ThemeName, string>> = {
  ocean: '#E0F7FF',
  sunset: '#FFF1C1',
  neon: '#FFFFFF',
  forest: '#F0EAD2',
  claude: '#FBE9DF',
  aurora: '#F8F8F2',
  pastel: '#FFFFFF',
}

function rgb(hex: string): [number, number, number] {
  const n = Number.parseInt(hex.replace('#', ''), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

/** Each character of `text` with its color, fading from `from` to `to`. */
export function gradient(text: string, from: string, to: string): [string, string][] {
  const chars = [...text]
  const [a, b] = [rgb(from), rgb(to)]
  return chars.map((ch, i) => {
    const t = chars.length <= 1 ? 0 : i / (chars.length - 1)
    const mix = a.map((v, k) => Math.round(v + (b[k]! - v) * t))
    return [ch, `#${mix.map(v => v.toString(16).padStart(2, '0')).join('')}`]
  })
}

export const DEFAULT_STYLE: StyleName = 'circled'
export const DEFAULT_THEME: ThemeName = 'ocean'

export function isStyle(name: string): name is StyleName {
  return Object.hasOwn(STYLES, name)
}

export function isTheme(name: string): name is ThemeName {
  return Object.hasOwn(THEMES, name)
}

const READ = new Set(['Read', 'NotebookRead'])
const EDIT = new Set(['Edit', 'MultiEdit', 'NotebookEdit'])
const SEARCH = new Set(['Grep', 'Glob', 'ToolSearch', 'LSP', 'ListMcpResourcesTool'])
const WEB = new Set(['WebFetch', 'WebSearch'])
const AGENT = new Set(['Agent', 'Task', 'SendMessage', 'ListAgents', 'TaskStop', 'Workflow'])
const PLAN = new Set(['TodoWrite', 'TaskCreate', 'TaskUpdate', 'EnterPlanMode', 'ExitPlanMode', 'CronCreate', 'ScheduleWakeup'])
// A delete at a command position: start of line or after ; | & ( and spaces.
const DELETE_COMMAND = /(^|[;&|(]\s*|\bsudo\s+)(rm|rmdir|del|erase|rd|remove-item|ri)\b/im

function commandOf(input: unknown): string {
  const command = (input as { command?: unknown } | null)?.command
  return typeof command === 'string' ? command : ''
}

export function kindOf(tool: string, input: unknown): Kind {
  if (tool === 'Bash' || tool === 'PowerShell') return DELETE_COMMAND.test(commandOf(input).trim()) ? 'delete' : 'shell'
  if (READ.has(tool)) return 'read'
  if (EDIT.has(tool)) return 'edit'
  if (tool === 'Write') return 'write'
  if (SEARCH.has(tool)) return 'search'
  if (WEB.has(tool)) return 'web'
  if (AGENT.has(tool)) return 'agent'
  if (PLAN.has(tool)) return 'plan'
  if (tool === 'Skill') return 'skill'
  if (tool === 'AskUserQuestion') return 'ask'
  if (tool.startsWith('mcp__')) return 'mcp'
  return 'other'
}

/** `mcp__claude_ai_Example__search_records` → `Example · search_records`. */
export function mcpName(tool: string): string {
  const [, server = '', ...rest] = tool.split('__')
  const short = server.replace(/^claude_ai_/, '').replace(/^plugin_[^_]+_/, '')
  return `${short} · ${rest.join('__')}`
}

export function label(kind: Kind, tool: string): string {
  if (kind === 'mcp') return mcpName(tool)
  if (kind === 'other' || kind === 'agent' || kind === 'plan') return tool
  return LABELS[kind]
}

function field(input: unknown, ...names: string[]): string {
  const record = (input ?? {}) as Record<string, unknown>
  for (const name of names) {
    const value = record[name]
    if (typeof value === 'string' && value.trim() !== '') return value
  }
  return ''
}

/** A path relative to the session folder when it lies under it. */
export function shortPath(path: string, cwd: string): string {
  const norm = (p: string) => p.replace(/\\/g, '/').replace(/\/+$/, '')
  const p = norm(path)
  const root = norm(cwd)
  if (root !== '' && p.toLowerCase().startsWith(`${root.toLowerCase()}/`)) return p.slice(root.length + 1)
  return p
}

/** The few words after the label: a file, a command, a pattern, a query. */
export function target(tool: string, input: unknown, cwd: string): string {
  const kind = kindOf(tool, input)
  switch (kind) {
    case 'read':
    case 'edit':
    case 'write':
      return shortPath(field(input, 'file_path', 'notebook_path', 'path'), cwd)
    case 'shell':
    case 'delete':
      return field(input, 'description') || commandOf(input).split(/\r?\n/)[0]!.trim()
    case 'search':
      return field(input, 'pattern', 'query')
    case 'web': {
      const url = field(input, 'url')
      if (url !== '') {
        try {
          return new URL(url).host
        } catch {
          return url
        }
      }
      return field(input, 'query')
    }
    case 'agent':
      return field(input, 'description', 'summary', 'to')
    case 'skill':
      return field(input, 'skill')
    default:
      return field(input, 'description', 'query', 'name', 'title', 'path')
  }
}

/** Cut to `room` characters, keeping the end of a path and the start of anything else. */
export function fit(text: string, room: number, isPath: boolean): string {
  const flat = text.replace(/\s+/g, ' ')
  if (room < 4 || flat.length <= room) return room < 4 ? '' : flat
  return isPath ? `…${flat.slice(flat.length - room + 1)}` : `${flat.slice(0, room - 1)}…`
}

const PHRASE: Readonly<Record<Kind, [string, string]>> = {
  read: ['read', 'file'],
  edit: ['edited', 'file'],
  write: ['wrote', 'file'],
  delete: ['deleted with', 'command'],
  shell: ['ran', 'command'],
  search: ['searched', 'pattern'],
  web: ['fetched', 'page'],
  mcp: ['called', 'MCP tool'],
  agent: ['started', 'agent'],
  skill: ['used', 'skill'],
  ask: ['asked', 'question'],
  plan: ['updated', 'plan'],
  other: ['ran', 'tool'],
}

/** A folded group as `read 3 files · searched 2 patterns`, kinds in first-seen order. */
export function groupSummary(calls: ReadonlyArray<{ tool: string; input: unknown }>): { kinds: Kind[]; text: string } {
  const counts = new Map<Kind, number>()
  for (const call of calls) {
    const kind = kindOf(call.tool, call.input)
    counts.set(kind, (counts.get(kind) ?? 0) + 1)
  }
  const parts = [...counts].map(([kind, n]) => {
    const [verb, noun] = PHRASE[kind]
    return `${verb} ${n} ${noun}${n === 1 ? '' : 's'}`
  })
  const text = parts.join(' · ')
  return { kinds: [...counts.keys()], text: text.charAt(0).toUpperCase() + text.slice(1) }
}
