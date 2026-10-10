<script setup lang="ts">
import { ref } from 'vue'
import { useAuthStore } from '../../stores/auth'
import { Send, Server, Lock, Mail, CheckCircle2, AlertCircle, Loader2 } from 'lucide-vue-next'

const authStore = useAuthStore()

const serverUrl = ref(authStore.baseUrl)
const loginId = ref('asefg482@gmail.com')
const password = ref('a1206s1206')
const isTestingServer = ref(false)
const serverStatus = ref<{ ok: boolean; message: string } | null>(null)
const errorMsg = ref<string | null>(null)
const loading = ref(false)

async function testConnection() {
  if (!serverUrl.value.trim()) return
  isTestingServer.value = true
  serverStatus.value = null
  try {
    const clean = serverUrl.value.trim().replace(/\/+$/, '')
    authStore.setBaseUrl(clean)
    
    // Test with system ping
    const res = await fetch('/api/v4/system/ping', {
      headers: {
        'X-Mattermost-Server': clean
      }
    })
    if (res.ok) {
      serverStatus.value = { ok: true, message: 'Server is reachable & operational' }
    } else {
      serverStatus.value = { ok: false, message: `Server replied with HTTP ${res.status}` }
    }
  } catch (err: any) {
    serverStatus.value = { ok: false, message: err.message || 'Cannot reach server' }
  } finally {
    isTestingServer.value = false
  }
}

async function handleLogin() {
  if (!loginId.value || !password.value) {
    errorMsg.value = 'Please enter both login ID and password'
    return
  }

  errorMsg.value = null
  loading.value = true
  try {
    authStore.setBaseUrl(serverUrl.value)
    await authStore.login(loginId.value, password.value)
  } catch (err: any) {
    errorMsg.value = err.message || 'Login failed. Please check credentials or server URL.'
  } finally {
    loading.value = false
  }
}

function fillDemoCreds() {
  serverUrl.value = 'https://m.dornicadev.ir'
  loginId.value = 'asefg482@gmail.com'
  password.value = 'a1206s1206'
}
</script>

<template>
  <div class="min-h-screen w-full flex items-center justify-center p-4 bg-[#0e1621] relative overflow-hidden">
    <!-- Telegram Background Pattern -->
    <div class="absolute inset-0 opacity-10 bg-[radial-gradient(#2481cc_1px,transparent_1px)] [background-size:20px_20px] pointer-events-none"></div>

    <div class="w-full max-w-md z-10">
      <!-- Telegram Logo & Branding -->
      <div class="text-center mb-8">
        <div class="w-24 h-24 mx-auto mb-4 bg-gradient-to-tr from-[#2481cc] to-[#3ca0f0] rounded-full flex items-center justify-center shadow-xl shadow-[#2481cc]/25 transition-transform hover:scale-105 duration-300">
          <Send class="w-12 h-12 text-white -rotate-12 translate-x-0.5 -translate-y-0.5" />
        </div>
        <h1 class="text-2xl font-bold tracking-tight text-white mb-1">Mattergram</h1>
        <p class="text-sm text-[#7f91a4]">Mattermost client with full Telegram UI/UX</p>
      </div>

      <!-- Auth Card -->
      <div class="bg-[#17212b] border border-[#202b36] rounded-2xl p-6 shadow-2xl backdrop-blur-md">
        <!-- Error Alert -->
        <div v-if="errorMsg" class="mb-5 p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-xs flex items-start gap-2.5">
          <AlertCircle class="w-4 h-4 shrink-0 mt-0.5" />
          <span>{{ errorMsg }}</span>
        </div>

        <form @submit.prevent="handleLogin" class="space-y-4">
          <!-- Server Base URL Field -->
          <div>
            <label class="block text-xs font-medium text-[#7f91a4] mb-1.5 flex items-center justify-between">
              <span class="flex items-center gap-1.5">
                <Server class="w-3.5 h-3.5 text-[#2481cc]" />
                Mattermost Base URL
              </span>
              <button 
                type="button" 
                @click="testConnection" 
                class="text-[#3390ec] hover:underline text-[11px] flex items-center gap-1"
                :disabled="isTestingServer"
              >
                <Loader2 v-if="isTestingServer" class="w-3 h-3 animate-spin" />
                <span>{{ isTestingServer ? 'Testing...' : 'Test Connection' }}</span>
              </button>
            </label>
            <div class="relative">
              <input
                v-model="serverUrl"
                type="url"
                required
                placeholder="https://your-mattermost.com"
                class="w-full bg-[#0e1621] border border-[#202b36] focus:border-[#2481cc] focus:ring-1 focus:ring-[#2481cc] text-white text-sm rounded-xl px-3.5 py-2.5 outline-none transition-all"
              />
            </div>
            <!-- Server Connection Status -->
            <div v-if="serverStatus" class="mt-1.5 text-[11px] flex items-center gap-1.5" :class="serverStatus.ok ? 'text-emerald-400' : 'text-amber-400'">
              <CheckCircle2 v-if="serverStatus.ok" class="w-3.5 h-3.5" />
              <AlertCircle v-else class="w-3.5 h-3.5" />
              <span>{{ serverStatus.message }}</span>
            </div>
          </div>

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

        <!-- Quick Demo Fill -->
        <div class="mt-5 pt-4 border-t border-[#202b36] flex items-center justify-between text-xs text-[#7f91a4]">
          <span>Test Server Credentials:</span>
          <button
            type="button"
            @click="fillDemoCreds"
            class="text-[#3390ec] hover:text-[#52a6f5] font-medium transition-colors"
          >
            Fill Demo Info
          </button>
        </div>
      </div>

      <!-- Footer Info -->
      <p class="text-center text-xs text-[#7f91a4]/60 mt-6">
        Connected to Mattermost v4 REST &amp; WebSocket APIs
      </p>
    </div>
  </div>
</template>
