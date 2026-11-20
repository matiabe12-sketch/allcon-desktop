import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS, evaluateSheet, type SheetItem } from "@/lib/calcs/evaluate";
import { layout, type Line } from "@/lib/calcs/library/templates";
import { readingOrder } from "@/lib/calcs/types";
import { withLinks, linksFrom } from "@/lib/bridge/load-links";
import { BRIDGE_DEFAULTS, runBridge, type BridgeInputs } from "../bridge/bridge";
import { bridgeIfc } from "../bridge/ifc";
import { recommendJoint } from "../bridge/loadpath";
import { fingerParts, fingerTakeoff, fingerViews, modularParts, modularTakeoff, modularViews } from "./detail";
import { designFinger, FINGER_DEFAULTS, sizeFinger } from "./finger";
import { fingerCalcLines } from "./finger-calc";
import { designModular, MODULAR_DEFAULTS, modularSize } from "./modular";
import { modularCalcLines } from "./modular-calc";

const failed = (checks: { id: string; ok: boolean; advisory?: boolean }[]) => checks.filter((c) => !c.ok && !c.advisory).map((c) => c.id);

function workOut(lines: Line[]) {
  const regions = readingOrder(layout(lines, { x: 0, y: 0 }));
  const items = regions.flatMap((r): SheetItem[] => (r.kind === "text" || r.kind === "image" ? [] : [r as SheetItem]));
  const results = evaluateSheet(items, DEFAULT_SETTINGS, new Map());
  const errors = regions.flatMap((r) => (results.get(r.id)?.kind === "error" ? [`${r.kind === "math" ? r.latex : r.kind}: ${(results.get(r.id) as { message: string }).message}`] : []));
  const checks = regions.filter((r) => r.kind === "math" && r.latex.startsWith("\\operatorname{if}")).map((r) => (results.get(r.id) as { result?: string }).result ?? "");
  return { errors, checks };
}

describe("modular joint (AASHTO 14.5.6.9.2, CDOT BDM 14.4.5)", () => {
  it("sizes in CDOT's 3 in steps, 6 in the least", () => {
    expect(modularSize(2)).toBe(6);
    expect(modularSize(6)).toBe(6);
    expect(modularSize(6.06)).toBe(9);
    expect(modularSize(12.1)).toBe(15);
  });

  it("adds the 1 in of Table 14.5.6.9.2-1 and keeps each gap to 3 in", () => {
    const r = designModular(MODULAR_DEFAULTS);
    // 400 ft × 12 × 1.2 × 140°F × 6.5e-6 × cos 15° = 5.063 in, + 1 in = 6.063 in → 0–9 in, 3 seals, 2 centerbeams.
    expect(r.total).toBeCloseTo(400 * 12 * 1.2 * 140 * 6.5e-6 * Math.cos((15 * Math.PI) / 180), 6);
    expect(r.range).toBeCloseTo(r.total + 1, 9);
    expect([r.size, r.seals, r.centerbeams]).toEqual([9, 3, 2]);
    expect(r.coldGap).toBeLessThanOrEqual(3);
    expect(failed(r.checks)).toEqual([]);
    // The setting keeps half the added range each way.
    expect(r.design.Amax).toBeCloseTo(9 - r.design.cold - 0.5, 9);
    expect(r.design.Amin).toBeCloseTo(r.design.hot + 0.5, 9);
  });

  it("says a strip seal will do for small movements, and never at an approach slab's end", () => {
    const small = designModular({ ...MODULAR_DEFAULTS, L: 200 });
    expect(small.checks.find((c) => c.id === "strip-seal")?.advisory).toBe(true);
    expect(failed(designModular({ ...MODULAR_DEFAULTS, atApproachSlab: true }).checks)).toContain("approach");
    expect(failed(designModular({ ...MODULAR_DEFAULTS, edgeT: 0.25 }).checks)).toContain("edge-t");
  });

  it("draws its parts and takes off the device by the foot", () => {
    const parts = modularParts(MODULAR_DEFAULTS, 120);
    expect(parts.filter((p) => p.name === "Centerbeam")).toHaveLength(2);
    expect(parts.filter((p) => p.name === "Edgebeam")).toHaveLength(2);
    expect(parts.filter((p) => p.name === "Strip seal")).toHaveLength(3);
    expect(parts.filter((p) => p.name === "Support bar").length).toBeGreaterThan(1);
    expect(modularViews(MODULAR_DEFAULTS)).toHaveLength(2);
    const t = modularTakeoff(MODULAR_DEFAULTS, 44);
    expect(t.quantities.joint!.value).toBeCloseTo(44 / Math.cos((15 * Math.PI) / 180), 6);
  });

  it("works out its calc package with no errors", () => {
    const { errors, checks } = workOut(modularCalcLines(MODULAR_DEFAULTS, "Test modular"));
    expect(errors).toEqual([]);
    expect(checks.length).toBeGreaterThan(3);
    expect(checks.filter((c) => /NG/.test(c))).toEqual([]);
  });
});

describe("finger joint (AASHTO 14.5.3)", () => {
  it("passes its checks with the defaults, and works out the wheel on a finger by hand", () => {
    const r = designFinger(FINGER_DEFAULTS);
    expect(failed(r.checks)).toEqual([]);
    // 16 kip × 1.75 (IM) × 1.75 × 1.2 = 58.8 kip; pitch 2 × (2.5 + 1.5) = 8 in: 58.8 × 8 / 20 = 23.52 kip, 0.9 of it on a 9 in finger.
    expect(r.Pu).toBeCloseTo(58.8, 9);
    expect(r.strength.load).toBeCloseTo(23.52 * 0.9, 9);
    expect(r.strength.Mroot).toBeCloseTo(23.52 * 0.9 * 4.5, 9);
    expect(r.MpFinger).toBeCloseTo((50 * 2.5 * 9) / 4, 9);
  });

  it("keeps 1.5 in of overlap cold and the finger gaps to 2 in past an 8 in opening", () => {
    expect(failed(designFinger({ ...FINGER_DEFAULTS, Lf: 6 }).checks)).toEqual(expect.arrayContaining(["range"]));
    const r = designFinger(FINGER_DEFAULTS);
    expect(r.D.cold).toBeGreaterThan(8);
    expect(r.gapLimit).toBe(2);
    expect(failed(designFinger({ ...FINGER_DEFAULTS, g: 2.25 }).checks)).toContain("finger-gap");
    expect(2 * FINGER_DEFAULTS.Lf - r.D.cold).toBeGreaterThanOrEqual(1.5 - 1e-9);
  });

  it("sizes the fingers to pass", () => {
    for (const L of [200, 400, 600]) {
      const z = sizeFinger({ ...FINGER_DEFAULTS, L });
      expect(failed(designFinger(z).checks).filter((id) => !id.startsWith("bolt"))).toEqual([]);
    }
  });

  it("asks for a trough and short sections, and flags new finger joints", () => {
    expect(failed(designFinger({ ...FINGER_DEFAULTS, trough: false }).checks)).toContain("trough");
    expect(failed(designFinger({ ...FINGER_DEFAULTS, sectionLength: 8 }).checks)).toContain("section");
    expect(designFinger({ ...FINGER_DEFAULTS, replacement: false }).checks.find((c) => c.id === "replacement")?.advisory).toBe(true);
  });

  it("draws the fingers meshing and takes off the device", () => {
    const parts = fingerParts(FINGER_DEFAULTS, 48);
    const back = parts.filter((p) => p.name === "Finger (back plate)");
    const ahead = parts.filter((p) => p.name === "Finger (ahead plate)");
    expect(back.length).toBeGreaterThan(4);
    expect(Math.abs(back.length - ahead.length)).toBeLessThanOrEqual(1);
    // The fingers overlap at the installation opening, and don't touch across the bridge.
    const D = designFinger(FINGER_DEFAULTS).design.D;
    expect(2 * FINGER_DEFAULTS.Lf - D).toBeGreaterThan(1.5);
    expect(ahead[0].s0! - back[0].s1!).toBeCloseTo(FINGER_DEFAULTS.g, 9);
    expect(fingerViews(FINGER_DEFAULTS)).toHaveLength(2);
    expect(fingerTakeoff(FINGER_DEFAULTS, 44).quantities.joint!.value).toBeCloseTo(44, 9);
  });

  it("works out its calc package with no errors", () => {
    const { errors, checks } = workOut(fingerCalcLines(FINGER_DEFAULTS, "Test finger"));
    expect(errors).toEqual([]);
    expect(checks.length).toBeGreaterThan(8);
    expect(checks.filter((c) => /NG/.test(c))).toEqual([]);
  });
});

describe("the joints in the Bridge", () => {
  it("recommends a strip seal to 4 in, a modular joint above (CDOT BDM 14.4.4–14.4.5), and keeps a choice", () => {
    expect(recommendJoint("auto", { total: 3, skew: 10 }).kind).toBe("strip-seal-joint");
    expect(recommendJoint(undefined, { total: 3, skew: 30 }).why).toMatch(/oversized gland/);
    expect(recommendJoint("auto", { total: 5, skew: 0 }).kind).toBe("modular-joint");
    expect(recommendJoint("finger", { total: 1, skew: 0 }).kind).toBe("finger-joint");
    expect(recommendJoint("strip-seal", { total: 9, skew: 0 }).kind).toBe("strip-seal-joint");
  });

  it("draws a modular joint's parts at the abutment, on the roadway", () => {
    const run = runBridge(BRIDGE_DEFAULTS);
    const m = bridgeIfc(BRIDGE_DEFAULTS, run, { joints: { 0: { kind: "modular-joint", inputs: MODULAR_DEFAULTS } } });
    const joint = m.elements.filter((e) => e.type === "EXPANSION_JOINT");
    expect(joint.length).toBeGreaterThan(10);
    expect(joint.every((e) => e.cls === "IfcPlate" && e.part === "support-0" && e.depth > 0)).toBe(true);
    expect(joint.some((e) => e.name.startsWith("Centerbeam"))).toBe(true);
    // Near the first support line, within the bridge's ends, its top on the deck.
    const bearing = m.elements.find((e) => e.name === "Bearing, girder 1, span 1 start")!;
    for (const e of joint) {
      expect(Math.hypot(e.origin[0] - bearing.origin[0], e.origin[1] - bearing.origin[1])).toBeLessThan(60);
      expect(e.origin[2]).toBeGreaterThan(bearing.origin[2]); // on the deck, over the bearings
    }
    expect(bridgeIfc(BRIDGE_DEFAULTS, run).elements.some((e) => e.type === "EXPANSION_JOINT")).toBe(false);
  });

  it("links the joint by the kind the load path chose", () => {
    const b = { ...BRIDGE_DEFAULTS, girderDesignIds: [], deckDesignId: null, slabDesignId: null, components: BRIDGE_DEFAULTS.supports.map((_, k) => ({ support: k, jointId: `j${k}`, jointKind: k === 0 ? ("modular-joint" as const) : ("strip-seal-joint" as const) })) } as unknown as BridgeInputs;
    const links = linksFrom(b, [], { joint: "strip-seal-joint" });
    expect(links.find((l) => l.target === "joint-0")?.kind).toBe("modular-joint");
    expect(links.find((l) => l.target === "joint-2")?.kind).toBe("strip-seal-joint");
    expect(withLinks(b, links).components[0].jointKind).toBe("modular-joint");
  });
});
