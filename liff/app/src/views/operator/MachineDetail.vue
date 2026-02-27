<script setup lang="ts">
import { ref, onMounted, computed, watch } from 'vue'
import { useRoute } from 'vue-router'
import { gql } from '../../composables/useGraphQL'
import PageHeader from '../../components/PageHeader.vue'
import { useSpeech } from '../../composables/useSpeech'

const { speaking, loading: speechLoading, speakLines, stop: stopSpeech } = useSpeech()

function readMachineDetail() {
  const lines: string[] = []

  // 狀態
  const stat = statLabel.value?.label || ''
  if (isOnline.value) {
    lines.push(`${vmid}目前在線${stat ? `，${stat}` : ''}。`)
  } else {
    let ago = ''
    if (currentHb.value?.receivedAt) {
      const diffMin = Math.floor((Date.now() - new Date(currentHb.value.receivedAt).getTime()) / 60000)
      if (diffMin < 60) ago = `${diffMin}分鐘前`
      else if (diffMin < 1440) ago = `${Math.floor(diffMin / 60)}小時前`
      else ago = `${Math.floor(diffMin / 1440)}天前`
      lines.push(`${vmid}目前離線，最後心跳是${ago}。`)
    } else {
      lines.push(`${vmid}目前離線，從未收到心跳。`)
    }
  }

  // 錯誤旗標
  if (errFlags.value) {
    lines.push(`注意，機台有異常旗標：${errFlags.value}。`)
  }

  // 溫度
  const latestTemp = tempHistory.value.length > 0 ? tempHistory.value[0]?.temperature : null
  if (latestTemp !== null && latestTemp !== undefined) {
    if (latestTemp >= 15) {
      lines.push(`警告，機台溫度${latestTemp}度，明顯偏高。`)
    } else if (latestTemp >= 11) {
      lines.push(`機台溫度${latestTemp}度，偏高，留意冷卻。`)
    } else {
      lines.push(`機台溫度${latestTemp}度，正常。`)
    }
  }

  // 庫存
  const ss = stockSummary.value
  if (ss) {
    if (ss.pct <= 20) {
      lines.push(`庫存偏低，剩${ss.pct}%，需要補貨。`)
    } else if (ss.pct <= 50) {
      lines.push(`庫存${ss.pct}%，留意補貨。`)
    } else {
      lines.push(`庫存整體${ss.pct}%，充足。`)
    }

    // 空貨道
    const emptyChannels = stockChannels.value.filter((c: any) => c.quantity === 0 && c.max > 0)
    if (emptyChannels.length > 0) {
      if (emptyChannels.length <= 3) {
        const names = emptyChannels.map((c: any) => `貨道${c.chid}的${c.productName}`).join('、')
        lines.push(`${names}已經空了。`)
      } else {
        lines.push(`有${emptyChannels.length}個貨道已空。`)
      }
    }
  }

  speakLines(lines)
}

// ECharts tree-shaken imports
import { use } from 'echarts/core'
import { LineChart, BarChart } from 'echarts/charts'
import { GridComponent, TooltipComponent, DataZoomComponent } from 'echarts/components'
import { CanvasRenderer } from 'echarts/renderers'
import VChart from 'vue-echarts'

use([CanvasRenderer, LineChart, BarChart, GridComponent, TooltipComponent, DataZoomComponent])

const route = useRoute()
const operatorId = route.params.operatorId as string
const vmid = route.params.id as string
const hidCode = (route.query.hid as string) || ''

const operatorName = ref(operatorId)
const loading = ref(true)

// VM info
const vm = ref<any>(null)

// Current heartbeat
const currentHb = ref<any>(null)

// Temperature: raw (for latest reading) + buckets (for chart)
const tempHistory = ref<{ temperature: number | null; receivedAt: string }[]>([])

interface TempBucket {
  bucket: string
  deviceId: string
  avgTemp: number | null
  minTemp: number | null
  maxTemp: number | null
  count: number | null
}
const tempBuckets = ref<TempBucket[]>([])
const tempScale = ref<'day' | 'week' | 'month'>('day')
const tempLoading = ref(false)

const scaleLabels: Record<string, { label: string; granularity: string }> = {
  day:   { label: '本日', granularity: '每 5 分鐘平均' },
  week:  { label: '本週', granularity: '每 30 分鐘平均' },
  month: { label: '本月', granularity: '每 2 小時平均' },
}

// Stock
const stock = ref<any>(null)

// Products (for name lookup)
const products = ref<any[]>([])

const OFFLINE_THRESHOLD_MIN = 10

const isOnline = computed(() => {
  if (!currentHb.value?.receivedAt) return false
  const diffMin = (Date.now() - new Date(currentHb.value.receivedAt).getTime()) / 60000
  return diffMin < OFFLINE_THRESHOLD_MIN
})

const statLabel = computed(() => {
  const stat = currentHb.value?.stat
  if (!stat) return null
  const map: Record<string, { label: string; color: string }> = {
    OPERATION: { label: '銷售中', color: '#2e7d32' },
    ADMIN: { label: '巡補中', color: '#e65100' },
    SUSPEND: { label: '暫停', color: '#c62828' },
    INIT: { label: '啟動中', color: '#757575' },
  }
  return map[stat] || { label: stat, color: '#757575' }
})

const errFlags = computed(() => {
  const flags = currentHb.value?.content
  if (!flags || flags === '') return null
  return flags
})

// Stock channels sorted by chid, enriched with product name
const stockChannels = computed(() => {
  if (!stock.value?.channels) return []
  const productMap = new Map<string, string>()
  for (const p of products.value) {
    productMap.set(p.code, p.name)
  }
  return stock.value.channels
    .map((ch: any) => ({
      ...ch,
      productName: productMap.get(ch.p_id) || ch.p_id,
      pct: ch.max > 0 ? Math.round((ch.quantity / ch.max) * 100) : 0,
    }))
    .sort((a: any, b: any) => a.chid.localeCompare(b.chid))
})

const stockSummary = computed(() => {
  const chs = stockChannels.value
  if (chs.length === 0) return null
  const total = chs.reduce((s: number, c: any) => s + (c.quantity || 0), 0)
  const totalMax = chs.reduce((s: number, c: any) => s + (c.max || 0), 0)
  return { total, totalMax, pct: totalMax > 0 ? Math.round((total / totalMax) * 100) : 0 }
})

function formatHeartbeat(ts: string | null) {
  if (!ts) return '尚無心跳'
  const d = new Date(ts)
  if (isNaN(d.getTime())) return '尚無心跳'
  const now = new Date()
  const diffMin = Math.floor((now.getTime() - d.getTime()) / 60000)
  const timeStr = d.toLocaleString('zh-TW', { timeZone: 'Asia/Taipei', hour: '2-digit', minute: '2-digit' })
  if (diffMin < 1) return `${timeStr}（剛剛）`
  if (diffMin < 60) return `${timeStr}（${diffMin} 分鐘前）`
  const diffH = Math.floor(diffMin / 60)
  if (diffH < 24) return `${timeStr}（${diffH} 小時前）`
  return d.toLocaleString('zh-TW', { timeZone: 'Asia/Taipei' })
}

// Parse bucket string "2026-02-27T14:30" to display label
function bucketLabel(bucket: string, scale: string): string {
  // bucket is already in Asia/Taipei time
  const [datePart, timePart] = bucket.split('T')
  const [, mm, dd] = datePart.split('-')
  if (scale === 'day') return timePart  // "14:30"
  if (scale === 'week') return `${mm}/${dd} ${timePart}`  // "02/27 14:30"
  return `${mm}/${dd}`  // "02/27"
}

// ECharts option for temperature buckets
const chartOption = computed(() => {
  const points = tempBuckets.value.filter(p => p.avgTemp !== null)
  if (points.length === 0) return null

  const scale = tempScale.value
  const labels = points.map(p => bucketLabel(p.bucket, scale))
  const avgData = points.map(p => p.avgTemp)
  const minData = points.map(p => p.minTemp)
  const maxData = points.map(p => p.maxTemp)

  return {
    tooltip: {
      trigger: 'axis',
      formatter: (params: any) => {
        const idx = params[0]?.dataIndex
        if (idx === undefined) return ''
        const p = points[idx]
        const label = bucketLabel(p.bucket, scale)
        return `<b>${label}</b><br/>` +
          `平均 ${p.avgTemp}°C<br/>` +
          `最低 ${p.minTemp}°C ▼<br/>` +
          `最高 ${p.maxTemp}°C ▲<br/>` +
          `<span style="color:#aaa">(${p.count} 筆原始資料)</span>`
      },
      textStyle: { fontSize: 13 },
    },
    grid: {
      left: 40,
      right: 12,
      top: 10,
      bottom: points.length > 72 ? 56 : 28,
      containLabel: false,
    },
    xAxis: {
      type: 'category',
      data: labels,
      axisTick: { show: false },
      axisLabel: {
        fontSize: 10,
        color: '#999',
        interval: Math.max(Math.floor(points.length / 6) - 1, 0),
        rotate: points.length > 20 ? 45 : 0,
      },
      axisLine: { lineStyle: { color: '#eee' } },
    },
    yAxis: {
      type: 'value',
      axisLabel: { fontSize: 10, color: '#aaa', formatter: '{value}°C' },
      axisLine: { show: false },
      splitLine: { lineStyle: { color: '#f0f0f0' } },
    },
    dataZoom: [{
      type: 'slider',
      start: points.length <= 72 ? 0 : Math.max(0, 100 - (72 / points.length) * 100),
      end: 100,
      height: 20,
      bottom: 6,
    }],
    series: [
      // min/max 範圍帶：底層 min（透明），上層 max-min 差值（藍色半透明）
      {
        name: '最低',
        type: 'line',
        data: minData,
        smooth: true,
        symbol: 'none',
        lineStyle: { opacity: 0 },
        areaStyle: { opacity: 0 },
        stack: 'range',
        z: 1,
      },
      {
        name: '溫度範圍',
        type: 'line',
        data: points.map(p => ((p.maxTemp ?? 0) - (p.minTemp ?? 0))),
        smooth: true,
        symbol: 'none',
        lineStyle: { opacity: 0 },
        areaStyle: { color: 'rgba(74,144,217,0.15)' },
        stack: 'range',
        z: 1,
      },
      // 平均溫度折線
      {
        name: '平均',
        type: 'line',
        data: avgData,
        smooth: true,
        symbol: points.length > 100 ? 'none' : 'circle',
        symbolSize: 4,
        lineStyle: { color: '#4a90d9', width: 2 },
        itemStyle: { color: '#4a90d9' },
        z: 2,
      },
    ],
  }
})

// Resolve deviceId (hidCode may come from query or vm lookup)
function resolvedDeviceId(): string {
  return hidCode || vm.value?.hidCode || ''
}

async function loadTempBuckets() {
  const deviceId = resolvedDeviceId()
  if (!deviceId) { tempBuckets.value = []; return }
  tempLoading.value = true
  try {
    const data = await gql(`query($deviceId: String!, $scale: String!) {
      tempBuckets(deviceId: $deviceId, scale: $scale) { bucket deviceId avgTemp minTemp maxTemp count }
    }`, { deviceId, scale: tempScale.value })
    tempBuckets.value = data.tempBuckets || []
  } catch (e: any) {
    console.error('loadTempBuckets failed:', e)
  } finally {
    tempLoading.value = false
  }
}

async function switchTempScale(scale: 'day' | 'week' | 'month') {
  tempScale.value = scale
  await loadTempBuckets()
}

async function loadDetail() {
  loading.value = true
  try {
    const deviceId = hidCode
    if (!deviceId) {
      const vmData = await gql(`query($vmid: String!) { vmByVmid(vmid: $vmid) { vmid hidCode locationName operatorId } }`, { vmid })
      vm.value = vmData.vmByVmid
      if (vm.value?.hidCode) {
        await Promise.all([loadHeartbeatData(vm.value.hidCode), loadTempBuckets()])
      }
    } else {
      const [data] = await Promise.all([
        gql(`query($vmid: String!, $deviceId: String!, $limit: Int, $opId: String) {
          vmByVmid(vmid: $vmid) { vmid hidCode locationName operatorId }
          heartbeat(deviceId: $deviceId) { deviceId status content payload receivedAt }
          tempHistory(deviceId: $deviceId, limit: $limit) { temperature receivedAt }
          stock(deviceId: $deviceId) { deviceId channels { chid p_id quantity max } updatedAt }
          products(operatorId: $opId, status: "active") { code name }
        }`, { vmid, deviceId, limit: 1, opId: operatorId }),
        loadTempBuckets(),
      ])

      vm.value = data.vmByVmid
      currentHb.value = data.heartbeat
      tempHistory.value = data.tempHistory || []
      stock.value = data.stock
      products.value = data.products || []
    }
  } catch (e: any) {
    console.error('loadDetail failed:', e)
  } finally {
    loading.value = false
  }
}

async function loadHeartbeatData(deviceId: string) {
  const data = await gql(`query($deviceId: String!, $limit: Int) {
    heartbeat(deviceId: $deviceId) { deviceId status content payload receivedAt }
    tempHistory(deviceId: $deviceId, limit: $limit) { temperature receivedAt }
    stock(deviceId: $deviceId) { deviceId channels { chid p_id quantity max } updatedAt }
  }`, { deviceId, limit: 1 })
  currentHb.value = data.heartbeat
  tempHistory.value = data.tempHistory || []
  stock.value = data.stock
}

onMounted(async () => {
  try {
    const data = await gql(`query($code: String!) { operatorByCode(code: $code) { name } }`, { code: operatorId })
    if (data.operatorByCode?.name) operatorName.value = data.operatorByCode.name
  } catch {}
  loadDetail()
})
</script>

<template>
  <div class="page">
    <PageHeader :crumbs="[
      { label: operatorName, to: `/operator/${operatorId}` },
      { label: '機台狀態及庫存', to: `/operator/${operatorId}/machine-status` },
      { label: vmid },
    ]" :onRefresh="loadDetail">
      <button class="speak-btn" @click="speaking ? stopSpeech() : readMachineDetail()" :title="speaking ? '停止播報' : '語音摘要'" :disabled="speechLoading || loading">
        {{ speechLoading ? '⏳' : speaking ? '⏹️' : '🔊' }}
      </button>
    </PageHeader>

    <div v-if="loading" class="placeholder">載入中…</div>
    <template v-else>
      <!-- 狀態卡片 -->
      <div class="status-card">
        <div class="sc-row">
          <span class="sc-online" :class="{ online: isOnline, offline: !isOnline }">
            {{ isOnline ? '● 在線' : '● 離線' }}
          </span>
          <span v-if="statLabel" class="sc-stat-badge" :style="{ background: statLabel.color }">
            {{ statLabel.label }}
          </span>
        </div>

        <div class="sc-row sc-sub">
          <span>💓 {{ formatHeartbeat(currentHb?.receivedAt) }}</span>
        </div>

        <div v-if="tempHistory.length > 0 && tempHistory[0]?.temperature != null" class="sc-row sc-sub">
          <span>🌡️ {{ tempHistory[0].temperature }}°C</span>
        </div>

        <div v-if="vm?.locationName" class="sc-row sc-sub">
          <span>📍 {{ vm.locationName }}</span>
        </div>

        <div v-if="errFlags" class="sc-row sc-err">
          <span>⚠️ {{ errFlags }}</span>
        </div>
      </div>

      <!-- 溫度歷史圖表 -->
      <div class="chart-section">
        <h3 class="section-title">溫度歷史</h3>
        <!-- 尺度切換 -->
        <div class="scale-tabs">
          <button
            v-for="s in (['day', 'week', 'month'] as const)"
            :key="s"
            :class="['scale-tab', { active: tempScale === s }]"
            @click="switchTempScale(s)"
            :disabled="tempLoading"
          >{{ scaleLabels[s].label }}</button>
          <span class="scale-granularity">{{ scaleLabels[tempScale].granularity }}</span>
        </div>
        <div v-if="tempLoading" class="placeholder">載入中…</div>
        <div v-else-if="chartOption" class="chart-wrap">
          <VChart :option="chartOption" autoresize style="height: 240px;" />
        </div>
        <div v-else class="placeholder">尚無溫度資料</div>
      </div>

      <!-- 庫存 -->
      <div class="chart-section" v-if="stockChannels.length > 0">
        <h3 class="section-title">
          庫存
          <span v-if="stockSummary" class="stock-summary">
            {{ stockSummary.total }} / {{ stockSummary.totalMax }}（{{ stockSummary.pct }}%）
          </span>
        </h3>
        <div class="stock-list">
          <div v-for="ch in stockChannels" :key="ch.chid" class="stock-item">
            <div class="stock-info">
              <span class="stock-chid">{{ ch.chid }}</span>
              <span class="stock-name">{{ ch.productName }}</span>
              <span class="stock-qty">{{ ch.quantity }} / {{ ch.max }}</span>
            </div>
            <div class="stock-bar-track">
              <div
                class="stock-bar-fill"
                :style="{ width: ch.pct + '%', background: ch.pct <= 20 ? '#c62828' : ch.pct <= 50 ? '#e65100' : '#2e7d32' }"
              ></div>
            </div>
          </div>
        </div>
      </div>
    </template>
  </div>
</template>

<style scoped>
.speak-btn {
  background: none; border: 1px solid #ddd; border-radius: 8px;
  padding: 4px 10px; font-size: 18px; cursor: pointer; line-height: 1;
}
.speak-btn:active { background: #f0f0f0; }
.speak-btn:disabled { opacity: 0.4; cursor: not-allowed; }

.status-card {
  margin: 12px 16px;
  background: #fff;
  border: 1px solid #eee;
  border-radius: 10px;
  padding: 14px 16px;
  box-shadow: 0 1px 3px rgba(0,0,0,0.05);
}
.sc-row {
  display: flex;
  align-items: center;
  gap: 10px;
}
.sc-row.sc-sub {
  margin-top: 8px;
  font-size: 13px;
  color: #666;
}
.sc-row.sc-err {
  margin-top: 8px;
  font-size: 13px;
  color: #c62828;
}
.sc-online {
  font-size: 15px;
  font-weight: 600;
}
.sc-online.online { color: #2e7d32; }
.sc-online.offline { color: #c62828; }
.sc-stat-badge {
  display: inline-block;
  padding: 2px 10px;
  border-radius: 12px;
  color: #fff;
  font-size: 13px;
  font-weight: 600;
}
.chart-section {
  margin: 16px 16px 24px;
}
.section-title {
  font-size: 15px;
  font-weight: 600;
  margin: 0 0 10px 0;
  color: #333;
  display: flex;
  align-items: center;
  gap: 8px;
}
.stock-summary {
  font-size: 13px;
  font-weight: 400;
  color: #888;
}
.chart-wrap {
  background: #fff;
  border: 1px solid #eee;
  border-radius: 10px;
  padding: 12px 8px;
  box-shadow: 0 1px 3px rgba(0,0,0,0.05);
}

/* Scale tabs */
.scale-tabs {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 10px;
}
.scale-tab {
  padding: 4px 14px;
  border: 1px solid #ddd;
  border-radius: 16px;
  background: #fff;
  font-size: 13px;
  cursor: pointer;
  transition: all 0.15s;
}
.scale-tab.active {
  background: #4a90d9;
  color: #fff;
  border-color: #4a90d9;
}
.scale-tab:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.scale-granularity {
  font-size: 12px;
  color: #aaa;
  margin-left: 4px;
}

/* Stock */
.stock-list {
  background: #fff;
  border: 1px solid #eee;
  border-radius: 10px;
  padding: 10px 14px;
  box-shadow: 0 1px 3px rgba(0,0,0,0.05);
}
.stock-item {
  padding: 6px 0;
}
.stock-item + .stock-item {
  border-top: 1px solid #f5f5f5;
}
.stock-info {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  margin-bottom: 4px;
}
.stock-chid {
  color: #999;
  font-family: monospace;
  min-width: 32px;
}
.stock-name {
  flex: 1;
  color: #333;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.stock-qty {
  color: #666;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}
.stock-bar-track {
  height: 6px;
  background: #f0f0f0;
  border-radius: 3px;
  overflow: hidden;
}
.stock-bar-fill {
  height: 100%;
  border-radius: 3px;
  transition: width 0.3s;
}
</style>
