import { ref, computed } from 'vue'

const STORAGE_KEY = 'kiana-saved-addresses-v1'

export const COUNTRY_OPTIONS = [
  { code: 'IN', name: 'India' },
  { code: 'US', name: 'United States' },
  { code: 'GB', name: 'United Kingdom' },
  { code: 'AE', name: 'United Arab Emirates' },
  { code: 'SG', name: 'Singapore' },
  { code: 'AU', name: 'Australia' },
  { code: 'CA', name: 'Canada' },
  { code: 'DE', name: 'Germany' },
  { code: 'FR', name: 'France' },
  { code: 'OTHER', name: 'Other' },
] as const

export function countryDisplayName(code: string): string {
  return COUNTRY_OPTIONS.find((c) => c.code === code)?.name ?? code
}

export interface SavedAddressEntry {
  id: string
  label: string
  name: string
  email: string
  phone: string
  address: string
  city: string
  state: string
  country: string
  pincode: string
}

function load(): SavedAddressEntry[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return []
    return parsed.filter(
      (x): x is SavedAddressEntry =>
        x &&
        typeof x === 'object' &&
        typeof (x as SavedAddressEntry).id === 'string' &&
        typeof (x as SavedAddressEntry).label === 'string'
    )
  } catch {
    return []
  }
}

const addresses = ref<SavedAddressEntry[]>(load())

function persist() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(addresses.value))
  } catch {
    // storage full or disabled
  }
}

function generateId(): string {
  return `addr_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`
}

export function useSavedAddresses() {
  const sorted = computed(() =>
    [...addresses.value].sort((a, b) => a.label.localeCompare(b.label, undefined, { sensitivity: 'base' }))
  )

  function getById(id: string): SavedAddressEntry | undefined {
    return addresses.value.find((a) => a.id === id)
  }

  function save(entry: Omit<SavedAddressEntry, 'id'> & { id?: string }): string {
    const id = entry.id ?? generateId()
    const full: SavedAddressEntry = { ...entry, id }
    const idx = addresses.value.findIndex((a) => a.id === id)
    if (idx >= 0) addresses.value[idx] = full
    else addresses.value.unshift(full)
    persist()
    return id
  }

  function remove(id: string) {
    addresses.value = addresses.value.filter((a) => a.id !== id)
    persist()
  }

  return { addresses: sorted, getById, save, remove }
}
