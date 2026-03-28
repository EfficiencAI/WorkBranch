import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import type { PropsWithChildren } from 'react'
import { useSettings } from './settings'
import { cloneDeepJson, isPlainObject } from '../shared/lib'

export type ThemeMode = 'light' | 'dark' | 'system'
export type ResolvedTheme = 'light' | 'dark'

type ThemeContextValue = {
  loading: boolean
  themeMode: ThemeMode
  resolvedTheme: ResolvedTheme
  setThemeMode: (mode: ThemeMode) => Promise<void>
}

type UiSettingsNode = {
  theme_mode?: string
  [key: string]: unknown
}

type SettingsNodeLike = {
  ui?: UiSettingsNode
  [key: string]: unknown
}

const DEFAULT_THEME_MODE: ThemeMode = 'system'
const ThemeContext = createContext<ThemeContextValue | null>(null)

function isThemeMode(value: unknown): value is ThemeMode {
  return value === 'light' || value === 'dark' || value === 'system'
}

function resolveSystemTheme(): ResolvedTheme {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return 'dark'
  }

  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

function resolveTheme(themeMode: ThemeMode): ResolvedTheme {
  return themeMode === 'system' ? resolveSystemTheme() : themeMode
}

function getUiSettingsPatch(settings: SettingsNodeLike | null, themeMode: ThemeMode) {
  const nextUi = isPlainObject(settings?.ui) ? cloneDeepJson(settings.ui) : {}
  return {
    ui: {
      ...nextUi,
      theme_mode: themeMode,
    },
  }
}

export function ThemeProvider({ children }: PropsWithChildren) {
  const { settings, loading: settingsLoading, patchSettings } = useSettings()
  const [themeMode, setThemeModeState] = useState<ThemeMode>(DEFAULT_THEME_MODE)
  const [resolvedTheme, setResolvedTheme] = useState<ResolvedTheme>(() => resolveTheme(DEFAULT_THEME_MODE))

  useEffect(() => {
    setResolvedTheme(resolveTheme(themeMode))
  }, [themeMode])

  useEffect(() => {
    document.documentElement.dataset.theme = resolvedTheme
  }, [resolvedTheme])

  useEffect(() => {
    if (themeMode !== 'system' || typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      return
    }

    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
    const handleChange = () => setResolvedTheme(resolveSystemTheme())

    handleChange()
    mediaQuery.addEventListener('change', handleChange)
    return () => mediaQuery.removeEventListener('change', handleChange)
  }, [themeMode])

  useEffect(() => {
    if (settingsLoading) {
      return
    }

    const ui = isPlainObject(settings?.ui) ? (settings.ui as UiSettingsNode) : null
    const nextThemeMode = isThemeMode(ui?.theme_mode) ? (ui.theme_mode as ThemeMode) : DEFAULT_THEME_MODE
    setThemeModeState(nextThemeMode)
  }, [settings, settingsLoading])

  const setThemeMode = useCallback(
    async (nextThemeMode: ThemeMode) => {
      const updates = getUiSettingsPatch(settings as SettingsNodeLike | null, nextThemeMode)
      setThemeModeState(nextThemeMode)
      try {
        await patchSettings(updates)
      } catch (error) {
        const ui = isPlainObject(settings?.ui) ? (settings.ui as UiSettingsNode) : null
        const previousThemeMode = isThemeMode(ui?.theme_mode) ? (ui.theme_mode as ThemeMode) : DEFAULT_THEME_MODE
        setThemeModeState(previousThemeMode)
        throw error
      }
    },
    [patchSettings, settings],
  )

  const value = useMemo<ThemeContextValue>(
    () => ({
      loading: settingsLoading,
      themeMode,
      resolvedTheme,
      setThemeMode,
    }),
    [resolvedTheme, setThemeMode, settingsLoading, themeMode],
  )

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components -- ThemeProvider and useTheme intentionally share one module
export function useTheme() {
  const context = useContext(ThemeContext)

  if (!context) {
    throw new Error('useTheme must be used within ThemeProvider')
  }

  return context
}
