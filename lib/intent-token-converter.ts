// Core conversion logic for intent-token-based Lottie theming.
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

// --- Color utilities ---

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
    if (kf.i) entry.inTangent = {
      x: Array.isArray(kf.i.x) ? kf.i.x[0] : kf.i.x,
      y: Array.isArray(kf.i.y) ? kf.i.y[0] : kf.i.y,
    };
    if (kf.o) entry.outTangent = {
      x: Array.isArray(kf.o.x) ? kf.o.x[0] : kf.o.x,
      y: Array.isArray(kf.o.y) ? kf.o.y[0] : kf.o.y,
    };
    return entry;
  });
}

// --- Main conversion ---

export function convertWithIntentTokens(
  lottieData: any,
  tokens: ThemeTokens
): ConversionResult {
  const data = JSON.parse(JSON.stringify(lottieData));
  const logs: string[] = [];

  // Build lightHex → token lookup for keyframe color matching
  const lightHexToToken = new Map<string, TokenLookupEntry>();
  for (const [tokenName, { light, dark }] of Object.entries(tokens)) {
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

  function hexMatchColor(
    rgb: number[],
    lookup: Map<string, TokenLookupEntry>
  ): TokenLookupEntry | null {
    for (const [lightHex, entry] of lookup) {
      if (colorsMatch(rgb, lightHex)) {
        return entry;
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
    // Light rule needed so switching Dark → Light restores the light color
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
    darkKeyframes: any[],
    firstLightRgb: [number, number, number]
  ) {
    if (registeredSlots.has(slotId)) return;
    registeredSlots.add(slotId);

    // NO slot entry for animated colors — matches rect.lottie pattern.
    // The fill has a static k value + sid. Theme rules provide the
    // animated keyframes. Without a theme applied, it shows the static color.

    // Light theme rule: animated keyframes with light colors
    lightRules.push({
      id: slotId,
      type: "Color",
      keyframes: toThemeKeyframes(originalKeyframes),
    });

    // Dark theme rule: animated keyframes with dark colors
    darkRules.push({
      id: slotId,
      type: "Color",
      keyframes: toThemeKeyframes(darkKeyframes),
    });
  }

  function processColor(colorProp: any, layerName: string, token: ThemeToken) {
    if (colorProp.a === 0) {
      // Static color — simple slot + dark rule
      const match = hexMatchColor(colorProp.k, lightHexToToken);
      if (match) {
        colorProp.sid = match.tokenName;
        registerStaticSlot(match.tokenName, match.lightRgb, match.darkRgb);
        logs.push(
          `Static match: ${rgbToHex(colorProp.k[0], colorProp.k[1], colorProp.k[2])} → slot "${match.tokenName}"`
        );
      }
    } else if (colorProp.a === 1) {
      // Animated color — flatten to static, put keyframes in BOTH themes.
      // Follows the rect.lottie pattern: fill is static with sid,
      // theme rules provide the animated keyframes.

      const originalKeyframes = JSON.parse(JSON.stringify(colorProp.k));
      const darkKeyframes = JSON.parse(JSON.stringify(colorProp.k));
      let matchedAny = false;

      let firstLightRgb: [number, number, number] | null = null;
      if (originalKeyframes[0]?.s && originalKeyframes[0].s.length >= 3) {
        firstLightRgb = [originalKeyframes[0].s[0], originalKeyframes[0].s[1], originalKeyframes[0].s[2]];
      }

      for (const keyframe of darkKeyframes) {
        if (keyframe.s && Array.isArray(keyframe.s) && keyframe.s.length >= 3) {
          const match = hexMatchColor(keyframe.s, lightHexToToken);
          if (match) {
            const alpha = keyframe.s.length > 3 ? keyframe.s[3] : 1;
            keyframe.s = [...match.darkRgb, alpha];
            matchedAny = true;
          }
        }
      }

      if (matchedAny && firstLightRgb) {
        // Each animated fill gets a unique sid
        transitionCounter++;
        const sid = `${layerName}_color_${transitionCounter}`;

        // Flatten fill to static — theme rules provide the animation
        colorProp.a = 0;
        colorProp.k = [...firstLightRgb];
        colorProp.sid = sid;

        registerAnimatedSlot(sid, originalKeyframes, darkKeyframes, firstLightRgb);
        logs.push(`Animated match: layer "${layerName}" → sid "${sid}" + light/dark keyframes`);
      }
    }
  }

  function processAlpha(opacityProp: any, layerName: string, token: ThemeToken) {
    if (token.alpha === undefined) return;
    opacityProp.a = 0;
    opacityProp.k = token.alpha * 100;
    logs.push(`Alpha override: layer "${layerName}" opacity set to ${token.alpha * 100}%`);
  }

  function walkShapes(shapes: any[], layerName: string, token: ThemeToken) {
    for (const shape of shapes) {
      if (shape.ty === "gr" && shape.it) {
        walkShapes(shape.it, layerName, token);
      } else if (shape.ty === "fl" || shape.ty === "st") {
        if (shape.c) {
          processColor(shape.c, layerName, token);
        }
        if (shape.o) {
          processAlpha(shape.o, layerName, token);
        }
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

  // Process matched layers
  for (const layer of allLayers) {
    if (layer.ty !== 4) continue; // Only shape layers
    const token = tokens[layer.nm];
    if (!token) continue;

    logs.push(`Matched layer: "${layer.nm}"`);
    if (layer.shapes) {
      walkShapes(layer.shapes, layer.nm, token);
    }
  }

  // Set slots on the data. Static fills have slot entries; animated fills
  // don't (theme keyframes provide everything). But the player needs the
  // slots property to exist to enable theme support.
  data.slots = Object.keys(slots).length > 0 ? slots : null;

  logs.push(
    `Done: ${Object.keys(slots).length} slot(s), ${lightRules.length} light rule(s), ${darkRules.length} dark rule(s)`
  );

  return { data, slots, lightRules, darkRules, logs };
}
