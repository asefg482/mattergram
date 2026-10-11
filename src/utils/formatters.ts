import { format, isToday, isYesterday, isThisYear } from 'date-fns'

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

export function formatChatListTime(timestamp: number): string {
  if (!timestamp) return ''
  const date = new Date(timestamp)
  if (isToday(date)) {
    return format(date, 'HH:mm')
  }
  if (isYesterday(date)) {
    return 'Yesterday'
  }
  if (isThisYear(date)) {
    return format(date, 'MMM d')
  }
  return format(date, 'dd/MM/yy')
}

const messageTimeCache = new Map<number, string>()
export function formatMessageTime(timestamp: number): string {
  if (!timestamp) return ''
  const cached = messageTimeCache.get(timestamp)
  if (cached) return cached

  const res = format(new Date(timestamp), 'HH:mm')
  if (messageTimeCache.size > 2000) messageTimeCache.clear()
  messageTimeCache.set(timestamp, res)
  return res
}

export function formatDateSeparator(timestamp: number): string {
  if (!timestamp) return ''
  const date = new Date(timestamp)
  if (isToday(date)) return 'Today'
  if (isYesterday(date)) return 'Yesterday'
  if (isThisYear(date)) return format(date, 'MMMM d')
  return format(date, 'MMMM d, yyyy')
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
      return `<a href="${safeHref}" target="_blank" rel="noopener noreferrer" class="text-[#3390ec] hover:underline font-medium break-all">${text}</a>`
    },
    blockquote(token) {
      const body = this.parser.parse(token.tokens)
      return `<blockquote class="border-l-3 border-[#3390ec] pl-2.5 py-1 my-1.5 bg-black/15 dark:bg-black/15 bg-black/5 rounded-r text-xs opacity-90 leading-relaxed">${body}</blockquote>`
    },
    code(token) {
      const lang = token.lang ? `language-${token.lang}` : ''
      return `<pre class="bg-black/30 dark:bg-black/30 bg-black/5 text-emerald-400 dark:text-emerald-400 text-emerald-700 p-2.5 my-1.5 rounded-xl text-xs font-mono overflow-x-auto border border-white/10 dark:border-white/10 border-gray-300"><code class="${lang}">${escapeHtml(token.text)}</code></pre>`
    },
    codespan(token) {
      return `<code class="bg-black/25 dark:bg-black/25 bg-black/5 text-pink-400 dark:text-pink-400 text-pink-600 px-1 py-0.5 rounded text-xs font-mono">${escapeHtml(token.text)}</code>`
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
        return `<span class="tg-mention text-[#3390ec] font-semibold hover:underline cursor-pointer inline-block" data-mention="${token.username}">@${token.username}</span>`
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
          '<div class="tg-table-wrapper overflow-x-auto max-w-full my-2 rounded-xl border border-white/15 dark:border-white/15 border-gray-300"><table class="w-full text-xs text-start border-collapse">'
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
