<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { useAuthStore } from '../../stores/auth'
import { useChatStore } from '../../stores/chat'
import { useUsersStore } from '../../stores/users'
import { useUiStore } from '../../stores/ui'
import { mmApi } from '../../services/mattermostApi'
import { getAvatarGradient, getInitials } from '../../utils/formatters'
import type { MattermostUser } from '../../types/mattermost'
import {
  X,
  Bell,
  BellOff,
  Users,
  Info,
  Hash,
  Lock,
  Bookmark,
  Shield,
  FileText,
  ZoomIn,
  Copy,
  Check,
  AtSign,
  Briefcase,
  Mail
} from 'lucide-vue-next'
import TelegramAvatar from '../common/TelegramAvatar.vue'

const authStore = useAuthStore()
const chatStore = useChatStore()
const usersStore = useUsersStore()
const uiStore = useUiStore()

const channel = computed(() => chatStore.activeChannel)
const isDirect = computed(() => channel.value?.type === 'D')
const isPrivate = computed(() => channel.value?.type === 'P')
const isPublic = computed(() => channel.value?.type === 'O')
const isSavedMessages = computed(() => channel.value?.display_name === 'Saved Messages')

const members = ref<MattermostUser[]>([])
const loadingMembers = ref(false)

// Load members when channel changes
watch(
  () => channel.value?.id,
  async (newId) => {
    if (!newId || isDirect.value) {
      members.value = []
      return
    }
    loadingMembers.value = true
    try {
      const rawMembers = await mmApi.getChannelMembers(newId)
      const userIds = rawMembers.map((m: any) => m.user_id)
      await usersStore.fetchUsers(userIds)
      members.value = userIds.map((id: string) => usersStore.getUser(id)).filter(Boolean) as MattermostUser[]
    } catch (err) {
      console.error('Failed to load channel members:', err)
    } finally {
      loadingMembers.value = false
    }
  },
  { immediate: true }
)

const copiedField = ref<string | null>(null)

function copyText(text: string, field: string) {
  navigator.clipboard.writeText(text)
  copiedField.value = field
  setTimeout(() => {
    copiedField.value = null
  }, 2000)
}

function enlargeAvatar() {
  if (isDirect.value && channel.value?.dm_user) {
    const user = channel.value.dm_user
    const url = mmApi.getUserAvatarUrl(user.id, (user as any)?.last_picture_update)
    const name = channel.value.display_name || channel.value.name
    uiStore.openAvatarPreview(url, name, user.id)
  }
}

function toggleMute() {
  if (channel.value) {
    channel.value.is_muted = !channel.value.is_muted
  }
}

function handleMemberClick(user: MattermostUser) {
  if (user.id !== authStore.currentUser?.id) {
    uiStore.openMentionModal({
      type: 'user',
      username: user.username,
      user
    })
  }
}
</script>

<template>
  <div
    v-if="uiStore.showRightSidebar && channel"
    class="w-full md:w-80 lg:w-88 h-full bg-white dark:bg-[#17212b] border-l border-[#dfe1e5] dark:border-[#101921] flex flex-col shrink-0 select-none z-30 animate-in slide-in-from-right duration-200"
  >
    <!-- Header -->
    <div
      class="px-4 border-b border-[#dfe1e5] dark:border-[#101921] flex items-center justify-between"
      style="padding-top: env(safe-area-inset-top, 0px); min-height: calc(3.5rem + env(safe-area-inset-top, 0px));"
    >
      <h3 class="text-sm font-bold text-gray-900 dark:text-white">
        {{ isDirect ? 'User Info' : 'Channel Info' }}
      </h3>
      <button
        @click="uiStore.showRightSidebar = false"
        class="p-1.5 text-[#7f91a4] hover:text-white rounded-full transition-colors"
      >
        <X class="w-5 h-5" />
      </button>
    </div>

    <!-- Scrollable Content -->
    <div class="flex-1 overflow-y-auto">
      <!-- Profile Card -->
      <div class="p-6 flex flex-col items-center text-center border-b border-[#dfe1e5] dark:border-[#101921]">
        <!-- Avatar (Clickable to Enlarge if DM) -->
        <div
          v-if="isDirect && channel.dm_user"
          @click="enlargeAvatar"
          class="relative group cursor-pointer mb-3 rounded-full"
          title="Click to enlarge photo"
        >
          <TelegramAvatar
            :userId="channel.dm_user.id"
            :name="channel.display_name || channel.name"
            size="2xl"
            :lastPictureUpdate="(channel.dm_user as any)?.last_picture_update"
          />
          <div class="absolute inset-0 rounded-full bg-black/45 opacity-0 group-hover:opacity-100 flex items-center justify-center text-white transition-opacity">
            <ZoomIn class="w-7 h-7" />
          </div>
        </div>
        <TelegramAvatar
          v-else
          :userId="channel.dm_user?.id"
          :name="channel.display_name || channel.name"
          size="2xl"
          :isSavedMessages="isSavedMessages"
          :lastPictureUpdate="(channel.dm_user as any)?.last_picture_update"
          class="mb-3"
        />

        <!-- Title -->
        <h2 class="text-base font-bold text-gray-900 dark:text-white truncate max-w-full">
          {{ channel.display_name || channel.name }}
        </h2>

        <!-- Subtitle -->
        <p class="text-xs text-[#7f91a4] mt-0.5">
          <span v-if="isDirect && channel.dm_user">@{{ channel.dm_user.username }}</span>
          <span v-else-if="isPublic">Public Channel</span>
          <span v-else-if="isPrivate">Private Channel</span>
          <span v-else>Saved Cloud</span>
        </p>
      </div>

      <!-- DM Profile Details (If Direct Message) -->
      <div v-if="isDirect && channel.dm_user" class="p-4 space-y-3 border-b border-[#dfe1e5] dark:border-[#101921]">
        <!-- Username -->
        <div class="flex items-center justify-between text-xs">
          <div class="flex items-center gap-2 text-[#7f91a4]">
            <AtSign class="w-4 h-4" />
            <span>Username</span>
          </div>
          <div class="flex items-center gap-1.5">
            <span class="text-[#3390ec] font-semibold">@{{ channel.dm_user.username }}</span>
            <button
              @click="copyText(channel.dm_user.username, 'username')"
              class="p-1 text-[#7f91a4] hover:text-white rounded transition-colors"
              title="Copy username"
            >
              <Check v-if="copiedField === 'username'" class="w-3.5 h-3.5 text-emerald-400" />
              <Copy v-else class="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        <!-- Position / Bio -->
        <div v-if="channel.dm_user.position" class="flex items-center justify-between text-xs">
          <div class="flex items-center gap-2 text-[#7f91a4]">
            <Briefcase class="w-4 h-4" />
            <span>Position / Bio</span>
          </div>
          <span class="text-gray-800 dark:text-white font-medium truncate max-w-[170px]">{{ channel.dm_user.position }}</span>
        </div>

        <!-- Email -->
        <div v-if="channel.dm_user.email" class="flex items-center justify-between text-xs">
          <div class="flex items-center gap-2 text-[#7f91a4]">
            <Mail class="w-4 h-4" />
            <span>Email</span>
          </div>
          <div class="flex items-center gap-1.5">
            <span class="text-gray-700 dark:text-white/90 truncate max-w-[150px]">{{ channel.dm_user.email }}</span>
            <button
              @click="copyText(channel.dm_user.email, 'email')"
              class="p-1 text-[#7f91a4] hover:text-white rounded transition-colors"
              title="Copy email"
            >
              <Check v-if="copiedField === 'email'" class="w-3.5 h-3.5 text-emerald-400" />
              <Copy v-else class="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        <!-- Zoom Photo Action Button -->
        <button
          @click="enlargeAvatar"
          class="w-full mt-2 py-2 px-3 rounded-xl border border-[#202b36] hover:bg-[#202b36] text-xs font-medium text-[#7f91a4] hover:text-white transition-all flex items-center justify-center gap-2"
        >
          <ZoomIn class="w-3.5 h-3.5" />
          <span>Enlarge photo</span>
        </button>
      </div>

      <!-- Info Details -->
      <div class="p-4 space-y-4 border-b border-[#dfe1e5] dark:border-[#101921]">
        <!-- Purpose / Bio -->
        <div v-if="channel.purpose || channel.header" class="flex items-start gap-3">
          <Info class="w-4 h-4 text-[#7f91a4] shrink-0 mt-0.5" />
          <div class="text-xs">
            <div class="font-medium text-gray-800 dark:text-white">About</div>
            <div class="text-[#7f91a4] mt-0.5 leading-relaxed">
              {{ channel.purpose || channel.header }}
            </div>
          </div>
        </div>

        <!-- Notifications Setting -->
        <div
          @click="toggleMute"
          class="flex items-center justify-between cursor-pointer py-1"
        >
          <div class="flex items-center gap-3">
            <Bell v-if="!channel.is_muted" class="w-4 h-4 text-[#7f91a4]" />
            <BellOff v-else class="w-4 h-4 text-[#7f91a4]" />
            <span class="text-xs text-gray-800 dark:text-white font-medium">Notifications</span>
          </div>

          <!-- Switch -->
          <div
            class="w-9 h-5 rounded-full p-0.5 transition-colors"
            :class="!channel.is_muted ? 'bg-[#3390ec]' : 'bg-gray-600'"
          >
            <div
              class="w-4 h-4 rounded-full bg-white transition-transform"
              :class="!channel.is_muted ? 'translate-x-4' : 'translate-x-0'"
            ></div>
          </div>
        </div>
      </div>

      <!-- Members Section (For Group Channels) -->
      <div v-if="!isDirect && !isSavedMessages" class="p-4">
        <div class="flex items-center justify-between mb-3 text-xs text-[#7f91a4]">
          <span class="font-semibold uppercase tracking-wider text-[11px] flex items-center gap-1.5">
            <Users class="w-3.5 h-3.5" />
            Members ({{ members.length }})
          </span>
        </div>

        <!-- Members List -->
        <div class="space-y-1">
          <div
            v-for="user in members"
            :key="user.id"
            @click="handleMemberClick(user)"
            class="flex items-center gap-3 p-2 rounded-xl hover:bg-[#f1f1f1] dark:hover:bg-[#202b36] cursor-pointer transition-colors"
          >
            <!-- Member Avatar -->
            <TelegramAvatar
              :userId="user.id"
              :name="usersStore.getUserDisplayName(user)"
              size="sm"
              :showOnlineDot="true"
              :isOnline="usersStore.getStatus(user.id) === 'online'"
              :lastPictureUpdate="(user as any)?.last_picture_update"
            />

            <!-- Member Info -->
            <div class="flex-1 min-w-0">
              <div class="text-xs font-semibold text-gray-900 dark:text-white truncate">
                {{ usersStore.getUserDisplayName(user) }}
              </div>
              <div class="text-[11px] text-[#7f91a4] truncate">
                {{ usersStore.getStatus(user.id) }}
              </div>
            </div>

            <!-- Role Badge -->
            <span
              v-if="user.roles.includes('system_admin')"
              class="text-[10px] px-1.5 py-0.5 rounded bg-[#3390ec]/20 text-[#3390ec] font-semibold"
            >
              Admin
            </span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
