<script setup lang="ts">
import { ref, computed, watch, nextTick } from 'vue'
import { onClickOutside } from '@vueuse/core'
import { useAuthStore } from '../../stores/auth'
import { useUsersStore } from '../../stores/users'
import type { MattermostUser } from '../../types/mattermost'
import TelegramAvatar from '../common/TelegramAvatar.vue'
import { User as UserIcon, ChevronDown, Search, X, Check, Loader2 } from 'lucide-vue-next'

const props = withDefaults(
  defineProps<{
    modelValue: string
  }>(),
  {
    modelValue: ''
  }
)

const emit = defineEmits<{
  (e: 'update:modelValue', value: string): void
}>()

const authStore = useAuthStore()
const usersStore = useUsersStore()

const isOpen = ref(false)
const rootRef = ref<HTMLElement | null>(null)
const searchInputRef = ref<HTMLInputElement | null>(null)
const searchQuery = ref('')
const isSearchingServer = ref(false)
const serverResults = ref<MattermostUser[]>([])
let debounceTimer: any = null

onClickOutside(rootRef, () => {
  isOpen.value = false
})

const isMyself = computed(() => {
  return !props.modelValue || props.modelValue === authStore.currentUser?.id
})

const selectedUser = computed<MattermostUser | null>(() => {
  if (isMyself.value) return null
  return usersStore.users[props.modelValue] || null
})

// Team members list from cache
const localTeamMembers = computed(() => {
  const currentId = authStore.currentUser?.id
  return (Object.values(usersStore.users) as MattermostUser[])
    .filter(
      (u) =>
        u.id !== currentId &&
        !u.roles?.includes('system_bot') &&
        (u as any).is_bot !== true &&
        u.delete_at === 0
    )
})

// Filtered members combining local cache and server search
const displayedMembers = computed(() => {
  const q = searchQuery.value.trim().toLowerCase()
  if (!q) {
    return localTeamMembers.value.slice(0, 30)
  }

  // Combine and deduplicate
  const map = new Map<string, MattermostUser>()
  for (const u of localTeamMembers.value) {
    const fullName = `${u.first_name} ${u.last_name}`.toLowerCase()
    const username = (u.username || '').toLowerCase()
    const nickname = (u.nickname || '').toLowerCase()
    if (fullName.includes(q) || username.includes(q) || nickname.includes(q)) {
      map.set(u.id, u)
    }
  }

  for (const u of serverResults.value) {
    if (u.id !== authStore.currentUser?.id && !map.has(u.id)) {
      map.set(u.id, u)
    }
  }

  return Array.from(map.values())
})

// Search server when query changes
watch(searchQuery, (newVal) => {
  clearTimeout(debounceTimer)
  const q = newVal.trim()
  if (!q) {
    serverResults.value = []
    isSearchingServer.value = false
    return
  }

  debounceTimer = setTimeout(async () => {
    isSearchingServer.value = true
    try {
      const res = await usersStore.searchUsers(q, authStore.currentTeam?.id)
      serverResults.value = res.filter((u) => u.id !== authStore.currentUser?.id)
    } catch (e) {
      console.error('Failed to search users for todo assignee:', e)
    } finally {
      isSearchingServer.value = false
    }
  }, 250)
})

function toggleDropdown() {
  isOpen.value = !isOpen.value
  if (isOpen.value) {
    searchQuery.value = ''
    nextTick(() => {
      searchInputRef.value?.focus()
    })
  }
}

function selectMyself() {
  emit('update:modelValue', '')
  isOpen.value = false
}

function selectUser(user: MattermostUser) {
  emit('update:modelValue', user.id)
  isOpen.value = false
}

function clearAssignee(e?: MouseEvent) {
  if (e) e.stopPropagation()
  emit('update:modelValue', '')
}
</script>

<template>
  <div ref="rootRef" class="relative inline-block select-none text-xs">
    <!-- Trigger Button -->
    <div
      class="group flex items-center rounded-xl bg-[#f4f4f5] dark:bg-[#242f3d] border border-[#dfe1e5] dark:border-[#202b36] hover:border-[#3390ec]/60 transition-all text-[#111827] dark:text-[#f5f5f5] shadow-2xs"
      :class="{ 'border-[#3390ec] dark:border-[#3390ec]': isOpen }"
    >
      <button
        type="button"
        @click="toggleDropdown"
        class="flex items-center gap-1.5 px-3 py-1.5 cursor-pointer font-medium max-w-[190px] truncate"
      >
        <!-- Icon / Avatar -->
        <template v-if="isMyself">
          <div class="w-4 h-4 rounded-full bg-[#3390ec]/20 flex items-center justify-center text-[#3390ec] shrink-0">
            <UserIcon class="w-2.5 h-2.5" />
          </div>
          <span class="truncate">Assign: Myself</span>
        </template>
        <template v-else-if="selectedUser">
          <TelegramAvatar
            :userId="selectedUser.id"
            :name="usersStore.getUserDisplayName(selectedUser)"
            size="micro"
            class="shrink-0"
          />
          <span class="font-semibold truncate">
            {{ usersStore.getUserDisplayName(selectedUser) }}
          </span>
        </template>
        <template v-else>
          <UserIcon class="w-3.5 h-3.5 text-[#7f91a4] shrink-0" />
          <span class="truncate">Assign: User</span>
        </template>

        <ChevronDown
          class="w-3 h-3 text-[#7f91a4] transition-transform duration-150 shrink-0 ml-0.5"
          :class="{ 'rotate-180 text-[#3390ec]': isOpen }"
        />
      </button>

      <!-- Clear button (back to Myself) if other user selected -->
      <button
        v-if="!isMyself"
        type="button"
        @click="clearAssignee"
        class="pr-2 pl-0.5 text-[#7f91a4] hover:text-[#3390ec] dark:hover:text-[#3390ec] transition-colors cursor-pointer"
        title="Reset to Myself"
      >
        <X class="w-3 h-3" />
      </button>
    </div>

    <!-- Dropdown Menu -->
    <div
      v-if="isOpen"
      class="absolute left-0 top-full mt-1.5 z-50 w-72 bg-white dark:bg-[#1e2a36] border border-[#dfe1e5] dark:border-[#202b36] rounded-2xl shadow-2xl p-2 animate-in fade-in zoom-in-95 duration-100 origin-top-left"
    >
      <!-- Search Input -->
      <div class="relative flex items-center mb-2 px-1">
        <Search class="w-3.5 h-3.5 text-[#7f91a4] absolute left-3 pointer-events-none" />
        <input
          ref="searchInputRef"
          v-model="searchQuery"
          type="text"
          placeholder="Search team members..."
          class="w-full bg-[#f4f4f5] dark:bg-[#253241] border border-transparent focus:border-[#3390ec] rounded-xl pl-8 pr-7 py-1.5 text-xs text-[#111827] dark:text-[#f5f5f5] placeholder-[#7f91a4] outline-none transition-all"
        />
        <button
          v-if="searchQuery"
          type="button"
          @click="searchQuery = ''"
          class="absolute right-3 text-[#7f91a4] hover:text-[#111827] dark:hover:text-white"
        >
          <X class="w-3 h-3" />
        </button>
        <Loader2
          v-if="isSearchingServer"
          class="w-3 h-3 text-[#3390ec] animate-spin absolute right-3"
        />
      </div>

      <!-- Option 1: Myself (Default) -->
      <button
        type="button"
        @click="selectMyself"
        class="w-full flex items-center justify-between p-2 rounded-xl transition-colors cursor-pointer text-left"
        :class="[
          isMyself
            ? 'bg-[#3390ec]/15 dark:bg-[#3390ec]/25 text-[#3390ec]'
            : 'hover:bg-gray-100 dark:hover:bg-[#253241] text-[#111827] dark:text-[#f5f5f5]'
        ]"
      >
        <div class="flex items-center gap-2.5 min-w-0">
          <div class="w-7 h-7 rounded-full bg-[#3390ec]/20 flex items-center justify-center text-[#3390ec] shrink-0 font-bold">
            <UserIcon class="w-4 h-4" />
          </div>
          <div class="min-w-0">
            <p class="text-xs font-semibold leading-tight truncate">
              Myself (Default)
            </p>
            <p class="text-[10px] text-[#7f91a4] truncate">
              {{ authStore.currentUser?.username ? `@${authStore.currentUser.username}` : 'Assign to me' }}
            </p>
          </div>
        </div>
        <Check v-if="isMyself" class="w-4 h-4 text-[#3390ec] stroke-[2.5] shrink-0 ml-2" />
      </button>

      <div class="my-1.5 border-t border-[#dfe1e5]/60 dark:border-[#202b36]/80"></div>

      <!-- Section Label -->
      <div class="px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-[#7f91a4]">
        Team Members
      </div>

      <!-- Members List Scroll Area -->
      <div class="max-h-52 overflow-y-auto space-y-0.5 tg-scroll-container pr-1">
        <button
          v-for="user in displayedMembers"
          :key="user.id"
          type="button"
          @click="selectUser(user)"
          class="w-full flex items-center justify-between p-1.5 rounded-xl transition-colors cursor-pointer text-left"
          :class="[
            props.modelValue === user.id
              ? 'bg-[#3390ec]/15 dark:bg-[#3390ec]/25 text-[#3390ec]'
              : 'hover:bg-gray-100 dark:hover:bg-[#253241] text-[#111827] dark:text-[#f5f5f5]'
          ]"
        >
          <div class="flex items-center gap-2 min-w-0">
            <TelegramAvatar
              :userId="user.id"
              :name="usersStore.getUserDisplayName(user)"
              size="xs"
              class="shrink-0"
            />
            <div class="min-w-0">
              <p class="text-xs font-medium leading-tight truncate">
                {{ usersStore.getUserDisplayName(user) }}
              </p>
              <p class="text-[10px] text-[#7f91a4] truncate">
                @{{ user.username }}
              </p>
            </div>
          </div>
          <Check v-if="props.modelValue === user.id" class="w-4 h-4 text-[#3390ec] stroke-[2.5] shrink-0 ml-2" />
        </button>

        <!-- Empty State -->
        <div
          v-if="displayedMembers.length === 0 && !isSearchingServer"
          class="py-6 text-center text-[#7f91a4] text-xs"
        >
          No members found
        </div>
      </div>
    </div>
  </div>
</template>
