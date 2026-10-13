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

  if (dateYMD === nowYMD) {
    return `Today at ${timeStr}`
  }

  const yesterday = new Date(now.getTime() - 86400000)
  if (dateYMD === getZonedYMD(yesterday, tz)) {
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

  return `${datePart}, ${timeStr}`
}

export function formatFileSize(bytes: number): string {
  if (!bytes) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i]
}

import { Marked } from 'marked'

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
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
      const cleanLang = (token.lang || '').replace(/[^a-zA-Z0-9_-]/g, '')
      const lang = cleanLang ? `language-${cleanLang}` : ''
      return `<pre class="bg-black/5 dark:bg-black/30 text-emerald-700 dark:text-emerald-400 p-2.5 my-1.5 rounded-xl text-xs font-mono overflow-x-auto border border-gray-300 dark:border-white/10"><code class="${lang}">${escapeHtml(token.text)}</code></pre>`
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

export {
  EMOJI_TO_NAME,
  NAME_TO_EMOJI,
  toEmojiName,
  toEmojiChar
} from './reactions'
