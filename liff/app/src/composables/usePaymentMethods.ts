import { ref } from 'vue'
import { gql } from './useGraphQL'

const cache = ref<Record<string, string>>({})
let loaded = false
let loading: Promise<void> | null = null

export async function ensurePaymentMethods() {
  if (loaded) return cache.value
  if (loading) { await loading; return cache.value }
  loading = (async () => {
    try {
      const data = await gql(`{ paymentMethods { key name } }`)
      const map: Record<string, string> = {}
      for (const pm of (data.paymentMethods || [])) map[pm.key] = pm.name
      cache.value = map
      loaded = true
    } catch { /* fallback to empty */ }
  })()
  await loading
  loading = null
  return cache.value
}

export function usePaymentMethods() {
  return {
    map: cache,
    label: (key: string) => cache.value[key] || key || '-',
    ensure: ensurePaymentMethods,
  }
}
