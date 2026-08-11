import { existsSync, readFileSync } from 'fs'
import { join, resolve } from 'path'

const AI_DESCRIPTION_PROMPT = `You are writing catalog copy for a jewellery product from its images.

Return one concise product description only.

Rules:
- 3 to 5 sentences.
- Mention the visible product type and overall silhouette first.
- Make the description as attribute-rich as possible for search.
- When visible, naturally include cues for category/subtype, material, metal color, stone type, stone color, stone shape, setting style, and standout design details.
- If the piece visually suggests a subtype like solitaire, cluster, multi-stone, open-ring, pendant, statement necklace, cuff, chain bracelet, drop, stud, jhumka, or mangal sutra, say so in natural language.
- Include fine-grained visual details that help distinguish this piece in search:
  metal color/tone, finish, stone color/type if visible, stone shape, center stone vs accent stones, setting style, motifs, links, chain style, halo/pave/cluster/open-ring/bypass/cuff/jhumka/drop/stud characteristics, engraving, grooves, ridges, filigree, cutwork, bead details, and clasp/back style when visible.
- Call out distinctive design cues such as floral, geometric, teardrop, marquise, pear, oval, emerald-cut, layered, collar, chandelier, black beads, lotus, tassel, or temple-inspired elements when they are actually visible.
- Use concrete, search-friendly jewellery language instead of generic luxury wording.
- If a detail is not visible, do not invent it, but be as specific as the image allows.
- Do not invent certifications, origin, pricing, weight, or exact carat unless visible text in the image proves it.
- Do not use bullet points or markdown.
- Keep the tone polished and premium for an ecommerce product page.
- If the image looks like a ring, necklace, bracelet, mangal sutra, or earrings, name the product type naturally.
- If details are uncertain, use careful wording like "appears" or "features".
- Prefer descriptions that would help a visual search system separate this product from similar ones.
`

const PUBLIC_DIR = resolve(new URL('../..', import.meta.url).pathname, 'public')

function imagePathToPromptUrl(image) {
  const value = String(image || '').trim()
  if (!value) return null
  if (value.startsWith('data:image/')) return value
  if (/^https?:\/\//i.test(value)) return value
  if (value.startsWith('/')) {
    const localPath = join(PUBLIC_DIR, value.replace(/^\//, ''))
    if (!existsSync(localPath)) return null
    const buf = readFileSync(localPath)
    const ext = localPath.split('.').pop()?.toLowerCase()
    const mime = ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : 'image/jpeg'
    return `data:${mime};base64,${buf.toString('base64')}`
  }
  return null
}

export async function callOpenAIVisionWithImages({
  images,
  systemPrompt,
  userPrompt,
  maxTokens = 250,
  responseFormat,
}) {
  const apiKey = String(process.env.OPENAI_API_KEY || '').trim()
  const resolvedImages = Array.isArray(images) ? images.map(imagePathToPromptUrl).filter(Boolean) : []
  if (!apiKey || !resolvedImages.length) return null

  const base = (process.env.OPENAI_API_BASE || 'https://api.openai.com/v1').replace(/\/+$/, '')
  const content = [
    { type: 'text', text: String(userPrompt || '').trim() || 'Analyze these jewellery images.' },
    ...resolvedImages.slice(0, 3).map((image) => ({
      type: 'image_url',
      image_url: { url: image },
    })),
  ]

  const body = {
    model: process.env.OPENAI_VISION_MODEL || 'gpt-4o',
    max_tokens: maxTokens,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content },
    ],
    ...(responseFormat ? { response_format: responseFormat } : {}),
  }

  const response = await fetch(`${base}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  })

  if (!response.ok) {
    const err = await response.text()
    throw new Error(`OpenAI vision error ${response.status}: ${err}`)
  }

  const data = await response.json()
  return data?.choices?.[0]?.message?.content?.trim() || null
}

export async function generateProductAiDescription({ images, category, title }) {
  return callOpenAIVisionWithImages({
    images,
    systemPrompt: AI_DESCRIPTION_PROMPT,
    userPrompt: `Product title: ${title || 'Untitled'}\nCategory: ${category || 'Unknown'}\nWrite the product description from these images.`,
    maxTokens: 220,
  })
}
