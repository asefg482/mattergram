<script setup lang="ts">
import { ref, computed, watch, nextTick, onMounted, onUnmounted } from 'vue'
import { useAuthStore } from '../../stores/auth'
import { useChatStore } from '../../stores/chat'
import { useUsersStore } from '../../stores/users'
import MessageBubble from './MessageBubble.vue'
import MessageInput from './MessageInput.vue'
import MessageContextMenu from './MessageContextMenu.vue'
import MessageViewersModal from './MessageViewersModal.vue'
import TelegramAvatar from '../common/TelegramAvatar.vue'
import { formatDateSeparator } from '../../utils/formatters'
import { getSelectedTextForPost } from '../../utils/selection'
import type { MattermostPost } from '../../types/mattermost'
import {
  ArrowLeft,
  X,
  MessageSquareText,
  ArrowDown,
  Loader2,
  UploadCloud
} from 'lucide-vue-next'

const props = defineProps<{
  rootPost: MattermostPost
}>()

const emit = defineEmits<{
  (e: 'close'): void
}>()

const authStore = useAuthStore()
const chatStore = useChatStore()
const usersStore = useUsersStore()

const messagesContainer = ref<HTMLDivElement | null>(null)
const messagesInnerRef = ref<HTMLDivElement | null>(null)
const bottomAnchorRef = ref<HTMLDivElement | null>(null)
const messageInputRef = ref<{ focus: () => void; uploadFiles: (files: FileList | File[] | ArrayLike<File>) => Promise<void> } | null>(null)
const showScrollBottom = ref(false)

// Drag & Drop State
const isDraggingOver = ref(false)
let dragCounter = 0

function handleDragEnter(e: DragEvent) {
  if (e.dataTransfer?.types?.includes('Files')) {
    e.preventDefault()
    dragCounter++
    isDraggingOver.value = true
  }
}

function handleDragOver(e: DragEvent) {
  if (e.dataTransfer?.types?.includes('Files')) {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'copy'
  }
}

function handleDragLeave(e: DragEvent) {
  e.preventDefault()
  dragCounter--
  if (dragCounter <= 0) {
    dragCounter = 0
    isDraggingOver.value = false
  }
}

async function handleDrop(e: DragEvent) {
  e.preventDefault()
  e.stopPropagation()
  dragCounter = 0
  isDraggingOver.value = false

  const files = e.dataTransfer?.files
  if (files && files.length > 0) {
    await messageInputRef.value?.uploadFiles(files)
  }
}

// Context Menu State
const contextPost = ref<MattermostPost | null>(null)
const contextPos = ref({ x: 0, y: 0 })
const showContextMenu = ref(false)
const contextSelectedText = ref('')

// Message Viewers & Reactions Modal State
const showViewersModal = ref(false)
const viewersPost = ref<MattermostPost | null>(null)
const viewersInitialTab = ref<'viewers' | 'reactions'>('viewers')

function onOpenViewers(post: MattermostPost, tab: 'viewers' | 'reactions' = 'viewers') {
  viewersPost.value = post
  viewersInitialTab.value = tab
  showViewersModal.value = true
}

function onMessageContextMenu(e: MouseEvent, post: MattermostPost) {
  contextSelectedText.value = getSelectedTextForPost(post)
  contextPost.value = post
  contextPos.value = { x: e.clientX, y: e.clientY }
  showContextMenu.value = true
}

const threadReplies = computed(() => chatStore.threadPosts)
const rootAuthorName = computed(() => usersStore.getUserDisplayName(props.rootPost.user_id))
const channelName = computed(() => chatStore.activeChannel?.display_name || chatStore.activeChannel?.name || 'Channel')

// Date separator helper
function isDifferentDay(currTimestamp: number, prevTimestamp?: number): boolean {
  if (!prevTimestamp) return true
  const d1 = new Date(currTimestamp).toDateString()
  const d2 = new Date(prevTimestamp).toDateString()
  return d1 !== d2
}

// Fast smooth scroll animator
let currentScrollAnimation: number | null = null

function fastAnimateScroll(targetTop: number, duration = 160) {
  if (!messagesContainer.value) return
  const el = messagesContainer.value

  if (currentScrollAnimation) {
    cancelAnimationFrame(currentScrollAnimation)
    currentScrollAnimation = null
  }

  const start = el.scrollTop
  const distance = targetTop - start
  if (Math.abs(distance) < 4) {
    el.scrollTop = targetTop
    return
  }

  const startTime = performance.now()
  const easeOut = (t: number) => 1 - Math.pow(1 - t, 4)

  function frame(now: number) {
    const elapsed = now - startTime
    const progress = Math.min(elapsed / duration, 1)
    el.scrollTop = start + distance * easeOut(progress)

    if (progress < 1) {
      currentScrollAnimation = requestAnimationFrame(frame)
    } else {
      el.scrollTop = targetTop
      currentScrollAnimation = null
    }
  }

  currentScrollAnimation = requestAnimationFrame(frame)
}

function performInstantScrollToBottom() {
  if (currentScrollAnimation) {
    cancelAnimationFrame(currentScrollAnimation)
    currentScrollAnimation = null
  }
  const el = messagesContainer.value
  if (!el) return

  el.scrollTop = el.scrollHeight
  showScrollBottom.value = false
}

function scrollToBottom(smooth = false) {
  if (smooth) {
    if (!messagesContainer.value) return
    const el = messagesContainer.value
    const target = el.scrollHeight - el.clientHeight
    fastAnimateScroll(target, 220)
  } else {
    performInstantScrollToBottom()
  }
}

function scrollToNewMessageBottom(duration = 220) {
  nextTick(() => {
    if (!messagesContainer.value) return
    const el = messagesContainer.value
    const target = el.scrollHeight - el.clientHeight
    fastAnimateScroll(target, duration)
    showScrollBottom.value = false
  })
}

function onThreadMessageSent() {
  scrollToNewMessageBottom(220)
  if (window.innerWidth >= 768) {
    nextTick(() => {
      messageInputRef.value?.focus()
    })
  }
}

// Track scroll position
let scrollRaf: number | null = null
function handleScroll() {
  if (scrollRaf) return
  scrollRaf = requestAnimationFrame(() => {
    if (messagesContainer.value) {
      const { scrollTop, scrollHeight, clientHeight } = messagesContainer.value
      const distanceToBottom = scrollHeight - scrollTop - clientHeight
      showScrollBottom.value = distanceToBottom > 150
    }
    scrollRaf = null
  })
}

// Watch replies count to autoscroll down when new reply arrives
watch(
  () => [threadReplies.value.length, threadReplies.value[threadReplies.value.length - 1]?.id],
  ([newLen, newLastId], [oldLen, oldLastId]) => {
    const isNew = newLen > (oldLen || 0) && newLastId !== oldLastId
    if (isNew) {
      const last = threadReplies.value[threadReplies.value.length - 1]
      const isMine = last && (last.user_id === authStore.currentUser?.id || last.id.startsWith('temp_'))
      if (isMine || !showScrollBottom.value) {
        scrollToNewMessageBottom(220)
      }
    }
  }
)

function onKeyDown(e: KeyboardEvent) {
  if (e.key === 'Escape' && !showContextMenu.value && !showViewersModal.value) {
    emit('close')
  }
}

function handleViewportResize() {
  if (currentScrollAnimation) return
  if (!showScrollBottom.value) {
    performInstantScrollToBottom()
  }
}

onMounted(() => {
  window.addEventListener('keydown', onKeyDown)
  if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', handleViewportResize)
  }
  window.addEventListener('resize', handleViewportResize)
  nextTick(() => {
    performInstantScrollToBottom()
    if (window.innerWidth >= 768) {
      messageInputRef.value?.focus()
    }
  })
})

onUnmounted(() => {
  window.removeEventListener('keydown', onKeyDown)
  if (window.visualViewport) {
    window.visualViewport.removeEventListener('resize', handleViewportResize)
  }
  window.removeEventListener('resize', handleViewportResize)
  if (currentScrollAnimation) {
    cancelAnimationFrame(currentScrollAnimation)
  }
})
</script>

<template>
  <div
    class="flex-1 h-full flex flex-col relative overflow-hidden bg-[#e4ecf2] dark:bg-[#0e1621] select-none"
    @dragenter="handleDragEnter"
    @dragover="handleDragOver"
    @dragleave="handleDragLeave"
    @drop="handleDrop"
  >
    <!-- Drag & Drop Overlay -->
    <div
      v-if="isDraggingOver"
      class="absolute inset-0 z-50 pointer-events-none p-6 flex items-center justify-center animate-in fade-in zoom-in-95 duration-150"
    >
      <div class="absolute inset-0 bg-[#e4ecf2]/85 dark:bg-[#0e1621]/80 backdrop-blur-md"></div>
      <div
        class="relative z-10 w-full max-w-md p-8 border-2 border-dashed border-[#3390ec] rounded-3xl bg-white/95 dark:bg-[#17212b]/95 shadow-2xl flex flex-col items-center justify-center text-center"
      >
        <div class="w-16 h-16 rounded-2xl bg-[#3390ec]/15 dark:bg-[#3390ec]/20 flex items-center justify-center text-[#3390ec] mb-4 shadow-inner">
          <UploadCloud class="w-8 h-8 stroke-[1.8] animate-bounce" />
        </div>
        <h3 class="text-base font-bold text-[#111827] dark:text-[#f5f5f5] mb-1.5">
          Drop files to reply
        </h3>
        <p class="text-xs text-[#7f91a4] max-w-xs leading-relaxed">
          Drop images, documents, or videos to attach them to your thread reply
        </p>
      </div>
    </div>

    <!-- Thread View Header -->
    <div
      class="border-b border-[#dfe1e5] dark:border-[#101921] px-4 flex items-center justify-between bg-white dark:bg-[#17212b] z-20 shrink-0 shadow-xs"
      style="padding-top: env(safe-area-inset-top, 0px); min-height: calc(3.5rem + env(safe-area-inset-top, 0px));"
    >
      <div class="flex items-center gap-3 min-w-0">
        <!-- Back Button to Main Channel -->
        <button
          @click="emit('close')"
          class="p-2 -ml-1 text-[#7f91a4] hover:text-[#3390ec] hover:bg-[#f1f1f1] dark:hover:bg-[#202b36] rounded-full transition-colors cursor-pointer group"
          title="Back to chat (Esc)"
        >
          <ArrowLeft class="w-5 h-5 group-hover:-translate-x-0.5 transition-transform" />
        </button>

        <!-- Avatar of Root Message Author -->
        <TelegramAvatar
          :userId="rootPost.user_id"
          :name="rootAuthorName"
          size="md"
        />

        <!-- Title & Subtitle -->
        <div class="min-w-0 flex flex-col">
          <div class="flex items-center gap-2">
            <h2 class="text-sm font-bold text-[#111827] dark:text-[#f5f5f5] truncate flex items-center gap-1.5">
              <span>Thread</span>
              <span class="text-xs font-normal text-[#7f91a4]">with {{ rootAuthorName }}</span>
            </h2>
          </div>
          <p class="text-xs text-[#7f91a4] truncate">
            <span>{{ threadReplies.length }} {{ threadReplies.length === 1 ? 'reply' : 'replies' }}</span>
            <span class="mx-1">•</span>
            <span>in {{ channelName }}</span>
          </p>
        </div>
      </div>

      <!-- Header Actions -->
      <div class="flex items-center gap-1">
        <button
          @click="emit('close')"
          class="p-2 text-[#7f91a4] hover:text-[#111827] dark:hover:text-[#f5f5f5] hover:bg-[#f1f1f1] dark:hover:bg-[#202b36] rounded-full transition-colors cursor-pointer"
          title="Close Thread (Esc)"
        >
          <X class="w-5 h-5" />
        </button>
      </div>
    </div>

    <!-- Messages Scroll Area -->
    <div
      ref="messagesContainer"
      @scroll="handleScroll"
      class="flex-1 overflow-y-auto overflow-x-hidden tg-chat-bg tg-scroll-container relative select-text"
    >
      <!-- Loading indicator -->
      <div v-if="chatStore.loadingThread && threadReplies.length === 0" class="flex items-center justify-center py-10">
        <Loader2 class="w-6 h-6 animate-spin text-[#3390ec]" />
      </div>

      <div ref="messagesInnerRef" dir="ltr" class="w-full px-1 sm:px-2 pt-3 pb-6 flex flex-col">
        <!-- Root Post Frame / Card (Thread Origin) -->
        <div class="w-full mb-3 px-1 sm:px-2">
          <div class="rounded-2xl p-2.5 sm:p-3 bg-white/70 dark:bg-[#17212b]/80 border border-[#dfe1e5]/80 dark:border-[#202b36] backdrop-blur-md shadow-xs">
            <!-- Badge / Origin Label -->
            <div class="flex items-center justify-between pb-2 mb-2 border-b border-black/5 dark:border-white/5 text-[11px] font-semibold text-[#7f91a4] select-none">
              <div class="flex items-center gap-1.5 text-[#3390ec]">
                <MessageSquareText class="w-3.5 h-3.5" />
                <span>Original Message</span>
              </div>
              <span class="text-[10px] text-[#7f91a4] opacity-75">Start of thread</span>
            </div>

            <!-- Root Message Bubble -->
            <MessageBubble
              :post="rootPost"
              :showSenderName="true"
              :showAvatar="true"
              :isThreadView="true"
              @contextmenu="onMessageContextMenu($event, rootPost)"
              @open-viewers="onOpenViewers"
            />
          </div>
        </div>

        <!-- Replies Section Divider -->
        <div class="flex items-center my-3 select-none px-4">
          <div class="flex-1 h-px bg-gray-300/60 dark:bg-[#202b36]"></div>
          <span class="mx-3 px-2.5 py-0.5 rounded-full text-[10px] font-bold tracking-wider uppercase bg-[#3390ec]/15 text-[#3390ec] dark:text-[#52a5f5]">
            {{ threadReplies.length }} {{ threadReplies.length === 1 ? 'Reply' : 'Replies' }}
          </span>
          <div class="flex-1 h-px bg-gray-300/60 dark:bg-[#202b36]"></div>
        </div>

        <!-- Empty state: No replies yet -->
        <div
          v-if="threadReplies.length === 0 && !chatStore.loadingThread"
          class="flex flex-col items-center justify-center py-8 text-center px-4 select-none"
        >
          <div class="w-12 h-12 rounded-full bg-[#3390ec]/10 dark:bg-[#3390ec]/15 flex items-center justify-center text-[#3390ec] mb-2 shadow-xs">
            <MessageSquareText class="w-6 h-6 stroke-[1.8]" />
          </div>
          <p class="text-xs font-bold text-[#111827] dark:text-[#f5f5f5] mb-0.5">
            No replies yet
          </p>
          <p class="text-[11px] text-[#7f91a4]">
            Send a message below to reply to this thread
          </p>
        </div>

        <!-- Thread Replies List -->
        <template v-else>
          <template v-for="(reply, index) in threadReplies" :key="reply.pending_post_id || reply.id">
            <!-- Date Divider -->
            <div
              v-if="isDifferentDay(reply.create_at, threadReplies[index - 1]?.create_at)"
              class="flex justify-center my-3 select-none"
            >
              <span class="px-3 py-1 rounded-full text-[11px] font-medium bg-black/30 text-white/90 backdrop-blur-xs shadow-xs">
                {{ formatDateSeparator(reply.create_at) }}
              </span>
            </div>

            <!-- Message Bubble for Reply -->
            <MessageBubble
              :post="reply"
              :showSenderName="true"
              :showAvatar="true"
              :isThreadView="true"
              @contextmenu="onMessageContextMenu($event, reply)"
              @open-viewers="onOpenViewers"
            />
          </template>
        </template>

        <!-- Bottom scroll anchor -->
        <div ref="bottomAnchorRef" class="h-2 w-full pointer-events-none"></div>
      </div>

      <!-- Floating Scroll to Bottom Button -->
      <button
        v-if="showScrollBottom"
        @click="scrollToBottom(true)"
        class="sticky bottom-4 float-right mr-4 w-10 h-10 rounded-full bg-white dark:bg-[#17212b] border border-[#dfe1e5] dark:border-[#202b36] shadow-lg flex items-center justify-center text-[#7f91a4] hover:text-[#3390ec] transition-all z-20 cursor-pointer"
        title="Scroll to latest"
      >
        <ArrowDown class="w-5 h-5" />
      </button>
    </div>

    <!-- Bottom Input Bar for Thread -->
    <MessageInput
      ref="messageInputRef"
      :channelId="rootPost.channel_id"
      :rootId="rootPost.id"
      placeholder="Reply in thread..."
      @sent="onThreadMessageSent"
    />

    <!-- Message Context Menu -->
    <MessageContextMenu
      :post="contextPost"
      :position="contextPos"
      :isOpen="showContextMenu"
      :selectedText="contextSelectedText"
      @close="showContextMenu = false"
      @viewers="(p) => onOpenViewers(p, 'viewers')"
    />

    <!-- Message Viewers & Reactions Modal -->
    <MessageViewersModal
      :post="viewersPost"
      :isOpen="showViewersModal"
      :initialTab="viewersInitialTab"
      @close="showViewersModal = false"
    />
  </div>
</template>
