<script setup lang="ts">
import { computed, onMounted, onUnmounted } from 'vue'
import { useUiStore } from '../../stores/ui'
import { useUsersStore } from '../../stores/users'
import { X, Download, User } from 'lucide-vue-next'

const uiStore = useUiStore()
const usersStore = useUsersStore()

const preview = computed(() => uiStore.avatarPreview)
const user = computed(() => {
  if (!preview.value.userId) return null
  return usersStore.getUser(preview.value.userId)
})

function handleViewProfile() {
  if (user.value) {
    handleClose()
    uiStore.openMentionModal({
      type: 'user',
      username: user.value.username,
      user: user.value
    })
  }
}

function handleClose() {
  uiStore.closeAvatarPreview()
}

function handleKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape' && preview.value.isOpen) {
    handleClose()
  }
}

onMounted(() => {
  window.addEventListener('keydown', handleKeydown)
})

onUnmounted(() => {
  window.removeEventListener('keydown', handleKeydown)
})
</script>

<template>
  <div
    v-if="preview.isOpen"
    class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/90 backdrop-blur-md select-none animate-in fade-in duration-200"
    @click.self="handleClose"
  >
    <!-- Top Action Bar -->
    <div class="absolute top-4 left-4 right-4 flex items-center justify-between text-white z-20 pointer-events-none">
      <div class="flex items-center gap-2 pointer-events-auto">
        <span class="font-semibold text-sm">{{ preview.name }}</span>
        <span class="text-xs text-white/60">عکس پروفایل</span>
      </div>

      <div class="flex items-center gap-2 pointer-events-auto">
        <!-- View Profile Button (if user exists) -->
        <button
          v-if="user"
          @click="handleViewProfile"
          class="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white/90 hover:text-white bg-white/10 hover:bg-white/20 rounded-full transition-colors"
          title="مشاهده پروفایل کاربر"
        >
          <User class="w-4 h-4" />
          <span>مشاهده پروفایل</span>
        </button>

        <!-- Download Button -->
        <a
          :href="preview.url"
          :download="`${preview.name}-avatar.png`"
          target="_blank"
          class="p-2 text-white/80 hover:text-white bg-white/10 hover:bg-white/20 rounded-full transition-colors"
          title="دانلود عکس"
        >
          <Download class="w-5 h-5" />
        </a>

        <!-- Close Button -->
        <button
          @click="handleClose"
          class="p-2 text-white/80 hover:text-white bg-white/10 hover:bg-white/20 rounded-full transition-colors"
          title="بستن"
        >
          <X class="w-5 h-5" />
        </button>
      </div>
    </div>

    <!-- Centered Enlarged Photo -->
    <div class="relative max-w-2xl max-h-[82vh] flex items-center justify-center animate-in zoom-in-95 duration-200">
      <img
        :src="preview.url"
        :alt="preview.name"
        class="max-w-full max-h-[80vh] w-auto h-auto object-contain rounded-3xl shadow-2xl ring-1 ring-white/10"
      />
    </div>
  </div>
</template>
