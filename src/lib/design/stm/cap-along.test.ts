import { describe, expect, it } from "vitest";
import { BRIDGE_DEFAULTS, runBridge } from "../bridge/bridge";
import { capFromBridge } from "../bridge/loadpath";
import { nodeLpSolver } from "./lp-node";
import { designStm, stmInputs } from "./strut-tie";
import { buildTemplate, MULTICOLUMN_DEFAULTS } from "./templates";
import { sectionalDesign } from "./sectional";
import { stmPackageLines } from "./package";

// The pier cap's remaining checks (2026-11-20): the loads along the bridge on it, and crack control in its B-Regions.

const close = (a: number, b: number, tol = 1e-9) => expect(Math.abs(a - b)).toBeLessThanOrEqual(tol * Math.max(1, Math.abs(b)));
const run = runBridge(BRIDGE_DEFAULTS);
const base = capFromBridge(BRIDGE_DEFAULTS, run, 1, buildTemplate(MULTICOLUMN_DEFAULTS, stmInputs({})), ["g"], ["Girders"]);
const single = { ...base, stages: null };

describe("loads along the bridge on the cap", () => {
  it("none without the Bridge's force; with it, bending with the side face's bars, shear across and torsion", async () => {
    const r0 = await designStm(single, nodeLpSolver);
    expect(r0.checks.some((c) => c.id.startsWith("along-"))).toBe(false);
    const r = await designStm({ ...single, girders: { ...single.girders!, along: { F: 120 } } }, nodeLpSolver);
    const a = r.along!;
    close(a.Fb, 120 / r.capLoads!.bearingLoads.length);
    for (const id of ["along-flexure", "along-shear", "along-torsion"]) expect(r.checks.find((c) => c.id === id), id).toBeDefined();
    // The bent's overhangs: each bearing beyond the outer column's face, its force times its distance to the face.
    const t = single.template!;
    const face = t.columns[0] - t.columnWidth / 2;
    const over = t.bearings.filter((b) => b.x < face).reduce((s, b) => s + a.Fb * (face - b.x), 0);
    expect(a.M).toBeGreaterThanOrEqual(over - 1e-9);
    expect(a.e).toBe(t.depth / 2);
  });

  it("the two-stage cap: on the completed member only, tagged", async () => {
    const r = await designStm({ ...base, girders: { ...base.girders!, along: { F: 120 } } }, nodeLpSolver);
    expect(r.checks.some((c) => c.id === "completed-along-flexure")).toBe(true);
    expect(r.checks.some((c) => c.id.startsWith("construction-along"))).toBe(false);
  });

  it("the calc package works it out", async () => {
    const i = { ...single, girders: { ...single.girders!, along: { F: 120 } } };
    const r = await designStm(i, nodeLpSolver);
    const lines = stmPackageLines(i, r, "Cap");
    expect(lines.some((l) => "text" in l && l.text === "Loads along the bridge on the cap")).toBe(true);
  });
});

describe("crack control in the cap's B-Regions", () => {
  it("from the girder link's Service I sets, against the bars' spacing", async () => {
    const i = { ...single, sectional: true };
    const r = await designStm(i, nodeLpSolver);
    expect(r.capLoads!.serviceSets.length).toBeGreaterThan(0);
    const s = sectionalDesign(i, r);
    const regionsB = s.regions.filter((g) => g.kind === "B");
    expect(s.cracks.length).toBe(regionsB.filter((g) => s.sections.some((q) => q.region === g.label)).length);
    for (const c of s.cracks) {
      const ch = s.checks.find((x) => x.name.startsWith(`${c.region}: crack control`))!;
      close(ch.capacity, (700 * 1.0) / (c.betaS * c.fss) - 2 * c.dc);
      expect(c.fss).toBeLessThanOrEqual(0.6 * i.fy + 1e-9);
    }
  });
});
