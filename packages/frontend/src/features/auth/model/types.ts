import type { AuthUser } from '../../../entities'

export type AuthState = {
  user: AuthUser | null
  token: string | null
  loading: boolean
  error: string | null
}

export type AuthActions = {
  login: (username: string, password: string) => Promise<boolean>
  register: (username: string, password: string, displayName?: string) => Promise<boolean>
  loginLocal: () => void
  loadSession: () => Promise<boolean>
  logout: () => Promise<void>
  clearError: () => void
}

export type AuthStore = AuthState & AuthActions
