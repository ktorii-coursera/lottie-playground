import { readFile, writeFile } from "fs/promises";
import { resolve, basename, dirname, join } from "path";
import { DotLottie } from "@dotlottie/dotlottie-js";
import { convertWithIntentTokens, rgbToHex } from "./lib/intent-token-converter.js";

const [inputPath, tokensPath] = process.argv.slice(2);

if (!inputPath || !tokensPath) {
  console.error(
    "Usage: npx tsx convert-to-themed-lottie-v2.ts <input.json> <global.json>"
  );
  console.error("");
  console.error("  input.json  - Lottie JSON with intent-token layer names");
  console.error(
    "  global.json - Token map: { tokenName: { light, dark, alpha? } }"
  );
  process.exit(1);
}

const lottieData = JSON.parse(await readFile(resolve(inputPath), "utf-8"));
const raw = JSON.parse(await readFile(resolve(tokensPath), "utf-8"));
const tokens = raw.tokens ?? raw;

const { data, slots, lightRules, darkRules, logs } = convertWithIntentTokens(
  lottieData,
  tokens
);

for (const log of logs) {
  console.log(log);
}

// Write output JSON
const dir = dirname(resolve(inputPath));
const name = basename(inputPath, ".json");
const outputJson = join(dir, `${name}-themed.json`);
const outputLottie = join(dir, `${name}-themed.lottie`);

await writeFile(outputJson, JSON.stringify(data, null, 2));
console.log(`\nWritten JSON: ${outputJson}`);

// Build dotLottie with Light + Dark themes
const dotlottie = new DotLottie();

dotlottie.addAnimation({
  id: name,
  data,
});

// Light theme (needed for animated color transitions — the fill is
// flattened to static, so the light keyframes come from this theme)
if (lightRules.length > 0) {
  dotlottie.addTheme({
    id: "Light",
    data: { rules: lightRules },
  });
}

dotlottie.addTheme({
  id: "Dark",
  data: { rules: darkRules },
});

const buffer = await dotlottie.toArrayBuffer();
await writeFile(outputLottie, Buffer.from(buffer));
console.log(`Written dotLottie: ${outputLottie}`);

// Summary
console.log("\n--- Summary ---");
console.log(`Slots (${Object.keys(slots).length}):`);
for (const [id, slot] of Object.entries(slots) as [string, any][]) {
  const hex = rgbToHex(slot.p.k[0], slot.p.k[1], slot.p.k[2]);
  console.log(`  ${id}: ${hex} (static)`);
}
const printRules = (label: string, rules: any[]) => {
  console.log(`${label} (${rules.length}):`);
  for (const rule of rules) {
    if (rule.keyframes) {
      console.log(`  ${rule.id}: animated (${rule.keyframes.length} keyframes)`);
    } else if (Array.isArray(rule.value)) {
      const hex = rgbToHex(rule.value[0], rule.value[1], rule.value[2]);
      console.log(`  ${rule.id}: ${hex}`);
    }
  }
};
printRules("Light rules", lightRules);
printRules("Dark rules", darkRules);
