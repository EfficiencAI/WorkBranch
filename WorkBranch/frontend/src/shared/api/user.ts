import type { UserProfile } from '../../entities'
import { get, put } from './http'

function toUserProfile(payload: Record<string, unknown>): UserProfile {
  return {
    id: String(payload.id ?? ''),
    name: payload.name ? String(payload.name) : undefined,
  }
}

export async function fetchUserProfile() {
  const data = await get<Record<string, unknown>>('/api/user/profile')
  return toUserProfile(data)
}

export async function updateUserName(name: string) {
  const data = await put<Record<string, unknown>, { name: string }>('/api/user/profile/name', {
    name,
  })
  return toUserProfile(data)
}
