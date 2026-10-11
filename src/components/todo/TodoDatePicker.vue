<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { onClickOutside } from '@vueuse/core'
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight, X } from 'lucide-vue-next'

const props = withDefaults(
  defineProps<{
    modelValue: string
    placeholder?: string
    labelPrefix?: boolean
  }>(),
  {
    modelValue: '',
    placeholder: 'Due date',
    labelPrefix: true
  }
)

const emit = defineEmits<{
  (e: 'update:modelValue', value: string): void
}>()

const isOpen = ref(false)
const rootRef = ref<HTMLElement | null>(null)

onClickOutside(rootRef, () => {
  isOpen.value = false
})

// Current navigation view (year & month)
const today = new Date()
const viewYear = ref(today.getFullYear())
const viewMonth = ref(today.getMonth()) // 0 - 11

// Keep view in sync when modelValue changes
watch(
  () => props.modelValue,
  (newVal) => {
    if (newVal) {
      const parts = newVal.split('-').map(Number)
      if (parts.length === 3 && !isNaN(parts[0]) && !isNaN(parts[1])) {
        viewYear.value = parts[0]
        viewMonth.value = parts[1] - 1
      }
    }
  },
  { immediate: true }
)

const monthNames = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
]

const weekDays = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa']

function prevMonth() {
  if (viewMonth.value === 0) {
    viewMonth.value = 11
    viewYear.value -= 1
  } else {
    viewMonth.value -= 1
  }
}

function nextMonth() {
  if (viewMonth.value === 11) {
    viewMonth.value = 0
    viewYear.value += 1
  } else {
    viewMonth.value += 1
  }
}

function padZero(n: number): string {
  return n < 10 ? `0${n}` : String(n)
}

function formatYMD(year: number, month: number, day: number): string {
  return `${year}-${padZero(month + 1)}-${padZero(day)}`
}

interface CalendarCell {
  day: number
  dateStr: string
  isCurrentMonth: boolean
  isToday: boolean
  isSelected: boolean
}

const calendarDays = computed<CalendarCell[]>(() => {
  const year = viewYear.value
  const month = viewMonth.value

  const firstDayOfWeek = new Date(year, month, 1).getDay() // 0 = Sunday
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const daysInPrevMonth = new Date(year, month, 0).getDate()

  const todayStr = formatYMD(today.getFullYear(), today.getMonth(), today.getDate())
  const selectedStr = props.modelValue

  const cells: CalendarCell[] = []

  // Trailing days of prev month
  for (let i = firstDayOfWeek - 1; i >= 0; i--) {
    const d = daysInPrevMonth - i
    const prevM = month === 0 ? 11 : month - 1
    const prevY = month === 0 ? year - 1 : year
    const dStr = formatYMD(prevY, prevM, d)
    cells.push({
      day: d,
      dateStr: dStr,
      isCurrentMonth: false,
      isToday: dStr === todayStr,
      isSelected: dStr === selectedStr
    })
  }

  // Days of current month
  for (let d = 1; d <= daysInMonth; d++) {
    const dStr = formatYMD(year, month, d)
    cells.push({
      day: d,
      dateStr: dStr,
      isCurrentMonth: true,
      isToday: dStr === todayStr,
      isSelected: dStr === selectedStr
    })
  }

  // Leading days of next month (fill up to multiple of 7)
  const remaining = (7 - (cells.length % 7)) % 7
  for (let d = 1; d <= remaining; d++) {
    const nextM = month === 11 ? 0 : month + 1
    const nextY = month === 11 ? year + 1 : year
    const dStr = formatYMD(nextY, nextM, d)
    cells.push({
      day: d,
      dateStr: dStr,
      isCurrentMonth: false,
      isToday: dStr === todayStr,
      isSelected: dStr === selectedStr
    })
  }

  return cells
})

function selectDate(dateStr: string) {
  emit('update:modelValue', dateStr)
  isOpen.value = false
}

function clearDate(e?: MouseEvent) {
  if (e) e.stopPropagation()
  emit('update:modelValue', '')
  isOpen.value = false
}

// Quick Preset Handlers
function selectPreset(type: 'today' | 'tomorrow' | 'nextWeek') {
  const d = new Date()
  if (type === 'tomorrow') {
    d.setDate(d.getDate() + 1)
  } else if (type === 'nextWeek') {
    d.setDate(d.getDate() + 7)
  }
  const dateStr = formatYMD(d.getFullYear(), d.getMonth(), d.getDate())
  selectDate(dateStr)
}

// Display Label for trigger button
const displayLabel = computed(() => {
  if (!props.modelValue) return props.placeholder

  const todayStr = formatYMD(today.getFullYear(), today.getMonth(), today.getDate())
  const tomorrowObj = new Date()
  tomorrowObj.setDate(tomorrowObj.getDate() + 1)
  const tomorrowStr = formatYMD(tomorrowObj.getFullYear(), tomorrowObj.getMonth(), tomorrowObj.getDate())

  if (props.modelValue === todayStr) {
    return 'Today'
  }
  if (props.modelValue === tomorrowStr) {
    return 'Tomorrow'
  }

  const parts = props.modelValue.split('-').map(Number)
  if (parts.length === 3) {
    const d = new Date(parts[0], parts[1] - 1, parts[2])
    const monthShort = d.toLocaleDateString(undefined, { month: 'short' })
    const isSameYear = parts[0] === today.getFullYear()
    return isSameYear ? `${parts[2]} ${monthShort}` : `${parts[2]} ${monthShort} ${parts[0]}`
  }

  return props.modelValue
})
</script>

<template>
  <div ref="rootRef" class="relative inline-block select-none text-xs">
    <!-- Trigger Button -->
    <div
      class="group flex items-center rounded-xl bg-[#f4f4f5] dark:bg-[#242f3d] border border-[#dfe1e5] dark:border-[#202b36] hover:border-[#3390ec]/60 transition-all text-[#111827] dark:text-[#f5f5f5] shadow-2xs"
      :class="{ 'border-[#3390ec] dark:border-[#3390ec]': isOpen }"
    >
      <button
        type="button"
        @click="isOpen = !isOpen"
        class="flex items-center gap-1.5 px-3 py-1.5 cursor-pointer font-medium"
      >
        <CalendarIcon
          class="w-3.5 h-3.5 shrink-0 transition-colors"
          :class="modelValue ? 'text-[#3390ec]' : 'text-[#7f91a4]'"
        />
        <span
          class="whitespace-nowrap"
          :class="modelValue ? 'text-[#111827] dark:text-[#f5f5f5] font-semibold' : 'text-[#7f91a4]'"
        >
          {{ displayLabel }}
        </span>
      </button>

      <!-- Clear date button if selected -->
      <button
        v-if="modelValue"
        type="button"
        @click="clearDate"
        class="pr-2 pl-0.5 text-[#7f91a4] hover:text-red-400 dark:hover:text-red-400 transition-colors cursor-pointer"
        title="Clear date"
      >
        <X class="w-3 h-3" />
      </button>
    </div>

    <!-- Calendar Dropdown Popup -->
    <div
      v-if="isOpen"
      class="absolute left-0 top-full mt-1.5 z-50 w-72 bg-white dark:bg-[#1e2a36] border border-[#dfe1e5] dark:border-[#202b36] rounded-2xl shadow-2xl p-3 animate-in fade-in zoom-in-95 duration-100 origin-top-left"
    >
      <!-- Quick Preset Chips -->
      <div class="flex items-center gap-1.5 mb-3 pb-2.5 border-b border-[#dfe1e5]/60 dark:border-[#202b36]/80 overflow-x-auto no-scrollbar">
        <button
          type="button"
          @click="selectPreset('today')"
          class="px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-gray-100 dark:bg-[#253241] text-[#111827] dark:text-[#f5f5f5] hover:bg-[#3390ec]/15 hover:text-[#3390ec] transition-colors cursor-pointer whitespace-nowrap"
        >
          Today
        </button>
        <button
          type="button"
          @click="selectPreset('tomorrow')"
          class="px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-gray-100 dark:bg-[#253241] text-[#111827] dark:text-[#f5f5f5] hover:bg-[#3390ec]/15 hover:text-[#3390ec] transition-colors cursor-pointer whitespace-nowrap"
        >
          Tomorrow
        </button>
        <button
          type="button"
          @click="selectPreset('nextWeek')"
          class="px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-gray-100 dark:bg-[#253241] text-[#111827] dark:text-[#f5f5f5] hover:bg-[#3390ec]/15 hover:text-[#3390ec] transition-colors cursor-pointer whitespace-nowrap"
        >
          Next week
        </button>
      </div>

      <!-- Month & Year Navigation Header -->
      <div class="flex items-center justify-between mb-2 px-1">
        <span class="text-xs font-bold text-[#111827] dark:text-[#f5f5f5]">
          {{ monthNames[viewMonth] }} {{ viewYear }}
        </span>
        <div class="flex items-center gap-1">
          <button
            type="button"
            @click="prevMonth"
            class="p-1 rounded-lg hover:bg-gray-100 dark:hover:bg-[#253241] text-[#7f91a4] hover:text-[#111827] dark:hover:text-white transition-colors cursor-pointer"
            title="Previous month"
          >
            <ChevronLeft class="w-4 h-4" />
          </button>
          <button
            type="button"
            @click="nextMonth"
            class="p-1 rounded-lg hover:bg-gray-100 dark:hover:bg-[#253241] text-[#7f91a4] hover:text-[#111827] dark:hover:text-white transition-colors cursor-pointer"
            title="Next month"
          >
            <ChevronRight class="w-4 h-4" />
          </button>
        </div>
      </div>

      <!-- Weekday Initials -->
      <div class="grid grid-cols-7 gap-1 text-center mb-1">
        <div
          v-for="wd in weekDays"
          :key="wd"
          class="text-[10px] font-bold text-[#7f91a4] uppercase py-0.5"
        >
          {{ wd }}
        </div>
      </div>

      <!-- Day Cells Grid -->
      <div class="grid grid-cols-7 gap-1">
        <button
          v-for="(cell, idx) in calendarDays"
          :key="idx"
          type="button"
          @click="selectDate(cell.dateStr)"
          class="relative h-8 rounded-xl text-xs font-medium flex items-center justify-center transition-all cursor-pointer group"
          :class="[
            cell.isSelected
              ? 'bg-[#3390ec] text-white font-bold shadow-xs'
              : cell.isCurrentMonth
                ? 'text-[#111827] dark:text-[#f5f5f5] hover:bg-[#3390ec]/15 dark:hover:bg-[#3390ec]/20 hover:text-[#3390ec]'
                : 'text-[#7f91a4]/40 hover:bg-gray-100 dark:hover:bg-[#253241] hover:text-[#7f91a4]'
          ]"
        >
          <span>{{ cell.day }}</span>
          <!-- Subtle dot for today when not selected -->
          <span
            v-if="cell.isToday && !cell.isSelected"
            class="absolute bottom-1 w-1 h-1 rounded-full bg-[#3390ec]"
          ></span>
        </button>
      </div>

      <!-- Footer Action (Clear) -->
      <div v-if="modelValue" class="mt-3 pt-2 border-t border-[#dfe1e5]/60 dark:border-[#202b36]/80 flex justify-end">
        <button
          type="button"
          @click="clearDate"
          class="text-[11px] font-semibold text-red-500 hover:text-red-600 dark:hover:text-red-400 transition-colors cursor-pointer"
        >
          Remove due date
        </button>
      </div>
    </div>
  </div>
</template>
