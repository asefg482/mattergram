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

class NotificationService {
  private enabled = true
  public toasts = ref<InAppToast[]>([])
  public permission = ref<NotificationPermission>('default')
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
          icon: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='%232481cc'%3E%3Cpath d='M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm4.64 6.8c-.15 1.58-.8 5.42-1.13 7.19-.14.75-.42 1-.68 1.03-.58.05-1.02-.38-1.58-.75-.88-.58-1.38-.94-2.23-1.5-.99-.65-.35-1.01.22-1.59.15-.15 2.71-2.48 2.76-2.69a.2.2 0 00-.05-.18c-.06-.05-.14-.03-.21-.02-.09.02-1.49.95-4.22 2.79-.4.27-.76.41-1.08.4-.36-.01-1.04-.2-1.55-.37-.63-.2-1.12-.31-1.08-.66.02-.18.27-.37.74-.56 2.92-1.27 4.86-2.11 5.83-2.52 2.78-1.16 3.35-1.36 3.73-1.36.08 0 .27.02.39.12.1.08.13.19.14.27-.01.06-.01.19-.03.32z'/%3E%3C/svg%3E",
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

  public dismissToast(toastId: string) {
    this.toasts.value = this.toasts.value.filter((t) => t.id !== toastId)
  }
}

export const notificationService = new NotificationService()
