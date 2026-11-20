import { describe, expect, it } from "vitest";
import { nodeLpSolver } from "./lp-node";
import { capRegions } from "./sectional";
import { designStm, STM_DEFAULTS } from "./strut-tie";
import { buildTemplate, HAMMERHEAD_DEFAULTS, type StmTemplate } from "./templates";

// Benchmark: FHWA NHI-04-041, "LRFD Design Example for Steel Girder Superstructure Bridge" (Michael Baker, 2003),
// Design Step 8.8 (pp. 8-39 to 8-50): the hammerhead pier cap, 46'-6" long, 5 ft wide, 11 ft deep at the column
// tapering to 5 ft at the tips, on a 15'-6" column; girders 9'-9" apart, the outer two on each arm 2.0 ft and
// 11.75 ft from the column's face; 20 #11 top bars (de = 125.97 in), #5 hoops with 4 legs at 9 in.
//
// The example designs the cap by the sectional method at the column's face (Mu = 10,706 kip·ft, Vu = 1,509 kip),
// noting that the 2nd Edition recommends but does not mandate a strut-and-tie model for deep components. The tool
// has no sectional path for this cap: the 10th Edition says STM should be considered where a load is closer than
// 2 h to the support (5.8.2.1), and the nearer girder is 2 ft (0.18 h) from the face, so both arms are D-Regions.
// The two methods are not the same calculation, so the comparison is:
// - the region classification (D, as AASHTO and the example's own remark imply);
// - statics: the model's top tie carries the arm's moment about its bottom node, T z = Σ P a (the cap's weight
//   left out, the bearing loads the example's Strength I flexure loads);
// - the tie's resistance φ As fy = 0.9 × 31.2 × 60 = 1,685 kip (the example's T = As fy = 1,872 kip);
// - the STM's top-tie demand is higher than the sectional moment at the face would give (the model's column node
//   sits inside the column, at its stress resultant), 0.83 of the tie's resistance against the example's 0.63
//   φMn ratio.
// Finding (not a tool discrepancy): the model's outer bearing nodes (CCT, the long strut at 34°) exceed their
// strut-interface resistance, 1,346 against 972 kip. The example, designing sectionally, does not check nodes.
// 2nd versus 10th Edition: the example's crack control (Z) and minimum steel (1.2 Mcr) are not compared;
// the STM provisions (5.8.2) did not exist in this form in the 2nd Edition.

const near = (v: number, ref: number, tol: number) => expect(Math.abs(v - ref) / Math.abs(ref)).toBeLessThanOrEqual(tol);

// Strength I flexure loads at the outer bearings (p. 8-33): 1.25 DC + 1.50 DW + 1.75 m LL.
const F4 = 522.62;
const F5 = 745.52;
const t: StmTemplate = {
  ...HAMMERHEAD_DEFAULTS,
  length: 46.5,
  depth: 11,
  tipDepth: 5,
  capWidth: 60,
  columns: [23.25],
  columnWidth: 15.5,
  topCover: 132 - 125.97,
  bearings: [
    { x: 3.75, P: F5 },
    { x: 13.5, P: F4 },
    { x: 23.25, P: 400 },
    { x: 33, P: F4 },
    { x: 42.75, P: F5 },
  ],
  bearingLength: 14,
  bearingWidth: 15,
  topBars: { size: 11, count: 20 },
  bottomBars: { size: 8, count: 5 },
  stirrups: { size: 5, legs: 4, spacing: 9 },
  sideCover: 2.5,
};

describe("Hammerhead cap against FHWA NHI-04-041 Design Step 8.8", () => {
  it("both arms are D-Regions: the nearer girder 2.0 ft from the face, 0.18 h (5.8.2.1)", () => {
    const regions = capRegions(t);
    expect(regions.map((g) => g.kind)).toEqual(["D", "D"]);
    for (const g of regions) {
      expect(g.loads.map((l) => l.a).sort((a, b) => a - b)).toEqual([2, 11.75]); // the example's arms (p. 8-33)
      near(g.ratio!, 2 / 11, 1e-9);
    }
  });

  it("the top tie carries the arm's moment about the bottom node; its resistance is 0.9 As fy", async () => {
    const m = buildTemplate(t, { ...STM_DEFAULTS, fc: 4, fy: 60, girders: null });
    const r = await designStm(m, nodeLpSolver);
    const node = (label: string) => m.nodes.find((n) => n.label === label)!;
    // The right arm: top nodes T4 (33 ft) and T5 (42.75 ft), the bottom node C2 at the column's stress resultant.
    const C2 = node("C2");
    const z = node("T4").y - C2.y;
    const tie = (key: string) => r.members.find((x) => x.key === key)!.tension;
    near(tie("T3-T4"), (F4 * (33 - C2.x) + F5 * (42.75 - C2.x)) / z, 0.002);
    near(tie("T4-T5"), (F5 * (42.75 - C2.x)) / z, 0.002);
    // The ties' resistance: 20 #11, φ = 0.90 (5.5.4.2): the example's T = 1,872 kip × 0.9.
    const c = r.checks.find((x: { id: string }) => x.id === "tie-T3-T4")!;
    near(c.capacity, 0.9 * 31.2 * 60, 0.001);
    near(c.capacity / 0.9, 1872, 0.001);
    // The sectional moment at the face from the same loads, and the example's φMn (de − a/2 = 121.38 in).
    const Mface = F4 * 2 + F5 * 11.75;
    const phiMn = (0.9 * 1872 * (125.97 - 9.18 / 2)) / 12;
    near(10706 / phiMn, 0.628, 0.002); // the example's ratio, cap weight included
    expect(c.demand / c.capacity).toBeGreaterThan(Mface / phiMn);
    near(c.demand / c.capacity, 0.83, 0.01);
  });

  it("finding: the outer bearing nodes' strut interface is over its resistance", async () => {
    const m = buildTemplate(t, { ...STM_DEFAULTS, fc: 4, fy: 60, girders: null });
    const r = await designStm(m, nodeLpSolver);
    const iface = r.checks.find((x: { id: string }) => x.id === "node-T5-T5-C2-interface")!;
    expect(iface.demand).toBeGreaterThan(iface.capacity);
    near(iface.demand, 1346, 0.01);
  });
});
