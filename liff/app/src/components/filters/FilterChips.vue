<script setup lang="ts">
export interface ChipOption {
  value: string
  label: string
}

const props = withDefaults(defineProps<{
  modelValue: string[]
  options: ChipOption[]
  emptyLabel?: string
}>(), {
  emptyLabel: '全部',
})

const emit = defineEmits<{
  'update:modelValue': [value: string[]]
}>()

function toggle(value: string) {
  const idx = props.modelValue.indexOf(value)
  if (idx >= 0) {
    emit('update:modelValue', props.modelValue.filter(v => v !== value))
  } else {
    emit('update:modelValue', [...props.modelValue, value])
  }
}

function isActive(value: string) {
  return props.modelValue.length === 0 || props.modelValue.includes(value)
}
</script>

<template>
  <div class="fk-chips">
    <button
      v-for="opt in options"
      :key="opt.value"
      :class="['fk-chip', { active: isActive(opt.value) }]"
      @click="toggle(opt.value)"
    >{{ opt.label }}</button>
    <span v-if="modelValue.length === 0" class="fk-chip-hint">{{ emptyLabel }}</span>
  </div>
</template>

<style scoped>
.fk-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  align-items: center;
}
.fk-chip {
  padding: 4px 12px;
  border: 1px solid var(--fk-input-border, #ddd);
  border-radius: var(--fk-radius-pill, 16px);
  background: var(--fk-input-bg, #fff);
  font-size: var(--fk-font, 13px);
  color: var(--fk-text-muted, #999);
  cursor: pointer;
  transition: all 0.15s;
  line-height: 1.4;
}
.fk-chip.active {
  background: var(--fk-active, #667eea);
  color: var(--fk-active-text, #fff);
  border-color: var(--fk-active, #667eea);
}
.fk-chip:active { opacity: 0.7; }
.fk-chip-hint {
  font-size: 12px;
  color: var(--fk-text-muted, #aaa);
}
</style>
