<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useAuthStore } from '../../stores/auth'
import { useChatStore } from '../../stores/chat'
import { useUiStore } from '../../stores/ui'
import { mmApi } from '../../services/mattermostApi'
import { getAvatarGradient, getInitials } from '../../utils/formatters'
import {
  Bookmark,
  CheckSquare,
  Settings,
  Moon,
  Sun,
  LogOut,
  Loader2,
  Download,
  Users,
  Shield,
  Layers,
  Palette,
  X
} from 'lucide-vue-next'
import TelegramAvatar from '../common/TelegramAvatar.vue'
import { pwaService } from '../../services/pwa'
import { useTodoStore } from '../../stores/todo'

const props = defineProps<{
  isOpen: boolean
}>()

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'open'): void
  (e: 'update:isOpen', value: boolean): void
}>()

const router = useRouter()
const route = useRoute()
const authStore = useAuthStore()
const chatStore = useChatStore()
const uiStore = useUiStore()
const todoStore = useTodoStore()

function openTodoList() {
  closeDrawer()
  uiStore.showTodoModal = true
}

const user = computed(() => authStore.currentUser)

const userFullName = computed(() => {
  if (!user.value) return 'Unknown'
  if (user.value.first_name && user.value.last_name) {
    return `${user.value.first_name} ${user.value.last_name}`
  }
  return user.value.username || user.value.email
})

function closeDrawer() {
  emit('update:isOpen', false)
  emit('close')
}

function enlargeMyAvatar() {
  if (user.value) {
    const url = mmApi.getUserAvatarUrl(user.value.id, (user.value as any)?.last_picture_update)
    uiStore.openAvatarPreview(url, userFullName.value, user.value.id)
  }
}

const avatarGradient = computed(() => {
  return getAvatarGradient(user.value?.id || '')
})

function openSavedMessages() {
  closeDrawer()
  const savedChannel = chatStore.channels.find((c) => c.display_name === 'Saved Messages')
  if (savedChannel) {
    chatStore.selectChannel(savedChannel.id)
    router.push(`/c/${savedChannel.id}`)
  } else if (user.value) {
    chatStore.openDirectMessage(user.value.id).then(() => {
      if (chatStore.activeChannelId) {
        router.push(`/c/${chatStore.activeChannelId}`)
      }
    })
  }
}

function openSettings() {
  closeDrawer()
  uiStore.showSettingsModal = true
  if (route.params.channelId) {
    router.push(`/c/${route.params.channelId}/settings`)
  } else {
    router.push('/settings')
  }
}

async function handleLogout() {
  if (authStore.isLoggingOut) return
  chatStore.activeChannelId = null
  try {
    await authStore.logout()
  } finally {
    closeDrawer()
    router.push('/login')
  }
}

function handleInstallApp() {
  closeDrawer()
  pwaService.installApp()
}

// --- Mobile Touch Drag & Swipe Gestures ---
const isDragging = ref(false)
const isSnapping = ref(false)
const dragOffset = ref(0)

function getDrawerWidth() {
  if (typeof window !== 'undefined') {
    return Math.min(288, window.innerWidth * 0.82)
  }
  return 288
}

let touchStartX = 0
let touchStartY = 0
let touchStartTime = 0
let touchCandidate = false
let isDraggingActive = false

function onTouchStart(e: TouchEvent) {
  if (e.touches.length !== 1) return
  const touch = e.touches[0]

  if (props.isOpen) {
    // Drawer is already open: touch anywhere on drawer or backdrop to drag left and close
    touchStartX = touch.clientX
    touchStartY = touch.clientY
    touchStartTime = performance.now()
    touchCandidate = true
    isDraggingActive = false
    return
  }

  // Drawer is closed:
  // Allow opening swipe when:
  // 1) Starting near left edge of the screen (clientX <= 44px)
  // OR 2) Starting on the hamburger button area at top left (clientY <= 65px && clientX <= 75px)
  const isLeftEdge = touch.clientX <= 44
  const isHamburgerArea = touch.clientY <= 65 && touch.clientX <= 75

  // Only allow opening if sidebar is visible (on mobile chat list or desktop)
  const isSidebarVisible = uiStore.isMobileSidebarOpen || !chatStore.activeChannelId || window.innerWidth >= 768

  if ((isLeftEdge || isHamburgerArea) && isSidebarVisible) {
    touchStartX = touch.clientX
    touchStartY = touch.clientY
    touchStartTime = performance.now()
    touchCandidate = true
    isDraggingActive = false
  } else {
    touchCandidate = false
  }
}

function onTouchMove(e: TouchEvent) {
  if (!touchCandidate || e.touches.length !== 1) return
  const touch = e.touches[0]
  const deltaX = touch.clientX - touchStartX
  const deltaY = touch.clientY - touchStartY
  const width = getDrawerWidth()

  if (!isDraggingActive) {
    const absX = Math.abs(deltaX)
    const absY = Math.abs(deltaY)

    // Vertical scroll is dominant -> abort swipe gesture so list scrolls normally
    if (absY > absX && absY > 7) {
      touchCandidate = false
      return
    }

    // Horizontal swipe threshold met
    if (absX > 8 && absX > absY * 1.1) {
      if (!props.isOpen && deltaX > 0) {
        // Swiping right to open
        isDraggingActive = true
        isDragging.value = true
        isSnapping.value = false
      } else if (props.isOpen && deltaX < 0) {
        // Swiping left to close
        isDraggingActive = true
        isDragging.value = true
        isSnapping.value = false
      } else {
        touchCandidate = false
        return
      }
    }
  }

  if (isDraggingActive) {
    if (e.cancelable) {
      e.preventDefault()
    }
    if (!props.isOpen) {
      dragOffset.value = Math.max(0, Math.min(width, deltaX))
    } else {
      dragOffset.value = Math.min(0, Math.max(-width, deltaX))
    }
  }
}

function onTouchEnd(e: TouchEvent) {
  if (!isDraggingActive) {
    touchCandidate = false
    return
  }

  const touch = e.changedTouches[0]
  const deltaX = touch ? touch.clientX - touchStartX : 0
  const elapsed = Math.max(1, performance.now() - touchStartTime)
  const velocity = deltaX / elapsed // px/ms
  const width = getDrawerWidth()

  isSnapping.value = true

  if (!props.isOpen) {
    // Opening: snap open if dragged more than 28% of drawer width or fast flick to right (velocity > 0.3)
    const shouldOpen = dragOffset.value > width * 0.28 || velocity > 0.3
    if (shouldOpen) {
      dragOffset.value = width
      setTimeout(() => {
        isDragging.value = false
        isSnapping.value = false
        dragOffset.value = 0
        emit('update:isOpen', true)
        emit('open')
      }, 220)
    } else {
      dragOffset.value = 0
      setTimeout(() => {
        isDragging.value = false
        isSnapping.value = false
        dragOffset.value = 0
      }, 220)
    }
  } else {
    // Closing: snap close if dragged left more than 25% or fast flick to left (velocity < -0.3)
    const shouldClose = dragOffset.value < -width * 0.25 || velocity < -0.3
    if (shouldClose) {
      dragOffset.value = -width
      setTimeout(() => {
        isDragging.value = false
        isSnapping.value = false
        dragOffset.value = 0
        emit('update:isOpen', false)
        emit('close')
      }, 220)
    } else {
      dragOffset.value = 0
      setTimeout(() => {
        isDragging.value = false
        isSnapping.value = false
        dragOffset.value = 0
      }, 220)
    }
  }

  touchCandidate = false
  isDraggingActive = false
}

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape' && props.isOpen) {
    closeDrawer()
  }
}

onMounted(() => {
  window.addEventListener('touchstart', onTouchStart, { passive: true })
  window.addEventListener('touchmove', onTouchMove, { passive: false })
  window.addEventListener('touchend', onTouchEnd, { passive: true })
  window.addEventListener('touchcancel', onTouchEnd, { passive: true })
  window.addEventListener('keydown', onKeydown)
})

onUnmounted(() => {
  window.removeEventListener('touchstart', onTouchStart)
  window.removeEventListener('touchmove', onTouchMove)
  window.removeEventListener('touchend', onTouchEnd)
  window.removeEventListener('touchcancel', onTouchEnd)
  window.removeEventListener('keydown', onKeydown)
})

const drawerStyle = computed(() => {
  if (isDragging.value || isSnapping.value) {
    const width = getDrawerWidth()
    let tx = 0
    if (!props.isOpen) {
      tx = -width + dragOffset.value
    } else {
      tx = dragOffset.value
    }
    tx = Math.max(-width, Math.min(0, tx))
    return {
      transform: `translateX(${tx}px)`,
      transition: isSnapping.value ? 'transform 0.22s cubic-bezier(0.16, 1, 0.3, 1)' : 'none'
    }
  }
  return {}
})

const backdropStyle = computed(() => {
  if (isDragging.value || isSnapping.value) {
    const width = getDrawerWidth()
    let progress = 0
    if (!props.isOpen) {
      progress = dragOffset.value / width
    } else {
      progress = 1 + (dragOffset.value / width)
    }
    progress = Math.max(0, Math.min(1, progress))
    return {
      opacity: progress,
      transition: isSnapping.value ? 'opacity 0.22s ease-out' : 'none'
    }
  }
  return {}
})
</script>

<template>
  <div>
    <!-- Backdrop Overlay -->
    <transition
      :css="!isDragging && !isSnapping"
      enter-active-class="transition-opacity duration-300 ease-out"
      enter-from-class="opacity-0"
      enter-to-class="opacity-100"
      leave-active-class="transition-opacity duration-200 ease-in"
      leave-from-class="opacity-100"
      leave-to-class="opacity-0"
    >
      <div
        v-if="isOpen || isDragging || isSnapping"
        @click="closeDrawer"
        class="fixed inset-0 bg-black/60 z-40 backdrop-blur-xs"
        :style="isDragging || isSnapping ? backdropStyle : {}"
      ></div>
    </transition>

    <!-- Drawer Panel -->
    <transition
      :css="!isDragging && !isSnapping"
      enter-active-class="transition-transform duration-300 cubic-bezier(0.16, 1, 0.3, 1)"
      enter-from-class="-translate-x-full"
      enter-to-class="translate-x-0"
      leave-active-class="transition-transform duration-200 ease-in"
      leave-from-class="translate-x-0"
      leave-to-class="-translate-x-full"
    >
      <div
        v-if="isOpen || isDragging || isSnapping"
        class="fixed top-0 bottom-0 left-0 w-72 bg-white dark:bg-[#17212b] z-50 shadow-2xl flex flex-col border-r border-[#dfe1e5] dark:border-[#101921]"
        :style="isDragging || isSnapping ? drawerStyle : {}"
      >
        <!-- User Profile Header -->
        <div
          class="px-4 pb-4 bg-[#3390ec] dark:bg-[#242f3d] text-white"
          style="padding-top: calc(1rem + env(safe-area-inset-top, 0px));"
        >
          <div class="flex items-center justify-between mb-3">
            <!-- User Avatar -->
            <div
              @click="enlargeMyAvatar"
              class="cursor-pointer hover:opacity-85 transition-opacity"
              title="Click to view full photo"
            >
              <TelegramAvatar
                :userId="user?.id"
                :name="userFullName"
                size="xl"
                :lastPictureUpdate="(user as any)?.last_picture_update"
              />
            </div>

            <!-- Close Button -->
            <button
              @click="emit('close')"
              class="p-1 rounded-full hover:bg-white/10 text-white/80 transition-colors"
            >
              <X class="w-5 h-5" />
            </button>
          </div>

          <!-- Name & Username -->
          <h2 class="text-base font-bold truncate">{{ userFullName }}</h2>
          <p class="text-xs text-white/80 truncate">@{{ user?.username || user?.email }}</p>
          <p class="text-[11px] text-white/60 truncate mt-0.5">{{ user?.email }}</p>
        </div>

        <!-- Menu Navigation Items -->
        <div class="flex-1 overflow-y-auto py-2">
          <!-- Saved Messages -->
          <button
            @click="openSavedMessages"
            class="w-full flex items-center gap-4 px-4 py-3 text-sm text-[#111827] dark:text-[#f5f5f5] hover:bg-[#f1f1f1] dark:hover:bg-[#202b36] transition-colors cursor-pointer"
          >
            <Bookmark class="w-5 h-5 text-[#2481cc]" />
            <span class="flex-1 text-left">Saved Messages</span>
          </button>

          <!-- TODO list -->
          <button
            @click="openTodoList"
            class="w-full flex items-center gap-4 px-4 py-3 text-sm text-[#111827] dark:text-[#f5f5f5] hover:bg-[#f1f1f1] dark:hover:bg-[#202b36] transition-colors group cursor-pointer"
          >
            <CheckSquare class="w-5 h-5 text-[#3390ec] group-hover:scale-110 transition-transform shrink-0" />
            <span class="flex-1 text-left">TODO list</span>
            <span
              v-if="todoStore.pendingCount > 0"
              class="text-[10px] font-bold px-2 py-0.5 rounded-full bg-[#3390ec] text-white flex items-center gap-1 shadow-xs"
            >
              {{ todoStore.pendingCount }}
            </span>
          </button>

          <!-- Teams Selection -->
          <div v-if="authStore.teams.length > 1" class="px-4 py-2">
            <div class="text-[11px] font-semibold uppercase tracking-wider text-[#7f91a4] mb-1 flex items-center gap-1.5">
              <Layers class="w-3.5 h-3.5" />
              Teams
            </div>
            <div class="space-y-1">
              <button
                v-for="team in authStore.teams"
                :key="team.id"
                @click="authStore.selectTeam(team); chatStore.loadChannels()"
                class="w-full text-left px-2.5 py-1.5 rounded-lg text-xs flex items-center justify-between"
                :class="authStore.currentTeam?.id === team.id ? 'bg-[#3390ec] dark:bg-[#2b5278] text-white' : 'text-[#7f91a4] hover:bg-gray-100 dark:hover:bg-[#202b36]'"
              >
                <span>{{ team.display_name }}</span>
                <span v-if="authStore.currentTeam?.id === team.id" class="text-[10px] bg-white/20 px-1.5 py-0.5 rounded">Active</span>
              </button>
            </div>
          </div>

          <!-- Themes & Appearance -->
          <button
            @click="openSettings"
            class="w-full flex items-center gap-4 px-4 py-3 text-sm text-[#111827] dark:text-[#f5f5f5] hover:bg-[#f1f1f1] dark:hover:bg-[#202b36] transition-colors"
          >
            <Palette class="w-5 h-5 text-[#3390ec]" />
            <span class="flex-1 text-left">Themes</span>
            <span class="text-xs text-[#7f91a4] font-medium">{{ uiStore.currentThemePreset.name }}</span>
          </button>

          <!-- Settings -->
          <button
            @click="openSettings"
            class="w-full flex items-center gap-4 px-4 py-3 text-sm text-[#111827] dark:text-[#f5f5f5] hover:bg-[#f1f1f1] dark:hover:bg-[#202b36] transition-colors"
          >
            <Settings class="w-5 h-5 text-[#7f91a4]" />
            <span class="flex-1 text-left">Settings</span>
          </button>

          <!-- Night Mode Toggle Switch -->
          <div
            @click="uiStore.toggleTheme"
            class="w-full flex items-center justify-between px-4 py-3 text-sm text-[#111827] dark:text-[#f5f5f5] hover:bg-[#f1f1f1] dark:hover:bg-[#202b36] cursor-pointer transition-colors"
          >
            <div class="flex items-center gap-4">
              <Moon v-if="uiStore.theme === 'dark'" class="w-5 h-5 text-[#2481cc]" />
              <Sun v-else class="w-5 h-5 text-amber-500" />
              <span>Night Mode</span>
            </div>

            <!-- Toggle Pill Switch -->
            <div
              class="w-10 h-5 rounded-full p-0.5 transition-colors"
              :class="uiStore.theme === 'dark' ? 'bg-[#2481cc]' : 'bg-gray-400'"
            >
              <div
                class="w-4 h-4 rounded-full bg-white transition-transform"
                :class="uiStore.theme === 'dark' ? 'translate-x-5' : 'translate-x-0'"
              ></div>
            </div>
          </div>

          <!-- GitHub Repository Link -->
          <a
            href="https://github.com/asefg482/mattergram"
            target="_blank"
            rel="noopener noreferrer"
            class="w-full flex items-center gap-4 px-4 py-3 text-sm text-[#111827] dark:text-[#f5f5f5] hover:bg-[#f1f1f1] dark:hover:bg-[#202b36] transition-colors group cursor-pointer"
          >
            <svg class="w-5 h-5 text-[#7f91a4] group-hover:text-[#111827] dark:group-hover:text-white transition-colors fill-current shrink-0" viewBox="0 0 24 24" aria-hidden="true">
              <path fill-rule="evenodd" clip-rule="evenodd" d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.53 1.032 1.53 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" />
            </svg>
            <span class="flex-1 text-left">GitHub</span>
            <span class="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-[#3390ec]/15 text-[#3390ec] flex items-center gap-1">
              <span>⭐ Star</span>
            </span>
          </a>

          <!-- Install App (PWA) -->
          <button
            v-if="!pwaService.isInstalled.value"
            @click="handleInstallApp"
            class="w-full flex items-center gap-4 px-4 py-3 text-sm text-[#111827] dark:text-[#f5f5f5] hover:bg-[#f1f1f1] dark:hover:bg-[#202b36] transition-colors group cursor-pointer"
          >
            <Download class="w-5 h-5 text-[#3390ec] group-hover:scale-110 transition-transform shrink-0" />
            <span class="flex-1 text-left">Install App</span>
            <span class="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-[#3390ec] text-white flex items-center gap-1 shadow-xs">
              Install
            </span>
          </button>

          <div class="my-2 border-t border-[#dfe1e5] dark:border-[#101921]"></div>

          <!-- Logout -->
          <button
            @click="handleLogout"
            :disabled="authStore.isLoggingOut"
            class="w-full flex items-center gap-4 px-4 py-3 text-sm text-red-400 hover:bg-[#f1f1f1] dark:hover:bg-[#202b36] transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
          >
            <Loader2 v-if="authStore.isLoggingOut" class="w-5 h-5 animate-spin shrink-0 text-red-400" />
            <LogOut v-else class="w-5 h-5 shrink-0" />
            <span class="flex-1 text-left">{{ authStore.isLoggingOut ? 'Logging out...' : 'Log Out' }}</span>
          </button>
        </div>

        <!-- Footer Info -->
        <div
          class="p-3 border-t border-[#dfe1e5] dark:border-[#101921] text-[11px] text-[#7f91a4] text-center space-y-1"
          style="padding-bottom: calc(0.75rem + env(safe-area-inset-bottom, 0px));"
        >
          <p class="font-medium text-[#111827] dark:text-[#f5f5f5]">Mattergram for Mattermost</p>
          <p class="text-[10px] text-[#7f91a4] flex items-center justify-center gap-1">
            <span>Developed By Asef Ghorbani for Dornica</span>
            <span class="inline-block text-xs">💜</span>
          </p>
          <p class="text-[10px] text-[#7f91a4] opacity-80">نسخه 1.0.9</p>
          <p v-if="authStore.showBaseUrl" class="text-[10px] opacity-60 truncate">{{ authStore.baseUrl }}</p>
        </div>
      </div>
    </transition>
  </div>
</template>
