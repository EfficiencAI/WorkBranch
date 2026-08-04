import type { UserStore } from './types'

export const selectUserProfile = (state: UserStore) => state.profile
export const selectUserLoading = (state: UserStore) => state.loading
export const selectUserError = (state: UserStore) => state.error
export const selectUpdateUserNamePending = (state: UserStore) => state.updateNamePending
