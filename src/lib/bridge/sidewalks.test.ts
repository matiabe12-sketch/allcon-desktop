import { describe, expect, it } from "vitest";
import { analyzeBridge, combinationsFor } from "./bridge";
import { BRIDGE_DEFAULTS, bridgeDefinition } from "./definition";
import { toBridgeInputs } from "./geometry";
import { designGirder, GIRDER_DEFAULTS } from "../design/girders/prestressed";
import { designSteelGirder, STEEL_DEFAULTS } from "../design/girders/steel";
import { runBridge, sidewalkLoads } from "../design/bridge/bridge";
import { capLoadCases, girderSide, type GirderLink } from "../design/stm/cap-loads";
import { STM_DEFAULTS } from "../design/stm/strut-tie";
import { deckFromBridge, designLanes } from "../design/bridge/loadpath";
import { DECK_DEFAULTS, designDeck } from "../design/decks/deck";

// Sidewalks on the Bridge: inside the barriers, their concrete (DC) and pedestrians (AASHTO 3.6.1.6, 0.075 ksf on those
// wider than 2 ft) in the analysis, the lanes kept to the curbs; and the girder designs' share of them.

const L = 100;
const walks = bridgeDefinition({ ...BRIDGE_DEFAULTS, spans: [L], sidewalks: { left: 6, right: 6, depth: 8 } });

describe("sidewalks in the Bridge's analysis", () => {
  const a = analyzeBridge(walks);
  const total = (name: string) => a.checks.find((c) => c.name === name)!;
  it("their concrete and the pedestrians, all of it on the supports", () => {
    expect(a.ok).toBe(true);
    expect(total("Sidewalks").applied).toBeCloseTo(2 * 6 * (8 / 12) * 0.15 * L, 6);
    expect(total("Pedestrians").applied).toBeCloseTo(2 * 6 * 0.075 * L, 6);
    expect(a.cases.find((c) => c.name === "Pedestrians")!.type).toBe("PL");
  });
  it("no wearing surface on them; the lanes between the curbs", () => {
    const plain = analyzeBridge(bridgeDefinition({ ...BRIDGE_DEFAULTS, spans: [L] }));
    const ws = (x: typeof a) => x.checks.find((c) => c.name === "Wearing surface")!.applied;
    expect(ws(plain) - ws(a)).toBeCloseTo(2 * 6 * 0.025 * L, 6);
    const [l0, r0] = plain.generated.layout.roadway;
    const [l1, r1] = a.generated.layout.roadway;
    expect(l1 - l0).toBeCloseTo(6, 9);
    expect(r0 - r1).toBeCloseTo(6, 9);
  });
  it("a sidewalk 2 ft wide or less carries no pedestrians; none without sidewalks", () => {
    const narrow = analyzeBridge(bridgeDefinition({ ...BRIDGE_DEFAULTS, spans: [L], sidewalks: { left: 2, right: 0, depth: 8 } }));
    expect(narrow.cases.some((c) => c.name === "Sidewalks")).toBe(true);
    expect(narrow.cases.some((c) => c.name === "Pedestrians")).toBe(false);
    expect(analyzeBridge(bridgeDefinition({ ...BRIDGE_DEFAULTS, spans: [L] })).cases.some((c) => c.name === "Sidewalks")).toBe(false);
  });
  it("pedestrians take live load's factors, not fatigue's", () => {
    const c = combinationsFor();
    expect(c.find((x) => x.name === "Strength I")!.factors.PL).toBe(1.75);
    expect(c.find((x) => x.name === "Service I")!.factors.PL).toBe(1);
    expect(c.find((x) => x.name === "Fatigue I")!.factors.PL).toBe(0);
  });
});

describe("the girder designs' share", () => {
  const b = toBridgeInputs(walks);
  it("the narrower sidewalk to the curb, the concrete and pedestrians shared equally; the lanes", () => {
    const sw = sidewalkLoads(b)!;
    expect(sw.width).toBe(6);
    expect(sw.dc).toBeCloseTo((12 * (8 / 12) * 0.15) / b.nGirders, 4);
    expect(sw.pl).toBeCloseTo((12 * 0.075) / b.nGirders, 4);
    const plain = toBridgeInputs(bridgeDefinition({ ...BRIDGE_DEFAULTS, spans: [L] }));
    expect(designLanes(b)).toBe(Math.max(1, Math.floor((b.leftEdge + b.rightEdge - 2 * b.barrierWidth - 12) / 12)));
    expect(designLanes(b)).toBeLessThan(designLanes(plain));
  });
  it("a precast girder: DC2 gains the concrete; midspan's LL the pedestrians' wL²/8; the roadway narrower", () => {
    const sidewalk = { width: 6, dc: 0.2, pl: 0.18 };
    const base = { ...GIRDER_DEFAULTS, L: 100 };
    const r0 = designGirder(base).interior;
    const r1 = designGirder({ ...base, sidewalk }).interior;
    expect(r1.loads.wDC2 - r0.loads.wDC2).toBeCloseTo(0.2, 9);
    expect(r1.loads.roadway).toBeCloseTo(r0.loads.roadway - 12, 9);
    const mid = (r: typeof r0) => r.stations.reduce((p, s) => (Math.abs(s.x - 50) < Math.abs(p.x - 50) ? s : p));
    // the distribution factor changes with the curb (the exterior girder's lever rule), so compare per the factor
    const plOnly = designGirder({ ...base, sidewalk: { width: 0, dc: 0, pl: 0.18 } }).interior;
    expect(mid(plOnly).Mll - mid(r0).Mll).toBeCloseTo((0.18 * 100 * 100) / 8, 6);
  });
  it("a steel girder: DC2 and the live load's envelope gain them", () => {
    const r0 = designSteelGirder(STEEL_DEFAULTS);
    const r1 = designSteelGirder({ ...STEEL_DEFAULTS, loads: { ...STEEL_DEFAULTS.loads, sidewalk: { width: 0, dc: 0.2, pl: 0.18 } } });
    expect(r1.loads.dc2 - r0.loads.dc2).toBeCloseTo(0.2, 9);
    const at = (r: typeof r0) => r.stations.find((s) => s.X > 30)!;
    expect(at(r1).M.llPos).toBeGreaterThan(at(r0).M.llPos);
  });
});

describe("pedestrians on the substructure", () => {
  it("each support's live load reaction per girder gains the pedestrians' wL/2 (precast)", () => {
    const b = toBridgeInputs(walks);
    const run = runBridge(b);
    const e = run.reactions[0].sides[0].exterior as { LL: number; LLIM: number; PL: number };
    const pl = sidewalkLoads(b)!.pl;
    expect(e.PL).toBeCloseTo((pl * run.layout.spans[0].L) / 2, 6);
    expect(e.LL).toBeGreaterThan(e.PL);
    expect(e.LLIM - e.LL).toBeGreaterThan(0); // IM on the vehicles only
    expect(run.reactions[0].LL).toBeGreaterThanOrEqual(e.LL - 1e-9);
  });
  it("a pier cap places them on each girder with every lane arrangement", () => {
    const g = { ...GIRDER_DEFAULTS, L: 100, nGirders: 4, S: 6, overhang: 3, barrierWidth: 1.5 };
    const link = (sidewalk?: { width: number; dc: number; pl: number }): GirderLink => ({ enabled: true, back: girderSide({ ...g, ...(sidewalk ? { sidewalk } : {}) }, 0, "b", "Back"), ahead: null, x0: 14.21, reverse: false, loadNodes: ["B", "C"], selfWeight: false, soffit: 0, wc: 0.15 });
    const side = link({ width: 0, dc: 0, pl: 0.2 }).back!;
    expect(side.pl).toBeCloseTo(0.2 * 50, 9);
    const c0 = capLoadCases(link(), STM_DEFAULTS.nodes, STM_DEFAULTS.outline, STM_DEFAULTS.b, 8.6);
    const c1 = capLoadCases(link({ width: 0, dc: 0, pl: 0.2 }), STM_DEFAULTS.nodes, STM_DEFAULTS.outline, STM_DEFAULTS.b, 8.6);
    c1.bearingLoads.forEach((br, k) => expect(br.ll - c0.bearingLoads[k].ll).toBeCloseTo(10, 6));
  });
  it("a steel girder line's reactions gain them by the reaction's influence line", () => {
    const r0 = designSteelGirder(STEEL_DEFAULTS);
    const r1 = designSteelGirder({ ...STEEL_DEFAULTS, loads: { ...STEEL_DEFAULTS.loads, sidewalk: { width: 0, dc: 0, pl: 0.2 } } });
    expect(r0.reactions[1].pl).toBe(0);
    // the pier of two equal continuous spans: at least the 1.25 wL of both spans loaded
    expect(r1.reactions[1].pl).toBeGreaterThan(1.25 * 0.2 * 90 - 1e-6);
  });
});

describe("a sidewalk on the deck's overhang", () => {
  // DECK_DEFAULTS: 5 ft overhang, 18 in barrier; a 3 ft sidewalk 8 in deep inside it (to 4.5 ft from the edge).
  const base = { ...DECK_DEFAULTS, rail: { ...DECK_DEFAULTS.rail!, type: "custom" as const } };
  const d0 = designDeck(base);
  const d1 = designDeck({ ...base, sidewalk: { width: 3, depth: 8 } });
  const c0 = d0.overhang.case3;
  const c1 = d1.overhang.case3;
  const x3 = c1.x;
  it("Case 3: the sidewalk's concrete and pedestrians as cantilever loads; the wearing surface from the curb", () => {
    const cant = (q: number, a: number, b: number) => q * (Math.min(b, x3) - a) * (x3 - (a + Math.min(b, x3)) / 2);
    expect(c1.MDC - c0.MDC).toBeCloseTo(cant((base.gammaC * 8) / 12, 1.5, 4.5), 9);
    expect(c1.MPL).toBeCloseTo(cant(0.075, 1.5, 4.5), 9);
    expect(c1.MDW).toBeLessThan(c0.MDW);
    // the wheel 1 ft from the curb: nearer the girder, less moment
    expect(c1.MLL).toBeLessThan(c0.MLL);
    expect(c1.Mu).toBeCloseTo(1.25 * c1.MDC + 1.5 * c1.MDW + 1.75 * c1.m * 1.33 * c1.MLL + 1.75 * c1.MPL, 9);
  });
  it("the strip: the roadway between the curbs; the collision cases at the barrier unchanged", () => {
    expect(d1.geometry.curb).toBeCloseTo(4.5, 9);
    expect(d1.overhang.case1.MDC).toBeCloseTo(d0.overhang.case1.MDC, 9);
    expect(d0.overhang.case3.MPL).toBe(0);
  });
  it("the Bridge's deck link takes its sidewalk; unequal sides, the harder-working overhang", () => {
    const b = toBridgeInputs(walks);
    const run = runBridge(b);
    expect(deckFromBridge(b, run, DECK_DEFAULTS, null).sidewalk).toEqual({ width: 6, depth: 8 });
    const one = { ...b, sidewalks: { left: 6, right: 0, depth: 8 } };
    const pick = deckFromBridge(one, run, DECK_DEFAULTS, null);
    const other = { ...pick, sidewalk: pick.sidewalk ? null : { width: 6, depth: 8 } };
    const r = (d: typeof pick) => designDeck(d).overhang.case3.Mu / designDeck(d).overhang.case3.MR;
    expect(r(pick)).toBeGreaterThanOrEqual(r(other) - 1e-12);
    expect(deckFromBridge({ ...b, sidewalks: undefined }, run, DECK_DEFAULTS, null).sidewalk).toBeNull();
  });
});
