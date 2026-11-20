import { describe, expect, it } from "vitest";
import { BEARING_DEFAULTS, designBearing, type BearingInputs } from "./elastomeric";

// Benchmark: FHWA NHI-04-041, LRFD Design Example for Steel Girder Superstructure Bridge (2003),
// Design Step 6, Bearing Design. The abutment's expansion bearing: a steel-reinforced pad designed by
// Method A, 14 in (longitudinal) × 15 in, 50 durometer (G 0.095 ksi, creep 0.25), eight 0.375 in
// interior layers, two 0.25 in covers, nine 0.1196 in shims of Fy 50 ksi; Service I dead load 78.4 kip,
// live load 110.4 kip (with dynamic load allowance, as the example used it); thermal contraction
// 6.5e-6 × 68°F × 120 ft = 0.636 in (Step 7.6) with γTU 1.20; two 5/8 in anchor bolts of Fu 60 ksi.
//
// The example follows the 2nd Edition (2002 interims). What changed in the 10th Edition (2024):
//   6.6  Compressive stress (14.7.6.3.2): 2nd σs ≤ 1.0 G S and 1.0 ksi; 10th σs ≤ 1.25 G Si and
//        1.25 ksi for steel-reinforced pads. The example's 1.0 G S = 0.917 ksi is compared through the
//        10th's 1.25 G S; the stress itself (0.899 ksi) and S (9.66) are unchanged and compared directly.
//   6.7  Deflection (14.7.6.3.3): 2nd 0.07 hri; 10th 0.09 hri (instantaneous live plus initial dead,
//        without impact). The example read the strain (0.04) off the design-aid graph; allcon uses
//        Eq. C14.7.5.3.6-1, σ/(4.8 G S²) = 0.021, which the 10th allows in lieu of the graph. Creep: the
//        example applies Cd to the total deflection; the 10th's long-term deflection (14.7.5.3.6) applies
//        acr to the dead load deflection. Not compared, apart from the limit's change.
//   6.8  Shear (14.7.6.3.4): hrt ≥ 2 Δs, unchanged. Compared: hrt 3.50 in, Δs 0.76 in, 2Δs 1.53 in.
//   6.9  Rotation (14.7.6.3.5): the 2nd's no-uplift check for Method A, σs ≥ 0.5 G S (L/hri)² θ/n
//        (0.859 ksi in the example), is gone; the 10th checks rotation only for cotton-duck pads, and
//        the S²/n < 22 limit of 14.7.6.1 (11.65 here) stands in for it. Not compared.
//   6.10 Stability (14.7.6.3.6): total thickness ≤ L/3, W/3 (D/4 added for round pads), unchanged.
//        Compared: 4.5764 in against 4.67 in.
//   6.11 Shims (14.7.5.3.5): hs ≥ 3 hmax σs / Fy and 2 hmax σL / ΔFTH, unchanged. Compared: 0.0202
//        and 0.0164 in. (The 10th also sets a 0.0747 in minimum, met by 0.1196 in; allcon doesn't check it.)
//   6.12 Anchorage (2nd 14.7.6.4): secure the pad if the factored shear exceeds Psd/5. The 10th dropped
//        that article; 14.8.3.1 and C14.8.3.1 (friction 0.20 on concrete) remain. allcon checks the
//        pad's service shear against 0.20 × DL (anchor-slip). The example's shears come from wind at
//        Strength III/V, which the tool doesn't take, so they aren't compared.
//   6.13 Anchor bolts: the connection force (3.10.9.2) was 0.1 × DL; the 10th sets 0.15 (As < 0.05)
//        or 0.25. Bolt shear was φ 0.65 × 0.48 Ab Fub (A 307, threads excluded, 6.13.2.7); the 10th
//        uses 6.13.2.12, φ 0.75 × 0.50 Ab Fub for F1554 anchor rods. Compared: the demand 7.84 kip
//        with the old factor; the resistance only as the 10th's 13.81 kip (the example's 11.49 kip
//        follows the old equation, reproduced below by hand). Embedment (7.03 in) isn't in the tool.
//
// No discrepancies found where the provisions are unchanged.

const near = (a: number, b: number, tol = 0.01) => expect(Math.abs(a - b)).toBeLessThanOrEqual(Math.max(0.0005, tol * Math.abs(b)));
const check = (r: ReturnType<typeof designBearing>, id: string) => {
  const c = r.checks.find((x) => x.id === id);
  if (!c) throw new Error(`no check ${id}`);
  return c;
};

const nhi: BearingInputs = {
  ...BEARING_DEFAULTS,
  pad: "steel",
  method: "A",
  byHardness: true,
  hardness: 50,
  L: 14,
  W: 15,
  hri: 0.375,
  n: 8,
  hre: 0.25,
  covers: 2,
  hs: 0.1196,
  Fy: 50,
  dFth: 24,
  DL: 78.4,
  LL: 110.4,
  jointed: false,
  alpha: 6.5e-6,
  expansionLength: 120,
  Tmax: 68,
  Tmin: 0,
  gammaTU: 1.2,
  thermalFactor: 1,
  otherStatic: 0,
  cyclic: 0,
  shearPrevented: false,
  thetaD: 0.0121,
  thetaU: 0,
  thetaL: 0,
  mu: 0.2,
  sliding: false,
  anchorRods: { n: 2, d: 0.625, Fu: 60 },
  connectionFactor: 0.1,
};

describe("elastomeric bearing: FHWA NHI-04-041 Design Step 6 (Method A, steel-reinforced)", () => {
  const r = designBearing(nhi);

  it("6.3: elastomer properties by hardness (Table 14.7.6.2-1)", () => {
    expect(r.method).toBe("A");
    near(r.pad.G.Gmin, 0.095);
    near(r.pad.acr, 0.25);
  });

  it("6.5: shape factor and layer proportions", () => {
    near(r.pad.S, 9.66);
    expect(check(r, "geo-cover").ok).toBe(true); // 0.25 in ≤ 0.70 × 0.375 = 0.26 in
    near(check(r, "geo-cover").capacity, 0.2625);
    near(check(r, "geo-S2n").demand, 9.6552 ** 2 / 8); // 10th Ed. 14.7.6.1, not in the 2nd
    expect(check(r, "geo-S2n").ok).toBe(true);
  });

  it("6.6: compressive stresses; the limit is the 10th's 1.25 G S (the example's 1.0 G S = 0.917 ksi)", () => {
    near(r.loads.sigmaS, 0.899);
    near(r.loads.sigmaL, 0.526);
    near(check(r, "comp-GS").capacity / 1.25, 0.917);
    near(check(r, "comp-max").capacity, 1.25);
    expect(check(r, "comp-GS").ok).toBe(true);
  });

  it("6.7: layer deflection by Eq. C14.7.5.3.6-1 against the 10th's 0.09 hri", () => {
    near(r.deflection.epsS, 0.899 / (4.8 * 0.095 * 9.6552 ** 2));
    near(check(r, "defl-layer").capacity, 0.09 * 0.375);
    expect(check(r, "defl-layer").ok).toBe(true);
    // The example's 0.015 in (graph strain 0.04) also passes the 10th's 0.034 in.
    expect(0.015).toBeLessThanOrEqual(check(r, "defl-layer").capacity);
  });

  it("6.8: shear deformation, hrt ≥ 2 Δs", () => {
    near(r.pad.hrt, 3.5);
    near(r.movement.thermal, 0.636);
    near(r.movement.ds, 0.76);
    near(check(r, "shear-hrt").demand, 1.53);
    expect(check(r, "shear-hrt").ok).toBe(true);
  });

  it("6.10: stability, total height ≤ L/3 and W/3", () => {
    near(r.pad.shims, 9, 0);
    near(r.pad.height, 4.5764, 0.0005);
    near(check(r, "stab-height").capacity, 4.67);
    expect(check(r, "stab-height").ok).toBe(true);
  });

  it("6.11: reinforcement at the service and fatigue limit states", () => {
    near(r.shims.service, 0.0202);
    near(r.shims.fatigue, 0.0164);
    expect(check(r, "shim-service").ok).toBe(true);
    expect(check(r, "shim-fatigue").ok).toBe(true);
  });

  it("6.12: the pad holds by friction (the tool's service check; the example's wind shears aren't modeled)", () => {
    expect(check(r, "anchor-slip").ok).toBe(true);
  });

  it("6.13: anchor bolts, demand with the example's 0.1 × DL; resistance per the 10th's 6.13.2.12", () => {
    const rods = check(r, "anchor-rods");
    near(rods.demand, 7.84);
    const Ab = (Math.PI / 4) * 0.625 ** 2;
    near(Ab, 0.31, 0.02);
    near(rods.capacity, 0.75 * 0.5 * Ab * 60 * 2); // 13.81 kip
    near(0.65 * 0.48 * Ab * 60 * 2, 11.49); // the example's, by the 2nd Edition's equation
    expect(rods.ok).toBe(true);
  });

  it("6.13 under the 10th: connection force 0.15 × DL (3.10.9.2, As < 0.05) still passes", () => {
    const r10 = designBearing({ ...nhi, connectionFactor: 0.15 });
    near(check(r10, "anchor-rods").demand, 11.76);
    expect(check(r10, "anchor-rods").ok).toBe(true);
  });

  it("the bearing passes as designed", () => {
    expect(r.ok).toBe(true);
  });
});
