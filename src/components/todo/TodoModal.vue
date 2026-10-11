<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useTodoStore, type TodoItem, type TodoPriority } from '../../stores/todo'
import type { MattermostUser } from '../../types/mattermost'
import { useUiStore } from '../../stores/ui'
import { showConfirm } from '../../stores/alert'
import { useUsersStore } from '../../stores/users'
import { useChatStore } from '../../stores/chat'
import TelegramAvatar from '../common/TelegramAvatar.vue'
import TodoPrioritySelect from './TodoPrioritySelect.vue'
import TodoDatePicker from './TodoDatePicker.vue'
import TodoAssigneeSelect from './TodoAssigneeSelect.vue'
import {
  CheckSquare,
  Square,
  Check,
  X,
  Plus,
  Trash2,
  Edit2,
  Calendar,
  AlertCircle,
  ExternalLink,
  Search,
  Flag,
  User,
  Clock,
  ChevronDown
} from 'lucide-vue-next'

const todoStore = useTodoStore()
const uiStore = useUiStore()
const usersStore = useUsersStore()
const chatStore = useChatStore()

// New Todo form state
const newTodoText = ref('')
const newTodoDescription = ref('')
const newPriority = ref<TodoPriority>('none')
const newDueDate = ref('')
const newAssigneeId = ref('')
const showAdvancedOptions = ref(false)

// Editing state
const editingId = ref<string | null>(null)
const editText = ref('')
const editPriority = ref<TodoPriority>('none')
const editDueDate = ref('')
const editAssigneeId = ref('')

const isAdding = ref(false)

function handleAddTodo() {
  const text = newTodoText.value.trim()
  if (!text) return

  let dueTimestamp: number | null = null
  if (newDueDate.value) {
    dueTimestamp = new Date(newDueDate.value).getTime()
  }

  todoStore.addTodo({
    message: text,
    description: newTodoDescription.value,
    priority: newPriority.value,
    due_date: dueTimestamp,
    assignee_id: newAssigneeId.value || undefined
  })

  // Reset form
  newTodoText.value = ''
  newTodoDescription.value = ''
  newPriority.value = 'none'
  newDueDate.value = ''
  newAssigneeId.value = ''
  showAdvancedOptions.value = false
}

function startEdit(item: TodoItem) {
  editingId.value = item.id
  editText.value = item.message
  editPriority.value = item.priority
  editDueDate.value = item.due_date ? new Date(item.due_date).toISOString().split('T')[0] : ''
  editAssigneeId.value = item.user_id && item.user_id !== todoStore.myId ? item.user_id : ''
}

function saveEdit(id: string) {
  if (!editText.value.trim()) return

  let dueTimestamp: number | null = null
  if (editDueDate.value) {
    dueTimestamp = new Date(editDueDate.value).getTime()
  }

  todoStore.editTodo(id, {
    message: editText.value.trim(),
    priority: editPriority.value,
    due_date: dueTimestamp,
    user_id: editAssigneeId.value || todoStore.myId
  })

  editingId.value = null
}

function cancelEdit() {
  editingId.value = null
}

function closeModal() {
  uiStore.showTodoModal = false
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
    closeModal()
    todoStore.jumpToPost(item.channel_id, item.post_id)
  }
}

// Due date status formatting
function getDueDateStatus(timestamp?: number | null) {
  if (!timestamp) return null
  const now = new Date()
  const due = new Date(timestamp)
  
  // Strip time for day comparison
  const nowDate = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
  const dueDate = new Date(due.getFullYear(), due.getMonth(), due.getDate()).getTime()

  const diffDays = Math.round((dueDate - nowDate) / (1000 * 60 * 60 * 24))

  if (diffDays < 0) {
    return { text: `Overdue (${Math.abs(diffDays)}d)`, isOverdue: true, isToday: false }
  } else if (diffDays === 0) {
    return { text: 'Due today', isOverdue: false, isToday: true }
  } else if (diffDays === 1) {
    return { text: 'Due tomorrow', isOverdue: false, isToday: false }
  } else {
    return {
      text: due.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
      isOverdue: false,
      isToday: false
    }
  }
}

// Progress metrics
const totalCount = computed(() => todoStore.todos.length)
const completedCount = computed(() => todoStore.completedTodos.length)
const progressPercent = computed(() => {
  if (totalCount.value === 0) return 0
  return Math.round((completedCount.value / totalCount.value) * 100)
})

function onKeyDown(e: KeyboardEvent) {
  if (e.key === 'Escape' && uiStore.showTodoModal) {
    closeModal()
  }
}

onMounted(() => {
  window.addEventListener('keydown', onKeyDown)
  todoStore.loadTodos()
})

onUnmounted(() => {
  window.removeEventListener('keydown', onKeyDown)
})
</script>

<template>
  <div
    v-if="uiStore.showTodoModal"
    class="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-150 select-none"
    style="padding-top: calc(0.75rem + env(safe-area-inset-top, 0px)); padding-bottom: calc(0.75rem + env(safe-area-inset-bottom, 0px));"
    @click.self="closeModal"
  >
    <div
      class="bg-white dark:bg-[#17212b] border border-[#dfe1e5] dark:border-[#202b36] rounded-3xl w-full max-w-2xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden"
    >
      <!-- Modal Header -->
      <div class="px-5 py-4 border-b border-[#dfe1e5] dark:border-[#202b36] flex items-center justify-between bg-white dark:bg-[#17212b] shrink-0">
        <div class="flex items-center gap-3">
          <div class="w-10 h-10 rounded-2xl bg-[#3390ec]/15 dark:bg-[#3390ec]/20 flex items-center justify-center text-[#3390ec] shadow-xs">
            <CheckSquare class="w-5 h-5" />
          </div>
          <div>
            <div class="flex items-center gap-2">
              <h2 class="text-base font-bold text-[#111827] dark:text-[#f5f5f5]">
                TODO list
              </h2>
              <span
                v-if="todoStore.pendingCount > 0"
                class="px-2 py-0.5 rounded-full text-[11px] font-bold bg-[#3390ec] text-white"
              >
                {{ todoStore.pendingCount }} pending
              </span>
            </div>
            <p class="text-xs text-[#7f91a4]">
              Mattermost Todo Tasks & Reminders
            </p>
          </div>
        </div>

        <button
          @click="closeModal"
          class="p-2 text-[#7f91a4] hover:text-[#111827] dark:hover:text-[#f5f5f5] hover:bg-[#f1f1f1] dark:hover:bg-[#202b36] rounded-full transition-colors cursor-pointer"
          title="Close (Esc)"
        >
          <X class="w-5 h-5" />
        </button>
      </div>

      <!-- Progress Bar (if tasks exist) -->
      <div v-if="totalCount > 0" class="px-5 pt-3 pb-1 bg-white dark:bg-[#17212b] border-b border-[#dfe1e5]/60 dark:border-[#202b36]/60">
        <div class="flex items-center justify-between text-[11px] font-semibold text-[#7f91a4] mb-1.5">
          <span>{{ completedCount }} of {{ totalCount }} tasks completed</span>
          <span class="text-[#3390ec] font-bold">{{ progressPercent }}%</span>
        </div>
        <div class="w-full h-1.5 bg-[#e4ecf2] dark:bg-[#202b36] rounded-full overflow-hidden">
          <div
            class="h-full bg-[#3390ec] rounded-full transition-all duration-300"
            :style="{ width: `${progressPercent}%` }"
          ></div>
        </div>
      </div>

      <!-- Filter Tabs & Search Bar -->
      <div class="px-5 py-3 border-b border-[#dfe1e5] dark:border-[#202b36] flex flex-wrap items-center justify-between gap-2.5 bg-gray-50/70 dark:bg-[#121922]/70 shrink-0">
        <!-- Tabs -->
        <div class="flex items-center gap-1 bg-white dark:bg-[#17212b] p-1 rounded-xl border border-[#dfe1e5] dark:border-[#202b36]">
          <button
            @click="todoStore.activeFilter = 'my'"
            class="px-3 py-1 text-xs font-semibold rounded-lg transition-colors cursor-pointer flex items-center gap-1.5"
            :class="[
              todoStore.activeFilter === 'my'
                ? 'bg-[#3390ec] text-white shadow-xs'
                : 'text-[#7f91a4] hover:text-[#111827] dark:hover:text-[#f5f5f5]'
            ]"
          >
            <span>My TODOs</span>
            <span
              v-if="todoStore.myTodos.length > 0"
              class="px-1.5 py-0.2 rounded-full text-[10px] font-bold"
              :class="todoStore.activeFilter === 'my' ? 'bg-white/20 text-white' : 'bg-gray-200 dark:bg-[#242f3d] text-[#7f91a4]'"
            >
              {{ todoStore.myTodos.length }}
            </span>
          </button>

          <button
            @click="todoStore.activeFilter = 'sent'"
            class="px-3 py-1 text-xs font-semibold rounded-lg transition-colors cursor-pointer flex items-center gap-1.5"
            :class="[
              todoStore.activeFilter === 'sent'
                ? 'bg-[#3390ec] text-white shadow-xs'
                : 'text-[#7f91a4] hover:text-[#111827] dark:hover:text-[#f5f5f5]'
            ]"
          >
            <span>Sent</span>
            <span
              v-if="todoStore.sentTodos.length > 0"
              class="px-1.5 py-0.2 rounded-full text-[10px] font-bold"
              :class="todoStore.activeFilter === 'sent' ? 'bg-white/20 text-white' : 'bg-gray-200 dark:bg-[#242f3d] text-[#7f91a4]'"
            >
              {{ todoStore.sentTodos.length }}
            </span>
          </button>

          <button
            @click="todoStore.activeFilter = 'completed'"
            class="px-3 py-1 text-xs font-semibold rounded-lg transition-colors cursor-pointer flex items-center gap-1.5"
            :class="[
              todoStore.activeFilter === 'completed'
                ? 'bg-[#3390ec] text-white shadow-xs'
                : 'text-[#7f91a4] hover:text-[#111827] dark:hover:text-[#f5f5f5]'
            ]"
          >
            <span>Completed</span>
            <span
              v-if="todoStore.completedTodos.length > 0"
              class="px-1.5 py-0.2 rounded-full text-[10px] font-bold"
              :class="todoStore.activeFilter === 'completed' ? 'bg-white/20 text-white' : 'bg-gray-200 dark:bg-[#242f3d] text-[#7f91a4]'"
            >
              {{ todoStore.completedTodos.length }}
            </span>
          </button>

          <button
            @click="todoStore.activeFilter = 'all'"
            class="px-3 py-1 text-xs font-semibold rounded-lg transition-colors cursor-pointer"
            :class="[
              todoStore.activeFilter === 'all'
                ? 'bg-[#3390ec] text-white shadow-xs'
                : 'text-[#7f91a4] hover:text-[#111827] dark:hover:text-[#f5f5f5]'
            ]"
          >
            <span>All</span>
          </button>
        </div>

        <!-- Search Bar -->
        <div class="relative flex items-center min-w-[160px] sm:min-w-[200px]">
          <Search class="w-3.5 h-3.5 text-[#7f91a4] absolute left-2.5 pointer-events-none" />
          <input
            v-model="todoStore.searchQuery"
            type="text"
            placeholder="Search tasks..."
            class="w-full bg-white dark:bg-[#17212b] border border-[#dfe1e5] dark:border-[#202b36] rounded-xl pl-8 pr-7 py-1 text-xs text-[#111827] dark:text-[#f5f5f5] placeholder-[#7f91a4] outline-none focus:border-[#3390ec] transition-colors"
          />
          <button
            v-if="todoStore.searchQuery"
            @click="todoStore.searchQuery = ''"
            class="absolute right-2 text-[#7f91a4] hover:text-[#111827] dark:hover:text-white"
          >
            <X class="w-3 h-3" />
          </button>
        </div>
      </div>

      <!-- Add New Task Section -->
      <div class="p-4 border-b border-[#dfe1e5] dark:border-[#202b36] bg-white dark:bg-[#17212b] shrink-0">
        <form @submit.prevent="handleAddTodo" class="space-y-2.5">
          <div class="flex items-center gap-2">
            <input
              v-model="newTodoText"
              type="text"
              placeholder="Add a new task..."
              class="flex-1 bg-[#f4f4f5] dark:bg-[#242f3d] border border-transparent focus:border-[#3390ec] rounded-xl px-3.5 py-2 text-sm text-[#111827] dark:text-[#f5f5f5] placeholder-[#7f91a4] outline-none transition-all"
            />
            <button
              type="submit"
              :disabled="!newTodoText.trim()"
              class="px-4 py-2 bg-[#3390ec] hover:bg-[#2481cc] disabled:opacity-40 disabled:cursor-not-allowed text-white text-xs font-bold rounded-xl transition-all flex items-center gap-1.5 shadow-xs shrink-0 cursor-pointer"
            >
              <Plus class="w-4 h-4" />
              <span>Add</span>
            </button>
          </div>

          <!-- Quick Options Bar -->
          <div class="flex flex-wrap items-center gap-2 text-xs">
            <TodoPrioritySelect v-model="newPriority" />
            <TodoDatePicker v-model="newDueDate" />
            <TodoAssigneeSelect v-model="newAssigneeId" />
          </div>
        </form>
      </div>

      <!-- Tasks List Scroll Area -->
      <div class="flex-1 overflow-y-auto p-4 space-y-2 tg-scroll-container">
        <!-- Empty State -->
        <div
          v-if="todoStore.filteredTodos.length === 0"
          class="flex flex-col items-center justify-center py-12 text-center text-[#7f91a4]"
        >
          <div class="w-14 h-14 rounded-2xl bg-[#3390ec]/10 flex items-center justify-center text-[#3390ec] mb-3 shadow-inner">
            <CheckSquare class="w-7 h-7 stroke-[1.8]" />
          </div>
          <h4 class="text-sm font-bold text-[#111827] dark:text-[#f5f5f5] mb-1">
            {{ todoStore.activeFilter === 'completed' ? 'No completed tasks' : 'No tasks found' }}
          </h4>
          <p class="text-xs max-w-xs">
            {{ todoStore.activeFilter === 'completed' ? 'Tasks you finish will show up here.' : 'Add your first task above, or right-click any chat message to add it to your TODO list!' }}
          </p>
        </div>

        <!-- Task Item -->
        <div
          v-for="item in todoStore.filteredTodos"
          :key="item.id"
          class="group p-3.5 rounded-2xl border transition-all"
          :class="[
            item.completed
              ? 'bg-gray-50/70 dark:bg-[#121922]/50 border-gray-200/60 dark:border-[#202b36]/60 opacity-75'
              : 'bg-white dark:bg-[#1a2530] border-[#dfe1e5] dark:border-[#202b36] hover:border-[#3390ec]/50 shadow-xs'
          ]"
        >
          <!-- Editing Mode -->
          <div v-if="editingId === item.id" class="space-y-2.5">
            <input
              v-model="editText"
              type="text"
              class="w-full bg-[#f4f4f5] dark:bg-[#242f3d] border border-[#3390ec] rounded-xl px-3 py-1.5 text-sm text-[#111827] dark:text-[#f5f5f5] outline-none"
              @keydown.enter="saveEdit(item.id)"
              @keydown.esc="cancelEdit"
            />
            <div class="flex flex-wrap items-center gap-2">
              <TodoPrioritySelect v-model="editPriority" :labelPrefix="false" />
              <TodoDatePicker v-model="editDueDate" />
              <TodoAssigneeSelect v-model="editAssigneeId" />
              <div class="flex-1"></div>
              <button
                @click="saveEdit(item.id)"
                class="px-3 py-1.5 bg-[#3390ec] text-white text-xs font-semibold rounded-xl hover:bg-[#2481cc] cursor-pointer shadow-xs transition-colors"
              >
                Save
              </button>
              <button
                @click="cancelEdit"
                class="px-3 py-1.5 text-xs text-[#7f91a4] hover:text-[#111827] dark:hover:text-white cursor-pointer transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>

          <!-- Normal Display Mode -->
          <div v-else class="flex items-start gap-3">
            <!-- Checkbox Toggle -->
            <button
              @click="todoStore.toggleComplete(item.id)"
              class="mt-0.5 w-5 h-5 rounded-lg flex items-center justify-center transition-colors shrink-0 cursor-pointer border"
              :class="[
                item.completed
                  ? 'bg-[#3390ec] border-[#3390ec] text-white shadow-xs'
                  : 'border-[#7f91a4]/40 hover:border-[#3390ec] text-transparent hover:text-gray-300'
              ]"
              title="Toggle task completion"
            >
              <Check class="w-3.5 h-3.5 stroke-[3]" />
            </button>

            <!-- Task Content -->
            <div class="flex-1 min-w-0">
              <div class="flex items-start justify-between gap-2">
                <p
                  class="text-sm font-medium leading-snug break-words"
                  :class="[
                    item.completed
                      ? 'line-through text-[#7f91a4] dark:text-[#7f91a4]'
                      : 'text-[#111827] dark:text-[#f5f5f5]'
                  ]"
                >
                  {{ item.message }}
                </p>

                <!-- Action Buttons (Hover visible) -->
                <div class="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                  <button
                    @click="startEdit(item)"
                    class="p-1 text-[#7f91a4] hover:text-[#3390ec] rounded-md transition-colors cursor-pointer"
                    title="Edit task"
                  >
                    <Edit2 class="w-3.5 h-3.5" />
                  </button>
                  <button
                    @click="handleDeleteTodo(item.id)"
                    class="p-1 text-[#7f91a4] hover:text-red-400 rounded-md transition-colors cursor-pointer"
                    title="Delete task"
                  >
                    <Trash2 class="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              <!-- Metadata Badges -->
              <div class="flex flex-wrap items-center gap-2 mt-1.5 text-xs">
                <!-- Priority Badge -->
                <span
                  v-if="item.priority === 'high'"
                  class="px-2 py-0.5 rounded-md text-[10px] font-bold bg-red-500/15 text-red-500 flex items-center gap-1"
                >
                  <Flag class="w-2.5 h-2.5" />
                  High
                </span>
                <span
                  v-else-if="item.priority === 'medium'"
                  class="px-2 py-0.5 rounded-md text-[10px] font-bold bg-amber-500/15 text-amber-500 flex items-center gap-1"
                >
                  <Flag class="w-2.5 h-2.5" />
                  Medium
                </span>
                <span
                  v-else-if="item.priority === 'low'"
                  class="px-2 py-0.5 rounded-md text-[10px] font-bold bg-emerald-500/15 text-emerald-500 flex items-center gap-1"
                >
                  <Flag class="w-2.5 h-2.5" />
                  Low
                </span>

                <!-- Due Date Status -->
                <span
                  v-if="getDueDateStatus(item.due_date)"
                  class="px-2 py-0.5 rounded-md text-[10px] font-semibold flex items-center gap-1"
                  :class="[
                    getDueDateStatus(item.due_date)?.isOverdue
                      ? 'bg-red-500/15 text-red-500'
                      : (getDueDateStatus(item.due_date)?.isToday ? 'bg-amber-500/15 text-amber-500' : 'bg-[#3390ec]/15 text-[#3390ec]')
                  ]"
                >
                  <Calendar class="w-2.5 h-2.5" />
                  {{ getDueDateStatus(item.due_date)?.text }}
                </span>

                <!-- Assigned User (if not assigned to me) -->
                <span
                  v-if="item.user_id && item.user_id !== todoStore.myId"
                  class="px-2 py-0.5 rounded-md text-[10px] font-semibold bg-gray-200/70 dark:bg-[#242f3d] text-[#7f91a4] flex items-center gap-1"
                >
                  <User class="w-2.5 h-2.5" />
                  Assigned to: {{ usersStore.getUserDisplayName(item.user_id) }}
                </span>

                <!-- Linked Chat Post Pill -->
                <button
                  v-if="item.post_id && item.channel_id"
                  @click="handleJumpToPost(item)"
                  class="px-2 py-0.5 rounded-md text-[10px] font-semibold bg-[#3390ec]/10 text-[#3390ec] hover:bg-[#3390ec]/20 flex items-center gap-1 transition-colors cursor-pointer group/link"
                  title="Jump to message in chat"
                >
                  <ExternalLink class="w-2.5 h-2.5 group-hover/link:scale-110 transition-transform" />
                  <span>From {{ item.channel_name ? `#${item.channel_name}` : 'Chat' }}</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
