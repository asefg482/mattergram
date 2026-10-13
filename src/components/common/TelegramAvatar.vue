<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { mmApi } from '../../services/mattermostApi'
import { getAvatarGradient, getInitials } from '../../utils/formatters'
import { Bookmark } from 'lucide-vue-next'

const props = withDefaults(
  defineProps<{
    userId?: string
    name?: string
    size?: 'micro' | 'xs' | 'sm' | 'md' | 'lg' | 'xl' | '2xl'
    isSavedMessages?: boolean
    showOnlineDot?: boolean
    isOnline?: boolean
    lastPictureUpdate?: number
  }>(),
  {
    size: 'md',
    showOnlineDot: false,
    isOnline: false
  }
)

// Shared module-level avatar caches to prevent redundant requests across message list
const failedAvatarUsers = new Set<string>()
const loadedAvatarUsers = new Set<string>()

const imageLoaded = ref(props.userId ? loadedAvatarUsers.has(props.userId) : false)
const imageError = ref(props.userId ? failedAvatarUsers.has(props.userId) : false)

const avatarUrl = computed(() => {
  if (!props.userId || props.isSavedMessages || imageError.value) return ''
  return mmApi.getUserAvatarUrl(props.userId, props.lastPictureUpdate)
})

function onImgLoad() {
  imageLoaded.value = true
  if (props.userId) loadedAvatarUsers.add(props.userId)
}

function onImgError() {
  imageError.value = true
  if (props.userId) failedAvatarUsers.add(props.userId)
}

// Reset state only when user changes or picture timestamp updates
watch(
  () => [props.userId, props.lastPictureUpdate],
  ([newUserId, newLastPic], [oldUserId, oldLastPic]) => {
    if (props.userId) {
      if (newLastPic !== oldLastPic) {
        failedAvatarUsers.delete(props.userId)
        loadedAvatarUsers.delete(props.userId)
        imageLoaded.value = false
        imageError.value = false
      } else {
        imageLoaded.value = loadedAvatarUsers.has(props.userId)
        imageError.value = failedAvatarUsers.has(props.userId)
      }
    } else {
      imageLoaded.value = false
      imageError.value = false
    }
  }
)

const sizeClasses = computed(() => {
  switch (props.size) {
    case 'micro':
      return 'w-4 h-4 text-[8px]'
    case 'xs':
      return 'w-7 h-7 text-[10px]'
    case 'sm':
      return 'w-8 h-8 text-[11px]'
    case 'md':
      return 'w-10 h-10 text-xs'
    case 'lg':
      return 'w-12 h-12 text-sm'
    case 'xl':
      return 'w-14 h-14 text-base'
    case '2xl':
      return 'w-20 h-20 text-2xl'
    default:
      return 'w-10 h-10 text-xs'
  }
})

const dotSizeClasses = computed(() => {
  switch (props.size) {
    case 'micro':
    case 'xs':
    case 'sm':
      return 'w-2.5 h-2.5 border-[1.5px]'
    case 'md':
      return 'w-3 h-3 border-2'
    case 'lg':
    case 'xl':
    case '2xl':
      return 'w-3.5 h-3.5 border-2'
    default:
      return 'w-3 h-3 border-2'
  }
})

const initials = computed(() => getInitials(props.name || ''))
const bgGradient = computed(() => getAvatarGradient(props.userId || props.name || ''))
</script>

<template>
  <div class="relative shrink-0 select-none">
    <!-- Saved Messages Icon Avatar -->
    <div
      v-if="isSavedMessages"
      class="rounded-full bg-[#2481cc] flex items-center justify-center text-white shadow"
      :class="sizeClasses"
    >
      <Bookmark class="w-1/2 h-1/2 fill-white" />
    </div>

    <!-- Regular User Avatar -->
    <div
      v-else
      class="rounded-full flex items-center justify-center text-white font-semibold shadow overflow-hidden relative"
      :class="sizeClasses"
      :style="{ background: bgGradient }"
    >
      <!-- Initials Fallback (Always rendered beneath image) -->
      <span class="z-0">{{ initials }}</span>

      <!-- Image tag loaded from Mattermost -->
      <img
        v-if="avatarUrl && !imageError"
        :src="avatarUrl"
        :alt="name || 'Avatar'"
        @load="onImgLoad"
        @error="onImgError"
        class="absolute inset-0 w-full h-full object-cover z-10 transition-opacity duration-200"
        :class="imageLoaded ? 'opacity-100' : 'opacity-0'"
        loading="lazy"
        decoding="async"
      />
    </div>

    <!-- Telegram Online Green Badge -->
    <div
      v-if="showOnlineDot && isOnline && !isSavedMessages"
      class="absolute bottom-0 right-0 rounded-full bg-[#4fae60] border-white dark:border-[#17212b] z-20"
      :class="dotSizeClasses"
    ></div>
  </div>
</template>
