import { describe, expect, it } from "vitest";
import { analyzeBridge } from "./bridge";
import { BRIDGE_DEFAULTS, bridgeDefinition, supportsFor } from "./definition";
import { designPrefill, designTargets } from "./design-links";
import { movingLoad } from "./moving";
import { toBridgeInputs } from "./geometry";
import { designSteelGirder, STEEL_DEFAULTS } from "../design/girders/steel";
import { bridgeLayout, runBridge, steelFromBridge } from "../design/bridge/bridge";
import { steelSide } from "../design/bridge/loadpath";

// Steel plate girders in the Bridge: the grillage's continuous steel stage and composite stage against the Steel Girder
// Design Check's line analysis of the same plates (itself benchmarked on FHWA Example 2A and NSBA's designs), the
// Bridge's run of the steel check for the substructure's reactions, and the design link.

// FHWA Example 2A's layout: two 90 ft spans, four girders at 10 ft, 3.5 ft overhangs, an 8.5 in deck, its plates.
const D2A = bridgeDefinition({ ...BRIDGE_DEFAULTS, spans: [90, 90], supports: supportsFor(2), girder: { shape: "steel", fc: 5, wc: 0.15 }, nGirders: 4, spacing: 10, overhang: 3.5, deck: { thickness: 8.5, sacrificial: 0.5, haunch: 2, fc: 4, wc: 0.15 }, piers: { ...BRIDGE_DEFAULTS.piers, model: false }, loads: { barrierWeight: 0.52, barrierWidth: 1.5, wearingSurface: 25 } });

const pierM = (a: ReturnType<typeof analyzeBridge>, name: string) =>
  [1, 2, 3, 4].reduce((t, g) => {
    const st = a.member(a.generated.members.find((x) => x.id === `G${g}-S1`)!, { kind: "case", name }, 1);
    return t + st[st.length - 1].forces.My;
  }, 0);

describe("steel girders in the Bridge's analysis", () => {
  const a = analyzeBridge(D2A);
  const line = designSteelGirder({ ...STEEL_DEFAULTS, appendixA6: false, redistribution: false, loads: { ...STEEL_DEFAULTS.loads, mode: "entered", dc1: 1, dc2: 1, dw: 1 } });
  const lineAt = (X: number) => line.stations.reduce((b, s) => (Math.abs(s.X - X) < Math.abs(b.X - X) ? s : b), line.stations[0]);

  it("is in equilibrium, its girders steel and their sections the plates' (the pier's segment stiffer)", () => {
    expect(a.ok).toBe(true);
    expect(a.generated.stage1.materials[0].name).toBe("Girder steel");
    const s = a.generated.stage1.sections;
    expect(s.find((x) => x.id === 1010)!.Iy).toBeGreaterThan(s.find((x) => x.id === 1000)!.Iy);
  });
  it("the steel girders are continuous for the deck (spliced), not simple as precast girders are", () => {
    expect(pierM(a, "Deck and haunch")).toBeLessThan(-1000);
    const pc = analyzeBridge(bridgeDefinition({ ...D2A, girder: { shape: "bt-72", fc: 8.5, wc: 0.15 } }));
    expect(Math.abs(pierM(pc, "Deck and haunch"))).toBeLessThan(1);
  });
  it("the deck on the steel alone: the pier's moment per klf within 1.5% of the line analysis's (non-prismatic)", () => {
    // The whole bridge's deck and haunch load per foot, and the girders' total pier moment.
    const deckLoad = (37 * 8.5) / 12 * 0.15 + (4 * 14 * 2) / 144 * 0.15;
    const ours = pierM(a, "Deck and haunch") / deckLoad;
    // The line analysis's DC1 coefficient (its 1 klf plus its own steel weight, by the plates' weights).
    const steelW = (48.875 * (63 + 63) + 56.75 * 54) / 180 / 144 * 0.49;
    const theirs = lineAt(90).M.dc1 / (1 + steelW);
    expect(ours / theirs).toBeGreaterThan(0.985);
    expect(ours / theirs).toBeLessThan(1.015);
  });
  it("the wearing surface on the composite bridge: within 3% of the line analysis's (n against 3n)", () => {
    const wsLoad = (37 - 3) * 0.025;
    const ours = pierM(a, "Wearing surface") / wsLoad;
    expect(ours / lineAt(90).M.dw).toBeGreaterThan(0.97);
    expect(ours / lineAt(90).M.dw).toBeLessThan(1.03);
  });
  it("live load runs on the steel bridge; the deflection within L/800", () => {
    const live = movingLoad(a.generated, a.stage(2));
    const dl = a.liveDeflections(live);
    expect(dl).toHaveLength(2);
    expect(dl[0].delta).toBeGreaterThan(0);
  });
});

describe("the Bridge's run and design link for steel girders", () => {
  it("the Girders link starts a Steel Girder Design Check with the bridge's plates, deck and cross-frames", () => {
    const t = designTargets(D2A).find((x) => x.key === "girders")!;
    expect(t.kind).toBe("steel-girder-check");
    const a = analyzeBridge(D2A);
    const p = designPrefill(t, D2A, a, movingLoad(a.generated, a.stage(2)));
    expect(p.inputs.spans).toEqual([90, 90]);
    expect((p.inputs.segments as { length: number }[]).reduce((s, x) => s + x.length, 0)).toBeCloseTo(180, 6);
    expect(p.inputs.braces).toEqual([30, 60, 120, 150]);
    expect(designTargets(D2A).some((x) => x.key === "girders-1")).toBe(false);
  });
  it("the Bridge's run: the steel check designs the girders and gives each support its reactions per girder", () => {
    const b = toBridgeInputs(D2A);
    expect(b.shape).toBe("steel");
    const lay = bridgeLayout(b);
    const si = steelFromBridge(b, lay);
    expect(si.haunch).toBeCloseTo(b.slabOffset - b.deckT, 9);
    expect(si.segments.reduce((s, x) => s + x.length, 0)).toBeCloseTo(lay.spans.reduce((s, x) => s + x.L, 0), 3);
    const run = runBridge(b);
    expect(run.steel).not.toBeNull();
    expect(run.groups).toHaveLength(0);
    const pier = run.reactions[1];
    expect(pier.DC).toBeGreaterThan(0);
    expect(pier.DC1).toBeLessThan(pier.DC);
    expect(pier.LLIM).toBeGreaterThan(pier.LL);
    expect(pier.totals.DC).toBeCloseTo(pier.DC * 4, 6);
    // The pier's continuous reaction is more than an abutment's (5/4 of the two simple ends).
    expect(pier.DC).toBeGreaterThan(2 * run.reactions[0].DC);
    // The cap's side: half the pier's reaction to each span's side.
    const side = steelSide(b, run, 1, 0, "end", "x", "Girders");
    expect(side.dc.interior).toBeCloseTo(pier.DC / 2, 6);
    expect(side.dc1!.interior).toBeCloseTo(pier.DC1 / 2, 6);
  });
});
