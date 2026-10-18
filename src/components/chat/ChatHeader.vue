<script setup lang="ts">
import { computed, ref, watch, nextTick, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '../../stores/auth'
import { useChatStore } from '../../stores/chat'
import { useUsersStore } from '../../stores/users'
import { useUiStore } from '../../stores/ui'
import { getAvatarGradient, getInitials } from '../../utils/formatters'
import type { MattermostPost } from '../../types/mattermost'
import { mmApi } from '../../services/mattermostApi'
import {
  ArrowLeft,
  Search,
  MoreVertical,
  PanelRight,
  Bookmark,
  Hash,
  Lock,
  Volume2,
  VolumeX,
  Check,
  FolderOpen,
  UserPlus,
  LogOut,
  Trash2,
  ChevronUp,
  ChevronDown,
  X,
  Loader2,
  Edit3
} from 'lucide-vue-next'
import TelegramAvatar from '../common/TelegramAvatar.vue'
import AddChannelMembersModal from './AddChannelMembersModal.vue'
import { showConfirm } from '../../stores/alert'
import { notificationService } from '../../services/notifications'

const router = useRouter()
const authStore = useAuthStore()
const chatStore = useChatStore()
const usersStore = useUsersStore()
const uiStore = useUiStore()

const showMoreMenu = ref(false)
const showAddMemberModal = ref(false)

const channel = computed(() => chatStore.activeChannel)
const isDirect = computed(() => channel.value?.type === 'D')
const isPrivate = computed(() => channel.value?.type === 'P')
const isPublic = computed(() => channel.value?.type === 'O')

const canAddMembers = computed(() => {
  if (!channel.value) return false
  return chatStore.canCurrentUserAddMembers(channel.value.id)
})

const isSavedMessages = computed(() => channel.value?.display_name === 'Saved Messages')

const canDelete = computed(() => {
  if (!channel.value) return false
  if (isSavedMessages.value) return false
  if (isDirect.value) return true
  return chatStore.canCurrentUserManageChannel(channel.value.id)
})

const canManageChannel = computed(() => {
  if (!channel.value) return false
  if (channel.value.type === 'D' || isSavedMessages.value) return false
  return chatStore.canCurrentUserManageChannel(channel.value.id)
})

async function handleExitGroup() {
  if (!channel.value) return
  const channelToExit = channel.value
  const channelName = channelToExit.display_name || channelToExit.name || 'Group'
  showMoreMenu.value = false

  const confirmed = await showConfirm(
    `Are you sure you want to leave ${channelName}?`,
    {
      title: 'Exit Group',
      confirmText: 'Exit',
      cancelText: 'Cancel',
      isDestructive: true
    }
  )

  if (!confirmed) return

  try {
    await chatStore.leaveChannel(channelToExit.id)
    router.push('/')
    notificationService.showToast({
      message: `You have left ${channelName}`
    })
  } catch (err) {
    console.error('Failed to exit group:', err)
    notificationService.showToast({
      message: 'Failed to exit group.'
    })
  }
}

async function handleDeleteChat() {
  if (!channel.value) return
  const channelToDelete = channel.value
  const isDirectChat = channelToDelete.type === 'D'
  const channelName = channelToDelete.display_name || channelToDelete.name || 'Chat'
  const actionTitle = isDirectChat ? 'Delete Chat' : 'Delete Channel'
  const promptMessage = isDirectChat
    ? `Are you sure you want to delete the chat with ${channelName}?`
    : `Are you sure you want to delete ${channelName}? This action cannot be undone.`

  showMoreMenu.value = false

  const confirmed = await showConfirm(promptMessage, {
    title: actionTitle,
    confirmText: 'Delete',
    cancelText: 'Cancel',
    isDestructive: true
  })

  if (!confirmed) return

  try {
    await chatStore.deleteChannel(channelToDelete.id)
    router.push('/')
    notificationService.showToast({
      message: `${actionTitle} succeeded.`
    })
  } catch (err: any) {
    console.error('Failed to delete chat:', err)
    notificationService.showToast({
      message: err.message || 'Failed to delete chat.'
    })
  }
}

// User status for DM
const otherUserStatus = computed(() => {
  if (!isDirect.value || isSavedMessages.value || !channel.value?.dm_user) return 'offline'
  return usersStore.getStatus(channel.value.dm_user.id)
})

const isOnline = computed(() => otherUserStatus.value === 'online')

const filesCount = computed(() => {
  if (!channel.value?.id) return 0
  return chatStore.getChannelFiles(channel.value.id).length
})

// Typing text
const typingText = computed(() => {
  if (!channel.value) return ''
  const typers = chatStore.typingUsers[channel.value.id]
  if (!typers) return ''
  const names = Object.values(typers)
  if (!names.length) return ''
  if (names.length === 1) return `${names[0]} is typing...`
  return `${names.length} people are typing...`
})

// Subtitle text
const subtitleText = computed(() => {
  if (typingText.value) return typingText.value
  if (isSavedMessages.value) return 'cloud storage'
  if (isDirect.value) {
    return isOnline.value ? 'online' : 'last seen recently'
  }
  return channel.value?.purpose || channel.value?.header || 'Channel'
})

function toggleRightSidebar() {
  if (uiStore.showRightSidebar && uiStore.rightSidebarTab === 'info') {
    uiStore.showRightSidebar = false
  } else {
    uiStore.openChatInfo()
  }
}

function toggleFilesSidebar() {
  if (uiStore.showRightSidebar && uiStore.rightSidebarTab === 'files') {
    uiStore.showRightSidebar = false
  } else {
    uiStore.openChatFiles()
  }
}

function handleAvatarClick() {
  if (isDirect.value && channel.value?.dm_user) {
    uiStore.openMentionModal({
      type: 'user',
      username: channel.value.dm_user.username,
      user: channel.value.dm_user
    })
  } else {
    toggleRightSidebar()
  }
}

function goBackMobile() {
  uiStore.isMobileSidebarOpen = true
  router.push('/')
  setTimeout(() => {
    if (uiStore.isMobileSidebarOpen) {
      chatStore.activeChannelId = null
    }
  }, 320)
}

function toggleMute() {
  if (channel.value) {
    channel.value.is_muted = !channel.value.is_muted
  }
  showMoreMenu.value = false
}

// In-Chat Search State & Logic
const isSearchOpen = ref(false)
const inChatSearchQuery = ref('')
const searchInputRef = ref<HTMLInputElement | null>(null)
const searchMatches = ref<MattermostPost[]>([])
const currentMatchIndex = ref(0)
const isSearchingServer = ref(false)
let serverSearchTimer: ReturnType<typeof setTimeout> | null = null
let jumpDebounceTimer: ReturnType<typeof setTimeout> | null = null

function postMatchesQuery(post: MattermostPost, query: string): boolean {
  if (!post || post.delete_at > 0) return false
  const q = query.toLowerCase()
  if (post.message && post.message.toLowerCase().includes(q)) return true
  if (post.metadata?.files && Array.isArray(post.metadata.files)) {
    for (const f of post.metadata.files) {
      if (f?.name && f.name.toLowerCase().includes(q)) return true
    }
  }
  return false
}

function mergeMatches(localList: MattermostPost[], serverList: MattermostPost[]): MattermostPost[] {
  const map = new Map<string, MattermostPost>()
  for (const p of localList) {
    map.set(p.id, p)
  }
  for (const p of serverList) {
    if (!map.has(p.id)) {
      map.set(p.id, p)
    }
  }
  return Array.from(map.values()).sort((a, b) => b.create_at - a.create_at)
}

function performLocalSearch(q: string) {
  if (!channel.value) return
  const channelPosts = chatStore.posts[channel.value.id] || []
  const matches = channelPosts.filter(p => postMatchesQuery(p, q))
  matches.sort((a, b) => b.create_at - a.create_at)
  searchMatches.value = matches
  currentMatchIndex.value = 0
}

function scheduleServerSearch(q: string) {
  if (serverSearchTimer) clearTimeout(serverSearchTimer)

  const currentChannel = channel.value
  if (!currentChannel) return
  if (currentChannel.type === 'D' || currentChannel.type === 'G') return
  if (!authStore.currentTeam?.id) return

  serverSearchTimer = setTimeout(async () => {
    if (!isSearchOpen.value || inChatSearchQuery.value.trim() !== q) return

    isSearchingServer.value = true
    try {
      const channelName = currentChannel.name || ''
      const teamId = authStore.currentTeam!.id
      const terms = channelName ? `${q} in:${channelName}` : q
      const res = await mmApi.searchTeamPosts(teamId, terms)

      if (res && res.posts && isSearchOpen.value && inChatSearchQuery.value.trim() === q) {
        const serverPosts: MattermostPost[] = []
        const order = res.order || Object.keys(res.posts)
        for (const id of order) {
          const p = res.posts[id]
          if (p && p.channel_id === currentChannel.id && postMatchesQuery(p, q)) {
            serverPosts.push(p)
          }
        }

        const selectedPostId = searchMatches.value[currentMatchIndex.value]?.id
        const merged = mergeMatches(searchMatches.value, serverPosts)
        searchMatches.value = merged

        if (selectedPostId) {
          const newIdx = merged.findIndex(p => p.id === selectedPostId)
          if (newIdx !== -1) {
            currentMatchIndex.value = newIdx
          }
        }
      }
    } catch (err) {
      console.warn('Server search for chat encountered an issue:', err)
    } finally {
      isSearchingServer.value = false
    }
  }, 350)
}

function jumpToCurrentMatch() {
  if (jumpDebounceTimer) {
    clearTimeout(jumpDebounceTimer)
    jumpDebounceTimer = null
  }
  if (!searchMatches.value.length || !channel.value) return
  const post = searchMatches.value[currentMatchIndex.value]
  if (post) {
    chatStore.jumpToPost(channel.value.id, post.id)
  }
}

function scheduleJump() {
  if (jumpDebounceTimer) clearTimeout(jumpDebounceTimer)
  jumpDebounceTimer = setTimeout(() => {
    jumpToCurrentMatch()
  }, 250)
}

function handleSearchInput() {
  const q = inChatSearchQuery.value.trim()
  if (!q) {
    searchMatches.value = []
    currentMatchIndex.value = 0
    isSearchingServer.value = false
    if (serverSearchTimer) clearTimeout(serverSearchTimer)
    if (jumpDebounceTimer) clearTimeout(jumpDebounceTimer)
    return
  }

  performLocalSearch(q)
  scheduleJump()
  scheduleServerSearch(q)
}

function goNextMatch() {
  // Move towards older messages (higher index)
  if (!searchMatches.value.length) return
  currentMatchIndex.value = (currentMatchIndex.value + 1) % searchMatches.value.length
  jumpToCurrentMatch()
}

function goPrevMatch() {
  // Move towards newer messages (lower index)
  if (!searchMatches.value.length) return
  currentMatchIndex.value = (currentMatchIndex.value - 1 + searchMatches.value.length) % searchMatches.value.length
  jumpToCurrentMatch()
}

function handleSearchKeyDown(e: KeyboardEvent) {
  if (e.key === 'Enter') {
    e.preventDefault()
    if (e.shiftKey) {
      goPrevMatch()
    } else {
      goNextMatch()
    }
  } else if (e.key === 'ArrowUp') {
    e.preventDefault()
    goNextMatch()
  } else if (e.key === 'ArrowDown') {
    e.preventDefault()
    goPrevMatch()
  } else if (e.key === 'Escape') {
    e.preventDefault()
    closeInChatSearch()
  }
}

async function openInChatSearch() {
  isSearchOpen.value = true
  showMoreMenu.value = false
  await nextTick()
  if (searchInputRef.value) {
    searchInputRef.value.focus()
    searchInputRef.value.select()
  }
}

function closeInChatSearch() {
  isSearchOpen.value = false
  inChatSearchQuery.value = ''
  searchMatches.value = []
  currentMatchIndex.value = 0
  isSearchingServer.value = false
  if (serverSearchTimer) clearTimeout(serverSearchTimer)
  if (jumpDebounceTimer) clearTimeout(jumpDebounceTimer)
}

function handleGlobalKeyDown(e: KeyboardEvent) {
  if ((e.ctrlKey || e.metaKey) && (e.key === 'f' || e.key === 'F')) {
    if (
      channel.value &&
      !showAddMemberModal.value &&
      !uiStore.previewFile &&
      !uiStore.avatarPreview?.isOpen &&
      !uiStore.showSettingsModal &&
      !uiStore.showAccountSettingsModal &&
      !uiStore.showEditChannelModal &&
      !uiStore.showNewChatModal
    ) {
      e.preventDefault()
      openInChatSearch()
    }
  } else if (e.key === 'Escape' && isSearchOpen.value) {
    closeInChatSearch()
  }
}

watch(
  () => channel.value?.id,
  (newId, oldId) => {
    if (newId !== oldId && isSearchOpen.value) {
      closeInChatSearch()
    }
  }
)

onMounted(() => {
  window.addEventListener('keydown', handleGlobalKeyDown)
})

onUnmounted(() => {
  window.removeEventListener('keydown', handleGlobalKeyDown)
  if (serverSearchTimer) clearTimeout(serverSearchTimer)
  if (jumpDebounceTimer) clearTimeout(jumpDebounceTimer)
})
</script>

<template>
  <div
    v-if="channel"
    class="px-4 bg-white dark:bg-[#17212b] border-b border-[#dfe1e5] dark:border-[#101921] flex items-center justify-between z-10 shrink-0 select-none"
    style="padding-top: env(safe-area-inset-top, 0px); min-height: calc(3.5rem + env(safe-area-inset-top, 0px));"
  >
    <!-- Regular Header View (When In-Chat Search is Inactive) -->
    <template v-if="!isSearchOpen">
      <!-- Left: Mobile Back Button & Chat Info Header -->
      <div class="flex items-center gap-3 min-w-0">
        <!-- Mobile Back Button -->
        <button
          @click="goBackMobile"
          class="md:hidden p-1.5 -ml-1 text-[#7f91a4] hover:text-white rounded-full transition-colors"
        >
          <ArrowLeft class="w-5 h-5" />
        </button>

        <!-- Avatar (Clickable to open profile / info) -->
        <div
          @click="handleAvatarClick"
          class="cursor-pointer hover:opacity-90 transition-opacity shrink-0"
          :title="isDirect ? 'View profile and enlarge photo' : 'Channel info'"
        >
          <TelegramAvatar
            :userId="channel.dm_user?.id"
            :name="channel.display_name || channel.name"
            size="md"
            :isSavedMessages="isSavedMessages"
            :showOnlineDot="true"
            :isOnline="isOnline"
            :lastPictureUpdate="(channel.dm_user as any)?.last_picture_update"
            :customAvatarUrl="chatStore.getChannelAvatar(channel)"
          />
        </div>

        <!-- Title & Subtitle -->
        <div
          @click="toggleRightSidebar"
          class="min-w-0 cursor-pointer"
        >
          <div class="flex items-center gap-1.5">
            <Lock v-if="isPrivate" class="w-3.5 h-3.5 text-[#7f91a4]" />
            <Hash v-else-if="isPublic" class="w-3.5 h-3.5 text-[#7f91a4]" />
            <h2 class="text-sm font-bold text-[#111827] dark:text-[#f5f5f5] truncate leading-tight">
              {{ channel.display_name || channel.name }}
            </h2>
          </div>

          <p
            class="text-xs truncate leading-tight mt-0.5"
            :class="[
              typingText
                ? 'text-[#3390ec] font-medium'
                : (isOnline && isDirect ? 'text-[#4fae60]' : 'text-[#7f91a4]')
            ]"
          >
            {{ subtitleText }}
          </p>
        </div>
      </div>

      <!-- Right: Header Actions -->
      <div class="flex items-center gap-1">
        <!-- Search in Chat -->
        <button
          @click="openInChatSearch"
          class="p-2 text-[#7f91a4] hover:text-[#111827] dark:hover:text-[#f5f5f5] hover:bg-[#f1f1f1] dark:hover:bg-[#202b36] rounded-full transition-colors cursor-pointer"
          title="Search in this chat (Ctrl+F)"
        >
          <Search class="w-4 h-4" />
        </button>

        <!-- Shared Files -->
        <button
          @click="toggleFilesSidebar"
          class="relative p-2 text-[#7f91a4] hover:text-[#111827] dark:hover:text-[#f5f5f5] hover:bg-[#f1f1f1] dark:hover:bg-[#202b36] rounded-full transition-colors cursor-pointer"
          :class="{ 'text-[#3390ec]': uiStore.showRightSidebar && uiStore.rightSidebarTab === 'files' }"
          title="Shared Files (فایل‌های این گفتگو)"
        >
          <FolderOpen class="w-4 h-4" />
          <span
            v-if="filesCount > 0"
            class="absolute -top-0.5 -right-0.5 min-w-[15px] h-[15px] px-1 rounded-full bg-[#3390ec] text-white text-[9px] font-bold flex items-center justify-center leading-none shadow-xs"
          >
            {{ filesCount > 99 ? '99+' : filesCount }}
          </span>
        </button>

        <!-- Toggle Right Sidebar Info -->
        <button
          @click="toggleRightSidebar"
          class="p-2 text-[#7f91a4] hover:text-[#111827] dark:hover:text-[#f5f5f5] hover:bg-[#f1f1f1] dark:hover:bg-[#202b36] rounded-full transition-colors cursor-pointer"
          :class="{ 'text-[#3390ec]': uiStore.showRightSidebar && uiStore.rightSidebarTab === 'info' }"
          title="Chat info"
        >
          <PanelRight class="w-4 h-4" />
        </button>

        <!-- More Options Menu -->
        <div class="relative">
          <button
            @click="showMoreMenu = !showMoreMenu"
            class="p-2 text-[#7f91a4] hover:text-[#111827] dark:hover:text-[#f5f5f5] hover:bg-[#f1f1f1] dark:hover:bg-[#202b36] rounded-full transition-colors cursor-pointer"
          >
            <MoreVertical class="w-4 h-4" />
          </button>

          <!-- Dropdown Menu -->
          <div
            v-if="showMoreMenu"
            class="absolute right-0 top-11 w-48 bg-white dark:bg-[#242f3d] rounded-xl shadow-2xl border border-[#dfe1e5] dark:border-[#202b36] py-1.5 z-50 text-xs"
          >
            <button
              @click="toggleMute"
              class="w-full px-3.5 py-2 flex items-center gap-2.5 text-[#111827] dark:text-[#f5f5f5] hover:bg-[#f1f1f1] dark:hover:bg-[#202b36] text-left cursor-pointer"
            >
              <VolumeX v-if="channel.is_muted" class="w-4 h-4 text-[#7f91a4]" />
              <Volume2 v-else class="w-4 h-4 text-[#7f91a4]" />
              <span>{{ channel.is_muted ? 'Unmute' : 'Mute Notifications' }}</span>
            </button>

            <button
              @click="uiStore.openChatFiles(); showMoreMenu = false"
              class="w-full px-3.5 py-2 flex items-center justify-between text-[#111827] dark:text-[#f5f5f5] hover:bg-[#f1f1f1] dark:hover:bg-[#202b36] text-left cursor-pointer"
            >
              <div class="flex items-center gap-2.5">
                <FolderOpen class="w-4 h-4 text-[#7f91a4]" />
                <span>Shared Files</span>
              </div>
              <span
                v-if="filesCount > 0"
                class="text-[10px] px-1.5 py-0.5 rounded-full bg-[#3390ec]/20 text-[#3390ec] font-bold"
              >
                {{ filesCount }}
              </span>
            </button>

            <!-- Add Member to Channel (Only for groups and when permitted) -->
            <button
              v-if="!isDirect && !isSavedMessages && canAddMembers"
              @click="showAddMemberModal = true; showMoreMenu = false"
              class="w-full px-3.5 py-2 flex items-center gap-2.5 text-[#111827] dark:text-[#f5f5f5] hover:bg-[#f1f1f1] dark:hover:bg-[#202b36] text-left cursor-pointer"
            >
              <UserPlus class="w-4 h-4 text-[#3390ec]" />
              <span>Add Member</span>
            </button>

            <button
              @click="uiStore.openChatInfo(); showMoreMenu = false"
              class="w-full px-3.5 py-2 flex items-center gap-2.5 text-[#111827] dark:text-[#f5f5f5] hover:bg-[#f1f1f1] dark:hover:bg-[#202b36] text-left cursor-pointer"
            >
              <PanelRight class="w-4 h-4 text-[#7f91a4]" />
              <span>View Info</span>
            </button>

            <!-- Edit Channel / Group (When permitted) -->
            <button
              v-if="canManageChannel"
              @click="uiStore.openEditChannel(channel); showMoreMenu = false"
              class="w-full px-3.5 py-2 flex items-center gap-2.5 text-[#111827] dark:text-[#f5f5f5] hover:bg-[#f1f1f1] dark:hover:bg-[#202b36] text-left cursor-pointer"
            >
              <Edit3 class="w-4 h-4 text-[#3390ec]" />
              <span>Edit Channel</span>
            </button>

            <!-- Exit Group (For groups) -->
            <button
              v-if="!isDirect && !isSavedMessages"
              @click="handleExitGroup"
              class="w-full px-3.5 py-2 flex items-center gap-2.5 text-red-500 hover:bg-red-500/10 text-left cursor-pointer"
            >
              <LogOut class="w-4 h-4 text-red-500" />
              <span>Exit</span>
            </button>

            <!-- Delete Chat / Channel -->
            <button
              v-if="canDelete"
              @click="handleDeleteChat"
              class="w-full px-3.5 py-2 flex items-center gap-2.5 text-red-500 hover:bg-red-500/10 text-left cursor-pointer"
            >
              <Trash2 class="w-4 h-4 text-red-500" />
              <span>{{ isDirect ? 'Delete Chat' : 'Delete Channel' }}</span>
            </button>
          </div>
        </div>
      </div>
    </template>

    <!-- In-Chat Search Bar View (When Search is Active) -->
    <div v-else class="w-full flex items-center gap-2 py-1">
      <!-- Search Icon -->
      <div class="p-1.5 text-[#7f91a4] shrink-0">
        <Search class="w-4 h-4" />
      </div>

      <!-- Search Input -->
      <div class="flex-1 min-w-0 flex items-center">
        <input
          ref="searchInputRef"
          v-model="inChatSearchQuery"
          type="text"
          placeholder="Search in this chat..."
          class="w-full bg-transparent border-0 outline-none text-sm text-[#111827] dark:text-[#f5f5f5] placeholder-[#7f91a4] focus:ring-0 px-1 py-1"
          @input="handleSearchInput"
          @keydown="handleSearchKeyDown"
        />
      </div>

      <!-- Results Count & Loader -->
      <div class="flex items-center gap-2 text-xs text-[#7f91a4] shrink-0 font-medium select-none px-1">
        <div v-if="isSearchingServer" class="flex items-center gap-1.5">
          <Loader2 class="w-3.5 h-3.5 animate-spin text-[#3390ec]" />
          <span class="hidden sm:inline">Searching...</span>
        </div>
        <span v-else-if="inChatSearchQuery.trim() && searchMatches.length === 0">
          No results
        </span>
        <span v-else-if="searchMatches.length > 0">
          {{ currentMatchIndex + 1 }} of {{ searchMatches.length }}
        </span>
      </div>

      <!-- Navigation & Close Controls -->
      <div class="flex items-center gap-0.5 shrink-0">
        <!-- Up / Older match -->
        <button
          @click="goNextMatch"
          :disabled="searchMatches.length === 0"
          class="p-1.5 text-[#7f91a4] hover:text-[#111827] dark:hover:text-[#f5f5f5] hover:bg-[#f1f1f1] dark:hover:bg-[#202b36] rounded-full transition-colors disabled:opacity-30 disabled:pointer-events-none cursor-pointer"
          title="Older message (Up / Enter)"
        >
          <ChevronUp class="w-4 h-4" />
        </button>

        <!-- Down / Newer match -->
        <button
          @click="goPrevMatch"
          :disabled="searchMatches.length === 0"
          class="p-1.5 text-[#7f91a4] hover:text-[#111827] dark:hover:text-[#f5f5f5] hover:bg-[#f1f1f1] dark:hover:bg-[#202b36] rounded-full transition-colors disabled:opacity-30 disabled:pointer-events-none cursor-pointer"
          title="Newer message (Down / Shift+Enter)"
        >
          <ChevronDown class="w-4 h-4" />
        </button>

        <!-- Divider -->
        <div class="h-4 w-[1px] bg-[#dfe1e5] dark:bg-[#202b36] mx-1"></div>

        <!-- Close button -->
        <button
          @click="closeInChatSearch"
          class="p-1.5 text-[#7f91a4] hover:text-[#111827] dark:hover:text-[#f5f5f5] hover:bg-[#f1f1f1] dark:hover:bg-[#202b36] rounded-full transition-colors cursor-pointer"
          title="Close search (Esc)"
        >
          <X class="w-4 h-4" />
        </button>
      </div>
    </div>

    <!-- Add Channel Members Modal -->
    <AddChannelMembersModal
      :isOpen="showAddMemberModal"
      :channel="channel"
      :existingMemberUserIds="(channel ? chatStore.channelMembers[channel.id] : [])?.map((m) => m.user_id) || []"
      @close="showAddMemberModal = false"
      @added="(uids) => channel && chatStore.fetchChannelMembers(channel.id)"
    />
  </div>
</template>
