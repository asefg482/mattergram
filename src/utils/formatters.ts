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

// Telegram-style basic markdown renderer with high-performance cache
const markdownCache = new Map<string, string>()
export function renderTelegramMarkdown(text: string): string {
  if (!text) return ''
  const cached = markdownCache.get(text)
  if (cached !== undefined) return cached

  let escaped = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')

  // Code blocks ```code```
  escaped = escaped.replace(/```([\s\S]*?)```/g, '<pre class="bg-black/30 text-emerald-400 p-2 my-1 rounded text-xs font-mono overflow-x-auto">$1</pre>')

  // Inline code `code`
  escaped = escaped.replace(/`([^`]+)`/g, '<code class="bg-black/25 text-pink-400 px-1 py-0.5 rounded text-xs font-mono">$1</code>')

  // Bold **bold** or *bold*
  escaped = escaped.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
  escaped = escaped.replace(/__([^_]+)__/g, '<strong>$1</strong>')

  // Italic *italic* or _italic_
  escaped = escaped.replace(/\*([^*]+)\*/g, '<em>$1</em>')
  escaped = escaped.replace(/_([^_]+)_/g, '<em>$1</em>')

  // Strikethrough ~~strike~~
  escaped = escaped.replace(/~~([^~]+)~~/g, '<del>$1</del>')

  // URLs
  escaped = escaped.replace(
    /(https?:\/\/[^\s<]+)/g,
    '<a href="$1" target="_blank" rel="noopener noreferrer" class="text-[#3390ec] hover:underline">$1</a>'
  )

  // User Mentions @username
  escaped = escaped.replace(
    /(^|[\s(])@([a-zA-Z0-9_.-]+)/g,
    '$1<span class="tg-mention text-[#3390ec] font-semibold hover:underline cursor-pointer inline-block" data-mention="$2">@$2</span>'
  )

  // Line breaks
  escaped = escaped.replace(/\n/g, '<br/>')

  if (markdownCache.size > 2000) markdownCache.clear()
  markdownCache.set(text, escaped)
  return escaped
}

// Mattermost <-> Telegram Emoji Mappings
export const EMOJI_TO_NAME: Record<string, string> = {
  '👍': '+1',
  '👎': '-1',
  '❤️': 'heart',
  '🔥': 'fire',
  '😂': 'joy',
  '👏': 'clap',
  '😢': 'cry',
  '🎉': 'tada',
  '🚀': 'rocket',
  '😍': 'heart_eyes',
  '🤔': 'thinking',
  '🙏': 'pray',
  '🤩': 'star_struck',
  '💯': '100'
}

export const NAME_TO_EMOJI: Record<string, string> = {
  '+1': '👍',
  'thumbsup': '👍',
  '-1': '👎',
  'thumbsdown': '👎',
  'heart': '❤️',
  'fire': '🔥',
  'joy': '😂',
  'clap': '👏',
  'cry': '😢',
  'sob': '😭',
  'tada': '🎉',
  'rocket': '🚀',
  'heart_eyes': '😍',
  'thinking': '🤔',
  'pray': '🙏',
  'star_struck': '🤩',
  '100': '💯'
}

export function toEmojiName(emojiOrName: string): string {
  return EMOJI_TO_NAME[emojiOrName] || emojiOrName
}

export function toEmojiChar(nameOrEmoji: string): string {
  return NAME_TO_EMOJI[nameOrEmoji] || nameOrEmoji
}
