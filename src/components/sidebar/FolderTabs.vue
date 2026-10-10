<script setup lang="ts">
import { useUiStore } from '../../stores/ui'
import { useChatStore } from '../../stores/chat'
import { computed } from 'vue'

const uiStore = useUiStore()
const chatStore = useChatStore()

const tabs = computed(() => {
  const totalUnread = Object.values(chatStore.unreadCounts).reduce((a, b) => a + b, 0)
  
  return [
    { id: 'all', label: 'All Chats', count: totalUnread > 0 ? totalUnread : undefined },
    { id: 'channels', label: 'Channels' },
    { id: 'direct', label: 'Direct Messages' },
    { id: 'unread', label: 'Unread', count: totalUnread > 0 ? totalUnread : undefined }
  ]
})
</script>

<template>
  <div class="flex items-center px-2 border-b border-[#101921] dark:border-[#101921] border-[#dfe1e5] overflow-x-auto no-scrollbar select-none bg-[#17212b] dark:bg-[#17212b] bg-white">
    <button
      v-for="tab in tabs"
      :key="tab.id"
      @click="uiStore.activeTab = tab.id as any"
      class="relative py-2.5 px-3 text-xs font-medium whitespace-nowrap transition-colors flex items-center gap-1.5"
      :class="[
        uiStore.activeTab === tab.id
          ? 'text-[#3390ec] font-semibold'
          : 'text-[#7f91a4] hover:text-[#f5f5f5] dark:hover:text-[#f5f5f5] hover:text-[#111827]'
      ]"
    >
      <span>{{ tab.label }}</span>
      <span
        v-if="tab.count"
        class="px-1.5 py-0.2 rounded-full text-[10px] bg-[#2481cc] text-white font-bold"
      >
        {{ tab.count }}
      </span>

      <!-- Telegram Active Tab Underline Indicator -->
      <div
        v-if="uiStore.activeTab === tab.id"
        class="absolute bottom-0 left-2 right-2 h-0.5 bg-[#3390ec] rounded-t-full"
      ></div>
    </button>
  </div>
</template>

<style scoped>
.no-scrollbar::-webkit-scrollbar {
  display: none;
}
.no-scrollbar {
  -ms-overflow-style: none;
  scrollbar-width: none;
}
</style>
