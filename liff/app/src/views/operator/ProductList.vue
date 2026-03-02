<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { gql } from '../../composables/useGraphQL'
import PageHeader from '../../components/PageHeader.vue'
import ExportButtons from '../../components/ExportButtons.vue'
import { FilterBar, FilterButtonGroup } from '../../components/filters'

const route = useRoute()
const operatorId = route.params.operatorId as string
const operatorName = ref(operatorId)

interface Product {
  id: string
  code: string
  name: string
  price: number
  barcode: string
  imageUrl: string
  status: string
  notes: string
}

const items = ref<Product[]>([])
const loading = ref(true)
const editing = ref<Partial<Product> | null>(null)
const isNew = ref(false)
const saving = ref(false)
const filter = ref<'all' | 'active' | 'inactive'>('all')
const uploading = ref(false)
const dragOver = ref(false)
const fileInput = ref<HTMLInputElement | null>(null)
const brokenEditImg = ref(false)

async function uploadImage(file: File) {
  uploading.value = true
  try {
    const form = new FormData()
    form.append('file', file)
    const res = await fetch('/upload/product-image', { method: 'POST', body: form })
    const json = await res.json()
    if (!res.ok) throw new Error(json.error || 'Upload failed')
    if (editing.value) {
      editing.value.imageUrl = json.url
      brokenEditImg.value = false
    }
  } catch (e: any) {
    alert('圖片上傳失敗：' + e.message)
  } finally {
    uploading.value = false
  }
}

function onDrop(e: DragEvent) {
  dragOver.value = false
  const file = e.dataTransfer?.files?.[0]
  if (file && file.type.startsWith('image/')) uploadImage(file)
}

function onFileSelect(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0]
  if (file) uploadImage(file)
}

async function load() {
  loading.value = true
  try {
    const statusArg = filter.value === 'all' ? '' : `, status: "${filter.value}"`
    const data = await gql(`{ products(operatorId: "${operatorId}"${statusArg}, limit: 500) { id code name price barcode imageUrl status notes } }`)
    items.value = data.products
  } finally {
    loading.value = false
  }
}

function startNew() {
  isNew.value = true
  brokenEditImg.value = false
  editing.value = { code: '', name: '', price: 0, barcode: '', imageUrl: '', status: 'active', notes: '' }
}

function startEdit(item: Product) {
  isNew.value = false
  brokenEditImg.value = false
  editing.value = { ...item }
}

function cancel() { editing.value = null }

async function save() {
  if (!editing.value) return
  saving.value = true
  try {
    if (isNew.value) {
      const { id, ...rest } = editing.value as any
      const input = { ...rest, operatorId, price: Number(rest.price) || 0 }
      await gql(`mutation($input: CreateProductInput!) { createProduct(input: $input) { id } }`, { input })
    } else {
      const { id, code, ...rest } = editing.value as any
      const input = { ...rest, price: Number(rest.price) || 0 }
      delete input.operatorId
      await gql(`mutation($id: ID!, $input: UpdateProductInput!) { updateProduct(id: $id, input: $input) { id } }`, { id, input })
    }
    editing.value = null
    await load()
  } catch (e: any) {
    alert('儲存失敗：' + e.message)
  } finally {
    saving.value = false
  }
}

async function remove(item: Product) {
  if (!confirm(`確定刪除「${item.name}」？`)) return
  try {
    await gql(`mutation($id: ID!) { deleteProduct(id: $id) }`, { id: item.id })
    await load()
  } catch (e: any) {
    alert('刪除失敗：' + e.message)
  }
}

function statusLabel(s: string) {
  return s === 'active' ? '上架' : '下架'
}

function statusClass(s: string) {
  return s === 'active' ? 'status-active' : 'status-inactive'
}

onMounted(async () => {
  try {
    const data = await gql(`query($code: String!) { operatorByCode(code: $code) { name } }`, { code: operatorId })
    if (data.operatorByCode?.name) operatorName.value = data.operatorByCode.name
  } catch {}
  load()
})
function csvRows() {
  return items.value.map(p => [p.code, p.name, String(p.price), p.barcode || '', statusLabel(p.status), p.notes || ''])
}
const csvHeaders = ['編號', '名稱', '售價', '條碼', '狀態', '備註']
</script>

<template>
  <div class="page">
    <PageHeader :crumbs="[
      { label: operatorName, to: `/operator/${operatorId}` },
      { label: '商品主檔' },
    ]" :onRefresh="load">
      <button class="header-action" @click="startNew">＋新增</button>
      <ExportButtons filename="products" :headers="csvHeaders" :rows="csvRows" />
    </PageHeader>

    <!-- 篩選 -->
    <FilterBar :count="items.length">
      <FilterButtonGroup
        v-model="filter"
        :options="[
          { value: 'all', label: '全部' },
          { value: 'active', label: '上架' },
          { value: 'inactive', label: '下架' },
        ]"
        @update:model-value="load()"
      />
    </FilterBar>

    <div v-if="loading" class="placeholder">載入中…</div>
    <div v-else-if="items.length === 0" class="placeholder">尚無商品</div>

    <ul v-else class="product-list">
      <li v-for="item in items" :key="item.id" class="product-item" @click="startEdit(item)">
        <img v-if="item.imageUrl" :src="item.imageUrl" class="product-img" />
        <div v-else class="product-img product-img-placeholder">📦</div>
        <div class="product-info">
          <div class="product-name">{{ item.code }} · {{ item.name }}</div>
          <div class="product-meta">
            <span class="product-price">${{ item.price }}</span>
            <span :class="['product-status', statusClass(item.status)]">{{ statusLabel(item.status) }}</span>
            <span v-if="item.barcode" class="product-barcode">🏷️ {{ item.barcode }}</span>
          </div>
        </div>
        <button class="btn-delete" @click.stop="remove(item)">刪除</button>
      </li>
    </ul>

    <!-- 編輯 modal -->
    <div v-if="editing" class="overlay">
      <div class="modal">
        <button class="modal-close-btn" @click="cancel">✕</button>
        <h2>{{ isNew ? '新增商品' : '編輯商品' }}</h2>
        <div class="form-fields">
          <label class="form-label">
            <span>商品編號 *</span>
            <input v-model="editing.code" :disabled="!isNew" placeholder="例如：001" />
          </label>
          <label class="form-label">
            <span>商品名稱 *</span>
            <input v-model="editing.name" placeholder="商品名稱" />
          </label>
          <label class="form-label">
            <span>售價 *</span>
            <input v-model.number="editing.price" type="number" min="0" placeholder="0" />
          </label>
          <label class="form-label">
            <span>條碼</span>
            <input v-model="editing.barcode" placeholder="barcode（選填）" />
          </label>
          <label class="form-label"><span>商品圖片</span></label>
          <div
            class="img-upload-zone"
            :class="{ 'drag-over': dragOver, uploading }"
            @dragover.prevent="dragOver = true"
            @dragleave="dragOver = false"
            @drop.prevent="onDrop"
            @click="fileInput?.click()"
          >
            <img
              v-if="editing.imageUrl && !brokenEditImg"
              :src="editing.imageUrl"
              class="img-preview"
              @error="brokenEditImg = true"
            />
            <div v-else class="img-placeholder">
              <span class="img-placeholder-icon">📷</span>
              <span class="img-placeholder-text">拖曳圖片或點擊選取</span>
            </div>
            <div v-if="uploading" class="img-uploading">上傳中…</div>
          </div>
          <input ref="fileInput" type="file" accept="image/*" style="display:none" @change="onFileSelect" />
          <label class="form-label">
            <span>狀態</span>
            <select v-model="editing.status">
              <option value="active">上架</option>
              <option value="inactive">下架</option>
            </select>
          </label>
          <label class="form-label">
            <span>備註</span>
            <textarea v-model="editing.notes" rows="2" placeholder="備註"></textarea>
          </label>
        </div>
        <div class="modal-actions">
          <button class="btn-text" @click="cancel">取消</button>
          <button class="btn-primary-sm" :disabled="saving || !editing.code || !editing.name" @click="save">
            {{ saving ? '儲存中…' : '儲存' }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.product-list {
  list-style: none;
  padding: 0;
  margin: 0;
}
.product-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 16px;
  border-bottom: 1px solid #f0f0f0;
  cursor: pointer;
}
.product-item:active {
  background: #f8f8f8;
}
.product-img {
  width: 48px;
  height: 48px;
  border-radius: 8px;
  object-fit: cover;
  flex-shrink: 0;
}
.product-img-placeholder {
  display: flex;
  align-items: center;
  justify-content: center;
  background: #f0f0f0;
  font-size: 24px;
}
.product-info {
  flex: 1;
  min-width: 0;
}
.product-name {
  font-size: 15px;
  font-weight: 500;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.product-meta {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 2px;
  font-size: 13px;
}
.product-price {
  font-weight: 600;
  color: #e67e22;
}
.product-status {
  padding: 1px 6px;
  border-radius: 4px;
  font-size: 12px;
}
.status-active {
  background: #e8f5e9;
  color: #2e7d32;
}
.status-inactive {
  background: #fce4ec;
  color: #c62828;
}
.product-barcode {
  color: #999;
  font-size: 12px;
}
.img-upload-zone {
  position: relative;
  border: 2px dashed #ddd;
  border-radius: 10px;
  min-height: 160px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  overflow: hidden;
  transition: border-color 0.2s, background 0.2s;
  margin-bottom: 8px;
}
.img-upload-zone:hover { border-color: #4a90d9; }
.img-upload-zone.drag-over { border-color: #4a90d9; background: #eef4fb; }
.img-upload-zone.uploading { opacity: 0.6; pointer-events: none; }
.img-preview {
  max-width: 100%;
  max-height: 200px;
  object-fit: contain;
  border-radius: 8px;
}
.img-placeholder {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  color: #aaa;
}
.img-placeholder-icon { font-size: 36px; }
.img-placeholder-text { font-size: 13px; }
.img-uploading {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(255,255,255,0.8);
  font-size: 14px;
  font-weight: 600;
  color: #4a90d9;
}
</style>
