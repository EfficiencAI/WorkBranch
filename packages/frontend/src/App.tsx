import { RouterProvider } from 'react-router-dom'
import { App as AntdApp } from 'antd'
import { AppProviders } from './app/providers'
import { router } from './app/router'

function App() {
  return (
    <AppProviders>
      <AntdApp>
        <RouterProvider router={router} />
      </AntdApp>
    </AppProviders>
  )
}

export default App