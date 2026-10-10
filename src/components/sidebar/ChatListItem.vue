<script setup lang="ts">
import { computed } from 'vue'
import type { MattermostChannel } from '../../types/mattermost'
import { useAuthStore } from '../../stores/auth'
import { useChatStore } from '../../stores/chat'
import { useUsersStore } from '../../stores/users'
import { getAvatarGradient, getInitials, formatChatListTime } from '../../utils/formatters'
import { Bookmark, Hash, Lock, Pin, VolumeX, FileText } from 'lucide-vue-next'

const props = defineProps<{
  channel: MattermostChannel
  isActive: boolean
}>()

const authStore = useAuthStore()
const chatStore = useChatStore()
const usersStore = useUsersStore()

const myId = computed(() => authStore.currentUser?.id)

const isSavedMessages = computed(() => {
  return props.channel.display_name === 'Saved Messages'
})

const isDirect = computed(() => props.channel.type === 'D')
const isPrivate = computed(() => props.channel.type === 'P')
const isPublic = computed(() => props.channel.type === 'O')

// User status for DM
const otherUserStatus = computed(() => {
  if (!isDirect.value || isSavedMessages.value || !props.channel.dm_user) return 'offline'
  return usersStore.getStatus(props.channel.dm_user.id)
})

const isOnline = computed(() => otherUserStatus.value === 'online')

// Typing indicator for this channel
const typingText = computed(() => {
  const typers = chatStore.typingUsers[props.channel.id]
  if (!typers) return ''
  const names = Object.values(typers)
  if (!names.length) return ''
  if (names.length === 1) return `${names[0]} is typing...`
  return `${names.length} people are typing...`
})

// Unread count
const unreadCount = computed(() => chatStore.unreadCounts[props.channel.id] || 0)

// Last message preview
const lastMessagePreview = computed(() => {
  if (typingText.value) return typingText.value

  const post = props.channel.last_post
  if (!post) {
    return props.channel.purpose || props.channel.header || 'No messages yet'
  }

  const isMe = post.user_id === myId.value
  const prefix = isMe ? 'You: ' : (!isDirect.value ? `${usersStore.getUserDisplayName(post.user_id)}: ` : '')

  if (post.message) {
    return `${prefix}${post.message}`
  }

  if (post.file_ids && post.file_ids.length > 0) {
    return `${prefix}📎 Document/File`
  }

  return `${prefix}Message`
})

// Avatar initials or icon
const avatarInitials = computed(() => {
  return getInitials(props.channel.display_name || props.channel.name)
})

const avatarBg = computed(() => {
  return getAvatarGradient(props.channel.id)
})
</script>

<template>
  <div
    class="flex items-center gap-3 px-3 py-2.5 cursor-pointer select-none transition-colors relative group"
    :class="[
      isActive
        ? 'bg-[#2b5278] dark:bg-[#2b5278] bg-[#3390ec] text-white'
        : 'hover:bg-[#202b36] dark:hover:bg-[#202b36] hover:bg-[#f1f1f1] text-[#f5f5f5] dark:text-[#f5f5f5] text-[#111827]'
    ]"
  >
    <!-- Avatar Container with Online Indicator -->
    <div class="relative shrink-0">
      <!-- Saved messages icon avatar -->
      <div
        v-if="isSavedMessages"
        class="w-12 h-12 rounded-full bg-[#2481cc] flex items-center justify-center text-white shadow"
      >
        <Bookmark class="w-6 h-6 fill-white" />
      </div>

      <!-- Regular Chat Avatar -->
      <div
        v-else
        class="w-12 h-12 rounded-full flex items-center justify-center text-white font-semibold text-sm shadow overflow-hidden"
        :style="{ background: avatarBg }"
      >
        <span>{{ avatarInitials }}</span>
      </div>

      <!-- Telegram Online Dot (Green) -->
      <div
        v-if="isOnline && !isSavedMessages"
        class="absolute bottom-0 right-0 w-3.5 h-3.5 rounded-full bg-[#4fae60] border-2"
        :class="isActive ? 'border-[#2b5278]' : 'border-[#17212b] dark:border-[#17212b] border-white'"
      ></div>
    </div>

    <!-- Chat Details -->
    <div class="flex-1 min-w-0 pr-1">
      <!-- Title & Time Row -->
      <div class="flex items-center justify-between mb-1">
        <div class="flex items-center gap-1.5 min-w-0">
          <!-- Channel Type Icon -->
          <Lock v-if="isPrivate" class="w-3.5 h-3.5 shrink-0 opacity-70" />
          <Hash v-else-if="isPublic" class="w-3.5 h-3.5 shrink-0 opacity-70" />

          <!-- Title -->
          <h3
            class="text-sm font-semibold truncate"
            :class="isActive ? 'text-white' : 'text-[#f5f5f5] dark:text-[#f5f5f5] text-[#111827]'"
          >
            {{ channel.display_name || channel.name }}
          </h3>
        </div>

        <!-- Timestamp -->
        <span
          class="text-xs shrink-0 ml-2"
          :class="isActive ? 'text-white/80' : 'text-[#7f91a4]'"
        >
          {{ formatChatListTime(channel.last_post_at || channel.create_at) }}
        </span>
      </div>

      <!-- Subtitle & Badges Row -->
      <div class="flex items-center justify-between text-xs">
        <!-- Message Snippet / Typing Indicator -->
        <p
          class="truncate min-w-0 pr-2"
          :class="[
            typingText
              ? (isActive ? 'text-emerald-200 font-medium' : 'text-[#3390ec] font-medium')
              : (isActive ? 'text-white/80' : 'text-[#7f91a4]')
          ]"
        >
          {{ lastMessagePreview }}
        </p>

        <!-- Status Badges -->
        <div class="flex items-center gap-1.5 shrink-0">
          <Pin v-if="channel.is_pinned" class="w-3.5 h-3.5 opacity-60" />
          <VolumeX v-if="channel.is_muted" class="w-3.5 h-3.5 opacity-60" />

          <!-- Telegram Unread Badge (Pill) -->
          <span
            v-if="unreadCount > 0"
            class="px-1.5 py-0.5 rounded-full text-[11px] font-bold"
            :class="isActive ? 'bg-white text-[#2b5278]' : 'bg-[#4fae60] text-white'"
          >
            {{ unreadCount }}
          </span>
        </div>
      </div>
    </div>
  </div>
</template>
