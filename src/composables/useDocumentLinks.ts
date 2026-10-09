import { useRouter } from 'vue-router'

// A memo or an invoice can be saved as a PDF from its printable page
// (/documents/:kind/:id). The page is opened in a new tab with ?print=1 so the
// browser's print dialog — where "Save as PDF" lives — comes up on its own
// once the document has loaded. No server-side PDF generation is involved,
// which keeps this off the serverless function count.
export type DocumentKind = 'memo' | 'invoice'

export function useDocumentLinks() {
  const router = useRouter()
  return {
    documentHref: (kind: DocumentKind, id: string) =>
      router.resolve({ name: 'document', params: { kind, id }, query: { print: '1' } }).href,
  }
}
