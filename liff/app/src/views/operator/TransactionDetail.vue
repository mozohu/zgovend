<template>
  <div class="transaction-detail">
    <PageHeader
      :crumbs="[
        { label: operatorName, to: `/operator/${operatorId}` },
        { label: '營收與訂單', to: `/operator/${operatorId}/revenue` },
        { label: '交易詳情' }
      ]"
    >
      <button class="speak-btn" @click="speaking ? stopSpeech() : readTransactionDetail()" :title="speaking ? '停止播報' : '語音播報'" :disabled="speechLoading || loading">
        {{ speechLoading ? '⏳' : speaking ? '⏹️' : '🔊' }}
      </button>
    </PageHeader>

    <div v-if="loading" class="loading">載入中...</div>
    <div v-else-if="error" class="error">{{ error }}</div>
    <div v-else-if="timeline">
      <!-- Transaction Summary Card -->
      <div class="summary-card">
        <div class="summary-row">
          <span class="label">商品</span>
          <span class="value">{{ timeline.transaction.productName || '-' }}</span>
        </div>
        <div class="summary-row">
          <span class="label">金額</span>
          <span class="value">NT$ {{ timeline.transaction.price || 0 }}</span>
        </div>
        <div class="summary-row">
          <span class="label">付款方式</span>
          <span class="value">{{ getPaymentMethodLabel(timeline.transaction.paymentMethod) }}</span>
        </div>
        <!-- 交易狀態（session timeout）顯示在時間軸，不在摘要卡 -->
        <div class="summary-row" v-if="timeline.transaction.dispenseSuccess !== null">
          <span class="label">出貨結果</span>
          <span class="value" :class="timeline.transaction.dispenseSuccess ? 'success' : 'failed'">
            {{ timeline.transaction.dispenseSuccess ? '✅ 成功' : '❌ 失敗' }}
            <template v-if="timeline.transaction.dispenseElapsed"> ({{ timeline.transaction.dispenseElapsed }}秒)</template>
          </span>
        </div>
        <div class="summary-row">
          <span class="label">交易號</span>
          <span class="value mono">{{ timeline.transaction.txno }}</span>
        </div>
        <div class="summary-row" v-if="timeline.transaction.invoiceNo">
          <span class="label">發票號碼</span>
          <span class="value">{{ timeline.transaction.invoiceNo }} ({{ timeline.transaction.invoiceRandom }})</span>
        </div>
        <div class="summary-row" v-if="timeline.transaction.refundStatus">
          <span class="label">退款</span>
          <span class="value" :class="timeline.transaction.refundStatus === 'refunded' ? 'refunded' : 'pending'">
            {{ timeline.transaction.refundStatus === 'refunded' ? '🔄 已退款' : '⏳ 退款中' }}
          </span>
        </div>
      </div>

      <!-- Timeline -->
      <div class="timeline">
        <div 
          v-for="(event, index) in timeline.events" 
          :key="index"
          class="timeline-item"
        >
          <!-- Dot -->
          <div class="timeline-dot-wrapper">
            <div class="timeline-dot" :style="{ backgroundColor: getColor(event.stateMachine) }"></div>
            <div v-if="index < timeline.events.length - 1" class="timeline-line"></div>
          </div>

          <!-- Content -->
          <div class="timeline-content">
            <div class="timeline-time">{{ formatTime(event.receivedAt) }}</div>
            <div class="timeline-event">
              <span class="event-desc">{{ getEventDescription(event) }}</span>
              <span class="state-badge" :style="{ backgroundColor: getColor(event.stateMachine) }">
                {{ event.stateMachine }}
              </span>
            </div>
            <div v-if="event.state" class="timeline-state">狀態: {{ event.state }}</div>
            
            <!-- Elapsed time between events -->
            <div v-if="index < timeline.events.length - 1" class="elapsed">
              {{ getElapsed(event.receivedAt, timeline.events[index + 1].receivedAt) }}
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { useRoute } from 'vue-router'
import { gql } from '../../composables/useGraphQL'
import { usePaymentMethods } from '../../composables/usePaymentMethods'
import PageHeader from '../../components/PageHeader.vue'
import { useSpeech } from '../../composables/useSpeech'

const { speaking, loading: speechLoading, speakLines, stop: stopSpeech } = useSpeech()

function formatNaturalTime(ts: string): string {
  const d = new Date(ts)
  if (isNaN(d.getTime())) return ''
  const now = new Date()
  const todayStr = now.toLocaleDateString('zh-TW', { timeZone: 'Asia/Taipei' })
  const yesterday = new Date(now.getTime() - 86400000)
  const yestStr = yesterday.toLocaleDateString('zh-TW', { timeZone: 'Asia/Taipei' })
  const dStr = d.toLocaleDateString('zh-TW', { timeZone: 'Asia/Taipei' })

  const hour = d.toLocaleString('zh-TW', { timeZone: 'Asia/Taipei', hour: 'numeric', minute: '2-digit', hour12: true })

  if (dStr === todayStr) return `今天${hour}`
  if (dStr === yestStr) return `昨天${hour}`
  const md = d.toLocaleString('zh-TW', { timeZone: 'Asia/Taipei', month: 'long', day: 'numeric' })
  return `${md}${hour}`
}

function readTransactionDetail() {
  const t = timeline.value?.transaction
  const events = timeline.value?.events
  if (!t) return

  const product = t.productName || '未知商品'
  const price = t.price || 0
  const method = pmLabel(t.paymentMethod)
  const timeCtx = formatNaturalTime(t.startedAt)
  const hasPaid = events?.some((e: any) => e.event === 'payment/paid')
  const hasDispense = t.dispenseSuccess !== null
  const isCancelled = t.status === 'cancelled'
  const isTimeout = events?.some((e: any) => e.event?.includes('timeout'))
  const orderChanges = events?.filter((e: any) => e.event === 'order/ordered')?.length || 0

  const lines: string[] = []

  // 開場：自然時間
  if (hasDispense && t.dispenseSuccess) {
    // 成功交易
    let main = `${timeCtx}，客人用${method}買了${product}，${price}元`
    if (t.dispenseElapsed) main += `，${t.dispenseElapsed}秒內出貨成功`
    else main += `，出貨成功`
    lines.push(main + '。')
    if (t.invoiceNo) lines.push(`已開立發票${t.invoiceNo}。`)
  } else if (hasDispense && !t.dispenseSuccess) {
    // 出貨失敗
    let failMsg = `${timeCtx}，客人用${method}付了${price}元買${product}，但機台出貨失敗`
    if (t.dispenseChannel) failMsg += `，貨道${t.dispenseChannel}`
    if (t.dispenseElapsed) failMsg += `，耗時${t.dispenseElapsed}秒`
    lines.push(failMsg + '。')
    if (t.refundStatus === 'refunded') lines.push('已經退款。')
    else if (t.refundStatus === 'refund_pending') lines.push('退款處理中。')
    else lines.push('目前尚未退款，可能需要處理。')
  } else if (hasPaid && !hasDispense) {
    // 已付款但無出貨紀錄（異常）
    lines.push(`${timeCtx}，客人用${method}付了${price}元買${product}，但沒有出貨紀錄，可能需要確認。`)
  } else if (isCancelled || isTimeout) {
    if (price > 0 && t.productName) {
      lines.push(`${timeCtx}，客人選了${product}，但付款${isCancelled ? '取消' : '逾時'}，沒有扣款。`)
    } else {
      lines.push(`${timeCtx}的交易在選購階段就結束了，沒有進入付款。`)
    }
  } else {
    lines.push(`${timeCtx}，交易狀態為${t.status || '未知'}。`)
  }

  // 中途換過商品
  if (orderChanges > 1) {
    lines.push(`過程中客人換過${orderChanges - 1}次商品。`)
  }

  // 全程耗時
  if (events?.length >= 2) {
    const first = events[0]
    const last = events[events.length - 1]
    const totalSec = Math.round((new Date(last.receivedAt).getTime() - new Date(first.receivedAt).getTime()) / 1000)
    if (totalSec > 0) {
      if (totalSec < 60) lines.push(`全程${totalSec}秒。`)
      else lines.push(`全程${Math.floor(totalSec / 60)}分${totalSec % 60}秒。`)
    }
  }

  speakLines(lines)
}

const route = useRoute()
const operatorId = computed(() => route.params.operatorId as string)
const txno = computed(() => route.params.txno as string)

const loading = ref(true)
const error = ref('')
const timeline = ref<any>(null)
const operatorName = ref('營運商')

const { label: pmLabel, ensure: ensurePaymentMethods } = usePaymentMethods()

onMounted(async () => {
  try {
    // Single combined query + paymentMethods cache in parallel
    const [result] = await Promise.all([
      gql(`
        query GetTimeline($txno: String!, $opCode: String!) {
          sessionTimeline(txno: $txno) {
            session { sid deviceId startedAt endedAt status }
            transaction {
              txno sid oid startedAt endedAt status
              productName price paymentMethod
              dispenseSuccess dispenseChannel dispenseElapsed
              invoiceNo invoiceRandom refundStatus
            }
            events { timestamp receivedAt event stateMachine trigger state arg can }
          }
          operatorByCode(code: $opCode) { name }
        }
      `, { txno: txno.value, opCode: operatorId.value }),
      ensurePaymentMethods(),
    ])

    const raw = result.sessionTimeline
    if (raw?.events) {
      raw.events = raw.events.filter((e: any) => e.can !== 0)
    }
    timeline.value = raw
    if (result.operatorByCode?.name) operatorName.value = result.operatorByCode.name
  } catch (e: any) {
    error.value = e.message || '載入失敗'
  } finally {
    loading.value = false
  }
})

const getColor = (stateMachine: string): string => {
  const colors: Record<string, string> = {
    sess: '#0097a7',
    order: '#1976d2',
    payment: '#388e3c',
    dispense: '#e67e22',
    reader: '#888',
    invoice: '#7b1fa2'
  }
  return colors[stateMachine] || '#888'
}

const getEventDescription = (event: any): string => {
  const translations: Record<string, string> = {
    'sess/session_begin': '會話開始',
    'sess/timeout': '會話逾時',
    'order/start': '訂單開始',
    'order/ordered': '商品選擇',
    'payment/hint': '付款資訊',
    'payment/input': '付款輸入',
    'payment/payment_begin': '開始付款',
    'payment/paid': '付款成功',
    'payment/cancelled': '付款取消',
    'payment/timeout': '付款逾時',
    'dispense/start': '出貨開始',
    'dispense/hint': '出貨資訊',
    'dispense/ready': '出貨準備',
    'dispense/prod_dispensed': '出貨完成 ✅',
    'dispense/failed': '出貨失敗 ❌',
    'reader/stop': '讀卡機停止'
  }

  let desc = translations[event.event] || event.event

  // Add arg details for specific events
  if (event.event === 'order/ordered' && event.arg?.p_id) {
    desc += ` (${event.arg.p_id})`
  } else if (event.event === 'payment/hint' && event.arg?.p_name) {
    desc += ` (${event.arg.p_name}, NT$${event.arg.price})`
  } else if (event.event === 'payment/input' && event.arg?.method) {
    desc += ` (${event.arg.method})`
  } else if (event.event === 'dispense/ready' && event.arg?.chid) {
    desc += ` (通道 ${event.arg.chid})`
  } else if (event.event === 'dispense/hint' && event.arg) {
    const details = []
    if (event.arg.lock !== undefined) details.push(`lock:${event.arg.lock}`)
    if (event.arg.elapsed !== undefined) details.push(`${event.arg.elapsed}ms`)
    if (details.length > 0) desc += ` (${details.join(', ')})`
  }

  return desc
}

const formatTime = (isoString: string): string => {
  const date = new Date(isoString)
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  const hours = String(date.getHours()).padStart(2, '0')
  const minutes = String(date.getMinutes()).padStart(2, '0')
  const seconds = String(date.getSeconds()).padStart(2, '0')
  return `${year}/${month}/${day} ${hours}:${minutes}:${seconds}`
}

const getElapsed = (from: string, to: string): string => {
  const diff = new Date(to).getTime() - new Date(from).getTime()
  const seconds = Math.floor(diff / 1000)
  
  if (seconds < 60) {
    return `+${seconds}秒`
  }
  
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  const secs = seconds % 60
  
  return `+${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`
}

const getPaymentMethodLabel = (method: string): string => {
  return pmLabel(method)
}

const getStatusLabel = (status: string): string => {
  const labels: Record<string, string> = {
    completed: '完成',
    failed: '失敗',
    cancelled: '取消',
    pending: '處理中'
  }
  return labels[status] || status || '-'
}

const getStatusClass = (status: string): string => {
  if (status === 'completed') return 'success'
  if (status === 'failed') return 'failed'
  if (status === 'cancelled') return 'cancelled'
  return ''
}
</script>

<style scoped>
.speak-btn {
  background: none; border: 1px solid #ddd; border-radius: 8px;
  padding: 4px 10px; font-size: 18px; cursor: pointer; line-height: 1;
}
.speak-btn:active { background: #f0f0f0; }
.speak-btn:disabled { opacity: 0.4; cursor: not-allowed; }

.transaction-detail {
  padding: 16px;
}

.loading, .error {
  padding: 40px 16px;
  text-align: center;
  color: #666;
}

.error {
  color: #d32f2f;
}

.summary-card {
  background: white;
  border-radius: 8px;
  padding: 16px;
  margin-bottom: 24px;
  box-shadow: 0 2px 4px rgba(0,0,0,0.1);
}

.summary-row {
  display: flex;
  justify-content: space-between;
  padding: 8px 0;
  border-bottom: 1px solid #f0f0f0;
}

.summary-row:last-child {
  border-bottom: none;
}

.summary-row .label {
  color: #666;
  font-size: 14px;
}

.summary-row .value {
  font-weight: 600;
  font-size: 14px;
}

.summary-row .value.success {
  color: #388e3c;
}

.summary-row .value.failed {
  color: #d32f2f;
}

.summary-row .value.cancelled {
  color: #f57c00;
}
.summary-row .value.refunded {
  color: #e74c3c;
}
.summary-row .value.pending {
  color: #f39c12;
}
.summary-row .value.mono {
  font-family: monospace;
  font-size: 13px;
}

.timeline {
  background: white;
  border-radius: 8px;
  padding: 16px;
  box-shadow: 0 2px 4px rgba(0,0,0,0.1);
}

.timeline-item {
  display: flex;
  position: relative;
  padding-bottom: 16px;
}

.timeline-item:last-child {
  padding-bottom: 0;
}

.timeline-dot-wrapper {
  position: relative;
  margin-right: 16px;
  display: flex;
  flex-direction: column;
  align-items: center;
}

.timeline-dot {
  width: 12px;
  height: 12px;
  border-radius: 50%;
  flex-shrink: 0;
  border: 2px solid white;
  box-shadow: 0 0 0 2px currentColor;
}

.timeline-line {
  width: 2px;
  flex: 1;
  background: #e0e0e0;
  margin-top: 4px;
  min-height: 40px;
}

.timeline-content {
  flex: 1;
  padding-bottom: 8px;
}

.timeline-time {
  font-size: 12px;
  color: #999;
  margin-bottom: 4px;
}

.timeline-event {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 4px;
}

.event-desc {
  font-size: 14px;
  font-weight: 500;
  color: #333;
}

.state-badge {
  display: inline-block;
  padding: 2px 8px;
  border-radius: 12px;
  font-size: 11px;
  color: white;
  font-weight: 600;
  text-transform: uppercase;
}

.timeline-state {
  font-size: 12px;
  color: #666;
  margin-top: 4px;
}

.elapsed {
  font-size: 11px;
  color: #999;
  margin-top: 8px;
  font-family: monospace;
}
</style>
