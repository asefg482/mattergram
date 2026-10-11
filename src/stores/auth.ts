import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { mmApi } from '../services/mattermostApi'
import { mmWs } from '../services/mattermostWs'
import type { MattermostUser, MattermostTeam } from '../types/mattermost'

export const useAuthStore = defineStore('auth', () => {
  const currentUser = ref<MattermostUser | null>(null)
  const token = ref<string | null>(mmApi.getToken())
  const baseUrl = ref<string>(mmApi.getBaseUrl())
  const teams = ref<MattermostTeam[]>([])
  const currentTeam = ref<MattermostTeam | null>(null)
  const isLoading = ref(false)
  const error = ref<string | null>(null)

  const isAuthenticated = computed(() => !!token.value && !!currentUser.value)

  function setBaseUrl(url: string) {
    baseUrl.value = url.trim().replace(/\/+$/, '')
    mmApi.setBaseUrl(baseUrl.value)
  }

  async function login(loginId: string, pass: string) {
    isLoading.value = true
    error.value = null
    try {
      const res = await mmApi.login(loginId, pass)
      currentUser.value = res.user
      token.value = res.token

      // Load teams
      await loadTeams()

      // Connect WebSocket
      mmWs.connect(res.token)

      return res
    } catch (err: any) {
      error.value = err.message || 'Login failed'
      throw err
    } finally {
      isLoading.value = false
    }
  }

  async function register(payload: {
    email: string
    username: string
    password: string
    first_name?: string
    last_name?: string
    nickname?: string
  }) {
    isLoading.value = true
    error.value = null
    try {
      const user = await mmApi.register(payload)
      // Automatically log the user in after successful registration
      await login(payload.username || payload.email, payload.password)
      return user
    } catch (err: any) {
      error.value = err.message || 'Registration failed'
      throw err
    } finally {
      isLoading.value = false
    }
  }

  async function loadTeams() {
    try {
      let myTeams = await mmApi.getMyTeams()
      if (myTeams.length === 0) {
        // If the user has no teams, attempt to find open teams to join
        try {
          const openTeams = await mmApi.getOpenTeams()
          if (openTeams.length > 0 && currentUser.value) {
            await mmApi.addUserToTeam(openTeams[0].id, currentUser.value.id)
            myTeams = await mmApi.getMyTeams()
          }
        } catch (teamErr) {
          console.warn('Could not auto-join open team:', teamErr)
        }
      }
      teams.value = myTeams
      if (myTeams.length > 0) {
        currentTeam.value = myTeams[0]
      }
    } catch (err: any) {
      console.error('Failed to load teams:', err)
    }
  }

  function selectTeam(team: MattermostTeam) {
    currentTeam.value = team
  }

  const isLoggingOut = ref(false)

  async function logout() {
    isLoggingOut.value = true
    try {
      await mmApi.logout()
    } catch (err) {
      console.error('Logout error:', err)
    } finally {
      mmWs.disconnect()
      currentUser.value = null
      token.value = null
      teams.value = []
      currentTeam.value = null
      isLoggingOut.value = false
    }
  }

  async function initAuth() {
    if (!token.value) return
    isLoading.value = true
    try {
      const user = await mmApi.getMe()
      currentUser.value = user
      await loadTeams()
      mmWs.connect(token.value)
    } catch (err) {
      console.warn('Session expired or invalid, logging out:', err)
      await logout()
    } finally {
      isLoading.value = false
    }
  }

  return {
    currentUser,
    token,
    baseUrl,
    teams,
    currentTeam,
    isLoading,
    isLoggingOut,
    error,
    isAuthenticated,
    setBaseUrl,
    login,
    register,
    logout,
    loadTeams,
    selectTeam,
    initAuth
  }
})
