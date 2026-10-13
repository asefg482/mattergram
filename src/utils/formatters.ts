import { ref } from 'vue'

// Telegram Avatar Gradient colors
const TG_AVATAR_GRADIENTS = [
  ['#e17076', '#ff885e'], // Coral
  ['#faa774', '#ffc66a'], // Orange
  ['#a695e7', '#7b68ee'], // Violet
  ['#7bc862', '#4fae60'], // Green
  ['#6ec9cb', '#36b1cd'], // Cyan
  ['#65aadd', '#2481cc'], // Blue
  ['#ee7aae', '#d8508f'], // Pink
  ['#d077d8', '#a851bf'], // Purple
]

const gradientCache = new Map<string, string>()
export function getAvatarGradient(nameOrId: string = ''): string {
  if (!nameOrId) return 'linear-gradient(135deg, #65aadd, #2481cc)'
  const cached = gradientCache.get(nameOrId)
  if (cached) return cached

  let hash = 0
  for (let i = 0; i < nameOrId.length; i++) {
    hash = nameOrId.charCodeAt(i) + ((hash << 5) - hash)
  }
  const index = Math.abs(hash) % TG_AVATAR_GRADIENTS.length
  const [c1, c2] = TG_AVATAR_GRADIENTS[index]
  const result = `linear-gradient(135deg, ${c1}, ${c2})`
  if (gradientCache.size > 500) gradientCache.clear()
  gradientCache.set(nameOrId, result)
  return result
}

const initialsCache = new Map<string, string>()
export function getInitials(name: string = ''): string {
  if (!name) return '?'
  const cached = initialsCache.get(name)
  if (cached) return cached

  let res = '?'
  const parts = name.trim().split(/\s+/)
  if (parts.length >= 2) {
    res = (parts[0][0] + parts[1][0]).toUpperCase()
  } else {
    res = name.slice(0, 2).toUpperCase()
  }
  if (initialsCache.size > 500) initialsCache.clear()
  initialsCache.set(name, res)
  return res
}

// Timezone and Time Format state (reactive across all components)
export const userTimezone = ref<string>(localStorage.getItem('mattergram_timezone') || '')
export const userTimeFormat = ref<'24h' | '12h'>((localStorage.getItem('mattergram_time_format') as any) || '24h')

export function getEffectiveTimezone(): string {
  if (userTimezone.value) return userTimezone.value
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Tehran'
  } catch {
    return 'Asia/Tehran'
  }
}

export function setTimezone(tz: string) {
  userTimezone.value = tz
  if (tz) {
    localStorage.setItem('mattergram_timezone', tz)
  } else {
    localStorage.removeItem('mattergram_timezone')
  }
  clearTimeCaches()
}

export function setTimeFormat(fmt: '24h' | '12h') {
  userTimeFormat.value = fmt
  localStorage.setItem('mattergram_time_format', fmt)
  clearTimeCaches()
}

const messageTimeCache = new Map<string, string>()
const chatListTimeCache = new Map<string, string>()
const dateSeparatorCache = new Map<string, string>()

export function clearTimeCaches() {
  messageTimeCache.clear()
  chatListTimeCache.clear()
  dateSeparatorCache.clear()
}

export function toSafeDate(timestamp: number | string | Date | null | undefined): Date | null {
  if (!timestamp) return null
  if (timestamp instanceof Date) return isNaN(timestamp.getTime()) ? null : timestamp
  let num = typeof timestamp === 'string' ? Number(timestamp) : timestamp
  if (isNaN(num) || num <= 0) return null
  if (num < 10000000000) num *= 1000
  const d = new Date(num)
  return isNaN(d.getTime()) ? null : d
}

function getZonedYMD(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(date)
}

export function isDifferentDay(currTimestamp: number | string | null | undefined, prevTimestamp?: number | string | null | undefined): boolean {
  if (!prevTimestamp) return true
  const d1 = toSafeDate(currTimestamp)
  const d2 = toSafeDate(prevTimestamp)
  if (!d1 || !d2) return true
  const tz = getEffectiveTimezone()
  return getZonedYMD(d1, tz) !== getZonedYMD(d2, tz)
}

export function formatMessageTime(timestamp: number | string | Date | null | undefined): string {
  const d = toSafeDate(timestamp)
  if (!d) return ''

  const tz = getEffectiveTimezone()
  const is12h = userTimeFormat.value === '12h'
  const cacheKey = `${d.getTime()}_${tz}_${is12h}`
  const cached = messageTimeCache.get(cacheKey)
  if (cached) return cached

  try {
    const res = new Intl.DateTimeFormat(is12h ? 'en-US' : 'en-GB', {
      timeZone: tz,
      hour: is12h ? 'numeric' : '2-digit',
      minute: '2-digit',
      hour12: is12h
    }).format(d)

    if (messageTimeCache.size > 2000) messageTimeCache.clear()
    messageTimeCache.set(cacheKey, res)
    return res
  } catch (err) {
    console.error('Error formatting message time:', err)
    return ''
  }
}

export function formatDateSeparator(timestamp: number | string | Date | null | undefined): string {
  const d = toSafeDate(timestamp)
  if (!d) return ''

  const tz = getEffectiveTimezone()
  const now = new Date()
  const nowYMD = getZonedYMD(now, tz)
  const dateYMD = getZonedYMD(d, tz)

  if (dateYMD === nowYMD) return 'Today'

  const yesterday = new Date(now.getTime() - 86400000)
  if (dateYMD === getZonedYMD(yesterday, tz)) return 'Yesterday'

  const cacheKey = `${dateYMD}_${tz}`
  const cached = dateSeparatorCache.get(cacheKey)
  if (cached) return cached

  try {
    const dYear = parseInt(dateYMD.slice(0, 4), 10)
    const nowYear = parseInt(nowYMD.slice(0, 4), 10)

    const res = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      month: 'long',
      day: 'numeric',
      ...(dYear !== nowYear ? { year: 'numeric' } : {})
    }).format(d)

    if (dateSeparatorCache.size > 1000) dateSeparatorCache.clear()
    dateSeparatorCache.set(cacheKey, res)
    return res
  } catch (err) {
    console.error('Error formatting date separator:', err)
    return ''
  }
}

export function formatChatListTime(timestamp: number | string | Date | null | undefined): string {
  const d = toSafeDate(timestamp)
  if (!d) return ''

  const tz = getEffectiveTimezone()
  const now = new Date()
  const nowYMD = getZonedYMD(now, tz)
  const dateYMD = getZonedYMD(d, tz)

  if (dateYMD === nowYMD) {
    return formatMessageTime(d)
  }

  const yesterday = new Date(now.getTime() - 86400000)
  if (dateYMD === getZonedYMD(yesterday, tz)) {
    return 'Yesterday'
  }

  const cacheKey = `${dateYMD}_${tz}`
  const cached = chatListTimeCache.get(cacheKey)
  if (cached) return cached

  try {
    const dYear = parseInt(dateYMD.slice(0, 4), 10)
    const nowYear = parseInt(nowYMD.slice(0, 4), 10)

    let res: string
    if (dYear === nowYear) {
      res = new Intl.DateTimeFormat('en-US', {
        timeZone: tz,
        month: 'short',
        day: 'numeric'
      }).format(d)
    } else {
      res = new Intl.DateTimeFormat('en-GB', {
        timeZone: tz,
        day: '2-digit',
        month: '2-digit',
        year: '2-digit'
      }).format(d)
    }

    if (chatListTimeCache.size > 1000) chatListTimeCache.clear()
    chatListTimeCache.set(cacheKey, res)
    return res
  } catch (err) {
    console.error('Error formatting chat list time:', err)
    return ''
  }
}

export function formatViewedAtTime(timestamp: number | string | Date | null | undefined): string {
  const d = toSafeDate(timestamp)
  if (!d) return ''

  const tz = getEffectiveTimezone()
  const now = new Date()
  const nowYMD = getZonedYMD(now, tz)
  const dateYMD = getZonedYMD(d, tz)
  const timeStr = formatMessageTime(d)
  if (!timeStr) return ''

  if (dateYMD === nowYMD) {
    return `Today at ${timeStr}`
  }

  const [y, m, day] = nowYMD.split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1, day, 12, 0, 0))
  dt.setUTCDate(dt.getUTCDate() - 1)
  const yesterdayYMD = getZonedYMD(dt, 'UTC')

  if (dateYMD === yesterdayYMD) {
    return `Yesterday at ${timeStr}`
  }

  const dYear = parseInt(dateYMD.slice(0, 4), 10)
  const nowYear = parseInt(nowYMD.slice(0, 4), 10)

  const datePart = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    month: 'short',
    day: 'numeric',
    ...(dYear !== nowYear ? { year: 'numeric' } : {})
  }).format(d)

  return `${datePart} at ${timeStr}`
}

export function formatFileSize(bytes: number): string {
  if (!bytes) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i]
}

import { Marked } from 'marked'
import hljs from 'highlight.js'

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

const LANGUAGE_DISPLAY_NAMES: Record<string, string> = {
  javascript: 'JavaScript',
  js: 'JavaScript',
  node: 'JavaScript',
  typescript: 'TypeScript',
  ts: 'TypeScript',
  php: 'PHP',
  python: 'Python',
  py: 'Python',
  html: 'HTML',
  xml: 'XML',
  css: 'CSS',
  scss: 'SCSS',
  sass: 'Sass',
  json: 'JSON',
  sql: 'SQL',
  bash: 'Bash',
  sh: 'Shell',
  shell: 'Shell',
  zsh: 'Zsh',
  c: 'C',
  cpp: 'C++',
  'c++': 'C++',
  csharp: 'C#',
  cs: 'C#',
  'c#': 'C#',
  java: 'Java',
  go: 'Go',
  golang: 'Go',
  rust: 'Rust',
  rs: 'Rust',
  ruby: 'Ruby',
  rb: 'Ruby',
  swift: 'Swift',
  kotlin: 'Kotlin',
  kt: 'Kotlin',
  dart: 'Dart',
  markdown: 'Markdown',
  md: 'Markdown',
  yaml: 'YAML',
  yml: 'YAML',
  dockerfile: 'Dockerfile',
  docker: 'Dockerfile',
  plaintext: 'Plain Text',
  plantext: 'Plain Text',
  plain: 'Plain Text',
  text: 'Plain Text',
  txt: 'Plain Text',
  graphql: 'GraphQL',
  gql: 'GraphQL',
  lua: 'Lua',
  perl: 'Perl',
  pl: 'Perl',
  r: 'R',
  scala: 'Scala',
  vue: 'Vue',
  ini: 'Config',
  env: 'Env'
}

function getLanguageDisplayName(lang: string): string {
  const normalized = (lang || '').trim().toLowerCase()
  if (!normalized) return 'Code'
  if (LANGUAGE_DISPLAY_NAMES[normalized]) {
    return LANGUAGE_DISPLAY_NAMES[normalized]
  }
  return normalized.charAt(0).toUpperCase() + normalized.slice(1)
}

function resolveHighlightLanguage(lang: string): string | null {
  const normalized = (lang || '').trim().toLowerCase()
  if (!normalized) return null
  if (['plaintext', 'plantext', 'plain', 'text', 'txt'].includes(normalized)) return null
  if (normalized === 'js' || normalized === 'node') return 'javascript'
  if (normalized === 'ts') return 'typescript'
  if (normalized === 'py') return 'python'
  if (normalized === 'sh' || normalized === 'zsh' || normalized === 'shell') return 'bash'
  if (normalized === 'golang') return 'go'
  if (normalized === 'rs') return 'rust'
  if (normalized === 'rb') return 'ruby'
  if (normalized === 'md') return 'markdown'
  if (normalized === 'yml') return 'yaml'
  if (normalized === 'cs' || normalized === 'c#') return 'csharp'
  if (normalized === 'c++') return 'cpp'
  if (normalized === 'docker') return 'dockerfile'
  if (normalized === 'html') return 'xml'
  if (hljs.getLanguage(normalized)) return normalized
  return null
}

// Configured Marked instance with Telegram/Mattermost feature set
const markedInstance = new Marked({
  gfm: true,
  breaks: true,
  renderer: {
    html(token) {
      return escapeHtml(token.text)
    },
    link(token) {
      const href = token.href || ''
      const isSafe = /^(https?:\/\/|mailto:|tel:|\/)/i.test(href)
      const safeHref = isSafe ? href : '#'
      const text = this.parser.parseInline(token.tokens)
      return `<a href="${escapeHtml(safeHref)}" target="_blank" rel="noopener noreferrer" class="text-[#3390ec] hover:underline font-medium break-all">${text}</a>`
    },
    blockquote(token) {
      const body = this.parser.parse(token.tokens)
      return `<blockquote class="border-l-3 border-[#3390ec] pl-2.5 py-1 my-1.5 bg-black/5 dark:bg-black/15 rounded-r text-xs opacity-90 leading-relaxed">${body}</blockquote>`
    },
    code(token) {
      const rawLang = (token.lang || '').trim()
      const highlightLang = resolveHighlightLanguage(rawLang)
      const displayName = getLanguageDisplayName(rawLang)

      let highlightedHtml = ''
      if (highlightLang) {
        try {
          highlightedHtml = hljs.highlight(token.text, { language: highlightLang, ignoreIllegals: true }).value
        } catch {
          highlightedHtml = escapeHtml(token.text)
        }
      } else {
        highlightedHtml = escapeHtml(token.text)
      }

      const langClass = highlightLang ? `language-${highlightLang} hljs` : 'hljs'

      return `<div class="tg-code-block relative my-2 rounded-xl overflow-hidden border border-black/10 dark:border-white/10 bg-[#f8fafc] dark:bg-[#111923] text-gray-900 dark:text-gray-100 shadow-xs">
  <div class="tg-code-header flex items-center justify-between px-3 py-1.5 bg-[#edf2f7] dark:bg-[#182230] border-b border-black/10 dark:border-white/10 text-xs font-mono select-none">
    <div class="tg-code-lang flex items-center gap-1.5 text-gray-700 dark:text-gray-300 font-semibold text-[11px] tracking-wide">
      <span class="w-2 h-2 rounded-full bg-[#3390ec]"></span>
      <span>${escapeHtml(displayName)}</span>
    </div>
    <button
      type="button"
      class="tg-code-copy-btn flex items-center gap-1.5 px-2 py-0.5 rounded text-[11px] font-sans text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white hover:bg-black/5 dark:hover:bg-white/10 transition-colors cursor-pointer"
      title="Copy code"
      onclick="window.__copyCodeBlock && window.__copyCodeBlock(this, event)"
    >
      <svg class="tg-copy-icon w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <rect width="14" height="14" x="8" y="8" rx="2" ry="2"/>
        <path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/>
      </svg>
      <span class="tg-copy-text">Copy</span>
    </button>
  </div>
  <pre class="p-3 overflow-x-auto text-xs font-mono leading-relaxed"><code class="${langClass}">${highlightedHtml}</code></pre>
</div>`
    },
    codespan(token) {
      return `<code class="bg-black/5 dark:bg-black/25 text-pink-600 dark:text-pink-400 px-1 py-0.5 rounded text-xs font-mono">${escapeHtml(token.text)}</code>`
    }
  },
  extensions: [
    {
      name: 'mention',
      level: 'inline',
      start(src: string) {
        return src.indexOf('@')
      },
      tokenizer(src: string) {
        const match = /^@([a-zA-Z0-9_.-]+)/.exec(src)
        if (match) {
          return {
            type: 'mention',
            raw: match[0],
            username: match[1]
          }
        }
      },
      renderer(token: any) {
        const username = escapeHtml(token.username || '')
        return `<span class="tg-mention text-[#3390ec] font-semibold hover:underline cursor-pointer inline-block" data-mention="${username}">@${username}</span>`
      }
    },
    {
      name: 'hashtag',
      level: 'inline',
      start(src: string) {
        return src.indexOf('#')
      },
      tokenizer(src: string) {
        const match = /^#([a-zA-Z0-9_\u0600-\u06FF\u0750-\u077F\uFB50-\uFDFF\uFE70-\uFEFF]+)/u.exec(src)
        if (match) {
          return {
            type: 'hashtag',
            raw: match[0],
            tag: match[1]
          }
        }
      },
      renderer(token: any) {
        const tag = escapeHtml(token.tag || '')
        return `<span class="tg-hashtag text-[#3390ec] font-semibold hover:underline cursor-pointer inline-block" data-hashtag="${tag}">#${tag}</span>`
      }
    },
    {
      name: 'spoiler',
      level: 'inline',
      start(src: string) {
        return src.indexOf('||')
      },
      tokenizer(src: string) {
        const match = /^\|\|([\s\S]+?)\|\|/.exec(src)
        if (match) {
          return {
            type: 'spoiler',
            raw: match[0],
            text: match[1],
            tokens: (this as any).lexer.inlineTokens(match[1])
          }
        }
      },
      renderer(token: any) {
        return `<span class="tg-spoiler" onclick="this.classList.toggle('revealed')">${(this as any).parser.parseInline(token.tokens)}</span>`
      }
    }
  ],
  hooks: {
    postprocess(html: string) {
      return html
        .replace(
          /<table>/g,
          '<div class="tg-table-wrapper overflow-x-auto max-w-full my-2 rounded-xl border border-gray-300 dark:border-white/15"><table class="w-full text-xs text-start border-collapse">'
        )
        .replace(/<\/table>/g, '</table></div>')
    }
  }
})

// Telegram-style comprehensive markdown renderer with cache
const markdownCache = new Map<string, string>()
export function renderTelegramMarkdown(text: string): string {
  if (!text) return ''
  const cached = markdownCache.get(text)
  if (cached !== undefined) return cached

  try {
    const parsed = markedInstance.parse(text) as string
    if (markdownCache.size > 2000) markdownCache.clear()
    markdownCache.set(text, parsed)
    return parsed
  } catch (err) {
    console.error('Markdown parse error:', err)
    return escapeHtml(text).replace(/\n/g, '<br/>')
  }
}

export function initCodeCopyHandler() {
  if (typeof window === 'undefined') return

  const handleCopy = (btn: HTMLElement, e?: Event) => {
    if (e) {
      e.preventDefault()
      e.stopPropagation()
    }
    const block = btn.closest('.tg-code-block')
    const codeEl = block?.querySelector('pre code')
    if (!codeEl) return

    const rawText = codeEl.textContent || ''

    const feedback = () => {
      const copyIcon = btn.querySelector('.tg-copy-icon')
      const copyText = btn.querySelector('.tg-copy-text')

      btn.classList.add('text-emerald-500', 'dark:text-emerald-400')
      if (copyText) copyText.textContent = 'Copied!'
      if (copyIcon) {
        copyIcon.innerHTML = `<polyline points="20 6 9 17 4 12"/>`
        copyIcon.setAttribute('stroke-width', '2.5')
      }

      setTimeout(() => {
        btn.classList.remove('text-emerald-500', 'dark:text-emerald-400')
        const currentIcon = btn.querySelector('.tg-copy-icon')
        if (currentIcon) {
          currentIcon.innerHTML = `<rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/>`
          currentIcon.setAttribute('stroke-width', '2')
        }
        const textSpan = btn.querySelector('.tg-copy-text')
        if (textSpan) textSpan.textContent = 'Copy'
      }, 2000)
    }

    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(rawText).then(feedback).catch(() => {
        fallbackCopy(rawText, feedback)
      })
    } else {
      fallbackCopy(rawText, feedback)
    }
  }

  function fallbackCopy(text: string, onSuccess: () => void) {
    try {
      const ta = document.createElement('textarea')
      ta.value = text
      ta.style.position = 'fixed'
      ta.style.opacity = '0'
      document.body.appendChild(ta)
      ta.focus()
      ta.select()
      document.execCommand('copy')
      document.body.removeChild(ta)
      onSuccess()
    } catch (err) {
      console.warn('Failed to copy code:', err)
    }
  }

  ;(window as any).__copyCodeBlock = handleCopy

  document.addEventListener('click', (e) => {
    const btn = (e.target as HTMLElement).closest('.tg-code-copy-btn') as HTMLElement | null
    if (btn) {
      handleCopy(btn, e)
    }
  })
}

// Auto-run if in browser
if (typeof window !== 'undefined') {
  initCodeCopyHandler()
}

export {
  EMOJI_TO_NAME,
  NAME_TO_EMOJI,
  toEmojiName,
  toEmojiChar
} from './reactions'
