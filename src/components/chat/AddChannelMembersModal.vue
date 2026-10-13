<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { useAuthStore } from '../../stores/auth'
import { useChatStore } from '../../stores/chat'
import { useUsersStore } from '../../stores/users'
import { mmApi } from '../../services/mattermostApi'
import { notificationService } from '../../services/notifications'
import type { MattermostChannel, MattermostUser } from '../../types/mattermost'
import { X, Search, UserPlus, Check, Loader2, Users } from 'lucide-vue-next'
import TelegramAvatar from '../common/TelegramAvatar.vue'

const props = defineProps<{
  isOpen: boolean
  channel: MattermostChannel | null
  existingMemberUserIds?: string[]
}>()

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'added', userIds: string[]): void
}>()

const authStore = useAuthStore()
const chatStore = useChatStore()
const usersStore = useUsersStore()

const searchQuery = ref('')
const availableUsers = ref<MattermostUser[]>([])
const selectedUserIds = ref<string[]>([])
const isLoading = ref(false)
const isSubmitting = ref(false)
let searchTimeout: any = null

const existingSet = computed(() => {
  return new Set(props.existingMemberUserIds || [])
})

// Filtered list of candidate users (excluding existing members & current user)
const displayUsers = computed(() => {
  return availableUsers.value.filter((u) => !existingSet.value.has(u.id))
})

const selectedUsers = computed(() => {
  return selectedUserIds.value
    .map((id) => usersStore.getUser(id) || availableUsers.value.find((u) => u.id === id))
    .filter(Boolean) as MattermostUser[]
})

async function loadInitialUsers() {
  if (!props.channel) return
  isLoading.value = true
  try {
    const teamId = props.channel.team_id || authStore.currentTeam?.id
    // First try getting users not in channel from server
    let users: MattermostUser[] = []
    try {
      users = await mmApi.getUsersNotInChannel(props.channel.id, teamId, 0, 60)
    } catch {
      // Fallback: get team users
      if (teamId) {
        users = await mmApi.getTeamUsers(teamId, 0, 60)
      }
    }

    if (Array.isArray(users)) {
      // Cache users in usersStore
      for (const u of users) {
        usersStore.users[u.id] = u
      }
      usersStore.fetchStatuses(users.map((u) => u.id))
      availableUsers.value = users.filter((u) => u.id !== authStore.currentUser?.id)
    }
  } catch (err) {
    console.error('Failed to load candidate users:', err)
  } finally {
    isLoading.value = false
  }
}

async function handleSearch() {
  clearTimeout(searchTimeout)
  searchTimeout = setTimeout(async () => {
    const q = searchQuery.value.trim()
    if (!q) {
      loadInitialUsers()
      return
    }

    isLoading.value = true
    try {
      const teamId = props.channel?.team_id || authStore.currentTeam?.id
      const results = await usersStore.searchUsers(q, teamId, props.channel?.id)
      for (const u of results) {
        usersStore.users[u.id] = u
      }
      usersStore.fetchStatuses(results.map((u) => u.id))
      availableUsers.value = results.filter((u) => u.id !== authStore.currentUser?.id)
    } catch (err) {
      console.error('Search candidate users error:', err)
    } finally {
      isLoading.value = false
    }
  }, 250)
}

function toggleUser(userId: string) {
  const index = selectedUserIds.value.indexOf(userId)
  if (index > -1) {
    selectedUserIds.value.splice(index, 1)
  } else {
    selectedUserIds.value.push(userId)
  }
}

function removeSelected(userId: string) {
  const index = selectedUserIds.value.indexOf(userId)
  if (index > -1) {
    selectedUserIds.value.splice(index, 1)
  }
}

async function handleAddMembers() {
  if (!props.channel || selectedUserIds.value.length === 0 || isSubmitting.value) return

  isSubmitting.value = true
  const channelId = props.channel.id
  const toAdd = [...selectedUserIds.value]

  let successCount = 0
  let failCount = 0

  for (const uid of toAdd) {
    try {
      await chatStore.addMemberToChannel(channelId, uid)
      successCount++
    } catch (err: any) {
      console.error(`Failed to add user ${uid} to channel:`, err)
      failCount++
    }
  }

  isSubmitting.value = false

  if (successCount > 0) {
    notificationService.showToast({
      message: `${successCount} member${successCount > 1 ? 's' : ''} added to ${props.channel.display_name || props.channel.name}`
    })
    emit('added', toAdd)
    emit('close')
  } else if (failCount > 0) {
    notificationService.showToast({
      message: 'Failed to add members. Please check channel permissions.'
    })
  }
}

watch(
  () => props.isOpen,
  (open) => {
    if (open) {
      searchQuery.value = ''
      selectedUserIds.value = []
      loadInitialUsers()
    }
  },
  { immediate: true }
)
</script>

<template>
  <div
    v-if="isOpen && channel"
    class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs animate-in fade-in duration-200"
    @click.self="emit('close')"
  >
    <div
      class="bg-white dark:bg-[#17212b] border border-[#dfe1e5] dark:border-[#202b36] rounded-2xl w-full max-w-md shadow-2xl flex flex-col max-h-[85vh] overflow-hidden"
    >
      <!-- Modal Header -->
      <div class="p-4 border-b border-[#dfe1e5] dark:border-[#202b36] flex items-center justify-between">
        <div class="flex items-center gap-2">
          <div class="w-8 h-8 rounded-full bg-[#3390ec]/15 flex items-center justify-center text-[#3390ec]">
            <UserPlus class="w-4 h-4" />
          </div>
          <div>
            <h3 class="font-bold text-sm text-[#111827] dark:text-white leading-tight">
              Add Members
            </h3>
            <p class="text-[11px] text-[#7f91a4] truncate max-w-[240px]">
              to {{ channel.display_name || channel.name }}
            </p>
          </div>
        </div>
        <button
          @click="emit('close')"
          class="p-1.5 text-[#7f91a4] hover:text-[#111827] dark:hover:text-white hover:bg-[#f1f1f1] dark:hover:bg-[#202b36] rounded-full transition-colors cursor-pointer"
        >
          <X class="w-4 h-4" />
        </button>
      </div>

      <!-- Search Input -->
      <div class="p-3 border-b border-[#dfe1e5] dark:border-[#202b36]">
        <div class="relative">
          <Search class="w-4 h-4 text-[#7f91a4] absolute left-3 top-2.5 pointer-events-none" />
          <input
            v-model="searchQuery"
            @input="handleSearch"
            type="text"
            placeholder="Search users to add..."
            class="w-full bg-[#f1f1f1] dark:bg-[#202b36] border-none text-[#111827] dark:text-white text-xs rounded-xl pl-9 pr-8 py-2 outline-none focus:ring-1 focus:ring-[#3390ec]"
          />
          <button
            v-if="searchQuery"
            @click="searchQuery = ''; handleSearch()"
            class="p-1 absolute right-2 top-1.5 text-[#7f91a4] hover:text-white"
          >
            <X class="w-3.5 h-3.5" />
          </button>
        </div>

        <!-- Selected User Chips -->
        <div v-if="selectedUsers.length > 0" class="flex flex-wrap gap-1.5 mt-2.5 max-h-20 overflow-y-auto no-scrollbar">
          <div
            v-for="user in selectedUsers"
            :key="user.id"
            class="flex items-center gap-1.5 pl-1.5 pr-2 py-0.5 rounded-full bg-[#3390ec]/15 text-[#3390ec] text-xs font-medium"
          >
            <TelegramAvatar
              :userId="user.id"
              :name="usersStore.getUserDisplayName(user)"
              size="xs"
              :lastPictureUpdate="(user as any)?.last_picture_update"
            />
            <span class="truncate max-w-[100px]">{{ usersStore.getUserDisplayName(user) }}</span>
            <button
              @click.stop="removeSelected(user.id)"
              class="hover:text-red-400 p-0.5 rounded-full transition-colors cursor-pointer"
            >
              <X class="w-3 h-3" />
            </button>
          </div>
        </div>
      </div>

      <!-- Users List -->
      <div class="flex-1 overflow-y-auto p-2 min-h-[220px] max-h-[360px]">
        <div v-if="isLoading" class="flex flex-col items-center justify-center h-48 gap-2 text-xs text-[#7f91a4]">
          <Loader2 class="w-5 h-5 animate-spin text-[#3390ec]" />
          <span>Loading candidate members...</span>
        </div>

        <div v-else-if="displayUsers.length === 0" class="flex flex-col items-center justify-center h-48 gap-2 text-xs text-[#7f91a4] text-center px-4">
          <Users class="w-8 h-8 opacity-40" />
          <span v-if="searchQuery">No users found matching "{{ searchQuery }}"</span>
          <span v-else>All workspace members are already in this channel.</span>
        </div>

        <div v-else class="space-y-1">
          <div
            v-for="user in displayUsers"
            :key="user.id"
            @click="toggleUser(user.id)"
            class="flex items-center gap-3 p-2 rounded-xl hover:bg-[#f1f1f1] dark:hover:bg-[#202b36] cursor-pointer transition-colors"
          >
            <!-- Checkbox -->
            <div
              class="w-5 h-5 rounded-md border flex items-center justify-center transition-colors shrink-0"
              :class="[
                selectedUserIds.includes(user.id)
                  ? 'bg-[#3390ec] border-[#3390ec] text-white'
                  : 'border-[#dfe1e5] dark:border-[#202b36] bg-transparent'
              ]"
            >
              <Check v-if="selectedUserIds.includes(user.id)" class="w-3.5 h-3.5 stroke-[3]" />
            </div>

            <!-- Avatar -->
            <TelegramAvatar
              :userId="user.id"
              :name="usersStore.getUserDisplayName(user)"
              size="sm"
              :showOnlineDot="true"
              :isOnline="usersStore.getStatus(user.id) === 'online'"
              :lastPictureUpdate="(user as any)?.last_picture_update"
            />

            <!-- User Info -->
            <div class="flex-1 min-w-0">
              <div class="text-xs font-semibold text-gray-900 dark:text-white truncate">
                {{ usersStore.getUserDisplayName(user) }}
              </div>
              <div class="text-[11px] text-[#7f91a4] truncate">
                @{{ user.username }} &bull; {{ usersStore.getStatus(user.id) }}
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Modal Footer -->
      <div class="p-3 border-t border-[#dfe1e5] dark:border-[#202b36] flex items-center justify-between gap-3 bg-gray-50/50 dark:bg-[#101921]/50">
        <span class="text-xs text-[#7f91a4]">
          <span v-if="selectedUserIds.length > 0" class="font-semibold text-[#3390ec]">
            {{ selectedUserIds.length }}
          </span>
          <span v-else>0</span>
          selected
        </span>

        <div class="flex items-center gap-2">
          <button
            @click="emit('close')"
            class="px-3.5 py-1.5 text-xs text-[#7f91a4] hover:text-[#111827] dark:hover:text-white rounded-xl transition-colors cursor-pointer"
          >
            Cancel
          </button>
          <button
            @click="handleAddMembers"
            :disabled="selectedUserIds.length === 0 || isSubmitting"
            class="flex items-center gap-1.5 px-4 py-1.5 text-xs font-medium bg-[#3390ec] text-white rounded-xl hover:bg-[#2883dc] disabled:opacity-50 disabled:pointer-events-none transition-colors shadow-xs cursor-pointer"
          >
            <Loader2 v-if="isSubmitting" class="w-3.5 h-3.5 animate-spin" />
            <span>Add to Channel</span>
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
