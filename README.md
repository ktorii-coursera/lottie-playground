# Lottie Theme Conversion Scripts

Two scripts for converting light-mode Lottie animations to support dark mode, using different approaches.

## Setup

```bash
npm install
```

## Token Map

Both scripts read from a `theme-tokens.json` file that maps design token names to light/dark color pairs:

```json
{
  "cds-stroke-hard": { "light": "#003872", "dark": "#7EB6FF" },
  "cds-fill-interactive-hard": { "light": "#d52c2c", "dark": "#FF6B6B" }
}
```

The `light` value is what the script looks for in the Lottie JSON. The `dark` value is the replacement.

---

## How They Work

Both scripts walk the Lottie JSON, find color values that match a token's light hex, and replace or slot them with the corresponding dark color — they differ in whether the output is two separate files or a single themed file.

### Script 1: Brute-Force Swap

```
┌──────────────────┐     ┌──────────────┐     ┌───────────────────┐
│  Comp 1.json     │     │ theme-tokens │     │  convert-theme    │
│  (light colors)  │────▶│  light→dark  │────▶│  find & replace   │
│                  │     │  hex pairs   │     │  all matching     │
└──────────────────┘     └──────────────┘     └────────┬──────────┘
                                                       │
                                          ┌────────────┴────────────┐
                                          ▼                         ▼
                                  ┌──────────────┐        ┌──────────────┐
                                  │ Comp 1-dark  │        │ Comp 1-dark  │
                                  │    .json     │        │   .lottie    │
                                  │ (all dark)   │        │  (all dark)  │
                                  └──────────────┘        └──────────────┘
```

### Script 2: Lottie Slots (Internal Theming)

```
┌──────────────────┐     ┌──────────────┐     ┌────────────────────┐
│  Comp 1.json     │     │ theme-tokens │     │ convert-to-themed  │
│  (light colors)  │────▶│  light→dark  │────▶│ 1. add sid to      │
│                  │     │  hex pairs   │     │    color props     │
└──────────────────┘     └──────────────┘     │ 2. build slots     │
                                              │ 3. build Dark rules│
                                              └────────┬───────────┘
                                                       │
                                                       ▼
                                              ┌──────────────────┐
                                              │ Comp 1-themed    │
                                              │    .lottie       │
                                              │                  │
                                              │ ┌──────────────┐ │
                                              │ │manifest.json │ │
                                              │ │ animations + │ │
                                              │ │ themes decl  │ │
                                              │ └──────────────┘ │
                                              │ ┌──────────────┐ │
                                              │ │a/Comp 1.json │ │
                                              │ │ slots{}      │ │
                                              │ │ sid refs     │ │
                                              │ │ (light=default)│
                                              │ └──────────────┘ │
                                              │ ┌──────────────┐ │
                                              │ │t/Dark.json   │ │
                                              │ │ rules[]      │ │
                                              │ │ (dark colors)│ │
                                              │ └──────────────┘ │
                                              └──────────────────┘
```

---

## Script 1: `convert-theme.mjs` (Brute-Force Swap)

Produces a **separate dark-mode Lottie file** by finding and replacing all matching light colors with their dark equivalents.

```bash
node convert-theme.mjs <input.json> <theme-tokens.json>
```

**Example:**

```bash
node convert-theme.mjs "assets/Comp 1.json" theme-tokens.json
```

**Output:**

- `assets/Comp 1-dark.json` — dark-mode Lottie JSON
- `assets/Comp 1-dark.lottie` — dark-mode dotLottie

**How it works:**

1. Reads the token map and builds a `lightHex → darkHex` lookup
2. Walks every color property in the Lottie JSON (fills, strokes, animated keyframes)
3. If a color matches a light hex (within ±1 per channel for rounding tolerance), replaces it with the dark hex
4. Writes the modified JSON and packages it as a `.lottie`

**Use case:** You need two completely separate files — one for light, one for dark. The player doesn't need to support theming. Simple and works with any Lottie player.

**Note:** Eng side wants to avoid maintaining two separate dark mode approaches (separate files vs. slots). Script 2 (slots) is the preferred path forward since it keeps theming in a single file and aligns with how the player handles dark mode for other assets. Script 1 exists as a reference/fallback.

---

## Script 2: `convert-to-themed-lottie.mjs` (Lottie Slots / Internal Theming)

Produces a **single `.lottie` file** that contains both light and dark themes using Lottie's built-in slot mechanism.

```bash
node convert-to-themed-lottie.mjs <input.json> <theme-tokens.json>
```

**Example:**

```bash
node convert-to-themed-lottie.mjs "assets/Comp 1.json" theme-tokens.json
```

**Output:**

- `assets/Comp 1-themed.json` — Lottie JSON with `slots` and `sid` references added
- `assets/Comp 1-themed.lottie` — dotLottie containing both Default and Dark themes

**How it works:**

1. Reads the token map and builds a `lightHex → token` lookup
2. Walks the entire Lottie JSON looking for any color property matching a token value
3. If a color matches a light hex, adds `"sid": "token-name"` to that property
4. Builds a top-level `slots` object with the default (light) values
5. Creates a Dark theme rules file (`t/Dark.json`) with the dark color overrides
6. Packages everything into a dotLottie v2 container

**The `.lottie` file structure:**

```
Comp 1-themed.lottie (zip)
├── manifest.json           # declares animation + "Dark" theme
├── a/Comp 1.json           # Lottie JSON with slots + sid references
└── t/Dark.json             # dark color overrides keyed by slot id
```

**Use case:** You want a single file that supports runtime theme switching. Requires a dotLottie-aware player (e.g., `@lottiefiles/dotlottie-web`).

---

## Limitations

### 1. Ambiguous token matching

The scripts match colors by their light hex value. If **multiple tokens share the same light color but have different dark colors**, the script cannot determine which token applies. It will warn and use the first match.

Example problem:

```json
{
  "cds-stroke-hard": { "light": "#003872", "dark": "#7EB6FF" },
  "cds-border-accent": { "light": "#003872", "dark": "#4A90D9" }
}
```

Both tokens have light `#003872` but different dark values. The script has no way to know which one the animator intended for a given stroke or fill.

### 2. Animators are restricted to token colors only

For theming to work, every visible color in the animation must be an exact match to a token's light value. This means:

- Animators **cannot use arbitrary colors** — only colors from the token map will be detected and themed
- Any color that doesn't match a token is left as-is in both light and dark mode
- This can lead to visual inconsistencies if an animator introduces a color that's close to but not exactly a token value

### 3. Gradients (partial support)

Lottie gradients (`gf` for gradient fill, `gs` for gradient stroke) use a different data structure — an array of color stops rather than a single `[r, g, b]` value. The brute-force swap script handles gradient stops, and the themed script can slot full gradients. However, if a gradient mixes token colors with non-token colors in its stops, only the matching stops are swapped/slotted. Gradients where the designer derived lighter/darker shades from a base token (e.g., a gradient from `#003872` to a 40% lighter variant) will only catch the exact token match, leaving the derived shade unchanged.

### 4. Special effects, shadows, and ambient occlusion

Lottie doesn't have native ambient occlusion or real shadow systems, but animators often fake these with:

- **Semi-transparent overlays** — dark shapes with reduced opacity layered on top
- **Gaussian blur + offset layers** — simulating drop shadows
- **Tinted duplicates** — copies of shapes with darker/lighter colors for depth

These shading techniques typically use colors that are **derived from but not identical to** the base token colors (e.g., a shadow might be a 50% opacity black overlay, or a slightly darker variant of the fill). The scripts won't catch these because they don't match any token exactly.

This means animators doing higher-fidelity work with shading and depth effects either:

- Must manually create dark-mode variants of those effects
- Must limit shading to techniques that don't depend on color (e.g., opacity-only overlays with black/white that work in both themes)

### 5. Animated colors (partial support)

- **`convert-theme.mjs`**: Handles animated colors — it checks keyframe start (`s`) and end (`e`) values
- **`convert-to-themed-lottie.mjs`**: Only handles **static colors** (`a: 0`). Animated color properties (`a: 1`) are skipped. Lottie's slot mechanism can override animated colors via keyframes in the theme rules, but this script does not generate those.

### 6. Color matching is value-based

Both scripts match colors purely by comparing `[r, g, b]` values against the token map. This means any color property in the Lottie JSON that matches a token's light value will be swapped/slotted — including fills, strokes, effects, text colors, and solid layers. The tradeoff is that if a non-color property happens to have a 3-element numeric array matching a token color, it could be a false positive (unlikely in practice).

### 7. Needs validation with real production animations

Need to test with complex lottie animations our animators actually use, in case colors are handled differently than what we expect (like a single color hex with effects applied on top, or if the export actually calculates the color values at gradient stops from effects rather than preserving the original hex).

---

## Proposed approach: plugin-based token tagging

The current scripts rely on post-export color matching, which is fragile (see limitations above). A better long-term approach is to tag colors with their token names at design time, so the conversion script knows exactly which token each color belongs to without guessing from hex values.

### Overview

```
┌─────────────┐     ┌──────────────────┐     ┌──────────────────┐     ┌──────────────┐     ┌─────────────────┐
│   Figma      │     │  Figma Plugin    │     │  After Effects   │     │  Bodymovin   │     │  Our Script     │
│  (tokens)    │────▶│  exports SVG +   │────▶│  AE Plugin gives │────▶│  exports     │────▶│  reads sidecar, │
│              │     │  sidecar mapping │     │  animators token │     │  Lottie JSON │     │  adds sid/slots │
└─────────────┘     └──────────────────┘     │  color palette   │     │  (untouched) │     │  (no guessing)  │
                                             └──────────────────┘     └──────────────┘     └─────────────────┘
```

### Step 1: Figma Plugin

Designers create illustrations in Figma using CDS design tokens. A Figma plugin exports:

- The SVG file (as usual)
- A **sidecar mapping file** that records which token was used for each element, at the layer+property level:

```json
{
  "mappings": [
    { "layer": "Icon outline", "property": "stroke", "token": "cds-stroke-hard" },
    { "layer": "Background", "property": "fill", "token": "cds-fill-interactive-hard" },
    { "layer": "Border ring", "property": "stroke", "token": "cds-border-accent" }
  ]
}
```

This solves the ambiguity problem: even if `cds-stroke-hard` and `cds-border-accent` share the same light hex, the sidecar knows which layer uses which token.

### Step 2: After Effects Plugin

The animator imports the SVG into AE. An AE plugin/script:

- Reads the sidecar mapping (or syncs with the CDS token library directly)
- Provides a **token color palette** so the animator picks colors by token name, not by hex
- When the animator applies a color, the plugin records which token was used on which shape/property
- On export, the plugin writes an updated sidecar file with any color changes the animator made

This means animators can change colors during animation, but only from the token library. The mapping stays intact.

### Step 3: Conversion Script

Our existing script reads the sidecar instead of doing hex-based color matching. It knows the exact token for each layer+property, so it can:

- Add `sid` references with zero ambiguity
- Build the dark theme rules correctly
- Warn if any colors in the Lottie JSON don't have a sidecar entry (meaning the animator introduced an untracked color)

### What this doesn't solve

- Effects that derive new colors from a base (e.g., AE calculates gradient stops or glow colors from a source color). These derived values won't be in the sidecar.
- Any color introduced outside the token palette in AE

---

## Open questions for the animation team

The answers here determine which approach we take.

1. **Do animators change colors inside After Effects?** Or do they always use exactly what comes from Figma?
   - If no: Figma plugin + sidecar is enough, no AE plugin needed.
   - If yes: we need the AE plugin with a token palette to keep mappings intact.

2. **Do AE effects introduce new color values?** For example, does applying a glow, shadow, or tint effect cause Bodymovin to export calculated color values at each stop/keyframe that differ from the original hex? Or does the Lottie JSON preserve the original color and represent the effect separately?
   - If effects preserve original colors: our approach works.
   - If effects calculate new derived colors: color matching (and possibly the plugin approach) breaks for those values, and we need a different strategy.

3. **Are animators OK with only using colors from the CDS token library?** The plugin approach restricts the palette to defined tokens.
   - If yes: plugin approach works cleanly.
   - If no: we need to support arbitrary colors alongside tokens, which complicates the mapping and theming story significantly.

4. **Do animators create new elements directly in After Effects?** The Figma plugin can only tag colors that originate from Figma. Any new shapes, fills, or strokes created directly in AE would have no token mapping in the sidecar. The AE plugin exists to cover this case (animators would use its token palette to apply colors), but this only works if animators actually use it for every color they touch. If someone creates a new shape in AE and picks a color from the regular color picker instead of the token palette, that color is invisible to the theming pipeline and won't get a dark mode variant.

---

## Tools

Working implementations of all three pieces live in this repo. They share a common sidecar JSON format defined in `sidecar-schema.json`.

### Figma Plugin (`figma-plugin/`)

Exports an SVG and a sidecar JSON that maps each layer's colors to CDS design tokens.

**Setup:**
1. Open Figma desktop app
2. Go to **Plugins > Development > Import plugin from manifest...**
3. Select `figma-plugin/manifest.json`
4. Compile the TypeScript:
   ```bash
   cd figma-plugin
   npx -p typescript tsc code.ts --outDir . --target ES2017 --lib ES2017 --skipLibCheck
   ```

**Usage:**
1. Select a frame or group in Figma
2. Run the plugin: **Plugins > Development > Lottie Token Exporter**
3. Paste the CDS token library JSON (same format as `theme-tokens.json`)
4. Click **Export Selection**
5. The plugin walks all layers, matches fill/stroke colors to token light values, and shows matched mappings + warnings for unmatched colors
6. Download the SVG and sidecar JSON

### After Effects Plugin (`ae-plugin/`)

A CEP panel that gives animators a token color palette and tracks which token is applied to which layer.

**Setup:**
1. Replace `ae-plugin/CSInterface.js` with the official Adobe version from [CEP-Resources](https://github.com/AdobeDev/CEP-Resources/blob/master/CEP_11.x/CSInterface.js)
2. Enable unsigned extensions:
   ```bash
   # macOS
   defaults write com.adobe.CSXS.11 PlayerDebugMode 1
   # Windows: set PlayerDebugMode=1 in HKEY_CURRENT_USER\Software\Adobe\CSXS.11
   ```
3. Symlink to AE's extensions directory:
   ```bash
   # macOS
   ln -s "$(pwd)/ae-plugin" ~/Library/Application\ Support/Adobe/CEP/extensions/com.coursera.lottie.tokenpainter
   # Windows
   mklink /D "%APPDATA%\Adobe\CEP\extensions\com.coursera.lottie.tokenpainter" "%CD%\ae-plugin"
   ```
4. Restart After Effects, then go to **Window > Extensions > Lottie Token Painter**

**Usage:**
1. Paste token library JSON and click **Parse Tokens** to see the color palette
2. Select a shape layer in AE, click a token in the palette, choose the property type (fill/stroke/all)
3. Click **Apply to Selected**, the light color is applied and the mapping is recorded
4. **Import Sidecar** to load an existing sidecar from the Figma plugin
5. **Export Sidecar** to save all mappings for the conversion script

### Sidecar Conversion Script (`convert-with-sidecar.mjs`)

Converts a Lottie JSON to a themed dotLottie using exact token mappings from the sidecar instead of hex-based guessing.

**Usage:**
```bash
node convert-with-sidecar.mjs <input.json> <sidecar.json> <theme-tokens.json>
```

**Example:**
```bash
node convert-with-sidecar.mjs "assets/Comp 1.json" "assets/comp1-sidecar.json" theme-tokens.json
```

**Output:**
- `assets/Comp 1-themed.json` - Lottie JSON with `slots` and `sid` references
- `assets/Comp 1-themed.lottie` - dotLottie with Dark theme

**What it does:**
1. Reads the Lottie JSON and walks the tree, building layer paths from `nm` (name) fields
2. Matches each path against the sidecar's `layerPath` entries
3. For each match, adds `sid` to the correct color property (`fill` → `ty: "fl"`, `stroke` → `ty: "st"`, etc.)
4. Validates the actual color in the Lottie matches the sidecar's expected hex (warns on mismatch)
5. Warns about stale sidecar entries that don't match any layer
6. Builds slots + Dark theme rules from the token library
7. Packages as a dotLottie with the Dark theme embedded

**Fallback:** If no sidecar is available, use the existing `convert-to-themed-lottie.mjs` which does hex-based matching.

### Sidecar Format

All three tools produce and consume the same JSON format:

```json
{
  "version": "1.0",
  "source": "figma-plugin",
  "mappings": [
    {
      "layerPath": "Shape Layer 1/Polystar 1/Fill 1",
      "property": "fill",
      "token": "cds-fill-interactive-hard",
      "hex": "#d52c2c"
    }
  ]
}
```

- `layerPath`: slash-separated path of layer names from root to the target shape
- `property`: `fill`, `stroke`, `gradient-fill`, or `gradient-stroke`
- `token`: CDS token name
- `hex`: expected light-mode hex (used for validation)

Full schema: `sidecar-schema.json`

### End-to-end workflow

```
1. Designer creates illustration in Figma using CDS token colors
2. Figma plugin exports SVG + sidecar.json
3. Animator imports SVG into After Effects
4. AE plugin imports the sidecar, provides token palette
5. Animator animates (changes colors only via the token palette)
6. AE plugin exports updated sidecar.json
7. Bodymovin exports Lottie JSON as usual
8. Conversion script reads Lottie JSON + sidecar → themed .lottie with dark mode
```

---

## Workstream assignments

All three workstreams can run in parallel. The sidecar schema (`sidecar-schema.json`) is the shared contract.

- **Dylan Parks** - Figma Plugin: refine and test `figma-plugin/` with real Figma illustrations
- **Abhishek Vishwakarma** - AE Plugin: refine and test `ae-plugin/` in After Effects with real animations
- **Shivam Thapliyal** - Conversion Script: refine `convert-with-sidecar.mjs`, test with complex production animations
