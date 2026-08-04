import type { UserProfile } from '../../../entities'

export type UserState = {
  profile: UserProfile | null
  loading: boolean
  error: string | null
  updateNamePending: boolean
}

export type UserActions = {
  loadProfile: () => Promise<UserProfile | null>
  updateProfileName: (name: string) => Promise<UserProfile | null>
  clearError: () => void
  resetUserState: () => void
}

export type UserStore = UserState & UserActions
