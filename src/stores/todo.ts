import { defineStore } from 'pinia'
import { ref, computed, watch } from 'vue'
import { useAuthStore } from './auth'
import { useUsersStore } from './users'
import { useChatStore } from './chat'
import { notificationService } from '../services/notifications'
import type { MattermostPost } from '../types/mattermost'

export type TodoPriority = 'none' | 'low' | 'medium' | 'high'

export interface TodoItem {
  id: string
  message: string
  description?: string
  completed: boolean
  create_at: number
  completed_at?: number
  due_date?: number | null // timestamp in ms
  priority: TodoPriority
  user_id: string // assignee ID
  creator_id: string // creator ID
  post_id?: string // optional linked Mattermost post
  channel_id?: string // optional linked Mattermost channel
  channel_name?: string
  post_snippet?: string
  author_name?: string
}

export const useTodoStore = defineStore('todo', () => {
  const authStore = useAuthStore()
  const usersStore = useUsersStore()
  const chatStore = useChatStore()

  const todos = ref<TodoItem[]>([])
  const isLoaded = ref(false)
  const searchQuery = ref('')
  const activeFilter = ref<'my' | 'sent' | 'completed' | 'all'>('my')

  // Storage key per user
  const storageKey = computed(() => {
    const userId = authStore.currentUser?.id || 'guest'
    return `mattergram_todos_${userId}`
  })

  // Load from localStorage
  function loadTodos() {
    if (typeof localStorage === 'undefined') return
    try {
      const raw = localStorage.getItem(storageKey.value)
      if (raw) {
        todos.value = JSON.parse(raw)
      } else {
        // Sample default welcome task for new users
        todos.value = []
      }
    } catch (e) {
      console.error('Failed to parse todos from localStorage:', e)
      todos.value = []
    }
    isLoaded.value = true
  }

  // Save to localStorage
  function saveTodos() {
    if (typeof localStorage === 'undefined') return
    try {
      localStorage.setItem(storageKey.value, JSON.stringify(todos.value))
    } catch (e) {
      console.error('Failed to save todos to localStorage:', e)
    }
  }

  // Watch for auth user changes to re-load correct todos
  watch(
    () => authStore.currentUser?.id,
    () => {
      loadTodos()
    },
    { immediate: true }
  )

  // Watch todos changes to persist
  watch(
    todos,
    () => {
      if (isLoaded.value) {
        saveTodos()
      }
    },
    { deep: true }
  )

  // Getters
  const myId = computed(() => authStore.currentUser?.id || '')

  const myTodos = computed(() => {
    return todos.value
      .filter((t) => !t.completed && (t.user_id === myId.value || !t.user_id))
      .sort((a, b) => (b.create_at || 0) - (a.create_at || 0))
  })

  const completedTodos = computed(() => {
    return todos.value
      .filter((t) => t.completed)
      .sort((a, b) => (b.completed_at || 0) - (a.completed_at || 0))
  })

  const sentTodos = computed(() => {
    return todos.value
      .filter((t) => !t.completed && t.creator_id === myId.value && t.user_id && t.user_id !== myId.value)
      .sort((a, b) => (b.create_at || 0) - (a.create_at || 0))
  })

  const pendingCount = computed(() => {
    return myTodos.value.length
  })

  const filteredTodos = computed(() => {
    let list: TodoItem[] = []
    if (activeFilter.value === 'my') {
      list = myTodos.value
    } else if (activeFilter.value === 'completed') {
      list = completedTodos.value
    } else if (activeFilter.value === 'sent') {
      list = sentTodos.value
    } else {
      list = todos.value
    }

    const q = searchQuery.value.trim().toLowerCase()
    if (!q) return list

    return list.filter((t) => {
      const matchMsg = t.message.toLowerCase().includes(q)
      const matchDesc = t.description?.toLowerCase().includes(q)
      const matchSnippet = t.post_snippet?.toLowerCase().includes(q)
      const matchAuthor = t.author_name?.toLowerCase().includes(q)
      return matchMsg || matchDesc || matchSnippet || matchAuthor
    })
  })

  // Add new Todo item
  function addTodo(params: {
    message: string
    description?: string
    priority?: TodoPriority
    due_date?: number | null
    assignee_id?: string
    post?: MattermostPost | null
  }) {
    const text = params.message.trim()
    if (!text) return

    const id = 'todo_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7)
    const creator = myId.value
    const assignee = params.assignee_id || creator

    let channelName = ''
    let postSnippet = ''
    let authorName = ''

    if (params.post) {
      const ch = chatStore.channels.find((c) => c.id === params.post!.channel_id)
      channelName = ch?.display_name || ch?.name || 'Chat'
      postSnippet = params.post.message ? params.post.message.slice(0, 150) : ''
      authorName = usersStore.getUserDisplayName(params.post.user_id)
    }

    const item: TodoItem = {
      id,
      message: text,
      description: params.description?.trim() || '',
      completed: false,
      create_at: Date.now(),
      due_date: params.due_date || null,
      priority: params.priority || 'none',
      user_id: assignee,
      creator_id: creator,
      post_id: params.post?.id,
      channel_id: params.post?.channel_id,
      channel_name: channelName,
      post_snippet: postSnippet,
      author_name: authorName
    }

    todos.value.unshift(item)
    saveTodos()

    notificationService.showToast({
      title: 'TODO Added',
      message: `"${text.slice(0, 40)}${text.length > 40 ? '...' : ''}" added to your list.`,
      type: 'info'
    })

    return item
  }

  // Add a Mattermost chat message directly to TODO list
  function addPostToTodo(post: MattermostPost) {
    if (!post) return

    const author = usersStore.getUserDisplayName(post.user_id)
    const ch = chatStore.channels.find((c) => c.id === post.channel_id)
    const chName = ch?.display_name || ch?.name || 'Chat'

    const title = post.message?.trim()
      ? post.message.slice(0, 100) + (post.message.length > 100 ? '...' : '')
      : `Attachment from ${author}`

    return addTodo({
      message: title,
      description: post.message,
      priority: 'none',
      post: post
    })
  }

  // Toggle Complete / Reopen
  function toggleComplete(id: string) {
    const item = todos.value.find((t) => t.id === id)
    if (item) {
      item.completed = !item.completed
      item.completed_at = item.completed ? Date.now() : undefined
      saveTodos()

      if (item.completed) {
        notificationService.showToast({
          title: 'TODO Completed',
          message: `Task completed!`,
          type: 'info'
        })
      }
    }
  }

  // Edit Todo item
  function editTodo(id: string, updates: Partial<TodoItem>) {
    const idx = todos.value.findIndex((t) => t.id === id)
    if (idx !== -1) {
      todos.value[idx] = {
        ...todos.value[idx],
        ...updates
      }
      saveTodos()
    }
  }

  // Delete Todo item
  function deleteTodo(id: string) {
    todos.value = todos.value.filter((t) => t.id !== id)
    saveTodos()
  }

  // Jump to linked post in chat
  async function jumpToPost(channelId: string, postId: string) {
    if (!channelId) return
    await chatStore.selectChannel(channelId)
    // Small delay to allow messages to render
    setTimeout(() => {
      const el = document.querySelector(`[data-post-id="${postId}"]`)
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' })
        el.classList.add('animate-pulse')
        setTimeout(() => el.classList.remove('animate-pulse'), 1500)
      }
    }, 400)
  }

  return {
    todos,
    isLoaded,
    searchQuery,
    activeFilter,
    myId,
    myTodos,
    completedTodos,
    sentTodos,
    pendingCount,
    filteredTodos,
    addTodo,
    addPostToTodo,
    toggleComplete,
    editTodo,
    deleteTodo,
    jumpToPost,
    loadTodos
  }
})
