<script setup lang="ts">
import { ref, computed, watch, nextTick, onMounted, onUnmounted } from 'vue'
import { useAuthStore } from '../../stores/auth'
import { useChatStore } from '../../stores/chat'
import { useUiStore } from '../../stores/ui'
import ChatHeader from './ChatHeader.vue'
import MessageBubble from './MessageBubble.vue'
import MessageInput from './MessageInput.vue'
import FilePreviewModal from './FilePreviewModal.vue'
import MessageContextMenu from './MessageContextMenu.vue'
import { formatDateSeparator } from '../../utils/formatters'
import type { MattermostPost } from '../../types/mattermost'
import { MessageSquare, ArrowDown, Loader2 } from 'lucide-vue-next'

const authStore = useAuthStore()
const chatStore = useChatStore()
const uiStore = useUiStore()

const messagesContainer = ref<HTMLDivElement | null>(null)
const bottomAnchorRef = ref<HTMLDivElement | null>(null)
const showScrollBottom = ref(false)

// Context Menu State
const contextPost = ref<MattermostPost | null>(null)
const contextPos = ref({ x: 0, y: 0 })
const showContextMenu = ref(false)

function onMessageContextMenu(e: MouseEvent, post: MattermostPost) {
  contextPost.value = post
  contextPos.value = { x: e.clientX, y: e.clientY }
  showContextMenu.value = true
}

const channel = computed(() => chatStore.activeChannel)
const posts = computed(() => chatStore.currentPosts)

// Check if sender name should be shown (in group channels for incoming messages)
const isGroup = computed(() => channel.value?.type !== 'D')

// Date separator helper
function isDifferentDay(currTimestamp: number, prevTimestamp?: number): boolean {
  if (!prevTimestamp) return true
  const d1 = new Date(currTimestamp).toDateString()
  const d2 = new Date(prevTimestamp).toDateString()
  return d1 !== d2
}

// High-speed smooth scroll animator (160ms snappy Telegram curve)
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
  // Snappy quartic ease-out
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

// Fast scroll to bottom
function scrollToBottom(smooth = false) {
  nextTick(() => {
    if (!messagesContainer.value) return
    const el = messagesContainer.value
    const target = el.scrollHeight - el.clientHeight

    if (smooth) {
      fastAnimateScroll(target, 160)
    } else {
      if (currentScrollAnimation) {
        cancelAnimationFrame(currentScrollAnimation)
        currentScrollAnimation = null
      }
      el.scrollTop = target + 10000
    }

    // Secondary settlement check without restarting smooth animations
    setTimeout(() => {
      if (messagesContainer.value && !showScrollBottom.value) {
        const latestTarget = messagesContainer.value.scrollHeight - messagesContainer.value.clientHeight
        if (Math.abs(messagesContainer.value.scrollTop - latestTarget) > 2) {
          messagesContainer.value.scrollTop = latestTarget + 10000
        }
      }
    }, 180)
  })
}

function onMessageSent() {
  scrollToBottom(true)
}

// Track scroll position throttled with requestAnimationFrame to prevent scroll stutter
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

// Scroll on channel switch
watch(
  () => chatStore.activeChannelId,
  () => {
    scrollToBottom(false)
  }
)

// Scroll when posts load or change
watch(
  () => [posts.value.length, posts.value[posts.value.length - 1]?.id],
  () => {
    const isNearBottom = !showScrollBottom.value
    const lastPost = posts.value[posts.value.length - 1]
    const isMine = lastPost && lastPost.user_id === authStore.currentUser?.id
    if (isNearBottom || isMine) {
      scrollToBottom(true)
    }
  }
)

watch(
  () => chatStore.loadingPosts,
  (loading) => {
    if (!loading && posts.value.length > 0) {
      scrollToBottom(false)
    }
  }
)

let resizeObserver: ResizeObserver | null = null

onMounted(() => {
  if (messagesContainer.value && typeof ResizeObserver !== 'undefined') {
    resizeObserver = new ResizeObserver(() => {
      if (!showScrollBottom.value) {
        scrollToBottom(false)
      }
    })
    resizeObserver.observe(messagesContainer.value)
  }
  scrollToBottom(false)
})

onUnmounted(() => {
  resizeObserver?.disconnect()
})
</script>

<template>
  <div class="flex-1 h-full flex flex-col relative overflow-hidden bg-[#0e1621] dark:bg-[#0e1621] bg-[#e4ecf2]">
    <!-- Empty State: No chat selected -->
    <div
      v-if="!channel"
      class="flex-1 flex flex-col items-center justify-center p-6 text-center select-none tg-chat-bg"
    >
      <div class="w-20 h-20 rounded-full bg-[#17212b] dark:bg-[#17212b] bg-white/60 flex items-center justify-center text-[#7f91a4] mb-4 shadow-md">
        <MessageSquare class="w-10 h-10 stroke-[1.5]" />
      </div>
      <h3 class="text-sm font-semibold text-[#f5f5f5] dark:text-[#f5f5f5] text-[#111827] mb-1">
        Select a chat to start messaging
      </h3>
      <p class="text-xs text-[#7f91a4] max-w-xs">
        Choose a channel or direct message from the sidebar to view conversations.
      </p>
    </div>

    <!-- Active Chat View -->
    <template v-else>
      <!-- Top Header -->
      <ChatHeader />

      <!-- Messages Scroll Area -->
      <div
        ref="messagesContainer"
        @scroll="handleScroll"
        class="flex-1 overflow-y-auto overflow-x-hidden tg-chat-bg tg-scroll-container relative"
      >
        <!-- Loading spinner -->
        <div v-if="chatStore.loadingPosts && posts.length === 0" class="flex items-center justify-center py-12">
          <Loader2 class="w-6 h-6 animate-spin text-[#3390ec]" />
        </div>

        <!-- No messages yet -->
        <div v-else-if="posts.length === 0" class="flex flex-col items-center justify-center h-full text-center p-6 text-xs text-[#7f91a4]">
          <div class="px-4 py-2 rounded-full bg-black/20 backdrop-blur-xs text-white/80">
            No messages here yet. Send a message to start!
          </div>
        </div>

        <!-- Messages List with Date Separators (Full width stuck to left/right sides) -->
        <div v-else dir="ltr" class="w-full px-2 sm:px-4 pt-2 pb-6 flex flex-col">
          <template v-for="(post, index) in posts" :key="post.id">
            <!-- Date Divider -->
            <div
              v-if="isDifferentDay(post.create_at, posts[index - 1]?.create_at)"
              class="flex justify-center my-3 select-none"
            >
              <span class="px-3 py-1 rounded-full text-[11px] font-medium bg-black/30 text-white/90 backdrop-blur-xs shadow-xs">
                {{ formatDateSeparator(post.create_at) }}
              </span>
            </div>

            <!-- Message Bubble -->
            <MessageBubble
              :post="post"
              :showSenderName="isGroup"
              :showAvatar="isGroup"
              @contextmenu="onMessageContextMenu($event, post)"
            />
          </template>

          <!-- Bottom scroll anchor -->
          <div ref="bottomAnchorRef" class="h-2 w-full pointer-events-none"></div>
        </div>

        <!-- Floating Scroll to Bottom Button -->
        <button
          v-if="showScrollBottom"
          @click="scrollToBottom(true)"
          class="sticky bottom-4 float-right mr-4 w-10 h-10 rounded-full bg-[#17212b] dark:bg-[#17212b] bg-white border border-[#202b36] shadow-lg flex items-center justify-center text-[#7f91a4] hover:text-[#3390ec] transition-all z-20"
        >
          <ArrowDown class="w-5 h-5" />
        </button>
      </div>

      <!-- Bottom Input Bar -->
      <MessageInput :channelId="channel.id" @sent="onMessageSent" />

      <!-- File Preview Modal -->
      <FilePreviewModal />

      <!-- Message Context Menu -->
      <MessageContextMenu
        :post="contextPost"
        :position="contextPos"
        :isOpen="showContextMenu"
        @close="showContextMenu = false"
      />
    </template>
  </div>
</template>
