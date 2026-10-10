import type { MattermostWebSocketEvent } from '../types/mattermost'
import { mmApi } from './mattermostApi'

type EventHandler = (event: MattermostWebSocketEvent) => void

class MattermostWsService {
  private ws: WebSocket | null = null
  private seq = 1
  private handlers: Map<string, Set<EventHandler>> = new Map()
  private isConnecting = false
  private reconnectTimer: any = null
  private pingTimer: any = null
  private isManuallyClosed = false

  public connect(token?: string) {
    const authToken = token || mmApi.getToken()
    if (!authToken) {
      console.warn('[WS] No token available for connection')
      return
    }

    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
      return
    }

    this.isManuallyClosed = false
    this.isConnecting = true

    const isSecure = window.location.protocol === 'https:'
    const protocol = isSecure ? 'wss:' : 'ws:'
    const host = window.location.host
    const serverUrl = mmApi.getBaseUrl()
    if (!serverUrl) {
      console.warn('[WS] Mattermost Base URL is not configured in .env')
      this.isConnecting = false
      return
    }
    
    // Connect through Vite proxy / websocket endpoint
    const wsUrl = `${protocol}//${host}/api/v4/websocket?server=${encodeURIComponent(serverUrl)}`

    try {
      this.ws = new WebSocket(wsUrl)

      this.ws.onopen = () => {
        this.isConnecting = false
        // Send authentication challenge
        this.sendAction('authentication_challenge', { token: authToken })
        this.startPing()
      }

      this.ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data)
          if (msg.event) {
            this.emit(msg.event, msg)
            this.emit('*', msg)
          }
        } catch (err) {
          console.error('[WS] Parse message error:', err)
        }
      }

      this.ws.onclose = () => {
        this.cleanup()
        if (!this.isManuallyClosed) {
          this.scheduleReconnect()
        }
      }

      this.ws.onerror = (err) => {
        console.error('[WS] Error:', err)
        this.cleanup()
      }
    } catch (err) {
      console.error('[WS] Connect error:', err)
      this.scheduleReconnect()
    }
  }

  public disconnect() {
    this.isManuallyClosed = true
    this.cleanup()
    if (this.ws) {
      this.ws.close()
      this.ws = null
    }
  }

  private cleanup() {
    this.isConnecting = false
    if (this.pingTimer) {
      clearInterval(this.pingTimer)
      this.pingTimer = null
    }
  }

  private scheduleReconnect() {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer)
    this.reconnectTimer = setTimeout(() => {
      this.connect()
    }, 3000)
  }

  private startPing() {
    if (this.pingTimer) clearInterval(this.pingTimer)
    this.pingTimer = setInterval(() => {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        // Mattermost ping / seq
        this.ws.send(JSON.stringify({ seq: ++this.seq, action: 'ping' }))
      }
    }, 30000)
  }

  public sendAction(action: string, data: Record<string, any> = {}) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      const payload = {
        seq: ++this.seq,
        action,
        data
      }
      this.ws.send(JSON.stringify(payload))
    }
  }

  public sendTyping(channelId: string, parentId: string = '') {
    this.sendAction('user_typing', {
      channel_id: channelId,
      parent_id: parentId
    })
  }

  public on(event: string, handler: EventHandler) {
    if (!this.handlers.has(event)) {
      this.handlers.set(event, new Set())
    }
    this.handlers.get(event)!.add(handler)
  }

  public off(event: string, handler: EventHandler) {
    const set = this.handlers.get(event)
    if (set) {
      set.delete(handler)
    }
  }

  private emit(event: string, data: MattermostWebSocketEvent) {
    const handlers = this.handlers.get(event)
    if (handlers) {
      handlers.forEach((handler) => {
        try {
          handler(data)
        } catch (err) {
          console.error(`[WS] Handler error for ${event}:`, err)
        }
      })
    }
  }
}

export const mmWs = new MattermostWsService()
