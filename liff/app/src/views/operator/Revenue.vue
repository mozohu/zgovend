<script setup lang="ts">
import { ref, onMounted, computed, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { gql } from '../../composables/useGraphQL'
import { usePaymentMethods } from '../../composables/usePaymentMethods'
import PageHeader from '../../components/PageHeader.vue'
import ExportButtons from '../../components/ExportButtons.vue'

// ECharts tree-shaken imports
import { use } from 'echarts/core'
import { BarChart } from 'echarts/charts'
import { GridComponent, TooltipComponent, DataZoomComponent, LegendComponent } from 'echarts/components'
import { CanvasRenderer } from 'echarts/renderers'
import VChart from 'vue-echarts'

use([CanvasRenderer, BarChart, GridComponent, TooltipComponent, DataZoomComponent, LegendComponent])

const route = useRoute()
const router = useRouter()
const operatorId = route.params.operatorId as string
const operatorName = ref(operatorId)

interface TxSummary {
  txno: string
  deviceId: string
  startedAt: string
  status: string
  productName: string
  price: number
  paymentMethod: string
  dispenseSuccess: boolean | null
  dispenseChannel: string
  dispenseElapsed: number | null
  invoiceNo: string | null
  invoiceRandom: string | null
  refundStatus: string | null
}

interface VmInfo {
  vmid: string
  hidCode: string
  locationName: string
}

const transactions = ref<TxSummary[]>([])
const vmList = ref<VmInfo[]>([])
const vmMap = ref<Map<string, VmInfo>>(new Map())
const loading = ref(true)

// Filters
const selectedDevices = ref<string[]>([])
const dateFrom = ref('')
const dateTo = ref('')

function initDateRange() {
  const now = new Date()
  const y = now.getFullYear()
  const m = String(now.getMonth() + 1).padStart(2, '0')
  const d = String(now.getDate()).padStart(2, '0')
  dateTo.value = `${y}-${m}-${d}`
  // Default: last 30 days
  const from = new Date(now.getTime() - 30 * 86400000)
  const fy = from.getFullYear()
  const fm = String(from.getMonth() + 1).padStart(2, '0')
  const fd = String(from.getDate()).padStart(2, '0')
  dateFrom.value = `${fy}-${fm}-${fd}`
}

async function loadData() {
  loading.value = true
  try {
    // Single init query: operator name + vms + paymentMethods cache
    const [initData] = await Promise.all([
      gql(`query($opId: String!) {
        operatorByCode(code: $opId) { name }
        vms(operatorId: $opId) { vmid hidCode locationName }
      }`, { opId: operatorId }),
      ensurePaymentMethods(),
    ])
    if (initData.operatorByCode?.name) operatorName.value = initData.operatorByCode.name
    vmList.value = initData.vms || []
    const map = new Map<string, VmInfo>()
    for (const vm of vmList.value) {
      if (vm.hidCode) map.set(vm.hidCode, vm)
    }
    vmMap.value = map
    await Promise.all([loadTransactions(), loadDailyRevenue()])
  } catch (e: any) {
    console.error('loadData failed:', e)
  } finally {
    loading.value = false
  }
}

async function loadTransactions() {
  try {
    // Server-side filtering by operator's devices
    const deviceIds = selectedDevices.value.length > 0
      ? selectedDevices.value
      : vmList.value.map(v => v.hidCode).filter(Boolean)
    if (deviceIds.length === 0) { transactions.value = []; return }

    let fromMs = 0
    let toMs = 0
    if (dateFrom.value) fromMs = new Date(dateFrom.value + 'T00:00:00+08:00').getTime()
    if (dateTo.value) toMs = new Date(dateTo.value + 'T23:59:59+08:00').getTime()

    const data = await gql(`query($deviceIds: [String!], $from: Float, $to: Float, $limit: Int) {
      vendTransactionSummaries(deviceIds: $deviceIds, from: $from, to: $to, limit: $limit) {
        txno deviceId startedAt status productName price paymentMethod dispenseSuccess dispenseChannel dispenseElapsed invoiceNo invoiceRandom refundStatus
      }
    }`, { deviceIds, from: fromMs || undefined, to: toMs || undefined, limit: 500 })

    transactions.value = data.vendTransactionSummaries || []
  } catch (e: any) {
    console.error('loadTransactions failed:', e)
  }
}

function vmName(deviceId: string) {
  const vm = vmMap.value.get(deviceId)
  return vm ? vm.vmid : deviceId
}

function parseTs(ts: string): Date {
  if (!ts) return new Date(NaN)
  const n = Number(ts)
  if (!isNaN(n) && n > 1e12) return new Date(n)
  return new Date(ts)
}

function formatTime(ts: string) {
  const d = parseTs(ts)
  if (isNaN(d.getTime())) return '-'
  return d.toLocaleString('zh-TW', {
    timeZone: 'Asia/Taipei',
    month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit',
  })
}

function payResult(tx: TxSummary) {
  // If dispense was attempted (success or fail), payment succeeded
  if (tx.dispenseSuccess !== null) return '✅'
  if (tx.status === 'cancelled') return '❌'
  if (tx.status === 'active') return '⏳'
  // timeout without dispense attempt = payment not completed
  return '-'
}

function dispResult(tx: TxSummary) {
  if (tx.dispenseSuccess === true) return '✅'
  if (tx.dispenseSuccess === false) return '❌'
  return '-'
}

const { map: paymentMethodMap, label: methodLabel, ensure: ensurePaymentMethods } = usePaymentMethods()

function refundLabel(s: string) {
  const map: Record<string, string> = {
    'refunded': '🔄 已退款',
    'refund_pending': '⏳ 退款中',
  }
  return map[s] || s
}

function toggleDevice(hidCode: string) {
  const idx = selectedDevices.value.indexOf(hidCode)
  if (idx >= 0) selectedDevices.value.splice(idx, 1)
  else selectedDevices.value.push(hidCode)
  loadTransactions()
  loadDailyRevenue()
}

function onFilterChange() {
  loadTransactions()
  loadDailyRevenue()
}

const totalRevenue = computed(() =>
  transactions.value
    .filter(t => t.dispenseSuccess)
    .reduce((s, t) => s + (t.price || 0), 0)
)

const successCount = computed(() =>
  transactions.value.filter(t => t.dispenseSuccess).length
)

// Daily revenue chart data (from projector-aggregated daily_stats)
interface MethodCount { method: string; count: number; revenue?: number }
interface DailyPoint { date: string; revenue: number; byMethod?: MethodCount[] }

const dailyRevenue = ref<DailyPoint[]>([])

async function loadDailyRevenue() {
  try {
    // daily_stats stores MQTT deviceId which could be hidCode or vmid
    // Send both vmid and hidCode to cover all cases
    let deviceIds: string[]
    if (selectedDevices.value.length > 0) {
      // selectedDevices contains hidCodes; also include matching vmids
      const selected = new Set(selectedDevices.value)
      deviceIds = [...selectedDevices.value]
      for (const vm of vmList.value) {
        if (selected.has(vm.hidCode) && vm.vmid && !selected.has(vm.vmid)) {
          deviceIds.push(vm.vmid)
        }
      }
    } else {
      deviceIds = vmList.value.flatMap(v => [v.hidCode, v.vmid].filter(Boolean))
    }
    if (deviceIds.length === 0) { dailyRevenue.value = []; return }

    const data = await gql(`query($deviceIds: [String!], $from: String, $to: String) {
      dailyRevenue(deviceIds: $deviceIds, from: $from, to: $to) { date revenue txCount successCount byMethod { method count revenue } }
    }`, { deviceIds, from: dateFrom.value, to: dateTo.value })

    const statsMap = new Map<string, DailyPoint>()
    for (const pt of (data.dailyRevenue || [])) {
      statsMap.set(pt.date, pt)
    }

    // Fill missing dates (use local date arithmetic to avoid UTC shift)
    const result: DailyPoint[] = []
    if (dateFrom.value && dateTo.value) {
      let cur = dateFrom.value // 'YYYY-MM-DD'
      while (cur <= dateTo.value) {
        const existing = statsMap.get(cur)
        result.push(existing || { date: cur, revenue: 0, byMethod: [] })
        // Increment date string by 1 day
        const d = new Date(cur + 'T12:00:00+08:00') // noon to avoid DST edge
        d.setDate(d.getDate() + 1)
        const y = d.getFullYear()
        const m = String(d.getMonth() + 1).padStart(2, '0')
        const dd = String(d.getDate()).padStart(2, '0')
        cur = `${y}-${m}-${dd}`
      }
    }
    dailyRevenue.value = result
  } catch (e: any) {
    console.error('loadDailyRevenue failed:', e)
  }
}

// Method colors
const methodColors: Record<string, string> = {
  'cash': '#4a90d9',
  'creditcard': '#e67e22',
  'linepay': '#00C300',
  'jkopay': '#ff6b6b',
  'isc_test': '#999',
  'isc_admin': '#bbb',
  'isc_anycode': '#8e44ad',
}
function getMethodColor(method: string, idx: number) {
  return methodColors[method] || ['#4a90d9','#e67e22','#2ecc71','#e74c3c','#9b59b6','#f39c12','#1abc9c','#34495e'][idx % 8]
}

// ECharts option — stacked bar by payment method
const chartOption = computed(() => {
  const points = dailyRevenue.value
  if (points.length === 0) return null
  const dates = points.map(p => p.date.slice(5)) // MM-DD
  const showZoom = points.length > 14

  // Collect all methods across all days
  const allMethods = new Set<string>()
  for (const p of points) {
    for (const m of (p.byMethod || [])) allMethods.add(m.method)
  }
  const methods = Array.from(allMethods).sort()

  // If no byMethod data at all, fall back to single series
  const series = methods.length > 0
    ? methods.map((method, idx) => ({
        name: methodLabel(method),
        type: 'bar' as const,
        stack: 'revenue',
        data: points.map(p => {
          const m = (p.byMethod || []).find(x => x.method === method)
          return m ? (m.revenue || 0) : 0
        }),
        itemStyle: { color: getMethodColor(method, idx) },
        barMaxWidth: 24,
      }))
    : [{
        name: '營業額',
        type: 'bar' as const,
        data: points.map(p => p.revenue),
        itemStyle: { color: '#4a90d9' },
        barMaxWidth: 24,
      }]

  return {
    tooltip: {
      trigger: 'axis',
      textStyle: { fontSize: 13 },
    },
    legend: methods.length > 1 ? {
      data: methods.map(m => methodLabel(m)),
      bottom: showZoom ? 30 : 0,
      textStyle: { fontSize: 11 },
      itemWidth: 12,
      itemHeight: 10,
    } : undefined,
    grid: {
      left: 45,
      right: 12,
      top: 10,
      bottom: showZoom ? 80 : (methods.length > 1 ? 50 : 28),
      containLabel: false,
    },
    xAxis: {
      type: 'category',
      data: dates,
      axisTick: { show: false },
      axisLabel: {
        fontSize: 10,
        color: '#999',
        interval: points.length <= 15 ? 0 : Math.floor(points.length / 8),
        rotate: points.length > 20 ? 45 : 0,
      },
      axisLine: { lineStyle: { color: '#eee' } },
    },
    yAxis: {
      type: 'value',
      axisLabel: {
        fontSize: 10,
        color: '#aaa',
        formatter: (v: number) => v >= 1000 ? (v / 1000) + 'k' : String(v),
      },
      splitLine: { lineStyle: { color: '#f5f5f5' } },
      axisLine: { show: false },
    },
    series,
    ...(showZoom ? {
      dataZoom: [{
        type: 'slider',
        start: Math.max(0, 100 - (14 / points.length * 100)),
        end: 100,
        height: 22,
        bottom: methods.length > 1 ? 52 : 4,
        borderColor: '#ddd',
        fillerColor: 'rgba(74,144,217,0.15)',
        handleSize: '60%',
        textStyle: { fontSize: 10 },
      }, {
        type: 'inside',
      }]
    } : {}),
  }
})

onMounted(() => {
  initDateRange()
  loadData()
})
function csvRows() {
  return transactions.value.map(t => [t.txno, t.deviceId, t.productName || '', String(t.price || 0), t.paymentMethod || '', t.dispenseSuccess === true ? '成功' : t.dispenseSuccess === false ? '失敗' : '', t.startedAt ? new Date(t.startedAt).toLocaleString('zh-TW', {timeZone:'Asia/Taipei'}) : ''])
}
const csvHeaders = ['交易號', '設備ID', '商品', '金額', '付款方式', '出貨', '時間']
</script>

<template>
  <div class="page">
    <PageHeader :crumbs="[
      { label: operatorName, to: `/operator/${operatorId}` },
      { label: '營收與訂單' },
    ]" :onRefresh="loadData">
      <ExportButtons filename="revenue" :headers="csvHeaders" :rows="csvRows" />
    </PageHeader>

    <div v-if="loading" class="placeholder">載入中…</div>
    <template v-else>
      <!-- 篩選區 -->
      <div class="filter-section">
        <!-- 日期範圍 -->
        <div class="date-row">
          <label class="date-field">
            <span>起</span>
            <input type="date" v-model="dateFrom" @change="onFilterChange" />
          </label>
          <span class="date-sep">～</span>
          <label class="date-field">
            <span>迄</span>
            <input type="date" v-model="dateTo" @change="onFilterChange" />
          </label>
        </div>
        <!-- 機台多選 -->
        <div class="device-chips" v-if="vmList.length > 0">
          <button
            v-for="vm in vmList"
            :key="vm.hidCode"
            :class="['chip', { active: selectedDevices.includes(vm.hidCode) }]"
            @click="toggleDevice(vm.hidCode)"
          >{{ vm.vmid }}</button>
          <span v-if="selectedDevices.length === 0" class="chip-hint">全部機台</span>
        </div>
      </div>

      <!-- 摘要 -->
      <div class="summary-bar">
        <div class="summary-item">
          <span class="summary-value revenue">${{ totalRevenue }}</span>
          <span class="summary-label">出貨營收</span>
        </div>
        <div class="summary-item">
          <span class="summary-value">{{ transactions.length }}</span>
          <span class="summary-label">交易數</span>
        </div>
        <div class="summary-item">
          <span class="summary-value success">{{ successCount }}</span>
          <span class="summary-label">出貨成功</span>
        </div>
      </div>

      <!-- 每日營業額柱狀圖 (ECharts) -->
      <div v-if="chartOption" class="chart-section">
        <div class="chart-title">每日營業額</div>
        <v-chart :option="chartOption" autoresize class="revenue-chart" />
      </div>

      <div v-if="transactions.length === 0" class="placeholder">尚無交易紀錄</div>

      <ul v-else class="tx-list">
        <li v-for="tx in transactions" :key="tx.txno" class="tx-item" @click="router.push(`/operator/${operatorId}/transaction/${tx.txno}`)">
          <div class="tx-row-main">
            <span class="tx-time">{{ formatTime(tx.startedAt) }}</span>
            <span class="tx-price">${{ tx.price || 0 }}</span>
          </div>
          <div class="tx-row-detail">
            <span class="tx-product">{{ tx.productName || '(未知)' }}</span>
            <span class="tx-method">{{ methodLabel(tx.paymentMethod) }}</span>
          </div>
          <div class="tx-row-status">
            <span>支付 {{ payResult(tx) }}</span>
            <span>出貨 {{ dispResult(tx) }}</span>
            <span v-if="tx.refundStatus" class="tx-refund">{{ refundLabel(tx.refundStatus) }}</span>
            <span v-if="tx.dispenseChannel">貨道 {{ tx.dispenseChannel }}</span>
            <span v-if="tx.dispenseElapsed">{{ tx.dispenseElapsed }}秒</span>
            <span class="tx-device">{{ vmName(tx.deviceId) }}</span>
          </div>
          <div class="tx-row-extra">
            <span class="tx-txno">#{{ tx.txno }}</span>
            <span v-if="tx.invoiceNo" class="tx-invoice">🧾 {{ tx.invoiceNo }}</span>
          </div>
        </li>
      </ul>
    </template>
  </div>
</template>

<style scoped>
.filter-section {
  padding: 10px 16px;
  background: #f8f9fa;
  border-bottom: 1px solid #eee;
}
.date-row {
  display: flex;
  align-items: center;
  gap: 6px;
}
.date-field {
  display: flex;
  align-items: center;
  gap: 4px;
  flex: 1;
}
.date-field span {
  font-size: 13px;
  color: #888;
  white-space: nowrap;
}
.date-field input[type="date"] {
  flex: 1;
  padding: 6px 8px;
  border: 1px solid #ddd;
  border-radius: 6px;
  font-size: 14px;
  background: #fff;
}
.date-sep {
  color: #ccc;
  font-size: 14px;
}
.device-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 8px;
  align-items: center;
}
.chip {
  padding: 4px 12px;
  border: 1px solid #ddd;
  border-radius: 16px;
  background: #fff;
  font-size: 13px;
  cursor: pointer;
}
.chip.active {
  background: #4a90d9;
  color: #fff;
  border-color: #4a90d9;
}
.chip-hint {
  font-size: 12px;
  color: #aaa;
}
.summary-bar {
  display: flex;
  justify-content: space-around;
  padding: 12px 16px;
  border-bottom: 1px solid #eee;
}
.summary-item { display: flex; flex-direction: column; align-items: center; }
.summary-value { font-size: 20px; font-weight: 700; }
.summary-value.revenue { color: #e67e22; }
.summary-value.success { color: #2e7d32; }
.summary-label { font-size: 12px; color: #888; margin-top: 2px; }
.tx-list {
  list-style: none;
  padding: 0;
  margin: 0;
}
.tx-item {
  padding: 10px 16px;
  border-bottom: 1px solid #f0f0f0;
  cursor: pointer;
}
.tx-row-main {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.tx-time { font-size: 13px; color: #888; }
.tx-price { font-size: 16px; font-weight: 600; color: #e67e22; }
.tx-row-detail {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-top: 4px;
}
.tx-product { font-size: 15px; font-weight: 500; }
.tx-method {
  font-size: 13px;
  color: #666;
  background: #f0f0f0;
  padding: 1px 8px;
  border-radius: 4px;
}
.tx-row-status {
  display: flex;
  gap: 10px;
  margin-top: 4px;
  font-size: 12px;
  color: #888;
  flex-wrap: wrap;
}
.tx-device { margin-left: auto; color: #aaa; }
.tx-refund { color: #e74c3c; font-weight: 500; }
.tx-row-extra {
  display: flex;
  justify-content: space-between;
  margin-top: 3px;
  font-size: 11px;
  color: #bbb;
}
.tx-txno { font-family: monospace; }
.tx-invoice { color: #7b1fa2; }

/* ECharts */
.chart-section {
  padding: 12px 16px;
  border-bottom: 1px solid #eee;
}
.chart-title {
  font-size: 14px;
  font-weight: 600;
  color: #333;
  margin-bottom: 4px;
}
.revenue-chart {
  width: 100%;
  height: 220px;
}
</style>
