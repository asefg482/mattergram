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

  const activeTab = ref<'all' | 'channels' | 'direct' | 'unread'>('all')
  const searchQuery = ref('')
  const replyingTo = ref<MattermostPost | null>(null)
  const editingPost = ref<MattermostPost | null>(null)
  const showRightSidebar = ref(false)
  const rightSidebarTab = ref<'info' | 'files'>('info')
  const showSettingsModal = ref(false)
  const showNewChatModal = ref(false)
  const previewFile = ref<MattermostFileInfo | null>(null)
  const isMobileSidebarOpen = ref(true)

  // Resizable Chat List Sidebar Width (Desktop)
  const DEFAULT_SIDEBAR_WIDTH = 380
  const MIN_SIDEBAR_WIDTH = 260
  const MAX_SIDEBAR_WIDTH = 620

  const savedWidth = typeof window !== 'undefined' ? localStorage.getItem('mattergram_sidebar_width') : null
  const sidebarWidth = ref<number>(
    savedWidth ? Math.max(MIN_SIDEBAR_WIDTH, Math.min(MAX_SIDEBAR_WIDTH, parseInt(savedWidth, 10))) : DEFAULT_SIDEBAR_WIDTH
  )

  function setSidebarWidth(width: number) {
    const clamped = Math.max(MIN_SIDEBAR_WIDTH, Math.min(MAX_SIDEBAR_WIDTH, Math.round(width)))
    sidebarWidth.value = clamped
    if (typeof window !== 'undefined') {
      localStorage.setItem('mattergram_sidebar_width', String(clamped))
    }
  }

  function resetSidebarWidth() {
    sidebarWidth.value = DEFAULT_SIDEBAR_WIDTH
    if (typeof window !== 'undefined') {
      localStorage.setItem('mattergram_sidebar_width', String(DEFAULT_SIDEBAR_WIDTH))
    }
  }

  // Corner Radius System (Chat box & Context Menus)
  const DEFAULT_BORDER_RADIUS = 16
  const MIN_BORDER_RADIUS = 0
  const MAX_BORDER_RADIUS = 24

  const savedBaseRadius = typeof window !== 'undefined' ? localStorage.getItem('mattergram_border_radius') : null
  const defaultRadius = savedBaseRadius ? parseInt(savedBaseRadius, 10) : DEFAULT_BORDER_RADIUS

  const savedChatRadius = typeof window !== 'undefined' ? localStorage.getItem('mattergram_chat_radius') : null
  const savedMenuRadius = typeof window !== 'undefined' ? localStorage.getItem('mattergram_menu_radius') : null

  const chatRadius = ref<number>(
    savedChatRadius ? Math.max(MIN_BORDER_RADIUS, Math.min(MAX_BORDER_RADIUS, parseInt(savedChatRadius, 10))) : defaultRadius
  )
  const menuRadius = ref<number>(
    savedMenuRadius ? Math.max(MIN_BORDER_RADIUS, Math.min(MAX_BORDER_RADIUS, parseInt(savedMenuRadius, 10))) : defaultRadius
  )

  function applyRadiusToDom() {
    if (typeof document === 'undefined') return
    const root = document.documentElement
    root.style.setProperty('--tg-chat-radius', `${chatRadius.value}px`)
    root.style.setProperty('--tg-menu-radius', `${menuRadius.value}px`)
    root.style.setProperty('--tg-corner-radius', `${Math.round((chatRadius.value + menuRadius.value) / 2)}px`)
  }

  function setChatRadius(val: number) {
    const clamped = Math.max(MIN_BORDER_RADIUS, Math.min(MAX_BORDER_RADIUS, Math.round(val)))
    chatRadius.value = clamped
    if (typeof window !== 'undefined') {
      localStorage.setItem('mattergram_chat_radius', String(clamped))
      localStorage.setItem('mattergram_border_radius', String(clamped))
    }
    applyRadiusToDom()
  }

  function setMenuRadius(val: number) {
    const clamped = Math.max(MIN_BORDER_RADIUS, Math.min(MAX_BORDER_RADIUS, Math.round(val)))
    menuRadius.value = clamped
    if (typeof window !== 'undefined') {
      localStorage.setItem('mattergram_menu_radius', String(clamped))
      localStorage.setItem('mattergram_border_radius', String(clamped))
    }
    applyRadiusToDom()
  }

  function setBorderRadius(val: number) {
    const clamped = Math.max(MIN_BORDER_RADIUS, Math.min(MAX_BORDER_RADIUS, Math.round(val)))
    chatRadius.value = clamped
    menuRadius.value = clamped
    if (typeof window !== 'undefined') {
      localStorage.setItem('mattergram_border_radius', String(clamped))
      localStorage.setItem('mattergram_chat_radius', String(clamped))
      localStorage.setItem('mattergram_menu_radius', String(clamped))
    }
    applyRadiusToDom()
  }

  function resetBorderRadius() {
    setBorderRadius(DEFAULT_BORDER_RADIUS)
  }

  // Initial Radius apply to DOM
  applyRadiusToDom()

  // Message Focus Highlight State (Telegram Pulse Effect)
  const focusedPostId = ref<string | null>(null)
  let focusClearTimer: any = null

  function triggerPostFocus(postId: string) {
    if (focusClearTimer) {
      clearTimeout(focusClearTimer)
      focusClearTimer = null
    }
    focusedPostId.value = postId
    focusClearTimer = setTimeout(() => {
      if (focusedPostId.value === postId) {
        focusedPostId.value = null
      }
    }, 2800)
  }

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

  const showHashtagDrawer = ref(false)
  const activeHashtag = ref('')

  function openHashtagSearch(tag: string) {
    showRightSidebar.value = false
    activeHashtag.value = tag.replace(/^#/, '').trim()
    showHashtagDrawer.value = true
  }

  function closeHashtagSearch() {
    showHashtagDrawer.value = false
    activeHashtag.value = ''
  }

  function openChatFiles() {
    showHashtagDrawer.value = false
    rightSidebarTab.value = 'files'
    showRightSidebar.value = true
  }

  function openChatInfo() {
    showHashtagDrawer.value = false
    rightSidebarTab.value = 'info'
    showRightSidebar.value = true
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
    previewFile,
    isMobileSidebarOpen,
    sidebarWidth,
    setSidebarWidth,
    resetSidebarWidth,
    DEFAULT_SIDEBAR_WIDTH,
    MIN_SIDEBAR_WIDTH,
    MAX_SIDEBAR_WIDTH,
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
    closeAvatarPreview,
    rightSidebarTab,
    openChatFiles,
    openChatInfo,
    showHashtagDrawer,
    activeHashtag,
    openHashtagSearch,
    closeHashtagSearch,
    chatRadius,
    menuRadius,
    setChatRadius,
    setMenuRadius,
    setBorderRadius,
    resetBorderRadius,
    applyRadiusToDom,
    DEFAULT_BORDER_RADIUS,
    MIN_BORDER_RADIUS,
    MAX_BORDER_RADIUS,
    focusedPostId,
    triggerPostFocus
  }
})
