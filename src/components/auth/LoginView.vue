<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useAuthStore } from '../../stores/auth'
import { mmApi } from '../../services/mattermostApi'
import { notificationService } from '../../services/notifications'
import { Lock, Mail, AlertCircle, Loader2, Github, Star } from 'lucide-vue-next'

const router = useRouter()
const route = useRoute()
const authStore = useAuthStore()

const loginId = ref('')
const password = ref('')
const errorMsg = ref<string | null>(null)
const loading = ref(false)

// Server branding fetched from Mattermost settings
const brandImageUrl = ref<string | null>(null)
const siteName = ref<string>('Mattermost')
const customDescription = ref<string>('')
const isLoadingBrand = ref(true)

const serverHostName = computed(() => {
  const current = authStore.baseUrl || mmApi.getBaseUrl()
  if (!current) return 'Server not configured in .env'
  try {
    const u = new URL(current)
    return u.host
  } catch {
    return current
  }
})

async function fetchServerBrand() {
  const currentBase = authStore.baseUrl || mmApi.getBaseUrl()
  if (!currentBase) {
    isLoadingBrand.value = false
    return
  }
  isLoadingBrand.value = true

  // 1. Fetch site name & description from client config
  try {
    const configUrl = mmApi.resolveEndpoint('/api/v4/config/client?format=old')
    const configRes = await fetch(configUrl, {
      headers: { 'X-Mattermost-Server': currentBase }
    })
    if (configRes.ok) {
      const cfg = await configRes.json()
      if (cfg.SiteName) siteName.value = cfg.SiteName
      if (cfg.CustomDescriptionText) customDescription.value = cfg.CustomDescriptionText
    }
  } catch {}

  // 2. Fetch custom brand image from Mattermost server settings (/api/v4/brand/image)
  try {
    const brandUrl = mmApi.resolveEndpoint('/api/v4/brand/image')
    const brandRes = await fetch(brandUrl, {
      headers: { 'X-Mattermost-Server': currentBase }
    })
    if (brandRes.ok) {
      const blob = await brandRes.blob()
      if (blob.type.startsWith('image/')) {
        brandImageUrl.value = URL.createObjectURL(blob)
      }
    }
  } catch {} finally {
    isLoadingBrand.value = false
  }
}

onMounted(() => {
  fetchServerBrand()
})

async function handleLogin() {
  const currentBase = authStore.baseUrl || mmApi.getBaseUrl()
  if (!currentBase) {
    errorMsg.value = 'Mattermost server URL is not configured. Please set MATTERMOST_BASE_URL in your .env file.'
    return
  }

  if (!loginId.value || !password.value) {
    errorMsg.value = 'Please enter both login ID and password'
    return
  }

  errorMsg.value = null
  loading.value = true
  try {
    await authStore.login(loginId.value, password.value)
    notificationService.autoRequestPermissionOnFirstOpen()
    const redirect = (route.query.redirect as string) || '/'
    router.replace(redirect)
  } catch (err: any) {
    errorMsg.value = err.message || 'Login failed. Please check credentials or server connection.'
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="min-h-screen w-full flex items-center justify-center p-4 bg-[#0e1621] relative overflow-hidden">
    <!-- Telegram Background Pattern -->
    <div class="absolute inset-0 opacity-10 bg-[radial-gradient(#2481cc_1px,transparent_1px)] [background-size:20px_20px] pointer-events-none"></div>

    <div class="w-full max-w-md z-10">
      <!-- Mattermost Official Logo & Branding from Server Settings -->
      <div class="text-center mb-8">
        <!-- Custom Brand Image from Mattermost Settings -->
        <div v-if="brandImageUrl" class="mb-4 flex items-center justify-center">
          <img
            :src="brandImageUrl"
            :alt="siteName"
            class="max-h-24 max-w-[260px] object-contain drop-shadow-xl rounded-xl transition-transform hover:scale-105 duration-300"
          />
        </div>

        <!-- Official Mattermost Brand Compass Icon (if custom brand image not configured) -->
        <div
          v-else
          class="w-24 h-24 mx-auto mb-4 bg-gradient-to-tr from-[#1c58d9] to-[#0058cc] rounded-3xl flex items-center justify-center shadow-xl shadow-[#1c58d9]/30 transition-transform hover:scale-105 duration-300 border border-white/10"
        >
          <svg class="w-14 h-14 text-white" viewBox="0 0 104 104" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
            <circle r="52" cx="52" cy="52" fill="none"/>
            <g transform="translate(54,46)">
              <g transform="translate(-15,-42)">
                <path d="M29.9539 1.4977C29.9539 0.670968 29.2827 0 28.4562 0C27.9597 0 27.5192 0.242028 27.2468 0.614415C27.216 0.656555 27.1873 0.700359 27.1609 0.745666L3.66519 32.1191C1.38202 34.7479 0 38.1803 0 41.9355C0 50.207 6.70541 56.9124 14.977 56.9124C23.2485 56.9124 29.9539 50.207 29.9539 41.9355L29.9539 41.9013V1.50252C29.9539 1.50091 29.9539 1.49931 29.9539 1.4977Z" fill="white"/>
              </g>
            </g>
          </svg>
        </div>

        <h1 class="text-2xl font-bold tracking-tight text-white mb-1">
          {{ siteName || 'Mattermost' }}
        </h1>
        <p class="text-sm text-[#7f91a4]">
          {{ customDescription || 'Mattermost client with full Telegram UI/UX' }}
        </p>
      </div>

      <!-- Auth Card -->
      <div class="bg-[#17212b] border border-[#202b36] rounded-2xl p-6 shadow-2xl backdrop-blur-md">
        <!-- Error Alert -->
        <div v-if="errorMsg" class="mb-5 p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-xs flex items-start gap-2.5">
          <AlertCircle class="w-4 h-4 shrink-0 mt-0.5" />
          <span>{{ errorMsg }}</span>
        </div>

        <form @submit.prevent="handleLogin" class="space-y-4">
          <!-- Login ID (Username or Email) -->
          <div>
            <label class="block text-xs font-medium text-[#7f91a4] mb-1.5 flex items-center gap-1.5">
              <Mail class="w-3.5 h-3.5 text-[#2481cc]" />
              Username or Email
            </label>
            <input
              v-model="loginId"
              type="text"
              required
              autocomplete="username"
              placeholder="e.g. username or email@domain.com"
              class="w-full bg-[#0e1621] border border-[#202b36] focus:border-[#2481cc] focus:ring-1 focus:ring-[#2481cc] text-white text-sm rounded-xl px-3.5 py-2.5 outline-none transition-all"
            />
          </div>

          <!-- Password -->
          <div>
            <label class="block text-xs font-medium text-[#7f91a4] mb-1.5 flex items-center gap-1.5">
              <Lock class="w-3.5 h-3.5 text-[#2481cc]" />
              Password
            </label>
            <input
              v-model="password"
              type="password"
              required
              autocomplete="current-password"
              placeholder="••••••••••••"
              class="w-full bg-[#0e1621] border border-[#202b36] focus:border-[#2481cc] focus:ring-1 focus:ring-[#2481cc] text-white text-sm rounded-xl px-3.5 py-2.5 outline-none transition-all"
            />
          </div>

          <!-- Submit Button -->
          <button
            type="submit"
            :disabled="loading"
            class="w-full mt-2 py-3 px-4 bg-[#2481cc] hover:bg-[#1d73b8] active:scale-[0.99] text-white font-medium text-sm rounded-xl shadow-lg shadow-[#2481cc]/20 flex items-center justify-center gap-2 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Loader2 v-if="loading" class="w-4 h-4 animate-spin" />
            <span>{{ loading ? 'Connecting...' : 'LOG IN' }}</span>
          </button>
        </form>

        <!-- Server Host Indicator -->
        <div class="mt-5 pt-4 border-t border-[#202b36] flex items-center justify-center text-xs text-[#7f91a4]">
          <div class="flex items-center gap-1.5 min-w-0">
            <span class="w-2 h-2 rounded-full bg-emerald-400 shrink-0 animate-pulse"></span>
            <span class="truncate text-[11px] text-[#7f91a4]/90" :title="authStore.baseUrl">
              {{ serverHostName }}
            </span>
          </div>
        </div>
      </div>

      <!-- Minimal Open Source & GitHub Star Badge -->
      <div class="mt-5 flex flex-col items-center gap-2">
        <a
          href="https://github.com/asefg482/mattergram"
          target="_blank"
          rel="noopener noreferrer"
          class="group inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-[#17212b]/80 hover:bg-[#202b36] border border-[#202b36] hover:border-[#3390ec]/40 text-[#7f91a4] hover:text-white text-xs transition-all duration-200 shadow-sm"
        >
          <Github class="w-3.5 h-3.5 text-[#7f91a4] group-hover:text-white transition-colors" />
          <span class="text-[11px] font-medium">Open Source</span>
          <span class="w-1 h-1 rounded-full bg-[#7f91a4]/40"></span>
          <span class="inline-flex items-center gap-1 text-[#3390ec] group-hover:text-[#52a6f5] text-[11px] font-medium">
            <Star class="w-3 h-3 text-amber-400 fill-amber-400/20 group-hover:fill-amber-400 transition-colors" />
            Star on GitHub
          </span>
        </a>

        <p class="text-center text-[11px] text-[#7f91a4]/50">
          Connected to Mattermost v4 REST &amp; WebSocket APIs
        </p>
      </div>
    </div>
  </div>
</template>
