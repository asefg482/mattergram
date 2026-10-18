<script setup lang="ts">
import { onMounted, onUnmounted } from 'vue'
import { useAlertStore } from '../../stores/alert'
import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  Info,
  X
} from 'lucide-vue-next'

const alertStore = useAlertStore()

function onKeyDown(e: KeyboardEvent) {
  if (!alertStore.isOpen) return

  if (e.key === 'Escape') {
    e.preventDefault()
    alertStore.handleCancel()
  } else if (e.key === 'Enter') {
    e.preventDefault()
    alertStore.handleConfirm()
  }
}

onMounted(() => {
  window.addEventListener('keydown', onKeyDown)
})

onUnmounted(() => {
  window.removeEventListener('keydown', onKeyDown)
})
</script>

<template>
  <transition
    enter-active-class="transition duration-200 ease-out"
    enter-from-class="opacity-0"
    enter-to-class="opacity-100"
    leave-active-class="transition duration-150 ease-in"
    leave-from-class="opacity-100"
    leave-to-class="opacity-0"
  >
    <div
      v-if="alertStore.isOpen"
      class="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs select-none"
      style="padding-top: calc(1rem + env(safe-area-inset-top, 0px)); padding-bottom: calc(1rem + env(safe-area-inset-bottom, 0px));"
      @click.self="alertStore.handleCancel"
    >
      <transition
        enter-active-class="transition duration-200 ease-out"
        enter-from-class="opacity-0 scale-95 translate-y-2"
        enter-to-class="opacity-100 scale-100 translate-y-0"
        leave-active-class="transition duration-150 ease-in"
        leave-from-class="opacity-100 scale-100 translate-y-0"
        leave-to-class="opacity-0 scale-95 translate-y-2"
      >
        <div
          v-if="alertStore.isOpen"
          class="tg-modal-box relative w-full max-w-sm bg-white dark:bg-[#17212b] border border-[#dfe1e5] dark:border-[#202b36] rounded-2xl shadow-2xl overflow-hidden p-6 text-left flex flex-col gap-4"
        >
          <!-- Top Row: Icon & Close Button -->
          <div class="flex items-start justify-between gap-3">
            <div class="flex items-center gap-3">
              <!-- Type Icon -->
              <div
                class="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
                :class="{
                  'bg-red-500/15 text-red-500 dark:bg-red-500/20 dark:text-red-400': alertStore.type === 'error',
                  'bg-amber-500/15 text-amber-500 dark:bg-amber-500/20 dark:text-amber-400': alertStore.type === 'warning',
                  'bg-emerald-500/15 text-emerald-500 dark:bg-emerald-500/20 dark:text-emerald-400': alertStore.type === 'success',
                  'bg-[#3390ec]/15 text-[#3390ec] dark:bg-[#3390ec]/20 dark:text-[#3390ec]': alertStore.type === 'info'
                }"
              >
                <AlertCircle v-if="alertStore.type === 'error'" class="w-5 h-5" />
                <AlertTriangle v-else-if="alertStore.type === 'warning'" class="w-5 h-5" />
                <CheckCircle2 v-else-if="alertStore.type === 'success'" class="w-5 h-5" />
                <Info v-else class="w-5 h-5" />
              </div>

              <!-- Title -->
              <div>
                <h3 class="text-base font-bold text-[#111827] dark:text-[#f5f5f5] leading-snug">
                  {{ alertStore.title }}
                </h3>
              </div>
            </div>

            <!-- Dismiss button -->
            <button
              @click="alertStore.handleCancel"
              class="w-7 h-7 flex items-center justify-center rounded-lg text-[#7f91a4] hover:text-[#111827] dark:hover:text-white hover:bg-gray-100 dark:hover:bg-[#202b36] transition-colors cursor-pointer shrink-0 -mr-1 -mt-1"
              title="Close"
            >
              <X class="w-4 h-4" />
            </button>
          </div>

          <!-- Message Body -->
          <div class="text-sm text-[#4b5563] dark:text-[#a0acb9] leading-relaxed break-words whitespace-pre-wrap pl-0.5">
            {{ alertStore.message }}
          </div>

          <!-- Action Buttons -->
          <div class="flex items-center justify-end gap-2.5 pt-2">
            <!-- Cancel Button (if confirm modal) -->
            <button
              v-if="alertStore.showCancel"
              @click="alertStore.handleCancel"
              class="px-4 py-2 text-xs font-semibold rounded-xl text-[#7f91a4] hover:text-[#111827] dark:hover:text-white bg-gray-100 hover:bg-gray-200 dark:bg-[#202b36] dark:hover:bg-[#2b3749] transition-all cursor-pointer"
            >
              {{ alertStore.cancelText }}
            </button>

            <!-- Confirm / OK Button -->
            <button
              @click="alertStore.handleConfirm"
              class="px-5 py-2 text-xs font-semibold rounded-xl text-white transition-all cursor-pointer shadow-xs active:scale-95"
              :class="{
                'bg-red-500 hover:bg-red-600 active:bg-red-700': alertStore.isDestructive,
                'bg-[#3390ec] hover:bg-[#2b7ecf] active:bg-[#2473bd]': !alertStore.isDestructive
              }"
            >
              {{ alertStore.confirmText }}
            </button>
          </div>
        </div>
      </transition>
    </div>
  </transition>
</template>
