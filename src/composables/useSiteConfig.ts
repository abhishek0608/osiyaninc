import { computed, ref } from 'vue'
import { API_BASE } from '../config-api'

// Bundled fallback logo, used until a custom logo is configured in the
// internal workspace (or if the config request fails).
export const DEFAULT_LOGO_SRC = '/osiyan-logo.png'

export interface VolumeDiscountTier {
  minQty: number
  percent: number
}

export interface StoneSizeOption {
  value: string
  label: string
}

// Editable About Us page content, managed from the internal workspace. Empty
// strings / lists mean "use the bundled storefront defaults".
export interface AboutJourneyItem {
  year: string
  place: string
  title: string
  desc: string
  imageUrl: string
  active: boolean
}

export interface AboutTeamMember {
  name: string
  role: string
  imageUrl: string
  active: boolean
}

export interface AboutContent {
  heroEyebrow: string
  heroHeadline: string
  heroSubheadline: string
  journey: AboutJourneyItem[]
  team: AboutTeamMember[]
}

export const EMPTY_ABOUT_CONTENT: AboutContent = {
  heroEyebrow: '',
  heroHeadline: '',
  heroSubheadline: '',
  journey: [],
  team: [],
}

const logoUrl = ref('')
const volumeDiscountEnabled = ref(false)
const volumeDiscountTiers = ref<VolumeDiscountTier[]>([])
// Stone sizes (dimensions) currently in use across the catalog, ordered for
// display. Populated from /api/site-config and consumed by the product-detail
// customization size picker.
const stoneSizes = ref<StoneSizeOption[]>([])
// Per-collection tile images for the homepage "Shop by Collection" grid, keyed
// by collection slug. Empty until configured in the internal workspace.
const collectionImages = ref<Record<string, string>>({})
// About Us page content configured in the internal workspace. Stays at the
// empty defaults (and the About page renders its bundled copy) until set.
const aboutContent = ref<AboutContent>({ ...EMPTY_ABOUT_CONTENT })
const loaded = ref(false)
const loading = ref(false)

// The logo the storefront should render: the configured one when present,
// otherwise the bundled default.
const logoSrc = computed(() => logoUrl.value || DEFAULT_LOGO_SRC)

function parseVolumeDiscountTiers(raw: unknown): VolumeDiscountTier[] {
  if (!Array.isArray(raw)) return []
  return raw
    .map((t) => ({ minQty: Math.floor(Number((t as VolumeDiscountTier)?.minQty)), percent: Number((t as VolumeDiscountTier)?.percent) }))
    .filter((t) => Number.isFinite(t.minQty) && t.minQty >= 1 && Number.isFinite(t.percent) && t.percent > 0 && t.percent <= 100)
    .sort((a, b) => b.minQty - a.minQty)
}

function parseCollectionImages(raw: unknown): Record<string, string> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {}
  const images: Record<string, string> = {}
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    const slug = String(key || '').trim()
    const url = typeof value === 'string' ? value.trim() : ''
    if (slug && url) images[slug] = url
  }
  return images
}

function parseAboutContent(raw: unknown): AboutContent {
  const src = (raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {}) as Record<string, unknown>
  const str = (value: unknown) => (typeof value === 'string' ? value.trim() : '')
  const journey: AboutJourneyItem[] = Array.isArray(src.journey)
    ? (src.journey as Array<Record<string, unknown>>)
        .map((entry) => ({
          year: str(entry?.year),
          place: str(entry?.place),
          title: str(entry?.title),
          desc: str(entry?.desc),
          imageUrl: str(entry?.imageUrl),
          active: entry?.active !== false,
        }))
        .filter((entry) => entry.title)
    : []
  const team: AboutTeamMember[] = Array.isArray(src.team)
    ? (src.team as Array<Record<string, unknown>>)
        .map((entry) => ({
          name: str(entry?.name),
          role: str(entry?.role),
          imageUrl: str(entry?.imageUrl),
          active: entry?.active !== false,
        }))
        .filter((entry) => entry.name || entry.imageUrl)
    : []
  return {
    heroEyebrow: str(src.heroEyebrow),
    heroHeadline: str(src.heroHeadline),
    heroSubheadline: str(src.heroSubheadline),
    journey,
    team,
  }
}

function parseStoneSizes(raw: unknown): StoneSizeOption[] {
  if (!Array.isArray(raw)) return []
  return raw
    .map((s) => {
      const value = String((s as StoneSizeOption)?.value || '').trim()
      const label = String((s as StoneSizeOption)?.label || '').trim()
      return { value, label: label || value }
    })
    .filter((s) => s.value)
}

// Force a re-fetch so a freshly saved logo appears in the live header/footer
// (which share these module-level refs) without a full page reload.
export function invalidateSiteConfig() {
  loaded.value = false
  void ensureSiteConfigLoaded()
}

export async function ensureSiteConfigLoaded() {
  if (loaded.value || loading.value) return
  loading.value = true
  try {
    const url = new URL(`${API_BASE}/api/site-config`, window.location.origin)
    const res = await fetch(url.toString())
    const data = await res.json().catch(() => ({}))
    if (res.ok) {
      logoUrl.value = String(data?.siteConfig?.logoUrl || '')
      volumeDiscountEnabled.value = Boolean(data?.siteConfig?.volumeDiscountEnabled)
      volumeDiscountTiers.value = parseVolumeDiscountTiers(data?.siteConfig?.volumeDiscountTiers)
      collectionImages.value = parseCollectionImages(data?.siteConfig?.collectionImages)
      aboutContent.value = parseAboutContent(data?.siteConfig?.aboutContent)
      stoneSizes.value = parseStoneSizes(data?.stoneSizes)
      loaded.value = true
    }
  } catch {
    // Keep the bundled default logo on failure.
  } finally {
    loading.value = false
  }
}

export function useSiteConfig() {
  return {
    logoSrc,
    logoUrl,
    volumeDiscountEnabled,
    volumeDiscountTiers,
    collectionImages,
    aboutContent,
    stoneSizes,
    ensureSiteConfigLoaded,
    invalidateSiteConfig,
  }
}
