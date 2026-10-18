<script setup lang="ts">
import { pwaService } from '../../services/pwa'
import { Download, X, Share2, PlusSquare, Smartphone, Laptop } from 'lucide-vue-next'

function handleInstall() {
  pwaService.installApp()
}

function handleDismiss() {
  pwaService.dismissBanner()
}

function closeIOSModal() {
  pwaService.showIOSModal.value = false
}
</script>

<template>
  <!-- In-App Floating Suggestion Banner -->
  <transition
    enter-active-class="transition duration-300 ease-out"
    enter-from-class="translate-y-full sm:translate-y-0 sm:scale-95 opacity-0"
    enter-to-class="translate-y-0 sm:scale-100 opacity-100"
    leave-active-class="transition duration-200 ease-in"
    leave-from-class="translate-y-0 sm:scale-100 opacity-100"
    leave-to-class="translate-y-full sm:translate-y-0 sm:scale-95 opacity-0"
  >
    <div
      v-if="pwaService.showBanner.value && !pwaService.isInstalled.value"
      class="fixed bottom-4 left-4 right-4 sm:left-auto sm:right-6 sm:w-96 z-40 select-none"
    >
      <div
        class="bg-white/95 dark:bg-[#17212b]/95 backdrop-blur-md border border-[#dfe1e5] dark:border-[#202b36] rounded-2xl p-3.5 shadow-2xl flex items-center gap-3 relative ring-1 ring-black/5 dark:ring-white/10"
      >
        <!-- App Logo Icon -->
        <div class="w-11 h-11 rounded-xl bg-gradient-to-tr from-[#229ed9] to-[#2aabee] flex items-center justify-center text-white shrink-0 shadow-md">
          <svg class="w-6 h-6 fill-current" viewBox="0 0 24 24">
            <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm4.64 6.8c-.15 1.58-.8 5.42-1.13 7.19-.14.75-.42 1-.68 1.03-.58.05-1.02-.38-1.58-.75-.88-.58-1.38-.94-2.23-1.5-.99-.65-.35-1.01.22-1.59.15-.15 2.71-2.48 2.76-2.69a.2.2 0 00-.05-.18c-.06-.05-.14-.03-.21-.02-.09.02-1.49.95-4.22 2.79-.4.27-.76.41-1.08.4-.36-.01-1.04-.2-1.55-.37-.63-.2-1.12-.31-1.08-.66.02-.18.27-.37.74-.56 2.92-1.27 4.86-2.11 5.83-2.52 2.78-1.16 3.35-1.36 3.73-1.36.08 0 .27.02.39.12.1.08.13.19.14.27-.01.06-.01.19-.03.32z" />
          </svg>
        </div>

        <!-- Banner Info Text -->
        <div class="flex-1 min-w-0 pr-1">
          <h4 class="text-xs font-bold text-[#111827] dark:text-white truncate flex items-center gap-1.5">
            <span>Install Mattergram</span>
            <span class="text-[9px] font-semibold px-1.5 py-0.2 rounded-full bg-[#3390ec]/15 text-[#3390ec]">App</span>
          </h4>
          <p class="text-[11px] text-[#7f91a4] leading-tight line-clamp-2 mt-0.5">
            Install on your device for instant launch and a full-screen experience.
          </p>
        </div>

        <!-- Action Buttons -->
        <div class="flex items-center gap-1.5 shrink-0">
          <button
            @click="handleInstall"
            class="px-3 py-1.5 bg-[#3390ec] hover:bg-[#2883de] active:scale-95 text-white rounded-xl text-xs font-semibold shadow-sm transition-all flex items-center gap-1"
          >
            <Download class="w-3.5 h-3.5" />
            <span>Install</span>
          </button>

          <button
            @click="handleDismiss"
            class="p-1.5 text-[#7f91a4] hover:text-[#111827] dark:hover:text-white rounded-lg transition-colors"
            title="Dismiss"
          >
            <X class="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  </transition>

  <!-- iOS Safari Add to Home Screen Instructions Modal -->
  <Teleport to="body">
    <Transition name="tg-modal">
      <div
        v-if="pwaService.showIOSModal.value"
        class="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 select-none"
        style="padding-top: calc(1rem + env(safe-area-inset-top, 0px)); padding-bottom: calc(1rem + env(safe-area-inset-bottom, 0px));"
        @click="closeIOSModal"
      >
        <div
          class="tg-modal-box bg-white dark:bg-[#17212b] rounded-2xl w-full max-w-sm p-5 shadow-2xl border border-[#dfe1e5] dark:border-[#202b36] flex flex-col gap-4 text-center"
          @click.stop
        >
          <div class="w-12 h-12 rounded-2xl bg-gradient-to-tr from-[#229ed9] to-[#2aabee] mx-auto flex items-center justify-center text-white shadow-lg">
            <Smartphone class="w-6 h-6" />
          </div>

          <div>
            <h3 class="text-base font-bold text-[#111827] dark:text-white">Install on iPhone / iPad</h3>
            <p class="text-xs text-[#7f91a4] mt-1">
              Install Mattergram on your home screen in 2 quick steps:
            </p>
          </div>

          <div class="space-y-2.5 text-left text-xs bg-black/5 dark:bg-white/5 p-3.5 rounded-xl border border-black/5 dark:border-white/5">
            <div class="flex items-center gap-3 text-[#111827] dark:text-[#f5f5f5]">
              <div class="w-7 h-7 rounded-lg bg-blue-500/15 text-[#3390ec] flex items-center justify-center shrink-0">
                <Share2 class="w-4 h-4" />
              </div>
              <span>1. Tap the <strong>Share</strong> button in Safari's toolbar.</span>
            </div>

            <div class="flex items-center gap-3 text-[#111827] dark:text-[#f5f5f5]">
              <div class="w-7 h-7 rounded-lg bg-blue-500/15 text-[#3390ec] flex items-center justify-center shrink-0">
                <PlusSquare class="w-4 h-4" />
              </div>
              <span>2. Scroll down and select <strong>Add to Home Screen</strong>.</span>
            </div>
          </div>

          <button
            @click="closeIOSModal"
            class="w-full py-2.5 bg-[#3390ec] hover:bg-[#2883de] text-white rounded-xl text-xs font-semibold shadow-md transition-colors"
          >
            Got it
          </button>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>
