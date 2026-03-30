# Lottie Token Exporter - Figma Plugin

Exports an SVG and a sidecar JSON mapping layer colors to CDS design tokens. The sidecar feeds into the Lottie theming pipeline (`convert-to-themed-lottie.mjs`).

## Setup

1. Open Figma desktop app.
2. Go to **Plugins > Development > Import plugin from manifest...**
3. Select `figma-plugin/manifest.json` from this repo.

### Building code.ts

The plugin backend is written in TypeScript. Figma loads `code.js`, so you need to compile it:

```bash
# One-time (no bundler needed, Figma's sandbox is vanilla JS)
npx -p typescript tsc code.ts --outDir . --target ES2017 --lib ES2017 --skipLibCheck
```

Or use the Figma TypeScript plugin template's build setup if you prefer watch mode.

## Usage

1. Select a frame or group in your Figma file.
2. Run the plugin: **Plugins > Development > Lottie Token Exporter**.
3. Paste your CDS token library JSON into the textarea. The format is:
   ```json
   {
     "cds-stroke-hard": { "light": "#003872", "dark": "#7EB6FF" },
     "cds-fill-interactive-hard": { "light": "#d52c2c", "dark": "#FF6B6B" }
   }
   ```
   You can copy this from `theme-tokens.json` in the repo root.
4. Click **Export Selection**.
5. The plugin walks all layers, matches solid fill/stroke colors against token light values, and shows:
   - A table of matched token mappings
   - Warnings for any unmatched colors
6. Download the SVG and sidecar JSON files using the green buttons.

## Sidecar Format

See `sidecar-schema.json` in the repo root. Example output:

```json
{
  "version": "1.0",
  "source": "figma-plugin",
  "mappings": [
    {
      "layerPath": "Group 1/Icon/Outline",
      "property": "stroke",
      "token": "cds-stroke-hard",
      "hex": "#003872"
    }
  ]
}
```

## How Color Matching Works

- Figma stores paint RGB values in 0-1 range. The plugin converts them to hex.
- Each hex is compared (case-insensitive, exact match) against the `light` value of every token in the library.
- Unmatched colors are reported as warnings so designers can review them.
