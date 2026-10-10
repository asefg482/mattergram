<script setup lang="ts">
import { computed } from 'vue'
import { useAuthStore } from '../../stores/auth'
import { useChatStore } from '../../stores/chat'
import { useUiStore } from '../../stores/ui'
import { getAvatarGradient, getInitials } from '../../utils/formatters'
import {
  Bookmark,
  Settings,
  Moon,
  Sun,
  LogOut,
  Users,
  Shield,
  Layers,
  X
} from 'lucide-vue-next'
import TelegramAvatar from '../common/TelegramAvatar.vue'

const props = defineProps<{
  isOpen: boolean
}>()

const emit = defineEmits<{
  (e: 'close'): void
}>()

const authStore = useAuthStore()
const chatStore = useChatStore()
const uiStore = useUiStore()

const user = computed(() => authStore.currentUser)

const userFullName = computed(() => {
  if (!user.value) return 'Unknown'
  if (user.value.first_name && user.value.last_name) {
    return `${user.value.first_name} ${user.value.last_name}`
  }
  return user.value.username || user.value.email
})

const avatarGradient = computed(() => {
  return getAvatarGradient(user.value?.id || '')
})

function openSavedMessages() {
  emit('close')
  const savedChannel = chatStore.channels.find((c) => c.display_name === 'Saved Messages')
  if (savedChannel) {
    chatStore.selectChannel(savedChannel.id)
  } else if (user.value) {
    chatStore.openDirectMessage(user.value.id)
  }
}

function openSettings() {
  emit('close')
  uiStore.showSettingsModal = true
}

function handleLogout() {
  emit('close')
  authStore.logout()
}
</script>

<template>
  <div>
    <!-- Backdrop Overlay -->
    <transition
      enter-active-class="transition-opacity duration-300 ease-out"
      enter-from-class="opacity-0"
      enter-to-class="opacity-100"
      leave-active-class="transition-opacity duration-200 ease-in"
      leave-from-class="opacity-100"
      leave-to-class="opacity-0"
    >
      <div
        v-if="isOpen"
        @click="emit('close')"
        class="fixed inset-0 bg-black/60 z-40 backdrop-blur-xs"
      ></div>
    </transition>

    <!-- Drawer Panel -->
    <transition
      enter-active-class="transition-transform duration-300 cubic-bezier(0.16, 1, 0.3, 1)"
      enter-from-class="-translate-x-full"
      enter-to-class="translate-x-0"
      leave-active-class="transition-transform duration-200 ease-in"
      leave-from-class="translate-x-0"
      leave-to-class="-translate-x-full"
    >
      <div
        v-if="isOpen"
        class="fixed top-0 bottom-0 left-0 w-72 bg-[#17212b] dark:bg-[#17212b] bg-white z-50 shadow-2xl flex flex-col border-r border-[#101921] dark:border-[#101921] border-[#dfe1e5]"
      >
        <!-- User Profile Header -->
        <div class="p-4 bg-[#242f3d] dark:bg-[#242f3d] bg-[#3390ec] text-white">
          <div class="flex items-center justify-between mb-3">
            <!-- User Avatar -->
            <TelegramAvatar
              :userId="user?.id"
              :name="userFullName"
              size="xl"
              :lastPictureUpdate="(user as any)?.last_picture_update"
            />

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
            class="w-full flex items-center gap-4 px-4 py-3 text-sm text-[#f5f5f5] dark:text-[#f5f5f5] text-[#111827] hover:bg-[#202b36] dark:hover:bg-[#202b36] hover:bg-[#f1f1f1] transition-colors"
          >
            <Bookmark class="w-5 h-5 text-[#2481cc]" />
            <span class="flex-1 text-left">Saved Messages</span>
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
                :class="authStore.currentTeam?.id === team.id ? 'bg-[#2b5278] text-white' : 'text-[#7f91a4] hover:bg-[#202b36]'"
              >
                <span>{{ team.display_name }}</span>
                <span v-if="authStore.currentTeam?.id === team.id" class="text-[10px] bg-white/20 px-1.5 py-0.5 rounded">Active</span>
              </button>
            </div>
          </div>

          <!-- Settings -->
          <button
            @click="openSettings"
            class="w-full flex items-center gap-4 px-4 py-3 text-sm text-[#f5f5f5] dark:text-[#f5f5f5] text-[#111827] hover:bg-[#202b36] dark:hover:bg-[#202b36] hover:bg-[#f1f1f1] transition-colors"
          >
            <Settings class="w-5 h-5 text-[#7f91a4]" />
            <span class="flex-1 text-left">Settings</span>
          </button>

          <!-- Night Mode Toggle Switch -->
          <div
            @click="uiStore.toggleTheme"
            class="w-full flex items-center justify-between px-4 py-3 text-sm text-[#f5f5f5] dark:text-[#f5f5f5] text-[#111827] hover:bg-[#202b36] dark:hover:bg-[#202b36] hover:bg-[#f1f1f1] cursor-pointer transition-colors"
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

          <div class="my-2 border-t border-[#101921] dark:border-[#101921] border-[#dfe1e5]"></div>

          <!-- Logout -->
          <button
            @click="handleLogout"
            class="w-full flex items-center gap-4 px-4 py-3 text-sm text-red-400 hover:bg-[#202b36] dark:hover:bg-[#202b36] hover:bg-[#f1f1f1] transition-colors"
          >
            <LogOut class="w-5 h-5" />
            <span class="flex-1 text-left">Log Out</span>
          </button>
        </div>

        <!-- Footer Info -->
        <div class="p-3 border-t border-[#101921] dark:border-[#101921] border-[#dfe1e5] text-[11px] text-[#7f91a4] text-center">
          <p>Mattergram for Mattermost</p>
          <p class="opacity-60">{{ authStore.baseUrl }}</p>
        </div>
      </div>
    </transition>
  </div>
</template>
