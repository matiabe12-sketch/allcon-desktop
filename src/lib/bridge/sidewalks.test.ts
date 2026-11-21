import { describe, expect, it } from "vitest";
import { analyzeBridge, combinationsFor } from "./bridge";
import { BRIDGE_DEFAULTS, bridgeDefinition } from "./definition";
import { toBridgeInputs } from "./geometry";
import { designGirder, GIRDER_DEFAULTS } from "../design/girders/prestressed";
import { designSteelGirder, STEEL_DEFAULTS } from "../design/girders/steel";
import { sidewalkLoads } from "../design/bridge/bridge";
import { designLanes } from "../design/bridge/loadpath";

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
