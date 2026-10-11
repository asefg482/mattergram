<script setup lang="ts">
import { computed } from 'vue'
import type { MattermostChannel, MattermostPost, MattermostFileInfo } from '../../types/mattermost'
import { useAuthStore } from '../../stores/auth'
import { useChatStore } from '../../stores/chat'
import { useUsersStore } from '../../stores/users'
import { useUiStore } from '../../stores/ui'
import { getAvatarGradient, getInitials, formatChatListTime } from '../../utils/formatters'
import { Bookmark, Hash, Lock, Pin, VolumeX, FileText } from 'lucide-vue-next'
import TelegramAvatar from '../common/TelegramAvatar.vue'

const props = defineProps<{
  channel: MattermostChannel
  isActive: boolean
}>()

const emit = defineEmits<{
  (e: 'contextmenu', event: MouseEvent): void
}>()

const authStore = useAuthStore()
const chatStore = useChatStore()
const usersStore = useUsersStore()
const uiStore = useUiStore()

const myId = computed(() => authStore.currentUser?.id)

function handleAvatarClick() {
  if (isDirect.value && props.channel.dm_user) {
    uiStore.openMentionModal({
      type: 'user',
      username: props.channel.dm_user.username,
      user: props.channel.dm_user
    })
  }
}

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

// Latest post computed from channel.last_post or cached chatStore.posts
const lastPost = computed<MattermostPost | null>(() => {
  if (props.channel.last_post) {
    return props.channel.last_post
  }
  const channelPosts = chatStore.posts[props.channel.id]
  if (channelPosts && channelPosts.length > 0) {
    return channelPosts[channelPosts.length - 1]
  }
  return null
})

// Last message preview
const lastMessagePreview = computed(() => {
  if (typingText.value) return typingText.value

  const post = lastPost.value
  if (!post) {
    return props.channel.purpose || props.channel.header || ''
  }

  const isMe = post.user_id === myId.value
  const prefix = isMe ? 'You: ' : (!isDirect.value ? `${usersStore.getUserDisplayName(post.user_id)}: ` : '')

  if (post.message && post.message.trim()) {
    const clean = post.message.replace(/[\r\n]+/g, ' ').trim()
    return `${prefix}${clean}`
  }

  if (post.file_ids && post.file_ids.length > 0) {
    const files = (post.metadata?.files || []) as MattermostFileInfo[]
    if (files.some((f: MattermostFileInfo) => f.mime_type?.startsWith('video/') || ['mp4', 'webm', 'mov', 'm4v', 'mkv'].includes(f.extension?.toLowerCase() || ''))) {
      return `${prefix}📹 Video`
    }
    if (files.some((f: MattermostFileInfo) => f.mime_type?.startsWith('image/'))) {
      return `${prefix}🖼 Photo`
    }
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
    class="flex items-center gap-3 px-3 py-2.5 cursor-pointer select-none transition-colors relative group tg-chat-item"
    :class="[
      isActive
        ? 'bg-[#3390ec] dark:bg-[#2b5278] text-white'
        : 'hover:bg-[#f1f1f1] dark:hover:bg-[#202b36] text-[#111827] dark:text-[#f5f5f5]'
    ]"
    @contextmenu.prevent="emit('contextmenu', $event)"
  >
    <!-- Avatar with Online Indicator -->
    <div
      v-if="isDirect && channel.dm_user"
      @click.stop="handleAvatarClick"
      class="shrink-0 cursor-pointer hover:opacity-85 transition-opacity"
      title="View user profile"
    >
      <TelegramAvatar
        :userId="channel.dm_user.id"
        :name="channel.display_name || channel.name"
        size="lg"
        :showOnlineDot="true"
        :isOnline="isOnline"
        :lastPictureUpdate="(channel.dm_user as any)?.last_picture_update"
      />
    </div>
    <TelegramAvatar
      v-else
      :userId="channel.dm_user?.id"
      :name="channel.display_name || channel.name"
      size="lg"
      :isSavedMessages="isSavedMessages"
      :showOnlineDot="true"
      :isOnline="isOnline"
      :lastPictureUpdate="(channel.dm_user as any)?.last_picture_update"
    />

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
            :class="isActive ? 'text-white' : 'text-[#111827] dark:text-[#f5f5f5]'"
          >
            {{ channel.display_name || channel.name }}
          </h3>
        </div>

        <!-- Timestamp -->
        <span
          class="text-xs shrink-0 ml-2"
          :class="isActive ? 'text-white/80' : 'text-[#7f91a4]'"
        >
          {{ formatChatListTime(lastPost?.create_at || channel.last_post_at || channel.create_at) }}
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

          <!-- Telegram Unread Badge (Circle/Pill) -->
          <span
            v-if="unreadCount > 0"
            class="inline-flex items-center justify-center h-5 min-w-5 rounded-full text-[11px] font-bold leading-none select-none transition-colors"
            :class="[
              String(unreadCount).length > 1 ? 'px-1.5' : 'w-5 p-0',
              isActive ? 'bg-white text-[#2b5278]' : 'bg-[#4fae60] text-white'
            ]"
            style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; font-variant-numeric: tabular-nums;"
          ><span class="inline-block transform -translate-y-[0.5px]">{{ unreadCount > 99 ? '99+' : unreadCount }}</span></span>
        </div>
      </div>
    </div>
  </div>
</template>
