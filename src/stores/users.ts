import { defineStore } from 'pinia'
import { ref } from 'vue'
import { mmApi } from '../services/mattermostApi'
import { mmWs } from '../services/mattermostWs'
import type { MattermostUser, UserStatus } from '../types/mattermost'

export const useUsersStore = defineStore('users', () => {
  const users = ref<Record<string, MattermostUser>>({})
  const statuses = ref<Record<string, UserStatus['status']>>({})

  function initWs() {
    mmWs.on('status_change', (event) => {
      const { user_id, status } = event.data || {}
      if (user_id && status) {
        statuses.value[user_id] = status
      }
    })
  }

  async function fetchUsers(userIds: string[]) {
    const missing = userIds.filter((id) => !users.value[id] && id)
    if (!missing.length) return

    try {
      const fetched = await mmApi.getUsersByIds(missing)
      for (const u of fetched) {
        users.value[u.id] = u
      }
      await fetchStatuses(missing)
    } catch (err) {
      console.error('Failed to fetch users:', err)
    }
  }

  async function fetchStatuses(userIds: string[]) {
    const validIds = userIds.filter(Boolean)
    if (!validIds.length) return
    try {
      const res = await mmApi.getUsersStatuses(validIds)
      for (const s of res) {
        statuses.value[s.user_id] = s.status
      }
    } catch (err) {
      console.error('Failed to fetch user statuses:', err)
    }
  }

  function getUser(userId: string): MattermostUser | undefined {
    return users.value[userId]
  }

  function getStatus(userId: string): UserStatus['status'] {
    return statuses.value[userId] || 'offline'
  }

  function getUserDisplayName(userOrId?: MattermostUser | string): string {
    if (!userOrId) return 'Unknown'
    const user = typeof userOrId === 'string' ? users.value[userOrId] : userOrId
    if (!user) return typeof userOrId === 'string' ? userOrId : 'Unknown'

    if (user.first_name && user.last_name) {
      return `${user.first_name} ${user.last_name}`
    }
    if (user.nickname) {
      return user.nickname
    }
    return user.username || user.email || 'User'
  }

  async function searchUsers(term: string, teamId?: string) {
    return mmApi.searchUsers(term, teamId)
  }

  return {
    users,
    statuses,
    initWs,
    fetchUsers,
    fetchStatuses,
    getUser,
    getStatus,
    getUserDisplayName,
    searchUsers
  }
})
