import { describe, expect, it } from "vitest";
import { CIP_DEFAULTS, designCipWall, type CipInputs } from "./cip";
import { basePressure, designCipAsd, toeResultant } from "./cip-asd";

// Validation against a stamped residential calc (IRC R404.4, ASD; ACI 318-19 members): a 7.5 ft
// stairwell wall, 10 in stem on a 4 ft footing with a 2.83 ft toe, level drained backfill
// (125 pcf, φ = 25°), qa = 1.5 ksf, and a 100 psf surcharge in Case 2. Sliding is taken by a 4 in
// slab cast tight between the two stairwell walls. With the calc's assumptions as inputs (its
// e ≤ B/3 limit and its 1.5 load factor on earth for the members), the engine reproduces its
// numbers, which were rounded as displayed.

const wall: CipInputs = {
  ...CIP_DEFAULTS,
  gammaS: 0.125, phi: 25, delta: null, kpOverride: null, efwMin: 0, phiSub: 25,
  fc: 4, gammaC: 0.15, fy: 60, Es: 29000,
  He: 6.5, Df: 1, D: 12, B: 48, A: 34, Tt: 10, frontBatter: 0, backBatter: 0, backslope: 0,
  shearKey: false, liveLoad: false, pavementThickness: 0, railWeight: 0, collision: false,
  stemBars: { bar: 4, spacing: 12 }, toeBars: { bar: 4, spacing: 12 }, heelBars: { bar: 4, spacing: 12 },
  coverStem: 2, coverToe: 3, coverHeel: 2,
  asd: true, asdQa: 1.5, asdFsOverturning: 1.5, asdFsSliding: 1.5, asdEccLimit: 3, asdMu: null, asdSurcharge: 0.1, asdGammaD: 1.2, asdGammaH: 1.5,
  strut: true, strutThickness: 4, strutFc: 4, strutSpan: 4, strutOpposite: true, strutMoveLimit: 0.1,
};
const r = designCipWall(wall);
const a = designCipAsd(wall, r);
/** Within the calc's rounding (1%, or 0.01 for small values). */
const near = (x: number, y: number, tol = 0.01) => expect(Math.abs(x - y)).toBeLessThanOrEqual(Math.max(0.01, tol * Math.abs(y)));
const check = (id: string) => a.checks.find((c) => c.id === id)!;

describe("CIP wall, IRC/IBC ASD: a residential stairwell wall", () => {
  it("earth pressure and service loads", () => {
    near(r.soil.Ka, 0.361);
    near(r.soil.efwA * 1000, 45.1);
    near(r.loads.Pa, 1.268);
    near(r.loads.vertical.DC2.force, 0.812);
    near(r.loads.vertical.DC2.arm, 3.25);
    near(r.loads.vertical.DC4.force, 0.6);
    near(r.loads.vertical.EV1.force, 0.271);
    near(r.loads.vertical.EV1.arm, 3.83);
    near(a.loads.EHV, 0.364);
    near(a.loads.EHH, 1.215);
    near(a.mu, 0.466);
  });

  it("Case 1: overturning, eccentricity, bearing and friction", () => {
    const c = a.cases[0];
    near(c.V, 2.047);
    near(c.MR, 6.33);
    near(c.MO, 3.04);
    near(c.FSot, 2.08);
    near(c.e, 0.39);
    near(c.qmax, 0.81);
    near(c.H, 1.215);
    near(c.friction, 0.955);
  });

  it("Case 2, with the 100 psf surcharge", () => {
    const c = a.cases[1];
    near(c.FSot, 1.66);
    near(c.e, 0.76);
    near(c.H, 1.474);
    near(c.friction, 0.991);
    // The calc neglects the surcharge over the 4 in heel; counted here for bearing, it moves the
    // resultant back slightly (1.14 ksf in the calc).
    near(c.qmax, 1.14, 0.02);
    expect(check("asd-brg-2").ok).toBe(true);
  });

  it("sliding through the slab strut", () => {
    const s = a.strut!;
    near(s.capacity, 106, 0.005);
    near(s.perCase[0].required, 0.87);
    near(s.perCase[1].required, 1.22);
    near(s.perCase[0].alone, 1.82);
    near(s.perCase[1].alone, 2.21);
    // Surcharge on one wall only: 0.259 kip/ft unbalanced against both footings' friction.
    near(s.unbalanced!.dH, 0.259);
    near(s.unbalanced!.R, 1.91);
    near(check("asd-unbal").capacity, 7.4);
    // Friction alone isn't enough (FS 0.79): the slab is what holds the wall.
    expect(a.cases[0].FSsl).toBeLessThan(1);
    // The slab is stiff: it shortens a few ten-thousandths of an inch.
    expect(s.shortening).toBeLessThan(0.001);
    expect(check("asd-short").ok).toBe(true);
  });

  it("members to ACI 318-19 (at the calc's 1.5 earth load factor)", () => {
    // Designed for the worse case, Case 2 (2.97 kip·ft/ft in Case 1).
    near(designCipAsd({ ...wall, asdSurcharge: 0 }, r).stem.Mu, 2.97);
    near(a.stem.Mu, 4.06);
    // The toe under the factored base pressure, its weight neglected: 3.89 against the calc's 3.76
    // in Case 1 (it nets out the toe's weight). In Case 2 the calc's toe values (5.9 and 4.2) are
    // above what the factored pressure can give (the whole factored vertical load is 3.2 kip/ft),
    // so they're conservative; here the pressure is triangular and the toe carries 2.2 kip/ft.
    near(designCipAsd({ ...wall, asdSurcharge: 0 }, r).toe.gov.toe.M, 3.76, 0.04);
    expect(a.toe.gov.toe.M).toBeLessThan(5.9);
    expect(a.toe.gov.toe.F).toBeLessThan(4.2);
    near(a.stem.flex.phiMn, 6.84);
    near(a.toe.flex.phiMn, 7.74);
    expect(check("asd-stem-flex").ok).toBe(true);
    expect(check("asd-toe-flex").ok).toBe(true);
    expect(check("asd-stem-shear").ok).toBe(true);
  });

  it("flags what the calc doesn't check: #4 @ 12 is below ACI's minimum steel and the stem's crack-control spacing", () => {
    // 0.0018 Ag (7.6.1.1): 0.216 in²/ft for the 10 in stem, 0.259 for the 12 in footing; #4 @ 12 is 0.2.
    near(a.stem.flex.AsMin, 0.216);
    near(a.toe.flex.AsMin, 0.259);
    expect(check("asd-stem-min").ok).toBe(false);
    expect(check("asd-toe-min").ok).toBe(false);
    // 24.3.2 with fs = 40 ksi and 2 in cover: 10 in.
    near(a.stem.flex.sMax, 10);
    expect(check("asd-stem-sp").ok).toBe(false);
  });

  it("at ACI 318-19's 1.6 on earth pressure, the stem moment is about 7% higher", () => {
    const aci = designCipAsd({ ...wall, asdGammaH: 1.6 }, r);
    near(aci.stem.Mu, (4.06 * 1.6) / 1.5);
  });

  it("with the usual e ≤ B/6, Case 2's resultant leaves part of the base unloaded", () => {
    const b6 = designCipAsd({ ...wall, asdEccLimit: 6 }, r);
    expect(b6.checks.find((c) => c.id === "asd-ecc-1")!.ok).toBe(true);
    expect(b6.checks.find((c) => c.id === "asd-ecc-2")!.ok).toBe(false);
  });

  it("without the slab, sliding fails", () => {
    const free = designCipAsd({ ...wall, strut: false }, r);
    expect(free.checks.find((c) => c.id === "asd-sl-1")!.ok).toBe(false);
  });
});

describe("the slab as a prop against overturning", () => {
  // A deeper stairwell wall: the footing 3 ft below the landing, so the slab bears on the stem
  // 2.83 ft above the footing's bottom, close to the earth force's line of action (h/3 = 3.17 ft).
  const deep: CipInputs = { ...wall, Df: 3, B: 78, A: 24, asdEccLimit: 6, asdGammaH: 1.6, railWeight: 0.0625, railCg: 5 };
  const propped = (o: Partial<CipInputs>) => {
    const i = { ...deep, strutProp: true, ...o };
    return designCipAsd(i, designCipWall(i));
  };

  it("finds the prop force by compatibility: the prop point moves only as much as the slab shortens", () => {
    const p = propped({}).prop!;
    near(p.y, 3 - 4 / 24, 1e-9);
    for (const c of p.cases)
      p.Kh.forEach((kh, j) => {
        const F = c.bounds[j].F;
        expect(F).toBeGreaterThan(0);
        const u = (c.HA - F) / kh;
        const theta = (c.MA - F * p.y) / p.Kr;
        near(u + theta * p.y, F / p.Kp, 1e-6);
      });
  });

  it("a footing sized as a cantilever is too wide once propped: the resultant swings toward the heel", () => {
    const free = designCipAsd(deep, designCipWall(deep));
    expect(free.checks.find((c) => c.id === "asd-brg-2")!.ok).toBe(true);
    const a = propped({});
    expect(a.checks.find((c) => c.id === "asd-brg-2")!.ok).toBe(false);
    expect(a.prop!.cases[1].bounds[0].e).toBeLessThan(0);
  });

  it("lets the footing shrink to 30 in, centered under the stem, for any kh/kv from 1/8 to 1", () => {
    const a = propped({ B: 30, A: 9 });
    const stab = a.checks.filter((c) => /^asd-(ot|ecc|brg|pb)/.test(c.id));
    expect(stab.every((c) => c.ok)).toBe(true);
    // The same footing without the prop overturns.
    const free = designCipAsd({ ...deep, B: 30, A: 9 }, designCipWall({ ...deep, B: 30, A: 9 }));
    expect(free.checks.find((c) => c.id === "asd-ecc-2")!.ok).toBe(false);
    // The stem is checked at the slab too, where the soil above it governs once the base is relieved.
    expect(a.stem.prop).not.toBeNull();
    near(a.stem.Mu, Math.max(a.stem.prop!.baseMu, a.stem.prop!.propMu), 1e-9);
  });

  it("cast after the backfill, the slab takes only the surcharge", () => {
    const a = propped({ strutBeforeBackfill: false });
    expect(a.prop!.cases[0].bounds.every((b) => b.F === 0)).toBe(true);
    expect(a.prop!.cases[1].Fmin).toBeGreaterThan(0);
    expect(a.prop!.cases[1].Fmin).toBeLessThan(a.cases[1].H - a.cases[0].H + 1e-9);
  });

  it("is off when the slab is below the footing's top in a shallow wall, as far as the stem goes", () => {
    const a = propped({ Df: 1 });
    expect(a.prop).not.toBeNull();
    expect(a.stem.prop).toBeNull();
  });
});

describe("base pressure and the toe", () => {
  it("is trapezoidal within B/6 and triangular beyond, carrying V either way", () => {
    for (const X of [0.4, 1, 1.8, 2, 2.4, 3, 3.6]) {
      const B = 4;
      const p = basePressure(10, X, B);
      // The whole pressure over the base is V, acting at X.
      const all = toeResultant(p.a, p.b, B);
      near(all.F, 10, 1e-9);
      near(B - all.M / all.F, X, 1e-9);
    }
  });
});
