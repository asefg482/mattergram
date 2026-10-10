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
  FileText
} from 'lucide-vue-next'

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

function toggleMute() {
  if (channel.value) {
    channel.value.is_muted = !channel.value.is_muted
  }
}

function handleMemberClick(user: MattermostUser) {
  if (user.id !== authStore.currentUser?.id) {
    chatStore.openDirectMessage(user.id)
    uiStore.showRightSidebar = false
  }
}
</script>

<template>
  <div
    v-if="uiStore.showRightSidebar && channel"
    class="w-full md:w-80 lg:w-88 h-full bg-[#17212b] dark:bg-[#17212b] bg-white border-l border-[#101921] dark:border-[#101921] border-[#dfe1e5] flex flex-col shrink-0 select-none z-30 animate-in slide-in-from-right duration-200"
  >
    <!-- Header -->
    <div class="h-14 px-4 border-b border-[#101921] dark:border-[#101921] border-[#dfe1e5] flex items-center justify-between">
      <h3 class="text-sm font-bold text-white dark:text-white text-gray-900">
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
      <div class="p-6 flex flex-col items-center text-center border-b border-[#101921] dark:border-[#101921] border-[#dfe1e5]">
        <!-- Avatar -->
        <div
          v-if="isSavedMessages"
          class="w-20 h-20 rounded-full bg-[#2481cc] flex items-center justify-center text-white mb-3 shadow-lg"
        >
          <Bookmark class="w-10 h-10 fill-white" />
        </div>
        <div
          v-else
          class="w-20 h-20 rounded-full flex items-center justify-center text-white text-2xl font-bold mb-3 shadow-lg"
          :style="{ background: getAvatarGradient(channel.id) }"
        >
          {{ getInitials(channel.display_name || channel.name) }}
        </div>

        <!-- Title -->
        <h2 class="text-base font-bold text-white dark:text-white text-gray-900 truncate max-w-full">
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

      <!-- Info Details -->
      <div class="p-4 space-y-4 border-b border-[#101921] dark:border-[#101921] border-[#dfe1e5]">
        <!-- Purpose / Bio -->
        <div v-if="channel.purpose || channel.header" class="flex items-start gap-3">
          <Info class="w-4 h-4 text-[#7f91a4] shrink-0 mt-0.5" />
          <div class="text-xs">
            <div class="font-medium text-white dark:text-white text-gray-800">About</div>
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
            <span class="text-xs text-white dark:text-white text-gray-800 font-medium">Notifications</span>
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
            class="flex items-center gap-3 p-2 rounded-xl hover:bg-[#202b36] dark:hover:bg-[#202b36] hover:bg-[#f1f1f1] cursor-pointer transition-colors"
          >
            <!-- Member Avatar -->
            <div class="relative shrink-0">
              <div
                class="w-9 h-9 rounded-full flex items-center justify-center text-white text-xs font-semibold"
                :style="{ background: getAvatarGradient(user.id) }"
              >
                {{ getInitials(usersStore.getUserDisplayName(user)) }}
              </div>
              <div
                v-if="usersStore.getStatus(user.id) === 'online'"
                class="absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full bg-[#4fae60] border-2 border-[#17212b]"
              ></div>
            </div>

            <!-- Member Info -->
            <div class="flex-1 min-w-0">
              <div class="text-xs font-semibold text-white dark:text-white text-gray-900 truncate">
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
