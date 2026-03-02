<script setup lang="ts">
import { ref, reactive, computed, onMounted } from 'vue'
import { gql } from '../../composables/useGraphQL'
import PageHeader from '../../components/PageHeader.vue'
import ExportButtons from '../../components/ExportButtons.vue'
import { FilterBar, FilterChips, FilterSearch } from '../../components/filters'

interface OperatorRole {
  operatorId: string
  roles: string[]
}

interface User {
  id: string
  lineUserId: string
  displayName: string
  pictureUrl: string
  isAdmin: boolean
  operatorRoles: OperatorRole[]
  lastLoginAt: string
}

interface Operator {
  code: string
  name: string
}

const users = ref<User[]>([])
const operators = ref<Operator[]>([])
const loading = ref(true)
const editingUser = ref<User | null>(null)
const editAdmin = ref(false)
const editRoles = ref<OperatorRole[]>([])
const saving = ref(false)
const brokenAvatars = reactive(new Set<string>())

function onAvatarError(lineUserId: string) {
  brokenAvatars.add(lineUserId)
}

const OP_ROLE_OPTIONS = [
  { value: 'operator', label: '營運管理' },
  { value: 'replenisher', label: '巡補員' },
]

// Filters
const filterName = ref('')
const filterOperators = ref<string[]>([])
const filterRoles = ref<string[]>([])

const ROLE_FILTER_OPTIONS = [
  { value: 'admin', label: '系統管理' },
  { value: 'operator', label: '營運管理' },
  { value: 'replenisher', label: '巡補員' },
  { value: 'consumer', label: '消費者' },
]

const operatorChipOptions = computed(() =>
  operators.value.map(op => ({ value: op.code, label: op.name || op.code }))
)

const filteredUsers = computed(() => {
  let list = users.value

  // Name search
  if (filterName.value.trim()) {
    const q = filterName.value.trim().toLowerCase()
    list = list.filter(u => u.displayName.toLowerCase().includes(q))
  }

  // Operator filter (multi-select: show users who belong to ANY selected operator)
  if (filterOperators.value.length > 0) {
    const sel = new Set(filterOperators.value)
    list = list.filter(u => u.operatorRoles.some(or => sel.has(or.operatorId)))
  }

  // Role filter (multi-select: show users who have ANY selected role)
  if (filterRoles.value.length > 0) {
    const sel = new Set(filterRoles.value)
    list = list.filter(u => {
      if (sel.has('admin') && u.isAdmin) return true
      if (sel.has('consumer') && !u.isAdmin && u.operatorRoles.length === 0) return true
      return u.operatorRoles.some(or => or.roles.some(r => sel.has(r)))
    })
  }

  return list
})

const hasFilters = computed(() => !!(filterName.value || filterOperators.value.length || filterRoles.value.length))

function clearFilters() {
  filterName.value = ''
  filterOperators.value = []
  filterRoles.value = []
}

async function loadUsers() {
  loading.value = true
  try {
    const data = await gql(`{
      users(limit: 200) {
        id lineUserId displayName pictureUrl isAdmin operatorRoles { operatorId roles } lastLoginAt
      }
      operators(limit: 200) { code name }
    }`)
    users.value = data.users
    operators.value = data.operators
  } catch (e) {
    console.error('loadUsers failed:', e)
  } finally {
    loading.value = false
  }
}

function startEdit(user: User) {
  editingUser.value = user
  editAdmin.value = user.isAdmin
  editRoles.value = user.operatorRoles.map(or => ({
    operatorId: or.operatorId,
    roles: [...or.roles],
  }))
}

function cancelEdit() {
  editingUser.value = null
}

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

async function saveRoles() {
  if (!editingUser.value) return
  saving.value = true
  try {
    const cleaned = editRoles.value.filter(or => or.roles.length > 0)
    const data = await gql(`mutation($input: UpdateUserOperatorRolesInput!) {
      updateUserOperatorRoles(input: $input) { lineUserId isAdmin operatorRoles { operatorId roles } }
    }`, {
      input: {
        lineUserId: editingUser.value.lineUserId,
        isAdmin: editAdmin.value,
        operatorRoles: cleaned.map(or => ({ operatorId: or.operatorId, roles: or.roles })),
      }
    })
    const u = users.value.find(u => u.lineUserId === editingUser.value!.lineUserId)
    if (u && data.updateUserOperatorRoles) {
      u.isAdmin = data.updateUserOperatorRoles.isAdmin
      u.operatorRoles = data.updateUserOperatorRoles.operatorRoles
    }
    editingUser.value = null
  } catch (e: any) {
    console.error('saveRoles failed:', e)
    alert('儲存失敗：' + e.message)
  } finally {
    saving.value = false
  }
}

function opName(code: string) {
  return operators.value.find(o => o.code === code)?.name || code
}

function summaryText(user: User) {
  const parts: string[] = []
  if (user.isAdmin) parts.push('系統管理')
  for (const or of user.operatorRoles) {
    const rLabels = or.roles.map(r => OP_ROLE_OPTIONS.find(o => o.value === r)?.label || r).join('+')
    parts.push(`${opName(or.operatorId)}：${rLabels}`)
  }
  return parts.length > 0 ? parts.join('；') : '消費者'
}

function assignedOperatorIds() {
  return new Set(editRoles.value.map(or => or.operatorId))
}

function hasAvailableOperators() {
  const assigned = assignedOperatorIds()
  return operators.value.some(op => !assigned.has(op.code))
}

function formatTime(ts: string) {
  if (!ts) return '-'
  const d = new Date(Number(ts))
  if (isNaN(d.getTime())) return '-'
  return d.toLocaleString('zh-TW', { timeZone: 'Asia/Taipei' })
}

onMounted(loadUsers)
function csvRows() {
  return users.value.map(u => [u.lineUserId, u.displayName, u.isAdmin ? '是' : '否', summaryText(u), formatTime(u.lastLoginAt)])
}
const csvHeaders = ['LINE ID', '名稱', '管理員', '角色', '最後登入']
</script>

<template>
  <div class="page">
    <PageHeader :crumbs="[
      { label: '系統管理', to: '/admin' },
      { label: '使用者管理' },
    ]" :onRefresh="loadUsers">
      <span class="header-badge">{{ filteredUsers.length }}</span>
      <ExportButtons filename="users" :headers="csvHeaders" :rows="csvRows" />
    </PageHeader>

    <div v-if="loading" class="placeholder">載入中…</div>
    <template v-else-if="users.length > 0">
      <FilterBar
        :count="filteredUsers.length"
        :total="users.length"
        :has-filters="hasFilters"
        @clear="clearFilters"
      >
        <FilterSearch v-model="filterName" placeholder="搜尋名稱…" />
        <FilterChips
          v-if="operators.length > 0"
          v-model="filterOperators"
          :options="operatorChipOptions"
          empty-label="全部營運商"
        />
        <FilterChips
          v-model="filterRoles"
          :options="ROLE_FILTER_OPTIONS"
          empty-label="全部角色"
        />
      </FilterBar>
    </template>
    <div v-else class="placeholder">尚無使用者</div>

    <ul v-if="!loading && filteredUsers.length > 0" class="user-list">
      <li v-for="user in filteredUsers" :key="user.lineUserId" class="user-item" @click="startEdit(user)">
        <img v-if="user.pictureUrl && !brokenAvatars.has(user.lineUserId)" :src="user.pictureUrl" class="avatar" @error="onAvatarError(user.lineUserId)" />
        <div v-else class="avatar avatar-placeholder">👤</div>
        <div class="user-info-col">
          <div class="user-name">{{ user.displayName }}</div>
          <div class="user-roles">{{ summaryText(user) }}</div>
          <div class="user-meta">最後登入：{{ formatTime(user.lastLoginAt) }}</div>
        </div>
        <span class="chevron">›</span>
      </li>
    </ul>

    <!-- 編輯角色 overlay -->
    <div v-if="editingUser" class="overlay">
      <div class="modal modal-wide">
        <button class="modal-close-btn" @click="cancelEdit">✕</button>
        <h2>{{ editingUser.displayName }}</h2>

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
              <input
                type="checkbox"
                :checked="or.roles.includes(opt.value)"
                @change="toggleRole(idx, opt.value)"
              />
              <span>{{ opt.label }}</span>
            </label>
          </div>
        </div>

        <button
          v-if="hasAvailableOperators()"
          class="btn-add-operator"
          @click="addOperator"
        >＋ 新增營運商</button>

        <div class="modal-actions">
          <button class="btn-text" @click="cancelEdit">取消</button>
          <button class="btn-primary-sm" :disabled="saving" @click="saveRoles">
            {{ saving ? '儲存中…' : '儲存' }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.modal-wide { max-width: 420px; }
.admin-checkbox { display: flex; align-items: center; gap: 8px; padding: 8px 0; font-size: 15px; font-weight: 500; }
.admin-checkbox input[type="checkbox"] { width: 18px; height: 18px; }
.divider { border: none; border-top: 1px solid #eee; margin: 8px 0; }
.section-title { font-size: 13px; color: #888; margin: 4px 0 8px; }
.operator-role-card { background: #f7f7f7; border-radius: 8px; padding: 10px 12px; margin-bottom: 10px; }
.or-header { display: flex; align-items: center; gap: 8px; margin-bottom: 8px; }
.or-select { flex: 1; padding: 6px 8px; border: 1px solid #ddd; border-radius: 6px; font-size: 14px; background: #fff; }
.btn-delete-sm { background: none; border: none; color: #e74c3c; font-size: 18px; cursor: pointer; padding: 4px 8px; border-radius: 4px; }
.btn-add-operator { display: block; width: 100%; padding: 10px; margin-top: 4px; margin-bottom: 12px; border: 2px dashed #ccc; border-radius: 8px; background: none; color: #666; font-size: 14px; cursor: pointer; }
</style>
