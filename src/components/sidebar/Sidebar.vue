<script setup lang="ts">
import { ref, computed } from 'vue'
import { useChatStore } from '../../stores/chat'
import { useUiStore } from '../../stores/ui'
import FolderTabs from './FolderTabs.vue'
import ChatListItem from './ChatListItem.vue'
import DrawerMenu from './DrawerMenu.vue'
import NewChatModal from './NewChatModal.vue'
import { Menu, Search, X, Edit3, Loader2 } from 'lucide-vue-next'

const chatStore = useChatStore()
const uiStore = useUiStore()

const isDrawerOpen = ref(false)

// Filter chats based on activeTab and searchQuery
const filteredChannels = computed(() => {
  let list = chatStore.channels

  // Filter by Tab
  if (uiStore.activeTab === 'channels') {
    list = list.filter((c) => c.type !== 'D')
  } else if (uiStore.activeTab === 'direct') {
    list = list.filter((c) => c.type === 'D')
  } else if (uiStore.activeTab === 'unread') {
    list = list.filter((c) => (chatStore.unreadCounts[c.id] || 0) > 0)
  }

  // Filter by Search Query
  if (uiStore.searchQuery.trim()) {
    const q = uiStore.searchQuery.trim().toLowerCase()
    list = list.filter(
      (c) =>
        (c.display_name && c.display_name.toLowerCase().includes(q)) ||
        (c.name && c.name.toLowerCase().includes(q)) ||
        (c.purpose && c.purpose.toLowerCase().includes(q))
    )
  }

  return list
})

function handleSelectChat(channelId: string) {
  chatStore.selectChannel(channelId)
  // On mobile screen, close sidebar to show chat
  if (window.innerWidth < 768) {
    uiStore.isMobileSidebarOpen = false
  }
}
</script>

<template>
  <div
    class="w-full md:w-80 lg:w-96 h-full flex flex-col bg-[#17212b] dark:bg-[#17212b] bg-white border-r border-[#101921] dark:border-[#101921] border-[#dfe1e5] relative shrink-0 select-none z-20"
  >
    <!-- Top Header: Hamburger & Search Input -->
    <div class="p-2.5 flex items-center gap-2 bg-[#17212b] dark:bg-[#17212b] bg-white">
      <!-- Hamburger Menu Button -->
      <button
        @click="isDrawerOpen = true"
        class="p-2 rounded-full text-[#7f91a4] hover:text-[#f5f5f5] dark:hover:text-[#f5f5f5] hover:text-[#111827] hover:bg-[#202b36] dark:hover:bg-[#202b36] hover:bg-[#f1f1f1] transition-colors shrink-0"
        title="Menu"
      >
        <Menu class="w-5 h-5" />
      </button>

      <!-- Telegram Search Bar -->
      <div class="flex-1 relative flex items-center">
        <Search class="w-4 h-4 text-[#7f91a4] absolute left-3 pointer-events-none" />
        <input
          v-model="uiStore.searchQuery"
          type="text"
          placeholder="Search"
          class="w-full bg-[#242f3d] dark:bg-[#242f3d] bg-[#f4f4f5] border border-transparent focus:border-[#3390ec] text-[#f5f5f5] dark:text-[#f5f5f5] text-[#111827] placeholder-[#7f91a4] text-xs rounded-full pl-9 pr-8 py-2 outline-none transition-all"
        />
        <!-- Clear search button -->
        <button
          v-if="uiStore.searchQuery"
          @click="uiStore.searchQuery = ''"
          class="absolute right-2.5 p-0.5 text-[#7f91a4] hover:text-white rounded-full"
        >
          <X class="w-3.5 h-3.5" />
        </button>
      </div>
    </div>

    <!-- Folder Tabs -->
    <FolderTabs />

    <!-- Chat List -->
    <div class="flex-1 overflow-y-auto divide-y divide-[#101921]/50 dark:divide-[#101921]/50 divide-[#dfe1e5]/50 relative">
      <!-- Loading indicator -->
      <div v-if="chatStore.loadingChannels && chatStore.channels.length === 0" class="flex flex-col items-center justify-center h-48 text-[#7f91a4] gap-2">
        <Loader2 class="w-6 h-6 animate-spin text-[#3390ec]" />
        <span class="text-xs">Loading chats...</span>
      </div>

      <!-- Empty State -->
      <div v-else-if="filteredChannels.length === 0" class="p-8 text-center text-xs text-[#7f91a4]">
        <p v-if="uiStore.searchQuery">No chats found matching "{{ uiStore.searchQuery }}"</p>
        <p v-else-if="uiStore.activeTab === 'unread'">No unread messages</p>
        <p v-else>No chats available in this folder</p>
      </div>

      <!-- Chat Items -->
      <template v-else>
        <ChatListItem
          v-for="channel in filteredChannels"
          :key="channel.id"
          :channel="channel"
          :isActive="chatStore.activeChannelId === channel.id"
          @click="handleSelectChat(channel.id)"
        />
      </template>
    </div>

    <!-- Telegram Floating Action Button (FAB) - Fixed at bottom-right of sidebar -->
    <button
      @click="uiStore.showNewChatModal = true"
      class="absolute bottom-5 right-5 w-12 h-12 rounded-full bg-[#3390ec] hover:bg-[#2481cc] active:scale-95 text-white shadow-xl shadow-[#3390ec]/30 flex items-center justify-center transition-all z-30 p-3"
      title="New Chat or Channel"
    >
      <Edit3 class="w-5 h-5" />
    </button>

    <!-- Drawer Menu Component -->
    <DrawerMenu :isOpen="isDrawerOpen" @close="isDrawerOpen = false" />

    <!-- New Chat Modal -->
    <NewChatModal
      :isOpen="uiStore.showNewChatModal"
      @close="uiStore.showNewChatModal = false"
    />
  </div>
</template>
