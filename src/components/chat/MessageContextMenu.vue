<script setup lang="ts">
import { computed, ref, onMounted, onUnmounted, nextTick, watch } from 'vue'
import { useAuthStore } from '../../stores/auth'
import { useChatStore } from '../../stores/chat'
import { useUiStore } from '../../stores/ui'
import { useTodoStore } from '../../stores/todo'
import { showConfirm } from '../../stores/alert'
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
  CheckSquare
} from 'lucide-vue-next'
import ReactionPicker from './ReactionPicker.vue'
import { frequentReactions, recordReactionUsage } from '../../utils/reactions'

const props = defineProps<{
  post: MattermostPost | null
  position: { x: number; y: number }
  isOpen: boolean
}>()

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'viewers', post: MattermostPost): void
  (e: 'thread', post: MattermostPost): void
}>()

const authStore = useAuthStore()
const chatStore = useChatStore()
const uiStore = useUiStore()
const todoStore = useTodoStore()

function handleAddToTodo() {
  if (props.post) {
    todoStore.addPostToTodo(props.post)
  }
  emit('close')
}

const menuRef = ref<HTMLDivElement | null>(null)
const adjustedX = ref(props.position.x)
const adjustedY = ref(props.position.y)
const transformOrigin = ref('top left')

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
  if (props.position.y + menuHeight + padding > window.innerHeight) {
    y = props.position.y - menuHeight - 2
    originY = 'bottom'
    if (y < padding) {
      y = padding
      originY = 'top'
    }
  }

  transformOrigin.value = `${originY} ${originX}`
  adjustedX.value = Math.round(x)
  adjustedY.value = Math.round(y)
}

const pickerStyle = computed(() => {
  const winW = typeof window !== 'undefined' ? window.innerWidth : 1000
  const winH = typeof window !== 'undefined' ? window.innerHeight : 800
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

function handleCopy() {
  if (props.post?.message) {
    navigator.clipboard.writeText(props.post.message)
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
  window.addEventListener('click', onWindowClick)
  window.addEventListener('keydown', onWindowKeydown)
})

onUnmounted(() => {
  window.removeEventListener('click', onWindowClick)
  window.removeEventListener('keydown', onWindowKeydown)
})
</script>

<template>
  <div v-if="isOpen && post" class="fixed inset-0 z-50 pointer-events-none">
    <!-- Backdrop to capture right clicks -->
    <div
      class="absolute inset-0 pointer-events-auto"
      @click="emit('close')"
      @contextmenu.prevent="emit('close')"
    ></div>

    <!-- Telegram Message Context Menu -->
    <div
      ref="menuRef"
      class="fixed pointer-events-auto w-52 bg-white dark:bg-[#17212b] border border-[#dfe1e5] dark:border-[#202b36] rounded-2xl shadow-2xl overflow-hidden z-50 select-none tg-context-menu py-1.5"
      :style="{ left: `${adjustedX}px`, top: `${adjustedY}px`, transformOrigin: transformOrigin }"
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

        <!-- Add to TODO -->
        <button
          @click="handleAddToTodo"
          class="w-full px-3.5 py-2 flex items-center gap-3 text-[#111827] dark:text-[#f5f5f5] hover:bg-[#f1f1f1] dark:hover:bg-[#202b36] text-left transition-colors cursor-pointer"
        >
          <CheckSquare class="w-4 h-4 text-[#3390ec]" />
          <span>Add to TODO</span>
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

        <!-- Copy Text -->
        <button
          v-if="post.message"
          @click="handleCopy"
          class="w-full px-3.5 py-2 flex items-center gap-3 text-[#111827] dark:text-[#f5f5f5] hover:bg-[#f1f1f1] dark:hover:bg-[#202b36] text-left transition-colors"
        >
          <Copy class="w-4 h-4 text-[#7f91a4]" />
          <span>Copy Text</span>
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
      class="fixed pointer-events-auto z-50"
      :style="pickerStyle"
    >
      <ReactionPicker
        @select="handleReaction"
        @close="showReactionPicker = false; emit('close')"
      />
    </div>
  </div>
</template>
