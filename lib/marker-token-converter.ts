// Core conversion logic for marker-based Lottie theming (v3).
// Instead of matching layer names to tokens (v2), this reads
// AEUX_TOKENS markers on each layer to know which intent tokens apply.
// Pure functions — all inputs via parameters (dependency injection).

export interface ThemeToken {
  light: string;
  dark: string;
  alpha?: number; // 0-1, defaults to 1 if omitted
}

export interface ThemeTokens {
  [tokenName: string]: ThemeToken;
}

interface TokenLookupEntry {
  tokenName: string;
  lightRgb: [number, number, number];
  darkRgb: [number, number, number];
}

export interface ConversionResult {
  data: any;
  slots: Record<string, any>;
  lightRules: any[];
  darkRules: any[];
  logs: string[];
}

// --- Marker parsing ---

/**
 * Parse intent token names from a layer's name.
 * Format: "layerName [token1, token2]"
 * Returns the token names, or empty array if no brackets found.
 */
export function parseLayerNameTokens(layerName: string): string[] {
  const match = layerName.match(/\[([^\]]+)\]/);
  if (!match) return [];
  return match[1].split(",").map((t) => t.trim()).filter(Boolean);
}

// --- Color utilities (same as v2) ---

export function hexToRgb01(hex: string): [number, number, number] {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  return [
    Math.round(r * 10000) / 10000,
    Math.round(g * 10000) / 10000,
    Math.round(b * 10000) / 10000,
  ];
}

export function rgbToHex(r: number, g: number, b: number): string {
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

export function colorsMatch(lottieRgb: number[], targetHex: string): boolean {
  const [tr, tg, tb] = hexToRgb01(targetHex);
  return (
    Math.abs(Math.round(lottieRgb[0] * 255) - Math.round(tr * 255)) <= 1 &&
    Math.abs(Math.round(lottieRgb[1] * 255) - Math.round(tg * 255)) <= 1 &&
    Math.abs(Math.round(lottieRgb[2] * 255) - Math.round(tb * 255)) <= 1
  );
}

// --- Helper: convert Lottie keyframes to dotLottie theme keyframes ---

function toThemeKeyframes(lottieKeyframes: any[]): any[] {
  return lottieKeyframes.map((kf: any) => {
    const entry: any = {
      frame: Math.round(kf.t),
      value: kf.s ? [...kf.s] : undefined,
    };
    if (kf.i)
      entry.inTangent = {
        x: Array.isArray(kf.i.x) ? kf.i.x[0] : kf.i.x,
        y: Array.isArray(kf.i.y) ? kf.i.y[0] : kf.i.y,
      };
    if (kf.o)
      entry.outTangent = {
        x: Array.isArray(kf.o.x) ? kf.o.x[0] : kf.o.x,
        y: Array.isArray(kf.o.y) ? kf.o.y[0] : kf.o.y,
      };
    return entry;
  });
}

// --- Main conversion ---

export function convertWithMarkerTokens(
  lottieData: any,
  tokens: ThemeTokens
): ConversionResult {
  const data = JSON.parse(JSON.stringify(lottieData));
  const logs: string[] = [];

  // Build lightHex → token lookup for ALL provided tokens
  const lightHexToToken = new Map<string, TokenLookupEntry>();
  for (const [tokenName, { light, dark }] of Object.entries(tokens).filter(([k]) => !k.startsWith("_"))) {
    const normalizedLight = light.toLowerCase();
    if (!lightHexToToken.has(normalizedLight)) {
      lightHexToToken.set(normalizedLight, {
        tokenName,
        lightRgb: hexToRgb01(light),
        darkRgb: hexToRgb01(dark),
      });
    }
  }

  const slots: Record<string, any> = {};
  const lightRules: any[] = [];
  const darkRules: any[] = [];
  const registeredSlots = new Set<string>();
  let transitionCounter = 0;
  let gradientSlotCounter = 0;

  /** Match a color against only the specific tokens listed in the marker. */
  function matchAgainstMarkerTokens(
    rgb: number[],
    markerTokenNames: string[]
  ): TokenLookupEntry | null {
    for (const tokenName of markerTokenNames) {
      const tokenDef = tokens[tokenName];
      if (!tokenDef) continue;
      if (colorsMatch(rgb, tokenDef.light)) {
        return {
          tokenName,
          lightRgb: hexToRgb01(tokenDef.light),
          darkRgb: hexToRgb01(tokenDef.dark),
        };
      }
    }
    return null;
  }

  function registerStaticSlot(
    slotId: string,
    lightRgb: [number, number, number],
    darkRgb: [number, number, number]
  ) {
    if (registeredSlots.has(slotId)) return;
    registeredSlots.add(slotId);

    slots[slotId] = {
      p: { a: 0, k: [...lightRgb] },
    };
    lightRules.push({
      id: slotId,
      type: "Color",
      value: [...lightRgb],
    });
    darkRules.push({
      id: slotId,
      type: "Color",
      value: [...darkRgb],
    });
  }

  function registerAnimatedSlot(
    slotId: string,
    originalKeyframes: any[],
    darkKeyframes: any[]
  ) {
    if (registeredSlots.has(slotId)) return;
    registeredSlots.add(slotId);

    lightRules.push({
      id: slotId,
      type: "Color",
      keyframes: toThemeKeyframes(originalKeyframes),
    });

    darkRules.push({
      id: slotId,
      type: "Color",
      keyframes: toThemeKeyframes(darkKeyframes),
    });
  }

  function processColor(
    colorProp: any,
    layerName: string,
    markerTokenNames: string[]
  ) {
    if (colorProp.a === 0) {
      // Static color — match against marker tokens by hex
      const match = matchAgainstMarkerTokens(colorProp.k, markerTokenNames);
      if (match) {
        colorProp.sid = match.tokenName;
        registerStaticSlot(match.tokenName, match.lightRgb, match.darkRgb);
        logs.push(
          `Static match: ${rgbToHex(colorProp.k[0], colorProp.k[1], colorProp.k[2])} → slot "${match.tokenName}"`
        );
      }
    } else if (colorProp.a === 1) {
      // Animated color — flatten to static, put keyframes in BOTH themes.
      const originalKeyframes = JSON.parse(JSON.stringify(colorProp.k));
      const darkKeyframes = JSON.parse(JSON.stringify(colorProp.k));
      let matchedAny = false;

      let firstLightRgb: [number, number, number] | null = null;
      if (
        originalKeyframes[0]?.s &&
        originalKeyframes[0].s.length >= 3
      ) {
        firstLightRgb = [
          originalKeyframes[0].s[0],
          originalKeyframes[0].s[1],
          originalKeyframes[0].s[2],
        ];
      }

      for (const keyframe of darkKeyframes) {
        if (
          keyframe.s &&
          Array.isArray(keyframe.s) &&
          keyframe.s.length >= 3
        ) {
          const match = matchAgainstMarkerTokens(
            keyframe.s,
            markerTokenNames
          );
          if (match) {
            const alpha =
              keyframe.s.length > 3 ? keyframe.s[3] : 1;
            keyframe.s = [...match.darkRgb, alpha];
            matchedAny = true;
          }
        }
      }

      if (matchedAny && firstLightRgb) {
        transitionCounter++;
        const sid = `${layerName}_color_${transitionCounter}`;

        colorProp.a = 0;
        colorProp.k = [...firstLightRgb];
        colorProp.sid = sid;

        registerAnimatedSlot(sid, originalKeyframes, darkKeyframes);
        logs.push(
          `Animated match: layer "${layerName}" → sid "${sid}" + light/dark keyframes`
        );
      }
    }
  }

  function processAlpha(
    opacityProp: any,
    layerName: string,
    markerTokenNames: string[]
  ) {
    // Check if any marker token specifies an alpha override
    for (const tokenName of markerTokenNames) {
      const tokenDef = tokens[tokenName];
      if (tokenDef?.alpha !== undefined) {
        opacityProp.a = 0;
        opacityProp.k = tokenDef.alpha * 100;
        logs.push(
          `Alpha override: layer "${layerName}" opacity set to ${tokenDef.alpha * 100}%`
        );
        return;
      }
    }
  }

  function processGradient(
    shape: any,
    layerName: string,
    markerTokenNames: string[]
  ) {
    const gradient = shape.g;
    const numStops = gradient.p;
    const colorData = gradient.k;

    if (colorData.a !== 0 || !Array.isArray(colorData.k)) return;

    const k = colorData.k;
    let hasMatch = false;
    const lightStops: any[] = [];
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

      const match = matchAgainstMarkerTokens([r, g, b], markerTokenNames);
      if (match) {
        hasMatch = true;
        lightStops.push({ offset, color: [...match.lightRgb, alpha] });
        darkStops.push({ offset, color: [...match.darkRgb, alpha] });
        logs.push(
          `Gradient stop ${i}: ${rgbToHex(r, g, b)} → "${match.tokenName}"`
        );
      } else {
        lightStops.push({ offset, color: [r, g, b, alpha] });
        darkStops.push({ offset, color: [r, g, b, alpha] });
      }
    }

    if (!hasMatch) return;

    gradientSlotCounter++;
    const slotId = `gradient-${gradientSlotCounter}`;
    colorData.sid = slotId;

    if (!registeredSlots.has(slotId)) {
      registeredSlots.add(slotId);

      slots[slotId] = {
        p: {
          k: { a: 0, k: [...k] },
          p: numStops,
        },
      };

      lightRules.push({
        id: slotId,
        type: "Gradient",
        value: lightStops,
      });

      darkRules.push({
        id: slotId,
        type: "Gradient",
        value: darkStops,
      });
    }

    logs.push(
      `Matched gradient → slot "${slotId}" (${numStops} stops)`
    );
  }

  function walkShapes(
    shapes: any[],
    layerName: string,
    markerTokenNames: string[]
  ) {
    for (const shape of shapes) {
      if (shape.ty === "gr" && shape.it) {
        walkShapes(shape.it, layerName, markerTokenNames);
      } else if (shape.ty === "fl" || shape.ty === "st") {
        if (shape.c) {
          processColor(shape.c, layerName, markerTokenNames);
        }
        if (shape.o) {
          processAlpha(shape.o, layerName, markerTokenNames);
        }
      } else if ((shape.ty === "gf" || shape.ty === "gs") && shape.g && shape.g.p && shape.g.k) {
        processGradient(shape, layerName, markerTokenNames);
      }
    }
  }

  // Collect all layers from top-level and assets
  const allLayers: any[] = [];
  if (data.layers) allLayers.push(...data.layers);
  if (data.assets) {
    for (const asset of data.assets) {
      if (asset.layers) allLayers.push(...asset.layers);
    }
  }

  // Process layers that have AEUX_TOKENS markers
  for (const layer of allLayers) {
    if (layer.ty !== 4) continue; // Only shape layers

    const markerTokenNames = parseLayerNameTokens(layer.nm);
    if (markerTokenNames.length === 0) continue;

    logs.push(
      `Matched layer: "${layer.nm}" (tokens: ${markerTokenNames.join(", ")})`
    );
    if (layer.shapes) {
      walkShapes(layer.shapes, layer.nm, markerTokenNames);
    }
  }

  data.slots = Object.keys(slots).length > 0 ? slots : null;

  logs.push(
    `Done: ${Object.keys(slots).length} slot(s), ${lightRules.length} light rule(s), ${darkRules.length} dark rule(s)`
  );

  return { data, slots, lightRules, darkRules, logs };
}
