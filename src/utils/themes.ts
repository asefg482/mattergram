export interface ThemePreset {
  id: string
  name: string
  nameFa?: string
  mode: 'dark' | 'light'
  colors: {
    bg: string
    sidebar: string
    card: string
    bubbleIn: string
    bubbleOut: string
    accent: string
    text: string
  }
  description: string
}

export interface AnimationPreset {
  id: string
  name: string
  nameFa?: string
  description: string
}

export const THEME_PRESETS: ThemePreset[] = [
  {
    id: 'classic-dark',
    name: 'Telegram Dark',
    mode: 'dark',
    colors: {
      bg: '#0e1621',
      sidebar: '#17212b',
      card: '#242f3d',
      bubbleIn: '#182533',
      bubbleOut: '#2b5278',
      accent: '#3390ec',
      text: '#f5f5f5'
    },
    description: 'Classic Telegram dark theme with blue accents'
  },
  {
    id: 'classic-light',
    name: 'Telegram Day',
    mode: 'light',
    colors: {
      bg: '#8ea6b4',
      sidebar: '#ffffff',
      card: '#f4f4f5',
      bubbleIn: '#ffffff',
      bubbleOut: '#eeffde',
      accent: '#3390ec',
      text: '#111827'
    },
    description: 'Crisp light theme with pastel green bubbles'
  },
  {
    id: 'midnight-amoled',
    name: 'Midnight AMOLED',
    mode: 'dark',
    colors: {
      bg: '#000000',
      sidebar: '#09090b',
      card: '#141416',
      bubbleIn: '#121214',
      bubbleOut: '#0284c7',
      accent: '#38bdf8',
      text: '#ffffff'
    },
    description: 'Pure black contrast optimized for OLED displays'
  },
  {
    id: 'matrix-emerald',
    name: 'Emerald Forest',
    mode: 'dark',
    colors: {
      bg: '#06130d',
      sidebar: '#0a1c14',
      card: '#112a1f',
      bubbleIn: '#0d2219',
      bubbleOut: '#144e36',
      accent: '#10b981',
      text: '#f0fdf4'
    },
    description: 'Deep emerald palette inspired by nature'
  },
  {
    id: 'cyberpunk-neon',
    name: 'Cyberpunk Violet',
    mode: 'dark',
    colors: {
      bg: '#0d081a',
      sidebar: '#150d29',
      card: '#22143f',
      bubbleIn: '#1c1134',
      bubbleOut: '#581c87',
      accent: '#c084fc',
      text: '#faf5ff'
    },
    description: 'Futuristic cosmic neon purple aesthetic'
  },
  {
    id: 'sunset-amber',
    name: 'Warm Sunset',
    mode: 'dark',
    colors: {
      bg: '#140f0c',
      sidebar: '#1d1612',
      card: '#2a201b',
      bubbleIn: '#231a15',
      bubbleOut: '#6c3b1c',
      accent: '#f59e0b',
      text: '#fffbeb'
    },
    description: 'Cozy espresso and warm amber golden hour tones'
  },
  {
    id: 'arctic-nord',
    name: 'Arctic Frost',
    mode: 'dark',
    colors: {
      bg: '#0f172a',
      sidebar: '#172338',
      card: '#1e2f47',
      bubbleIn: '#1a293e',
      bubbleOut: '#2563eb',
      accent: '#60a5fa',
      text: '#f8fafc'
    },
    description: 'Cool Scandinavian blue inspired by Nordic glaciers'
  }
]

export const ANIMATION_PRESETS: AnimationPreset[] = [
  {
    id: 'smooth',
    name: 'Telegram Smooth',
    description: 'Standard fluid Telegram motion balanced for performance and beauty'
  },
  {
    id: 'spring',
    name: 'Bouncy Spring',
    description: 'Playful elastic spring physics for messages and menus'
  },
  {
    id: 'fast',
    name: 'Turbo Snappy',
    description: 'Ultra-fast 75ms animations for maximum responsiveness'
  },
  {
    id: 'pulse',
    name: 'Ambient Glow',
    description: 'Soft neon glows and subtle pulse effects on active elements'
  },
  {
    id: 'none',
    name: 'Reduced Motion',
    description: 'Disables all animations for accessibility and minimum resource usage'
  }
]

export function getThemeById(id: string): ThemePreset {
  return THEME_PRESETS.find((t) => t.id === id) || THEME_PRESETS[0]
}

export function getAnimationById(id: string): AnimationPreset {
  return ANIMATION_PRESETS.find((a) => a.id === id) || ANIMATION_PRESETS[0]
}
