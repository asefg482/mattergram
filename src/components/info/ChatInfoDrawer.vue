<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { useAuthStore } from '../../stores/auth'
import { useChatStore } from '../../stores/chat'
import { useUsersStore } from '../../stores/users'
import { useUiStore } from '../../stores/ui'
import { mmApi } from '../../services/mattermostApi'
import { formatFileSize, formatMessageTime } from '../../utils/formatters'
import type { MattermostUser, MattermostFileInfo } from '../../types/mattermost'
import {
  X,
  Bell,
  BellOff,
  Users,
  Info,
  ZoomIn,
  Copy,
  Check,
  AtSign,
  Briefcase,
  Mail,
  FolderOpen,
  Image as ImageIcon,
  Music,
  Film,
  FileText,
  FileArchive,
  FileSpreadsheet,
  FileCode,
  Download,
  Search,
  ArrowLeft,
  ChevronRight,
  Loader2,
  ExternalLink,
  Play,
  Pause,
  MessageSquare,
  RotateCw,
  UserPlus,
  UserCog,
  ShieldCheck,
  Crown
} from 'lucide-vue-next'
import TelegramAvatar from '../common/TelegramAvatar.vue'
import AddChannelMembersModal from '../chat/AddChannelMembersModal.vue'
import ManageMemberModal from '../chat/ManageMemberModal.vue'
import type { MattermostChannelMember } from '../../types/mattermost'

const authStore = useAuthStore()
const chatStore = useChatStore()
const usersStore = useUsersStore()
const uiStore = useUiStore()

const channel = computed(() => chatStore.activeChannel)
const isDirect = computed(() => channel.value?.type === 'D')
const isPrivate = computed(() => channel.value?.type === 'P')
const isPublic = computed(() => channel.value?.type === 'O')
const isSavedMessages = computed(() => channel.value?.display_name === 'Saved Messages')

const rawChannelMembers = ref<MattermostChannelMember[]>([])
const members = ref<MattermostUser[]>([])
const loadingMembers = ref(false)

export interface MemberItem {
  user: MattermostUser
  member: MattermostChannelMember | null
  isOwner: boolean
  isAdmin: boolean
  canManage: boolean
  canRemove: boolean
}

const channelMemberItems = computed<MemberItem[]>(() => {
  if (!channel.value) return []
  const channelId = channel.value.id
  const creatorId = channel.value.creator_id

  return members.value.map((user) => {
    const memberObj = rawChannelMembers.value.find((m) => m.user_id === user.id) || null
    const isOwner = creatorId === user.id
    const isAdmin = isOwner || Boolean(memberObj?.scheme_admin || memberObj?.roles?.includes('channel_admin') || user.roles?.includes('system_admin'))
    const canManage = chatStore.canManageTargetMember(channelId, user.id, memberObj || undefined)
    const canRemove = canManage

    return {
      user,
      member: memberObj,
      isOwner,
      isAdmin,
      canManage,
      canRemove
    }
  })
})

const canAddMembers = computed(() => {
  if (!channel.value) return false
  return chatStore.canCurrentUserAddMembers(channel.value.id)
})

// Modals State
const showAddMemberModal = ref(false)
const showManageMemberModal = ref(false)
const selectedMemberToManage = ref<MemberItem | null>(null)

function openManageMemberModal(item: MemberItem) {
  selectedMemberToManage.value = item
  showManageMemberModal.value = true
}

async function loadChannelMembers() {
  const newId = channel.value?.id
  if (!newId || isDirect.value) {
    members.value = []
    rawChannelMembers.value = []
    return
  }
  loadingMembers.value = true
  try {
    const rawMembers = await chatStore.fetchChannelMembers(newId)
    rawChannelMembers.value = rawMembers || []
    const userIds = (rawMembers || []).map((m: any) => m.user_id)
    await usersStore.fetchUsers(userIds)
    members.value = userIds.map((id: string) => usersStore.getUser(id)).filter(Boolean) as MattermostUser[]
  } catch (err) {
    console.error('Failed to load channel members:', err)
  } finally {
    loadingMembers.value = false
  }
}

// Load members when channel changes
watch(
  () => channel.value?.id,
  () => {
    loadChannelMembers()
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

// ----------------------------------------------------
// Shared Files Feature (for Channel, Group, and DM/PV)
// ----------------------------------------------------

function isImageFile(file: MattermostFileInfo): boolean {
  if (!file) return false
  const ext = file.extension?.toLowerCase() || ''
  const mime = file.mime_type?.toLowerCase() || ''
  return mime.startsWith('image/') || ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp', 'ico'].includes(ext)
}

function isVideoFile(file: MattermostFileInfo): boolean {
  if (!file) return false
  const ext = file.extension?.toLowerCase() || ''
  const mime = file.mime_type?.toLowerCase() || ''
  return mime.startsWith('video/') || ['mp4', 'webm', 'mov', 'm4v', 'mkv', 'ogg'].includes(ext)
}

function isAudioFile(file: MattermostFileInfo): boolean {
  if (!file) return false
  const ext = file.extension?.toLowerCase() || ''
  const mime = file.mime_type?.toLowerCase() || ''
  return mime.startsWith('audio/') || ['mp3', 'wav', 'ogg', 'm4a', 'aac', 'flac', 'opus'].includes(ext)
}

function getFileCategoryIcon(file: MattermostFileInfo) {
  const ext = file.extension?.toLowerCase() || ''
  if (['zip', 'rar', '7z', 'tar', 'gz'].includes(ext)) return FileArchive
  if (['xls', 'xlsx', 'csv'].includes(ext)) return FileSpreadsheet
  if (['js', 'ts', 'py', 'json', 'html', 'css', 'go', 'rs', 'c', 'cpp'].includes(ext)) return FileCode
  if (isAudioFile(file)) return Music
  return FileText
}

function getFileCategoryColor(file: MattermostFileInfo): string {
  const ext = file.extension?.toLowerCase() || ''
  if (['zip', 'rar', '7z', 'tar', 'gz'].includes(ext)) return 'bg-amber-500/15 text-amber-500'
  if (['xls', 'xlsx', 'csv'].includes(ext)) return 'bg-emerald-500/15 text-emerald-500'
  if (['pdf'].includes(ext)) return 'bg-rose-500/15 text-rose-500'
  if (isAudioFile(file)) return 'bg-purple-500/15 text-purple-500'
  return 'bg-[#3390ec]/15 text-[#3390ec]'
}

const allFiles = computed<MattermostFileInfo[]>(() => {
  if (!channel.value?.id) return []
  return chatStore.getChannelFiles(channel.value.id)
})

const mediaFiles = computed(() => allFiles.value.filter((f) => isImageFile(f) || isVideoFile(f)))
const docFiles = computed(() => allFiles.value.filter((f) => !isImageFile(f) && !isVideoFile(f) && !isAudioFile(f)))
const audioFiles = computed(() => allFiles.value.filter((f) => isAudioFile(f)))

type FileTabCategory = 'all' | 'media' | 'docs' | 'audio'
const activeFileCategory = ref<FileTabCategory>('all')
const fileSearchQuery = ref('')

const filteredFiles = computed(() => {
  let list = allFiles.value
  if (activeFileCategory.value === 'media') {
    list = mediaFiles.value
  } else if (activeFileCategory.value === 'docs') {
    list = docFiles.value
  } else if (activeFileCategory.value === 'audio') {
    list = audioFiles.value
  }

  const q = fileSearchQuery.value.trim().toLowerCase()
  if (!q) return list

  return list.filter((f) => (f.name || '').toLowerCase().includes(q))
})

// Full chat history crawl state
const isScanningAll = computed(() => {
  const chId = channel.value?.id
  return chId ? !!chatStore.isScanningAllFiles[chId] : false
})

const isAllScanned = computed(() => {
  const chId = channel.value?.id
  return chId ? !!chatStore.allFilesScanned[chId] : false
})

// Proactively crawl channel files whenever drawer is open
watch(
  () => [channel.value?.id, uiStore.showRightSidebar],
  ([chId, isOpen]) => {
    if (chId && isOpen) {
      chatStore.fetchAllChannelFiles(chId as string)
    }
  },
  { immediate: true }
)

function triggerFullScan(force = false) {
  const chId = channel.value?.id
  if (chId) {
    chatStore.fetchAllChannelFiles(chId, force)
  }
}

function jumpToFileMessage(file: MattermostFileInfo) {
  if (!channel.value?.id || !file.post_id) return
  if (window.innerWidth < 768) {
    uiStore.showRightSidebar = false
  }
  chatStore.jumpToPost(channel.value.id, file.post_id)
}

const copiedFileId = ref<string | null>(null)
function copyFileUrl(file: MattermostFileInfo) {
  const url = window.location.origin + mmApi.getFileDownloadUrl(file.id)
  navigator.clipboard.writeText(url)
  copiedFileId.value = file.id
  setTimeout(() => {
    copiedFileId.value = null
  }, 2000)
}

const playingAudioId = ref<string | null>(null)
let currentAudio: HTMLAudioElement | null = null

function togglePlayAudio(file: MattermostFileInfo) {
  if (playingAudioId.value === file.id) {
    if (currentAudio) {
      currentAudio.pause()
    }
    playingAudioId.value = null
    return
  }
  if (currentAudio) {
    currentAudio.pause()
  }
  const audio = new Audio(mmApi.getFileDownloadUrl(file.id))
  currentAudio = audio
  playingAudioId.value = file.id
  audio.play().catch(() => {
    playingAudioId.value = null
  })
  audio.onended = () => {
    if (playingAudioId.value === file.id) {
      playingAudioId.value = null
    }
  }
}
</script>

<template>
  <div
    v-if="uiStore.showRightSidebar && channel"
    class="fixed inset-0 z-40 md:static md:inset-auto md:z-30 w-full md:w-80 lg:w-88 h-full bg-white dark:bg-[#17212b] border-l border-[#dfe1e5] dark:border-[#101921] flex flex-col shrink-0 select-none animate-in slide-in-from-right duration-200"
  >
    <!-- Header -->
    <div
      class="px-4 border-b border-[#dfe1e5] dark:border-[#101921] flex items-center justify-between"
      style="padding-top: env(safe-area-inset-top, 0px); min-height: calc(3.5rem + env(safe-area-inset-top, 0px));"
    >
      <!-- Mode: Files Header -->
      <div v-if="uiStore.rightSidebarTab === 'files'" class="flex items-center gap-2 min-w-0">
        <button
          @click="uiStore.rightSidebarTab = 'info'"
          class="p-1.5 -ml-1 text-[#7f91a4] hover:text-gray-900 dark:hover:text-white rounded-full transition-colors"
          title="Back to info"
        >
          <ArrowLeft class="w-4 h-4" />
        </button>
        <div class="min-w-0 flex-1">
          <div class="flex items-center gap-1.5">
            <h3 class="text-sm font-bold text-gray-900 dark:text-white truncate">
              Shared Files
            </h3>
            <Loader2 v-if="isScanningAll" class="w-3.5 h-3.5 text-[#3390ec] animate-spin shrink-0" />
          </div>
          <p class="text-[11px] text-[#7f91a4]">
            {{ isScanningAll ? `Scanning history... (${allFiles.length})` : `${allFiles.length} file${allFiles.length === 1 ? '' : 's'}` }}
          </p>
        </div>
      </div>

      <!-- Mode: Info Header -->
      <h3 v-else class="text-sm font-bold text-gray-900 dark:text-white">
        {{ isDirect ? 'User Info' : 'Channel Info' }}
      </h3>

      <button
        @click="uiStore.showRightSidebar = false"
        class="p-1.5 text-[#7f91a4] hover:text-gray-900 dark:hover:text-white rounded-full transition-colors"
      >
        <X class="w-5 h-5" />
      </button>
    </div>

    <!-- Mode: Info Scrollable Content -->
    <div v-if="uiStore.rightSidebarTab === 'info'" class="flex-1 overflow-y-auto">
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

      <!-- Shared Files Card in Info Tab -->
      <div
        @click="uiStore.openChatFiles()"
        class="p-4 border-b border-[#dfe1e5] dark:border-[#101921] hover:bg-[#f1f1f1] dark:hover:bg-[#202b36] cursor-pointer transition-colors group"
      >
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-3">
            <div class="w-9 h-9 rounded-xl bg-[#3390ec]/15 text-[#3390ec] flex items-center justify-center shrink-0">
              <FolderOpen class="w-4 h-4" />
            </div>
            <div>
              <div class="text-xs font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                <span>Shared Files & Media</span>
                <span class="text-[10px] px-1.5 py-0.5 rounded-full bg-[#3390ec]/20 text-[#3390ec] font-bold">
                  {{ allFiles.length }}
                </span>
              </div>
              <div class="text-[11px] text-[#7f91a4] mt-0.5">
                {{ mediaFiles.length }} media · {{ docFiles.length }} docs · {{ audioFiles.length }} audio
              </div>
            </div>
          </div>
          <ChevronRight class="w-4 h-4 text-[#7f91a4] group-hover:text-gray-900 dark:group-hover:text-white transition-colors" />
        </div>

        <!-- Mini Previews of Recent Media (if available) -->
        <div v-if="mediaFiles.length > 0" class="grid grid-cols-4 gap-1.5 mt-3">
          <div
            v-for="f in mediaFiles.slice(0, 4)"
            :key="f.id"
            class="aspect-square rounded-lg overflow-hidden bg-black/10 dark:bg-black/30 relative"
          >
            <img
              v-if="isImageFile(f)"
              :src="mmApi.getFileThumbnailUrl(f.id)"
              class="w-full h-full object-cover"
              loading="lazy"
            />
            <div v-else class="w-full h-full flex items-center justify-center bg-black/40 text-white">
              <Film class="w-4 h-4" />
            </div>
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

          <!-- Add Member Button -->
          <button
            v-if="canAddMembers"
            @click="showAddMemberModal = true"
            class="flex items-center gap-1 px-2.5 py-1 text-xs font-semibold text-[#3390ec] hover:bg-[#3390ec]/10 rounded-xl transition-colors cursor-pointer"
          >
            <UserPlus class="w-3.5 h-3.5" />
            <span>Add Member</span>
          </button>
        </div>

        <!-- Members List -->
        <div class="space-y-1">
          <div
            v-for="item in channelMemberItems"
            :key="item.user.id"
            class="group/mem flex items-center gap-3 p-2 rounded-xl hover:bg-[#f1f1f1] dark:hover:bg-[#202b36] transition-colors"
          >
            <!-- Member Avatar -->
            <TelegramAvatar
              :userId="item.user.id"
              :name="usersStore.getUserDisplayName(item.user)"
              size="sm"
              :showOnlineDot="true"
              :isOnline="usersStore.getStatus(item.user.id) === 'online'"
              :lastPictureUpdate="(item.user as any)?.last_picture_update"
              class="cursor-pointer"
              @click="handleMemberClick(item.user)"
            />

            <!-- Member Info -->
            <div class="flex-1 min-w-0 cursor-pointer" @click="handleMemberClick(item.user)">
              <div class="flex items-center gap-1.5">
                <span class="text-xs font-semibold text-gray-900 dark:text-white truncate">
                  {{ usersStore.getUserDisplayName(item.user) }}
                </span>
                <span v-if="item.user.id === authStore.currentUser?.id" class="text-[10px] text-[#7f91a4] shrink-0 font-normal">
                  (You)
                </span>
              </div>
              <div class="text-[11px] text-[#7f91a4] truncate">
                {{ usersStore.getStatus(item.user.id) }}
              </div>
            </div>

            <!-- Role Badge & Actions -->
            <div class="flex items-center gap-1.5 shrink-0">
              <span
                v-if="item.isOwner"
                class="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-500 font-semibold flex items-center gap-0.5"
                title="Channel Owner"
              >
                <Crown class="w-3 h-3" />
                Owner
              </span>
              <span
                v-else-if="item.isAdmin"
                class="text-[10px] px-1.5 py-0.5 rounded bg-[#3390ec]/20 text-[#3390ec] font-semibold flex items-center gap-0.5"
                title="Channel Admin"
              >
                <ShieldCheck class="w-3 h-3" />
                Admin
              </span>

              <!-- Manage Member Button (Only if current user has permission to manage this specific member) -->
              <button
                v-if="item.canManage"
                @click.stop="openManageMemberModal(item)"
                class="p-1.5 text-[#7f91a4] hover:text-[#3390ec] hover:bg-black/5 dark:hover:bg-white/10 rounded-lg opacity-80 sm:opacity-0 group-hover/mem:opacity-100 transition-all cursor-pointer"
                title="Manage user permissions & role"
              >
                <UserCog class="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Mode: Full Shared Files Browser -->
    <div v-else class="flex-1 flex flex-col min-h-0 bg-white dark:bg-[#17212b]">
      <!-- Search Bar -->
      <div class="p-3 border-b border-[#dfe1e5] dark:border-[#101921]">
        <div class="relative flex items-center">
          <Search class="w-4 h-4 text-[#7f91a4] absolute left-3 pointer-events-none" />
          <input
            v-model="fileSearchQuery"
            type="text"
            placeholder="Search files by name..."
            class="w-full pl-9 pr-8 py-1.5 text-xs rounded-xl bg-[#f1f1f1] dark:bg-[#202b36] text-gray-900 dark:text-white placeholder-[#7f91a4] border-none focus:outline-none focus:ring-1 focus:ring-[#3390ec]"
          />
          <button
            v-if="fileSearchQuery"
            @click="fileSearchQuery = ''"
            class="p-1 absolute right-2 text-[#7f91a4] hover:text-white"
          >
            <X class="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      <!-- Filter Category Tabs -->
      <div class="flex items-center px-2 py-2 gap-1 border-b border-[#dfe1e5] dark:border-[#101921] overflow-x-auto no-scrollbar">
        <button
          @click="activeFileCategory = 'all'"
          class="px-2.5 py-1 text-xs rounded-lg font-medium whitespace-nowrap transition-colors flex items-center gap-1.5"
          :class="activeFileCategory === 'all' ? 'bg-[#3390ec] text-white shadow-xs' : 'text-[#7f91a4] hover:bg-[#f1f1f1] dark:hover:bg-[#202b36]'"
        >
          <span>All</span>
          <span class="text-[10px] opacity-80">({{ allFiles.length }})</span>
        </button>

        <button
          @click="activeFileCategory = 'media'"
          class="px-2.5 py-1 text-xs rounded-lg font-medium whitespace-nowrap transition-colors flex items-center gap-1.5"
          :class="activeFileCategory === 'media' ? 'bg-[#3390ec] text-white shadow-xs' : 'text-[#7f91a4] hover:bg-[#f1f1f1] dark:hover:bg-[#202b36]'"
        >
          <ImageIcon class="w-3 h-3" />
          <span>Media</span>
          <span class="text-[10px] opacity-80">({{ mediaFiles.length }})</span>
        </button>

        <button
          @click="activeFileCategory = 'docs'"
          class="px-2.5 py-1 text-xs rounded-lg font-medium whitespace-nowrap transition-colors flex items-center gap-1.5"
          :class="activeFileCategory === 'docs' ? 'bg-[#3390ec] text-white shadow-xs' : 'text-[#7f91a4] hover:bg-[#f1f1f1] dark:hover:bg-[#202b36]'"
        >
          <FileText class="w-3 h-3" />
          <span>Docs</span>
          <span class="text-[10px] opacity-80">({{ docFiles.length }})</span>
        </button>

        <button
          @click="activeFileCategory = 'audio'"
          class="px-2.5 py-1 text-xs rounded-lg font-medium whitespace-nowrap transition-colors flex items-center gap-1.5"
          :class="activeFileCategory === 'audio' ? 'bg-[#3390ec] text-white shadow-xs' : 'text-[#7f91a4] hover:bg-[#f1f1f1] dark:hover:bg-[#202b36]'"
        >
          <Music class="w-3 h-3" />
          <span>Audio</span>
          <span class="text-[10px] opacity-80">({{ audioFiles.length }})</span>
        </button>
      </div>

      <!-- Scrollable Files Container -->
      <div class="flex-1 overflow-y-auto p-3">
        <!-- Empty State -->
        <div
          v-if="filteredFiles.length === 0"
          class="flex flex-col items-center justify-center h-64 text-center p-6 text-[#7f91a4]"
        >
          <div class="w-12 h-12 rounded-2xl bg-[#3390ec]/10 flex items-center justify-center text-[#3390ec] mb-3">
            <FolderOpen class="w-6 h-6" />
          </div>
          <p class="text-xs font-semibold text-gray-800 dark:text-white/90">
            {{ fileSearchQuery ? 'No matching files found' : 'No shared files yet' }}
          </p>
          <p class="text-[11px] mt-1 text-[#7f91a4] max-w-[200px]">
            {{ fileSearchQuery ? 'Try another search term or filter' : 'Photos, videos, audio, and documents shared in this chat will appear here' }}
          </p>
        </div>

        <!-- Media Grid View (when category is Media) -->
        <div
          v-else-if="activeFileCategory === 'media'"
          class="grid grid-cols-3 gap-1.5"
        >
          <div
            v-for="file in filteredFiles"
            :key="file.id"
            @click="uiStore.openFilePreview(file)"
            class="relative aspect-square rounded-lg overflow-hidden bg-black/10 dark:bg-black/40 group cursor-pointer border border-transparent hover:border-[#3390ec]/60 transition-all"
            :title="file.name"
          >
            <img
              v-if="isImageFile(file)"
              :src="mmApi.getFileThumbnailUrl(file.id)"
              class="w-full h-full object-cover transition-transform group-hover:scale-105"
              loading="lazy"
            />
            <div
              v-else-if="isVideoFile(file)"
              class="w-full h-full flex flex-col items-center justify-center bg-black/60 text-white"
            >
              <Film class="w-6 h-6" />
              <span class="text-[10px] mt-1 text-white/80 font-mono">Video</span>
            </div>

            <!-- Hover overlay with actions -->
            <div class="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 flex items-center justify-center gap-1.5 text-white transition-opacity">
              <button
                @click.stop="uiStore.openFilePreview(file)"
                class="p-1.5 rounded-full bg-black/50 hover:bg-[#3390ec] text-white transition-colors"
                title="Preview"
              >
                <ZoomIn class="w-4 h-4 drop-shadow" />
              </button>
              <button
                v-if="file.post_id"
                @click.stop="jumpToFileMessage(file)"
                class="p-1.5 rounded-full bg-black/50 hover:bg-[#3390ec] text-white transition-colors"
                title="Go to message (نمایش در چت)"
              >
                <MessageSquare class="w-4 h-4 drop-shadow" />
              </button>
              <a
                :href="mmApi.getFileDownloadUrl(file.id)"
                :download="file.name"
                target="_blank"
                class="p-1.5 rounded-full bg-black/50 hover:bg-[#3390ec] text-white transition-colors"
                title="Download"
                @click.stop
              >
                <Download class="w-4 h-4 drop-shadow" />
              </a>
            </div>

            <!-- Size badge -->
            <div class="absolute bottom-1 right-1 text-[9px] px-1 py-0.5 rounded bg-black/60 backdrop-blur-xs text-white/90 font-mono pointer-events-none">
              {{ formatFileSize(file.size) }}
            </div>
          </div>
        </div>

        <!-- Files & Audio List View (when category is Docs or Audio) -->
        <div
          v-else-if="activeFileCategory === 'docs' || activeFileCategory === 'audio'"
          class="space-y-1.5"
        >
          <div
            v-for="file in filteredFiles"
            :key="file.id"
            class="flex items-center gap-3 p-2.5 rounded-xl hover:bg-[#f1f1f1] dark:hover:bg-[#202b36] transition-colors group"
          >
            <!-- Audio Play Button OR File Type Icon -->
            <button
              v-if="isAudioFile(file)"
              @click.stop="togglePlayAudio(file)"
              class="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 transition-transform hover:scale-105 active:scale-95"
              :class="playingAudioId === file.id ? 'bg-[#3390ec] text-white' : 'bg-purple-500/15 text-purple-500'"
              title="Play audio preview"
            >
              <Pause v-if="playingAudioId === file.id" class="w-4 h-4 animate-pulse" />
              <Play v-else class="w-4 h-4 fill-current ml-0.5" />
            </button>
            <div
              v-else
              class="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
              :class="getFileCategoryColor(file)"
            >
              <component :is="getFileCategoryIcon(file)" class="w-4 h-4" />
            </div>

            <!-- File Info -->
            <div class="flex-1 min-w-0 pr-1">
              <div class="text-xs font-semibold text-gray-900 dark:text-white truncate">
                {{ file.name }}
              </div>
              <div class="text-[11px] text-[#7f91a4] mt-0.5 flex items-center gap-2">
                <span>{{ formatFileSize(file.size) }}</span>
                <span>·</span>
                <span>{{ formatMessageTime(file.create_at) }}</span>
              </div>
            </div>

            <!-- Actions -->
            <div class="flex items-center gap-0.5 shrink-0">
              <!-- Jump to Message -->
              <button
                v-if="file.post_id"
                @click.stop="jumpToFileMessage(file)"
                class="p-1.5 text-[#7f91a4] hover:text-[#3390ec] hover:bg-black/5 dark:hover:bg-white/10 rounded-lg transition-colors"
                title="Go to message in chat (نمایش در گفتگو)"
              >
                <MessageSquare class="w-4 h-4" />
              </button>

              <!-- Copy Link -->
              <button
                @click.stop="copyFileUrl(file)"
                class="p-1.5 text-[#7f91a4] hover:text-[#3390ec] hover:bg-black/5 dark:hover:bg-white/10 rounded-lg transition-colors"
                title="Copy file link"
              >
                <Check v-if="copiedFileId === file.id" class="w-4 h-4 text-emerald-400" />
                <Copy v-else class="w-4 h-4" />
              </button>

              <!-- Download Button -->
              <a
                :href="mmApi.getFileDownloadUrl(file.id)"
                :download="file.name"
                target="_blank"
                class="p-1.5 text-[#7f91a4] hover:text-[#3390ec] hover:bg-black/5 dark:hover:bg-white/10 rounded-lg transition-colors"
                title="Download file"
                @click.stop
              >
                <Download class="w-4 h-4" />
              </a>
            </div>
          </div>
        </div>

        <!-- Category: 'All' Mixed View -->
        <div v-else class="space-y-4">
          <!-- Media Subsection in All view -->
          <div v-if="mediaFiles.length > 0 && !fileSearchQuery">
            <div class="flex items-center justify-between mb-2 px-1">
              <span class="text-[11px] font-bold text-[#7f91a4] uppercase tracking-wider flex items-center gap-1.5">
                <ImageIcon class="w-3 h-3" />
                Media ({{ mediaFiles.length }})
              </span>
              <button
                @click="activeFileCategory = 'media'"
                class="text-[11px] text-[#3390ec] hover:underline font-semibold"
              >
                View all
              </button>
            </div>
            <div class="grid grid-cols-3 gap-1.5">
              <div
                v-for="file in mediaFiles.slice(0, 6)"
                :key="file.id"
                @click="uiStore.openFilePreview(file)"
                class="relative aspect-square rounded-lg overflow-hidden bg-black/10 dark:bg-black/40 group cursor-pointer border border-transparent hover:border-[#3390ec]/60 transition-all"
                :title="file.name"
              >
                <img
                  v-if="isImageFile(file)"
                  :src="mmApi.getFileThumbnailUrl(file.id)"
                  class="w-full h-full object-cover transition-transform group-hover:scale-105"
                  loading="lazy"
                />
                <div v-else class="w-full h-full flex items-center justify-center bg-black/60 text-white">
                  <Film class="w-5 h-5" />
                </div>

                <!-- Hover actions -->
                <div class="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 flex items-center justify-center gap-1.5 text-white transition-opacity">
                  <button
                    @click.stop="uiStore.openFilePreview(file)"
                    class="p-1.5 rounded-full bg-black/50 hover:bg-[#3390ec] text-white transition-colors"
                    title="Preview"
                  >
                    <ZoomIn class="w-4 h-4 drop-shadow" />
                  </button>
                  <button
                    v-if="file.post_id"
                    @click.stop="jumpToFileMessage(file)"
                    class="p-1.5 rounded-full bg-black/50 hover:bg-[#3390ec] text-white transition-colors"
                    title="Go to message"
                  >
                    <MessageSquare class="w-4 h-4 drop-shadow" />
                  </button>
                  <a
                    :href="mmApi.getFileDownloadUrl(file.id)"
                    :download="file.name"
                    target="_blank"
                    class="p-1.5 rounded-full bg-black/50 hover:bg-[#3390ec] text-white transition-colors"
                    title="Download"
                    @click.stop
                  >
                    <Download class="w-4 h-4 drop-shadow" />
                  </a>
                </div>
              </div>
            </div>
          </div>

          <!-- Documents and Audio Subsection in All view -->
          <div>
            <div v-if="!fileSearchQuery && (docFiles.length > 0 || audioFiles.length > 0)" class="flex items-center justify-between mb-2 px-1">
              <span class="text-[11px] font-bold text-[#7f91a4] uppercase tracking-wider flex items-center gap-1.5">
                <FileText class="w-3 h-3" />
                Files & Audio ({{ docFiles.length + audioFiles.length }})
              </span>
            </div>

            <div class="space-y-1.5">
              <div
                v-for="file in (fileSearchQuery ? filteredFiles : [...docFiles, ...audioFiles])"
                :key="file.id"
                class="flex items-center gap-3 p-2.5 rounded-xl hover:bg-[#f1f1f1] dark:hover:bg-[#202b36] transition-colors group"
                @click="isImageFile(file) || isVideoFile(file) ? uiStore.openFilePreview(file) : null"
              >
                <!-- Thumbnail or File Icon -->
                <div
                  v-if="isImageFile(file)"
                  class="w-9 h-9 rounded-xl overflow-hidden bg-black/10 shrink-0 cursor-pointer"
                >
                  <img :src="mmApi.getFileThumbnailUrl(file.id)" class="w-full h-full object-cover" />
                </div>
                <button
                  v-else-if="isAudioFile(file)"
                  @click.stop="togglePlayAudio(file)"
                  class="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 transition-transform hover:scale-105 active:scale-95"
                  :class="playingAudioId === file.id ? 'bg-[#3390ec] text-white' : 'bg-purple-500/15 text-purple-500'"
                  title="Play audio preview"
                >
                  <Pause v-if="playingAudioId === file.id" class="w-4 h-4 animate-pulse" />
                  <Play v-else class="w-4 h-4 fill-current ml-0.5" />
                </button>
                <div
                  v-else
                  class="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
                  :class="getFileCategoryColor(file)"
                >
                  <component :is="getFileCategoryIcon(file)" class="w-4 h-4" />
                </div>

                <!-- Info -->
                <div class="flex-1 min-w-0 pr-1">
                  <div class="text-xs font-semibold text-gray-900 dark:text-white truncate">
                    {{ file.name }}
                  </div>
                  <div class="text-[11px] text-[#7f91a4] mt-0.5 flex items-center gap-2">
                    <span>{{ formatFileSize(file.size) }}</span>
                    <span>·</span>
                    <span>{{ formatMessageTime(file.create_at) }}</span>
                  </div>
                </div>

                <!-- Actions -->
                <div class="flex items-center gap-0.5 shrink-0">
                  <button
                    v-if="file.post_id"
                    @click.stop="jumpToFileMessage(file)"
                    class="p-1.5 text-[#7f91a4] hover:text-[#3390ec] hover:bg-black/5 dark:hover:bg-white/10 rounded-lg transition-colors"
                    title="Go to message in chat (نمایش در گفتگو)"
                  >
                    <MessageSquare class="w-4 h-4" />
                  </button>

                  <button
                    @click.stop="copyFileUrl(file)"
                    class="p-1.5 text-[#7f91a4] hover:text-[#3390ec] hover:bg-black/5 dark:hover:bg-white/10 rounded-lg transition-colors"
                    title="Copy file link"
                  >
                    <Check v-if="copiedFileId === file.id" class="w-4 h-4 text-emerald-400" />
                    <Copy v-else class="w-4 h-4" />
                  </button>

                  <a
                    :href="mmApi.getFileDownloadUrl(file.id)"
                    :download="file.name"
                    target="_blank"
                    class="p-1.5 text-[#7f91a4] hover:text-[#3390ec] hover:bg-black/5 dark:hover:bg-white/10 rounded-lg transition-colors"
                    title="Download file"
                    @click.stop
                  >
                    <Download class="w-4 h-4" />
                  </a>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- History Scan Status & Actions Footer -->
        <div class="mt-6 pt-4 border-t border-[#dfe1e5]/60 dark:border-[#202b36]/60 text-center">
          <div v-if="isScanningAll" class="flex flex-col items-center justify-center gap-1.5 text-xs text-[#3390ec] py-2 animate-in fade-in">
            <Loader2 class="w-4 h-4 animate-spin" />
            <span class="font-medium">Scanning entire chat history for files...</span>
            <span class="text-[11px] text-[#7f91a4]">({{ allFiles.length }} files found so far)</span>
          </div>

          <div v-else-if="isAllScanned" class="flex flex-col items-center justify-center gap-1.5 text-xs text-[#7f91a4] py-1">
            <div class="flex items-center gap-1.5 text-emerald-500 font-medium">
              <Check class="w-3.5 h-3.5" />
              <span>Entire chat history scanned</span>
            </div>
            <p class="text-[11px] text-[#7f91a4]">
              {{ allFiles.length }} shared file{{ allFiles.length === 1 ? '' : 's' }} in this conversation
            </p>
            <button
              @click="triggerFullScan(true)"
              class="mt-1 px-3 py-1 text-[11px] font-medium rounded-lg text-[#3390ec] hover:bg-[#3390ec]/10 transition-colors flex items-center gap-1.5 cursor-pointer"
            >
              <RotateCw class="w-3 h-3" />
              <span>Rescan history</span>
            </button>
          </div>

          <button
            v-else
            @click="triggerFullScan(false)"
            class="w-full py-2 px-3 text-xs font-medium rounded-xl border border-[#dfe1e5] dark:border-[#202b36] hover:bg-[#f1f1f1] dark:hover:bg-[#202b36] text-[#7f91a4] hover:text-gray-900 dark:hover:text-white transition-colors flex items-center justify-center gap-2 cursor-pointer"
          >
            <Search class="w-3.5 h-3.5 text-[#3390ec]" />
            <span>Scan entire chat history for all files</span>
          </button>
        </div>
      </div>
    </div>

    <!-- Add Channel Members Modal -->
    <AddChannelMembersModal
      :isOpen="showAddMemberModal"
      :channel="channel"
      :existingMemberUserIds="rawChannelMembers.map((m) => m.user_id)"
      @close="showAddMemberModal = false"
      @added="loadChannelMembers"
    />

    <!-- Manage Channel Member Modal -->
    <ManageMemberModal
      :isOpen="showManageMemberModal"
      :channel="channel"
      :user="selectedMemberToManage?.user || null"
      :member="selectedMemberToManage?.member || null"
      :canManage="selectedMemberToManage?.canManage || false"
      :canRemove="selectedMemberToManage?.canRemove || false"
      :isOwner="selectedMemberToManage?.isOwner || false"
      :isAdmin="selectedMemberToManage?.isAdmin || false"
      @close="showManageMemberModal = false"
      @updated="loadChannelMembers"
    />
  </div>
</template>
