import { onMounted, onUnmounted, ref } from 'vue'

// The site header sits in normal flow, but its height varies because mobile adds
// a search bar. Full-bleed pages measure it live so they can size themselves to
// the viewport minus the header instead of hardcoding a guess.
export function useHeaderOffset() {
  const headerOffset = ref(94)
  let observer: ResizeObserver | null = null

  function syncHeaderOffset() {
    if (typeof document === 'undefined') return
    // AppHeader publishes its *resting* height here. Prefer it over a live
    // measurement: the header is sticky and condenses past ~120px of scroll, so
    // measuring live would shrink this value mid-scroll and jolt every page that
    // pads by it.
    const published = getComputedStyle(document.documentElement)
      .getPropertyValue('--osiyan-header-height')
      .trim()
    const parsed = published ? Number.parseFloat(published) : Number.NaN
    if (Number.isFinite(parsed) && parsed > 0) {
      headerOffset.value = Math.ceil(parsed)
      return
    }
    // The site header is the first <header> in the document (rendered before
    // <main> in App.vue); any page-level <header> comes later in the DOM.
    const header = document.querySelector('header')
    if (header) headerOffset.value = Math.ceil(header.getBoundingClientRect().height)
  }

  onMounted(() => {
    syncHeaderOffset()
    window.addEventListener('resize', syncHeaderOffset)
    const header = typeof document !== 'undefined' ? document.querySelector('header') : null
    if (header && typeof ResizeObserver !== 'undefined') {
      observer = new ResizeObserver(syncHeaderOffset)
      observer.observe(header)
    }
  })

  onUnmounted(() => {
    window.removeEventListener('resize', syncHeaderOffset)
    observer?.disconnect()
  })

  return { headerOffset, syncHeaderOffset }
}
