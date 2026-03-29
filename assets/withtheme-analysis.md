# Analysis of `withtheme.json` -- Lottie Theming via Slots

## Overview

`withtheme.json` is a Lottie JSON file (v5.7.0) exported from **@lottiefiles/creator 1.84.0** that uses Lottie's built-in **slots** mechanism to support dynamic color theming. The animation is a 1920x1080 scene ("Main Scene") running at 29.97 fps with 11 layers (a polystar shape with puppet pin deformers).

The file itself contains only the **Default (light) theme** color values. The **Dark theme** lives inside the companion `.lottie` (dotLottie) container as a separate theme file. There is **no `themes` key** in the JSON itself -- theming is achieved through the interplay of `sid` references, the `slots` registry, and the dotLottie packaging format.

---

## Top-Level Structure

```json
{
  "nm": "Main Scene",
  "ddd": 0,
  "h": 1080,
  "w": 1920,
  "meta": { "g": "@lottiefiles/creator 1.84.0" },
  "layers": [ ... ],           // 11 layers
  "v": "5.7.0",
  "fr": 29.97,
  "op": 150.81677419354838,
  "ip": 0,
  "assets": [],
  "slots": { ... }             // <-- THEMING: slot definitions
}
```

### Keys compared to a standard Lottie JSON

| Key | Standard Lottie? | Purpose |
|-----|-----------------|---------|
| `nm`, `ddd`, `h`, `w`, `v`, `fr`, `op`, `ip` | Yes | Standard animation metadata |
| `meta` | Yes | Generator info |
| `layers` | Yes | Layer array |
| `assets` | Yes | Asset precomps (empty here) |
| **`slots`** | **New (Lottie spec extension)** | **Top-level registry mapping slot IDs to their default property values** |

The only non-standard key is **`slots`**. Additionally, properties within the layer tree gain the **`sid`** key (slot ID) to link them to the slots registry.

---

## How Slots Work

### 1. The `slots` registry (top-level)

The `slots` object at the root of the JSON maps slot IDs to their default animatable property values:

```json
"slots": {
  "cds-red-1": {
    "p": {
      "a": 0,
      "k": [0.8353, 0.1725, 0.1725]
    }
  },
  "cds-blue-4": {
    "p": {
      "a": 0,
      "k": [0, 0.2196, 0.451]
    }
  }
}
```

Each slot entry has:
- **Key**: The slot ID string (e.g., `"cds-red-1"`, `"cds-blue-4"`)
- **`p`**: The property value, which wraps a standard Lottie animatable value object (`a` = animated flag, `k` = value). The `"p"` key stands for "property" and is the container for the slot's current/default value.

### 2. The `sid` reference (inside layer properties)

Inside the layer tree, any animatable property can reference a slot by adding a `"sid"` key alongside the standard `"a"` and `"k"` keys:

```json
// Stroke 1 color in layers[10].shapes[0].it[1].c
{
  "a": 0,
  "k": [0, 0.2196, 0.451],
  "sid": "cds-blue-4"           // <-- links to slots["cds-blue-4"]
}

// Fill 1 color in layers[10].shapes[0].it[2].c
{
  "a": 0,
  "k": [0.8353, 0.1725, 0.1725],
  "sid": "cds-red-1"            // <-- links to slots["cds-red-1"]
}
```

The `"sid"` key acts as a pointer. A Lottie player that supports slots will:
1. Find this property
2. See the `sid`
3. Look up `slots["cds-blue-4"].p` for the current value
4. Use that value instead of (or to override) the inline `k`

The inline `k` value serves as the **fallback/default** for players that do not understand slots. In this file, the inline `k` values exactly match the slot `p.k` values.

### 3. Slot ID naming convention

The slot IDs in this file follow a **design-system token naming pattern**:
- `cds-red-1` -- likely "CDS" (a design system prefix), red palette, shade 1
- `cds-blue-4` -- CDS blue palette, shade 4

These are semantic color token names, not arbitrary identifiers.

---

## Where Default vs Dark Theme Values Are Specified

### Default theme: embedded in the JSON

The `slots` object and the inline `k` values contain the **Default (light)** theme colors:

| Slot ID | RGB (0-1) | Hex | Usage |
|---------|-----------|-----|-------|
| `cds-red-1` | `[0.8353, 0.1725, 0.1725]` | `#d52c2c` (approx) | Fill color of the polystar |
| `cds-blue-4` | `[0, 0.2196, 0.451]` | `#003873` (approx) | Stroke color of the polystar |

### Dark theme: stored in the `.lottie` (dotLottie) container

The Dark theme is **not in the JSON file at all**. It lives inside the `withtheme.lottie` dotLottie archive (a ZIP file) as a separate theme file:

```
withtheme.lottie (ZIP archive)
  manifest.json              -- declares animations and themes
  a/Main Scene.json          -- the same Lottie JSON (with slots)
  t/Dark.json                -- Dark theme color overrides
```

#### `manifest.json` (inside .lottie)

```json
{
  "version": "2",
  "generator": "@dotlottie/dotlottie-js@1.6.2",
  "animations": [
    { "id": "Main Scene" }
  ],
  "themes": [
    { "id": "Dark" }
  ]
}
```

Note the `"themes"` array in the manifest -- this is how dotLottie v2 declares available themes.

#### `t/Dark.json` (inside .lottie)

```json
{
  "rules": [
    {
      "id": "cds-red-1",
      "type": "Color",
      "value": [0.8078, 0.5255, 0.5255]
    },
    {
      "id": "cds-blue-4",
      "type": "Color",
      "value": [0, 0.4667, 0.9686]
    }
  ]
}
```

Each rule overrides a slot:
- **`id`**: matches the `sid` / slot key in the animation JSON
- **`type`**: `"Color"` (declares what kind of property this is)
- **`value`**: the replacement RGB array (0-1 range, no alpha)

| Slot ID | Default (Light) Hex | Dark Theme Hex |
|---------|-------------------|----------------|
| `cds-red-1` | `#d52c2c` | `#ce8686` |
| `cds-blue-4` | `#003873` | `#0077f7` |

---

## How Theme Switching Works at Runtime

1. A dotLottie-aware player loads `withtheme.lottie`
2. It reads `manifest.json` and discovers there is one animation ("Main Scene") and one theme ("Dark")
3. By default, it renders the animation using the `slots` values from the JSON (the light/default theme)
4. When the "Dark" theme is activated, the player:
   - Loads `t/Dark.json`
   - For each rule, finds the slot with the matching `id`
   - Replaces the slot's `p.k` value with the rule's `value`
   - Re-renders with the new colors

This is a **pure data-driven approach** -- no code changes or animation re-export needed to switch themes.

---

## Relationship to `theme-tokens.json` in This Repo

The repo also contains a `theme-tokens.json` file:

```json
{
  "cds-stroke-hard": { "light": "#003872", "dark": "#7EB6FF" },
  "cds-fill-interactive-hard": { "light": "#d52c2c", "dark": "#FF6B6B" }
}
```

This file uses **different token names** (`cds-stroke-hard`, `cds-fill-interactive-hard`) than the slot IDs in the Lottie file (`cds-blue-4`, `cds-red-1`), and **different dark color values** from those in the dotLottie Dark theme. This is because `theme-tokens.json` is used by the `convert-theme.mjs` script -- an alternative, brute-force approach to theming that:
1. Walks the entire Lottie JSON tree
2. Finds all color values matching the "light" hex
3. Replaces them with the "dark" hex
4. Writes out a completely separate `*-dark.json` file

This is a fundamentally different strategy from the slots-based approach in `withtheme.json`:

| Approach | File | Mechanism |
|----------|------|-----------|
| **Slots-based** (withtheme.json) | Single animation + theme overrides in dotLottie | Runtime slot value replacement |
| **Brute-force swap** (convert-theme.mjs) | Two separate JSON files (light + dark) | Build-time color find-and-replace |

---

## Full Inventory of Color Properties in the File

The file contains **25 color-like properties** total. Only **2** of them have `sid` references:

### Slot-linked colors (themeable)

| Path | Slot ID | Type | Hex |
|------|---------|------|-----|
| `layers[10].shapes[0].it[1].c` | `cds-blue-4` | Stroke color | `#003873` |
| `layers[10].shapes[0].it[2].c` | `cds-red-1` | Fill color | `#d52c2c` |

### Non-slot colors (hardcoded, not themeable)

| Path Pattern | Color | Hex | Purpose |
|-------------|-------|-----|---------|
| `layers[0-9].ef[0].ef[0].v` (10 instances) | `[0.1765, 0.549, 0.9216]` | `#2d8beb` | Puppet pin control point color |
| `layers[10].ef[1-11].ef[1].v` (11 instances) | `[0.9255, 0.0941, 0.0941]` | `#ec1818` | Puppet bone color |

The puppet pin/bone colors are internal After Effects control point colors (layers 0-9 are all `"hd": true` -- hidden). They are not visible in the rendered animation and do not need theming.

---

## Layer Structure Summary

| Index | Name | Type | Hidden | Has sid? |
|-------|------|------|--------|----------|
| 0 | P < Shape Layer 1 - Puppet Pin 10 > | 4 (Shape) | Yes | No |
| 1 | P < Shape Layer 1 - Puppet Pin 9 > | 4 (Shape) | Yes | No |
| 2 | P < Shape Layer 1 - Puppet Pin 8 > | 4 (Shape) | Yes | No |
| 3 | P < Shape Layer 1 - Puppet Pin 7 > | 4 (Shape) | Yes | No |
| 4 | P < Shape Layer 1 - Puppet Pin 6 > | 4 (Shape) | Yes | No |
| 5 | P < Shape Layer 1 - Puppet Pin 5 > | 4 (Shape) | Yes | No |
| 6 | P < Shape Layer 1 - Puppet Pin 4 > | 4 (Shape) | Yes | No |
| 7 | P < Shape Layer 1 - Puppet Pin 3 > | 4 (Shape) | Yes | No |
| 8 | P < Shape Layer 1 - Puppet Pin 2 > | 4 (Shape) | Yes | No |
| 9 | P < Shape Layer 1 - Puppet Pin 1 > | 4 (Shape) | Yes | No |
| 10 | Shape Layer 1 | 4 (Shape) | No | **Yes** (2 slots) |

Only layer 10 ("Shape Layer 1") is visible and contains the actual rendered polystar shape with themed stroke and fill colors.

---

## Summary of the Theming Model

```
withtheme.json (standalone Lottie)
  |
  +-- slots: { "cds-red-1": { p: {default color} }, "cds-blue-4": { p: {default color} } }
  |
  +-- layers[10].shapes[0].it[1].c.sid = "cds-blue-4"  (stroke)
  +-- layers[10].shapes[0].it[2].c.sid = "cds-red-1"   (fill)

withtheme.lottie (dotLottie container)
  |
  +-- manifest.json: declares themes: [{ id: "Dark" }]
  |
  +-- a/Main Scene.json: same as withtheme.json (with slots)
  |
  +-- t/Dark.json: theme override rules
       rules: [
         { id: "cds-red-1",  type: "Color", value: [dark red] },
         { id: "cds-blue-4", type: "Color", value: [dark blue] }
       ]
```

**Key takeaways:**
1. The `.json` file uses `slots` (top-level) and `sid` (inline) to make properties addressable by ID
2. The `slots` values serve as the Default/Light theme
3. Dark (or any other) theme overrides are stored as separate JSON files inside the `.lottie` (dotLottie v2) ZIP container
4. Theme files use a `rules` array where each rule targets a slot by `id` and provides a replacement `value`
5. The inline `k` values in the animation JSON are kept in sync with the slot defaults as a fallback for players that do not support slots
