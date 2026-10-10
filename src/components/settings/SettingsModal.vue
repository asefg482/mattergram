<script setup lang="ts">
import { ref } from 'vue'
import { useAuthStore } from '../../stores/auth'
import { useUiStore } from '../../stores/ui'
import { soundService } from '../../services/sounds'
import { getAvatarGradient, getInitials } from '../../utils/formatters'
import {
  X,
  Server,
  Volume2,
  VolumeX,
  Moon,
  Sun,
  Shield,
  Save,
  CheckCircle2,
  AlertCircle,
  Loader2
} from 'lucide-vue-next'
import TelegramAvatar from '../common/TelegramAvatar.vue'

const authStore = useAuthStore()
const uiStore = useUiStore()

const serverUrlInput = ref(authStore.baseUrl)
const soundEnabled = ref(soundService.isEnabled())
const isTestingServer = ref(false)
const testResult = ref<{ ok: boolean; msg: string } | null>(null)
const saveSuccess = ref(false)

async function testConnection() {
  if (!serverUrlInput.value.trim()) return
  isTestingServer.value = true
  testResult.value = null
  try {
    const clean = serverUrlInput.value.trim().replace(/\/+$/, '')
    const res = await fetch('/api/v4/system/ping', {
      headers: {
        'X-Mattermost-Server': clean
      }
    })
    if (res.ok) {
      testResult.value = { ok: true, msg: 'Server is reachable & operational' }
    } else {
      testResult.value = { ok: false, msg: `Server responded with status ${res.status}` }
    }
  } catch (err: any) {
    testResult.value = { ok: false, msg: err.message || 'Connection failed' }
  } finally {
    isTestingServer.value = false
  }
}

function handleSave() {
  authStore.setBaseUrl(serverUrlInput.value)
  soundService.setEnabled(soundEnabled.value)
  saveSuccess.value = true
  setTimeout(() => {
    saveSuccess.value = false
    uiStore.showSettingsModal = false
  }, 1000)
}
</script>

<template>
  <div v-if="uiStore.showSettingsModal" class="fixed inset-0 z-50 flex items-center justify-center p-4">
    <!-- Backdrop -->
    <div @click="uiStore.showSettingsModal = false" class="absolute inset-0 bg-black/60 backdrop-blur-xs"></div>

    <!-- Modal Box -->
    <div class="relative w-full max-w-md bg-[#17212b] dark:bg-[#17212b] bg-white rounded-2xl shadow-2xl border border-[#202b36] overflow-hidden flex flex-col max-h-[90vh]">
      <!-- Header -->
      <div class="px-5 py-4 border-b border-[#202b36] flex items-center justify-between">
        <h2 class="text-base font-bold text-white dark:text-white text-gray-900">Settings</h2>
        <button @click="uiStore.showSettingsModal = false" class="p-1 text-[#7f91a4] hover:text-white rounded-lg transition-colors">
          <X class="w-5 h-5" />
        </button>
      </div>

      <!-- Content -->
      <div class="p-5 overflow-y-auto space-y-6 flex-1">
        <!-- Account Card -->
        <div class="flex items-center gap-4 p-4 rounded-xl bg-[#242f3d] dark:bg-[#242f3d] bg-[#f4f4f5]">
          <TelegramAvatar
            :userId="authStore.currentUser?.id"
            :name="authStore.currentUser?.first_name || authStore.currentUser?.username"
            size="xl"
            :lastPictureUpdate="(authStore.currentUser as any)?.last_picture_update"
          />
          <div class="flex-1 min-w-0">
            <h3 class="text-sm font-bold text-white dark:text-white text-gray-900 truncate">
              {{ authStore.currentUser?.first_name || authStore.currentUser?.username }}
            </h3>
            <p class="text-xs text-[#7f91a4] truncate">@{{ authStore.currentUser?.username }}</p>
            <p class="text-xs text-[#7f91a4] truncate mt-0.5">{{ authStore.currentUser?.email }}</p>
          </div>
        </div>

        <!-- Section 1: Server URL Configuration -->
        <div class="space-y-2">
          <label class="block text-xs font-semibold text-[#7f91a4] uppercase tracking-wider flex items-center justify-between">
            <span class="flex items-center gap-1.5">
              <Server class="w-3.5 h-3.5 text-[#3390ec]" />
              Mattermost Base URL
            </span>
            <button
              type="button"
              @click="testConnection"
              :disabled="isTestingServer"
              class="text-[#3390ec] hover:underline text-[11px] font-normal flex items-center gap-1"
            >
              <Loader2 v-if="isTestingServer" class="w-3 h-3 animate-spin" />
              <span>{{ isTestingServer ? 'Testing...' : 'Test' }}</span>
            </button>
          </label>

          <input
            v-model="serverUrlInput"
            type="url"
            required
            placeholder="https://m.dornicadev.ir"
            class="w-full bg-[#0e1621] border border-[#202b36] text-white text-xs rounded-xl px-3.5 py-2.5 outline-none focus:border-[#3390ec]"
          />

          <!-- Connection result -->
          <div v-if="testResult" class="text-xs flex items-center gap-1.5" :class="testResult.ok ? 'text-emerald-400' : 'text-amber-400'">
            <CheckCircle2 v-if="testResult.ok" class="w-3.5 h-3.5" />
            <AlertCircle v-else class="w-3.5 h-3.5" />
            <span>{{ testResult.msg }}</span>
          </div>
        </div>

        <!-- Section 2: Preferences -->
        <div class="space-y-3">
          <h4 class="text-xs font-semibold text-[#7f91a4] uppercase tracking-wider">Preferences</h4>

          <!-- Night Mode -->
          <div
            @click="uiStore.toggleTheme"
            class="flex items-center justify-between p-3 rounded-xl hover:bg-[#202b36] cursor-pointer transition-colors"
          >
            <div class="flex items-center gap-3">
              <Moon v-if="uiStore.theme === 'dark'" class="w-5 h-5 text-[#3390ec]" />
              <Sun v-else class="w-5 h-5 text-amber-500" />
              <span class="text-xs font-medium text-white dark:text-white text-gray-800">Night Mode</span>
            </div>
            <div
              class="w-9 h-5 rounded-full p-0.5 transition-colors"
              :class="uiStore.theme === 'dark' ? 'bg-[#3390ec]' : 'bg-gray-500'"
            >
              <div
                class="w-4 h-4 rounded-full bg-white transition-transform"
                :class="uiStore.theme === 'dark' ? 'translate-x-4' : 'translate-x-0'"
              ></div>
            </div>
          </div>

          <!-- Sound Effects -->
          <div
            @click="soundEnabled = !soundEnabled"
            class="flex items-center justify-between p-3 rounded-xl hover:bg-[#202b36] cursor-pointer transition-colors"
          >
            <div class="flex items-center gap-3">
              <Volume2 v-if="soundEnabled" class="w-5 h-5 text-emerald-400" />
              <VolumeX v-else class="w-5 h-5 text-[#7f91a4]" />
              <span class="text-xs font-medium text-white dark:text-white text-gray-800">Sound Effects</span>
            </div>
            <div
              class="w-9 h-5 rounded-full p-0.5 transition-colors"
              :class="soundEnabled ? 'bg-[#3390ec]' : 'bg-gray-500'"
            >
              <div
                class="w-4 h-4 rounded-full bg-white transition-transform"
                :class="soundEnabled ? 'translate-x-4' : 'translate-x-0'"
              ></div>
            </div>
          </div>
        </div>
      </div>

      <!-- Footer Buttons -->
      <div class="p-4 border-t border-[#202b36] flex items-center justify-end gap-3 bg-[#0e1621]/30">
        <button
          @click="uiStore.showSettingsModal = false"
          class="px-4 py-2 text-xs text-[#7f91a4] hover:text-white transition-colors"
        >
          Cancel
        </button>
        <button
          @click="handleSave"
          class="px-5 py-2 bg-[#3390ec] hover:bg-[#2481cc] text-white text-xs font-semibold rounded-xl shadow flex items-center gap-2 transition-all"
        >
          <CheckCircle2 v-if="saveSuccess" class="w-4 h-4" />
          <Save v-else class="w-4 h-4" />
          <span>{{ saveSuccess ? 'Saved!' : 'Save Changes' }}</span>
        </button>
      </div>
    </div>
  </div>
</template>
