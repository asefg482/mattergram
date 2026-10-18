<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, nextTick, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useChatStore } from '../../stores/chat'
import { useUiStore } from '../../stores/ui'
import { showConfirm } from '../../stores/alert'
import { notificationService } from '../../services/notifications'
import type { MattermostChannel } from '../../types/mattermost'
import {
  Pin,
  VolumeX,
  Volume2,
  CheckCheck,
  Check,
  PanelRight,
  FolderOpen,
  LogOut,
  Link,
  Trash2,
  Edit3
} from 'lucide-vue-next'

const router = useRouter()
const props = defineProps<{
  channel: MattermostChannel | null
  position: { x: number; y: number }
  isOpen: boolean
}>()

const emit = defineEmits<{
  (e: 'close'): void
}>()

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

function adjustPosition() {
  const el = menuRef.value
  const menuWidth = el?.offsetWidth || 208
  const menuHeight = el?.offsetHeight || 270
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

function handleTogglePin() {
  if (props.channel) {
    chatStore.togglePinChannel(props.channel.id)
  }
  emit('close')
}

function handleToggleMute() {
  if (props.channel) {
    chatStore.toggleMuteChannel(props.channel.id)
  }
  emit('close')
}

function handleToggleMarkAsUnread() {
  if (props.channel) {
    chatStore.toggleMarkAsUnread(props.channel.id)
  }
  emit('close')
}

function handleViewInfo() {
  if (props.channel) {
    chatStore.selectChannel(props.channel.id)
    router.push(`/c/${props.channel.id}`)
    uiStore.showRightSidebar = true
    uiStore.rightSidebarTab = 'info'
  }
  emit('close')
}

function handleViewFiles() {
  if (props.channel) {
    chatStore.selectChannel(props.channel.id)
    router.push(`/c/${props.channel.id}`)
    uiStore.openChatFiles()
  }
  emit('close')
}

const isGroup = computed(() => {
  if (!props.channel) return false
  return props.channel.type !== 'D' && props.channel.display_name !== 'Saved Messages'
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
    console.warn('Fallback copy failed:', err)
  }
}

function handleCopyLink() {
  if (!props.channel) return
  const url = `${window.location.origin}/c/${props.channel.id}`
  if (navigator?.clipboard?.writeText) {
    navigator.clipboard.writeText(url).then(() => {
      notificationService.showToast({ message: 'Link copied to clipboard' })
    }).catch(() => {
      fallbackCopy(url)
      notificationService.showToast({ message: 'Link copied to clipboard' })
    })
  } else {
    fallbackCopy(url)
    notificationService.showToast({ message: 'Link copied to clipboard' })
  }
  emit('close')
}

async function handleExitGroup() {
  if (!props.channel) return
  const channelToExit = props.channel
  const channelName = channelToExit.display_name || channelToExit.name || 'Group'
  emit('close')

  const confirmed = await showConfirm(
    `Are you sure you want to leave ${channelName}?`,
    {
      title: 'Exit Group',
      confirmText: 'Exit',
      cancelText: 'Cancel',
      isDestructive: true
    }
  )

  if (!confirmed) return

  try {
    await chatStore.leaveChannel(channelToExit.id)
    if (chatStore.activeChannelId === channelToExit.id || router.currentRoute.value.params.channelId === channelToExit.id) {
      router.push('/')
    }
    notificationService.showToast({
      message: `You have left ${channelName}`
    })
  } catch (err) {
    console.error('Failed to exit group:', err)
    notificationService.showToast({
      message: 'Failed to exit group. Please try again.'
    })
  }
}

const canManageChannel = computed(() => {
  if (!props.channel) return false
  if (props.channel.display_name === 'Saved Messages' || props.channel.type === 'D') return false
  return chatStore.canCurrentUserManageChannel(props.channel.id)
})

function handleEditChannel() {
  if (props.channel && canManageChannel.value) {
    uiStore.openEditChannel(props.channel)
  }
  emit('close')
}

const canDelete = computed(() => {
  if (!props.channel) return false
  if (props.channel.display_name === 'Saved Messages') return false
  if (props.channel.type === 'D') return true
  return chatStore.canCurrentUserManageChannel(props.channel.id)
})

async function handleDeleteChat() {
  if (!props.channel) return
  const channelToDelete = props.channel
  const isDirectChat = channelToDelete.type === 'D'
  const channelName = channelToDelete.display_name || channelToDelete.name || 'Chat'
  const actionTitle = isDirectChat ? 'Delete Chat' : 'Delete Channel'
  const promptMessage = isDirectChat
    ? `Are you sure you want to delete the chat with ${channelName}?`
    : `Are you sure you want to delete ${channelName}? This action cannot be undone.`

  emit('close')

  const confirmed = await showConfirm(promptMessage, {
    title: actionTitle,
    confirmText: 'Delete',
    cancelText: 'Cancel',
    isDestructive: true
  })

  if (!confirmed) return

  try {
    await chatStore.deleteChannel(channelToDelete.id)
    if (chatStore.activeChannelId === channelToDelete.id || router.currentRoute.value.params.channelId === channelToDelete.id) {
      router.push('/')
    }
    notificationService.showToast({
      message: `${actionTitle} succeeded.`
    })
  } catch (err: any) {
    console.error('Failed to delete chat:', err)
    notificationService.showToast({
      message: err.message || 'Failed to delete chat.'
    })
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
    <div v-if="isOpen && channel" class="fixed inset-0 z-[60] select-none">
      <!-- Backdrop to capture clicks with smooth Telegram fade on mobile -->
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
        <!-- Pull handle / drag pill -->
        <div class="pt-2.5 pb-1 flex justify-center">
          <div class="w-10 h-1 rounded-full bg-gray-300 dark:bg-gray-600"></div>
        </div>

        <!-- Channel Title / Badge Header -->
        <div class="px-4 py-2 border-b border-[#dfe1e5] dark:border-[#202b36] flex items-center justify-between">
          <div class="min-w-0 flex-1 pr-2">
            <h3 class="text-sm font-bold text-[#111827] dark:text-[#f5f5f5] truncate">
              {{ channel.display_name || channel.name }}
            </h3>
            <p class="text-xs text-[#7f91a4] truncate mt-0.5">
              {{ isGroup ? 'Group' : (channel.type === 'D' ? 'Direct Message' : 'Channel') }}
            </p>
          </div>
          <span
            v-if="chatStore.unreadCounts[channel.id]"
            class="text-[11px] font-bold px-2 py-0.5 rounded-full bg-[#4fae60] text-white shrink-0"
          >
            {{ chatStore.unreadCounts[channel.id] }} unread
          </span>
        </div>

        <!-- Action Items List (Mobile) -->
        <div class="px-2 py-1.5 overflow-y-auto no-scrollbar space-y-0.5" style="max-height: calc(85vh - 120px);">
          <!-- Pin / Unpin -->
          <button
            @click="handleTogglePin"
            class="w-full px-3.5 py-3 flex items-center gap-3.5 text-[#111827] dark:text-[#f5f5f5] hover:bg-gray-100 dark:hover:bg-[#202b36] active:bg-gray-200 dark:active:bg-[#242f3d] rounded-xl text-left transition-colors cursor-pointer"
          >
            <Pin class="w-5 h-5 text-[#3390ec] shrink-0" />
            <span class="text-sm font-medium">{{ channel.is_pinned ? 'Unpin from Top' : 'Pin to Top' }}</span>
          </button>

          <!-- Mute / Unmute -->
          <button
            @click="handleToggleMute"
            class="w-full px-3.5 py-3 flex items-center gap-3.5 text-[#111827] dark:text-[#f5f5f5] hover:bg-gray-100 dark:hover:bg-[#202b36] active:bg-gray-200 dark:active:bg-[#242f3d] rounded-xl text-left transition-colors cursor-pointer"
          >
            <VolumeX v-if="channel.is_muted" class="w-5 h-5 text-[#7f91a4] shrink-0" />
            <Volume2 v-else class="w-5 h-5 text-[#7f91a4] shrink-0" />
            <span class="text-sm font-medium">{{ channel.is_muted ? 'Unmute Notifications' : 'Mute Notifications' }}</span>
          </button>

          <!-- Mark as Read / Unread -->
          <button
            @click="handleToggleMarkAsUnread"
            class="w-full px-3.5 py-3 flex items-center gap-3.5 text-[#111827] dark:text-[#f5f5f5] hover:bg-gray-100 dark:hover:bg-[#202b36] active:bg-gray-200 dark:active:bg-[#242f3d] rounded-xl text-left transition-colors cursor-pointer"
          >
            <CheckCheck v-if="chatStore.unreadCounts[channel.id]" class="w-5 h-5 text-emerald-400 shrink-0" />
            <Check v-else class="w-5 h-5 text-[#7f91a4] shrink-0" />
            <span class="text-sm font-medium">{{ chatStore.unreadCounts[channel.id] ? 'Mark as Read' : 'Mark as Unread' }}</span>
          </button>

          <!-- Copy Link -->
          <button
            @click="handleCopyLink"
            class="w-full px-3.5 py-3 flex items-center gap-3.5 text-[#111827] dark:text-[#f5f5f5] hover:bg-gray-100 dark:hover:bg-[#202b36] active:bg-gray-200 dark:active:bg-[#242f3d] rounded-xl text-left transition-colors cursor-pointer"
          >
            <Link class="w-5 h-5 text-[#3390ec] shrink-0" />
            <span class="text-sm font-medium">Copy Link</span>
          </button>

          <!-- Shared Files -->
          <button
            @click="handleViewFiles"
            class="w-full px-3.5 py-3 flex items-center gap-3.5 text-[#111827] dark:text-[#f5f5f5] hover:bg-gray-100 dark:hover:bg-[#202b36] active:bg-gray-200 dark:active:bg-[#242f3d] rounded-xl text-left transition-colors cursor-pointer"
          >
            <FolderOpen class="w-5 h-5 text-[#7f91a4] shrink-0" />
            <span class="text-sm font-medium">Shared Files</span>
          </button>

          <!-- View Info -->
          <button
            @click="handleViewInfo"
            class="w-full px-3.5 py-3 flex items-center gap-3.5 text-[#111827] dark:text-[#f5f5f5] hover:bg-gray-100 dark:hover:bg-[#202b36] active:bg-gray-200 dark:active:bg-[#242f3d] rounded-xl text-left transition-colors cursor-pointer"
          >
            <PanelRight class="w-5 h-5 text-[#7f91a4] shrink-0" />
            <span class="text-sm font-medium">View Info</span>
          </button>

          <!-- Edit Channel / Group -->
          <button
            v-if="canManageChannel"
            @click="handleEditChannel"
            class="w-full px-3.5 py-3 flex items-center gap-3.5 text-[#111827] dark:text-[#f5f5f5] hover:bg-gray-100 dark:hover:bg-[#202b36] active:bg-gray-200 dark:active:bg-[#242f3d] rounded-xl text-left transition-colors cursor-pointer"
          >
            <Edit3 class="w-5 h-5 text-[#3390ec] shrink-0" />
            <span class="text-sm font-medium">{{ isGroup ? 'Edit Group' : 'Edit Channel' }}</span>
          </button>

          <!-- Exit Group (For Group / Channel) -->
          <template v-if="isGroup">
            <button
              @click="handleExitGroup"
              class="w-full px-3.5 py-3 flex items-center gap-3.5 text-red-500 hover:bg-red-500/10 active:bg-red-500/20 rounded-xl text-left transition-colors cursor-pointer"
            >
              <LogOut class="w-5 h-5 text-red-500 shrink-0" />
              <span class="text-sm font-medium">Exit Group</span>
            </button>
          </template>

          <!-- Delete Chat / Delete Channel -->
          <template v-if="canDelete">
            <button
              @click="handleDeleteChat"
              class="w-full px-3.5 py-3 flex items-center gap-3.5 text-red-500 hover:bg-red-500/10 active:bg-red-500/20 rounded-xl text-left transition-colors cursor-pointer"
            >
              <Trash2 class="w-5 h-5 text-red-500 shrink-0" />
              <span class="text-sm font-medium">{{ channel.type === 'D' ? 'Delete Chat' : 'Delete Channel' }}</span>
            </button>
          </template>
        </div>
      </div>

      <!-- Telegram Desktop Context Menu (>= 768px) -->
      <div
        v-else
        ref="menuRef"
        class="fixed pointer-events-auto w-52 bg-white dark:bg-[#17212b] border border-[#dfe1e5] dark:border-[#202b36] rounded-2xl shadow-2xl overflow-hidden z-50 select-none tg-context-menu py-1.5"
        :style="{ left: `${adjustedX}px`, top: `${adjustedY}px`, transformOrigin: transformOrigin, borderRadius: `${uiStore.menuRadius}px` }"
      >
        <div class="py-1 text-xs">
          <!-- Pin / Unpin -->
          <button
            @click="handleTogglePin"
            class="w-full px-3.5 py-2 flex items-center gap-3 text-[#111827] dark:text-[#f5f5f5] hover:bg-[#f1f1f1] dark:hover:bg-[#202b36] text-left transition-colors cursor-pointer"
          >
            <Pin class="w-4 h-4 text-[#3390ec]" />
            <span>{{ channel.is_pinned ? 'Unpin from Top' : 'Pin to Top' }}</span>
          </button>

          <!-- Mute / Unmute -->
          <button
            @click="handleToggleMute"
            class="w-full px-3.5 py-2 flex items-center gap-3 text-[#111827] dark:text-[#f5f5f5] hover:bg-[#f1f1f1] dark:hover:bg-[#202b36] text-left transition-colors cursor-pointer"
          >
            <VolumeX v-if="channel.is_muted" class="w-4 h-4 text-[#7f91a4]" />
            <Volume2 v-else class="w-4 h-4 text-[#7f91a4]" />
            <span>{{ channel.is_muted ? 'Unmute' : 'Mute' }}</span>
          </button>

          <!-- Mark as Read / Unread -->
          <button
            @click="handleToggleMarkAsUnread"
            class="w-full px-3.5 py-2 flex items-center gap-3 text-[#111827] dark:text-[#f5f5f5] hover:bg-[#f1f1f1] dark:hover:bg-[#202b36] text-left transition-colors cursor-pointer"
          >
            <CheckCheck v-if="chatStore.unreadCounts[channel.id]" class="w-4 h-4 text-emerald-400" />
            <Check v-else class="w-4 h-4 text-[#7f91a4]" />
            <span>{{ chatStore.unreadCounts[channel.id] ? 'Mark as Read' : 'Mark as Unread' }}</span>
          </button>

          <div class="my-1 border-t border-[#dfe1e5] dark:border-[#202b36]"></div>

          <!-- Copy Link (for chat, group, channel) -->
          <button
            @click="handleCopyLink"
            class="w-full px-3.5 py-2 flex items-center gap-3 text-[#111827] dark:text-[#f5f5f5] hover:bg-[#f1f1f1] dark:hover:bg-[#202b36] text-left transition-colors cursor-pointer"
          >
            <Link class="w-4 h-4 text-[#3390ec]" />
            <span>Copy Link</span>
          </button>

          <!-- Shared Files -->
          <button
            @click="handleViewFiles"
            class="w-full px-3.5 py-2 flex items-center gap-3 text-[#111827] dark:text-[#f5f5f5] hover:bg-[#f1f1f1] dark:hover:bg-[#202b36] text-left transition-colors cursor-pointer"
          >
            <FolderOpen class="w-4 h-4 text-[#7f91a4]" />
            <span>Shared Files</span>
          </button>

          <!-- View Info -->
          <button
            @click="handleViewInfo"
            class="w-full px-3.5 py-2 flex items-center gap-3 text-[#111827] dark:text-[#f5f5f5] hover:bg-[#f1f1f1] dark:hover:bg-[#202b36] text-left transition-colors cursor-pointer"
          >
            <PanelRight class="w-4 h-4 text-[#7f91a4]" />
            <span>View Info</span>
          </button>

          <!-- Edit Channel / Group -->
          <button
            v-if="canManageChannel"
            @click="handleEditChannel"
            class="w-full px-3.5 py-2 flex items-center gap-3 text-[#111827] dark:text-[#f5f5f5] hover:bg-[#f1f1f1] dark:hover:bg-[#202b36] text-left transition-colors cursor-pointer"
          >
            <Edit3 class="w-4 h-4 text-[#3390ec]" />
            <span>{{ isGroup ? 'Edit Group' : 'Edit Channel' }}</span>
          </button>

          <!-- Exit Group (For Group / Channel) -->
          <template v-if="isGroup">
            <div class="my-1 border-t border-[#dfe1e5] dark:border-[#202b36]"></div>

            <button
              @click="handleExitGroup"
              class="w-full px-3.5 py-2 flex items-center gap-3 text-red-500 hover:bg-red-500/10 text-left transition-colors cursor-pointer"
            >
              <LogOut class="w-4 h-4 text-red-500" />
              <span>Exit</span>
            </button>
          </template>

          <!-- Delete Chat / Delete Channel -->
          <template v-if="canDelete">
            <div v-if="!isGroup" class="my-1 border-t border-[#dfe1e5] dark:border-[#202b36]"></div>

            <button
              @click="handleDeleteChat"
              class="w-full px-3.5 py-2 flex items-center gap-3 text-red-500 hover:bg-red-500/10 text-left transition-colors cursor-pointer"
            >
              <Trash2 class="w-4 h-4 text-red-500" />
              <span>{{ channel.type === 'D' ? 'Delete Chat' : 'Delete Channel' }}</span>
            </button>
          </template>
        </div>
      </div>
    </div>
  </Teleport>
</template>
