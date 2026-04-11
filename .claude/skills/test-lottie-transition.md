---
name: test-lottie-transition
description: Visually QA test Lottie color transitions using Playwright MCP browser automation
user_invocable: true
---

# Test Lottie Color Transitions

Use **Playwright MCP** tools to visually verify that the intent-token converter produces correct light/dark color transitions in the `/v2` playground.

## Pre-conditions

- `cd web && npm run dev` is running on `localhost:3000`
- Test Lottie JSON is at `data/aftereffects_export_tests/comp1.json` (or served via `web/public/comp1.json`)

## Page controls reference

The `/v2` page has:
- **Two players**: Original (left) and Themed (right, defaults to Dark)
- **Theme dropdown** (`data-testid="theme-toggle"`): only affects the themed player
- **Shared controls** that operate BOTH players simultaneously:
  - `data-testid="pause"` — Pause/Play toggle
  - `data-testid="restart"` — Stop + Play from frame 0
  - `data-testid="frame-input"` + `data-testid="goto-frame"` — Seek to specific frame

## Key frames for comp1.json

| Frame | Colors (Light) | Colors (Dark) |
|---|---|---|
| 0 | Primary: purple/blue/lavender | Primary: lighter pastels |
| 30 | Same as 0 (hold) | Same as 0 (hold) |
| 75 | Disabled: grays (#7E7E7E, #5F5F5F, #434343) | Disabled: lighter grays (#A3A3A3, #868686, #9F9F9F) |
| 120 | Back to primary | Back to primary |
| 150 | Same as 0 (loop) | Same as 0 (loop) |

## Test flow

### 1. Setup and Convert

```
1. mcp__playwright__browser_navigate → http://localhost:3000/v2
2. Paste comp1.json into lottie-input textarea via browser_evaluate:
   fetch('/comp1.json').then(r => r.text()).then(t => {
     const el = document.querySelector('[data-testid="lottie-input"]');
     const set = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set;
     set.call(el, t); el.dispatchEvent(new Event('input', { bubbles: true }));
     document.querySelector('[data-testid="convert-btn"]').click();
   })
3. browser_wait_for text "Done"
```

### 2. Test Light theme — Original vs Themed should match

```
1. browser_select_option theme-toggle → "light"
2. Click "Pause" button (data-testid="pause") to freeze both players
3. Set frame-input to "0", click "Go to frame"
4. Take screenshot of BOTH players side by side
5. VERIFY: Original and Themed should look IDENTICAL (same purple/blue colors)
6. Set frame-input to "75", click "Go to frame"
7. Take screenshot of BOTH players
8. VERIFY: Original and Themed should look IDENTICAL (same gray colors)
```

**Rule: In Light mode, Original and Themed must be visually identical at every frame.**

### 3. Test Dark theme — Themed should differ from Original

```
1. browser_select_option theme-toggle → "dark"
2. Set frame-input to "0", click "Go to frame"
3. Take screenshot of BOTH players
4. VERIFY: Themed (right, dark bg) should show LIGHTER/more pastel colors
   than Original (left, white bg). They should NOT look the same.
5. Set frame-input to "75", click "Go to frame"
6. Take screenshot of BOTH players
7. VERIFY: Both show grays, but Themed grays should be LIGHTER than Original grays.
   Original: dark grays (#7E7E7E, #5F5F5F, #434343)
   Themed:  light grays (#A3A3A3, #868686, #9F9F9F)
```

**Rule: In Dark mode, Themed must look visibly different from Original — lighter colors on dark background.**

### 4. Test color transitions during playback

```
1. Keep theme on "dark"
2. Click "Restart" to play both from frame 0
3. Wait ~2.5 seconds (animation reaches disabled state around frame 75)
4. Click "Pause"
5. Take screenshot
6. VERIFY: Original shows dark grays, Themed shows lighter grays
7. Click "Restart" again
8. Wait ~0.5 seconds (near frame 0, primary state)
9. Click "Pause"
10. Take screenshot
11. VERIFY: Original shows purple/blue, Themed shows lighter pastels
```

### 5. Report

Summarize results as a table:

| Check | Expected | Result |
|---|---|---|
| Light frame 0: Original == Themed | Identical purple/blue | PASS/FAIL |
| Light frame 75: Original == Themed | Identical grays | PASS/FAIL |
| Dark frame 0: Original != Themed | Themed lighter pastels | PASS/FAIL |
| Dark frame 75: Original != Themed | Themed lighter grays | PASS/FAIL |
| Playback transition visible | Colors change mid-animation | PASS/FAIL |

## Color verification approach

This is a qualitative visual check, not pixel-exact:
- Compare left (Original) vs right (Themed) players
- In Light mode: they should be indistinguishable
- In Dark mode: Themed should be noticeably lighter/more pastel
- The "Go to frame" + "Pause" pattern is the most reliable way to check specific frames
