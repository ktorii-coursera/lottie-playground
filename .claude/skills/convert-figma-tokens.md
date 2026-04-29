---
name: convert-figma-tokens
description: Convert Figma-exported global colors and intent color files into the global.json token format used by the lottie playground.
user_invocable: true
---

# Convert Figma Tokens

Run the Figma token converter to regenerate `global.json` from Figma design token exports.

## Usage

```bash
npx tsx convert-figma-tokens.ts \
  --global ~/Downloads/Mode\ 1.tokens.json \
  --light ~/Downloads/Illustration\ Intent\ Colors/Lightmode.tokens.json \
  --dark ~/Downloads/Illustration\ Intent\ Colors/Darkmode.tokens.json \
  --output global.json
```

## Steps

1. Ask the user for file paths if they differ from the defaults above
2. Run the unit tests first: `npx vitest run tests/convert-figma-tokens.test.ts`
3. Run the conversion script with the provided paths
4. Report the number of tokens written and any warnings
5. Show a few sample entries from the output for spot-checking

## Input files

- `--global` — Figma global colors export (W3C Design Token format). Default: `~/Downloads/Mode 1.tokens.json`
- `--light` — Figma illustration intent colors, light mode. Default: `~/Downloads/Illustration Intent Colors/Lightmode.tokens.json`
- `--dark` — Figma illustration intent colors, dark mode. Default: `~/Downloads/Illustration Intent Colors/Darkmode.tokens.json`

## Output

`global.json` in the repo root. Format:
```json
{
  "Vegetation/Trunk": { "light": "#2D3440", "dark": "#1E2229" },
  "Canvas/background colour": { "light": "#FFFFFF", "dark": "#000000" }
}
```
