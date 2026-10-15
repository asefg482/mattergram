<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import { useChatStore } from '../../stores/chat'
import { useUiStore } from '../../stores/ui'
import { notificationService } from '../../services/notifications'
import TelegramAvatar from '../common/TelegramAvatar.vue'
import {
  X,
  Camera,
  Trash2,
  Hash,
  Lock,
  AlignLeft,
  FileText,
  Check,
  AlertCircle,
  Loader2,
  Edit3
} from 'lucide-vue-next'

const chatStore = useChatStore()
const uiStore = useUiStore()

const channel = computed(() => uiStore.editingChannel)
const isGroup = computed(() => channel.value?.type !== 'D' && channel.value?.display_name !== 'Saved Messages')

// Form inputs
const displayName = ref('')
const handleName = ref('')
const purpose = ref('')
const header = ref('')

// Avatar file & preview
const avatarFile = ref<File | null>(null)
const previewAvatarUrl = ref<string>('')
const removeAvatar = ref(false)
const fileInputRef = ref<HTMLInputElement | null>(null)

// Status
const isSaving = ref(false)
const errorMessage = ref<string | null>(null)

function initForm() {
  if (!channel.value) return
  displayName.value = channel.value.display_name || channel.value.name || ''
  handleName.value = channel.value.name || ''
  purpose.value = channel.value.purpose || ''
  header.value = channel.value.header || ''
  avatarFile.value = null
  previewAvatarUrl.value = ''
  removeAvatar.value = false
  errorMessage.value = null
}

watch(
  () => uiStore.showEditChannelModal,
  (isOpen) => {
    if (isOpen) {
      initForm()
    }
  }
)

function closeModal() {
  uiStore.closeEditChannel()
  if (previewAvatarUrl.value && previewAvatarUrl.value.startsWith('blob:')) {
    URL.revokeObjectURL(previewAvatarUrl.value)
  }
  avatarFile.value = null
  previewAvatarUrl.value = ''
  removeAvatar.value = false
  errorMessage.value = null
}

function handleKeyDown(e: KeyboardEvent) {
  if (e.key === 'Escape' && uiStore.showEditChannelModal) {
    closeModal()
  }
}

onMounted(() => {
  window.addEventListener('keydown', handleKeyDown)
})

onUnmounted(() => {
  window.removeEventListener('keydown', handleKeyDown)
})

function triggerFileInput() {
  fileInputRef.value?.click()
}

function handleFileChange(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return

  if (!file.type.startsWith('image/')) {
    errorMessage.value = 'Please select a valid image file (PNG, JPG, WebP, GIF).'
    input.value = ''
    return
  }

  avatarFile.value = file
  removeAvatar.value = false
  errorMessage.value = null

  if (previewAvatarUrl.value && previewAvatarUrl.value.startsWith('blob:')) {
    URL.revokeObjectURL(previewAvatarUrl.value)
  }
  previewAvatarUrl.value = URL.createObjectURL(file)
  input.value = ''
}

function handleRemovePhoto() {
  if (previewAvatarUrl.value && previewAvatarUrl.value.startsWith('blob:')) {
    URL.revokeObjectURL(previewAvatarUrl.value)
  }
  avatarFile.value = null
  previewAvatarUrl.value = ''
  removeAvatar.value = true
}

const currentDisplayAvatarUrl = computed(() => {
  if (removeAvatar.value) return ''
  if (previewAvatarUrl.value) return previewAvatarUrl.value
  return chatStore.getChannelAvatar(channel.value)
})

const hasAvatar = computed(() => {
  return Boolean(currentDisplayAvatarUrl.value)
})

async function handleSave() {
  if (!channel.value) return
  errorMessage.value = null

  const cleanDisplayName = displayName.value.trim()
  const cleanHandle = handleName.value.trim().toLowerCase().replace(/[^a-z0-9_-]/g, '')

  if (!cleanDisplayName) {
    errorMessage.value = 'Name cannot be empty.'
    return
  }

  isSaving.value = true

  try {
    await chatStore.updateChannel(channel.value.id, {
      display_name: cleanDisplayName,
      name: cleanHandle || undefined,
      purpose: purpose.value.trim(),
      header: header.value.trim(),
      avatarFile: avatarFile.value,
      removeAvatar: removeAvatar.value
    })

    notificationService.showToast({
      message: `${isGroup.value ? 'Group' : 'Channel'} updated successfully!`
    })
    closeModal()
  } catch (err: any) {
    console.error('Failed to update channel:', err)
    errorMessage.value = err.message || 'Failed to update channel details.'
  } finally {
    isSaving.value = false
  }
}
</script>

<template>
  <div
    v-if="uiStore.showEditChannelModal && channel"
    class="fixed inset-0 z-50 flex items-center justify-center p-4"
    style="padding-top: calc(1rem + env(safe-area-inset-top, 0px)); padding-bottom: calc(1rem + env(safe-area-inset-bottom, 0px));"
  >
    <!-- Backdrop -->
    <div
      @click="closeModal"
      class="absolute inset-0 bg-black/60 backdrop-blur-xs transition-opacity"
    ></div>

    <!-- Modal Box -->
    <div
      class="relative w-full max-w-lg bg-white dark:bg-[#17212b] rounded-2xl shadow-2xl border border-[#dfe1e5] dark:border-[#202b36] overflow-hidden flex flex-col max-h-[90vh] z-10"
    >
      <!-- Header -->
      <div class="px-5 py-4 border-b border-[#dfe1e5] dark:border-[#202b36] flex items-center justify-between shrink-0 bg-white dark:bg-[#17212b]">
        <div class="flex items-center gap-2.5">
          <div class="w-8 h-8 rounded-full bg-[#3390ec]/10 flex items-center justify-center text-[#3390ec]">
            <Edit3 class="w-4 h-4" />
          </div>
          <div>
            <h2 class="text-base font-bold text-gray-900 dark:text-white leading-tight">
              {{ isGroup ? 'Edit Group' : 'Edit Channel' }}
            </h2>
            <p class="text-xs text-[#7f91a4] leading-tight">
              Change name, photo, and channel details
            </p>
          </div>
        </div>
        <button
          @click="closeModal"
          class="p-1.5 text-[#7f91a4] hover:text-[#111827] dark:hover:text-white hover:bg-gray-100 dark:hover:bg-[#202b36] rounded-full transition-colors cursor-pointer"
          title="Close (Esc)"
        >
          <X class="w-5 h-5" />
        </button>
      </div>

      <!-- Scrollable Form Body -->
      <div class="p-5 overflow-y-auto space-y-5 flex-1 text-xs">
        <!-- Error Banner -->
        <div
          v-if="errorMessage"
          class="p-3 bg-red-500/10 border border-red-500/20 rounded-xl text-red-500 dark:text-red-400 flex items-start gap-2.5"
        >
          <AlertCircle class="w-4 h-4 shrink-0 mt-0.5" />
          <span class="flex-1 text-xs leading-relaxed">{{ errorMessage }}</span>
        </div>

        <!-- Avatar Management Card -->
        <div class="p-4 rounded-xl bg-gray-50 dark:bg-[#242f3d]/60 border border-[#dfe1e5] dark:border-[#202b36] flex flex-col sm:flex-row items-center gap-4">
          <!-- Avatar Preview with Camera Overlay -->
          <div class="relative group shrink-0">
            <TelegramAvatar
              :name="displayName || channel.name"
              size="2xl"
              :customAvatarUrl="currentDisplayAvatarUrl"
            />

            <!-- Hover overlay -->
            <button
              @click="triggerFileInput"
              :disabled="isSaving"
              type="button"
              class="absolute inset-0 rounded-full bg-black/45 text-white flex flex-col items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer disabled:pointer-events-none"
              title="Click to set photo"
            >
              <Camera class="w-5 h-5 mb-0.5" />
              <span class="text-[10px] font-medium">Change</span>
            </button>
          </div>

          <!-- Avatar Action Buttons -->
          <div class="flex-1 text-center sm:text-left min-w-0">
            <h3 class="text-sm font-bold text-gray-900 dark:text-white truncate">
              {{ displayName || channel.display_name || channel.name }}
            </h3>
            <p class="text-xs text-[#7f91a4] truncate">
              {{ isGroup ? 'Group Photo' : 'Channel Photo' }}
            </p>

            <div class="flex items-center justify-center sm:justify-start gap-2 mt-2.5">
              <!-- Upload Button -->
              <button
                @click="triggerFileInput"
                :disabled="isSaving"
                type="button"
                class="px-3 py-1.5 bg-[#3390ec] hover:bg-[#2b7ccc] text-white rounded-lg text-xs font-medium flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50"
              >
                <Camera class="w-3.5 h-3.5" />
                <span>{{ hasAvatar ? 'Change Photo' : 'Set Photo' }}</span>
              </button>

              <!-- Remove Photo Button -->
              <button
                v-if="hasAvatar"
                @click="handleRemovePhoto"
                :disabled="isSaving"
                type="button"
                class="px-2.5 py-1.5 text-red-500 hover:bg-red-500/10 rounded-lg text-xs font-medium flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50"
                title="Remove current photo"
              >
                <Trash2 class="w-3.5 h-3.5" />
                <span>Remove</span>
              </button>
            </div>
          </div>

          <!-- Hidden File Input -->
          <input
            ref="fileInputRef"
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif"
            @change="handleFileChange"
            class="hidden"
          />
        </div>

        <!-- Information Fields -->
        <div class="space-y-4">
          <!-- Channel / Group Name -->
          <div>
            <label class="block text-xs font-medium text-gray-700 dark:text-[#a0abb8] mb-1">
              {{ isGroup ? 'Group Name' : 'Channel Name' }}
            </label>
            <input
              v-model="displayName"
              type="text"
              placeholder="Enter name"
              class="w-full bg-gray-50 dark:bg-[#202b36] border border-[#dfe1e5] dark:border-[#202b36] focus:border-[#3390ec] dark:focus:border-[#3390ec] text-gray-900 dark:text-white rounded-xl px-3 py-2 outline-none transition-colors text-xs font-medium"
            />
          </div>

          <!-- Handle / Slug -->
          <div>
            <label class="block text-xs font-medium text-gray-700 dark:text-[#a0abb8] mb-1">
              Handle / URL Slug
            </label>
            <div class="relative">
              <span class="absolute left-3 top-1/2 -translate-y-1/2 text-[#7f91a4] font-medium text-xs font-mono">
                /
              </span>
              <input
                v-model="handleName"
                type="text"
                placeholder="handle-name"
                class="w-full bg-gray-50 dark:bg-[#202b36] border border-[#dfe1e5] dark:border-[#202b36] focus:border-[#3390ec] dark:focus:border-[#3390ec] text-gray-900 dark:text-white rounded-xl pl-6 pr-3 py-2 outline-none transition-colors text-xs font-mono"
              />
            </div>
            <p class="text-[11px] text-[#7f91a4] mt-1">
              Lowercase letters, numbers, dashes, and underscores.
            </p>
          </div>

          <!-- Description / Purpose -->
          <div>
            <label class="block text-xs font-medium text-gray-700 dark:text-[#a0abb8] mb-1">
              Description / About <span class="text-[#7f91a4] font-normal">(optional)</span>
            </label>
            <textarea
              v-model="purpose"
              rows="3"
              placeholder="What is this channel about?"
              class="w-full bg-gray-50 dark:bg-[#202b36] border border-[#dfe1e5] dark:border-[#202b36] focus:border-[#3390ec] dark:focus:border-[#3390ec] text-gray-900 dark:text-white rounded-xl px-3 py-2 outline-none transition-colors text-xs resize-none"
            ></textarea>
          </div>

          <!-- Header / Topic -->
          <div>
            <label class="block text-xs font-medium text-gray-700 dark:text-[#a0abb8] mb-1">
              Header / Topic <span class="text-[#7f91a4] font-normal">(optional)</span>
            </label>
            <input
              v-model="header"
              type="text"
              placeholder="Channel topic or guidelines"
              class="w-full bg-gray-50 dark:bg-[#202b36] border border-[#dfe1e5] dark:border-[#202b36] focus:border-[#3390ec] dark:focus:border-[#3390ec] text-gray-900 dark:text-white rounded-xl px-3 py-2 outline-none transition-colors text-xs"
            />
          </div>
        </div>
      </div>

      <!-- Footer Buttons -->
      <div class="px-5 py-3.5 border-t border-[#dfe1e5] dark:border-[#202b36] flex items-center justify-end gap-2.5 bg-gray-50 dark:bg-[#17212b] shrink-0">
        <button
          @click="closeModal"
          :disabled="isSaving"
          type="button"
          class="px-4 py-2 text-xs font-medium text-gray-700 dark:text-[#a0abb8] hover:bg-gray-200 dark:hover:bg-[#202b36] rounded-xl transition-colors cursor-pointer disabled:opacity-50"
        >
          Cancel
        </button>

        <button
          @click="handleSave"
          :disabled="isSaving"
          type="button"
          class="px-5 py-2 bg-[#3390ec] hover:bg-[#2b7ccc] text-white rounded-xl text-xs font-medium flex items-center gap-1.5 transition-colors cursor-pointer shadow-sm disabled:opacity-50"
        >
          <Loader2 v-if="isSaving" class="w-3.5 h-3.5 animate-spin" />
          <Check v-else class="w-3.5 h-3.5" />
          <span>{{ isSaving ? 'Saving...' : 'Save Changes' }}</span>
        </button>
      </div>
    </div>
  </div>
</template>
