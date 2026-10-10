<script setup lang="ts">
import { computed } from 'vue'
import { useUiStore } from '../../stores/ui'
import { useChatStore } from '../../stores/chat'
import { useUsersStore } from '../../stores/users'
import TelegramAvatar from '../common/TelegramAvatar.vue'
import {
  MessageSquare,
  AlertTriangle,
  UserX,
  Loader2,
  X,
  Radio,
  Send
} from 'lucide-vue-next'

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
        <h3 class="text-sm font-semibold mb-1">در حال جستجوی کاربر...</h3>
        <p class="text-xs text-[#7f91a4]">@{{ modal.username }}</p>
      </div>

      <!-- 2. BROADCAST TAG (e.g. @all, @channel, @here) -->
      <div v-else-if="modal.type === 'broadcast'" class="flex flex-col items-center text-center">
        <div class="w-16 h-16 rounded-full bg-amber-500/20 text-amber-400 flex items-center justify-center mb-4">
          <Radio class="w-8 h-8" />
        </div>

        <h3 class="text-base font-bold mb-1">
          تگ اعلان همگانی (@{{ modal.username }})
        </h3>

        <p class="text-xs text-[#7f91a4] leading-relaxed my-3 px-2">
          این شناسه برای ارسال نوتیفیکیشن همگانی به تمام اعضای کانال استفاده می‌شود و مربوط به حساب کاربری شخصی نیست.
        </p>

        <button
          @click="close"
          class="w-full mt-2 py-2.5 px-4 bg-[#242f3d] dark:bg-[#242f3d] bg-[#f4f4f5] hover:bg-[#202b36] text-white dark:text-white text-[#111827] font-medium text-xs rounded-2xl transition-all"
        >
          متوجه شدم
        </button>
      </div>

      <!-- 3. USER NOT FOUND -->
      <div v-else-if="modal.type === 'not_found'" class="flex flex-col items-center text-center">
        <div class="w-16 h-16 rounded-full bg-rose-500/20 text-rose-400 flex items-center justify-center mb-4">
          <UserX class="w-8 h-8" />
        </div>

        <h3 class="text-base font-bold mb-1">
          کاربر یافت نشد
        </h3>

        <p class="text-xs text-[#7f91a4] leading-relaxed my-3 px-2">
          کاربری با نام کاربری <span class="text-[#3390ec] font-semibold">@{{ modal.username }}</span> در سرور وجود ندارد.
        </p>

        <button
          @click="close"
          class="w-full mt-2 py-2.5 px-4 bg-[#242f3d] dark:bg-[#242f3d] bg-[#f4f4f5] hover:bg-[#202b36] text-white dark:text-white text-[#111827] font-medium text-xs rounded-2xl transition-all"
        >
          بستن
        </button>
      </div>

      <!-- 4. USER FOUND: CONFIRMATION MODAL -->
      <div v-else-if="modal.type === 'user' && user" class="flex flex-col items-center text-center">
        <!-- Big Avatar -->
        <div class="mb-3">
          <TelegramAvatar
            :userId="user.id"
            :name="displayName"
            size="2xl"
            :showOnlineDot="true"
            :isOnline="isOnline"
            :lastPictureUpdate="(user as any)?.last_picture_update"
          />
        </div>

        <!-- Name & Username -->
        <h3 class="text-base font-bold truncate max-w-full">
          {{ displayName }}
        </h3>
        <p class="text-xs text-[#3390ec] font-semibold mt-0.5">
          @{{ user.username }}
        </p>

        <!-- Status / Email -->
        <p class="text-[11px] text-[#7f91a4] mt-1">
          <span v-if="isOnline" class="text-emerald-400 font-medium">آنلاین</span>
          <span v-else-if="user.email">{{ user.email }}</span>
          <span v-else>آفلاین</span>
        </p>

        <!-- Question Box -->
        <div class="w-full my-4 p-3 bg-[#0e1621]/40 rounded-2xl border border-[#202b36] text-xs text-[#7f91a4]">
          آیا می‌خواهید با این کاربر گفتگوی خصوصی را آغاز کنید؟
        </div>

        <!-- Buttons Row -->
        <div class="flex items-center gap-2.5 w-full">
          <button
            @click="close"
            class="flex-1 py-2.5 px-4 rounded-2xl border border-[#202b36] hover:bg-[#202b36] text-xs font-medium text-[#7f91a4] hover:text-white transition-all"
          >
            انصراف
          </button>

          <button
            @click="startChat"
            class="flex-1 py-2.5 px-4 rounded-2xl bg-[#3390ec] hover:bg-[#2481cc] text-white text-xs font-semibold flex items-center justify-center gap-1.5 shadow-md shadow-[#3390ec]/30 transition-all active:scale-95"
          >
            <Send class="w-3.5 h-3.5" />
            <span>شروع چت</span>
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
