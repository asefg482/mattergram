import { ref } from 'vue'

export interface InAppToast {
  id: string
  channelId: string
  userId: string
  authorName: string
  channelTitle: string
  message: string
  timestamp: number
}

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = window.atob(base64)
  const outputArray = new Uint8Array(rawData.length)
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i)
  }
  return outputArray
}

class NotificationService {
  private enabled = true
  public toasts = ref<InAppToast[]>([])
  public permission = ref<NotificationPermission>('default')
  public isPushSupported = ref(false)
  public pushSubscribed = ref(false)
  public isPushLoading = ref(false)
  private originalTitle = 'Mattergram — Telegram for Mattermost'
  private hasAutoRequested = false

  constructor() {
    const saved = localStorage.getItem('mattergram_notifications_enabled')
    if (saved !== null) {
      this.enabled = saved === 'true'
    }
    if (this.isSupported()) {
      this.permission.value = Notification.permission
      window.addEventListener('focus', () => {
        if (this.isSupported()) {
          this.permission.value = Notification.permission
        }
      })
    }

    if (typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window) {
      this.isPushSupported.value = true
      this.checkPushSubscription()
    }
  }

  public isSupported(): boolean {
    return typeof window !== 'undefined' && 'Notification' in window
  }

  public getPermission(): NotificationPermission {
    if (!this.isSupported()) return 'denied'
    this.permission.value = Notification.permission
    return this.permission.value
  }

  public isEnabled(): boolean {
    return this.enabled
  }

  public setEnabled(val: boolean) {
    this.enabled = val
    localStorage.setItem('mattergram_notifications_enabled', String(val))
  }

  public async requestPermission(): Promise<boolean> {
    if (!this.isSupported()) return false
    try {
      const res = await Notification.requestPermission()
      this.permission.value = res
      if (res === 'granted') {
        this.setEnabled(true)
      }
      return res === 'granted'
    } catch {
      return false
    }
  }

  public async checkPushSubscription(): Promise<boolean> {
    if (!this.isPushSupported.value) return false
    try {
      const reg = await navigator.serviceWorker.ready
      const sub = await reg.pushManager.getSubscription()
      this.pushSubscribed.value = !!sub
      return !!sub
    } catch {
      return false
    }
  }

  public async subscribeToPush(options?: {
    userId?: string
    token?: string
    serverUrl?: string
  }): Promise<boolean> {
    if (!this.isPushSupported.value) return false
    this.isPushLoading.value = true

    try {
      // 1. Ensure permission is granted
      if (this.permission.value !== 'granted') {
        const granted = await this.requestPermission()
        if (!granted) return false
      }

      // 2. Fetch VAPID public key from backend
      const keyRes = await fetch('/api/push/vapid-public-key')
      if (!keyRes.ok) throw new Error('Failed to retrieve VAPID public key')
      const { publicKey } = await keyRes.json()

      // 3. Register or obtain push subscription with Service Worker
      const reg = await navigator.serviceWorker.ready
      let sub = await reg.pushManager.getSubscription()
      if (!sub) {
        sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(publicKey) as unknown as BufferSource
        })
      }

      // 4. Send subscription to server
      const subRes = await fetch('/api/push/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          subscription: sub,
          userId: options?.userId,
          token: options?.token,
          serverUrl: options?.serverUrl
        })
      })

      if (!subRes.ok) {
        throw new Error('Failed to save push subscription on server')
      }

      this.pushSubscribed.value = true
      localStorage.setItem('mattergram_push_enabled', 'true')
      return true
    } catch (err) {
      console.error('[Notifications] Failed to subscribe to push:', err)
      return false
    } finally {
      this.isPushLoading.value = false
    }
  }

  public async unsubscribeFromPush(): Promise<boolean> {
    if (!this.isPushSupported.value) return false
    this.isPushLoading.value = true

    try {
      const reg = await navigator.serviceWorker.ready
      const sub = await reg.pushManager.getSubscription()
      if (sub) {
        await fetch('/api/push/unsubscribe', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ endpoint: sub.endpoint })
        }).catch(() => {})
        await sub.unsubscribe()
      }

      this.pushSubscribed.value = false
      localStorage.setItem('mattergram_push_enabled', 'false')
      return true
    } catch (err) {
      console.error('[Notifications] Failed to unsubscribe from push:', err)
      return false
    } finally {
      this.isPushLoading.value = false
    }
  }

  public async sendTestPush(): Promise<boolean> {
    if (!this.isPushSupported.value) return false
    try {
      const reg = await navigator.serviceWorker.ready
      const sub = await reg.pushManager.getSubscription()
      if (!sub) {
        throw new Error('No active push subscription')
      }

      const res = await fetch('/api/push/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          subscription: sub,
          title: 'Mattergram Notification',
          body: 'پیام‌های دریافتی حتی در زمان بسته بودن برنامه به این دستگاه تحویل داده می‌شوند! 🚀'
        })
      })
      return res.ok
    } catch (err) {
      console.error('[Notifications] Failed to send test push:', err)
      return false
    }
  }

  public async syncPushSubscription(userId?: string, token?: string, serverUrl?: string) {
    if (!this.isPushSupported.value) return
    const isPreferred = localStorage.getItem('mattergram_push_enabled') !== 'false'
    if (isPreferred && this.permission.value === 'granted') {
      await this.subscribeToPush({ userId, token, serverUrl })
    }
  }

  public autoRequestPermissionOnFirstOpen() {
    if (!this.isSupported()) return

    // Update current permission state
    this.permission.value = Notification.permission

    // Only prompt if user hasn't made a choice yet ('default')
    if (Notification.permission !== 'default') {
      return
    }

    if (this.hasAutoRequested) return
    this.hasAutoRequested = true

    // 1. Immediately request browser permission (supported in Firefox, Chromium desktop, etc.)
    this.requestPermission().catch(() => {})

    // 2. In case browser requires a user gesture (e.g. Safari or strict policy):
    const triggerOnFirstInteraction = async () => {
      if (Notification.permission === 'default') {
        await this.requestPermission()
      }
      cleanup()
    }

    const cleanup = () => {
      window.removeEventListener('click', triggerOnFirstInteraction)
      window.removeEventListener('keydown', triggerOnFirstInteraction)
      window.removeEventListener('touchstart', triggerOnFirstInteraction)
    }

    window.addEventListener('click', triggerOnFirstInteraction, { once: true, passive: true })
    window.addEventListener('keydown', triggerOnFirstInteraction, { once: true, passive: true })
    window.addEventListener('touchstart', triggerOnFirstInteraction, { once: true, passive: true })
  }

  public updateDocumentTitle(unreadCount: number) {
    if (unreadCount > 0) {
      document.title = `(${unreadCount}) Mattergram`
    } else {
      document.title = this.originalTitle
    }
  }

  public notifyMessage(options: {
    channelId: string
    userId: string
    authorName: string
    channelTitle: string
    message: string
    isDirect: boolean
    isCurrentChat: boolean
    isMuted?: boolean
    onOpenChat: () => void
  }) {
    if (options.isMuted) return
    if (!this.enabled) return

    const isWindowFocused = typeof document !== 'undefined' && document.hasFocus()

    // 1. Push In-App Toast (if not already actively viewing that channel with focus)
    if (!options.isCurrentChat || !isWindowFocused) {
      const toastId = `${options.channelId}_${Date.now()}`
      const toast: InAppToast = {
        id: toastId,
        channelId: options.channelId,
        userId: options.userId,
        authorName: options.authorName,
        channelTitle: options.channelTitle,
        message: options.message || 'Sent an attachment',
        timestamp: Date.now()
      }

      // Keep max 3 toasts
      this.toasts.value.unshift(toast)
      if (this.toasts.value.length > 3) {
        this.toasts.value.pop()
      }

      // Auto dismiss after 5 seconds
      setTimeout(() => {
        this.dismissToast(toastId)
      }, 5000)
    }

    // 2. Fire Native Web Desktop Notification
    if (this.isSupported() && this.getPermission() === 'granted' && (!isWindowFocused || !options.isCurrentChat)) {
      try {
        const title = options.isDirect
          ? options.authorName
          : `${options.authorName} (${options.channelTitle})`

        const n = new Notification(title, {
          body: options.message || '📎 Attachment',
          icon: '/icon-192.png',
          tag: options.channelId,
          silent: true // Sound already played via Web Audio API
        })

        n.onclick = () => {
          window.focus()
          options.onOpenChat()
          n.close()
        }
      } catch (err) {
        console.error('Desktop notification error:', err)
      }
    }
  }

  public showToast(options: {
    title?: string
    message: string
    channelId?: string
    userId?: string
    authorName?: string
    channelTitle?: string
    type?: string
  }) {
    const toastId = `toast_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`
    const toast: InAppToast = {
      id: toastId,
      channelId: options.channelId || '',
      userId: options.userId || '',
      authorName: options.authorName || options.title || 'Notification',
      channelTitle: options.channelTitle || 'Mattergram',
      message: options.message,
      timestamp: Date.now()
    }

    this.toasts.value.unshift(toast)
    if (this.toasts.value.length > 3) {
      this.toasts.value.pop()
    }

    setTimeout(() => {
      this.dismissToast(toastId)
    }, 4000)
  }

  public dismissToast(toastId: string) {
    this.toasts.value = this.toasts.value.filter((t) => t.id !== toastId)
  }
}

export const notificationService = new NotificationService()
