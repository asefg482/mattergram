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
import type { MattermostChannel, MattermostPost, MattermostReaction, MattermostChannelMember, MattermostFileInfo } from '../types/mattermost'

export const useChatStore = defineStore('chat', () => {
  const authStore = useAuthStore()
  const usersStore = useUsersStore()

  const channels = ref<MattermostChannel[]>([])
  const activeChannelId = ref<string | null>(null)
  const scrollToBottomTrigger = ref(0)
  const posts = ref<Record<string, MattermostPost[]>>({})
  const channelMembers = ref<Record<string, MattermostChannelMember[]>>({})
  const loadingChannels = ref(false)
  const loadingPosts = ref(false)
  const hasLoadedChannelPosts = ref<Record<string, boolean>>({})
  const loadingOlderPosts = ref(false)
  const hasMoreOlderPosts = ref<Record<string, boolean>>({})
  const unreadCounts = ref<Record<string, number>>({})
  const firstUnreadPostIds = ref<Record<string, string | null>>({})
  const channelLastViewedAt = ref<Record<string, number>>({})
  const channelViewedByUser = ref<Record<string, Record<string, number>>>({})
  const isScrolledUp = ref(false)
  const animatedPostIds = ref<Set<string>>(new Set())
  const typingUsers = ref<Record<string, Record<string, string>>>({})
  const typingTimeouts = new Map<string, any>()

  // Active Thread / CRT View State
  const activeThreadRootPost = ref<MattermostPost | null>(null)
  const threadPosts = ref<MattermostPost[]>([])
  const loadingThread = ref(false)

  const activeChannel = computed(() => {
    return channels.value.find((c) => c.id === activeChannelId.value) || null
  })

  const currentPosts = computed(() => {
    if (!activeChannelId.value) return []
    return posts.value[activeChannelId.value] || []
  })

  // Count of chats (channels, groups, DMs) that have unread messages
  const unreadChatsCount = computed(() => {
    return channels.value.filter((c) => (unreadCounts.value[c.id] || 0) > 0).length
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
      const myId = authStore.currentUser?.id || ''
      const teamId = authStore.currentTeam.id

      // 1. Fetch raw channels and channel members concurrently
      const [rawChannels, members] = await Promise.all([
        mmApi.getMyChannels(teamId),
        mmApi.getMyChannelMembers(teamId).catch(() => [])
      ])

      // 2. Identify direct message user IDs to fetch
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

      // 3. Concurrently fetch DM user info and the latest post for all channels
      const authorIdsToFetch = new Set<string>()
      const postPromises = rawChannels.map(async (ch) => {
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
        } catch {
          // Channel may have no posts or restricted access
        }
      })

      const dmUsersPromise = dmUserIdsToFetch.length > 0 ? usersStore.fetchUsers(dmUserIdsToFetch) : Promise.resolve()

      await Promise.allSettled([...postPromises, dmUsersPromise])

      // 4. Fetch authors of latest posts if any
      if (authorIdsToFetch.size > 0) {
        await usersStore.fetchUsers(Array.from(authorIdsToFetch))
      }

      // 5. Populate channelLastViewedAt and unreadCounts
      if (Array.isArray(members)) {
        for (const m of members) {
          if (m.channel_id) {
            channelLastViewedAt.value[m.channel_id] = m.last_viewed_at || 0
            if (typeof m.msg_count === 'number') {
              const rawCh = rawChannels.find((c) => c.id === m.channel_id)
              if (rawCh && typeof rawCh.total_msg_count === 'number') {
                const unread = Math.max(0, rawCh.total_msg_count - m.msg_count)
                if (unread > 0) {
                  unreadCounts.value[m.channel_id] = unread
                }
              }
            }
          }
        }
      }

      // 6. Enrich channels with DM users and formatted names
      const enrichedChannels = rawChannels.map((ch) => {
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

      // 7. Sort channels by pinned status and latest post timestamp
      enrichedChannels.sort((a, b) => {
        if (a.is_pinned && !b.is_pinned) return -1
        if (!a.is_pinned && b.is_pinned) return 1
        return (b.last_post_at || b.create_at || 0) - (a.last_post_at || a.create_at || 0)
      })

      // 8. Atomically update channels so UI receives the ready, sorted list
      channels.value = enrichedChannels
      notificationService.updateDocumentTitle(unreadChatsCount.value)
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
    notificationService.updateDocumentTitle(unreadChatsCount.value)
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
      if (activeThreadRootPost.value) {
        closeThread()
      }
      scrollToBottomTrigger.value++
      return
    }
    const prevChannelId = activeChannelId.value || ''
    if (prevChannelId) {
      // Clear previous channel unread marker on channel change
      firstUnreadPostIds.value[prevChannelId] = null
    }

    closeThread()
    activeChannelId.value = targetId
    if (!posts.value[targetId] || !hasLoadedChannelPosts.value[targetId]) {
      loadingPosts.value = true
    }
    scrollToBottomTrigger.value++
    fetchChannelMembers(targetId)

    // Capture unread metrics prior to resetting
    const unreadCount = unreadCounts.value[targetId] || 0
    const lastViewedAt = channelLastViewedAt.value[targetId] || 0

    // Mark as read in Mattermost & local store
    unreadCounts.value[targetId] = 0
    notificationService.updateDocumentTitle(unreadChatsCount.value)
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
      hasMoreOlderPosts.value[channelId] = res.order.length >= 60
      loadingOlderPosts.value = false
      animatedPostIds.value.clear()
      fetchChannelMembers(channelId)

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
      hasLoadedChannelPosts.value[channelId] = true
      loadingPosts.value = false
    }
  }

  // Load older posts when scrolling up to earlier history
  async function loadOlderPosts(channelId: string): Promise<{ addedCount: number }> {
    if (!channelId) return { addedCount: 0 }
    if (loadingOlderPosts.value || loadingPosts.value) return { addedCount: 0 }
    if (hasMoreOlderPosts.value[channelId] === false) return { addedCount: 0 }

    const channelPosts = posts.value[channelId] || []
    if (channelPosts.length === 0) return { addedCount: 0 }

    // Find the oldest persisted message in the channel (ignoring optimistic temp posts)
    const oldestPost = channelPosts.find((p) => p.id && !p.id.startsWith('temp_'))
    if (!oldestPost) return { addedCount: 0 }

    loadingOlderPosts.value = true
    try {
      const res = await mmApi.getPosts(channelId, 0, 60, oldestPost.id)
      if (!res || !res.order || res.order.length === 0) {
        hasMoreOlderPosts.value[channelId] = false
        return { addedCount: 0 }
      }

      const existingIds = new Set(channelPosts.map((p) => p.id))
      const olderPosts: MattermostPost[] = []
      const userIdsToFetch = new Set<string>()

      for (const id of res.order) {
        const post = res.posts[id]
        if (post && post.delete_at === 0 && !existingIds.has(post.id)) {
          olderPosts.push(post)
          if (post.user_id) userIdsToFetch.add(post.user_id)
        }
      }

      if (res.order.length < 60) {
        hasMoreOlderPosts.value[channelId] = false
      }

      if (userIdsToFetch.size > 0) {
        usersStore.fetchUsers(Array.from(userIdsToFetch))
      }

      if (olderPosts.length > 0) {
        // Sort chronologically (oldest first)
        olderPosts.sort((a, b) => a.create_at - b.create_at)
        posts.value[channelId] = [...olderPosts, ...channelPosts]
        return { addedCount: olderPosts.length }
      } else {
        if (res.order.length < 60) {
          hasMoreOlderPosts.value[channelId] = false
        }
        return { addedCount: 0 }
      }
    } catch (err) {
      console.error('Failed to load older posts:', err)
      return { addedCount: 0 }
    } finally {
      loadingOlderPosts.value = false
    }
  }

  // Extract all files from a channel's loaded messages (for Shared Files feature)
  function getChannelFiles(channelId: string): MattermostFileInfo[] {
    if (!channelId) return []
    const channelPosts = posts.value[channelId] || []
    const filesMap = new Map<string, MattermostFileInfo>()

    for (const post of channelPosts) {
      if (post.delete_at > 0) continue
      if (post.metadata?.files && Array.isArray(post.metadata.files)) {
        for (const file of post.metadata.files) {
          if (file && file.id && !filesMap.has(file.id)) {
            filesMap.set(file.id, file)
          }
        }
      }
    }

    return Array.from(filesMap.values()).sort((a, b) => b.create_at - a.create_at)
  }

  // Scan earlier messages in channel to discover more historical files
  async function scanOlderPostsForFiles(channelId: string): Promise<{ addedFilesCount: number; hasMore: boolean }> {
    if (!channelId) return { addedFilesCount: 0, hasMore: false }
    const beforeCount = getChannelFiles(channelId).length
    await loadOlderPosts(channelId)
    const afterCount = getChannelFiles(channelId).length
    const hasMore = hasMoreOlderPosts.value[channelId] !== false
    return {
      addedFilesCount: Math.max(0, afterCount - beforeCount),
      hasMore
    }
  }

  // Search messages by hashtag across server & local cache
  async function searchPostsByHashtag(tag: string, channelId?: string): Promise<MattermostPost[]> {
    const cleanTag = tag.trim().replace(/^#/, '').toLowerCase()
    if (!cleanTag) return []

    const postsMap = new Map<string, MattermostPost>()
    const escapedTag = cleanTag.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const tagRegex = new RegExp('#' + escapedTag + '(?![a-zA-Z0-9_\\u0600-\\u06FF])', 'i')

    // 1. Search local cached posts (covers active channel, DMs, and groups loaded in store)
    for (const [chId, channelPosts] of Object.entries(posts.value)) {
      if (channelId && chId !== channelId) continue
      for (const p of channelPosts) {
        if (p.delete_at > 0) continue
        if (p.message && tagRegex.test(p.message)) {
          postsMap.set(p.id, p)
        }
      }
    }

    // 2. Search server across team posts (if team is available)
    if (authStore.currentTeam?.id) {
      try {
        const res = await mmApi.searchTeamPosts(authStore.currentTeam.id, '#' + cleanTag)
        if (res && res.posts) {
          const order = res.order || Object.keys(res.posts)
          for (const id of order) {
            const p = res.posts[id]
            if (!p || p.delete_at > 0) continue
            if (channelId && p.channel_id !== channelId) continue
            if (!postsMap.has(p.id)) {
              postsMap.set(p.id, p)
            }
          }
        }
      } catch (err) {
        console.warn('Server hashtag search encountered error or offline, fallback to local:', err)
      }
    }

    const results = Array.from(postsMap.values())

    // 3. Prefetch user profiles for authors
    const userIds = Array.from(new Set(results.map((p) => p.user_id).filter(Boolean)))
    if (userIds.length > 0) {
      usersStore.fetchUsers(userIds).catch(() => {})
    }

    // 4. Sort most recent first
    results.sort((a, b) => b.create_at - a.create_at)
    return results
  }

  // Jump to a specific post in chat and highlight it
  async function jumpToPost(channelId: string, postId: string) {
    if (!channelId || !postId) return

    // Switch to channel if not active
    if (activeChannelId.value !== channelId) {
      await selectChannel(channelId)
    }

    // Close thread view if currently open so main chat is visible
    if (activeThreadRootPost.value) {
      closeThread()
    }

    // Allow time for messages DOM to render
    setTimeout(() => {
      const el = document.getElementById(`msg-${postId}`) || document.querySelector(`[data-post-id="${postId}"]`)
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' })
        el.classList.add('animate-pulse', 'bg-[#3390ec]/15')
        setTimeout(() => el.classList.remove('animate-pulse', 'bg-[#3390ec]/15'), 2000)
      }
    }, 350)
  }

  // Resolve top-level thread root post ID for a channel to satisfy Mattermost's 1-level threading rule
  function getThreadRootId(channelId: string, postId: string): string {
    if (!postId) return ''
    const channelPosts = posts.value[channelId] || []

    let targetId = postId
    if (targetId.startsWith('temp_')) {
      const real = channelPosts.find((p) => p.pending_post_id === targetId || p.id === targetId)
      if (real && !real.id.startsWith('temp_')) {
        targetId = real.id
      } else {
        return ''
      }
    }

    let current = channelPosts.find((p) => p.id === targetId)
    if (!current) return targetId

    // Traverse upwards to find the thread ancestor whose root_id is empty
    const visited = new Set<string>()
    while (current && current.root_id && !visited.has(current.id)) {
      visited.add(current.id)
      const parent = channelPosts.find((p) => p.id === current!.root_id)
      if (!parent) {
        return current.root_id
      }
      current = parent
    }

    return current ? (current.root_id ? current.root_id : current.id) : targetId
  }

  // Open Thread / Comments for a post
  async function openThread(post: MattermostPost) {
    if (!post) return

    // Resolve the true root post ID
    const rootId = post.root_id ? getThreadRootId(post.channel_id, post.id) : post.id

    // Check if we already have the root post in local cache
    const channelPosts = posts.value[post.channel_id] || []
    let rootPost = channelPosts.find((p) => p.id === rootId) || (post.id === rootId ? post : null)

    if (!rootPost) {
      try {
        rootPost = await mmApi.getPost(rootId)
      } catch (err) {
        console.warn('Could not fetch root post from server:', err)
        rootPost = post
      }
    }

    activeThreadRootPost.value = rootPost
    loadingThread.value = true

    // Immediately pre-populate with known replies from local cache
    const localReplies = channelPosts.filter((p) => p.root_id === rootId && p.id !== rootId)
    localReplies.sort((a, b) => a.create_at - b.create_at)
    threadPosts.value = [...localReplies]

    // Fetch full thread from Mattermost API
    try {
      const threadRes = await mmApi.getPostThread(rootId)
      if (threadRes && threadRes.posts) {
        const allPosts = Object.values(threadRes.posts)
        const updatedRoot = allPosts.find((p) => p.id === rootId)
        if (updatedRoot) {
          activeThreadRootPost.value = updatedRoot
        }
        const serverReplies = allPosts.filter((p) => p.id !== rootId)
        serverReplies.sort((a, b) => a.create_at - b.create_at)
        threadPosts.value = serverReplies

        // Preload user profiles of thread participants
        const userIds = Array.from(new Set(allPosts.map((p) => p.user_id).filter(Boolean)))
        if (userIds.length > 0) {
          usersStore.fetchUsers(userIds)
        }
      }
    } catch (apiErr) {
      console.warn('Failed to fetch thread from API, using local posts:', apiErr)
    } finally {
      loadingThread.value = false
    }
  }

  function closeThread() {
    activeThreadRootPost.value = null
    threadPosts.value = []
    loadingThread.value = false
  }

  // Send Message with Optimistic Transition & Animation
  async function sendMessage(
    channelId: string,
    message: string,
    rootId = '',
    fileIds: string[] = [],
    attachedFilesList: any[] = [],
    postProps: Record<string, any> = {}
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
      props: { ...postProps },
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

    // If active thread matches target root, optimistically add to thread posts
    if (activeThreadRootPost.value && (rootId === activeThreadRootPost.value.id || rootId === activeThreadRootPost.value.root_id)) {
      threadPosts.value.push(tempPost)
    }

    const ch = channels.value.find((c) => c.id === channelId)
    if (ch) {
      ch.last_post_at = tempPost.create_at
      ch.last_post = tempPost
      sortChannels()
    }

    // Resolve safe root_id for Mattermost server
    let targetRootId = rootId ? getThreadRootId(channelId, rootId) : ''

    try {
      let newPost: MattermostPost
      try {
        newPost = await mmApi.createPost(channelId, message, targetRootId, fileIds, postProps)
      } catch (postErr: any) {
        const msg = String(postErr?.message || '').toLowerCase()
        const errId = String(postErr?.id || '').toLowerCase()
        const isRootError =
          Boolean(targetRootId) &&
          (msg.includes('root_id') ||
            msg.includes('rootid') ||
            errId.includes('root_id') ||
            errId.includes('create_post.root_id') ||
            postErr?.statusCode === 400)

        if (isRootError) {
          console.warn('Mattermost rejected root_id, falling back to top-level with reply props preserved:', postErr)
          newPost = await mmApi.createPost(channelId, message, '', fileIds, postProps)
        } else {
          throw postErr
        }
      }
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

      // Reconcile thread post if in active thread
      if (activeThreadRootPost.value && (targetRootId === activeThreadRootPost.value.id || rootId === activeThreadRootPost.value.id)) {
        const tIdx = threadPosts.value.findIndex((p) => p.id === tempId || p.pending_post_id === tempId)
        if (tIdx !== -1) {
          threadPosts.value[tIdx] = newPost
        } else if (!threadPosts.value.some((p) => p.id === newPost.id)) {
          threadPosts.value.push(newPost)
        }
        if (activeThreadRootPost.value.reply_count !== undefined) {
          activeThreadRootPost.value.reply_count++
        }
      }

      if (ch) {
        ch.last_post_at = newPost.create_at
        ch.last_post = newPost
      }

      soundService.playSent()
      return newPost
    } catch (err) {
      posts.value[channelId] = posts.value[channelId].filter((p) => p.id !== tempId)
      if (activeThreadRootPost.value) {
        threadPosts.value = threadPosts.value.filter((p) => p.id !== tempId)
      }
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
      if (activeThreadRootPost.value && activeThreadRootPost.value.id === postId) {
        activeThreadRootPost.value = edited
      }
      const tIdx = threadPosts.value.findIndex((p) => p.id === postId)
      if (tIdx !== -1) {
        threadPosts.value[tIdx] = edited
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
      threadPosts.value = threadPosts.value.filter((p) => p.id !== postId)
      if (activeThreadRootPost.value && activeThreadRootPost.value.id === postId) {
        activeThreadRootPost.value.delete_at = Date.now()
      } else if (activeThreadRootPost.value && activeThreadRootPost.value.reply_count) {
        activeThreadRootPost.value.reply_count = Math.max(0, activeThreadRootPost.value.reply_count - 1)
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

      // Add to active thread if message belongs to it
      if (activeThreadRootPost.value && (post.root_id === activeThreadRootPost.value.id || (post.props as any)?.reply_to_id === activeThreadRootPost.value.id)) {
        const tempIdx = threadPosts.value.findIndex(
          (p) => p.id.startsWith('temp_') && p.user_id === post.user_id && p.message === post.message
        )
        if (tempIdx !== -1) {
          post.pending_post_id = threadPosts.value[tempIdx].pending_post_id || threadPosts.value[tempIdx].id
          threadPosts.value[tempIdx] = post
        } else if (!threadPosts.value.some((p) => p.id === post.id)) {
          threadPosts.value.push(post)
        }
        if (activeThreadRootPost.value.reply_count !== undefined) {
          activeThreadRootPost.value.reply_count++
        }
      }

      // Update channel's last post
      const ch = channels.value.find((c) => c.id === channelId)
      if (ch) {
        ch.last_post_at = post.create_at
        ch.last_post = post
        sortChannels()
      }

      // Record author's activity and channel view
      if (channelId && post.user_id) {
        if (!channelViewedByUser.value[channelId]) {
          channelViewedByUser.value[channelId] = {}
        }
        channelViewedByUser.value[channelId][post.user_id] = post.create_at || Date.now()
        usersStore.lastActivityAt[post.user_id] = post.create_at || Date.now()
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
        // Message arrived in the active chat
        const isUserAway = isScrolledUp.value || (typeof document !== 'undefined' && document.hidden)
        if (isUserAway && !firstUnreadPostIds.value[channelId]) {
          firstUnreadPostIds.value[channelId] = post.id
        } else if (!isUserAway) {
          markActiveChannelViewed()
        }
      }
      notificationService.updateDocumentTitle(unreadChatsCount.value)
    } catch (err) {
      console.error('Error handling ws posted:', err)
    }
  }

  function handleWsTyping(event: any) {
    const channelId = event.broadcast?.channel_id
    const userId = event.data?.user_id
    if (!channelId || !userId || userId === authStore.currentUser?.id) return

    if (!channelViewedByUser.value[channelId]) {
      channelViewedByUser.value[channelId] = {}
    }
    channelViewedByUser.value[channelId][userId] = Date.now()
    usersStore.lastActivityAt[userId] = Date.now()

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
          if (reaction.user_id) {
            usersStore.lastActivityAt[reaction.user_id] = Date.now()
            if (channelId) {
              if (!channelViewedByUser.value[channelId]) {
                channelViewedByUser.value[channelId] = {}
              }
              channelViewedByUser.value[channelId][reaction.user_id] = Date.now()
            }
          }
        }
      }

      // Sync with thread if present
      if (activeThreadRootPost.value) {
        let tPost = threadPosts.value.find((p) => p.id === reaction.post_id)
        if (!tPost && activeThreadRootPost.value.id === reaction.post_id) {
          tPost = activeThreadRootPost.value
        }
        if (tPost) {
          if (!tPost.metadata) tPost.metadata = {}
          if (!tPost.metadata.reactions) tPost.metadata.reactions = []
          const reactChar = toEmojiChar(reaction.emoji_name)
          const alreadyExists = tPost.metadata.reactions.some(
            (r) => r.user_id === reaction.user_id && (toEmojiChar(r.emoji_name) === reactChar || r.emoji_name === reaction.emoji_name)
          )
          if (!alreadyExists) {
            tPost.metadata.reactions.push(reaction)
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

      // Sync with thread if present
      if (activeThreadRootPost.value) {
        let tPost = threadPosts.value.find((p) => p.id === reaction.post_id)
        if (!tPost && activeThreadRootPost.value.id === reaction.post_id) {
          tPost = activeThreadRootPost.value
        }
        if (tPost && tPost.metadata?.reactions) {
          const reactChar = toEmojiChar(reaction.emoji_name)
          tPost.metadata.reactions = tPost.metadata.reactions.filter(
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
      if (activeThreadRootPost.value && activeThreadRootPost.value.id === edited.id) {
        activeThreadRootPost.value = edited
      }
      const tIdx = threadPosts.value.findIndex((p) => p.id === edited.id)
      if (tIdx !== -1) {
        threadPosts.value[tIdx] = edited
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
      threadPosts.value = threadPosts.value.filter((p) => p.id !== deleted.id)
      if (activeThreadRootPost.value && activeThreadRootPost.value.id === deleted.id) {
        closeThread()
      } else if (activeThreadRootPost.value && activeThreadRootPost.value.reply_count) {
        activeThreadRootPost.value.reply_count = Math.max(0, activeThreadRootPost.value.reply_count - 1)
      }
    } catch (err) {
      console.error('Error handling post deleted:', err)
    }
  }

  function handleWsChannelViewed(event: any) {
    const channelId = event.broadcast?.channel_id || event.data?.channel_id
    const userId = event.broadcast?.user_id || event.data?.user_id
    if (!channelId || !userId) return

    if (!channelViewedByUser.value[channelId]) {
      channelViewedByUser.value[channelId] = {}
    }
    channelViewedByUser.value[channelId][userId] = Date.now()

    if (userId === authStore.currentUser?.id) {
      unreadCounts.value[channelId] = 0
      notificationService.updateDocumentTitle(unreadChatsCount.value)
    }
  }

  async function markActiveChannelViewed() {
    if (!activeChannelId.value) return
    const channelId = activeChannelId.value
    unreadCounts.value[channelId] = 0
    notificationService.updateDocumentTitle(unreadChatsCount.value)
    try {
      await mmApi.viewChannel(channelId)
    } catch {}
  }

  async function fetchChannelMembers(channelId: string): Promise<MattermostChannelMember[]> {
    if (!channelId) return []
    try {
      const members = await mmApi.getChannelMembers(channelId, 0, 100)
      if (Array.isArray(members)) {
        channelMembers.value[channelId] = members
        const uids = members.map((m) => m.user_id).filter(Boolean)
        if (uids.length > 0) {
          usersStore.fetchUsers(uids)
          usersStore.fetchStatuses(uids)
        }
        return members
      }
    } catch (err) {
      console.error('Failed to fetch channel members:', err)
    }
    return []
  }

  function getPostViewers(post: MattermostPost): string[] {
    if (!post) return []
    const myId = authStore.currentUser?.id
    const postAuthorId = post.user_id
    const channelId = post.channel_id
    const postCreateAt = post.create_at

    const viewers = new Set<string>()

    // 1. Reactions from other users
    const reactions = post.metadata?.reactions || []
    for (const r of reactions) {
      if (r.user_id && r.user_id !== postAuthorId) {
        viewers.add(r.user_id)
      }
    }

    // 2. Subsequent posts & reactions in this channel
    const channelPosts = posts.value[channelId] || []
    for (const p of channelPosts) {
      if (p.create_at > postCreateAt) {
        if (p.user_id && p.user_id !== postAuthorId && !p.id.startsWith('temp_')) {
          viewers.add(p.user_id)
        }
        const pReactions = p.metadata?.reactions || []
        for (const pr of pReactions) {
          if (pr.user_id && pr.user_id !== postAuthorId) {
            viewers.add(pr.user_id)
          }
        }
      }
    }

    // 3. WS views & typing events
    const views = channelViewedByUser.value[channelId]
    if (views) {
      for (const [uid, time] of Object.entries(views)) {
        if (uid && uid !== postAuthorId && time >= postCreateAt - 5000) {
          viewers.add(uid)
        }
      }
    }

    // 4. Channel members view timestamp & activity
    const members = channelMembers.value[channelId] || []
    const ch = channels.value.find((c) => c.id === channelId)
    const isDm = ch?.type === 'D'

    for (const m of members) {
      if (!m.user_id || m.user_id === postAuthorId) continue

      const viewedAt = m.last_viewed_at || (m as any).last_update_at || 0
      if (viewedAt >= postCreateAt - 5000) {
        viewers.add(m.user_id)
        continue
      }

      const lastAct = usersStore.lastActivityAt[m.user_id] || 0
      const isOnline = usersStore.getStatus(m.user_id) === 'online'

      if (isDm) {
        if (lastAct >= postCreateAt - 5000 || (isOnline && Date.now() - postCreateAt > 3000)) {
          viewers.add(m.user_id)
        }
      } else {
        if (lastAct >= postCreateAt - 5000) {
          viewers.add(m.user_id)
        }
      }
    }

    // 5. Viewing user (if not author and currently in channel)
    if (myId && myId !== postAuthorId && activeChannelId.value === channelId) {
      viewers.add(myId)
    }

    return Array.from(viewers)
  }

  function getPostViewersCount(post: MattermostPost): number {
    return getPostViewers(post).length
  }

  function isPostSeen(post: MattermostPost): boolean {
    if (!post) return false
    const myId = authStore.currentUser?.id
    if (post.user_id !== myId) return true
    return getPostViewers(post).length > 0
  }

  return {
    channels,
    activeChannelId,
    scrollToBottomTrigger,
    activeChannel,
    posts,
    channelMembers,
    currentPosts,
    activePostsWithSeparators,
    loadingChannels,
    loadingPosts,
    hasLoadedChannelPosts,
    loadingOlderPosts,
    hasMoreOlderPosts,
    loadOlderPosts,
    getChannelFiles,
    scanOlderPostsForFiles,
    searchPostsByHashtag,
    jumpToPost,
    unreadCounts,
    unreadChatsCount,
    firstUnreadPostIds,
    channelLastViewedAt,
    channelViewedByUser,
    isScrolledUp,
    animatedPostIds,
    typingUsers,
    initWs,
    loadChannels,
    selectChannel,
    loadPosts,
    fetchChannelMembers,
    getPostViewers,
    getPostViewersCount,
    getThreadRootId,
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
    togglePinPost,
    markActiveChannelViewed,
    isPostSeen,
    activeThreadRootPost,
    threadPosts,
    loadingThread,
    openThread,
    closeThread
  }
})
