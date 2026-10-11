<script setup lang="ts">
import { ref } from 'vue'
import { onClickOutside } from '@vueuse/core'
import type { TodoPriority } from '../../stores/todo'
import { Flag, ChevronDown, Check } from 'lucide-vue-next'

const props = withDefaults(
  defineProps<{
    modelValue: TodoPriority
    labelPrefix?: boolean
  }>(),
  {
    modelValue: 'none',
    labelPrefix: true
  }
)

const emit = defineEmits<{
  (e: 'update:modelValue', value: TodoPriority): void
}>()

const isOpen = ref(false)
const rootRef = ref<HTMLElement | null>(null)

onClickOutside(rootRef, () => {
  isOpen.value = false
})

interface PriorityOption {
  value: TodoPriority
  label: string
  color: string
  bgHover: string
  emoji: string
}

const options: PriorityOption[] = [
  { value: 'none', label: 'None', color: 'text-[#7f91a4]', bgHover: 'hover:bg-gray-100 dark:hover:bg-[#253241]', emoji: '' },
  { value: 'low', label: 'Low', color: 'text-emerald-500', bgHover: 'hover:bg-emerald-500/10 dark:hover:bg-emerald-500/15', emoji: '🟢' },
  { value: 'medium', label: 'Medium', color: 'text-amber-500', bgHover: 'hover:bg-amber-500/10 dark:hover:bg-amber-500/15', emoji: '🟡' },
  { value: 'high', label: 'High', color: 'text-red-500', bgHover: 'hover:bg-red-500/10 dark:hover:bg-red-500/15', emoji: '🔴' }
]

function selectPriority(val: TodoPriority) {
  emit('update:modelValue', val)
  isOpen.value = false
}

function getSelectedOption() {
  return options.find((o) => o.value === props.modelValue) || options[0]
}
</script>

<template>
  <div ref="rootRef" class="relative inline-block select-none text-xs">
    <!-- Trigger Button -->
    <button
      type="button"
      @click="isOpen = !isOpen"
      class="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#f4f4f5] dark:bg-[#242f3d] border border-[#dfe1e5] dark:border-[#202b36] hover:border-[#3390ec]/60 text-[#111827] dark:text-[#f5f5f5] transition-all cursor-pointer shadow-2xs group"
      :class="{ 'border-[#3390ec] dark:border-[#3390ec]': isOpen }"
    >
      <Flag
        class="w-3.5 h-3.5 shrink-0 transition-colors"
        :class="getSelectedOption().color"
      />
      <span class="font-medium whitespace-nowrap">
        {{ labelPrefix ? (props.modelValue === 'none' ? 'Priority: None' : `Priority: ${getSelectedOption().label}`) : getSelectedOption().label }}
      </span>
      <span v-if="getSelectedOption().emoji" class="text-[10px] leading-none">
        {{ getSelectedOption().emoji }}
      </span>
      <ChevronDown
        class="w-3 h-3 text-[#7f91a4] transition-transform duration-150 shrink-0 ml-0.5"
        :class="{ 'rotate-180 text-[#3390ec]': isOpen }"
      />
    </button>

    <!-- Dropdown Menu -->
    <div
      v-if="isOpen"
      class="absolute left-0 top-full mt-1.5 z-50 w-44 bg-white dark:bg-[#1e2a36] border border-[#dfe1e5] dark:border-[#202b36] rounded-2xl shadow-xl p-1.5 space-y-0.5 animate-in fade-in zoom-in-95 duration-100 origin-top-left"
    >
      <div class="px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-[#7f91a4]">
        Select Priority
      </div>
      <button
        v-for="opt in options"
        :key="opt.value"
        type="button"
        @click="selectPriority(opt.value)"
        class="w-full flex items-center justify-between px-2.5 py-1.5 rounded-xl transition-colors cursor-pointer text-xs"
        :class="[
          props.modelValue === opt.value
            ? 'bg-[#3390ec]/15 dark:bg-[#3390ec]/25 text-[#3390ec] font-semibold'
            : `${opt.bgHover} text-[#111827] dark:text-[#f5f5f5]`
        ]"
      >
        <div class="flex items-center gap-2">
          <Flag class="w-3.5 h-3.5" :class="opt.color" />
          <span>{{ opt.label }}</span>
          <span v-if="opt.emoji" class="text-[10px]">{{ opt.emoji }}</span>
        </div>
        <Check v-if="props.modelValue === opt.value" class="w-3.5 h-3.5 text-[#3390ec] stroke-[2.5]" />
      </button>
    </div>
  </div>
</template>
