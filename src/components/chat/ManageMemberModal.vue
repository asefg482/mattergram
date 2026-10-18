<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { useAuthStore } from '../../stores/auth'
import { useChatStore } from '../../stores/chat'
import { useUsersStore } from '../../stores/users'
import { useUiStore } from '../../stores/ui'
import { showConfirm } from '../../stores/alert'
import { notificationService } from '../../services/notifications'
import type { MattermostChannel, MattermostChannelMember, MattermostUser } from '../../types/mattermost'
import {
  X,
  ShieldCheck,
  Shield,
  Crown,
  User,
  UserMinus,
  MessageSquare,
  Loader2,
  Check
} from 'lucide-vue-next'
import TelegramAvatar from '../common/TelegramAvatar.vue'

const props = defineProps<{
  isOpen: boolean
  channel: MattermostChannel | null
  user: MattermostUser | null
  member: MattermostChannelMember | null
  canManage: boolean
  canRemove: boolean
  isOwner?: boolean
  isAdmin?: boolean
}>()

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'updated'): void
}>()

const authStore = useAuthStore()
const chatStore = useChatStore()
const usersStore = useUsersStore()
const uiStore = useUiStore()

const selectedRole = ref<'admin' | 'member'>('member')
const isSavingRole = ref(false)
const isRemoving = ref(false)

const currentRoleIsAdmin = computed(() => {
  if (props.isOwner) return true
  if (props.member?.scheme_admin) return true
  if (props.member?.roles?.includes('channel_admin')) return true
  return false
})

const hasRoleChanged = computed(() => {
  const current = currentRoleIsAdmin.value ? 'admin' : 'member'
  return selectedRole.value !== current
})

watch(
  () => [props.isOpen, props.member, props.user],
  () => {
    if (props.isOpen) {
      selectedRole.value = currentRoleIsAdmin.value ? 'admin' : 'member'
    }
  },
  { immediate: true }
)

async function handleSaveRole() {
  if (!props.channel || !props.user || isSavingRole.value || !hasRoleChanged.value) return
  isSavingRole.value = true

  const makeAdmin = selectedRole.value === 'admin'
  try {
    await chatStore.setChannelMemberAdmin(props.channel.id, props.user.id, makeAdmin)
    notificationService.showToast({
      message: `Permissions updated: ${usersStore.getUserDisplayName(props.user)} is now a ${makeAdmin ? 'Channel Admin' : 'Member'}`
    })
    emit('updated')
    emit('close')
  } catch (err: any) {
    console.error('Failed to update channel member role:', err)
    notificationService.showToast({
      message: 'Failed to update user role. You may lack sufficient permissions.'
    })
  } finally {
    isSavingRole.value = false
  }
}

async function handleRemoveMember() {
  if (!props.channel || !props.user || isRemoving.value) return

  const displayName = usersStore.getUserDisplayName(props.user)
  const channelName = props.channel.display_name || props.channel.name

  const confirmed = await showConfirm(
    `Are you sure you want to remove ${displayName} from ${channelName}?`,
    {
      title: 'Remove Member',
      confirmText: 'Remove',
      cancelText: 'Cancel',
      isDestructive: true
    }
  )

  if (!confirmed) return

  isRemoving.value = true
  try {
    await chatStore.removeMemberFromChannel(props.channel.id, props.user.id)
    notificationService.showToast({
      message: `${displayName} has been removed from the channel.`
    })
    emit('updated')
    emit('close')
  } catch (err: any) {
    console.error('Failed to remove member from channel:', err)
    notificationService.showToast({
      message: 'Failed to remove user from channel.'
    })
  } finally {
    isRemoving.value = false
  }
}

function handleDirectMessage() {
  if (props.user) {
    emit('close')
    chatStore.openDirectMessage(props.user.id)
  }
}

function handleOpenProfile() {
  if (props.user) {
    emit('close')
    uiStore.openMentionModal({
      type: 'user',
      username: props.user.username,
      user: props.user
    })
  }
}
</script>

<template>
  <Teleport to="body">
    <Transition name="tg-modal">
      <div
        v-if="isOpen && user && channel"
        class="fixed inset-0 z-50 flex items-center justify-center p-4 select-none"
        style="padding-top: calc(1rem + env(safe-area-inset-top, 0px)); padding-bottom: calc(1rem + env(safe-area-inset-bottom, 0px));"
      >
        <!-- Backdrop -->
        <div @click="emit('close')" class="absolute inset-0 bg-black/60 backdrop-blur-xs"></div>

        <!-- Modal Box -->
        <div
          class="tg-modal-box relative bg-white dark:bg-[#17212b] border border-[#dfe1e5] dark:border-[#202b36] rounded-2xl w-full max-w-md shadow-2xl flex flex-col max-h-[85vh] overflow-hidden z-10"
        >
      <!-- Header -->
      <div class="p-4 border-b border-[#dfe1e5] dark:border-[#202b36] flex items-center justify-between">
        <h3 class="font-bold text-sm text-[#111827] dark:text-white leading-tight">
          Manage Member Permissions
        </h3>
        <button
          @click="emit('close')"
          class="p-1.5 text-[#7f91a4] hover:text-[#111827] dark:hover:text-white hover:bg-[#f1f1f1] dark:hover:bg-[#202b36] rounded-full transition-colors cursor-pointer"
        >
          <X class="w-4 h-4" />
        </button>
      </div>

      <!-- Member Profile Card -->
      <div class="p-4 border-b border-[#dfe1e5] dark:border-[#202b36] flex items-center gap-3 bg-gray-50/50 dark:bg-[#101921]/40">
        <TelegramAvatar
          :userId="user.id"
          :name="usersStore.getUserDisplayName(user)"
          size="lg"
          :showOnlineDot="true"
          :isOnline="usersStore.getStatus(user.id) === 'online'"
          :lastPictureUpdate="(user as any)?.last_picture_update"
        />

        <div class="flex-1 min-w-0">
          <div class="flex items-center gap-1.5">
            <h4 class="text-sm font-bold text-gray-900 dark:text-white truncate">
              {{ usersStore.getUserDisplayName(user) }}
            </h4>
            <!-- Role Badge -->
            <span
              v-if="isOwner"
              class="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-500 font-semibold flex items-center gap-0.5 shrink-0"
            >
              <Crown class="w-3 h-3" />
              Owner
            </span>
            <span
              v-else-if="currentRoleIsAdmin"
              class="text-[10px] px-1.5 py-0.5 rounded bg-[#3390ec]/15 text-[#3390ec] font-semibold flex items-center gap-0.5 shrink-0"
            >
              <ShieldCheck class="w-3 h-3" />
              Admin
            </span>
            <span
              v-else
              class="text-[10px] px-1.5 py-0.5 rounded bg-gray-500/15 text-gray-500 dark:text-gray-400 font-semibold flex items-center gap-0.5 shrink-0"
            >
              <User class="w-3 h-3" />
              Member
            </span>
          </div>

          <p class="text-xs text-[#7f91a4] truncate mt-0.5">
            @{{ user.username }} &bull; {{ usersStore.getStatus(user.id) }}
          </p>
        </div>
      </div>

      <!-- Body / Roles Selection -->
      <div class="p-4 flex-1 overflow-y-auto space-y-4">
        <!-- Role Selector (If Current User Can Manage) -->
        <div v-if="canManage && !isOwner" class="space-y-2">
          <label class="block text-xs font-semibold text-gray-700 dark:text-gray-300">
            Channel Role & Administrative Rights
          </label>

          <div class="space-y-2">
            <!-- Member Option -->
            <div
              @click="selectedRole = 'member'"
              class="p-3 rounded-xl border flex items-center justify-between cursor-pointer transition-all"
              :class="[
                selectedRole === 'member'
                  ? 'border-[#3390ec] bg-[#3390ec]/5 dark:bg-[#3390ec]/10'
                  : 'border-[#dfe1e5] dark:border-[#202b36] hover:bg-gray-50 dark:hover:bg-[#202b36]/60'
              ]"
            >
              <div class="flex items-center gap-3">
                <div
                  class="w-8 h-8 rounded-full flex items-center justify-center shrink-0"
                  :class="selectedRole === 'member' ? 'bg-[#3390ec] text-white' : 'bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-300'"
                >
                  <User class="w-4 h-4" />
                </div>
                <div>
                  <div class="text-xs font-semibold text-gray-900 dark:text-white">
                    Member (عضو عادی)
                  </div>
                  <div class="text-[11px] text-[#7f91a4]">
                    Can view channel, send messages, and react
                  </div>
                </div>
              </div>

              <div
                v-if="selectedRole === 'member'"
                class="w-5 h-5 rounded-full bg-[#3390ec] text-white flex items-center justify-center shrink-0"
              >
                <Check class="w-3.5 h-3.5 stroke-[3]" />
              </div>
            </div>

            <!-- Admin Option -->
            <div
              @click="selectedRole = 'admin'"
              class="p-3 rounded-xl border flex items-center justify-between cursor-pointer transition-all"
              :class="[
                selectedRole === 'admin'
                  ? 'border-[#3390ec] bg-[#3390ec]/5 dark:bg-[#3390ec]/10'
                  : 'border-[#dfe1e5] dark:border-[#202b36] hover:bg-gray-50 dark:hover:bg-[#202b36]/60'
              ]"
            >
              <div class="flex items-center gap-3">
                <div
                  class="w-8 h-8 rounded-full flex items-center justify-center shrink-0"
                  :class="selectedRole === 'admin' ? 'bg-[#3390ec] text-white' : 'bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-300'"
                >
                  <ShieldCheck class="w-4 h-4" />
                </div>
                <div>
                  <div class="text-xs font-semibold text-gray-900 dark:text-white">
                    Channel Admin (مدیر گروه)
                  </div>
                  <div class="text-[11px] text-[#7f91a4]">
                    Can manage members, add members, and channel settings
                  </div>
                </div>
              </div>

              <div
                v-if="selectedRole === 'admin'"
                class="w-5 h-5 rounded-full bg-[#3390ec] text-white flex items-center justify-center shrink-0"
              >
                <Check class="w-3.5 h-3.5 stroke-[3]" />
              </div>
            </div>
          </div>

          <!-- Save Role Button -->
          <div v-if="hasRoleChanged" class="pt-1 flex justify-end">
            <button
              @click="handleSaveRole"
              :disabled="isSavingRole"
              class="flex items-center gap-1.5 px-4 py-2 text-xs font-medium bg-[#3390ec] text-white rounded-xl hover:bg-[#2883dc] disabled:opacity-50 transition-colors cursor-pointer"
            >
              <Loader2 v-if="isSavingRole" class="w-3.5 h-3.5 animate-spin" />
              <span>Save Role Changes</span>
            </button>
          </div>
        </div>

        <div v-else-if="isOwner" class="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-xs text-amber-700 dark:text-amber-400">
          This user is the creator and owner of this channel. Channel creator permissions cannot be modified.
        </div>

        <!-- Quick Actions -->
        <div class="pt-2 border-t border-[#dfe1e5] dark:border-[#202b36] space-y-1">
          <button
            @click="handleDirectMessage"
            class="w-full flex items-center gap-2.5 px-3 py-2 text-xs font-medium text-gray-700 dark:text-gray-200 hover:bg-[#f1f1f1] dark:hover:bg-[#202b36] rounded-xl transition-colors cursor-pointer text-left"
          >
            <MessageSquare class="w-4 h-4 text-[#3390ec]" />
            <span>Send Direct Message</span>
          </button>

          <button
            @click="handleOpenProfile"
            class="w-full flex items-center gap-2.5 px-3 py-2 text-xs font-medium text-gray-700 dark:text-gray-200 hover:bg-[#f1f1f1] dark:hover:bg-[#202b36] rounded-xl transition-colors cursor-pointer text-left"
          >
            <User class="w-4 h-4 text-[#7f91a4]" />
            <span>View User Details</span>
          </button>

          <!-- Remove From Channel Button -->
          <button
            v-if="canRemove && !isOwner"
            @click="handleRemoveMember"
            :disabled="isRemoving"
            class="w-full flex items-center gap-2.5 px-3 py-2 text-xs font-medium text-red-500 hover:bg-red-500/10 rounded-xl transition-colors cursor-pointer text-left disabled:opacity-50"
          >
            <Loader2 v-if="isRemoving" class="w-4 h-4 animate-spin text-red-500" />
            <UserMinus v-else class="w-4 h-4 text-red-500" />
            <span>Remove from Channel</span>
          </button>
        </div>
      </div>
    </div>
  </div>
  </Transition>
</Teleport>
</template>
