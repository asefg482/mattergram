<script setup lang="ts">
import { ref, computed } from 'vue'
import { useTodoStore, type TodoItem } from '../../stores/todo'
import { useUiStore } from '../../stores/ui'
import { showConfirm } from '../../stores/alert'
import {
  CheckSquare,
  Check,
  Plus,
  ExternalLink,
  Maximize2,
  Trash2,
  Calendar,
  Flag
} from 'lucide-vue-next'

const todoStore = useTodoStore()
const uiStore = useUiStore()

const quickText = ref('')

function handleQuickAdd() {
  const text = quickText.value.trim()
  if (!text) return
  todoStore.addTodo({
    message: text
  })
  quickText.value = ''
}

function openFullModal() {
  uiStore.showTodoModal = true
}

async function handleDeleteTodo(id: string) {
  const confirmed = await showConfirm('Are you sure you want to delete this task?', {
    title: 'Delete Task',
    confirmText: 'Delete',
    cancelText: 'Cancel',
    isDestructive: true
  })
  if (confirmed) {
    todoStore.deleteTodo(id)
  }
}

function handleJumpToPost(item: TodoItem) {
  if (item.channel_id && item.post_id) {
    todoStore.jumpToPost(item.channel_id, item.post_id)
  }
}
</script>

<template>
  <div class="flex-1 flex flex-col h-full bg-white dark:bg-[#17212b] overflow-hidden select-none">
    <!-- Top Action Header -->
    <div class="px-3.5 py-2.5 border-b border-[#dfe1e5] dark:border-[#101921] flex items-center justify-between bg-gray-50/70 dark:bg-[#121922]/70 shrink-0">
      <div class="flex items-center gap-2">
        <CheckSquare class="w-4 h-4 text-[#3390ec]" />
        <span class="text-xs font-bold text-[#111827] dark:text-[#f5f5f5]">TODO Tasks</span>
        <span
          v-if="todoStore.pendingCount > 0"
          class="px-1.5 py-0.2 rounded-full text-[10px] font-bold bg-[#3390ec] text-white"
        >
          {{ todoStore.pendingCount }}
        </span>
      </div>

      <button
        @click="openFullModal"
        class="text-xs font-semibold text-[#3390ec] hover:underline flex items-center gap-1 cursor-pointer"
        title="Open full TODO list"
      >
        <Maximize2 class="w-3.5 h-3.5" />
        <span>Open View</span>
      </button>
    </div>

    <!-- Quick Add Input -->
    <div class="p-2.5 border-b border-[#dfe1e5] dark:border-[#101921] bg-white dark:bg-[#17212b] shrink-0">
      <form @submit.prevent="handleQuickAdd" class="flex items-center gap-1.5">
        <input
          v-model="quickText"
          type="text"
          placeholder="Add a task..."
          class="flex-1 bg-[#f4f4f5] dark:bg-[#242f3d] border border-transparent focus:border-[#3390ec] text-xs rounded-xl px-3 py-1.5 text-[#111827] dark:text-[#f5f5f5] placeholder-[#7f91a4] outline-none transition-colors"
        />
        <button
          type="submit"
          :disabled="!quickText.trim()"
          class="p-1.5 bg-[#3390ec] text-white disabled:opacity-30 rounded-xl hover:bg-[#2481cc] transition-colors shrink-0 cursor-pointer"
          title="Add task"
        >
          <Plus class="w-4 h-4" />
        </button>
      </form>
    </div>

    <!-- Filter Pills -->
    <div class="px-3 py-1.5 flex items-center gap-1 border-b border-[#dfe1e5]/60 dark:border-[#101921] overflow-x-auto no-scrollbar shrink-0 text-xs">
      <button
        @click="todoStore.activeFilter = 'my'"
        class="px-2.5 py-0.5 rounded-lg text-[11px] font-semibold transition-colors cursor-pointer"
        :class="todoStore.activeFilter === 'my' ? 'bg-[#3390ec] text-white' : 'text-[#7f91a4] hover:bg-gray-100 dark:hover:bg-[#202b36]'"
      >
        My ({{ todoStore.myTodos.length }})
      </button>
      <button
        @click="todoStore.activeFilter = 'completed'"
        class="px-2.5 py-0.5 rounded-lg text-[11px] font-semibold transition-colors cursor-pointer"
        :class="todoStore.activeFilter === 'completed' ? 'bg-[#3390ec] text-white' : 'text-[#7f91a4] hover:bg-gray-100 dark:hover:bg-[#202b36]'"
      >
        Done ({{ todoStore.completedTodos.length }})
      </button>
      <button
        @click="todoStore.activeFilter = 'all'"
        class="px-2.5 py-0.5 rounded-lg text-[11px] font-semibold transition-colors cursor-pointer"
        :class="todoStore.activeFilter === 'all' ? 'bg-[#3390ec] text-white' : 'text-[#7f91a4] hover:bg-gray-100 dark:hover:bg-[#202b36]'"
      >
        All
      </button>
    </div>

    <!-- Task Items List -->
    <div class="flex-1 overflow-y-auto p-2 space-y-1.5 tg-scroll-container">
      <!-- Empty state -->
      <div
        v-if="todoStore.filteredTodos.length === 0"
        class="flex flex-col items-center justify-center py-10 text-center text-[#7f91a4] px-4"
      >
        <CheckSquare class="w-8 h-8 text-[#3390ec]/50 mb-2" />
        <p class="text-xs font-semibold text-[#111827] dark:text-[#f5f5f5]">No tasks here</p>
        <p class="text-[11px] mt-0.5">Add a task above to get started</p>
      </div>

      <!-- Todo Item -->
      <div
        v-for="item in todoStore.filteredTodos"
        :key="item.id"
        class="group p-2.5 rounded-xl border transition-all flex items-start gap-2.5"
        :class="[
          item.completed
            ? 'bg-gray-50/50 dark:bg-[#121922]/40 border-transparent opacity-70'
            : 'bg-[#f8f9fa] dark:bg-[#1a2530] border-[#dfe1e5]/70 dark:border-[#202b36] hover:border-[#3390ec]/40'
        ]"
      >
        <!-- Toggle button -->
        <button
          @click="todoStore.toggleComplete(item.id)"
          class="mt-0.5 w-4 h-4 rounded-md flex items-center justify-center transition-colors shrink-0 cursor-pointer border"
          :class="[
            item.completed
              ? 'bg-[#3390ec] border-[#3390ec] text-white'
              : 'border-[#7f91a4]/40 hover:border-[#3390ec] text-transparent'
          ]"
        >
          <Check class="w-3 h-3 stroke-[3]" />
        </button>

        <div class="flex-1 min-w-0">
          <p
            class="text-xs leading-snug break-words"
            :class="[
              item.completed
                ? 'line-through text-[#7f91a4]'
                : 'text-[#111827] dark:text-[#f5f5f5] font-medium'
            ]"
          >
            {{ item.message }}
          </p>

          <!-- Badges -->
          <div class="flex flex-wrap items-center gap-1.5 mt-1">
            <span
              v-if="item.priority === 'high'"
              class="px-1.5 py-0.2 rounded text-[9px] font-bold bg-red-500/15 text-red-500"
            >
              High
            </span>
            <span
              v-else-if="item.priority === 'medium'"
              class="px-1.5 py-0.2 rounded text-[9px] font-bold bg-amber-500/15 text-amber-500"
            >
              Med
            </span>

            <button
              v-if="item.post_id && item.channel_id"
              @click="handleJumpToPost(item)"
              class="text-[9px] text-[#3390ec] hover:underline flex items-center gap-0.5 cursor-pointer"
            >
              <ExternalLink class="w-2.5 h-2.5" />
              <span>Message</span>
            </button>
          </div>
        </div>

        <button
          @click="handleDeleteTodo(item.id)"
          class="opacity-0 group-hover:opacity-100 p-1 text-[#7f91a4] hover:text-red-400 transition-opacity shrink-0 cursor-pointer"
          title="Delete task"
        >
          <Trash2 class="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  </div>
</template>
