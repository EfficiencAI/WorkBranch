import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import 'antd/dist/reset.css'
import App from './App'
import { readClientId } from './shared/logging/clientId'
import { frontendLogger } from './shared/logging/logger'
import { AUTH_TOKEN_KEY, LOCAL_OFFLINE_TOKEN, waitForBackendReady } from './shared/api/config'
import './styles/index.css'
import './styles/wb-light.css'
import './styles/canvas-guide.css'
import './styles/workassistant.css'
import './styles/onboarding.css'

const { clientId, restored } = readClientId()

if (restored) {
  frontendLogger.info('client.restored', {
    extra: {
      client_id: clientId,
      source: 'session_storage',
    },
  })
}

function ensureOfflineToken() {
  if (typeof localStorage !== 'undefined' && !localStorage.getItem(AUTH_TOKEN_KEY)) {
    localStorage.setItem(AUTH_TOKEN_KEY, LOCAL_OFFLINE_TOKEN)
  }
}

async function bootstrap() {
  ensureOfflineToken()
  await waitForBackendReady()

  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
}

bootstrap()
