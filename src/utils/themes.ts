export interface ThemePreset {
  id: string
  name: string
  nameFa: string
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
  nameFa: string
  description: string
}

export const THEME_PRESETS: ThemePreset[] = [
  {
    id: 'classic-dark',
    name: 'Telegram Dark',
    nameFa: 'کلاسیک شب تلگرام',
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
    description: 'تم استاندارد و پیش‌فرض تلگرام با تم آبی تیره'
  },
  {
    id: 'classic-light',
    name: 'Telegram Day',
    nameFa: 'کلاسیک روز تلگرام',
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
    description: 'تم روز شفاف تلگرام با حباب سبز پاستلی و پس‌زمینه ابری'
  },
  {
    id: 'midnight-amoled',
    name: 'Midnight AMOLED',
    nameFa: 'مشکی مطلق آمولد',
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
    description: 'مشکی خالص مخصوص صفحات اولد با کنتراست بالا و کاهش مصرف باتری'
  },
  {
    id: 'matrix-emerald',
    name: 'Emerald Forest',
    nameFa: 'جنگل زمردی',
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
    description: 'طیف سبز زمردی عمیق با جلوه آرامش‌بخش طبیعت'
  },
  {
    id: 'cyberpunk-neon',
    name: 'Cyberpunk Violet',
    nameFa: 'بنفش سایبرپانک',
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
    description: 'تم فضایی و نئونی مدرن با طیف بنفش کهکشانی و بنفش روشن'
  },
  {
    id: 'sunset-amber',
    name: 'Warm Sunset',
    nameFa: 'غروب کهربایی',
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
    description: 'طیف گرم شکلاتی و کهربایی برگرفته از آرامش غروب آفتاب'
  },
  {
    id: 'arctic-nord',
    name: 'Arctic Frost',
    nameFa: 'آبی یخی نوردیک',
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
    description: 'تم خنک نوردیک با الهام از یخچال‌های طبیعی اسکاندیناوی'
  }
]

export const ANIMATION_PRESETS: AnimationPreset[] = [
  {
    id: 'smooth',
    name: 'Telegram Smooth',
    nameFa: 'روان تلگرامی (پیش‌فرض)',
    description: 'انیمیشن‌های استاندارد و روان تلگرام با تعادل بهینه بین زیبایی و سرعت'
  },
  {
    id: 'spring',
    name: 'Bouncy Spring',
    nameFa: 'فنری و ارتجاعی',
    description: 'حرکت فنری و الاستیک برای باز شدن پیام‌ها، منوها و دکمه‌ها'
  },
  {
    id: 'fast',
    name: 'Turbo Snappy',
    nameFa: 'توربو و پرسرعت',
    description: 'انیمیشن‌های لحظه‌ای و بسیار کوتاه (۷۵ میلی‌ثانیه) برای بالاترین سرعت پاسخگویی'
  },
  {
    id: 'pulse',
    name: 'Ambient Glow',
    nameFa: 'نورانی و نئونی',
    description: 'هاله نورانی و پالس‌های نئونی ملایم در چت فعال و المان‌های تعاملی'
  },
  {
    id: 'none',
    name: 'Reduced Motion',
    nameFa: 'بدون انیمیشن',
    description: 'غیرفعال‌سازی تمامی انیمیشن‌ها برای صرفه‌جویی در منابع و دسترسی‌پذیری'
  }
]

export function getThemeById(id: string): ThemePreset {
  return THEME_PRESETS.find((t) => t.id === id) || THEME_PRESETS[0]
}

export function getAnimationById(id: string): AnimationPreset {
  return ANIMATION_PRESETS.find((a) => a.id === id) || ANIMATION_PRESETS[0]
}
