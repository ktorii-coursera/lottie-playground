import { readFile, writeFile } from "fs/promises";
import { resolve, basename, dirname, join } from "path";
import { DotLottie } from "@dotlottie/dotlottie-js";

const [inputPath, tokensPath] = process.argv.slice(2);

if (!inputPath || !tokensPath) {
  console.error(
    "Usage: node convert-theme.mjs <input.json> <theme-tokens.json>"
  );
  process.exit(1);
}

// Load files
const lottieData = JSON.parse(await readFile(resolve(inputPath), "utf-8"));
const tokens = JSON.parse(await readFile(resolve(tokensPath), "utf-8"));

// Build light→dark lookup
// Key: normalized hex (lowercase, 6-digit), Value: { dark, tokenNames[] }
const lightToDark = new Map();

for (const [tokenName, { light, dark }] of Object.entries(tokens)) {
  const normalizedLight = normalizeHex(light);
  const normalizedDark = normalizeHex(dark);

  if (lightToDark.has(normalizedLight)) {
    const existing = lightToDark.get(normalizedLight);
    existing.tokenNames.push(tokenName);

    if (existing.dark !== normalizedDark) {
      console.warn(
        `⚠ AMBIGUITY: Light color ${normalizedLight} maps to multiple dark colors:`
      );
      console.warn(
        `  ${existing.tokenNames[0]} → ${existing.dark}`
      );
      console.warn(`  ${tokenName} → ${normalizedDark}`);
      console.warn(`  Using first match: ${existing.dark}`);
    }
  } else {
    lightToDark.set(normalizedLight, {
      dark: normalizedDark,
      tokenNames: [tokenName],
    });
  }
}

console.log("\nColor mapping:");
for (const [light, { dark, tokenNames }] of lightToDark) {
  console.log(`  ${light} → ${dark}  (${tokenNames.join(", ")})`);
}

// Walk the Lottie JSON and swap colors
let swapCount = 0;

function rgbToHex(r, g, b) {
  return (
    "#" +
    [r, g, b]
      .map((c) =>
        Math.round(c * 255)
          .toString(16)
          .padStart(2, "0")
      )
      .join("")
  );
}

function hexToRgb(hex) {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  return [r, g, b];
}

function normalizeHex(hex) {
  return hex.toLowerCase().replace(/^#/, "#");
}

function colorsMatch(lottieRgb, targetHex) {
  const lottieHex = rgbToHex(lottieRgb[0], lottieRgb[1], lottieRgb[2]);
  // Allow ±1 difference per channel for rounding
  const [tr, tg, tb] = hexToRgb(targetHex);
  return (
    Math.abs(Math.round(lottieRgb[0] * 255) - Math.round(tr * 255)) <= 1 &&
    Math.abs(Math.round(lottieRgb[1] * 255) - Math.round(tg * 255)) <= 1 &&
    Math.abs(Math.round(lottieRgb[2] * 255) - Math.round(tb * 255)) <= 1
  );
}

function swapColorValue(k) {
  // k is [r, g, b] or [r, g, b, a] in 0-1 range
  if (!Array.isArray(k) || k.length < 3) return;
  if (typeof k[0] !== "number") return;

  for (const [lightHex, { dark }] of lightToDark) {
    if (colorsMatch(k, lightHex)) {
      const [r, g, b] = hexToRgb(dark);
      k[0] = r;
      k[1] = g;
      k[2] = b;
      swapCount++;
      return;
    }
  }
}

function swapGradientStopColors(gradient) {
  const numStops = gradient.p;
  const colorData = gradient.k;

  function swapStopsInArray(k) {
    if (!Array.isArray(k)) return;
    for (let i = 0; i < numStops; i++) {
      const base = i * 4;
      if (base + 3 >= k.length) break;
      const r = k[base + 1];
      const g = k[base + 2];
      const b = k[base + 3];

      for (const [lightHex, { dark }] of lightToDark) {
        if (colorsMatch([r, g, b], lightHex)) {
          const [nr, ng, nb] = hexToRgb(dark);
          k[base + 1] = nr;
          k[base + 2] = ng;
          k[base + 3] = nb;
          swapCount++;
          break;
        }
      }
    }
  }

  if (colorData.a === 0) {
    swapStopsInArray(colorData.k);
  } else if (colorData.a === 1) {
    for (const keyframe of colorData.k) {
      if (keyframe.s) swapStopsInArray(keyframe.s);
      if (keyframe.e) swapStopsInArray(keyframe.e);
    }
  }
}

function walkAndSwapColors(obj) {
  if (!obj || typeof obj !== "object") return;

  if (Array.isArray(obj)) {
    for (const item of obj) {
      walkAndSwapColors(item);
    }
    return;
  }

  // Handle gradient fills/strokes
  if ((obj.ty === "gf" || obj.ty === "gs") && obj.g && obj.g.p && obj.g.k) {
    swapGradientStopColors(obj.g);
  }

  // Check if this looks like a color property with static value
  if ("a" in obj && "k" in obj && Array.isArray(obj.k)) {
    if (obj.a === 0) {
      // Static color
      swapColorValue(obj.k);
    } else if (obj.a === 1) {
      // Animated — keyframes, each has "s" (start value) and optionally "e" (end value)
      for (const keyframe of obj.k) {
        if (keyframe.s) swapColorValue(keyframe.s);
        if (keyframe.e) swapColorValue(keyframe.e);
      }
    }
  }

  // Recurse into all properties
  for (const value of Object.values(obj)) {
    walkAndSwapColors(value);
  }
}

walkAndSwapColors(lottieData);

// Remove slots and sid references — this is a standalone dark file,
// so stale slot values (especially unswapped gradient slots) would
// override the correctly-swapped inline values in players.
delete lottieData.slots;
(function removeSids(obj) {
  if (!obj || typeof obj !== "object") return;
  if (Array.isArray(obj)) { obj.forEach(removeSids); return; }
  delete obj.sid;
  for (const value of Object.values(obj)) removeSids(value);
})(lottieData);

console.log(`\nSwapped ${swapCount} color value(s).`);

// Write output JSON
const dir = dirname(resolve(inputPath));
const name = basename(inputPath, ".json");
const outputJson = join(dir, `${name}-dark.json`);
const outputLottie = join(dir, `${name}-dark.lottie`);

await writeFile(outputJson, JSON.stringify(lottieData));
console.log(`Written: ${outputJson}`);

// Export to .lottie
const dotlottie = new DotLottie();
dotlottie.addAnimation({
  id: `${name}-dark`,
  data: lottieData,
});
const buffer = await dotlottie.toArrayBuffer();
await writeFile(outputLottie, Buffer.from(buffer));
console.log(`Written: ${outputLottie}`);
