import { createApp } from 'vue'
import App from './App.vue'
import router from './router'
import './style.css'
import './components/filters/filter-tokens.css'

createApp(App).use(router).mount('#app')

// Register service worker for PWA
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/liff/sw.js').catch(() => {})
  })
}
