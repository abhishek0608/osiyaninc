import { onMounted, onUnmounted, ref } from 'vue'

// The site header is fixed and its height varies because mobile adds a search
// bar. Full-bleed pages measure it live and offset their content by exactly that,
// so nothing hides behind it.
export function useHeaderOffset() {
  const headerOffset = ref(94)
  let observer: ResizeObserver | null = null

  function syncHeaderOffset() {
    if (typeof document === 'undefined') return
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
