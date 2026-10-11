import { defineStore } from 'pinia'
import { ref, computed, watch } from 'vue'
import { useAuthStore } from './auth'
import { useUsersStore } from './users'
import { useChatStore } from './chat'
import { mmApi } from '../services/mattermostApi'
import { mmWs } from '../services/mattermostWs'
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
  is_from_server?: boolean
  is_flagged_post?: boolean
}

export const useTodoStore = defineStore('todo', () => {
  const authStore = useAuthStore()
  const usersStore = useUsersStore()
  const chatStore = useChatStore()

  const todos = ref<TodoItem[]>([])
  const isLoaded = ref(false)
  const isSyncingServer = ref(false)
  const isPluginSupported = ref<boolean | null>(null)
  const lastSyncTime = ref<number | null>(null)
  const serverError = ref<string | null>(null)
  const searchQuery = ref('')
  const activeFilter = ref<'my' | 'sent' | 'completed' | 'all'>('my')

  // Storage key per user
  const storageKey = computed(() => {
    const userId = authStore.currentUser?.id || 'guest'
    return `mattergram_todos_${userId}`
  })

  // Load from localStorage
  function loadLocalTodos() {
    if (typeof localStorage === 'undefined') return
    try {
      const raw = localStorage.getItem(storageKey.value)
      if (raw) {
        todos.value = JSON.parse(raw)
      } else {
        todos.value = []
      }
    } catch (e) {
      console.error('Failed to parse todos from localStorage:', e)
      todos.value = []
    }
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

  // Fetch from Mattermost Server (com.mattermost.plugin-todo & Flagged Posts)
  async function fetchServerTodos() {
    if (!authStore.isAuthenticated) return
    isSyncingServer.value = true
    serverError.value = null

    // 1. Try Mattermost Todo Plugin API
    try {
      const lists = await mmApi.getPluginTodoLists()
      if (lists && (Array.isArray(lists.my) || Array.isArray(lists.in) || Array.isArray(lists.out))) {
        isPluginSupported.value = true

        const serverItems: TodoItem[] = []

        // Map 'my' list (items assigned to me)
        if (Array.isArray(lists.my)) {
          for (const item of lists.my) {
            serverItems.push({
              id: String(item.id),
              message: item.message || '',
              description: item.description || '',
              completed: false,
              create_at: Number(item.create_at) || Date.now(),
              priority: 'none',
              user_id: myId.value,
              creator_id: myId.value,
              post_id: item.post_id || undefined,
              is_from_server: true
            })
          }
        }

        // Map 'in' list (items sent to me by others)
        if (Array.isArray(lists.in)) {
          for (const item of lists.in) {
            serverItems.push({
              id: String(item.id),
              message: item.message || '',
              description: item.description || '',
              completed: false,
              create_at: Number(item.create_at) || Date.now(),
              priority: 'none',
              user_id: myId.value,
              creator_id: item.user || myId.value,
              post_id: item.post_id || undefined,
              is_from_server: true
            })
          }
        }

        // Map 'out' list (items I sent to others)
        if (Array.isArray(lists.out)) {
          for (const item of lists.out) {
            serverItems.push({
              id: String(item.id),
              message: item.message || '',
              description: item.description || '',
              completed: false,
              create_at: Number(item.create_at) || Date.now(),
              priority: 'none',
              user_id: item.user || '',
              creator_id: myId.value,
              post_id: item.post_id || undefined,
              is_from_server: true
            })
          }
        }

        // Merge with existing local properties (priority, due_date, channels)
        const localMap = new Map(todos.value.map((t) => [t.id, t]))
        const merged: TodoItem[] = []

        for (const sItem of serverItems) {
          const existing = localMap.get(sItem.id)
          if (existing) {
            merged.push({
              ...sItem,
              priority: existing.priority || 'none',
              due_date: existing.due_date || null,
              channel_name: existing.channel_name,
              channel_id: existing.channel_id,
              post_snippet: existing.post_snippet,
              author_name: existing.author_name
            })
            localMap.delete(sItem.id)
          } else {
            merged.push(sItem)
          }
        }

        // Keep local-only tasks (e.g. created offline or before sync)
        for (const remaining of localMap.values()) {
          if (!remaining.is_from_server) {
            merged.push(remaining)
          }
        }

        todos.value = merged
        saveTodos()
      }
    } catch {
      // com.mattermost.plugin-todo is not installed or enabled on this server
      isPluginSupported.value = false
    }

    // 2. Also sync Flagged / Saved Posts from Mattermost
    try {
      if (myId.value) {
        const flagged = await mmApi.getFlaggedPosts(myId.value)
        if (flagged && flagged.posts && flagged.order) {
          let addedCount = 0
          for (const postId of flagged.order) {
            const post = flagged.posts[postId]
            if (!post) continue

            const exists = todos.value.some((t) => t.post_id === postId)
            if (!exists) {
              const ch = chatStore.channels.find((c) => c.id === post.channel_id)
              const author = usersStore.getUserDisplayName(post.user_id)
              const taskText = post.message?.trim()
                ? post.message.length > 120
                  ? post.message.slice(0, 120) + '...'
                  : post.message
                : `Saved post from ${author}`

              todos.value.unshift({
                id: `flagged_${postId}`,
                message: taskText,
                description: post.message,
                completed: false,
                create_at: post.create_at || Date.now(),
                priority: 'none',
                user_id: myId.value,
                creator_id: post.user_id,
                post_id: postId,
                channel_id: post.channel_id,
                channel_name: ch?.display_name || ch?.name || 'Chat',
                post_snippet: post.message ? post.message.slice(0, 150) : '',
                author_name: author,
                is_from_server: true,
                is_flagged_post: true
              })
              addedCount++
            }
          }
          if (addedCount > 0) {
            saveTodos()
          }
        }
      }
    } catch {
      // ignore
    }

    lastSyncTime.value = Date.now()
    isSyncingServer.value = false
  }

  // Initial load
  function loadTodos() {
    loadLocalTodos()
    isLoaded.value = true
    if (authStore.isAuthenticated) {
      fetchServerTodos()
    }
  }

  // Register WebSocket listener for realtime sync
  mmWs.on('custom_com.mattermost.plugin-todo_refresh', () => {
    fetchServerTodos()
  })

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
  async function addTodo(params: {
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

    // Sync to Mattermost server if plugin is supported
    if (isPluginSupported.value) {
      try {
        let sendToUsername = ''
        if (assignee && assignee !== creator) {
          const u = usersStore.users[assignee]
          if (u?.username) {
            sendToUsername = u.username
          }
        }

        await mmApi.addPluginTodo({
          message: text,
          description: params.description?.trim() || '',
          send_to: sendToUsername,
          post_id: params.post?.id,
          postPermalink: ''
        })

        // Refresh to fetch server assigned ID
        fetchServerTodos()
      } catch (err) {
        console.warn('Failed to push todo to server plugin:', err)
      }
    }

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
  async function toggleComplete(id: string) {
    const item = todos.value.find((t) => t.id === id)
    if (item) {
      item.completed = !item.completed
      item.completed_at = item.completed ? Date.now() : undefined
      saveTodos()

      if (item.completed && isPluginSupported.value && !id.startsWith('todo_') && !id.startsWith('flagged_')) {
        try {
          await mmApi.completePluginTodo(id)
        } catch (e) {
          console.warn('Failed to complete todo on server plugin:', e)
        }
      }

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
  async function editTodo(id: string, updates: Partial<TodoItem>) {
    const idx = todos.value.findIndex((t) => t.id === id)
    if (idx !== -1) {
      todos.value[idx] = {
        ...todos.value[idx],
        ...updates
      }
      saveTodos()

      if (isPluginSupported.value && !id.startsWith('todo_') && !id.startsWith('flagged_')) {
        try {
          await mmApi.editPluginTodo(id, updates.message || todos.value[idx].message, updates.description)
        } catch (e) {
          console.warn('Failed to edit todo on server plugin:', e)
        }
      }
    }
  }

  // Delete Todo item
  async function deleteTodo(id: string) {
    const item = todos.value.find((t) => t.id === id)
    todos.value = todos.value.filter((t) => t.id !== id)
    saveTodos()

    if (item && isPluginSupported.value && !id.startsWith('todo_') && !id.startsWith('flagged_')) {
      try {
        await mmApi.removePluginTodo(id)
      } catch (e) {
        console.warn('Failed to remove todo on server plugin:', e)
      }
    }
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
    isSyncingServer,
    isPluginSupported,
    lastSyncTime,
    serverError,
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
    loadTodos,
    fetchServerTodos
  }
})
