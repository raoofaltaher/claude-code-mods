import { atom, read, update } from 'claude-code'
import type { ElementTable, EngineInterface, Register } from 'claude-code'
import type { ToolIconsPrefs } from '../types'
import {
  DEFAULT_STYLE,
  DEFAULT_THEME,
  GLOW,
  KINDS,
  LABELS,
  NERD_STYLES,
  STYLES,
  THEMES,
  fit,
  gradient,
  groupSummary,
  isStyle,
  isTheme,
  kindOf,
  label,
  target,
} from './icons'
import type { Kind, ThemeName } from './icons'

const DEFAULTS: ToolIconsPrefs = { style: DEFAULT_STYLE, theme: DEFAULT_THEME, isOn: true, isBadge: false, isGradient: false }
const prefsAtom = atom({ plugin: 'tool-icons', key: 'prefs' } as const, DEFAULTS)

const PATH_KINDS: ReadonlySet<Kind> = new Set(['read', 'edit', 'write'])
const SAMPLE: readonly Kind[] = ['read', 'edit', 'write', 'delete', 'shell', 'search', 'web', 'mcp', 'agent']
const GALLERY_ARGS = new Set(['', 'preview', 'list', 'help'])
// Text drawn on a badge's colored chip.
const ON_CHIP = '#111111'
const USAGE = `/icons                 preview every style, theme and look
/icons <style>         ${Object.keys(STYLES).join(' | ')}
/icons <theme>         ${Object.keys(THEMES).join(' | ')}
/icons badge | gradient   toggle a look (icon on a chip, label in a gradient)
/icons plain           both looks off
/icons off | on        hide or show the icons`

type Ui = Pick<ElementTable, 'Box' | 'Text'>
type Look = {
  icons: Readonly<Record<Kind, string>>
  colors: Readonly<Record<Kind, string>>
  glow: string
  prefs: ToolIconsPrefs
}

export function lookOf(prefs: ToolIconsPrefs): Look {
  const theme: ThemeName = isTheme(prefs.theme) ? prefs.theme : DEFAULT_THEME
  return {
    icons: STYLES[isStyle(prefs.style) ? prefs.style : DEFAULT_STYLE],
    colors: THEMES[theme],
    glow: GLOW[theme],
    prefs,
  }
}

function describe(prefs: ToolIconsPrefs): string {
  const looks = [prefs.isBadge && 'badge', prefs.isGradient && 'gradient'].filter(Boolean).join(' + ') || 'plain'
  const font = NERD_STYLES.has(prefs.style) ? ' (needs a Nerd Font, like Cascadia Mono NF)' : ''
  return `Tool icons ${prefs.isOn ? 'on' : 'off'}: ${prefs.style} icons${font}, ${prefs.theme} theme, ${looks} look.`
}

/** What `/icons <args>` changes, or a message when the words name nothing. */
export function applyArgs(prefs: ToolIconsPrefs, args: string): ToolIconsPrefs | string {
  const words = args.trim().toLowerCase().split(/\s+/).filter(w => w !== '' && w !== 'style' && w !== 'theme')
  let next = prefs
  for (const word of words) {
    if (word === 'off' || word === 'on') next = { ...next, isOn: word === 'on' }
    else if (word === 'badge') next = { ...next, isBadge: !next.isBadge, isOn: true }
    else if (word === 'gradient') next = { ...next, isGradient: !next.isGradient, isOn: true }
    else if (word === 'plain') next = { ...next, isBadge: false, isGradient: false, isOn: true }
    else if (isStyle(word)) next = { ...next, style: word, isOn: true }
    else if (isTheme(word)) next = { ...next, theme: word, isOn: true }
    else return `Unknown "${word}".\n${USAGE}`
  }
  return next
}

/** The icon, plain in its color or on a chip of it. */
function iconCell(ui: Ui, look: Look, kind: Kind, key?: string) {
  const color = look.colors[kind]
  return look.prefs.isBadge ? (
    <ui.Text key={key} backgroundColor={color} color={ON_CHIP} bold>{` ${look.icons[kind]} `}</ui.Text>
  ) : (
    <ui.Text key={key} color={color} bold>{look.icons[kind]}</ui.Text>
  )
}

/** The label, in its color or fading toward the theme's glow. */
function labelCells(ui: Ui, look: Look, kind: Kind, text: string) {
  if (!look.prefs.isGradient) return [<ui.Text color={look.colors[kind]} bold>{text}</ui.Text>]
  return gradient(text, look.colors[kind], look.glow).map(([ch, color]) => (
    <ui.Text color={color} bold>{ch}</ui.Text>
  ))
}

async function save($: EngineInterface, prefs: ToolIconsPrefs): Promise<void> {
  await update($, prefsAtom, () => prefs)
  await $.store.set('prefs', prefs)
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    const started = await next(e)
    await $.command.register({
      name: 'icons',
      description: 'Tool icons: preview, pick a style, theme or look, or turn them off',
      argumentHint: '[style | theme | badge | gradient | plain | off | on]',
    })
    const saved = (await $.store.get('prefs').catch(() => undefined)) as Partial<ToolIconsPrefs> | undefined
    if (saved !== undefined && saved !== null) {
      await update($, prefsAtom, () => ({
        style: typeof saved.style === 'string' && isStyle(saved.style) ? saved.style : DEFAULT_STYLE,
        theme: typeof saved.theme === 'string' && isTheme(saved.theme) ? saved.theme : DEFAULT_THEME,
        isOn: saved.isOn !== false,
        isBadge: saved.isBadge === true,
        isGradient: saved.isGradient === true,
      }))
    }
    return started
  })

  on('command.run', { command: 'icons' }, async ($, e) => {
    const prefs = await read($, prefsAtom)
    if (GALLERY_ARGS.has(e.args.trim().toLowerCase())) return { text: `${describe(prefs)}\n${USAGE}` }
    const next = applyArgs(prefs, e.args)
    if (typeof next === 'string') return { text: next }
    await save($, next)
    return { text: describe(next) }
  })

  on('ui.render', { component: 'ToolUse' }, async ($, e, next) => {
    const prefs = await read($, prefsAtom)
    if (!prefs.isOn) return next(e)

    const ui = $.ui.resolve(e)
    const look = lookOf(prefs)
    const { tool, input, isRunning, isErrored, isInterrupted } = e.props
    const kind = kindOf(tool, input)
    const name = label(kind, tool)
    const cwd = await $.session.cwd().catch(() => '')
    const room = (e.viewport?.columns ?? 100) - name.length - 20
    const what = fit(target(tool, input, cwd), room, PATH_KINDS.has(kind))

    const parts = [iconCell(ui, look, kind), <ui.Text> </ui.Text>, ...labelCells(ui, look, kind, name)]
    if (what !== '') parts.push(<ui.Text dimColor>  {what}</ui.Text>)
    if (isRunning) parts.push(<ui.Text dimColor> …</ui.Text>)
    else if (isInterrupted) parts.push(<ui.Text dimColor> · interrupted</ui.Text>)
    else if (isErrored) parts.push(<ui.Text color={look.colors.delete}> ✗ failed</ui.Text>)
    return <ui.Box flexDirection="row">{parts}</ui.Box>
  })

  on('ui.render', { component: 'ToolGroup' }, async ($, e, next) => {
    const prefs = await read($, prefsAtom)
    if (!prefs.isOn || e.props.isExpanded) return next(e)

    const ui = $.ui.resolve(e)
    const look = lookOf(prefs)
    const { kinds, text } = groupSummary(e.props.calls)
    const parts = kinds.flatMap(kind => [iconCell(ui, look, kind), <ui.Text> </ui.Text>])
    parts.push(...labelCells(ui, look, kinds[0] ?? 'other', text))
    if (e.props.calls.some(call => call.isRunning)) parts.push(<ui.Text dimColor> …</ui.Text>)
    return <ui.Box flexDirection="row">{parts}</ui.Box>
  })

  // `/icons` alone: a gallery of every style, theme and look, drawn in the transcript.
  on('ui.render', { component: 'CommandOutput', props: { command: 'icons' } }, async ($, e, next) => {
    if (!GALLERY_ARGS.has(e.props.args.trim().toLowerCase())) return next(e)

    const ui = $.ui.resolve(e)
    const prefs = await read($, prefsAtom)
    const look = lookOf(prefs)
    const name = (text: string, isCurrent: boolean) => (
      <ui.Text bold={isCurrent} dimColor={!isCurrent}>{`${isCurrent ? '▸' : ' '} ${text.padEnd(10)}`}</ui.Text>
    )
    const iconRow = (key: string, title: string, rowLook: Look, isCurrent: boolean) => (
      <ui.Box key={key} flexDirection="row">
        {name(title, isCurrent)}
        {SAMPLE.flatMap((kind, i) => [<ui.Text> </ui.Text>, iconCell(ui, rowLook, kind, `${key}-${i}`)])}
      </ui.Box>
    )
    const plain = { ...prefs, isBadge: false, isGradient: false }
    const lookRow = (key: string, title: string, rowPrefs: ToolIconsPrefs, isCurrent: boolean) => {
      const rowLook = lookOf(rowPrefs)
      return (
        <ui.Box key={key} flexDirection="row">
          {name(title, isCurrent)}
          {(['read', 'edit', 'shell'] as const).flatMap(kind => [
            <ui.Text>  </ui.Text>,
            iconCell(ui, rowLook, kind),
            <ui.Text> </ui.Text>,
            ...labelCells(ui, rowLook, kind, LABELS[kind]),
          ])}
        </ui.Box>
      )
    }

    return (
      <ui.Box flexDirection="column">
        <ui.Text bold>{describe(prefs)}</ui.Text>
        <ui.Box flexDirection="row">
          {KINDS.filter(k => k !== 'other').flatMap(kind => [
            iconCell(ui, look, kind),
            <ui.Text color={look.colors[kind]}>{` ${LABELS[kind].toLowerCase()}  `}</ui.Text>,
          ])}
        </ui.Box>
        <ui.Text dimColor>Styles, in the {prefs.theme} theme (the last four need a Nerd Font):</ui.Text>
        {Object.keys(STYLES).map(style =>
          iconRow(`style-${style}`, style, lookOf({ ...prefs, style }), style === prefs.style),
        )}
        <ui.Text dimColor>Themes, with {prefs.style} icons:</ui.Text>
        {Object.keys(THEMES).map(theme =>
          iconRow(`theme-${theme}`, theme, lookOf({ ...prefs, theme }), theme === prefs.theme),
        )}
        <ui.Text dimColor>Looks:</ui.Text>
        {lookRow('look-plain', 'plain', plain, !prefs.isBadge && !prefs.isGradient)}
        {lookRow('look-badge', 'badge', { ...plain, isBadge: true }, prefs.isBadge && !prefs.isGradient)}
        {lookRow('look-gradient', 'gradient', { ...plain, isGradient: true }, !prefs.isBadge && prefs.isGradient)}
        {lookRow('look-both', 'both', { ...plain, isBadge: true, isGradient: true }, prefs.isBadge && prefs.isGradient)}
        <ui.Text dimColor>{USAGE}</ui.Text>
      </ui.Box>
    )
  })
}
