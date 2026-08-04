import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import type { PropsWithChildren } from 'react'
import type { SettingMetadataNode, SettingNode } from '../entities'
import { get, getErrorMessage, patch } from '../shared/api'
import { settingsConfig } from '../shared/config/settings'

import { cloneDeepJson } from '../shared/lib'

type SettingsContextValue = {
  settings: SettingNode | null
  settingsMetadata: SettingMetadataNode | null
  loading: boolean
  error: string | null
  reloadSettings: () => Promise<void>
  patchSettings: (updates: Partial<SettingNode>) => Promise<void>
}

const SettingsContext = createContext<SettingsContextValue | null>(null)

export function SettingsProvider({ children }: PropsWithChildren) {
  const [settings, setSettings] = useState<SettingNode | null>(null)
  const [settingsMetadata, setSettingsMetadata] = useState<SettingMetadataNode | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const reloadSettings = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      const [settingsResult, metadataResult] = await Promise.all([
        get<SettingNode>(settingsConfig.endpoint),
        get<SettingMetadataNode>(settingsConfig.metadataEndpoint),
      ])
      setSettings(settingsResult)
      setSettingsMetadata(metadataResult)
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
      // 乐观更新：将变更合并到本地状态，避免全量重载导致页面闪烁
      setSettings((prev) => {
        if (!prev) return prev
        const merged = cloneDeepJson(prev)
        for (const [key, value] of Object.entries(updates)) {
          ;(merged as Record<string, unknown>)[key] = cloneDeepJson(value)
        }
        return merged
      })
    },
    [],
  )

  const value = useMemo<SettingsContextValue>(
    () => ({
      settings,
      settingsMetadata,
      loading,
      error,
      reloadSettings,
      patchSettings,
    }),
    [error, loading, patchSettings, reloadSettings, settings, settingsMetadata],
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
