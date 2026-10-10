import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { MattermostPost, MattermostFileInfo, MattermostUser } from '../types/mattermost'

export interface MentionModalState {
  isOpen: boolean
  type: 'user' | 'broadcast' | 'not_found' | 'loading'
  username: string
  user?: MattermostUser | null
}

export const useUiStore = defineStore('ui', () => {
  const theme = ref<'dark' | 'light'>((localStorage.getItem('mattergram_theme') as any) || 'dark')
  const activeTab = ref<'all' | 'channels' | 'direct' | 'unread'>('all')
  const searchQuery = ref('')
  const replyingTo = ref<MattermostPost | null>(null)
  const editingPost = ref<MattermostPost | null>(null)
  const showRightSidebar = ref(false)
  const showSettingsModal = ref(false)
  const showNewChatModal = ref(false)
  const previewFile = ref<MattermostFileInfo | null>(null)
  const isMobileSidebarOpen = ref(true)

  const mentionModal = ref<MentionModalState>({
    isOpen: false,
    type: 'user',
    username: ''
  })

  function setTheme(newTheme: 'dark' | 'light') {
    theme.value = newTheme
    localStorage.setItem('mattergram_theme', newTheme)
    if (newTheme === 'dark') {
      document.documentElement.classList.add('dark')
      document.documentElement.classList.remove('light')
    } else {
      document.documentElement.classList.remove('dark')
      document.documentElement.classList.add('light')
    }
  }

  function toggleTheme() {
    setTheme(theme.value === 'dark' ? 'light' : 'dark')
  }

  function setReplyingTo(post: MattermostPost | null) {
    replyingTo.value = post
    if (post) {
      editingPost.value = null
    }
  }

  function setEditingPost(post: MattermostPost | null) {
    editingPost.value = post
    if (post) {
      replyingTo.value = null
    }
  }

  function openFilePreview(file: MattermostFileInfo) {
    previewFile.value = file
  }

  function closeFilePreview() {
    previewFile.value = null
  }

  function openMentionModal(data: Omit<MentionModalState, 'isOpen'>) {
    mentionModal.value = {
      ...data,
      isOpen: true
    }
  }

  function updateMentionModal(data: Partial<MentionModalState>) {
    mentionModal.value = {
      ...mentionModal.value,
      ...data
    }
  }

  function closeMentionModal() {
    mentionModal.value.isOpen = false
  }

  // Initialize theme on start
  if (theme.value === 'dark') {
    document.documentElement.classList.add('dark')
  } else {
    document.documentElement.classList.add('light')
  }

  return {
    theme,
    activeTab,
    searchQuery,
    replyingTo,
    editingPost,
    showRightSidebar,
    showSettingsModal,
    showNewChatModal,
    previewFile,
    isMobileSidebarOpen,
    mentionModal,
    setTheme,
    toggleTheme,
    setReplyingTo,
    setEditingPost,
    openFilePreview,
    closeFilePreview,
    openMentionModal,
    updateMentionModal,
    closeMentionModal
  }
})
