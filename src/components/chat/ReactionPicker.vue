<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import {
  EMOJI_CATEGORIES,
  frequentReactions,
  recordReactionUsage,
  type EmojiItem
} from '../../utils/reactions'
import { Search, X, Clock } from 'lucide-vue-next'

const props = withDefaults(
  defineProps<{
    alignRight?: boolean
    showFrequentFirst?: boolean
  }>(),
  {
    alignRight: false,
    showFrequentFirst: true
  }
)

const emit = defineEmits<{
  (e: 'select', emoji: string): void
  (e: 'close'): void
}>()

const pickerRef = ref<HTMLDivElement | null>(null)
const searchQuery = ref('')
const activeCategory = ref<string>(props.showFrequentFirst ? 'frequent' : 'smileys')

// All flat emojis for fast search
const allEmojiItems = computed<EmojiItem[]>(() => {
  const list: EmojiItem[] = []
  for (const cat of EMOJI_CATEGORIES) {
    list.push(...cat.emojis)
  }
  return list
})

// Search filtered results
const filteredEmojis = computed<EmojiItem[]>(() => {
  const q = searchQuery.value.trim().toLowerCase()
  if (!q) return []
  return allEmojiItems.value.filter((item) => {
    if (item.char.includes(q)) return true
    if (item.name.toLowerCase().includes(q)) return true
    if (item.keywords?.some((k) => k.toLowerCase().includes(q))) return true
    return false
  })
})

// Current display emojis when not searching
const currentCategoryEmojis = computed<{ char: string; name?: string }[]>(() => {
  if (activeCategory.value === 'frequent') {
    return frequentReactions.value.map((char) => ({ char }))
  }
  const cat = EMOJI_CATEGORIES.find((c) => c.id === activeCategory.value)
  return cat ? cat.emojis : []
})

function handlePick(emoji: string) {
  recordReactionUsage(emoji)
  emit('select', emoji)
}

function handleKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') {
    emit('close')
  }
}

function handleClickOutside(e: MouseEvent) {
  const target = e.target as HTMLElement | null
  if (!target) return
  if (pickerRef.value && !pickerRef.value.contains(target)) {
    emit('close')
  }
}

onMounted(() => {
  document.addEventListener('keydown', handleKeydown)
  // Use timeout so current click doesn't trigger close immediately
  setTimeout(() => {
    document.addEventListener('click', handleClickOutside)
  }, 10)
})

onUnmounted(() => {
  document.removeEventListener('keydown', handleKeydown)
  document.removeEventListener('click', handleClickOutside)
})
</script>

<template>
  <div
    ref="pickerRef"
    class="w-72 sm:w-80 bg-white dark:bg-[#17212b] rounded-2xl shadow-2xl border border-[#dfe1e5] dark:border-[#202b36] flex flex-col overflow-hidden select-none z-50 animate-in fade-in zoom-in-95 duration-150"
    :class="alignRight ? 'origin-top-right' : 'origin-top-left'"
    @click.stop
  >
    <!-- Search Bar -->
    <div class="p-2 border-b border-[#dfe1e5] dark:border-[#202b36] bg-[#0e1621]/40">
      <div class="relative flex items-center">
        <Search class="w-3.5 h-3.5 text-[#7f91a4] absolute left-2.5 pointer-events-none" />
        <input
          v-model="searchQuery"
          type="text"
          placeholder="Search reaction..."
          class="w-full bg-gray-100 dark:bg-[#0e1621] border border-gray-300 dark:border-[#202b36] text-gray-800 dark:text-white text-xs rounded-xl pl-8 pr-7 py-1.5 outline-none focus:border-[#3390ec] transition-colors"
          autofocus
        />
        <button
          v-if="searchQuery"
          @click="searchQuery = ''"
          class="absolute right-2 text-[#7f91a4] hover:text-white transition-colors"
        >
          <X class="w-3.5 h-3.5" />
        </button>
      </div>
    </div>

    <!-- Category Tabs (Hidden when searching) -->
    <div
      v-if="!searchQuery"
      class="flex items-center px-1.5 py-1 border-b border-[#dfe1e5] dark:border-[#202b36] bg-[#0e1621]/20 gap-0.5 overflow-x-auto"
    >
      <!-- Frequent Tab -->
      <button
        @click="activeCategory = 'frequent'"
        :title="'Frequently Used'"
        class="flex-1 py-1 text-xs rounded-lg transition-all flex items-center justify-center cursor-pointer"
        :class="
          activeCategory === 'frequent'
            ? 'bg-[#3390ec] text-white'
            : 'text-[#7f91a4] hover:text-white hover:bg-white/5'
        "
      >
        <Clock class="w-3.5 h-3.5" />
      </button>

      <!-- Standard Categories -->
      <button
        v-for="cat in EMOJI_CATEGORIES"
        :key="cat.id"
        @click="activeCategory = cat.id"
        :title="cat.name"
        class="flex-1 py-1 text-sm rounded-lg transition-all flex items-center justify-center cursor-pointer"
        :class="
          activeCategory === cat.id
            ? 'bg-[#3390ec] text-white shadow-xs'
            : 'text-[#7f91a4] hover:text-white hover:bg-white/5'
        "
      >
        {{ cat.icon }}
      </button>
    </div>

    <!-- Emojis Grid -->
    <div class="h-64 p-2 overflow-y-auto">
      <!-- Search Results -->
      <div v-if="searchQuery">
        <div v-if="filteredEmojis.length > 0" class="grid grid-cols-7 sm:grid-cols-8 gap-1">
          <button
            v-for="item in filteredEmojis"
            :key="item.char + item.name"
            @click="handlePick(item.char)"
            :title="item.name"
            class="w-8 h-8 flex items-center justify-center text-lg hover:bg-gray-100 dark:hover:bg-[#202b36] rounded-lg transition-transform hover:scale-125 cursor-pointer active:scale-95"
          >
            {{ item.char }}
          </button>
        </div>
        <div v-else class="h-40 flex flex-col items-center justify-center text-xs text-[#7f91a4] gap-1">
          <span>No emojis found</span>
          <span class="text-[11px] opacity-70">Try searching for "heart", "smile", "fire"...</span>
        </div>
      </div>

      <!-- Category Content -->
      <div v-else>
        <div
          v-if="activeCategory === 'frequent' && currentCategoryEmojis.length === 0"
          class="h-40 flex items-center justify-center text-xs text-[#7f91a4]"
        >
          No recently used reactions yet
        </div>
        <div v-else class="grid grid-cols-7 sm:grid-cols-8 gap-1">
          <button
            v-for="item in currentCategoryEmojis"
            :key="item.char"
            @click="handlePick(item.char)"
            :title="item.name || item.char"
            class="w-8 h-8 flex items-center justify-center text-lg hover:bg-gray-100 dark:hover:bg-[#202b36] rounded-lg transition-transform hover:scale-125 cursor-pointer active:scale-95"
          >
            {{ item.char }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
