import { describe, expect, it } from "vitest";
import { designShaft, scouredShaft, SHAFT_DEFAULTS } from "../foundations/shaft";
import { designFooting, FOOTING_DEFAULTS } from "../foundations/footing";
import { designPiles, PILE_DEFAULTS } from "../foundations/piles";
import { ABUTMENT_DEFAULTS, designAbutment } from "../foundations/abutment";
import { analyzeBridge } from "../../bridge/bridge";
import { BRIDGE_DEFAULTS, bridgeDefinition, supportsFor } from "../../bridge/definition";
import { designPrefill, designTargets } from "../../bridge/design-links";
import { movingLoad } from "../../bridge/moving";
import { withLinks } from "../../bridge/load-links";
import { toBridgeInputs } from "../../bridge/geometry";
import type { ScourInputs } from "./scour";

// Scour in the foundations (AASHTO 2.6.4.4.2): the soil above the scour design flood's scour is gone; and the
// Bridge's scour target, prefilled from its piers and abutments, linked to the load path.

describe("a drilled shaft with scour", () => {
  it("the layers start at the scour: side resistance and support lost above it", () => {
    const s = scouredShaft({ ...SHAFT_DEFAULTS, topDepth: 2, scour: 6 });
    expect(s.free).toBeCloseTo(4, 9);
    expect(s.inputs.topDepth).toBe(0);
    const total = (l: { thickness: number }[]) => l.reduce((t, x) => t + x.thickness, 0);
    expect(total(s.inputs.layers)).toBeCloseTo(total(SHAFT_DEFAULTS.layers) - 6, 9);
    const i0 = { ...SHAFT_DEFAULTS, scour: 0 };
    const none = scouredShaft(i0);
    expect(none.inputs).toBe(i0);
    expect(none.free).toBe(0);
  });
  it("less axial resistance and more moment in the shaft than without scour", () => {
    const r0 = designShaft(SHAFT_DEFAULTS);
    const r1 = designShaft({ ...SHAFT_DEFAULTS, scour: 8 });
    const ax = (r: typeof r0) => r.checks.find((c) => c.id === "axial")!.capacity;
    expect(ax(r1)).toBeLessThan(ax(r0));
    expect(r1.checks.some((c) => c.id === "scour")).toBe(true);
  });
});

describe("a spread footing with scour", () => {
  it("its base must be below the scour (AASHTO 10.6.1.2); bearing from the scoured ground", () => {
    const deep = designFooting({ ...FOOTING_DEFAULTS, Df: 8, scour: 5 });
    expect(deep.checks.find((c) => c.id === "scour")!.ok).toBe(true);
    const shallow = designFooting({ ...FOOTING_DEFAULTS, Df: 4, scour: 5 });
    expect(shallow.checks.find((c) => c.id === "scour")!.ok).toBe(false);
    expect(designFooting({ ...FOOTING_DEFAULTS, Df: 8 }).checks.some((c) => c.id === "scour")).toBe(false);
  });
});

describe("the check flood's scour at the Extreme Event (AASHTO 2.6.4.4.2, 10.5.5.3.2)", () => {
  it("a spread footing's top must be at or below the check flood's scour (AASHTO 10.6.1.2)", () => {
    const top = FOOTING_DEFAULTS.Df - FOOTING_DEFAULTS.t / 12;
    expect(designFooting({ ...FOOTING_DEFAULTS, scour: 1, scourCheck: top - 0.5 }).checks.find((c) => c.id === "scour")!.ok).toBe(true);
    const deep = designFooting({ ...FOOTING_DEFAULTS, scour: 1, scourCheck: top + 0.5 }).checks.find((c) => c.id === "scour")!;
    expect(deep.ok).toBe(false);
    expect(deep.demand).toBeCloseTo(top + 0.5, 9);
  });
  it("a drilled shaft's Extreme Event case is checked with the deeper scour; Strength keeps the design flood's", () => {
    const cases = [...SHAFT_DEFAULTS.cases, { name: "Extreme Event II", limit: "extreme" as const, P: 700, M: 300, H: 30, uplift: 0 }];
    const r = designShaft({ ...SHAFT_DEFAULTS, cases, scour: 3, scourCheck: 9 });
    const same = designShaft({ ...SHAFT_DEFAULTS, cases, scour: 3 });
    const check = r.checks.find((c) => c.id === "axial-check")!;
    expect(check).toBeDefined();
    expect(r.checks.some((c) => c.id === "scour-check")).toBe(true);
    expect(r.checks.find((c) => c.id === "axial")!.capacity).toBeCloseTo(same.checks.find((c) => c.id === "axial")!.capacity, 6);
    expect(check.capacity).toBeLessThan(designShaft({ ...SHAFT_DEFAULTS, cases, scour: 3, scourCheck: 4 }).checks.find((c) => c.id === "axial-check")!.capacity);
    expect(same.checks.some((c) => c.id === "axial-check" || c.id === "scour-check")).toBe(false);
  });
  it("piles: the Extreme Event cases take the check flood's unsupported length", () => {
    const cases = [...PILE_DEFAULTS.cases, { ...PILE_DEFAULTS.cases[0], name: "Extreme Event II", limit: "extreme" as const }];
    const run = (cs: typeof cases, chk: number) => JSON.stringify(designPiles({ ...PILE_DEFAULTS, cases: cs, unsupported: 0, unsupportedCheck: chk }).checks);
    expect(run(PILE_DEFAULTS.cases, 8)).toBe(run(PILE_DEFAULTS.cases, 0)); // no Extreme Event case: no effect
    expect(run(cases, 8)).not.toBe(run(cases, 0));
  });
});

describe("an abutment's foundation with the abutment's scour", () => {
  it("a footing abutment: its top at or below the check flood's scour", () => {
    const i = { ...ABUTMENT_DEFAULTS, type: "seat" as const, foundation: "footing" as const };
    const top = i.Df - i.footT;
    const ok = designAbutment({ ...i, scour: 0.5, scourCheck: Math.max(0.1, top - 0.5) });
    expect(ok.checks.find((c) => c.id === "scour-footing")!.ok).toBe(true);
    const bad = designAbutment({ ...i, scour: 0.5, scourCheck: top + 1 });
    expect(bad.checks.find((c) => c.id === "scour-footing")!.ok).toBe(false);
    expect(bad.checks.some((c) => c.id === "scour")).toBe(true);
  });
  it("piles under the abutment lose lateral support down to the scour", () => {
    const i = { ...ABUTMENT_DEFAULTS, type: "seat" as const, foundation: "piles" as const };
    const a = designAbutment(i);
    const b = designAbutment({ ...i, scour: i.Df + 6 });
    expect(JSON.stringify(b.checks)).not.toBe(JSON.stringify(a.checks));
    expect(b.checks.find((c) => c.id === "scour")!.name).toMatch(/no lateral support/);
  });
});

describe("the Bridge's scour design", () => {
  const d = bridgeDefinition({ ...BRIDGE_DEFAULTS, spans: [100, 100], supports: supportsFor(2) });
  it("a Scour target, prefilled with each pier's column bent and the abutments, by support", () => {
    const t = designTargets(d).find((x) => x.key === "scour")!;
    expect(t.kind).toBe("bridge-scour");
    const a = analyzeBridge(d);
    const p = designPrefill(t, d, a, movingLoad(a.generated, a.stage(2))).inputs as ScourInputs;
    expect(p.piers).toHaveLength(1);
    expect(p.piers[0].support).toBe(1);
    expect(p.piers[0].shape).toBe(d.piers.columns > 1 ? "columns" : "circular");
    expect(p.piers[0].a).toBeCloseTo(d.piers.columnDiameter, 6);
    expect(p.abutments.map((x) => x.support)).toEqual([0, 2]);
  });
  it("the link reaches the load path", () => {
    const b = withLinks(toBridgeInputs(d), [{ target: "scour", id: "00000000-0000-0000-0000-000000000001", kind: "bridge-scour" }]);
    expect(b.scourDesignId).toBe("00000000-0000-0000-0000-000000000001");
  });
});
