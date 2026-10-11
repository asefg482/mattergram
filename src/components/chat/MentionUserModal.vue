<script setup lang="ts">
import { ref, computed } from 'vue'
import { useRouter } from 'vue-router'
import { useUiStore } from '../../stores/ui'
import { useChatStore } from '../../stores/chat'
import { useUsersStore } from '../../stores/users'
import { mmApi } from '../../services/mattermostApi'
import TelegramAvatar from '../common/TelegramAvatar.vue'
import {
  UserX,
  Loader2,
  X,
  Radio,
  Send,
  ZoomIn,
  Copy,
  Check,
  Shield
} from 'lucide-vue-next'

const router = useRouter()
const uiStore = useUiStore()
const chatStore = useChatStore()
const usersStore = useUsersStore()

const modal = computed(() => uiStore.mentionModal)
const user = computed(() => modal.value.user)

const isOnline = computed(() => {
  if (!user.value) return false
  return usersStore.getStatus(user.value.id) === 'online'
})

const displayName = computed(() => {
  if (!user.value) return ''
  return usersStore.getUserDisplayName(user.value)
})

const copiedField = ref<string | null>(null)

function copyToClipboard(text: string, field: string) {
  navigator.clipboard.writeText(text)
  copiedField.value = field
  setTimeout(() => {
    copiedField.value = null
  }, 2000)
}

function enlargeAvatar() {
  if (!user.value) return
  const url = mmApi.getUserAvatarUrl(user.value.id, (user.value as any)?.last_picture_update)
  uiStore.openAvatarPreview(url, displayName.value, user.value.id)
}

function close() {
  uiStore.closeMentionModal()
}

async function startChat() {
  if (!user.value) return
  close()
  await chatStore.openDirectMessage(user.value.id)
  if (window.innerWidth < 768) {
    uiStore.isMobileSidebarOpen = false
  }
  if (chatStore.activeChannelId) {
    router.push(`/c/${chatStore.activeChannelId}`)
  }
}
</script>

<template>
  <div
    v-if="modal.isOpen"
    class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs select-none animate-in fade-in duration-150"
    @click.self="close"
  >
    <div
      class="w-full max-w-sm bg-[#17212b] dark:bg-[#17212b] bg-white text-[#f5f5f5] dark:text-[#f5f5f5] text-[#111827] rounded-3xl p-6 shadow-2xl border border-[#202b36] dark:border-[#202b36] border-[#dfe1e5] relative animate-in zoom-in-95 duration-150"
    >
      <!-- Close Button -->
      <button
        @click="close"
        class="absolute top-4 right-4 p-1.5 text-[#7f91a4] hover:text-white rounded-full hover:bg-[#202b36] transition-colors"
      >
        <X class="w-5 h-5" />
      </button>

      <!-- 1. LOADING STATE -->
      <div v-if="modal.type === 'loading'" class="flex flex-col items-center justify-center py-8 text-center">
        <Loader2 class="w-10 h-10 animate-spin text-[#3390ec] mb-4" />
        <h3 class="text-sm font-semibold mb-1">Searching for user...</h3>
        <p class="text-xs text-[#7f91a4]">@{{ modal.username }}</p>
      </div>

      <!-- 2. BROADCAST TAG (e.g. @all, @channel, @here) -->
      <div v-else-if="modal.type === 'broadcast'" class="flex flex-col items-center text-center">
        <div class="w-16 h-16 rounded-full bg-amber-500/20 text-amber-400 flex items-center justify-center mb-4">
          <Radio class="w-8 h-8" />
        </div>

        <h3 class="text-base font-bold mb-1">
          Broadcast Mention (@{{ modal.username }})
        </h3>

        <p class="text-xs text-[#7f91a4] leading-relaxed my-3 px-2">
          This handle broadcasts notifications to all channel members and is not a personal user account.
        </p>

        <button
          @click="close"
          class="w-full mt-2 py-2.5 px-4 bg-[#242f3d] dark:bg-[#242f3d] bg-[#f4f4f5] hover:bg-[#202b36] text-white dark:text-white text-[#111827] font-medium text-xs rounded-2xl transition-all"
        >
          Got it
        </button>
      </div>

      <!-- 3. USER NOT FOUND -->
      <div v-else-if="modal.type === 'not_found'" class="flex flex-col items-center text-center">
        <div class="w-16 h-16 rounded-full bg-rose-500/20 text-rose-400 flex items-center justify-center mb-4">
          <UserX class="w-8 h-8" />
        </div>

        <h3 class="text-base font-bold mb-1">
          User Not Found
        </h3>

        <p class="text-xs text-[#7f91a4] leading-relaxed my-3 px-2">
          No user found with username <span class="text-[#3390ec] font-semibold">@{{ modal.username }}</span> on this server.
        </p>

        <button
          @click="close"
          class="w-full mt-2 py-2.5 px-4 bg-[#242f3d] dark:bg-[#242f3d] bg-[#f4f4f5] hover:bg-[#202b36] text-white dark:text-white text-[#111827] font-medium text-xs rounded-2xl transition-all"
        >
          Close
        </button>
      </div>

      <!-- 4. FULL USER PROFILE -->
      <div v-else-if="modal.type === 'user' && user" class="flex flex-col items-center">
        <!-- Avatar with Enlarge Zoom Effect -->
        <div
          @click="enlargeAvatar"
          class="relative group cursor-pointer mb-3 rounded-full"
          title="Click to enlarge photo"
        >
          <TelegramAvatar
            :userId="user.id"
            :name="displayName"
            size="2xl"
            :showOnlineDot="true"
            :isOnline="isOnline"
            :lastPictureUpdate="(user as any)?.last_picture_update"
          />
          <div class="absolute inset-0 rounded-full bg-black/45 opacity-0 group-hover:opacity-100 flex items-center justify-center text-white transition-opacity">
            <ZoomIn class="w-6 h-6" />
          </div>
        </div>

        <!-- Name & Status -->
        <h3 class="text-base font-bold truncate max-w-full text-center">
          {{ displayName }}
        </h3>
        <p class="text-xs mt-0.5 text-center">
          <span v-if="isOnline" class="text-emerald-400 font-semibold">Online</span>
          <span v-else class="text-[#7f91a4]">Last seen recently</span>
        </p>

        <!-- Role Badge -->
        <span
          v-if="user.roles?.includes('system_admin')"
          class="mt-1.5 text-[10px] px-2 py-0.5 rounded-full bg-[#3390ec]/20 text-[#3390ec] font-semibold flex items-center gap-1"
        >
          <Shield class="w-3 h-3" />
          <span>System Admin</span>
        </span>

        <!-- Profile Details List -->
        <div class="w-full mt-4 space-y-2.5 bg-[#0e1621]/40 rounded-2xl p-3 border border-[#202b36]">
          <!-- Username Row -->
          <div class="flex items-center justify-between text-xs">
            <span class="text-[#7f91a4]">Username</span>
            <div class="flex items-center gap-1.5">
              <span class="text-[#3390ec] font-semibold">@{{ user.username }}</span>
              <button
                @click="copyToClipboard(user.username, 'username')"
                class="p-1 text-[#7f91a4] hover:text-white rounded transition-colors"
                title="Copy username"
              >
                <Check v-if="copiedField === 'username'" class="w-3.5 h-3.5 text-emerald-400" />
                <Copy v-else class="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          <!-- Position / Bio (if available) -->
          <div v-if="user.position" class="flex items-center justify-between text-xs">
            <span class="text-[#7f91a4]">Position / Bio</span>
            <span class="text-white font-medium truncate max-w-[180px]">{{ user.position }}</span>
          </div>

          <!-- Email (if available) -->
          <div v-if="user.email" class="flex items-center justify-between text-xs">
            <span class="text-[#7f91a4]">Email</span>
            <div class="flex items-center gap-1.5">
              <span class="text-white/90 truncate max-w-[150px]">{{ user.email }}</span>
              <button
                @click="copyToClipboard(user.email, 'email')"
                class="p-1 text-[#7f91a4] hover:text-white rounded transition-colors"
                title="Copy email"
              >
                <Check v-if="copiedField === 'email'" class="w-3.5 h-3.5 text-emerald-400" />
                <Copy v-else class="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          <!-- Nickname (if available) -->
          <div v-if="user.nickname" class="flex items-center justify-between text-xs">
            <span class="text-[#7f91a4]">Nickname</span>
            <span class="text-white font-medium">{{ user.nickname }}</span>
          </div>
        </div>

        <!-- Buttons Row -->
        <div class="flex items-center gap-2 w-full mt-4">
          <!-- Enlarge Photo Button -->
          <button
            @click="enlargeAvatar"
            class="py-2.5 px-3 rounded-2xl border border-[#202b36] hover:bg-[#202b36] text-xs font-medium text-[#7f91a4] hover:text-white transition-all flex items-center justify-center gap-1.5 shrink-0"
            title="Enlarge profile photo"
          >
            <ZoomIn class="w-3.5 h-3.5" />
            <span>Enlarge photo</span>
          </button>

          <!-- Start Chat Button -->
          <button
            @click="startChat"
            class="flex-1 py-2.5 px-4 rounded-2xl bg-[#3390ec] hover:bg-[#2481cc] text-white text-xs font-semibold flex items-center justify-center gap-1.5 shadow-md shadow-[#3390ec]/30 transition-all active:scale-95"
          >
            <Send class="w-3.5 h-3.5" />
            <span>Send Message</span>
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
