import { ref } from 'vue'
import type { Category, Material, Color, ProductSubtype } from '../data/products'

type TabId = 'new' | 'bestseller' | 'all'

export interface CollectionPreset {
  category?: Category
  /**
   * Use when one collection page spans several categories (e.g. Bracelets &
   * Bangles). The page stays scoped to this set and the Category filter is
   * narrowed to it, so shoppers can still drill into one of them.
   */
  categories?: Category[]
  material?: Material
  color?: Color
  tab?: TabId
  subtypes?: ProductSubtype[]
}

/** The categories a preset scopes to, whether it used `category` or `categories`. */
export function presetCategories(p: CollectionPreset): Category[] {
  if (p.categories?.length) return [...p.categories]
  return p.category ? [p.category] : []
}

const preset = ref<CollectionPreset | null>(null)

// backward-compat: some components still watch presetCategory directly
const presetCategory = ref<Category | null>(null)

export function useCollectionPreset() {
  function setPreset(p: CollectionPreset) {
    preset.value = p
    presetCategory.value = p.category ?? null
  }

  function setPresetAndScroll(category: Category) {
    setPreset({ category })
    const el = document.getElementById('collections')
    el?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  function consumePreset(): CollectionPreset | null {
    const p = preset.value
    preset.value = null
    presetCategory.value = null
    return p
  }

  return { preset, presetCategory, setPreset, setPresetAndScroll, consumePreset }
}
