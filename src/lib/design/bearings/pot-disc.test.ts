import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS, evaluateSheet, type SheetItem } from "@/lib/calcs/evaluate";
import { layout } from "@/lib/calcs/library/templates";
import { readingOrder } from "@/lib/calcs/types";
import { BRIDGE_DEFAULTS, runBridge, type BridgeInputs } from "../bridge/bridge";
import { bridgeIfc } from "../bridge/ifc";
import { linksFrom } from "@/lib/bridge/load-links";
import { designHlmr, designRotation, HLMR_DEFAULTS, sizeHlmr, type HlmrInputs } from "./pot-disc";
import { hlmrCalcLines } from "./pot-disc-calc";
import { bearingHeight, bearingParts, bearingViews, hlmrTakeoff } from "./pot-disc-detail";

const MM = 25.4;
const ok = (i: HlmrInputs) => designHlmr(i).checks.filter((c) => !c.ok && !c.advisory).map((c) => c.id);

describe("pot bearing (AASHTO 14.7.4)", () => {
  // The AISI/NSBA Steel Bridge Bearing Design Guide's worked pot bearing (Vol. II, Ch. 4): 850 kip service, θu 0.02 rad.
  // Its answer: Dp 450 mm, hr 30 mm, flat rings 9 × 2 mm, piston 27 mm, rim 5.3 mm. Sizing rounds up to ⅛ in (Dp ¼ in).
  const ex = sizeHlmr({ ...HLMR_DEFAULTS, kind: "pot", rotation: 0.015, construction: 0 });

  it("reproduces the guide's example", () => {
    expect(designRotation({ rotation: 0.015, construction: 0 })).toBeCloseTo(0.02, 9);
    expect(ex.pot.Dp * MM).toBeGreaterThanOrEqual(445);
    expect(ex.pot.Dp * MM).toBeLessThanOrEqual(460);
    expect(ex.pot.hr * MM).toBeGreaterThanOrEqual(30 - 0.5);
    expect(ex.pot.hr * MM).toBeLessThanOrEqual(30 + 3.2);
    expect(ex.pot.rings.width * MM).toBeGreaterThanOrEqual(9 - 0.1);
    expect(ex.pot.rings.width * MM).toBeLessThanOrEqual(9 + 1.6);
    expect(ex.pot.rings.thickness * MM).toBeGreaterThanOrEqual(1.8);
    expect(ex.pot.tPiston * MM).toBeGreaterThanOrEqual(27 - 0.1);
    expect(ex.pot.tPiston * MM).toBeLessThanOrEqual(27 + 3.2);
    expect(ex.pot.rim * MM).toBeGreaterThanOrEqual(5.3);
  });

  it("passes every check once sized, guided, free and fixed", () => {
    for (const fixity of ["fixed", "guided", "free"] as const) expect(ok(sizeHlmr({ ...HLMR_DEFAULTS, fixity }))).toEqual([]);
    expect(ok(HLMR_DEFAULTS)).toEqual([]);
  });

  it("fails the stress on a small pot and the pad on a thin one", () => {
    const bad = designHlmr({ ...HLMR_DEFAULTS, pot: { ...HLMR_DEFAULTS.pot, Dp: 12, hr: 0.25 } });
    const failed = bad.checks.filter((c) => !c.ok).map((c) => c.id);
    expect(failed).toContain("pot-stress");
    expect(failed).toContain("pot-hr");
  });

  it("checks the 20% least load", () => {
    const r = designHlmr({ ...HLMR_DEFAULTS, minLoad: 0.1 * (HLMR_DEFAULTS.DL + HLMR_DEFAULTS.LL) });
    expect(r.checks.find((c) => c.id === "pot-min-load")!.ok).toBe(false);
  });

  it("has no sliding or guide checks when fixed", () => {
    const ids = designHlmr({ ...HLMR_DEFAULTS, fixity: "fixed" }).checks.map((c) => c.id);
    expect(ids.some((x) => x.startsWith("ptfe") || x.startsWith("guide"))).toBe(false);
  });
});

describe("disc bearing (AASHTO 14.7.8)", () => {
  const disc = sizeHlmr({ ...HLMR_DEFAULTS, kind: "disc" });

  it("is sized to 5 ksi, no lift-off and 10% deflection", () => {
    expect(ok(disc)).toEqual([]);
    const r = designHlmr(disc);
    const s = r.checks.find((c) => c.id === "disc-stress")!;
    expect(s.demand).toBeLessThanOrEqual(5);
    expect(r.checks.map((c) => c.id)).toEqual(expect.arrayContaining(["disc-deflection", "disc-liftoff", "disc-pin", "disc-upper", "disc-lower"]));
  });

  it("designs the pin for at least 15% of the vertical load", () => {
    const r = designHlmr({ ...disc, Hu: 1 });
    expect(r.checks.find((c) => c.id === "disc-pin")!.demand).toBeGreaterThanOrEqual(0.15 * (disc.DL + disc.LL) - 1e-6);
  });
});

describe("the bearing's details", () => {
  for (const kind of ["pot", "disc"] as const)
    it(`draws a ${kind} bearing's parts, stacked, with a section and a plan`, () => {
      const i = sizeHlmr({ ...HLMR_DEFAULTS, kind });
      const parts = bearingParts(i);
      expect(parts.some((p) => p.name.startsWith("Masonry"))).toBe(true);
      expect(parts.some((p) => p.name.startsWith("Sole"))).toBe(true);
      expect(parts.some((p) => p.name.startsWith("Guide"))).toBe(true);
      expect(parts.filter((p) => p.name === "Anchor rod")).toHaveLength(i.anchors.n);
      for (const p of parts) expect(p.h).toBeGreaterThan(0);
      const h = bearingHeight(i);
      expect(h).toBeGreaterThan(i.masonry.t + i.sole.t);
      expect(h).toBeCloseTo(designHlmr(i).height, 1);
      expect(bearingViews(i)).toHaveLength(2);
      const t = hlmrTakeoff(i, 4);
      expect(t.quantities.bearing?.value).toBe(4);
      expect(t.views?.length ?? 0).toBeGreaterThan(0);
    });
});

describe("the calc package", () => {
  for (const kind of ["pot", "disc"] as const)
    it(`works out with no errors and every check OK (${kind})`, () => {
      const regions = readingOrder(layout(hlmrCalcLines(sizeHlmr({ ...HLMR_DEFAULTS, kind }), "Test bearing"), { x: 0, y: 0 }));
      const items = regions.flatMap((r): SheetItem[] => (r.kind === "text" || r.kind === "image" ? [] : [r as SheetItem]));
      const results = evaluateSheet(items, DEFAULT_SETTINGS, new Map());
      const errors = regions.flatMap((r) => (results.get(r.id)?.kind === "error" ? [`${r.kind === "math" ? r.latex : r.kind}: ${(results.get(r.id) as { message: string }).message}`] : []));
      expect(errors).toEqual([]);
      const checks = regions.filter((r) => r.kind === "math" && r.latex.startsWith("\\operatorname{if}")).map((r) => (results.get(r.id) as { result?: string }).result ?? "");
      expect(checks.length).toBeGreaterThan(5);
      expect(checks.filter((c) => /NG/.test(c))).toEqual([]);
    });
});

describe("pot bearings in the Bridge", () => {
  const b: BridgeInputs = { ...BRIDGE_DEFAULTS, supports: BRIDGE_DEFAULTS.supports.map((s, k) => (k === 1 ? { ...s, bearingKind: "pot" as const } : s)) };
  const hl = sizeHlmr(HLMR_DEFAULTS);

  it("draws the pier's bearings as their parts in the 3D model", () => {
    const plain = bridgeIfc(BRIDGE_DEFAULTS, runBridge(BRIDGE_DEFAULTS));
    const m = bridgeIfc(b, runBridge(b), { hlmr: { 1: hl } });
    const pots = m.elements.filter((e) => e.cls === "IfcBearing" && e.type === "POT");
    const lay = runBridge(b).layout;
    const atPier = lay.spans.reduce((n, s) => n + s.girders.length, 0); // each girder's one end on the pier
    expect(pots.length).toBe(atPier * bearingParts(hl).length);
    const elastomeric = (x: typeof m) => x.elements.filter((e) => e.cls === "IfcBearing" && e.type === "ELASTOMERIC").length;
    expect(elastomeric(plain) - elastomeric(m)).toBe(atPier);
    for (const e of pots) expect(e.depth).toBeGreaterThan(0);
  });

  it("links the pier's bearing design as a pot or disc bearing", () => {
    const withIds = { ...b, girderDesignIds: [], deckDesignId: null, slabDesignId: null, components: b.supports.map((_, k) => ({ support: k, bearingId: `b${k}` })) } as unknown as BridgeInputs;
    const links = linksFrom(withIds, [], { bearing: "elastomeric-bearing" });
    const kindOf = (k: number) => links.find((l) => l.target === `bearing-${k}`)?.kind;
    expect(kindOf(0)).toBe("elastomeric-bearing");
    expect(kindOf(1)).toBe(b.supports[1].type === "continuous-pier" ? "elastomeric-bearing" : "pot-disc-bearing");
  });
});
