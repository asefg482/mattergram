<script setup lang="ts">
import { computed, ref, onMounted, onUnmounted, watch } from 'vue'
import { useUiStore } from '../../stores/ui'
import { mmApi } from '../../services/mattermostApi'
import { formatFileSize } from '../../utils/formatters'
import {
  X,
  Download,
  FileText,
  ZoomIn,
  ZoomOut,
  RotateCcw
} from 'lucide-vue-next'
import TelegramVideoPlayer from './TelegramVideoPlayer.vue'

const uiStore = useUiStore()

const file = computed(() => uiStore.previewFile)

const isImage = computed(() => {
  if (!file.value) return false
  const ext = file.value.extension?.toLowerCase() || ''
  const mime = file.value.mime_type?.toLowerCase() || ''
  return (
    mime.startsWith('image/') ||
    ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp', 'ico'].includes(ext)
  )
})

const isVideo = computed(() => {
  if (!file.value) return false
  const ext = file.value.extension?.toLowerCase() || ''
  const mime = file.value.mime_type?.toLowerCase() || ''
  return (
    mime.startsWith('video/') ||
    ['mp4', 'webm', 'mov', 'm4v', 'mkv', 'ogg'].includes(ext)
  )
})

const fileUrl = computed(() => {
  if (!file.value) return ''
  return mmApi.getFileDownloadUrl(file.value.id)
})

// --- Zoom & Pan State ---
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
  if (!isImage.value) return
  scale.value = Math.min(MAX_SCALE, Number((scale.value + 0.35).toFixed(2)))
}

function zoomOut() {
  if (!isImage.value) return
  const next = Math.max(MIN_SCALE, Number((scale.value - 0.35).toFixed(2)))
  scale.value = next
  if (next === 1) {
    translateX.value = 0
    translateY.value = 0
  }
}

function handleWheel(e: WheelEvent) {
  if (!isImage.value) return
  e.preventDefault()

  const zoomFactor = e.deltaY < 0 ? 1.18 : 0.85
  const newScale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, Number((scale.value * zoomFactor).toFixed(2))))

  if (newScale === scale.value) return

  if (newScale === 1) {
    resetZoom()
    return
  }

  // Zoom centered around mouse pointer position
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
  if (!isImage.value || e.button !== 0) return
  if ((e.target as HTMLElement).closest('button, a, video')) return

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
  if (!isImage.value) return
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

// Touch support for pinch-to-zoom and pan
let touchStartDist = 0
let touchStartScale = 1

function handleTouchStart(e: TouchEvent) {
  if (e.touches.length === 1) {
    isDragging.value = true
    dragStart.x = e.touches[0].clientX
    dragStart.y = e.touches[0].clientY
    initialTranslate.x = translateX.value
    initialTranslate.y = translateY.value
  } else if (e.touches.length === 2) {
    isDragging.value = false
    touchStartDist = Math.hypot(
      e.touches[0].clientX - e.touches[1].clientX,
      e.touches[0].clientY - e.touches[1].clientY
    )
    touchStartScale = scale.value
  }
}

function handleTouchMove(e: TouchEvent) {
  if (e.touches.length === 1 && isDragging.value && scale.value > 1) {
    const dx = e.touches[0].clientX - dragStart.x
    const dy = e.touches[0].clientY - dragStart.y
    translateX.value = initialTranslate.x + dx
    translateY.value = initialTranslate.y + dy
  } else if (e.touches.length === 2 && touchStartDist > 0) {
    const dist = Math.hypot(
      e.touches[0].clientX - e.touches[1].clientX,
      e.touches[0].clientY - e.touches[1].clientY
    )
    const newScale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, Number((touchStartScale * (dist / touchStartDist)).toFixed(2))))
    scale.value = newScale
    if (newScale === 1) {
      translateX.value = 0
      translateY.value = 0
    }
  }
}

function handleTouchEnd() {
  isDragging.value = false
  touchStartDist = 0
}

function handleKeydown(e: KeyboardEvent) {
  if (!file.value) return
  if (e.key === 'Escape') {
    uiStore.closeFilePreview()
  } else if (isImage.value) {
    if (e.key === '+' || e.key === '=') {
      zoomIn()
    } else if (e.key === '-') {
      zoomOut()
    } else if (e.key === '0') {
      resetZoom()
    }
  }
}

watch(file, () => {
  resetZoom()
})

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
    v-if="file"
    class="fixed inset-0 z-50 flex flex-col items-center justify-between p-2 sm:p-4 bg-black/90 backdrop-blur-md select-none animate-in fade-in duration-200"
    @click.self="uiStore.closeFilePreview"
  >
    <!-- Top Action Bar -->
    <div class="w-full max-w-6xl flex items-center justify-between text-white z-30 pointer-events-none px-2 py-1">
      <!-- File Name & Info -->
      <div class="flex items-center gap-2 pointer-events-auto bg-black/40 backdrop-blur-md px-3.5 py-1.5 rounded-full border border-white/10 text-xs">
        <span class="font-medium truncate max-w-[200px] sm:max-w-xs">{{ file.name }}</span>
        <span class="text-[#7f91a4]">({{ formatFileSize(file.size) }})</span>
      </div>

      <!-- Control Buttons -->
      <div class="flex items-center gap-1 sm:gap-2 pointer-events-auto bg-black/40 backdrop-blur-md px-2 py-1 rounded-full border border-white/10 text-xs">
        <!-- Zoom Controls (Only for images) -->
        <template v-if="isImage">
          <button
            @click="zoomOut"
            :disabled="scale <= MIN_SCALE"
            class="p-1.5 text-white/80 hover:text-white hover:bg-white/10 rounded-full transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
            title="Zoom out (-)"
          >
            <ZoomOut class="w-4 h-4" />
          </button>

          <!-- Zoom Percentage (Click to reset) -->
          <button
            @click="resetZoom"
            class="px-2 py-0.5 min-w-[52px] text-center font-mono text-[11px] font-semibold text-white/90 hover:text-white hover:bg-white/10 rounded-md transition-colors"
            title="Reset zoom to 100% (0)"
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
        </template>

        <!-- Download Button -->
        <a
          :href="fileUrl"
          :download="file.name"
          target="_blank"
          class="p-1.5 text-white/80 hover:text-white hover:bg-white/10 rounded-full transition-colors"
          title="Download file"
        >
          <Download class="w-4 h-4" />
        </a>

        <!-- Close Button -->
        <button
          @click="uiStore.closeFilePreview"
          class="p-1.5 text-white/80 hover:text-white hover:bg-red-500/20 hover:text-red-400 rounded-full transition-colors"
          title="Close (Esc)"
        >
          <X class="w-4 h-4" />
        </button>
      </div>
    </div>

    <!-- Main Viewport Center Area -->
    <div
      class="flex-1 w-full h-full flex items-center justify-center relative overflow-hidden my-2"
      @wheel="handleWheel"
      @mousedown="handleMouseDown"
      @touchstart.passive="handleTouchStart"
      @touchmove.passive="handleTouchMove"
      @touchend="handleTouchEnd"
      @click.self="uiStore.closeFilePreview"
    >
      <!-- Image Preview with Smooth Zoom & Drag Transform -->
      <div
        v-if="isImage"
        @dblclick="handleDoubleClick"
        class="relative flex items-center justify-center select-none"
        :style="{
          transform: `translate3d(${translateX}px, ${translateY}px, 0) scale(${scale})`,
          transition: isDragging ? 'none' : 'transform 0.16s cubic-bezier(0.16, 1, 0.3, 1)',
          cursor: scale > 1 ? (isDragging ? 'grabbing' : 'grab') : 'zoom-in'
        }"
      >
        <img
          :src="fileUrl"
          :alt="file.name"
          draggable="false"
          class="max-w-[92vw] max-h-[80vh] w-auto h-auto object-contain rounded-2xl shadow-2xl ring-1 ring-white/10 animate-in zoom-in-90 fade-in duration-250 ease-out pointer-events-none"
        />
      </div>

      <!-- Video Preview Player -->
      <div v-else-if="isVideo && file" class="max-w-4xl w-full max-h-[82vh] flex flex-col items-center justify-center animate-in zoom-in-95 fade-in duration-200">
        <TelegramVideoPlayer
          :src="fileUrl"
          :name="file.name"
          :size="file.size"
          :downloadUrl="fileUrl"
          maxHeight="max-h-[78vh]"
          rounded="rounded-2xl shadow-2xl"
          class="w-full"
        />
      </div>

      <!-- Generic Document Preview Card -->
      <div
        v-else
        class="bg-white dark:bg-[#17212b] border border-[#dfe1e5] dark:border-[#202b36] p-8 rounded-2xl shadow-2xl flex flex-col items-center text-center max-w-sm animate-in zoom-in-95 fade-in duration-200"
      >
        <div class="w-16 h-16 rounded-2xl bg-[#2481cc]/20 flex items-center justify-center text-[#2481cc] mb-4">
          <FileText class="w-8 h-8" />
        </div>
        <h3 class="text-gray-900 dark:text-white font-semibold text-sm mb-1 truncate max-w-xs">{{ file.name }}</h3>
        <p class="text-xs text-[#7f91a4] mb-4">{{ formatFileSize(file.size) }} • {{ file.extension.toUpperCase() }}</p>
        <a
          :href="fileUrl"
          :download="file.name"
          target="_blank"
          class="px-4 py-2 bg-[#2481cc] hover:bg-[#1d73b8] rounded-xl text-white text-xs font-medium flex items-center gap-1.5 transition-colors"
        >
          <Download class="w-4 h-4" />
          <span>Download file</span>
        </a>
      </div>
    </div>

    <!-- Bottom Hint bar -->
    <div class="z-20 text-center pointer-events-none pb-1">
      <span v-if="isImage" class="text-[11px] text-white/50 bg-black/40 backdrop-blur-xs px-3 py-1 rounded-full border border-white/5">
        Scroll to zoom • Drag to pan • Double click to reset
      </span>
    </div>
  </div>
</template>
