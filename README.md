# Osiyan — Jewellery Website

A Vue 3 + TypeScript jewellery landing page with Tailwind CSS (ect prefix).

## Run locally

```bash
npm install
npm run dev
```

Open [http://localhost:5173](http://localhost:5173). During local development,
Vite serves the functions in `api/` on the same origin and those functions read
the server-only values in `.env`. Set `VITE_API_PROXY_TARGET` only when you
intentionally want to use a separately deployed API.

## Build

```bash
npm run build
npm run preview
```

## Stack

- **Vue 3** (Composition API, `<script setup>`)
- **Vite**
- **Tailwind CSS** (all utility classes use the `ect-` prefix)
- **Fonts:** Playfair Display (headings), Cormorant Garamond (body)

## Structure

- `AppHeader` — Fixed nav with logo and links (Collections, About, Contact)
- `Hero` — Full-height hero with tagline and CTA
- `CollectionGrid` — Featured pieces with `ProductCard` components
- `AboutSection` — Short brand story
- `AppFooter` — Brand, copyright, contact email

Replace the gradient placeholders in `ProductCard` with real image URLs when you have assets.
