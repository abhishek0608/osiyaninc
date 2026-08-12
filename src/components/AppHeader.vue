<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useCart } from '../composables/useCart'
import { useWishlist } from '../composables/useWishlist'
import { useAuth } from '../composables/useAuth'

const route = useRoute()
const router = useRouter()
const { totalItems } = useCart()
const { count: wishlistCount } = useWishlist()
const { user, isLoggedIn, isInternalUser, logout } = useAuth()
const menuOpen = ref(false)
const accountMenuOpen = ref(false)
const accountMenuRoot = ref<HTMLElement | null>(null)
const isInternalPath = computed(() => route.path.startsWith('/internal'))
const userInitial = computed(() => user.value?.name?.trim().charAt(0).toUpperCase() || 'A')

// Collection destinations, then the standing site pages. Both breakpoints render
// the same set so the mobile drawer can't drift out of parity with the desktop bar.
const links = [
  { label: 'Earrings', to: '/collections/earrings' },
  { label: 'Rings', to: '/collections/rings' },
  { label: 'Necklaces', to: '/collections/necklaces' },
  { label: 'Bangles/Bracelets', to: '/collections/bracelets' },
  { label: 'High Jewelry', to: '/collections' },
  { label: 'Services', to: '/services' },
  { label: 'About', to: '/about' },
]

watch(() => route.fullPath, () => {
  menuOpen.value = false
  accountMenuOpen.value = false
})

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

      <nav v-if="!isInternalPath" class="osiyan-nav" aria-label="Site">
        <RouterLink v-for="item in links" :key="item.label" :to="item.to">{{ item.label }}</RouterLink>
      </nav>

      <nav class="header-actions" aria-label="Customer actions">
        <RouterLink to="/search" class="action-link search-link" aria-label="Search" title="Search">
          <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="m16.5 16.5 4 4" /></svg>
        </RouterLink>

        <RouterLink to="/wishlist" class="action-link wishlist-link" :aria-label="`Wishlist with ${wishlistCount} items`" title="Wishlist">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78L12 21.23l8.84-8.84a5.5 5.5 0 0 0 0-7.78Z" /></svg>
          <span class="wishlist-count" aria-hidden="true">{{ wishlistCount }}</span>
        </RouterLink>

        <RouterLink to="/cart" class="action-link bag-link" :aria-label="`Bag with ${totalItems} items`" title="Bag">
          <span class="bag-icon" aria-hidden="true">
            <span class="bag-handle" />
            <span class="bag-count">{{ totalItems }}</span>
          </span>
        </RouterLink>

        <RouterLink v-if="!isLoggedIn" to="/login" class="action-link account-link" aria-label="Sign in" title="Sign in">
          <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="7" r="4.5" /><path d="M3 22a9 9 0 0 1 18 0H3Z" /></svg>
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
              <RouterLink to="/account">Account Settings</RouterLink>
            </nav>

            <div class="account-signout-wrap">
              <button class="account-signout" type="button" @click="signOut">Sign out</button>
            </div>
          </div>
        </div>
      </nav>
    </div>

    <nav v-if="menuOpen" id="osiyan-mobile-nav" class="mobile-navigation" aria-label="Mobile site navigation">
      <RouterLink to="/search" class="mobile-search">
        <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="m16.5 16.5 4 4" /></svg>
        Search
      </RouterLink>
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
.logo-wordmark { width: 105px; height: 34px; }
.logo-wordmark img { left: -3.58px; top: -72.53px; width: 111.94px; }
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
.wishlist-link svg { width: 27px; height: 27px; fill: currentColor; stroke: none; }
.account-link svg { width: 26px; height: 26px; fill: currentColor; stroke: none; }
.action-link:hover { color: #777; }
.wishlist-count { position: absolute; z-index: 1; left: 0; right: 0; top: 12px; color: #fff; font-size: 9px; font-weight: 500; line-height: 1; text-align: center; }
.bag-icon { position: relative; width: 24px; height: 27px; display: block; transform: translateY(1px); }
.bag-icon::after { content: ''; position: absolute; left: 0; right: 0; top: 8px; height: 19px; border-radius: 1px 1px 2px 2px; background: var(--osiyan-plum); clip-path: polygon(10% 0, 90% 0, 100% 100%, 0 100%); }
.bag-handle { position: absolute; left: 7px; top: 0; width: 10px; height: 11px; border: 1.75px solid var(--osiyan-plum); border-bottom: 0; border-radius: 8px 8px 0 0; }
.bag-count { position: absolute; z-index: 1; left: 0; right: 0; top: 14px; color: #fff; font-size: 10px; font-weight: 500; line-height: 1; text-align: center; }
.account-menu-root { position: relative; }
.account-trigger { height: 42px; min-width: 56px; display: flex; align-items: center; justify-content: space-between; gap: 7px; border: 1px solid transparent; border-radius: 7px; padding: 3px 7px 3px 3px; color: #777; background: transparent; cursor: pointer; transition: border-color .2s ease, box-shadow .2s ease; }
.account-trigger:hover { border-color: #dedede; }
.account-trigger:focus-visible { outline: 2px solid var(--osiyan-plum); outline-offset: 2px; }
.account-avatar { width: 32px; height: 32px; display: grid; flex: 0 0 32px; place-items: center; border-radius: 50%; color: #fff; background: #111; font-size: 14px; font-weight: 600; line-height: 1; }
.account-chevron { width: 12px; height: 8px; fill: none; stroke: currentColor; stroke-width: 1.8; stroke-linecap: round; stroke-linejoin: round; transition: transform .2s ease; }
.account-chevron.is-open { transform: rotate(180deg); }
.account-dropdown { position: absolute; z-index: 10; top: calc(100% + 18px); right: 0; width: 360px; overflow: hidden; border: 1px solid #e5e3e1; border-radius: 14px; background: #fff; box-shadow: 0 18px 38px rgba(0, 0, 0, .14); color: #222; text-align: left; }
.account-profile { padding: 32px 32px 25px; }
.account-name, .account-email { overflow: hidden; margin: 0; text-overflow: ellipsis; white-space: nowrap; }
.account-name { color: #222; font-size: 22px; font-weight: 600; line-height: 1.25; }
.account-email { margin-top: 6px; color: #6b6b6b; font-size: 16px; font-weight: 400; line-height: 1.35; }
.internal-switch-row { width: 100%; min-height: 64px; display: flex; align-items: center; justify-content: space-between; margin-top: 22px; border: 0; border-radius: 13px; padding: 0 22px; color: #666; background: #f3f3f3; font: inherit; font-size: 20px; font-weight: 600; cursor: pointer; }
.internal-switch-row:focus-visible { outline: 2px solid var(--osiyan-plum); outline-offset: 2px; }
.internal-switch { position: relative; width: 58px; height: 34px; flex: 0 0 58px; border-radius: 999px; background: #bbb; transition: background .2s ease; }
.internal-switch > span { position: absolute; left: 3px; top: 3px; width: 28px; height: 28px; border-radius: 50%; background: #fff; box-shadow: 0 1px 3px rgba(0, 0, 0, .12); transition: transform .2s ease; }
.internal-switch.is-on { background: var(--osiyan-plum); }
.internal-switch.is-on > span { transform: translateX(24px); }
.account-navigation { display: flex; flex-direction: column; gap: 0; border-top: 1px solid #e9e9e9; padding: 14px 0; }
.account-navigation a { padding: 10px 32px; color: #626262; text-decoration: none; font-size: 20px; line-height: 1.35; transition: color .15s ease, background .15s ease; }
.account-navigation a:hover, .account-navigation a:focus-visible { color: #222; background: #f8f8f8; outline: none; }
.account-signout-wrap { border-top: 1px solid #e9e9e9; padding: 15px 0; }
.account-signout { width: 100%; border: 0; padding: 10px 32px; color: #f04444; background: transparent; font: inherit; font-size: 20px; line-height: 1.35; text-align: left; cursor: pointer; transition: color .15s ease, background .15s ease; }
.account-signout:hover, .account-signout:focus-visible { color: #d52e2e; background: #fff7f7; outline: none; }
.menu-toggle { display: none; }
.mobile-navigation { display: none; }

@media (max-width: 1050px) {
  .osiyan-logo-link { left: 20px; transform: scale(.9); transform-origin: left center; }
  .osiyan-nav { gap: 18px; }
  .osiyan-nav a { font-size: 16px; }
  .header-actions { right: 20px; gap: 14px; }
}

@media (max-width: 800px) {
  .osiyan-logo-link { left: 14px; top: 17px; transform: scale(.82); }
  .osiyan-nav { display: none; }
  .menu-toggle { position: absolute; right: 139px; top: 31px; display: block; width: 25px; border: 0; padding: 0; background: none; cursor: pointer; }
  .menu-toggle span { display: block; width: 23px; height: 1px; margin: 5px 0; background: #000; transition: transform .2s ease, opacity .2s ease; }
  /* Collapse the three bars into a close (X) mark while the drawer is open. */
  .menu-toggle.is-open span:first-child { transform: translateY(6px) rotate(45deg); }
  .menu-toggle.is-open span:nth-child(2) { opacity: 0; }
  .menu-toggle.is-open span:last-child { transform: translateY(-6px) rotate(-45deg); }
  .header-actions { right: 14px; gap: 10px; }
  /* The actions cluster has no room for a fourth icon beside the hamburger here,
     so search moves into the drawer instead. */
  .search-link { display: none; }
  .action-link { width: 28px; height: 32px; flex-basis: 28px; }
  .account-trigger { min-width: 36px; height: 38px; padding: 3px; }
  .account-avatar { width: 30px; height: 30px; flex-basis: 30px; font-size: 13px; }
  .account-chevron { display: none; }
  .account-dropdown { position: fixed; top: 83px; left: 14px; right: 14px; width: auto; }
  .mobile-navigation { position: absolute; top: 86px; left: 0; right: 0; min-height: calc(100vh - 86px); max-height: calc(100vh - 86px); overflow-y: auto; display: flex; flex-direction: column; padding: 34px 26px; background: #fff; }
  .mobile-navigation a { padding: 15px 0; border-bottom: 1px solid #dedede; color: #666; text-decoration: none; font-size: 24px; }
  .mobile-navigation a:focus-visible { outline: 2px solid var(--osiyan-plum); outline-offset: 2px; }
  .mobile-navigation a.router-link-active { color: #000; }
  .mobile-search { display: flex; align-items: center; gap: 12px; }
  .mobile-search svg { width: 22px; height: 22px; flex: none; fill: none; stroke: currentColor; stroke-width: 1.6; stroke-linecap: round; }
}
</style>
