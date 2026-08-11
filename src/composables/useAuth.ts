import { reactive, computed } from 'vue'
import { API_BASE } from '../config-api'

const AUTH_STORAGE_KEY = 'kiana-auth-user'
const CUSTOMER_IDLE_TIMEOUT_MS = 60 * 60 * 1000
const INTERNAL_IDLE_TIMEOUT_MS = 30 * 60 * 1000
const ABSOLUTE_SESSION_TIMEOUT_MS = 12 * 60 * 60 * 1000
const EXPIRY_WARNING_MS = 5 * 60 * 1000
const ACTIVITY_WRITE_INTERVAL_MS = 30 * 1000

interface User {
  id: string
  name: string
  email: string
  isInternal?: boolean
  isAdmin?: boolean
}

interface StoredSession {
  user: User
  createdAt: number
  lastActiveAt: number
}

function idleTimeoutFor(user: User) {
  return user.isInternal || user.isAdmin ? INTERNAL_IDLE_TIMEOUT_MS : CUSTOMER_IDLE_TIMEOUT_MS
}

function isSessionValid(session: StoredSession, now = Date.now()) {
  return (
    now - session.createdAt < ABSOLUTE_SESSION_TIMEOUT_MS &&
    now - session.lastActiveAt < idleTimeoutFor(session.user)
  )
}

function loadStoredSession(): StoredSession | null {
  try {
    const raw = localStorage.getItem(AUTH_STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as StoredSession
    if (
      parsed?.user?.id &&
      parsed.user.name &&
      parsed.user.email &&
      Number.isFinite(parsed.createdAt) &&
      Number.isFinite(parsed.lastActiveAt) &&
      isSessionValid(parsed)
    ) {
      return parsed
    }
    localStorage.removeItem(AUTH_STORAGE_KEY)
  } catch {
    // ignore invalid or missing storage
  }
  return null
}

const storedSession = loadStoredSession()
const state = reactive<{
  user: User | null
  createdAt: number | null
  lastActiveAt: number | null
  expiresSoon: boolean
}>({
  user: storedSession?.user || null,
  createdAt: storedSession?.createdAt || null,
  lastActiveAt: storedSession?.lastActiveAt || null,
  expiresSoon: false,
})

function persistSession() {
  try {
    if (state.user && state.createdAt && state.lastActiveAt) {
      localStorage.setItem(
        AUTH_STORAGE_KEY,
        JSON.stringify({
          user: state.user,
          createdAt: state.createdAt,
          lastActiveAt: state.lastActiveAt,
        } satisfies StoredSession),
      )
    } else {
      localStorage.removeItem(AUTH_STORAGE_KEY)
    }
  } catch {
    // storage full or disabled
  }
}

function clearSession() {
  state.user = null
  state.createdAt = null
  state.lastActiveAt = null
  state.expiresSoon = false
  persistSession()
}

function checkSession(now = Date.now()) {
  if (!state.user || !state.createdAt || !state.lastActiveAt) return
  if (!isSessionValid({ user: state.user, createdAt: state.createdAt, lastActiveAt: state.lastActiveAt }, now)) {
    clearSession()
    return
  }
  const remaining = Math.min(
    state.createdAt + ABSOLUTE_SESSION_TIMEOUT_MS,
    state.lastActiveAt + idleTimeoutFor(state.user),
  ) - now
  state.expiresSoon = remaining <= EXPIRY_WARNING_MS
}

function recordActivity() {
  if (!state.user || !state.lastActiveAt) return
  const now = Date.now()
  checkSession(now)
  if (!state.user || !state.lastActiveAt || now - state.lastActiveAt < ACTIVITY_WRITE_INTERVAL_MS) return
  state.lastActiveAt = now
  persistSession()
  checkSession(now)
}

if (typeof window !== 'undefined') {
  const activityEvents: Array<keyof WindowEventMap> = ['pointerdown', 'keydown', 'scroll', 'touchstart']
  activityEvents.forEach((eventName) => window.addEventListener(eventName, recordActivity, { passive: true }))
  window.addEventListener('focus', recordActivity)
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') recordActivity()
  })
  window.setInterval(() => checkSession(), 30 * 1000)
  checkSession()
}

export function useAuth() {
  const isLoggedIn = computed(() => !!state.user)
  const isInternalUser = computed(() => Boolean(state.user?.isInternal || state.user?.isAdmin))
  const isAdminUser = computed(() => Boolean(state.user?.isAdmin))
  const user = computed(() => state.user)
  const sessionExpiresSoon = computed(() => state.expiresSoon)

  function setUser(userData: User | null, startNewSession = false) {
    if (!userData) {
      clearSession()
      return
    }
    const now = Date.now()
    state.user = userData
    if (startNewSession || !state.createdAt) state.createdAt = now
    if (startNewSession || !state.lastActiveAt) state.lastActiveAt = now
    state.expiresSoon = false
    persistSession()
  }

  async function signin(email: string, password?: string) {
    const res = await fetch(`${API_BASE}/api/account`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode: 'signin', email, password }),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(data?.message || 'Unable to sign in.')
    setUser(data.user, true)
    return data.user as User
  }

  async function signup(name: string, email: string, password?: string) {
    const res = await fetch(`${API_BASE}/api/account`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode: 'signup', name, email, password }),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(data?.message || 'Unable to sign up.')
    setUser(data.user, true)
    return data.user as User
  }

  async function requestPasswordReset(email: string) {
    const res = await fetch(`${API_BASE}/api/account`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode: 'reset-request', email }),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(data?.message || 'Unable to send reset link.')
    return data?.message as string
  }

  async function resetPassword(token: string, password: string) {
    const res = await fetch(`${API_BASE}/api/account`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode: 'reset-confirm', token, password }),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(data?.message || 'Unable to reset password.')
    return data?.message as string
  }

  async function changePassword(currentPassword: string, newPassword: string) {
    if (!state.user?.id) throw new Error('You must be signed in to change your password.')
    const res = await fetch(`${API_BASE}/api/account`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        mode: 'change-password',
        userId: state.user.id,
        currentPassword,
        newPassword,
      }),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(data?.message || 'Unable to change password.')
    return data?.message as string
  }

  async function refreshCurrentUser() {
    if (!state.user?.id) return null
    const res = await fetch(
      `${API_BASE}/api/account?mode=profile&userId=${encodeURIComponent(state.user.id)}`,
    )
    const data = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(data?.message || 'Unable to refresh account.')
    setUser(data.user)
    return data.user as User
  }

  // Backward-compatible alias for older calls.
  async function login(name: string, email: string) {
    if (name?.trim()) return signup(name, email)
    return signin(email)
  }

  function logout() {
    clearSession()
  }

  return { user, isLoggedIn, isInternalUser, isAdminUser, sessionExpiresSoon, login, signin, signup, requestPasswordReset, resetPassword, changePassword, refreshCurrentUser, logout, setUser }
}
