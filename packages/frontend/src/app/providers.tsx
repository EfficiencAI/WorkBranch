import { App as AntdApp, ConfigProvider, theme as antdTheme } from 'antd'
import type { PropsWithChildren } from 'react'
import type { ThemeConfig } from 'antd'
import { SettingsProvider } from './settings'
import { ThemeProvider, useTheme } from './theme'

const sharedTokens: ThemeConfig['token'] = {
  colorPrimary: '#4f46e5',
  borderRadius: 12,
}

const darkTokens: ThemeConfig['token'] = {
  colorBgBase: '#020617',
  colorTextBase: '#f8fafc',
  colorBgContainer: 'rgba(15, 23, 42, 0.88)',
  colorBorder: 'rgba(148, 163, 184, 0.18)',
}

const lightTokens: ThemeConfig['token'] = {
  colorBgBase: '#f8fafc',
  colorTextBase: '#0f172a',
  colorBgContainer: 'rgba(255, 255, 255, 0.96)',
  colorBorder: 'rgba(148, 163, 184, 0.28)',
}

function ThemeConfigProvider({ children }: PropsWithChildren) {
  const { resolvedTheme } = useTheme()
  const isDark = resolvedTheme === 'dark'

  return (
    <ConfigProvider
      theme={{
        algorithm: isDark ? antdTheme.darkAlgorithm : antdTheme.defaultAlgorithm,
        token: {
          ...sharedTokens,
          ...(isDark ? darkTokens : lightTokens),
        },
      }}
    >
      <AntdApp>{children}</AntdApp>
    </ConfigProvider>
  )
}

export function AppProviders({ children }: PropsWithChildren) {
  return (
    <SettingsProvider>
      <ThemeProvider>
        <ThemeConfigProvider>{children}</ThemeConfigProvider>
      </ThemeProvider>
    </SettingsProvider>
  )
}
