<script setup lang="ts">
import { onMounted } from 'vue'
import NotificationToast from './components/common/NotificationToast.vue'
import MentionUserModal from './components/chat/MentionUserModal.vue'
import AvatarPreviewModal from './components/common/AvatarPreviewModal.vue'
import PwaInstallPrompt from './components/common/PwaInstallPrompt.vue'
import TodoModal from './components/todo/TodoModal.vue'
import CustomAlertModal from './components/common/CustomAlertModal.vue'
import { notificationService } from './services/notifications'
import { useAuthStore } from './stores/auth'
import { Loader2 } from 'lucide-vue-next'

const authStore = useAuthStore()

onMounted(() => {
  notificationService.autoRequestPermissionOnFirstOpen()
})
</script>

<template>
  <div class="h-screen w-screen flex overflow-hidden bg-[#8ea6b4] dark:bg-[#0e1621] font-sans antialiased">
    <!-- Router View for Page Components -->
    <router-view />

    <!-- Global In-App Notification Toast Banner -->
    <NotificationToast />

    <!-- Global User Mention Click Confirmation Modal -->
    <MentionUserModal />

    <!-- Global Full-Screen Avatar Preview Modal -->
    <AvatarPreviewModal />

    <!-- Global PWA App Install Suggestion Prompt & iOS Guide Modal -->
    <PwaInstallPrompt />

    <!-- Global Mattermost TODO List Modal -->
    <TodoModal />

    <!-- Global Custom Alert & Confirm Modal -->
    <CustomAlertModal />

    <!-- Global Logout Loading Overlay -->
    <transition
      enter-active-class="transition-opacity duration-200"
      enter-from-class="opacity-0"
      enter-to-class="opacity-100"
      leave-active-class="transition-opacity duration-200"
      leave-from-class="opacity-100"
      leave-to-class="opacity-0"
    >
      <div
        v-if="authStore.isLoggingOut"
        class="fixed inset-0 z-[100] bg-black/45 backdrop-blur-sm flex flex-col items-center justify-center select-none"
      >
        <div class="bg-white dark:bg-[#17212b] rounded-2xl p-6 shadow-2xl flex flex-col items-center gap-3.5 min-w-[190px] border border-[#dfe1e5] dark:border-[#101921] animate-in fade-in zoom-in-95 duration-150">
          <Loader2 class="w-8 h-8 text-[#3390ec] animate-spin" />
          <span class="text-sm font-medium text-[#111827] dark:text-[#f5f5f5]">Logging out...</span>
        </div>
      </div>
    </transition>
  </div>
</template>
