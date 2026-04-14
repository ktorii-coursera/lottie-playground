---
name: test-lottie-v3
description: E2E regression test for v3 bracket-token Lottie dark mode theming using Playwright MCP. Tests files in data/ae_marker_tests/.
user_invocable: true
---

# Lottie Theme v3 E2E Regression Test

Run visual QA tests on v3 bracket-token test files using Playwright MCP. This is a regression suite — run it after any change to the v3 converter or playground.

## Pre-conditions

- `cd web && npm run dev` is running on `localhost:3000`
- Test files served from `web/public/`: `goupanddown.json`, `goupanddown-transition.json`, `gradient-only.json`, `tokens.json`
- Also run `npm test` first to verify unit tests pass

## Page controls

| Element | data-testid | Action |
|---|---|---|
| Tokens textarea | `tokens-input` | `fill` with token JSON |
| Lottie textarea | `lottie-input` | `fill` with Lottie JSON |
| Method dropdown | `method-toggle` | `select_option` "bracket-tokens" or "layer-name" |
| Convert button | `convert-btn` | `click` — runs conversion |
| Status text | `convert-status` | Wait for "Done" |
| Theme dropdown | `theme-toggle` | `select_option` "light" or "dark" |
| Pause/Play | `pause` | `click` — freezes both players |
| Restart | `restart` | `click` — plays from frame 0 |
| Frame input | `frame-input` | `fill` with frame number |
| Go to frame | `goto-frame` | `click` — seeks both players |

## How to test each file

For each file:
1. Navigate to `http://localhost:3000`
2. Load JSON + tokens via `browser_evaluate`:
   ```js
   Promise.all([
     fetch('/FILENAME.json').then(r => r.text()),
     fetch('/tokens.json').then(r => r.text())
   ]).then(([lottie, tokens]) => {
     const lottieEl = document.querySelector('[data-testid="lottie-input"]');
     const tokensEl = document.querySelector('[data-testid="tokens-input"]');
     const set = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set;
     set.call(lottieEl, lottie); lottieEl.dispatchEvent(new Event('input', { bubbles: true }));
     set.call(tokensEl, tokens); tokensEl.dispatchEvent(new Event('input', { bubbles: true }));
   })
   ```
3. Ensure method dropdown is set to **Bracket tokens (v3)** (it's the default)
4. `click` Convert button
5. `browser_wait_for` text "Done"
6. Run the test matrix for that file (see below)

For each check:
1. `select_option` the theme
2. `click` Pause
3. `fill` frame-input with the frame number
4. `click` Go to frame
5. Wait 0.3s
6. `take_screenshot`
7. Analyze: compare Original (left) vs Themed (right)

---

## Test Matrix

### File 1: `goupanddown.json` — 3D isometric box, all static fills, bouncing

3 layers (lit, soft, hard), all static fills with single tokens. Box bounces up and down via position animation.

| # | Theme | Frame | Original (left) | Themed (right) | Check |
|---|---|---|---|---|---|
| 1.1 | Light | 0 | Purple/blue/lavender box at center | Should match Original | SAME |
| 1.2 | Light | 75 | Box at top of bounce | Should match Original | SAME |
| 1.3 | Dark | 0 | Purple/blue/lavender box | Lighter pastels on dark bg | DIFFERENT (lighter) |
| 1.4 | Dark | 75 | Box at top of bounce | Lighter pastels on dark bg | DIFFERENT (lighter) |
| 1.5 | Dark→Light | 0 | Purple/blue box | Should match Original again | SAME (no stuck dark) |

### File 2: `goupanddown-transition.json` — 3D isometric box, animated fills with color transitions

3 layers (lit, soft, hard), each with animated fills transitioning colored → gray → colored. Each layer has 2 tokens (primary + disabled). Box also bounces.

Keyframe timing: colored at t=0, holds to ~t=49, gray at ~t=74, back to colored at ~t=96.

| # | Theme | Frame | Original (left) | Themed (right) | Check |
|---|---|---|---|---|---|
| 2.1 | Light | 0 | Colored box (purple/blue/lavender) | Should match Original | SAME |
| 2.2 | Light | 74 | Gray box (all faces gray) | Should match Original | SAME |
| 2.3 | Dark | 0 | Colored box | Lighter pastels on dark bg | DIFFERENT (lighter) |
| 2.4 | Dark | 74 | Gray box | Lighter grays on dark bg | DIFFERENT (lighter) |
| 2.5 | Dark→Light | 0 | Colored box | Should match Original again | SAME (no stuck dark) |
| 2.6 | Light | 50 | Transition mid-point: colors shifting | Should match Original | SAME |

### File 3: `gradient-only.json` — Gradient fill, 2 stops mapped to tokens

1 layer with a gradient fill (`ty: "gf"`) containing 2 color stops:
- Stop 0: `mat-hard-lit-primary-side-face` (#E7D9FF light → #F5EFFF dark)
- Stop 1: `mat-hard-lit-primary-side-soft-shadow` (#A678F5 light → #D1B6FF dark)

No animation on the gradient colors — just a static linear gradient. The layer has animated start/end points but the colors are static.

| # | Theme | Frame | Original (left) | Themed (right) | Check |
|---|---|---|---|---|---|
| 3.1 | Light | 0 | Purple gradient (lavender → purple) | Should match Original | SAME |
| 3.2 | Dark | 0 | Purple gradient | Lighter pastels on dark bg | DIFFERENT (lighter) |
| 3.3 | Dark→Light | 0 | Purple gradient | Should match Original again | SAME (no stuck dark) |

---

## Result template

After running all tests, report:

| Test | Expected | Result |
|---|---|---|
| 1.1 goupanddown Light f0 | Original == Themed | PASS/FAIL |
| 1.2 goupanddown Light f75 | Original == Themed | PASS/FAIL |
| 1.3 goupanddown Dark f0 | Themed lighter | PASS/FAIL |
| 1.4 goupanddown Dark f75 | Themed lighter | PASS/FAIL |
| 1.5 goupanddown Dark→Light f0 | Restored to light | PASS/FAIL |
| 2.1 transition Light f0 | Original == Themed | PASS/FAIL |
| 2.2 transition Light f74 | Original == Themed | PASS/FAIL |
| 2.3 transition Dark f0 | Themed lighter | PASS/FAIL |
| 2.4 transition Dark f74 | Themed lighter grays | PASS/FAIL |
| 2.5 transition Dark→Light f0 | Restored to light | PASS/FAIL |
| 2.6 transition Light f50 | Transition matches | PASS/FAIL |
| 3.1 gradient Light f0 | Original == Themed | PASS/FAIL |
| 3.2 gradient Dark f0 | Themed lighter gradient | PASS/FAIL |
| 3.3 gradient Dark→Light f0 | Restored to light | PASS/FAIL |

## Color verification approach

This is a qualitative visual check, not pixel-exact:
- **SAME**: Left and right players should be visually indistinguishable
- **DIFFERENT (lighter)**: Themed player should show noticeably lighter/more pastel colors on dark background
- **No stuck dark**: After switching Dark→Light, all fills should return to original light colors
