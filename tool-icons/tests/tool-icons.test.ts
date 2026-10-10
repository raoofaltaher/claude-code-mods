import { describe, expect, mock, test } from 'claude-code/testing'
import type { On } from 'claude-code'
import { NERD_STYLES, STYLES, THEMES, fit, gradient, groupSummary, kindOf, mcpName, shortPath, target } from '../hooks/icons'
import { applyArgs } from '../hooks/register'

const PREFS = { style: 'circled', theme: 'ocean', isOn: true, isBadge: false, isGradient: false }
const SURFACES = ['terminal', 'desktop'] as const

describe('kinds', () => {
  test('built-in tools map to their kind', () => {
    expect(kindOf('Read', {})).toBe('read')
    expect(kindOf('Edit', {})).toBe('edit')
    expect(kindOf('Write', {})).toBe('write')
    expect(kindOf('Grep', {})).toBe('search')
    expect(kindOf('WebFetch', {})).toBe('web')
    expect(kindOf('Agent', {})).toBe('agent')
    expect(kindOf('Skill', {})).toBe('skill')
    expect(kindOf('AskUserQuestion', {})).toBe('ask')
    expect(kindOf('mcp__claude_ai_Example__search_records', {})).toBe('mcp')
    expect(kindOf('SomethingNew', {})).toBe('other')
  })

  test('a shell command that deletes reads as delete, any other as shell', () => {
    expect(kindOf('Bash', { command: 'rm -rf build' })).toBe('delete')
    expect(kindOf('Bash', { command: 'cd x && rm notes.txt' })).toBe('delete')
    expect(kindOf('PowerShell', { command: 'Remove-Item -Recurse dist' })).toBe('delete')
    expect(kindOf('Bash', { command: 'git status' })).toBe('shell')
    expect(kindOf('Bash', { command: 'npm run format' })).toBe('shell')
    expect(kindOf('Bash', { command: 'echo confirm' })).toBe('shell')
  })

  test('a gradient runs from the first color to the last', () => {
    const cells = gradient('Read', '#000000', '#ffffff')
    expect(cells.map(([ch]) => ch).join('')).toBe('Read')
    expect(cells[0]![1]).toBe('#000000')
    expect(cells[3]![1]).toBe('#ffffff')
    expect(gradient('R', '#123456', '#ffffff')).toEqual([['R', '#123456']])
  })

  test('the designer sets are Nerd Font glyphs, distinct within each set', () => {
    expect([...NERD_STYLES].sort()).toEqual(['awesome', 'codicons', 'material', 'octicons'])
    for (const name of NERD_STYLES) {
      const set = STYLES[name as keyof typeof STYLES]
      const glyphs = Object.values(set)
      expect(new Set(glyphs).size).toBe(glyphs.length)
      for (const glyph of glyphs) expect(glyph.codePointAt(0)! >= 0xe000).toBe(true)
    }
  })

  test('every style and theme covers every kind', () => {
    for (const set of [...Object.values(STYLES), ...Object.values(THEMES)]) {
      expect(Object.keys(set).sort()).toEqual(Object.keys(STYLES.circled).sort())
    }
  })
})

describe('labels and targets', () => {
  test('MCP tools read as server · tool', () => {
    expect(mcpName('mcp__claude_ai_Example__search_records')).toBe('Example · search_records')
    expect(mcpName('mcp__plugin_playwright_playwright__browser_click')).toBe('playwright · browser_click')
  })

  test('paths under the session folder are shown relative', () => {
    expect(shortPath('C:\\work\\app\\src\\a.ts', 'C:\\work\\app')).toBe('src/a.ts')
    expect(shortPath('D:\\other\\b.ts', 'C:\\work\\app')).toBe('D:/other/b.ts')
    expect(target('Read', { file_path: 'C:\\work\\app\\README.md' }, 'C:\\work\\app')).toBe('README.md')
  })

  test('shell lines show the command itself, never its description; web lines show the host', () => {
    expect(target('Bash', { command: 'rm -rf ~/notes', description: 'List files' }, '')).toBe('rm -rf ~/notes')
    expect(target('Bash', { command: 'git log\n--oneline' }, '')).toBe('(2 lines) git log')
    expect(target('WebFetch', { url: 'https://docs.example.com/a/b', prompt: 'p' }, '')).toBe('docs.example.com')
  })

  test('long text is cut, keeping the end of a path', () => {
    expect(fit('a/very/long/path/to/file.ts', 12, true)).toBe('…/to/file.ts')
    expect(fit('a long description here', 10, false)).toBe('a long de…')
    expect(fit('short', 20, false)).toBe('short')
  })

  test('control characters never reach the row', () => {
    expect(fit('notes\u001b[2K\u001b]0;title\u0007.txt', 40, true)).toBe('notes[2K]0;title.txt')
  })

  test('a folded group counts its calls by kind', () => {
    const calls = [
      { tool: 'Read', input: {} },
      { tool: 'Read', input: {} },
      { tool: 'Grep', input: {} },
    ]
    expect(groupSummary(calls)).toEqual({ kinds: ['read', 'search'], text: 'Read 2 files · searched 1 pattern' })
  })
})

describe('/icons arguments', () => {
  test('a style or theme name sets it, off and on toggle', () => {
    expect(applyArgs(PREFS, 'neon')).toEqual({ ...PREFS, theme: 'neon' })
    expect(applyArgs(PREFS, 'style emoji')).toEqual({ ...PREFS, style: 'emoji' })
    expect(applyArgs(PREFS, 'symbols sunset')).toEqual({ ...PREFS, style: 'symbols', theme: 'sunset' })
    expect(applyArgs(PREFS, 'material aurora')).toEqual({ ...PREFS, style: 'material', theme: 'aurora' })
    expect(applyArgs(PREFS, 'off')).toEqual({ ...PREFS, isOn: false })
    expect(applyArgs(PREFS, 'banana')).toContain('Unknown "banana"')
  })

  test('badge and gradient toggle, plain clears both', () => {
    const both = applyArgs(PREFS, 'badge gradient')
    expect(both).toEqual({ ...PREFS, isBadge: true, isGradient: true })
    expect(applyArgs(both as typeof PREFS, 'badge')).toEqual({ ...PREFS, isGradient: true })
    expect(applyArgs(both as typeof PREFS, 'plain')).toEqual(PREFS)
  })
})

// The engine beneath the plugin: the session folder and the store.
function world(on: On) {
  mock.store(on)
  on('session.start', (_$, e) => ({ cwd: e.cwd }))
  on('session.cwd', () => ({ value: 'C:\\work\\app' }))
  on('command.register', (_$, e) => ({ value: { command: e.name, agent: '' } }))
}

const toolRow = (tool: string, input: unknown, extra: object = {}) =>
  ({
    plugin: 'tool-icons',
    component: 'ToolUse',
    requestId: 'toolu_1',
    props: { tool_use_id: 'toolu_1', tool, input, isRunning: false, isErrored: false, isInterrupted: false, ...extra },
  }) as const

describe('drawing', () => {
  test('a tool line starts with its icon, then the label and target', async ($, on) => {
    world(on)
    await $.session.start({ cwd: 'C:\\work\\app', surface: 'terminal', isInteractive: true })
    for (const surface of SURFACES) {
      const ui = await $.ui.mount({ ...toolRow('Read', { file_path: 'C:\\work\\app\\src\\a.ts' }), surface })
      expect(await ui.find({ type: 'Text', text: 'Ⓡ' })).toBeDefined()
      expect(await ui.find({ type: 'Text', text: /Read/ })).toBeDefined()
      expect(await ui.find({ type: 'Text', text: /src\/a\.ts/ })).toBeDefined()
      await ui.unmount()
    }
  })

  test('a failed delete shows its icon and the failure', async ($, on) => {
    world(on)
    await $.session.start({ cwd: 'C:\\work\\app', surface: 'terminal', isInteractive: true })
    const ui = await $.ui.mount({ ...toolRow('Bash', { command: 'rm -rf dist' }, { isErrored: true }), surface: 'terminal' })
    expect(await ui.find({ type: 'Text', text: 'Ⓧ' })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /failed/ })).toBeDefined()
    await ui.unmount()
  })

  test('the gallery lists every style and theme', async ($, on) => {
    world(on)
    await $.session.start({ cwd: 'C:\\work\\app', surface: 'terminal', isInteractive: true })
    for (const surface of SURFACES) {
      const ui = await $.ui.mount({
        plugin: 'tool-icons',
        component: 'CommandOutput',
        requestId: 'out_1',
        props: { command: 'icons', args: '', text: '', isErrored: false },
        surface,
      })
      for (const name of [...Object.keys(STYLES), ...Object.keys(THEMES)]) {
        expect(await ui.find({ type: 'Text', text: new RegExp(name) })).toBeDefined()
      }
      await ui.unmount()
    }
  })
})
