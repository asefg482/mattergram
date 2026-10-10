<script setup lang="ts">
import { ref, computed, watch, nextTick } from 'vue'
import { useAuthStore } from '../../stores/auth'
import { useChatStore } from '../../stores/chat'
import { useUsersStore } from '../../stores/users'
import { useUiStore } from '../../stores/ui'
import { mmApi } from '../../services/mattermostApi'
import EmojiPicker from './EmojiPicker.vue'
import TelegramAvatar from '../common/TelegramAvatar.vue'
import type { MattermostFileInfo, MattermostUser } from '../../types/mattermost'
import {
  Paperclip,
  Smile,
  Send,
  Mic,
  X,
  FileText,
  Loader2,
  Edit2,
  Reply,
  AtSign
} from 'lucide-vue-next'

const props = defineProps<{
  channelId: string
}>()

const authStore = useAuthStore()
const chatStore = useChatStore()
const usersStore = useUsersStore()
const uiStore = useUiStore()

const messageText = ref('')
const textareaRef = ref<HTMLTextAreaElement | null>(null)
const fileInputRef = ref<HTMLInputElement | null>(null)
const showEmojiPicker = ref(false)

const attachedFiles = ref<MattermostFileInfo[]>([])
const isUploading = ref(false)
const isSending = ref(false)

// Mentions State
const channelMembers = ref<MattermostUser[]>([])
const showMentions = ref(false)
const mentionQuery = ref('')
const mentionStartIndex = ref(-1)
const selectedMentionIndex = ref(0)

let lastTypingTime = 0

// Watch editing post
watch(
  () => uiStore.editingPost,
  (post) => {
    if (post) {
      messageText.value = post.message
      nextTick(() => {
        textareaRef.value?.focus()
        autoResize()
      })
    }
  }
)

// Load channel members for mention autocomplete
async function loadChannelMembers() {
  if (!props.channelId) return
  try {
    const raw = await mmApi.getChannelMembers(props.channelId)
    const userIds = raw.map((m: any) => m.user_id)
    await usersStore.fetchUsers(userIds)
    channelMembers.value = userIds
      .map((id: string) => usersStore.getUser(id))
      .filter(Boolean) as MattermostUser[]
  } catch {
    // Fallback to all cached users in store
    channelMembers.value = Object.values(usersStore.users)
  }
}

watch(
  () => props.channelId,
  () => {
    loadChannelMembers()
    showMentions.value = false
  },
  { immediate: true }
)

// Computed Candidates for Mention
const mentionCandidates = computed(() => {
  const currentUserId = authStore.currentUser?.id
  const userList = channelMembers.value.length > 0 ? channelMembers.value : Object.values(usersStore.users)

  const list: Array<{
    id: string
    username: string
    name: string
    isSpecial?: boolean
    user?: MattermostUser
  }> = []

  // Add special channel broadcast mentions
  const isDirect = chatStore.activeChannel?.type === 'D'
  if (!isDirect) {
    list.push({ id: 'all', username: 'all', name: 'Notify all members in channel', isSpecial: true })
    list.push({ id: 'channel', username: 'channel', name: 'Notify channel', isSpecial: true })
    list.push({ id: 'here', username: 'here', name: 'Notify online members', isSpecial: true })
  }

  for (const u of userList) {
    if (u && u.id !== currentUserId) {
      list.push({
        id: u.id,
        username: u.username,
        name: usersStore.getUserDisplayName(u),
        user: u
      })
    }
  }

  const q = mentionQuery.value.toLowerCase()
  if (!q) {
    return list.slice(0, 8)
  }

  return list
    .filter((item) => item.username.toLowerCase().includes(q) || item.name.toLowerCase().includes(q))
    .slice(0, 8)
})

// Auto resize textarea
function autoResize() {
  const el = textareaRef.value
  if (!el) return
  el.style.height = 'auto'
  el.style.height = Math.min(el.scrollHeight, 140) + 'px'
}

// Check mention trigger
function checkMention() {
  const el = textareaRef.value
  if (!el) return
  const cursor = el.selectionStart || 0
  const textBefore = messageText.value.substring(0, cursor)
  // Match @username ending at cursor
  const match = textBefore.match(/(?:^|\s)@([a-zA-Z0-9_.-]*)$/)
  if (match) {
    mentionQuery.value = match[1].toLowerCase()
    mentionStartIndex.value = textBefore.lastIndexOf('@')
    showMentions.value = true
    selectedMentionIndex.value = 0
  } else {
    showMentions.value = false
    mentionStartIndex.value = -1
  }
}

// Select a mention item
function selectMention(item: { username: string }) {
  const el = textareaRef.value
  if (!el) return

  const cursor = el.selectionStart || 0
  const textBefore = messageText.value.substring(0, mentionStartIndex.value)
  const textAfter = messageText.value.substring(cursor)

  const insertText = `@${item.username} `
  messageText.value = textBefore + insertText + textAfter
  showMentions.value = false
  mentionStartIndex.value = -1

  nextTick(() => {
    const newPos = textBefore.length + insertText.length
    el.setSelectionRange(newPos, newPos)
    el.focus()
    autoResize()
  })
}

// Handle keydown (Enter to send, Shift+Enter for newline, Arrows for mentions)
function handleKeydown(e: KeyboardEvent) {
  if (showMentions.value && mentionCandidates.value.length > 0) {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      selectedMentionIndex.value = (selectedMentionIndex.value + 1) % mentionCandidates.value.length
      return
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault()
      selectedMentionIndex.value =
        (selectedMentionIndex.value - 1 + mentionCandidates.value.length) % mentionCandidates.value.length
      return
    }
    if (e.key === 'Enter' || e.key === 'Tab') {
      e.preventDefault()
      selectMention(mentionCandidates.value[selectedMentionIndex.value])
      return
    }
    if (e.key === 'Escape') {
      e.preventDefault()
      showMentions.value = false
      return
    }
  }

  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault()
    handleSend()
  }
}

// Emit typing & check mention
function handleInput() {
  autoResize()
  checkMention()
  const now = Date.now()
  if (now - lastTypingTime > 3000) {
    lastTypingTime = now
    chatStore.sendTyping(props.channelId, uiStore.replyingTo?.id || '')
  }
}

// Send or Edit message
async function handleSend() {
  const text = messageText.value.trim()
  const fileIds = attachedFiles.value.map((f) => f.id)

  if (!text && fileIds.length === 0) return
  if (isSending.value) return

  isSending.value = true
  try {
    if (uiStore.editingPost) {
      await chatStore.editMessage(uiStore.editingPost.id, text)
      uiStore.setEditingPost(null)
    } else {
      const rootId = uiStore.replyingTo?.id || ''
      await chatStore.sendMessage(props.channelId, text, rootId, fileIds)
      uiStore.setReplyingTo(null)
    }

    messageText.value = ''
    attachedFiles.value = []
    showEmojiPicker.value = false
    showMentions.value = false

    if (textareaRef.value) {
      textareaRef.value.style.height = 'auto'
    }
  } catch (err) {
    console.error('Failed to send:', err)
  } finally {
    isSending.value = false
  }
}

// File Attachment Upload
function triggerFileInput() {
  fileInputRef.value?.click()
}

async function handleFileSelect(e: Event) {
  const input = e.target as HTMLInputElement
  if (!input.files || !input.files.length) return

  isUploading.value = true
  try {
    for (let i = 0; i < input.files.length; i++) {
      const file = input.files[i]
      const uploaded = await mmApi.uploadFile(props.channelId, file)
      attachedFiles.value.push(uploaded)
    }
  } catch (err) {
    console.error('File upload failed:', err)
    alert('Failed to upload file')
  } finally {
    isUploading.value = false
    input.value = ''
  }
}

function removeAttachedFile(fileId: string) {
  attachedFiles.value = attachedFiles.value.filter((f) => f.id !== fileId)
}

function handleEmojiSelect(emoji: string) {
  const el = textareaRef.value
  if (!el) {
    messageText.value += emoji
    return
  }

  const start = el.selectionStart || 0
  const end = el.selectionEnd || 0
  messageText.value = messageText.value.substring(0, start) + emoji + messageText.value.substring(end)
  nextTick(() => {
    el.selectionStart = el.selectionEnd = start + emoji.length
    el.focus()
    autoResize()
    checkMention()
  })
}

function cancelReply() {
  uiStore.setReplyingTo(null)
}

function cancelEdit() {
  uiStore.setEditingPost(null)
  messageText.value = ''
  if (textareaRef.value) textareaRef.value.style.height = 'auto'
}
</script>

<template>
  <div class="px-3 pb-3 pt-1 bg-[#17212b] dark:bg-[#17212b] bg-white border-t border-[#101921] dark:border-[#101921] border-[#dfe1e5] relative z-20">
    <!-- Telegram Mention Autocomplete Popover -->
    <div
      v-if="showMentions && mentionCandidates.length > 0"
      class="absolute bottom-full mb-2 left-3 right-3 md:left-14 md:right-16 bg-[#17212b] dark:bg-[#17212b] bg-white border border-[#202b36] dark:border-[#202b36] border-[#dfe1e5] rounded-2xl shadow-2xl overflow-hidden z-40 max-h-60 overflow-y-auto animate-in fade-in slide-in-from-bottom-2 duration-150"
    >
      <div class="px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-[#7f91a4] border-b border-[#202b36] dark:border-[#202b36] border-[#dfe1e5] bg-[#0e1621]/40 flex items-center justify-between">
        <span>Mention Members</span>
        <span class="text-[10px] font-normal lowercase opacity-75">↑↓ navigate • enter select</span>
      </div>

      <div class="py-1">
        <div
          v-for="(item, idx) in mentionCandidates"
          :key="item.id"
          @mousedown.prevent="selectMention(item)"
          @mouseenter="selectedMentionIndex = idx"
          class="flex items-center gap-3 px-3 py-2 cursor-pointer transition-colors"
          :class="[
            selectedMentionIndex === idx
              ? 'bg-[#2b5278] dark:bg-[#2b5278] bg-[#3390ec] text-white'
              : 'hover:bg-[#202b36] dark:hover:bg-[#202b36] hover:bg-[#f1f1f1] text-[#f5f5f5] dark:text-[#f5f5f5] text-[#111827]'
          ]"
        >
          <!-- Special Mention Icon -->
          <div
            v-if="item.isSpecial"
            class="w-8 h-8 rounded-full bg-[#3390ec] flex items-center justify-center text-white shrink-0"
          >
            <AtSign class="w-4 h-4" />
          </div>

          <!-- User Avatar -->
          <TelegramAvatar
            v-else
            :userId="item.user?.id"
            :name="item.name"
            size="sm"
            :showOnlineDot="true"
            :isOnline="usersStore.getStatus(item.user?.id || '') === 'online'"
            :lastPictureUpdate="(item.user as any)?.last_picture_update"
          />

          <!-- Name & Username -->
          <div class="flex-1 min-w-0">
            <div class="flex items-center gap-2">
              <span class="text-xs font-semibold truncate">{{ item.name }}</span>
              <span
                class="text-[11px] truncate"
                :class="selectedMentionIndex === idx ? 'text-white/80' : 'text-[#3390ec] font-medium'"
              >
                @{{ item.username }}
              </span>
            </div>
            <p
              v-if="!item.isSpecial && item.user?.email"
              class="text-[10px] truncate mt-0.5"
              :class="selectedMentionIndex === idx ? 'text-white/70' : 'text-[#7f91a4]'"
            >
              {{ item.user.email }}
            </p>
          </div>
        </div>
      </div>
    </div>

    <!-- Reply Banner Preview -->
    <div
      v-if="uiStore.replyingTo"
      class="mb-2 px-3 py-1.5 bg-[#242f3d] dark:bg-[#242f3d] bg-[#f4f4f5] rounded-xl flex items-center justify-between border-l-4 border-[#3390ec] animate-in fade-in duration-150"
    >
      <div class="flex items-center gap-2 min-w-0 pr-2">
        <Reply class="w-4 h-4 text-[#3390ec] shrink-0" />
        <div class="min-w-0 text-xs">
          <div class="font-semibold text-[#3390ec] truncate">
            {{ usersStore.getUserDisplayName(uiStore.replyingTo.user_id) }}
          </div>
          <div class="text-[#7f91a4] truncate text-[11px]">
            {{ uiStore.replyingTo.message || 'Attachment' }}
          </div>
        </div>
      </div>
      <button @click="cancelReply" class="p-1 text-[#7f91a4] hover:text-white rounded-full">
        <X class="w-4 h-4" />
      </button>
    </div>

    <!-- Edit Banner Preview -->
    <div
      v-if="uiStore.editingPost"
      class="mb-2 px-3 py-1.5 bg-[#242f3d] dark:bg-[#242f3d] bg-[#f4f4f5] rounded-xl flex items-center justify-between border-l-4 border-amber-400 animate-in fade-in duration-150"
    >
      <div class="flex items-center gap-2 min-w-0 pr-2">
        <Edit2 class="w-4 h-4 text-amber-400 shrink-0" />
        <div class="min-w-0 text-xs">
          <div class="font-semibold text-amber-400 truncate">Edit Message</div>
          <div class="text-[#7f91a4] truncate text-[11px]">
            {{ uiStore.editingPost.message }}
          </div>
        </div>
      </div>
      <button @click="cancelEdit" class="p-1 text-[#7f91a4] hover:text-white rounded-full">
        <X class="w-4 h-4" />
      </button>
    </div>

    <!-- Attached Files Preview Bar -->
    <div v-if="attachedFiles.length > 0" class="mb-2 flex flex-wrap gap-2">
      <div
        v-for="file in attachedFiles"
        :key="file.id"
        class="flex items-center gap-2 bg-[#242f3d] border border-[#202b36] px-2.5 py-1 rounded-xl text-xs text-white"
      >
        <FileText class="w-3.5 h-3.5 text-[#3390ec]" />
        <span class="truncate max-w-[140px]">{{ file.name }}</span>
        <button @click="removeAttachedFile(file.id)" class="text-[#7f91a4] hover:text-red-400">
          <X class="w-3.5 h-3.5" />
        </button>
      </div>
    </div>

    <!-- Main Input Bar Row -->
    <div class="flex items-end gap-2 relative">
      <!-- Attachment Paperclip Button -->
      <button
        @click="triggerFileInput"
        :disabled="isUploading"
        class="p-2.5 text-[#7f91a4] hover:text-[#f5f5f5] dark:hover:text-[#f5f5f5] hover:text-[#111827] rounded-full hover:bg-[#202b36] dark:hover:bg-[#202b36] hover:bg-[#f1f1f1] transition-colors shrink-0 mb-0.5"
        title="Attach file"
      >
        <Loader2 v-if="isUploading" class="w-5 h-5 animate-spin text-[#3390ec]" />
        <Paperclip v-else class="w-5 h-5" />
      </button>

      <input
        ref="fileInputRef"
        type="file"
        multiple
        class="hidden"
        @change="handleFileSelect"
      />

      <!-- Textarea & Emoji Container -->
      <div class="flex-1 bg-[#242f3d] dark:bg-[#242f3d] bg-[#f4f4f5] rounded-2xl flex items-end px-3 py-1.5 border border-transparent focus-within:border-[#3390ec] transition-all">
        <!-- Textarea -->
        <textarea
          ref="textareaRef"
          v-model="messageText"
          @keydown="handleKeydown"
          @input="handleInput"
          @click="checkMention"
          @keyup="checkMention"
          rows="1"
          dir="auto"
          placeholder="Write a message..."
          class="flex-1 bg-transparent text-[#f5f5f5] dark:text-[#f5f5f5] text-[#111827] placeholder-[#7f91a4] text-sm outline-none resize-none max-h-36 py-1 leading-relaxed text-auto"
        ></textarea>

        <!-- Emoji Picker Button -->
        <button
          @click="showEmojiPicker = !showEmojiPicker"
          class="p-1.5 text-[#7f91a4] hover:text-[#3390ec] rounded-full transition-colors shrink-0 mb-0.5 ml-1"
          title="Emojis"
        >
          <Smile class="w-5 h-5" />
        </button>
      </div>

      <!-- Send or Mic Action Button -->
      <button
        @click="handleSend"
        :disabled="isSending || (!messageText.trim() && attachedFiles.length === 0)"
        class="w-10 h-10 rounded-full flex items-center justify-center transition-all shrink-0 mb-0.5"
        :class="[
          messageText.trim() || attachedFiles.length > 0
            ? 'bg-[#3390ec] hover:bg-[#2481cc] text-white shadow-md shadow-[#3390ec]/30 scale-100'
            : 'text-[#7f91a4] hover:text-white hover:bg-[#202b36]'
        ]"
        title="Send"
      >
        <Loader2 v-if="isSending" class="w-5 h-5 animate-spin" />
        <Send
          v-else-if="messageText.trim() || attachedFiles.length > 0"
          class="w-4 h-4 translate-x-0.5 -translate-y-0.5"
        />
        <Mic v-else class="w-5 h-5" />
      </button>

      <!-- Emoji Picker Popover -->
      <div
        v-if="showEmojiPicker"
        class="absolute bottom-14 right-8 z-50"
      >
        <EmojiPicker @select="handleEmojiSelect" />
      </div>
    </div>
  </div>
</template>
