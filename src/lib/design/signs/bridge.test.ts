import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS, evaluateSheet, type SheetItem } from "@/lib/calcs/evaluate";
import { layout } from "@/lib/calcs/library/templates";
import { readingOrder } from "@/lib/calcs/types";
import { signBridgeInputs } from "../kinds";
import { designSignBridge, SIGN_BRIDGE_DEFAULTS } from "./bridge";
import { signBridgeCalcLines, signBridgeTakeoff } from "./bridge-detail";
import { Kz, roundCd } from "./cantilever";
import { signCd } from "./structure";

describe("sign bridge (LRFD-LTS-1, CDOT S-614-50 monotube)", () => {
  const r = designSignBridge(SIGN_BRIDGE_DEFAULTS);

  it("passes its checks with the defaults", () => {
    expect(r.checks.filter((c) => !c.ok && !c.advisory).map((c) => c.id)).toEqual([]);
  });

  it("holds statics in the portal: the span's midspan and knee moments add to wL²/8 under its own weight", () => {
    const bare = designSignBridge({ ...SIGN_BRIDGE_DEFAULTS, signs: [] });
    const w = bare.dead.wBeam;
    const L = SIGN_BRIDGE_DEFAULTS.span;
    expect(bare.frame.gravity.Mmid + bare.frame.knee).toBeCloseTo((w * L * L) / 8, 6);
    expect(bare.frame.gravity.Mmid).toBeGreaterThan(0); // sagging
  });

  it("takes the wind on each sign as 0.00256 Kz Kd G V² Cd A (Eq. 3.8.1-1), the span carrying it to the posts", () => {
    const i = SIGN_BRIDGE_DEFAULTS;
    const s = i.signs[0];
    const q = 0.00256 * Kz(i.height) * i.Kd * i.G * i.V ** 2 * signCd(Math.max(s.length, s.height) / Math.min(s.length, s.height));
    expect(r.wind.signs[0]).toBeCloseTo((q * s.length * s.height) / 1000, 9);
    // Two equal signs placed symmetrically and the span's own wind: half the total to each post.
    const CdB = roundCd(i.Cv * i.V * (i.beamD / 12));
    const wB = (0.00256 * Kz(i.height) * i.Kd * i.G * i.V ** 2 * CdB * (i.beamD / 12)) / 1000;
    expect(r.wind.Rw).toBeCloseTo((wB * i.span + r.wind.signs[0] + r.wind.signs[1]) / 2, 9);
  });

  it("checks the span's deflection against L/150 and each post's shaft", () => {
    const d = r.checks.find((c) => c.id === "beam-deflection")!;
    expect(d.capacity).toBeCloseTo((SIGN_BRIDGE_DEFAULTS.span * 12) / 150, 9);
    expect(r.checks.some((c) => c.name.startsWith("Shaft (each post)"))).toBe(true);
    // No galloping on a noncantilevered support (Table 11.6-1).
    expect(r.checks.some((c) => /galloping/i.test(c.name))).toBe(false);
  });

  it("takes off two shafts and parses saved inputs", () => {
    const t = signBridgeTakeoff(SIGN_BRIDGE_DEFAULTS);
    expect(t.quantities.shaft!.value).toBe(2 * SIGN_BRIDGE_DEFAULTS.shaftLength);
    expect(signBridgeInputs({ span: 90 }).signs).toHaveLength(2);
    expect(signBridgeInputs({ signs: [{ length: 10 }] }).signs[0].height).toBe(SIGN_BRIDGE_DEFAULTS.signs[0].height);
  });

  it("works out its calc package with no errors", () => {
    const regions = readingOrder(layout(signBridgeCalcLines(SIGN_BRIDGE_DEFAULTS, "Test sign bridge"), { x: 0, y: 0 }));
    const items = regions.flatMap((x): SheetItem[] => (x.kind === "text" || x.kind === "image" ? [] : [x as SheetItem]));
    const results = evaluateSheet(items, DEFAULT_SETTINGS, new Map());
    const errors = regions.flatMap((x) => (results.get(x.id)?.kind === "error" ? [`${x.kind === "math" ? x.latex : x.kind}: ${(results.get(x.id) as { message: string }).message}`] : []));
    expect(errors).toEqual([]);
  });
});
