import http from 'http'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import httpProxy from 'http-proxy'
import { WebSocketServer } from 'ws'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const PORT = process.env.PORT || 5173
const DIST_DIR = path.resolve(__dirname, 'dist')

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

const MIME_TYPES = {
  '.html': 'text/html',
  '.js': 'application/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
}

const server = http.createServer((req, res) => {
  // 1. Proxy Mattermost API
  if (req.url && (req.url.startsWith('/api/v4') || req.url.startsWith('/mattermost-proxy/api/v4'))) {
    let targetServer = (req.headers['x-mattermost-server'] as string) || 'https://m.dornicadev.ir'
    targetServer = targetServer.trim().replace(/\/+$/, '')

    if (req.url.startsWith('/mattermost-proxy/')) {
      req.url = req.url.replace('/mattermost-proxy', '')
    }

    let targetUrl
    try {
      targetUrl = new URL(targetServer)
    } catch {
      targetUrl = new URL('https://m.dornicadev.ir')
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

  // 2. Static Files
  let filePath = path.join(DIST_DIR, req.url === '/' ? 'index.html' : req.url.split('?')[0])
  if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    filePath = path.join(DIST_DIR, 'index.html')
  }

  const ext = path.extname(filePath).toLowerCase()
  const contentType = MIME_TYPES[ext] || 'application/octet-stream'

  fs.readFile(filePath, (err, content) => {
    if (err) {
      res.writeHead(500)
      res.end('Server Error')
      return
    }
    res.writeHead(200, { 'Content-Type': contentType })
    res.end(content)
  })
})

// WebSocket Bridge
const wss = new WebSocketServer({ noServer: true })
server.on('upgrade', (req, socket, head) => {
  if (req.url && (req.url.startsWith('/api/v4/websocket') || req.url.startsWith('/ws'))) {
    const parsed = new URL(req.url, 'http://localhost')
    let targetServer = parsed.searchParams.get('server') || (req.headers['x-mattermost-server'] as string) || 'https://m.dornicadev.ir'
    targetServer = targetServer.trim().replace(/\/+$/, '')

    let targetUrl
    try {
      targetUrl = new URL(targetServer)
    } catch {
      targetUrl = new URL('https://m.dornicadev.ir')
    }

    const wsProtocol = targetUrl.protocol === 'https:' ? 'wss:' : 'ws:'
    const upstreamUrl = `${wsProtocol}//${targetUrl.host}/api/v4/websocket`

    wss.handleUpgrade(req, socket, head, (clientWs) => {
      const upstream = new (globalThis as any).WebSocket(upstreamUrl)
      const buffer = []

      upstream.onmessage = (e) => {
        if (clientWs.readyState === 1) clientWs.send(e.data)
      }

      upstream.onopen = () => {
        for (const msg of buffer) upstream.send(msg)
        buffer.length = 0
      }

      clientWs.on('message', (msg) => {
        const str = msg.toString()
        if (upstream.readyState === 1) {
          upstream.send(str)
        } else {
          buffer.push(str)
        }
      })

      upstream.onerror = (e) => console.error('[WS Upstream Error]', e)
      clientWs.on('error', (e) => console.error('[WS Client Error]', e.message))

      upstream.onclose = () => {
        if (clientWs.readyState === 1) clientWs.close()
      }
      clientWs.on('close', () => {
        if (upstream.readyState === 1) upstream.close()
      })
    })
  }
})

server.listen(PORT, () => {
  console.log(`Mattergram production server running on http://localhost:${PORT}`)
})
