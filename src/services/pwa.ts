import { ref } from 'vue'

export interface PwaState {
  canInstall: boolean
  isInstalled: boolean
  isIOS: boolean
  showBanner: boolean
  showIOSModal: boolean
}

class PwaService {
  private deferredPrompt: any = null
  public canInstall = ref(false)
  public isInstalled = ref(false)
  public isIOS = ref(false)
  public showBanner = ref(false)
  public showIOSModal = ref(false)

  constructor() {
    if (typeof window === 'undefined') return

    // 1. Check if running as standalone installed app
    const isStandalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      (navigator as any).standalone === true ||
      document.referrer.includes('android-app://')

    this.isInstalled.value = isStandalone

    // 2. Check if iOS device
    const userAgent = window.navigator.userAgent.toLowerCase()
    const isIOSDevice = /iphone|ipad|ipod/.test(userAgent)
    this.isIOS.value = isIOSDevice

    // 3. Register Service Worker for PWA compliance
    this.registerServiceWorker()

    // 4. Capture native beforeinstallprompt event (Chromium, Android, Windows, macOS Chrome/Edge)
    window.addEventListener('beforeinstallprompt', (e: any) => {
      e.preventDefault()
      this.deferredPrompt = e
      this.canInstall.value = true

      // Suggest to user if not dismissed recently and not already installed
      if (!this.isInstalled.value && !this.isDismissed()) {
        this.showBanner.value = true
      }
    })

    // 5. Track successful app installation
    window.addEventListener('appinstalled', () => {
      this.isInstalled.value = true
      this.canInstall.value = false
      this.showBanner.value = false
      this.deferredPrompt = null
      localStorage.setItem('mattergram_pwa_installed', 'true')
    })

    // 6. On iOS Safari (no beforeinstallprompt), show banner if not installed and not dismissed
    if (isIOSDevice && !isStandalone && !this.isDismissed()) {
      // Delay slightly so initial load isn't jarring
      setTimeout(() => {
        if (!this.isInstalled.value && !this.isDismissed()) {
          this.showBanner.value = true
        }
      }, 3500)
    }
  }

  private registerServiceWorker() {
    if ('serviceWorker' in navigator) {
      window.addEventListener('load', () => {
        navigator.serviceWorker
          .register('/sw.js')
          .then((reg) => {
            console.log('[PWA] Service Worker registered with scope:', reg.scope)
          })
          .catch((err) => {
            console.warn('[PWA] Service Worker registration failed:', err)
          })
      })
    }
  }

  private isDismissed(): boolean {
    try {
      const dismissedUntil = localStorage.getItem('mattergram_pwa_dismissed_until')
      if (dismissedUntil && Date.now() < parseInt(dismissedUntil, 10)) {
        return true
      }
    } catch {}
    return false
  }

  public dismissBanner(days = 7) {
    this.showBanner.value = false
    try {
      const until = Date.now() + days * 24 * 60 * 60 * 1000
      localStorage.setItem('mattergram_pwa_dismissed_until', until.toString())
    } catch {}
  }

  public async installApp(): Promise<boolean> {
    if (this.deferredPrompt) {
      try {
        await this.deferredPrompt.prompt()
        const choice = await this.deferredPrompt.userChoice
        if (choice.outcome === 'accepted') {
          this.isInstalled.value = true
          this.canInstall.value = false
          this.showBanner.value = false
          this.deferredPrompt = null
          return true
        }
      } catch (err) {
        console.warn('[PWA] Prompt error:', err)
      }
      return false
    }

    if (this.isIOS.value) {
      this.showIOSModal.value = true
      return false
    }

    return false
  }
}

export const pwaService = new PwaService()
