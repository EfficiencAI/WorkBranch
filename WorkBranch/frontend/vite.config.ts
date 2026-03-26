import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/chat': 'http://127.0.0.1:8000',
      '/settings': 'http://127.0.0.1:8000',
      '/workspaces': 'http://127.0.0.1:8000',
    },
  },
})
