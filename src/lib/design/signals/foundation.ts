import { BARS, DesignError, type Check } from "../walls/cip";
import type { TakeoffSettings } from "../takeoff/types";
import { designShaft, Kz, roundCd, type ShaftGroup, type ShaftPart } from "../signs/cantilever";
import { cdotArmLoading, signalStandard, type Attachment, type SignalStandard, type Tube } from "./standards";

// The drilled shaft (caisson) under one of CDOT's standard traffic signal supports (S-614-40, S-614-40A, S-614-44),
// for the site's soil. The designer picks the standard pole and its arms; the tool works out what the standard puts on
// its foundation and checks the caisson:
// - loads (AASHTO LRFD Specifications for Structural Supports for Highway Signs, Luminaires, and Traffic Signals,
//   LRFD-LTS-1, 2015): the tubes' and attachments' dead load (3.5) and wind (3.8, P = 0.00256 Kz Kd G V² Cd), with the
//   wind turned all the way round the pole (5° steps) so a second arm at any angle is caught, members by the
//   crossflow principle (the wind's component normal to each tube), signs by their faces, signal heads and luminaires
//   by their full area from any direction; the load groups of Table 3.4-1 at the shaft's top;
// - embedment by Broms (LRFD-LTS 13.6.1.1, Eqs. C13.6.1.1-1 to -7), for cohesive or cohesionless soil, and the
//   largest moment in the shaft that goes with it;
// - torsion carried by the soil's side resistance round the shaft (α-method in clay, β-method in sand, AASHTO LRFD
//   10.8.3.5.1b and 10.8.3.5.2b), as a moment arm of D/2: by default as CDOT's standard caissons need it (full
//   cohesion in clay, O'Neill and Reese's β in sand), or by AASHTO's current side resistance;
// - the shaft as a reinforced concrete member (13.6.2, AASHTO LRFD Section 5): axial load and bending, shear, and
//   torsion with shear (5.7.2.1, 5.7.3.6) — signs/cantilever.ts designShaft for the first, here for torsion;
// - optionally the standard's own basis (its Design Data: the 2001 Standard Specifications' wind, 100 or 90 mph, and
//   soil factors of safety of 3.0 in flexure, 1.5 or 1.25 in torsion), as an advisory comparison.
// kip, ft, in, ksi; soil in psf and pcf as the sheets give them.

export type SoilKind = "cohesive" | "cohesionless";
export type TorsionMethod = "cdot" | "aashto";

export type SignalInputs = {
  standard: string; // SIGNAL_STANDARDS id
  arms: 1 | 2; // arms installed (two only on S-614-40's double-arm poles)
  secondAngle: number; // deg, between the arms (S-614-40: 60° to 120°)
  luminaire: boolean;
  luminaireArm: 10 | 15; // ft
  camera: boolean;
  poleSignal: boolean; // a signal head on the pole
  armHeight: number; // ft, base plate to the arm's centerline
  attachments: Attachment[] | null; // on each arm; null: the standard's worst-case loading (sheet 2)
  V: number; // mph, basic wind speed for the MRI (LTS 3.8.2)
  Kd: number; // Table 3.8.5-1
  G: number; // 3.8.6
  Cv: number; // 3.8.3
  // The caisson
  shaftD: number; // in
  shaftLength: number; // ft, embedded
  bars: number;
  bar: number;
  spiral: number; // bar size
  pitch: number; // in
  cover: number; // in, clear to the spiral
  fc: number; // ksi
  fy: number; // ksi
  phiM: number;
  // The soil
  soil: SoilKind;
  c: number; // psf, undrained shear strength (cohesive)
  phi: number; // deg (cohesionless)
  gamma: number; // pcf, effective unit weight
  N60: number; // blows/ft at the tip (cohesionless: qp = 1.2 N60 ksf, AASHTO 10.8.3.5.2c)
  phiLateral: number; // Broms' soil resistance, extreme event (AASHTO 10.5.5.3.3)
  phiTorsion: number; // side resistance in torsion (as uplift, 10.5.5.3.3)
  torsionMethod: TorsionMethod; // the soil's side resistance in torsion: as CDOT's standards (default) or AASHTO's current
  cdotBasis: boolean; // also check on the standard's own basis (advisory)
  takeoff?: TakeoffSettings;
};

/** The defaults: CDOT's S-614-40A single arm for 30 and 35 ft arms, with its luminaire, on its 36 in caisson in the
 * sheet's medium stiff clay. */
export const SIGNAL_DEFAULTS: SignalInputs = {
  standard: "40A-35",
  arms: 1,
  secondAngle: 90,
  luminaire: true,
  luminaireArm: 15,
  camera: true,
  poleSignal: true,
  armHeight: 21,
  attachments: null,
  V: 120,
  Kd: 0.85,
  G: 1.14,
  Cv: 1,
  shaftD: 36,
  shaftLength: 18.5,
  bars: 14,
  bar: 9,
  spiral: 4,
  pitch: 6,
  cover: 3,
  fc: 4.5,
  fy: 60,
  phiM: 0.75,
  soil: "cohesive",
  c: 750,
  phi: 30,
  gamma: 110,
  N60: 15,
  phiLateral: 1,
  phiTorsion: 0.8,
  torsionMethod: "cdot",
  cdotBasis: true,
};

/** The caisson the standard calls for, in the inputs' terms (the cohesive depth in clay). */
export function standardCaisson(s: SignalStandard, soil: SoilKind) {
  const c = s.caisson;
  return { shaftD: c.D, shaftLength: soil === "cohesive" ? c.depthCohesive : c.depth, bars: c.bars, bar: c.bar, spiral: c.spiral, pitch: 6 };
}

const STEEL = 0.49; // kcf

type Vec = [number, number, number];
/** A piece of the structure: its weight (kip) at a point, and how the wind loads it. */
type Piece = {
  at: Vec; // ft, from the pole's base
  W: number; // kip
  wind: { kind: "tube"; axis: Vec; d: number; ds: number } | { kind: "plate"; normal: Vec; area: number; Cd: number } | { kind: "any"; area: number; Cd: number };
  part: "pole" | "arm" | "attachment" | "luminaire";
};

const tubeArea = (d: number, t: number) => Math.PI * (d - t) * t; // in²

/** A tapered tube from s0 to s1 (ft along `axis` from `origin`), its diameter `d0` at s0 and `d1` at s1, cut into ~1 ft pieces. */
function tubePieces(origin: Vec, axis: Vec, s0: number, s1: number, d0: number, d1: number, t: number, part: Piece["part"]): Piece[] {
  const n = Math.max(1, Math.ceil(s1 - s0));
  const ds = (s1 - s0) / n;
  return Array.from({ length: n }, (_, k) => {
    const s = s0 + (k + 0.5) * ds;
    const d = d0 + ((d1 - d0) * (s - s0)) / (s1 - s0);
    return { at: [origin[0] + axis[0] * s, origin[1] + axis[1] * s, origin[2] + axis[2] * s] as Vec, W: (tubeArea(d, t) * ds * STEEL) / 144, wind: { kind: "tube" as const, axis, d: d / 12, ds }, part };
  });
}

/** The arm's tubes from the pole out: the base section (trunk at the pole), then the end section to the tip (slip-spliced over the base's end). */
function armTubes(L: number, base: Tube, end: Tube | undefined, dir: Vec, z: number): Piece[] {
  const o: Vec = [0, 0, z];
  if (!end) return tubePieces(o, dir, 0, Math.min(base.length, L), base.trunk, base.tip, base.t, "arm");
  const endStart = Math.max(L - end.length, 0);
  return [...tubePieces(o, dir, 0, Math.min(base.length, endStart + 1.5 * (end.trunk / 12)), base.trunk, base.tip, base.t, "arm"), ...tubePieces(o, dir, endStart, L, end.trunk, end.tip, end.t, "arm")];
}

/** The pole's height above its base plate: the base section and the end section (6 ft without a luminaire), slip-spliced. */
export function poleHeight(s: SignalStandard, luminaire: boolean) {
  if (!s.poleBase || !s.poleEnd) return 0;
  const endLen = luminaire ? s.poleEnd.length : 6;
  return s.poleBase.length + endLen - 1.5 * (s.poleEnd.trunk / 12);
}

/** Everything on the foundation: the pole, the arms with their signal heads and signs, the luminaire arm, camera and the pole's signal head. */
export function signalPieces(i: SignalInputs) {
  const s = signalStandard(i.standard);
  if (s.kind !== "mast-arm" || !s.poleBase || !s.poleEnd || !s.armBase) return { pieces: [] as Piece[], H: 0, arms: [] as Vec[], attachments: [] as Attachment[] };
  const H = poleHeight(s, i.luminaire);
  const splice = 1.5 * (s.poleEnd.trunk / 12);
  const up: Vec = [0, 0, 1];
  const pole = [
    ...tubePieces([0, 0, 0], up, 0, s.poleBase.length, s.poleBase.trunk, s.poleBase.tip, s.poleBase.t, "pole"),
    ...(i.luminaire
      ? tubePieces([0, 0, 0], up, s.poleBase.length - splice, H, s.poleEnd.trunk, s.poleEnd.tip, s.poleEnd.t, "pole")
      : tubePieces([0, 0, 0], up, s.poleBase.length - splice, H, s.poleEnd.trunk, s.poleEnd.trunk - 0.14 * 6, s.poleEnd.t, "pole")),
  ];
  const nArms = s.arms === 2 ? i.arms : 1;
  const angle = (Math.min(120, Math.max(60, i.secondAngle)) * Math.PI) / 180;
  const arms: Vec[] = [[1, 0, 0], ...(nArms === 2 ? [[Math.cos(angle), Math.sin(angle), 0] as Vec] : [])];
  const attachments = i.attachments ?? cdotArmLoading(s.L, s.heads);
  const pieces: Piece[] = [...pole];
  for (const a of arms) {
    pieces.push(...armTubes(s.L, s.armBase, s.armEnd, a, i.armHeight));
    // Signs face the traffic (their normal square to the arm); heads and others from any direction.
    const normal: Vec = [-a[1], a[0], 0];
    for (const t of attachments) {
      const at: Vec = [a[0] * t.at, a[1] * t.at, i.armHeight - 1.5];
      pieces.push({ at, W: t.weight / 1000, wind: t.plate ? { kind: "plate", normal, area: t.area, Cd: t.Cd } : { kind: "any", area: t.area, Cd: t.Cd }, part: "attachment" });
    }
  }
  if (i.luminaire) {
    // The luminaire arm (sheet 3): 0.1793 in wall, 2.796 in at the tip tapering 0.14 in/ft, over the primary arm, its
    // flat head (75 lb, 3.3 ft², Cd 1.2) at the tip and the camera (10 lb, 1.125 ft², Cd 1.2) on it.
    const len = i.luminaireArm;
    pieces.push(...tubePieces([0, 0, H], [1, 0, 0], 0, len, 2.796 + 0.14 * len, 2.796, 0.1793, "luminaire"));
    pieces.push({ at: [len, 0, H + 1], W: 0.075, wind: { kind: "any", area: 3.3, Cd: 1.2 }, part: "luminaire" });
    if (i.camera) pieces.push({ at: [0.8 * len, 0, H + 1], W: 0.01, wind: { kind: "any", area: 1.125, Cd: 1.2 }, part: "luminaire" });
  } else if (i.camera) pieces.push({ at: [0, 0, H], W: 0.01, wind: { kind: "any", area: 1.125, Cd: 1.2 }, part: "luminaire" });
  // The pole's own signal head (100 lb, 17.34 ft²), 10 to 15 ft up.
  if (i.poleSignal) pieces.push({ at: [0, 0, 12.5], W: 0.1, wind: { kind: "any", area: 17.34, Cd: 1.2 }, part: "attachment" });
  return { pieces, H, arms, attachments };
}

/** The wind on every piece for wind blowing along `w` (horizontal unit vector): the forces' resultant, its moment about
 * the base (horizontal vector) and its torsion about the pole's axis. `V` in mph, `Kd`, `G`, `Cv` as LTS 3.8. */
function windOn(pieces: Piece[], w: [number, number], o: { V: number; Kd: number; G: number; Cv: number }) {
  let Fx = 0;
  let Fy = 0;
  let Mx = 0;
  let My = 0;
  let T = 0;
  for (const p of pieces) {
    const q = 0.00256 * Kz(p.at[2]) * o.Kd * o.G * o.V ** 2; // psf without Cd
    let fx = 0;
    let fy = 0;
    if (p.wind.kind === "tube") {
      const a = p.wind.axis;
      const dot = w[0] * a[0] + w[1] * a[1];
      const nx = w[0] - dot * a[0];
      const ny = w[1] - dot * a[1];
      const sn = Math.hypot(nx, ny); // the normal component of the wind's direction
      const F = (q * roundCd(o.Cv * o.V * p.wind.d) * p.wind.d * p.wind.ds * sn) / 1000; // × sn along (nx, ny): sn² normal
      fx = F * nx;
      fy = F * ny;
    } else if (p.wind.kind === "plate") {
      const n = p.wind.normal;
      const c = w[0] * n[0] + w[1] * n[1];
      const F = (q * p.wind.Cd * p.wind.area * c * Math.abs(c)) / 1000;
      fx = F * n[0];
      fy = F * n[1];
    } else {
      const F = (q * p.wind.Cd * p.wind.area) / 1000;
      fx = F * w[0];
      fy = F * w[1];
    }
    Fx += fx;
    Fy += fy;
    Mx += -p.at[2] * fy;
    My += p.at[2] * fx;
    T += p.at[0] * fy - p.at[1] * fx;
  }
  return { Fx, Fy, Mx, My, T };
}

/** The loads at the top of the caisson, the wind turned round the pole: dead load, and for each wind direction the
 * shear, moment (with the dead load's eccentric moment) and torsion; for a pedestal pole, the sheet's service forces. */
export function signalLoads(i: SignalInputs, o: { V: number; Kd: number; G: number; Cv: number }) {
  const s = signalStandard(i.standard);
  if (s.kind === "pedestal" && s.service) {
    // S-614-44 gives the pole's service moment and shear for 90 mph; scaled with V² to the wind used here.
    const k = (o.V / s.service.V0) ** 2 * o.Kd;
    return { W: 0.6, Md: [0, 0] as [number, number], dirs: [{ deg: 0, F: s.service.V * k, M: [0, s.service.M * k] as [number, number], T: 0 }], scaled: k };
  }
  const { pieces } = signalPieces(i);
  const W = pieces.reduce((a, p) => a + p.W, 0);
  const Md: [number, number] = [pieces.reduce((a, p) => a - p.W * p.at[1], 0), pieces.reduce((a, p) => a + p.W * p.at[0], 0)];
  const dirs = Array.from({ length: 72 }, (_, k) => {
    const deg = k * 5;
    const w: [number, number] = [Math.cos((deg * Math.PI) / 180), Math.sin((deg * Math.PI) / 180)];
    const r = windOn(pieces, w, o);
    return { deg, F: Math.hypot(r.Fx, r.Fy), M: [r.Mx, r.My] as [number, number], T: r.T };
  });
  return { W, Md, dirs, scaled: 1 };
}

/** The load groups at the top of the caisson (LTS Table 3.4-1), each the envelope over the wind's directions. */
function groupsOf(L: ReturnType<typeof signalLoads>, list: { name: string; gDC: number; gW: number }[]) {
  return list.map((g) => {
    let M = 0;
    let V = 0;
    let T = 0;
    let deg = 0;
    for (const d of L.dirs) {
      const m = Math.hypot(g.gW * d.M[0] + g.gDC * L.Md[0], g.gW * d.M[1] + g.gDC * L.Md[1]);
      if (m > M) {
        M = m;
        deg = d.deg;
      }
      V = Math.max(V, g.gW * d.F);
      T = Math.max(T, Math.abs(g.gW * d.T));
    }
    return { ...g, P: g.gDC * L.W, M, V, T, deg };
  });
}

/** Broms' embedment for a free-headed shaft (LRFD-LTS C13.6.1.1): the length needed and the largest moment in the shaft.
 * M kip·ft and V kip at the ground line, D ft; cohesive c ksf, cohesionless γ kcf and φ deg. */
export function broms(soil: SoilKind, M: number, V: number, D: number, c: number, gamma: number, phi: number) {
  const H = V > 0 ? M / V : 0;
  if (V <= 0 && M <= 0) return { L: 0, Mu: 0, H, q: 0, Kp: 0, zMax: 0 };
  if (soil === "cohesive") {
    if (!(c > 0)) throw new DesignError("Cohesive soil needs its shear strength.");
    const q = V / (9 * c * D); // Eq. C13.6.1.1-3
    const L = 1.5 * D + q * (1 + Math.sqrt(2 + (4 * H + 6 * D) / q)); // Eq. C13.6.1.1-1
    return { L, Mu: V * (H + 1.5 * D + 0.5 * q), H, q, Kp: 0, zMax: 1.5 * D + q }; // Eq. C13.6.1.1-4
  }
  if (!(gamma > 0 && phi > 0)) throw new DesignError("Cohesionless soil needs its unit weight and friction angle.");
  const Kp = Math.tan(((45 + phi / 2) * Math.PI) / 180) ** 2; // Eq. C13.6.1.1-6
  const a = (2 * V) / (gamma * Kp * D);
  const b = (2 * M) / (gamma * Kp * D);
  // L³ − a·L − b = 0 (Eq. C13.6.1.1-5): the one positive root, by Newton from above.
  let L = Math.max(1, Math.cbrt(b) + Math.sqrt(a));
  for (let k = 0; k < 60; k++) {
    const f = L ** 3 - a * L - b;
    const df = 3 * L ** 2 - a;
    const next = L - f / df;
    if (Math.abs(next - L) < 1e-10) break;
    L = next;
  }
  const z = Math.sqrt(V / (gamma * D * Kp));
  return { L, Mu: V * (H + 0.54 * z), H, q: 0, Kp, zMax: 0.82 * z }; // Eq. C13.6.1.1-7
}

/** O'Neill and Reese's β for sand (AASHTO LRFD 7th Ed. Eq. 10.8.3.5.2b-2): 1.5 − 0.135√z (z ft), 0.25 to 1.2, × N60/15
 * where N60 < 15. */
export const oneillReeseBeta = (z: number, N60: number) => Math.min(1.2, Math.max(0.25, 1.5 - 0.135 * Math.sqrt(z))) * Math.min(1, N60 / 15);

/** The soil's torsional resistance round a shaft (kip·ft): side resistance qs over the embedded length, at D/2.
 * - "cdot", as CDOT's standard caissons need it (the sheets don't state their method; this one carries every
 *   S-614-40 and 40A caisson on the sheets' own basis): clay its full cohesion (qs = su); sand O'Neill and Reese's
 *   β-method (qs = β·σ′v, β = 1.5 − 0.135√z).
 * - "aashto", AASHTO's current side resistance: clay α = 0.55 (10.8.3.5.1b); sand β = (1 − sin φ)·tan φ, normally
 *   consolidated (Eq. 10.8.3.5.2b-2 with OCR 1).
 * L ft, D ft, c ksf, γ kcf. qs is the average over L (ksf). */
export function torsionResistance(soil: SoilKind, L: number, D: number, c: number, gamma: number, phi: number, method: TorsionMethod = "aashto", N60 = 15) {
  if (soil === "cohesive") {
    const alpha = method === "cdot" ? 1 : 0.55;
    const qs = alpha * c;
    return { Tn: qs * Math.PI * D * L * (D / 2), qs, beta: 0, alpha };
  }
  if (method === "cdot") {
    // ∫ β(z) γ z π D dz · D/2, by Simpson's rule
    const n = 200;
    const h = L / n;
    let sum = 0;
    for (let k = 0; k <= n; k++) {
      const z = k * h;
      sum += (k === 0 || k === n ? 1 : k % 2 ? 4 : 2) * oneillReeseBeta(z, N60) * z;
    }
    const integral = (sum * h) / 3; // ∫ β z dz
    return { Tn: gamma * integral * Math.PI * D * (D / 2), qs: (gamma * integral) / Math.max(L, 1e-9), beta: (2 * integral) / Math.max(L * L, 1e-9), alpha: 0 };
  }
  const r = (phi * Math.PI) / 180;
  const beta = (1 - Math.sin(r)) * Math.tan(r);
  // ∫ β γ z π D dz · D/2 over 0..L
  return { Tn: beta * gamma * Math.PI * D * (L ** 2 / 2) * (D / 2), qs: beta * gamma * L, beta, alpha: 0 };
}

export function designSignal(i: SignalInputs) {
  const s = signalStandard(i.standard);
  if (!(i.shaftD > 0 && i.shaftLength > 0)) throw new DesignError("The caisson needs a diameter and a length.");
  if (s.kind === "mast-arm" && !(i.armHeight > 0)) throw new DesignError("The arm needs a height on the pole.");
  const checks: Check[] = [];
  const add = (c: Omit<Check, "ok"> & { ok?: boolean }) => checks.push({ ...c, ok: c.ok ?? c.demand <= c.capacity });
  const D = i.shaftD / 12;
  const c = i.c / 1000;
  const gamma = i.gamma / 1000;

  // --- loads (LTS 3.5, 3.8, Table 3.4-1) -----------------------------------------------------------------------
  const loads = signalLoads(i, i);
  const groups = groupsOf(loads, [
    { name: "Strength I", gDC: 1.25, gW: 0 },
    { name: "Extreme I (max)", gDC: 1.1, gW: 1 },
    { name: "Extreme I (min)", gDC: 0.9, gW: 1 },
  ]);
  const ext = groups.reduce((a, g) => (g.gW && g.M > a.M ? g : a), groups[1]);
  const Vu = Math.max(...groups.map((g) => g.V));
  const Tu = Math.max(...groups.map((g) => g.T));

  // --- embedment (Broms, LRFD-LTS 13.6.1.1), the soil's strength × φ -----------------------------------------------
  const br = broms(i.soil, ext.M, Vu, D, c * i.phiLateral, gamma * i.phiLateral, i.phi);
  add({ id: "embedment", name: `Embedment for overturning (Broms, ${i.soil} soil)`, demand: br.L, capacity: i.shaftLength, unit: "ft", ref: "LRFD-LTS 13.6.1.1, Eq. C13.6.1.1-" + (i.soil === "cohesive" ? "1" : "5") });

  // --- torsion in the soil -----------------------------------------------------------------------------------------
  const tor = torsionResistance(i.soil, i.shaftLength, D, c, gamma, i.phi, i.torsionMethod, i.N60);
  if (s.kind === "mast-arm") add({ id: "soil-torsion", name: "Torsion: the soil's side resistance round the shaft", demand: Tu, capacity: i.phiTorsion * tor.Tn, unit: "kip·ft", ref: i.torsionMethod === "cdot" ? (i.soil === "cohesive" ? "As CDOT's standards: full cohesion" : "As CDOT's standards: O'Neill–Reese β") : i.soil === "cohesive" ? "AASHTO 10.8.3.5.1b (α = 0.55)" : "AASHTO 10.8.3.5.2b (β, OCR 1)" });

  // --- the shaft as a concrete member (13.6.2): bending at Broms' largest moment, shear, then torsion ---------------
  const part: ShaftPart = {
    shaftD: i.shaftD,
    shaftLength: i.shaftLength,
    cover: i.cover,
    bars: i.bars,
    bar: i.bar,
    tieBar: i.spiral,
    tieSpacing: i.pitch,
    fc: i.fc,
    fy: i.fy,
    phiM: i.phiM,
    // Axial: tip 9·su in clay (10.8.3.5.1c), 1.2·N60 ≤ 60 ksf in sand (10.8.3.5.2c); side as for torsion. Signals' axial loads are small.
    qp: i.soil === "cohesive" ? 9 * c : Math.min(1.2 * i.N60, 60),
    qs: tor.qs,
    phiQp: 0.4,
    phiQs: 0.45,
    sideLength: i.shaftLength,
    pyMoment: br.Mu,
    pyShear: Vu,
  };
  const sg: ShaftGroup[] = groups.map((g) => ({ gW: g.gW, P: g.P, M: g.M, T: g.T, V: g.V }));
  const shaft = designShaft(part, sg);
  checks.push(...shaft.checks.filter((x) => x.id !== "torsion").map((x) => (x.id === "axial" ? { ...x, name: "Axial resistance (tip and side)" } : x)));

  // Torsion (5.7.2.1, 5.7.3.6): neglected under a quarter of the cracking torque; otherwise the spiral for torsion and
  // shear together, and the longitudinal bars for it (5.7.3.6.3).
  const sh = shaft.shaft;
  const spiral = BARS[i.spiral];
  const bar = BARS[i.bar];
  const dSp = i.shaftD - 2 * i.cover - spiral.dia; // the spiral's centerline diameter
  const Aoh = (Math.PI * dSp ** 2) / 4;
  const Ao = 0.85 * Aoh;
  const ph = Math.PI * dSp;
  const TuIn = Tu * 12;
  const torsionMatters = TuIn > 0.25 * 0.9 * sh.Tcr;
  let torsion: { Ao: number; ph: number; needAt: number; needAv: number; provided: number; Al: number; AlNeed: number } | null = null;
  if (s.kind === "mast-arm") {
    if (!torsionMatters) {
      add({ id: "torsion", name: "Torsion may be neglected: Tu ≤ 0.25 φ Tcr", demand: TuIn, capacity: 0.25 * 0.9 * sh.Tcr, unit: "kip·in", ref: "AASHTO 5.7.2.1" });
    } else {
      // Transverse: At/s = Tu / (2 φ Ao fy cot θ), θ = 45° (Eq. 5.7.3.6.2-1); shear's Av/s on the two legs crossing a section.
      const needAt = TuIn / (0.9 * 2 * Ao * i.fy); // in²/in, one leg
      const VsNeed = Math.max(0, (sh.Vu / 0.9 - sh.Vc));
      const needAv = VsNeed / (i.fy * sh.dv); // in²/in, both legs
      const need = needAv / 2 + needAt; // per leg
      const provided = spiral.area / i.pitch;
      add({ id: "torsion", name: "Spiral for torsion and shear (per leg)", demand: need, capacity: provided, unit: "in²/in", ref: "AASHTO 5.7.3.6.2" });
      // Longitudinal (Eq. 5.7.3.6.3-2, solid section): As fy ≥ Mu/(φ dv) + √((Vu/φ − Vs/2)² + (0.45 ph Tu / (2 Ao φ))²) on the tension half.
      const Vs = (2 * spiral.area * i.fy * sh.dv) / i.pitch;
      const AlNeed = ((sh.Mu * 12) / (i.phiM * sh.dv) + Math.sqrt(Math.max(0, sh.Vu / 0.9 - Vs / 2) ** 2 + ((0.45 * ph * TuIn) / (2 * Ao * 0.9)) ** 2)) / i.fy;
      const Al = (i.bars * bar.area) / 2;
      add({ id: "torsion-long", name: "Longitudinal bars for bending, shear and torsion (tension half)", demand: AlNeed, capacity: Al, unit: "in²", ref: "AASHTO 5.7.3.6.3" });
      torsion = { Ao, ph, needAt, needAv, provided, Al, AlNeed };
    }
  }

  // --- the standard's own basis (advisory): its design wind with Kd 1, unfactored, × the sheet's factors of safety -----
  let cdot: { V: number; M: number; F: number; T: number; L: number; Tn: number; sf: SignalStandard["safety"] } | null = null;
  if (i.cdotBasis) {
    const base = signalLoads(i, { V: s.designWind, Kd: 1, G: i.G, Cv: i.Cv });
    const g = groupsOf(base, [{ name: "Service", gDC: 1, gW: 1 }])[0];
    const b = broms(i.soil, s.safety.flexure * g.M, s.safety.flexure * g.V, D, c, gamma, i.phi);
    cdot = { V: s.designWind, M: g.M, F: g.V, T: g.T, L: b.L, Tn: tor.Tn, sf: s.safety };
    add({ id: "cdot-embedment", name: `On the standard's basis: embedment, F.S. ${s.safety.flexure} on flexure (${s.designWind} mph)`, demand: b.L, capacity: i.shaftLength, unit: "ft", ref: `CDOT ${s.sheet} Design Data`, advisory: true });
    if (s.kind === "mast-arm") add({ id: "cdot-torsion", name: `On the standard's basis: torsion, F.S. ${s.safety.torsion}`, demand: s.safety.torsion * g.T, capacity: tor.Tn, unit: "kip·ft", ref: `CDOT ${s.sheet} Design Data`, advisory: true });
  }

  const std = standardCaisson(s, i.soil);
  return {
    ok: checks.every((x) => x.ok || x.advisory),
    checks,
    standard: s,
    stdCaisson: std,
    loads: { W: loads.W, Md: Math.hypot(...loads.Md), scaled: loads.scaled },
    groups,
    extreme: ext,
    Vu,
    Tu,
    broms: br,
    torsionSoil: tor,
    shaft: sh,
    torsion,
    cdot,
  };
}

export type SignalResult = ReturnType<typeof designSignal>;
