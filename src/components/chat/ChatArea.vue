<script setup lang="ts">
import { ref, computed, watch, nextTick, onMounted, onUnmounted } from 'vue'
import { useAuthStore } from '../../stores/auth'
import { useChatStore } from '../../stores/chat'
import { useUiStore } from '../../stores/ui'
import ChatHeader from './ChatHeader.vue'
import ThreadView from './ThreadView.vue'
import MessageBubble from './MessageBubble.vue'
import MessageInput from './MessageInput.vue'
import FilePreviewModal from './FilePreviewModal.vue'
import MessageContextMenu from './MessageContextMenu.vue'
import MessageViewersModal from './MessageViewersModal.vue'
import { formatDateSeparator, isDifferentDay } from '../../utils/formatters'
import type { MattermostPost } from '../../types/mattermost'
import { MessageSquare, ArrowDown, Loader2, UploadCloud } from 'lucide-vue-next'

const authStore = useAuthStore()
const chatStore = useChatStore()
const uiStore = useUiStore()

const messagesContainer = ref<HTMLDivElement | null>(null)
const messagesInnerRef = ref<HTMLDivElement | null>(null)
const bottomAnchorRef = ref<HTMLDivElement | null>(null)
const messageInputRef = ref<{ focus: () => void; uploadFiles: (files: FileList | File[] | ArrayLike<File>) => Promise<void> } | null>(null)
const showScrollBottom = ref(false)
const isChannelSwitching = ref(false)

// Drag & Drop State
const isDraggingOver = ref(false)
let dragCounter = 0

function handleDragEnter(e: DragEvent) {
  if (!channel.value) return
  if (e.dataTransfer?.types?.includes('Files')) {
    e.preventDefault()
    dragCounter++
    isDraggingOver.value = true
  }
}

function handleDragOver(e: DragEvent) {
  if (!channel.value) return
  if (e.dataTransfer?.types?.includes('Files')) {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'copy'
  }
}

function handleDragLeave(e: DragEvent) {
  if (!channel.value) return
  e.preventDefault()
  dragCounter--
  if (dragCounter <= 0) {
    dragCounter = 0
    isDraggingOver.value = false
  }
}

async function handleDrop(e: DragEvent) {
  if (!channel.value) return
  e.preventDefault()
  e.stopPropagation()
  dragCounter = 0
  isDraggingOver.value = false

  const files = e.dataTransfer?.files
  if (files && files.length > 0) {
    await messageInputRef.value?.uploadFiles(files)
  }
}

function onWindowDragEnd() {
  dragCounter = 0
  isDraggingOver.value = false
}

function onWindowDragLeave(e: DragEvent) {
  if (e.clientX <= 0 || e.clientY <= 0 || e.clientX >= window.innerWidth || e.clientY >= window.innerHeight) {
    dragCounter = 0
    isDraggingOver.value = false
  }
}

function preventWindowDragOver(e: DragEvent) {
  if (e.dataTransfer?.types?.includes('Files')) {
    e.preventDefault()
  }
}

function preventWindowDrop(e: DragEvent) {
  dragCounter = 0
  isDraggingOver.value = false
  e.preventDefault()
}

// Context Menu State
const contextPost = ref<MattermostPost | null>(null)
const contextPos = ref({ x: 0, y: 0 })
const showContextMenu = ref(false)

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
  contextPost.value = post
  contextPos.value = { x: e.clientX, y: e.clientY }
  showContextMenu.value = true
}

const channel = computed(() => chatStore.activeChannel)
const posts = computed(() => chatStore.currentPosts)
const isChatLoading = computed(() => {
  const id = chatStore.activeChannelId
  if (!id) return false
  return chatStore.loadingPosts || !chatStore.hasLoadedChannelPosts[id]
})

// Check if sender name should be shown (in group channels for incoming messages)
const isGroup = computed(() => channel.value?.type !== 'D')



// Telegram unread messages separator check
function isFirstUnread(postId: string): boolean {
  if (!chatStore.activeChannelId) return false
  return chatStore.firstUnreadPostIds[chatStore.activeChannelId] === postId
}

// Unread messages count waiting below if user is scrolled up
const unreadBelowCount = computed(() => {
  if (!chatStore.activeChannelId) return 0
  const firstId = chatStore.firstUnreadPostIds[chatStore.activeChannelId]
  if (!firstId) return 0
  const list = posts.value
  const idx = list.findIndex((p) => p.id === firstId)
  if (idx === -1) return 0
  return list.length - idx
})

// High-speed smooth scroll animator (used only when user clicks floating down arrow button)
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

// Instant scroll to bottom without any visible scrolling motion
function performInstantScrollToBottom() {
  if (currentScrollAnimation) {
    cancelAnimationFrame(currentScrollAnimation)
    currentScrollAnimation = null
  }
  const el = messagesContainer.value
  if (!el) return

  el.scrollTop = el.scrollHeight
  showScrollBottom.value = false
  chatStore.isScrolledUp = false
}

// Scheduled channel switch sequence that guarantees the chat opens already at the latest message
function onChannelSwitch() {
  chatStore.markActiveChannelViewed()
  isChannelSwitching.value = true
  if (currentScrollAnimation) {
    cancelAnimationFrame(currentScrollAnimation)
    currentScrollAnimation = null
  }
  showScrollBottom.value = false
  chatStore.isScrolledUp = false

  // Step 1: Immediate synchronous scroll
  performInstantScrollToBottom()

  // Step 2: Next tick when Vue updates DOM
  nextTick(() => {
    performInstantScrollToBottom()

    // Step 3: Frame 1 (layout measurement)
    requestAnimationFrame(() => {
      performInstantScrollToBottom()

      // Step 4: Frame 2 (render pass)
      requestAnimationFrame(() => {
        performInstantScrollToBottom()
        isChannelSwitching.value = false
      })
    })
  })

  // Safety settlement checks for late-loading dynamic elements
  setTimeout(() => {
    if (!showScrollBottom.value) {
      performInstantScrollToBottom()
    }
  }, 60)

  setTimeout(() => {
    if (!showScrollBottom.value) {
      performInstantScrollToBottom()
    }
  }, 180)
}

// Scroll to bottom (smooth only when user explicitly clicks down button)
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

// Smoothly scroll down when a new message enters so it flows in without hard snaps
function scrollToNewMessageBottom(duration = 220) {
  nextTick(() => {
    if (!messagesContainer.value) return
    const el = messagesContainer.value
    const target = el.scrollHeight - el.clientHeight
    fastAnimateScroll(target, duration)
    showScrollBottom.value = false
    chatStore.isScrolledUp = false
  })
}

function onMessageSent() {
  scrollToNewMessageBottom(220)
  if (window.innerWidth >= 768) {
    nextTick(() => {
      messageInputRef.value?.focus()
    })
  }
}

// Track scroll position throttled with requestAnimationFrame
let scrollRaf: number | null = null
const isPrependingOlderPosts = ref(false)

async function checkAndLoadOlderMessages() {
  const channelId = chatStore.activeChannelId
  if (!channelId) return
  if (
    isPrependingOlderPosts.value ||
    chatStore.loadingOlderPosts ||
    chatStore.loadingPosts ||
    isChannelSwitching.value
  ) {
    return
  }
  if (chatStore.hasMoreOlderPosts[channelId] === false) return
  if (!messagesContainer.value || posts.value.length === 0) return

  const container = messagesContainer.value
  const prevScrollHeight = container.scrollHeight
  const prevScrollTop = container.scrollTop

  isPrependingOlderPosts.value = true
  try {
    const res = await chatStore.loadOlderPosts(channelId)
    if (res.addedCount > 0 && messagesContainer.value) {
      await nextTick()
      const newScrollHeight = messagesContainer.value.scrollHeight
      const heightDiff = newScrollHeight - prevScrollHeight
      messagesContainer.value.scrollTop = prevScrollTop + heightDiff
    }
  } catch (err) {
    console.error('Failed to load older messages:', err)
  } finally {
    requestAnimationFrame(() => {
      isPrependingOlderPosts.value = false
    })
  }
}

function handleScroll() {
  if (isChannelSwitching.value) {
    showScrollBottom.value = false
    chatStore.isScrolledUp = false
    return
  }
  if (scrollRaf) return
  scrollRaf = requestAnimationFrame(() => {
    if (messagesContainer.value) {
      const { scrollTop, scrollHeight, clientHeight } = messagesContainer.value
      const distanceToBottom = scrollHeight - scrollTop - clientHeight
      const isUp = distanceToBottom > 150
      showScrollBottom.value = isUp
      chatStore.isScrolledUp = isUp

      // Check for loading older messages when near top
      if (scrollTop <= 120) {
        checkAndLoadOlderMessages()
      }
    }
    scrollRaf = null
  })
}

function handleChatAreaClick(e: MouseEvent) {
  if (window.innerWidth < 768) return

  const target = e.target as HTMLElement
  if (
    target.closest('button') ||
    target.closest('a') ||
    target.closest('input') ||
    target.closest('textarea') ||
    target.closest('video') ||
    target.closest('audio') ||
    target.closest('.tg-mention') ||
    target.closest('[data-mention]')
  ) {
    return
  }
  const selection = window.getSelection()
  if (selection && selection.toString().trim().length > 0) {
    return
  }
  messageInputRef.value?.focus()
}

// Scroll immediately on channel switch or when clicking active chat in sidebar
watch(
  () => [chatStore.activeChannelId, chatStore.scrollToBottomTrigger],
  () => {
    onChannelSwitch()
    if (window.innerWidth >= 768) {
      nextTick(() => {
        messageInputRef.value?.focus()
      })
    }
  }
)

// Scroll immediately when loading finished
watch(
  () => chatStore.loadingPosts,
  (loading) => {
    if (!loading && posts.value.length > 0) {
      onChannelSwitch()
    }
  }
)

// Keep at bottom when posts change or when new messages arrive
watch(
  () => [posts.value.length, posts.value[posts.value.length - 1]?.id],
  ([newLen, newLastId], [oldLen, oldLastId]) => {
    if (isPrependingOlderPosts.value) {
      return
    }
    if (isChannelSwitching.value) {
      performInstantScrollToBottom()
      return
    }

    const isNewMessage = newLen > (oldLen || 0) && newLastId !== oldLastId
    if (isNewMessage) {
      const lastPost = posts.value[posts.value.length - 1]
      const isMine = lastPost && (lastPost.user_id === authStore.currentUser?.id || lastPost.id.startsWith('temp_'))
      const isAtBottom = !showScrollBottom.value

      if (isMine || isAtBottom) {
        scrollToNewMessageBottom(220)
      }
    }
  }
)

let resizeObserver: ResizeObserver | null = null

function onMediaLoad() {
  if (currentScrollAnimation || isPrependingOlderPosts.value) return
  if (isChannelSwitching.value || !showScrollBottom.value) {
    performInstantScrollToBottom()
  }
}

// Watch messagesInnerRef so observer is attached when the message container mounts
watch(
  () => messagesInnerRef.value,
  (newEl, oldEl) => {
    if (oldEl && resizeObserver) {
      resizeObserver.unobserve(oldEl)
    }
    if (newEl && resizeObserver) {
      resizeObserver.observe(newEl)
      if (!currentScrollAnimation && !isPrependingOlderPosts.value) {
        performInstantScrollToBottom()
      }
    }
  }
)

let viewersRefreshInterval: any = null

onMounted(() => {
  if (typeof ResizeObserver !== 'undefined') {
    resizeObserver = new ResizeObserver(() => {
      if (currentScrollAnimation || isPrependingOlderPosts.value) return
      if (isChannelSwitching.value || !showScrollBottom.value) {
        performInstantScrollToBottom()
      }
    })
    if (messagesInnerRef.value) {
      resizeObserver.observe(messagesInnerRef.value)
    }
  }

  if (messagesContainer.value) {
    messagesContainer.value.addEventListener('load', onMediaLoad, true)
  }

  onChannelSwitch()

  // Periodically refresh channel viewers and presence while chat is open
  viewersRefreshInterval = setInterval(() => {
    if (chatStore.activeChannelId && !document.hidden) {
      chatStore.fetchChannelMembers(chatStore.activeChannelId)
    }
  }, 6000)

  window.addEventListener('focus', onWindowFocus)
  window.addEventListener('dragend', onWindowDragEnd)
  window.addEventListener('dragleave', onWindowDragLeave)
  window.addEventListener('dragover', preventWindowDragOver)
  window.addEventListener('drop', preventWindowDrop)
})

function onWindowFocus() {
  if (chatStore.activeChannelId && !document.hidden) {
    chatStore.markActiveChannelViewed()
    chatStore.fetchChannelMembers(chatStore.activeChannelId)
  }
}

onUnmounted(() => {
  resizeObserver?.disconnect()
  if (viewersRefreshInterval) {
    clearInterval(viewersRefreshInterval)
    viewersRefreshInterval = null
  }
  if (messagesContainer.value) {
    messagesContainer.value.removeEventListener('load', onMediaLoad, true)
  }
  window.removeEventListener('focus', onWindowFocus)
  window.removeEventListener('dragend', onWindowDragEnd)
  window.removeEventListener('dragleave', onWindowDragLeave)
  window.removeEventListener('dragover', preventWindowDragOver)
  window.removeEventListener('drop', preventWindowDrop)
})
</script>

<template>
  <div
    class="flex-1 h-full flex flex-col relative overflow-hidden bg-[#e4ecf2] dark:bg-[#0e1621]"
    @dragenter="handleDragEnter"
    @dragover="handleDragOver"
    @dragleave="handleDragLeave"
    @drop="handleDrop"
  >
    <!-- Drag & Drop Overlay (Telegram Style) -->
    <div
      v-if="isDraggingOver && channel"
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
          Drop files here to send
        </h3>
        <p class="text-xs text-[#7f91a4] max-w-xs leading-relaxed">
          Drop images, videos, or documents to attach them to your message
        </p>
      </div>
    </div>

    <!-- Empty State: No chat selected -->
    <div
      v-if="!channel"
      class="flex-1 flex flex-col items-center justify-center p-6 text-center select-none tg-chat-bg"
    >
      <div class="w-20 h-20 rounded-full bg-white/60 dark:bg-[#17212b] flex items-center justify-center text-[#7f91a4] mb-4 shadow-md">
        <MessageSquare class="w-10 h-10 stroke-[1.5]" />
      </div>
      <h3 class="text-sm font-semibold text-[#111827] dark:text-[#f5f5f5] mb-1">
        Select a chat to start messaging
      </h3>
      <p class="text-xs text-[#7f91a4] max-w-xs">
        Choose a channel or direct message from the sidebar to view conversations.
      </p>
    </div>

    <!-- Active Chat View -->
    <template v-else>
      <!-- Dedicated Thread View Page -->
      <ThreadView
        v-if="chatStore.activeThreadRootPost"
        :key="chatStore.activeThreadRootPost.id"
        :rootPost="chatStore.activeThreadRootPost"
        @close="chatStore.closeThread()"
      />

      <!-- Main Channel View -->
      <div v-else class="flex-1 h-full flex flex-col relative overflow-hidden">
        <!-- Top Header -->
        <ChatHeader />

        <!-- Messages Scroll Area -->
        <div
          ref="messagesContainer"
          @scroll="handleScroll"
          @click="handleChatAreaClick"
          class="flex-1 overflow-y-auto overflow-x-hidden tg-chat-bg tg-scroll-container relative transition-opacity duration-75"
          :class="{ 'opacity-0': isChannelSwitching }"
        >
          <!-- Loading spinner -->
          <div v-if="isChatLoading && posts.length === 0" class="flex flex-col items-center justify-center h-full py-16 select-none animate-in fade-in duration-150">
            <div class="px-4 py-2 rounded-full bg-white/80 dark:bg-[#17212b]/90 border border-[#dfe1e5]/60 dark:border-[#202b36]/60 backdrop-blur-md shadow-sm flex items-center gap-2.5 text-xs font-medium text-[#3390ec]">
              <Loader2 class="w-4 h-4 animate-spin text-[#3390ec]" />
              <span class="text-xs text-[#7f91a4]">Loading messages...</span>
            </div>
          </div>

          <!-- No messages yet -->
          <div v-else-if="!isChatLoading && posts.length === 0" class="flex flex-col items-center justify-center h-full text-center p-6 text-xs text-[#7f91a4] select-none">
            <div class="px-4 py-2 rounded-full bg-black/20 backdrop-blur-xs text-white/80">
              No messages here yet. Send a message to start!
            </div>
          </div>

          <!-- Messages List with Date Separators (Full width stuck to left/right sides) -->
          <div ref="messagesInnerRef" v-else dir="ltr" class="w-full px-1 sm:px-2 pt-2 pb-6 flex flex-col">
            <!-- Loading older messages spinner -->
            <div
              v-if="chatStore.loadingOlderPosts"
              class="flex justify-center my-2 select-none animate-in fade-in duration-150"
            >
              <div class="px-3.5 py-1.5 rounded-full text-[11px] font-medium bg-black/35 text-white/90 backdrop-blur-xs shadow-xs flex items-center gap-2">
                <Loader2 class="w-3.5 h-3.5 animate-spin text-white/90" />
                <span>Loading older messages...</span>
              </div>
            </div>

            <template v-for="(post, index) in posts" :key="post.pending_post_id || post.id">
              <!-- Date Divider -->
              <div
                v-if="isDifferentDay(post.create_at, posts[index - 1]?.create_at)"
                class="flex justify-center my-3 select-none"
              >
                <span class="px-3 py-1 rounded-full text-[11px] font-medium bg-black/30 text-white/90 backdrop-blur-xs shadow-xs">
                  {{ formatDateSeparator(post.create_at) }}
                </span>
              </div>

              <!-- Telegram Unread / New Messages Divider Line -->
              <div
                v-if="isFirstUnread(post.id)"
                class="flex items-center my-3 select-none px-1 sm:px-2 w-full tg-unread-separator group"
                data-unread-separator="true"
              >
                <div class="flex-1 h-px bg-gradient-to-r from-transparent via-[#3390ec]/30 to-[#3390ec]/45 dark:via-[#3390ec]/35 dark:to-[#3390ec]/50 tg-unread-line-left"></div>
                <div
                  class="mx-2.5 sm:mx-4 px-3.5 py-0.5 rounded-full text-[11px] font-medium bg-[#3390ec]/15 dark:bg-[#3390ec]/20 text-[#3390ec] dark:text-[#52a5f5] border border-[#3390ec]/25 backdrop-blur-xs flex items-center gap-1.5 shadow-xs transition-all hover:bg-[#3390ec]/25 tg-unread-pill"
                  title="Messages below are new"
                >
                  <span class="relative flex h-2 w-2">
                    <span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#3390ec] dark:bg-[#52a5f5] opacity-75 tg-unread-dot"></span>
                    <span class="relative inline-flex rounded-full h-2 w-2 bg-[#3390ec] dark:bg-[#52a5f5] tg-unread-dot-solid"></span>
                  </span>
                  <span>New Messages</span>
                </div>
                <div class="flex-1 h-px bg-gradient-to-l from-transparent via-[#3390ec]/30 to-[#3390ec]/45 dark:via-[#3390ec]/35 dark:to-[#3390ec]/50 tg-unread-line-right"></div>
              </div>

              <!-- Message Bubble -->
              <MessageBubble
                :post="post"
                :showSenderName="isGroup"
                :showAvatar="isGroup"
                @contextmenu="onMessageContextMenu($event, post)"
                @open-viewers="onOpenViewers"
              />
            </template>

            <!-- Bottom scroll anchor -->
            <div ref="bottomAnchorRef" class="h-2 w-full pointer-events-none"></div>
          </div>

          <!-- Floating Scroll to Bottom Button -->
          <button
            v-if="showScrollBottom"
            @click="scrollToBottom(true)"
            class="sticky bottom-4 float-right mr-4 w-10 h-10 rounded-full bg-white dark:bg-[#17212b] border border-[#dfe1e5] dark:border-[#202b36] shadow-lg flex items-center justify-center text-[#7f91a4] hover:text-[#3390ec] transition-all z-20"
          >
            <ArrowDown class="w-5 h-5" />
            <span
              v-if="unreadBelowCount > 0"
              class="absolute -top-1.5 -left-1.5 min-w-[18px] h-[18px] px-1 rounded-full bg-[#3390ec] text-white text-[10px] font-bold flex items-center justify-center shadow-md leading-none select-none"
            >
              {{ unreadBelowCount > 99 ? '99+' : unreadBelowCount }}
            </span>
          </button>
        </div>

        <!-- Bottom Input Bar -->
        <MessageInput ref="messageInputRef" :channelId="channel.id" @sent="onMessageSent" />

        <!-- Message Context Menu -->
        <MessageContextMenu
          :post="contextPost"
          :position="contextPos"
          :isOpen="showContextMenu"
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

      <!-- File Preview Modal (Shared) -->
      <FilePreviewModal />
    </template>
  </div>
</template>
