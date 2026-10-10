<script setup lang="ts">
import { computed, ref } from 'vue'
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
  getInitials
} from '../../utils/formatters'
import { mmApi } from '../../services/mattermostApi'
import {
  Check,
  CheckCheck,
  Reply,
  Edit2,
  Trash2,
  Pin,
  Copy,
  FileText,
  Download,
  MoreHorizontal
} from 'lucide-vue-next'

const props = defineProps<{
  post: MattermostPost
  showAvatar?: boolean
  showSenderName?: boolean
}>()

const authStore = useAuthStore()
const chatStore = useChatStore()
const usersStore = useUsersStore()
const uiStore = useUiStore()

const showMenu = ref(false)

const myId = computed(() => authStore.currentUser?.id)
const isOutgoing = computed(() => props.post.user_id === myId.value)

const sender = computed(() => usersStore.getUser(props.post.user_id))
const senderName = computed(() => usersStore.getUserDisplayName(props.post.user_id))

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

// Quick reaction emojis
const quickEmojis = ['👍', '❤️', '🔥', '😂', '👏', '😢']

// Group reactions by emoji
const groupedReactions = computed(() => {
  const map: Record<string, { emoji: string; count: number; hasReacted: boolean }> = {}
  const reactions = props.post.metadata?.reactions || []

  for (const r of reactions) {
    if (!map[r.emoji_name]) {
      map[r.emoji_name] = { emoji: r.emoji_name, count: 0, hasReacted: false }
    }
    map[r.emoji_name].count++
    if (r.user_id === myId.value) {
      map[r.emoji_name].hasReacted = true
    }
  }

  return Object.values(map)
})

// File attachments
const files = computed<MattermostFileInfo[]>(() => {
  return props.post.metadata?.files || []
})

const imageFiles = computed(() => {
  return files.value.filter((f) =>
    f.mime_type?.startsWith('image/') ||
    ['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(f.extension?.toLowerCase())
  )
})

const documentFiles = computed(() => {
  return files.value.filter((f) => !imageFiles.value.includes(f))
})

// Actions
function handleReply() {
  uiStore.setReplyingTo(props.post)
  showMenu.value = false
}

function handleEdit() {
  uiStore.setEditingPost(props.post)
  showMenu.value = false
}

async function handleDelete() {
  showMenu.value = false
  if (confirm('Are you sure you want to delete this message?')) {
    await chatStore.deleteMessage(props.post.id)
  }
}

function handleCopy() {
  if (props.post.message) {
    navigator.clipboard.writeText(props.post.message)
  }
  showMenu.value = false
}

function handleQuickReaction(emoji: string) {
  chatStore.toggleReaction(props.post, emoji)
  showMenu.value = false
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
</script>

<template>
  <div
    :id="`msg-${post.id}`"
    class="flex items-end gap-2 my-1 px-4 group relative transition-colors duration-300"
    :class="isOutgoing ? 'justify-end' : 'justify-start'"
  >
    <!-- Sender Avatar (Incoming only in groups) -->
    <div
      v-if="!isOutgoing"
      class="w-8 h-8 rounded-full shrink-0 mb-0.5 overflow-hidden shadow-xs flex items-center justify-center text-white text-[10px] font-bold"
      :style="{ background: getAvatarGradient(post.user_id) }"
    >
      {{ getInitials(senderName) }}
    </div>

    <!-- Bubble Wrapper with Hover Action Bar -->
    <div class="relative max-w-[85%] md:max-w-[70%]">
      <!-- Telegram Hover Action Bar (Pill) -->
      <div
        class="absolute -top-8 hidden group-hover:flex items-center gap-1 bg-[#17212b] dark:bg-[#17212b] bg-white border border-[#202b36] dark:border-[#202b36] border-[#dfe1e5] px-2 py-1 rounded-full shadow-lg z-30 select-none animate-in fade-in duration-150"
        :class="isOutgoing ? 'right-0' : 'left-0'"
      >
        <!-- Quick Emojis -->
        <button
          v-for="emoji in quickEmojis"
          :key="emoji"
          @click="handleQuickReaction(emoji)"
          class="hover:scale-125 text-xs transition-transform px-0.5"
        >
          {{ emoji }}
        </button>

        <div class="w-px h-3 bg-gray-600/40 mx-0.5"></div>

        <!-- Reply Button -->
        <button
          @click="handleReply"
          class="p-0.5 text-[#7f91a4] hover:text-[#3390ec] transition-colors"
          title="Reply"
        >
          <Reply class="w-3.5 h-3.5" />
        </button>

        <!-- Edit Button (Outgoing only) -->
        <button
          v-if="isOutgoing"
          @click="handleEdit"
          class="p-0.5 text-[#7f91a4] hover:text-[#3390ec] transition-colors"
          title="Edit"
        >
          <Edit2 class="w-3.5 h-3.5" />
        </button>

        <!-- Copy -->
        <button
          @click="handleCopy"
          class="p-0.5 text-[#7f91a4] hover:text-[#3390ec] transition-colors"
          title="Copy text"
        >
          <Copy class="w-3.5 h-3.5" />
        </button>

        <!-- Delete Button (Outgoing only) -->
        <button
          v-if="isOutgoing"
          @click="handleDelete"
          class="p-0.5 text-[#7f91a4] hover:text-red-400 transition-colors"
          title="Delete"
        >
          <Trash2 class="w-3.5 h-3.5" />
        </button>
      </div>

      <!-- Message Bubble -->
      <div
        class="rounded-2xl px-3.5 py-2 shadow-tg-bubble relative msg-pop-in"
        :class="[
          isOutgoing
            ? 'bg-[#2b5278] dark:bg-[#2b5278] bg-[#eeffde] text-white dark:text-white text-[#111827] rounded-br-xs'
            : 'bg-[#182533] dark:bg-[#182533] bg-white text-[#f5f5f5] dark:text-[#f5f5f5] text-[#111827] rounded-bl-xs'
        ]"
      >
        <!-- Sender Name (Incoming Group Message) -->
        <div
          v-if="!isOutgoing && showSenderName"
          class="text-xs font-semibold mb-1 text-[#3390ec] truncate cursor-pointer hover:underline"
        >
          {{ senderName }}
        </div>

        <!-- Reply Quote Preview Box -->
        <div
          v-if="parentPost"
          @click="scrollToParent"
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

        <!-- Document Files -->
        <div v-if="documentFiles.length > 0" class="my-1 space-y-1.5 max-w-xs">
          <div
            v-for="doc in documentFiles"
            :key="doc.id"
            @click="openFile(doc)"
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
          class="text-xs sm:text-[13px] leading-relaxed break-words text-auto"
          dir="auto"
          v-html="renderTelegramMarkdown(post.message)"
        ></div>

        <!-- Bubble Footer: Timestamp & Read Status -->
        <div class="flex items-center justify-end gap-1 mt-1 text-[10px] select-none float-right ml-2 opacity-75">
          <!-- Edited indicator -->
          <span v-if="post.edit_at > 0" class="italic opacity-60">edited</span>

          <!-- Pinned Icon -->
          <Pin v-if="post.is_pinned" class="w-2.5 h-2.5 opacity-60" />

          <!-- Time -->
          <span>{{ formatMessageTime(post.create_at) }}</span>

          <!-- Telegram Read / Sent Ticks (Outgoing only) -->
          <div v-if="isOutgoing" class="flex items-center ml-0.5">
            <!-- Double check for read, single check for sent -->
            <CheckCheck class="w-3.5 h-3.5 text-emerald-400" />
          </div>
        </div>
        <div class="clear-both"></div>
      </div>

      <!-- Emoji Reactions Pills Below Bubble -->
      <div v-if="groupedReactions.length > 0" class="flex flex-wrap gap-1 mt-1">
        <button
          v-for="r in groupedReactions"
          :key="r.emoji"
          @click="handleQuickReaction(r.emoji)"
          class="px-2 py-0.5 rounded-full text-xs flex items-center gap-1 transition-all border select-none"
          :class="[
            r.hasReacted
              ? 'bg-[#3390ec]/20 border-[#3390ec] text-[#3390ec] font-semibold'
              : 'bg-[#182533] dark:bg-[#182533] bg-white border-[#202b36] text-[#7f91a4] hover:border-gray-500'
          ]"
        >
          <span>{{ r.emoji }}</span>
          <span class="text-[10px]">{{ r.count }}</span>
        </button>
      </div>
    </div>
  </div>
</template>
