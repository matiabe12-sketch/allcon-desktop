import { BARS, type Bars, type Check, type CipInputs, type CipResult } from "./cip";
import { aciFlexure, aciShear, basePressure } from "./cip-asd";

// A U-shaped stairwell checked the building-code way: two stems on one continuous base slab, with
// level backfill on both outer faces. The earth thrusts balance through the base slab, so neither
// wall slides or tips on its own; only a surcharge on one side is unbalanced (IRC R404.4 and IBC
// 1807.2.3: FS 1.5 against sliding and overturning; bearing within the allowable pressure). The
// members are designed by ACI 318-19: each stem a one-way slab fixed into the base slab
// (13.3.6.1), optionally propped by the landing or stair slab cast tight against both stems and
// doweled to them, and the base slab carrying the stems' corner moments across the stairwell.
// Kip, foot and ksf throughout; bars, covers and slab thickness in inches.

export type UCase = { id: 1 | 2 | 3; name: string; V: number; MR: number; MO: number; H: number; FSot: number; X: number; e: number; qmax: number; qmin: number; friction: number; FSsl: number };

/** The free-cantilever stem under k·u (triangular) and s (uniform) per foot, u measured down from the soil's top. */
const freeM = (k: number, s: number, u: number) => (k * u ** 3) / 6 + (s * u ** 2) / 2;
const freeV = (k: number, s: number, u: number) => (k * u ** 2) / 2 + s * u;

/**
 * A stem fixed at its base (height hs), propped at a above the base by a rigid slab: the prop force
 * that keeps the prop point from moving (the deflection there of the free cantilever, over a³/3EI),
 * and the moments: at the base, at the prop, and at the point between where the shear is zero.
 * + moment: tension at the soil face.
 */
export function proppedStem(k: number, s: number, hs: number, a: number) {
  const c = hs - a; // soil above the prop
  const I = (n: number) => (hs ** (n + 2) - c ** (n + 2)) / (n + 2) - (c * (hs ** (n + 1) - c ** (n + 1))) / (n + 1);
  const R = (3 * ((k / 6) * I(3) + (s / 2) * I(2))) / a ** 3;
  const M = (u: number) => freeM(k, s, u) - (u > c ? R * (u - c) : 0);
  const u0 = k > 0 ? (-s + Math.sqrt(s ** 2 + 2 * k * R)) / k : R / Math.max(s, 1e-12);
  const uz = Math.min(Math.max(u0, c), hs);
  const Mb = M(hs);
  const Mp = M(c);
  const Mz = M(uz);
  return { c, R, Mb, Mp, uz, Mz, out: Math.max(0, Mb, Mp, Mz), inside: Math.max(0, -Math.min(Mb, Mp, Mz)), V: Math.max(Math.abs(freeV(k, s, hs) - R), freeV(k, s, c), Math.abs(freeV(k, s, c) - R)) };
}

export function designCipAsdU(i: CipInputs, r: CipResult) {
  const checks: Check[] = [];
  const add = (c: Omit<Check, "ok"> & { ok?: boolean }) => checks.push({ ...c, ok: c.ok ?? c.demand <= c.capacity });
  const { H, D } = r.geometry;
  const t = i.Tt / 12;
  const L = i.uClear;
  const P = i.uOuter / 12;
  const Bu = 2 * t + L + 2 * P;
  const hs = H - D; // stem height, base slab's top to the soil's top
  const hFill = Math.max(0, i.Df - D); // inside, between the base slab and the landing
  const delta = r.soil.delta;
  const cosD = Math.cos((delta * Math.PI) / 180);
  const sinD = Math.sin((delta * Math.PI) / 180);
  const mu = i.asdMu ?? r.soil.mu;
  const KaEff = r.soil.efwA / i.gammaS;
  const q = i.asdSurcharge;

  // --- service loads, per foot along the stairwell -----------------------------------------------
  const W = {
    stems: 2 * i.gammaC * t * hs,
    base: i.gammaC * Bu * D,
    rails: 2 * i.railWeight,
    soilOut: 2 * i.gammaS * P * hs,
    fill: i.gammaS * L * hFill,
    stairs: i.uStairs,
  };
  const VD = Object.values(W).reduce((s, x) => s + x, 0);
  const Pa = 0.5 * r.soil.efwA * H ** 2; // on each outer face, over the full height
  const EHV = Pa * sinD;
  const EHH = Pa * cosD;
  const Ps = KaEff * q * H;
  const PsH = Ps * cosD;
  const PsV = Ps * sinD;
  const qP = q * P; // the surcharge over one outer projection

  const cases: UCase[] = [];
  const sym = (id: 1 | 2, name: string, V: number): UCase => ({ id, name, V, MR: (V * Bu) / 2, MO: 0, H: 0, FSot: Infinity, X: Bu / 2, e: 0, qmax: V / Bu, qmin: V / Bu, friction: mu * V, FSsl: Infinity });
  cases.push(sym(1, "Case 1, soil on both sides", VD + 2 * EHV));
  if (q > 0) {
    cases.push(sym(2, "Case 2, surcharge on both sides", VD + 2 * EHV + 2 * PsV + 2 * qP));
    // Case 3: the surcharge on one side only; the U tips toward the other side, about its outer edge.
    const V = VD + 2 * EHV + PsV + qP;
    const MR = (VD * Bu) / 2 + EHV * Bu + PsV * Bu + qP * (Bu - P / 2); // EHV at both outer edges
    const MO = (PsH * H) / 2; // the earth thrusts balance, in force and moment
    const X = (MR - MO) / V;
    const p = basePressure(V, X, Bu);
    cases.push({ id: 3, name: "Case 3, surcharge on one side", V, MR, MO, H: PsH, FSot: MR / MO, X, e: Bu / 2 - X, qmax: p.qmax, qmin: p.qmin, friction: mu * V, FSsl: (mu * V) / PsH });
  }

  // --- stability ------------------------------------------------------------------------------
  const eMax = Bu / i.asdEccLimit;
  for (const c of cases) {
    if (c.id === 3) {
      add({ id: "asd-ot-3", name: `Overturning FS, ${c.name}`, demand: i.asdFsOverturning, capacity: c.FSot, unit: "", ref: "IRC R404.4; IBC 1807.2.3", note: `MR = ${c.MR.toFixed(3)}, MO = ${c.MO.toFixed(3)} kip·ft/ft` });
      add({ id: "asd-ecc-3", name: `Eccentricity, ${c.name}`, demand: Math.abs(c.e), capacity: eMax, unit: "ft", ref: i.asdEccLimit === 6 ? "Within B/6: the whole base in contact" : "Within B/3" });
    }
    add({ id: `asd-brg-${c.id}`, name: `Bearing, ${c.name}`, demand: c.qmax, capacity: i.asdQa, unit: "ksf", ref: "IRC T. R401.4.1; IBC T. 1806.2" });
    if (c.id === 3) add({ id: "asd-sl-3", name: `Sliding FS, ${c.name}`, demand: i.asdFsSliding, capacity: c.FSsl, unit: "", ref: "IRC R404.4; IBC 1807.2.3", note: `μV = ${c.friction.toFixed(3)}, unbalanced H = ${c.H.toFixed(3)} kip/ft` });
  }

  // --- stems, ACI 318-19 (U = γD D + γH H), with the surcharge on both sides if any -------------
  const gD = i.asdGammaD;
  const gH = i.asdGammaH;
  const qs = q;
  const k = gH * cosD * r.soil.efwA; // factored pressure per foot of depth
  const s = gH * cosD * KaEff * qs; // factored uniform pressure
  const ts = i.strutThickness;
  const aAuto = i.Df - D - ts / 24;
  const a = i.uPropHeight ?? aAuto;
  const propped = i.uProp && a > 0 && a < hs;
  const stem = propped ? proppedStem(k, s, hs, a) : null;
  const Mout = stem ? stem.out : freeM(k, s, hs);
  const Min = stem ? stem.inside : 0;
  const Vu = stem ? stem.V : freeV(k, s, hs);
  const Mc = stem ? stem.Mb : freeM(k, s, hs); // the corner moment into the base slab, + soil face
  const stemF = aciFlexure({ Mu: Mout, h: i.Tt, cover: i.coverStem, bars: i.stemBars, fc: i.fc, fy: i.fy, Es: i.Es, crackControl: true });
  const stemV = aciShear({ d: stemF.d, As: stemF.As, fc: i.fc, footing: false });
  add({ id: "asd-stem-flex", name: "Stem flexure, soil face", demand: Mout, capacity: stemF.phiMn, unit: "kip·ft/ft", ref: "ACI 318-19 22.3" });
  add({ id: "asd-stem-min", name: "Stem minimum reinforcement", demand: stemF.AsMin, capacity: stemF.As, unit: "in²/ft", ref: "ACI 318-19 7.6.1.1" });
  add({ id: "asd-stem-sp", name: "Stem bar spacing (crack control)", demand: i.stemBars.spacing, capacity: stemF.sMax, unit: "in", ref: "ACI 318-19 24.3.2, 7.7.2.3" });
  add({ id: "asd-stem-shear", name: "Stem shear", demand: Vu, capacity: stemV.phiVc, unit: "kip/ft", ref: "ACI 318-19 22.5.5.1(c)" });
  const innerF = aciFlexure({ Mu: Min, h: i.Tt, cover: i.coverStem, bars: i.uInnerBars, fc: i.fc, fy: i.fy, Es: i.Es, crackControl: true });
  let prop: null | { a: number; R: number; capacity: number } = null;
  if (stem) {
    add({ id: "asd-stem-in", name: "Stem flexure, inside face (below the prop)", demand: Min, capacity: innerF.phiMn, unit: "kip·ft/ft", ref: "ACI 318-19 22.3" });
    prop = { a, R: stem.R, capacity: 0.65 * 0.85 * i.strutFc * ts * 12 };
    add({ id: "asd-u-prop", name: "Slab prop bearing on the stem (factored)", demand: stem.R, capacity: prop.capacity, unit: "kip/ft", ref: "ACI 318-19 22.8.3.2" });
  }
  // The soil-face bars hooked into the base slab (ACI 318-19 25.4.3.1: ψe = ψo = 1, ψr = 1.6).
  const db = BARS[i.stemBars.bar].dia;
  const psiC = Math.min(1, (i.fc * 1000) / 15000 + 0.6);
  const ldh = Math.max(((i.fy * 1000 * 1.6 * psiC) / (55 * Math.sqrt(i.fc * 1000))) * db ** 1.5, 8 * db, 6);
  const hookRoom = i.D - i.coverToe;
  add({ id: "asd-hook", name: "Stem bars' hooks into the base slab", demand: ldh, capacity: hookRoom, unit: "in", ref: "ACI 318-19 25.4.3.1" });

  // --- base slab ----------------------------------------------------------------------------
  // Under the factored base pressure (uniform), for both load factors on the dead load: the span
  // between the stems carries the corner moments (plus the outer projections') and the net upward
  // pressure; each outer projection cantilevers. + moment: tension at the bottom.
  const baseCase = (gDead: number) => {
    const Vf = gDead * VD + gH * (2 * EHV + (qs > 0 ? 2 * PsV + 2 * qs * P : 0));
    const qu = Vf / Bu;
    const w = qu - gDead * (i.gammaC * D + i.gammaS * hFill + i.uStairs / L);
    const wo = qu - gDead * (i.gammaC * D + i.gammaS * hs) - gH * qs;
    const Mo = (wo * P ** 2) / 2;
    const Mend = Mc + Mo;
    const bottom = Math.max(0, Mend, Mend - (w * L ** 2) / 8, Mo);
    const top = Math.max(0, -Mend, (w * L ** 2) / 8 - Mend, -Mo);
    const V = Math.max((Math.abs(w) * L) / 2, Math.abs(wo) * P);
    return { gDead, Vf, qu, w, wo, Mo, Mend, bottom, top, V };
  };
  const baseCases = [baseCase(gD), baseCase(0.9)];
  const Mbot = Math.max(...baseCases.map((c) => c.bottom));
  const Mtop = Math.max(...baseCases.map((c) => c.top));
  const Vbase = Math.max(...baseCases.map((c) => c.V));
  const botF = aciFlexure({ Mu: Mbot, h: i.D, cover: i.coverToe, bars: i.toeBars, fc: i.fc, fy: i.fy, Es: i.Es, crackControl: false });
  const topF = aciFlexure({ Mu: Mtop, h: i.D, cover: i.coverHeel, bars: i.heelBars, fc: i.fc, fy: i.fy, Es: i.Es, crackControl: false });
  const baseV = aciShear({ d: Math.min(botF.d, topF.d), As: Math.min(botF.As, topF.As), fc: i.fc, footing: true });
  add({ id: "asd-bot-flex", name: "Base slab flexure, bottom", demand: Mbot, capacity: botF.phiMn, unit: "kip·ft/ft", ref: "ACI 318-19 22.3" });
  add({ id: "asd-bot-min", name: "Base slab minimum reinforcement, bottom", demand: botF.AsMin, capacity: botF.As, unit: "in²/ft", ref: "ACI 318-19 7.6.1.1" });
  add({ id: "asd-bot-sp", name: "Base slab bar spacing, bottom", demand: i.toeBars.spacing, capacity: botF.sMax, unit: "in", ref: "ACI 318-19 7.7.2.3" });
  add({ id: "asd-top-flex", name: "Base slab flexure, top", demand: Mtop, capacity: topF.phiMn, unit: "kip·ft/ft", ref: "ACI 318-19 22.3" });
  add({ id: "asd-top-min", name: "Base slab minimum reinforcement, top", demand: topF.AsMin, capacity: topF.As, unit: "in²/ft", ref: "ACI 318-19 7.6.1.1" });
  add({ id: "asd-top-sp", name: "Base slab bar spacing, top", demand: i.heelBars.spacing, capacity: topF.sMax, unit: "in", ref: "ACI 318-19 7.7.2.3" });
  add({ id: "asd-base-shear", name: "Base slab shear (at the stem faces)", demand: Vbase, capacity: baseV.phiVc, unit: "kip/ft", ref: "ACI 318-19 22.5.5.1(c), 13.2.6.2" });

  // Shrinkage and temperature steel, the bars at both faces together (ACI 24.4.3.2).
  const st = (bars: Bars, hIn: number) => ({ provided: (2 * BARS[bars.bar].area * 12) / bars.spacing, required: Math.max((0.0018 * 60) / i.fy, 0.0014) * 12 * hIn });
  const stemST = st(i.stemTemp, i.Tt);
  const baseST = st(i.toeTemp, i.D);
  add({ id: "asd-stem-st", name: "Stem shrinkage and temperature steel (both faces)", demand: stemST.required, capacity: stemST.provided, unit: "in²/ft", ref: "ACI 318-19 24.4.3.2" });
  add({ id: "asd-foot-st", name: "Base slab shrinkage and temperature steel (both faces)", demand: baseST.required, capacity: baseST.provided, unit: "in²/ft", ref: "ACI 318-19 24.4.3.2" });

  return {
    ok: checks.every((c) => c.ok),
    checks,
    mu,
    KaEff,
    geometry: { t, L, P, Bu, hs, hFill, H, D },
    loads: { W, VD, Pa, EHV, EHH, Ps, PsH, PsV },
    cases,
    eMax,
    stem: { k, s, a: propped ? a : null, aAuto, prop: stem, Mout, Min, Vu, Mc, flex: stemF, inner: innerF, shear: stemV, ldh, hookRoom },
    prop,
    base: { cases: baseCases, Mbot, Mtop, V: Vbase, bot: botF, top: topF, shear: baseV },
    temp: { stem: stemST, base: baseST },
  };
}

export type CipAsdUResult = ReturnType<typeof designCipAsdU>;
