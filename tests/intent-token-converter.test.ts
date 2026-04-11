import { describe, it, expect } from "vitest";
import {
  convertWithIntentTokens,
  hexToRgb01,
  colorsMatch,
  ThemeTokens,
} from "../lib/intent-token-converter.js";

// --- Test helpers ---

function makeStaticColor(hex: string): any {
  const [r, g, b] = hexToRgb01(hex);
  return { a: 0, k: [r, g, b, 1] };
}

function makeAnimatedColor(hexTimeline: { t: number; hex: string }[]): any {
  return {
    a: 1,
    k: hexTimeline.map(({ t, hex }) => {
      const [r, g, b] = hexToRgb01(hex);
      return { t, s: [r, g, b, 1], i: { x: [0.833], y: [0.833] }, o: { x: [0.167], y: [0.167] } };
    }),
  };
}

function makeLottie(assets: any[], topLevelLayers: any[] = []): any {
  return {
    v: "5.9.0",
    fr: 30,
    ip: 0,
    op: 150,
    w: 100,
    h: 100,
    layers: topLevelLayers,
    assets,
  };
}

function makeShapeLayer(name: string, shapes: any[]): any {
  return {
    ty: 4,
    nm: name,
    ind: 1,
    shapes,
    ks: { o: { a: 0, k: 100 } },
    ip: 0,
    op: 150,
    st: 0,
  };
}

function makeFillGroup(colorProp: any): any {
  return {
    ty: "gr",
    it: [
      {
        ty: "fl",
        c: colorProp,
        o: { a: 0, k: 100 },
        r: 1,
        bm: 0,
        nm: "Fill 1",
      },
      { ty: "tr", p: { a: 0, k: [0, 0] } },
    ],
    nm: "Group 1",
  };
}

function makeStrokeGroup(colorProp: any): any {
  return {
    ty: "gr",
    it: [
      {
        ty: "st",
        c: colorProp,
        o: { a: 0, k: 100 },
        w: { a: 0, k: 2 },
        nm: "Stroke 1",
      },
      { ty: "tr", p: { a: 0, k: [0, 0] } },
    ],
    nm: "Group 1",
  };
}

// --- Tests ---

describe("convertWithIntentTokens", () => {
  // Test 1: Static fill
  it("adds sid and slot for a static fill when layer name matches token", () => {
    const tokens: ThemeTokens = {
      "my-fill-token": { light: "#FF0000", dark: "#00FF00" },
    };

    const layer = makeShapeLayer("my-fill-token", [
      makeFillGroup(makeStaticColor("#FF0000")),
    ]);

    const lottie = makeLottie([{ id: "comp_0", layers: [layer] }]);
    const result = convertWithIntentTokens(lottie, tokens);

    // Check sid was added
    const fill = result.data.assets[0].layers[0].shapes[0].it[0];
    expect(fill.c.sid).toBe("my-fill-token");

    // Check slot
    const [lr, lg, lb] = hexToRgb01("#FF0000");
    expect(result.slots["my-fill-token"]).toEqual({
      p: { a: 0, k: [lr, lg, lb] },
    });

    // Check dark rule (static value, no keyframes)
    const [dr, dg, db] = hexToRgb01("#00FF00");
    expect(result.darkRules).toHaveLength(1);
    expect(result.darkRules[0]).toEqual({
      id: "my-fill-token",
      type: "Color",
      value: [dr, dg, db],
    });

    // Light rule restores color when switching Dark → Light
    expect(result.lightRules).toHaveLength(1);
    expect(result.lightRules[0].value).toEqual([lr, lg, lb]);
  });

  // Test 2: Static stroke
  it("adds sid and slot for a static stroke when layer name matches token", () => {
    const tokens: ThemeTokens = {
      "my-stroke-token": { light: "#0000FF", dark: "#FF00FF" },
    };

    const layer = makeShapeLayer("my-stroke-token", [
      makeStrokeGroup(makeStaticColor("#0000FF")),
    ]);

    const lottie = makeLottie([{ id: "comp_0", layers: [layer] }]);
    const result = convertWithIntentTokens(lottie, tokens);

    const stroke = result.data.assets[0].layers[0].shapes[0].it[0];
    expect(stroke.c.sid).toBe("my-stroke-token");

    const [lr, lg, lb] = hexToRgb01("#0000FF");
    expect(result.slots["my-stroke-token"]).toEqual({
      p: { a: 0, k: [lr, lg, lb] },
    });

    const [dr, dg, db] = hexToRgb01("#FF00FF");
    expect(result.darkRules[0]).toEqual({
      id: "my-stroke-token",
      type: "Color",
      value: [dr, dg, db],
    });
  });

  // Test 3: Animated fill — flattened to static, keyframes in both themes
  it("flattens animated fill to static and puts keyframes in light+dark theme rules", () => {
    const tokens: ThemeTokens = {
      "primary-face": { light: "#E7D9FF", dark: "#F5EFFF" },
      "disabled-face": { light: "#7E7E7E", dark: "#A3A3A3" },
    };

    const animatedColor = makeAnimatedColor([
      { t: 0, hex: "#E7D9FF" },
      { t: 29.97, hex: "#E7D9FF" },
      { t: 74.925, hex: "#7E7E7E" },
      { t: 120.38, hex: "#E7D9FF" },
      { t: 149.35, hex: "#E7D9FF" },
    ]);

    const layer = makeShapeLayer("primary-face", [
      makeFillGroup(animatedColor),
    ]);

    const lottie = makeLottie([{ id: "comp_0", layers: [layer] }]);
    const result = convertWithIntentTokens(lottie, tokens);

    // Fill should be FLATTENED to static with unique sid
    const fill = result.data.assets[0].layers[0].shapes[0].it[0];
    expect(fill.c.a).toBe(0);
    expect(fill.c.sid).toBe("primary-face_color_1"); // unique per animated fill
    expect(colorsMatch(fill.c.k, "#E7D9FF")).toBe(true);

    // No slot for animated fills (matches rect.lottie pattern)
    expect(result.slots["primary-face_color_1"]).toBeUndefined();

    // Light theme rule has animated keyframes with LIGHT colors
    expect(result.lightRules).toHaveLength(1);
    const lightRule = result.lightRules[0];
    expect(lightRule.id).toBe("primary-face_color_1");
    expect(lightRule.keyframes).toHaveLength(5);
    expect(colorsMatch(lightRule.keyframes[0].value, "#E7D9FF")).toBe(true);
    expect(colorsMatch(lightRule.keyframes[2].value, "#7E7E7E")).toBe(true);

    // Dark theme rule has animated keyframes with DARK colors
    expect(result.darkRules).toHaveLength(1);
    const darkRule = result.darkRules[0];
    expect(darkRule.id).toBe("primary-face_color_1");
    expect(darkRule.keyframes).toHaveLength(5);
    expect(colorsMatch(darkRule.keyframes[0].value, "#F5EFFF")).toBe(true);
    expect(colorsMatch(darkRule.keyframes[2].value, "#A3A3A3")).toBe(true);

    // Timing preserved
    expect(lightRule.keyframes[0].frame).toBe(0);
    expect(lightRule.keyframes[2].frame).toBe(75);
    expect(darkRule.keyframes[0].frame).toBe(0);
    expect(darkRule.keyframes[2].frame).toBe(75);

    // Easing preserved (dotLottie format: plain numbers, not arrays)
    expect(darkRule.keyframes[0].inTangent).toEqual({ x: 0.833, y: 0.833 });
    expect(darkRule.keyframes[0].outTangent).toEqual({ x: 0.167, y: 0.167 });
  });

  // Test 4: Animated stroke — flattened to static, keyframes in both themes
  it("handles animated stroke: flattens to static, produces light+dark keyframes", () => {
    const tokens: ThemeTokens = {
      "stroke-token": { light: "#FF0000", dark: "#00FF00" },
      "stroke-alt": { light: "#0000FF", dark: "#FFFF00" },
    };

    const animatedColor = makeAnimatedColor([
      { t: 0, hex: "#FF0000" },
      { t: 75, hex: "#0000FF" },
      { t: 150, hex: "#FF0000" },
    ]);

    const layer = makeShapeLayer("stroke-token", [
      makeStrokeGroup(animatedColor),
    ]);

    const lottie = makeLottie([{ id: "comp_0", layers: [layer] }]);
    const result = convertWithIntentTokens(lottie, tokens);

    // Stroke flattened to static with unique sid
    const stroke = result.data.assets[0].layers[0].shapes[0].it[0];
    expect(stroke.c.a).toBe(0);
    expect(stroke.c.sid).toBe("stroke-token_color_1");
    expect(colorsMatch(stroke.c.k, "#FF0000")).toBe(true);

    // No slot for animated strokes
    expect(result.slots["stroke-token_color_1"]).toBeUndefined();

    // Light theme rule
    expect(result.lightRules).toHaveLength(1);
    expect(result.lightRules[0].id).toBe("stroke-token_color_1");
    const lightKfs = result.lightRules[0].keyframes;
    expect(colorsMatch(lightKfs[0].value, "#FF0000")).toBe(true);
    expect(colorsMatch(lightKfs[1].value, "#0000FF")).toBe(true);

    // Dark theme rule
    expect(result.darkRules).toHaveLength(1);
    expect(result.darkRules[0].id).toBe("stroke-token_color_1");
    const darkKfs = result.darkRules[0].keyframes;
    expect(colorsMatch(darkKfs[0].value, "#00FF00")).toBe(true);
    expect(colorsMatch(darkKfs[1].value, "#FFFF00")).toBe(true);
  });

  // Test 5: Unmatched layer
  it("does not modify layers whose names do not match any token", () => {
    const tokens: ThemeTokens = {
      "known-token": { light: "#FF0000", dark: "#00FF00" },
    };

    const layer = makeShapeLayer("some-random-layer", [
      makeFillGroup(makeStaticColor("#FF0000")),
    ]);

    const lottie = makeLottie([{ id: "comp_0", layers: [layer] }]);
    const result = convertWithIntentTokens(lottie, tokens);

    const fill = result.data.assets[0].layers[0].shapes[0].it[0];
    expect(fill.c.sid).toBeUndefined();
    expect(Object.keys(result.slots)).toHaveLength(0);
    expect(result.darkRules).toHaveLength(0);
  });

  // Test 6: Pre-comp assets are traversed
  it("finds and processes layers nested in assets", () => {
    const tokens: ThemeTokens = {
      "nested-token": { light: "#AABBCC", dark: "#112233" },
    };

    const layer = makeShapeLayer("nested-token", [
      makeFillGroup(makeStaticColor("#AABBCC")),
    ]);

    const lottie = makeLottie(
      [{ id: "comp_0", layers: [layer] }],
      []
    );

    const result = convertWithIntentTokens(lottie, tokens);

    const fill = result.data.assets[0].layers[0].shapes[0].it[0];
    expect(fill.c.sid).toBe("nested-token");
    expect(result.slots["nested-token"]).toBeDefined();
  });

  // Test 7: Multiple tokens — independent slots
  it("creates independent slots for layers matching different tokens", () => {
    const tokens: ThemeTokens = {
      "token-a": { light: "#FF0000", dark: "#00FF00" },
      "token-b": { light: "#0000FF", dark: "#FFFF00" },
    };

    const layerA = makeShapeLayer("token-a", [
      makeFillGroup(makeStaticColor("#FF0000")),
    ]);
    const layerB = makeShapeLayer("token-b", [
      makeFillGroup(makeStaticColor("#0000FF")),
    ]);

    const lottie = makeLottie([
      { id: "comp_0", layers: [layerA, layerB] },
    ]);

    const result = convertWithIntentTokens(lottie, tokens);

    expect(Object.keys(result.slots)).toHaveLength(2);
    expect(result.slots["token-a"]).toBeDefined();
    expect(result.slots["token-b"]).toBeDefined();
    expect(result.darkRules).toHaveLength(2);
  });

  // Test 8: Deduplication — same token on multiple layers
  it("registers slot only once when multiple layers share the same token name", () => {
    const tokens: ThemeTokens = {
      "my-token": { light: "#FF0000", dark: "#00FF00" },
    };

    const layer1 = makeShapeLayer("my-token", [
      makeFillGroup(makeStaticColor("#FF0000")),
    ]);
    const layer2 = makeShapeLayer("my-token", [
      makeFillGroup(makeStaticColor("#FF0000")),
    ]);

    const lottie = makeLottie([
      { id: "comp_0", layers: [layer1] },
      { id: "comp_1", layers: [layer2] },
    ]);

    const result = convertWithIntentTokens(lottie, tokens);

    const fill1 = result.data.assets[0].layers[0].shapes[0].it[0];
    const fill2 = result.data.assets[1].layers[0].shapes[0].it[0];
    expect(fill1.c.sid).toBe("my-token");
    expect(fill2.c.sid).toBe("my-token");

    expect(Object.keys(result.slots)).toHaveLength(1);
    expect(result.darkRules).toHaveLength(1);
  });

  // Test 9: Single static color — the most basic case (mirrors fanonecolortest.json)
  it("handles the simplest case: one layer, one static color, no animation", () => {
    const tokens: ThemeTokens = {
      "mat-hard-lit-primary-side-soft-shadow": { light: "#A678F5", dark: "#D1B6FF" },
    };

    const layer = makeShapeLayer("mat-hard-lit-primary-side-soft-shadow", [
      makeFillGroup(makeStaticColor("#A678F5")),
      makeFillGroup(makeStaticColor("#A678F5")),
      makeFillGroup(makeStaticColor("#A678F5")),
      makeFillGroup(makeStaticColor("#A678F5")),
    ]);

    const lottie = makeLottie([], [layer]);

    const result = convertWithIntentTokens(lottie, tokens);

    for (let i = 0; i < 4; i++) {
      const fill = result.data.layers[0].shapes[i].it[0];
      expect(fill.c.sid).toBe("mat-hard-lit-primary-side-soft-shadow");
    }

    expect(Object.keys(result.slots)).toHaveLength(1);
    const slot = result.slots["mat-hard-lit-primary-side-soft-shadow"];
    expect(slot.p.a).toBe(0);
    expect(colorsMatch(slot.p.k, "#A678F5")).toBe(true);

    expect(result.darkRules).toHaveLength(1);
    expect(result.darkRules[0].value).toBeDefined();
    expect(result.darkRules[0].keyframes).toBeUndefined();
    expect(colorsMatch(result.darkRules[0].value, "#D1B6FF")).toBe(true);

    // Light rule restores color when switching Dark → Light
    expect(result.lightRules).toHaveLength(1);
    expect(colorsMatch(result.lightRules[0].value, "#A678F5")).toBe(true);
  });

  // Test 10: Unmatched keyframe color preserved as-is
  it("preserves unmatched keyframe colors in dark rules", () => {
    const tokens: ThemeTokens = {
      "partial-token": { light: "#FF0000", dark: "#00FF00" },
    };

    const animatedColor = makeAnimatedColor([
      { t: 0, hex: "#FF0000" },
      { t: 75, hex: "#999999" }, // unmatched
      { t: 150, hex: "#FF0000" },
    ]);

    const layer = makeShapeLayer("partial-token", [
      makeFillGroup(animatedColor),
    ]);

    const lottie = makeLottie([{ id: "comp_0", layers: [layer] }]);
    const result = convertWithIntentTokens(lottie, tokens);

    expect(result.darkRules[0].id).toBe("partial-token_color_1");
    const darkKfs = result.darkRules[0].keyframes;

    // frame 0: matched → dark green
    expect(colorsMatch(darkKfs[0].value, "#00FF00")).toBe(true);
    // frame 75: unmatched → preserved as #999999
    expect(colorsMatch(darkKfs[1].value, "#999999")).toBe(true);
    // frame 150: matched → dark green
    expect(colorsMatch(darkKfs[2].value, "#00FF00")).toBe(true);
  });

  // Test 11: Mixed static + animated fills with animated opacity (fan-mixed-test)
  it("handles mixed static and animated fills, preserves animated opacity", () => {
    const tokens: ThemeTokens = {
      "mat-hard-lit-primary-side-soft-shadow": { light: "#A678F5", dark: "#D1B6FF" },
      "side-face-disabled-strong": { light: "#7E7E7E", dark: "#A3A3A3" },
    };

    // Group 3 has animated fill (#7E7E7E → #A678F5) AND animated opacity (0 → 100)
    const animatedFill = makeAnimatedColor([
      { t: 0, hex: "#7E7E7E" },
      { t: 27, hex: "#7E7E7E" },
      { t: 60, hex: "#A678F5" },
    ]);
    const animatedOpacity = {
      a: 1,
      k: [
        { t: 0, s: [0], i: { x: [0.833], y: [0.833] }, o: { x: [0.167], y: [0.167] } },
        { t: 27, s: [100], i: { x: [0.833], y: [0.833] }, o: { x: [0.167], y: [0.167] } },
        { s: [100], t: 60 },
      ],
    };

    const layer = makeShapeLayer("mat-hard-lit-primary-side-soft-shadow", [
      makeFillGroup(makeStaticColor("#A678F5")),   // Group 1: static
      makeFillGroup(makeStaticColor("#A678F5")),   // Group 2: static
      {                                             // Group 3: animated fill + animated opacity
        ty: "gr",
        it: [
          { ty: "fl", c: animatedFill, o: animatedOpacity, r: 1, bm: 0, nm: "Fill" },
          { ty: "tr", p: { a: 0, k: [0, 0] } },
        ],
        nm: "Group 3",
      },
      makeFillGroup(makeStaticColor("#A678F5")),   // Group 4: static
    ]);

    const lottie = makeLottie([], [layer]);
    const result = convertWithIntentTokens(lottie, tokens);

    // 3 static fills get the same sid (slot token name)
    const fill1 = result.data.layers[0].shapes[0].it[0];
    const fill2 = result.data.layers[0].shapes[1].it[0];
    const fill4 = result.data.layers[0].shapes[3].it[0];
    expect(fill1.c.sid).toBe("mat-hard-lit-primary-side-soft-shadow");
    expect(fill2.c.sid).toBe("mat-hard-lit-primary-side-soft-shadow");
    expect(fill4.c.sid).toBe("mat-hard-lit-primary-side-soft-shadow");

    // Group 3 animated fill: flattened to static with unique sid
    const fill3 = result.data.layers[0].shapes[2].it[0];
    expect(fill3.c.a).toBe(0); // flattened
    expect(fill3.c.sid).toMatch(/^mat-hard-lit-primary-side-soft-shadow_color_/);
    expect(colorsMatch(fill3.c.k, "#7E7E7E")).toBe(true); // first keyframe

    // Group 3 animated opacity: PRESERVED (not touched by converter)
    expect(fill3.o.a).toBe(1); // still animated
    expect(fill3.o.k).toHaveLength(3);
    expect(fill3.o.k[0].s[0]).toBe(0);   // starts at 0%
    expect(fill3.o.k[1].s[0]).toBe(100);  // goes to 100%

    // 1 static slot
    expect(result.slots["mat-hard-lit-primary-side-soft-shadow"]).toBeDefined();
    expect(colorsMatch(result.slots["mat-hard-lit-primary-side-soft-shadow"].p.k, "#A678F5")).toBe(true);

    // 2 light rules: 1 static (for groups 1,2,4) + 1 animated (for group 3)
    expect(result.lightRules).toHaveLength(2);
    const animLight = result.lightRules.find((r: any) => r.keyframes);
    const lightKfs = animLight.keyframes;
    expect(colorsMatch(lightKfs[0].value, "#7E7E7E")).toBe(true);
    expect(colorsMatch(lightKfs[2].value, "#A678F5")).toBe(true);

    // 2 dark rules: 1 static (for groups 1,2,4) + 1 animated (for group 3)
    expect(result.darkRules).toHaveLength(2);
    const staticDark = result.darkRules.find((r: any) => r.value);
    const animDark = result.darkRules.find((r: any) => r.keyframes);
    expect(staticDark).toBeDefined();
    expect(colorsMatch(staticDark.value, "#D1B6FF")).toBe(true);
    expect(animDark).toBeDefined();
    expect(colorsMatch(animDark.keyframes[0].value, "#A3A3A3")).toBe(true); // dark of #7E7E7E
    expect(colorsMatch(animDark.keyframes[2].value, "#D1B6FF")).toBe(true); // dark of #A678F5
  });
});
