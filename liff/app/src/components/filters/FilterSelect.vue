<script setup lang="ts">
export interface SelectOption {
  value: string
  label: string
}

defineProps<{
  modelValue: string
  options: SelectOption[]
  placeholder?: string
}>()

const emit = defineEmits<{
  'update:modelValue': [value: string]
}>()

function onChange(e: Event) {
  emit('update:modelValue', (e.target as HTMLSelectElement).value)
}
</script>

<template>
  <select class="fk-select" :value="modelValue" @change="onChange">
    <option value="">{{ placeholder || '全部' }}</option>
    <option v-for="opt in options" :key="opt.value" :value="opt.value">{{ opt.label }}</option>
  </select>
</template>

<style scoped>
.fk-select {
  flex: 1;
  min-width: 0;
  padding: 8px 10px;
  border: 1px solid var(--fk-input-border, #ddd);
  border-radius: var(--fk-radius-box, 8px);
  font-size: 14px;
  background: var(--fk-input-bg, #fff);
  color: #333;
  outline: none;
  appearance: auto;
  height: var(--fk-height, 36px);
  box-sizing: border-box;
}
.fk-select:focus {
  border-color: var(--fk-active, #667eea);
}
</style>
