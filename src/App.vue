<script setup lang="ts">
import { onMounted, watch } from 'vue'
import { useAuthStore } from './stores/auth'
import { useChatStore } from './stores/chat'
import { useUsersStore } from './stores/users'
import { useUiStore } from './stores/ui'
import LoginView from './components/auth/LoginView.vue'
import Sidebar from './components/sidebar/Sidebar.vue'
import ChatArea from './components/chat/ChatArea.vue'
import ChatInfoDrawer from './components/info/ChatInfoDrawer.vue'
import SettingsModal from './components/settings/SettingsModal.vue'
import NotificationToast from './components/common/NotificationToast.vue'

const authStore = useAuthStore()
const chatStore = useChatStore()
const usersStore = useUsersStore()
const uiStore = useUiStore()

onMounted(async () => {
  // Initialize WS listeners
  chatStore.initWs()
  usersStore.initWs()

  // Initialize Auth session from storage if present
  await authStore.initAuth()
})

// When team is loaded or changes, load channels
watch(
  () => authStore.currentTeam?.id,
  async (teamId) => {
    if (teamId) {
      await chatStore.loadChannels()
    }
  },
  { immediate: true }
)
</script>

<template>
  <div class="h-screen w-screen flex overflow-hidden bg-[#0e1621] dark:bg-[#0e1621] bg-[#8ea6b4] font-sans antialiased">
    <!-- Unauthenticated State: Login Screen -->
    <LoginView v-if="!authStore.isAuthenticated" />

    <!-- Authenticated State: Telegram Web Interface -->
    <div v-else class="flex-1 h-full flex overflow-hidden relative">
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

      <!-- In-App Notification Toast Banner -->
      <NotificationToast />
    </div>
  </div>
</template>
