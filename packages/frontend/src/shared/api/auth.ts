import type { AuthSession, AuthUser } from '../../entities'
import { get, post } from './http'

export function register(username: string, password: string, displayName?: string) {
  return post<AuthSession, { username: string; password: string; display_name?: string }>(
    '/api/auth/register',
    { username, password, display_name: displayName },
  )
}

export function login(username: string, password: string) {
  return post<AuthSession, { username: string; password: string }>('/api/auth/login', { username, password })
}

export function logout() {
  return post<null>('/api/auth/logout')
}

export function fetchCurrentUser() {
  return get<AuthUser>('/api/auth/me')
}
