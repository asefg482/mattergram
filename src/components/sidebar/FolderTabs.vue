<script setup lang="ts">
import { useUiStore } from '../../stores/ui'
import { useChatStore } from '../../stores/chat'
import { computed } from 'vue'

const uiStore = useUiStore()
const chatStore = useChatStore()

const unreadChannelsCount = computed(() => {
  return chatStore.channels.filter(
    (c) => c.type !== 'D' && (chatStore.unreadCounts[c.id] || 0) > 0
  ).length
})

const unreadDirectCount = computed(() => {
  return chatStore.channels.filter(
    (c) => c.type === 'D' && (chatStore.unreadCounts[c.id] || 0) > 0
  ).length
})

const tabs = computed(() => {
  const totalCount = chatStore.unreadChatsCount
  const channelsCount = unreadChannelsCount.value
  const directCount = unreadDirectCount.value

  return [
    { id: 'all', label: 'All Chats', count: totalCount > 0 ? totalCount : undefined },
    { id: 'channels', label: 'Channels', count: channelsCount > 0 ? channelsCount : undefined },
    { id: 'direct', label: 'Direct Messages', count: directCount > 0 ? directCount : undefined },
    { id: 'unread', label: 'Unread', count: totalCount > 0 ? totalCount : undefined }
  ]
})

function formatCount(count?: number) {
  if (!count) return ''
  if (count > 99) return '99+'
  return String(count)
}
</script>

<template>
  <div class="flex items-center px-2 border-b border-[#dfe1e5] dark:border-[#101921] overflow-x-auto no-scrollbar select-none bg-white dark:bg-[#17212b]">
    <button
      v-for="tab in tabs"
      :key="tab.id"
      @click="uiStore.activeTab = tab.id as any"
      class="group relative py-2.5 px-3 text-xs font-medium whitespace-nowrap transition-colors flex items-center gap-1.5 cursor-pointer"
      :class="[
        uiStore.activeTab === tab.id
          ? 'text-[#3390ec] font-semibold'
          : 'text-[#7f91a4] hover:text-[#111827] dark:hover:text-[#f5f5f5]'
      ]"
    >
      <span>{{ tab.label }}</span>
      <span
        v-if="tab.count !== undefined && tab.count > 0"
        class="inline-flex items-center justify-center h-[18px] min-w-[18px] rounded-full text-[11px] font-bold leading-none select-none transition-colors"
        :class="[
          String(tab.count).length > 1 ? 'px-1.5' : 'w-[18px] p-0',
          uiStore.activeTab === tab.id
            ? 'bg-[#3390ec] text-white shadow-xs'
            : 'bg-[#e4e7ea] dark:bg-[#242f3d] text-[#687480] dark:text-[#8aa2b9] group-hover:bg-[#dfe1e5] dark:group-hover:bg-[#2c3847]'
        ]"
        style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; font-variant-numeric: tabular-nums;"
      ><span class="inline-block transform -translate-y-[0.5px]">{{ formatCount(tab.count) }}</span></span>

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
