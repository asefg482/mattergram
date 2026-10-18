<script setup lang="ts">
import { computed, ref, onMounted, onUnmounted, nextTick, watch } from 'vue'
import { useAuthStore } from '../../stores/auth'
import { useChatStore } from '../../stores/chat'
import { useUiStore } from '../../stores/ui'
import { showConfirm, showAlert } from '../../stores/alert'
import type { MattermostPost } from '../../types/mattermost'
import {
  Reply,
  Edit2,
  Copy,
  Pin,
  Trash2,
  SmilePlus,
  Eye,
  MessageSquareText,
  Link
} from 'lucide-vue-next'
import ReactionPicker from './ReactionPicker.vue'
import { frequentReactions, recordReactionUsage } from '../../utils/reactions'
import { getSelectedTextForPost } from '../../utils/selection'

const props = defineProps<{
  post: MattermostPost | null
  position: { x: number; y: number }
  isOpen: boolean
  selectedText?: string
}>()

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'viewers', post: MattermostPost): void
  (e: 'thread', post: MattermostPost): void
}>()

const authStore = useAuthStore()
const chatStore = useChatStore()
const uiStore = useUiStore()

const menuRef = ref<HTMLDivElement | null>(null)
const adjustedX = ref(props.position.x)
const adjustedY = ref(props.position.y)
const transformOrigin = ref('top left')
const isMobile = ref(typeof window !== 'undefined' ? window.innerWidth < 768 : false)

function updateIsMobile() {
  isMobile.value = window.innerWidth < 768
}

const isOutgoing = computed(() => {
  return props.post?.user_id === authStore.currentUser?.id
})

const isAdmin = computed(() => {
  return authStore.currentUser?.roles.includes('system_admin')
})

const canDelete = computed(() => isOutgoing.value || isAdmin.value)
const canEdit = computed(() => isOutgoing.value)

const quickEmojis = computed(() => frequentReactions.value.slice(0, 6))
const showReactionPicker = ref(false)

function adjustPosition() {
  const el = menuRef.value
  const menuWidth = el?.offsetWidth || 208
  const menuHeight = el?.offsetHeight || 260
  const padding = 8
  const safeTop = 56
  const safeBottom = 60

  let x = props.position.x + 2
  let y = props.position.y + 2
  let originX = 'left'
  let originY = 'top'

  // If menu overflows right side, flip to left of cursor
  if (props.position.x + menuWidth + padding > window.innerWidth) {
    x = props.position.x - menuWidth - 2
    originX = 'right'
    if (x < padding) {
      x = padding
      originX = 'left'
    }
  }

  // If menu overflows bottom side, flip to above cursor
  if (props.position.y + menuHeight + safeBottom > window.innerHeight) {
    y = props.position.y - menuHeight - 2
    originY = 'bottom'
    if (y < safeTop) {
      y = safeTop
      originY = 'top'
    }
  }

  // Ensure within viewport bounds
  x = Math.max(padding, Math.min(x, window.innerWidth - menuWidth - padding))
  y = Math.max(safeTop, Math.min(y, window.innerHeight - menuHeight - safeBottom))

  transformOrigin.value = `${originY} ${originX}`
  adjustedX.value = Math.round(x)
  adjustedY.value = Math.round(y)
}

const pickerStyle = computed(() => {
  const winW = typeof window !== 'undefined' ? window.innerWidth : 1000
  const winH = typeof window !== 'undefined' ? window.innerHeight : 800

  // Mobile centered positioning for reaction picker
  if (winW < 640) {
    return {
      left: '50%',
      top: '50%',
      transform: 'translate(-50%, -50%)',
      maxWidth: 'calc(100vw - 32px)'
    }
  }

  const left = adjustedX.value + 215 + 320 > winW ? Math.max(8, adjustedX.value - 325) : adjustedX.value + 215
  const top = Math.min(adjustedY.value, Math.max(10, winH - 350))
  return {
    left: `${left}px`,
    top: `${top}px`
  }
})

watch(
  () => [props.isOpen, props.position.x, props.position.y],
  ([isOpen]) => {
    if (isOpen) {
      adjustPosition()
      nextTick(adjustPosition)
    }
  },
  { immediate: true }
)

function handleReaction(emoji: string) {
  if (props.post) {
    recordReactionUsage(emoji)
    chatStore.toggleReaction(props.post, emoji)
  }
  showReactionPicker.value = false
  emit('close')
}

const threadRepliesCount = computed(() => {
  if (!props.post) return 0
  const serverCount = props.post.reply_count || 0
  const channelPosts = chatStore.posts[props.post.channel_id] || []
  const localCount = channelPosts.filter((p) => p.root_id === props.post?.id && p.id !== props.post?.id).length
  return Math.max(serverCount, localCount)
})

function handleViewThread() {
  if (props.post) {
    emit('close')
    emit('thread', props.post)
    chatStore.openThread(props.post)
  }
}

function handleReply() {
  if (props.post) {
    uiStore.setReplyingTo(props.post)
  }
  emit('close')
}

function handleViewers() {
  if (props.post) {
    emit('viewers', props.post)
  }
  emit('close')
}

function handleEdit() {
  if (props.post) {
    uiStore.setEditingPost(props.post)
  }
  emit('close')
}

const activeSelectedText = ref('')

watch(
  () => [props.isOpen, props.selectedText, props.post?.id],
  ([isOpen]) => {
    if (isOpen) {
      if (props.selectedText && props.selectedText.trim()) {
        activeSelectedText.value = props.selectedText
      } else {
        activeSelectedText.value = getSelectedTextForPost(props.post)
      }
    } else {
      activeSelectedText.value = ''
    }
  },
  { immediate: true }
)

const hasSelectedText = computed(() => {
  return Boolean(activeSelectedText.value && activeSelectedText.value.trim().length > 0)
})

function fallbackCopy(text: string) {
  try {
    const el = document.createElement('textarea')
    el.value = text
    el.style.position = 'fixed'
    el.style.opacity = '0'
    document.body.appendChild(el)
    el.focus()
    el.select()
    document.execCommand('copy')
    document.body.removeChild(el)
  } catch (err) {
    console.warn('Fallback clipboard copy failed:', err)
  }
}

function handleCopySelectedText() {
  const text = activeSelectedText.value || getSelectedTextForPost(props.post)
  if (text) {
    if (navigator?.clipboard?.writeText) {
      navigator.clipboard.writeText(text).catch(() => {
        fallbackCopy(text)
      })
    } else {
      fallbackCopy(text)
    }
  }
  emit('close')
}

function handleCopy() {
  if (props.post?.message) {
    if (navigator?.clipboard?.writeText) {
      navigator.clipboard.writeText(props.post.message).catch(() => {
        fallbackCopy(props.post!.message)
      })
    } else {
      fallbackCopy(props.post.message)
    }
  }
  emit('close')
}

async function handleCopyLink() {
  if (!props.post) return
  const channelId = props.post.channel_id || chatStore.activeChannelId
  if (!channelId) return
  const origin = window.location.origin
  const url = `${origin}/c/${channelId}?post=${props.post.id}`
  try {
    if (navigator?.clipboard?.writeText && window.isSecureContext) {
      await navigator.clipboard.writeText(url)
    } else {
      fallbackCopy(url)
    }
    showAlert('Message link copied to clipboard', { type: 'success' })
  } catch {
    showAlert('Failed to copy link', { type: 'error' })
  }
  emit('close')
}

async function handleTogglePin() {
  if (props.post) {
    await chatStore.togglePinPost(props.post)
  }
  emit('close')
}

async function handleDelete() {
  if (props.post) {
    const postToDelete = props.post
    emit('close')
    const confirmed = await showConfirm('Are you sure you want to delete this message?', {
      title: 'Delete Message',
      confirmText: 'Delete',
      cancelText: 'Cancel',
      isDestructive: true
    })
    if (confirmed) {
      await chatStore.deleteMessage(postToDelete.id)
    }
  }
}

function onWindowClick(e: MouseEvent) {
  if (props.isOpen && menuRef.value && !menuRef.value.contains(e.target as Node)) {
    emit('close')
  }
}

function onWindowKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape' && props.isOpen) {
    emit('close')
  }
}

onMounted(() => {
  window.addEventListener('resize', updateIsMobile)
  window.addEventListener('click', onWindowClick)
  window.addEventListener('keydown', onWindowKeydown)
})

onUnmounted(() => {
  window.removeEventListener('resize', updateIsMobile)
  window.removeEventListener('click', onWindowClick)
  window.removeEventListener('keydown', onWindowKeydown)
})
</script>

<template>
  <Teleport to="body">
    <div v-if="isOpen && post" class="fixed inset-0 z-50 select-none">
      <!-- Backdrop to capture outside clicks with smooth Telegram fade on mobile -->
      <div
        class="fixed inset-0 transition-opacity"
        :class="isMobile ? 'bg-black/45 dark:bg-black/65 backdrop-blur-[2px] tg-mobile-backdrop' : 'bg-transparent'"
        @click="emit('close')"
        @contextmenu.prevent="emit('close')"
      ></div>

      <!-- Mobile Action Sheet (on screens < 768px) with slide-up spring animation -->
      <div
        v-if="isMobile"
        ref="menuRef"
        class="fixed inset-x-0 bottom-0 z-50 bg-white dark:bg-[#17212b] border-t border-[#dfe1e5] dark:border-[#202b36] rounded-t-3xl shadow-[0_-8px_30px_rgba(0,0,0,0.25)] overflow-hidden tg-mobile-action-sheet pointer-events-auto"
        style="padding-bottom: max(1.25rem, env(safe-area-inset-bottom, 1.25rem)); max-height: 85vh;"
      >
        <!-- Grab / drag pill indicator -->
        <div class="pt-2.5 pb-1 flex justify-center">
          <div class="w-10 h-1 rounded-full bg-gray-300 dark:bg-gray-600"></div>
        </div>

        <!-- Quick Reactions Row (Mobile) -->
        <div class="px-3 py-2 border-b border-[#dfe1e5] dark:border-[#202b36] flex items-center justify-between gap-1 overflow-x-auto no-scrollbar">
          <button
            v-for="emoji in quickEmojis"
            :key="emoji"
            @click="handleReaction(emoji)"
            class="w-10 h-10 shrink-0 flex items-center justify-center text-xl rounded-xl bg-gray-100 dark:bg-[#202b36] active:scale-90 transition-transform cursor-pointer"
            :title="`React with ${emoji}`"
          >
            {{ emoji }}
          </button>
          <!-- More Reactions Button -->
          <button
            @click="showReactionPicker = !showReactionPicker"
            class="w-10 h-10 shrink-0 flex items-center justify-center text-[#7f91a4] hover:text-[#3390ec] bg-gray-100 dark:bg-[#202b36] rounded-xl active:scale-90 transition-all cursor-pointer"
            title="More reactions..."
          >
            <SmilePlus class="w-5 h-5" />
          </button>
        </div>

        <!-- Action Items List (Mobile) -->
        <div class="px-2 py-1.5 overflow-y-auto no-scrollbar space-y-0.5" style="max-height: calc(85vh - 120px);">
          <!-- Reply -->
          <button
            @click="handleReply"
            class="w-full px-3.5 py-3 flex items-center gap-3.5 text-[#111827] dark:text-[#f5f5f5] hover:bg-gray-100 dark:hover:bg-[#202b36] active:bg-gray-200 dark:active:bg-[#242f3d] rounded-xl text-left transition-colors cursor-pointer"
          >
            <Reply class="w-5 h-5 text-[#3390ec] shrink-0" />
            <span class="text-sm font-medium">Reply</span>
          </button>

          <!-- View Thread -->
          <button
            @click="handleViewThread"
            class="w-full px-3.5 py-3 flex items-center gap-3.5 text-[#111827] dark:text-[#f5f5f5] hover:bg-gray-100 dark:hover:bg-[#202b36] active:bg-gray-200 dark:active:bg-[#242f3d] rounded-xl text-left transition-colors cursor-pointer"
          >
            <MessageSquareText class="w-5 h-5 text-[#3390ec] shrink-0" />
            <span class="flex-1 text-sm font-medium">View Thread</span>
            <span
              v-if="threadRepliesCount > 0"
              class="text-xs font-bold px-2 py-0.5 rounded-full bg-[#3390ec]/15 text-[#3390ec]"
            >
              {{ threadRepliesCount }}
            </span>
          </button>

          <!-- Viewers -->
          <button
            @click="handleViewers"
            class="w-full px-3.5 py-3 flex items-center gap-3.5 text-[#111827] dark:text-[#f5f5f5] hover:bg-gray-100 dark:hover:bg-[#202b36] active:bg-gray-200 dark:active:bg-[#242f3d] rounded-xl text-left transition-colors cursor-pointer"
          >
            <Eye class="w-5 h-5 text-[#3390ec] shrink-0" />
            <span class="text-sm font-medium">Viewers</span>
          </button>

          <!-- Edit (if outgoing) -->
          <button
            v-if="canEdit"
            @click="handleEdit"
            class="w-full px-3.5 py-3 flex items-center gap-3.5 text-[#111827] dark:text-[#f5f5f5] hover:bg-gray-100 dark:hover:bg-[#202b36] active:bg-gray-200 dark:active:bg-[#242f3d] rounded-xl text-left transition-colors cursor-pointer"
          >
            <Edit2 class="w-5 h-5 text-amber-500 shrink-0" />
            <span class="text-sm font-medium">Edit</span>
          </button>

          <!-- Copy Selected Text (only if text is selected) -->
          <button
            v-if="hasSelectedText"
            @click="handleCopySelectedText"
            class="w-full px-3.5 py-3 flex items-center gap-3.5 text-[#111827] dark:text-[#f5f5f5] hover:bg-gray-100 dark:hover:bg-[#202b36] active:bg-gray-200 dark:active:bg-[#242f3d] rounded-xl text-left transition-colors cursor-pointer"
          >
            <Copy class="w-5 h-5 text-[#3390ec] shrink-0" />
            <span class="text-sm font-medium">Copy Selected Text</span>
          </button>

          <!-- Copy Text -->
          <button
            v-if="post.message"
            @click="handleCopy"
            class="w-full px-3.5 py-3 flex items-center gap-3.5 text-[#111827] dark:text-[#f5f5f5] hover:bg-gray-100 dark:hover:bg-[#202b36] active:bg-gray-200 dark:active:bg-[#242f3d] rounded-xl text-left transition-colors cursor-pointer"
          >
            <Copy class="w-5 h-5 text-[#7f91a4] shrink-0" />
            <span class="text-sm font-medium">Copy Text</span>
          </button>

          <!-- Copy Link -->
          <button
            @click="handleCopyLink"
            class="w-full px-3.5 py-3 flex items-center gap-3.5 text-[#111827] dark:text-[#f5f5f5] hover:bg-gray-100 dark:hover:bg-[#202b36] active:bg-gray-200 dark:active:bg-[#242f3d] rounded-xl text-left transition-colors cursor-pointer"
          >
            <Link class="w-5 h-5 text-[#3390ec] shrink-0" />
            <span class="text-sm font-medium">Copy Link</span>
          </button>

          <!-- Pin / Unpin -->
          <button
            @click="handleTogglePin"
            class="w-full px-3.5 py-3 flex items-center gap-3.5 text-[#111827] dark:text-[#f5f5f5] hover:bg-gray-100 dark:hover:bg-[#202b36] active:bg-gray-200 dark:active:bg-[#242f3d] rounded-xl text-left transition-colors cursor-pointer"
          >
            <Pin class="w-5 h-5 text-[#7f91a4] shrink-0" />
            <span class="text-sm font-medium">{{ post.is_pinned ? 'Unpin' : 'Pin' }}</span>
          </button>

          <!-- Delete (if allowed) -->
          <button
            v-if="canDelete"
            @click="handleDelete"
            class="w-full px-3.5 py-3 flex items-center gap-3.5 text-red-500 hover:bg-red-500/10 active:bg-red-500/20 rounded-xl text-left transition-colors cursor-pointer"
          >
            <Trash2 class="w-5 h-5 text-red-500 shrink-0" />
            <span class="text-sm font-medium">Delete</span>
          </button>
        </div>
      </div>

      <!-- Telegram Desktop Context Menu (>= 768px) -->
      <div
        v-else
        ref="menuRef"
        class="fixed pointer-events-auto w-52 bg-white dark:bg-[#17212b] border border-[#dfe1e5] dark:border-[#202b36] rounded-2xl shadow-2xl overflow-hidden z-50 select-none tg-context-menu py-1.5"
        :style="{ left: `${adjustedX}px`, top: `${adjustedY}px`, transformOrigin: transformOrigin, borderRadius: `${uiStore.menuRadius}px` }"
      >
        <!-- Quick Reactions Row -->
        <div class="px-2 py-1.5 border-b border-[#dfe1e5] dark:border-[#202b36] flex items-center justify-between gap-0.5 overflow-x-auto no-scrollbar">
          <button
            v-for="emoji in quickEmojis"
            :key="emoji"
            @click="handleReaction(emoji)"
            class="w-7 h-7 flex items-center justify-center text-sm rounded-lg hover:bg-[#f1f1f1] dark:hover:bg-[#202b36] hover:scale-125 transition-transform cursor-pointer"
            :title="`React with ${emoji}`"
          >
            {{ emoji }}
          </button>
          <!-- More Reactions Button -->
          <button
            @click="showReactionPicker = !showReactionPicker"
            class="w-7 h-7 flex items-center justify-center text-[#7f91a4] hover:text-[#3390ec] hover:bg-[#f1f1f1] dark:hover:bg-[#202b36] rounded-lg transition-colors cursor-pointer"
            title="More reactions..."
          >
            <SmilePlus class="w-4 h-4" />
          </button>
        </div>

        <!-- Action Items -->
        <div class="py-1 text-xs">
          <!-- Add Reaction Item -->
          <button
            @click="showReactionPicker = !showReactionPicker"
            class="w-full px-3.5 py-2 flex items-center gap-3 text-[#111827] dark:text-[#f5f5f5] hover:bg-[#f1f1f1] dark:hover:bg-[#202b36] text-left transition-colors cursor-pointer"
          >
            <SmilePlus class="w-4 h-4 text-[#3390ec]" />
            <span>Add Reaction...</span>
          </button>

          <!-- Reply -->
          <button
            @click="handleReply"
            class="w-full px-3.5 py-2 flex items-center gap-3 text-[#111827] dark:text-[#f5f5f5] hover:bg-[#f1f1f1] dark:hover:bg-[#202b36] text-left transition-colors cursor-pointer"
          >
            <Reply class="w-4 h-4 text-[#3390ec]" />
            <span>Reply</span>
          </button>

          <!-- View Thread -->
          <button
            @click="handleViewThread"
            class="w-full px-3.5 py-2 flex items-center gap-3 text-[#111827] dark:text-[#f5f5f5] hover:bg-[#f1f1f1] dark:hover:bg-[#202b36] text-left transition-colors cursor-pointer group/th"
          >
            <MessageSquareText class="w-4 h-4 text-[#3390ec]" />
            <span class="flex-1">View Thread</span>
            <span
              v-if="threadRepliesCount > 0"
              class="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-[#3390ec]/15 text-[#3390ec] group-hover/th:bg-[#3390ec] group-hover/th:text-white transition-colors"
            >
              {{ threadRepliesCount }}
            </span>
          </button>

          <!-- Viewers -->
          <button
            @click="handleViewers"
            class="w-full px-3.5 py-2 flex items-center gap-3 text-[#111827] dark:text-[#f5f5f5] hover:bg-[#f1f1f1] dark:hover:bg-[#202b36] text-left transition-colors cursor-pointer"
          >
            <Eye class="w-4 h-4 text-[#3390ec]" />
            <span>Viewers</span>
          </button>

          <!-- Edit (if outgoing) -->
          <button
            v-if="canEdit"
            @click="handleEdit"
            class="w-full px-3.5 py-2 flex items-center gap-3 text-[#111827] dark:text-[#f5f5f5] hover:bg-[#f1f1f1] dark:hover:bg-[#202b36] text-left transition-colors"
          >
            <Edit2 class="w-4 h-4 text-amber-400" />
            <span>Edit</span>
          </button>

          <!-- Copy Selected Text (only if text is selected) -->
          <button
            v-if="hasSelectedText"
            @click="handleCopySelectedText"
            class="w-full px-3.5 py-2 flex items-center gap-3 text-[#111827] dark:text-[#f5f5f5] hover:bg-[#f1f1f1] dark:hover:bg-[#202b36] text-left transition-colors cursor-pointer"
          >
            <Copy class="w-4 h-4 text-[#3390ec]" />
            <span>Copy Selected Text</span>
          </button>

          <!-- Copy Text -->
          <button
            v-if="post.message"
            @click="handleCopy"
            class="w-full px-3.5 py-2 flex items-center gap-3 text-[#111827] dark:text-[#f5f5f5] hover:bg-[#f1f1f1] dark:hover:bg-[#202b36] text-left transition-colors cursor-pointer"
          >
            <Copy class="w-4 h-4 text-[#7f91a4]" />
            <span>Copy Text</span>
          </button>

          <!-- Copy Link -->
          <button
            @click="handleCopyLink"
            class="w-full px-3.5 py-2 flex items-center gap-3 text-[#111827] dark:text-[#f5f5f5] hover:bg-[#f1f1f1] dark:hover:bg-[#202b36] text-left transition-colors cursor-pointer"
          >
            <Link class="w-4 h-4 text-[#3390ec]" />
            <span>Copy Link</span>
          </button>

          <!-- Pin / Unpin -->
          <button
            @click="handleTogglePin"
            class="w-full px-3.5 py-2 flex items-center gap-3 text-[#111827] dark:text-[#f5f5f5] hover:bg-[#f1f1f1] dark:hover:bg-[#202b36] text-left transition-colors"
          >
            <Pin class="w-4 h-4 text-[#7f91a4]" />
            <span>{{ post.is_pinned ? 'Unpin' : 'Pin' }}</span>
          </button>

          <!-- Delete (if allowed) -->
          <button
            v-if="canDelete"
            @click="handleDelete"
            class="w-full px-3.5 py-2 flex items-center gap-3 text-red-400 hover:bg-[#f1f1f1] dark:hover:bg-[#202b36] text-left transition-colors"
          >
            <Trash2 class="w-4 h-4 text-red-400" />
            <span>Delete</span>
          </button>
        </div>
      </div>

      <!-- Reaction Picker Popover -->
      <div
        v-if="showReactionPicker"
        class="fixed pointer-events-auto z-[60]"
        :class="isMobile ? 'inset-x-2 bottom-3 max-w-sm mx-auto' : ''"
        :style="isMobile ? {} : pickerStyle"
      >
        <ReactionPicker
          @select="handleReaction"
          @close="showReactionPicker = false; emit('close')"
        />
      </div>
    </div>
  </Teleport>
</template>
