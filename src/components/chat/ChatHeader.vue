<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '../../stores/auth'
import { useChatStore } from '../../stores/chat'
import { useUsersStore } from '../../stores/users'
import { useUiStore } from '../../stores/ui'
import { getAvatarGradient, getInitials } from '../../utils/formatters'
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
  Trash2
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
  chatStore.activeChannelId = null
  router.push('/')
}

function toggleMute() {
  if (channel.value) {
    channel.value.is_muted = !channel.value.is_muted
  }
  showMoreMenu.value = false
}
</script>

<template>
  <div
    v-if="channel"
    class="px-4 bg-white dark:bg-[#17212b] border-b border-[#dfe1e5] dark:border-[#101921] flex items-center justify-between z-10 shrink-0 select-none"
    style="padding-top: env(safe-area-inset-top, 0px); min-height: calc(3.5rem + env(safe-area-inset-top, 0px));"
  >
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
        class="p-2 text-[#7f91a4] hover:text-[#111827] dark:hover:text-[#f5f5f5] hover:bg-[#f1f1f1] dark:hover:bg-[#202b36] rounded-full transition-colors"
        title="Search in this chat"
      >
        <Search class="w-4 h-4" />
      </button>

      <!-- Shared Files -->
      <button
        @click="toggleFilesSidebar"
        class="relative p-2 text-[#7f91a4] hover:text-[#111827] dark:hover:text-[#f5f5f5] hover:bg-[#f1f1f1] dark:hover:bg-[#202b36] rounded-full transition-colors"
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
        class="p-2 text-[#7f91a4] hover:text-[#111827] dark:hover:text-[#f5f5f5] hover:bg-[#f1f1f1] dark:hover:bg-[#202b36] rounded-full transition-colors"
        :class="{ 'text-[#3390ec]': uiStore.showRightSidebar && uiStore.rightSidebarTab === 'info' }"
        title="Chat info"
      >
        <PanelRight class="w-4 h-4" />
      </button>

      <!-- More Options Menu -->
      <div class="relative">
        <button
          @click="showMoreMenu = !showMoreMenu"
          class="p-2 text-[#7f91a4] hover:text-[#111827] dark:hover:text-[#f5f5f5] hover:bg-[#f1f1f1] dark:hover:bg-[#202b36] rounded-full transition-colors"
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
            class="w-full px-3.5 py-2 flex items-center gap-2.5 text-[#111827] dark:text-[#f5f5f5] hover:bg-[#f1f1f1] dark:hover:bg-[#202b36] text-left"
          >
            <VolumeX v-if="channel.is_muted" class="w-4 h-4 text-[#7f91a4]" />
            <Volume2 v-else class="w-4 h-4 text-[#7f91a4]" />
            <span>{{ channel.is_muted ? 'Unmute' : 'Mute Notifications' }}</span>
          </button>

          <button
            @click="uiStore.openChatFiles(); showMoreMenu = false"
            class="w-full px-3.5 py-2 flex items-center justify-between text-[#111827] dark:text-[#f5f5f5] hover:bg-[#f1f1f1] dark:hover:bg-[#202b36] text-left"
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
