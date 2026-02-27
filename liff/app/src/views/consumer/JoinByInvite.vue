<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { gql } from '../../composables/useGraphQL'
import { useLiff } from '../../composables/useLiff'
import PageHeader from '../../components/PageHeader.vue'

const router = useRouter()
const { refreshRoles } = useLiff()

const code = ref('')
const submitting = ref(false)
const result = ref<{ success: boolean; message: string } | null>(null)

async function submit() {
  const trimmed = code.value.trim()
  if (!trimmed) return
  submitting.value = true
  result.value = null
  try {
    const data = await gql(`mutation($code: String!) {
      redeemInvitation(code: $code) { success message }
    }`, { code: trimmed })
    result.value = data.redeemInvitation
    if (data.redeemInvitation.success) {
      await refreshRoles()
    }
  } catch (e: any) {
    result.value = { success: false, message: e.message || '發生錯誤' }
  } finally {
    submitting.value = false
  }
}

function goHome() {
  router.push('/')
}
</script>

<template>
  <div class="page">
    <PageHeader :crumbs="[{ label: '輸入邀請碼' }]" />

    <div class="form-container">
      <div class="input-group">
        <input
          v-model="code"
          type="text"
          placeholder="貼上邀請碼"
          :disabled="submitting"
          @keyup.enter="submit"
          class="code-input"
        />
      </div>
      <button
        class="btn-primary btn-full"
        :disabled="submitting || !code.trim()"
        @click="submit"
      >
        {{ submitting ? '處理中...' : '加入' }}
      </button>

      <div v-if="result" class="result" :class="{ success: result.success, fail: !result.success }">
        <span v-if="result.success">✅</span>
        <span v-else>❌</span>
        {{ result.message }}
      </div>

      <button v-if="result?.success" class="btn-secondary" @click="goHome">
        回首頁
      </button>
    </div>
  </div>
</template>

<style scoped>
.form-container { padding: 1rem; display: flex; flex-direction: column; align-items: center; gap: 0.75rem; }
.input-group { width: 100%; max-width: 400px; }
.code-input {
  width: 100%; padding: 0.5rem 0.6rem; border: 1px solid #ccc; border-radius: 6px;
  font-size: 0.85rem; font-family: monospace; box-sizing: border-box;
}
.btn-primary { background: #4A90D9; color: #fff; border: none; padding: 0.5rem 1.2rem; border-radius: 6px; cursor: pointer; white-space: nowrap; font-size: 15px; }
.btn-full { width: 100%; max-width: 400px; }
.btn-primary:disabled { opacity: 0.5; cursor: default; }
.btn-secondary { background: #eee; border: none; padding: 0.5rem 1rem; border-radius: 6px; cursor: pointer; }
.result { padding: 0.75rem 1rem; border-radius: 8px; font-size: 0.95rem; width: 100%; max-width: 400px; text-align: center; }
.result.success { background: #d4edda; color: #155724; }
.result.fail { background: #f8d7da; color: #721c24; }
</style>
