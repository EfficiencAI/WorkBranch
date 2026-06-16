import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import 'antd/dist/reset.css'
import App from './App'
import { readClientId } from './shared/logging/clientId'
import { frontendLogger } from './shared/logging/logger'
import { waitForBackendReady } from './shared/api/config'
import './styles/index.css'

const { clientId, restored } = readClientId()

if (restored) {
  frontendLogger.info('client.restored', {
    extra: {
      client_id: clientId,
      source: 'session_storage',
    },
  })
}

async function bootstrap() {
  await waitForBackendReady()

  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
}

bootstrap()
