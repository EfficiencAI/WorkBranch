import { create } from 'zustand'
import { fetchUserProfile, getErrorMessage, updateUserName } from '../../../shared/api'
import type { UserStore } from './types'

export const useUserStore = create<UserStore>((set) => ({
  profile: null,
  loading: false,
  error: null,
  updateNamePending: false,

  clearError() {
    set({ error: null })
  },

  resetUserState() {
    set({ profile: null, loading: false, error: null, updateNamePending: false })
  },

  async loadProfile() {
    try {
      set({ loading: true, error: null })
      const profile = await fetchUserProfile()
      set({ profile })
      return profile
    } catch (caughtError) {
      set({ error: getErrorMessage(caughtError, '用户信息加载失败') })
      return null
    } finally {
      set({ loading: false })
    }
  },

  async updateProfileName(name: string) {
    try {
      set({ updateNamePending: true, error: null })
      const profile = await updateUserName(name)
      set({ profile })
      return profile
    } catch (caughtError) {
      set({ error: getErrorMessage(caughtError, '用户名保存失败') })
      return null
    } finally {
      set({ updateNamePending: false })
    }
  },
}))
