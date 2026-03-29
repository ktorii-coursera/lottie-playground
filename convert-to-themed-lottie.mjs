import { readFile, writeFile } from "fs/promises";
import { resolve, basename, dirname, join } from "path";
import { DotLottie } from "@dotlottie/dotlottie-js";

const [inputPath, tokensPath] = process.argv.slice(2);

if (!inputPath || !tokensPath) {
  console.error(
    "Usage: node convert-to-themed-lottie.mjs <input.json> <theme-tokens.json>"
  );
  console.error("");
  console.error("  input.json        - Light-mode Lottie JSON (no slots)");
  console.error(
    "  theme-tokens.json - Token map: { tokenName: { light, dark } }"
  );
  process.exit(1);
}

// Load files
const lottieData = JSON.parse(await readFile(resolve(inputPath), "utf-8"));
const tokens = JSON.parse(await readFile(resolve(tokensPath), "utf-8"));

// Build light hex → { tokenName, darkRgb } lookup
const lightToToken = new Map();

function normalizeHex(hex) {
  return hex.toLowerCase();
}

function hexToRgb01(hex) {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  // Round to 4 decimal places to match Lottie precision
  return [Math.round(r * 10000) / 10000, Math.round(g * 10000) / 10000, Math.round(b * 10000) / 10000];
}

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

function colorsMatch(lottieRgb, targetHex) {
  const [tr, tg, tb] = hexToRgb01(targetHex);
  return (
    Math.abs(Math.round(lottieRgb[0] * 255) - Math.round(tr * 255)) <= 1 &&
    Math.abs(Math.round(lottieRgb[1] * 255) - Math.round(tg * 255)) <= 1 &&
    Math.abs(Math.round(lottieRgb[2] * 255) - Math.round(tb * 255)) <= 1
  );
}

for (const [tokenName, { light, dark }] of Object.entries(tokens)) {
  const normalizedLight = normalizeHex(light);

  if (lightToToken.has(normalizedLight)) {
    const existing = lightToToken.get(normalizedLight);
    console.warn(
      `⚠ AMBIGUITY: Light color ${normalizedLight} used by both "${existing.tokenName}" and "${tokenName}"`
    );
    console.warn(`  Using first match: ${existing.tokenName}`);
    continue;
  }

  lightToToken.set(normalizedLight, {
    tokenName,
    lightRgb: hexToRgb01(light),
    darkRgb: hexToRgb01(dark),
  });
}

console.log("Token mapping:");
for (const [lightHex, { tokenName, darkRgb }] of lightToToken) {
  const darkHex = rgbToHex(darkRgb[0], darkRgb[1], darkRgb[2]);
  console.log(`  ${tokenName}: ${lightHex} (light) → ${darkHex} (dark)`);
}

// Walk the Lottie JSON, find color properties matching light colors,
// and add `sid` references + build the slots and dark theme rules
const slots = {};
const darkRules = [];
let matchCount = 0;

let gradientSlotCount = 0;

function tryMatchAndSlotGradient(gradientShape) {
  const gradient = gradientShape.g;
  const numStops = gradient.p;
  const colorData = gradient.k;

  if (colorData.a !== 0 || !Array.isArray(colorData.k)) return;

  const k = colorData.k;
  let hasMatch = false;
  const darkStops = [];

  for (let i = 0; i < numStops; i++) {
    const base = i * 4;
    if (base + 3 >= k.length) break;
    const offset = k[base];
    const r = k[base + 1];
    const g = k[base + 2];
    const b = k[base + 3];

    // Check for alpha data (appended after color data)
    const alphaBase = numStops * 4 + i * 2;
    const alpha = alphaBase + 1 < k.length ? k[alphaBase + 1] : 1;

    let matched = false;
    for (const [lightHex, { tokenName, darkRgb }] of lightToToken) {
      if (colorsMatch([r, g, b], lightHex)) {
        hasMatch = true;
        matched = true;
        darkStops.push({ offset, color: [...darkRgb, alpha] });
        const hex = rgbToHex(r, g, b);
        console.log(`    Stop ${i} (${(offset * 100).toFixed(0)}%): ${hex} → "${tokenName}" (dark)`);
        break;
      }
    }
    if (!matched) {
      darkStops.push({ offset, color: [r, g, b, alpha] });
    }
  }

  if (!hasMatch) return;

  gradientSlotCount++;
  const slotId = `gradient-${gradientSlotCount}`;

  // Add sid to the gradient colors animated property
  colorData.sid = slotId;

  // Build slot with gradient structure
  slots[slotId] = {
    p: {
      k: { a: 0, k: [...k] },
      p: numStops,
    },
  };

  // Build dark theme rule
  darkRules.push({
    id: slotId,
    type: "Gradient",
    value: darkStops,
  });

  matchCount++;
  console.log(`  Matched gradient → slot "${slotId}" (${numStops} stops)`);
}

function tryMatchAndSlot(colorObj) {
  if (colorObj.a !== 0 || !Array.isArray(colorObj.k) || colorObj.k.length < 3 || colorObj.k.length > 4) {
    return; // Only handle static colors; skip gradient data arrays (length > 4)
  }
  if (typeof colorObj.k[0] !== "number") return;

  for (const [lightHex, { tokenName, lightRgb, darkRgb }] of lightToToken) {
    if (colorsMatch(colorObj.k, lightHex)) {
      // Add sid to this property
      colorObj.sid = tokenName;

      // Add to slots registry (only once per token)
      if (!slots[tokenName]) {
        slots[tokenName] = {
          p: {
            a: 0,
            k: [...lightRgb],
          },
        };

        // Add dark theme rule
        darkRules.push({
          id: tokenName,
          type: "Color",
          value: [...darkRgb],
        });
      }

      matchCount++;
      const hex = rgbToHex(colorObj.k[0], colorObj.k[1], colorObj.k[2]);
      console.log(`  Matched ${hex} → slot "${tokenName}"`);
      return;
    }
  }
}

function walkAndAddSlots(obj) {
  if (!obj || typeof obj !== "object") return;

  if (Array.isArray(obj)) {
    for (const item of obj) {
      walkAndAddSlots(item);
    }
    return;
  }

  // Handle gradient fills/strokes
  if ((obj.ty === "gf" || obj.ty === "gs") && obj.g && obj.g.p && obj.g.k) {
    tryMatchAndSlotGradient(obj);
  }

  // Any object with {a, k} where k is an [r,g,b] array is a potential color property.
  // Let the value matching in tryMatchAndSlot decide if it's a token color.
  if ("a" in obj && "k" in obj) {
    tryMatchAndSlot(obj);
  }

  // Recurse
  for (const value of Object.values(obj)) {
    walkAndAddSlots(value);
  }
}

console.log("\nScanning for colors...");
walkAndAddSlots(lottieData);

// Add slots to lottie data
lottieData.slots = slots;

console.log(`\nAdded ${matchCount} slot reference(s) across ${Object.keys(slots).length} token(s).`);

// Write output JSON (with slots, default/light theme baked in)
const dir = dirname(resolve(inputPath));
const name = basename(inputPath, ".json");
const outputJson = join(dir, `${name}-themed.json`);
const outputLottie = join(dir, `${name}-themed.lottie`);

await writeFile(outputJson, JSON.stringify(lottieData, null, 2));
console.log(`\nWritten JSON: ${outputJson}`);

// Build dotLottie with Default + Dark theme
const dotlottie = new DotLottie();

dotlottie.addAnimation({
  id: name,
  data: lottieData,
});

dotlottie.addTheme({
  id: "Dark",
  data: {
    rules: darkRules,
  },
});

const buffer = await dotlottie.toArrayBuffer();
await writeFile(outputLottie, Buffer.from(buffer));
console.log(`Written dotLottie: ${outputLottie}`);

// Summary
console.log("\n--- Summary ---");
console.log(`Slots (Default/Light theme):`);
for (const [id, slot] of Object.entries(slots)) {
  if (slot.p.p !== undefined) {
    // Gradient slot
    console.log(`  ${id}: gradient (${slot.p.p} stops)`);
  } else {
    const hex = rgbToHex(slot.p.k[0], slot.p.k[1], slot.p.k[2]);
    console.log(`  ${id}: ${hex}`);
  }
}
console.log(`Dark theme rules:`);
for (const rule of darkRules) {
  if (rule.type === "Gradient") {
    const stops = rule.value.map((s) => {
      const hex = rgbToHex(s.color[0], s.color[1], s.color[2]);
      return `${(s.offset * 100).toFixed(0)}%:${hex}`;
    });
    console.log(`  ${rule.id}: gradient [${stops.join(", ")}]`);
  } else {
    const hex = rgbToHex(rule.value[0], rule.value[1], rule.value[2]);
    console.log(`  ${rule.id}: ${hex}`);
  }
}
