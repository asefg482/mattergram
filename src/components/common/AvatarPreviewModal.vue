<script setup lang="ts">
import { computed, ref, onMounted, onUnmounted, watch } from 'vue'
import { useUiStore } from '../../stores/ui'
import { useUsersStore } from '../../stores/users'
import { X, Download, User, ZoomIn, ZoomOut, RotateCcw } from 'lucide-vue-next'

const uiStore = useUiStore()
const usersStore = useUsersStore()

const preview = computed(() => uiStore.avatarPreview)
const user = computed(() => {
  if (!preview.value.userId) return null
  return usersStore.getUser(preview.value.userId)
})

// Zoom and Pan state
const scale = ref(1)
const translateX = ref(0)
const translateY = ref(0)
const isDragging = ref(false)
const dragStart = { x: 0, y: 0 }
const initialTranslate = { x: 0, y: 0 }
const MIN_SCALE = 1
const MAX_SCALE = 5

function resetZoom() {
  scale.value = 1
  translateX.value = 0
  translateY.value = 0
}

function zoomIn() {
  scale.value = Math.min(MAX_SCALE, Number((scale.value + 0.35).toFixed(2)))
}

function zoomOut() {
  const next = Math.max(MIN_SCALE, Number((scale.value - 0.35).toFixed(2)))
  scale.value = next
  if (next === 1) {
    translateX.value = 0
    translateY.value = 0
  }
}

function handleWheel(e: WheelEvent) {
  e.preventDefault()
  const zoomFactor = e.deltaY < 0 ? 1.18 : 0.85
  const newScale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, Number((scale.value * zoomFactor).toFixed(2))))

  if (newScale === scale.value) return

  if (newScale === 1) {
    resetZoom()
    return
  }

  const container = (e.currentTarget as HTMLElement)?.getBoundingClientRect()
  if (container) {
    const mouseX = e.clientX - container.left - container.width / 2
    const mouseY = e.clientY - container.top - container.height / 2
    const ratio = 1 - newScale / scale.value
    translateX.value += (mouseX - translateX.value) * ratio
    translateY.value += (mouseY - translateY.value) * ratio
  }

  scale.value = newScale
}

function handleMouseDown(e: MouseEvent) {
  if (e.button !== 0) return
  if ((e.target as HTMLElement).closest('button, a')) return

  isDragging.value = true
  dragStart.x = e.clientX
  dragStart.y = e.clientY
  initialTranslate.x = translateX.value
  initialTranslate.y = translateY.value

  window.addEventListener('mousemove', onMouseMove)
  window.addEventListener('mouseup', onMouseUp)
}

function onMouseMove(e: MouseEvent) {
  if (!isDragging.value) return
  const dx = e.clientX - dragStart.x
  const dy = e.clientY - dragStart.y
  translateX.value = initialTranslate.x + dx
  translateY.value = initialTranslate.y + dy
}

function onMouseUp() {
  if (isDragging.value) {
    isDragging.value = false
    window.removeEventListener('mousemove', onMouseMove)
    window.removeEventListener('mouseup', onMouseUp)
  }
}

function handleDoubleClick(e: MouseEvent) {
  if (scale.value > 1.05) {
    resetZoom()
  } else {
    scale.value = 2.2
    const container = (e.currentTarget as HTMLElement)?.getBoundingClientRect()
    if (container) {
      const mouseX = e.clientX - container.left - container.width / 2
      const mouseY = e.clientY - container.top - container.height / 2
      translateX.value = -mouseX * 0.75
      translateY.value = -mouseY * 0.75
    }
  }
}

function handleViewProfile() {
  if (user.value) {
    handleClose()
    uiStore.openMentionModal({
      type: 'user',
      username: user.value.username,
      user: user.value
    })
  }
}

function handleClose() {
  resetZoom()
  uiStore.closeAvatarPreview()
}

function handleKeydown(e: KeyboardEvent) {
  if (!preview.value.isOpen) return
  if (e.key === 'Escape') {
    handleClose()
  } else if (e.key === '+' || e.key === '=') {
    zoomIn()
  } else if (e.key === '-') {
    zoomOut()
  } else if (e.key === '0') {
    resetZoom()
  }
}

watch(
  () => preview.value.isOpen,
  (open) => {
    if (open) resetZoom()
  }
)

onMounted(() => {
  window.addEventListener('keydown', handleKeydown)
})

onUnmounted(() => {
  window.removeEventListener('keydown', handleKeydown)
  window.removeEventListener('mousemove', onMouseMove)
  window.removeEventListener('mouseup', onMouseUp)
})
</script>

<template>
  <div
    v-if="preview.isOpen"
    class="fixed inset-0 z-50 flex flex-col items-center justify-between p-2 sm:p-4 bg-black/90 backdrop-blur-md select-none animate-in fade-in duration-200"
    style="padding-top: calc(0.5rem + env(safe-area-inset-top, 0px)); padding-bottom: calc(0.5rem + env(safe-area-inset-bottom, 0px));"
    @click.self="handleClose"
  >
    <!-- Top Action Bar -->
    <div class="w-full max-w-5xl flex items-center justify-between text-white z-30 pointer-events-none px-2 py-1">
      <div class="flex items-center gap-2 pointer-events-auto bg-black/40 backdrop-blur-md px-3.5 py-1.5 rounded-full border border-white/10 text-xs">
        <span class="font-semibold text-sm">{{ preview.name }}</span>
        <span class="text-xs text-white/60">Profile photo</span>
      </div>

      <div class="flex items-center gap-1 sm:gap-2 pointer-events-auto bg-black/40 backdrop-blur-md px-2 py-1 rounded-full border border-white/10 text-xs">
        <!-- Zoom Controls -->
        <button
          @click="zoomOut"
          :disabled="scale <= MIN_SCALE"
          class="p-1.5 text-white/80 hover:text-white hover:bg-white/10 rounded-full transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
          title="Zoom out (-)"
        >
          <ZoomOut class="w-4 h-4" />
        </button>

        <button
          @click="resetZoom"
          class="px-2 py-0.5 min-w-[50px] text-center font-mono text-[11px] font-semibold text-white/90 hover:text-white hover:bg-white/10 rounded-md transition-colors"
          title="Reset zoom to 100%"
        >
          {{ Math.round(scale * 100) }}%
        </button>

        <button
          @click="zoomIn"
          :disabled="scale >= MAX_SCALE"
          class="p-1.5 text-white/80 hover:text-white hover:bg-white/10 rounded-full transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
          title="Zoom in (+)"
        >
          <ZoomIn class="w-4 h-4" />
        </button>

        <button
          v-if="scale > 1"
          @click="resetZoom"
          class="p-1.5 text-white/80 hover:text-white hover:bg-white/10 rounded-full transition-colors"
          title="Reset size"
        >
          <RotateCcw class="w-4 h-4" />
        </button>

        <div class="w-px h-3.5 bg-white/20 mx-1"></div>

        <!-- View Profile Button (if user exists) -->
        <button
          v-if="user"
          @click="handleViewProfile"
          class="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white/90 hover:text-white bg-white/10 hover:bg-white/20 rounded-full transition-colors"
          title="View user profile"
        >
          <User class="w-4 h-4" />
          <span class="hidden sm:inline">View Profile</span>
        </button>

        <!-- Download Button -->
        <a
          :href="preview.url"
          :download="`${preview.name}-avatar.png`"
          target="_blank"
          class="p-1.5 text-white/80 hover:text-white hover:bg-white/10 rounded-full transition-colors"
          title="Download photo"
        >
          <Download class="w-4 h-4" />
        </a>

        <!-- Close Button -->
        <button
          @click="handleClose"
          class="p-1.5 text-white/80 hover:text-white hover:bg-red-500/20 hover:text-red-400 rounded-full transition-colors"
          title="Close (Esc)"
        >
          <X class="w-4 h-4" />
        </button>
      </div>
    </div>

    <!-- Centered Enlarged Photo Viewport with Smooth Zoom & Drag -->
    <div
      class="flex-1 w-full h-full flex items-center justify-center relative overflow-hidden my-2"
      @wheel="handleWheel"
      @mousedown="handleMouseDown"
      @click.self="handleClose"
    >
      <div
        @dblclick="handleDoubleClick"
        class="relative flex items-center justify-center select-none"
        :style="{
          transform: `translate3d(${translateX}px, ${translateY}px, 0) scale(${scale})`,
          transition: isDragging ? 'none' : 'transform 0.16s cubic-bezier(0.16, 1, 0.3, 1)',
          cursor: scale > 1 ? (isDragging ? 'grabbing' : 'grab') : 'zoom-in'
        }"
      >
        <img
          :src="preview.url"
          :alt="preview.name"
          draggable="false"
          class="max-w-[90vw] max-h-[80vh] w-auto h-auto object-contain rounded-3xl shadow-2xl ring-1 ring-white/10 animate-in zoom-in-90 fade-in duration-250 ease-out pointer-events-none"
        />
      </div>
    </div>

    <!-- Bottom Hint bar -->
    <div class="z-20 text-center pointer-events-none pb-1">
      <span class="text-[11px] text-white/50 bg-black/40 backdrop-blur-xs px-3 py-1 rounded-full border border-white/5">
        Scroll to zoom • Drag to pan • Double click to reset
      </span>
    </div>
  </div>
</template>
