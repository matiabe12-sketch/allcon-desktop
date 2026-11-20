import { BARS, DesignError, flexure, type Bars, type Check } from "./cip";
import { development } from "../stm/anchorage";
import { hookDimensions } from "../stm/detailing";

// A wingwall cantilevered off an abutment, AASHTO LRFD: earth pressure (at rest by default, AASHTO
// 3.11.5.2) and live load surcharge on the retained face, down to a line from the wall's full
// height at the abutment to the end height at its tip (the buried part below that is neglected);
// the moments and thrust at the abutment face (Section A), where the horizontal bars are
// designed, with their hooked development into the abutment; the front face's horizontal bars
// (developed straight into the abutment) and the vertical bars each face as shrinkage and
// temperature steel; the wall's own weight carried in its plane as a cantilever beam; and the
// forces it hands the abutment (Section B). Kip and foot; bars and covers in inches.

export type WingwallInputs = {
  H: number; // ft, wall height (and earth pressure depth) at the abutment face
  h: number; // ft, earth pressure depth at the wingwall's tip
  L: number; // ft, length from the abutment face
  t: number; // in, wall thickness
  A: number; // ft, abutment width (square to it)
  skew: number; // deg
  gammaS: number; // kcf
  phi: number; // deg
  atRest: boolean; // k0 = 1 − sin φ (else k as entered)
  k: number;
  heq: number; // ft, live load surcharge height (AASHTO 3.11.6.4)
  gammaC: number; // kcf
  gDC: number;
  gEH: number; // at rest: 1.35 (Table 3.4.1-2)
  gLS: number;
  fc: number; // ksi
  fy: number; // ksi
  bars: Bars; // horizontal bars, retained face
  frontBars?: Bars; // horizontal bars, front face (#4 @ 12 in typically)
  vertBars?: Bars; // vertical bars, each face (#4 @ 12 in typically)
  /** Before the front face's and the vertical bars were entered apart: both of them. Read only to fill those in. */
  otherBars?: Bars;
  /** Epoxy-coated bars (CDOT BDM 5.4.5 coats a wingwall's bars), the default; false for plain bars. */
  epoxy?: boolean;
  cover: number; // in
  exposure: 1 | 2;
  /** Corner bars: L-bars round the inside corner, one leg along the abutment's back face, the other lapped with the retained face's bars in the wingwall. Default: the retained face's bar and spacing. */
  cornerBars?: Bars;
  /** The vertical joint between the wingwall and the abutment: a construction joint roughened to 0.25 in (the default), or cast monolithically. */
  joint?: "construction" | "monolithic";
};

/** The defaults: a 10 ft wingwall, 20 ft long, off an abutment skewed 30°. */
export const WINGWALL_DEFAULTS: WingwallInputs = {
  H: 10,
  h: 3,
  L: 20,
  t: 12,
  A: 3,
  skew: 30,
  gammaS: 0.13,
  phi: 34,
  atRest: true,
  k: 0.3,
  heq: 2,
  gammaC: 0.15,
  gDC: 1.25,
  gEH: 1.35,
  gLS: 1.75,
  fc: 4,
  fy: 60,
  bars: { bar: 8, spacing: 6 },
  frontBars: { bar: 4, spacing: 12 },
  vertBars: { bar: 4, spacing: 12 },
  epoxy: true,
  cover: 2,
  exposure: 2,
};

/** The front face's horizontal bars and the vertical bars, from the older single "other bars" when that's all there is. */
export function wingwallBarSets(i: Pick<WingwallInputs, "frontBars" | "vertBars" | "otherBars">) {
  const other = i.otherBars ?? { bar: 4, spacing: 12 };
  return { front: i.frontBars ?? other, vert: i.vertBars ?? other };
}

/** Thrust, and its moments about the abutment face (A) and the top of the wall (C), of pressure
 * W (z + S) over the face from z = 0 down to a depth running from H at the abutment to h at L. */
export function pressureResultants(W: number, H: number, h: number, L: number, S: number) {
  return {
    P: ((W * L) / 6) * (H ** 2 + (h + H) * (h + 3 * S)),
    MA: ((W * L ** 2) / 24) * (3 * h ** 2 + (H + 4 * S) * (H + 2 * h)),
    MC: ((W * L) / 12) * (2 * S * h * H + (H ** 2 + h ** 2) * (H + h + 2 * S)),
  };
}

export function designWingwall(i: WingwallInputs) {
  if (i.H <= 0 || i.L <= 0 || i.t <= 0) throw new DesignError("The wingwall needs a height, a length and a thickness.");
  if (i.h < 0 || i.h > i.H) throw new DesignError("The end height must be between 0 and the height at the abutment.");
  if (!(i.A * 12 > i.cover) || !(Math.abs(i.skew) < 90)) throw new DesignError("The abutment must be wider than the cover for the bars to run into it, and skewed less than 90°.");
  const checks: Check[] = [];
  const add = (c: Omit<Check, "ok"> & { ok?: boolean }) => checks.push({ ...c, ok: c.ok ?? c.demand <= c.capacity });

  // --- earth pressure and surcharge -------------------------------------------------------------
  const k = i.atRest ? 1 - Math.sin((i.phi * Math.PI) / 180) : i.k; // AASHTO Eq. 3.11.5.2-1
  const W = k * i.gammaS;
  const earth = pressureResultants(W, i.H, i.h, i.L, 0);
  const all = pressureResultants(W, i.H, i.h, i.L, i.heq);
  const surcharge = { P: all.P - earth.P, MA: all.MA - earth.MA, MC: all.MC - earth.MC };
  const factored = (key: "P" | "MA" | "MC") => i.gEH * earth[key] + i.gLS * surcharge[key];
  const service = { P: all.P, MA: all.MA, MC: all.MC, x: all.MA / all.P, y: all.MC / all.P };
  const strength = { P: factored("P"), MA: factored("MA"), MC: factored("MC"), x: factored("MA") / factored("P"), y: factored("MC") / factored("P") };

  // --- self weight ------------------------------------------------------------------------------
  const V = (i.t / 12) * i.H * i.L * i.gammaC;
  const wall = { Vs: V, Vu: i.gDC * V, Ms: (V * i.L) / 2, Mu: (i.gDC * V * i.L) / 2 };

  // --- Section A: the horizontal bars, per foot of wall height -------------------------------------
  const Mu = strength.MA / i.H;
  const Ms = service.MA / i.H;
  const Vu = strength.P / i.H;
  const beta1 = Math.min(0.85, Math.max(0.65, 0.85 - (i.fc - 4) * 0.05));
  const Ec = 120000 * 0.15 ** 2 * i.fc ** 0.33; // AASHTO Eq. 5.4.2.4-1
  const flex = flexure({ Mu, Ms, h: i.t, cover: i.cover, bars: i.bars, fc: i.fc, fy: i.fy, Es: 29000, phiF: 0.9, exposure: i.exposure, n: 29000 / Ec, beta1 });
  const dv = Math.max(flex.de - flex.a / 2, 0.9 * flex.de, 0.72 * i.t);
  const VR = 0.9 * 0.0316 * 2 * Math.sqrt(i.fc) * 12 * dv; // β = 2 (5.7.3.4.1)
  add({ id: "a-flexure", name: "Horizontal bars, flexure", demand: Mu, capacity: flex.MR, unit: "kip·ft/ft", ref: "AASHTO 5.6.3.2" });
  add({ id: "a-min", name: "Horizontal bars, minimum reinforcement", demand: flex.minRequired, capacity: flex.MR, unit: "kip·ft/ft", ref: "AASHTO 5.6.3.3" });
  add({ id: "a-crack", name: "Horizontal bars, crack control (spacing)", demand: i.bars.spacing, capacity: flex.sMax, unit: "in", ref: "AASHTO 5.6.7" });
  add({ id: "a-shear", name: "Shear at the abutment face", demand: Vu, capacity: VR, unit: "kip/ft", ref: "AASHTO 5.7.3.3 (β = 2)" });

  // --- the bars into the abutment -----------------------------------------------------------------
  // Both faces' horizontal bars run along the wall through the abutment to its far face less the cover: the
  // abutment's width along the skew, as Section B takes it. The retained face's bars end in a standard 90° hook (5.10.8.2.4), the
  // front face's straight (5.10.8.2.1). Full yield is developed (no excess reinforcement credit); the top bars have
  // more than 12 in of fresh concrete cast below them.
  const { front, vert } = wingwallBarSets(i);
  const coating = i.epoxy === false ? "uncoated" : "epoxy";
  const Askew = i.A / Math.cos((i.skew * Math.PI) / 180);
  const available = Askew * 12 - i.cover;
  const devOf = (b: Bars, kind: "hook" | "straight") =>
    development({ barSize: b.bar, fy: i.fy, fc: i.fc, clearCover: i.cover, clearSpacing: Math.max(0.1, b.spacing - BARS[b.bar].dia), horizontal: true, concreteBelow: i.H * 12, coating, kind, ...(kind === "hook" ? { hookAngle: 90 as const } : {}) });
  const hook = devOf(i.bars, "hook");
  const straight = devOf(front, "straight");
  const hookInside = hookDimensions(i.bars.bar, 90, coating, "longitudinal", i.fy).inside;
  const coated = coating === "epoxy" ? "epoxy coated" : "uncoated";
  add({ id: "dev-retained", name: "Horizontal bars, retained face: hooked development into the abutment", demand: hook.required, capacity: available, unit: "in", ref: "AASHTO 5.10.8.2.4", note: `standard 90° hook, ${coated}` });
  add({ id: "dev-front", name: "Horizontal bars, front face: straight development into the abutment", demand: straight.required, capacity: available, unit: "in", ref: "AASHTO 5.10.8.2.1", note: coated });

  // --- shrinkage and temperature steel (5.10.6) ---------------------------------------------------
  // Each face each way: As ≥ 1.30 b h / (2 (b + h) fy), 0.11 to 0.60 in²/ft; spacing at most 12 in (walls over 18 in
  // thick) or 3 h and 18 in. b is the wall's least width along the bars (its height at the tip), h its thickness. The
  // front face's horizontal bars and the vertical bars each face carry no design moment: these are their checks.
  const bT = Math.max(1, Math.min(i.h, i.H)) * 12;
  const AsTemp = Math.min(0.6, Math.max(0.11, (1.3 * bT * i.t) / (2 * (bT + i.t) * i.fy)));
  const sTempMax = i.t > 18 ? 12 : Math.min(3 * i.t, 18);
  const asOf = (b: Bars) => (BARS[b.bar].area * 12) / b.spacing;
  const called = (b: Bars) => `#${b.bar} @ ${b.spacing} in`;
  add({ id: "temp-retained", name: "Shrinkage and temperature steel, horizontal bars, retained face", demand: AsTemp, capacity: asOf(i.bars), unit: "in²/ft", ref: "AASHTO 5.10.6", note: called(i.bars) });
  add({ id: "temp-front", name: "Shrinkage and temperature steel, horizontal bars, front face", demand: AsTemp, capacity: asOf(front), unit: "in²/ft", ref: "AASHTO 5.10.6", note: called(front) });
  add({ id: "temp-vert", name: "Shrinkage and temperature steel, vertical bars, each face", demand: AsTemp, capacity: asOf(vert), unit: "in²/ft", ref: "AASHTO 5.10.6", note: called(vert) });
  add({ id: "temp-spacing", name: "Shrinkage and temperature steel, spacing (the widest of the bars)", demand: Math.max(i.bars.spacing, front.spacing, vert.spacing), capacity: sTempMax, unit: "in", ref: "AASHTO 5.10.6" });

  // --- the wall's own weight, carried in its plane --------------------------------------------------
  // The wall is a cantilever beam off the abutment as deep as its height: its weight bends it with the top in tension
  // at the abutment face. Its tension steel is the horizontal bars in the top quarter of the wall (their centroid H/8
  // below the top): the front face's at their full area, the retained face's at the share the earth pressure moment
  // leaves them (1 − Mu/Mr, a straight-line interaction).
  const share = Math.max(0, 1 - Mu / flex.MR);
  const AsW = (i.H / 4) * (asOf(front) + asOf(i.bars) * share);
  const dW = (7 / 8) * i.H * 12;
  const aW = (AsW * i.fy) / (0.85 * i.fc * i.t);
  const MrW = (0.9 * AsW * i.fy * (dW - aW / 2)) / 12;
  const dvW = Math.max(dW - aW / 2, 0.9 * dW, 0.72 * i.H * 12);
  const VrW = 0.9 * 0.0316 * 2 * Math.sqrt(i.fc) * i.t * dvW;
  add({ id: "w-flexure", name: "Self weight in the wall's plane, flexure at the abutment face", demand: wall.Mu, capacity: MrW, unit: "kip·ft", ref: "AASHTO 5.6.3.2" });
  add({ id: "w-shear", name: "Self weight in the wall's plane, shear at the abutment face", demand: wall.Vu, capacity: VrW, unit: "kip", ref: "AASHTO 5.7.3.3 (β = 2)" });

  // --- the connection to the abutment ---------------------------------------------------------------
  // The wingwall's root moment turns the corner: the tension in its retained face carries on into the abutment's back
  // face. Corner bars (L-bars round the inside corner) take it there, over the abutment's thickness, per foot of height
  // (5.6.3.2, crack control 5.6.7); the abutment's own horizontal bars are not counted. One leg runs along the abutment
  // past the wingwall's inside face by its development length (5.10.8.2.1), the other laps the retained face's bars in
  // the wingwall by a Class B splice, 1.3 ℓd (5.10.8.4.3a).
  // The vertical joint carries the earth's thrust and the wall's weight together by shear friction (5.7.4.3): only the
  // front face's bars clamp it (the retained face's are already in flexural tension), with no axial load across it.
  const abutBars = i.cornerBars ?? i.bars;
  const hAb = i.A * 12;
  const abFlex = flexure({ Mu, Ms, h: hAb, cover: i.cover, bars: abutBars, fc: i.fc, fy: i.fy, Es: 29000, phiF: 0.9, exposure: i.exposure, n: 29000 / Ec, beta1 });
  add({ id: "conn-abut-flex", name: `Corner bars #${abutBars.bar} @ ${abutBars.spacing} in, the abutment's back face: the wingwall's moment round the corner`, demand: Mu, capacity: abFlex.MR, unit: "kip·ft/ft", ref: "AASHTO 5.6.3.2" });
  add({ id: "conn-abut-crack", name: "Corner bars: crack control (spacing)", demand: abutBars.spacing, capacity: abFlex.sMax, unit: "in", ref: "AASHTO 5.6.7" });
  const abDev = development({ barSize: abutBars.bar, fy: i.fy, fc: i.fc, clearCover: i.cover, clearSpacing: Math.max(0.1, abutBars.spacing - BARS[abutBars.bar].dia), horizontal: true, concreteBelow: i.H * 12, coating, kind: "straight" });
  const devW = development({ barSize: Math.max(abutBars.bar, i.bars.bar), fy: i.fy, fc: i.fc, clearCover: i.cover, clearSpacing: Math.max(0.1, Math.min(abutBars.spacing, i.bars.spacing) - BARS[Math.max(abutBars.bar, i.bars.bar)].dia), horizontal: true, concreteBelow: i.H * 12, coating, kind: "straight" });
  const lap = 1.3 * devW.required; // in, Class B (5.10.8.4.3a), the larger bar's ℓd
  const joint = i.joint ?? "construction";
  const sf = joint === "monolithic" ? { c: 0.4, mu: 1.4, K1: 0.25, K2: 1.5 } : { c: 0.24, mu: 1.0, K1: 0.25, K2: 1.5 }; // ksi, Table 5.7.4.4
  const Acv = i.t * i.H * 12; // in², the joint's area
  const Avf = asOf(front) * i.H; // in², the front face's bars crossing it
  const Vui = Math.hypot(strength.P, wall.Vu);
  const Vni = Math.min(sf.c * Acv + sf.mu * Avf * i.fy, sf.K1 * i.fc * Acv, sf.K2 * Acv);
  add({ id: "conn-friction", name: `Shear friction across the joint with the abutment (${joint === "monolithic" ? "cast monolithically" : "construction joint, roughened 0.25 in"}): the thrust and the weight together`, demand: Vui, capacity: 0.9 * Vni, unit: "kip", ref: "AASHTO 5.7.4.3, 5.7.4.4" });
  const AvfMin = (0.05 * Acv) / i.fy;
  const waived = Vui / Acv < 0.21;
  add({ id: "conn-friction-min", name: `Shear friction: minimum steel across the joint${waived ? " (may be waived: vui < 0.210 ksi)" : ""}`, demand: AvfMin, capacity: Avf, unit: "in²", ref: "AASHTO 5.7.4.2", ...(waived ? { ok: true } : {}) });

  // --- Section B: what the abutment takes, about its centroidal axes --------------------------------
  const sectionB = (r: typeof service, Vw: number) => ({ P: r.P, V: Vw, ex: r.x + Askew / 2, ez: i.H / 2 - r.y, My: r.P * (r.x + Askew / 2), Mx: r.P * (i.H / 2 - r.y), Tz: Vw * (i.L / 2 + Askew / 2) });

  return {
    ok: checks.every((c) => c.ok),
    checks,
    soil: { k, W },
    earth,
    surcharge,
    service,
    strength,
    wall,
    sectionA: { Mu, Ms, Vu, flex, dv, VR, bar: BARS[i.bars.bar] },
    anchorage: { coating, available, hook, hookInside, straight },
    connection: { abutBars, hAb, flex: abFlex, dev: abDev, lap, legAb: Math.ceil(abDev.required + i.cover), legWing: Math.ceil(hAb / Math.cos((i.skew * Math.PI) / 180) - i.cover + lap), joint, sf, Acv, Avf, Vui, Vni, AvfMin, waived },
    temperature: { bT, AsTemp, sTempMax, front, vert },
    inPlane: { share, AsW, dW, aW, MrW, dvW, VrW },
    Askew,
    sectionB: { service: sectionB(service, wall.Vs), strength: sectionB(strength, wall.Vu) },
  };
}

export type WingwallResult = ReturnType<typeof designWingwall>;
