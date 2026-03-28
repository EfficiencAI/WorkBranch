import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import type { PropsWithChildren } from 'react'
import type { SettingNode } from '../entities'
import { get, getErrorMessage, patch } from '../shared/api'
import { settingsConfig } from '../shared/config/settings'

type SettingsContextValue = {
  settings: SettingNode | null
  loading: boolean
  error: string | null
  reloadSettings: () => Promise<void>
  patchSettings: (updates: Partial<SettingNode>) => Promise<void>
}

const SettingsContext = createContext<SettingsContextValue | null>(null)

export function SettingsProvider({ children }: PropsWithChildren) {
  const [settings, setSettings] = useState<SettingNode | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const reloadSettings = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      const result = await get<SettingNode>(settingsConfig.endpoint)
      setSettings(result)
    } catch (caughtError) {
      setError(getErrorMessage(caughtError, '设置加载失败'))
      throw caughtError
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void reloadSettings()
  }, [reloadSettings])

  const patchSettings = useCallback(
    async (updates: Partial<SettingNode>) => {
      await patch<void, Partial<SettingNode>>(settingsConfig.endpoint, updates)
      await reloadSettings()
    },
    [reloadSettings],
  )

  const value = useMemo<SettingsContextValue>(
    () => ({
      settings,
      loading,
      error,
      reloadSettings,
      patchSettings,
    }),
    [error, loading, patchSettings, reloadSettings, settings],
  )

  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components -- SettingsProvider and useSettings intentionally share one module
export function useSettings() {
  const context = useContext(SettingsContext)

  if (!context) {
    throw new Error('useSettings must be used within SettingsProvider')
  }

  return context
}
