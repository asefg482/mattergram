import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import router from './router'
import { showAlert } from './stores/alert'

// Local Vazirmatn fonts (offline, no CDN, no Google Fonts)
import '@fontsource/vazirmatn/300.css'
import '@fontsource/vazirmatn/400.css'
import '@fontsource/vazirmatn/500.css'
import '@fontsource/vazirmatn/600.css'
import '@fontsource/vazirmatn/700.css'
import '@fontsource/vazirmatn/800.css'

import './style.css'

const app = createApp(App)
const pinia = createPinia()

app.use(pinia)
app.use(router)

// Globally override native browser alert with custom UI
if (typeof window !== 'undefined') {
  window.alert = (message?: any) => {
    showAlert(String(message ?? ''))
  }
}

app.mount('#app')
