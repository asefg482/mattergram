import fs from 'fs'
import path from 'path'
import webpush from 'web-push'
import { WebSocket as WsClient } from 'ws'

let config = {
  rootDir: process.cwd(),
  defaultServer: '',
  allowedServers: new Set(),
  secureTls: true
}

let vapidKeys = {
  publicKey: '',
  privateKey: ''
}

// Subscriptions: Array<{ endpoint, keys: { p256dh, auth }, userId, token, serverUrl, createdAt }>
let subscriptions = []

// Map of userId -> { ws: WsClient, token: string, serverUrl: string, retryTimer: any, pingTimer: any, retryCount: number }
const userSockets = new Map()

function getVapidFilePath() {
  return path.join(config.rootDir, '.vapid.json')
}

function getSubscriptionsFilePath() {
  return path.join(config.rootDir, '.push-subscriptions.json')
}

function loadVapidKeys() {
  const filePath = getVapidFilePath()
  if (fs.existsSync(filePath)) {
    try {
      const data = JSON.parse(fs.readFileSync(filePath, 'utf8'))
      if (data.publicKey && data.privateKey) {
        vapidKeys = data
        return
      }
    } catch (err) {
      console.warn('[Push Service] Could not parse .vapid.json, generating new keys:', err.message)
    }
  }

  // Generate new keys
  const keys = webpush.generateVAPIDKeys()
  vapidKeys = {
    publicKey: keys.publicKey,
    privateKey: keys.privateKey
  }

  try {
    fs.writeFileSync(filePath, JSON.stringify(vapidKeys, null, 2), 'utf8')
    console.log('[Push Service] Generated and saved new VAPID keys to .vapid.json')
  } catch (err) {
    console.error('[Push Service] Failed to save .vapid.json:', err.message)
  }
}

function loadSubscriptions() {
  const filePath = getSubscriptionsFilePath()
  if (fs.existsSync(filePath)) {
    try {
      const data = JSON.parse(fs.readFileSync(filePath, 'utf8'))
      if (Array.isArray(data)) {
        subscriptions = data.filter((s) => s && s.endpoint && s.keys && s.keys.p256dh && s.keys.auth)
        console.log(`[Push Service] Loaded ${subscriptions.length} push subscriptions from storage.`)
        return
      }
    } catch (err) {
      console.warn('[Push Service] Failed to read .push-subscriptions.json:', err.message)
    }
  }
  subscriptions = []
}

function saveSubscriptions() {
  const filePath = getSubscriptionsFilePath()
  try {
    fs.writeFileSync(filePath, JSON.stringify(subscriptions, null, 2), 'utf8')
  } catch (err) {
    console.error('[Push Service] Failed to save subscriptions:', err.message)
  }
}

function cleanExpiredSubscription(endpoint) {
  const before = subscriptions.length
  subscriptions = subscriptions.filter((s) => s.endpoint !== endpoint)
  if (subscriptions.length !== before) {
    saveSubscriptions()
    console.log(`[Push Service] Removed expired subscription: ${endpoint}`)
  }
}

// Send push notification to all subscriptions of a specific user
async function sendToUserSubscriptions(userId, payloadStr) {
  const userSubs = subscriptions.filter((s) => s.userId === userId)
  if (userSubs.length === 0) return

  for (const sub of userSubs) {
    try {
      await webpush.sendNotification(
        {
          endpoint: sub.endpoint,
          keys: sub.keys
        },
        payloadStr
      )
    } catch (err) {
      if (err.statusCode === 404 || err.statusCode === 410) {
        cleanExpiredSubscription(sub.endpoint)
      } else {
        console.warn(`[Push Service] Push failed for ${userId}:`, err.message || err.statusCode)
      }
    }
  }
}

// Background Mattermost WebSocket Daemon for a user
function stopUserWebSocket(userId) {
  const entry = userSockets.get(userId)
  if (entry) {
    if (entry.retryTimer) clearTimeout(entry.retryTimer)
    if (entry.pingTimer) clearInterval(entry.pingTimer)
    try {
      if (entry.ws && entry.ws.readyState === 1) {
        entry.ws.close()
      }
    } catch {}
    userSockets.delete(userId)
  }
}

function ensureUserWebSocket(userId) {
  if (!userId) return

  const userSubs = subscriptions.filter((s) => s.userId === userId)
  if (userSubs.length === 0) {
    stopUserWebSocket(userId)
    return
  }

  const latestSub = userSubs[userSubs.length - 1]
  const targetToken = latestSub.token
  const targetServer = (latestSub.serverUrl || config.defaultServer || '').trim().replace(/\/+$/, '')

  if (!targetToken || !targetServer) {
    return
  }

  const existing = userSockets.get(userId)
  if (existing) {
    // If already connected with same token & server, keep it
    if (existing.ws && existing.ws.readyState === 1 && existing.token === targetToken && existing.serverUrl === targetServer) {
      return
    }
    // Otherwise close old one and reconnect
    stopUserWebSocket(userId)
  }

  let targetUrl
  try {
    targetUrl = new URL(targetServer)
  } catch {
    console.warn(`[Push Service] Invalid server URL for user ${userId}: ${targetServer}`)
    return
  }

  const wsProtocol = targetUrl.protocol === 'https:' ? 'wss:' : 'ws:'
  const upstreamUrl = `${wsProtocol}//${targetUrl.host}/api/v4/websocket`

  const state = {
    ws: null,
    token: targetToken,
    serverUrl: targetServer,
    retryTimer: null,
    pingTimer: null,
    retryCount: existing ? existing.retryCount : 0
  }
  userSockets.set(userId, state)

  try {
    const ws = new WsClient(upstreamUrl, {
      rejectUnauthorized: config.secureTls
    })
    state.ws = ws

    ws.on('open', () => {
      state.retryCount = 0
      // Authenticate
      ws.send(
        JSON.stringify({
          seq: 1,
          action: 'authentication_challenge',
          data: { token: targetToken }
        })
      )

      // Start keep-alive ping every 30s
      state.pingTimer = setInterval(() => {
        if (ws.readyState === 1) {
          ws.send(JSON.stringify({ seq: Date.now(), action: 'ping' }))
        }
      }, 30000)
    })

    ws.on('message', (raw) => {
      try {
        const msg = JSON.parse(raw.toString())
        if (msg.event === 'posted' && msg.data && msg.data.post) {
          const post = JSON.parse(msg.data.post)

          // Skip messages posted by the user themselves
          if (post.user_id === userId) return

          const senderName = msg.data.sender_name || 'Someone'
          const channelName = msg.data.channel_display_name || msg.data.channel_name || 'Chat'
          const isDirect = msg.data.channel_type === 'D'

          const title = isDirect ? senderName : `${senderName} (${channelName})`
          let body = (post.message || '').trim()
          if (!body && post.file_ids && post.file_ids.length > 0) {
            body = '📎 Sent an attachment'
          } else if (!body) {
            body = 'New message'
          }
          if (body.length > 150) {
            body = body.slice(0, 147) + '...'
          }

          const pushPayload = JSON.stringify({
            title,
            body,
            icon: '/icon-192.png',
            badge: '/icon-192.png',
            tag: `channel-${post.channel_id}`,
            channelId: post.channel_id,
            url: `/c/${post.channel_id}`
          })

          sendToUserSubscriptions(userId, pushPayload)
        }
      } catch (err) {
        // Message parsing or handling error
      }
    })

    const handleDisconnect = () => {
      if (state.pingTimer) clearInterval(state.pingTimer)
      // Check if user still has subscriptions
      const currentSubs = subscriptions.filter((s) => s.userId === userId)
      if (currentSubs.length > 0) {
        state.retryCount++
        const delay = Math.min(30000, 2000 * Math.pow(1.5, state.retryCount))
        state.retryTimer = setTimeout(() => {
          ensureUserWebSocket(userId)
        }, delay)
      } else {
        stopUserWebSocket(userId)
      }
    }

    ws.on('close', handleDisconnect)
    ws.on('error', handleDisconnect)
  } catch (err) {
    console.error(`[Push Service] WebSocket connection error for user ${userId}:`, err.message)
  }
}

// Read body helper
function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let data = ''
    req.on('data', (chunk) => {
      data += chunk
      if (data.length > 65536) {
        req.destroy()
        reject(new Error('Payload too large'))
      }
    })
    req.on('end', () => {
      if (!data.trim()) return resolve({})
      try {
        resolve(JSON.parse(data))
      } catch (e) {
        reject(e)
      }
    })
    req.on('error', reject)
  })
}

export function initPushService(options = {}) {
  config = {
    ...config,
    ...options
  }

  loadVapidKeys()
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT || 'mailto:admin@mattergram.local',
    vapidKeys.publicKey,
    vapidKeys.privateKey
  )

  loadSubscriptions()

  // Start background listeners for all registered users
  const uniqueUsers = [...new Set(subscriptions.map((s) => s.userId).filter(Boolean))]
  console.log(`[Push Service] Starting background daemon for ${uniqueUsers.length} active users...`)
  for (const uid of uniqueUsers) {
    ensureUserWebSocket(uid)
  }
}

export function getVapidPublicKey() {
  return vapidKeys.publicKey
}

export async function handlePushApiRequest(req, res) {
  if (!req.url || !req.url.startsWith('/api/push')) {
    return false
  }

  const url = new URL(req.url, 'http://localhost')
  const pathname = url.pathname

  // 1. GET /api/push/vapid-public-key
  if (req.method === 'GET' && pathname === '/api/push/vapid-public-key') {
    res.writeHead(200, {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-cache'
    })
    res.end(JSON.stringify({ publicKey: vapidKeys.publicKey }))
    return true
  }

  // 2. POST /api/push/subscribe
  if (req.method === 'POST' && pathname === '/api/push/subscribe') {
    try {
      const body = await readJsonBody(req)
      const { subscription, userId, token, serverUrl } = body

      if (!subscription || !subscription.endpoint || !subscription.keys || !subscription.keys.p256dh || !subscription.keys.auth) {
        res.writeHead(400, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: 'INVALID_SUBSCRIPTION', message: 'Valid push subscription object required' }))
        return true
      }

      // Check serverUrl validation against allowed list if provided
      if (serverUrl && config.allowedServers && config.allowedServers.size > 0) {
        try {
          const origin = new URL(serverUrl).origin
          if (!config.allowedServers.has(origin)) {
            res.writeHead(403, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify({ error: 'FORBIDDEN_SERVER', message: 'Specified server is not in allowed list' }))
            return true
          }
        } catch {}
      }

      // Upsert subscription
      const existingIdx = subscriptions.findIndex((s) => s.endpoint === subscription.endpoint)
      const record = {
        endpoint: subscription.endpoint,
        keys: subscription.keys,
        userId: userId || (existingIdx !== -1 ? subscriptions[existingIdx].userId : ''),
        token: token || (existingIdx !== -1 ? subscriptions[existingIdx].token : ''),
        serverUrl: serverUrl || config.defaultServer,
        updatedAt: Date.now()
      }

      if (existingIdx !== -1) {
        subscriptions[existingIdx] = record
      } else {
        subscriptions.push(record)
      }

      saveSubscriptions()

      // Start/refresh background WebSocket for this user
      if (record.userId) {
        ensureUserWebSocket(record.userId)
      }

      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ ok: true }))
      return true
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: 'SUBSCRIBE_FAILED', message: err.message }))
      return true
    }
  }

  // 3. POST /api/push/unsubscribe
  if (req.method === 'POST' && pathname === '/api/push/unsubscribe') {
    try {
      const body = await readJsonBody(req)
      const endpoint = body.endpoint || body.subscription?.endpoint
      if (!endpoint) {
        res.writeHead(400, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: 'MISSING_ENDPOINT' }))
        return true
      }

      const sub = subscriptions.find((s) => s.endpoint === endpoint)
      const userId = sub?.userId

      subscriptions = subscriptions.filter((s) => s.endpoint !== endpoint)
      saveSubscriptions()

      if (userId) {
        // If no more subscriptions left for this user, disconnect background socket
        const remaining = subscriptions.filter((s) => s.userId === userId)
        if (remaining.length === 0) {
          stopUserWebSocket(userId)
        }
      }

      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ ok: true }))
      return true
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: 'UNSUBSCRIBE_FAILED', message: err.message }))
      return true
    }
  }

  // 4. POST /api/push/test
  if (req.method === 'POST' && pathname === '/api/push/test') {
    try {
      const body = await readJsonBody(req)
      const { subscription, title, body: msgBody } = body
      if (!subscription || !subscription.endpoint || !subscription.keys) {
        res.writeHead(400, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: 'INVALID_SUBSCRIPTION' }))
        return true
      }

      const payload = JSON.stringify({
        title: title || 'Mattergram Test Notification',
        body: msgBody || 'Background push notifications are working smoothly! 🚀',
        icon: '/icon-192.png',
        badge: '/icon-192.png',
        tag: 'mattergram-test',
        url: '/'
      })

      await webpush.sendNotification(subscription, payload)

      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ ok: true }))
      return true
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: 'TEST_PUSH_FAILED', message: err.message }))
      return true
    }
  }

  return false
}
