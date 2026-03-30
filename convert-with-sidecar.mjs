import { readFile, writeFile } from "fs/promises";
import { resolve, basename, dirname, join } from "path";
import { DotLottie } from "@dotlottie/dotlottie-js";

const [inputPath, sidecarPath, tokensPath] = process.argv.slice(2);

if (!inputPath || !sidecarPath || !tokensPath) {
  console.error(
    "Usage: node convert-with-sidecar.mjs <input.json> <sidecar.json> <theme-tokens.json>"
  );
  console.error("");
  console.error("  input.json        - Light-mode Lottie JSON (no slots)");
  console.error(
    "  sidecar.json      - Token sidecar mapping (from Figma/AE plugin or manual)"
  );
  console.error(
    "  theme-tokens.json - Token map: { tokenName: { light, dark } }"
  );
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Load files
// ---------------------------------------------------------------------------
const lottieData = JSON.parse(await readFile(resolve(inputPath), "utf-8"));
const sidecar = JSON.parse(await readFile(resolve(sidecarPath), "utf-8"));
const tokens = JSON.parse(await readFile(resolve(tokensPath), "utf-8"));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function hexToRgb01(hex) {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  return [
    Math.round(r * 10000) / 10000,
    Math.round(g * 10000) / 10000,
    Math.round(b * 10000) / 10000,
  ];
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

// Property type to Lottie shape type mapping
const PROPERTY_TO_TY = {
  fill: "fl",
  stroke: "st",
  "gradient-fill": "gf",
  "gradient-stroke": "gs",
};

// ---------------------------------------------------------------------------
// Validate sidecar tokens exist in the theme-tokens file
// ---------------------------------------------------------------------------
for (const mapping of sidecar.mappings) {
  if (!tokens[mapping.token]) {
    console.warn(
      `WARNING: Sidecar references token "${mapping.token}" which is not found in theme-tokens file`
    );
  }
}

// ---------------------------------------------------------------------------
// Build a lookup from layerPath to its mappings for fast matching
// ---------------------------------------------------------------------------
// A single layerPath can have multiple mappings (e.g. fill and stroke on the
// same shape group), so we store them as an array.
const pathToMappings = new Map();
for (const mapping of sidecar.mappings) {
  const key = mapping.layerPath;
  if (!pathToMappings.has(key)) {
    pathToMappings.set(key, []);
  }
  pathToMappings.get(key).push({ ...mapping, matched: false });
}

// ---------------------------------------------------------------------------
// Walk the Lottie JSON tree, tracking the current layer path
// ---------------------------------------------------------------------------
const slots = {};
const darkRules = [];
let matchCount = 0;
let gradientSlotCount = 0;

/**
 * For a given shape item that we matched via path, apply the sid and build
 * the slot + dark rule.
 */
function applySlotToColor(colorObj, tokenName) {
  const tokenData = tokens[tokenName];
  if (!tokenData) return; // already warned above

  const lightRgb = hexToRgb01(tokenData.light);
  const darkRgb = hexToRgb01(tokenData.dark);

  colorObj.sid = tokenName;

  if (!slots[tokenName]) {
    slots[tokenName] = {
      p: {
        a: 0,
        k: [...lightRgb],
      },
    };

    darkRules.push({
      id: tokenName,
      type: "Color",
      value: [...darkRgb],
    });
  }

  matchCount++;
}

function applySlotToGradient(gradientShape, tokenName) {
  const tokenData = tokens[tokenName];
  if (!tokenData) return;

  const gradient = gradientShape.g;
  const numStops = gradient.p;
  const colorData = gradient.k;

  const lightRgb = hexToRgb01(tokenData.light);
  const darkRgb = hexToRgb01(tokenData.dark);

  gradientSlotCount++;
  const slotId = `${tokenName}-gradient-${gradientSlotCount}`;

  colorData.sid = slotId;

  // Preserve current gradient data as the light/default slot value
  slots[slotId] = {
    p: {
      k: { a: colorData.a, k: [...colorData.k] },
      p: numStops,
    },
  };

  // Build dark stops: replace each color stop with the dark token color
  if (colorData.a === 0 && Array.isArray(colorData.k)) {
    const k = colorData.k;
    const darkStops = [];
    for (let i = 0; i < numStops; i++) {
      const base = i * 4;
      if (base + 3 >= k.length) break;
      const offset = k[base];
      const alphaBase = numStops * 4 + i * 2;
      const alpha = alphaBase + 1 < k.length ? k[alphaBase + 1] : 1;
      darkStops.push({ offset, color: [...darkRgb, alpha] });
    }

    darkRules.push({
      id: slotId,
      type: "Gradient",
      value: darkStops,
    });
  }

  matchCount++;
}

/**
 * Given a shape items array (from a group's `it` property or a layer's
 * `shapes`), try to match sidecar entries whose path ends at one of the
 * items in this array.
 */
function processShapeItems(items, parentPath) {
  if (!items || !Array.isArray(items)) return;

  for (const item of items) {
    if (!item || typeof item !== "object") continue;

    const itemName = item.nm;
    const currentPath = itemName ? `${parentPath}/${itemName}` : parentPath;

    // Check if any sidecar mapping targets this path
    const mappings = pathToMappings.get(currentPath);
    if (mappings) {
      for (const mapping of mappings) {
        const expectedTy = PROPERTY_TO_TY[mapping.property];
        if (item.ty === expectedTy) {
          // Validate hex color if provided
          if (mapping.hex) {
            if (mapping.property === "fill" || mapping.property === "stroke") {
              const colorObj = item.c;
              if (
                colorObj &&
                colorObj.a === 0 &&
                Array.isArray(colorObj.k) &&
                colorObj.k.length >= 3 &&
                typeof colorObj.k[0] === "number"
              ) {
                if (!colorsMatch(colorObj.k, mapping.hex)) {
                  const actualHex = rgbToHex(
                    colorObj.k[0],
                    colorObj.k[1],
                    colorObj.k[2]
                  );
                  console.warn(
                    `WARNING: Color mismatch at "${currentPath}": sidecar expects ${mapping.hex}, actual is ${actualHex}`
                  );
                }
              }
            }
          }

          // Apply the slot
          if (mapping.property === "fill" || mapping.property === "stroke") {
            if (item.c) {
              applySlotToColor(item.c, mapping.token);
              mapping.matched = true;
              const actualHex =
                item.c.k && item.c.k.length >= 3
                  ? rgbToHex(item.c.k[0], item.c.k[1], item.c.k[2])
                  : "?";
              console.log(
                `  Matched "${currentPath}" (${mapping.property}) ${actualHex} -> slot "${mapping.token}"`
              );
            }
          } else if (
            mapping.property === "gradient-fill" ||
            mapping.property === "gradient-stroke"
          ) {
            if (item.g) {
              applySlotToGradient(item, mapping.token);
              mapping.matched = true;
              console.log(
                `  Matched "${currentPath}" (${mapping.property}) -> slot "${mapping.token}"`
              );
            }
          }
        }
      }
    }

    // If this is a group (ty === "gr"), recurse into its items
    if (item.ty === "gr" && item.it) {
      processShapeItems(item.it, currentPath);
    }
  }
}

/**
 * Process layers recursively. Layers can contain sub-layers (precomps) or
 * shapes.
 */
function processLayers(layers, parentPath) {
  if (!layers || !Array.isArray(layers)) return;

  for (const layer of layers) {
    if (!layer || typeof layer !== "object") continue;

    const layerName = layer.nm;
    const currentPath = parentPath
      ? `${parentPath}/${layerName}`
      : layerName || "";

    // Shape layers have a `shapes` array
    if (layer.shapes) {
      processShapeItems(layer.shapes, currentPath);
    }

    // Precomp layers can have nested layers
    if (layer.layers) {
      processLayers(layer.layers, currentPath);
    }
  }
}

// ---------------------------------------------------------------------------
// Run the tree walk
// ---------------------------------------------------------------------------
console.log("Scanning Lottie JSON with sidecar mappings...\n");

// Start from the top-level layers. The Lottie root `nm` (composition name)
// is NOT included in the layer path, only the layer names within.
processLayers(lottieData.layers, "");

// ---------------------------------------------------------------------------
// Check for stale/unmatched sidecar mappings
// ---------------------------------------------------------------------------
for (const [path, mappings] of pathToMappings) {
  for (const mapping of mappings) {
    if (!mapping.matched) {
      console.warn(
        `WARNING: Sidecar mapping "${path}" (${mapping.property} -> ${mapping.token}) did not match any layer in the Lottie JSON (stale mapping?)`
      );
    }
  }
}

// ---------------------------------------------------------------------------
// Add slots to lottie data
// ---------------------------------------------------------------------------
lottieData.slots = slots;

console.log(
  `\nAdded ${matchCount} slot reference(s) across ${Object.keys(slots).length} token(s).`
);

// ---------------------------------------------------------------------------
// Write output JSON
// ---------------------------------------------------------------------------
const dir = dirname(resolve(inputPath));
const name = basename(inputPath, ".json");
const outputJson = join(dir, `${name}-themed.json`);
const outputLottie = join(dir, `${name}-themed.lottie`);

await writeFile(outputJson, JSON.stringify(lottieData, null, 2));
console.log(`\nWritten JSON: ${outputJson}`);

// ---------------------------------------------------------------------------
// Build dotLottie with Default + Dark theme
// ---------------------------------------------------------------------------
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

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------
console.log("\n--- Summary ---");
console.log("Slots (Default/Light theme):");
for (const [id, slot] of Object.entries(slots)) {
  if (slot.p.p !== undefined) {
    console.log(`  ${id}: gradient (${slot.p.p} stops)`);
  } else {
    const hex = rgbToHex(slot.p.k[0], slot.p.k[1], slot.p.k[2]);
    console.log(`  ${id}: ${hex}`);
  }
}
console.log("Dark theme rules:");
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
