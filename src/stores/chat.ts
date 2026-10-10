import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { mmApi } from '../services/mattermostApi'
import { mmWs } from '../services/mattermostWs'
import { soundService } from '../services/sounds'
import { notificationService } from '../services/notifications'
import { useAuthStore } from './auth'
import { useUsersStore } from './users'
import { toEmojiName } from '../utils/formatters'
import type { MattermostChannel, MattermostPost, MattermostReaction } from '../types/mattermost'

export const useChatStore = defineStore('chat', () => {
  const authStore = useAuthStore()
  const usersStore = useUsersStore()

  const channels = ref<MattermostChannel[]>([])
  const activeChannelId = ref<string | null>(null)
  const posts = ref<Record<string, MattermostPost[]>>({})
  const loadingChannels = ref(false)
  const loadingPosts = ref(false)
  const unreadCounts = ref<Record<string, number>>({})
  const typingUsers = ref<Record<string, Record<string, string>>>({})
  const typingTimeouts = new Map<string, any>()

  const activeChannel = computed(() => {
    return channels.value.find((c) => c.id === activeChannelId.value) || null
  })

  const currentPosts = computed(() => {
    if (!activeChannelId.value) return []
    return posts.value[activeChannelId.value] || []
  })

  // Group posts by date for Telegram date separators
  const activePostsWithSeparators = computed(() => {
    const list = currentPosts.value
    return list
  })

  // Initialize WebSocket listeners
  function initWs() {
    mmWs.on('posted', handleWsPosted)
    mmWs.on('typing', handleWsTyping)
    mmWs.on('reaction_added', handleWsReactionAdded)
    mmWs.on('reaction_removed', handleWsReactionRemoved)
    mmWs.on('post_edited', handleWsPostEdited)
    mmWs.on('post_deleted', handleWsPostDeleted)
    mmWs.on('channel_viewed', handleWsChannelViewed)
  }

  // Load Channels
  async function loadChannels() {
    if (!authStore.currentTeam) return
    loadingChannels.value = true
    try {
      const rawChannels = await mmApi.getMyChannels(authStore.currentTeam.id)
      const myId = authStore.currentUser?.id || ''

      // Process direct messages and user associations
      const dmUserIdsToFetch: string[] = []

      for (const ch of rawChannels) {
        if (ch.type === 'D') {
          const parts = ch.name.split('__')
          const otherUserId = parts[0] === myId ? parts[1] : parts[0]
          if (otherUserId) {
            dmUserIdsToFetch.push(otherUserId)
          }
        }
      }

      // Fetch users for DMs
      if (dmUserIdsToFetch.length > 0) {
        await usersStore.fetchUsers(dmUserIdsToFetch)
      }

      // Enrich channels
      channels.value = rawChannels.map((ch) => {
        if (ch.type === 'D') {
          const parts = ch.name.split('__')
          const isSavedMessages = parts[0] === myId && parts[1] === myId
          if (isSavedMessages) {
            return {
              ...ch,
              display_name: 'Saved Messages',
              purpose: 'Your cloud storage'
            }
          }
          const otherUserId = parts[0] === myId ? parts[1] : parts[0]
          const otherUser = usersStore.getUser(otherUserId)
          return {
            ...ch,
            dm_user: otherUser,
            display_name: otherUser ? usersStore.getUserDisplayName(otherUser) : ch.display_name || 'Direct Chat'
          }
        }
        return ch
      })

      // Sort by last_post_at descending
      sortChannels()
    } catch (err) {
      console.error('Failed to load channels:', err)
    } finally {
      loadingChannels.value = false
    }
  }

  function sortChannels() {
    channels.value.sort((a, b) => {
      if (a.is_pinned && !b.is_pinned) return -1
      if (!a.is_pinned && b.is_pinned) return 1
      return (b.last_post_at || b.create_at || 0) - (a.last_post_at || a.create_at || 0)
    })
  }

  function togglePinChannel(channelId: string) {
    const ch = channels.value.find((c) => c.id === channelId)
    if (ch) {
      ch.is_pinned = !ch.is_pinned
      sortChannels()
    }
  }

  function toggleMuteChannel(channelId: string) {
    const ch = channels.value.find((c) => c.id === channelId)
    if (ch) {
      ch.is_muted = !ch.is_muted
    }
  }

  function toggleMarkAsUnread(channelId: string) {
    if (unreadCounts.value[channelId] && unreadCounts.value[channelId] > 0) {
      unreadCounts.value[channelId] = 0
    } else {
      unreadCounts.value[channelId] = 1
    }
  }

  async function togglePinPost(post: MattermostPost) {
    try {
      if (post.is_pinned) {
        await mmApi.unpinPost(post.id)
        post.is_pinned = false
      } else {
        await mmApi.pinPost(post.id)
        post.is_pinned = true
      }
    } catch (err) {
      console.error('Failed to toggle pin:', err)
    }
  }

  // Select Channel
  async function selectChannel(channelId: string) {
    if (activeChannelId.value === channelId) return
    const prevChannelId = activeChannelId.value || ''
    activeChannelId.value = channelId

    // Mark as read in Mattermost & local store
    unreadCounts.value[channelId] = 0
    const totalUnread = Object.values(unreadCounts.value).reduce((a, b) => a + b, 0)
    notificationService.updateDocumentTitle(totalUnread)
    try {
      await mmApi.viewChannel(channelId, prevChannelId)
    } catch {}

    // Load posts
    await loadPosts(channelId)
  }

  // Load Posts
  async function loadPosts(channelId: string) {
    loadingPosts.value = true
    try {
      const res = await mmApi.getPosts(channelId)
      const postList: MattermostPost[] = []
      const userIdsToFetch = new Set<string>()

      for (const id of res.order) {
        const post = res.posts[id]
        if (post && post.delete_at === 0) {
          postList.push(post)
          if (post.user_id) userIdsToFetch.add(post.user_id)
        }
      }

      // Fetch authors
      if (userIdsToFetch.size > 0) {
        usersStore.fetchUsers(Array.from(userIdsToFetch))
      }

      // Sort chronologically (oldest first, newest at bottom)
      postList.sort((a, b) => a.create_at - b.create_at)
      posts.value[channelId] = postList
    } catch (err) {
      console.error('Failed to load posts:', err)
    } finally {
      loadingPosts.value = false
    }
  }

  // Send Message
  async function sendMessage(channelId: string, message: string, rootId = '', fileIds: string[] = []) {
    if (!message.trim() && !fileIds.length) return
    try {
      const newPost = await mmApi.createPost(channelId, message, rootId, fileIds)
      
      if (!posts.value[channelId]) {
        posts.value[channelId] = []
      }
      // Add if not already present
      if (!posts.value[channelId].some((p) => p.id === newPost.id)) {
        posts.value[channelId].push(newPost)
      }

      // Update channel last_post_at
      const ch = channels.value.find((c) => c.id === channelId)
      if (ch) {
        ch.last_post_at = newPost.create_at
        ch.last_post = newPost
        sortChannels()
      }

      // Play Telegram sent sound
      soundService.playSent()

      return newPost
    } catch (err) {
      console.error('Failed to send message:', err)
      throw err
    }
  }

  // Edit Message
  async function editMessage(postId: string, text: string) {
    try {
      const edited = await mmApi.editPost(postId, text)
      if (activeChannelId.value && posts.value[activeChannelId.value]) {
        const idx = posts.value[activeChannelId.value].findIndex((p) => p.id === postId)
        if (idx !== -1) {
          posts.value[activeChannelId.value][idx] = edited
        }
      }
      return edited
    } catch (err) {
      console.error('Failed to edit post:', err)
      throw err
    }
  }

  // Delete Message
  async function deleteMessage(postId: string) {
    try {
      await mmApi.deletePost(postId)
      if (activeChannelId.value && posts.value[activeChannelId.value]) {
        posts.value[activeChannelId.value] = posts.value[activeChannelId.value].filter((p) => p.id !== postId)
      }
    } catch (err) {
      console.error('Failed to delete post:', err)
      throw err
    }
  }

  // Reactions
  async function toggleReaction(post: MattermostPost, emojiName: string) {
    const myId = authStore.currentUser?.id
    if (!myId) return

    const normalizedName = toEmojiName(emojiName)
    const existing = post.metadata?.reactions?.find(
      (r) => r.user_id === myId && (r.emoji_name === normalizedName || r.emoji_name === emojiName)
    )

    try {
      if (existing) {
        await mmApi.removeReaction(myId, post.id, existing.emoji_name)
        if (post.metadata?.reactions) {
          post.metadata.reactions = post.metadata.reactions.filter(
            (r) => !(r.user_id === myId && (r.emoji_name === normalizedName || r.emoji_name === emojiName))
          )
        }
      } else {
        await mmApi.addReaction(myId, post.id, normalizedName)
        if (!post.metadata) post.metadata = {}
        if (!post.metadata.reactions) post.metadata.reactions = []
        post.metadata.reactions.push({
          user_id: myId,
          post_id: post.id,
          emoji_name: normalizedName,
          create_at: Date.now()
        })
      }
    } catch (err) {
      console.error('Failed to toggle reaction:', err)
    }
  }

  // Send Typing event
  function sendTyping(channelId: string, rootId = '') {
    mmWs.sendTyping(channelId, rootId)
  }

  // Create or Open Direct Message
  async function openDirectMessage(otherUserId: string) {
    const myId = authStore.currentUser?.id
    if (!myId) return

    try {
      const channel = await mmApi.createDirectChannel(myId, otherUserId)
      await usersStore.fetchUsers([otherUserId])
      const user = usersStore.getUser(otherUserId)

      const enriched: MattermostChannel = {
        ...channel,
        dm_user: user,
        display_name: user ? usersStore.getUserDisplayName(user) : channel.display_name
      }

      const existingIdx = channels.value.findIndex((c) => c.id === channel.id)
      if (existingIdx === -1) {
        channels.value.unshift(enriched)
      } else {
        channels.value[existingIdx] = enriched
      }

      await selectChannel(channel.id)
    } catch (err) {
      console.error('Failed to open direct message:', err)
    }
  }

  // Create Channel
  async function createNewChannel(name: string, displayName: string, type: 'O' | 'P' = 'O', purpose = '') {
    if (!authStore.currentTeam) return
    try {
      const ch = await mmApi.createChannel(authStore.currentTeam.id, name, displayName, type, purpose)
      channels.value.unshift(ch)
      await selectChannel(ch.id)
      return ch
    } catch (err) {
      console.error('Failed to create channel:', err)
      throw err
    }
  }

  // --- WebSocket Event Handlers ---
  function handleWsPosted(event: any) {
    try {
      const post: MattermostPost = JSON.parse(event.data.post)
      const channelId = post.channel_id
      const myId = authStore.currentUser?.id

      // Fetch author if needed
      if (post.user_id) {
        usersStore.fetchUsers([post.user_id])
      }

      // Add to channel posts if already cached
      if (posts.value[channelId]) {
        if (!posts.value[channelId].some((p) => p.id === post.id)) {
          posts.value[channelId].push(post)
        }
      }

      // Update channel's last post
      const ch = channels.value.find((c) => c.id === channelId)
      if (ch) {
        ch.last_post_at = post.create_at
        ch.last_post = post
        sortChannels()
      }

      // Notifications, sound & unread tracking
      const isMe = post.user_id === myId
      const isMuted = ch?.is_muted || false
      const isCurrentChat = channelId === activeChannelId.value

      if (!isMe && !isMuted) {
        // Play Telegram received sound
        soundService.playReceived()

        // Trigger web notification & toast
        const authorName = usersStore.getUserDisplayName(post.user_id)
        const channelTitle = ch?.display_name || ch?.name || 'Chat'
        const isDirect = ch?.type === 'D'

        notificationService.notifyMessage({
          channelId,
          userId: post.user_id,
          authorName,
          channelTitle,
          message: post.message,
          isDirect,
          isCurrentChat,
          isMuted,
          onOpenChat: () => {
            selectChannel(channelId)
          }
        })
      }

      // Unread tracking: Never count user's own messages sent from other clients!
      if (isMe) {
        unreadCounts.value[channelId] = 0
      } else if (!isCurrentChat) {
        unreadCounts.value[channelId] = (unreadCounts.value[channelId] || 0) + 1
      }
      const totalUnread = Object.values(unreadCounts.value).reduce((a, b) => a + b, 0)
      notificationService.updateDocumentTitle(totalUnread)
    } catch (err) {
      console.error('Error handling ws posted:', err)
    }
  }

  function handleWsTyping(event: any) {
    const channelId = event.broadcast?.channel_id
    const userId = event.data?.user_id
    if (!channelId || !userId || userId === authStore.currentUser?.id) return

    if (!typingUsers.value[channelId]) {
      typingUsers.value[channelId] = {}
    }

    const userName = usersStore.getUserDisplayName(userId)
    typingUsers.value[channelId][userId] = userName

    // Clear after 4 seconds
    const key = `${channelId}_${userId}`
    if (typingTimeouts.has(key)) {
      clearTimeout(typingTimeouts.get(key))
    }
    const timer = setTimeout(() => {
      if (typingUsers.value[channelId]) {
        delete typingUsers.value[channelId][userId]
      }
      typingTimeouts.delete(key)
    }, 4000)
    typingTimeouts.set(key, timer)
  }

  function handleWsReactionAdded(event: any) {
    try {
      const reaction: MattermostReaction = JSON.parse(event.data.reaction)
      const postList = posts.value[event.broadcast?.channel_id || '']
      if (postList) {
        const post = postList.find((p) => p.id === reaction.post_id)
        if (post) {
          if (!post.metadata) post.metadata = {}
          if (!post.metadata.reactions) post.metadata.reactions = []
          if (!post.metadata.reactions.some((r) => r.user_id === reaction.user_id && r.emoji_name === reaction.emoji_name)) {
            post.metadata.reactions.push(reaction)
          }
        }
      }
    } catch (err) {
      console.error('Error handling reaction added:', err)
    }
  }

  function handleWsReactionRemoved(event: any) {
    try {
      const reaction: MattermostReaction = JSON.parse(event.data.reaction)
      const postList = posts.value[event.broadcast?.channel_id || '']
      if (postList) {
        const post = postList.find((p) => p.id === reaction.post_id)
        if (post && post.metadata?.reactions) {
          post.metadata.reactions = post.metadata.reactions.filter(
            (r) => !(r.user_id === reaction.user_id && r.emoji_name === reaction.emoji_name)
          )
        }
      }
    } catch (err) {
      console.error('Error handling reaction removed:', err)
    }
  }

  function handleWsPostEdited(event: any) {
    try {
      const edited: MattermostPost = JSON.parse(event.data.post)
      const postList = posts.value[edited.channel_id]
      if (postList) {
        const idx = postList.findIndex((p) => p.id === edited.id)
        if (idx !== -1) {
          postList[idx] = edited
        }
      }
    } catch (err) {
      console.error('Error handling post edited:', err)
    }
  }

  function handleWsPostDeleted(event: any) {
    try {
      const deleted: MattermostPost = JSON.parse(event.data.post)
      const postList = posts.value[deleted.channel_id]
      if (postList) {
        posts.value[deleted.channel_id] = postList.filter((p) => p.id !== deleted.id)
      }
    } catch (err) {
      console.error('Error handling post deleted:', err)
    }
  }

  function handleWsChannelViewed(event: any) {
    const channelId = event.broadcast?.channel_id || event.data?.channel_id
    const userId = event.broadcast?.user_id || event.data?.user_id
    if (channelId && userId === authStore.currentUser?.id) {
      unreadCounts.value[channelId] = 0
      const totalUnread = Object.values(unreadCounts.value).reduce((a, b) => a + b, 0)
      notificationService.updateDocumentTitle(totalUnread)
    }
  }

  return {
    channels,
    activeChannelId,
    activeChannel,
    posts,
    currentPosts,
    activePostsWithSeparators,
    loadingChannels,
    loadingPosts,
    unreadCounts,
    typingUsers,
    initWs,
    loadChannels,
    selectChannel,
    loadPosts,
    sendMessage,
    editMessage,
    deleteMessage,
    toggleReaction,
    sendTyping,
    openDirectMessage,
    createNewChannel,
    togglePinChannel,
    toggleMuteChannel,
    toggleMarkAsUnread,
    togglePinPost
  }
})
