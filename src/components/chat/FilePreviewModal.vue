<script setup lang="ts">
import { computed } from 'vue'
import { useUiStore } from '../../stores/ui'
import { mmApi } from '../../services/mattermostApi'
import { formatFileSize } from '../../utils/formatters'
import { X, Download, FileText, Image, File } from 'lucide-vue-next'

const uiStore = useUiStore()

const file = computed(() => uiStore.previewFile)

const isImage = computed(() => {
  if (!file.value) return false
  return (
    file.value.mime_type.startsWith('image/') ||
    ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg'].includes(file.value.extension?.toLowerCase())
  )
})

const fileUrl = computed(() => {
  if (!file.value) return ''
  return mmApi.getFileDownloadUrl(file.value.id)
})
</script>

<template>
  <div
    v-if="file"
    class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-sm select-none"
  >
    <!-- Close button -->
    <button
      @click="uiStore.closeFilePreview"
      class="absolute top-4 right-4 p-2 text-white/80 hover:text-white bg-black/40 hover:bg-black/60 rounded-full transition-colors z-10"
    >
      <X class="w-6 h-6" />
    </button>

    <!-- Content -->
    <div class="max-w-4xl max-h-[85vh] flex flex-col items-center justify-center relative">
      <!-- Image Preview -->
      <img
        v-if="isImage"
        :src="fileUrl"
        :alt="file.name"
        class="max-w-full max-h-[75vh] object-contain rounded-lg shadow-2xl"
      />

      <!-- Generic Document Preview Card -->
      <div
        v-else
        class="bg-[#17212b] border border-[#202b36] p-8 rounded-2xl shadow-2xl flex flex-col items-center text-center max-w-sm"
      >
        <div class="w-16 h-16 rounded-2xl bg-[#2481cc]/20 flex items-center justify-center text-[#2481cc] mb-4">
          <FileText class="w-8 h-8" />
        </div>
        <h3 class="text-white font-semibold text-sm mb-1 truncate max-w-xs">{{ file.name }}</h3>
        <p class="text-xs text-[#7f91a4] mb-4">{{ formatFileSize(file.size) }} • {{ file.extension.toUpperCase() }}</p>
      </div>

      <!-- Bottom Action Bar -->
      <div class="mt-4 flex items-center gap-3 bg-[#17212b]/80 backdrop-blur-md px-4 py-2 rounded-full border border-white/10 text-white text-xs">
        <span class="truncate max-w-xs">{{ file.name }}</span>
        <span class="text-[#7f91a4]">({{ formatFileSize(file.size) }})</span>
        <a
          :href="fileUrl"
          :download="file.name"
          target="_blank"
          class="ml-2 px-3 py-1 bg-[#2481cc] hover:bg-[#1d73b8] rounded-full text-white font-medium flex items-center gap-1.5 transition-colors"
        >
          <Download class="w-3.5 h-3.5" />
          <span>Download</span>
        </a>
      </div>
    </div>
  </div>
</template>
