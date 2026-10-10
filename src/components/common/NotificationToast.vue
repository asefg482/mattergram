<script setup lang="ts">
import { computed } from 'vue'
import { notificationService, type InAppToast } from '../../services/notifications'
import { useChatStore } from '../../stores/chat'
import { useUiStore } from '../../stores/ui'
import TelegramAvatar from './TelegramAvatar.vue'
import { X } from 'lucide-vue-next'

const chatStore = useChatStore()
const uiStore = useUiStore()

const toasts = computed(() => notificationService.toasts.value)

function handleClick(toast: InAppToast) {
  chatStore.selectChannel(toast.channelId)
  if (window.innerWidth < 768) {
    uiStore.isMobileSidebarOpen = false
  }
  notificationService.dismissToast(toast.id)
}

function handleDismiss(e: MouseEvent, toastId: string) {
  e.stopPropagation()
  notificationService.dismissToast(toastId)
}
</script>

<template>
  <div class="fixed top-4 right-4 z-50 flex flex-col gap-2 max-w-sm w-full pointer-events-none select-none px-2 sm:px-0">
    <transition-group
      enter-active-class="transition duration-300 ease-out transform"
      enter-from-class="-translate-y-4 opacity-0 scale-95"
      enter-to-class="translate-y-0 opacity-100 scale-100"
      leave-active-class="transition duration-200 ease-in transform"
      leave-from-class="translate-y-0 opacity-100 scale-100"
      leave-to-class="-translate-y-4 opacity-0 scale-95"
    >
      <div
        v-for="toast in toasts"
        :key="toast.id"
        @click="handleClick(toast)"
        class="pointer-events-auto p-3 bg-[#17212b] dark:bg-[#17212b] bg-white border border-[#202b36] dark:border-[#202b36] border-[#dfe1e5] rounded-2xl shadow-2xl flex items-center gap-3 cursor-pointer hover:bg-[#202b36] dark:hover:bg-[#202b36] hover:bg-[#f8f9fa] transition-all group backdrop-blur-md"
      >
        <!-- Sender Avatar -->
        <TelegramAvatar
          :userId="toast.userId"
          :name="toast.authorName"
          size="md"
        />

        <!-- Notification Content -->
        <div class="flex-1 min-w-0 pr-1">
          <div class="flex items-center justify-between mb-0.5">
            <h4 class="text-xs font-bold text-white dark:text-white text-gray-900 truncate">
              {{ toast.authorName }}
            </h4>
            <span class="text-[10px] text-[#7f91a4] shrink-0 truncate ml-1 max-w-[100px]">
              {{ toast.channelTitle }}
            </span>
          </div>
          <p class="text-xs text-[#7f91a4] truncate leading-tight">
            {{ toast.message }}
          </p>
        </div>

        <!-- Dismiss Button -->
        <button
          @click="handleDismiss($event, toast.id)"
          class="p-1 text-[#7f91a4] hover:text-white rounded-full transition-colors shrink-0"
        >
          <X class="w-4 h-4" />
        </button>
      </div>
    </transition-group>
  </div>
</template>
