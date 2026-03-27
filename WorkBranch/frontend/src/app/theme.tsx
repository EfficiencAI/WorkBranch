import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import type { PropsWithChildren } from 'react'
import { get, patch } from '../shared/api'
import { settingsConfig } from '../shared/config/settings'
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
  const [settingsSnapshot, setSettingsSnapshot] = useState<SettingsNodeLike | null>(null)
  const [themeMode, setThemeModeState] = useState<ThemeMode>(DEFAULT_THEME_MODE)
  const [resolvedTheme, setResolvedTheme] = useState<ResolvedTheme>(() => resolveTheme(DEFAULT_THEME_MODE))
  const [loading, setLoading] = useState(true)

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
    let cancelled = false

    async function loadThemeMode() {
      try {
        const settings = await get<SettingsNodeLike>(settingsConfig.endpoint)
        if (cancelled) {
          return
        }

        setSettingsSnapshot(settings)
        const nextThemeMode = isThemeMode(settings.ui?.theme_mode) ? settings.ui.theme_mode : DEFAULT_THEME_MODE
        setThemeModeState(nextThemeMode)
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    }

    void loadThemeMode()

    return () => {
      cancelled = true
    }
  }, [])

  const setThemeMode = useCallback(
    async (nextThemeMode: ThemeMode) => {
      const previousSettingsSnapshot = settingsSnapshot
      const previousThemeMode = isThemeMode(previousSettingsSnapshot?.ui?.theme_mode)
        ? previousSettingsSnapshot.ui.theme_mode
        : themeMode
      const updates = getUiSettingsPatch(previousSettingsSnapshot, nextThemeMode)
      const nextSettingsSnapshot = {
        ...(previousSettingsSnapshot ?? {}),
        ...updates,
      }

      setThemeModeState(nextThemeMode)
      setSettingsSnapshot(nextSettingsSnapshot)

      try {
        await patch<void, typeof updates>(settingsConfig.endpoint, updates)
      } catch (error) {
        setThemeModeState(previousThemeMode)
        setSettingsSnapshot(previousSettingsSnapshot)
        throw error
      }
    },
    [settingsSnapshot, themeMode],
  )

  const value = useMemo<ThemeContextValue>(
    () => ({
      loading,
      themeMode,
      resolvedTheme,
      setThemeMode,
    }),
    [loading, resolvedTheme, setThemeMode, themeMode],
  )

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}

export function useTheme() {
  const context = useContext(ThemeContext)

  if (!context) {
    throw new Error('useTheme must be used within ThemeProvider')
  }

  return context
}
