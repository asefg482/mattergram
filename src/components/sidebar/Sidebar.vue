<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '../../stores/auth'
import { useChatStore } from '../../stores/chat'
import { useUiStore } from '../../stores/ui'
import { useUsersStore } from '../../stores/users'
import { mmApi } from '../../services/mattermostApi'
import FolderTabs from './FolderTabs.vue'
import TodoSidebarPanel from '../todo/TodoSidebarPanel.vue'
import ChatListItem from './ChatListItem.vue'
import DrawerMenu from './DrawerMenu.vue'
import NewChatModal from './NewChatModal.vue'
import ChatContextMenu from './ChatContextMenu.vue'
import TelegramAvatar from '../common/TelegramAvatar.vue'
import type { MattermostChannel, MattermostUser } from '../../types/mattermost'
import { notificationService } from '../../services/notifications'
import { Menu, Search, X, Edit3, Loader2, Bell, Hash, Globe, Users } from 'lucide-vue-next'

const router = useRouter()
const authStore = useAuthStore()
const chatStore = useChatStore()
const uiStore = useUiStore()
const usersStore = useUsersStore()

const isDrawerOpen = ref(false)
const searchInputRef = ref<HTMLInputElement | null>(null)

// Server Search State
const isSearchingServer = ref(false)
const globalUsers = ref<MattermostUser[]>([])
const globalChannels = ref<MattermostChannel[]>([])
const selectedSearchIndex = ref(0)
const pendingEnter = ref(false)
let searchDebounceTimer: any = null

// Chat Context Menu State
const contextChannel = ref<MattermostChannel | null>(null)
const contextPos = ref({ x: 0, y: 0 })
const showChatContextMenu = ref(false)

function onChatContextMenu(e: MouseEvent, channel: MattermostChannel) {
  contextChannel.value = channel
  contextPos.value = { x: e.clientX, y: e.clientY }
  showChatContextMenu.value = true
}

const bannerDismissed = ref(false)
const showNotificationBanner = computed(() => {
  return (
    notificationService.isSupported() &&
    notificationService.permission.value === 'default' &&
    !bannerDismissed.value
  )
})

async function enableNotifications() {
  const granted = await notificationService.requestPermission()
  if (granted) {
    notificationService.setEnabled(true)
  }
}

function dismissNotificationBanner() {
  bannerDismissed.value = true
}

// Filter chats based on activeTab and searchQuery
const filteredChannels = computed(() => {
  const query = uiStore.searchQuery.trim().toLowerCase()
  if (query) {
    const cleanQ = query.replace(/^@/, '')
    return chatStore.channels.filter((c) => {
      const matchName = c.name?.toLowerCase().includes(cleanQ)
      const matchDisplayName = c.display_name?.toLowerCase().includes(cleanQ)
      const matchPurpose = c.purpose?.toLowerCase().includes(cleanQ)
      const matchUsername = c.dm_user?.username?.toLowerCase().includes(cleanQ)
      const matchFirstName = c.dm_user?.first_name?.toLowerCase().includes(cleanQ)
      const matchLastName = c.dm_user?.last_name?.toLowerCase().includes(cleanQ)
      const matchNickname = c.dm_user?.nickname?.toLowerCase().includes(cleanQ)
      return matchName || matchDisplayName || matchPurpose || matchUsername || matchFirstName || matchLastName || matchNickname
    })
  }

  let list = chatStore.channels

  // Filter by Tab when not searching
  if (uiStore.activeTab === 'channels') {
    list = list.filter((c) => c.type !== 'D')
  } else if (uiStore.activeTab === 'direct') {
    list = list.filter((c) => c.type === 'D')
  } else if (uiStore.activeTab === 'unread') {
    list = list.filter((c) => (chatStore.unreadCounts[c.id] || 0) > 0)
  }

  return list
})

// Debounced Server Search
watch(
  () => uiStore.searchQuery,
  (newVal) => {
    selectedSearchIndex.value = 0
    if (searchDebounceTimer) {
      clearTimeout(searchDebounceTimer)
      searchDebounceTimer = null
    }

    const term = newVal.trim()
    if (!term) {
      globalUsers.value = []
      globalChannels.value = []
      isSearchingServer.value = false
      pendingEnter.value = false
      return
    }

    searchDebounceTimer = setTimeout(() => {
      executeServerSearch(term)
    }, 200)
  }
)

async function executeServerSearch(term: string) {
  if (!term) return
  isSearchingServer.value = true
  const cleanTerm = term.replace(/^@/, '')
  const teamId = authStore.currentTeam?.id
  const myId = authStore.currentUser?.id

  try {
    const [usersRes, channelsRes] = await Promise.allSettled([
      usersStore.searchUsers(cleanTerm, teamId),
      teamId ? mmApi.searchChannels(teamId, cleanTerm) : Promise.resolve([])
    ])

    const foundUsers: MattermostUser[] = usersRes.status === 'fulfilled' ? usersRes.value : []
    const foundChannels: MattermostChannel[] = channelsRes.status === 'fulfilled' ? channelsRes.value : []

    // Exclude self and users who already have active DM in channel list
    const existingDmUserIds = new Set(
      chatStore.channels
        .filter((c) => c.type === 'D' && c.dm_user)
        .map((c) => c.dm_user!.id)
    )
    globalUsers.value = foundUsers.filter((u) => u.id !== myId && !existingDmUserIds.has(u.id))

    // Exclude channels already in joined list
    const existingChannelIds = new Set(chatStore.channels.map((c) => c.id))
    globalChannels.value = foundChannels.filter((c) => !existingChannelIds.has(c.id))

    // If user hit Enter while search was running
    if (pendingEnter.value) {
      pendingEnter.value = false
      await navigateToFirstResult()
    }
  } catch (err) {
    console.error('Failed to execute server search:', err)
  } finally {
    isSearchingServer.value = false
  }
}

async function navigateToFirstResult() {
  if (filteredChannels.value.length > 0) {
    handleSelectChat(filteredChannels.value[0].id)
    finishSearch()
    return
  }
  if (globalChannels.value.length > 0) {
    await chatStore.openOrJoinChannel(globalChannels.value[0])
    finishSearch()
    return
  }
  if (globalUsers.value.length > 0) {
    await chatStore.openDirectMessage(globalUsers.value[0].id)
    finishSearch()
    return
  }
}

// Keyboard Enter: navigate to first matching item immediately
async function handleSearchEnter(e?: KeyboardEvent) {
  if (e) e.preventDefault()
  const q = uiStore.searchQuery.trim()
  if (!q) return

  const total = filteredChannels.value.length + globalChannels.value.length + globalUsers.value.length

  if (total > 0) {
    const idx = Math.max(0, Math.min(selectedSearchIndex.value, total - 1))

    // 1. Local Channel or DM
    if (idx < filteredChannels.value.length) {
      const targetChannel = filteredChannels.value[idx]
      handleSelectChat(targetChannel.id)
      finishSearch()
      return
    }

    // 2. Global Channel
    const gChanIdx = idx - filteredChannels.value.length
    if (gChanIdx < globalChannels.value.length) {
      const targetGlobal = globalChannels.value[gChanIdx]
      await chatStore.openOrJoinChannel(targetGlobal)
      finishSearch()
      return
    }

    // 3. Global User
    const gUserIdx = gChanIdx - globalChannels.value.length
    if (gUserIdx < globalUsers.value.length) {
      const targetUser = globalUsers.value[gUserIdx]
      await chatStore.openDirectMessage(targetUser.id)
      finishSearch()
      return
    }
  }

  // If no items loaded yet and search is running, wait for it
  if (isSearchingServer.value) {
    pendingEnter.value = true
    return
  }

  // If debounce hasn't triggered yet, run server search immediately
  if (searchDebounceTimer) {
    clearTimeout(searchDebounceTimer)
    searchDebounceTimer = null
  }
  pendingEnter.value = true
  await executeServerSearch(q)
}

function handleArrowDown(e: KeyboardEvent) {
  const total = filteredChannels.value.length + globalChannels.value.length + globalUsers.value.length
  if (total <= 0) return
  e.preventDefault()
  selectedSearchIndex.value = (selectedSearchIndex.value + 1) % total
}

function handleArrowUp(e: KeyboardEvent) {
  const total = filteredChannels.value.length + globalChannels.value.length + globalUsers.value.length
  if (total <= 0) return
  e.preventDefault()
  selectedSearchIndex.value = (selectedSearchIndex.value - 1 + total) % total
}

function handleSelectChat(channelId: string) {
  chatStore.selectChannel(channelId)
  if (window.innerWidth < 768) {
    uiStore.isMobileSidebarOpen = false
  }
  router.push(`/c/${channelId}`)
}

function handleSelectChatWithSearch(channelId: string) {
  handleSelectChat(channelId)
  if (uiStore.searchQuery.trim()) {
    finishSearch()
  }
}

async function handleSelectGlobalChannel(channel: MattermostChannel) {
  await chatStore.openOrJoinChannel(channel)
  finishSearch()
  router.push(`/c/${channel.id}`)
}

async function handleSelectGlobalUser(user: MattermostUser) {
  await chatStore.openDirectMessage(user.id)
  finishSearch()
  if (chatStore.activeChannelId) {
    router.push(`/c/${chatStore.activeChannelId}`)
  }
}

function handleUserAvatarClick(user: MattermostUser) {
  uiStore.openMentionModal({
    type: 'user',
    username: user.username,
    user
  })
}

function handleSearchEsc(e?: Event) {
  if (e) {
    e.preventDefault()
    e.stopPropagation()
  }
  finishSearch()
}

function finishSearch() {
  if (searchDebounceTimer) {
    clearTimeout(searchDebounceTimer)
    searchDebounceTimer = null
  }
  uiStore.searchQuery = ''
  globalUsers.value = []
  globalChannels.value = []
  isSearchingServer.value = false
  pendingEnter.value = false
  selectedSearchIndex.value = 0

  if (searchInputRef.value) {
    searchInputRef.value.value = ''
    searchInputRef.value.blur()
  }
  if (document.activeElement instanceof HTMLElement) {
    document.activeElement.blur()
  }
  if (window.innerWidth < 768) {
    uiStore.isMobileSidebarOpen = false
  }
}
</script>

<template>
  <div
    class="w-full md:w-80 lg:w-96 h-full flex flex-col bg-white dark:bg-[#17212b] border-r border-[#dfe1e5] dark:border-[#101921] relative shrink-0 select-none z-20"
  >
    <!-- Top Header: Hamburger & Search Input -->
    <div
      class="p-2.5 flex items-center gap-2 bg-white dark:bg-[#17212b]"
      style="padding-top: calc(0.625rem + env(safe-area-inset-top, 0px));"
    >
      <!-- Hamburger Menu Button -->
      <button
        @click="isDrawerOpen = true"
        class="p-2 rounded-full text-[#7f91a4] hover:text-[#111827] dark:hover:text-[#f5f5f5] hover:bg-[#f1f1f1] dark:hover:bg-[#202b36] transition-colors shrink-0"
        title="Menu"
      >
        <Menu class="w-5 h-5" />
      </button>

      <!-- Telegram Search Bar -->
      <div class="flex-1 relative flex items-center">
        <Search class="w-4 h-4 text-[#7f91a4] absolute left-3 pointer-events-none" />
        <input
          ref="searchInputRef"
          v-model="uiStore.searchQuery"
          @keydown.enter="handleSearchEnter"
          @keydown.down="handleArrowDown"
          @keydown.up="handleArrowUp"
          @keydown.esc.stop.prevent="handleSearchEsc"
          @keyup.esc.stop.prevent="handleSearchEsc"
          type="text"
          placeholder="Search"
          class="w-full bg-[#f4f4f5] dark:bg-[#242f3d] border border-transparent focus:border-[#3390ec] text-[#111827] dark:text-[#f5f5f5] placeholder-[#7f91a4] text-xs rounded-full pl-9 pr-8 py-2 outline-none transition-all"
        />
        <!-- Clear search button -->
        <button
          v-if="uiStore.searchQuery"
          @click="finishSearch"
          class="absolute right-2.5 p-0.5 text-[#7f91a4] hover:text-white rounded-full"
        >
          <X class="w-3.5 h-3.5" />
        </button>
      </div>
    </div>

    <!-- Telegram Notifications Permission Prompt Banner -->
    <div
      v-if="showNotificationBanner && !uiStore.searchQuery.trim()"
      class="px-3 py-2 bg-[#2481cc]/15 border-b border-[#2481cc]/25 flex items-center justify-between text-xs animate-in fade-in duration-200"
    >
      <div class="flex items-center gap-2 text-[#3390ec] min-w-0 pr-2">
        <Bell class="w-4 h-4 shrink-0" />
        <span class="truncate font-medium">Enable desktop notifications</span>
      </div>
      <div class="flex items-center gap-1.5 shrink-0">
        <button
          @click="enableNotifications"
          class="px-2.5 py-1 bg-[#2481cc] hover:bg-[#1d73b8] text-white font-semibold rounded-lg text-[11px] transition-colors"
        >
          Enable
        </button>
        <button
          @click="dismissNotificationBanner"
          class="p-1 text-[#7f91a4] hover:text-white rounded-lg transition-colors"
        >
          <X class="w-3.5 h-3.5" />
        </button>
      </div>
    </div>

    <!-- Folder Tabs (visible only when not searching) -->
    <FolderTabs v-if="!uiStore.searchQuery.trim()" />

    <!-- TODO List Sidebar Panel -->
    <TodoSidebarPanel v-if="uiStore.activeTab === 'todo' && !uiStore.searchQuery.trim()" />

    <!-- Chat List / Search Results -->
    <div v-else class="flex-1 overflow-y-auto tg-scroll-container divide-y divide-[#dfe1e5]/50 dark:divide-[#101921]/50 relative">
      <!-- Telegram Skeleton Loader when initial channels load -->
      <div v-if="chatStore.loadingChannels && chatStore.channels.length === 0" class="divide-y divide-gray-100 dark:divide-[#101921]/30">
        <div
          v-for="i in 8"
          :key="i"
          class="flex items-center gap-3 px-3 py-2.5 animate-pulse select-none"
        >
          <!-- Skeleton Avatar -->
          <div class="w-12 h-12 rounded-full bg-gray-200 dark:bg-[#242f3d]/60 shrink-0"></div>

          <!-- Skeleton Details -->
          <div class="flex-1 min-w-0 space-y-2">
            <!-- Title & Time Row -->
            <div class="flex items-center justify-between">
              <div
                class="h-3.5 bg-gray-200 dark:bg-[#242f3d]/80 rounded-md"
                :style="{ width: [100, 130, 85, 115, 140, 95, 125, 110][(i - 1) % 8] + 'px' }"
              ></div>
              <div class="h-2.5 w-9 bg-gray-200 dark:bg-[#242f3d]/50 rounded-md"></div>
            </div>

            <!-- Message Snippet Row -->
            <div class="flex items-center justify-between">
              <div
                class="h-3 bg-gray-200/80 dark:bg-[#242f3d]/50 rounded-md"
                :style="{ width: [180, 220, 150, 190, 230, 160, 200, 175][(i - 1) % 8] + 'px' }"
              ></div>
              <div
                v-if="i % 3 === 0"
                class="w-4 h-4 rounded-full bg-[#3390ec]/25 shrink-0"
              ></div>
            </div>
          </div>
        </div>
      </div>

      <!-- Normal Mode (No search query active) -->
      <template v-else-if="!uiStore.searchQuery.trim()">
        <div v-if="filteredChannels.length === 0" class="p-8 text-center text-xs text-[#7f91a4]">
          <p v-if="uiStore.activeTab === 'unread'">No unread chats</p>
          <p v-else>No chats available in this folder</p>
        </div>
        <template v-else>
          <ChatListItem
            v-for="channel in filteredChannels"
            :key="channel.id"
            :channel="channel"
            :isActive="chatStore.activeChannelId === channel.id"
            @click="handleSelectChat(channel.id)"
            @contextmenu="onChatContextMenu($event, channel)"
          />
        </template>
      </template>

      <!-- Search Mode -->
      <template v-else>
        <!-- Server Search Loading Indicator Bar -->
        <div v-if="isSearchingServer" class="px-3.5 py-1.5 flex items-center justify-between text-[11px] text-[#7f91a4] bg-[#242f3d]/25 border-b border-[#202b36]/40">
          <span class="flex items-center gap-1.5">
            <Loader2 class="w-3 h-3 animate-spin text-[#3390ec]" />
            <span>Searching server...</span>
          </span>
          <span v-if="pendingEnter" class="text-[#3390ec] text-[10px] font-semibold animate-pulse">Opening first match...</span>
        </div>

        <!-- 1. Local Chats & Contacts Section -->
        <div v-if="filteredChannels.length > 0">
          <div class="px-3.5 py-1 text-[11px] font-bold text-[#7f91a4] uppercase tracking-wider bg-gray-100 dark:bg-[#101921]/30">
            Chats and Contacts
          </div>
          <ChatListItem
            v-for="(channel, idx) in filteredChannels"
            :key="channel.id"
            :channel="channel"
            :isActive="chatStore.activeChannelId === channel.id || (idx === selectedSearchIndex)"
            @click="handleSelectChatWithSearch(channel.id)"
            @contextmenu="onChatContextMenu($event, channel)"
          />
        </div>

        <!-- 2. Global Search Section -->
        <div v-if="globalChannels.length > 0 || globalUsers.length > 0">
          <div class="px-3.5 py-1 text-[11px] font-bold text-[#3390ec] uppercase tracking-wider bg-gray-100 dark:bg-[#101921]/30 flex items-center justify-between">
            <span class="flex items-center gap-1.5">
              <Globe class="w-3 h-3 text-[#3390ec]" />
              <span>Global Search</span>
            </span>
          </div>

          <!-- Global Channels / Groups -->
          <div
            v-for="(ch, cIdx) in globalChannels"
            :key="ch.id"
            @click="handleSelectGlobalChannel(ch)"
            class="flex items-center gap-3 px-3 py-2 cursor-pointer transition-colors"
            :class="selectedSearchIndex === (filteredChannels.length + cIdx) ? 'bg-[#e3effa] dark:bg-[#242f3d]' : 'hover:bg-gray-100 dark:hover:bg-[#202b36]/60'"
          >
            <div class="w-12 h-12 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white shrink-0 shadow-sm font-bold text-sm">
              <Hash class="w-5 h-5" />
            </div>
            <div class="flex-1 min-w-0">
              <div class="flex items-center justify-between">
                <span class="text-sm font-medium text-gray-900 dark:text-white truncate">
                  {{ ch.display_name || ch.name }}
                </span>
                <span class="text-[10px] px-1.5 py-0.5 rounded bg-[#3390ec]/20 text-[#3390ec] font-semibold">
                  {{ ch.type === 'P' ? 'Group' : 'Channel' }}
                </span>
              </div>
              <p class="text-xs text-[#7f91a4] truncate mt-0.5">@{{ ch.name }}</p>
            </div>
          </div>

          <!-- Global Users -->
          <div
            v-for="(u, uIdx) in globalUsers"
            :key="u.id"
            @click="handleSelectGlobalUser(u)"
            class="flex items-center gap-3 px-3 py-2 cursor-pointer transition-colors"
            :class="selectedSearchIndex === (filteredChannels.length + globalChannels.length + uIdx) ? 'bg-[#e3effa] dark:bg-[#242f3d]' : 'hover:bg-gray-100 dark:hover:bg-[#202b36]/60'"
          >
            <div
              @click.stop="handleUserAvatarClick(u)"
              class="shrink-0 cursor-pointer hover:opacity-85 transition-opacity"
              title="View user profile"
            >
              <TelegramAvatar
                :name="usersStore.getUserDisplayName(u)"
                :userId="u.id"
                size="md"
                :showOnlineDot="true"
                :isOnline="usersStore.getStatus(u.id) === 'online'"
                :lastPictureUpdate="(u as any)?.last_picture_update"
              />
            </div>
            <div class="flex-1 min-w-0">
              <div class="flex items-center justify-between">
                <span class="text-sm font-medium text-gray-900 dark:text-white truncate">
                  {{ usersStore.getUserDisplayName(u) }}
                </span>
                <span class="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-400 font-semibold">
                  User
                </span>
              </div>
              <p class="text-xs text-[#7f91a4] truncate mt-0.5">@{{ u.username }}</p>
            </div>
          </div>
        </div>

        <!-- 3. Empty Search State -->
        <div
          v-if="filteredChannels.length === 0 && globalChannels.length === 0 && globalUsers.length === 0 && !isSearchingServer"
          class="p-8 text-center text-xs text-[#7f91a4] flex flex-col items-center justify-center gap-2"
        >
          <Search class="w-8 h-8 text-[#7f91a4]/40" />
          <span>No chats, channels, or users found</span>
        </div>
      </template>
    </div>

    <!-- Telegram Floating Action Button (FAB) - Fixed at bottom-right of sidebar -->
    <button
      @click="uiStore.showNewChatModal = true"
      class="absolute bottom-5 right-5 w-12 h-12 rounded-full bg-[#3390ec] hover:bg-[#2481cc] active:scale-95 text-white shadow-xl shadow-[#3390ec]/30 flex items-center justify-center transition-all z-30 p-3"
      title="New Chat or Channel"
    >
      <Edit3 class="w-5 h-5" />
    </button>

    <!-- Drawer Menu Component -->
    <DrawerMenu
      :isOpen="isDrawerOpen"
      @close="isDrawerOpen = false"
      @open="isDrawerOpen = true"
      @update:isOpen="isDrawerOpen = $event"
    />

    <!-- New Chat Modal -->
    <NewChatModal
      :isOpen="uiStore.showNewChatModal"
      @close="uiStore.showNewChatModal = false"
    />

    <!-- Chat Context Menu -->
    <ChatContextMenu
      :channel="contextChannel"
      :position="contextPos"
      :isOpen="showChatContextMenu"
      @close="showChatContextMenu = false"
    />
  </div>
</template>
