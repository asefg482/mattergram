<script setup lang="ts">
import { computed, ref } from 'vue'
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
  Trash2,
  Check
} from 'lucide-vue-next'

const authStore = useAuthStore()
const chatStore = useChatStore()
const usersStore = useUsersStore()
const uiStore = useUiStore()

const showMoreMenu = ref(false)

const channel = computed(() => chatStore.activeChannel)
const isDirect = computed(() => channel.value?.type === 'D')
const isPrivate = computed(() => channel.value?.type === 'P')
const isPublic = computed(() => channel.value?.type === 'O')

const isSavedMessages = computed(() => channel.value?.display_name === 'Saved Messages')

// User status for DM
const otherUserStatus = computed(() => {
  if (!isDirect.value || isSavedMessages.value || !channel.value?.dm_user) return 'offline'
  return usersStore.getStatus(channel.value.dm_user.id)
})

const isOnline = computed(() => otherUserStatus.value === 'online')

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
  uiStore.showRightSidebar = !uiStore.showRightSidebar
}

function goBackMobile() {
  uiStore.isMobileSidebarOpen = true
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
    class="h-14 px-4 bg-[#17212b] dark:bg-[#17212b] bg-white border-b border-[#101921] dark:border-[#101921] border-[#dfe1e5] flex items-center justify-between z-10 shrink-0 select-none"
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
        @click="toggleRightSidebar"
        class="relative shrink-0 cursor-pointer hover:opacity-90 transition-opacity"
      >
        <div
          v-if="isSavedMessages"
          class="w-10 h-10 rounded-full bg-[#2481cc] flex items-center justify-center text-white shadow"
        >
          <Bookmark class="w-5 h-5 fill-white" />
        </div>
        <div
          v-else
          class="w-10 h-10 rounded-full flex items-center justify-center text-white font-semibold text-xs shadow"
          :style="{ background: getAvatarGradient(channel.id) }"
        >
          {{ getInitials(channel.display_name || channel.name) }}
        </div>

        <!-- Online Green Dot -->
        <div
          v-if="isOnline && !isSavedMessages"
          class="absolute bottom-0 right-0 w-3 h-3 rounded-full bg-[#4fae60] border-2 border-[#17212b] dark:border-[#17212b] border-white"
        ></div>
      </div>

      <!-- Title & Subtitle -->
      <div
        @click="toggleRightSidebar"
        class="min-w-0 cursor-pointer"
      >
        <div class="flex items-center gap-1.5">
          <Lock v-if="isPrivate" class="w-3.5 h-3.5 text-[#7f91a4]" />
          <Hash v-else-if="isPublic" class="w-3.5 h-3.5 text-[#7f91a4]" />
          <h2 class="text-sm font-bold text-[#f5f5f5] dark:text-[#f5f5f5] text-[#111827] truncate leading-tight">
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
        class="p-2 text-[#7f91a4] hover:text-[#f5f5f5] dark:hover:text-[#f5f5f5] hover:text-[#111827] hover:bg-[#202b36] dark:hover:bg-[#202b36] hover:bg-[#f1f1f1] rounded-full transition-colors"
        title="Search in this chat"
      >
        <Search class="w-4 h-4" />
      </button>

      <!-- Toggle Right Sidebar Info -->
      <button
        @click="toggleRightSidebar"
        class="p-2 text-[#7f91a4] hover:text-[#f5f5f5] dark:hover:text-[#f5f5f5] hover:text-[#111827] hover:bg-[#202b36] dark:hover:bg-[#202b36] hover:bg-[#f1f1f1] rounded-full transition-colors"
        :class="{ 'text-[#3390ec]': uiStore.showRightSidebar }"
        title="Chat info"
      >
        <PanelRight class="w-4 h-4" />
      </button>

      <!-- More Options Menu -->
      <div class="relative">
        <button
          @click="showMoreMenu = !showMoreMenu"
          class="p-2 text-[#7f91a4] hover:text-[#f5f5f5] dark:hover:text-[#f5f5f5] hover:text-[#111827] hover:bg-[#202b36] dark:hover:bg-[#202b36] hover:bg-[#f1f1f1] rounded-full transition-colors"
        >
          <MoreVertical class="w-4 h-4" />
        </button>

        <!-- Dropdown Menu -->
        <div
          v-if="showMoreMenu"
          class="absolute right-0 top-11 w-48 bg-[#242f3d] dark:bg-[#242f3d] bg-white rounded-xl shadow-2xl border border-[#202b36] dark:border-[#202b36] border-[#dfe1e5] py-1.5 z-50 text-xs"
        >
          <button
            @click="toggleMute"
            class="w-full px-3.5 py-2 flex items-center gap-2.5 text-[#f5f5f5] dark:text-[#f5f5f5] text-[#111827] hover:bg-[#202b36] dark:hover:bg-[#202b36] hover:bg-[#f1f1f1] text-left"
          >
            <VolumeX v-if="channel.is_muted" class="w-4 h-4 text-[#7f91a4]" />
            <Volume2 v-else class="w-4 h-4 text-[#7f91a4]" />
            <span>{{ channel.is_muted ? 'Unmute' : 'Mute Notifications' }}</span>
          </button>

          <button
            @click="toggleRightSidebar(); showMoreMenu = false"
            class="w-full px-3.5 py-2 flex items-center gap-2.5 text-[#f5f5f5] dark:text-[#f5f5f5] text-[#111827] hover:bg-[#202b36] dark:hover:bg-[#202b36] hover:bg-[#f1f1f1] text-left"
          >
            <PanelRight class="w-4 h-4 text-[#7f91a4]" />
            <span>View Info</span>
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
