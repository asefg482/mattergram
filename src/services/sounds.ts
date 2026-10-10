class SoundService {
  private ctx: AudioContext | null = null
  private enabled = true

  constructor() {
    const saved = localStorage.getItem('mattergram_sound_enabled')
    if (saved !== null) {
      this.enabled = saved === 'true'
    }
  }

  public isEnabled(): boolean {
    return this.enabled
  }

  public setEnabled(val: boolean) {
    this.enabled = val
    localStorage.setItem('mattergram_sound_enabled', String(val))
  }

  private initContext() {
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext
      if (AudioCtx) {
        this.ctx = new AudioCtx()
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume()
    }
  }

  // Telegram sent message sound (gentle pop / chime)
  public playSent() {
    if (!this.enabled) return
    try {
      this.initContext()
      if (!this.ctx) return

      const now = this.ctx.currentTime
      const osc = this.ctx.createOscillator()
      const gain = this.ctx.createGain()

      osc.type = 'sine'
      osc.frequency.setValueAtTime(520, now)
      osc.frequency.exponentialRampToValueAtTime(880, now + 0.08)

      gain.gain.setValueAtTime(0.12, now)
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.12)

      osc.connect(gain)
      gain.connect(this.ctx.destination)

      osc.start(now)
      osc.stop(now + 0.12)
    } catch {
      // Audio might be blocked by browser policy until user interaction
    }
  }

  // Telegram incoming message notification sound (pleasant double bell)
  public playReceived() {
    if (!this.enabled) return
    try {
      this.initContext()
      if (!this.ctx) return

      const now = this.ctx.currentTime

      // Tone 1
      const osc1 = this.ctx.createOscillator()
      const gain1 = this.ctx.createGain()
      osc1.type = 'sine'
      osc1.frequency.setValueAtTime(659.25, now) // E5
      gain1.gain.setValueAtTime(0.15, now)
      gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.2)
      osc1.connect(gain1)
      gain1.connect(this.ctx.destination)
      osc1.start(now)
      osc1.stop(now + 0.2)

      // Tone 2
      const osc2 = this.ctx.createOscillator()
      const gain2 = this.ctx.createGain()
      osc2.type = 'sine'
      osc2.frequency.setValueAtTime(880, now + 0.08) // A5
      gain2.gain.setValueAtTime(0.18, now + 0.08)
      gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.3)
      osc2.connect(gain2)
      gain2.connect(this.ctx.destination)
      osc2.start(now + 0.08)
      osc2.stop(now + 0.3)
    } catch {
      // ignore
    }
  }
}

export const soundService = new SoundService()
