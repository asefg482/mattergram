import { defineConfig, loadEnv, Plugin } from 'vite'
import vue from '@vitejs/plugin-vue'
import path from 'path'
import httpProxy from 'http-proxy'
import { WebSocketServer, WebSocket as WsClient } from 'ws'

function mattermostProxyPlugin(defaultFallback = '', secureTls = true, allowedServersList: string[] = []): Plugin {
  const allowedOrigins = new Set(
    [defaultFallback, ...allowedServersList]
      .filter(Boolean)
      .map(s => {
        try {
          return new URL(s).origin
        } catch {
          return ''
        }
      })
      .filter(Boolean)
  )

  const proxy = httpProxy.createProxyServer({
    changeOrigin: true,
    secure: secureTls,
  })

  proxy.on('error', (err, _req, res) => {
    console.error('[HTTP Proxy Error]', err.message)
    if ('writeHead' in res && !res.headersSent) {
      res.writeHead(502, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: 'Proxy error', details: err.message }))
    }
  })

  // Set secure session cookie when login response contains token
  proxy.on('proxyRes', (proxyRes, _req, res) => {
    const token = proxyRes.headers['token'] || proxyRes.headers['Token']
    if (token && !res.headersSent) {
      res.setHeader('Set-Cookie', `mattergram_session=${token}; Path=/; SameSite=Lax`)
    }
  })

  const wss = new WebSocketServer({ noServer: true })

  return {
    name: 'mattermost-proxy-plugin',
    configureServer(server) {
      // Dynamic HTTP Proxy middleware
      server.middlewares.use((req, res, next) => {
        if (req.url && (
          req.url.startsWith('/api/v4') ||
          req.url.startsWith('/mattermost-proxy/api/v4') ||
          req.url.startsWith('/plugins') ||
          req.url.startsWith('/mattermost-proxy/plugins')
        )) {
          let targetServer = defaultFallback

          if (req.url.startsWith('/mattermost-proxy/')) {
            req.url = req.url.replace('/mattermost-proxy', '')
          }

          try {
            const parsed = new URL(req.url, 'http://localhost')
            const queryToken = parsed.searchParams.get('mattergram_token')
            const queryServer = parsed.searchParams.get('mattergram_server')

            // Authentication: Support Authorization header, session cookie, or legacy query token
            let authToken = ''
            if (req.headers['authorization']) {
              const match = (req.headers['authorization'] as string).match(/^Bearer\s+(.+)$/i)
              if (match) authToken = match[1]
            } else if (req.headers.cookie) {
              const match = req.headers.cookie.match(/(?:^|;\s*)mattergram_session=([^;]+)/)
              if (match) authToken = match[1]
            }

            if (queryToken) {
              authToken = queryToken
              parsed.searchParams.delete('mattergram_token')
            }

            if (authToken) {
              req.headers['authorization'] = `Bearer ${authToken}`
            }

            // Target server validation against strict origin allowlist to prevent SSRF (CWE-918)
            const requestedServer = queryServer || (req.headers['x-mattermost-server'] as string)
            if (requestedServer) {
              try {
                const reqOrigin = new URL(requestedServer).origin
                if (allowedOrigins.has(reqOrigin)) {
                  targetServer = requestedServer
                } else {
                  console.warn(`[Security Warning] Blocked unauthorized dev proxy target: "${requestedServer}"`)
                  res.writeHead(403, { 'Content-Type': 'application/json' })
                  res.end(JSON.stringify({
                    error: 'FORBIDDEN_PROXY_TARGET',
                    message: 'Target server is not in the allowed server list.'
                  }))
                  return
                }
              } catch {
                res.writeHead(400, { 'Content-Type': 'application/json' })
                res.end(JSON.stringify({
                  error: 'INVALID_MATTERMOST_SERVER',
                  message: 'Invalid target server URL.'
                }))
                return
              }
              parsed.searchParams.delete('mattergram_server')
            }

            req.url = parsed.pathname + (parsed.search ? parsed.search : '')
          } catch (e) {
            // ignore url parse error
          }

          targetServer = targetServer.trim().replace(/\/+$/, '')

          if (!targetServer) {
            res.writeHead(500, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify({
              error: 'MATTERMOST_BASE_URL_NOT_CONFIGURED',
              message: 'Mattermost Base URL is not configured in .env (MATTERMOST_BASE_URL)'
            }))
            return
          }

          let targetUrl: URL
          try {
            targetUrl = new URL(targetServer)
          } catch {
            res.writeHead(500, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify({
              error: 'INVALID_MATTERMOST_BASE_URL',
              message: `Invalid Mattermost server URL: "${targetServer}"`
            }))
            return
          }

          delete req.headers['x-mattermost-server']
          req.headers.host = targetUrl.host
          req.headers.origin = targetUrl.origin
          req.headers.referer = targetUrl.origin + '/'

          proxy.web(req, res, {
            target: targetUrl.origin,
            changeOrigin: true,
            secure: secureTls,
          })
          return
        }
        next()
      })

      // Dynamic WebSocket Bridge
      server.httpServer?.on('upgrade', (req, socket, head) => {
        if (req.url && (req.url.startsWith('/api/v4/websocket') || req.url.startsWith('/ws'))) {
          let targetServer = defaultFallback

          try {
            const parsed = new URL(req.url, 'http://localhost')
            const requestedServer = parsed.searchParams.get('server') || (req.headers['x-mattermost-server'] as string)
            if (requestedServer) {
              const reqOrigin = new URL(requestedServer).origin
              if (allowedOrigins.has(reqOrigin)) {
                targetServer = requestedServer
              } else {
                console.warn(`[Security Warning] Blocked unauthorized dev WS target: "${requestedServer}"`)
                socket.write('HTTP/1.1 403 Forbidden Target Server\r\n\r\n')
                socket.destroy()
                return
              }
            }
          } catch {
            socket.write('HTTP/1.1 400 Bad Request\r\n\r\n')
            socket.destroy()
            return
          }

          targetServer = targetServer.trim().replace(/\/+$/, '')

          if (!targetServer) {
            console.error('[Vite WS Error] Mattermost Base URL is not configured in .env (MATTERMOST_BASE_URL)')
            socket.destroy()
            return
          }

          let targetUrl: URL
          try {
            targetUrl = new URL(targetServer)
          } catch {
            console.error(`[Vite WS Error] Invalid Mattermost server URL: "${targetServer}"`)
            socket.destroy()
            return
          }

          const wsProtocol = targetUrl.protocol === 'https:' ? 'wss:' : 'ws:'
          const upstreamUrl = `${wsProtocol}//${targetUrl.host}/api/v4/websocket`

          wss.handleUpgrade(req, socket, head, (clientWs) => {
            const upstream = new WsClient(upstreamUrl, {
              rejectUnauthorized: secureTls
            })
            const buffer: string[] = []

            upstream.onmessage = (e: any) => {
              if (clientWs.readyState === 1) {
                clientWs.send(e.data)
              }
            }

            upstream.onopen = () => {
              for (const msg of buffer) {
                upstream.send(msg)
              }
              buffer.length = 0
            }

            clientWs.on('message', (msg: any) => {
              const str = msg.toString()
              if (upstream.readyState === 1) {
                upstream.send(str)
              } else {
                buffer.push(str)
              }
            })

            upstream.onerror = (e: any) => {
              console.error('[WS Upstream Error]', e)
            }

            clientWs.on('error', (e: any) => {
              console.error('[WS Client Error]', e.message)
            })

            upstream.onclose = () => {
              if (clientWs.readyState === 1) clientWs.close()
            }

            clientWs.on('close', () => {
              if (upstream.readyState === 1) upstream.close()
            })
          })
        }
      })
    },
  }
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const defaultFallback = (env.MATTERMOST_BASE_URL || env.VITE_MATTERMOST_BASE_URL || '').trim().replace(/\/+$/, '')
  const secureTls = env.MATTERMOST_TLS_INSECURE !== 'true'
  const allowedServers = (env.ALLOWED_MATTERMOST_SERVERS || '').split(',').map(s => s.trim()).filter(Boolean)

  return {
    plugins: [vue(), mattermostProxyPlugin(defaultFallback, secureTls, allowedServers)],
    envPrefix: ['VITE_', 'MATTERMOST_'],
    define: {
      'import.meta.env.MATTERMOST_BASE_URL': JSON.stringify(defaultFallback)
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
      },
    },
    server: {
      port: 5173,
      host: '0.0.0.0',
    },
  }
})
