import { describe, it, expect } from "vitest";
import {
  convertWithMarkerTokens,
  parseLayerNameTokens,
  hexToRgb01,
  colorsMatch,
  ThemeTokens,
} from "../lib/marker-token-converter.js";

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

function makeShapeLayer(name: string, shapes: any[], tokens?: string[]): any {
  // If tokens provided, append them in brackets to the layer name
  const nm = tokens && tokens.length > 0
    ? `${name} [${tokens.join(", ")}]`
    : name;
  return {
    ty: 4,
    nm,
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

// --- parseLayerNameTokens ---

describe("parseLayerNameTokens", () => {
  it("parses comma-delimited tokens from brackets in layer name", () => {
    expect(parseLayerNameTokens("shape [token-a, token-b, token-c]"))
      .toEqual(["token-a", "token-b", "token-c"]);
  });

  it("returns empty array for name without brackets", () => {
    expect(parseLayerNameTokens("plain-layer")).toEqual([]);
    expect(parseLayerNameTokens("")).toEqual([]);
  });

  it("handles single token", () => {
    expect(parseLayerNameTokens("lit [mat-hard-lit-primary-side-face]"))
      .toEqual(["mat-hard-lit-primary-side-face"]);
  });

  it("trims whitespace around tokens", () => {
    expect(parseLayerNameTokens("shape [ token-a , token-b ]"))
      .toEqual(["token-a", "token-b"]);
  });
});

// --- convertWithMarkerTokens ---

describe("convertWithMarkerTokens", () => {
  // Test 1: Static fill with marker
  it("adds sid and slot for a static fill when marker lists a matching token", () => {
    const tokens: ThemeTokens = {
      "my-fill-token": { light: "#FF0000", dark: "#00FF00" },
    };

    const layer = makeShapeLayer(
      "Rectangle 1", // layer name doesn't need to match token
      [makeFillGroup(makeStaticColor("#FF0000"))],
      ["my-fill-token"]
    );

    const lottie = makeLottie([{ id: "comp_0", layers: [layer] }]);
    const result = convertWithMarkerTokens(lottie, tokens);

    const fill = result.data.assets[0].layers[0].shapes[0].it[0];
    expect(fill.c.sid).toBe("my-fill-token");

    const [lr, lg, lb] = hexToRgb01("#FF0000");
    expect(result.slots["my-fill-token"]).toEqual({
      p: { a: 0, k: [lr, lg, lb] },
    });

    const [dr, dg, db] = hexToRgb01("#00FF00");
    expect(result.darkRules).toHaveLength(1);
    expect(result.darkRules[0]).toEqual({
      id: "my-fill-token",
      type: "Color",
      value: [dr, dg, db],
    });

    expect(result.lightRules).toHaveLength(1);
    expect(result.lightRules[0].value).toEqual([lr, lg, lb]);
  });

  // Test 2: Static stroke with marker
  it("adds sid and slot for a static stroke when marker lists a matching token", () => {
    const tokens: ThemeTokens = {
      "my-stroke-token": { light: "#0000FF", dark: "#FF00FF" },
    };

    const layer = makeShapeLayer(
      "Circle 1",
      [makeStrokeGroup(makeStaticColor("#0000FF"))],
      ["my-stroke-token"]
    );

    const lottie = makeLottie([{ id: "comp_0", layers: [layer] }]);
    const result = convertWithMarkerTokens(lottie, tokens);

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

  // Test 3: Animated fill with marker
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

    const layer = makeShapeLayer(
      "Animated Shape",
      [makeFillGroup(animatedColor)],
      ["primary-face", "disabled-face"]
    );

    const lottie = makeLottie([{ id: "comp_0", layers: [layer] }]);
    const result = convertWithMarkerTokens(lottie, tokens);

    const fill = result.data.assets[0].layers[0].shapes[0].it[0];
    expect(fill.c.a).toBe(0);
    expect(fill.c.sid).toBe("Animated Shape [primary-face, disabled-face]_color_1");
    expect(colorsMatch(fill.c.k, "#E7D9FF")).toBe(true);

    expect(result.lightRules).toHaveLength(1);
    const lightRule = result.lightRules[0];
    expect(lightRule.keyframes).toHaveLength(5);
    expect(colorsMatch(lightRule.keyframes[0].value, "#E7D9FF")).toBe(true);
    expect(colorsMatch(lightRule.keyframes[2].value, "#7E7E7E")).toBe(true);

    expect(result.darkRules).toHaveLength(1);
    const darkRule = result.darkRules[0];
    expect(darkRule.keyframes).toHaveLength(5);
    expect(colorsMatch(darkRule.keyframes[0].value, "#F5EFFF")).toBe(true);
    expect(colorsMatch(darkRule.keyframes[2].value, "#A3A3A3")).toBe(true);
  });

  // Test 4: Layer with no marker — skipped
  it("does not modify layers without AEUX_TOKENS markers", () => {
    const tokens: ThemeTokens = {
      "known-token": { light: "#FF0000", dark: "#00FF00" },
    };

    const layer = makeShapeLayer(
      "known-token", // name matches, but no marker
      [makeFillGroup(makeStaticColor("#FF0000"))]
      // no marker tokens
    );

    const lottie = makeLottie([{ id: "comp_0", layers: [layer] }]);
    const result = convertWithMarkerTokens(lottie, tokens);

    const fill = result.data.assets[0].layers[0].shapes[0].it[0];
    expect(fill.c.sid).toBeUndefined();
    expect(Object.keys(result.slots)).toHaveLength(0);
    expect(result.darkRules).toHaveLength(0);
  });

  // Test 5: Marker token not in global tokens file — no match
  it("skips marker tokens that are not in the token map", () => {
    const tokens: ThemeTokens = {
      "real-token": { light: "#FF0000", dark: "#00FF00" },
    };

    const layer = makeShapeLayer(
      "Shape",
      [makeFillGroup(makeStaticColor("#FF0000"))],
      ["nonexistent-token"]
    );

    const lottie = makeLottie([{ id: "comp_0", layers: [layer] }]);
    const result = convertWithMarkerTokens(lottie, tokens);

    const fill = result.data.assets[0].layers[0].shapes[0].it[0];
    expect(fill.c.sid).toBeUndefined();
    expect(Object.keys(result.slots)).toHaveLength(0);
  });

  // Test 6: Multiple tokens in one marker — both matched
  it("handles multiple tokens in a single marker, matching each to its color", () => {
    const tokens: ThemeTokens = {
      "fill-token": { light: "#FF0000", dark: "#00FF00" },
      "stroke-token": { light: "#0000FF", dark: "#FFFF00" },
    };

    const layer = makeShapeLayer(
      "Multi-token Shape",
      [
        makeFillGroup(makeStaticColor("#FF0000")),
        makeStrokeGroup(makeStaticColor("#0000FF")),
      ],
      ["fill-token", "stroke-token"]
    );

    const lottie = makeLottie([], [layer]);
    const result = convertWithMarkerTokens(lottie, tokens);

    const fill = result.data.layers[0].shapes[0].it[0];
    const stroke = result.data.layers[0].shapes[1].it[0];
    expect(fill.c.sid).toBe("fill-token");
    expect(stroke.c.sid).toBe("stroke-token");

    expect(Object.keys(result.slots)).toHaveLength(2);
    expect(result.darkRules).toHaveLength(2);
  });

  // Test 7: Deduplication — same token on two layers
  it("registers slot only once when multiple layers share the same marker token", () => {
    const tokens: ThemeTokens = {
      "shared-token": { light: "#FF0000", dark: "#00FF00" },
    };

    const layer1 = makeShapeLayer(
      "Shape 1",
      [makeFillGroup(makeStaticColor("#FF0000"))],
      ["shared-token"]
    );
    const layer2 = makeShapeLayer(
      "Shape 2",
      [makeFillGroup(makeStaticColor("#FF0000"))],
      ["shared-token"]
    );

    const lottie = makeLottie([
      { id: "comp_0", layers: [layer1] },
      { id: "comp_1", layers: [layer2] },
    ]);

    const result = convertWithMarkerTokens(lottie, tokens);

    const fill1 = result.data.assets[0].layers[0].shapes[0].it[0];
    const fill2 = result.data.assets[1].layers[0].shapes[0].it[0];
    expect(fill1.c.sid).toBe("shared-token");
    expect(fill2.c.sid).toBe("shared-token");

    expect(Object.keys(result.slots)).toHaveLength(1);
    expect(result.darkRules).toHaveLength(1);
  });

  // Test 8: Color doesn't match any marker token hex — no slot
  it("does not assign slot when layer color doesn't match any marker token's light hex", () => {
    const tokens: ThemeTokens = {
      "red-token": { light: "#FF0000", dark: "#00FF00" },
    };

    const layer = makeShapeLayer(
      "Wrong color shape",
      [makeFillGroup(makeStaticColor("#0000FF"))], // blue, not red
      ["red-token"]
    );

    const lottie = makeLottie([], [layer]);
    const result = convertWithMarkerTokens(lottie, tokens);

    const fill = result.data.layers[0].shapes[0].it[0];
    expect(fill.c.sid).toBeUndefined();
    expect(Object.keys(result.slots)).toHaveLength(0);
  });

  // Test 9: Pre-comp assets are traversed
  it("finds and processes marker layers nested in assets", () => {
    const tokens: ThemeTokens = {
      "nested-token": { light: "#AABBCC", dark: "#112233" },
    };

    const layer = makeShapeLayer(
      "Nested Shape",
      [makeFillGroup(makeStaticColor("#AABBCC"))],
      ["nested-token"]
    );

    const lottie = makeLottie([{ id: "comp_0", layers: [layer] }], []);
    const result = convertWithMarkerTokens(lottie, tokens);

    const fill = result.data.assets[0].layers[0].shapes[0].it[0];
    expect(fill.c.sid).toBe("nested-token");
    expect(result.slots["nested-token"]).toBeDefined();
  });

  // Test 10: Animated stroke with marker
  it("handles animated stroke: flattens to static, produces light+dark keyframes", () => {
    const tokens: ThemeTokens = {
      "stroke-a": { light: "#FF0000", dark: "#00FF00" },
      "stroke-b": { light: "#0000FF", dark: "#FFFF00" },
    };

    const animatedColor = makeAnimatedColor([
      { t: 0, hex: "#FF0000" },
      { t: 75, hex: "#0000FF" },
      { t: 150, hex: "#FF0000" },
    ]);

    const layer = makeShapeLayer(
      "Animated Stroke",
      [makeStrokeGroup(animatedColor)],
      ["stroke-a", "stroke-b"]
    );

    const lottie = makeLottie([{ id: "comp_0", layers: [layer] }]);
    const result = convertWithMarkerTokens(lottie, tokens);

    const stroke = result.data.assets[0].layers[0].shapes[0].it[0];
    expect(stroke.c.a).toBe(0);
    expect(stroke.c.sid).toBe("Animated Stroke [stroke-a, stroke-b]_color_1");

    const darkKfs = result.darkRules[0].keyframes;
    expect(colorsMatch(darkKfs[0].value, "#00FF00")).toBe(true);
    expect(colorsMatch(darkKfs[1].value, "#FFFF00")).toBe(true);
  });
});
