import { defineConfig, loadEnv, Plugin } from 'vite'
import vue from '@vitejs/plugin-vue'
import path from 'path'
import httpProxy from 'http-proxy'
import { WebSocketServer } from 'ws'

function mattermostProxyPlugin(defaultFallback = 'https://m.dornicadev.ir'): Plugin {
  const proxy = httpProxy.createProxyServer({
    changeOrigin: true,
    secure: false,
  })

  proxy.on('error', (err, _req, res) => {
    console.error('[HTTP Proxy Error]', err.message)
    if ('writeHead' in res && !res.headersSent) {
      res.writeHead(502, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: 'Proxy error', details: err.message }))
    }
  })

  const wss = new WebSocketServer({ noServer: true })

  return {
    name: 'mattermost-proxy-plugin',
    configureServer(server) {
      // Dynamic HTTP Proxy middleware
      server.middlewares.use((req, res, next) => {
        if (req.url && (req.url.startsWith('/api/v4') || req.url.startsWith('/mattermost-proxy/api/v4'))) {
          let targetServer = (req.headers['x-mattermost-server'] as string) || defaultFallback

          if (req.url.startsWith('/mattermost-proxy/')) {
            req.url = req.url.replace('/mattermost-proxy', '')
          }

          // Extract auth token and target server from query parameters (crucial for img src tags)
          try {
            const parsed = new URL(req.url, 'http://localhost')
            const queryToken = parsed.searchParams.get('mattergram_token')
            const queryServer = parsed.searchParams.get('mattergram_server')

            if (queryToken) {
              req.headers['authorization'] = `Bearer ${queryToken}`
              parsed.searchParams.delete('mattergram_token')
            }
            if (queryServer) {
              targetServer = queryServer
              parsed.searchParams.delete('mattergram_server')
            }
            req.url = parsed.pathname + (parsed.search ? parsed.search : '')
          } catch (e) {
            // ignore url parse error
          }

          targetServer = targetServer.trim().replace(/\/+$/, '')

          let targetUrl: URL
          try {
            targetUrl = new URL(targetServer)
          } catch {
            targetUrl = new URL(defaultFallback)
          }

          delete req.headers['x-mattermost-server']
          req.headers.host = targetUrl.host
          req.headers.origin = targetUrl.origin
          req.headers.referer = targetUrl.origin + '/'

          proxy.web(req, res, {
            target: targetUrl.origin,
            changeOrigin: true,
            secure: false,
          })
          return
        }
        next()
      })

      // Dynamic WebSocket Bridge
      server.httpServer?.on('upgrade', (req, socket, head) => {
        if (req.url && (req.url.startsWith('/api/v4/websocket') || req.url.startsWith('/ws'))) {
          const parsed = new URL(req.url, 'http://localhost')
          let targetServer = parsed.searchParams.get('server') || (req.headers['x-mattermost-server'] as string) || defaultFallback
          targetServer = targetServer.trim().replace(/\/+$/, '')

          let targetUrl: URL
          try {
            targetUrl = new URL(targetServer)
          } catch {
            targetUrl = new URL(defaultFallback)
          }

          const wsProtocol = targetUrl.protocol === 'https:' ? 'wss:' : 'ws:'
          const upstreamUrl = `${wsProtocol}//${targetUrl.host}/api/v4/websocket`

          wss.handleUpgrade(req, socket, head, (clientWs) => {
            const upstream = new (globalThis as any).WebSocket(upstreamUrl)
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
  const defaultFallback = (env.MATTERMOST_BASE_URL || env.VITE_MATTERMOST_BASE_URL || 'https://m.dornicadev.ir').trim().replace(/\/+$/, '')

  return {
    plugins: [vue(), mattermostProxyPlugin(defaultFallback)],
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
      host: true,
    },
  }
})
