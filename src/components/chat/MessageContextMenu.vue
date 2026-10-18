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
  const isMob = isMobile.value
  const menuWidth = el?.offsetWidth || (isMob ? 268 : 208)
  const menuHeight = el?.offsetHeight || (isMob ? 380 : 280)
  const padding = isMob ? 10 : 8
  const safeTop = isMob ? 60 : 56
  const safeBottom = isMob ? 65 : 60

  const winW = typeof window !== 'undefined' ? window.innerWidth : 1000
  const winH = typeof window !== 'undefined' ? window.innerHeight : 800

  let x = props.position.x + 2
  let y = props.position.y + 2
  let originX = 'left'
  let originY = 'top'

  // If menu overflows right side, flip to left of cursor
  if (props.position.x + menuWidth + padding > winW) {
    x = props.position.x - menuWidth - 2
    originX = 'right'
    if (x < padding) {
      x = padding
      originX = 'left'
    }
  }

  // If menu overflows bottom side, flip to above cursor
  if (props.position.y + menuHeight + safeBottom > winH) {
    y = props.position.y - menuHeight - 2
    originY = 'bottom'
    if (y < safeTop) {
      y = safeTop
      originY = 'top'
    }
  }

  // Ensure within viewport bounds
  x = Math.max(padding, Math.min(x, winW - menuWidth - padding))
  y = Math.max(safeTop, Math.min(y, winH - menuHeight - safeBottom))

  transformOrigin.value = `${originY} ${originX}`
  adjustedX.value = Math.round(x)
  adjustedY.value = Math.round(y)
}

const pickerStyle = computed(() => {
  const winW = typeof window !== 'undefined' ? window.innerWidth : 1000
  const winH = typeof window !== 'undefined' ? window.innerHeight : 800

  // Mobile centered positioning for reaction picker
  if (winW < 768) {
    return {
      left: '50%',
      top: '50%',
      transform: 'translate(-50%, -50%)',
      maxWidth: 'calc(100vw - 24px)'
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
    <div v-if="isOpen && post" class="fixed inset-0 z-50 pointer-events-none select-none">
      <!-- Backdrop to capture outside clicks with gentle blur on mobile -->
      <div
        class="fixed inset-0 transition-opacity pointer-events-auto"
        :class="isMobile ? 'bg-black/35 dark:bg-black/55 backdrop-blur-[1.5px] tg-mobile-backdrop' : 'bg-transparent'"
        @click="emit('close')"
        @contextmenu.prevent="emit('close')"
      ></div>

      <!-- Telegram Floating Context Menu (Identical structure on mobile & desktop, with touch-friendly sizing on mobile) -->
      <div
        ref="menuRef"
        class="fixed pointer-events-auto bg-white dark:bg-[#17212b] border border-[#dfe1e5] dark:border-[#202b36] shadow-2xl overflow-hidden z-50 select-none tg-context-menu"
        :class="isMobile ? 'w-[268px] py-2' : 'w-52 py-1.5'"
        :style="{
          left: `${adjustedX}px`,
          top: `${adjustedY}px`,
          transformOrigin: transformOrigin,
          borderRadius: isMobile ? '20px' : `${uiStore.menuRadius}px`,
          maxHeight: 'calc(var(--tg-viewport-height, 100vh) - 120px)'
        }"
      >
        <!-- Quick Reactions Row -->
        <div
          class="border-b border-[#dfe1e5] dark:border-[#202b36] flex items-center justify-between no-scrollbar overflow-x-auto"
          :class="isMobile ? 'px-2.5 py-2 gap-1.5' : 'px-2 py-1.5 gap-0.5'"
        >
          <button
            v-for="emoji in quickEmojis"
            :key="emoji"
            @click="handleReaction(emoji)"
            class="flex items-center justify-center rounded-xl hover:bg-[#f1f1f1] dark:hover:bg-[#202b36] transition-transform cursor-pointer shrink-0"
            :class="isMobile ? 'w-9 h-9 text-2xl active:scale-125' : 'w-7 h-7 text-sm hover:scale-125'"
            :title="`React with ${emoji}`"
          >
            {{ emoji }}
          </button>

          <!-- More Reactions Button (+) -->
          <button
            @click="showReactionPicker = !showReactionPicker"
            class="flex items-center justify-center text-[#7f91a4] hover:text-[#3390ec] hover:bg-[#f1f1f1] dark:hover:bg-[#202b36] rounded-xl transition-all cursor-pointer shrink-0"
            :class="isMobile ? 'w-9 h-9 text-[#3390ec] active:scale-90' : 'w-7 h-7'"
            title="More reactions..."
          >
            <SmilePlus :class="isMobile ? 'w-5 h-5' : 'w-4 h-4'" />
          </button>
        </div>

        <!-- Action Items List -->
        <div
          class="overflow-y-auto no-scrollbar"
          :class="isMobile ? 'py-1 text-sm' : 'py-1 text-xs'"
        >
          <!-- Add Reaction Item -->
          <button
            @click="showReactionPicker = !showReactionPicker"
            class="w-full flex items-center text-[#111827] dark:text-[#f5f5f5] hover:bg-[#f1f1f1] dark:hover:bg-[#202b36] active:bg-[#e4ecf2] dark:active:bg-[#242f3d] text-left transition-colors cursor-pointer"
            :class="isMobile ? 'px-4 py-2.5 gap-3.5' : 'px-3.5 py-2 gap-3'"
          >
            <SmilePlus :class="isMobile ? 'w-5 h-5 text-[#3390ec]' : 'w-4 h-4 text-[#3390ec]'" />
            <span class="font-medium">Add Reaction...</span>
          </button>

          <!-- Reply -->
          <button
            @click="handleReply"
            class="w-full flex items-center text-[#111827] dark:text-[#f5f5f5] hover:bg-[#f1f1f1] dark:hover:bg-[#202b36] active:bg-[#e4ecf2] dark:active:bg-[#242f3d] text-left transition-colors cursor-pointer"
            :class="isMobile ? 'px-4 py-2.5 gap-3.5' : 'px-3.5 py-2 gap-3'"
          >
            <Reply :class="isMobile ? 'w-5 h-5 text-[#3390ec]' : 'w-4 h-4 text-[#3390ec]'" />
            <span class="font-medium">Reply</span>
          </button>

          <!-- View Thread -->
          <button
            @click="handleViewThread"
            class="w-full flex items-center text-[#111827] dark:text-[#f5f5f5] hover:bg-[#f1f1f1] dark:hover:bg-[#202b36] active:bg-[#e4ecf2] dark:active:bg-[#242f3d] text-left transition-colors cursor-pointer group/th"
            :class="isMobile ? 'px-4 py-2.5 gap-3.5' : 'px-3.5 py-2 gap-3'"
          >
            <MessageSquareText :class="isMobile ? 'w-5 h-5 text-[#3390ec]' : 'w-4 h-4 text-[#3390ec]'" />
            <span class="flex-1 font-medium">View Thread</span>
            <span
              v-if="threadRepliesCount > 0"
              class="font-bold rounded-full bg-[#3390ec]/15 text-[#3390ec] group-hover/th:bg-[#3390ec] group-hover/th:text-white transition-colors"
              :class="isMobile ? 'text-xs px-2 py-0.5' : 'text-[10px] px-1.5 py-0.5'"
            >
              {{ threadRepliesCount }}
            </span>
          </button>

          <!-- Viewers -->
          <button
            @click="handleViewers"
            class="w-full flex items-center text-[#111827] dark:text-[#f5f5f5] hover:bg-[#f1f1f1] dark:hover:bg-[#202b36] active:bg-[#e4ecf2] dark:active:bg-[#242f3d] text-left transition-colors cursor-pointer"
            :class="isMobile ? 'px-4 py-2.5 gap-3.5' : 'px-3.5 py-2 gap-3'"
          >
            <Eye :class="isMobile ? 'w-5 h-5 text-[#3390ec]' : 'w-4 h-4 text-[#3390ec]'" />
            <span class="font-medium">Viewers</span>
          </button>

          <!-- Edit (if outgoing) -->
          <button
            v-if="canEdit"
            @click="handleEdit"
            class="w-full flex items-center text-[#111827] dark:text-[#f5f5f5] hover:bg-[#f1f1f1] dark:hover:bg-[#202b36] active:bg-[#e4ecf2] dark:active:bg-[#242f3d] text-left transition-colors cursor-pointer"
            :class="isMobile ? 'px-4 py-2.5 gap-3.5' : 'px-3.5 py-2 gap-3'"
          >
            <Edit2 :class="isMobile ? 'w-5 h-5 text-amber-500' : 'w-4 h-4 text-amber-400'" />
            <span class="font-medium">Edit</span>
          </button>

          <!-- Copy Selected Text (only if text is selected) -->
          <button
            v-if="hasSelectedText"
            @click="handleCopySelectedText"
            class="w-full flex items-center text-[#111827] dark:text-[#f5f5f5] hover:bg-[#f1f1f1] dark:hover:bg-[#202b36] active:bg-[#e4ecf2] dark:active:bg-[#242f3d] text-left transition-colors cursor-pointer"
            :class="isMobile ? 'px-4 py-2.5 gap-3.5' : 'px-3.5 py-2 gap-3'"
          >
            <Copy :class="isMobile ? 'w-5 h-5 text-[#3390ec]' : 'w-4 h-4 text-[#3390ec]'" />
            <span class="font-medium">Copy Selected Text</span>
          </button>

          <!-- Copy Text -->
          <button
            v-if="post.message"
            @click="handleCopy"
            class="w-full flex items-center text-[#111827] dark:text-[#f5f5f5] hover:bg-[#f1f1f1] dark:hover:bg-[#202b36] active:bg-[#e4ecf2] dark:active:bg-[#242f3d] text-left transition-colors cursor-pointer"
            :class="isMobile ? 'px-4 py-2.5 gap-3.5' : 'px-3.5 py-2 gap-3'"
          >
            <Copy :class="isMobile ? 'w-5 h-5 text-[#7f91a4]' : 'w-4 h-4 text-[#7f91a4]'" />
            <span class="font-medium">Copy Text</span>
          </button>

          <!-- Copy Link -->
          <button
            @click="handleCopyLink"
            class="w-full flex items-center text-[#111827] dark:text-[#f5f5f5] hover:bg-[#f1f1f1] dark:hover:bg-[#202b36] active:bg-[#e4ecf2] dark:active:bg-[#242f3d] text-left transition-colors cursor-pointer"
            :class="isMobile ? 'px-4 py-2.5 gap-3.5' : 'px-3.5 py-2 gap-3'"
          >
            <Link :class="isMobile ? 'w-5 h-5 text-[#3390ec]' : 'w-4 h-4 text-[#3390ec]'" />
            <span class="font-medium">Copy Link</span>
          </button>

          <!-- Pin / Unpin -->
          <button
            @click="handleTogglePin"
            class="w-full flex items-center text-[#111827] dark:text-[#f5f5f5] hover:bg-[#f1f1f1] dark:hover:bg-[#202b36] active:bg-[#e4ecf2] dark:active:bg-[#242f3d] text-left transition-colors cursor-pointer"
            :class="isMobile ? 'px-4 py-2.5 gap-3.5' : 'px-3.5 py-2 gap-3'"
          >
            <Pin :class="isMobile ? 'w-5 h-5 text-[#7f91a4]' : 'w-4 h-4 text-[#7f91a4]'" />
            <span class="font-medium">{{ post.is_pinned ? 'Unpin' : 'Pin' }}</span>
          </button>

          <!-- Delete (if allowed) -->
          <button
            v-if="canDelete"
            @click="handleDelete"
            class="w-full flex items-center text-red-500 hover:bg-red-500/10 active:bg-red-500/20 text-left transition-colors cursor-pointer"
            :class="isMobile ? 'px-4 py-2.5 gap-3.5' : 'px-3.5 py-2 gap-3'"
          >
            <Trash2 :class="isMobile ? 'w-5 h-5 text-red-500' : 'w-4 h-4 text-red-400'" />
            <span class="font-medium">Delete</span>
          </button>
        </div>
      </div>

      <!-- Reaction Picker Popover -->
      <div
        v-if="showReactionPicker"
        class="fixed pointer-events-auto z-[60]"
        :class="isMobile ? 'inset-x-3 top-1/2 -translate-y-1/2 max-w-sm mx-auto' : ''"
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
