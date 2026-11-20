import { DesignError, type Check } from "../walls/cip";

// A cantilever finger plate expansion joint, AASHTO LRFD 10th Edition: the movement along the bridge (the fingers run
// parallel to its axis, 14.5.2.2) from temperature (3.12.2, with γTU) and creep and shrinkage; at the strength
// movement the fingers' overlap (1.5 in at least) and the gap between them (2.0 in where the opening passes 8.0 in,
// 3.0 in otherwise) (14.5.3.2); the fingers and the plate as cantilevers under the wheel at the strength limit state
// (14.5.3.4) and for infinite fatigue life (6.6.1.2); the plate's high-strength bolts (14.5.3.7, 6.13.2.10); the opening
// to set at each installation temperature (14.5.5.1). CDOT allows finger joints only to replace existing ones, in
// sections of 6 ft or less, tapered, with a trough under them (BDM 14.4.6). Inches, feet, kip and °F.

export type FatigueCategory = "A" | "B" | "B'" | "C" | "C'" | "D" | "E" | "E'";
/** Constant-amplitude fatigue thresholds, ksi (AASHTO Table 6.6.1.2.5-3). */
export const FATIGUE_THRESHOLD: Record<FatigueCategory, number> = { A: 24, B: 16, "B'": 12, C: 10, "C'": 12, D: 7, E: 4.5, "E'": 2.6 };

export type FingerJointInputs = {
  L: number; // ft, the length to the joint from the neutral point
  skew: number; // deg, the joint's (the fingers stay parallel to the bridge)
  alpha: number; // per °F
  creepShrink: number;
  Tmax: number; // °F
  Tmin: number;
  gammaTU: number;
  /** The fingers: plate thickness at their root, width, clear gap to the next (the other plate's) finger, length. */
  t: number; // in
  b: number; // in
  g: number; // in
  Lf: number; // in, root to tip
  rootOffset: number; // in, the support's edge (armor nose) to the fingers' root
  tipClear: number; // in, the least gap from a finger's tip to the other plate's root, hottest (14.5.3.2: 1.0 in on steel)
  transverse: number; // in, the movement across the bridge each way at the joint (for the side gaps)
  Fy: number; // ksi
  rootCategory: FatigueCategory; // the fingers' root (A: flame-cut from the plate, edges to 6.6.1.2.3 condition 1.2)
  bolt: { d: number; spacing: number; e: number; Fub: number }; // in, in along the joint, in behind the support edge, ksi
  sectionLength: number; // ft, each fabricated section (CDOT: 6 ft or less)
  width: number; // ft, the deck's width square to the bridge
  trough: boolean; // an elastomeric or metal trough under the fingers
  replacement: boolean; // replacing an existing finger joint (CDOT allows no other)
  snow: boolean;
  Ti: number;
  tableFrom: number;
  tableTo: number;
  tableStep: number;
};

/** The defaults: 400 ft of steel girders to the joint, 3 in plates with 2½ in fingers. */
export const FINGER_DEFAULTS: FingerJointInputs = {
  L: 400,
  skew: 0,
  alpha: 6.5e-6,
  creepShrink: 0,
  Tmax: 120,
  Tmin: -20,
  gammaTU: 1.2,
  t: 3,
  b: 2.5,
  g: 1.5,
  Lf: 9,
  rootOffset: 2,
  tipClear: 1,
  transverse: 0.25,
  Fy: 50,
  rootCategory: "A",
  bolt: { d: 1, spacing: 9, e: 6, Fub: 120 },
  sectionLength: 6,
  width: 44,
  trough: true,
  replacement: true,
  snow: true,
  Ti: 60,
  tableFrom: -20,
  tableTo: 120,
  tableStep: 10,
};

/** The wheel: the design truck's 16 kip wheel (3.6.1.2.2) on its 20 × 10 in tire (3.6.1.2.5), IM 75% for deck joints (Table 3.6.2.1-1). */
export const WHEEL = { P: 16, width: 20, length: 10, IM: 0.75, gammaLL: 1.75, m: 1.2, gammaFatigue: 1.75 };

const circle = (d: number) => (Math.PI * d * d) / 4;
/** The joint's movement along the bridge (in) for a temperature change and strain. */
const mover = (i: Pick<FingerJointInputs, "L" | "gammaTU" | "alpha">) => (dT: number, strain: number) => i.L * 12 * (i.gammaTU * dT * i.alpha + strain);

/** The cantilever's actions: the wheel on one plate's fingers in the tire's width, its middle as far out as the tire allows. */
function cantilever(i: FingerJointInputs, P: number) {
  const pitch = 2 * (i.b + i.g); // in, one plate's fingers' spacing (the other plate's between)
  const onFinger = Math.min(1, i.Lf / WHEEL.length); // the tire's length on the finger
  const perFinger = (P * pitch) / WHEEL.width; // kip, the tire's load spread across its width
  const load = perFinger * onFinger;
  const arm = onFinger < 1 ? i.Lf / 2 : i.Lf - WHEEL.length / 2; // in, from the root
  return { pitch, perFinger, load, arm, Mroot: load * arm, Medge: load * (arm + i.rootOffset), Vroot: load };
}

export function designFinger(i: FingerJointInputs) {
  if (i.L <= 0) throw new DesignError("The joint needs a length to it from the bridge's neutral point.");
  if (!(i.t > 0 && i.b > 0 && i.Lf > 0)) throw new DesignError("Give the fingers' thickness, width and length.");
  const checks: Check[] = [];
  const add = (c: Omit<Check, "ok"> & { ok?: boolean }) => checks.push({ ...c, ok: c.ok ?? c.demand <= c.capacity + 1e-9 });
  const move = mover(i);
  const total = move(i.Tmax - i.Tmin, i.creepShrink);

  /** The root-to-root opening D at an installation temperature: midway between the overlap's limit (cold) and the tips' clearance (hot). */
  const Dcold = 2 * i.Lf - 1.5; // in, the widest D with 1.5 in of overlap
  const Dhot = i.Lf + i.tipClear; // in, the narrowest D with the tips clear
  const at = (Ti: number) => {
    const cold = move(Ti - i.Tmin, i.creepShrink);
    const hot = move(i.Tmax - Ti, -i.creepShrink);
    const Dmax = Dcold - cold;
    const Dmin = Dhot + hot;
    const D = (Dmax + Dmin) / 2;
    const status = Dmin > Dmax ? "too small" : Ti < i.Tmin || Ti > i.Tmax ? "outside" : "ok";
    return { Ti, cold, hot, Dmax, Dmin, D, status };
  };
  const design = at(i.Ti);
  const D = { cold: design.D + design.cold, hot: design.D - design.hot };
  add({ id: "range", name: "Movement within the fingers' range (overlap 1.5 in cold, tips clear hot)", demand: total, capacity: Dcold - Dhot, unit: "in", ref: "AASHTO 14.5.3.2" });
  add({ id: "fits", name: `At ${i.Ti}°F: the openings fit (Dmin ≤ Dmax)`, demand: design.Dmin, capacity: design.Dmax, unit: "in", ref: "AASHTO 14.5.5.1" });
  add({ id: "overlap", name: "Fingers' overlap at the coldest", demand: 1.5, capacity: 2 * i.Lf - D.cold, unit: "in", ref: "AASHTO 14.5.3.2" });
  add({ id: "tip", name: "A finger's tip to the other plate's root at the hottest", demand: i.tipClear, capacity: D.hot - i.Lf, unit: "in", ref: "AASHTO 14.5.3.2 (1.0 in on steel)" });
  const gapLimit = D.cold > 8 ? 2 : 3;
  add({ id: "finger-gap", name: `Gap between fingers (the opening ${D.cold > 8 ? "passes" : "is within"} 8.0 in)`, demand: i.g, capacity: gapLimit, unit: "in", ref: "AASHTO 14.5.3.2" });
  add({ id: "side", name: "The side gaps take the movement across the bridge (no binding)", demand: i.transverse, capacity: i.g, unit: "in", ref: "AASHTO 14.5.2.2" });

  // Strength I: the factored wheel with IM and the multiple presence factor for one lane (3.6.1.1.2).
  const Pu = WHEEL.P * (1 + WHEEL.IM) * WHEEL.gammaLL * WHEEL.m;
  const su = cantilever(i, Pu);
  const MpFinger = (i.Fy * i.b * i.t * i.t) / 4; // kip·in, plastic, φf 1.0 (6.5.4.2)
  const MpPlate = (i.Fy * su.pitch * i.t * i.t) / 4; // the solid plate over one pitch at the support's edge
  add({ id: "finger-moment", name: "Finger at its root: plastic moment (φ 1.00)", demand: su.Mroot, capacity: MpFinger, unit: "kip·in", ref: "AASHTO 14.5.3.4, 6.12.2.2.7" });
  add({ id: "finger-shear", name: "Finger at its root: shear (φv 1.00, 0.58 Fy)", demand: su.Vroot, capacity: 0.58 * i.Fy * i.b * i.t, unit: "kip", ref: "AASHTO 6.10.9.2" });
  add({ id: "plate-moment", name: "Plate at the support's edge, over one pitch", demand: su.Medge, capacity: MpPlate, unit: "kip·in", ref: "AASHTO 14.5.3.4" });

  // Fatigue I: the truck's 16 kip wheel with IM, γ 1.75, for infinite life (Δf ≤ ΔFTH).
  const Pf = WHEEL.P * (1 + WHEEL.IM) * WHEEL.gammaFatigue;
  const fa = cantilever(i, Pf);
  const S = (i.b * i.t * i.t) / 6;
  const dfRoot = fa.Mroot / S;
  add({ id: "finger-fatigue", name: `Finger's root: stress range, Category ${i.rootCategory} (infinite life)`, demand: dfRoot, capacity: FATIGUE_THRESHOLD[i.rootCategory], unit: "ksi", ref: "AASHTO 6.6.1.2, Table 6.6.1.2.5-3" });

  // The bolts: the plate pivots on the support's edge; the bolts e behind it hold the wheel's moment there, the
  // tire's width spread at 45° through the plate to the bolt line.
  const b = i.bolt;
  const Ab = circle(b.d);
  const shared = Math.max(1, (WHEEL.width + 2 * b.e) / b.spacing);
  const wheelEdge = (P: number) => {
    const c = cantilever(i, P);
    return (c.load * (WHEEL.width / c.pitch) * (c.arm + i.rootOffset)) / Math.max(0.5, b.e) / shared; // kip per bolt
  };
  const Tu = wheelEdge(Pu);
  const Rt = 0.8 * 0.76 * Ab * b.Fub; // 6.13.2.10.2, φt 0.80
  add({ id: "bolt-tension", name: `Bolts: ${b.d} in at ${b.spacing} in, ${b.e} in behind the edge, in tension`, demand: Tu, capacity: Rt, unit: "kip", ref: "AASHTO 14.5.3.7, 6.13.2.10.2" });
  const dT = wheelEdge(Pf) / (0.75 * Ab);
  add({ id: "bolt-fatigue", name: "Bolts in axial tension: stress range on the tensile stress area (pretensioned)", demand: dT, capacity: 31, unit: "ksi", ref: "AASHTO 6.13.2.10.3, Table 6.6.1.2.5-3" });

  // CDOT's rules, and the trough and sections.
  add({ id: "trough", name: "A trough under the fingers carries the water off the substructure", demand: i.trough ? 0 : 1, capacity: 0, unit: "", ref: "CDOT BDM 14.4.6, AASHTO 14.5.6.1" });
  add({ id: "section", name: "Fabricated sections short enough for maintenance", demand: i.sectionLength, capacity: 6, unit: "ft", ref: "CDOT BDM 14.4.6" });
  if (!i.replacement) add({ id: "replacement", name: "CDOT allows finger joints only to replace existing ones: use a modular joint", demand: 1, capacity: 0, unit: "", ref: "CDOT BDM 14.4.6", ok: false, advisory: true });
  if (i.snow && Math.abs(i.skew) > 20) add({ id: "snowplow", name: "Armor and anchors for the snowplow load, 0.12 kip/in over 10 ft (skew over 20°)", demand: Math.abs(i.skew), capacity: 20, unit: "deg", ref: "AASHTO 14.5.1.2, 14.5.3.6", ok: false, advisory: true });

  const table = [];
  for (let T = i.tableFrom; T <= i.tableTo + 1e-9 && table.length < 60; T += Math.max(i.tableStep, 1)) table.push(at(T));
  const length = i.width / Math.max(0.05, Math.cos((i.skew * Math.PI) / 180));
  return { ok: checks.every((c) => c.ok || c.advisory), checks, total, Dcold, Dhot, design, D, gapLimit, Pu, Pf, strength: su, fatigue: fa, MpFinger, MpPlate, S, dfRoot, Ab, shared, Tu, Rt, dT, length, table };
}

export type FingerResult = ReturnType<typeof designFinger>;

/** The shortest fingers for the movement and the thinnest plate for the strength and fatigue, rounded up (⅛ in, ¼ in). */
export function sizeFinger(i: FingerJointInputs): FingerJointInputs {
  const up = (v: number, s: number) => Math.ceil(v / s - 1e-9) * s;
  const total = mover(i)(i.Tmax - i.Tmin, i.creepShrink);
  // D range = Lf − 1.5 − tipClear must hold the movement, with ½ in to spare for setting.
  const Lf = up(total + 1.5 + i.tipClear + 0.5, 0.5);
  let t = 1;
  for (; t < 8; t += 0.25) {
    const r = designFinger({ ...i, Lf, t });
    if (r.checks.filter((c) => /^(finger|plate)-/.test(c.id)).every((c) => c.ok)) break;
  }
  return { ...i, Lf, t };
}
