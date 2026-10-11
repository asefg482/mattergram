<script setup lang="ts">
import ReactionPicker from './ReactionPicker.vue'

const emit = defineEmits<{
  (e: 'select', emoji: string): void
  (e: 'close'): void
}>()
</script>

<template>
  <ReactionPicker
    @select="(emoji) => emit('select', emoji)"
    @close="emit('close')"
  />
</template>
