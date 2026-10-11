<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import {
  Play,
  Pause,
  Volume2,
  Volume1,
  VolumeX,
  Maximize,
  Minimize,
  PictureInPicture2,
  Download,
  Loader2
} from 'lucide-vue-next'
import { formatFileSize } from '../../utils/formatters'

const props = withDefaults(
  defineProps<{
    src: string
    name?: string
    size?: number
    downloadUrl?: string
    maxHeight?: string
    rounded?: string
  }>(),
  {
    maxHeight: 'max-h-80',
    rounded: 'rounded-xl'
  }
)

const videoRef = ref<HTMLVideoElement | null>(null)
const containerRef = ref<HTMLElement | null>(null)
const scrubberRef = ref<HTMLElement | null>(null)

// Playback state
const isPlaying = ref(false)
const isBuffering = ref(false)
const currentTime = ref(0)
const duration = ref(0)
const bufferProgress = ref(0)
const volume = ref(1)
const isMuted = ref(false)
const isFullscreen = ref(false)
const playbackSpeed = ref<number>(1)
const showControls = ref(true)
const isHovered = ref(false)
const isScrubbing = ref(false)
const speedOptions = [1, 1.25, 1.5, 2]

let controlsTimer: number | null = null

// Format seconds into m:ss or h:mm:ss
function formatTime(seconds: number): string {
  if (!seconds || isNaN(seconds) || seconds < 0) return '0:00'
  const s = Math.floor(seconds)
  const hours = Math.floor(s / 3600)
  const minutes = Math.floor((s % 3600) / 60)
  const remainingSecs = s % 60
  const formattedSecs = remainingSecs < 10 ? `0${remainingSecs}` : `${remainingSecs}`

  if (hours > 0) {
    const formattedMins = minutes < 10 ? `0${minutes}` : `${minutes}`
    return `${hours}:${formattedMins}:${formattedSecs}`
  }
  return `${minutes}:${formattedSecs}`
}

const progressPercent = computed(() => {
  if (!duration.value || duration.value === 0) return 0
  return Math.min(100, Math.max(0, (currentTime.value / duration.value) * 100))
})

// Play / Pause toggle
function togglePlay() {
  const v = videoRef.value
  if (!v) return
  if (v.paused) {
    v.play().catch((err) => console.warn('Play interrupted:', err))
  } else {
    v.pause()
  }
}

// Activity & Auto-hide Controls
function showControlsTemporarily() {
  showControls.value = true
  if (controlsTimer) {
    clearTimeout(controlsTimer)
    controlsTimer = null
  }
  if (isPlaying.value && !isScrubbing.value) {
    controlsTimer = window.setTimeout(() => {
      if (isPlaying.value && !isScrubbing.value) {
        showControls.value = false
      }
    }, 2400)
  }
}

function onMouseMove() {
  isHovered.value = true
  showControlsTemporarily()
}

function onMouseEnter() {
  isHovered.value = true
  showControlsTemporarily()
}

function onMouseLeave() {
  isHovered.value = false
  if (isPlaying.value && !isScrubbing.value) {
    showControls.value = false
  }
}

// Video event handlers
function onTimeUpdate() {
  if (!videoRef.value || isScrubbing.value) return
  currentTime.value = videoRef.value.currentTime
  updateBuffer()
}

function onDurationChange() {
  if (!videoRef.value) return
  duration.value = videoRef.value.duration || 0
  updateBuffer()
}

function updateBuffer() {
  const v = videoRef.value
  if (!v || !v.buffered.length) return
  try {
    const end = v.buffered.end(v.buffered.length - 1)
    if (v.duration > 0) {
      bufferProgress.value = Math.min(100, (end / v.duration) * 100)
    }
  } catch {}
}

function onEnded() {
  isPlaying.value = false
  showControls.value = true
}

// Volume & Mute
function toggleMute() {
  const v = videoRef.value
  if (!v) return
  v.muted = !v.muted
  isMuted.value = v.muted
  if (!v.muted && v.volume === 0) {
    v.volume = 0.5
    volume.value = 0.5
  }
}

function onVolumeChange(e: Event) {
  const target = e.target as HTMLInputElement
  const val = parseFloat(target.value)
  const v = videoRef.value
  if (!v) return
  volume.value = val
  v.volume = val
  if (val === 0) {
    v.muted = true
    isMuted.value = true
  } else if (v.muted) {
    v.muted = false
    isMuted.value = false
  }
}

// Playback Speed
function cycleSpeed() {
  const v = videoRef.value
  if (!v) return
  const currIdx = speedOptions.indexOf(playbackSpeed.value)
  const nextIdx = (currIdx + 1) % speedOptions.length
  const nextSpeed = speedOptions[nextIdx]
  playbackSpeed.value = nextSpeed
  v.playbackRate = nextSpeed
}

// Picture in Picture
const supportsPiP = typeof document !== 'undefined' && 'pictureInPictureEnabled' in document
async function togglePiP() {
  const v = videoRef.value
  if (!v) return
  try {
    if (document.pictureInPictureElement === v) {
      await document.exitPictureInPicture()
    } else {
      await v.requestPictureInPicture()
    }
  } catch (err) {
    console.warn('PiP failed:', err)
  }
}

// Fullscreen
function toggleFullscreen() {
  const c = containerRef.value
  if (!c) return
  if (!document.fullscreenElement) {
    c.requestFullscreen().catch((err) => console.warn('Fullscreen failed:', err))
  } else {
    document.exitFullscreen().catch(() => {})
  }
}

function onFullscreenChange() {
  isFullscreen.value = !!document.fullscreenElement
}

// Scrubbing / Seeking logic
function calculateScrubTime(e: MouseEvent): number {
  const scrubber = scrubberRef.value
  if (!scrubber || !duration.value) return 0
  const rect = scrubber.getBoundingClientRect()
  const offsetX = Math.max(0, Math.min(e.clientX - rect.left, rect.width))
  const ratio = offsetX / rect.width
  return ratio * duration.value
}

function onScrubberMouseDown(e: MouseEvent) {
  e.preventDefault()
  e.stopPropagation()
  isScrubbing.value = true
  const targetTime = calculateScrubTime(e)
  currentTime.value = targetTime
  if (videoRef.value) {
    videoRef.value.currentTime = targetTime
  }

  function onMouseMoveWindow(moveEvent: MouseEvent) {
    const t = calculateScrubTime(moveEvent)
    currentTime.value = t
    if (videoRef.value) {
      videoRef.value.currentTime = t
    }
  }

  function onMouseUpWindow() {
    isScrubbing.value = false
    window.removeEventListener('mousemove', onMouseMoveWindow)
    window.removeEventListener('mouseup', onMouseUpWindow)
    showControlsTemporarily()
  }

  window.addEventListener('mousemove', onMouseMoveWindow)
  window.addEventListener('mouseup', onMouseUpWindow)
}

onMounted(() => {
  document.addEventListener('fullscreenchange', onFullscreenChange)
})

onUnmounted(() => {
  document.removeEventListener('fullscreenchange', onFullscreenChange)
  if (controlsTimer) clearTimeout(controlsTimer)
})
</script>

<template>
  <div
    ref="containerRef"
    data-no-bubble-reply
    class="relative overflow-hidden group select-none bg-black transition-all"
    :class="[
      rounded,
      isFullscreen ? 'w-screen h-screen flex items-center justify-center rounded-none' : ''
    ]"
    @mousemove="onMouseMove"
    @mouseenter="onMouseEnter"
    @mouseleave="onMouseLeave"
    @click.stop
  >
    <!-- HTML5 Video Tag -->
    <video
      ref="videoRef"
      :src="src"
      preload="metadata"
      playsinline
      class="w-full h-auto object-contain block mx-auto cursor-pointer"
      :class="[maxHeight, isFullscreen ? 'max-h-screen h-full w-full' : '']"
      @click="togglePlay"
      @timeupdate="onTimeUpdate"
      @durationchange="onDurationChange"
      @progress="updateBuffer"
      @waiting="isBuffering = true"
      @playing="isBuffering = false; isPlaying = true"
      @pause="isPlaying = false"
      @ended="onEnded"
    >
      Your browser does not support playing this video.
    </video>

    <!-- Center Big Play Button (when paused) -->
    <transition
      enter-active-class="transition duration-150 ease-out"
      enter-from-class="scale-75 opacity-0"
      enter-to-class="scale-100 opacity-100"
      leave-active-class="transition duration-150 ease-in"
      leave-from-class="scale-100 opacity-100"
      leave-to-class="scale-75 opacity-0"
    >
      <div
        v-if="!isPlaying && !isBuffering"
        class="absolute inset-0 flex items-center justify-center pointer-events-none"
      >
        <button
          @click.stop="togglePlay"
          class="pointer-events-auto w-14 h-14 sm:w-16 sm:h-16 rounded-full bg-black/60 hover:bg-[#3390ec] text-white flex items-center justify-center backdrop-blur-md shadow-2xl transition-all duration-200 hover:scale-110 active:scale-95 group/btn"
          title="Play"
        >
          <Play class="w-7 h-7 sm:w-8 sm:h-8 fill-current translate-x-0.5" />
        </button>
      </div>
    </transition>

    <!-- Buffering Spinner Indicator -->
    <div
      v-if="isBuffering && isPlaying"
      class="absolute inset-0 flex items-center justify-center pointer-events-none bg-black/25 backdrop-blur-xs"
    >
      <Loader2 class="w-10 h-10 text-white animate-spin drop-shadow-md" />
    </div>

    <!-- Duration Badge (shown on preview before user plays) -->
    <div
      v-if="!isPlaying && duration > 0 && !showControls"
      class="absolute bottom-2.5 right-2.5 px-2 py-0.5 rounded-md bg-black/70 backdrop-blur-sm text-white text-[11px] font-medium tracking-wide pointer-events-none"
    >
      {{ formatTime(duration) }}
    </div>

    <!-- Top Info Bar (File Name & Download) -->
    <transition
      enter-active-class="transition-opacity duration-200"
      enter-from-class="opacity-0"
      enter-to-class="opacity-100"
      leave-active-class="transition-opacity duration-200"
      leave-from-class="opacity-100"
      leave-to-class="opacity-0"
    >
      <div
        v-if="showControls && (name || size)"
        class="absolute top-0 left-0 right-0 p-3 pt-2.5 bg-gradient-to-b from-black/80 via-black/40 to-transparent flex items-center justify-between text-white text-xs z-10"
      >
        <div class="flex items-center gap-2 truncate pr-3">
          <span class="truncate font-medium text-[11px] sm:text-xs text-white/95" :title="name">
            {{ name || 'Video' }}
          </span>
          <span v-if="size" class="text-[10px] text-white/60 shrink-0">
            {{ formatFileSize(size) }}
          </span>
        </div>

        <a
          v-if="downloadUrl || src"
          :href="downloadUrl || src"
          :download="name || 'video.mp4'"
          target="_blank"
          @click.stop
          class="p-1.5 text-white/70 hover:text-white hover:bg-white/10 rounded-full transition-colors shrink-0"
          title="Download Video"
        >
          <Download class="w-4 h-4" />
        </a>
      </div>
    </transition>

    <!-- Bottom Controls Overlay -->
    <transition
      enter-active-class="transition-opacity duration-200"
      enter-from-class="opacity-0"
      enter-to-class="opacity-100"
      leave-active-class="transition-opacity duration-200"
      leave-from-class="opacity-100"
      leave-to-class="opacity-0"
    >
      <div
        v-if="showControls"
        class="absolute bottom-0 left-0 right-0 p-3 pt-6 bg-gradient-to-t from-black/85 via-black/50 to-transparent flex flex-col gap-1.5 z-10"
        @click.stop
      >
        <!-- Interactive Progress Scrub Bar -->
        <div
          ref="scrubberRef"
          class="relative h-1.5 hover:h-2.5 w-full bg-white/25 rounded-full cursor-pointer transition-all duration-150 group/bar flex items-center"
          @mousedown="onScrubberMouseDown"
        >
          <!-- Buffered Track -->
          <div
            class="absolute left-0 top-0 bottom-0 bg-white/35 rounded-full pointer-events-none"
            :style="{ width: `${bufferProgress}%` }"
          ></div>

          <!-- Played Progress Track -->
          <div
            class="absolute left-0 top-0 bottom-0 bg-[#3390ec] rounded-full pointer-events-none"
            :style="{ width: `${progressPercent}%` }"
          ></div>

          <!-- Scrubber Thumb -->
          <div
            class="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-3.5 h-3.5 bg-white rounded-full shadow-md scale-0 group-hover/bar:scale-100 transition-transform pointer-events-none"
            :style="{ left: `${progressPercent}%` }"
          ></div>
        </div>

        <!-- Controls Action Row -->
        <div class="flex items-center justify-between text-white text-xs">
          <!-- Left Controls: Play/Pause, Volume, Time -->
          <div class="flex items-center gap-2 sm:gap-3">
            <!-- Play / Pause Button -->
            <button
              @click.stop="togglePlay"
              class="p-1 text-white/90 hover:text-white hover:scale-105 transition-all"
              :title="isPlaying ? 'Pause (Space)' : 'Play (Space)'"
            >
              <Pause v-if="isPlaying" class="w-4 h-4 sm:w-5 sm:h-5 fill-current" />
              <Play v-else class="w-4 h-4 sm:w-5 sm:h-5 fill-current" />
            </button>

            <!-- Volume Control Group -->
            <div class="flex items-center gap-1.5 group/vol relative">
              <button
                @click.stop="toggleMute"
                class="p-1 text-white/80 hover:text-white transition-colors"
                :title="isMuted ? 'Unmute' : 'Mute'"
              >
                <VolumeX v-if="isMuted || volume === 0" class="w-4 h-4 sm:w-4.5 sm:h-4.5" />
                <Volume1 v-else-if="volume < 0.5" class="w-4 h-4 sm:w-4.5 sm:h-4.5" />
                <Volume2 v-else class="w-4 h-4 sm:w-4.5 sm:h-4.5" />
              </button>

              <!-- Volume Slider (slides open on hover) -->
              <input
                type="range"
                min="0"
                max="1"
                step="0.05"
                :value="isMuted ? 0 : volume"
                @input="onVolumeChange"
                class="w-14 sm:w-16 h-1 accent-[#3390ec] bg-white/30 rounded-full cursor-pointer opacity-70 group-hover/vol:opacity-100 transition-opacity"
              />
            </div>

            <!-- Time Display -->
            <span class="text-[11px] sm:text-xs text-white/80 font-mono tracking-tight select-none">
              {{ formatTime(currentTime) }} / {{ formatTime(duration) }}
            </span>
          </div>

          <!-- Right Controls: Speed, PiP, Fullscreen -->
          <div class="flex items-center gap-1 sm:gap-2">
            <!-- Playback Speed Button -->
            <button
              @click.stop="cycleSpeed"
              class="px-1.5 py-0.5 rounded text-[10px] sm:text-xs font-semibold bg-white/10 hover:bg-white/20 text-white/90 transition-colors"
              title="Playback speed"
            >
              {{ playbackSpeed }}x
            </button>

            <!-- Picture in Picture (if supported) -->
            <button
              v-if="supportsPiP"
              @click.stop="togglePiP"
              class="p-1 text-white/80 hover:text-white hover:scale-105 transition-all"
              title="Picture in picture"
            >
              <PictureInPicture2 class="w-4 h-4" />
            </button>

            <!-- Fullscreen Button -->
            <button
              @click.stop="toggleFullscreen"
              class="p-1 text-white/80 hover:text-white hover:scale-105 transition-all"
              :title="isFullscreen ? 'Exit fullscreen' : 'Fullscreen'"
            >
              <Minimize v-if="isFullscreen" class="w-4 h-4" />
              <Maximize v-else class="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </transition>
  </div>
</template>

<style scoped>
/* Sleek range styling */
input[type='range'] {
  -webkit-appearance: none;
  appearance: none;
}
input[type='range']::-webkit-slider-thumb {
  -webkit-appearance: none;
  appearance: none;
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: white;
  cursor: pointer;
}
input[type='range']::-moz-range-thumb {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: white;
  cursor: pointer;
  border: none;
}
</style>
