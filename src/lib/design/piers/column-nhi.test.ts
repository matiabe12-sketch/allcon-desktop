import { describe, expect, it } from "vitest";
import { COLUMN_DEFAULTS, designColumn, type ColumnInputs } from "./column";
import { columnSection, concreteE } from "./column-section";

// Benchmark: FHWA NHI-04-041, "LRFD Design Example for Steel Girder Superstructure Bridge" (Michael Baker, 2003),
// Design Step 8.9 (pp. 8-51 to 8-60): the hammerhead pier's 15'-6" × 4'-6" column, 76 #10 bars, #4 hoops at 12 in,
// 15 ft from the footing to the cap's soffit, the cap 11 ft deep above it.
//
// 2nd Edition (the example) versus 10th Edition (the tool) differences:
// - Ec: 3,640 ksi (33,000 wc^1.5 √f'c) then; 120,000 K1 wc² f'c^0.33 = 3,987 ksi now (wc 0.145 kcf, 5.4.2.4), so Pe
//   is 9.5% higher for the same EI expression (Ec Ig / 2.5, βd = 0; 5.6.4.3).
// - The example's biaxial check is the linear Eq. 5.7.4.5-3 with uniaxial resistances at zero axial load
//   (0.44); the tool checks biaxial flexure by strain compatibility at the factored axial load (5.6.4.5), a
//   different (less conservative) measure, so the ratios are not compared.
// - Shear: the example takes dv = 0.72 h and Vc alone (914 kip across). The tool takes dv = max(0.9 de, 0.72 h)
//   with de to the outermost bars, and adds the hoops' Vs.
// Compared: the section's gross properties and steel, the uniaxial φMn at zero axial load (the example's values
// come from commercial software), the slenderness ratios and the moment magnifier δs, the reinforcement ratios.
// Discrepancies found, all resolved 2026-11-20:
// 1. ℓu: a single column (a cantilever) now runs to its bearings on the cap's top, as the example's 26 ft (an input,
//    ℓu, overrides it); a bent's columns keep their clear height.
// 2. Minimum transverse reinforcement (5.7.2.5) is required only where Vu > 0.5 φ Vc (5.7.2.3).
// 3. de is to the centroid of the bars in the tension half (5.7.2.8), not the outermost row: dv = 0.72 h here, as
//    the example's 134 in.
// 4. Shear friction at the base (5.7.4) is checked.
// Also: the tool flags the example's hoops for laterally restraining only the corner bars (5.10.4.3, at most 24 in
// clear from a restrained bar); the example does not check this, and AASHTO requires it.

const near = (v: number, ref: number, tol: number) => expect(Math.abs(v - ref) / Math.abs(ref)).toBeLessThanOrEqual(tol);

const NHI: ColumnInputs = {
  ...COLUMN_DEFAULTS,
  shape: "rectangular",
  T: 186,
  W: 54,
  cover: 2.5,
  bar: 10,
  bars: 76,
  barsT: 31, // 31 along each 15'-6" face and 9 along each 4'-6" face, corners shared: 76 bars about 5.9 in apart
  barsL: 9,
  transverse: "ties",
  tieBar: 4,
  tieSpacing: 12,
  legsT: 2,
  legsL: 2,
  fc: 4,
  fy: 60,
  height: 15,
  ground: 2,
  base: "footing",
  K: { T: 2.1, L: 2.1 },
  wc: 0.15,
  loads: "entered",
  link: null,
  cases: [],
};

/** The example's Strength I at the column's base (p. 8-51): the entered axial load less the weight the tool adds at 1.25. */
const run = (height: number) => {
  const w = 1.25 * 0.15 * (10044 / 144) * height;
  return designColumn({
    ...NHI,
    height,
    cases: [
      { name: "Strength I", P: 2435 - w, MT: 9061, ML: 1928, HT: 0, HL: 0 },
      { name: "Strength III", P: 2435 - w, MT: 0, ML: 0, HT: 92.28, HL: 0 },
      { name: "Strength V", P: 2435 - w, MT: 0, ML: 0, HT: 0, HL: 109.09 },
    ],
  });
};

describe("Pier column against FHWA NHI-04-041 Design Step 8.9", () => {
  const sec = columnSection({ shape: "rectangular", T: 186, W: 54, cover: 2.5, bar: 10, bars: 76, barsT: 31, barsL: 9, barsEnd: 0, tieBar: 4, transverse: "ties", fc: 4, fy: 60 });

  it("section: Ag, As, Ig each way (p. 8-52, 8-53)", () => {
    expect(sec.bars.length).toBe(76);
    near(sec.Ag, 10044, 1e-9);
    near(sec.Ast, 96.52, 1e-9);
    near(sec.IgL, 2440692, 1e-6); // Ixx, bending along the bridge
    near(sec.IgT, 28956852, 1e-6); // Iyy
    near(sec.IsL, 44997, 0.01); // the bars about X-X
    near(sec.Ast / sec.Ag, 0.0096, 0.01);
  });

  it("uniaxial φMn at zero axial load: 10,440 along and 36,113 kip·ft across (p. 8-56)", () => {
    const L = sec.resistance(0, 0, 1)!;
    const T = sec.resistance(0, 1, 0)!;
    expect(L.phi).toBe(0.9);
    expect(T.phi).toBe(0.9);
    near(L.phiMn / 12, 10440, 0.005);
    near(T.phiMn / 12, 36113, 0.025); // 35,274: 2.3% under the example's software
  });

  it("slenderness: Kℓu/r and δs with the example's 26 ft (p. 8-53 to 8-55)", () => {
    const r = run(26);
    const [t, l] = r.slender;
    // r = 0.30 × the dimension (5.6.4.3) against the example's √(I/A) = 0.289 ×: 40.4 against 42.03, 11.7 against 12.20.
    near(l.ratio, 42.03 * (0.2887 / 0.3), 0.002);
    near(t.ratio, 12.2 * (0.2887 / 0.3), 0.002);
    expect(t.neglect).toBe(true); // below 22: no magnification across the bridge, as in the example
    expect(l.neglect).toBe(false);
    // EI = Ec Ig / 2.5 (it controls), Pe = π² EI / (K ℓu)²: the example's 81,701 kip × the Ec ratio.
    near(l.EI0, (concreteE(4) * 2440692) / 2.5, 1e-9);
    const Pe = (Math.PI ** 2 * l.EI0) / (2.1 * 312) ** 2;
    near(Pe, 81701 * (concreteE(4) / 3640), 0.001);
    const d = r.delta.find((x) => x.name === "Strength I")!;
    near(d.L, 1 / (1 - 2435 / (0.75 * Pe)), 1e-9);
    near(d.L, 1.04, 0.003); // 1.038
    expect(d.T).toBe(1);
  });

  it("ℓu: the column's 15 ft with ℓu = 26 ft gives the example's δs; a 15 ft clear height alone 1.012", () => {
    const at15 = (lu?: number) => designColumn({ ...NHI, height: 15, lu, cases: [{ name: "Strength I", P: 2435 - 1.25 * 0.15 * (10044 / 144) * 15, MT: 9061, ML: 1928, HT: 0, HL: 0 }] }).delta.find((x) => x.name === "Strength I")!;
    near(at15(26).L, 1.038, 0.001);
    near(at15().L, 1.012, 0.001); // entered loads carry no cap: the bearings at the column's top
  });

  it("base forces: the axial load and the magnified longitudinal moment (p. 8-55)", () => {
    const r = run(26);
    const pm = r.checks.find((c) => c.id === "pm-Strength I-base")!;
    expect(pm.name).toContain("Pu = 2435");
    const d = r.delta.find((x) => x.name === "Strength I")!.L;
    near(pm.demand, Math.hypot(9061, 1928 * d), 1e-9);
    near(1928 * d, 2008, 0.005); // the example's Mux (δs 1.038 against 1.04)
    expect(pm.demand / pm.capacity).toBeLessThan(0.44); // the example's linear check gives 0.44
  });

  it("shear: the example's Vc = 914 kip with dv = 0.72 h; de to the tension bars' centroid (5.7.2.8)", () => {
    const r = run(26);
    const shearT = r.checks.find((c) => c.id === "shear-T")!;
    // The tension half's bars: 15 on each long face and the 7 on the far short face, their centroid 0.71 h deep.
    const far = sec.bars.map((b) => b[0]).filter((x) => x > 1e-6);
    const de = 93 + far.reduce((p, x) => p + x, 0) / far.length;
    expect(0.9 * de).toBeLessThan(0.72 * 186);
    const dv = 0.72 * 186;
    near(0.0316 * 2 * 2 * 54 * dv, 914.08, 0.001);
    near(shearT.capacity, 0.9 * (914.08 + (2 * 0.2 * 60 * dv) / 12), 0.001);
    // Vu < 0.5 φ Vc: no transverse reinforcement required (5.7.2.3), so the minimum is not.
    expect(92.28).toBeLessThan(0.5 * 0.9 * 914.08);
    const m = r.checks.find((c) => c.id === "shear-min-T")!;
    expect(m.ok).toBe(true);
    expect(m.name).toContain("not required");
  });

  it("shear friction at the base (p. 8-60): the 10th Edition's c = 0.24 ksi against the example's 0.1 ksi (6,116 kip)", () => {
    const r = run(26);
    const sf = r.checks.find((c) => c.id === "base-friction")!;
    near(sf.demand, 109.09, 1e-6);
    const Pc = Math.max(0, NHI.collision.PDC);
    near(sf.capacity, 0.9 * (0.24 * 10044 + 96.52 * 60 + Pc), 1e-6);
    near(0.9 * (0.1 * 10044 + 96.52 * 60), 6116, 0.001);
  });

  it("reinforcement limits: 0.0096 between 0.135 f'c/fy = 0.009 and 0.08 (p. 8-52)", () => {
    const r = run(26);
    near(r.checks.find((c) => c.id === "rho-max")!.demand, 0.0096, 0.01);
    near(r.checks.find((c) => c.id === "rho-min")!.demand, 0.009, 1e-9);
    expect(r.checks.find((c) => c.id === "rho-min")!.ok).toBe(true);
  });
});
