# Mayank

A reviewed marketplace for startup-built digital assets. Static multi-page site with Vercel Functions for enquiries, listings and sign-ups.

## Structure
- `src/layout.html` shared layout (loader, header, footer); `src/pages/*.html` pages; `src/record.html` record page template
- `data/catalogue.json` Edition 01 sample records
- `public/` CSS, JS and images, copied into `dist/`
- `api/` Vercel Functions: `enquiries`, `listings`, `subscribe` (Neon Postgres + Vercel Blob)
- `scripts/build.mjs` builds `dist/`; `scripts/dev.mjs` local server

## Develop
```bash
npm install
vercel env pull .env.local   # DATABASE_URL, BLOB_READ_WRITE_TOKEN
npm run dev                  # http://localhost:3000
```

## Environment
`DATABASE_URL`, `BLOB_READ_WRITE_TOKEN` (required). Optional email to the review desk: `RESEND_API_KEY`, `MAYANK_INBOX_EMAIL`, `MAYANK_FROM_EMAIL`. Optional `SITE_URL` for canonical links.
