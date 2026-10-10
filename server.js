import http from 'http'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import httpProxy from 'http-proxy'
import { WebSocketServer, WebSocket as WsClient } from 'ws'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// 1. Automatically load environment variables from .env and .env.local
function loadEnvFiles() {
  const envFiles = ['.env', '.env.local']
  for (const file of envFiles) {
    const fullPath = path.resolve(__dirname, file)
    if (fs.existsSync(fullPath)) {
      try {
        const content = fs.readFileSync(fullPath, 'utf8')
        content.split('\n').forEach(line => {
          const trimmed = line.trim()
          if (!trimmed || trimmed.startsWith('#')) return
          const eqIdx = trimmed.indexOf('=')
          if (eqIdx !== -1) {
            const key = trimmed.slice(0, eqIdx).trim()
            let val = trimmed.slice(eqIdx + 1).trim()
            if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
              val = val.slice(1, -1)
            }
            if (process.env[key] === undefined) {
              process.env[key] = val
            }
          }
        })
      } catch (err) {
        console.warn(`[Env] Failed to read ${file}:`, err.message)
      }
    }
  }
}
loadEnvFiles()

const PORT = process.env.PORT || 5173
const DIST_DIR = path.resolve(__dirname, 'dist')

// Read Mattermost base URL dynamically from .env
const DEFAULT_MATTERMOST_SERVER = (
  process.env.MATTERMOST_BASE_URL ||
  process.env.VITE_MATTERMOST_BASE_URL ||
  ''
).trim().replace(/\/+$/, '')

if (DEFAULT_MATTERMOST_SERVER) {
  console.log(`[Config] Loaded Mattermost Base URL from .env: ${DEFAULT_MATTERMOST_SERVER}`)
} else {
  console.warn('[Config Warning] MATTERMOST_BASE_URL is not defined in .env! Requests without explicit server header will fail.')
}

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
    let targetServer = req.headers['x-mattermost-server'] || DEFAULT_MATTERMOST_SERVER

    if (req.url.startsWith('/mattermost-proxy/')) {
      req.url = req.url.replace('/mattermost-proxy', '')
    }

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
      // ignore
    }

    targetServer = (targetServer || '').trim().replace(/\/+$/, '')

    // If server is not set, throw an error instead of using any static fallback
    if (!targetServer) {
      res.writeHead(500, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({
        error: 'MATTERMOST_BASE_URL_NOT_CONFIGURED',
        message: 'Mattermost Base URL is not configured. Please set MATTERMOST_BASE_URL in your .env file.'
      }))
      return
    }

    let targetUrl
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
    } else {
      res.writeHead(200, { 'Content-Type': contentType })
      res.end(content)
    }
  })
})

// WebSocket Bridge
const wss = new WebSocketServer({ noServer: true })
server.on('upgrade', (req, socket, head) => {
  if (req.url && (req.url.startsWith('/api/v4/websocket') || req.url.startsWith('/ws'))) {
    const parsed = new URL(req.url, 'http://localhost')
    let targetServer = parsed.searchParams.get('server') || req.headers['x-mattermost-server'] || DEFAULT_MATTERMOST_SERVER
    targetServer = (targetServer || '').trim().replace(/\/+$/, '')

    if (!targetServer) {
      console.error('[WebSocket Upgrade Error] Mattermost Base URL is not configured in .env (MATTERMOST_BASE_URL)')
      socket.write('HTTP/1.1 500 Mattermost Base URL Not Configured\r\n\r\n')
      socket.destroy()
      return
    }

    let targetUrl
    try {
      targetUrl = new URL(targetServer)
    } catch {
      console.error(`[WebSocket Upgrade Error] Invalid Mattermost URL: "${targetServer}"`)
      socket.write('HTTP/1.1 500 Invalid Mattermost URL\r\n\r\n')
      socket.destroy()
      return
    }

    const wsProtocol = targetUrl.protocol === 'https:' ? 'wss:' : 'ws:'
    const upstreamUrl = `${wsProtocol}//${targetUrl.host}/api/v4/websocket`

    wss.handleUpgrade(req, socket, head, (clientWs) => {
      const upstream = new WsClient(upstreamUrl)
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
