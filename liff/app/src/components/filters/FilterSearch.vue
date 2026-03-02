<script setup lang="ts">
import { ref, watch } from 'vue'

const props = withDefaults(defineProps<{
  modelValue: string
  placeholder?: string
  debounceMs?: number
}>(), {
  placeholder: '搜尋…',
  debounceMs: 0,
})

const emit = defineEmits<{
  'update:modelValue': [value: string]
}>()

const internal = ref(props.modelValue)
let timer: ReturnType<typeof setTimeout> | null = null

watch(() => props.modelValue, v => { internal.value = v })

function onInput(e: Event) {
  const val = (e.target as HTMLInputElement).value
  internal.value = val
  if (props.debounceMs > 0) {
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => emit('update:modelValue', val), props.debounceMs)
  } else {
    emit('update:modelValue', val)
  }
}

function clear() {
  internal.value = ''
  if (timer) clearTimeout(timer)
  emit('update:modelValue', '')
}
</script>

<template>
  <div class="fk-search">
    <span class="fk-search-icon">🔍</span>
    <input
      type="text"
      class="fk-search-input"
      :value="internal"
      :placeholder="placeholder"
      @input="onInput"
    />
    <button v-if="internal" class="fk-search-clear" @click="clear">✕</button>
  </div>
</template>

<style scoped>
.fk-search {
  position: relative;
  display: flex;
  align-items: center;
}
.fk-search-icon {
  position: absolute;
  left: 10px;
  font-size: 13px;
  pointer-events: none;
  opacity: 0.5;
}
.fk-search-input {
  width: 100%;
  box-sizing: border-box;
  padding: 8px 32px 8px 32px;
  border: 1px solid var(--fk-input-border, #ddd);
  border-radius: var(--fk-radius-box, 8px);
  font-size: 14px;
  background: var(--fk-input-bg, #fff);
  outline: none;
  height: var(--fk-height, 36px);
}
.fk-search-input:focus {
  border-color: var(--fk-active, #667eea);
}
.fk-search-input::placeholder {
  color: #bbb;
}
.fk-search-clear {
  position: absolute;
  right: 6px;
  border: none;
  background: none;
  color: var(--fk-text-muted, #999);
  font-size: 14px;
  cursor: pointer;
  padding: 4px 6px;
  line-height: 1;
}
.fk-search-clear:hover {
  color: var(--fk-text, #666);
}
</style>
