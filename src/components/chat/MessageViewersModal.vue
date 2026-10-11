<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import { mmApi } from '../../services/mattermostApi'
import { useAuthStore } from '../../stores/auth'
import { useChatStore } from '../../stores/chat'
import { useUsersStore } from '../../stores/users'
import type { MattermostPost, MattermostChannelMember, MattermostReaction, MattermostUser } from '../../types/mattermost'
import TelegramAvatar from '../common/TelegramAvatar.vue'
import { formatMessageTime, formatViewedAtTime } from '../../utils/formatters'
import { toEmojiChar } from '../../utils/reactions'
import {
  Eye,
  SmilePlus,
  X,
  Loader2,
  CheckCheck,
  Users
} from 'lucide-vue-next'

const props = withDefaults(
  defineProps<{
    post: MattermostPost | null
    isOpen: boolean
    initialTab?: 'viewers' | 'reactions'
  }>(),
  {
    initialTab: 'viewers'
  }
)

const emit = defineEmits<{
  (e: 'close'): void
}>()

const authStore = useAuthStore()
const chatStore = useChatStore()
const usersStore = useUsersStore()

const activeTab = ref<'viewers' | 'reactions'>('viewers')
const isLoadingViewers = ref(false)
const isLoadingReactions = ref(false)

interface ViewerItem {
  userId: string
  member?: MattermostChannelMember
  user?: MattermostUser
  isMe: boolean
  viewedAt: number
}

const viewersList = ref<ViewerItem[]>([])
const reactionsList = ref<MattermostReaction[]>([])
const selectedEmojiFilter = ref<string>('all')

// Post Sender Info
const senderName = computed(() => {
  if (!props.post) return ''
  if (props.post.user_id === authStore.currentUser?.id) return 'You'
  return usersStore.getUserDisplayName(props.post.user_id)
})

const postTime = computed(() => {
  return props.post ? formatMessageTime(props.post.create_at) : ''
})

// Snippet of post message
const messageSnippet = computed(() => {
  if (!props.post?.message) return '(Attachment or media)'
  const cleaned = props.post.message.trim()
  return cleaned.length > 90 ? cleaned.slice(0, 90) + '…' : cleaned
})

// Unique emojis in reactions
const uniqueReactionEmojis = computed(() => {
  const map = new Map<string, { raw: string; char: string; count: number }>()
  for (const r of reactionsList.value) {
    const char = toEmojiChar(r.emoji_name)
    if (!map.has(char)) {
      map.set(char, { raw: r.emoji_name, char, count: 0 })
    }
    map.get(char)!.count++
  }
  return Array.from(map.values())
})

// Filtered reactions by selected emoji
const filteredReactions = computed(() => {
  if (selectedEmojiFilter.value === 'all') {
    return reactionsList.value
  }
  return reactionsList.value.filter((r) => toEmojiChar(r.emoji_name) === selectedEmojiFilter.value)
})

async function loadData() {
  if (!props.post) return

  activeTab.value = props.initialTab || 'viewers'
  selectedEmojiFilter.value = 'all'

  isLoadingViewers.value = true
  isLoadingReactions.value = true
  viewersList.value = []
  reactionsList.value = []

  const postCreateAt = props.post.create_at
  const postAuthorId = props.post.user_id
  const channelId = props.post.channel_id
  const myId = authStore.currentUser?.id

  function dedupeReactions(list: MattermostReaction[]): MattermostReaction[] {
    const map = new Map<string, MattermostReaction>()
    for (const r of list) {
      const key = `${r.user_id}_${toEmojiChar(r.emoji_name)}`
      if (!map.has(key)) {
        map.set(key, r)
      }
    }
    return Array.from(map.values())
  }

  // Map: userId -> viewedAt timestamp
  const viewersMap = new Map<string, number>()

  // 1. Fetch channel members & immediately load their status/presence
  let members: MattermostChannelMember[] = []
  try {
    members = await mmApi.getChannelMembers(channelId, 0, 100)
    if (Array.isArray(members)) {
      const allMemberIds = members.map((m) => m.user_id).filter(Boolean)
      if (allMemberIds.length > 0) {
        await Promise.all([
          usersStore.fetchUsers(allMemberIds),
          usersStore.fetchStatuses(allMemberIds)
        ])
      }
    }
  } catch (err) {
    console.error('Failed to load channel members:', err)
  }

  // 2. Reactions on this post (cached first)
  const cachedReactions = props.post.metadata?.reactions || []
  reactionsList.value = dedupeReactions(cachedReactions)
  for (const r of reactionsList.value) {
    if (r.user_id && r.user_id !== postAuthorId) {
      const time = (r as any).create_at || postCreateAt
      viewersMap.set(r.user_id, Math.max(viewersMap.get(r.user_id) || 0, time))
    }
  }

  // 3. Fetch fresh reactions asynchronously
  const reactionsPromise = mmApi
    .getPostReactions(props.post.id)
    .then(async (fresh) => {
      if (Array.isArray(fresh)) {
        const deduped = dedupeReactions(fresh)
        reactionsList.value = deduped
        if (props.post?.metadata) {
          props.post.metadata.reactions = deduped
        }
        for (const r of deduped) {
          if (r.user_id && r.user_id !== postAuthorId) {
            const time = (r as any).create_at || postCreateAt
            viewersMap.set(r.user_id, Math.max(viewersMap.get(r.user_id) || 0, time))
          }
        }
        const reactUserIds = deduped.map((r) => r.user_id).filter(Boolean)
        if (reactUserIds.length > 0) {
          await usersStore.fetchUsers(reactUserIds)
        }
      }
    })
    .catch((err) => {
      console.error('Failed to load post reactions:', err)
    })
    .finally(() => {
      isLoadingReactions.value = false
    })

  // 4. Channel members with explicit view / update timestamps
  for (const m of members) {
    if (m.user_id && m.user_id !== postAuthorId) {
      const viewedAt = m.last_viewed_at || (m as any).last_update_at || 0
      if (viewedAt >= postCreateAt - 5000) {
        viewersMap.set(m.user_id, Math.max(viewersMap.get(m.user_id) || 0, viewedAt))
      }
    }
  }

  // 5. WebSocket channel_viewed events recorded in chatStore
  const wsViews = chatStore.channelViewedByUser[channelId]
  if (wsViews) {
    for (const [uid, time] of Object.entries(wsViews)) {
      if (uid && uid !== postAuthorId && time >= postCreateAt - 5000) {
        viewersMap.set(uid, Math.max(viewersMap.get(uid) || 0, time))
      }
    }
  }

  // 6. Subsequent posts & reactions in this channel
  const channelPosts = chatStore.posts[channelId] || []
  for (const p of channelPosts) {
    if (p.create_at > postCreateAt) {
      if (p.user_id && p.user_id !== postAuthorId && !p.id.startsWith('temp_')) {
        viewersMap.set(p.user_id, Math.max(viewersMap.get(p.user_id) || 0, p.create_at))
      }
      const pReactions = p.metadata?.reactions || []
      for (const pr of pReactions) {
        if (pr.user_id && pr.user_id !== postAuthorId) {
          const time = (pr as any).create_at || p.create_at
          viewersMap.set(pr.user_id, Math.max(viewersMap.get(pr.user_id) || 0, time))
        }
      }
    }
  }

  // 7. Presence and recent activity of channel members
  const currentChannel = chatStore.channels.find((c) => c.id === channelId)
  const isDm = currentChannel?.type === 'D'

  for (const m of members) {
    if (!m.user_id || m.user_id === postAuthorId) continue
    const lastAct = usersStore.lastActivityAt[m.user_id] || 0
    const isOnline = usersStore.getStatus(m.user_id) === 'online'

    if (isDm) {
      if (lastAct >= postCreateAt - 5000) {
        viewersMap.set(m.user_id, Math.max(viewersMap.get(m.user_id) || 0, lastAct))
      } else if (isOnline && Date.now() - postCreateAt > 3000) {
        viewersMap.set(m.user_id, Math.max(viewersMap.get(m.user_id) || 0, Date.now()))
      }
    } else {
      if (lastAct >= postCreateAt - 5000) {
        viewersMap.set(m.user_id, Math.max(viewersMap.get(m.user_id) || 0, lastAct))
      }
    }
  }

  // 8. If viewing user is not author, they are seeing it right now
  if (myId && myId !== postAuthorId) {
    viewersMap.set(myId, Math.max(viewersMap.get(myId) || 0, Date.now()))
  }

  await reactionsPromise

  try {
    const userIds = Array.from(viewersMap.keys())
    if (userIds.length > 0) {
      await Promise.all([
        usersStore.fetchUsers(userIds),
        usersStore.fetchStatuses(userIds)
      ])
    }

    const items: ViewerItem[] = userIds.map((uid) => ({
      userId: uid,
      user: usersStore.getUser(uid),
      isMe: uid === myId,
      viewedAt: viewersMap.get(uid) || postCreateAt
    }))

    items.sort((a, b) => b.viewedAt - a.viewedAt)
    viewersList.value = items
  } catch (err) {
    console.error('Failed to resolve viewers:', err)
  } finally {
    isLoadingViewers.value = false
  }
}

watch(
  () => [props.isOpen, props.post?.id],
  ([isOpen]) => {
    if (isOpen && props.post) {
      loadData()
    }
  },
  { immediate: true }
)

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape' && props.isOpen) {
    emit('close')
  }
}

onMounted(() => {
  window.addEventListener('keydown', onKeydown)
})

onUnmounted(() => {
  window.removeEventListener('keydown', onKeydown)
})
</script>

<template>
  <div v-if="isOpen && post" class="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 select-none">
    <!-- Backdrop -->
    <div
      class="absolute inset-0 bg-black/60 backdrop-blur-xs transition-opacity animate-in fade-in duration-150"
      @click="emit('close')"
    ></div>

    <!-- Modal Box -->
    <div
      class="relative w-full max-w-md bg-[#17212b] dark:bg-[#17212b] bg-white border border-[#202b36] dark:border-[#202b36] border-[#dfe1e5] rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh] animate-in zoom-in-95 duration-150"
    >
      <!-- Header -->
      <div class="px-4 py-3 border-b border-[#202b36] dark:border-[#202b36] border-[#dfe1e5] flex items-center justify-between">
        <div class="flex items-center gap-2">
          <div class="w-8 h-8 rounded-full bg-[#3390ec]/15 flex items-center justify-center text-[#3390ec]">
            <Eye v-if="activeTab === 'viewers'" class="w-4 h-4" />
            <SmilePlus v-else class="w-4 h-4" />
          </div>
          <div>
            <h3 class="text-sm font-semibold text-[#f5f5f5] dark:text-[#f5f5f5] text-[#111827]">
              Message Info
            </h3>
            <p class="text-[11px] text-[#7f91a4]">
              {{ viewersList.length }} {{ viewersList.length === 1 ? 'viewer' : 'viewers' }} • {{ reactionsList.length }} {{ reactionsList.length === 1 ? 'reaction' : 'reactions' }}
            </p>
          </div>
        </div>

        <button
          @click="emit('close')"
          class="p-1.5 text-[#7f91a4] hover:text-[#f5f5f5] dark:hover:text-[#f5f5f5] hover:text-[#111827] rounded-full hover:bg-[#202b36] dark:hover:bg-[#202b36] hover:bg-gray-100 transition-colors"
          title="Close"
        >
          <X class="w-4 h-4" />
        </button>
      </div>

      <!-- Message Snippet Preview -->
      <div class="px-4 py-2.5 bg-[#0e1621]/60 dark:bg-[#0e1621]/60 bg-gray-50 border-b border-[#202b36] dark:border-[#202b36] border-[#dfe1e5] flex items-start gap-2.5 text-xs">
        <TelegramAvatar
          :userId="post.user_id"
          :name="senderName"
          size="xs"
          class="mt-0.5 shrink-0"
        />
        <div class="flex-1 min-w-0">
          <div class="flex items-center justify-between gap-1 text-[11px]">
            <span class="font-semibold text-[#3390ec] truncate">{{ senderName }}</span>
            <span class="text-[#7f91a4] shrink-0">{{ postTime }}</span>
          </div>
          <p class="text-[11px] text-[#f5f5f5] dark:text-[#f5f5f5] text-[#374151] line-clamp-2 mt-0.5" dir="auto">
            {{ messageSnippet }}
          </p>
        </div>
      </div>

      <!-- Tabs Navigation -->
      <div class="flex border-b border-[#202b36] dark:border-[#202b36] border-[#dfe1e5] bg-[#17212b] dark:bg-[#17212b] bg-white">
        <!-- Viewers Tab Button -->
        <button
          @click="activeTab = 'viewers'"
          class="flex-1 py-2.5 text-xs font-semibold flex items-center justify-center gap-2 border-b-2 transition-colors cursor-pointer"
          :class="[
            activeTab === 'viewers'
              ? 'border-[#3390ec] text-[#3390ec]'
              : 'border-transparent text-[#7f91a4] hover:text-[#f5f5f5] dark:hover:text-[#f5f5f5] hover:text-[#111827]'
          ]"
        >
          <Eye class="w-3.5 h-3.5" />
          <span>Viewers</span>
          <span
            class="px-1.5 py-0.2 rounded-full text-[10px] font-bold"
            :class="activeTab === 'viewers' ? 'bg-[#3390ec]/20 text-[#3390ec]' : 'bg-gray-500/20 text-[#7f91a4]'"
          >
            {{ viewersList.length }}
          </span>
        </button>

        <!-- Reactions Tab Button -->
        <button
          @click="activeTab = 'reactions'"
          class="flex-1 py-2.5 text-xs font-semibold flex items-center justify-center gap-2 border-b-2 transition-colors cursor-pointer"
          :class="[
            activeTab === 'reactions'
              ? 'border-[#3390ec] text-[#3390ec]'
              : 'border-transparent text-[#7f91a4] hover:text-[#f5f5f5] dark:hover:text-[#f5f5f5] hover:text-[#111827]'
          ]"
        >
          <SmilePlus class="w-3.5 h-3.5" />
          <span>Reactions</span>
          <span
            class="px-1.5 py-0.2 rounded-full text-[10px] font-bold"
            :class="activeTab === 'reactions' ? 'bg-[#3390ec]/20 text-[#3390ec]' : 'bg-gray-500/20 text-[#7f91a4]'"
          >
            {{ reactionsList.length }}
          </span>
        </button>
      </div>

      <!-- Tab Content Area -->
      <div class="flex-1 overflow-y-auto min-h-[220px] max-h-[360px] p-2 space-y-1">
        <!-- ================= VIEWERS TAB ================= -->
        <template v-if="activeTab === 'viewers'">
          <!-- Loading -->
          <div v-if="isLoadingViewers" class="flex flex-col items-center justify-center py-12 text-[#7f91a4] text-xs">
            <Loader2 class="w-6 h-6 animate-spin text-[#3390ec] mb-2" />
            <span>Loading viewers...</span>
          </div>

          <!-- Empty State -->
          <div
            v-else-if="viewersList.length === 0"
            class="flex flex-col items-center justify-center py-10 text-center px-4"
          >
            <div class="w-12 h-12 rounded-full bg-[#202b36] dark:bg-[#202b36] bg-gray-100 flex items-center justify-center text-[#7f91a4] mb-3">
              <Eye class="w-6 h-6 opacity-60" />
            </div>
            <p class="text-xs font-semibold text-[#f5f5f5] dark:text-[#f5f5f5] text-[#111827] mb-1">
              No viewers yet
            </p>
            <p class="text-[11px] text-[#7f91a4] max-w-xs">
              No other members have opened this conversation since this message was posted.
            </p>
          </div>

          <!-- Viewers List -->
          <div v-else class="space-y-1">
            <div
              v-for="item in viewersList"
              :key="item.userId"
              class="flex items-center justify-between gap-3 p-2 rounded-xl hover:bg-[#202b36]/60 dark:hover:bg-[#202b36]/60 hover:bg-gray-100/80 transition-colors"
            >
              <!-- Avatar & Name -->
              <div class="flex items-center gap-2.5 min-w-0">
                <TelegramAvatar
                  :userId="item.userId"
                  :name="usersStore.getUserDisplayName(item.userId)"
                  size="md"
                  showOnlineDot
                  :isOnline="usersStore.getStatus(item.userId) === 'online'"
                />
                <div class="min-w-0">
                  <div class="flex items-center gap-1.5">
                    <span
                      class="text-xs font-semibold truncate"
                      :class="item.isMe ? 'text-[#3390ec]' : 'text-[#f5f5f5] dark:text-[#f5f5f5] text-[#111827]'"
                    >
                      {{ item.isMe ? 'You' : usersStore.getUserDisplayName(item.userId) }}
                    </span>
                    <span v-if="item.user?.username" class="text-[10px] text-[#7f91a4] truncate">
                      @{{ item.user.username }}
                    </span>
                  </div>
                  <p class="text-[10px] text-emerald-400 flex items-center gap-1 mt-0.5">
                    <CheckCheck class="w-3 h-3 text-emerald-400" />
                    <span>Seen {{ formatViewedAtTime(item.viewedAt) || 'recently' }}</span>
                  </p>
                </div>
              </div>
            </div>
          </div>
        </template>

        <!-- ================= REACTIONS TAB ================= -->
        <template v-else-if="activeTab === 'reactions'">
          <!-- Reactions Filter Badges -->
          <div
            v-if="uniqueReactionEmojis.length > 0"
            class="flex items-center gap-1.5 px-2 py-1.5 overflow-x-auto no-scrollbar border-b border-[#202b36] dark:border-[#202b36] border-[#dfe1e5] mb-1"
          >
            <button
              @click="selectedEmojiFilter = 'all'"
              class="px-2.5 py-1 rounded-full text-xs font-medium transition-colors cursor-pointer shrink-0"
              :class="[
                selectedEmojiFilter === 'all'
                  ? 'bg-[#3390ec] text-white font-semibold'
                  : 'bg-[#202b36] dark:bg-[#202b36] bg-gray-100 text-[#7f91a4] hover:text-[#f5f5f5] dark:hover:text-[#f5f5f5] hover:text-[#111827]'
              ]"
            >
              All {{ reactionsList.length }}
            </button>
            <button
              v-for="item in uniqueReactionEmojis"
              :key="item.char"
              @click="selectedEmojiFilter = item.char"
              class="px-2 py-1 rounded-full text-xs font-medium flex items-center gap-1 transition-colors cursor-pointer shrink-0"
              :class="[
                selectedEmojiFilter === item.char
                  ? 'bg-[#3390ec] text-white font-semibold'
                  : 'bg-[#202b36] dark:bg-[#202b36] bg-gray-100 text-[#7f91a4] hover:text-[#f5f5f5] dark:hover:text-[#f5f5f5] hover:text-[#111827]'
              ]"
            >
              <span>{{ item.char }}</span>
              <span class="text-[10px]">{{ item.count }}</span>
            </button>
          </div>

          <!-- Loading -->
          <div v-if="isLoadingReactions" class="flex flex-col items-center justify-center py-12 text-[#7f91a4] text-xs">
            <Loader2 class="w-6 h-6 animate-spin text-[#3390ec] mb-2" />
            <span>Loading reactions...</span>
          </div>

          <!-- Empty State -->
          <div
            v-else-if="reactionsList.length === 0"
            class="flex flex-col items-center justify-center py-10 text-center px-4"
          >
            <div class="w-12 h-12 rounded-full bg-[#202b36] dark:bg-[#202b36] bg-gray-100 flex items-center justify-center text-[#7f91a4] mb-3">
              <SmilePlus class="w-6 h-6 opacity-60" />
            </div>
            <p class="text-xs font-semibold text-[#f5f5f5] dark:text-[#f5f5f5] text-[#111827] mb-1">
              No reactions yet
            </p>
            <p class="text-[11px] text-[#7f91a4] max-w-xs">
              Be the first to react to this message with an emoji!
            </p>
          </div>

          <!-- Reactions List -->
          <div v-else class="space-y-1">
            <div
              v-for="r in filteredReactions"
              :key="`${r.user_id}_${r.emoji_name}`"
              class="flex items-center justify-between gap-3 p-2 rounded-xl hover:bg-[#202b36]/60 dark:hover:bg-[#202b36]/60 hover:bg-gray-100/80 transition-colors"
            >
              <!-- Avatar & Name -->
              <div class="flex items-center gap-2.5 min-w-0">
                <TelegramAvatar
                  :userId="r.user_id"
                  :name="usersStore.getUserDisplayName(r.user_id)"
                  size="md"
                  showOnlineDot
                  :isOnline="usersStore.getStatus(r.user_id) === 'online'"
                />
                <div class="min-w-0">
                  <div class="flex items-center gap-1.5">
                    <span
                      class="text-xs font-semibold truncate"
                      :class="r.user_id === authStore.currentUser?.id ? 'text-[#3390ec]' : 'text-[#f5f5f5] dark:text-[#f5f5f5] text-[#111827]'"
                    >
                      {{ r.user_id === authStore.currentUser?.id ? 'You' : usersStore.getUserDisplayName(r.user_id) }}
                    </span>
                    <span v-if="usersStore.getUser(r.user_id)?.username" class="text-[10px] text-[#7f91a4] truncate">
                      @{{ usersStore.getUser(r.user_id)?.username }}
                    </span>
                  </div>
                  <p class="text-[10px] text-[#7f91a4] mt-0.5">
                    Reacted with {{ toEmojiChar(r.emoji_name) }}
                  </p>
                </div>
              </div>

              <!-- Big Reaction Emoji Badge -->
              <div class="w-9 h-9 rounded-full bg-[#202b36] dark:bg-[#202b36] bg-gray-100 flex items-center justify-center text-lg shadow-xs shrink-0 select-none">
                {{ toEmojiChar(r.emoji_name) }}
              </div>
            </div>
          </div>
        </template>
      </div>

      <!-- Footer -->
      <div class="p-3 bg-[#17212b] dark:bg-[#17212b] bg-white border-t border-[#202b36] dark:border-[#202b36] border-[#dfe1e5] flex justify-end">
        <button
          @click="emit('close')"
          class="px-4 py-1.5 rounded-xl bg-[#3390ec] hover:bg-[#2881db] text-white text-xs font-semibold transition-colors cursor-pointer shadow-md"
        >
          Close
        </button>
      </div>
    </div>
  </div>
</template>
