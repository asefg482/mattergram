<script setup lang="ts">
import { ref, watch } from 'vue'
import { useAuthStore } from '../../stores/auth'
import { useChatStore } from '../../stores/chat'
import { useUsersStore } from '../../stores/users'
import { useUiStore } from '../../stores/ui'
import { mmApi } from '../../services/mattermostApi'
import {
  renderTelegramMarkdown,
  formatMessageTime,
  toEmojiChar
} from '../../utils/formatters'
import type { MattermostPost, MattermostFileInfo } from '../../types/mattermost'
import TelegramAvatar from '../common/TelegramAvatar.vue'
import ReactionPicker from './ReactionPicker.vue'
import {
  Hash,
  X,
  MessageSquareText,
  CornerUpLeft,
  SmilePlus,
  MoreVertical,
  Copy,
  Check,
  Pin,
  Trash2,
  Loader2,
  ArrowUpRight,
  Download,
  Film
} from 'lucide-vue-next'

const authStore = useAuthStore()
const chatStore = useChatStore()
const usersStore = useUsersStore()
const uiStore = useUiStore()

const currentTag = ref(uiStore.activeHashtag || '')
const scope = ref<'all' | 'chat'>('chat')
const isLoading = ref(false)
const posts = ref<MattermostPost[]>([])

// Quick emoji reaction popover state per post
const activeReactionPickerPostId = ref<string | null>(null)
const activeMenuPostId = ref<string | null>(null)
const copiedPostId = ref<string | null>(null)

interface ReactionGroupItem {
  emoji: string
  rawName: string
  count: number
  hasReacted: boolean
}

function getPostReactionGroups(post: MattermostPost): ReactionGroupItem[] {
  const map: Record<string, ReactionGroupItem> = {}
  const reactions = post.metadata?.reactions || []
  const myId = authStore.currentUser?.id

  for (const r of reactions) {
    const rawName = r.emoji_name
    const char = toEmojiChar(rawName)
    if (!map[char]) {
      map[char] = {
        emoji: char,
        rawName,
        count: 0,
        hasReacted: false
      }
    }
    map[char].count++
    if (r.user_id === myId) {
      map[char].hasReacted = true
    }
  }

  return Object.values(map)
}

// Synchronize with uiStore.activeHashtag
watch(
  () => uiStore.activeHashtag,
  (newTag) => {
    if (newTag) {
      currentTag.value = newTag
      search()
    }
  },
  { immediate: true }
)

// When scope changes, re-run search
watch(
  () => scope.value,
  () => {
    search()
  }
)

async function search() {
  const tag = currentTag.value.trim()
  if (!tag) {
    posts.value = []
    return
  }

  isLoading.value = true
  try {
    const channelFilter = scope.value === 'chat' ? chatStore.activeChannelId || undefined : undefined
    const results = await chatStore.searchPostsByHashtag(tag, channelFilter)
    posts.value = results
  } catch (err) {
    console.error('Failed to search hashtag posts:', err)
  } finally {
    isLoading.value = false
  }
}

function handleTagSubmit() {
  if (currentTag.value.trim()) {
    uiStore.activeHashtag = currentTag.value.trim().replace(/^#/, '')
    search()
  }
}

function getChannelName(channelId: string): string {
  const ch = chatStore.channels.find((c) => c.id === channelId)
  if (!ch) return 'Chat'
  if (ch.type === 'D') {
    return ch.dm_user ? usersStore.getUserDisplayName(ch.dm_user) : 'Direct Message'
  }
  return ch.display_name || ch.name || 'Channel'
}

function isImageFile(file: MattermostFileInfo): boolean {
  if (!file) return false
  const ext = file.extension?.toLowerCase() || ''
  const mime = file.mime_type?.toLowerCase() || ''
  return mime.startsWith('image/') || ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp'].includes(ext)
}

function isVideoFile(file: MattermostFileInfo): boolean {
  if (!file) return false
  const ext = file.extension?.toLowerCase() || ''
  const mime = file.mime_type?.toLowerCase() || ''
  return mime.startsWith('video/') || ['mp4', 'webm', 'mov', 'm4v', 'mkv'].includes(ext)
}

async function handleOpenThread(post: MattermostPost) {
  // If clicked on mobile, close drawer so thread is visible
  if (window.innerWidth < 768) {
    uiStore.closeHashtagSearch()
  }

  // If this post is already a reply in a thread, resolve root post
  if (post.root_id) {
    let root = chatStore.currentPosts.find((p) => p.id === post.root_id)
    if (!root) {
      try {
        root = await mmApi.getPost(post.root_id)
      } catch {
        root = post
      }
    }
    chatStore.openThread(root || post)
  } else {
    chatStore.openThread(post)
  }
}

async function handleJumpToPost(post: MattermostPost) {
  if (window.innerWidth < 768) {
    uiStore.closeHashtagSearch()
  }
  await chatStore.jumpToPost(post.channel_id, post.id)
}

function handleReply(post: MattermostPost) {
  uiStore.setReplyingTo(post)
  if (window.innerWidth < 768) {
    uiStore.closeHashtagSearch()
  }
}

async function handleToggleReaction(post: MattermostPost, emojiName: string) {
  try {
    await chatStore.toggleReaction(post, emojiName)
  } catch (err) {
    console.error('Failed to toggle reaction:', err)
  }
}

function handleReactionSelect(post: MattermostPost, emojiName: string) {
  activeReactionPickerPostId.value = null
  handleToggleReaction(post, emojiName)
}

function copyPostText(post: MattermostPost) {
  navigator.clipboard.writeText(post.message || '')
  copiedPostId.value = post.id
  setTimeout(() => {
    copiedPostId.value = null
  }, 2000)
  activeMenuPostId.value = null
}

async function handleTogglePin(post: MattermostPost) {
  await chatStore.togglePinPost(post)
  post.is_pinned = !post.is_pinned
  activeMenuPostId.value = null
}

async function handleDelete(post: MattermostPost) {
  activeMenuPostId.value = null
  if (confirm('Are you sure you want to delete this message?')) {
    await chatStore.deleteMessage(post.id)
    posts.value = posts.value.filter((p) => p.id !== post.id)
  }
}

function canDelete(post: MattermostPost): boolean {
  return post.user_id === authStore.currentUser?.id || !!authStore.currentUser?.roles.includes('system_admin')
}
</script>

<template>
  <Transition name="tg-drawer">
    <div
      v-if="uiStore.showHashtagDrawer"
      class="tg-drawer-panel fixed inset-0 z-40 md:static md:inset-auto md:z-30 w-full md:w-84 lg:w-96 h-full bg-white dark:bg-[#17212b] border-l border-[#dfe1e5] dark:border-[#101921] flex flex-col shrink-0 select-none overflow-hidden"
    >
      <!-- Header -->
      <div
        class="px-4 border-b border-[#dfe1e5] dark:border-[#101921] flex items-center justify-between"
        style="padding-top: env(safe-area-inset-top, 0px); min-height: calc(3.5rem + env(safe-area-inset-top, 0px));"
      >
        <div class="flex items-center gap-2 min-w-0">
          <button
            @click="uiStore.showHashtagDrawer = false"
            class="md:hidden p-1.5 -ml-1 text-[#7f91a4] hover:text-gray-900 dark:hover:text-white rounded-full transition-colors cursor-pointer"
            title="Back"
          >
            <ArrowLeft class="w-5 h-5" />
          </button>
          <div class="w-8 h-8 rounded-xl bg-[#3390ec]/15 text-[#3390ec] flex items-center justify-center shrink-0">
            <Hash class="w-4 h-4" />
          </div>
          <div class="min-w-0">
            <h3 class="text-sm font-bold text-gray-900 dark:text-white truncate">
              #{{ currentTag }}
            </h3>
            <p class="text-[11px] text-[#7f91a4]">
              {{ posts.length }} message{{ posts.length === 1 ? '' : 's' }} found
            </p>
          </div>
        </div>

      <button
        @click="uiStore.closeHashtagSearch()"
        class="p-1.5 text-[#7f91a4] hover:text-gray-900 dark:hover:text-white rounded-full transition-colors"
        title="Close hashtag search"
      >
        <X class="w-5 h-5" />
      </button>
    </div>

    <!-- Search Input & Scope Filters -->
    <div class="p-3 border-b border-[#dfe1e5] dark:border-[#101921] space-y-2.5">
      <!-- Tag Search Bar -->
      <form @submit.prevent="handleTagSubmit" class="relative flex items-center">
        <span class="absolute left-3 text-sm font-bold text-[#3390ec] pointer-events-none">#</span>
        <input
          v-model="currentTag"
          type="text"
          placeholder="Enter hashtag..."
          class="w-full pl-7 pr-8 py-1.5 text-xs rounded-xl bg-[#f1f1f1] dark:bg-[#202b36] text-gray-900 dark:text-white placeholder-[#7f91a4] border-none focus:outline-none focus:ring-1 focus:ring-[#3390ec]"
        />
        <button
          v-if="currentTag"
          type="button"
          @click="currentTag = ''; posts = []"
          class="p-1 absolute right-2 text-[#7f91a4] hover:text-white"
        >
          <X class="w-3.5 h-3.5" />
        </button>
      </form>

      <!-- Scope Filter Pills -->
      <div class="flex items-center gap-1.5">
        <button
          @click="scope = 'chat'"
          class="flex-1 py-1 px-2 text-xs rounded-lg font-medium transition-colors text-center"
          :class="scope === 'chat' ? 'bg-[#3390ec] text-white shadow-xs' : 'bg-[#f1f1f1] dark:bg-[#202b36] text-[#7f91a4] hover:text-gray-900 dark:hover:text-white'"
        >
          In this chat
        </button>

        <button
          @click="scope = 'all'"
          class="flex-1 py-1 px-2 text-xs rounded-lg font-medium transition-colors text-center"
          :class="scope === 'all' ? 'bg-[#3390ec] text-white shadow-xs' : 'bg-[#f1f1f1] dark:bg-[#202b36] text-[#7f91a4] hover:text-gray-900 dark:hover:text-white'"
        >
          All chats
        </button>
      </div>
    </div>

    <!-- Results List Area -->
    <div class="flex-1 overflow-y-auto p-3 space-y-3">
      <!-- Loading State -->
      <div v-if="isLoading" class="flex flex-col items-center justify-center h-48 text-[#3390ec]">
        <Loader2 class="w-6 h-6 animate-spin mb-2" />
        <span class="text-xs text-[#7f91a4]">Searching posts with #{{ currentTag }}...</span>
      </div>

      <!-- Empty State -->
      <div
        v-else-if="posts.length === 0"
        class="flex flex-col items-center justify-center h-64 text-center p-6 text-[#7f91a4]"
      >
        <div class="w-12 h-12 rounded-2xl bg-[#3390ec]/10 flex items-center justify-center text-[#3390ec] mb-3">
          <Hash class="w-6 h-6" />
        </div>
        <p class="text-xs font-semibold text-gray-800 dark:text-white/90">
          No messages with #{{ currentTag }}
        </p>
        <p class="text-[11px] mt-1 text-[#7f91a4] max-w-[220px]">
          {{ scope === 'chat' ? 'No messages found with this hashtag in this chat. Try switching to "All chats".' : 'No messages found with this hashtag across the workspace.' }}
        </p>
      </div>

      <!-- Posts List -->
      <template v-else>
        <div
          v-for="post in posts"
          :key="post.id"
          class="p-3 rounded-2xl bg-[#f8f9fa] dark:bg-[#202b36]/60 border border-[#dfe1e5]/60 dark:border-[#202b36] hover:border-[#3390ec]/40 transition-all space-y-2 relative group"
        >
          <!-- Post Author & Channel Header -->
          <div class="flex items-center justify-between gap-2">
            <div class="flex items-center gap-2 min-w-0">
              <TelegramAvatar
                :userId="post.user_id"
                :name="usersStore.getUserDisplayName(usersStore.getUser(post.user_id))"
                size="sm"
                :lastPictureUpdate="(usersStore.getUser(post.user_id) as any)?.last_picture_update"
              />
              <div class="min-w-0">
                <div class="text-xs font-bold text-gray-900 dark:text-white truncate">
                  {{ usersStore.getUserDisplayName(usersStore.getUser(post.user_id)) }}
                </div>
                <!-- Channel Source Badge -->
                <div
                  @click="handleJumpToPost(post)"
                  class="text-[10px] text-[#3390ec] hover:underline cursor-pointer truncate flex items-center gap-1"
                  :title="`Jump to ${getChannelName(post.channel_id)}`"
                >
                  <span>📍 {{ getChannelName(post.channel_id) }}</span>
                </div>
              </div>
            </div>

            <!-- Timestamp & 3-dots Menu -->
            <div class="flex items-center gap-1.5 shrink-0">
              <span class="text-[10px] text-[#7f91a4]">
                {{ formatMessageTime(post.create_at) }}
              </span>

              <!-- Context Menu Trigger -->
              <div class="relative">
                <button
                  @click="activeMenuPostId = activeMenuPostId === post.id ? null : post.id"
                  class="p-1 text-[#7f91a4] hover:text-gray-900 dark:hover:text-white rounded-md hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
                  title="More actions"
                >
                  <MoreVertical class="w-3.5 h-3.5" />
                </button>

                <!-- Backdrop click catcher -->
                <div
                  v-if="activeMenuPostId === post.id"
                  @click="activeMenuPostId = null"
                  class="fixed inset-0 z-40"
                ></div>

                <!-- Dropdown Menu -->
                <Transition name="tg-dropdown">
                  <div
                    v-if="activeMenuPostId === post.id"
                    class="tg-dropdown absolute right-0 top-full mt-1 w-44 bg-white dark:bg-[#17212b] border border-[#dfe1e5] dark:border-[#202b36] rounded-xl shadow-xl z-50 py-1 text-xs select-none overflow-hidden"
                  >
                    <button
                      @click="handleJumpToPost(post); activeMenuPostId = null"
                      class="tg-dropdown-item w-full px-3 py-1.5 flex items-center gap-2 hover:bg-[#f1f1f1] dark:hover:bg-[#202b36] text-left text-gray-800 dark:text-white"
                    >
                      <ArrowUpRight class="w-3.5 h-3.5 text-[#3390ec] shrink-0" />
                      <span class="truncate">View in chat</span>
                    </button>

                    <button
                      @click="handleOpenThread(post); activeMenuPostId = null"
                      class="tg-dropdown-item w-full px-3 py-1.5 flex items-center gap-2 hover:bg-[#f1f1f1] dark:hover:bg-[#202b36] text-left text-gray-800 dark:text-white"
                    >
                      <MessageSquareText class="w-3.5 h-3.5 text-[#3390ec] shrink-0" />
                      <span class="truncate">Open thread</span>
                    </button>

                    <button
                      @click="handleReply(post); activeMenuPostId = null"
                      class="tg-dropdown-item w-full px-3 py-1.5 flex items-center gap-2 hover:bg-[#f1f1f1] dark:hover:bg-[#202b36] text-left text-gray-800 dark:text-white"
                    >
                      <CornerUpLeft class="w-3.5 h-3.5 text-[#3390ec] shrink-0" />
                      <span class="truncate">Reply</span>
                    </button>

                    <button
                      @click="copyPostText(post); activeMenuPostId = null"
                      class="tg-dropdown-item w-full px-3 py-1.5 flex items-center gap-2 hover:bg-[#f1f1f1] dark:hover:bg-[#202b36] text-left text-gray-800 dark:text-white"
                    >
                      <Check v-if="copiedPostId === post.id" class="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                      <Copy v-else class="w-3.5 h-3.5 text-[#7f91a4] shrink-0" />
                      <span class="truncate">{{ copiedPostId === post.id ? 'Copied!' : 'Copy text' }}</span>
                    </button>

                    <button
                      @click="handleTogglePin(post); activeMenuPostId = null"
                      class="tg-dropdown-item w-full px-3 py-1.5 flex items-center gap-2 hover:bg-[#f1f1f1] dark:hover:bg-[#202b36] text-left text-gray-800 dark:text-white"
                    >
                      <Pin class="w-3.5 h-3.5 text-[#7f91a4] shrink-0" />
                      <span class="truncate">{{ post.is_pinned ? 'Unpin' : 'Pin' }}</span>
                    </button>

                    <button
                      v-if="canDelete(post)"
                      @click="handleDelete(post); activeMenuPostId = null"
                      class="tg-dropdown-item w-full px-3 py-1.5 flex items-center gap-2 hover:bg-rose-500/10 text-left text-rose-500"
                    >
                      <Trash2 class="w-3.5 h-3.5 shrink-0" />
                      <span class="truncate">Delete</span>
                    </button>
                  </div>
                </Transition>
              </div>
            </div>
          </div>

          <!-- Message Text -->
          <div
            v-if="post.message"
            class="text-xs leading-relaxed text-gray-800 dark:text-white/90 break-words tg-markdown"
            v-html="renderTelegramMarkdown(post.message)"
          ></div>

          <!-- Attachments (Photos/Files) -->
          <div v-if="post.metadata?.files && post.metadata.files.length > 0" class="space-y-1.5 pt-1">
            <!-- Media Thumbnails Grid -->
            <div
              v-if="post.metadata.files.some(f => isImageFile(f) || isVideoFile(f))"
              class="grid grid-cols-3 gap-1.5"
            >
              <div
                v-for="file in post.metadata.files.filter(f => isImageFile(f) || isVideoFile(f))"
                :key="file.id"
                @click="uiStore.openFilePreview(file)"
                class="aspect-square rounded-lg overflow-hidden bg-black/10 dark:bg-black/30 cursor-pointer relative group/img"
              >
                <img
                  v-if="isImageFile(file)"
                  :src="mmApi.getFileThumbnailUrl(file.id)"
                  class="w-full h-full object-cover"
                />
                <div v-else class="w-full h-full flex items-center justify-center bg-black/50 text-white">
                  <Film class="w-5 h-5" />
                </div>
              </div>
            </div>

            <!-- Documents Rows -->
            <div
              v-for="file in post.metadata.files.filter(f => !isImageFile(f) && !isVideoFile(f))"
              :key="file.id"
              class="flex items-center justify-between p-2 rounded-xl bg-black/5 dark:bg-black/20 text-xs"
            >
              <span class="truncate font-medium text-gray-800 dark:text-white">{{ file.name }}</span>
              <a
                :href="mmApi.getFileDownloadUrl(file.id)"
                :download="file.name"
                target="_blank"
                class="p-1 text-[#7f91a4] hover:text-[#3390ec]"
                @click.stop
              >
                <Download class="w-3.5 h-3.5" />
              </a>
            </div>
          </div>

          <!-- Reactions Row -->
          <div
            v-if="getPostReactionGroups(post).length > 0"
            class="flex flex-wrap gap-1 pt-1"
          >
            <button
              v-for="r in getPostReactionGroups(post)"
              :key="r.emoji"
              @click="handleToggleReaction(post, r.rawName || r.emoji)"
              class="px-2 py-0.5 rounded-full text-[11px] font-medium border flex items-center gap-1 transition-colors"
              :class="r.hasReacted
                ? 'bg-[#3390ec]/20 border-[#3390ec]/50 text-[#3390ec]'
                : 'bg-black/5 dark:bg-white/5 border-transparent text-[#7f91a4] hover:border-[#3390ec]/30'"
            >
              <span>{{ r.emoji }}</span>
              <span>{{ r.count }}</span>
            </button>
          </div>

          <!-- Bottom Actions Toolbar: Thread, Jump, Reply, React -->
          <div class="pt-2 border-t border-[#dfe1e5]/40 dark:border-[#202b36]/60 flex items-center justify-between text-xs">
            <!-- Left: Thread button (The core user request) -->
            <button
              @click="handleOpenThread(post)"
              class="py-1 px-2.5 rounded-lg flex items-center gap-1.5 font-semibold text-[#3390ec] hover:bg-[#3390ec]/10 transition-colors cursor-pointer"
              title="Open thread and replies"
            >
              <MessageSquareText class="w-3.5 h-3.5" />
              <span>{{ post.reply_count && post.reply_count > 0 ? `${post.reply_count} replies` : 'Thread' }}</span>
            </button>

            <!-- Right Action Icons: Jump, Reply, Reaction -->
            <div class="flex items-center gap-1">
              <!-- Add Reaction Button with Popover -->
              <div class="relative">
                <button
                  @click="activeReactionPickerPostId = activeReactionPickerPostId === post.id ? null : post.id"
                  class="p-1.5 text-[#7f91a4] hover:text-[#3390ec] hover:bg-black/5 dark:hover:bg-white/5 rounded-lg transition-colors cursor-pointer"
                  title="Add reaction"
                >
                  <SmilePlus class="w-3.5 h-3.5" />
                </button>

                <div
                  v-if="activeReactionPickerPostId === post.id"
                  class="absolute right-0 bottom-full mb-1 z-50"
                  @click.stop
                >
                  <ReactionPicker
                    :align-right="true"
                    @select="handleReactionSelect(post, $event)"
                    @close="activeReactionPickerPostId = null"
                  />
                </div>
              </div>

              <!-- Reply Button -->
              <button
                @click="handleReply(post)"
                class="p-1.5 text-[#7f91a4] hover:text-[#3390ec] hover:bg-black/5 dark:hover:bg-white/5 rounded-lg transition-colors cursor-pointer"
                title="Reply to message"
              >
                <CornerUpLeft class="w-3.5 h-3.5" />
              </button>

              <!-- Jump / View in Chat Button -->
              <button
                @click="handleJumpToPost(post)"
                class="p-1.5 text-[#7f91a4] hover:text-[#3390ec] hover:bg-black/5 dark:hover:bg-white/5 rounded-lg transition-colors cursor-pointer"
                title="Jump to message in chat"
              >
                <ArrowUpRight class="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>
      </template>
    </div>
  </div>
  </Transition>
</template>
