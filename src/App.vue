<script setup lang="ts">
import { onMounted, onUnmounted } from 'vue'
import NotificationToast from './components/common/NotificationToast.vue'
import MentionUserModal from './components/chat/MentionUserModal.vue'
import AvatarPreviewModal from './components/common/AvatarPreviewModal.vue'
import PwaInstallPrompt from './components/common/PwaInstallPrompt.vue'
import CustomAlertModal from './components/common/CustomAlertModal.vue'
import { notificationService } from './services/notifications'
import { useAuthStore } from './stores/auth'
import { Loader2 } from 'lucide-vue-next'

const authStore = useAuthStore()

let cleanupViewport: (() => void) | null = null

function setupVisualViewport() {
  if (typeof window === 'undefined') return () => {}

  function update() {
    const vv = window.visualViewport
    const h = vv ? Math.round(vv.height) : window.innerHeight
    const top = vv ? Math.round(vv.offsetTop) : 0

    document.documentElement.style.setProperty('--tg-viewport-height', `${h}px`)
    document.documentElement.style.setProperty('--tg-viewport-top', `${top}px`)

    const isMobile = window.innerWidth < 768
    const screenHeight = window.screen?.height || window.innerHeight
    const isKeyboardOpen = isMobile && h < screenHeight - 120
    document.documentElement.classList.toggle('keyboard-open', isKeyboardOpen)

    if (window.scrollY > 0 || window.scrollX > 0) {
      window.scrollTo(0, 0)
    }
    if (document.documentElement.scrollTop > 0) {
      document.documentElement.scrollTop = 0
    }
    if (document.body.scrollTop > 0) {
      document.body.scrollTop = 0
    }
  }

  update()

  const vv = window.visualViewport
  if (vv) {
    vv.addEventListener('resize', update)
    vv.addEventListener('scroll', update)
  }
  window.addEventListener('resize', update)
  window.addEventListener('scroll', update)

  const onOrientationChange = () => {
    setTimeout(update, 100)
    setTimeout(update, 300)
  }
  window.addEventListener('orientationchange', onOrientationChange)

  const onFocusIn = (e: FocusEvent) => {
    const target = e.target as HTMLElement | null
    if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) {
      if (window.scrollY > 0) window.scrollTo(0, 0)
      if (document.documentElement.scrollTop > 0) document.documentElement.scrollTop = 0
      if (document.body.scrollTop > 0) document.body.scrollTop = 0
      setTimeout(update, 50)
      setTimeout(update, 150)
      setTimeout(update, 300)
    }
  }

  const onFocusOut = () => {
    if (window.scrollY > 0) window.scrollTo(0, 0)
    setTimeout(update, 100)
    setTimeout(update, 250)
  }

  document.addEventListener('focusin', onFocusIn)
  document.addEventListener('focusout', onFocusOut)

  return () => {
    if (vv) {
      vv.removeEventListener('resize', update)
      vv.removeEventListener('scroll', update)
    }
    window.removeEventListener('resize', update)
    window.removeEventListener('scroll', update)
    window.removeEventListener('orientationchange', onOrientationChange)
    document.removeEventListener('focusin', onFocusIn)
    document.removeEventListener('focusout', onFocusOut)
  }
}

onMounted(() => {
  notificationService.autoRequestPermissionOnFirstOpen()
  cleanupViewport = setupVisualViewport()
})

onUnmounted(() => {
  cleanupViewport?.()
})
</script>

<template>
  <div class="h-full w-full flex overflow-hidden bg-[#8ea6b4] dark:bg-[#0e1621] font-sans antialiased">
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

    <!-- Global Custom Alert & Confirm Modal -->
    <CustomAlertModal />

    <!-- Global Logout Loading Overlay -->
    <Teleport to="body">
      <Transition name="tg-modal">
        <div
          v-if="authStore.isLoggingOut"
          class="fixed inset-0 z-[100] bg-black/60 backdrop-blur-xs flex flex-col items-center justify-center select-none"
        >
          <div class="tg-modal-box bg-white dark:bg-[#17212b] rounded-2xl p-6 shadow-2xl flex flex-col items-center gap-3.5 min-w-[190px] border border-[#dfe1e5] dark:border-[#202b36]">
            <Loader2 class="w-8 h-8 text-[#3390ec] animate-spin" />
            <span class="text-sm font-medium text-[#111827] dark:text-[#f5f5f5]">Logging out...</span>
          </div>
        </div>
      </Transition>
    </Teleport>
  </div>
</template>
