import { create } from 'zustand'
import { AUTH_TOKEN_KEY, LOCAL_OFFLINE_TOKEN } from '../../../shared/api/config'
import { fetchCurrentUser, getErrorMessage, login as apiLogin, logout as apiLogout, register as apiRegister } from '../../../shared/api'
import type { AuthStore } from './types'

// 本地离线用户映射到本机默认用户（与后端 authService.verifyToken 一致），数据存本机数据库
const LOCAL_OFFLINE_USER = { id: 1, name: '本地离线用户' }

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

  loginLocal() {
    localStorage.setItem(AUTH_TOKEN_KEY, LOCAL_OFFLINE_TOKEN)
    set({ token: LOCAL_OFFLINE_TOKEN, user: LOCAL_OFFLINE_USER, error: null, loading: false })
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
    if (token === LOCAL_OFFLINE_TOKEN) {
      // 本地离线用户：不请求后端，直接放行
      set({ user: LOCAL_OFFLINE_USER, token })
      return true
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
