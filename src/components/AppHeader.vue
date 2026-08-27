<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useCart } from '../composables/useCart'
import { useWishlist } from '../composables/useWishlist'
import { useAuth } from '../composables/useAuth'
import { useSearch } from '../composables/useSearch'
import { API_BASE } from '../config-api'
import {
  LOCALE_LABEL,
  NAV_ITEMS,
  UTILITY_LINKS,
  type NavGroup,
  type NavItem,
} from '../data/nav-menu'

const route = useRoute()
const router = useRouter()
const { totalItems } = useCart()
const { count: wishlistCount } = useWishlist()
const { user, isLoggedIn, isInternalUser, canMemoUser, logout } = useAuth()
const { query, searchByImage, submitTextSearch } = useSearch()

const headerEl = ref<HTMLElement | null>(null)
const spacerEl = ref<HTMLElement | null>(null)
const menuOpen = ref(false)
const accountMenuOpen = ref(false)
const accountMenuRoot = ref<HTMLElement | null>(null)
const notificationOpen = ref(false)
const notificationRoot = ref<HTMLElement | null>(null)
const searchExpanded = ref(false)
const desktopSearchInput = ref<HTMLInputElement | null>(null)
const mobileSearchInput = ref<HTMLInputElement | null>(null)
const imageFileInput = ref<HTMLInputElement | null>(null)

/** Which category's submenu is open, keyed by NavItem.key. */
const openCategory = ref<string | null>(null)
/** Scroll-derived: past ~120px the main bar shrinks. */
const isCondensed = ref(false)
/** Mobile drawer: which category accordion is expanded. */
const drawerCategory = ref<string | null>(null)

const isInternalPath = computed(() => route.path.startsWith('/internal'))
const userInitial = computed(() => user.value?.name?.trim().charAt(0).toUpperCase() || 'A')
const wishlistBadge = computed(() => (wishlistCount.value > 9 ? '9+' : String(wishlistCount.value)))
// The design puts the count inside the bag pill and hides it entirely at zero,
// rather than showing a "0".
const cartBadge = computed(() => (totalItems.value > 99 ? '99+' : String(totalItems.value)))

interface InternalNotificationOrder {
  id: string
  orderNo: string
  customer: string
  total: string
  itemCount: number
}

interface InternalNotificationItem {
  id: string
  type: 'Order'
  title: string
  meta: string
  to: { name: 'internal-order'; params: { id: string } }
}

const internalNotifications = ref<InternalNotificationItem[]>([])
const notificationCount = computed(() => internalNotifications.value.length)
const notificationBadge = computed(() =>
  notificationCount.value > 9 ? '9+' : String(notificationCount.value),
)

async function loadInternalNotifications() {
  const userId = user.value?.id
  if (!userId || !isInternalUser.value || !isInternalPath.value) {
    internalNotifications.value = []
    return
  }

  try {
    const params = new URLSearchParams({ resource: 'orders-list', userId, skip: '0' })
    const res = await fetch(`${API_BASE}/api/internal?${params.toString()}`)
    const data = (await res.json().catch(() => ({}))) as {
      message?: string
      orders?: InternalNotificationOrder[]
    }
    if (!res.ok) throw new Error(data.message || 'Unable to load notifications.')

    internalNotifications.value = (Array.isArray(data.orders) ? data.orders : [])
      .slice(0, 6)
      .map((order) => ({
        id: `order-${order.id}`,
        type: 'Order',
        title: order.orderNo,
        meta: `${order.customer} · ${order.itemCount} ${order.itemCount === 1 ? 'item' : 'items'} · ${order.total}`,
        to: { name: 'internal-order', params: { id: order.id } },
      }))
  } catch {
    // Notifications are best-effort; keep the last successfully loaded list.
  }
}

const navItems: NavItem[] = NAV_ITEMS
const utilityLinks = UTILITY_LINKS
const localeLabel = LOCALE_LABEL

const openItem = computed(() => navItems.find((item) => item.key === openCategory.value) ?? null)
const openSubmenu = computed(() => openItem.value?.submenu ?? null)

/** The drawer stacks the desktop menu's three columns into one flow. */
function drawerGroups(item: NavItem): NavGroup[] {
  return item.submenu ? item.submenu.columns.flat() : []
}

// --- Submenu open/close with hover intent -----------------------------------
// ~120ms before opening so a cursor crossing the bar doesn't flash panels, and a
// short grace period on leave so the diagonal trip down to the panel is forgiving.
let openTimer: ReturnType<typeof setTimeout> | null = null
let closeTimer: ReturnType<typeof setTimeout> | null = null

function clearTimers() {
  if (openTimer) clearTimeout(openTimer)
  if (closeTimer) clearTimeout(closeTimer)
  openTimer = null
  closeTimer = null
}

function requestOpen(item: NavItem) {
  if (!item.submenu) {
    requestClose()
    return
  }
  clearTimers()
  // Already showing a panel: swap immediately, the intent is established.
  if (openCategory.value) {
    openCategory.value = item.key
    return
  }
  openTimer = setTimeout(() => {
    openCategory.value = item.key
  }, 120)
}

function requestClose() {
  clearTimers()
  closeTimer = setTimeout(() => {
    openCategory.value = null
  }, 120)
}

function cancelClose() {
  if (closeTimer) clearTimeout(closeTimer)
  closeTimer = null
}

function closeSubmenu() {
  clearTimers()
  openCategory.value = null
}

/** Tab out of the header entirely closes the panel. */
function onHeaderFocusOut(event: FocusEvent) {
  const next = event.relatedTarget as Node | null
  if (!next || !headerEl.value?.contains(next)) closeSubmenu()
}

/** Arrow keys walk the links within a single submenu group. */
function onSubmenuKeydown(event: KeyboardEvent) {
  if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return
  const current = event.target as HTMLElement | null
  const group = current?.closest('.submenu-group')
  if (!group) return
  const links = Array.from(group.querySelectorAll<HTMLElement>('a'))
  const index = links.indexOf(current as HTMLElement)
  if (index === -1) return
  event.preventDefault()
  const delta = event.key === 'ArrowDown' ? 1 : -1
  links[(index + delta + links.length) % links.length]?.focus()
}

/** The drawer and the search panel occupy the same strip, so only one opens. */
function toggleDrawer() {
  menuOpen.value = !menuOpen.value
  if (menuOpen.value) searchExpanded.value = false
}

function toggleDrawerCategory(key: string) {
  drawerCategory.value = drawerCategory.value === key ? null : key
}

// --- Scroll state ------------------------------------------------------------
// Read straight from the passive listener: layout is already clean during a
// scroll event, so scrollY is free, and the ref only writes when the boolean
// actually flips. The two thresholds are deliberately apart: a single 120px
// line makes the bar pump between its two heights while a trackpad wobbles on
// the boundary, and each flip costs a 200ms height animation.
// Keep EXPAND_AT above the difference between the resting and condensed heights
// (66px at the widest breakpoint) — below that the condensed bar no longer
// covers the spacer and a strip of page background shows above the content.
const CONDENSE_AT = 120
const EXPAND_AT = 80

function onScroll() {
  const y = window.scrollY
  const next = isCondensed.value ? y > EXPAND_AT : y > CONDENSE_AT
  if (next === isCondensed.value) return
  isCondensed.value = next
  // Condensing while a panel hangs open would leave it detached mid-scroll.
  if (next) closeSubmenu()
}

// --- Header height ------------------------------------------------------------
// Pages that offset content by the header (ChatView) need its *resting* height.
// Measure the spacer, not the bar: the spacer is the element that actually holds
// the page's top offset and its height is pure CSS, so it stays at the resting
// value while the bar animates between its two sizes.
let heightObserver: ResizeObserver | null = null

function publishRestHeight() {
  const el = spacerEl.value
  if (!el) return
  const height = Math.ceil(el.getBoundingClientRect().height)
  if (height > 0) document.documentElement.style.setProperty('--osiyan-header-height', `${height}px`)
}

watch(() => route.fullPath, () => {
  menuOpen.value = false
  accountMenuOpen.value = false
  notificationOpen.value = false
  searchExpanded.value = false
  drawerCategory.value = null
  closeSubmenu()
  void loadInternalNotifications()
})

// Match the shared Kiana search state: back/forward navigation and searches
// submitted from the results page are reflected in the header field.
watch(
  () => route.query.q,
  (value) => {
    if (route.path !== '/search') return
    const next = String(value || '')
    if (next !== query.value) query.value = next
  },
  { immediate: true },
)

// The drawer covers the viewport, so freeze the page behind it while it's open.
watch(menuOpen, (open) => {
  document.body.classList.toggle('osiyan-menu-open', open)
})

watch(isLoggedIn, (loggedIn) => {
  if (!loggedIn) {
    accountMenuOpen.value = false
    notificationOpen.value = false
    internalNotifications.value = []
  }
})

function closeAccountMenuOnOutsideClick(event: PointerEvent) {
  if (accountMenuRoot.value && !accountMenuRoot.value.contains(event.target as Node)) {
    accountMenuOpen.value = false
  }
  if (notificationRoot.value && !notificationRoot.value.contains(event.target as Node)) {
    notificationOpen.value = false
  }
}

function closeMenusOnEscape(event: KeyboardEvent) {
  if (event.key !== 'Escape') return
  accountMenuOpen.value = false
  notificationOpen.value = false
  menuOpen.value = false
  searchExpanded.value = false
  closeSubmenu()
}

async function openSearch() {
  menuOpen.value = false
  accountMenuOpen.value = false
  notificationOpen.value = false
  closeSubmenu()
  searchExpanded.value = true
  await nextTick()
  const input = window.matchMedia('(max-width: 1150px)').matches
    ? mobileSearchInput.value
    : desktopSearchInput.value
  input?.focus()
}

async function handleSearch() {
  const q = query.value.trim()
  if (!q) {
    await openSearch()
    return
  }
  menuOpen.value = false
  searchExpanded.value = false
  // Navigate first so SearchView reads the new query before the explicit-submit
  // signal fires. Typing by itself never runs the AI search.
  await router.push({ path: '/search', query: { q } })
  submitTextSearch()
}

function clearSearch() {
  query.value = ''
  if (route.path === '/search') void router.replace('/search')
}

function openImagePicker() {
  imageFileInput.value?.click()
}

async function onImageFileChange(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return
  menuOpen.value = false
  searchExpanded.value = false
  query.value = ''
  await router.push({ path: '/search' })
  void searchByImage(file)
  input.value = ''
}

function toggleInternalView() {
  accountMenuOpen.value = false
  notificationOpen.value = false
  void router.push(isInternalPath.value ? '/' : '/internal')
}

function toggleAccountMenu() {
  notificationOpen.value = false
  accountMenuOpen.value = !accountMenuOpen.value
}

function toggleNotifications() {
  accountMenuOpen.value = false
  notificationOpen.value = !notificationOpen.value
  if (notificationOpen.value) void loadInternalNotifications()
}

function signOut() {
  accountMenuOpen.value = false
  notificationOpen.value = false
  logout()
  void router.push('/')
}

onMounted(() => {
  document.addEventListener('pointerdown', closeAccountMenuOnOutsideClick)
  document.addEventListener('keydown', closeMenusOnEscape)
  window.addEventListener('scroll', onScroll, { passive: true })
  onScroll()
  void loadInternalNotifications()
  publishRestHeight()
  if (spacerEl.value && typeof ResizeObserver !== 'undefined') {
    heightObserver = new ResizeObserver(publishRestHeight)
    heightObserver.observe(spacerEl.value)
  }
})

onBeforeUnmount(() => {
  document.removeEventListener('pointerdown', closeAccountMenuOnOutsideClick)
  document.removeEventListener('keydown', closeMenusOnEscape)
  window.removeEventListener('scroll', onScroll)
  heightObserver?.disconnect()
  clearTimers()
  // Never leave the page scroll-locked if the header goes away mid-drawer.
  document.body.classList.remove('osiyan-menu-open')
})
</script>

<template>
  <input
    ref="imageFileInput"
    type="file"
    accept="image/*"
    class="search-file-input"
    @change="onImageFileChange"
  />

  <header
    ref="headerEl"
    class="osiyan-header"
    :class="{ 'is-condensed': isCondensed }"
    @focusout="onHeaderFocusOut"
  >
    <!-- Main navigation bar -->
    <div class="main-bar">
      <div class="main-inner">
        <button
          v-if="!isInternalPath"
          class="menu-toggle"
          :class="{ 'is-open': menuOpen }"
          type="button"
          :aria-label="menuOpen ? 'Close menu' : 'Open menu'"
          :aria-expanded="menuOpen"
          aria-controls="osiyan-mobile-nav"
          @click="toggleDrawer"
        >
          <span /><span /><span />
        </button>

        <RouterLink to="/" class="osiyan-logo-link" aria-label="Osiyan home">
          <span class="logo-crop logo-mark" aria-hidden="true">
            <img src="/osiyan-logo.png" alt="" />
          </span>
          <span class="logo-crop logo-wordmark" aria-hidden="true">
            <img src="/osiyan-logo.png" alt="" />
          </span>
        </RouterLink>

        <nav v-if="!isInternalPath" class="primary-nav" aria-label="Site" @mouseleave="requestClose">
          <div
            v-for="item in navItems"
            :key="item.key"
            class="nav-item"
            @mouseenter="requestOpen(item)"
          >
            <RouterLink
              :to="item.to"
              class="nav-link"
              :class="{ 'is-open': openCategory === item.key, 'chat-nav-link': item.icon === 'chat' }"
              :aria-haspopup="item.submenu ? 'true' : undefined"
              :aria-expanded="item.submenu ? openCategory === item.key : undefined"
              :aria-controls="item.submenu ? 'osiyan-submenu' : undefined"
              @focus="requestOpen(item)"
            >
              <svg v-if="item.icon === 'chat'" class="chat-icon" viewBox="0 0 24 24" aria-hidden="true">
                <path d="M8.625 12a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0H8.25m4.125 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0H12m4.125 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 0 1-2.555-.337A5.972 5.972 0 0 1 5.41 20.97a5.969 5.969 0 0 1-.474-.065 4.48 4.48 0 0 0 .978-2.025c.09-.457-.133-.901-.467-1.226C3.93 16.178 3 14.189 3 12c0-4.556 4.03-8.25 9-8.25S21 7.444 21 12Z" />
              </svg>
              {{ item.label }}
            </RouterLink>
          </div>
        </nav>
        <RouterLink
          v-else
          :to="{ path: '/internal', query: { tab: 'orders' } }"
          class="internal-nav-label"
        >
          Internal workspace
        </RouterLink>

        <nav class="header-actions" :aria-label="isInternalPath ? 'Internal actions' : 'Customer actions'">
          <!-- Below the breakpoint the inline field is replaced by this toggle,
               which opens the full-width search panel under the bar. -->
          <button
            v-if="!isInternalPath"
            type="button"
            class="search-toggle-mobile"
            aria-label="Search"
            title="Search"
            @click="openSearch"
          >
            <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="m16.5 16.5 4 4" /></svg>
          </button>

          <form
            v-if="!isInternalPath"
            class="header-search"
            :class="{ 'is-expanded': searchExpanded }"
            role="search"
            @submit.prevent="handleSearch"
          >
            <button type="button" class="header-search-icon" aria-label="Open search" title="Search" @click="openSearch">
              <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="m16.5 16.5 4 4" /></svg>
            </button>
            <input
              ref="desktopSearchInput"
              v-model="query"
              type="search"
              placeholder="Search"
              aria-label="Search jewelry"
              @focus="closeSubmenu"
            />
            <button v-if="query" type="button" class="header-search-clear" aria-label="Clear search" @click="clearSearch">
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" /></svg>
            </button>
            <button type="button" class="header-search-camera" aria-label="Search by image" title="Search by image" @click="openImagePicker">
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6.8 6.2 8 4.4h8l1.2 1.8H20a2 2 0 0 1 2 2V18a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V8.2a2 2 0 0 1 2-2h2.8Z" /><circle cx="12" cy="13" r="4" /></svg>
            </button>
          </form>

          <div class="action-icons">
            <div
              v-if="isInternalUser && isInternalPath"
              ref="notificationRoot"
              class="notification-root"
            >
              <button
                type="button"
                class="action-link notification-trigger"
                aria-label="Internal notifications"
                :aria-expanded="notificationOpen"
                aria-controls="internal-notification-dropdown"
                @click="toggleNotifications"
              >
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M14.857 17.082a23.848 23.848 0 0 0 5.454-1.31A8.967 8.967 0 0 1 18 9.75V9A6 6 0 0 0 6 9v.75a8.967 8.967 0 0 1-2.312 6.022 23.848 23.848 0 0 0 5.455 1.31m5.714 0a3 3 0 1 1-5.714 0" />
                </svg>
                <span v-if="notificationCount > 0" class="count-badge" aria-hidden="true">
                  {{ notificationBadge }}
                </span>
              </button>

              <div
                v-if="notificationOpen"
                id="internal-notification-dropdown"
                class="notification-dropdown"
                aria-label="Internal notifications"
              >
                <div class="notification-heading">Notifications</div>
                <div v-if="internalNotifications.length" class="notification-list">
                  <RouterLink
                    v-for="item in internalNotifications"
                    :key="item.id"
                    :to="item.to"
                    class="notification-item"
                    @click="notificationOpen = false"
                  >
                    <span class="notification-type">{{ item.type }}</span>
                    <span class="notification-title">{{ item.title }}</span>
                    <span class="notification-meta">{{ item.meta }}</span>
                  </RouterLink>
                </div>
                <p v-else class="notification-empty">No order notifications yet.</p>
              </div>
            </div>

            <RouterLink
              v-if="!isInternalPath"
              to="/wishlist"
              class="action-link wishlist-link"
              :aria-label="`Wishlist with ${wishlistCount} items`"
              title="Wishlist"
            >
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78L12 21.23l8.84-8.84a5.5 5.5 0 0 0 0-7.78Z" /></svg>
              <span v-if="wishlistCount > 0" class="count-badge" aria-hidden="true">{{ wishlistBadge }}</span>
            </RouterLink>

            <RouterLink v-if="!isInternalPath" to="/cart" class="bag-pill" :aria-label="`Bag with ${totalItems} items`" title="Bag">
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15.75 9.75V6a3.75 3.75 0 1 0-7.5 0v3.75m-2.737-2.243-1.263 12a1.125 1.125 0 0 0 1.12 1.243h13.26a1.125 1.125 0 0 0 1.12-1.243l-1.263-12a1.125 1.125 0 0 0-1.119-1.007H6.632c-.576 0-1.059.435-1.119 1.007Z" /></svg>
              <span v-if="totalItems > 0" class="bag-count" aria-hidden="true">{{ cartBadge }}</span>
            </RouterLink>

            <RouterLink v-if="!isLoggedIn" to="/login" class="action-link account-link" aria-label="Sign in" title="Sign in">
              <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="7.25" r="4" /><path d="M4.5 20.5a7.5 7.5 0 0 1 15 0" /></svg>
            </RouterLink>

            <div v-else ref="accountMenuRoot" class="account-menu-root">
              <button
                class="account-trigger"
                type="button"
                :aria-expanded="accountMenuOpen"
                aria-controls="account-dropdown"
                :aria-label="`Open account menu for ${user?.name || 'user'}`"
                @click="toggleAccountMenu"
              >
                <span class="account-avatar" aria-hidden="true">{{ userInitial }}</span>
                <svg class="account-chevron" :class="{ 'is-open': accountMenuOpen }" viewBox="0 0 12 8" aria-hidden="true">
                  <path d="m1 1.5 5 5 5-5" />
                </svg>
              </button>

              <div v-if="accountMenuOpen" id="account-dropdown" class="account-dropdown" aria-label="Account menu">
                <div class="account-profile">
                  <p class="account-name">{{ user?.name }}</p>
                  <p class="account-email">{{ user?.email }}</p>

                  <button
                    v-if="isInternalUser"
                    class="internal-switch-row"
                    type="button"
                    role="switch"
                    :aria-checked="isInternalPath"
                    @click="toggleInternalView"
                  >
                    <span>Internal</span>
                    <span class="internal-switch" :class="{ 'is-on': isInternalPath }" aria-hidden="true">
                      <span />
                    </span>
                  </button>
                </div>

                <nav class="account-navigation" aria-label="Account links">
                  <RouterLink to="/orders">My Orders</RouterLink>
                  <RouterLink v-if="canMemoUser" to="/memos">My Memos</RouterLink>
                  <RouterLink to="/wishlist">Wishlist</RouterLink>
                  <RouterLink to="/account">Account Settings</RouterLink>
                </nav>

                <div class="account-signout-wrap">
                  <button class="account-signout" type="button" @click="signOut">Sign out</button>
                </div>
              </div>
            </div>
          </div>
        </nav>
      </div>
    </div>

    <!-- Submenu panel — full-bleed, anchored under the bar -->
    <Transition name="submenu">
      <div
        v-if="openSubmenu"
        id="osiyan-submenu"
        class="submenu-panel"
        :aria-label="`${openItem?.label} menu`"
        @mouseenter="cancelClose"
        @mouseleave="requestClose"
        @keydown="onSubmenuKeydown"
      >
        <div class="submenu-inner">
          <div v-for="(column, columnIndex) in openSubmenu.columns" :key="columnIndex" class="submenu-column">
            <div v-for="group in column" :key="group.heading" class="submenu-group">
              <p class="submenu-heading">{{ group.heading }}</p>
              <div class="submenu-links">
                <RouterLink
                  v-for="link in group.links"
                  :key="link.label"
                  :to="link.to"
                  :class="{ 'is-emphasis': link.emphasis, 'has-thumb': link.image }"
                >
                  <img v-if="link.image" :src="link.image" :alt="link.imageAlt" class="submenu-thumb" loading="lazy" decoding="async" />
                  {{ link.label }}
                  <span v-if="link.emphasis" class="submenu-arrow" aria-hidden="true">&rarr;</span>
                </RouterLink>
              </div>
            </div>
          </div>

          <div class="submenu-features">
            <RouterLink v-for="feature in openSubmenu.features" :key="feature.title" :to="feature.to" class="submenu-feature">
              <img :src="feature.image" :alt="feature.alt" loading="lazy" decoding="async" />
              <span class="feature-title">{{ feature.title }}</span>
              <span class="feature-caption">{{ feature.caption }}</span>
            </RouterLink>
          </div>
        </div>
      </div>
    </Transition>

    <form v-if="searchExpanded && !isInternalPath" class="mobile-search-panel" role="search" @submit.prevent="handleSearch">
      <button type="submit" aria-label="Search" title="Search">
        <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="m16.5 16.5 4 4" /></svg>
      </button>
      <input
        ref="mobileSearchInput"
        v-model="query"
        type="search"
        placeholder="Search"
        aria-label="Search jewelry"
      />
      <button v-if="query" type="button" aria-label="Clear search" @click="clearSearch">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" /></svg>
      </button>
      <button type="button" aria-label="Search by image" title="Search by image" @click="openImagePicker">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6.8 6.2 8 4.4h8l1.2 1.8H20a2 2 0 0 1 2 2V18a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V8.2a2 2 0 0 1 2-2h2.8Z" /><circle cx="12" cy="13" r="4" /></svg>
      </button>
    </form>

    <!-- Mobile drawer: the same taxonomy as the desktop mega menu, stacked into
         per-category accordions. -->
    <nav v-if="menuOpen && !isInternalPath" id="osiyan-mobile-nav" class="mobile-drawer" aria-label="Mobile site navigation">
      <div class="drawer-scroll">
        <ul class="drawer-categories">
          <li v-for="item in navItems" :key="item.key" class="drawer-category">
            <div class="drawer-row">
              <RouterLink :to="item.to" class="drawer-link" :class="{ 'is-chat': item.icon === 'chat' }">
                <svg v-if="item.icon === 'chat'" class="chat-icon" viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M8.625 12a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0H8.25m4.125 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0H12m4.125 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 0 1-2.555-.337A5.972 5.972 0 0 1 5.41 20.97a5.969 5.969 0 0 1-.474-.065 4.48 4.48 0 0 0 .978-2.025c.09-.457-.133-.901-.467-1.226C3.93 16.178 3 14.189 3 12c0-4.556 4.03-8.25 9-8.25S21 7.444 21 12Z" />
                </svg>
                {{ item.label }}
              </RouterLink>
              <button
                v-if="item.submenu"
                type="button"
                class="drawer-expand"
                :class="{ 'is-open': drawerCategory === item.key }"
                :aria-expanded="drawerCategory === item.key"
                :aria-controls="`drawer-panel-${item.key}`"
                :aria-label="`${drawerCategory === item.key ? 'Collapse' : 'Expand'} ${item.label}`"
                @click="toggleDrawerCategory(item.key)"
              >
                <svg viewBox="0 0 12 8" aria-hidden="true"><path d="m1 1.5 5 5 5-5" /></svg>
              </button>
            </div>

            <div v-if="item.submenu && drawerCategory === item.key" :id="`drawer-panel-${item.key}`" class="drawer-panel">
              <div v-for="group in drawerGroups(item)" :key="group.heading" class="drawer-group">
                <p class="drawer-group-heading">{{ group.heading }}</p>
                <div class="drawer-group-links">
                  <RouterLink
                    v-for="link in group.links"
                    :key="link.label"
                    :to="link.to"
                    :class="{ 'is-emphasis': link.emphasis, 'has-thumb': link.image }"
                  >
                    <img v-if="link.image" :src="link.image" :alt="link.imageAlt" class="submenu-thumb" loading="lazy" decoding="async" />
                    {{ link.label }}
                  </RouterLink>
                </div>
              </div>

              <div class="drawer-features">
                <RouterLink
                  v-for="feature in item.submenu.features"
                  :key="feature.title"
                  :to="feature.to"
                  class="drawer-feature"
                >
                  <img :src="feature.image" :alt="feature.alt" loading="lazy" decoding="async" />
                  <span class="feature-title">{{ feature.title }}</span>
                </RouterLink>
              </div>
            </div>
          </li>
        </ul>

        <div class="drawer-utility">
          <RouterLink v-for="link in utilityLinks" :key="link.to" :to="link.to">{{ link.label }}</RouterLink>
          <RouterLink to="/wishlist">Wishlist</RouterLink>
          <template v-if="isLoggedIn">
            <RouterLink to="/orders">My Orders</RouterLink>
            <RouterLink v-if="canMemoUser" to="/memos">My Memos</RouterLink>
            <RouterLink to="/account">Account Settings</RouterLink>
            <button type="button" class="drawer-signout" @click="signOut">Sign out</button>
          </template>
          <RouterLink v-else to="/login">Sign in</RouterLink>
          <p class="drawer-locale">{{ localeLabel }}</p>
        </div>
      </div>
    </nav>
  </header>

  <!-- Holds the page's top offset. The bar itself is fixed, so it can shrink on
       scroll without ever resizing anything in flow; this spacer keeps its
       resting height and never moves. -->
  <div ref="spacerEl" class="osiyan-header-spacer" aria-hidden="true" />
</template>

<style scoped>
/* Resting row height. The bar reads it through --main-height (which the condensed
   state overrides) while the spacer reads it directly, so the two cannot drift. */
.osiyan-header,
.osiyan-header-spacer {
  --main-rest: 88px;
}

/* The bar is fixed and the spacer reserves its resting height, so condensing on
   scroll resizes nothing in flow. Keeping the bar in flow instead would pull the
   page up 66px the moment it condensed, and scroll anchoring would push the
   scroll position back down past the threshold — the bar then expands, the page
   drops back, and the two fight frame after frame as visible flicker. */
.osiyan-header-spacer {
  height: calc(var(--main-rest) + 1px);
}

/* Design tokens — Osiyan nav redesign, direction 1a. */
.osiyan-header {
  --plum: #4b2d55;
  --plum-ink: #2c1c33;
  --gold: #c9a227;
  --gold-text: #8a6f22;
  --text: #3f3a3d;
  --muted: #8b8287;
  --muted-light: #9a9296;
  --label: #a89aa0;
  --on-plum: #e8dfe9;
  --border: #ece8ea;
  --border-soft: #f2eef0;
  --border-field: #dcd6d9;
  --surface-pill: #f6f2f7;
  --main-height: var(--main-rest);
  --gutter: clamp(20px, 2.8vw, 40px);
  --logo-scale: 0.7391;

  position: fixed;
  z-index: 50;
  top: 0;
  left: 0;
  right: 0;
  background: #fff;
  font-family: var(--font-display);
}

/* Condensed: the bar drops to 60px. */
.osiyan-header.is-condensed {
  --main-height: 60px;
  --logo-scale: 0.5217;
  box-shadow: 0 10px 26px -20px rgba(44, 28, 51, 0.34);
}

/* --- Main bar --- */
.main-bar { background: #fff; border-bottom: 1px solid var(--border); }
.main-inner {
  width: min(100%, 1440px);
  height: var(--main-height);
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20px;
  margin: 0 auto;
  padding: 0 var(--gutter);
  transition: height 0.2s ease;
}

/* Logo — the brand sprite, scaled from one factor so every state stays in
   proportion. At rest the mark lands on the design's 34px. */
.osiyan-logo-link { display: flex; flex: none; align-items: center; gap: 12px; text-decoration: none; }
.logo-crop { position: relative; display: block; flex: none; overflow: hidden; transition: width 0.2s ease, height 0.2s ease; }
.logo-crop img { position: absolute; display: block; max-width: none; height: auto; transition: width 0.2s ease, left 0.2s ease, top 0.2s ease; }
.logo-mark { width: calc(46px * var(--logo-scale)); height: calc(46px * var(--logo-scale)); }
.logo-mark img { left: calc(-18.37px * var(--logo-scale)); top: calc(-4.3px * var(--logo-scale)); width: calc(82.73px * var(--logo-scale)); }
.logo-wordmark { width: calc(89.25px * var(--logo-scale)); height: calc(28.9px * var(--logo-scale)); }
.logo-wordmark img { left: calc(-3.04px * var(--logo-scale)); top: calc(-61.65px * var(--logo-scale)); width: calc(95.15px * var(--logo-scale)); }
.osiyan-header.is-condensed .osiyan-logo-link { gap: 9px; }

/* Categories */
/* 2.65vw hits the design's 38px at the 1440 reference width and tightens from
   there, so the seven items clear the logo and utilities down to the breakpoint. */
.primary-nav { display: flex; align-items: center; gap: clamp(16px, 2.65vw, 38px); white-space: nowrap; }
.internal-nav-label {
  color: var(--gold-text);
  font-size: 13px;
  font-weight: 500;
  line-height: 1;
  letter-spacing: 0.12em;
  text-decoration: none;
  text-transform: uppercase;
  transition: color 0.15s ease;
}
.internal-nav-label:hover { color: var(--gold); }
.nav-item { display: flex; }
.nav-link {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 0;
  border-bottom: 1.5px solid transparent;
  color: var(--text);
  text-decoration: none;
  font-size: 15px;
  line-height: 1;
  letter-spacing: 0.05em;
  transition: color 0.15s ease, border-color 0.15s ease, font-size 0.2s ease;
}
.nav-link:hover, .nav-link.is-open { border-bottom-color: var(--gold); color: var(--plum-ink); }
/* The active category keeps the gold underline on its section pages. */
.nav-link.router-link-active { border-bottom-color: var(--gold); color: var(--plum-ink); }
.nav-link.chat-nav-link { color: var(--plum); }
.chat-icon { width: 15px; height: 15px; flex: none; fill: none; stroke: currentColor; stroke-width: 1.8; stroke-linecap: round; stroke-linejoin: round; }
.osiyan-header.is-condensed .nav-link { font-size: 13px; }

.nav-link:focus-visible,
.osiyan-logo-link:focus-visible,
.action-link:focus-visible,
.bag-pill:focus-visible,
.menu-toggle:focus-visible { outline: 2px solid var(--plum); outline-offset: 4px; border-radius: 2px; }

/* Utilities cluster */
.header-actions { display: flex; flex: none; align-items: center; gap: 22px; }
.search-file-input { display: none; }

/* Search — an underlined field at rest, widening on focus. The clear and
   image-search controls reveal themselves once it's active. */
.header-search {
  width: clamp(120px, 11vw, 150px);
  display: flex;
  align-items: center;
  gap: 9px;
  border-bottom: 1px solid var(--border-field);
  padding: 6px 2px 6px 0;
  transition: width 0.25s ease, border-color 0.2s ease;
}
.header-search.is-expanded, .header-search:focus-within { width: 260px; border-bottom-color: var(--plum); }
.header-search-icon, .header-search-clear, .header-search-camera {
  display: grid;
  flex: none;
  place-items: center;
  border: 0;
  padding: 0;
  background: transparent;
  cursor: pointer;
}
.header-search-icon { width: 15px; height: 15px; color: var(--muted); }
.header-search-icon svg { width: 15px; height: 15px; }
.header-search input {
  width: 100%;
  min-width: 0;
  border: 0;
  padding: 0;
  color: var(--text);
  background: transparent;
  font: inherit;
  font-size: 13.5px;
  letter-spacing: 0.04em;
  outline: none;
}
.header-search input::placeholder { color: var(--muted-light); }
.header-search input::-webkit-search-cancel-button { display: none; }
.header-search-clear, .header-search-camera { width: 15px; height: 15px; color: var(--muted); }
.header-search-clear svg, .header-search-camera svg { width: 14px; height: 14px; }
.header-search-camera { visibility: hidden; opacity: 0; transition: opacity 0.15s ease; }
.header-search.is-expanded .header-search-camera, .header-search:focus-within .header-search-camera { visibility: visible; opacity: 1; }
.header-search button:hover { color: var(--plum); }
.header-search button:focus-visible,
.mobile-search-panel button:focus-visible,
.mobile-search-panel input:focus-visible { outline: 2px solid var(--plum); outline-offset: 2px; }

/* Icon group — 1.2px optical stroke, matching the design's 16px icon set. */
.action-icons { display: flex; align-items: center; gap: 18px; white-space: nowrap; }
.action-link { position: relative; display: grid; flex: none; place-items: center; color: var(--plum); text-decoration: none; }
.action-link svg { width: 17px; height: 17px; fill: none; stroke: currentColor; stroke-width: 1.8; stroke-linecap: round; stroke-linejoin: round; }
.action-link:hover { color: var(--gold-text); }
.count-badge {
  position: absolute;
  z-index: 1;
  top: -5px;
  right: -7px;
  min-width: 14px;
  height: 14px;
  display: grid;
  place-items: center;
  padding: 0 4px;
  border-radius: 999px;
  background: var(--plum);
  color: #fff;
  font-size: 9.5px;
  font-weight: 500;
  line-height: 1;
  box-shadow: 0 0 0 2px #fff;
}

/* Internal bell — mirrors the reference site's notification treatment while
   using this portal's server-backed order list. */
.notification-root { position: relative; display: flex; }
.notification-trigger {
  border: 0;
  padding: 0;
  background: transparent;
  font: inherit;
  cursor: pointer;
}
.notification-dropdown {
  position: absolute;
  z-index: 10;
  top: calc(100% + 16px);
  right: 0;
  width: 320px;
  overflow: hidden;
  border: 1px solid var(--border);
  border-radius: 4px;
  background: #fff;
  box-shadow: 0 18px 44px rgba(44, 28, 51, 0.14);
  color: var(--text);
  text-align: left;
  white-space: normal;
}
.notification-heading {
  border-bottom: 1px solid var(--border);
  padding: 14px 18px;
  color: var(--plum-ink);
  font-family: var(--font-display);
  font-size: 16px;
  line-height: 1.2;
}
.notification-list { max-height: 320px; overflow-y: auto; }
.notification-item {
  display: block;
  border-bottom: 1px solid var(--border-soft);
  padding: 13px 18px;
  color: var(--text);
  text-decoration: none;
  transition: background 0.15s ease;
}
.notification-item:last-child { border-bottom: 0; }
.notification-item:hover, .notification-item:focus-visible { background: #faf8fa; outline: none; }
.notification-type {
  display: block;
  color: var(--gold-text);
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.12em;
  line-height: 1.2;
  text-transform: uppercase;
}
.notification-title {
  display: block;
  margin-top: 3px;
  color: var(--plum-ink);
  font-size: 14px;
  font-weight: 600;
  line-height: 1.25;
}
.notification-meta {
  display: block;
  overflow: hidden;
  margin-top: 3px;
  color: var(--muted);
  font-size: 12px;
  line-height: 1.35;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.notification-empty {
  margin: 0;
  padding: 24px 18px;
  color: var(--muted);
  font-size: 13px;
  line-height: 1.4;
  text-align: center;
}
/* Bag pill — the count lives inside it, and disappears entirely at zero. */
.bag-pill {
  display: flex;
  flex: none;
  align-items: center;
  gap: 8px;
  border-radius: 999px;
  padding: 7px 13px;
  background: var(--surface-pill);
  color: var(--plum);
  text-decoration: none;
  transition: background 0.15s ease;
}
.bag-pill svg { width: 16px; height: 16px; fill: none; stroke: currentColor; stroke-width: 1.8; stroke-linecap: round; stroke-linejoin: round; }
.bag-pill:hover { background: #efe7f1; }
.bag-count { color: var(--gold-text); font-size: 11.5px; letter-spacing: 0.04em; line-height: 1; }

/* --- Submenu panel --- */
.submenu-panel {
  position: absolute;
  z-index: 2;
  top: 100%;
  left: 0;
  right: 0;
  border-top: 1px solid var(--border-soft);
  background: #fff;
  box-shadow: 0 20px 34px -22px rgba(44, 28, 51, 0.28);
}
.submenu-inner {
  width: min(100%, 1440px);
  display: grid;
  grid-template-columns: 190px 190px 190px 1fr;
  gap: 44px;
  margin: 0 auto;
  padding: 36px var(--gutter) 42px;
}
.submenu-column { display: flex; flex-direction: column; gap: 14px; }
.submenu-group { display: flex; flex-direction: column; gap: 14px; }
.submenu-group + .submenu-group { margin-top: 10px; }
.submenu-heading { margin: 0; color: var(--label); font-size: 11px; letter-spacing: 0.2em; text-transform: uppercase; }
.submenu-links { display: flex; flex-direction: column; gap: 11px; }
/* A thumbnail run needs more air than a bare text list, and the image must not
   shrink when a label wraps. */
.submenu-links a.has-thumb { gap: 10px; }
.submenu-links a.has-thumb + a.has-thumb { margin-top: 5px; }
.submenu-thumb {
  flex: none;
  width: 48px;
  height: 48px;
  border-radius: 6px;
  object-fit: cover;
  background: var(--surface-pill);
}
.submenu-links a {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  width: fit-content;
  color: var(--text);
  text-decoration: none;
  font-size: 14.5px;
  line-height: 1.2;
  transition: color 0.15s ease;
}
.submenu-links a:hover { color: var(--plum-ink); }
.submenu-links a.is-emphasis { color: var(--gold-text); }
.submenu-arrow { font-size: 15px; line-height: 1; }
.submenu-links a:focus-visible, .submenu-feature:focus-visible { outline: 2px solid var(--plum); outline-offset: 3px; border-radius: 2px; }

.submenu-features { display: grid; grid-template-columns: 1fr 1fr; gap: 22px; }
.submenu-feature { display: flex; flex-direction: column; gap: 9px; text-decoration: none; }
.submenu-feature img { width: 100%; height: 158px; display: block; object-fit: cover; background: var(--border-soft); }
.feature-title { color: var(--plum); font-size: 13.5px; letter-spacing: 0.04em; }
.feature-caption { color: var(--muted); font-size: 12.5px; }
.submenu-feature:hover .feature-title { color: var(--gold-text); }

.submenu-enter-active, .submenu-leave-active { transition: opacity 0.18s ease-out, transform 0.18s ease-out; }
.submenu-enter-from, .submenu-leave-to { opacity: 0; transform: translateY(-4px); }

/* --- Account dropdown --- */
.account-menu-root { position: relative; display: flex; }
.account-trigger {
  display: flex;
  align-items: center;
  gap: 7px;
  border: 0;
  padding: 0;
  background: transparent;
  cursor: pointer;
}
.account-trigger:focus-visible { outline: 2px solid var(--plum); outline-offset: 3px; border-radius: 999px; }
.account-avatar {
  width: 28px;
  height: 28px;
  display: grid;
  flex: none;
  place-items: center;
  border-radius: 50%;
  background: var(--plum);
  color: #fff;
  font-size: 12.5px;
  font-weight: 500;
  line-height: 1;
}
.account-chevron { width: 10px; height: 7px; fill: none; stroke: var(--muted); stroke-width: 1.8; stroke-linecap: round; stroke-linejoin: round; transition: transform 0.2s ease; }
.account-chevron.is-open { transform: rotate(180deg); }
.account-dropdown {
  position: absolute;
  z-index: 10;
  top: calc(100% + 16px);
  right: 0;
  width: 300px;
  overflow: hidden;
  border: 1px solid var(--border);
  border-radius: 4px;
  background: #fff;
  box-shadow: 0 18px 44px rgba(44, 28, 51, 0.14);
  color: var(--text);
  text-align: left;
}
.account-profile { padding: 22px 26px 18px; }
.account-name, .account-email { overflow: hidden; margin: 0; text-overflow: ellipsis; white-space: nowrap; }
.account-name { color: var(--plum-ink); font-family: var(--font-display); font-size: 19px; line-height: 1.25; }
.account-email { margin-top: 4px; color: var(--muted); font-size: 13px; line-height: 1.35; }
.internal-switch-row {
  width: 100%;
  min-height: 48px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: 16px;
  border: 0;
  border-radius: 4px;
  padding: 0 16px;
  background: var(--surface-pill);
  color: var(--plum);
  font: inherit;
  font-size: 14px;
  letter-spacing: 0.04em;
  cursor: pointer;
}
.internal-switch-row:focus-visible { outline: 2px solid var(--plum); outline-offset: 2px; }
.internal-switch { position: relative; width: 46px; height: 26px; flex: none; border-radius: 999px; background: #cfc6d2; transition: background 0.2s ease; }
.internal-switch > span { position: absolute; left: 3px; top: 3px; width: 20px; height: 20px; border-radius: 50%; background: #fff; box-shadow: 0 1px 3px rgba(44, 28, 51, 0.18); transition: transform 0.2s ease; }
.internal-switch.is-on { background: var(--gold); }
.internal-switch.is-on > span { transform: translateX(20px); }
.account-navigation { display: flex; flex-direction: column; border-top: 1px solid var(--border); padding: 10px 0; }
.account-navigation a { padding: 9px 26px; color: var(--text); text-decoration: none; font-size: 14.5px; line-height: 1.35; transition: color 0.15s ease, background 0.15s ease; }
.account-navigation a:hover, .account-navigation a:focus-visible { background: #faf8fa; color: var(--plum-ink); outline: none; }
.account-signout-wrap { border-top: 1px solid var(--border); padding: 10px 0; }
.account-signout { width: 100%; border: 0; padding: 9px 26px; background: transparent; color: #b3453f; font: inherit; font-size: 14.5px; line-height: 1.35; text-align: left; cursor: pointer; transition: color 0.15s ease, background 0.15s ease; }
.account-signout:hover, .account-signout:focus-visible { background: #fdf7f6; color: #8f322d; outline: none; }

/* --- Mobile-only pieces, hidden on desktop --- */
.menu-toggle, .search-toggle-mobile, .mobile-search-panel, .mobile-drawer { display: none; }

/* The 7 categories, search field and icon cluster need ~1150px before they stop
   colliding, so tablets get the drawer too. */
@media (max-width: 1150px) {
  .osiyan-header, .osiyan-header-spacer { --main-rest: 64px; }
  .osiyan-header { --logo-scale: 0.6522; }
  .osiyan-header.is-condensed { --main-height: 56px; --logo-scale: 0.5652; }

  /* Hamburger left, logo centred, search + bag right. */
  .main-inner { display: grid; grid-template-columns: 1fr auto 1fr; gap: 12px; }
  .primary-nav { display: none; }
  .internal-nav-label { display: none; }
  .submenu-panel { display: none; }
  .osiyan-logo-link { grid-column: 2; justify-self: center; }

  .menu-toggle { grid-column: 1; justify-self: start; display: block; width: 24px; border: 0; padding: 0; background: none; cursor: pointer; }
  .menu-toggle span { display: block; width: 22px; height: 1px; margin: 5px 0; background: var(--plum); transition: transform 0.2s ease, opacity 0.2s ease; }
  /* Collapse the three bars into a close (X) mark while the drawer is open. */
  .menu-toggle.is-open span:first-child { transform: translateY(6px) rotate(45deg); }
  .menu-toggle.is-open span:nth-child(2) { opacity: 0; }
  .menu-toggle.is-open span:last-child { transform: translateY(-6px) rotate(-45deg); }

  .header-actions { grid-column: 3; justify-self: end; gap: 14px; }
  /* Search collapses to an icon beside the bag; the panel below carries the field. */
  .header-search { display: none; }
  .search-toggle-mobile { display: grid; place-items: center; width: 22px; height: 22px; flex: none; border: 0; padding: 0; color: var(--plum); background: transparent; cursor: pointer; }
  .search-toggle-mobile svg { width: 18px; height: 18px; fill: none; stroke: currentColor; stroke-width: 1.8; stroke-linecap: round; stroke-linejoin: round; }
  .action-icons { gap: 14px; }
  .wishlist-link, .account-link, .account-menu-root { display: none; }
  .bag-pill { padding: 6px 11px; gap: 6px; }
  .account-dropdown { position: fixed; top: calc(var(--main-height) + 6px); left: 14px; right: 14px; width: auto; }
  .notification-dropdown { position: fixed; top: calc(var(--main-height) + 6px); left: 14px; right: 14px; width: auto; }

  .mobile-search-panel {
    position: absolute;
    z-index: 4;
    top: 100%;
    left: 0;
    right: 0;
    height: 58px;
    display: flex;
    align-items: center;
    margin: 0;
    border-bottom: 1px solid var(--border);
    padding: 9px 14px;
    background: #fff;
    box-shadow: 0 7px 14px rgba(44, 28, 51, 0.08);
  }
  .mobile-search-panel button { width: 34px; height: 34px; display: grid; flex: none; place-items: center; border: 0; padding: 0; color: var(--plum); background: transparent; cursor: pointer; }
  .mobile-search-panel svg { width: 18px; height: 18px; fill: none; stroke: currentColor; stroke-width: 1.8; stroke-linecap: round; stroke-linejoin: round; }
  .mobile-search-panel input { min-width: 0; flex: 1; border: 0; padding: 8px 5px; color: var(--text); background: transparent; font: inherit; font-size: 16px; outline: none; }
  .mobile-search-panel input::placeholder { color: var(--muted-light); }

  /* Drawer */
  .mobile-drawer {
    position: absolute;
    top: 100%;
    left: 0;
    right: 0;
    height: calc(100svh - var(--main-height));
    display: block;
    background: #fff;
    border-top: 1px solid var(--border);
  }
  .drawer-scroll { height: 100%; overflow-y: auto; padding: 8px 20px 40px; -webkit-overflow-scrolling: touch; }
  .drawer-categories { margin: 0; padding: 0; list-style: none; }
  .drawer-category { border-bottom: 1px solid var(--border); }
  .drawer-row { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
  .drawer-link {
    flex: 1;
    display: flex;
    align-items: center;
    gap: 9px;
    padding: 17px 0;
    color: var(--plum-ink);
    text-decoration: none;
    font-family: var(--font-display);
    font-size: 21px;
    letter-spacing: 0.02em;
  }
  .drawer-link.is-chat { color: var(--plum); }
  .drawer-link.router-link-active { color: var(--gold-text); }
  .drawer-expand { display: grid; place-items: center; width: 40px; height: 40px; flex: none; border: 0; padding: 0; background: transparent; cursor: pointer; }
  .drawer-expand svg { width: 13px; height: 9px; fill: none; stroke: var(--muted); stroke-width: 1.8; stroke-linecap: round; stroke-linejoin: round; transition: transform 0.2s ease; }
  .drawer-expand.is-open svg { transform: rotate(180deg); }
  .drawer-expand:focus-visible, .drawer-link:focus-visible { outline: 2px solid var(--plum); outline-offset: 2px; border-radius: 2px; }

  .drawer-panel { padding: 2px 0 22px; }
  .drawer-group + .drawer-group { margin-top: 20px; }
  .drawer-group-heading { margin: 0 0 10px; color: var(--label); font-size: 11px; letter-spacing: 0.2em; text-transform: uppercase; }
  .drawer-group-links { display: flex; flex-wrap: wrap; gap: 10px 12px; }
  .drawer-group-links a {
    border: 1px solid var(--border);
    border-radius: 999px;
    padding: 8px 14px;
    color: var(--text);
    text-decoration: none;
    font-size: 14px;
    line-height: 1;
  }
  /* Pills, not rows: the thumb rides inside the chip as a round avatar and the
     left padding tightens to sit against it. */
  .drawer-group-links a.has-thumb {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    padding-left: 5px;
  }
  .drawer-group-links a.has-thumb .submenu-thumb {
    width: 32px;
    height: 32px;
    border-radius: 999px;
  }
  .drawer-group-links a.is-emphasis { border-color: rgba(201, 162, 39, 0.4); color: var(--gold-text); }
  .drawer-group-links a:focus-visible { outline: 2px solid var(--plum); outline-offset: 2px; }
  .drawer-features { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; margin-top: 22px; }
  .drawer-feature { display: flex; flex-direction: column; gap: 8px; text-decoration: none; }
  .drawer-feature img { width: 100%; height: 120px; display: block; object-fit: cover; background: var(--border-soft); }

  .drawer-utility { display: flex; flex-direction: column; align-items: flex-start; gap: 14px; padding: 26px 0 0; }
  .drawer-utility a { color: var(--text); text-decoration: none; font-size: 15px; letter-spacing: 0.04em; }
  .drawer-signout { border: 0; padding: 0; background: transparent; color: #b3453f; font: inherit; font-size: 15px; letter-spacing: 0.04em; cursor: pointer; }
  .drawer-locale { margin: 4px 0 0; color: var(--muted-light); font-size: 12.5px; letter-spacing: 0.04em; }
}

@media (max-width: 420px) {
  .osiyan-header { --logo-scale: 0.58; }
  .drawer-link { font-size: 19px; }
  .drawer-features { grid-template-columns: 1fr; }
}

@media (prefers-reduced-motion: reduce) {
  .submenu-enter-active, .submenu-leave-active { transition: none; }
  .main-inner, .logo-crop, .logo-crop img, .nav-link { transition: none; }
}
</style>
