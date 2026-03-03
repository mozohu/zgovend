<script setup lang="ts">
import PageHeader from '../../components/PageHeader.vue'
import { useLiff } from '../../composables/useLiff'
const { isAdmin } = useLiff()
</script>

<template>
  <div class="page">
    <PageHeader :crumbs="[{ label: '消費者服務' }]" />
    <nav class="menu">
      <router-link to="/consumer/tickets/new" class="menu-item">📝 問題回報</router-link>
      <router-link to="/consumer/tickets" class="menu-item">📋 我的問題單</router-link>
      <template v-if="isAdmin">
        <router-link to="/consumer/shop" class="menu-item">🛒 線上訂購</router-link>
        <router-link to="/consumer/orders" class="menu-item">📦 我的訂單</router-link>
      </template>
    </nav>
  </div>
</template>


