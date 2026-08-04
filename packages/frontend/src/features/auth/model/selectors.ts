import type { AuthStore } from './types'

export const selectAuthUser = (state: AuthStore) => state.user
export const selectAuthToken = (state: AuthStore) => state.token
export const selectAuthLoading = (state: AuthStore) => state.loading
export const selectAuthError = (state: AuthStore) => state.error
