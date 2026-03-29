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

### 3. Gradients are not supported

Lottie gradients (`gf` for gradient fill, `gs` for gradient stroke) use a different data structure — an array of color stops rather than a single `[r, g, b]` value. Neither script currently handles gradients. Gradient colors will remain unchanged.

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
