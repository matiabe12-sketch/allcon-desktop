import { BARS, type Bars, type Check, type CipInputs, type CipResult } from "./cip";

// The CIP cantilever wall checked the building-code way, apart from the AASHTO LRFD design:
// stability by allowable stress at service loads (IRC R404.4 and IBC 1807.2.3: a factor of safety
// of 1.5 against sliding and overturning; bearing within the allowable pressure, IRC Table
// R401.4.1 / IBC Table 1806.2), and the members by ACI 318-19 strength design. A landing or stair
// slab cast tight between this wall and an opposite one may act as a strut against sliding.
// It uses the AASHTO design's soil, geometry and unfactored loads (one load model for both).
// Kip, foot and ksf throughout; bars, covers and slab thickness in inches.

export type AsdCase = {
  id: 1 | 2;
  name: string;
  V: number; // vertical load, kip/ft
  MR: number; // resisting moment about the toe, kip·ft/ft
  H: number; // horizontal load
  MO: number; // overturning moment about the toe
  FSot: number;
  X: number; // resultant from the toe, ft
  e: number; // eccentricity, + toward the toe, ft
  Vb: number; // with the surcharge over the heel, for bearing
  Xb: number;
  eb: number;
  qmax: number; // ksf
  qmin: number;
  friction: number; // μ V, kip/ft
  passive: number; // the shear key's passive resistance (unfactored), kip/ft
  FSsl: number; // without the slab
};

/** The linear base pressure p(x) = max(0, a + b x) from the toe, for a resultant V at X from the toe (no tension). */
export function basePressure(V: number, X: number, B: number) {
  const e = B / 2 - X;
  if (X <= 0 || X >= B) return { a: Infinity, b: 0, e, qmax: Infinity, qmin: 0, full: false };
  if (Math.abs(e) <= B / 6) {
    const a = (V / B) * (1 + (6 * e) / B);
    const b = (-12 * V * e) / B ** 3;
    return { a, b, e, qmax: Math.max(a, a + b * B), qmin: Math.min(a, a + b * B), full: true };
  }
  if (e > 0) {
    const Lc = 3 * X;
    const a = (2 * V) / Lc;
    return { a, b: -a / Lc, e, qmax: a, qmin: 0, full: false };
  }
  const Lc = 3 * (B - X);
  const q = (2 * V) / Lc;
  const b = q / Lc;
  return { a: q - b * B, b, e, qmax: q, qmin: 0, full: false };
}

/** The force and the moment about the stem's front face (x = A) of p(x) = max(0, a + b x) over the toe, 0 ≤ x ≤ A. */
export function toeResultant(a: number, b: number, A: number) {
  const p = (x: number) => Math.max(0, a + b * x);
  const xs = a >= 0 ? 0 : Math.min(A, -a / b);
  const xe = a + b * A >= 0 ? A : Math.max(0, -a / b);
  const L = Math.max(xe - xs, 0);
  const ps = p(xs);
  const pe = p(xe);
  const ds = A - xs;
  const de = A - xe;
  return { xs, xe, ps, pe, F: ((ps + pe) / 2) * L, M: (L / 6) * (ps * (2 * ds + de) + pe * (ds + 2 * de)) };
}

/** Flexure of a 12 in strip to ACI 318-19: φ from the net tensile strain (Table 21.2.2), minimum steel (7.6.1.1), spacing. */
export function aciFlexure(o: { Mu: number; h: number; cover: number; bars: Bars; fc: number; fy: number; Es: number; crackControl: boolean }) {
  const b = 12;
  const { area, dia } = BARS[o.bars.bar];
  const d = o.h - o.cover - dia / 2;
  const As = (area * b) / o.bars.spacing;
  const beta1 = Math.min(0.85, Math.max(0.65, 0.85 - (0.05 * (o.fc - 4)) / 1)); // ACI Table 22.2.2.4.3
  const a = (As * o.fy) / (0.85 * o.fc * b);
  const c = a / beta1;
  const epsT = (0.003 * (d - c)) / c;
  const epsTy = o.fy / o.Es;
  const phi = epsT >= epsTy + 0.003 ? 0.9 : epsT <= epsTy ? 0.65 : 0.65 + (0.25 * (epsT - epsTy)) / 0.003;
  const Mn = (As * o.fy * (d - a / 2)) / 12;
  const AsMin = Math.max((0.0018 * 60) / o.fy, 0.0014) * b * o.h;
  // Spacing: 3h and 18 in (7.7.2.3); with crack control (24.3.2) for the stem, fs = 2/3 fy.
  const fs = (2 / 3) * o.fy;
  const cc = o.cover;
  const sCrack = Math.min(15 * (40 / fs) - 2.5 * cc, 12 * (40 / fs));
  const sMax = Math.min(3 * o.h, 18, o.crackControl ? sCrack : Infinity);
  return { d, As, beta1, a, c, epsT, epsTy, phi, Mn, phiMn: phi * Mn, AsMin, fs, cc, sCrack, sMax, area, dia };
}

/** One-way shear of a 12 in strip without stirrups, ACI 318-19 Eq. 22.5.5.1(c) (λs = 1 for a footing, 13.2.6.2), in kip. */
export function aciShear(o: { d: number; As: number; fc: number; footing: boolean }) {
  const b = 12;
  const rhoW = o.As / (b * o.d);
  const lambdaS = o.footing ? 1 : Math.min(1, Math.sqrt(2 / (1 + o.d / 10)));
  const rootFc = Math.sqrt(o.fc * 1000); // psi
  const Vc = Math.min(8 * lambdaS * rhoW ** (1 / 3) * rootFc, 5 * rootFc) * b * o.d / 1000;
  return { rhoW, lambdaS, Vc, phiVc: 0.75 * Vc };
}

export function designCipAsd(i: CipInputs, r: CipResult) {
  const checks: Check[] = [];
  const add = (c: Omit<Check, "ok"> & { ok?: boolean }) => checks.push({ ...c, ok: c.ok ?? c.demand <= c.capacity });
  const { B, A, C, T2, Tb, h, hStem, t, D } = r.geometry;
  const v = r.loads.vertical;
  const delta = r.soil.delta;
  const cosD = Math.cos((delta * Math.PI) / 180);
  const sinD = Math.sin((delta * Math.PI) / 180);
  const mu = i.asdMu ?? r.soil.mu;
  const KaEff = r.soil.efwA / i.gammaS; // the active coefficient, with any minimum fluid weight
  const q = i.asdSurcharge;

  // --- service loads ------------------------------------------------------------------------
  // Dead load and earth, without the AASHTO traffic surcharge (LSV) and collision.
  const dead = [v.DC1, v.DC2, v.DC3, v.DC4, v.DC5, v.DC6, v.EV1, v.EV2, v.EV3, v.EV4];
  const VD = dead.reduce((s, l) => s + l.force, 0);
  const MD = dead.reduce((s, l) => s + l.moment, 0);
  const Pa = r.loads.Pa;
  const EHV = Pa * sinD;
  const EHH = Pa * cosD;
  // The surcharge: a uniform pressure Ka q over the full height, inclined at δ like the earth force.
  const Ps = KaEff * q * h;
  const PsH = Ps * cosD;
  const PsV = Ps * sinD;
  const heelWidth = T2 + C;
  const qHeel = q * heelWidth; // over the heel, counted for bearing only
  const passive = i.shearKey ? r.stability.key.Rep : 0;

  const makeCase = (id: 1 | 2): AsdCase => {
    const s = id === 2 ? 1 : 0;
    const V = VD + EHV + s * PsV;
    const MR = MD + EHV * B + s * PsV * B;
    const H = EHH + s * PsH;
    const MO = (EHH * h) / 3 + (s * PsH * h) / 2;
    const X = (MR - MO) / V;
    const Vb = V + s * qHeel;
    const Xb = (MR + s * qHeel * (B - heelWidth / 2) - MO) / Vb;
    const p = basePressure(Vb, Xb, B);
    const friction = mu * V;
    return { id, name: id === 1 ? "Case 1, soil only" : "Case 2, soil and surcharge", V, MR, H, MO, FSot: MR / MO, X, e: B / 2 - X, Vb, Xb, eb: B / 2 - Xb, qmax: p.qmax, qmin: p.qmin, friction, passive, FSsl: (friction + passive) / H };
  };
  const cases = q > 0 ? [makeCase(1), makeCase(2)] : [makeCase(1)];

  // --- the slab as a prop -------------------------------------------------------------------
  // The slab, bearing on the stem at its mid-depth y above the footing's bottom, also resists the
  // wall's rotation. Its force F is statically indeterminate, so it is found by compatibility: the
  // wall and footing move as a rigid body on soil springs (Winkler: kv under the base for rocking,
  // kh for sliding), and the prop point moves only as much as the slab shortens. Only the loads
  // placed after the slab is cast count. The stem's own bending, which would add to F, is
  // neglected. As kh/kv is uncertain, F is found for a lower and an upper bound and both are checked.
  const yProp = i.Df - i.strutThickness / 24;
  const prop = (() => {
    if (!i.strut || !i.strutProp || yProp <= 0) return null;
    const kv = i.strutKv * 1.728; // pci to kcf
    const Kr = (kv * B ** 3) / 12; // rocking, kip·ft/rad per ft
    const Ks = ((57 * Math.sqrt(1000 * i.strutFc) * i.strutThickness) / (i.strutSpan * 12)) * 144; // ksf
    const Kp = (i.strutOpposite ? 2 : 1) * Ks; // with the same wall opposite, the slab's middle stays put
    const Kh = [i.strutKhLo, i.strutKhHi].map((rt) => rt * kv * B); // sliding, ksf
    const dc = [v.DC1, v.DC2, v.DC3, v.DC4, v.DC5, v.DC6];
    const VC = dc.reduce((s, l) => s + l.force, 0);
    const MC = dc.reduce((s, l) => s + l.moment, 0);
    // The loads already on when the slab is cast: the wall alone, or the wall backfilled (Case 1).
    const before = i.strutBeforeBackfill ? { H: 0, M: (VC * B) / 2 - MC } : { H: cases[0].H, M: cases[0].Vb * cases[0].eb };
    const rows = cases.map((c) => {
      const HA = c.H - before.H;
      const MA = c.Vb * c.eb - before.M; // about the base's center, + toward the toe
      const bounds = Kh.map((kh) => {
        const F = Math.max(0, (HA / kh + (MA * yProp) / Kr) / (1 / kh + yProp ** 2 / Kr + 1 / Kp));
        const Xb = c.Xb + (F * yProp) / c.Vb;
        const p = basePressure(c.Vb, Xb, B);
        return { F, Xb, e: B / 2 - Xb, qmax: p.qmax, qmin: p.qmin };
      });
      const Fmin = Math.min(...bounds.map((b) => b.F));
      return { id: c.id, HA, MA, bounds, Fmin, FSot: (c.MR + Fmin * yProp) / c.MO };
    });
    return { y: yProp, kv, Kr, Ks, Kp, Kh, VC, MC, before, cases: rows };
  })();

  // --- stability ----------------------------------------------------------------------------
  const eMax = B / i.asdEccLimit;
  for (const c of cases) {
    const p = prop?.cases.find((x) => x.id === c.id);
    const Fs = p ? ` with the slab prop F = ${p.bounds.map((b) => b.F.toFixed(3)).join(" to ")} kip/ft` : "";
    add({ id: `asd-ot-${c.id}`, name: `Overturning FS, ${c.name}`, demand: i.asdFsOverturning, capacity: p ? p.FSot : c.FSot, unit: "", ref: "IRC R404.4; IBC 1807.2.3", note: `MR = ${c.MR.toFixed(3)}, MO = ${c.MO.toFixed(3)} kip·ft/ft${Fs}` });
    add({ id: `asd-ecc-${c.id}`, name: `Eccentricity, ${c.name}`, demand: p ? Math.max(...p.bounds.map((b) => Math.abs(b.e))) : Math.abs(c.e), capacity: eMax, unit: "ft", ref: i.asdEccLimit === 6 ? "Within B/6: the whole base in contact" : "Within B/3", ...(p ? { note: `Bearing resultant${Fs}` } : {}) });
    add({ id: `asd-brg-${c.id}`, name: `Bearing, ${c.name}`, demand: p ? Math.max(...p.bounds.map((b) => b.qmax)) : c.qmax, capacity: i.asdQa, unit: "ksf", ref: "IRC T. R401.4.1; IBC T. 1806.2" });
    if (p) add({ id: `asd-pb-${c.id}`, name: `Base shear with the prop, FS × |H − F|, ${c.name}`, demand: i.asdFsSliding * Math.max(...p.bounds.map((b) => Math.abs(c.H - b.F))), capacity: c.friction + c.passive, unit: "kip/ft", ref: "IRC R404.4" });
  }

  // Sliding: base friction and the key's passive resistance, and the slab strut if there is one.
  const strut = (() => {
    if (!i.strut) return null;
    const ts = i.strutThickness;
    const Ag = ts * 12; // in² per ft
    const capacity = 0.65 * 0.85 * i.strutFc * Ag; // ACI 22.8.3.2, φ = 0.65 (Table 21.2.1)
    const Ec = 57 * Math.sqrt(1000 * i.strutFc); // ksi, ACI 19.2.2.1(b)
    const L = i.strutSpan * 12; // in
    const k = (Ec * Ag) / L; // kip/in per ft
    const Hmax = Math.max(...cases.map((c) => c.H));
    const shortening = Hmax / k; // the stiff slab takes the whole thrust
    const perCase = cases.map((c) => ({ id: c.id, required: Math.max(i.asdFsSliding * c.H - c.friction - c.passive, 0), alone: i.asdFsSliding * c.H }));
    // With an identical wall opposite, the thrusts balance through the slab; a surcharge on one
    // side only leaves the difference, resisted by both footings' friction.
    const unbalanced = i.strutOpposite && cases.length === 2 ? { dH: cases[1].H - cases[0].H, R: 2 * cases[0].friction } : null;
    return { ts, Ag, capacity, Ec, L, k, Hmax, shortening, perCase, unbalanced };
  })();
  for (const c of cases) {
    if (!strut) add({ id: `asd-sl-${c.id}`, name: `Sliding FS, ${c.name}`, demand: i.asdFsSliding, capacity: c.FSsl, unit: "", ref: "IRC R404.4; IBC 1807.2.3", note: `μV = ${c.friction.toFixed(3)}${c.passive ? `, key ${c.passive.toFixed(3)}` : ""}, H = ${c.H.toFixed(3)} kip/ft` });
    else {
      const s = strut.perCase.find((p) => p.id === c.id)!;
      add({ id: `asd-sl-${c.id}`, name: `Sliding: slab force for FS ${i.asdFsSliding}, ${c.name}`, demand: s.required, capacity: strut.capacity, unit: "kip/ft", ref: "IRC R404.4; ACI 22.8.3.2", note: `Friction alone gives FS ${c.FSsl.toFixed(2)}` });
      add({ id: `asd-st-${c.id}`, name: `Slab strut alone carries FS × H, ${c.name}`, demand: s.alone, capacity: strut.capacity, unit: "kip/ft", ref: "ACI 22.8.3.2" });
    }
  }
  if (strut) {
    if (strut.unbalanced && strut.unbalanced.dH > 0) add({ id: "asd-unbal", name: "Unbalanced thrust (surcharge on one wall), FS", demand: i.asdFsSliding, capacity: strut.unbalanced.R / strut.unbalanced.dH, unit: "", ref: "IRC R404.4" });
    add({ id: "asd-short", name: "Slab strut shortening", demand: strut.shortening, capacity: i.strutMoveLimit, unit: "in", ref: "Movement limit set by the designer" });
  }

  // --- members, ACI 318-19 (U = γD D + γH H) --------------------------------------------------
  const gD = i.asdGammaD;
  const gH = i.asdGammaH;
  const qs = cases.length === 2 ? q : 0;
  // Stem at its base, a one-way slab (ACI 13.3.6.1); the earth force and surcharge, horizontal.
  const hs = hStem - t;
  const stemEH = cosD * 0.5 * r.soil.efwA * hs ** 2;
  const stemS = cosD * KaEff * qs * hs;
  // With the prop: its service-load force (the smaller bound, which understates its relief) acts
  // on the stem at yps above the footing, and the stem is also checked at the prop, under the soil above it.
  const Fm = prop ? prop.cases[prop.cases.length - 1].Fmin : 0;
  const yps = yProp - D;
  const propStem = !!prop && yps > 0 && yps < hs;
  const ap = hs - yps;
  const stemBaseVu = gH * (stemEH + stemS) - (propStem ? Fm : 0);
  const stemBaseMu = gH * ((stemEH * hs) / 3 + (stemS * hs) / 2) - (propStem ? Fm * yps : 0);
  const stemPropVu = propStem ? gH * cosD * (0.5 * r.soil.efwA * ap ** 2 + KaEff * qs * ap) : 0;
  const stemPropMu = propStem ? gH * cosD * ((r.soil.efwA * ap ** 3) / 6 + (KaEff * qs * ap ** 2) / 2) : 0;
  const stemVu = Math.max(Math.abs(stemBaseVu), stemPropVu);
  const stemMu = Math.max(stemBaseMu, stemPropMu);
  const stemF = aciFlexure({ Mu: stemMu, h: Tb * 12, cover: i.coverStem, bars: i.stemBars, fc: i.fc, fy: i.fy, Es: i.Es, crackControl: true });
  const stemV = aciShear({ d: stemF.d, As: stemF.As, fc: i.fc, footing: false });
  add({ id: "asd-stem-flex", name: "Stem flexure", demand: stemMu, capacity: stemF.phiMn, unit: "kip·ft/ft", ref: "ACI 318-19 22.3" });
  add({ id: "asd-stem-min", name: "Stem minimum reinforcement", demand: stemF.AsMin, capacity: stemF.As, unit: "in²/ft", ref: "ACI 318-19 7.6.1.1" });
  add({ id: "asd-stem-sp", name: "Stem bar spacing (crack control)", demand: i.stemBars.spacing, capacity: stemF.sMax, unit: "in", ref: "ACI 318-19 24.3.2, 7.7.2.3" });
  add({ id: "asd-stem-shear", name: "Stem shear", demand: stemVu, capacity: stemV.phiVc, unit: "kip/ft", ref: "ACI 318-19 22.5.5.1(c)" });

  // Toe, at the stem's front face, under the factored base pressure (its own weight neglected).
  const factoredCase = (gDead: number) => {
    const s = qs > 0 ? 1 : 0;
    const V = gDead * VD + gH * (EHV + s * PsV);
    const MR = gDead * MD + gH * (EHV + s * PsV) * B;
    const MO = gH * ((EHH * h) / 3 + (s * PsH * h) / 2);
    const X = (MR - MO + (prop ? Fm * yProp : 0)) / V;
    const p = basePressure(V, X, B);
    return { gDead, V, MR, MO, X, ...p, toe: toeResultant(p.a, p.b, A) };
  };
  const toeCases = [factoredCase(gD), factoredCase(0.9)];
  const toeGov = toeCases.reduce((m, c) => (c.toe.M > m.toe.M ? c : m));
  const toeF = aciFlexure({ Mu: toeGov.toe.M, h: D * 12, cover: i.coverToe, bars: i.toeBars, fc: i.fc, fy: i.fy, Es: i.Es, crackControl: false });
  const toeV = aciShear({ d: toeF.d, As: toeF.As, fc: i.fc, footing: true });
  add({ id: "asd-toe-flex", name: "Toe flexure", demand: toeGov.toe.M, capacity: toeF.phiMn, unit: "kip·ft/ft", ref: "ACI 318-19 13.2.7.1, 22.3" });
  add({ id: "asd-toe-min", name: "Toe minimum reinforcement", demand: toeF.AsMin, capacity: toeF.As, unit: "in²/ft", ref: "ACI 318-19 7.6.1.1" });
  add({ id: "asd-toe-sp", name: "Toe bar spacing", demand: i.toeBars.spacing, capacity: toeF.sMax, unit: "in", ref: "ACI 318-19 7.7.2.3" });
  add({ id: "asd-toe-shear", name: "Toe shear (at the stem face)", demand: toeGov.toe.F, capacity: toeV.phiVc, unit: "kip/ft", ref: "ACI 318-19 22.5.5.1(c), 13.2.6.2" });

  // Heel, at the stem's back face: its weight, the fill and the surcharge on it (bearing neglected).
  const heelW = gD * (i.gammaC * C * D + i.gammaS * hStem * C) + gH * qs * C;
  const heelMu = (heelW * C) / 2;
  const heelF = aciFlexure({ Mu: heelMu, h: D * 12, cover: i.coverHeel, bars: i.heelBars, fc: i.fc, fy: i.fy, Es: i.Es, crackControl: false });
  const heelV = aciShear({ d: heelF.d, As: heelF.As, fc: i.fc, footing: true });
  add({ id: "asd-heel-flex", name: "Heel flexure", demand: heelMu, capacity: heelF.phiMn, unit: "kip·ft/ft", ref: "ACI 318-19 22.3" });
  add({ id: "asd-heel-min", name: "Heel minimum reinforcement", demand: heelF.AsMin, capacity: heelF.As, unit: "in²/ft", ref: "ACI 318-19 7.6.1.1" });
  add({ id: "asd-heel-sp", name: "Heel bar spacing", demand: i.heelBars.spacing, capacity: heelF.sMax, unit: "in", ref: "ACI 318-19 7.7.2.3" });
  add({ id: "asd-heel-shear", name: "Heel shear", demand: heelW, capacity: heelV.phiVc, unit: "kip/ft", ref: "ACI 318-19 22.5.5.1(c)" });

  // Shrinkage and temperature steel, the bars at both faces together (ACI 24.4.3.2).
  const st = (bars: Bars, hIn: number) => ({ provided: (2 * BARS[bars.bar].area * 12) / bars.spacing, required: Math.max((0.0018 * 60) / i.fy, 0.0014) * 12 * hIn });
  const stemST = st(i.stemTemp, Tb * 12);
  const footST = st(i.toeTemp, D * 12);
  add({ id: "asd-stem-st", name: "Stem shrinkage and temperature steel (both faces)", demand: stemST.required, capacity: stemST.provided, unit: "in²/ft", ref: "ACI 318-19 24.4.3.2" });
  add({ id: "asd-foot-st", name: "Footing shrinkage and temperature steel (both faces)", demand: footST.required, capacity: footST.provided, unit: "in²/ft", ref: "ACI 318-19 24.4.3.2" });

  return {
    ok: checks.every((c) => c.ok),
    checks,
    mu,
    KaEff,
    loads: { VD, MD, Pa, EHV, EHH, Ps, PsH, PsV, qHeel, heelWidth },
    cases,
    eMax,
    strut,
    prop,
    stem: { hs, EH: stemEH, S: stemS, Vu: stemVu, Mu: stemMu, flex: stemF, shear: stemV, prop: propStem ? { F: Fm, yps, ap, baseMu: stemBaseMu, baseVu: stemBaseVu, propMu: stemPropMu, propVu: stemPropVu } : null },
    toe: { cases: toeCases, gov: toeGov, flex: toeF, shear: toeV },
    heel: { w: heelW, Mu: heelMu, flex: heelF, shear: heelV },
    temp: { stem: stemST, footing: footST },
  };
}

export type CipAsdResult = ReturnType<typeof designCipAsd>;
