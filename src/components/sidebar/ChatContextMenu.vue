<script setup lang="ts">
import { ref, onMounted, onUnmounted, nextTick, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useChatStore } from '../../stores/chat'
import { useUiStore } from '../../stores/ui'
import type { MattermostChannel } from '../../types/mattermost'
import {
  Pin,
  VolumeX,
  Volume2,
  CheckCheck,
  Check,
  PanelRight,
  LogOut
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

function adjustPosition() {
  const el = menuRef.value
  const menuWidth = el?.offsetWidth || 208
  const menuHeight = el?.offsetHeight || 190
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
  }
  emit('close')
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
  <div v-if="isOpen && channel" class="fixed inset-0 z-50 pointer-events-none">
    <!-- Backdrop to capture right clicks -->
    <div
      class="absolute inset-0 pointer-events-auto"
      @click="emit('close')"
      @contextmenu.prevent="emit('close')"
    ></div>

    <!-- Telegram Chat Context Menu -->
    <div
      ref="menuRef"
      class="fixed pointer-events-auto w-52 bg-[#17212b] dark:bg-[#17212b] bg-white border border-[#202b36] dark:border-[#202b36] border-[#dfe1e5] rounded-2xl shadow-2xl overflow-hidden z-50 select-none tg-context-menu py-1.5"
      :style="{ left: `${adjustedX}px`, top: `${adjustedY}px`, transformOrigin: transformOrigin }"
    >
      <div class="py-1 text-xs">
        <!-- Pin / Unpin -->
        <button
          @click="handleTogglePin"
          class="w-full px-3.5 py-2 flex items-center gap-3 text-[#f5f5f5] dark:text-[#f5f5f5] text-[#111827] hover:bg-[#202b36] dark:hover:bg-[#202b36] hover:bg-[#f1f1f1] text-left transition-colors"
        >
          <Pin class="w-4 h-4 text-[#3390ec]" />
          <span>{{ channel.is_pinned ? 'Unpin from Top' : 'Pin to Top' }}</span>
        </button>

        <!-- Mute / Unmute -->
        <button
          @click="handleToggleMute"
          class="w-full px-3.5 py-2 flex items-center gap-3 text-[#f5f5f5] dark:text-[#f5f5f5] text-[#111827] hover:bg-[#202b36] dark:hover:bg-[#202b36] hover:bg-[#f1f1f1] text-left transition-colors"
        >
          <VolumeX v-if="channel.is_muted" class="w-4 h-4 text-[#7f91a4]" />
          <Volume2 v-else class="w-4 h-4 text-[#7f91a4]" />
          <span>{{ channel.is_muted ? 'Unmute' : 'Mute' }}</span>
        </button>

        <!-- Mark as Read / Unread -->
        <button
          @click="handleToggleMarkAsUnread"
          class="w-full px-3.5 py-2 flex items-center gap-3 text-[#f5f5f5] dark:text-[#f5f5f5] text-[#111827] hover:bg-[#202b36] dark:hover:bg-[#202b36] hover:bg-[#f1f1f1] text-left transition-colors"
        >
          <CheckCheck v-if="chatStore.unreadCounts[channel.id]" class="w-4 h-4 text-emerald-400" />
          <Check v-else class="w-4 h-4 text-[#7f91a4]" />
          <span>{{ chatStore.unreadCounts[channel.id] ? 'Mark as Read' : 'Mark as Unread' }}</span>
        </button>

        <div class="my-1 border-t border-[#202b36] dark:border-[#202b36] border-[#dfe1e5]"></div>

        <!-- View Info -->
        <button
          @click="handleViewInfo"
          class="w-full px-3.5 py-2 flex items-center gap-3 text-[#f5f5f5] dark:text-[#f5f5f5] text-[#111827] hover:bg-[#202b36] dark:hover:bg-[#202b36] hover:bg-[#f1f1f1] text-left transition-colors"
        >
          <PanelRight class="w-4 h-4 text-[#7f91a4]" />
          <span>View Info</span>
        </button>
      </div>
    </div>
  </div>
</template>
