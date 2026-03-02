<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { gql } from '../../composables/useGraphQL'
import PageHeader from '../../components/PageHeader.vue'
import ExportButtons from '../../components/ExportButtons.vue'
import { FilterBar, FilterSelect, FilterDateRange } from '../../components/filters'

const route = useRoute()
const operatorId = route.params.operatorId as string
const operatorName = ref(operatorId)

const selectedDevice = ref('')
const selectedType = ref('')
const dateFrom = ref('')
const dateTo = ref('')

const events = ref<any[]>([])
const machines = ref<{ vmid: string; hidCode: string; locationName: string }[]>([])
const loading = ref(true)
const hasMore = ref(false)
const PAGE_SIZE = 50
let currentOffset = 0

const EVENT_TYPES = [
  { value: 'boot', label: '🔌 開機', color: '#1565c0' },
  { value: 'door_open', label: '🚪 開門', color: '#e65100' },
  { value: 'door_close', label: '🚪 關門', color: '#2e7d32' },
  { value: 'restock', label: '📦 巡補', color: '#6a1b9a' },
  { value: 'suspend', label: '⛔ 停機', color: '#c62828' },
  { value: 'settle', label: '📊 日結', color: '#00695c' },
  { value: 'config', label: '⚙️ 設定變更', color: '#546e7a' },
]

const typeMap = new Map(EVENT_TYPES.map(t => [t.value, t]))

function typeStyle(type: string) {
  const t = typeMap.get(type)
  return t ? { background: t.color + '18', color: t.color, border: `1px solid ${t.color}40` } : {}
}

function typeLabel(type: string) {
  return typeMap.get(type)?.label || type
}

function formatTime(ts: string) {
  const d = new Date(ts)
  return d.toLocaleString('zh-TW', { timeZone: 'Asia/Taipei', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

function formatDetail(detail: any) {
  if (!detail || Object.keys(detail).length === 0) return ''
  if (detail.act) return detail.act
  if (detail.chid) return `貨道: ${Array.isArray(detail.chid) ? detail.chid.join(', ') : detail.chid}`
  return JSON.stringify(detail)
}

async function loadEvents(append = false) {
  if (!append) { currentOffset = 0; events.value = [] }
  loading.value = true
  try {
    const vars: any = { operatorId, limit: PAGE_SIZE, offset: currentOffset }
    if (selectedDevice.value) vars.deviceId = selectedDevice.value
    if (selectedType.value) vars.types = [selectedType.value]
    if (dateFrom.value) vars.from = new Date(dateFrom.value + 'T00:00:00+08:00').toISOString()
    if (dateTo.value) vars.to = new Date(dateTo.value + 'T23:59:59+08:00').toISOString()

    const data = await gql(`query($operatorId: String!, $deviceId: String, $types: [String], $from: String, $to: String, $limit: Int, $offset: Int) {
      operationalEvents(operatorId: $operatorId, deviceId: $deviceId, types: $types, from: $from, to: $to, limit: $limit, offset: $offset) {
        id deviceId vmid locationName type label event state detail timestamp
      }
    }`, vars)

    const newEvents = data.operationalEvents || []
    if (append) events.value = [...events.value, ...newEvents]
    else events.value = newEvents
    hasMore.value = newEvents.length === PAGE_SIZE
  } catch (e: any) {
    console.error('loadEvents failed:', e)
  } finally {
    loading.value = false
  }
}

function loadMore() { currentOffset += PAGE_SIZE; loadEvents(true) }
function applyFilter() { loadEvents() }
function clearFilters() {
  selectedDevice.value = ''; selectedType.value = ''; dateFrom.value = ''; dateTo.value = ''
  loadEvents()
}

onMounted(async () => {
  try {
    const data = await gql(`query($code: String!, $opId: String!) {
      operatorByCode(code: $code) { name }
      vms(operatorId: $opId, status: "active") { vmid hidCode locationName }
    }`, { code: operatorId, opId: operatorId })
    if (data.operatorByCode?.name) operatorName.value = data.operatorByCode.name
    machines.value = data.vms || []
  } catch {}
  loadEvents()
})

function csvRows() {
  return events.value.map(e => [
    formatTime(e.timestamp), e.vmid || e.deviceId, e.locationName || '', e.label, e.event, e.state || '', formatDetail(e.detail)
  ])
}
const csvHeaders = ['時間', '機台', '位置', '事件', '原始事件', '狀態', '詳情']
</script>

<template>
  <div class="page">
    <PageHeader :crumbs="[
      { label: operatorName, to: `/operator/${operatorId}` },
      { label: '營運事件記錄' },
    ]" :onRefresh="() => loadEvents()">
      <ExportButtons filename="operational-events" :headers="csvHeaders" :rows="csvRows" />
    </PageHeader>

    <FilterBar :has-filters="!!(selectedDevice || selectedType || dateFrom || dateTo)" @clear="clearFilters">
      <div class="fk-row">
        <FilterSelect
          v-model="selectedDevice"
          :options="machines.map(m => ({ value: m.hidCode, label: m.vmid + (m.locationName ? ` (${m.locationName})` : '') }))"
          placeholder="全部機台"
          @update:model-value="applyFilter"
        />
        <FilterSelect
          v-model="selectedType"
          :options="EVENT_TYPES.map(t => ({ value: t.value, label: t.label }))"
          placeholder="全部事件"
          @update:model-value="applyFilter"
        />
      </div>
      <FilterDateRange
        :from="dateFrom"
        :to="dateTo"
        @update:from="dateFrom = $event; applyFilter()"
        @update:to="dateTo = $event; applyFilter()"
      />
    </FilterBar>

    <div v-if="loading && events.length === 0" class="placeholder">載入中…</div>
    <div v-else-if="events.length === 0" class="placeholder">無營運事件記錄</div>

    <ul v-else class="event-list">
      <li v-for="e in events" :key="e.id" class="event-card">
        <div class="ev-header">
          <span class="ev-tag" :style="typeStyle(e.type)">{{ e.label }}</span>
          <span class="ev-time">{{ formatTime(e.timestamp) }}</span>
        </div>
        <div class="ev-machine">
          <span class="ev-vmid">{{ e.vmid || e.deviceId }}</span>
          <span v-if="e.locationName" class="ev-loc">📍 {{ e.locationName }}</span>
        </div>
        <div v-if="formatDetail(e.detail)" class="ev-detail">{{ formatDetail(e.detail) }}</div>
      </li>
    </ul>

    <div v-if="hasMore" class="load-more">
      <button class="btn-more" @click="loadMore" :disabled="loading">
        {{ loading ? '載入中…' : '載入更多' }}
      </button>
    </div>
  </div>
</template>

<style scoped>
.fk-row { display: flex; gap: 8px; }
.event-list { list-style: none; padding: 8px 16px; margin: 0; display: flex; flex-direction: column; gap: 8px; }
.event-card { background: #fff; border: 1px solid #eee; border-radius: 10px; padding: 10px 14px; box-shadow: 0 1px 3px rgba(0,0,0,0.05); }
.ev-header { display: flex; justify-content: space-between; align-items: center; }
.ev-tag { font-size: 13px; font-weight: 600; padding: 2px 8px; border-radius: 6px; }
.ev-time { font-size: 12px; color: #888; }
.ev-machine { margin-top: 4px; display: flex; gap: 10px; align-items: center; }
.ev-vmid { font-size: 14px; font-weight: 500; }
.ev-loc { font-size: 12px; color: #888; }
.ev-detail { margin-top: 4px; font-size: 12px; color: #666; background: #f5f5f5; padding: 4px 8px; border-radius: 4px; }
.load-more { padding: 16px; text-align: center; }
.btn-more { padding: 10px 24px; border: 1px solid #ddd; border-radius: 8px; background: #fff; font-size: 14px; cursor: pointer; }
.btn-more:active { background: #f0f0f0; }
.btn-more:disabled { opacity: 0.5; cursor: not-allowed; }
.placeholder { padding: 40px 16px; text-align: center; color: #999; }
</style>
