# Lottie Dark Mode Theming — Spike / Options Assessment

**Authors**: ktorii  
**Date created**: April 8, 2026  
**Last updated**: April 8, 2026  
**Pod:** Visual Experience  
**Stakeholders:** Animation Team, Design Team, Visual Experience Pod  

| Pod / Team | Reviewer | Status | Date Approved | Section to Review |
| :---- | :---- | :---- | :---- | :---- |
| Visual Experience | TBD | Not started | | Everything |
| Animation Team | TBD | Not started | | Feasibility, workflow impact |
| Design Team | TBD | Not started | | Token pipeline, Figma workflow |

# Overview

Coursera uses Lottie animations across web and mobile surfaces. These animations are authored in After Effects, exported via Bodymovin as JSON, and played back using dotLottie players. Today, all Lottie animations are light-mode only on web. The mobile app team works around this by maintaining separate light and dark Lottie files per animation.

As we roll out dark mode support more broadly, we need a scalable approach for theming Lottie animations that balances animator workflow, engineering effort, and long-term maintainability. This spike evaluates four candidate approaches, documents their tradeoffs, and proposes a proof-of-concept for each so we can make an informed decision with input from the animation, design, and engineering teams.

## Glossary of Terms

| Term | Definition |
| :---- | :---- |
| Lottie | An open JSON-based animation format exported from After Effects via Bodymovin. Renders natively on web and mobile. |
| dotLottie | A compressed container format (`.lottie`) that bundles Lottie JSON, themes, and assets into a single file. |
| Bodymovin | An After Effects plugin that exports animations as Lottie JSON. |
| CDS | Coursera Design System — the shared component and token library used across Coursera products. |
| Design Token | A named color value in CDS (e.g., `cds-stroke-hard`) that has defined light and dark mode values. |
| Slot / sid | Lottie's built-in theming mechanism. A `sid` (slot ID) on a color property references a named slot; a theme file can override slot values at runtime. |
| Sidecar | A JSON file that maps each layer+property in a Lottie animation to its corresponding CDS design token. Used by the plugin pipeline approach. |
| LottieCreator | LottieFiles' web-based editor for modifying Lottie animations, including color remapping and theme creation. |

## Goals

- Determine the best approach for supporting dark mode in Lottie animations on Coursera web, with potential for mobile adoption.
- Minimize ongoing animator effort — ideally animators create a light-mode animation once and dark mode is derived or trivially added.
- Ensure dark mode colors align with the CDS token library.
- Support intent-based tokens. Multiple tokens can share the same light-mode color but map to different dark-mode colors (e.g., `cds-stroke-hard` and `cds-border-accent` are both `#003872` in light mode but diverge in dark mode). The chosen approach must preserve token intent, not just match by color value.
- Produce a proof-of-concept for each candidate approach so stakeholders can evaluate based on workflow and output.
- Arrive at a single recommended approach that the animation, design, and engineering teams can align on.

## Non-goals

- Internal theming (single file with `setTheme`) is not the primary goal. It would be nice, but the main problem we're solving is making dark mode automatically applied with minimal animator effort. If the best solution uses separate files, that's fine.

## Impact / Measures of Success

- **Dark mode coverage:** Lottie animations on web support dark mode.
- **Animator velocity:** The chosen approach does not significantly slow down the animation production workflow.
- **Cross-platform alignment:** A single approach that both web and mobile can adopt long-term.
- **Token accuracy:** Every themed color maps to the correct CDS token dark-mode value.

# Technical Design

This section describes four candidate approaches for dark-mode Lottie theming.

## Comparison

| | Approach 1: Separate Files | Approach 2: LottieCreator Theming | Approach 3: Plugin Pipeline | Approach 4: AE Auto-Apply Plugin |
| :---- | :---- | :---- | :---- | :---- |
| **Workflow** | Animator creates a light-mode animation in AE, duplicates the composition, manually swaps colors to dark-mode values, and exports two separate Lottie files. Engineering loads the correct file based on the user's theme. | Animator creates the light-mode animation in AE and exports a single Lottie file. In LottieCreator, they open the file, remap colors using the CDS palette stored on the Coursera account, and publish a themed `.lottie`. Engineering calls `setTheme('dark')` on the dotLottie player at runtime. | Designer creates an illustration in Figma using CDS token colors. A Figma plugin exports the SVG along with a sidecar file mapping each layer's colors to their token. The animator imports the SVG into AE, uses an AE plugin's token palette for any color changes, and exports via Bodymovin. A conversion script reads the Lottie JSON + sidecar and auto-generates a themed `.lottie` with internal theming. Engineering calls `setTheme('dark')` at runtime. | Animator creates the light-mode animation in AE. An AE plugin reads the CDS token library and auto-applies dark mode colors to a duplicated composition. Animator reviews and cleans up anything the plugin couldn't handle (gradients, effects, etc.), then exports two files. Engineering loads the correct file based on theme. |
| | | | | |
| **Animator iteration speed** | ✅ Fast — animators work entirely in AE. Edit, preview, export. No external steps in the loop. | ❌ Slow — every color change requires re-exporting from AE, then re-remapping in LottieCreator. Can't iterate on dark mode in place. | ◐ Normal speed in AE for light mode, but no dark mode iteration. Dark output only visible after running conversion script. | ✅ Fast — same as Approach 1, but the initial recoloring is automated. Animator stays in AE for the entire loop. |
| **Intent-based token adherence** | ✅ Catch-all — dark mode is a separate file, animators have full control. They reference the token library manually, same human error risk as any design work. | ◐ Animators still do the color work, just in LottieCreator instead of AE. Same human error risk, different tool. | ◐ Sidecar maps tokens by name, but dependent on animators using the sidecar from the start and only using Figma assets. See Feature Support Matrix below for where this breaks down. | ✅ Plugin applies token colors automatically. Animator reviews the result and fixes anything the plugin missed — same manual oversight as Approach 1, but with a head start. |
| **Future color features** | ✅ Supports anything Lottie/Bodymovin can export — animators just do it in both versions. | ◐ Depends on LottieCreator adding support. Coursera doesn't control the roadmap. | ❌ Every new color technique (new gradient types, new effects) requires a script update. Not future-proof. | ✅ Plugin handles what it can, animator handles the rest. New color features don't block the workflow — they just mean more manual cleanup. |
| **Non-color dark mode changes** | ✅ Full flexibility — dark mode can add borders, hide shapes, change opacity, adjust layout. It's a separate file. | ❌ LottieCreator theming is color remapping only. Can't add a border or hide a layer in dark mode. | ❌ Script is built for color swapping. Non-color changes (borders, visibility, opacity) are out of scope. | ✅ Same as Approach 1 — dark mode is a separate file, animator can make any changes. |
| **Simplicity** | ✅ Simple — two files, no tooling, no dependencies. Everyone understands it. | ◐ Adds LottieCreator as a required step in every animation's pipeline. Sounds automated but every edit cycles back through it. | ◐ Multiple moving parts — Figma plugin, AE plugin, sidecar, conversion script. Each piece adds a point of failure and maintenance. | ✅ Simple — one plugin in AE that speeds up what animators already do. Falls back to manual work if it can't handle something. |
| **Risk** | ✅ No risk — proven workflow, no tooling dependency. | ◐ Low risk — dependent on LottieCreator's capabilities and roadmap, but no custom tooling to maintain. | ❌ High risk — this approach is tightly coupled to the assumption that dark mode is only color changes. If animators ever need non-color adjustments (borders, visibility, opacity, layout), the pipeline can't handle it and there's no escape hatch. The engineering investment in custom tooling (Figma plugin, AE plugin, conversion script) becomes wasted effort. | ✅ Low risk — the plugin is additive. If it can't handle something, the animator does it manually. Worst case, it's Approach 1 with some automation. Also serves as a low-commitment way to validate whether a full pipeline (Approach 3) is worth investing in. |
| | | | | |
| **Engineering: file management** | ✅ Two files per animation, but straightforward to manage. Performance edge case of loading both files is not a real concern. | ✅ Single file, just call `setTheme('dark')`. | ✅ Single file, same as Approach 2 on the player side. | ✅ Same as Approach 1 — two files, straightforward. |
| **Engineering: tooling maintenance** | ✅ No scripts or tooling to maintain. | ✅ No custom scripts. LottieCreator's theming is maintained by LottieFiles. | ◐ Must build and maintain Figma plugin, AE plugin, and conversion script. If animators only need color swaps, this is manageable. If they need features beyond that (gradients, color transitions, effects), the script must be updated to handle each one. Investing in custom tooling that may not keep up with animator needs is a risk. | ✅ Must build an AE plugin, but it's simple — no Figma plugin, no sidecar, no conversion script. Plugin doesn't need to handle every edge case since the animator cleans up the rest. |
| | | | | |
| **Animation: workflow complexity** | ◐ Familiar but repetitive — duplicate comp, recolor, export twice. | ◐ AE workflow unchanged, but color remapping in LottieCreator is a separate step. Animator needs to be sure the animation is final before proceeding — any iteration means going back to AE and re-doing the remap. | ◐ Automates what Approach 2 does manually — the script handles the color remapping instead of the animator doing it in LottieCreator. But requires using the AE plugin's token palette and maintaining the sidecar. | ✅ Same as Approach 1 but faster — plugin auto-applies dark colors, animator just reviews and cleans up. No extra tools or steps outside AE. |
| **Animation: dark mode visibility** | ✅ Full — animators build and preview dark version directly in AE. | ◐ Preview available in LottieCreator after remapping, but not during animation in AE. | ◐ Same as Approach 2 — no dark preview in AE. Must run conversion script and view in external player. | ✅ Full — dark mode comp is right there in AE after plugin applies colors. Animator can preview and adjust. |
| **Animation: supported features** | ✅ Full creative control over both versions. Dark mode can differ beyond color swaps. | ◐ Supports LottieCreator's theming capabilities. Solid fills/strokes are clear. Unclear on gradients, animated colors, effects. | ◐ Script handles static fills/strokes. Gradients partial. Remaining features TBD — needs POC testing. See Feature Support Matrix below. | ✅ Full creative control — same as Approach 1. Plugin handles what it can, animator handles the rest. |

## Feature Support Matrix

This matrix lists specific animation techniques and whether each approach can handle them. Approach 1 (separate files) supports everything by definition since the animator has full control over both versions — it's included as the baseline.

| Animation Feature | Approach 1: Separate Files | Approach 2: LottieCreator | Approach 3: Plugin Pipeline | Approach 4: AE Auto-Apply |
| :---- | :---- | :---- | :---- | :---- |
| Solid fill/stroke color swap | ✅ | ✅ | ✅ | ✅ Plugin auto-applies, animator verifies |
| Gradient with token colors at stops | ✅ | TBD — needs POC testing | ◐ Partial support in script | ◐ Plugin attempts, animator cleans up |
| Color transition (keyframe from color A to color B) | ✅ | TBD — needs POC testing | ❌ Script only handles static colors | ◐ Plugin attempts, animator cleans up |
| Duplicated SVGs (e.g., same SVG used multiple times for particles) | ✅ | TBD — needs POC testing | TBD — needs POC testing. Each duplicate creates new layers with different names/paths, sidecar would need to account for every instance. | ✅ Plugin applies to all instances, animator verifies |
| Non-color changes (e.g., changing border thickness in dark mode) | ✅ | ❌ Theming is color-only. | ❌ Script handles colors only. Extending it to handle arbitrary non-color properties per theme is not reliable — it becomes an all-or-nothing bet on what the script can cover. | ✅ Animator makes these changes manually after plugin applies colors. |

**Key takeaway:** Approach 1 is the baseline — it supports anything because the animator builds both versions. Approach 2 has unknowns that the POC needs to answer. Approach 3 has known gaps, and each gap requires engineering work to close. Approach 4 combines Approach 1's flexibility with automation for the common case — the plugin handles what it can, the animator handles the rest. The animation team's answers to the open questions below will determine how many of these features are actually needed.

## Open Questions for the Animation Team

These questions need answers from the animation team to properly evaluate each approach:

1. **Given the workflows and iteration loops described above, which approach do you prefer?** Each approach has different tradeoffs for your day-to-day work. Which one fits best with how you actually build and iterate on animations?

2. **Is dark mode just color swaps, or more?** Do dark-mode animations ever need changes beyond remapping colors — e.g., different effects, adjusted opacity, or modified shapes for contrast? If so, Approaches 2 and 3 become more limited.

3. **What color features are commonly used?** Solid fills and strokes are the simple case. How often do animations use color transitions (animated keyframes between colors), gradients, semi-transparent overlays, glow/shadow effects, or tints? This determines how much of the animation scope Approaches 2 and 3 can actually cover.

4. **Do animators change colors in After Effects?** Or do they strictly use the colors that come from the Figma source file? If they never change colors in AE, the Figma plugin alone (without the AE plugin) may be sufficient for Approach 3.

5. **Is previewing dark mode in-tool important?** Approach 1 gives full AE preview. Approach 2 gives preview in LottieCreator. Approach 3 requires running a script and viewing externally. How much does in-tool preview matter to the animation workflow?


## Proof of Concept Plans

Each POC uses the same source animation to enable direct comparison of output quality and workflow.

### POC 1: Separate Files

```
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│   Figma      │     │ After Effects│     │  Bodymovin   │
│              │────▶│              │────▶│  (export)    │
│  design      │     │  animate     │     │              │
└──────────────┘     │              │     └──────┬───────┘
                     │  duplicate   │            │
                     │  comp, swap  │       Two files:
                     │  colors to   │       anim-light.json
                     │  dark values │       anim-dark.json
                     └──────────────┘            │
                                                 ▼
                                        ┌────────────────┐
                                        │   Web player   │
                                        │                │
                                        │ if dark theme: │
                                        │  load dark.json│
                                        │ else:          │
                                        │  load light.json│
                                        └────────────────┘

Tokens: In the animator's head (manual hex selection)
Plugins: None
Code: Theme-aware file loader
```

**Iteration (e.g., adding a new particle):**

```
┌──────────────────────┐     ┌──────────────┐
│ After Effects        │     │  Bodymovin   │
│                      │     │  (export)    │
│ ┌──────────────────┐ │     │              │
│ │ 1. Add element   │ │     │  Two files:  │
│ │ 2. Add to dark   │ │────▶│  light.json  │
│ │    comp too      │ │     │  dark.json   │
│ │ 3. Pick dark     │ │     └──────────────┘
│ │    token color   │ │
│ │ 4. Preview both  │ │
│ │    comps         │ │
│ │                  │ │
│ │ ↻ repeat for     │ │
│ │   each change    │ │
│ └──────────────────┘ │
└──────────────────────┘

Every change requires updating both comps manually.
All iteration stays in AE. Export when done.
```

**How to test:** Ask an animator to create light and dark versions of a test animation. Load both in the web playground and toggle between them.

**Repo:** TBD

### POC 2: LottieCreator Theming

```
┌──────────────┐     ┌──────────────┐     ┌──────────────┐     ┌─────────────────┐
│   Figma      │     │ After Effects│     │  Bodymovin   │     │  LottieCreator  │
│              │────▶│              │────▶│  (export)    │────▶│                 │
│  design      │     │  animate     │     │              │     │  remap colors   │
└──────────────┘     └──────────────┘     └──────────────┘     │  using CDS      │
                                                               │  token palette  │
                                                               │  on Coursera    │
                                                               │  account        │
                                                               └────────┬────────┘
                                                                        │
                                                                        ▼
                                                               ┌─────────────────┐
                                                               │   Web player    │
                                                               │ setTheme('dark')│
                                                               └─────────────────┘

Tokens: Stored on Coursera's LottieCreator account as a named token theme table
Plugins: None
Code: dotLottie player with setTheme('dark')
```

**Iteration (e.g., adding a new particle):**

```
       ┌────────────────────────────────────────────────────────┐
       │                                                        │
       ▼                                                        │
┌──────────────┐     ┌──────────────┐     ┌─────────────────┐  │
│ After Effects│────▶│  Bodymovin   │────▶│  LottieCreator  │──┘
│              │     │  (re-export) │     │                 │
│ make change  │     │              │     │ re-remap ALL    │
│ (add element,│     └──────────────┘     │ colors from     │
│  tweak anim, │                          │ scratch         │
│  etc.)       │                          │                 │
└──────────────┘                          └─────────────────┘

Every change to the animation — even non-color changes
like scaling or adding elements — requires going through
the full Bodymovin export → LottieCreator remap cycle again.
```

**How to test:** Export a test animation from AE, open it in LottieCreator on the Coursera account, remap colors using the CDS token palette, publish, and verify theme switching in the web playground.

**LottieCreator workspace:** TBD
**Repo:** TBD

### POC 3: Plugin Pipeline

```
┌──────────────┐     ┌────────────────┐
│   Figma      │     │  Figma Plugin  │
│              │────▶│  exports SVG + │
│  design      │     │  sidecar.json  │
│  w/ tokens   │     └───┬────────┬───┘
└──────────────┘         │        │
                    SVG  │        │ sidecar.json
                         ▼        │ (layer → token)
                  ┌──────────────┐│
                  │ After Effects││
                  │  + AE Plugin ││
                  │              ││
                  │  animate     ││
                  │  using token ││
                  │  palette     ││
                  └──────┬───────┘│
                         │        │
                  Bodymovin export │
                         │        │
                    anim.json     │
                         │        │
                         ▼        ▼
                  ┌──────────────────┐
                  │ Conversion Script│
                  │                  │
                  │ reads anim.json  │
                  │ reads sidecar    │
                  │ reads token map  │
                  │                  │
                  │ builds themed    │
                  │ dark .lottie     │
                  └────────┬─────────┘
                           │
                           ▼
                  ┌──────────────────┐
                  │   Web player     │
                  │ setTheme('dark') │
                  └──────────────────┘

Tokens: In sidecar.json, linked per-layer from Figma
Plugins: Figma Plugin (export), AE Plugin (token palette)
Code: Conversion script (convert-with-sidecar.mjs), dotLottie player with setTheme('dark')
```

**Iteration (e.g., adding a new particle):**

```
┌───────────────────────────────────────────────────────────────────────────┐
│                                                                           │
▼                                                                           │
┌────────────────┐     ┌──────────────┐     ┌──────────────┐     ┌─────────┴────────┐
│  Figma         │     │ After Effects│     │  Bodymovin   │     │ Conversion Script│
│                │────▶│              │────▶│  (re-export) │────▶│                  │
│ add/change     │     │ import       │     │              │     │ re-run with      │
│ element        │     │ updated SVG, │     └──────────────┘     │ updated sidecar  │
│                │     │ animate      │                          └──────────────────┘
│ re-export SVG  │     │              │
│ + updated      │     └──────────────┘
│ sidecar        │
└────────────────┘

Every change that adds or modifies an element must start
in Figma so the sidecar has the token mapping. Then the
full pipeline runs again: Figma → AE → Bodymovin → script.
```

**How to test:** Create a test illustration in Figma with CDS tokens, export via the Figma plugin, animate in AE using the AE plugin's token palette, export via Bodymovin, run the conversion script, and verify theme switching in the web playground.

**Repo:** TBD

### POC 4: AE Auto-Apply Plugin

```
┌──────────────┐     ┌──────────────────────┐     ┌──────────────┐
│   Figma      │     │ After Effects        │     │  Bodymovin   │
│              │────▶│  + AE Auto-Apply     │────▶│  (export)    │
│  design      │     │    Plugin            │     │              │
└──────────────┘     │                      │     └──────┬───────┘
                     │ 1. Animate light mode│            │
                     │ 2. Plugin reads CDS  │       Two files:
                     │    token library     │       anim-light.json
                     │ 3. Plugin duplicates │       anim-dark.json
                     │    comp and auto-    │            │
                     │    applies dark      │            ▼
                     │    colors            │     ┌────────────────┐
                     │ 4. Animator reviews  │     │   Web player   │
                     │    and cleans up     │     │                │
                     └──────────────────────┘     │ if dark theme: │
                                                  │  load dark.json│
                                                  │ else:          │
                                                  │  load light.json│
                                                  └────────────────┘

Tokens: CDS token library loaded into AE plugin
Plugins: AE Auto-Apply Plugin (reads tokens, auto-swaps colors on duplicated comp)
Code: Theme-aware file loader (same as Approach 1)

Note: this approach is not based on actual SVG token mappings from Figma.
The plugin detects colors in the comp and makes a best approximation for
dark mode using the token library. Animator still needs to verify dark
mode looks correct and clean up anything the plugin got wrong.
```

**Iteration (e.g., adding a new particle):**

```
┌──────────────────────┐     ┌──────────────┐
│ After Effects        │     │  Bodymovin   │
│                      │     │  (export)    │
│ ┌──────────────────┐ │     │              │
│ │ 1. Add element   │ │     │  Two files:  │
│ │ 2. Re-run plugin │ │────▶│  light.json  │
│ │    (or on        │ │     │  dark.json   │
│ │    selected      │ │     └──────────────┘
│ │    layers)       │ │
│ │ 3. Preview dark  │ │
│ │    comp, clean   │ │
│ │    up if needed  │ │
│ │                  │ │
│ │ ↻ repeat for     │ │
│ │   each change    │ │
│ └──────────────────┘ │
└──────────────────────┘

Every change stays in AE. Plugin can target specific
layers, so re-running is fast. Export when done.
```

**How to test:** Create a test animation in AE, run the plugin to auto-apply dark mode colors, review the output, clean up anything the plugin missed, export both files, and verify in the web playground.

**Repo:** TBD

# Appendix

## Related Artifacts

- Lottie playground repo (scripts, plugins, web preview): TBD
- LottieCreator Coursera workspace: TBD
- dotLottie theming documentation: https://developers.lottiefiles.com/docs/dotlottie-theming/

## Sections Skipped

| Section | Reason |
| :---- | :---- |
| Dependencies | No API or service dependencies. All tooling is client-side or build-time. |
| Interface / API Definitions | No APIs being created or modified. |
| Database Models | No database changes. |
| OSLO / Performance | No performance concerns — asset loading is the same regardless of approach. |
| Accessibility | Dark mode support itself is the accessibility improvement. |
| Security Implications | No user data, authentication, or external service interaction. |
| Privacy Implications | No PII involved. |
| Cost Implications | No additional infrastructure. |
| Eventing | No analytics events needed for this spike. |
| Rollout Plan | Premature — depends on which approach is chosen. |
