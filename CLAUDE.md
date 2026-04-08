# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Repo Is

A toolchain for converting light-mode Lottie animations to support dark mode via CDS (Coursera Design System) design tokens. It contains:

- **Conversion scripts** (root-level `.mjs` files) — Node.js scripts that transform Lottie JSON into themed `.lottie` files
- **Figma plugin** (`figma-plugin/`) — exports SVG + sidecar JSON mapping layers to CDS tokens
- **After Effects plugin** (`ae-plugin/`) — CEP panel giving animators a token color palette
- **Web playground** (`web/`) — Next.js app for uploading Lottie JSON + tokens, previewing light/dark/themed output

## Commands

### Root (conversion scripts)
```bash
npm install                          # install @dotlottie/dotlottie-js
node convert-theme.mjs <input.json> <tokens.json>              # brute-force light→dark swap
node convert-to-themed-lottie.mjs <input.json> <tokens.json>   # single .lottie with slots
node convert-with-sidecar.mjs <input.json> <sidecar.json> <tokens.json>  # sidecar-based (preferred)
```

### Web playground
```bash
cd web && npm install
npm run dev      # Next.js dev server at localhost:3000
npm run build    # production build
npm run lint     # ESLint
```

### Figma plugin
```bash
cd figma-plugin
npx -p typescript tsc code.ts --outDir . --target ES2017 --lib ES2017 --skipLibCheck
```
Then import `figma-plugin/manifest.json` in Figma desktop.

## Architecture

### Conversion pipeline

There are three conversion approaches, all reading from `theme-tokens.json` (format: `{ "token-name": { "light": "#hex", "dark": "#hex" } }`):

1. **`convert-theme.mjs`** — Brute-force: finds light hex values in Lottie JSON, replaces with dark. Outputs separate light/dark files. Fallback approach.
2. **`convert-to-themed-lottie.mjs`** — Slots: adds `sid` references to color properties, builds a `slots` object + Dark theme rules. Outputs a single `.lottie` with embedded theming. Preferred approach.
3. **`convert-with-sidecar.mjs`** — Sidecar-based: uses explicit layer→token mappings from `sidecar-schema.json` instead of hex matching. Eliminates ambiguity when multiple tokens share the same light hex.

All scripts walk the Lottie JSON tree looking for color properties (`ty: "fl"` fills, `ty: "st"` strokes, gradient fills/strokes) and match against token values.

### Sidecar contract

`sidecar-schema.json` defines the shared format between Figma plugin, AE plugin, and conversion script. Each mapping has `layerPath` (slash-separated layer names), `property` (fill/stroke/gradient-fill/gradient-stroke), `token`, and `hex`.

### Web app

- `web/app/page.tsx` — Single-page UI: upload Lottie JSON + tokens, calls `/api/convert`, renders three side-by-side previews (light, dark, themed with slot switching) using `@lottiefiles/dotlottie-react`
- `web/app/api/convert/` — API route that runs both conversion approaches server-side
- `web/app/lib/lottie-convert.ts` — Core conversion logic shared by the API route
- Uses Next.js 14 (App Router), Tailwind CSS, TypeScript

### Test assets

`assets/` contains sample Lottie JSON files (`Comp 1.json`, `gradient-test-*.json`, `withtheme.json`) and their converted outputs. Use these for testing conversion scripts.
