/**
 * Interactive Stripe key setup.
 *
 * Run it in your own terminal:  node scripts/setup-stripe.mjs
 *
 * It prompts for the keys, so they are typed into your shell and written
 * straight to .env (which is gitignored) — they never travel through a chat
 * transcript or a shell-history entry.
 */
import { createInterface } from 'node:readline/promises'
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const ENV_PATH = join(dirname(dirname(fileURLToPath(import.meta.url))), '.env')

const FIELDS = [
  { key: 'STRIPE_SECRET_KEY', prefix: 'sk_test_', label: 'Secret key (sk_test_...)' },
  { key: 'VITE_STRIPE_PUBLISHABLE_KEY', prefix: 'pk_test_', label: 'Publishable key (pk_test_...)' },
  { key: 'STRIPE_WEBHOOK_SECRET', prefix: 'whsec_', label: 'Webhook secret (whsec_..., blank to skip for now)', optional: true },
]

const rl = createInterface({ input: process.stdin, output: process.stdout })
const values = {}

for (const field of FIELDS) {
  for (;;) {
    const answer = (await rl.question(`${field.label}: `)).trim()
    if (!answer && field.optional) break
    if (!answer) {
      console.log('  Required — paste the key from https://dashboard.stripe.com/test/apikeys')
      continue
    }
    if (!answer.startsWith(field.prefix)) {
      // sk_live_ here would be a genuine foot-gun: real cards, real money.
      console.log(`  That does not start with ${field.prefix}. Check you copied the right key (and that the dashboard is in TEST mode).`)
      continue
    }
    values[field.key] = answer
    break
  }
}
rl.close()

let env = existsSync(ENV_PATH) ? readFileSync(ENV_PATH, 'utf8') : ''
for (const [key, value] of Object.entries(values)) {
  const line = `${key}="${value}"`
  const existing = new RegExp(`^${key}=.*$`, 'm')
  env = existing.test(env) ? env.replace(existing, line) : `${env.replace(/\s*$/, '')}\n${line}\n`
}
writeFileSync(ENV_PATH, env)
console.log(`\nWrote ${Object.keys(values).length} value(s) to .env`)

// Prove the secret key is live rather than just well-formed.
const res = await fetch('https://api.stripe.com/v1/balance', {
  headers: { Authorization: `Bearer ${values.STRIPE_SECRET_KEY}` },
})
if (res.ok) {
  console.log('Secret key verified against the Stripe API.')
} else {
  const body = await res.json().catch(() => ({}))
  console.log(`Stripe rejected the secret key: ${body?.error?.message || res.status}`)
  process.exitCode = 1
}

if (!values.STRIPE_WEBHOOK_SECRET) {
  console.log('\nStill needed — without it a card charges but the order never confirms:')
  console.log('  stripe login')
  console.log('  stripe listen --forward-to localhost:4173/api/payments')
  console.log('Then re-run this script and paste the whsec_ it prints.')
}
