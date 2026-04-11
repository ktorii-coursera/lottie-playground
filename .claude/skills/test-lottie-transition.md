---
name: test-lottie-transition
description: Visually QA test Lottie color transitions using Playwright MCP browser automation
user_invocable: true
---

# Test Lottie Color Transitions

Use **Playwright MCP** tools to visually verify that the intent-token converter produces correct light/dark color transitions.

## Pre-conditions

- `cd web && npm run dev` is running on `localhost:3000`
- Test Lottie JSON is at `data/comp1.json`

## Timing reference (from data/comp1.json)

Animation: 29.97 fps, 150 frames, ~5 seconds per loop.

| Time | Seconds | Colors |
|---|---|---|
| t=0 | 0.0s | Primary (purple/blue tones) |
| t=29.97 | 1.0s | Still primary (hold) |
| t=74.925 | 2.5s | Disabled (grays) |
| t=120.38 | 4.0s | Back to primary |
| t=149.35 | 5.0s | Primary (loop end) |

## Steps

### 1. Setup
- `mcp__playwright__browser_navigate` to `http://localhost:3000/v2`
- `mcp__playwright__browser_snapshot` to verify page loaded

### 2. Input
- Read `data/comp1.json` from disk using the Read tool
- `mcp__playwright__browser_fill_form` to paste JSON into the `lottie-input` textarea (find ref via snapshot)
- Verify tokens textarea is pre-populated with global.json content

### 3. Convert
- `mcp__playwright__browser_click` the Convert button (find ref via snapshot)
- Wait for conversion: `mcp__playwright__browser_snapshot` until convert-status shows "Done"
- Verify no error messages

### 4. Test Light theme — Primary colors (t ≈ 0s)
- Ensure theme-toggle is set to "Light" (default)
- `mcp__playwright__browser_click` the Restart button on the themed player
- Wait ~500ms for first frame to render
- `mcp__playwright__browser_take_screenshot` of the themed player area
- **Analyze**: Shape should show purple/blue hues
  - Face ≈ #E7D9FF (light lavender)
  - Soft shadow ≈ #ADCFFF (light blue)
  - Hard shadow ≈ #A678F5 (medium purple)

### 5. Test Light theme — Disabled colors (t ≈ 2.5s)
- `mcp__playwright__browser_click` Restart again (resets to t=0)
- Wait ~2500ms (animation reaches the disabled state)
- `mcp__playwright__browser_take_screenshot`
- **Analyze**: Shape should show grayscale tones
  - Face ≈ #7E7E7E (medium gray)
  - Soft shadow ≈ #5F5F5F (darker gray)
  - Hard shadow ≈ #434343 (dark gray)

### 6. Switch to Dark — Primary colors (t ≈ 0s)
- `mcp__playwright__browser_select_option` to set theme-toggle to "Dark"
- `mcp__playwright__browser_click` Restart on themed player
- Wait ~500ms
- `mcp__playwright__browser_take_screenshot`
- **Analyze**: Lighter versions of primary colors
  - Face ≈ #F5EFFF (very light lavender)
  - Soft shadow ≈ #CFE3FF (light blue)
  - Hard shadow ≈ #D1B6FF (light purple)

### 7. Test Dark — Disabled colors (t ≈ 2.5s)
- `mcp__playwright__browser_click` Restart again
- Wait ~2500ms
- `mcp__playwright__browser_take_screenshot`
- **Analyze**: Lighter grays than light mode
  - Face ≈ #A3A3A3 (light gray)
  - Soft shadow ≈ #868686 (medium gray)
  - Hard shadow ≈ #9F9F9F (medium-light gray)

### 8. Compare with Original
- `mcp__playwright__browser_click` Restart on original player
- Wait ~500ms
- `mcp__playwright__browser_take_screenshot` of original player
- Compare visually with themed Light screenshot from step 4

### 9. Report
Summarize which color checks passed/failed. If any mismatch, describe expected vs actual.

## Why Restart is critical

The animation loops continuously. Without restarting, there's no way to know what frame the animation is on. The "restart → wait → screenshot" pattern ensures precise timing:
1. Restart resets to frame 0 (t=0)
2. Wait a known number of seconds to reach the target keyframe
3. Screenshot captures the expected state
4. Restart again if re-checking is needed

## Color verification

This is a qualitative visual check, not pixel-exact:
- "Is the shape showing purplish/blue tones?" (primary state)
- "Is the shape showing gray tones?" (disabled state)
- "Are dark mode colors lighter than light mode?" (theme check)
