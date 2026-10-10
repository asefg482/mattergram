<script setup lang="ts">
import { ref } from 'vue'
import { useAuthStore } from '../../stores/auth'
import { useChatStore } from '../../stores/chat'
import { useUsersStore } from '../../stores/users'
import { getAvatarGradient, getInitials } from '../../utils/formatters'
import type { MattermostUser } from '../../types/mattermost'
import { X, Search, UserPlus, Hash, Lock, Loader2 } from 'lucide-vue-next'
import TelegramAvatar from '../common/TelegramAvatar.vue'

const props = defineProps<{
  isOpen: boolean
}>()

const emit = defineEmits<{
  (e: 'close'): void
}>()

const authStore = useAuthStore()
const chatStore = useChatStore()
const usersStore = useUsersStore()

const activeTab = ref<'dm' | 'channel'>('dm')

// DM State
const searchQuery = ref('')
const searchResults = ref<MattermostUser[]>([])
const isSearching = ref(false)

// Channel State
const channelName = ref('')
const channelDisplayName = ref('')
const channelPurpose = ref('')
const channelType = ref<'O' | 'P'>('O')
const isCreatingChannel = ref(false)
const createError = ref<string | null>(null)

async function handleSearch() {
  if (!searchQuery.value.trim()) {
    searchResults.value = []
    return
  }
  isSearching.value = true
  try {
    const res = await usersStore.searchUsers(searchQuery.value.trim(), authStore.currentTeam?.id)
    // Exclude current user
    searchResults.value = res.filter((u) => u.id !== authStore.currentUser?.id)
  } catch (err) {
    console.error('Search users error:', err)
  } finally {
    isSearching.value = false
  }
}

async function startDirectChat(user: MattermostUser) {
  emit('close')
  await chatStore.openDirectMessage(user.id)
}

async function handleSearchEnter(e: KeyboardEvent) {
  e.preventDefault()
  if (searchResults.value.length > 0) {
    await startDirectChat(searchResults.value[0])
  }
}

async function handleCreateChannel() {
  if (!channelDisplayName.value.trim()) return
  isCreatingChannel.value = true
  createError.value = null
  try {
    const rawName = channelName.value.trim() || channelDisplayName.value.trim().toLowerCase().replace(/[^a-z0-9_-]/g, '-')
    await chatStore.createNewChannel(rawName, channelDisplayName.value.trim(), channelType.value, channelPurpose.value.trim())
    emit('close')
  } catch (err: any) {
    createError.value = err.message || 'Failed to create channel'
  } finally {
    isCreatingChannel.value = false
  }
}
</script>

<template>
  <div v-if="isOpen" class="fixed inset-0 z-50 flex items-center justify-center p-4">
    <!-- Backdrop -->
    <div @click="emit('close')" class="absolute inset-0 bg-black/60 backdrop-blur-xs"></div>

    <!-- Modal Content -->
    <div class="relative w-full max-w-md bg-[#17212b] dark:bg-[#17212b] bg-white rounded-2xl shadow-2xl border border-[#202b36] overflow-hidden flex flex-col max-h-[85vh]">
      <!-- Header -->
      <div class="px-5 py-4 border-b border-[#202b36] flex items-center justify-between">
        <h2 class="text-base font-bold text-white dark:text-white text-gray-900">
          {{ activeTab === 'dm' ? 'New Message' : 'New Channel' }}
        </h2>
        <button @click="emit('close')" class="p-1 text-[#7f91a4] hover:text-white rounded-lg transition-colors">
          <X class="w-5 h-5" />
        </button>
      </div>

      <!-- Tabs -->
      <div class="flex border-b border-[#202b36] bg-[#0e1621]/40">
        <button
          @click="activeTab = 'dm'"
          class="flex-1 py-3 text-xs font-semibold text-center border-b-2 transition-all flex items-center justify-center gap-1.5"
          :class="activeTab === 'dm' ? 'border-[#3390ec] text-[#3390ec]' : 'border-transparent text-[#7f91a4] hover:text-white'"
        >
          <UserPlus class="w-4 h-4" />
          <span>Direct Message</span>
        </button>
        <button
          @click="activeTab = 'channel'"
          class="flex-1 py-3 text-xs font-semibold text-center border-b-2 transition-all flex items-center justify-center gap-1.5"
          :class="activeTab === 'channel' ? 'border-[#3390ec] text-[#3390ec]' : 'border-transparent text-[#7f91a4] hover:text-white'"
        >
          <Hash class="w-4 h-4" />
          <span>New Channel</span>
        </button>
      </div>

      <!-- Tab 1: New DM -->
      <div v-if="activeTab === 'dm'" class="p-4 flex-1 overflow-y-auto space-y-4">
        <!-- Search Input -->
        <div class="relative">
          <Search class="w-4 h-4 text-[#7f91a4] absolute left-3 top-3" />
          <input
            v-model="searchQuery"
            @input="handleSearch"
            @keydown.enter="handleSearchEnter"
            type="text"
            placeholder="Search by username, name, or email..."
            class="w-full bg-[#0e1621] border border-[#202b36] text-white text-sm rounded-xl pl-9 pr-4 py-2.5 outline-none focus:border-[#3390ec]"
          />
        </div>

        <!-- Search Results List -->
        <div class="space-y-1">
          <div v-if="isSearching" class="text-center py-6 text-xs text-[#7f91a4] flex items-center justify-center gap-2">
            <Loader2 class="w-4 h-4 animate-spin text-[#3390ec]" />
            <span>Searching users...</span>
          </div>

          <div v-else-if="searchResults.length === 0 && searchQuery" class="text-center py-6 text-xs text-[#7f91a4]">
            No users found matching "{{ searchQuery }}"
          </div>

          <div
            v-for="user in searchResults"
            :key="user.id"
            @click="startDirectChat(user)"
            class="flex items-center gap-3 p-2.5 rounded-xl hover:bg-[#202b36] cursor-pointer transition-colors"
          >
            <!-- Avatar -->
            <TelegramAvatar
              :userId="user.id"
              :name="usersStore.getUserDisplayName(user)"
              size="md"
              :lastPictureUpdate="(user as any)?.last_picture_update"
            />
            <!-- Details -->
            <div class="flex-1 min-w-0">
              <h4 class="text-sm font-semibold text-white truncate">
                {{ usersStore.getUserDisplayName(user) }}
              </h4>
              <p class="text-xs text-[#7f91a4] truncate">@{{ user.username }} • {{ user.email }}</p>
            </div>
          </div>
        </div>
      </div>

      <!-- Tab 2: New Channel -->
      <form v-else @submit.prevent="handleCreateChannel" class="p-4 space-y-4 flex-1 overflow-y-auto">
        <div v-if="createError" class="p-2.5 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-xs">
          {{ createError }}
        </div>

        <!-- Display Name -->
        <div>
          <label class="block text-xs font-medium text-[#7f91a4] mb-1">Channel Name</label>
          <input
            v-model="channelDisplayName"
            type="text"
            required
            placeholder="e.g. Announcements, Project Delta"
            class="w-full bg-[#0e1621] border border-[#202b36] text-white text-sm rounded-xl px-3.5 py-2.5 outline-none focus:border-[#3390ec]"
          />
        </div>

        <!-- Channel Type -->
        <div>
          <label class="block text-xs font-medium text-[#7f91a4] mb-1.5">Channel Type</label>
          <div class="grid grid-cols-2 gap-2">
            <button
              type="button"
              @click="channelType = 'O'"
              class="p-3 rounded-xl border text-left flex items-center gap-2.5 transition-all"
              :class="channelType === 'O' ? 'border-[#3390ec] bg-[#3390ec]/10 text-white' : 'border-[#202b36] text-[#7f91a4] hover:border-gray-600'"
            >
              <Hash class="w-4 h-4 text-[#3390ec]" />
              <div>
                <div class="text-xs font-semibold text-white">Public</div>
                <div class="text-[10px] text-[#7f91a4]">Anyone can join</div>
              </div>
            </button>

            <button
              type="button"
              @click="channelType = 'P'"
              class="p-3 rounded-xl border text-left flex items-center gap-2.5 transition-all"
              :class="channelType === 'P' ? 'border-[#3390ec] bg-[#3390ec]/10 text-white' : 'border-[#202b36] text-[#7f91a4] hover:border-gray-600'"
            >
              <Lock class="w-4 h-4 text-amber-400" />
              <div>
                <div class="text-xs font-semibold text-white">Private</div>
                <div class="text-[10px] text-[#7f91a4]">By invite only</div>
              </div>
            </button>
          </div>
        </div>

        <!-- Purpose / Description -->
        <div>
          <label class="block text-xs font-medium text-[#7f91a4] mb-1">Description (Optional)</label>
          <textarea
            v-model="channelPurpose"
            rows="2"
            placeholder="What is this channel about?"
            class="w-full bg-[#0e1621] border border-[#202b36] text-white text-sm rounded-xl px-3.5 py-2 outline-none focus:border-[#3390ec] resize-none"
          ></textarea>
        </div>

        <!-- Submit Button -->
        <button
          type="submit"
          :disabled="isCreatingChannel"
          class="w-full py-2.5 bg-[#3390ec] hover:bg-[#2481cc] text-white font-medium text-sm rounded-xl shadow flex items-center justify-center gap-2 transition-all disabled:opacity-50"
        >
          <Loader2 v-if="isCreatingChannel" class="w-4 h-4 animate-spin" />
          <span>{{ isCreatingChannel ? 'Creating...' : 'Create Channel' }}</span>
        </button>
      </form>
    </div>
  </div>
</template>
