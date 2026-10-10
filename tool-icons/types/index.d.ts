/**
 * The person's choice: which icon set and color theme, whether icons sit on
 * a colored chip (badge), whether labels fade in a gradient, and whether
 * icons draw at all.
 */
export type ToolIconsPrefs = { style: string; theme: string; isOn: boolean; isBadge: boolean; isGradient: boolean }

declare module 'claude-code' {
  interface PluginState {
    'tool-icons': { prefs: ToolIconsPrefs }
  }
}
