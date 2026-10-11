import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { mmApi } from '../services/mattermostApi'
import { mmWs } from '../services/mattermostWs'
import { soundService } from '../services/sounds'
import { notificationService } from '../services/notifications'
import { useAuthStore } from './auth'
import { useUsersStore } from './users'
import { toEmojiName, toEmojiChar } from '../utils/formatters'
import { recordReactionUsage } from '../utils/reactions'
import type { MattermostChannel, MattermostPost, MattermostReaction } from '../types/mattermost'

export const useChatStore = defineStore('chat', () => {
  const authStore = useAuthStore()
  const usersStore = useUsersStore()

  const channels = ref<MattermostChannel[]>([])
  const activeChannelId = ref<string | null>(null)
  const scrollToBottomTrigger = ref(0)
  const posts = ref<Record<string, MattermostPost[]>>({})
  const loadingChannels = ref(false)
  const loadingPosts = ref(false)
  const unreadCounts = ref<Record<string, number>>({})
  const firstUnreadPostIds = ref<Record<string, string | null>>({})
  const channelLastViewedAt = ref<Record<string, number>>({})
  const isScrolledUp = ref(false)
  const animatedPostIds = ref<Set<string>>(new Set())
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

  // Compute the first unread post in a channel
  function computeFirstUnread(
    channelId: string,
    postList: MattermostPost[],
    unreadCount: number,
    lastViewedAt = 0
  ): string | null {
    if (!postList || postList.length === 0) return null
    const myId = authStore.currentUser?.id

    // Strategy 1: Check by lastViewedAt timestamp
    if (lastViewedAt > 0) {
      const postByTime = postList.find((p) => p.create_at > lastViewedAt && p.user_id !== myId)
      if (postByTime) {
        return postByTime.id
      }
    }

    // Strategy 2: Check by unreadCount from recent posts
    if (unreadCount > 0) {
      const incomingPosts = postList.filter((p) => p.user_id !== myId)
      if (incomingPosts.length > 0) {
        const idx = Math.max(0, incomingPosts.length - unreadCount)
        return incomingPosts[idx].id
      } else {
        const idx = Math.max(0, postList.length - unreadCount)
        return postList[idx].id
      }
    }

    return null
  }

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

      // Fetch last post for each channel to display preview in sidebar
      const authorIdsToFetch = new Set<string>()
      await Promise.allSettled(
        channels.value.map(async (ch) => {
          try {
            const pRes = await mmApi.getPosts(ch.id, 0, 1)
            if (pRes.order && pRes.order.length > 0) {
              const lastId = pRes.order[0]
              const lastPost = pRes.posts[lastId]
              if (lastPost && lastPost.delete_at === 0) {
                ch.last_post = lastPost
                if (lastPost.create_at) {
                  ch.last_post_at = Math.max(ch.last_post_at || 0, lastPost.create_at)
                }
                if (lastPost.user_id) {
                  authorIdsToFetch.add(lastPost.user_id)
                }
              }
            }
          } catch (e) {
            // Channel may have no posts or restricted
          }
        })
      )

      if (authorIdsToFetch.size > 0) {
        await usersStore.fetchUsers(Array.from(authorIdsToFetch))
      }

      // Fetch channel members to populate last_viewed_at and unread counts
      try {
        const members = await mmApi.getMyChannelMembers(authStore.currentTeam.id)
        if (Array.isArray(members)) {
          for (const m of members) {
            if (m.channel_id) {
              channelLastViewedAt.value[m.channel_id] = m.last_viewed_at || 0
              if (typeof m.msg_count === 'number') {
                const ch = channels.value.find((c) => c.id === m.channel_id)
                if (ch && typeof ch.total_msg_count === 'number') {
                  const unread = Math.max(0, ch.total_msg_count - m.msg_count)
                  if (unread > 0) {
                    unreadCounts.value[m.channel_id] = unread
                  }
                }
              }
            }
          }
          const totalUnread = Object.values(unreadCounts.value).reduce((a, b) => a + b, 0)
          notificationService.updateDocumentTitle(totalUnread)
        }
      } catch (e) {
        // Silently catch if not supported
      }

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
      firstUnreadPostIds.value[channelId] = null
    } else {
      unreadCounts.value[channelId] = 1
      const chPosts = posts.value[channelId]
      if (chPosts && chPosts.length > 0) {
        const myId = authStore.currentUser?.id
        const incoming = chPosts.filter((p) => p.user_id !== myId)
        const target = incoming.length > 0 ? incoming[incoming.length - 1] : chPosts[chPosts.length - 1]
        if (target) {
          firstUnreadPostIds.value[channelId] = target.id
        }
      }
    }
    const totalUnread = Object.values(unreadCounts.value).reduce((a, b) => a + b, 0)
    notificationService.updateDocumentTitle(totalUnread)
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

  // Select Channel (Supports channel ID or channel name)
  async function selectChannel(channelId: string) {
    const ch = channels.value.find((c) => c.id === channelId || c.name === channelId)
    const targetId = ch ? ch.id : channelId

    if (activeChannelId.value === targetId) {
      scrollToBottomTrigger.value++
      return
    }
    const prevChannelId = activeChannelId.value || ''
    if (prevChannelId) {
      // Clear previous channel unread marker on channel change
      firstUnreadPostIds.value[prevChannelId] = null
    }

    activeChannelId.value = targetId
    scrollToBottomTrigger.value++

    // Capture unread metrics prior to resetting
    const unreadCount = unreadCounts.value[targetId] || 0
    const lastViewedAt = channelLastViewedAt.value[targetId] || 0

    // Mark as read in Mattermost & local store
    unreadCounts.value[targetId] = 0
    const totalUnread = Object.values(unreadCounts.value).reduce((a, b) => a + b, 0)
    notificationService.updateDocumentTitle(totalUnread)
    try {
      await mmApi.viewChannel(targetId, prevChannelId)
    } catch {}

    // Load posts with captured unread metrics
    await loadPosts(targetId, unreadCount, lastViewedAt)
  }

  // Load Posts
  async function loadPosts(channelId: string, unreadCount = 0, lastViewedAt = 0) {
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
      animatedPostIds.value.clear()

      // Keep channel's last_post updated
      const ch = channels.value.find((c) => c.id === channelId)
      if (ch && postList.length > 0) {
        const newest = postList[postList.length - 1]
        ch.last_post = newest
        ch.last_post_at = newest.create_at
      }

      // Calculate first unread post to place separator
      if (unreadCount > 0 || lastViewedAt > 0) {
        const firstUnreadId = computeFirstUnread(channelId, postList, unreadCount, lastViewedAt)
        firstUnreadPostIds.value[channelId] = firstUnreadId
      } else if (!firstUnreadPostIds.value[channelId]) {
        firstUnreadPostIds.value[channelId] = null
      }
    } catch (err) {
      console.error('Failed to load posts:', err)
    } finally {
      loadingPosts.value = false
    }
  }

  // Send Message with Optimistic Transition & Animation
  async function sendMessage(
    channelId: string,
    message: string,
    rootId = '',
    fileIds: string[] = [],
    attachedFilesList: any[] = []
  ) {
    if (!message.trim() && !fileIds.length) return

    const tempId = 'temp_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7)
    const myUser = authStore.currentUser
    const tempPost: MattermostPost = {
      id: tempId,
      create_at: Date.now(),
      update_at: Date.now(),
      edit_at: 0,
      delete_at: 0,
      is_pinned: false,
      user_id: myUser?.id || '',
      channel_id: channelId,
      root_id: rootId,
      original_id: '',
      message: message,
      type: '',
      props: {},
      hashtags: '',
      file_ids: fileIds,
      pending_post_id: tempId,
      metadata: {
        reactions: [],
        files: attachedFilesList.length > 0 ? [...attachedFilesList] : undefined
      }
    }

    if (!posts.value[channelId]) {
      posts.value[channelId] = []
    }

    animatedPostIds.value.add(tempId)
    posts.value[channelId].push(tempPost)

    const ch = channels.value.find((c) => c.id === channelId)
    if (ch) {
      ch.last_post_at = tempPost.create_at
      ch.last_post = tempPost
      sortChannels()
    }

    try {
      const newPost = await mmApi.createPost(channelId, message, rootId, fileIds)
      newPost.pending_post_id = tempId
      animatedPostIds.value.add(newPost.id)
      setTimeout(() => {
        animatedPostIds.value.delete(tempId)
        animatedPostIds.value.delete(newPost.id)
      }, 3000)

      const idx = posts.value[channelId].findIndex((p) => p.id === tempId || p.pending_post_id === tempId)
      if (idx !== -1) {
        posts.value[channelId][idx] = newPost
      } else if (!posts.value[channelId].some((p) => p.id === newPost.id)) {
        posts.value[channelId].push(newPost)
      }

      if (ch) {
        ch.last_post_at = newPost.create_at
        ch.last_post = newPost
      }

      soundService.playSent()
      return newPost
    } catch (err) {
      posts.value[channelId] = posts.value[channelId].filter((p) => p.id !== tempId)
      animatedPostIds.value.delete(tempId)
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
    const emojiChar = toEmojiChar(emojiName)
    recordReactionUsage(emojiChar)

    const existing = post.metadata?.reactions?.find(
      (r) => r.user_id === myId && (toEmojiChar(r.emoji_name) === emojiChar || r.emoji_name === normalizedName || r.emoji_name === emojiName)
    )

    try {
      if (existing) {
        await mmApi.removeReaction(myId, post.id, existing.emoji_name)
        if (post.metadata?.reactions) {
          post.metadata.reactions = post.metadata.reactions.filter(
            (r) => !(r.user_id === myId && (toEmojiChar(r.emoji_name) === emojiChar || r.emoji_name === existing.emoji_name || r.emoji_name === normalizedName))
          )
        }
      } else {
        await mmApi.addReaction(myId, post.id, normalizedName)
        if (!post.metadata) post.metadata = {}
        if (!post.metadata.reactions) post.metadata.reactions = []
        if (!post.metadata.reactions.some((r) => r.user_id === myId && toEmojiChar(r.emoji_name) === emojiChar)) {
          post.metadata.reactions.push({
            user_id: myId,
            post_id: post.id,
            emoji_name: normalizedName,
            create_at: Date.now()
          })
        }
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

  // Open or Join Channel
  async function openOrJoinChannel(channel: MattermostChannel) {
    const myId = authStore.currentUser?.id
    const existing = channels.value.find((c) => c.id === channel.id)
    if (!existing) {
      if (myId && channel.type !== 'D') {
        try {
          await mmApi.joinChannel(channel.id, myId)
        } catch (e) {
          console.warn('Error joining channel, proceeding to select:', e)
        }
      }
      channels.value.unshift(channel)
    }
    await selectChannel(channel.id)
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
        // Reconcile optimistic post if sent by current user
        const tempIdx = posts.value[channelId].findIndex(
          (p) => p.id.startsWith('temp_') && p.user_id === post.user_id && p.message === post.message
        )
        if (tempIdx !== -1) {
          post.pending_post_id = posts.value[channelId][tempIdx].pending_post_id || posts.value[channelId][tempIdx].id
          posts.value[channelId][tempIdx] = post
        } else if (!posts.value[channelId].some((p) => p.id === post.id)) {
          if (channelId === activeChannelId.value) {
            animatedPostIds.value.add(post.id)
            setTimeout(() => animatedPostIds.value.delete(post.id), 3000)
          }
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
      } else {
        // Message arrived in the active chat while user is scrolled up or window is inactive
        const isUserAway = isScrolledUp.value || (typeof document !== 'undefined' && document.hidden)
        if (isUserAway && !firstUnreadPostIds.value[channelId]) {
          firstUnreadPostIds.value[channelId] = post.id
        }
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
      const channelId = event.broadcast?.channel_id || activeChannelId.value || ''
      const postList = posts.value[channelId] || (activeChannelId.value ? posts.value[activeChannelId.value] : null)
      if (postList) {
        const post = postList.find((p) => p.id === reaction.post_id)
        if (post) {
          if (!post.metadata) post.metadata = {}
          if (!post.metadata.reactions) post.metadata.reactions = []
          const reactChar = toEmojiChar(reaction.emoji_name)
          const alreadyExists = post.metadata.reactions.some(
            (r) => r.user_id === reaction.user_id && (toEmojiChar(r.emoji_name) === reactChar || r.emoji_name === reaction.emoji_name)
          )
          if (!alreadyExists) {
            post.metadata.reactions.push(reaction)
            usersStore.fetchUsers([reaction.user_id])
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
      const channelId = event.broadcast?.channel_id || activeChannelId.value || ''
      const postList = posts.value[channelId] || (activeChannelId.value ? posts.value[activeChannelId.value] : null)
      if (postList) {
        const post = postList.find((p) => p.id === reaction.post_id)
        if (post && post.metadata?.reactions) {
          const reactChar = toEmojiChar(reaction.emoji_name)
          post.metadata.reactions = post.metadata.reactions.filter(
            (r) => !(r.user_id === reaction.user_id && (toEmojiChar(r.emoji_name) === reactChar || r.emoji_name === reaction.emoji_name))
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
    scrollToBottomTrigger,
    activeChannel,
    posts,
    currentPosts,
    activePostsWithSeparators,
    loadingChannels,
    loadingPosts,
    unreadCounts,
    firstUnreadPostIds,
    channelLastViewedAt,
    isScrolledUp,
    animatedPostIds,
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
    openOrJoinChannel,
    createNewChannel,
    togglePinChannel,
    toggleMuteChannel,
    toggleMarkAsUnread,
    togglePinPost
  }
})
