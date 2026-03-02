<script setup lang="ts">
export interface FilterOption {
  value: string
  label: string
  icon?: string
}

const props = withDefaults(defineProps<{
  modelValue: string
  options: FilterOption[]
  size?: 'sm' | 'md'
}>(), {
  size: 'md',
})

const emit = defineEmits<{
  'update:modelValue': [value: string]
}>()

function select(value: string) {
  emit('update:modelValue', value)
}
</script>

<template>
  <div class="fk-button-group" :class="[`fk-size-${size}`]">
    <button
      v-for="opt in options"
      :key="opt.value"
      :class="['fk-btn', { active: modelValue === opt.value }]"
      @click="select(opt.value)"
    >
      <span v-if="opt.icon" class="fk-btn-icon">{{ opt.icon }}</span>
      {{ opt.label }}
    </button>
  </div>
</template>

<style scoped>
.fk-button-group {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}
.fk-btn {
  padding: 5px 12px;
  border: 1px solid var(--fk-input-border, #ddd);
  border-radius: var(--fk-radius-pill, 16px);
  background: var(--fk-input-bg, #fff);
  font-size: var(--fk-font, 13px);
  color: var(--fk-text, #666);
  cursor: pointer;
  white-space: nowrap;
  transition: all 0.15s;
  line-height: 1.4;
}
.fk-btn.active {
  background: var(--fk-active, #667eea);
  color: var(--fk-active-text, #fff);
  border-color: var(--fk-active, #667eea);
}
.fk-btn:active { opacity: 0.7; }
.fk-btn-icon { margin-right: 2px; }

/* Size variants */
.fk-size-sm .fk-btn {
  padding: 4px 10px;
  font-size: 12px;
}
</style>
