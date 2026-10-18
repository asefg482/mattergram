<script setup lang="ts">
import { onMounted, watch, ref, computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAuthStore } from '../stores/auth'
import { useChatStore } from '../stores/chat'
import { useUsersStore } from '../stores/users'
import { useUiStore } from '../stores/ui'
import { notificationService } from '../services/notifications'
import Sidebar from '../components/sidebar/Sidebar.vue'
import ChatArea from '../components/chat/ChatArea.vue'
import ChatInfoDrawer from '../components/info/ChatInfoDrawer.vue'
import HashtagDrawer from '../components/chat/HashtagDrawer.vue'
import SettingsModal from '../components/settings/SettingsModal.vue'
import AccountSettingsModal from '../components/settings/AccountSettingsModal.vue'
import EditChannelModal from '../components/chat/EditChannelModal.vue'

const route = useRoute()
const router = useRouter()
const authStore = useAuthStore()
const chatStore = useChatStore()
const usersStore = useUsersStore()
const uiStore = useUiStore()

async function syncRouteWithChat() {
  const channelParam = route.params.channelId as string | undefined
  const postParam = (route.query.post as string) || (route.hash ? route.hash.replace(/^#post-/, '') : undefined)

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

    if (postParam) {
      await chatStore.jumpToPost(targetId, postParam)
    }
  } else if (!route.path.includes('/settings')) {
    if (window.innerWidth < 768) {
      uiStore.isMobileSidebarOpen = true
      // Delay clearing active channel so mobile slide-out animation stays smooth without flashing empty state
      setTimeout(() => {
        if (uiStore.isMobileSidebarOpen) {
          chatStore.activeChannelId = null
        }
      }, 320)
    } else {
      chatStore.activeChannelId = null
    }
  }
}

const isChatOpenMobile = computed(() => {
  return !uiStore.isMobileSidebarOpen && !!chatStore.activeChannelId
})

const isTransitionReady = ref(false)

// Watch route changes (e.g. browser back/forward, manual navigation, or shared post links)
watch(
  () => [route.params.channelId, route.query.post, route.hash, route.name],
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
  // Enable transitions after initial mount to avoid flickering on first page load
  setTimeout(() => {
    isTransitionReady.value = true
  }, 100)
})
</script>

<template>
  <div class="flex-1 h-full flex overflow-hidden relative">
    <!-- Left Sidebar (Chat List & Drawer) -->
    <div
      class="tg-mobile-sidebar-panel flex flex-col"
      :class="[
        !isTransitionReady ? 'tg-nav-no-transition' : '',
        isChatOpenMobile ? 'is-shifted' : ''
      ]"
    >
      <Sidebar />
    </div>

    <!-- Main Chat Area -->
    <div
      class="tg-mobile-chat-panel flex flex-col"
      :class="[
        !isTransitionReady ? 'tg-nav-no-transition' : '',
        isChatOpenMobile ? 'is-open' : ''
      ]"
    >
      <ChatArea />
    </div>

    <!-- Right Chat Info Drawer -->
    <ChatInfoDrawer />

    <!-- Right Hashtag Drawer -->
    <HashtagDrawer />

    <!-- Settings Modal -->
    <SettingsModal />

    <!-- Account Settings Modal -->
    <AccountSettingsModal />

    <!-- Edit Channel Modal -->
    <EditChannelModal />
  </div>
</template>
