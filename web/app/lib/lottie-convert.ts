// Core conversion logic ported from convert-theme.mjs and convert-to-themed-lottie.mjs

export interface ThemeTokens {
  [tokenName: string]: { light: string; dark: string };
}

// --- Shared color utilities ---

function normalizeHex(hex: string): string {
  return hex.toLowerCase();
}

function hexToRgb01(hex: string): [number, number, number] {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  return [
    Math.round(r * 10000) / 10000,
    Math.round(g * 10000) / 10000,
    Math.round(b * 10000) / 10000,
  ];
}

function rgbToHex(r: number, g: number, b: number): string {
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

function colorsMatch(
  lottieRgb: number[],
  targetHex: string
): boolean {
  const [tr, tg, tb] = hexToRgb01(targetHex);
  return (
    Math.abs(Math.round(lottieRgb[0] * 255) - Math.round(tr * 255)) <= 1 &&
    Math.abs(Math.round(lottieRgb[1] * 255) - Math.round(tg * 255)) <= 1 &&
    Math.abs(Math.round(lottieRgb[2] * 255) - Math.round(tb * 255)) <= 1
  );
}

// --- convert-theme logic (light → dark color swap) ---

export function createDarkLottie(
  lottieData: any,
  tokens: ThemeTokens
): { data: any; logs: string[] } {
  // Deep clone
  const data = JSON.parse(JSON.stringify(lottieData));
  const logs: string[] = [];

  // Build light→dark lookup
  const lightToDark = new Map<
    string,
    { dark: string; tokenNames: string[] }
  >();

  for (const [tokenName, { light, dark }] of Object.entries(tokens)) {
    const normalizedLight = normalizeHex(light);
    const normalizedDark = normalizeHex(dark);

    if (lightToDark.has(normalizedLight)) {
      const existing = lightToDark.get(normalizedLight)!;
      existing.tokenNames.push(tokenName);
      if (existing.dark !== normalizedDark) {
        logs.push(
          `⚠ AMBIGUITY: Light color ${normalizedLight} maps to multiple dark colors`
        );
      }
    } else {
      lightToDark.set(normalizedLight, {
        dark: normalizedDark,
        tokenNames: [tokenName],
      });
    }
  }

  let swapCount = 0;

  function swapColorValue(k: number[]) {
    if (!Array.isArray(k) || k.length < 3) return;
    if (typeof k[0] !== "number") return;

    for (const [lightHex, { dark }] of lightToDark) {
      if (colorsMatch(k, lightHex)) {
        const [r, g, b] = hexToRgb01(dark);
        k[0] = r;
        k[1] = g;
        k[2] = b;
        swapCount++;
        return;
      }
    }
  }

  function swapGradientStopColors(gradient: any) {
    const numStops = gradient.p;
    const colorData = gradient.k;

    function swapStopsInArray(k: number[]) {
      if (!Array.isArray(k)) return;
      for (let i = 0; i < numStops; i++) {
        const base = i * 4;
        if (base + 3 >= k.length) break;
        const r = k[base + 1];
        const g = k[base + 2];
        const b = k[base + 3];

        for (const [lightHex, { dark }] of lightToDark) {
          if (colorsMatch([r, g, b], lightHex)) {
            const [nr, ng, nb] = hexToRgb01(dark);
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

  function walkAndSwapColors(obj: any) {
    if (!obj || typeof obj !== "object") return;

    if (Array.isArray(obj)) {
      for (const item of obj) {
        walkAndSwapColors(item);
      }
      return;
    }

    if (
      (obj.ty === "gf" || obj.ty === "gs") &&
      obj.g &&
      obj.g.p &&
      obj.g.k
    ) {
      swapGradientStopColors(obj.g);
    }

    if ("a" in obj && "k" in obj && Array.isArray(obj.k)) {
      if (obj.a === 0) {
        swapColorValue(obj.k);
      } else if (obj.a === 1) {
        for (const keyframe of obj.k) {
          if (keyframe.s) swapColorValue(keyframe.s);
          if (keyframe.e) swapColorValue(keyframe.e);
        }
      }
    }

    for (const value of Object.values(obj)) {
      walkAndSwapColors(value);
    }
  }

  walkAndSwapColors(data);

  // Remove slots and sid references — this is a standalone dark file,
  // so stale slot values (especially unswapped gradient slots) would
  // override the correctly-swapped inline values in players.
  delete data.slots;
  (function removeSids(obj: any) {
    if (!obj || typeof obj !== "object") return;
    if (Array.isArray(obj)) { obj.forEach(removeSids); return; }
    delete obj.sid;
    for (const value of Object.values(obj)) removeSids(value);
  })(data);

  logs.push(`Swapped ${swapCount} color value(s) for dark version.`);

  return { data, logs };
}

// --- convert-to-themed-lottie logic (adds slots + dark theme) ---

export function createThemedLottie(
  lottieData: any,
  tokens: ThemeTokens
): { data: any; darkRules: any[]; logs: string[] } {
  // Deep clone
  const data = JSON.parse(JSON.stringify(lottieData));
  const logs: string[] = [];

  const lightToToken = new Map<
    string,
    { tokenName: string; lightRgb: [number, number, number]; darkRgb: [number, number, number] }
  >();

  for (const [tokenName, { light, dark }] of Object.entries(tokens)) {
    const normalizedLight = normalizeHex(light);

    if (lightToToken.has(normalizedLight)) {
      const existing = lightToToken.get(normalizedLight)!;
      logs.push(
        `⚠ AMBIGUITY: Light color ${normalizedLight} used by both "${existing.tokenName}" and "${tokenName}"`
      );
      continue;
    }

    lightToToken.set(normalizedLight, {
      tokenName,
      lightRgb: hexToRgb01(light),
      darkRgb: hexToRgb01(dark),
    });
  }

  const slots: Record<string, any> = {};
  const darkRules: any[] = [];
  let matchCount = 0;
  let gradientSlotCount = 0;

  function tryMatchAndSlotGradient(gradientShape: any) {
    const gradient = gradientShape.g;
    const numStops = gradient.p;
    const colorData = gradient.k;

    if (colorData.a !== 0 || !Array.isArray(colorData.k)) return;

    const k = colorData.k;
    let hasMatch = false;
    const darkStops: any[] = [];

    for (let i = 0; i < numStops; i++) {
      const base = i * 4;
      if (base + 3 >= k.length) break;
      const offset = k[base];
      const r = k[base + 1];
      const g = k[base + 2];
      const b = k[base + 3];

      const alphaBase = numStops * 4 + i * 2;
      const alpha = alphaBase + 1 < k.length ? k[alphaBase + 1] : 1;

      let matched = false;
      for (const [lightHex, { darkRgb }] of lightToToken) {
        if (colorsMatch([r, g, b], lightHex)) {
          hasMatch = true;
          matched = true;
          darkStops.push({ offset, color: [...darkRgb, alpha] });
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

    colorData.sid = slotId;

    slots[slotId] = {
      p: {
        k: { a: 0, k: [...k] },
        p: numStops,
      },
    };

    darkRules.push({
      id: slotId,
      type: "Gradient",
      value: darkStops,
    });

    matchCount++;
    logs.push(`Matched gradient → slot "${slotId}" (${numStops} stops)`);
  }

  function tryMatchAndSlot(colorObj: any) {
    if (
      colorObj.a !== 0 ||
      !Array.isArray(colorObj.k) ||
      colorObj.k.length < 3 ||
      colorObj.k.length > 4
    ) {
      return;
    }
    if (typeof colorObj.k[0] !== "number") return;

    for (const [lightHex, { tokenName, lightRgb, darkRgb }] of lightToToken) {
      if (colorsMatch(colorObj.k, lightHex)) {
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
        const hex = rgbToHex(colorObj.k[0], colorObj.k[1], colorObj.k[2]);
        logs.push(`Matched ${hex} → slot "${tokenName}"`);
        return;
      }
    }
  }

  function walkAndAddSlots(obj: any) {
    if (!obj || typeof obj !== "object") return;

    if (Array.isArray(obj)) {
      for (const item of obj) {
        walkAndAddSlots(item);
      }
      return;
    }

    if (
      (obj.ty === "gf" || obj.ty === "gs") &&
      obj.g &&
      obj.g.p &&
      obj.g.k
    ) {
      tryMatchAndSlotGradient(obj);
    }

    if ("a" in obj && "k" in obj) {
      tryMatchAndSlot(obj);
    }

    for (const value of Object.values(obj)) {
      walkAndAddSlots(value);
    }
  }

  walkAndAddSlots(data);

  data.slots = slots;

  logs.push(
    `Added ${matchCount} slot reference(s) across ${Object.keys(slots).length} token(s).`
  );

  return { data, darkRules, logs };
}
