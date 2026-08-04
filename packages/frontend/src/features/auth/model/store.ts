import { create } from 'zustand'
import { AUTH_TOKEN_KEY } from '../../../shared/api/config'
import { fetchCurrentUser, getErrorMessage, login as apiLogin, logout as apiLogout, register as apiRegister } from '../../../shared/api'
import type { AuthStore } from './types'

function readToken(): string | null {
  try {
    return typeof localStorage !== 'undefined' ? localStorage.getItem(AUTH_TOKEN_KEY) : null
  } catch {
    return null
  }
}

export const useAuthStore = create<AuthStore>((set) => ({
  user: null,
  token: readToken(),
  loading: false,
  error: null,

  clearError() {
    set({ error: null })
  },

  async login(username, password) {
    try {
      set({ loading: true, error: null })
      const session = await apiLogin(username, password)
      localStorage.setItem(AUTH_TOKEN_KEY, session.token)
      set({ token: session.token, user: session.user })
      return true
    } catch (caughtError) {
      set({ error: getErrorMessage(caughtError, '登录失败') })
      return false
    } finally {
      set({ loading: false })
    }
  },

  async register(username, password, displayName) {
    try {
      set({ loading: true, error: null })
      const session = await apiRegister(username, password, displayName)
      localStorage.setItem(AUTH_TOKEN_KEY, session.token)
      set({ token: session.token, user: session.user })
      return true
    } catch (caughtError) {
      set({ error: getErrorMessage(caughtError, '注册失败') })
      return false
    } finally {
      set({ loading: false })
    }
  },

  async loadSession() {
    const token = readToken()
    if (!token) {
      set({ user: null })
      return false
    }
    try {
      set({ loading: true, error: null })
      const user = await fetchCurrentUser()
      set({ user })
      return true
    } catch {
      localStorage.removeItem(AUTH_TOKEN_KEY)
      set({ token: null, user: null })
      return false
    } finally {
      set({ loading: false })
    }
  },

  async logout() {
    try {
      await apiLogout()
    } catch {
      // 忽略登出接口异常，本地会话照常清理
    }
    localStorage.removeItem(AUTH_TOKEN_KEY)
    set({ token: null, user: null })
  },
}))
