<script setup lang="ts">
import { computed, useSlots } from 'vue'

const props = withDefaults(defineProps<{
  count?: number | null
  total?: number | null
  countLabel?: string
  hasFilters?: boolean
}>(), {
  count: null,
  total: null,
  countLabel: '筆',
  hasFilters: false,
})

const emit = defineEmits<{
  clear: []
}>()

const slots = useSlots()

const showFooter = computed(() => {
  return props.count !== null || props.hasFilters
})

const countText = computed(() => {
  if (props.count === null) return ''
  if (props.total !== null && props.total !== props.count) {
    return `${props.count} / ${props.total} ${props.countLabel}`
  }
  return `${props.count} ${props.countLabel}`
})
</script>

<template>
  <div class="fk-bar">
    <div class="fk-bar-controls">
      <slot />
    </div>
    <div v-if="showFooter" class="fk-bar-footer">
      <span class="fk-bar-count">{{ countText }}</span>
      <button v-if="hasFilters" class="fk-bar-clear" @click="emit('clear')">✕ 清除篩選</button>
    </div>
  </div>
</template>

<style scoped>
.fk-bar {
  padding: 10px 16px;
  background: var(--fk-bg, #f8f9fa);
  border-bottom: 1px solid var(--fk-border, #eee);
}
.fk-bar-controls {
  display: flex;
  flex-direction: column;
  gap: var(--fk-gap, 8px);
}
.fk-bar-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-top: 8px;
}
.fk-bar-count {
  font-size: 12px;
  color: var(--fk-text-muted, #999);
}
.fk-bar-clear {
  border: none;
  background: none;
  color: var(--fk-active, #667eea);
  font-size: 12px;
  cursor: pointer;
  padding: 2px 6px;
  font-weight: 500;
}
.fk-bar-clear:hover {
  text-decoration: underline;
}
</style>
