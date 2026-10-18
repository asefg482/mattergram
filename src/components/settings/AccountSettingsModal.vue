<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import { useAuthStore } from '../../stores/auth'
import { useUiStore } from '../../stores/ui'
import { notificationService } from '../../services/notifications'
import TelegramAvatar from '../common/TelegramAvatar.vue'
import {
  X,
  User,
  Camera,
  Trash2,
  Mail,
  AtSign,
  Briefcase,
  Smile,
  Lock,
  KeyRound,
  Check,
  AlertCircle,
  Loader2,
  ChevronDown,
  ChevronUp,
  Eye,
  EyeOff
} from 'lucide-vue-next'

const authStore = useAuthStore()
const uiStore = useUiStore()

const user = computed(() => authStore.currentUser)

// Form fields
const firstName = ref('')
const lastName = ref('')
const username = ref('')
const email = ref('')
const nickname = ref('')
const position = ref('')

// Password section state
const showPasswordSection = ref(false)
const currentPassword = ref('')
const newPassword = ref('')
const confirmPassword = ref('')
const showCurrentPassword = ref(false)
const showNewPassword = ref(false)
const isUpdatingPassword = ref(false)

// Status & loading
const isSaving = ref(false)
const isUploadingAvatar = ref(false)
const errorMessage = ref<string | null>(null)
const passwordErrorMessage = ref<string | null>(null)
const fileInputRef = ref<HTMLInputElement | null>(null)

// Initialize form from current user
function initForm() {
  if (!user.value) return
  firstName.value = user.value.first_name || ''
  lastName.value = user.value.last_name || ''
  username.value = user.value.username || ''
  email.value = user.value.email || ''
  nickname.value = user.value.nickname || ''
  position.value = user.value.position || ''
  errorMessage.value = null
  passwordErrorMessage.value = null
  currentPassword.value = ''
  newPassword.value = ''
  confirmPassword.value = ''
  showPasswordSection.value = false
}

watch(
  () => uiStore.showAccountSettingsModal,
  (isOpen) => {
    if (isOpen) {
      initForm()
    }
  }
)

function closeModal() {
  uiStore.showAccountSettingsModal = false
  errorMessage.value = null
  passwordErrorMessage.value = null
}

function handleKeyDown(e: KeyboardEvent) {
  if (e.key === 'Escape' && uiStore.showAccountSettingsModal) {
    closeModal()
  }
}

onMounted(() => {
  window.addEventListener('keydown', handleKeyDown)
})

onUnmounted(() => {
  window.removeEventListener('keydown', handleKeyDown)
})

// Trigger file input for avatar
function triggerFileInput() {
  if (isUploadingAvatar.value) return
  fileInputRef.value?.click()
}

// Handle avatar file selection
async function handleFileChange(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return

  if (!file.type.startsWith('image/')) {
    errorMessage.value = 'Please select a valid image file (PNG, JPG, WebP, GIF).'
    input.value = ''
    return
  }

  isUploadingAvatar.value = true
  errorMessage.value = null

  try {
    await authStore.updateProfileImage(file)
    notificationService.showToast({
      message: 'Profile photo updated successfully!'
    })
  } catch (err: any) {
    console.error('Failed to upload profile photo:', err)
    errorMessage.value = err.message || 'Failed to update profile photo.'
  } finally {
    isUploadingAvatar.value = false
    input.value = ''
  }
}

// Remove profile picture
async function handleRemovePhoto() {
  if (isUploadingAvatar.value) return
  isUploadingAvatar.value = true
  errorMessage.value = null

  try {
    await authStore.deleteProfileImage()
    notificationService.showToast({
      message: 'Profile photo removed.'
    })
  } catch (err: any) {
    console.error('Failed to remove profile photo:', err)
    errorMessage.value = err.message || 'Failed to remove profile photo.'
  } finally {
    isUploadingAvatar.value = false
  }
}

// Save profile changes
async function handleSaveProfile() {
  errorMessage.value = null

  const cleanUsername = username.value.trim().toLowerCase()
  const cleanEmail = email.value.trim()

  if (!cleanUsername) {
    errorMessage.value = 'Username cannot be empty.'
    return
  }

  if (!cleanEmail) {
    errorMessage.value = 'Email cannot be empty.'
    return
  }

  isSaving.value = true

  try {
    await authStore.updateCurrentUser({
      username: cleanUsername,
      email: cleanEmail,
      first_name: firstName.value.trim(),
      last_name: lastName.value.trim(),
      nickname: nickname.value.trim(),
      position: position.value.trim()
    })

    notificationService.showToast({
      message: 'Account details saved successfully!'
    })
    closeModal()
  } catch (err: any) {
    console.error('Failed to update account:', err)
    errorMessage.value = err.message || 'Failed to update account details.'
  } finally {
    isSaving.value = false
  }
}

// Update password
async function handleUpdatePassword() {
  passwordErrorMessage.value = null

  if (!currentPassword.value) {
    passwordErrorMessage.value = 'Please enter your current password.'
    return
  }

  if (!newPassword.value || newPassword.value.length < 5) {
    passwordErrorMessage.value = 'New password must be at least 5 characters long.'
    return
  }

  if (newPassword.value !== confirmPassword.value) {
    passwordErrorMessage.value = 'New passwords do not match.'
    return
  }

  isUpdatingPassword.value = true

  try {
    await authStore.updatePassword(currentPassword.value, newPassword.value)
    notificationService.showToast({
      message: 'Password changed successfully!'
    })
    currentPassword.value = ''
    newPassword.value = ''
    confirmPassword.value = ''
    showPasswordSection.value = false
  } catch (err: any) {
    console.error('Failed to update password:', err)
    passwordErrorMessage.value = err.message || 'Failed to update password. Please check your current password.'
  } finally {
    isUpdatingPassword.value = false
  }
}
</script>

<template>
  <Teleport to="body">
    <Transition name="tg-modal">
      <div
        v-if="uiStore.showAccountSettingsModal"
        class="fixed inset-0 z-50 flex items-center justify-center p-4"
        style="padding-top: calc(1rem + env(safe-area-inset-top, 0px)); padding-bottom: calc(1rem + env(safe-area-inset-bottom, 0px));"
      >
        <!-- Backdrop -->
        <div
          @click="closeModal"
          class="absolute inset-0 bg-black/60 backdrop-blur-xs"
        ></div>

        <!-- Modal Box -->
        <div
          class="tg-modal-box relative w-full max-w-lg bg-white dark:bg-[#17212b] rounded-2xl shadow-2xl border border-[#dfe1e5] dark:border-[#202b36] overflow-hidden flex flex-col max-h-[90vh] z-10"
        >
      <!-- Header -->
      <div class="px-5 py-4 border-b border-[#dfe1e5] dark:border-[#202b36] flex items-center justify-between shrink-0 bg-white dark:bg-[#17212b]">
        <div class="flex items-center gap-2.5">
          <div class="w-8 h-8 rounded-full bg-[#3390ec]/10 flex items-center justify-center text-[#3390ec]">
            <User class="w-4 h-4" />
          </div>
          <div>
            <h2 class="text-base font-bold text-gray-900 dark:text-white leading-tight">
              Account Settings
            </h2>
            <p class="text-xs text-[#7f91a4] leading-tight">
              Manage your profile, photo and credentials
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
      <div class="p-5 overflow-y-auto space-y-6 flex-1 text-xs">
        <!-- Error Banner -->
        <div
          v-if="errorMessage"
          class="p-3 bg-red-500/10 border border-red-500/20 rounded-xl text-red-500 dark:text-red-400 flex items-start gap-2.5"
        >
          <AlertCircle class="w-4 h-4 shrink-0 mt-0.5" />
          <span class="flex-1 text-xs leading-relaxed">{{ errorMessage }}</span>
        </div>

        <!-- Avatar Management Card -->
        <div class="p-4 rounded-xl bg-gray-50 dark:bg-[#242f3d]/60 border border-[#dfe1e5] dark:border-[#202b36] flex flex-col sm:flex-row items-center sm:items-center gap-4">
          <!-- Avatar Preview with Camera Overlay -->
          <div class="relative group shrink-0">
            <TelegramAvatar
              :userId="user?.id"
              :name="user?.first_name || user?.username"
              size="2xl"
              :lastPictureUpdate="(user as any)?.last_picture_update"
            />

            <!-- Hover overlay -->
            <button
              @click="triggerFileInput"
              :disabled="isUploadingAvatar"
              type="button"
              class="absolute inset-0 rounded-full bg-black/45 text-white flex flex-col items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer disabled:pointer-events-none"
              title="Click to change photo"
            >
              <Camera class="w-5 h-5 mb-0.5" />
              <span class="text-[10px] font-medium">Change</span>
            </button>

            <!-- Loading overlay -->
            <div
              v-if="isUploadingAvatar"
              class="absolute inset-0 rounded-full bg-black/60 flex items-center justify-center text-white"
            >
              <Loader2 class="w-6 h-6 animate-spin text-[#3390ec]" />
            </div>
          </div>

          <!-- Avatar Action Buttons -->
          <div class="flex-1 text-center sm:text-left min-w-0">
            <h3 class="text-sm font-bold text-gray-900 dark:text-white truncate">
              {{ user?.first_name || user?.username }}
            </h3>
            <p class="text-xs text-[#7f91a4] truncate">
              @{{ user?.username }}
            </p>

            <div class="flex items-center justify-center sm:justify-start gap-2 mt-2.5">
              <!-- Upload Button -->
              <button
                @click="triggerFileInput"
                :disabled="isUploadingAvatar"
                type="button"
                class="px-3 py-1.5 bg-[#3390ec] hover:bg-[#2b7ccc] text-white rounded-lg text-xs font-medium flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50"
              >
                <Camera class="w-3.5 h-3.5" />
                <span>{{ isUploadingAvatar ? 'Uploading...' : 'Set Photo' }}</span>
              </button>

              <!-- Remove Photo Button -->
              <button
                @click="handleRemovePhoto"
                :disabled="isUploadingAvatar"
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

        <!-- Personal Info Fields -->
        <div class="space-y-4">
          <div class="text-[11px] font-semibold uppercase tracking-wider text-[#7f91a4] flex items-center gap-1.5">
            <User class="w-3.5 h-3.5 text-[#3390ec]" />
            <span>Personal Information</span>
          </div>

          <!-- Name row (First Name & Last Name) -->
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label class="block text-xs font-medium text-gray-700 dark:text-[#a0abb8] mb-1">
                First Name
              </label>
              <input
                v-model="firstName"
                type="text"
                placeholder="First name"
                class="w-full bg-gray-50 dark:bg-[#202b36] border border-[#dfe1e5] dark:border-[#202b36] focus:border-[#3390ec] dark:focus:border-[#3390ec] text-gray-900 dark:text-white rounded-xl px-3 py-2 outline-none transition-colors text-xs"
              />
            </div>
            <div>
              <label class="block text-xs font-medium text-gray-700 dark:text-[#a0abb8] mb-1">
                Last Name
              </label>
              <input
                v-model="lastName"
                type="text"
                placeholder="Last name"
                class="w-full bg-gray-50 dark:bg-[#202b36] border border-[#dfe1e5] dark:border-[#202b36] focus:border-[#3390ec] dark:focus:border-[#3390ec] text-gray-900 dark:text-white rounded-xl px-3 py-2 outline-none transition-colors text-xs"
              />
            </div>
          </div>

          <!-- Username -->
          <div>
            <label class="block text-xs font-medium text-gray-700 dark:text-[#a0abb8] mb-1">
              Username
            </label>
            <div class="relative">
              <span class="absolute left-3 top-1/2 -translate-y-1/2 text-[#7f91a4] font-medium text-xs">
                @
              </span>
              <input
                v-model="username"
                type="text"
                placeholder="username"
                class="w-full bg-gray-50 dark:bg-[#202b36] border border-[#dfe1e5] dark:border-[#202b36] focus:border-[#3390ec] dark:focus:border-[#3390ec] text-gray-900 dark:text-white rounded-xl pl-7 pr-3 py-2 outline-none transition-colors text-xs font-mono"
              />
            </div>
            <p class="text-[11px] text-[#7f91a4] mt-1">
              Used for your profile handle and mentions in chats.
            </p>
          </div>

          <!-- Email -->
          <div>
            <label class="block text-xs font-medium text-gray-700 dark:text-[#a0abb8] mb-1">
              Email Address
            </label>
            <div class="relative">
              <Mail class="w-3.5 h-3.5 text-[#7f91a4] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                v-model="email"
                type="email"
                placeholder="name@example.com"
                class="w-full bg-gray-50 dark:bg-[#202b36] border border-[#dfe1e5] dark:border-[#202b36] focus:border-[#3390ec] dark:focus:border-[#3390ec] text-gray-900 dark:text-white rounded-xl pl-8 pr-3 py-2 outline-none transition-colors text-xs font-mono"
              />
            </div>
          </div>

          <!-- Nickname & Position -->
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label class="block text-xs font-medium text-gray-700 dark:text-[#a0abb8] mb-1">
                Nickname <span class="text-[#7f91a4] font-normal">(optional)</span>
              </label>
              <div class="relative">
                <Smile class="w-3.5 h-3.5 text-[#7f91a4] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  v-model="nickname"
                  type="text"
                  placeholder="e.g. Alex"
                  class="w-full bg-gray-50 dark:bg-[#202b36] border border-[#dfe1e5] dark:border-[#202b36] focus:border-[#3390ec] dark:focus:border-[#3390ec] text-gray-900 dark:text-white rounded-xl pl-8 pr-3 py-2 outline-none transition-colors text-xs"
                />
              </div>
            </div>

            <div>
              <label class="block text-xs font-medium text-gray-700 dark:text-[#a0abb8] mb-1">
                Position / Role <span class="text-[#7f91a4] font-normal">(optional)</span>
              </label>
              <div class="relative">
                <Briefcase class="w-3.5 h-3.5 text-[#7f91a4] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  v-model="position"
                  type="text"
                  placeholder="e.g. Developer, Designer"
                  class="w-full bg-gray-50 dark:bg-[#202b36] border border-[#dfe1e5] dark:border-[#202b36] focus:border-[#3390ec] dark:focus:border-[#3390ec] text-gray-900 dark:text-white rounded-xl pl-8 pr-3 py-2 outline-none transition-colors text-xs"
                />
              </div>
            </div>
          </div>
        </div>

        <!-- Password Change Accordion -->
        <div class="pt-2 border-t border-[#dfe1e5] dark:border-[#202b36]">
          <button
            @click="showPasswordSection = !showPasswordSection"
            type="button"
            class="w-full flex items-center justify-between py-2 text-xs font-medium text-gray-700 dark:text-[#a0abb8] hover:text-[#3390ec] dark:hover:text-[#3390ec] transition-colors cursor-pointer select-none"
          >
            <div class="flex items-center gap-2">
              <KeyRound class="w-4 h-4 text-[#3390ec]" />
              <span class="font-semibold">Security & Password</span>
            </div>
            <div class="flex items-center gap-1 text-[11px] text-[#7f91a4]">
              <span>{{ showPasswordSection ? 'Hide' : 'Change Password' }}</span>
              <ChevronUp v-if="showPasswordSection" class="w-3.5 h-3.5" />
              <ChevronDown v-else class="w-3.5 h-3.5" />
            </div>
          </button>

          <!-- Collapsible Password Form -->
          <div
            v-if="showPasswordSection"
            class="mt-3 p-4 rounded-xl bg-gray-50 dark:bg-[#242f3d]/40 border border-[#dfe1e5] dark:border-[#202b36] space-y-3"
          >
            <!-- Password Error -->
            <div
              v-if="passwordErrorMessage"
              class="p-2.5 bg-red-500/10 border border-red-500/20 rounded-lg text-red-500 dark:text-red-400 text-xs flex items-center gap-2"
            >
              <AlertCircle class="w-4 h-4 shrink-0" />
              <span>{{ passwordErrorMessage }}</span>
            </div>

            <!-- Current Password -->
            <div>
              <label class="block text-xs font-medium text-gray-700 dark:text-[#a0abb8] mb-1">
                Current Password
              </label>
              <div class="relative">
                <input
                  v-model="currentPassword"
                  :type="showCurrentPassword ? 'text' : 'password'"
                  placeholder="Enter current password"
                  class="w-full bg-white dark:bg-[#202b36] border border-[#dfe1e5] dark:border-[#202b36] text-gray-900 dark:text-white rounded-xl px-3 py-2 pr-9 outline-none text-xs"
                />
                <button
                  type="button"
                  @click="showCurrentPassword = !showCurrentPassword"
                  class="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#7f91a4] hover:text-gray-900 dark:hover:text-white cursor-pointer"
                >
                  <EyeOff v-if="showCurrentPassword" class="w-3.5 h-3.5" />
                  <Eye v-else class="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            <!-- New Password & Confirm Password -->
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label class="block text-xs font-medium text-gray-700 dark:text-[#a0abb8] mb-1">
                  New Password
                </label>
                <div class="relative">
                  <input
                    v-model="newPassword"
                    :type="showNewPassword ? 'text' : 'password'"
                    placeholder="Min 5 characters"
                    class="w-full bg-white dark:bg-[#202b36] border border-[#dfe1e5] dark:border-[#202b36] text-gray-900 dark:text-white rounded-xl px-3 py-2 pr-9 outline-none text-xs"
                  />
                  <button
                    type="button"
                    @click="showNewPassword = !showNewPassword"
                    class="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#7f91a4] hover:text-gray-900 dark:hover:text-white cursor-pointer"
                  >
                    <EyeOff v-if="showNewPassword" class="w-3.5 h-3.5" />
                    <Eye v-else class="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              <div>
                <label class="block text-xs font-medium text-gray-700 dark:text-[#a0abb8] mb-1">
                  Confirm New Password
                </label>
                <input
                  v-model="confirmPassword"
                  :type="showNewPassword ? 'text' : 'password'"
                  placeholder="Repeat new password"
                  class="w-full bg-white dark:bg-[#202b36] border border-[#dfe1e5] dark:border-[#202b36] text-gray-900 dark:text-white rounded-xl px-3 py-2 outline-none text-xs"
                />
              </div>
            </div>

            <div class="flex justify-end pt-1">
              <button
                @click="handleUpdatePassword"
                :disabled="isUpdatingPassword || !currentPassword || !newPassword"
                type="button"
                class="px-3.5 py-1.5 bg-[#3390ec] hover:bg-[#2b7ccc] text-white rounded-lg text-xs font-medium flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-40 disabled:pointer-events-none"
              >
                <Loader2 v-if="isUpdatingPassword" class="w-3.5 h-3.5 animate-spin" />
                <Lock v-else class="w-3.5 h-3.5" />
                <span>{{ isUpdatingPassword ? 'Updating...' : 'Update Password' }}</span>
              </button>
            </div>
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
          @click="handleSaveProfile"
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
  </Transition>
</Teleport>
</template>
