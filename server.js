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
const HOST = process.env.HOST || '0.0.0.0'
const DIST_DIR = path.resolve(__dirname, 'dist')

// Read Mattermost base URL dynamically from .env
const DEFAULT_MATTERMOST_SERVER = (
  process.env.MATTERMOST_BASE_URL ||
  process.env.VITE_MATTERMOST_BASE_URL ||
  ''
).trim().replace(/\/+$/, '')

// Build strict allowlist of permitted origins to prevent SSRF (CWE-918)
const ALLOWED_SERVERS = new Set(
  [
    DEFAULT_MATTERMOST_SERVER,
    ...(process.env.ALLOWED_MATTERMOST_SERVERS || '').split(',').map(s => s.trim())
  ]
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

// Enforce strict TLS certificate checking by default (CWE-295)
const SECURE_TLS = process.env.MATTERMOST_TLS_INSECURE !== 'true'
if (!SECURE_TLS) {
  console.warn('[Security Warning] MATTERMOST_TLS_INSECURE is enabled! Upstream TLS certificate verification is disabled.')
}

if (DEFAULT_MATTERMOST_SERVER) {
  console.log(`[Config] Loaded Mattermost Base URL from .env: ${DEFAULT_MATTERMOST_SERVER}`)
} else {
  console.warn('[Config Warning] MATTERMOST_BASE_URL is not defined in .env!')
}

const proxy = httpProxy.createProxyServer({
  changeOrigin: true,
  secure: SECURE_TLS,
})

proxy.on('error', (err, _req, res) => {
  console.error('[HTTP Proxy Error]', err.message)
  if ('writeHead' in res && !res.headersSent) {
    res.writeHead(502, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ error: 'Proxy error', details: err.message }))
  }
})

// Set secure session cookie when Mattermost returns auth token in login response
proxy.on('proxyRes', (proxyRes, _req, res) => {
  const token = proxyRes.headers['token'] || proxyRes.headers['Token']
  if (token && !res.headersSent) {
    res.setHeader('Set-Cookie', `mattergram_session=${token}; Path=/; SameSite=Lax`)
  }
})

const MIME_TYPES = {
  '.html': 'text/html',
  '.js': 'application/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.webmanifest': 'application/manifest+json',
}

const server = http.createServer((req, res) => {
  // 1. API & Plugin Reverse Proxy
  if (req.url && (
    req.url.startsWith('/api/v4') ||
    req.url.startsWith('/mattermost-proxy/api/v4') ||
    req.url.startsWith('/plugins') ||
    req.url.startsWith('/mattermost-proxy/plugins')
  )) {
    let targetServer = DEFAULT_MATTERMOST_SERVER

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
        const match = req.headers['authorization'].match(/^Bearer\s+(.+)$/i)
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
      const requestedServer = queryServer || req.headers['x-mattermost-server']
      if (requestedServer) {
        try {
          const reqOrigin = new URL(requestedServer).origin
          if (ALLOWED_SERVERS.has(reqOrigin)) {
            targetServer = requestedServer
          } else {
            console.warn(`[Security Warning] Blocked unauthorized proxy target: "${requestedServer}"`)
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
      // ignore parsing error
    }

    targetServer = (targetServer || '').trim().replace(/\/+$/, '')

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
      secure: SECURE_TLS,
    })
    return
  }

  // 2. Static Files Serving (Strict Path Traversal Protection - CWE-22)
  let pathname = '/'
  try {
    pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname)
  } catch {
    res.writeHead(400)
    res.end('Bad Request')
    return
  }

  // Reject null bytes and path anomalies
  if (pathname.includes('\0')) {
    res.writeHead(400)
    res.end('Bad Request')
    return
  }

  // Normalize path and remove leading traversal markers
  const safeRelativePath = path.normalize(pathname).replace(/^(\.\.[\/\\])+/, '')
  const targetPath = path.resolve(DIST_DIR, '.' + (safeRelativePath.startsWith('/') ? safeRelativePath : '/' + safeRelativePath))

  // Verify canonical path remains strictly contained within DIST_DIR
  let isInsideDist = false
  if (targetPath.startsWith(DIST_DIR + path.sep) || targetPath === path.join(DIST_DIR, 'index.html')) {
    if (fs.existsSync(targetPath)) {
      try {
        const realTargetPath = fs.realpathSync(targetPath)
        const realDistDir = fs.realpathSync(DIST_DIR)
        isInsideDist = realTargetPath.startsWith(realDistDir + path.sep) || realTargetPath === path.join(realDistDir, 'index.html')
      } catch {
        isInsideDist = false
      }
    }
  }

  // SPA fallback: if file does not exist, is a directory, or attempts directory escape, serve index.html
  let filePath = targetPath
  if (!isInsideDist || fs.statSync(filePath).isDirectory()) {
    filePath = path.join(DIST_DIR, 'index.html')
  }

  const ext = path.extname(filePath).toLowerCase()
  const contentType = MIME_TYPES[ext] || 'application/octet-stream'

  fs.readFile(filePath, (err, content) => {
    if (err) {
      res.writeHead(500)
      res.end('Server Error')
    } else {
      if (filePath.endsWith('index.html') && DEFAULT_MATTERMOST_SERVER) {
        const injected = `<script>window.__MATTERGRAM_ENV__ = { MATTERMOST_BASE_URL: ${JSON.stringify(DEFAULT_MATTERMOST_SERVER)} };</script></head>`
        const html = content.toString('utf8').replace('</head>', injected)
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
        res.end(html)
        return
      }
      res.writeHead(200, { 'Content-Type': contentType })
      res.end(content)
    }
  })
})

// 3. WebSocket Bridge (Strict Destination Validation and TLS Protection)
const wss = new WebSocketServer({ noServer: true })
server.on('upgrade', (req, socket, head) => {
  if (req.url && (req.url.startsWith('/api/v4/websocket') || req.url.startsWith('/ws'))) {
    let targetServer = DEFAULT_MATTERMOST_SERVER

    try {
      const parsed = new URL(req.url, 'http://localhost')
      const requestedServer = parsed.searchParams.get('server') || req.headers['x-mattermost-server']
      if (requestedServer) {
        const reqOrigin = new URL(requestedServer).origin
        if (ALLOWED_SERVERS.has(reqOrigin)) {
          targetServer = requestedServer
        } else {
          console.warn(`[Security Warning] Blocked unauthorized WebSocket target: "${requestedServer}"`)
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
      const upstream = new WsClient(upstreamUrl, {
        rejectUnauthorized: SECURE_TLS
      })
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

server.listen(PORT, HOST, () => {
  console.log(`Mattergram production server running on http://${HOST}:${PORT}`)
})
