import { App as AntdApp, ConfigProvider, theme as antdTheme } from 'antd'
import type { PropsWithChildren } from 'react'

export function AppProviders({ children }: PropsWithChildren) {
  return (
    <ConfigProvider
      theme={{
        algorithm: antdTheme.darkAlgorithm,
        token: {
          colorPrimary: '#4f46e5',
          borderRadius: 12,
          colorBgBase: '#020617',
          colorTextBase: '#f8fafc',
        },
      }}
    >
      <AntdApp>{children}</AntdApp>
    </ConfigProvider>
  )
}
