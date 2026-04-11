# Intent-Token Converter v2 — Implementation Plan

## Problem

The existing `convert-to-themed-lottie.mjs` matches Lottie colors to design tokens by **hex value**. This has two critical issues:

1. **Ambiguity**: When multiple tokens share the same light-mode hex, the script picks the first match arbitrarily.
2. **Animated colors are skipped**: The script only processes static colors (`a: 0`). But real Lottie animations have animated fills (`a: 1`) where the color transitions between keyframes — these are silently ignored.

The sample Lottie we're working with has **all animated fills**. The existing script produces zero matches.

## Solution

A new standalone v2 conversion script that uses **layer names as intent tokens**. In the Lottie JSON, each shape layer is named after a CDS design token (e.g. `mat-hard-lit-primary-side-face`). The script:

1. Looks up each layer's name in `global.json` to determine if it's a themed layer
2. For animated fills/strokes, walks each keyframe and hex-matches individual colors against `global.json` to build dark-mode equivalents
3. Outputs a themed `.lottie` with light/dark support

---

## Part 1: `global.json` — Token Definitions

**File**: `global.json` (repo root)

Stores all light/dark intent tokens. Extends the `{ tokenName: { light, dark } }` format from `theme-tokens.json` with an optional `alpha` field (0-1, defaults to 1 if omitted). In Lottie, alpha maps to the fill/stroke `o` (opacity) property (0-100 scale).

```json
{
  "mat-hard-lit-primary-side-face":          { "light": "#E7D9FF", "dark": "#F5EFFF" },
  "mat-hard-lit-primary-side-soft-shadow":   { "light": "#A678F5", "dark": "#D1B6FF" },
  "mat-hard-lit-primary-side-hard-shadow":   { "light": "#ADCFFF", "dark": "#CFE3FF" },
  "side-face-disabled-strong":               { "light": "#7E7E7E", "dark": "#A3A3A3" },
  "side-soft-shadow-disabled-strong":        { "light": "#5F5F5F", "dark": "#868686" },
  "side-hard-shadow-disabled-strong":        { "light": "#434343", "dark": "#9F9F9F" },
  "page-bg":                                 { "light": "#F5F5F5", "dark": "#2B2B2B" },
  "shadow-pink":                             { "light": "#FF82E7", "dark": "#FF82E7" },
  "shadow-cast":                             { "light": "#000000", "dark": "#000000" },
  "light-orange-1":                          { "light": "#F20000", "dark": "#FFA3A3", "alpha": 0 },
  "light-orange-2":                          { "light": "#F28100", "dark": "#F9C992" }
}
```

Source: Figma "Light/Dark" token table from the POC (11 tokens).

---

## Part 2: `lib/intent-token-converter.ts` — Core Conversion Logic

**File**: `lib/intent-token-converter.ts`

A pure ES module exporting testable functions. All inputs are parameters (dependency injection) — no file I/O, no side effects.

### Exported functions

```javascript
export function hexToRgb01(hex)
// "#A678F5" → [0.6510, 0.4706, 0.9608]

export function rgbToHex(r, g, b)
// (0.6510, 0.4706, 0.9608) → "#a678f5"

export function colorsMatch(lottieRgb, targetHex)
// Fuzzy match: ±1 per channel after rounding to 0-255

export function convertWithIntentTokens(lottieData, tokens)
// Main conversion. Returns { data, slots, darkRules, logs }
```

### `convertWithIntentTokens` algorithm — step by step

**Input**:
- `lottieData`: Raw Lottie JSON object
- `tokens`: Object like `{ "token-name": { light: "#hex", dark: "#hex" } }`

**Step 1 — Clone and build lookup**
```
data = deep clone of lottieData
lightHexToToken = new Map()
for each (tokenName, { light, dark }) in tokens:
    lightHexToToken.set(normalize(light), { tokenName, lightRgb, darkRgb })
```

**Step 2 — Collect all layers**
```
allLayers = []
allLayers.push(...data.layers)
for each asset in data.assets:
    if asset.layers exists:
        allLayers.push(...asset.layers)
```

**Step 3 — Process matched layers**
```
for each layer in allLayers:
    if layer.ty !== 4 (not a shape layer): skip
    if layer.nm is NOT a key in tokens: skip
    
    // This layer's name matches an intent token → process its shapes
    walkShapes(layer.shapes, layer.nm)
```

**Step 4 — Walk shapes recursively**
```
function walkShapes(shapes, layerName):
    for each shape in shapes:
        if shape.ty === "gr" (group):
            walkShapes(shape.it, layerName)  // recurse into group items
        
        if shape.ty === "fl" (fill) or shape.ty === "st" (stroke):
            processColor(shape.c, layerName)
            processAlpha(shape.o, layerName)  // handle token alpha if defined
```

**Step 5 — Process color property**

This is the key step. Handles both static and animated colors.

```
function processColor(colorProp, layerName):
    if colorProp.a === 0 (static):
        // Simple case: single color value
        match = hexMatchColor(colorProp.k, lightHexToToken)
        if match:
            colorProp.sid = match.tokenName
            registerSlot(match.tokenName, match.lightRgb, match.darkRgb)
    
    if colorProp.a === 1 (animated):
        // Complex case: multiple keyframes, each may reference a different token
        colorProp.sid = layerName  // use layer name as slot ID
        
        darkKeyframes = deep clone of colorProp.k
        for each keyframe in darkKeyframes:
            if keyframe.s exists (start value):
                match = hexMatchColor(keyframe.s, lightHexToToken)
                if match:
                    keyframe.s = [...match.darkRgb, keyframe.s[3]]  // preserve alpha
        
        // Slot stores the original animated property (light values)
        registerAnimatedSlot(layerName, colorProp, darkKeyframes)
```

**Step 6 — Process alpha (opacity)**

If the token defines `alpha` (e.g. `light-orange-1` has `alpha: 0`), override the fill/stroke opacity property `shape.o`:

```
function processAlpha(opacityProp, layerName):
    token = tokens[layerName]
    if token.alpha is not defined: return  // default is 1.0, no change needed
    
    // Lottie opacity is 0-100 scale; token alpha is 0-1 scale
    opacityProp.a = 0
    opacityProp.k = token.alpha * 100
```

**Step 7 — Register slots and dark rules**

For static colors (same as existing script):
```
slots[tokenName] = { p: { a: 0, k: [lightR, lightG, lightB] } }
darkRules.push({ id: tokenName, type: "Color", value: [darkR, darkG, darkB] })
```

For animated colors:
```
slots[layerName] = { p: { a: 1, k: originalKeyframes } }
darkRules.push({ id: layerName, type: "Color", value: { a: 1, k: darkKeyframes } })
```

**Step 8 — Return**
```
data.slots = slots
return { data, slots, darkRules, logs }
```

---

## Part 3: `convert-to-themed-lottie-v2.ts` — CLI Script

**File**: `convert-to-themed-lottie-v2.ts` (repo root)

```
Usage: npx tsx convert-to-themed-lottie-v2.ts <input.json> <global.json>
```

Thin CLI wrapper:
1. Read `input.json` and `global.json` from disk
2. Call `convertWithIntentTokens(lottieData, tokens)`
3. Write `*-themed.json` (Lottie JSON with slots)
4. Write `*-themed.lottie` (dotLottie bundle with Default + Dark theme using `@dotlottie/dotlottie-js`)
5. Print summary: matched layers, slots created, dark rules

---

## Part 4: Unit Tests

**File**: `tests/intent-token-converter.test.ts`  
**Framework**: vitest (add as devDependency)  
**Config**: `vitest.config.ts` at repo root

All tests use **dependency injection** — they pass custom token objects and minimal Lottie fixtures directly to `convertWithIntentTokens()`. No test reads `global.json` from disk.

### Test helpers

A `makeLayer` helper to build minimal shape layers:

```javascript
function makeLayer({ name, fillColor, strokeColor, animated = false }) {
  // Returns a ty:4 shape layer with the given fill/stroke colors
  // If animated=true, wraps colors in keyframe format (a:1)
  // If animated=false, uses static format (a:0)
}
```

### Test 1: Static fill — layer name matches token

**Input**:
```javascript
tokens = { "my-fill-token": { light: "#FF0000", dark: "#00FF00" } }
lottie = {
  layers: [],
  assets: [{
    id: "comp_0",
    layers: [{
      ty: 4, nm: "my-fill-token",
      shapes: [{
        ty: "gr",
        it: [
          { ty: "fl", c: { a: 0, k: [1, 0, 0, 1] } },  // #FF0000
          { ty: "tr" }
        ]
      }]
    }]
  }]
}
```

**Expected output**:
- `shape.c.sid` === `"my-fill-token"`
- `slots["my-fill-token"]` === `{ p: { a: 0, k: [1, 0, 0] } }`
- `darkRules[0]` === `{ id: "my-fill-token", type: "Color", value: [0, 1, 0] }` (green)

### Test 2: Static stroke — layer name matches token

**Input**: Same as Test 1 but with `ty: "st"` instead of `ty: "fl"`.

**Expected output**: Same as Test 1 — `sid` added to stroke's `c` property, slot and dark rule created.

### Test 3: Animated fill — keyframes transition between two tokens

This tests the core animated color transition scenario.

**Input**:
```javascript
tokens = {
  "primary-face":    { light: "#E7D9FF", dark: "#F5EFFF" },
  "disabled-face":   { light: "#7E7E7E", dark: "#A3A3A3" }
}
lottie = {
  layers: [],
  assets: [{
    id: "comp_0",
    layers: [{
      ty: 4, nm: "primary-face",
      shapes: [{
        ty: "gr",
        it: [
          {
            ty: "fl",
            c: {
              a: 1,  // ANIMATED
              k: [
                { t: 0,      s: [0.9059, 0.8510, 1.0, 1] },     // #E7D9FF
                { t: 29.97,  s: [0.9059, 0.8510, 1.0, 1] },     // #E7D9FF (hold)
                { t: 74.925, s: [0.4941, 0.4941, 0.4941, 1] },   // #7E7E7E
                { t: 120.38, s: [0.9059, 0.8510, 1.0, 1] },     // #E7D9FF (return)
                { t: 149.35, s: [0.9059, 0.8510, 1.0, 1] }      // #E7D9FF (end)
              ]
            }
          },
          { ty: "tr" }
        ]
      }]
    }]
  }]
}
```

**Expected output**:
- `shape.c.sid` === `"primary-face"` (uses layer name for animated)
- Slot stores the original animated keyframes (light values unchanged)
- Dark rule contains keyframes where:
  - `t=0`: `s` ≈ `hexToRgb01("#F5EFFF")` + alpha (dark of primary-face)
  - `t=29.97`: `s` ≈ `hexToRgb01("#F5EFFF")` + alpha
  - `t=74.925`: `s` ≈ `hexToRgb01("#A3A3A3")` + alpha (dark of disabled-face)
  - `t=120.38`: `s` ≈ `hexToRgb01("#F5EFFF")` + alpha
  - `t=149.35`: `s` ≈ `hexToRgb01("#F5EFFF")` + alpha
- **Keyframe timing and easing are preserved** — only `s` color values change

### Test 4: Animated stroke — same behavior as animated fill

Same pattern as Test 3 but with `ty: "st"`.

### Test 5: Unmatched layer — no changes

**Input**: A layer with `nm: "some-random-layer"` that doesn't match any token.

**Expected output**: No `sid` added, no slots created, `darkRules` is empty.

### Test 6: Pre-comp assets are traversed

**Input**: A Lottie where the matched layer is nested inside `assets[0].layers`, not in top-level `layers`. (This is the real-world structure — the sample Lottie has layers in `comp_1`.)

**Expected output**: Layer is found and processed despite being nested.

### Test 7: Multiple tokens — independent slots

**Input**: Two layers matching two different tokens.

**Expected output**: Two separate slots, two separate dark rules, independent `sid` values.

### Test 8: Deduplication — same token, multiple layers

**Input**: Two layers both named `"my-token"`.

**Expected output**: Both get `sid = "my-token"`, but only ONE slot entry and ONE dark rule created.

### Test 9: Unmatched keyframe color — preserved as-is

**Input**: Animated fill where one keyframe's color doesn't match any token in global.json.

**Expected output**: That keyframe's `s` value is unchanged in the dark rule. Only matched keyframes get replaced.

---

## Part 5: Playground v2 Test Page

### New API route: `web/app/api/convert-v2/route.ts`

- Accepts `POST { lottieJson, tokens }`
- Imports `convertWithIntentTokens` from `../../../lib/intent-token-converter.ts` (single source of truth)
- Returns `{ original, themed, logs }` as base64-encoded `.lottie` data

### New page: `web/app/v2/page.tsx`

A new page at `http://localhost:3000/v2` designed for intent-token testing and browser automation.

**Two players only:**
1. **Original** — plays the unmodified input Lottie JSON as-is (no conversion)
2. **Themed** — plays the converted `.lottie` with embedded slots. Has a light/dark dropdown (defaults to light). Theme switching uses the dotLottie slot mechanism.

**Layout**:
```
┌──────────────────────────────────────────────────┐
│  Intent-Token Converter v2                       │
├────────────────────┬─────────────────────────────┤
│  Tokens JSON       │  Lottie JSON                │
│  [textarea]        │  [textarea]                 │
│  (pre-filled with  │  (paste or upload)          │
│   global.json)     │                             │
├────────────────────┴─────────────────────────────┤
│  [ Convert ]  (data-testid="convert-btn")        │
├──────────────────────────────────────────────────┤
│  Preview                                         │
│  ┌─────────────────┐  ┌─────────────────────┐   │
│  │  Original       │  │  Themed             │   │
│  │  (input JSON)   │  │  [Light ▾] dropdown │   │
│  │                 │  │                     │   │
│  │  player         │  │  player             │   │
│  │                 │  │                     │   │
│  └─────────────────┘  └─────────────────────┘   │
│  [Restart]             [Restart]                 │
│  data-testid=          data-testid=              │
│  "restart-original"    "restart-themed"          │
├──────────────────────────────────────────────────┤
│  Conversion logs (collapsible)                   │
└──────────────────────────────────────────────────┘
```

**Key elements for automation** (all have `data-testid`):
- `tokens-input` — textarea for tokens JSON
- `lottie-input` — textarea for Lottie JSON
- `convert-btn` — triggers conversion
- `convert-status` — shows "Converting..." / "Done" / error
- `restart-original`, `restart-themed` — restart buttons per player
- `player-original`, `player-themed` — the player containers (for screenshots)
- `theme-toggle` — light/dark dropdown for themed player (defaults to "Light")

**Restart button behavior**: Calls `dotLottie.stop()` then `dotLottie.play()` — resets to frame 0 and starts playing from the beginning.

---

## Part 6: Browser Automation QA Skill

**File**: `.claude/skills/test-lottie-transition.md`

This skill describes exactly how Claude uses **Playwright MCP** (`mcp__playwright__*` tools) to visually verify the Lottie color transitions work correctly after conversion.

### Pre-conditions
- `cd web && npm run dev` is running on `localhost:3000`
- The test Lottie JSON is at `data/comp1.json`

### Timing calculations from `data/comp1.json`

The sample Lottie runs at **29.97 fps** for **150 frames** = **~5 seconds per loop**.

Keyframe timeline:
```
t=0       (0.0s)  — Primary colors (purple/blue tones)
t=29.97   (1.0s)  — Still primary (hold)
t=74.925  (2.5s)  — Disabled colors (grays)
t=120.38  (4.0s)  — Back to primary
t=149.35  (5.0s)  — Primary (loop end)
```

So after pressing Restart:
- **Screenshot at ~0.5s**: Should show primary token colors
- **Screenshot at ~2.5s**: Should show disabled/gray token colors

### Step-by-step automation flow

All steps use **Playwright MCP** tools (`mcp__playwright__*`):

```
1. SETUP
   - mcp__playwright__browser_navigate → http://localhost:3000/v2
   - mcp__playwright__browser_snapshot → verify page loaded, find element refs

2. INPUT
   - Read `data/comp1.json` from disk
   - mcp__playwright__browser_fill_form → paste JSON into lottie-input textarea
   - mcp__playwright__browser_snapshot → verify tokens textarea is pre-populated

3. CONVERT
   - mcp__playwright__browser_click → click Convert button (ref from snapshot)
   - mcp__playwright__browser_wait_for → wait for convert-status to show "Done"
   - mcp__playwright__browser_snapshot → verify no errors, players visible

4. TEST THEMED PLAYER (LIGHT) — PRIMARY COLORS (t ≈ 0s)
   - Ensure theme-toggle is "Light" (the default)
   - mcp__playwright__browser_click → Restart button on themed player
   - Wait ~500ms for first frame to render
   - mcp__playwright__browser_take_screenshot → capture player-themed
   - Analyze screenshot:
     Expected: 3D isometric shape with purple/blue hues
     - Face = ~#E7D9FF (light lavender)
     - Soft shadow = ~#ADCFFF (light blue)
     - Hard shadow = ~#A678F5 (medium purple)

5. TEST THEMED PLAYER (LIGHT) — DISABLED COLORS (t ≈ 2.5s)
   - mcp__playwright__browser_click → Restart button again (resets to t=0)
   - Wait ~2500ms (animation reaches t=74.925)
   - mcp__playwright__browser_take_screenshot → capture player-themed
   - Analyze screenshot:
     Expected: grayscale tones
     - Face = ~#7E7E7E (medium gray)
     - Soft shadow = ~#5F5F5F (darker gray)
     - Hard shadow = ~#434343 (dark gray)

6. SWITCH TO DARK — PRIMARY COLORS (t ≈ 0s)
   - mcp__playwright__browser_select_option → set theme-toggle to "Dark"
   - mcp__playwright__browser_click → Restart button on themed player
   - Wait ~500ms
   - mcp__playwright__browser_take_screenshot → capture player-themed
   - Analyze screenshot:
     Expected: lighter versions of primary colors
     - Face = ~#F5EFFF (very light lavender)
     - Soft shadow = ~#CFE3FF (light blue)
     - Hard shadow = ~#D1B6FF (light purple)

7. TEST DARK — DISABLED COLORS (t ≈ 2.5s)
   - mcp__playwright__browser_click → Restart button again
   - Wait ~2500ms
   - mcp__playwright__browser_take_screenshot → capture player-themed
   - Analyze screenshot:
     Expected: lighter grays than light mode
     - Face = ~#A3A3A3 (light gray)
     - Soft shadow = ~#868686 (medium gray)
     - Hard shadow = ~#9F9F9F (medium-light gray)

8. COMPARE WITH ORIGINAL
   - mcp__playwright__browser_click → Restart button on original player
   - Wait ~500ms
   - mcp__playwright__browser_take_screenshot → capture player-original
   - Visually compare with themed Light screenshot from step 4
   - Original should show the same animation with raw Lottie colors

9. REPORT
   - Summarize: which color checks passed/failed
   - If any mismatch: describe expected vs actual colors
```

### Why the Restart button is critical

The animation loops continuously. Without restarting, Claude has no way to know what frame the animation is on. By pressing Restart:
1. The animation resets to frame 0 (t=0)
2. Claude knows exactly when the animation started
3. Claude can wait a precise number of seconds to reach a target keyframe
4. Claude takes a screenshot at the right moment
5. If Claude needs to re-check, it presses Restart again — the timing resets

This "restart → wait → screenshot" loop is the fundamental testing primitive.

### Color verification approach

Claude analyzes screenshots by looking at the dominant colors in the player area. It doesn't need pixel-perfect matching — it checks:
- "Is this region showing purplish/blue tones?" (primary state)
- "Is this region showing gray tones?" (disabled state)
- "Are the dark mode grays lighter than the light mode grays?" (dark mode check)

This is a qualitative visual check, not a pixel-exact comparison.

---

## Part 7: Changes Summary

### New files (6)
| File | Purpose |
|---|---|
| `global.json` | Intent token definitions (11 tokens, light + dark + optional alpha) |
| `lib/intent-token-converter.ts` | Core conversion logic — pure functions, DI-friendly |
| `convert-to-themed-lottie-v2.ts` | CLI script — reads files, calls converter, writes output |
| `tests/intent-token-converter.test.ts` | 9 unit tests for fill, stroke, animated transitions |
| `vitest.config.ts` | Minimal vitest config for ESM |
| `.claude/skills/test-lottie-transition.md` | QA skill for Chrome browser automation |

### New web files (2)
| File | Purpose |
|---|---|
| `web/app/api/convert-v2/route.ts` | API endpoint — imports from `lib/intent-token-converter.ts` |
| `web/app/v2/page.tsx` | Test page with Restart buttons and data-testid attributes |

### Modified files (1)
| File | Change |
|---|---|
| `package.json` | Add `vitest`, `tsx`, `typescript` as devDependencies; set `"test": "vitest run"` |

### Untouched files
- `convert-to-themed-lottie.mjs` — existing v1 script unchanged
- `convert-with-sidecar.mjs` — unchanged
- `convert-theme.mjs` — unchanged
- `web/app/page.tsx` — existing playground unchanged
- `theme-tokens.json` — unchanged

---

## Verification Checklist

1. **Unit tests**: `npm test` — all 9 tests pass
2. **CLI smoke test**: `npx tsx convert-to-themed-lottie-v2.ts data/comp1.json global.json`
   - Produces `*-themed.json` with 3 slots (one per matched layer in comp_1)
   - Produces `*-themed.lottie` with Default + Dark theme
3. **Playground v2**: `cd web && npm run dev`, open `/v2`
   - Paste `data/comp1.json`, click Convert → 2 players appear (Original + Themed)
   - Original plays the raw input animation
   - Themed player defaults to Light; dropdown switches to Dark
   - Light shows purple/blue → gray cycle; Dark shows lighter equivalents
4. **Browser automation QA**: Run the `test-lottie-transition` skill
   - All screenshot checks pass (light primary, light disabled, dark primary, dark disabled)
   - Colors match expected token values at each keyframe timestamp
