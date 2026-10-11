import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { MattermostPost, MattermostFileInfo, MattermostUser } from '../types/mattermost'
import { THEME_PRESETS, ANIMATION_PRESETS, getThemeById, getAnimationById, type ThemePreset, type AnimationPreset } from '../utils/themes'

export interface MentionModalState {
  isOpen: boolean
  type: 'user' | 'broadcast' | 'not_found' | 'loading'
  username: string
  user?: MattermostUser | null
}

export interface AvatarPreviewState {
  isOpen: boolean
  url: string
  name: string
  userId?: string
}

export const useUiStore = defineStore('ui', () => {
  // Theme & Animation Presets with localStorage persistence
  const themeId = ref<string>(localStorage.getItem('mattergram_theme_id') || 'classic-dark')
  const animPreset = ref<string>(localStorage.getItem('mattergram_animation_preset') || 'smooth')

  const currentThemePreset = computed<ThemePreset>(() => getThemeById(themeId.value))
  const currentAnimPreset = computed<AnimationPreset>(() => getAnimationById(animPreset.value))
  const theme = computed<'dark' | 'light'>({
    get: () => currentThemePreset.value.mode,
    set: (mode) => setTheme(mode)
  })

  function applyThemeToDom() {
    if (typeof document === 'undefined') return
    const active = currentThemePreset.value
    const anim = animPreset.value

    document.documentElement.setAttribute('data-theme', active.id)
    document.documentElement.setAttribute('data-anim', anim)

    if (active.mode === 'dark') {
      document.documentElement.classList.add('dark')
      document.documentElement.classList.remove('light')
    } else {
      document.documentElement.classList.remove('dark')
      document.documentElement.classList.add('light')
    }

    const metaTheme = document.querySelector('meta[name="theme-color"]')
    if (metaTheme) {
      metaTheme.setAttribute('content', active.mode === 'dark' ? '#17212b' : '#ffffff')
    }
  }

  function setThemePreset(id: string) {
    themeId.value = id
    localStorage.setItem('mattergram_theme_id', id)
    const preset = getThemeById(id)
    localStorage.setItem('mattergram_theme', preset.mode)
    applyThemeToDom()
  }

  function setAnimationPreset(animId: string) {
    animPreset.value = animId
    localStorage.setItem('mattergram_animation_preset', animId)
    applyThemeToDom()
  }

  function setTheme(newMode: 'dark' | 'light') {
    if (newMode === 'light') {
      setThemePreset('classic-light')
    } else {
      if (currentThemePreset.value.mode === 'light') {
        setThemePreset('classic-dark')
      } else {
        setThemePreset(themeId.value)
      }
    }
  }

  function toggleTheme() {
    if (currentThemePreset.value.mode === 'dark') {
      setTheme('light')
    } else {
      setTheme('dark')
    }
  }

  // Initial DOM apply
  applyThemeToDom()

  const activeTab = ref<'all' | 'channels' | 'direct' | 'unread' | 'todo'>('all')
  const searchQuery = ref('')
  const replyingTo = ref<MattermostPost | null>(null)
  const editingPost = ref<MattermostPost | null>(null)
  const showRightSidebar = ref(false)
  const showSettingsModal = ref(false)
  const showNewChatModal = ref(false)
  const showTodoModal = ref(false)
  const previewFile = ref<MattermostFileInfo | null>(null)
  const isMobileSidebarOpen = ref(true)

  const avatarPreview = ref<AvatarPreviewState>({
    isOpen: false,
    url: '',
    name: '',
    userId: ''
  })

  const mentionModal = ref<MentionModalState>({
    isOpen: false,
    type: 'user',
    username: ''
  })

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

  function openAvatarPreview(url: string, name: string, userId?: string) {
    avatarPreview.value = {
      isOpen: true,
      url,
      name,
      userId
    }
  }

  function closeAvatarPreview() {
    avatarPreview.value.isOpen = false
  }

  // Initialize theme on start
  if (theme.value === 'dark') {
    document.documentElement.classList.add('dark')
  } else {
    document.documentElement.classList.add('light')
  }

  return {
    theme,
    themeId,
    animPreset,
    currentThemePreset,
    currentAnimPreset,
    setThemePreset,
    setAnimationPreset,
    applyThemeToDom,
    activeTab,
    searchQuery,
    replyingTo,
    editingPost,
    showRightSidebar,
    showSettingsModal,
    showNewChatModal,
    showTodoModal,
    previewFile,
    isMobileSidebarOpen,
    mentionModal,
    avatarPreview,
    setTheme,
    toggleTheme,
    setReplyingTo,
    setEditingPost,
    openFilePreview,
    closeFilePreview,
    openMentionModal,
    updateMentionModal,
    closeMentionModal,
    openAvatarPreview,
    closeAvatarPreview
  }
})
