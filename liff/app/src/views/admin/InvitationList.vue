<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { gql } from '../../composables/useGraphQL'
import PageHeader from '../../components/PageHeader.vue'

interface OperatorRole { operatorId: string; roles: string[] }
interface Invitation {
  id: string
  code: string
  isAdmin: boolean
  operatorRoles: OperatorRole[]
  usedBy: string | null
  usedByName: string | null
  usedAt: string | null
  createdAt: string
}
interface Operator { code: string; name: string }

const invitations = ref<Invitation[]>([])
const operators = ref<Operator[]>([])
const loading = ref(true)
const creating = ref(false)
const saving = ref(false)

// 新增表單
const showCreate = ref(false)

// 編輯
const editingInv = ref<Invitation | null>(null)
const editAdmin = ref(false)
const editRoles = ref<OperatorRole[]>([])

const OP_ROLE_OPTIONS = [
  { value: 'operator', label: '營運管理' },
  { value: 'replenisher', label: '巡補員' },
]

function opName(code: string) {
  return operators.value.find(o => o.code === code)?.name || code
}

async function load() {
  loading.value = true
  try {
    const data = await gql(`{
      invitations { id code isAdmin operatorRoles { operatorId roles } usedBy usedByName usedAt createdAt }
      operators(limit: 200) { code name }
    }`)
    invitations.value = data.invitations
    operators.value = data.operators
  } catch (e) {
    console.error(e)
  } finally {
    loading.value = false
  }
}

// === Create ===
function openCreate() {
  editAdmin.value = false
  editRoles.value = []
  showCreate.value = true
}

async function doCreate() {
  creating.value = true
  try {
    const cleaned = editRoles.value.filter(or => or.roles.length > 0)
    await gql(`mutation($input: CreateInvitationInput) {
      createInvitation(input: $input) { id }
    }`, { input: { isAdmin: editAdmin.value, operatorRoles: cleaned.map(or => ({ operatorId: or.operatorId, roles: or.roles })) } })
    showCreate.value = false
    await load()
  } catch (e: any) {
    alert(e.message || '建立失敗')
  } finally {
    creating.value = false
  }
}

// === Edit ===
function startEdit(inv: Invitation) {
  if (inv.usedBy) return
  editingInv.value = inv
  editAdmin.value = inv.isAdmin
  editRoles.value = inv.operatorRoles.map(or => ({ operatorId: or.operatorId, roles: [...or.roles] }))
}

function cancelEdit() {
  editingInv.value = null
}

async function saveEdit() {
  if (!editingInv.value) return
  saving.value = true
  try {
    const cleaned = editRoles.value.filter(or => or.roles.length > 0)
    await gql(`mutation($input: UpdateInvitationInput!) {
      updateInvitation(input: $input) { id isAdmin operatorRoles { operatorId roles } }
    }`, {
      input: {
        id: editingInv.value.id,
        isAdmin: editAdmin.value,
        operatorRoles: cleaned.map(or => ({ operatorId: or.operatorId, roles: or.roles })),
      }
    })
    editingInv.value = null
    await load()
  } catch (e: any) {
    alert(e.message || '儲存失敗')
  } finally {
    saving.value = false
  }
}

// === Shared role helpers ===
function addOperator() {
  const assigned = new Set(editRoles.value.map(or => or.operatorId))
  const available = operators.value.find(op => !assigned.has(op.code))
  if (available) {
    editRoles.value.push({ operatorId: available.code, roles: [] })
  }
}

function removeOperator(idx: number) {
  editRoles.value.splice(idx, 1)
}

function toggleRole(orIdx: number, role: string) {
  const or = editRoles.value[orIdx]
  const ri = or.roles.indexOf(role)
  if (ri >= 0) or.roles.splice(ri, 1)
  else or.roles.push(role)
}

function assignedOperatorIds() {
  return new Set(editRoles.value.map(or => or.operatorId))
}

function hasAvailableOperators() {
  const assigned = assignedOperatorIds()
  return operators.value.some(op => !assigned.has(op.code))
}

// === Delete ===
async function doDelete(inv: Invitation) {
  if (!confirm('確定刪除此邀請碼？')) return
  try {
    await gql(`mutation($id: ID!) { deleteInvitation(id: $id) }`, { id: inv.id })
    await load()
  } catch (e: any) {
    alert(e.message || '刪除失敗')
  }
}

const showCodeDialog = ref(false)
const dialogCode = ref('')

function shareCode(code: string) {
  dialogCode.value = code
  showCodeDialog.value = true
}

function fmtTime(iso: string | null) {
  if (!iso) return ''
  return new Date(iso).toLocaleString('zh-TW', { timeZone: 'Asia/Taipei' })
}

function permLabel(inv: Invitation) {
  const parts: string[] = []
  if (inv.isAdmin) parts.push('系統管理')
  for (const or of inv.operatorRoles) {
    const rLabels = or.roles.map(r => OP_ROLE_OPTIONS.find(o => o.value === r)?.label || r).join('+')
    parts.push(`${opName(or.operatorId)}：${rLabels}`)
  }
  return parts.length > 0 ? parts.join('；') : '未設定權限'
}

function permClass(inv: Invitation) {
  if (inv.isAdmin) return 'admin'
  for (const or of inv.operatorRoles) {
    if (or.roles.includes('operator')) return 'operator'
    if (or.roles.includes('replenisher')) return 'replenisher'
  }
  return 'basic'
}

onMounted(load)
</script>

<template>
  <div class="page">
    <PageHeader :crumbs="[
      { label: '系統管理', to: '/admin' },
      { label: '邀請碼管理' },
    ]" />

    <div class="toolbar">
      <button class="btn-primary" @click="openCreate">＋ 新增邀請碼</button>
    </div>

    <!-- 新增 / 編輯 共用 role editor modal -->
    <div v-if="showCreate || editingInv" class="overlay" @click.self="showCreate = false; editingInv = null">
      <div class="modal modal-wide">
        <button class="modal-close-btn" @click="showCreate = false; editingInv = null">✕</button>
        <h2>{{ editingInv ? '編輯權限' : '新增邀請碼' }}</h2>

        <label class="admin-checkbox">
          <input type="checkbox" v-model="editAdmin" />
          <span>系統管理（全域）</span>
        </label>

        <hr class="divider" />

        <p class="section-title">所屬營運商與角色</p>

        <div v-if="editRoles.length === 0" class="placeholder" style="padding: 8px 0; font-size: 14px;">
          尚未指派營運商
        </div>

        <div v-for="(or, idx) in editRoles" :key="idx" class="operator-role-card">
          <div class="or-header">
            <select v-model="or.operatorId" class="or-select">
              <option v-for="op in operators" :key="op.code" :value="op.code"
                :disabled="op.code !== or.operatorId && assignedOperatorIds().has(op.code)">
                {{ op.name }} ({{ op.code }})
              </option>
            </select>
            <button class="btn-delete-sm" @click="removeOperator(idx)" title="移除">✕</button>
          </div>
          <div class="role-checkboxes">
            <label v-for="opt in OP_ROLE_OPTIONS" :key="opt.value" class="role-checkbox">
              <input type="checkbox" :checked="or.roles.includes(opt.value)" @change="toggleRole(idx, opt.value)" />
              <span>{{ opt.label }}</span>
            </label>
          </div>
        </div>

        <button v-if="hasAvailableOperators()" class="btn-add-operator" @click="addOperator">＋ 新增營運商</button>

        <div class="modal-actions">
          <button class="btn-text" @click="showCreate = false; editingInv = null">取消</button>
          <button v-if="editingInv" class="btn-primary-sm" :disabled="saving" @click="saveEdit">
            {{ saving ? '儲存中…' : '儲存' }}
          </button>
          <button v-else class="btn-primary-sm" :disabled="creating" @click="doCreate">
            {{ creating ? '建立中…' : '建立' }}
          </button>
        </div>
      </div>
    </div>

    <!-- 邀請碼複製對話框 -->
    <div v-if="showCodeDialog" class="overlay" @click.self="showCodeDialog = false">
      <div class="code-dialog">
        <p class="code-dialog-title">長按複製邀請碼</p>
        <p class="code-dialog-code" @click.stop>{{ dialogCode }}</p>
        <button class="code-dialog-close" @click="showCodeDialog = false">關閉</button>
      </div>
    </div>

    <div v-if="loading" class="loading">載入中...</div>
    <div v-else-if="invitations.length === 0" class="empty">尚無邀請碼</div>

    <div v-else class="list">
      <div v-for="inv in invitations" :key="inv.id"
        class="card" :class="{ used: inv.usedBy }" @click="startEdit(inv)">
        <div class="card-header">
          <code class="code" :class="{ 'code-used': inv.usedBy }" @click.stop="!inv.usedBy && shareCode(inv.code)" :title="inv.usedBy ? '已使用' : '點擊複製分享'">{{ inv.code }}</code>
          <button class="btn-sm btn-danger" @click.stop="doDelete(inv)">刪除</button>
        </div>
        <div class="card-meta">
          <span class="badge" :class="permClass(inv)">{{ permLabel(inv) }}</span>
        </div>
        <div class="card-footer">
          <span>建立：{{ fmtTime(inv.createdAt) }}</span>
          <span v-if="inv.usedBy" class="used-info">
            ✅ {{ inv.usedByName || inv.usedBy }} · {{ fmtTime(inv.usedAt) }}
          </span>
          <span v-else class="unused-info">⏳ 未使用</span>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.toolbar { padding: 0 1rem; margin-bottom: 1rem; }
.btn-primary { background: #4A90D9; color: #fff; border: none; padding: 0.5rem 1rem; border-radius: 6px; cursor: pointer; width: 100%; font-size: 15px; }
.btn-primary:disabled { opacity: 0.5; cursor: default; }
.btn-sm { background: #eee; border: none; padding: 0.25rem 0.5rem; border-radius: 4px; cursor: pointer; font-size: 0.85rem; }
.btn-danger { background: #e74c3c; color: #fff; }
.loading, .empty { text-align: center; padding: 2rem; color: #888; }
.list { padding: 0 1rem; display: flex; flex-direction: column; gap: 0.75rem; }
.card { background: #fff; border-radius: 8px; padding: 0.75rem; box-shadow: 0 1px 3px rgba(0,0,0,0.1); cursor: pointer; }
.card.used { cursor: default; }
.card-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.4rem; }
.code { font-size: 0.8rem; background: #f5f5f5; padding: 0.2rem 0.5rem; border-radius: 4px; cursor: pointer; word-break: break-all; }
.code.code-used { color: #aaa; cursor: default; }
.card-meta { margin-bottom: 0.4rem; }
.badge { font-size: 0.75rem; padding: 0.15rem 0.5rem; border-radius: 4px; color: #fff; }
.badge.admin { background: #e74c3c; }
.badge.operator { background: #3498db; }
.badge.replenisher { background: #2ecc71; }
.badge.basic { background: #95a5a6; }
.card-footer { font-size: 0.75rem; color: #888; display: flex; flex-direction: column; gap: 0.2rem; }
.used-info { color: #27ae60; }
.unused-info { color: #e67e22; }

/* Modal (same as UserList) */
.overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.4); display: flex; align-items: center; justify-content: center; z-index: 999; }
.modal { background: #fff; border-radius: 12px; padding: 1.25rem; width: 90%; max-width: 360px; position: relative; max-height: 85vh; overflow-y: auto; }
.modal-wide { max-width: 420px; }
.modal-close-btn { position: absolute; top: 12px; right: 12px; background: none; border: none; font-size: 20px; color: #999; cursor: pointer; padding: 4px 8px; line-height: 1; }
.modal-close-btn:active { color: #333; }
.modal h2 { margin: 0 0 1rem; font-size: 18px; }
.modal-actions { display: flex; gap: 0.5rem; margin-top: 1.25rem; justify-content: flex-end; }

.admin-checkbox { display: flex; align-items: center; gap: 8px; padding: 8px 0; font-size: 15px; font-weight: 500; }
.admin-checkbox input[type="checkbox"] { width: 18px; height: 18px; }
.divider { border: none; border-top: 1px solid #eee; margin: 8px 0; }
.section-title { font-size: 13px; color: #888; margin: 4px 0 8px; }
.operator-role-card { background: #f7f7f7; border-radius: 8px; padding: 10px 12px; margin-bottom: 10px; }
.or-header { display: flex; align-items: center; gap: 8px; margin-bottom: 8px; }
.or-select { flex: 1; padding: 6px 8px; border: 1px solid #ddd; border-radius: 6px; font-size: 14px; background: #fff; }
.btn-delete-sm { background: none; border: none; color: #e74c3c; font-size: 18px; cursor: pointer; padding: 4px 8px; border-radius: 4px; }
.btn-add-operator { display: block; width: 100%; padding: 10px; margin-top: 4px; margin-bottom: 12px; border: 2px dashed #ccc; border-radius: 8px; background: none; color: #666; font-size: 14px; cursor: pointer; }
.role-checkboxes { display: flex; gap: 12px; flex-wrap: wrap; }
.role-checkbox { display: flex; align-items: center; gap: 4px; font-size: 14px; cursor: pointer; }
.role-checkbox input[type="checkbox"] { width: 16px; height: 16px; }

.btn-text { background: none; border: none; color: #888; font-size: 14px; cursor: pointer; padding: 6px 12px; }
.btn-primary-sm { background: #4A90D9; color: #fff; border: none; padding: 8px 20px; border-radius: 6px; font-size: 14px; cursor: pointer; }
.btn-primary-sm:disabled { opacity: 0.5; cursor: default; }
.placeholder { color: #999; }

/* Code dialog */
.code-dialog { background: #fff; border-radius: 12px; padding: 1.25rem; width: 90%; max-width: 360px; text-align: center; }
.code-dialog-title { margin: 0 0 12px; font-size: 14px; color: #666; }
.code-dialog-code { margin: 0 0 16px; font-size: 14px; font-family: monospace; color: #333; background: #f5f5f5; padding: 12px; border-radius: 8px; word-break: break-all; user-select: all; -webkit-user-select: all; }
.code-dialog-close { width: 100%; padding: 10px; border: none; background: #f0f0f0; border-radius: 8px; font-size: 14px; color: #666; cursor: pointer; }
</style>
