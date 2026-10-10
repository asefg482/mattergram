<script setup lang="ts">
import { ref, computed, watch, nextTick } from 'vue'
import { useAuthStore } from '../../stores/auth'
import { useChatStore } from '../../stores/chat'
import { useUsersStore } from '../../stores/users'
import { useUiStore } from '../../stores/ui'
import { mmApi } from '../../services/mattermostApi'
import EmojiPicker from './EmojiPicker.vue'
import type { MattermostFileInfo } from '../../types/mattermost'
import {
  Paperclip,
  Smile,
  Send,
  Mic,
  X,
  FileText,
  Loader2,
  Edit2,
  Reply
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

// Auto resize textarea
function autoResize() {
  const el = textareaRef.value
  if (!el) return
  el.style.height = 'auto'
  el.style.height = Math.min(el.scrollHeight, 140) + 'px'
}

// Handle keydown (Enter to send, Shift+Enter for newline)
function handleKeydown(e: KeyboardEvent) {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault()
    handleSend()
  }
}

// Emit typing
function handleInput() {
  autoResize()
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
