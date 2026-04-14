# Dark Mode Pipeline for Lottie Animations

**Authors**: Ken Torii  
**Date created**: April 14, 2026  
**Last updated**: April 14, 2026  
**Pod:** Visual Experience  
**Jira:** [CDS-2098](https://coursera.atlassian.net/browse/CDS-2098) (Epic: [CDS-1672 — Dark Mode](https://coursera.atlassian.net/browse/CDS-1672))  
**Stakeholders:** Visual Experience, Design Systems  

| Pod / Team | Reviewer | Status | Date Approved | Section to Review |
| :---- | :---- | :---- | :---- | :---- |
| Visual Experience | Herman Starikov (TL) | Not started | | Everything |
| Design | Sanchit (Director of Design) | Not started | | Overview, Goals, Rollout |
| Design | Dylan (Design) | Not started | | Technical Design, Rollout |
| Animation | Abhishek (Animator) | Not started | | Technical Design, Rollout |

# Overview

This design proposes an end-to-end pipeline that lets animators create dark-mode-aware Lottie animations without duplicating work, while keeping Figma illustrations with CDS color variables as the source of truth.

## Glossary of Terms

| Term or Acronym | Definition |
| :---- | :---- |
| Lottie | JSON-based animation format exported from After Effects via the Bodymovin plugin. |
| dotLottie (.lottie) | A zipped container format for Lottie that supports multiple animations, themes, and assets in a single file. |
| Lottie Theming | A feature in the dotLottie file format that allows specifying multiple themes (e.g., Light and Dark) per color. Uses slots and `sid` references to link color properties to token variables, which then map to light and dark color values. See the [dotLottie 2.0 spec](https://dotlottie.io/spec/2.0/#themes). |
| Intent token | A color variable that represents a semantic purpose (e.g., `theme-mat-hard-light-primary`) rather than a specific hex value. Resolves to different hex values in light vs. dark mode. |
| AEUX | Open-source plugin pair (Figma + AE) that transfers design layers from Figma into After Effects. |
| AEUX-Coursera | A fork of AEUX that includes functionality to detect color variables from Figma and import them into After Effects. |
| Bodymovin | After Effects plugin that exports compositions as Lottie JSON. |
| Lottie Theme Converter | Custom script that takes a light-mode Lottie JSON with token metadata and converts it into a themed `.lottie` file containing both Light and Dark themes. |

## Goals

1. **Single-asset workflow**: Optimize for scale — requiring animators to create two separate animation files (light and dark) per illustration doesn't scale. The priority is a workflow where an animator produces one animation that works in both light and dark mode.
2. **Figma as source of truth**: Token-to-color mappings live in Figma. Illustrations in Figma contain CDS color variables, and those mappings should flow through the pipeline rather than being maintained separately.
3. **Token linkage across the full workflow**: The main technical challenge — the linkage between an illustration's layers and their intent tokens must be preserved across the entire animator workflow (Figma → AE → Bodymovin export → conversion), so the Lottie Theme Converter knows which layers use which tokens.
4. **Animator workflow support**: Not everything can be imported from Figma via AEUX. For example, gradients don't transfer correctly, and color variables can't be initialized on gradients from Figma. Assets created directly in After Effects — including gradient fills and color transitions (keyframed color changes) — also need a way to specify which intent tokens they use. The pipeline must support this fallback path alongside the Figma import path.
5. **Easy theme switching for engineers**: Engineers need to switch a Lottie animation between Light and Dark themes at runtime in a straightforward way, matching the rest of the product's dark mode behavior.

## Non-goals

1. **Complex shading styles**: The design direction for illustrations is simple flat-style cell shading — at most a lit side, soft shadow side, and hard shadow side. Gradients may be used for effects like light rays, but there is no need to support complex shading techniques beyond this illustrative style.
2. **Different animations for light vs. dark**: It is an animation constraint that the animation itself must be identical in both light and dark mode — only the colors change. We will not support cases where dark mode has a different animation (e.g., extra borders, different motion) than light mode.
3. **Future design direction deviations**: If a future design direction requires more complex dark mode treatment that this pipeline can't handle (e.g., different illustrations per theme), those cases can be handled by shipping two separate Lottie files. The upside of scaling a single-file workflow for the common case far outweighs the engineering cost of managing two code paths for calling Lottie animations.

## Impact / Measures of Success

1. **Animator velocity**: Animators produce one file per illustration instead of two, reducing per-asset effort. Success = no animator needs to manually create a separate dark-mode animation file.
2. **Engineering adoption friction**: An engineer integrating a Lottie animation doesn't need to understand the theming internals — they receive a `.lottie` file and call `setTheme()`. Success = same integration effort as a non-themed Lottie.

# Technical Design

The pipeline has four stages: **Figma export**, **After Effects animation**, **Lottie Theme Conversion**, and **Runtime playback**. Token metadata originating in Figma flows through each stage so that the final `.lottie` file contains both Light and Dark themes.

## System Architecture

```
Figma (CDS color variables on illustration layers)
  │
  ▼
┌─────────────────────────────────────────────┐
│  Figma Plugin (AEUX-Coursera)               │
│  Fork of AEUX that detects CDS tokens on    │
│  illustration layers and attaches them to    │
│  the JSON payload for AE import.            │
└──────────────┬──────────────────────────────┘
               │
               │  AEUX JSON with intentTokens per layer:
               │  {
               │    "name": "Rectangle 1",
               │    "type": "shape",
               │    "fill": [{ "color": [0.91, 0.85, 1, 1] }],
               │    "intentTokens": ["theme-mat-hard-light-primary"]
               │  }
               │
               ▼
┌─────────────────────────────────────────────┐
│  AE Plugin (AEUX-Coursera)                  │
│  Fork of AEUX that receives layers and      │
│  writes intentTokens into AE layer names    │
│  as bracket annotations.                    │
│  e.g., "Rectangle 1 [token-a, token-b]"    │
└──────────────┬──────────────────────────────┘
               │
         Animator works in AE
         (can manually add/edit bracket
          tokens for AE-created layers)
               │
               ▼
         Bodymovin / Lottie export
               │
               │  Lottie JSON with layer names preserved:
               │  {
               │    "layers": [{
               │      "nm": "Rectangle 1 [token-a, token-b]",
               │      "ty": 4,
               │      "shapes": [{ "ty": "fl", "c": { "k": [0.91, 0.85, 1] }}]
               │    }]
               │  }
               │
               ▼
┌─────────────────────────────────────────────┐
│  Web Playground                             │
│  Reads intentTokens from layer names to     │
│  create hex colors for each theme in        │
│  dotLottie format. Preview and export       │
│  .lottie with Light + Dark themes.          │
└──────────────┬──────────────────────────────┘
               │
               │  Output: themed .lottie file
               │  ┌──────────────────────────────────────┐
               │  │ animation.lottie (zip)               │
               │  │                                      │
               │  │ a/animation.json                     │
               │  │   slots: { "token-a": { sid → color }}│
               │  │                                      │
               │  │ t/Light.json                         │
               │  │   rules: [{ id: "token-a",           │
               │  │     value: [0.91, 0.85, 1] }]        │
               │  │                                      │
               │  │ t/Dark.json                          │
               │  │   rules: [{ id: "token-a",           │
               │  │     value: [0.96, 0.94, 1] }]        │
               │  └──────────────────────────────────────┘
               │
               ▼
┌─────────────────────────────────────────────┐
│  dotlottie-react Player                     │
│  Engineer loads the .lottie file and calls  │
│  setTheme("Light") or setTheme("Dark")     │
│  to switch themes at runtime.               │
└─────────────────────────────────────────────┘
```

## Proof of Concept

Follow these steps to try the full pipeline end-to-end.

**Step 1: Install plugins**
- Download [AEUX-Coursera](https://drive.google.com/file/d/17uCzaRxoGDo1qY-CLcOYNeqaT4uJ0EXu/view?usp=sharing) and unzip
- **Figma (must be the desktop app, not web):** right-click canvas → Plugins → Development → Import plugin from manifest... → select `Figma/AEUX/manifest.json` from the unzipped folder
- **AE:** double-click `Ae/Install AEUX-Coursera.command` from the unzipped folder, restart After Effects

*[Placeholder: screenshot of plugin install]*

**Step 2: Prepare the illustration in Figma**
- Open a Figma file with an illustration that uses CDS color variables
- The illustration must be inside a Frame — if it's a group, right-click the group → Frame selection
- Select the Frame containing the illustration

*[Placeholder: screenshot of frame selection]*

**Step 3: Export from Figma to AE**
- With the Frame selected, right-click → Plugins → Development → AEUX
- Click the AE button to transfer directly to AE (AE must be open with the AEUX panel visible), or hold Shift and click to export as JSON

*[Placeholder: screenshot of AEUX plugin]*

**Step 4: Import into AE**
- If you transferred directly, layers should already appear in AE
- If you used shift+click, open AE → Window → Extensions → AEUX, then drag and drop the exported JSON into the AEUX-Coursera panel

*[Placeholder: screenshot of AE import]*

**Step 5: Verify tokens in AE**
- Check layer names in the AE timeline — bracket tokens should appear (e.g., `"Rectangle 1 [theme-mat-hard-light-primary]"`)
- For layers created directly in AE (gradients, keyframed colors), manually add bracket tokens to the layer name

*[Placeholder: screenshot of AE timeline]*

**Step 6: Export with Bodymovin**
- Export the composition as Lottie JSON via Bodymovin

**Step 7: Convert in Web Playground**
- Go to [https://web-sand-five-50.vercel.app](https://web-sand-five-50.vercel.app)
- Upload the Lottie JSON
- Preview light/dark themes
- Export the themed `.lottie` file

*[Placeholder: screenshot/gif of playground]*

## Stage 1: Figma Plugin + AE Plugin (AEUX-Coursera)

AEUX is an existing open-source tool already used by our animators to import Figma illustrations into After Effects. It's not uncommon for companies to have custom animation workflows — we fork AEUX and add ~109 lines across 3 source files to detect CDS color tokens in Figma and pass them through to AE layer names.

The Figma plugin detects bound color variables on fills/strokes and attaches them as `intentTokens` in the JSON payload. The AE plugin reads those tokens and appends them to the layer name in bracket notation (e.g., `"Rectangle 1 [token-a, token-b]"`). Animators can also manually add or edit brackets on layers created directly in AE.

Source: [AEUX-Coursera](https://github.com/ktorii-coursera/AEUX-coursera)
- [Figma/AEUX/src/code.ts](https://github.com/ktorii-coursera/AEUX-coursera/blob/main/Figma/AEUX/src/code.ts) — +46 lines, detects color variables
- [Figma/AEUX/src/aeux.js](https://github.com/ktorii-coursera/AEUX-coursera/blob/main/Figma/AEUX/src/aeux.js) — +38 lines, threads intentToken through fills/strokes
- [Ae/AEUX/src/host/AEFT/host.ts](https://github.com/ktorii-coursera/AEUX-coursera/blob/main/Ae/AEUX/src/host/AEFT/host.ts) — +25 lines, writes brackets to layer names

*[Placeholder: screenshot of AE timeline showing bracket tokens on layer names]*

## Stage 2: Web Playground (Lottie Theme Converter)

The playground hosts the Lottie Theme Converter and provides a UI to preview and export themed `.lottie` files.

- **Live playground:** [https://web-sand-five-50.vercel.app](https://web-sand-five-50.vercel.app)
- **Source:** [ktorii-coursera/lottie-playground](https://github.com/ktorii-coursera/lottie-playground)
  - [lib/marker-token-converter.ts](https://github.com/ktorii-coursera/lottie-playground/blob/main/lib/marker-token-converter.ts) — core conversion logic
  - [convert-to-themed-lottie-v3.ts](https://github.com/ktorii-coursera/lottie-playground/blob/main/convert-to-themed-lottie-v3.ts) — CLI script
  - [web/app/page.tsx](https://github.com/ktorii-coursera/lottie-playground/blob/main/web/app/page.tsx) — playground UI

## Stage 3: Runtime Integration

Coursera already has a component wrapper for Lottie animations. Engineers pass in the `.lottie` file and the wrapper handles theme switching automatically based on the app's light/dark context. No additional work is needed from the consuming engineer — the Visual Experience team just needs to ensure the wrapper calls `setTheme()` based on the current theme context.

# Productionization Considerations

## OSLO / Performance

The pipeline is offline tooling — conversion happens at export time, not runtime. At runtime, the `.lottie` file is the same size and format as a regular Lottie. `setTheme()` is a lightweight slot value swap with no re-render or re-download. No performance concerns.

## Accessibility

No change to accessibility. The animations are visual illustrations, not interactive elements. Light/dark switching follows the same theme context as the rest of the app.

## Security Implications

No security concerns. The pipeline is offline tooling with no user input or public API endpoints. The `.lottie` files are static assets.

## Privacy Implications

None. No user data involved.

## Cost Implications

None. No new infrastructure, services, or resources needed. The playground is hosted on Vercel's free tier.

## Eventing

None needed for this pipeline.

## Rollout Plan

No EPIC flag — this is a direct rollout. Key to-dos:

1. **Update globalcolors.json**: Update the playground's token map to reference the actual CDS token library with production light/dark hex values.
2. **Animator validation**: Animators try the full workflow with real Coursera illustrations to validate the pipeline end-to-end.
3. **Update Lottie wrapper**: Engineering updates the existing Lottie component wrapper to call `setTheme()` based on the app's light/dark context.

# Appendix

## Sections Skipped

| Section | Reason |
| :---- | :---- |
| Dependencies | No new API dependencies. The pipeline uses `@lottiefiles/dotlottie-react` which is already in use. |
| Interface / API Definitions | No new APIs exposed or modified. |
| Database Models | No database changes. |
| Alternative Approaches | The alternative (shipping two separate Lottie files per animation) is addressed in Non-goals. |

## Related Artifacts

- [AEUX-Coursera repo](https://github.com/ktorii-coursera/AEUX-coursera) — forked Figma + AE plugins
- [Lottie Playground repo](https://github.com/ktorii-coursera/lottie-playground) — converter + web playground
- [Live playground](https://web-sand-five-50.vercel.app)
- [dotLottie 2.0 theming spec](https://dotlottie.io/spec/2.0/#themes)
- [CDS-2098](https://coursera.atlassian.net/browse/CDS-2098) — Jira ticket
- [CDS-1672](https://coursera.atlassian.net/browse/CDS-1672) — Dark Mode epic
