<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useCart } from '../composables/useCart'
import { useWishlist } from '../composables/useWishlist'
import { useAuth } from '../composables/useAuth'
import { useSearch } from '../composables/useSearch'

const route = useRoute()
const router = useRouter()
const { totalItems } = useCart()
const { count: wishlistCount } = useWishlist()
const { user, isLoggedIn, isInternalUser, logout } = useAuth()
const { query, searchByImage, submitTextSearch } = useSearch()
const menuOpen = ref(false)
const accountMenuOpen = ref(false)
const accountMenuRoot = ref<HTMLElement | null>(null)
const searchExpanded = ref(false)
const desktopSearchInput = ref<HTMLInputElement | null>(null)
const mobileSearchInput = ref<HTMLInputElement | null>(null)
const imageFileInput = ref<HTMLInputElement | null>(null)
const isInternalPath = computed(() => route.path.startsWith('/internal'))
const userInitial = computed(() => user.value?.name?.trim().charAt(0).toUpperCase() || 'A')
const wishlistBadge = computed(() => (wishlistCount.value > 9 ? '9+' : String(wishlistCount.value)))
const cartBadge = computed(() => (totalItems.value > 9 ? '9+' : String(totalItems.value)))

// Collection destinations, then the standing site pages. Both breakpoints render
// the same set so the mobile drawer can't drift out of parity with the desktop bar.
const links = [
  { label: 'Earrings', to: '/collections/earrings' },
  { label: 'Rings', to: '/collections/rings' },
  { label: 'Necklaces', to: '/collections/necklaces' },
  { label: 'Bangles/Bracelets', to: '/collections/bracelets' },
  { label: 'High Jewelry', to: '/collections' },
  { label: 'About', to: '/about' },
]

watch(() => route.fullPath, () => {
  menuOpen.value = false
  accountMenuOpen.value = false
  searchExpanded.value = false
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
  if (!loggedIn) accountMenuOpen.value = false
})

function closeAccountMenuOnOutsideClick(event: PointerEvent) {
  if (accountMenuRoot.value && !accountMenuRoot.value.contains(event.target as Node)) {
    accountMenuOpen.value = false
  }
}

function closeMenusOnEscape(event: KeyboardEvent) {
  if (event.key !== 'Escape') return
  accountMenuOpen.value = false
  menuOpen.value = false
  searchExpanded.value = false
}

async function openSearch() {
  menuOpen.value = false
  accountMenuOpen.value = false
  searchExpanded.value = true
  await nextTick()
  const input = window.matchMedia('(max-width: 1050px)').matches
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
  void router.push(isInternalPath.value ? '/' : '/internal')
}

function signOut() {
  accountMenuOpen.value = false
  logout()
  void router.push('/')
}

onMounted(() => {
  document.addEventListener('pointerdown', closeAccountMenuOnOutsideClick)
  document.addEventListener('keydown', closeMenusOnEscape)
})

onBeforeUnmount(() => {
  document.removeEventListener('pointerdown', closeAccountMenuOnOutsideClick)
  document.removeEventListener('keydown', closeMenusOnEscape)
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

  <header class="osiyan-header">
    <div class="osiyan-header-inner">
      <button
        class="menu-toggle"
        :class="{ 'is-open': menuOpen }"
        type="button"
        :aria-label="menuOpen ? 'Close menu' : 'Open menu'"
        :aria-expanded="menuOpen"
        aria-controls="osiyan-mobile-nav"
        @click="menuOpen = !menuOpen"
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

      <button type="button" class="action-link search-link-mobile" aria-label="Search" title="Search" @click="openSearch">
        <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="m16.5 16.5 4 4" /></svg>
      </button>

      <nav v-if="!isInternalPath" class="osiyan-nav" aria-label="Site">
        <RouterLink v-for="item in links" :key="item.label" :to="item.to">{{ item.label }}</RouterLink>
      </nav>

      <nav class="header-actions" aria-label="Customer actions">
        <form class="header-search search-link" :class="{ 'is-expanded': searchExpanded }" role="search" @submit.prevent="handleSearch">
          <section class="header-search-shell">
            <button type="button" class="header-search-icon" aria-label="Open search" title="Search" @click="openSearch">
              <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="m16.5 16.5 4 4" /></svg>
            </button>
            <input
              ref="desktopSearchInput"
              v-model="query"
              type="search"
              placeholder="Search jewellery…"
              aria-label="Search jewellery"
            />
            <button v-if="query" type="button" class="header-search-clear" aria-label="Clear search" @click="clearSearch">
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" /></svg>
            </button>
            <button type="button" class="header-search-camera" aria-label="Search by image" title="Search by image" @click="openImagePicker">
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6.8 6.2 8 4.4h8l1.2 1.8H20a2 2 0 0 1 2 2V18a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V8.2a2 2 0 0 1 2-2h2.8Z" /><circle cx="12" cy="13" r="4" /></svg>
            </button>
          </section>
        </form>

        <RouterLink to="/wishlist" class="action-link wishlist-link" :aria-label="`Wishlist with ${wishlistCount} items`" title="Wishlist">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78L12 21.23l8.84-8.84a5.5 5.5 0 0 0 0-7.78Z" /></svg>
          <span v-if="wishlistCount > 0" class="count-badge" aria-hidden="true">{{ wishlistBadge }}</span>
        </RouterLink>

        <RouterLink to="/cart" class="action-link bag-link" :aria-label="`Bag with ${totalItems} items`" title="Bag">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15.75 9.75V6a3.75 3.75 0 1 0-7.5 0v3.75m-2.737-2.243-1.263 12a1.125 1.125 0 0 0 1.12 1.243h13.26a1.125 1.125 0 0 0 1.12-1.243l-1.263-12a1.125 1.125 0 0 0-1.119-1.007H6.632c-.576 0-1.059.435-1.119 1.007Z" /></svg>
          <span v-if="totalItems > 0" class="count-badge" aria-hidden="true">{{ cartBadge }}</span>
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
            @click="accountMenuOpen = !accountMenuOpen"
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
              <RouterLink to="/wishlist">Wishlist</RouterLink>
              <RouterLink to="/account">Account Settings</RouterLink>
            </nav>

            <div class="account-signout-wrap">
              <button class="account-signout" type="button" @click="signOut">Sign out</button>
            </div>
          </div>
        </div>
      </nav>
    </div>

    <form v-if="searchExpanded" class="mobile-search-panel" role="search" @submit.prevent="handleSearch">
      <button type="submit" aria-label="Search" title="Search">
        <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="m16.5 16.5 4 4" /></svg>
      </button>
      <input
        ref="mobileSearchInput"
        v-model="query"
        type="search"
        placeholder="Search for jewellery…"
        aria-label="Search jewellery"
      />
      <button v-if="query" type="button" aria-label="Clear search" @click="clearSearch">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" /></svg>
      </button>
      <button type="button" aria-label="Search by image" title="Search by image" @click="openImagePicker">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6.8 6.2 8 4.4h8l1.2 1.8H20a2 2 0 0 1 2 2V18a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V8.2a2 2 0 0 1 2-2h2.8Z" /><circle cx="12" cy="13" r="4" /></svg>
      </button>
    </form>

    <nav v-if="menuOpen" id="osiyan-mobile-nav" class="mobile-navigation" aria-label="Mobile site navigation">
      <RouterLink v-for="item in links" :key="item.label" :to="item.to">{{ item.label }}</RouterLink>
    </nav>
  </header>
</template>

<style scoped>
.osiyan-header { --osiyan-plum: #574368; position: relative; z-index: 50; height: 86px; background: #fff; color: #000; border-bottom: 1px solid #ededed; }
.osiyan-header-inner { position: relative; height: 100%; width: min(100%, 1280px); margin: 0 auto; }
.osiyan-logo-link { position: absolute; left: 32px; top: 17px; height: 52px; display: flex; align-items: center; gap: 9px; text-decoration: none; }
.logo-crop { position: relative; display: block; flex: none; overflow: hidden; }
.logo-crop img { position: absolute; display: block; max-width: none; height: auto; }
.logo-mark { width: 46px; height: 46px; }
.logo-mark img { left: -18.37px; top: -4.30px; width: 82.73px; }
.logo-wordmark { width: 89.25px; height: 28.9px; }
.logo-wordmark img { left: -3.04px; top: -61.65px; width: 95.15px; }
.osiyan-nav { position: absolute; left: 50%; top: 0; height: 86px; display: flex; align-items: center; gap: clamp(18px, 1.9vw, 32px); transform: translateX(-50%); white-space: nowrap; }
/* #666 rather than a lighter grey: at 18px this text needs 4.5:1 against white. */
.osiyan-nav a { position: relative; color: #666; text-decoration: none; font-size: 18px; line-height: 1; font-weight: 400; transition: color .2s ease; }
.osiyan-nav a::after { content: ''; position: absolute; left: 0; right: 100%; bottom: -9px; height: 1px; background: #000; transition: right .2s ease; }
.osiyan-nav a:hover::after, .osiyan-nav a.router-link-active::after { right: 0; }
.osiyan-nav a:hover, .osiyan-nav a.router-link-active { color: #000; }
.osiyan-nav a:focus-visible, .osiyan-logo-link:focus-visible, .action-link:focus-visible, .menu-toggle:focus-visible { outline: 2px solid var(--osiyan-plum); outline-offset: 4px; border-radius: 2px; }
.header-actions { position: absolute; right: 32px; top: 0; height: 86px; display: flex; align-items: center; gap: 18px; }
.action-link { position: relative; width: 32px; height: 32px; display: grid; flex: 0 0 32px; place-items: center; color: var(--osiyan-plum); text-decoration: none; }
.action-link svg { width: 23px; height: 23px; fill: none; stroke: currentColor; stroke-width: 1.55; stroke-linecap: round; stroke-linejoin: round; }
.search-file-input { display: none; }
.header-search { position: relative; z-index: 2; width: 32px; height: 40px; flex: 0 0 32px; }
.header-search-shell { position: absolute; right: 0; top: 50%; width: 32px; height: 40px; display: flex; align-items: center; overflow: hidden; border: 1px solid transparent; border-radius: 999px; background: #fff; transform: translateY(-50%); transition: width .25s ease, border-color .2s ease, box-shadow .2s ease; }
.header-search.is-expanded .header-search-shell, .header-search:focus-within .header-search-shell { width: 250px; border-color: #ded8e2; box-shadow: 0 5px 20px rgba(42, 31, 49, .12); }
.header-search-icon, .header-search-clear, .header-search-camera { width: 32px; height: 32px; display: grid; flex: 0 0 32px; place-items: center; border: 0; padding: 0; color: var(--osiyan-plum); background: transparent; cursor: pointer; }
.header-search-icon svg { width: 23px; height: 23px; }
.header-search-clear svg, .header-search-camera svg { width: 18px; height: 18px; }
.header-search input { width: 0; min-width: 0; border: 0; padding: 0; color: #222; background: transparent; font: inherit; font-size: 14px; outline: none; opacity: 0; transition: width .25s ease, opacity .15s ease; }
.header-search.is-expanded input, .header-search:focus-within input { width: 158px; padding: 0 6px; opacity: 1; }
.header-search-camera { visibility: hidden; opacity: 0; transition: opacity .15s ease; }
.header-search.is-expanded .header-search-camera, .header-search:focus-within .header-search-camera { visibility: visible; opacity: 1; }
.header-search button:hover { color: #777; }
.header-search button:focus-visible, .mobile-search-panel button:focus-visible, .mobile-search-panel input:focus-visible { outline: 2px solid var(--osiyan-plum); outline-offset: 1px; }
.mobile-search-panel { display: none; }
.wishlist-link svg { width: 24px; height: 24px; }
.account-link svg { width: 24px; height: 24px; }
.action-link:hover { color: #777; }
/* Mobile-only search that sits beside the logo; desktop keeps search in the actions cluster. */
.search-link-mobile { display: none; }
/* Corner badge shared by wishlist and bag; rendered only when the count is non-zero. */
.count-badge { position: absolute; z-index: 1; top: -3px; right: -6px; min-width: 17px; height: 17px; display: grid; place-items: center; padding: 0 4px; border-radius: 999px; background: var(--osiyan-plum); color: #fff; font-size: 10px; font-weight: 600; line-height: 1; box-shadow: 0 0 0 2px #fff; }
.account-menu-root { position: relative; }
.account-trigger { height: 42px; min-width: 56px; display: flex; align-items: center; justify-content: space-between; gap: 7px; border: 1px solid transparent; border-radius: 7px; padding: 3px 7px 3px 3px; color: #777; background: transparent; cursor: pointer; transition: border-color .2s ease, box-shadow .2s ease; }
.account-trigger:hover { border-color: #dedede; }
.account-trigger:focus-visible { outline: 2px solid var(--osiyan-plum); outline-offset: 2px; }
.account-avatar { width: 32px; height: 32px; display: grid; flex: 0 0 32px; place-items: center; border-radius: 50%; color: #fff; background: var(--osiyan-plum); font-size: 14px; font-weight: 600; line-height: 1; }
.account-chevron { width: 12px; height: 8px; fill: none; stroke: currentColor; stroke-width: 1.8; stroke-linecap: round; stroke-linejoin: round; transition: transform .2s ease; }
.account-chevron.is-open { transform: rotate(180deg); }
.account-dropdown { position: absolute; z-index: 10; top: calc(100% + 18px); right: 0; width: 300px; overflow: hidden; border: 1px solid #e5e3e1; border-radius: 14px; background: #fff; box-shadow: 0 18px 38px rgba(0, 0, 0, .14); color: #222; text-align: left; }
.account-profile { padding: 24px 28px 20px; }
.account-name, .account-email { overflow: hidden; margin: 0; text-overflow: ellipsis; white-space: nowrap; }
.account-name { color: #222; font-size: 18px; font-weight: 600; line-height: 1.25; }
.account-email { margin-top: 4px; color: #6b6b6b; font-size: 14px; font-weight: 400; line-height: 1.35; }
.internal-switch-row { width: 100%; min-height: 54px; display: flex; align-items: center; justify-content: space-between; margin-top: 18px; border: 0; border-radius: 13px; padding: 0 18px; color: #666; background: #f3f3f3; font: inherit; font-size: 16px; font-weight: 600; cursor: pointer; }
.internal-switch-row:focus-visible { outline: 2px solid var(--osiyan-plum); outline-offset: 2px; }
.internal-switch { position: relative; width: 58px; height: 34px; flex: 0 0 58px; border-radius: 999px; background: #bbb; transition: background .2s ease; }
.internal-switch > span { position: absolute; left: 3px; top: 3px; width: 28px; height: 28px; border-radius: 50%; background: #fff; box-shadow: 0 1px 3px rgba(0, 0, 0, .12); transition: transform .2s ease; }
.internal-switch.is-on { background: var(--osiyan-plum); }
.internal-switch.is-on > span { transform: translateX(24px); }
.account-navigation { display: flex; flex-direction: column; gap: 0; border-top: 1px solid #e9e9e9; padding: 10px 0; }
.account-navigation a { padding: 9px 28px; color: #626262; text-decoration: none; font-size: 15px; line-height: 1.35; transition: color .15s ease, background .15s ease; }
.account-navigation a:hover, .account-navigation a:focus-visible { color: #222; background: #f8f8f8; outline: none; }
.account-signout-wrap { border-top: 1px solid #e9e9e9; padding: 10px 0; }
.account-signout { width: 100%; border: 0; padding: 9px 28px; color: #f04444; background: transparent; font: inherit; font-size: 15px; line-height: 1.35; text-align: left; cursor: pointer; transition: color .15s ease, background .15s ease; }
.account-signout:hover, .account-signout:focus-visible { color: #d52e2e; background: #fff7f7; outline: none; }
.menu-toggle { display: none; }
.mobile-navigation { display: none; }

/* The centered nav needs ~1035px of viewport before it stops colliding with the
   logo and action icons, so tablets get the drawer too. */
@media (max-width: 1050px) {
  .osiyan-logo-link { left: 14px; top: 17px; transform: scale(.82); transform-origin: left center; }
  .osiyan-nav { display: none; }
  .menu-toggle { position: absolute; right: 139px; top: 31px; display: block; width: 25px; border: 0; padding: 0; background: none; cursor: pointer; }
  .menu-toggle span { display: block; width: 23px; height: 1px; margin: 5px 0; background: #000; transition: transform .2s ease, opacity .2s ease; }
  /* Collapse the three bars into a close (X) mark while the drawer is open. */
  .menu-toggle.is-open span:first-child { transform: translateY(6px) rotate(45deg); }
  .menu-toggle.is-open span:nth-child(2) { opacity: 0; }
  .menu-toggle.is-open span:last-child { transform: translateY(-6px) rotate(-45deg); }
  .header-actions { right: 14px; gap: 10px; }
  /* The actions cluster has no room for a fourth icon beside the hamburger here,
     so search sits next to the logo instead. */
  .search-link { display: none; }
  .search-link-mobile { position: absolute; left: 140px; top: 27px; display: grid; }
  button.search-link-mobile { border: 0; padding: 0; background: transparent; cursor: pointer; }
  .mobile-search-panel { position: absolute; z-index: 4; top: 86px; left: 0; right: 0; height: 62px; display: flex; align-items: center; margin: 0; border-top: 1px solid #eee; border-bottom: 1px solid #e5e5e5; padding: 9px 14px; background: #fff; box-shadow: 0 7px 14px rgba(0, 0, 0, .08); }
  .mobile-search-panel button { width: 38px; height: 38px; display: grid; flex: 0 0 38px; place-items: center; border: 0; padding: 0; color: var(--osiyan-plum); background: transparent; cursor: pointer; }
  .mobile-search-panel svg { width: 20px; height: 20px; fill: none; stroke: currentColor; stroke-width: 1.65; stroke-linecap: round; stroke-linejoin: round; }
  .mobile-search-panel input { min-width: 0; flex: 1; border: 0; padding: 8px 5px; color: #222; background: transparent; font: inherit; font-size: 16px; outline: none; }
  .mobile-search-panel input::placeholder { color: #999; }
  .action-link { width: 28px; height: 32px; flex-basis: 28px; }
  .account-trigger { min-width: 36px; height: 38px; padding: 3px; }
  .account-avatar { width: 30px; height: 30px; flex-basis: 30px; font-size: 13px; }
  .account-chevron { display: none; }
  .account-dropdown { position: fixed; top: 83px; left: 14px; right: 14px; width: auto; }
  .mobile-navigation { position: absolute; top: 86px; left: 0; right: 0; min-height: calc(100vh - 86px); max-height: calc(100vh - 86px); overflow-y: auto; display: flex; flex-direction: column; padding: 34px 26px; background: #fff; }
  .mobile-navigation a { padding: 15px 0; border-bottom: 1px solid #dedede; color: #666; text-decoration: none; font-size: 24px; }
  .mobile-navigation a:focus-visible { outline: 2px solid var(--osiyan-plum); outline-offset: 2px; }
  .mobile-navigation a.router-link-active { color: #000; }
}

/* Narrow phones: shrink the logo a touch more so search clears the hamburger. */
@media (max-width: 360px) {
  .osiyan-logo-link { transform: scale(.7); }
  .search-link-mobile { left: 122px; }
}
</style>
