<script setup lang="ts">
import { onMounted, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAuthStore } from '../stores/auth'
import { useChatStore } from '../stores/chat'
import { useUsersStore } from '../stores/users'
import { useUiStore } from '../stores/ui'
import { notificationService } from '../services/notifications'
import Sidebar from '../components/sidebar/Sidebar.vue'
import ChatArea from '../components/chat/ChatArea.vue'
import ChatInfoDrawer from '../components/info/ChatInfoDrawer.vue'
import SettingsModal from '../components/settings/SettingsModal.vue'

const route = useRoute()
const router = useRouter()
const authStore = useAuthStore()
const chatStore = useChatStore()
const usersStore = useUsersStore()
const uiStore = useUiStore()

async function syncRouteWithChat() {
  const channelParam = route.params.channelId as string | undefined

  if (route.name === 'settings' || route.name === 'chat-settings') {
    uiStore.showSettingsModal = true
  }

  if (channelParam) {
    // Check if channel is specified by name or id
    const found = chatStore.channels.find((c) => c.id === channelParam || c.name === channelParam)
    const targetId = found ? found.id : channelParam

    if (chatStore.activeChannelId !== targetId) {
      await chatStore.selectChannel(targetId)
    }

    if (window.innerWidth < 768) {
      uiStore.isMobileSidebarOpen = false
    }
  } else if (!route.path.includes('/settings')) {
    chatStore.activeChannelId = null
    if (window.innerWidth < 768) {
      uiStore.isMobileSidebarOpen = true
    }
  }
}

// Watch route changes (e.g. browser back/forward or manual navigation)
watch(
  () => [route.params.channelId, route.name],
  () => {
    syncRouteWithChat()
  }
)

// When closing settings modal, update the URL route back
watch(
  () => uiStore.showSettingsModal,
  (isOpen) => {
    if (!isOpen && (route.name === 'settings' || route.name === 'chat-settings')) {
      if (route.params.channelId) {
        router.replace(`/c/${route.params.channelId}`)
      } else {
        router.replace('/')
      }
    }
  }
)

// When team is loaded or changes, load channels and resolve active channel
watch(
  () => authStore.currentTeam?.id,
  async (teamId) => {
    if (teamId) {
      await chatStore.loadChannels()
      await syncRouteWithChat()
    }
  },
  { immediate: true }
)

onMounted(async () => {
  notificationService.autoRequestPermissionOnFirstOpen()
  chatStore.initWs()
  usersStore.initWs()
  await syncRouteWithChat()
})
</script>

<template>
  <div class="flex-1 h-full flex overflow-hidden relative">
    <!-- Left Sidebar (Chat List & Drawer) -->
    <Sidebar
      :class="{
        'hidden md:flex': !uiStore.isMobileSidebarOpen && chatStore.activeChannelId,
        'flex': uiStore.isMobileSidebarOpen || !chatStore.activeChannelId
      }"
    />

    <!-- Main Chat Area -->
    <ChatArea
      :class="{
        'hidden md:flex': uiStore.isMobileSidebarOpen && !chatStore.activeChannelId,
        'flex': !uiStore.isMobileSidebarOpen || chatStore.activeChannelId
      }"
    />

    <!-- Right Chat Info Drawer -->
    <ChatInfoDrawer />

    <!-- Settings Modal -->
    <SettingsModal />
  </div>
</template>
