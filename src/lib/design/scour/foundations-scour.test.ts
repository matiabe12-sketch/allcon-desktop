import { describe, expect, it } from "vitest";
import { designShaft, scouredShaft, SHAFT_DEFAULTS } from "../foundations/shaft";
import { designFooting, FOOTING_DEFAULTS } from "../foundations/footing";
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
