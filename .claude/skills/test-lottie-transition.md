---
name: test-lottie-transition
description: E2E regression test for Lottie dark mode theming using Playwright MCP. Tests all files in data/aftereffects_export_tests/.
user_invocable: true
---

# Lottie Theme E2E Regression Test

Run visual QA tests on ALL test files using Playwright MCP. This is a regression suite — run it after any change to the converter or playground.

## Pre-conditions

- `cd web && npm run dev` is running on `localhost:3000`
- Test files served from `web/public/`: `comp1.json`, `fanonecolortest.json`, `fan-transition.json`
- Also run `npm test` first to verify unit tests pass

## Page controls

| Element | data-testid | Action |
|---|---|---|
| Theme dropdown | `theme-toggle` | `select_option` "light" or "dark" |
| Pause/Play | `pause` | `click` — freezes both players |
| Restart | `restart` | `click` — plays from frame 0 |
| Frame input | `frame-input` | `fill` with frame number |
| Go to frame | `goto-frame` | `click` — seeks both players |
| Convert | `convert-btn` | `click` — runs conversion |

## How to test each file

For each file:
1. Navigate to `http://localhost:3000/v2`
2. Load JSON via `browser_evaluate`:
   ```js
   fetch('/FILENAME.json').then(r => r.text()).then(t => {
     const el = document.querySelector('[data-testid="lottie-input"]');
     const set = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set;
     set.call(el, t); el.dispatchEvent(new Event('input', { bubbles: true }));
     document.querySelector('[data-testid="convert-btn"]').click();
   })
   ```
3. `browser_wait_for` text "Done"
4. Run the test matrix for that file (see below)

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

### File 1: `comp1.json` — 3D isometric box with color transitions

3 layers, all animated fills transitioning between primary (purple/blue) and disabled (gray) tokens.

| # | Theme | Frame | Original (left) | Themed (right) | Check |
|---|---|---|---|---|---|
| 1.1 | Light | 0 | Purple/blue/lavender box | Should match Original | SAME |
| 1.2 | Light | 75 | Gray box | Should match Original | SAME |
| 1.3 | Dark | 0 | Purple/blue/lavender box | Lighter pastels on dark bg | DIFFERENT (lighter) |
| 1.4 | Dark | 75 | Gray box | Lighter grays on dark bg | DIFFERENT (lighter) |
| 1.5 | Dark→Light | 0 | Purple/blue box | Should match Original again | SAME (no stuck dark) |

### File 2: `fanonecolortest.json` — spinning fan, all static fills

1 layer, 4 static fills all #A678F5. No color transitions.

| # | Theme | Frame | Original (left) | Themed (right) | Check |
|---|---|---|---|---|---|
| 2.1 | Light | 0 | Purple fan | Should match Original | SAME |
| 2.2 | Dark | 0 | Purple fan | Lighter purple fan on dark bg | DIFFERENT (lighter) |
| 2.3 | Dark→Light | 0 | Purple fan | Should match Original again | SAME (no stuck dark) |

### File 3: `fan-transition.json` — spinning fan, mixed static + animated

1 layer, 3 static fills + 1 animated fill (transitions #7E7E7E → #A678F5 with opacity 0→100%).

| # | Theme | Frame | Original (left) | Themed (right) | Check |
|---|---|---|---|---|---|
| 3.1 | Light | 0 | 3 purple blades, 1 invisible (opacity 0) | Should match Original | SAME |
| 3.2 | Light | 60 | 4 purple blades (all visible) | Should match Original | SAME |
| 3.3 | Dark | 0 | 3 purple + 1 invisible | 3 lighter purple + 1 invisible on dark bg | DIFFERENT (lighter) |
| 3.4 | Dark | 60 | 4 purple blades | 4 lighter purple on dark bg | DIFFERENT (lighter) |
| 3.5 | Dark→Light | 0 | 3 purple + 1 invisible | All 4 blades match Original (no stuck dark) | SAME |
| 3.6 | Light | 30 | Transition mid-point: blade fading in | Should match Original | SAME |

---

## Result template

After running all tests, report:

| Test | Expected | Result |
|---|---|---|
| 1.1 comp1 Light f0 | Original == Themed | PASS/FAIL |
| 1.2 comp1 Light f75 | Original == Themed | PASS/FAIL |
| 1.3 comp1 Dark f0 | Themed lighter | PASS/FAIL |
| 1.4 comp1 Dark f75 | Themed lighter grays | PASS/FAIL |
| 1.5 comp1 Dark→Light f0 | Restored to light | PASS/FAIL |
| 2.1 fan Light f0 | Original == Themed | PASS/FAIL |
| 2.2 fan Dark f0 | Themed lighter | PASS/FAIL |
| 2.3 fan Dark→Light f0 | Restored to light | PASS/FAIL |
| 3.1 mixed Light f0 | Original == Themed | PASS/FAIL |
| 3.2 mixed Light f60 | Original == Themed | PASS/FAIL |
| 3.3 mixed Dark f0 | Themed lighter | PASS/FAIL |
| 3.4 mixed Dark f60 | Themed lighter | PASS/FAIL |
| 3.5 mixed Dark→Light f0 | Restored to light | PASS/FAIL |
| 3.6 mixed Light f30 | Transition matches | PASS/FAIL |

## Color verification approach

This is a qualitative visual check, not pixel-exact:
- **SAME**: Left and right players should be visually indistinguishable
- **DIFFERENT (lighter)**: Themed player should show noticeably lighter/more pastel colors on dark background
- **No stuck dark**: After switching Dark→Light, all fills should return to original light colors (the bug we fixed with light rules for static fills)
