<script setup lang="ts">
import { computed, ref, watch, onMounted } from 'vue'
import type { MattermostPost, MattermostFileInfo } from '../../types/mattermost'
import { useAuthStore } from '../../stores/auth'
import { useChatStore } from '../../stores/chat'
import { useUsersStore } from '../../stores/users'
import { useUiStore } from '../../stores/ui'
import {
  formatMessageTime,
  renderTelegramMarkdown,
  formatFileSize,
  getAvatarGradient,
  getInitials,
  toEmojiChar,
  toEmojiName
} from '../../utils/formatters'
import { mmApi } from '../../services/mattermostApi'
import {
  Check,
  CheckCheck,
  Clock,
  Pin,
  FileText,
  Download,
  SmilePlus,
  Eye
} from 'lucide-vue-next'
import TelegramAvatar from '../common/TelegramAvatar.vue'
import ReactionPicker from './ReactionPicker.vue'
import { recordReactionUsage } from '../../utils/reactions'

const props = defineProps<{
  post: MattermostPost
  showAvatar?: boolean
  showSenderName?: boolean
}>()

const emit = defineEmits<{
  (e: 'contextmenu', event: MouseEvent): void
  (e: 'open-viewers', post: MattermostPost, tab?: 'viewers' | 'reactions'): void
}>()

const authStore = useAuthStore()
const chatStore = useChatStore()
const usersStore = useUsersStore()
const uiStore = useUiStore()

const showMenu = ref(false)

const myId = computed(() => authStore.currentUser?.id)
const isOutgoing = computed(() => props.post.user_id === myId.value)

const isPending = computed(() => !!props.post.id?.startsWith('temp_'))
const isAnimated = ref(false)

onMounted(() => {
  if (
    isPending.value ||
    chatStore.animatedPostIds.has(props.post.id) ||
    (props.post.pending_post_id && chatStore.animatedPostIds.has(props.post.pending_post_id))
  ) {
    isAnimated.value = true
    setTimeout(() => {
      isAnimated.value = false
      chatStore.animatedPostIds.delete(props.post.id)
      if (props.post.pending_post_id) {
        chatStore.animatedPostIds.delete(props.post.pending_post_id)
      }
    }, 450)
  }
})

const sender = computed(() => usersStore.getUser(props.post.user_id))
const senderName = computed(() => usersStore.getUserDisplayName(props.post.user_id))

// Cached rendered markdown and formatted time
const renderedMessage = computed(() => renderTelegramMarkdown(props.post.message))
const formattedTime = computed(() => formatMessageTime(props.post.create_at))
const viewersCount = computed(() => chatStore.getPostViewersCount(props.post))

// Parent post if this is a reply
const parentPost = computed(() => {
  if (!props.post.root_id) return null
  const channelPosts = chatStore.posts[props.post.channel_id] || []
  return channelPosts.find((p) => p.id === props.post.root_id) || null
})

const parentSenderName = computed(() => {
  if (!parentPost.value) return 'Message'
  return usersStore.getUserDisplayName(parentPost.value.user_id)
})

const showReactionPicker = ref(false)

export interface ReactionGroup {
  emoji: string
  rawName: string
  count: number
  hasReacted: boolean
  userIds: string[]
  users: Array<{ id: string; name: string; isMe: boolean }>
}

// Group reactions by emoji (mapping Mattermost shortcode names to Telegram emoji chars)
const groupedReactions = computed<ReactionGroup[]>(() => {
  const map: Record<string, ReactionGroup> = {}
  const reactions = props.post.metadata?.reactions || []

  for (const r of reactions) {
    const rawName = r.emoji_name
    const char = toEmojiChar(rawName)
    const key = char

    if (!map[key]) {
      map[key] = {
        emoji: char,
        rawName,
        count: 0,
        hasReacted: false,
        userIds: [],
        users: []
      }
    }

    // Deduplicate: each user can only react once per emoji
    if (!map[key].userIds.includes(r.user_id)) {
      map[key].count++
      map[key].userIds.push(r.user_id)
      const isMe = r.user_id === myId.value
      if (isMe) {
        map[key].hasReacted = true
      }
      const name = isMe ? 'You' : usersStore.getUserDisplayName(r.user_id)
      map[key].users.push({ id: r.user_id, name, isMe })
    }
  }

  return Object.values(map)
})

// Prefetch user details for reactions if missing
watch(
  () => props.post.metadata?.reactions,
  (reactions) => {
    if (reactions && reactions.length > 0) {
      const ids = reactions.map((r) => r.user_id).filter(Boolean)
      usersStore.fetchUsers(ids)
    }
  },
  { immediate: true }
)

function onReactionHover(r: ReactionGroup) {
  const missing = r.userIds.filter((id) => !usersStore.getUser(id))
  if (missing.length > 0) {
    usersStore.fetchUsers(missing)
  }
}

function getReactionTooltipTitle(r: ReactionGroup): string {
  const names = r.users.map((u) => u.isMe ? 'You' : usersStore.getUserDisplayName(u.id))
  return `${r.emoji} ${names.join(', ')}`
}

function openViewersModal(tab: 'viewers' | 'reactions' = 'reactions') {
  emit('open-viewers', props.post, tab)
}

// File attachments
const files = computed<MattermostFileInfo[]>(() => {
  return props.post.metadata?.files || []
})

const isVideoFile = (f: MattermostFileInfo) => {
  const ext = f.extension?.toLowerCase() || ''
  const mime = f.mime_type?.toLowerCase() || ''
  return mime.startsWith('video/') || ['mp4', 'webm', 'mov', 'm4v', 'mkv', 'ogg'].includes(ext)
}

const isImageFile = (f: MattermostFileInfo) => {
  const ext = f.extension?.toLowerCase() || ''
  const mime = f.mime_type?.toLowerCase() || ''
  return (mime.startsWith('image/') || ['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(ext)) && !isVideoFile(f)
}

const imageFiles = computed(() => files.value.filter(isImageFile))
const videoFiles = computed(() => files.value.filter(isVideoFile))
const documentFiles = computed(() => files.value.filter((f) => !isImageFile(f) && !isVideoFile(f)))

// Actions
function handleReply() {
  uiStore.setReplyingTo(props.post)
  showMenu.value = false
}

function flashBubble() {
  const el = document.getElementById(`msg-${props.post.id}`)
  if (el) {
    el.classList.add('bg-[#3390ec]/15')
    setTimeout(() => el.classList.remove('bg-[#3390ec]/15'), 400)
  }
}

function handleBubbleDoubleClick(event: MouseEvent) {
  const target = event.target as HTMLElement | null
  if (!target) return

  // Do not reply if user clicked on interactive or special elements
  if (
    target.closest('a, button, input, textarea, video, audio, [data-mention], .tg-spoiler, [data-no-bubble-reply]')
  ) {
    return
  }

  // Clear any word selection caused by the browser's native double-click
  window.getSelection()?.removeAllRanges()

  flashBubble()
  handleReply()
}

// Mobile double-tap support
let touchStartX = 0
let touchStartY = 0
let touchMoved = false
let lastTouchTapTime = 0

function handleBubbleTouchStart(e: TouchEvent) {
  if (e.touches.length === 1) {
    touchStartX = e.touches[0].clientX
    touchStartY = e.touches[0].clientY
    touchMoved = false
  }
}

function handleBubbleTouchMove(e: TouchEvent) {
  if (e.touches.length === 1) {
    const dx = Math.abs(e.touches[0].clientX - touchStartX)
    const dy = Math.abs(e.touches[0].clientY - touchStartY)
    if (dx > 10 || dy > 10) {
      touchMoved = true
    }
  }
}

function handleBubbleTouchEnd(e: TouchEvent) {
  if (touchMoved) return
  const target = e.target as HTMLElement | null
  if (!target) return

  if (
    target.closest('a, button, input, textarea, video, audio, [data-mention], .tg-spoiler, [data-no-bubble-reply]')
  ) {
    return
  }

  const now = Date.now()
  if (now - lastTouchTapTime < 350) {
    window.getSelection()?.removeAllRanges()
    flashBubble()
    handleReply()
    lastTouchTapTime = 0
  } else {
    lastTouchTapTime = now
  }
}

function handleQuickReaction(emoji: string) {
  recordReactionUsage(emoji)
  chatStore.toggleReaction(props.post, emoji)
  showMenu.value = false
  showReactionPicker.value = false
}

function scrollToParent() {
  if (!parentPost.value) return
  const el = document.getElementById(`msg-${parentPost.value.id}`)
  if (el) {
    el.scrollIntoView({ behavior: 'smooth', block: 'center' })
    el.classList.add('bg-blue-500/20')
    setTimeout(() => el.classList.remove('bg-blue-500/20'), 1500)
  }
}

function openFile(file: MattermostFileInfo) {
  uiStore.openFilePreview(file)
}

// Handle mention or spoiler click inside message text
async function handleTextClick(e: MouseEvent) {
  const spoilerTarget = (e.target as HTMLElement).closest('.tg-spoiler') as HTMLElement | null
  if (spoilerTarget) {
    spoilerTarget.classList.toggle('revealed')
    return
  }

  const target = (e.target as HTMLElement).closest('[data-mention]') as HTMLElement | null
  if (!target) return
  e.preventDefault()
  e.stopPropagation()

  const rawUsername = target.getAttribute('data-mention')
  if (!rawUsername) return

  const clean = rawUsername.toLowerCase().trim()
  const BROADCAST_TAGS = ['all', 'channel', 'here']

  // 1. If broadcast mention tag (@all, @channel, @here)
  if (BROADCAST_TAGS.includes(clean)) {
    uiStore.openMentionModal({
      type: 'broadcast',
      username: rawUsername
    })
    return
  }

  // 2. Regular user mention: show loading state
  uiStore.openMentionModal({
    type: 'loading',
    username: rawUsername
  })

  // 3. Look up user by username
  const foundUser = await usersStore.fetchUserByUsername(clean)
  if (foundUser) {
    uiStore.updateMentionModal({
      type: 'user',
      username: rawUsername,
      user: foundUser
    })
  } else {
    uiStore.updateMentionModal({
      type: 'not_found',
      username: rawUsername
    })
  }
}

// Handle clicking on sender's avatar or name
function handleSenderClick() {
  if (sender.value) {
    uiStore.openMentionModal({
      type: 'user',
      username: sender.value.username,
      user: sender.value
    })
  }
}
</script>

<template>
  <div
    :id="`msg-${post.id}`"
    class="flex items-end gap-1.5 my-1 px-0.5 sm:px-1 group relative transition-colors duration-150 tg-message-row w-full rounded-lg hover:z-20"
    :class="isOutgoing ? 'justify-end' : 'justify-start'"
    @contextmenu.prevent="emit('contextmenu', $event)"
  >
    <!-- Sender Avatar (Incoming only in groups) -->
    <TelegramAvatar
      v-if="!isOutgoing && showAvatar"
      :userId="post.user_id"
      :name="senderName"
      size="sm"
      :lastPictureUpdate="(sender as any)?.last_picture_update"
      class="mb-0.5 shrink-0 cursor-pointer hover:opacity-85 transition-opacity"
      @click.stop="handleSenderClick"
    />

    <!-- Bubble Wrapper -->
    <div
      class="relative max-w-[88%] sm:max-w-[82%] md:max-w-[75%]"
      :class="[
        isAnimated
          ? (isOutgoing ? 'tg-msg-send-glide' : 'tg-msg-receive-glide')
          : ''
      ]"
    >
      <!-- Full Reaction Picker Popover -->
      <div
        v-if="showReactionPicker"
        class="absolute z-50 bottom-full mb-2"
        :class="isOutgoing ? 'right-0' : 'left-0'"
        @click.stop
      >
        <ReactionPicker
          :align-right="isOutgoing"
          @select="handleQuickReaction"
          @close="showReactionPicker = false"
        />
      </div>

      <!-- Message Bubble -->
      <div
        @dblclick="handleBubbleDoubleClick"
        @touchstart.passive="handleBubbleTouchStart"
        @touchmove.passive="handleBubbleTouchMove"
        @touchend="handleBubbleTouchEnd"
        class="rounded-2xl px-3.5 py-2 shadow-tg-bubble relative"
        :class="[
          isOutgoing
            ? 'bg-[#eeffde] dark:bg-[#2b5278] text-[#111827] dark:text-white rounded-br-none bubble-out-tail mr-1.5'
            : 'bg-white dark:bg-[#182533] text-[#111827] dark:text-[#f5f5f5] rounded-bl-none bubble-in-tail ml-1.5'
        ]"
      >
        <!-- Sender Name (Incoming Group Message) -->
        <div
          v-if="!isOutgoing && showSenderName"
          @click.stop="handleSenderClick"
          data-no-bubble-reply
          class="text-xs font-semibold mb-1 text-[#3390ec] truncate cursor-pointer hover:underline"
        >
          {{ senderName }}
        </div>

        <!-- Reply Quote Preview Box -->
        <div
          v-if="parentPost"
          @click="scrollToParent"
          data-no-bubble-reply
          class="mb-1.5 pl-2 border-l-2 border-[#3390ec] bg-black/15 rounded-r py-1 pr-2 cursor-pointer text-xs"
        >
          <div class="font-semibold text-[#3390ec] text-[11px] truncate">
            {{ parentSenderName }}
          </div>
          <div class="text-[11px] opacity-75 truncate">
            {{ parentPost.message || 'Attachment' }}
          </div>
        </div>

        <!-- Image Files Grid -->
        <div v-if="imageFiles.length > 0" class="my-1.5 grid gap-1.5 max-w-sm rounded-xl overflow-hidden">
          <div
            v-for="img in imageFiles"
            :key="img.id"
            @click="openFile(img)"
            data-no-bubble-reply
            class="cursor-pointer overflow-hidden rounded-lg relative group/img bg-black/20"
          >
            <img
              :src="mmApi.getFilePreviewUrl(img.id)"
              :alt="img.name"
              class="w-full max-h-60 object-cover hover:scale-102 transition-transform duration-200"
              loading="lazy"
            />
          </div>
        </div>

        <!-- Video Files (Playable directly inside chat) -->
        <div v-if="videoFiles.length > 0" class="my-1.5 space-y-2 max-w-sm sm:max-w-md rounded-2xl overflow-hidden">
          <div
            v-for="vid in videoFiles"
            :key="vid.id"
            class="rounded-xl overflow-hidden bg-black/40 border border-white/10 shadow-md relative group/vid"
          >
            <video
              :src="mmApi.getFileDownloadUrl(vid.id)"
              controls
              preload="metadata"
              playsinline
              class="w-full max-h-72 object-contain bg-black rounded-t-xl"
            >
              Your browser does not support playing this video.
            </video>
            <!-- Video Meta Bar -->
            <div class="px-3 py-1.5 flex items-center justify-between text-xs bg-black/30 backdrop-blur-xs">
              <span class="truncate max-w-[200px] text-white/90 text-[11px] font-medium" :title="vid.name">
                {{ vid.name }}
              </span>
              <div class="flex items-center gap-2 shrink-0">
                <span class="text-[10px] text-white/60">{{ formatFileSize(vid.size) }}</span>
                <a
                  :href="mmApi.getFileDownloadUrl(vid.id)"
                  :download="vid.name"
                  target="_blank"
                  @click.stop
                  class="p-1 text-white/70 hover:text-white rounded-full transition-colors"
                  title="Download"
                >
                  <Download class="w-3.5 h-3.5" />
                </a>
              </div>
            </div>
          </div>
        </div>

        <!-- Document Files -->
        <div v-if="documentFiles.length > 0" class="my-1 space-y-1.5 max-w-xs">
          <div
            v-for="doc in documentFiles"
            :key="doc.id"
            @click="openFile(doc)"
            data-no-bubble-reply
            class="flex items-center gap-3 p-2 bg-black/15 hover:bg-black/25 rounded-xl cursor-pointer transition-colors"
          >
            <!-- Doc Icon -->
            <div class="w-10 h-10 rounded-lg bg-[#2481cc] flex items-center justify-center text-white shrink-0">
              <FileText class="w-5 h-5" />
            </div>

            <!-- Doc Info -->
            <div class="flex-1 min-w-0 pr-1">
              <p class="text-xs font-semibold truncate">{{ doc.name }}</p>
              <p class="text-[10px] opacity-70">{{ formatFileSize(doc.size) }}</p>
            </div>

            <!-- Download -->
            <a
              :href="mmApi.getFileDownloadUrl(doc.id)"
              :download="doc.name"
              target="_blank"
              @click.stop
              class="p-1.5 text-white/80 hover:text-white rounded-full transition-colors"
            >
              <Download class="w-4 h-4" />
            </a>
          </div>
        </div>

        <!-- Message Body Text -->
        <div
          v-if="post.message"
          class="text-xs sm:text-[13px] leading-relaxed break-words text-auto select-text cursor-default tg-markdown"
          dir="auto"
          v-html="renderedMessage"
          @click="handleTextClick"
        ></div>

        <!-- Bubble Footer: Timestamp & Read Status -->
        <div
          class="flex items-center justify-end gap-1 mt-1 text-[10px] select-none float-right ml-2 opacity-75 cursor-pointer hover:opacity-100 transition-opacity"
          @click.stop="openViewersModal('viewers')"
          title="Message info and viewers"
        >
          <!-- Edited indicator -->
          <span v-if="post.edit_at > 0" class="italic opacity-60">edited</span>

          <!-- Pinned Icon -->
          <Pin v-if="post.is_pinned" class="w-2.5 h-2.5 opacity-60" />

          <!-- Telegram-style Eye View Count -->
          <span
            v-if="viewersCount > 0"
            class="flex items-center gap-0.5 text-[9px] opacity-75 mr-0.5 hover:text-[#3390ec] transition-colors"
            title="Views"
          >
            <Eye class="w-2.5 h-2.5" />
            <span>{{ viewersCount }}</span>
          </span>

          <!-- Time -->
          <span>{{ formattedTime }}</span>

          <!-- Telegram Read / Sent Ticks (Outgoing only) -->
          <div v-if="isOutgoing" class="flex items-center ml-0.5">
            <!-- Sending state: Clock icon -->
            <Clock v-if="isPending" class="w-3 h-3 opacity-60 animate-pulse text-[#7f91a4]" />
            <!-- Double check for read/seen -->
            <CheckCheck v-else-if="chatStore.isPostSeen(post)" class="w-3.5 h-3.5 text-emerald-400" />
            <!-- Single check for sent/delivered but unread -->
            <Check v-else class="w-3.5 h-3.5 text-emerald-400/75" />
          </div>
        </div>
        <div class="clear-both"></div>
      </div>

      <!-- Emoji Reactions Pills Below Bubble -->
      <div
        v-if="groupedReactions.length > 0"
        class="flex flex-wrap gap-1 mt-1"
        :class="isOutgoing ? 'justify-end' : 'justify-start'"
      >
        <div
          v-for="r in groupedReactions"
          :key="r.emoji"
          class="relative group/react hover:z-30"
          @mouseenter="onReactionHover(r)"
        >
          <button
            @click="handleQuickReaction(r.rawName || r.emoji)"
            :title="getReactionTooltipTitle(r)"
            class="px-2 py-0.5 rounded-full text-xs flex items-center gap-1 transition-all border select-none cursor-pointer"
            :class="[
              r.hasReacted
                ? 'bg-[#3390ec]/20 border-[#3390ec] text-[#3390ec] font-semibold'
                : 'bg-white dark:bg-[#182533] border-[#dfe1e5] dark:border-[#202b36] text-[#7f91a4] hover:border-gray-500'
            ]"
          >
            <span>{{ r.emoji }}</span>
            <span class="text-[10px]">{{ r.count }}</span>
          </button>

          <!-- Telegram Reactions User List Tooltip / Popover on Hover -->
          <div
            class="absolute bottom-full mb-1.5 z-50 pointer-events-none group-hover/react:pointer-events-auto opacity-0 group-hover/react:opacity-100 transition-all duration-150 delay-75 translate-y-1 group-hover/react:translate-y-0 after:absolute after:inset-x-0 after:-bottom-2 after:h-2 after:content-['']"
            :class="isOutgoing ? 'right-0' : 'left-0'"
          >
            <div
              class="bg-white dark:bg-[#17212b] border border-[#dfe1e5] dark:border-[#202b36] shadow-2xl rounded-xl py-1.5 px-2.5 text-xs min-w-[140px] max-w-[240px] whitespace-normal backdrop-blur-md"
            >
              <!-- Tooltip Header -->
              <div
                class="flex items-center justify-between gap-1.5 pb-1 mb-1 border-b border-gray-200 dark:border-[#202b36] text-[11px] font-semibold text-[#7f91a4]"
              >
                <div class="flex items-center gap-1.5">
                  <span class="text-sm leading-none">{{ r.emoji }}</span>
                  <span>{{ r.count }} {{ r.count === 1 ? 'reaction' : 'reactions' }}</span>
                </div>
                <button
                  @click.stop="openViewersModal('reactions')"
                  class="text-[10px] text-[#3390ec] hover:underline cursor-pointer"
                  title="View all reactions"
                >
                  All
                </button>
              </div>

              <!-- Users who reacted -->
              <div class="space-y-1">
                <div
                  v-for="u in r.users.slice(0, 7)"
                  :key="u.id"
                  class="flex items-center gap-1.5"
                >
                  <TelegramAvatar
                    :userId="u.id"
                    :name="usersStore.getUserDisplayName(u.id)"
                    size="micro"
                  />
                  <span
                    class="truncate text-[11px] font-medium"
                    :class="u.isMe ? 'text-[#3390ec] font-semibold' : 'text-[#111827] dark:text-[#f5f5f5]'"
                  >
                    {{ u.isMe ? 'You' : usersStore.getUserDisplayName(u.id) }}
                  </span>
                </div>

                <!-- More users overflow -->
                <button
                  v-if="r.users.length > 7"
                  @click.stop="openViewersModal('reactions')"
                  class="text-[10px] text-[#3390ec] hover:underline pt-0.5 font-medium cursor-pointer block text-left"
                >
                  +{{ r.users.length - 7 }} more
                </button>
              </div>
            </div>
          </div>
        </div>

        <!-- Add Reaction Button Pill (+) -->
        <button
          @click.stop="showReactionPicker = !showReactionPicker"
          title="Add reaction"
          class="px-2 py-0.5 rounded-full text-xs flex items-center justify-center bg-white dark:bg-[#182533] border border-[#dfe1e5] dark:border-[#202b36] text-[#7f91a4] hover:text-[#3390ec] hover:border-[#3390ec]/50 transition-colors select-none cursor-pointer"
        >
          <SmilePlus class="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  </div>
</template>
