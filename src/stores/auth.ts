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

  async function loadTeams() {
    try {
      const myTeams = await mmApi.getMyTeams()
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

  async function logout() {
    try {
      await mmApi.logout()
    } catch {}
    mmWs.disconnect()
    currentUser.value = null
    token.value = null
    teams.value = []
    currentTeam.value = null
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
    error,
    isAuthenticated,
    setBaseUrl,
    login,
    logout,
    loadTeams,
    selectTeam,
    initAuth
  }
})
