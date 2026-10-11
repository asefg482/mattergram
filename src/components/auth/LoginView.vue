<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useAuthStore } from '../../stores/auth'
import { mmApi } from '../../services/mattermostApi'
import { notificationService } from '../../services/notifications'
import { Lock, Mail, AlertCircle, Loader2, Github, Star, User, AtSign, UserPlus, LogIn } from 'lucide-vue-next'

const router = useRouter()
const route = useRoute()
const authStore = useAuthStore()

// Auth mode: 'login' or 'register'
const authMode = ref<'login' | 'register'>('login')
const canSignUp = ref(false)
const passwordMinLength = ref(8)

// Login form state
const loginId = ref('')
const password = ref('')

// Registration form state
const regEmail = ref('')
const regUsername = ref('')
const regFullName = ref('')
const regPassword = ref('')

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

  // 1. Fetch site name, description & signup availability from client config
  try {
    const configUrl = mmApi.resolveEndpoint('/api/v4/config/client?format=old')
    const configRes = await fetch(configUrl, {
      headers: { 'X-Mattermost-Server': currentBase }
    })
    if (configRes.ok) {
      const cfg = await configRes.json()
      if (cfg.SiteName) siteName.value = cfg.SiteName
      if (cfg.CustomDescriptionText) customDescription.value = cfg.CustomDescriptionText

      // Check registration capability on Mattermost server
      const isNoAccounts = cfg.NoAccounts === 'true'
      const isOpenServer = cfg.EnableOpenServer === 'true'
      const isSignUpWithEmail = cfg.EnableSignUpWithEmail === 'true'
      const isUserCreation = cfg.EnableUserCreation !== 'false'

      // In Mattermost, public signup without an invite token is only available when:
      // 1. User creation is not globally disabled (EnableUserCreation != false)
      // 2. Open server signup is enabled (EnableOpenServer == true)
      // 3. Email signup is enabled (EnableSignUpWithEmail == true)
      // OR NoAccounts == true (initial administrator setup on a new server)
      const isAllowed = isNoAccounts || (isOpenServer && isSignUpWithEmail && isUserCreation)
      canSignUp.value = isAllowed
      if (!isAllowed && authMode.value === 'register') {
        authMode.value = 'login'
      }

      if (cfg.PasswordMinimumLength) {
        passwordMinLength.value = parseInt(cfg.PasswordMinimumLength, 10) || 8
      }
    } else {
      canSignUp.value = false
      authMode.value = 'login'
    }
  } catch {
    canSignUp.value = false
    authMode.value = 'login'
  }

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

async function handleRegister() {
  if (!canSignUp.value) {
    errorMsg.value = 'User registration is not enabled on this server.'
    authMode.value = 'login'
    return
  }

  const currentBase = authStore.baseUrl || mmApi.getBaseUrl()
  if (!currentBase) {
    errorMsg.value = 'Mattermost server URL is not configured. Please set MATTERMOST_BASE_URL in your .env file.'
    return
  }

  const email = regEmail.value.trim().toLowerCase()
  const username = regUsername.value.trim().toLowerCase()
  const pass = regPassword.value

  if (!email || !username || !pass) {
    errorMsg.value = 'Please fill in all required fields (Email, Username, and Password).'
    return
  }

  // Validate email format
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  if (!emailRegex.test(email)) {
    errorMsg.value = 'Please enter a valid email address.'
    return
  }

  // Validate username format: 3-22 chars, starts with a letter, lowercase alphanumeric or . - _
  const usernameRegex = /^[a-z][a-z0-9.\-_]{2,21}$/
  if (!usernameRegex.test(username)) {
    errorMsg.value = 'Username must be 3-22 characters, start with a letter, and contain only lowercase letters, numbers, and . - _'
    return
  }

  if (pass.length < passwordMinLength.value) {
    errorMsg.value = `Password must be at least ${passwordMinLength.value} characters long.`
    return
  }

  // Parse optional full name into first and last name
  let firstName = ''
  let lastName = ''
  if (regFullName.value.trim()) {
    const parts = regFullName.value.trim().split(/\s+/)
    firstName = parts[0] || ''
    lastName = parts.slice(1).join(' ') || ''
  }

  errorMsg.value = null
  loading.value = true
  try {
    await authStore.register({
      email,
      username,
      password: pass,
      first_name: firstName,
      last_name: lastName
    })
    notificationService.autoRequestPermissionOnFirstOpen()
    const redirect = (route.query.redirect as string) || '/'
    router.replace(redirect)
  } catch (err: any) {
    errorMsg.value = err.message || 'Registration failed. Please check your information or server settings.'
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div
    class="min-h-screen w-full flex items-center justify-center px-4 bg-[#e4ecf2] dark:bg-[#0e1621] relative overflow-hidden transition-colors"
    style="padding-top: calc(1rem + env(safe-area-inset-top, 0px)); padding-bottom: calc(1rem + env(safe-area-inset-bottom, 0px));"
  >
    <!-- Telegram Background Pattern -->
    <div class="absolute inset-0 opacity-10 bg-[radial-gradient(#2481cc_1px,transparent_1px)] [background-size:20px_20px] pointer-events-none"></div>

    <div class="w-full max-w-md z-10 my-6">
      <!-- Mattermost Official Logo & Branding from Server Settings -->
      <div class="text-center mb-6">
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
          class="w-20 h-20 mx-auto mb-4 bg-gradient-to-tr from-[#1c58d9] to-[#0058cc] rounded-3xl flex items-center justify-center shadow-xl shadow-[#1c58d9]/30 transition-transform hover:scale-105 duration-300 border border-white/10"
        >
          <svg class="w-12 h-12 text-white" viewBox="0 0 104 104" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
            <circle r="52" cx="52" cy="52" fill="none"/>
            <g transform="translate(54,46)">
              <g transform="translate(-15,-42)">
                <path d="M29.9539 1.4977C29.9539 0.670968 29.2827 0 28.4562 0C27.9597 0 27.5192 0.242028 27.2468 0.614415C27.216 0.656555 27.1873 0.700359 27.1609 0.745666L3.66519 32.1191C1.38202 34.7479 0 38.1803 0 41.9355C0 50.207 6.70541 56.9124 14.977 56.9124C23.2485 56.9124 29.9539 50.207 29.9539 41.9355L29.9539 41.9013V1.50252C29.9539 1.50091 29.9539 1.49931 29.9539 1.4977Z" fill="white"/>
              </g>
            </g>
          </svg>
        </div>

        <h1 class="text-2xl font-bold tracking-tight text-gray-900 dark:text-white mb-1">
          {{ siteName || 'Mattermost' }}
        </h1>
        <p class="text-xs sm:text-sm text-[#7f91a4]">
          {{ customDescription || 'Mattermost client with Telegram UI/UX' }}
        </p>
      </div>

      <!-- Auth Card -->
      <div class="bg-white dark:bg-[#17212b] border border-[#dfe1e5] dark:border-[#202b36] rounded-2xl p-6 shadow-2xl backdrop-blur-md transition-colors">
        <!-- Segmented Tab Switcher (Visible when registration is supported by server) -->
        <div v-if="canSignUp" class="flex p-1 mb-5 bg-[#f4f4f5] dark:bg-[#0e1621]/60 rounded-xl border border-[#dfe1e5] dark:border-[#202b36]">
          <button
            type="button"
            @click="authMode = 'login'; errorMsg = null"
            class="flex-1 py-2 text-xs font-semibold rounded-lg transition-all flex items-center justify-center gap-1.5 cursor-pointer"
            :class="authMode === 'login' ? 'bg-white dark:bg-[#242f3d] text-[#111827] dark:text-white shadow-xs' : 'text-[#7f91a4] hover:text-[#111827] dark:hover:text-white'"
          >
            <LogIn class="w-3.5 h-3.5" />
            <span>Log In</span>
          </button>
          <button
            type="button"
            @click="authMode = 'register'; errorMsg = null"
            class="flex-1 py-2 text-xs font-semibold rounded-lg transition-all flex items-center justify-center gap-1.5 cursor-pointer"
            :class="authMode === 'register' ? 'bg-white dark:bg-[#242f3d] text-[#111827] dark:text-white shadow-xs' : 'text-[#7f91a4] hover:text-[#111827] dark:hover:text-white'"
          >
            <UserPlus class="w-3.5 h-3.5" />
            <span>Sign Up</span>
          </button>
        </div>

        <!-- Error Alert -->
        <div v-if="errorMsg" class="mb-5 p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-500 dark:text-red-400 text-xs flex items-start gap-2.5">
          <AlertCircle class="w-4 h-4 shrink-0 mt-0.5" />
          <span>{{ errorMsg }}</span>
        </div>

        <!-- FORM 1: LOG IN -->
        <form v-if="authMode === 'login' || !canSignUp" @submit.prevent="handleLogin" class="space-y-4">
          <!-- Login ID (Username or Email) -->
          <div>
            <label class="block text-xs font-medium text-[#7f91a4] mb-1.5 flex items-center gap-1.5">
              <Mail class="w-3.5 h-3.5 text-[#2481cc]" />
              <span>Username or Email</span>
            </label>
            <input
              v-model="loginId"
              type="text"
              required
              autocomplete="username"
              placeholder="e.g. username or email@domain.com"
              class="w-full bg-[#f4f4f5] dark:bg-[#0e1621] border border-[#dfe1e5] dark:border-[#202b36] focus:border-[#2481cc] focus:ring-1 focus:ring-[#2481cc] text-[#111827] dark:text-white placeholder-[#7f91a4] text-sm rounded-xl px-3.5 py-2.5 outline-none transition-all"
            />
          </div>

          <!-- Password -->
          <div>
            <label class="block text-xs font-medium text-[#7f91a4] mb-1.5 flex items-center gap-1.5">
              <Lock class="w-3.5 h-3.5 text-[#2481cc]" />
              <span>Password</span>
            </label>
            <input
              v-model="password"
              type="password"
              required
              autocomplete="current-password"
              placeholder="••••••••••••"
              class="w-full bg-[#f4f4f5] dark:bg-[#0e1621] border border-[#dfe1e5] dark:border-[#202b36] focus:border-[#2481cc] focus:ring-1 focus:ring-[#2481cc] text-[#111827] dark:text-white placeholder-[#7f91a4] text-sm rounded-xl px-3.5 py-2.5 outline-none transition-all"
            />
          </div>

          <!-- Submit Button -->
          <button
            type="submit"
            :disabled="loading"
            class="w-full mt-2 py-3 px-4 bg-[#2481cc] hover:bg-[#1d73b8] active:scale-[0.99] text-white font-medium text-sm rounded-xl shadow-lg shadow-[#2481cc]/20 flex items-center justify-center gap-2 transition-all disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
          >
            <Loader2 v-if="loading" class="w-4 h-4 animate-spin" />
            <span>{{ loading ? 'Connecting...' : 'LOG IN' }}</span>
          </button>

          <!-- Toggle to Register if allowed -->
          <div v-if="canSignUp" class="mt-4 text-center text-xs text-[#7f91a4]">
            <span>Don't have an account? </span>
            <button
              type="button"
              @click="authMode = 'register'; errorMsg = null"
              class="text-[#3390ec] font-semibold hover:underline cursor-pointer"
            >
              Sign Up
            </button>
          </div>
        </form>

        <!-- FORM 2: SIGN UP / REGISTRATION -->
        <form v-else-if="canSignUp && authMode === 'register'" @submit.prevent="handleRegister" class="space-y-3.5">
          <!-- Email -->
          <div>
            <label class="block text-xs font-medium text-[#7f91a4] mb-1 flex items-center gap-1.5">
              <Mail class="w-3.5 h-3.5 text-[#2481cc]" />
              <span>Email Address</span>
              <span class="text-red-400">*</span>
            </label>
            <input
              v-model="regEmail"
              type="email"
              required
              autocomplete="email"
              placeholder="user@example.com"
              class="w-full bg-[#f4f4f5] dark:bg-[#0e1621] border border-[#dfe1e5] dark:border-[#202b36] focus:border-[#2481cc] focus:ring-1 focus:ring-[#2481cc] text-[#111827] dark:text-white placeholder-[#7f91a4] text-sm rounded-xl px-3.5 py-2 outline-none transition-all"
            />
          </div>

          <!-- Username -->
          <div>
            <div class="flex items-center justify-between mb-1">
              <label class="text-xs font-medium text-[#7f91a4] flex items-center gap-1.5">
                <AtSign class="w-3.5 h-3.5 text-[#2481cc]" />
                <span>Username</span>
                <span class="text-red-400">*</span>
              </label>
              <span class="text-[10px] text-[#7f91a4]/75">3-22 lowercase chars</span>
            </div>
            <input
              v-model="regUsername"
              type="text"
              required
              autocomplete="username"
              placeholder="e.g. johndoe"
              class="w-full bg-[#f4f4f5] dark:bg-[#0e1621] border border-[#dfe1e5] dark:border-[#202b36] focus:border-[#2481cc] focus:ring-1 focus:ring-[#2481cc] text-[#111827] dark:text-white placeholder-[#7f91a4] text-sm rounded-xl px-3.5 py-2 outline-none transition-all lowercase"
            />
          </div>

          <!-- Full Name (Optional) -->
          <div>
            <label class="block text-xs font-medium text-[#7f91a4] mb-1 flex items-center gap-1.5">
              <User class="w-3.5 h-3.5 text-[#2481cc]" />
              <span>Full Name</span>
              <span class="text-[10px] text-[#7f91a4]/75 font-normal">(Optional)</span>
            </label>
            <input
              v-model="regFullName"
              type="text"
              autocomplete="name"
              placeholder="e.g. John Doe"
              class="w-full bg-[#f4f4f5] dark:bg-[#0e1621] border border-[#dfe1e5] dark:border-[#202b36] focus:border-[#2481cc] focus:ring-1 focus:ring-[#2481cc] text-[#111827] dark:text-white placeholder-[#7f91a4] text-sm rounded-xl px-3.5 py-2 outline-none transition-all"
            />
          </div>

          <!-- Password -->
          <div>
            <div class="flex items-center justify-between mb-1">
              <label class="text-xs font-medium text-[#7f91a4] flex items-center gap-1.5">
                <Lock class="w-3.5 h-3.5 text-[#2481cc]" />
                <span>Password</span>
                <span class="text-red-400">*</span>
              </label>
              <span class="text-[10px] text-[#7f91a4]/75">Min {{ passwordMinLength }} chars</span>
            </div>
            <input
              v-model="regPassword"
              type="password"
              required
              autocomplete="new-password"
              :placeholder="`At least ${passwordMinLength} characters`"
              class="w-full bg-[#f4f4f5] dark:bg-[#0e1621] border border-[#dfe1e5] dark:border-[#202b36] focus:border-[#2481cc] focus:ring-1 focus:ring-[#2481cc] text-[#111827] dark:text-white placeholder-[#7f91a4] text-sm rounded-xl px-3.5 py-2 outline-none transition-all"
            />
          </div>

          <!-- Submit Button -->
          <button
            type="submit"
            :disabled="loading"
            class="w-full mt-2 py-3 px-4 bg-[#3390ec] hover:bg-[#2481cc] active:scale-[0.99] text-white font-medium text-sm rounded-xl shadow-lg shadow-[#3390ec]/20 flex items-center justify-center gap-2 transition-all disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
          >
            <Loader2 v-if="loading" class="w-4 h-4 animate-spin" />
            <span>{{ loading ? 'Creating account...' : 'CREATE ACCOUNT' }}</span>
          </button>

          <!-- Toggle back to Login -->
          <div class="mt-4 text-center text-xs text-[#7f91a4]">
            <span>Already have an account? </span>
            <button
              type="button"
              @click="authMode = 'login'; errorMsg = null"
              class="text-[#3390ec] font-semibold hover:underline cursor-pointer"
            >
              Log In
            </button>
          </div>
        </form>

        <!-- Server Host Indicator -->
        <div class="mt-5 pt-4 border-t border-[#dfe1e5] dark:border-[#202b36] flex items-center justify-center text-xs text-[#7f91a4]">
          <div class="flex items-center gap-1.5 min-w-0">
            <span class="w-2 h-2 rounded-full bg-emerald-400 shrink-0 animate-pulse"></span>
            <span class="truncate text-[11px] text-[#7f91a4]/90" :title="authStore.baseUrl">
              {{ serverHostName }}
            </span>
            <span v-if="canSignUp" class="ml-1 text-[10px] bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 font-medium px-1.5 py-0.5 rounded">
              Registration Open
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
          class="group inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-white/80 dark:bg-[#17212b]/80 hover:bg-gray-100 dark:hover:bg-[#202b36] border border-[#dfe1e5] dark:border-[#202b36] hover:border-[#3390ec]/40 text-[#7f91a4] hover:text-[#111827] dark:hover:text-white text-xs transition-all duration-200 shadow-sm"
        >
          <Github class="w-3.5 h-3.5 text-[#7f91a4] group-hover:text-[#111827] dark:group-hover:text-white transition-colors" />
          <span class="text-[11px] font-medium">Open Source</span>
          <span class="w-1 h-1 rounded-full bg-[#7f91a4]/40"></span>
          <span class="inline-flex items-center gap-1 text-[#3390ec] group-hover:text-[#52a6f5] text-[11px] font-medium">
            <Star class="w-3 h-3 text-amber-400 fill-amber-400/20 group-hover:fill-amber-400 transition-colors" />
            Star on GitHub
          </span>
        </a>

        <p class="text-center text-[11px] text-[#7f91a4]/60">
          Connected to Mattermost v4 REST &amp; WebSocket APIs
        </p>
      </div>
    </div>
  </div>
</template>
