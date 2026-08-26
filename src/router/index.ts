import { createRouter, createWebHistory } from 'vue-router'
import HomeView from '../views/HomeView.vue'
import InternalProductDetailView from '../views/InternalProductDetailView.vue'
import { useAuth } from '../composables/useAuth'
import { clearProductJsonLd, setPageMeta } from '../composables/useSeo'

const CHUNK_RELOAD_FLAG = 'osiyan:chunk-reload-attempted'

const router = createRouter({
  history: createWebHistory(),
  scrollBehavior(to) {
    // Services page scrolls to #sections itself after paint (avoids races with lazy route + sticky layout).
    if (to.path === '/services' && to.hash) {
      return false
    }
    if (to.hash) {
      return { el: to.hash, behavior: 'smooth' }
    }
    return { top: 0 }
  },
  routes: [
    { path: '/', name: 'home', component: HomeView },
    { path: '/collections', name: 'collections', component: () => import('../views/AllCollectionsView.vue'), meta: { title: 'Collections', description: 'Explore Kiana collections — gold and silver rings, earrings, pendants, bracelets and necklaces, handcrafted in Jaipur.' } },
    { path: '/collections/:slug', name: 'collection', component: () => import('../views/CollectionView.vue') },
    { path: '/product/:slug', name: 'product', component: () => import('../views/ProductDetailView.vue') },
    { path: '/cart', name: 'cart', component: () => import('../views/CartView.vue'), meta: { title: 'Cart', noindex: true } },
    { path: '/wishlist', name: 'wishlist', component: () => import('../views/WishlistView.vue'), meta: { title: 'Wishlist', noindex: true } },
    { path: '/orders', name: 'orders', component: () => import('../views/MyOrdersView.vue'), meta: { title: 'My Orders', noindex: true } },
    { path: '/memos', name: 'memos', component: () => import('../views/MyMemosView.vue'), meta: { title: 'My Memos', noindex: true } },
    { path: '/memos/:id', name: 'memo-detail', component: () => import('../views/MemoDetailView.vue'), meta: { title: 'Memo', noindex: true } },
    { path: '/checkout', name: 'checkout', component: () => import('../views/CheckoutView.vue'), meta: { title: 'Checkout', noindex: true } },
    { path: '/order-confirmation', name: 'order-confirmation', component: () => import('../views/OrderConfirmationView.vue'), meta: { title: 'Order Confirmation', noindex: true } },
    { path: '/memo-confirmation', name: 'memo-confirmation', component: () => import('../views/MemoConfirmationView.vue'), meta: { title: 'Memo Raised', noindex: true } },
    { path: '/about', name: 'about', component: () => import('../views/AboutView.vue'), meta: { title: 'About Us', description: 'The story of Kiana Jewels Private Limited — a modern Jaipur jewellery manufacturer specializing in semi-mount, fine, lab-grown diamond and colored stone jewellery.' } },
    { path: '/services', name: 'services', component: () => import('../views/ServicesView.vue'), meta: { title: 'Services', description: 'Jewellery services at Kiana — custom design, repair, resizing, polishing and more.' } },
    { path: '/contact', redirect: '/about' },
    { path: '/careers', redirect: '/about' },
    { path: '/search', name: 'search', component: () => import('../views/SearchView.vue'), meta: { title: 'Search', noindex: true } },
    { path: '/chat', name: 'chat', component: () => import('../views/ChatView.vue'), meta: { title: 'Chat', noindex: true } },
    { path: '/internal', name: 'internal', component: () => import('../views/InternalView.vue') },
    { path: '/internal/orders/:id', name: 'internal-order', component: () => import('../views/InternalOrderDetailView.vue') },
    { path: '/internal/memos/:id', name: 'internal-memo', component: () => import('../views/InternalMemoDetailView.vue') },
    { path: '/internal/users/:id', name: 'internal-user', component: () => import('../views/InternalUserDetailView.vue') },
    { path: '/internal/signups/:reference', name: 'internal-signup-request', component: () => import('../views/InternalSignupRequestDetailView.vue') },
    { path: '/internal/products/import', name: 'internal-product-import', component: () => import('../views/InternalProductImportView.vue') },
    { path: '/internal/products/:slug', name: 'internal-product', component: InternalProductDetailView },
    { path: '/login', name: 'login', component: () => import('../views/LoginView.vue'), meta: { title: 'Log In', noindex: true } },
    { path: '/signup', name: 'signup', component: () => import('../views/SignupView.vue'), meta: { title: 'Sign Up', noindex: true } },
    { path: '/account', name: 'account', component: () => import('../views/AccountSettingsView.vue'), meta: { title: 'Account', noindex: true } },
    { path: '/forgot-password', name: 'forgot-password', component: () => import('../views/ForgotPasswordView.vue'), meta: { title: 'Forgot Password', noindex: true } },
    { path: '/reset-password', name: 'reset-password', component: () => import('../views/ResetPasswordView.vue'), meta: { title: 'Reset Password', noindex: true } },
    { path: '/:pathMatch(.*)*', name: 'not-found', component: () => import('../views/NotFoundView.vue'), meta: { title: 'Page Not Found', noindex: true } },
  ],
})

router.beforeEach((to) => {
  if (typeof to.path !== 'string' || !to.path.startsWith('/internal')) return true
  const { isInternalUser } = useAuth()
  return isInternalUser.value ? true : { name: 'home' }
})

router.afterEach((to) => {
  // Product and collection pages refine this once their data resolves.
  setPageMeta({
    title: typeof to.meta.title === 'string' ? to.meta.title : undefined,
    description: typeof to.meta.description === 'string' ? to.meta.description : undefined,
    noindex: to.meta.noindex === true || to.path.startsWith('/internal'),
  })
  if (to.name !== 'product') clearProductJsonLd()

  try {
    sessionStorage.removeItem(CHUNK_RELOAD_FLAG)
  } catch {
    // ignore storage issues
  }
})

router.onError((error, to) => {
  const message = error instanceof Error ? error.message : String(error || '')
  const isChunkLoadFailure =
    /Failed to fetch dynamically imported module/i.test(message) ||
    /Importing a module script failed/i.test(message) ||
    /error loading dynamically imported module/i.test(message)

  if (!isChunkLoadFailure) return

  try {
    if (sessionStorage.getItem(CHUNK_RELOAD_FLAG) === '1') {
      sessionStorage.removeItem(CHUNK_RELOAD_FLAG)
      return
    }
    sessionStorage.setItem(CHUNK_RELOAD_FLAG, '1')
  } catch {
    // If storage is unavailable, still attempt a single hard reload.
  }

  const nextUrl = router.resolve(to).fullPath || window.location.pathname || '/'
  window.location.assign(nextUrl)
})

export default router
