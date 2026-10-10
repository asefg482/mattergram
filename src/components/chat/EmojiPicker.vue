<script setup lang="ts">
import { ref } from 'vue'

const emit = defineEmits<{
  (e: 'select', emoji: string): void
}>()

const categories = [
  {
    name: 'Smileys',
    emojis: [
      '😀', '😃', '😄', '😁', '😆', '😅', '😂', '🤣', '😊', '😇',
      '🙂', '🙃', '😉', '😌', '😍', '🥰', '😘', '😗', '😙', '😚',
      '😋', '😛', '😜', '🤪', '🤨', '🧐', '🤓', '😎', '🤩', '🥳',
      '😏', '😒', '😞', '😔', '😟', '😕', '🙁', '😣', '😖', '😫',
      '😩', '🥺', '😢', '😭', '😤', '😠', '😡', '🤬', '🤯', '😳',
      '🥵', '🥶', '😱', '😨', '😰', '😥', '😓', '🤗', '🤔', '🤭',
      '🤫', '🤥', '😶', '😐', '😑', '😬', '🙄', '😯', '😦', '😧'
    ]
  },
  {
    name: 'Gestures',
    emojis: [
      '👍', '👎', '👌', '✌️', '🤞', '🤟', '🤘', '🤙', '👈', '👉',
      '👆', '🖕', '👇', '☝️', '✋', '🤚', '🖐️', '🖖', '👋', '✍️',
      '👏', '👐', '🙌', '🤲', '🤝', '🙏', '💪', '🦾', '👂', '👃'
    ]
  },
  {
    name: 'Hearts & Fire',
    emojis: [
      '❤️', '🧡', '💛', '💚', '💙', '💜', '🖤', '🤍', '🤎', '💔',
      '❣️', '💕', '💞', '💓', '💗', '💖', '💘', '💝', '🔥', '✨',
      '🌟', '💫', '💥', '💯', '🎉', '🎊', '🚀', '⚡️', '☀️', '🌈'
    ]
  }
]

const activeCategoryIndex = ref(0)
</script>

<template>
  <div class="w-72 h-80 bg-[#17212b] dark:bg-[#17212b] bg-white rounded-2xl shadow-2xl border border-[#202b36] dark:border-[#202b36] border-[#dfe1e5] flex flex-col overflow-hidden select-none z-50 animate-in fade-in zoom-in-95 duration-150">
    <!-- Category Tabs -->
    <div class="flex items-center px-2 py-1.5 border-b border-[#202b36] dark:border-[#202b36] border-[#dfe1e5] bg-[#0e1621]/40">
      <button
        v-for="(cat, idx) in categories"
        :key="cat.name"
        @click="activeCategoryIndex = idx"
        class="flex-1 py-1 text-[11px] font-semibold text-center rounded-lg transition-colors"
        :class="activeCategoryIndex === idx ? 'bg-[#3390ec] text-white' : 'text-[#7f91a4] hover:text-white'"
      >
        {{ cat.name }}
      </button>
    </div>

    <!-- Emojis Grid -->
    <div class="flex-1 p-2.5 overflow-y-auto grid grid-cols-7 gap-1">
      <button
        v-for="emoji in categories[activeCategoryIndex].emojis"
        :key="emoji"
        @click="emit('select', emoji)"
        class="w-8 h-8 flex items-center justify-center text-lg hover:bg-[#202b36] dark:hover:bg-[#202b36] hover:bg-[#f1f1f1] rounded-lg transition-transform hover:scale-125"
      >
        {{ emoji }}
      </button>
    </div>
  </div>
</template>
