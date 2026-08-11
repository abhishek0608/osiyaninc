// Content-protection deterrents for the storefront.
//
// IMPORTANT: There is no way to truly block screenshots from a website. The OS
// (PrintScreen, macOS Cmd+Shift+4, phone screenshots, or a photo of the screen)
// is entirely outside the browser's control. These measures only deter casual
// image copying — they do not stop a determined user.

type ProtectionOptions = {
  /**
   * Block the right-click context menu on images only (stops "Save image as"
   * on product photos) while leaving the normal menu — including "Inspect" —
   * available everywhere else.
   */
  disableContextMenu?: boolean
  /** Block image dragging and selection. */
  disableImageDrag?: boolean
  /** Block common save/print keyboard shortcuts (Ctrl/Cmd+S, Ctrl/Cmd+P). */
  disableSaveShortcuts?: boolean
  /**
   * Blur the whole page when the tab loses focus. A weak anti-screenshot trick
   * that also penalises legitimate multitasking, so it is OFF by default.
   */
  blurOnBlur?: boolean
}

const DEFAULTS: Required<ProtectionOptions> = {
  disableContextMenu: true,
  disableImageDrag: true,
  disableSaveShortcuts: true,
  blurOnBlur: false,
}

let installed = false

export function useContentProtection(options: ProtectionOptions = {}) {
  if (installed || typeof window === 'undefined') return
  installed = true

  const opts = { ...DEFAULTS, ...options }

  if (opts.disableContextMenu) {
    window.addEventListener('contextmenu', (e) => {
      const target = e.target as HTMLElement | null
      if (target?.tagName === 'IMG') e.preventDefault()
    })
  }

  if (opts.disableImageDrag) {
    window.addEventListener('dragstart', (e) => {
      const target = e.target as HTMLElement | null
      if (target?.tagName === 'IMG') e.preventDefault()
    })
  }

  if (opts.disableSaveShortcuts) {
    window.addEventListener('keydown', (e) => {
      const key = e.key.toLowerCase()
      // Ctrl/Cmd+S (save), Ctrl/Cmd+P (print)
      if ((e.ctrlKey || e.metaKey) && (key === 's' || key === 'p')) {
        e.preventDefault()
      }
    })
  }

  if (opts.blurOnBlur) {
    const root = document.documentElement
    const blur = () => root.classList.add('content-protected-blur')
    const clear = () => root.classList.remove('content-protected-blur')
    window.addEventListener('blur', blur)
    window.addEventListener('focus', clear)
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') blur()
      else clear()
    })
  }
}
