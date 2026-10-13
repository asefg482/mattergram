<script setup lang="ts">
import { ref, watch } from 'vue'
import { useAuthStore } from '../../stores/auth'
import { useUiStore } from '../../stores/ui'
import { soundService } from '../../services/sounds'
import { getAvatarGradient, getInitials } from '../../utils/formatters'
import {
  X,
  Server,
  Lock,
  Volume2,
  VolumeX,
  Moon,
  Sun,
  Shield,
  Save,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Bell,
  BellOff,
  Palette,
  Zap,
  Check,
  Clock,
  Globe
} from 'lucide-vue-next'
import TelegramAvatar from '../common/TelegramAvatar.vue'
import { notificationService } from '../../services/notifications'
import { mmApi } from '../../services/mattermostApi'
import { THEME_PRESETS, ANIMATION_PRESETS } from '../../utils/themes'
import {
  userTimezone,
  userTimeFormat,
  setTimezone,
  setTimeFormat,
  getEffectiveTimezone
} from '../../utils/formatters'

const authStore = useAuthStore()
const uiStore = useUiStore()

const soundEnabled = ref(soundService.isEnabled())
const isTestingServer = ref(false)
const testResult = ref<{ ok: boolean; msg: string } | null>(null)
const saveSuccess = ref(false)

function enlargeMyAvatar() {
  const u = authStore.currentUser
  if (u) {
    const url = mmApi.getUserAvatarUrl(u.id, (u as any)?.last_picture_update)
    const name = u.first_name || u.username
    uiStore.openAvatarPreview(url, name, u.id)
  }
}

async function testConnection() {
  const url = authStore.baseUrl?.trim() || ''
  if (!url) return
  isTestingServer.value = true
  testResult.value = null
  try {
    const clean = url.replace(/\/+$/, '')
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

const notifEnabled = ref(notificationService.isEnabled())
const notifPermission = ref(notificationService.getPermission())

watch(
  () => notificationService.permission.value,
  (perm) => {
    notifPermission.value = perm
  }
)

async function toggleNotifications() {
  if (notifPermission.value !== 'granted') {
    const granted = await notificationService.requestPermission()
    notifPermission.value = notificationService.getPermission()
    if (granted) {
      notifEnabled.value = true
      notificationService.setEnabled(true)
    }
  } else {
    notifEnabled.value = !notifEnabled.value
    notificationService.setEnabled(notifEnabled.value)
  }
}

function handleSave() {
  soundService.setEnabled(soundEnabled.value)
  notificationService.setEnabled(notifEnabled.value)
  saveSuccess.value = true
  setTimeout(() => {
    saveSuccess.value = false
    uiStore.showSettingsModal = false
  }, 1000)
}

function selectTheme(id: string) {
  uiStore.setThemePreset(id)
}

function selectAnimation(id: string) {
  uiStore.setAnimationPreset(id)
}
</script>

<template>
  <div
    v-if="uiStore.showSettingsModal"
    class="fixed inset-0 z-50 flex items-center justify-center p-4"
    style="padding-top: calc(1rem + env(safe-area-inset-top, 0px)); padding-bottom: calc(1rem + env(safe-area-inset-bottom, 0px));"
  >
    <!-- Backdrop -->
    <div @click="uiStore.showSettingsModal = false" class="absolute inset-0 bg-black/60 backdrop-blur-xs"></div>

    <!-- Modal Box -->
    <div class="relative w-full max-w-md bg-white dark:bg-[#17212b] rounded-2xl shadow-2xl border border-[#dfe1e5] dark:border-[#202b36] overflow-hidden flex flex-col max-h-[90vh]">
      <!-- Header -->
      <div class="px-5 py-4 border-b border-[#dfe1e5] dark:border-[#202b36] flex items-center justify-between">
        <h2 class="text-base font-bold text-gray-900 dark:text-white">Settings</h2>
        <button @click="uiStore.showSettingsModal = false" class="p-1 text-[#7f91a4] hover:text-[#111827] dark:hover:text-white rounded-lg transition-colors">
          <X class="w-5 h-5" />
        </button>
      </div>

      <!-- Content -->
      <div class="p-5 overflow-y-auto space-y-6 flex-1">
        <!-- Account Card -->
        <div class="flex items-center gap-4 p-4 rounded-xl bg-[#f4f4f5] dark:bg-[#242f3d]">
          <div
            @click="enlargeMyAvatar"
            class="cursor-pointer hover:opacity-85 transition-opacity"
            title="Click to view full photo"
          >
            <TelegramAvatar
              :userId="authStore.currentUser?.id"
              :name="authStore.currentUser?.first_name || authStore.currentUser?.username"
              size="xl"
              :lastPictureUpdate="(authStore.currentUser as any)?.last_picture_update"
            />
          </div>
          <div class="flex-1 min-w-0">
            <h3 class="text-sm font-bold text-gray-900 dark:text-white truncate">
              {{ authStore.currentUser?.first_name || authStore.currentUser?.username }}
            </h3>
            <p class="text-xs text-[#7f91a4] truncate">@{{ authStore.currentUser?.username }}</p>
            <p class="text-xs text-[#7f91a4] truncate mt-0.5">{{ authStore.currentUser?.email }}</p>
          </div>
        </div>

        <!-- Section 1: Server URL Configuration (Read-only from .env) -->
        <div class="space-y-2">
          <label class="block text-xs font-semibold text-[#7f91a4] uppercase tracking-wider flex items-center justify-between">
            <span class="flex items-center gap-1.5">
              <Server class="w-3.5 h-3.5 text-[#3390ec]" />
              Mattermost Base URL
            </span>
            <div class="flex items-center gap-2">
              <span class="text-[10px] text-[#7f91a4] font-medium bg-gray-200 dark:bg-black/20 px-2 py-0.5 rounded-md border border-gray-300 dark:border-[#202b36]">
                Read-only (.env)
              </span>
              <button
                type="button"
                @click="testConnection"
                :disabled="isTestingServer"
                class="text-[#3390ec] hover:underline text-[11px] font-normal flex items-center gap-1 cursor-pointer"
              >
                <Loader2 v-if="isTestingServer" class="w-3 h-3 animate-spin" />
                <span>{{ isTestingServer ? 'Testing...' : 'Test' }}</span>
              </button>
            </div>
          </label>

          <div class="relative">
            <input
              :value="authStore.baseUrl"
              type="text"
              readonly
              class="w-full bg-gray-100 dark:bg-[#0e1621]/60 border border-gray-300 dark:border-[#202b36] text-gray-600 dark:text-[#a0abb8] text-xs rounded-xl px-3.5 py-2.5 outline-none cursor-default select-all pr-8 font-mono"
            />
            <Lock class="w-3.5 h-3.5 text-[#7f91a4] absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          </div>

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
            class="flex items-center justify-between p-3 rounded-xl hover:bg-gray-100 dark:hover:bg-[#202b36] cursor-pointer transition-colors"
          >
            <div class="flex items-center gap-3">
              <Moon v-if="uiStore.theme === 'dark'" class="w-5 h-5 text-[#3390ec]" />
              <Sun v-else class="w-5 h-5 text-amber-500" />
              <span class="text-xs font-medium text-gray-800 dark:text-white">Night Mode</span>
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
            class="flex items-center justify-between p-3 rounded-xl hover:bg-gray-100 dark:hover:bg-[#202b36] cursor-pointer transition-colors"
          >
            <div class="flex items-center gap-3">
              <Volume2 v-if="soundEnabled" class="w-5 h-5 text-emerald-400" />
              <VolumeX v-else class="w-5 h-5 text-[#7f91a4]" />
              <span class="text-xs font-medium text-gray-800 dark:text-white">Sound Effects</span>
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

          <!-- Web Notifications -->
          <div
            @click="toggleNotifications"
            class="flex items-center justify-between p-3 rounded-xl hover:bg-gray-100 dark:hover:bg-[#202b36] cursor-pointer transition-colors"
          >
            <div class="flex items-center gap-3">
              <Bell v-if="notifEnabled && notifPermission === 'granted'" class="w-5 h-5 text-[#3390ec]" />
              <BellOff v-else class="w-5 h-5 text-[#7f91a4]" />
              <div>
                <span class="text-xs font-medium text-gray-800 dark:text-white block">Web Notifications</span>
                <span class="text-[10px] text-[#7f91a4] block">
                  {{ notifPermission === 'granted' ? (notifEnabled ? 'Enabled' : 'Disabled') : 'Click to enable desktop alerts' }}
                </span>
              </div>
            </div>
            <div
              class="w-9 h-5 rounded-full p-0.5 transition-colors"
              :class="notifEnabled && notifPermission === 'granted' ? 'bg-[#3390ec]' : 'bg-gray-500'"
            >
              <div
                class="w-4 h-4 rounded-full bg-white transition-transform"
                :class="notifEnabled && notifPermission === 'granted' ? 'translate-x-4' : 'translate-x-0'"
              ></div>
            </div>
          </div>

          <!-- Time Format (24h vs 12h) -->
          <div class="flex items-center justify-between p-3 rounded-xl hover:bg-gray-100 dark:hover:bg-[#202b36] transition-colors">
            <div class="flex items-center gap-3">
              <Clock class="w-5 h-5 text-[#3390ec]" />
              <div>
                <span class="text-xs font-medium text-gray-800 dark:text-white block">Time Format</span>
                <span class="text-[10px] text-[#7f91a4] block">Choose between 24-hour or 12-hour AM/PM clock</span>
              </div>
            </div>
            <div class="flex items-center bg-[#f1f1f1] dark:bg-[#101921] p-0.5 rounded-lg border border-[#dfe1e5]/60 dark:border-[#202b36]">
              <button
                @click="setTimeFormat('24h')"
                type="button"
                class="px-2.5 py-1 text-xs rounded-md font-medium transition-colors cursor-pointer"
                :class="userTimeFormat === '24h' ? 'bg-[#3390ec] text-white shadow-xs' : 'text-[#7f91a4] hover:text-gray-900 dark:hover:text-white'"
              >
                24-Hour
              </button>
              <button
                @click="setTimeFormat('12h')"
                type="button"
                class="px-2.5 py-1 text-xs rounded-md font-medium transition-colors cursor-pointer"
                :class="userTimeFormat === '12h' ? 'bg-[#3390ec] text-white shadow-xs' : 'text-[#7f91a4] hover:text-gray-900 dark:hover:text-white'"
              >
                12-Hour
              </button>
            </div>
          </div>

          <!-- Timezone -->
          <div class="flex items-center justify-between p-3 rounded-xl hover:bg-gray-100 dark:hover:bg-[#202b36] transition-colors">
            <div class="flex items-center gap-3">
              <Globe class="w-5 h-5 text-[#3390ec]" />
              <div>
                <span class="text-xs font-medium text-gray-800 dark:text-white block">Timezone</span>
                <span class="text-[10px] text-[#7f91a4] block">Active: {{ getEffectiveTimezone() }}</span>
              </div>
            </div>
            <select
              :value="userTimezone"
              @change="setTimezone(($event.target as HTMLSelectElement).value)"
              class="text-xs bg-[#f1f1f1] dark:bg-[#101921] text-gray-800 dark:text-white border border-[#dfe1e5]/60 dark:border-[#202b36] rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-[#3390ec] cursor-pointer"
            >
              <option value="">Auto ({{ getEffectiveTimezone() }})</option>
              <option value="Asia/Tehran">Tehran (UTC+03:30)</option>
              <option value="UTC">UTC (UTC+00:00)</option>
              <option value="Asia/Dubai">Dubai (UTC+04:00)</option>
              <option value="Europe/Istanbul">Istanbul (UTC+03:00)</option>
              <option value="Europe/London">London (UTC+00:00)</option>
              <option value="Europe/Berlin">Berlin (UTC+01:00)</option>
              <option value="America/New_York">New York (UTC-05:00)</option>
              <option value="America/Los_Angeles">Los Angeles (UTC-08:00)</option>
            </select>
          </div>
        </div>

        <!-- Section 3: Themes & Custom Animations -->
        <div class="space-y-4 pt-3 border-t border-gray-200 dark:border-[#202b36]">
          <div class="flex items-center justify-between">
            <div class="flex items-center gap-2">
              <Palette class="w-4 h-4 text-[#3390ec]" />
              <h4 class="text-xs font-semibold text-[#7f91a4] uppercase tracking-wider">Themes & Colors</h4>
            </div>
            <span class="text-[10px] text-emerald-400 font-medium bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20">
              Saved in Browser Storage
            </span>
          </div>

          <!-- Themes Grid -->
          <div class="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
            <button
              v-for="t in THEME_PRESETS"
              :key="t.id"
              @click="selectTheme(t.id)"
              type="button"
              class="relative flex flex-col p-2.5 rounded-xl border text-left transition-all group overflow-hidden cursor-pointer"
              :class="[
                uiStore.themeId === t.id
                  ? 'border-[#3390ec] ring-2 ring-[#3390ec]/30 shadow-lg bg-[#3390ec]/10 dark:bg-[#202b36]/40'
                  : 'border-gray-200 dark:border-[#202b36] hover:border-gray-500 bg-gray-50 dark:bg-black/15'
              ]"
            >
              <!-- Color Palette Miniature Preview -->
              <div
                class="w-full h-12 rounded-lg p-1.5 flex flex-col justify-between mb-2 shadow-inner border border-white/5 relative overflow-hidden"
                :style="{ backgroundColor: t.colors.bg }"
              >
                <!-- Mini simulated chat bar -->
                <div class="flex items-center justify-between text-[8px] opacity-80" :style="{ color: t.colors.text }">
                  <div class="w-8 h-1.5 rounded-full" :style="{ backgroundColor: t.colors.sidebar }"></div>
                  <div class="w-2 h-2 rounded-full" :style="{ backgroundColor: t.colors.accent }"></div>
                </div>

                <!-- Mini chat bubbles -->
                <div class="flex flex-col gap-1">
                  <!-- Incoming bubble -->
                  <div
                    class="w-14 h-2.5 rounded-sm px-1 flex items-center shadow-xs"
                    :style="{ backgroundColor: t.colors.bubbleIn }"
                  >
                    <div class="w-8 h-1 rounded-full opacity-60" :style="{ backgroundColor: t.colors.text }"></div>
                  </div>
                  <!-- Outgoing bubble -->
                  <div
                    class="w-12 h-2.5 rounded-sm px-1 self-end flex items-center justify-end shadow-xs"
                    :style="{ backgroundColor: t.colors.bubbleOut }"
                  >
                    <div class="w-6 h-1 rounded-full opacity-80 bg-white"></div>
                  </div>
                </div>

                <!-- Active checkmark badge -->
                <div
                  v-if="uiStore.themeId === t.id"
                  class="absolute top-1 right-1 w-4 h-4 rounded-full bg-[#3390ec] text-white flex items-center justify-center shadow"
                >
                  <Check class="w-2.5 h-2.5 stroke-[3]" />
                </div>
              </div>

              <!-- Theme Title & Description in English -->
              <div class="min-w-0">
                <div class="text-xs font-semibold text-gray-800 dark:text-white truncate">
                  {{ t.name }}
                </div>
                <div class="text-[10px] text-[#7f91a4] truncate mt-0.5 font-sans" :title="t.description">
                  {{ t.description }}
                </div>
              </div>
            </button>
          </div>

          <!-- Section 3.2: Custom Animations -->
          <div class="pt-3 space-y-2.5">
            <div class="flex items-center gap-2">
              <Zap class="w-4 h-4 text-amber-400" />
              <h5 class="text-xs font-semibold text-[#7f91a4] uppercase tracking-wider">Motion & Animations</h5>
            </div>

            <!-- Animation Presets Pills -->
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <div
                v-for="anim in ANIMATION_PRESETS"
                :key="anim.id"
                @click="selectAnimation(anim.id)"
                class="flex items-start gap-2.5 p-2.5 rounded-xl border transition-all cursor-pointer"
                :class="[
                  uiStore.animPreset === anim.id
                    ? 'border-[#3390ec] bg-[#3390ec]/15 shadow-sm'
                    : 'border-gray-200 dark:border-[#202b36] hover:border-gray-500 bg-gray-50 dark:bg-black/15'
                ]"
              >
                <!-- Radio Dot -->
                <div
                  class="w-4 h-4 rounded-full border flex items-center justify-center mt-0.5 shrink-0 transition-colors"
                  :class="[
                    uiStore.animPreset === anim.id
                      ? 'border-[#3390ec] bg-[#3390ec]'
                      : 'border-gray-500'
                  ]"
                >
                  <div v-if="uiStore.animPreset === anim.id" class="w-1.5 h-1.5 rounded-full bg-white"></div>
                </div>

                <div class="min-w-0">
                  <div class="text-xs font-semibold text-gray-800 dark:text-white flex items-center gap-1.5">
                    <span>{{ anim.name }}</span>
                  </div>
                  <p class="text-[10px] text-[#7f91a4] mt-0.5 leading-relaxed line-clamp-2">
                    {{ anim.description }}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Footer Buttons -->
      <div class="p-4 border-t border-[#dfe1e5] dark:border-[#202b36] flex items-center justify-end gap-3 bg-gray-50 dark:bg-[#0e1621]/30">
        <button
          @click="uiStore.showSettingsModal = false"
          class="px-4 py-2 text-xs text-[#7f91a4] hover:text-[#111827] dark:hover:text-white transition-colors"
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
