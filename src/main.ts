import { createApp } from 'vue'
import './style.css'
import App from './App.vue'
import router from './router'
import { ensureHomepageSlidesLoaded } from './composables/useHomepageSlides'
import { useContentProtection } from './composables/useContentProtection'

// Install casual image-copy deterrents (right-click, drag, save shortcuts).
// Note: this cannot block OS-level screenshots — see the composable's header.
useContentProtection()

// Kick the homepage banner fetch off immediately, in parallel with the app
// boot, so the request is already in flight before the Hero component mounts.
void ensureHomepageSlidesLoaded()

createApp(App).use(router).mount('#app')
