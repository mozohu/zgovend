<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { gql } from '../../composables/useGraphQL'
import PageHeader from '../../components/PageHeader.vue'
import { useLiff } from '../../composables/useLiff'

const { isAdmin } = useLiff()
const route = useRoute()
const operatorId = route.params.operatorId as string
const operatorName = ref(operatorId)

onMounted(async () => {
  try {
    const data = await gql(`query($code: String!) { operatorByCode(code: $code) { name } }`, { code: operatorId })
    if (data.operatorByCode?.name) operatorName.value = data.operatorByCode.name
  } catch { /* use code as fallback */ }
})
</script>

<template>
  <div class="page">
    <PageHeader :crumbs="[
      { label: '營運管理', to: '/' },
      { label: operatorName },
    ]" />
    <nav class="menu">
      <router-link :to="`/operator/${operatorId}/products`" class="menu-item">📦 商品主檔</router-link>
      <router-link :to="`/operator/${operatorId}/machine-status`" class="menu-item">📡 機台狀態及庫存</router-link>
      <router-link :to="`/operator/${operatorId}/revenue`" class="menu-item">💰 營收與訂單</router-link>
      <router-link :to="`/operator/${operatorId}/events`" class="menu-item">📋 營運事件記錄</router-link>
      <router-link :to="`/operator/${operatorId}/tickets`" class="menu-item">🎫 消費者問題</router-link>
      <router-link v-if="isAdmin" :to="`/operator/${operatorId}/online-orders`" class="menu-item">📦 線上訂單</router-link>
      <router-link :to="`/operator/${operatorId}/preset-stock`" class="menu-item">📋 庫存預約設定</router-link>
    </nav>
  </div>
</template>


