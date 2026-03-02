<script setup lang="ts">
defineProps<{
  from: string
  to: string
}>()

const emit = defineEmits<{
  'update:from': [value: string]
  'update:to': [value: string]
}>()

function onFromChange(e: Event) {
  emit('update:from', (e.target as HTMLInputElement).value)
}
function onToChange(e: Event) {
  emit('update:to', (e.target as HTMLInputElement).value)
}
</script>

<template>
  <div class="fk-date-range">
    <label class="fk-date-field">
      <span>起</span>
      <input type="date" :value="from" @change="onFromChange" />
    </label>
    <span class="fk-date-sep">～</span>
    <label class="fk-date-field">
      <span>迄</span>
      <input type="date" :value="to" @change="onToChange" />
    </label>
  </div>
</template>

<style scoped>
.fk-date-range {
  display: flex;
  align-items: center;
  gap: 6px;
}
.fk-date-field {
  display: flex;
  align-items: center;
  gap: 4px;
  flex: 1;
}
.fk-date-field span {
  font-size: var(--fk-font, 13px);
  color: var(--fk-text-muted, #888);
  white-space: nowrap;
}
.fk-date-field input[type="date"] {
  flex: 1;
  min-width: 0;
  padding: 6px 8px;
  border: 1px solid var(--fk-input-border, #ddd);
  border-radius: var(--fk-radius-box, 8px);
  font-size: 14px;
  background: var(--fk-input-bg, #fff);
  height: var(--fk-height, 36px);
  box-sizing: border-box;
}
.fk-date-field input[type="date"]:focus {
  border-color: var(--fk-active, #667eea);
  outline: none;
}
.fk-date-sep {
  color: #ccc;
  font-size: 14px;
}
</style>
