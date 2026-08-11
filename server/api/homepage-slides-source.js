import { prisma } from './db.js'

function normalizeSlide(slide) {
  return {
    id: slide.id,
    imageUrl: slide.imageUrl,
    mobileImageUrl: slide.mobileImageUrl || '',
    headline: slide.headline || '',
    subheadline: slide.subheadline || '',
    ctaLabel: slide.ctaLabel || '',
    ctaHref: slide.ctaHref || '',
    device: slide.device === 'desktop' || slide.device === 'mobile' ? slide.device : 'all',
    sortOrder: typeof slide.sortOrder === 'number' ? slide.sortOrder : 0,
    active: slide.active !== false,
    createdById: slide.createdById || null,
    updatedById: slide.updatedById || null,
    createdAt: slide.createdAt,
    updatedAt: slide.updatedAt,
  }
}

async function fetchHomepageSlides({ activeOnly }) {
  const rows = await prisma.homepageSlide.findMany({
    where: activeOnly ? { active: true } : undefined,
    orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
  })
  return rows.map(normalizeSlide)
}

export async function getHomepageSlides() {
  return fetchHomepageSlides({ activeOnly: true })
}

export async function getAllHomepageSlides() {
  return fetchHomepageSlides({ activeOnly: false })
}
