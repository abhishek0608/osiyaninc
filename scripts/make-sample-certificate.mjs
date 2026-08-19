// Generates the placeholder assay report shipped in public/certificates, which
// seed-dummy-certificate.mjs attaches to a demo product so the storefront's
// Certification accordion has a report to open. Writes raw PDF so it needs no
// dependency; the page is deliberately stamped SAMPLE and credits no independent
// laboratory, so it can never be mistaken for a real grading report.
//
//   node scripts/make-sample-certificate.mjs
import { writeFileSync, mkdirSync } from 'node:fs'

const W = 595.28
const H = 841.89
const GOLD = '0.788 0.635 0.153'
const INK = '0.11 0.098 0.09'
const MUTED = '0.42 0.40 0.38'

const esc = (s) => String(s).replace(/([\\()])/g, '\\$1')
const out = []
const t = (x, y, size, font, color, text) =>
  out.push(`BT ${color} rg /${font} ${size} Tf 1 0 0 1 ${x} ${y} Tm (${esc(text)}) Tj ET`)
const line = (x1, y1, x2, y2, color, w = 0.6) =>
  out.push(`${color} RG ${w} w ${x1} ${y1} m ${x2} ${y2} l S`)

// Frame
out.push(`${GOLD} RG 1.4 w 28 28 ${W - 56} ${H - 56} re S`)
out.push(`${GOLD} RG 0.5 w 34 34 ${W - 68} ${H - 68} re S`)

// Diagonal SAMPLE watermark
out.push('q 0.93 0.90 0.85 rg BT /F2 76 Tf 0.866 0.5 -0.5 0.866 105 250 Tm (SAMPLE) Tj ET Q')

let y = H - 96
t(64, y, 9, 'F2', GOLD, 'O S I Y A N   F I N E   J E W E L L E R Y')
y -= 34
t(64, y, 22, 'F2', INK, 'In-House Assay & Grading Report')
y -= 20
t(64, y, 10, 'F1', MUTED, 'Issued by Osiyan Inc. for the single piece described below')
y -= 22
line(64, y, W - 64, y, GOLD, 1)

const rows = [
  ['Report Number', 'OSY-IH-2026-0147'],
  ['Date of Issue', '19 August 2026'],
  ['Item', 'Tara Gold Hoops'],
  ['SKU / Slug', 'tara-gold-hoops'],
  ['Category', 'Earrings - Hoops (pair)'],
  ['Metal', '14K Yellow Gold, 585 fineness'],
  ['Gross Weight', '1.80 g'],
  ['Diamond Count', '2 stones'],
  ['Total Carat Weight', '0.08 ct'],
  ['Shape / Cut', 'Round Brilliant'],
  ['Colour Grade', 'G - H'],
  ['Clarity Grade', 'VS1 - VS2'],
  ['Polish / Symmetry', 'Excellent / Very Good'],
  ['Setting', 'Bezel, front-facing'],
  ['Treatments', 'None detected'],
  ['Origin', 'Natural'],
]

y -= 34
for (const [label, value] of rows) {
  t(64, y, 8.5, 'F2', MUTED, label.toUpperCase())
  t(230, y, 11, 'F1', INK, value)
  y -= 12
  line(64, y, W - 64, y, '0.90 0.88 0.85', 0.4)
  y -= 18
}

y -= 6
t(64, y, 8.5, 'F2', MUTED, 'COMMENTS')
y -= 16
t(64, y, 10, 'F1', INK, 'Weights and stone measurements are taken at the time of assay and may vary')
y -= 14
t(64, y, 10, 'F1', INK, 'slightly. Photographs are for representation purposes only.')

y -= 46
line(64, y + 14, 250, y + 14, MUTED, 0.6)
t(64, y, 8.5, 'F1', MUTED, 'Authorised signatory')
line(320, y + 14, W - 64, y + 14, MUTED, 0.6)
t(320, y, 8.5, 'F1', MUTED, 'Date')

t(64, 62, 9, 'F2', GOLD, 'SAMPLE DOCUMENT - PLACEHOLDER FOR DEMONSTRATION ONLY.')
t(64, 48, 8.5, 'F1', MUTED, 'Not a certificate of authenticity and not issued by any independent laboratory.')

const content = out.join('\n')
const objects = [
  '<< /Type /Catalog /Pages 2 0 R >>',
  '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
  `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${W} ${H}] /Resources << /Font << /F1 5 0 R /F2 6 0 R >> >> /Contents 4 0 R >>`,
  `<< /Length ${Buffer.byteLength(content, 'latin1')} >>\nstream\n${content}\nendstream`,
  '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>',
  '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>',
]

let pdf = '%PDF-1.4\n'
const offsets = []
objects.forEach((body, i) => {
  offsets.push(Buffer.byteLength(pdf, 'latin1'))
  pdf += `${i + 1} 0 obj\n${body}\nendobj\n`
})
const xrefStart = Buffer.byteLength(pdf, 'latin1')
pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`
for (const offset of offsets) pdf += `${String(offset).padStart(10, '0')} 00000 n \n`
pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF\n`

mkdirSync('public/certificates', { recursive: true })
writeFileSync('public/certificates/tara-gold-hoops-sample-report.pdf', Buffer.from(pdf, 'latin1'))
console.log('wrote public/certificates/tara-gold-hoops-sample-report.pdf')
