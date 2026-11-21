import { BARS, coulombKa, DesignError, type Check } from "../walls/cip";
import { analyzeLateral, type Layer as PyLayer } from "../foundations/lateral";
import { flowNet } from "./flownet";
import { triggering } from "./liquefaction";
import type { TakeoffSettings } from "../takeoff/types";
import { BARS_150, CHANNELS, laggingThickness, PILE_SECTIONS, SHEET_SECTIONS, STRAND, timberFb, type LaggingSoil } from "./sections";

// Soldier pile and lagging walls, and steel sheet pile walls: cantilevered (AASHTO LRFD 11.8) or anchored with one or
// more tiers of ground anchors (11.9), with FHWA GEC 4 (Ground Anchors and Anchored Systems, FHWA-IF-99-015) for the
// anchored wall's methods.
// - Cantilever: Rankine active pressure behind (3.11.5.6), surcharges (3.11.6.1, 3.11.6.4) and, for sheet piles, the
//   differential water; below the excavation, discrete piles take the active pressure on their width b and develop
//   passive resistance over 3b (C3.11.5.6) in sand, Broms' 9·c·b below 1.5b in clay (GEC 4 Fig. 41); sheet piles
//   Rankine passive on the full width. The embedment D0 by moment equilibrium about the toe with the factored driving
//   pressures and φ times the passive (the simplified method of C11.8.4.1), D = 1.2·D0; the largest moment at zero shear.
// - Anchored: the apparent earth pressure envelope of 3.11.5.7 (sand Eq. 3.11.5.7.1-2; stiff clay pa = 0.2–0.4·γ·H,
//   3.11.5.7.2a; soft clay Eq. 3.11.5.7.2b-2), surcharges added as rectangles (GEC 4 5.2), the anchors' horizontal
//   loads and the reaction at the subgrade by the tributary area or hinge method (GEC 4 Figs. 33, 34; AASHTO
//   C11.9.5.1), moments by GEC 4 Figs. 38 and 39; the toe's embedment for the reaction R with the passive resistance
//   (GEC 4 5.5.3), φ = 0.75.
// - The pile or sheet in flexure (φ 0.90, Table 11.5.7-1) and shear; the lagging by GEC 4 Table 12 (temporary) or its
//   bending (permanent); the anchors' tendons (φ 0.80 high-strength, 0.90 mild), bond (Eq. 11.9.4.2-1, φ 0.65 sand,
//   0.70 clay, 1.0 where proof tested), unbonded length past the critical surface at 45° + φ/2 (GEC 4 5.3.2, 5.3.4)
//   and the test load (GEC 4: ≤ 80% of the tendon's strength).
// kip, ft, ksf inside; inputs in pcf, psf as they're usually given.

export type WallType = "soldier" | "sheet";
export type Support = "cantilever" | "anchored";
export type SoilLayer = { name: string; thickness: number; gamma: number; phi: number; c: number; k?: number; kRatio?: number; n60?: number; fines?: number }; // ft, pcf, deg, psf; permeability ft/day and kh/kv (flow net); SPT N60 and fines % (liquefaction)
export type Anchor = { depth: number; angle: number; bondLength: number; unbondedLength: number }; // ft, deg below horizontal, ft, ft
export type AepSoil = "auto" | "sand" | "stiff-clay" | "soft-clay";

export type ShoringInputs = {
  wall: WallType;
  support: Support;
  temporary: boolean;
  H: number; // ft, the excavation's depth (design height)
  D: number; // ft, the embedment provided below the excavation
  layers: SoilLayer[]; // from the top of the wall down; the last continues below
  surcharge: number; // psf, a uniform surcharge on the retained ground (ES)
  traffic: boolean; // live load surcharge (AASHTO 3.11.6.4), heq by height
  water: number | null; // ft below the top: the water table behind (sheet piles: differential water to the excavation's level); null: none
  backslope: number; // deg, the retained ground sloping up from the top of the wall (an infinite slope); 0 level
  // Soldier piles
  section: string; // PILE_SECTIONS
  spacing: number; // ft, center to center
  drilled: boolean; // set in drilled holes backfilled with concrete (b = the hole's diameter below the excavation)
  holeDia: number; // in
  Fy: number; // ksi
  // Sheet piles
  sheet: string; // SHEET_SECTIONS
  // Lagging (soldier piles)
  lagging: "timber" | "precast" | "cip"; // timber lagging, precast panels, or a cast-in-place facing
  facingSupport: "simple" | "continuous"; // the facing's spans between the piles (C11.8.5.2)
  corrosionLoss: number; // in of steel lost from each exposed face over the design life (permanent walls; 11.8.7, 11.9.7)
  laggingT: number; // in, roughcut timber
  laggingSoil: LaggingSoil;
  timberFb: number; // ksi, the timber's adjusted bending design value (permanent lagging)
  precastT: number; // in, precast concrete lagging panels
  precastFc: number; // ksi
  precastBar: number; // bar size, each way
  precastBarSpacing: number; // in, the bars spanning between the piles
  arching: boolean; // soil arching behind flexible facing (GEC 4 Table 13: p·l²/12 instead of /8)
  // Construction stage, vertical capacity, wales, stability, deflection
  stageOver: number; // ft, how far below an anchor the excavation goes before the anchor is stressed (GEC 4: about 2 ft)
  N60: number; // blows/ft, SPT below the excavation (the piles' end bearing and side resistance in sand)
  wale: string; // CHANNELS, two back to back (anchored sheet piles)
  waleFy: number; // ksi
  excavationWidth: number; // ft, for basal heave (GEC 4 5.8.2.2)
  phiStability: number; // overall stability, AASHTO 11.6.3.7: 0.75 (0.65 supporting a structure)
  deflectionLimit: number; // in, the largest under service loads
  // Timber lagging grade (AASHTO 8.4): a graded species, or "custom" with timberFb entered already adjusted
  timberGrade: string;
  timberWidth: number; // in, nominal board width
  timberWet: boolean; // wet service (CM, Table 8.4.4.3-1)
  timberIncised: boolean; // incised for treatment (Ci 0.80)
  timberCl: number; // time effect Cλ (Table 8.4.4.9-1)
  // Anchored wall deflection, seismic, seepage
  lockOff: number; // the anchors' lock-off load, a fraction of the unfactored design load
  seismic: boolean; // Extreme Event I (AASHTO 11.8.6, 11.9.6)
  As: number; // the site's peak ground acceleration coefficient As (3.10)
  khHalf: boolean; // kh = 0.5·kh0, where 1 to 2 in. of movement is shown acceptable (11.6.5.2.2)
  seepage: boolean; // steady seepage under a sheet pile wall (head lost along the path; piping)
  flowNet: boolean; // seepage by a flow net through the layers (their k and kh/kv), not the even head loss
  baseDepth: number; // ft below the top, the impervious base for the flow net (0: twice the wall's length)
  staged: boolean; // the construction sequence in the anchored wall's deflection
  seismicWater: boolean; // pore water in the seismic pressures (Ebeling and Morrison)
  freeWater: boolean; // free pore water (pervious backfill): Westergaard's hydrodynamic pressure; else restrained
  porosity: number;
  liquefaction: boolean; // liquefaction triggering (Idriss and Boulanger 2008)
  Mw: number; // the design earthquake's magnitude
  // Anchored walls
  aepSoil: AepSoil;
  kStiffClay: number; // pa = k·γ·H, 0.2 to 0.4 (3.11.5.7.2a)
  method: "tributary" | "hinge";
  anchors: Anchor[];
  anchorSpacing: number; // ft, horizontal (sheet piles; soldier piles anchor every pile)
  tendon: "strand" | "bar";
  strands: number;
  bar: string; // BARS_150
  holeDiaAnchor: number; // in, the anchor's drill hole
  bond: number; // ksf, nominal bond stress τn (Tables C11.9.4.2-1 to -3)
  proofTested: boolean; // φ = 1.0 for pullout (Table 11.5.7-1 note 2)
  // Factors (Table 3.4.1-2, Table 11.5.7-1)
  gEH: number; // active (cantilever) 1.50
  gAEP: number; // apparent earth pressure (anchored) 1.35
  gES: number;
  gLS: number;
  phiP: number; // passive resistance 0.75
  phiF: number; // flexure 0.90
  takeoff?: TakeoffSettings;
};

/** The defaults: a 12 ft cantilever soldier pile wall in medium dense sand, HP 14×89 at 6 ft in 24 in drilled holes, 3 in
 * timber lagging, traffic behind. */
export const SHORING_DEFAULTS: ShoringInputs = {
  wall: "soldier",
  support: "cantilever",
  temporary: true,
  H: 12,
  D: 19,
  layers: [{ name: "Medium dense sand", thickness: 60, gamma: 120, phi: 32, c: 0 }],
  surcharge: 0,
  traffic: true,
  water: null,
  backslope: 0,
  section: "HP14x89",
  spacing: 6,
  drilled: true,
  holeDia: 24,
  Fy: 50,
  sheet: "PZC 18",
  lagging: "timber",
  facingSupport: "simple",
  corrosionLoss: 0.0625,
  laggingT: 3,
  laggingSoil: "competent",
  timberFb: 1.0,
  precastT: 6,
  precastFc: 5,
  precastBar: 4,
  precastBarSpacing: 8,
  arching: true,
  stageOver: 2,
  N60: 20,
  wale: "C12x25",
  waleFy: 36,
  excavationWidth: 40,
  phiStability: 0.75,
  deflectionLimit: 1.5,
  timberGrade: "dfl-2",
  timberWidth: 12,
  timberWet: true,
  timberIncised: false,
  timberCl: 0.8,
  lockOff: 0.75,
  seismic: false,
  As: 0.1,
  khHalf: false,
  seepage: false,
  flowNet: false,
  baseDepth: 0,
  staged: false,
  seismicWater: false,
  freeWater: false,
  porosity: 0.35,
  liquefaction: false,
  Mw: 6.5,
  aepSoil: "auto",
  kStiffClay: 0.3,
  method: "tributary",
  anchors: [
    { depth: 6, angle: 15, bondLength: 25, unbondedLength: 20 },
    { depth: 16, angle: 15, bondLength: 25, unbondedLength: 15 },
  ],
  anchorSpacing: 8,
  tendon: "strand",
  strands: 3,
  bar: '1-1/4"',
  holeDiaAnchor: 6,
  bond: 4,
  proofTested: false,
  gEH: 1.5,
  gAEP: 1.35,
  gES: 1.5,
  gLS: 1.75,
  phiP: 0.75,
  phiF: 0.9,
};

const GW = 0.0624; // kcf
const rad = (d: number) => (d * Math.PI) / 180;
export const rankineKa = (phi: number) => Math.tan(rad(45 - phi / 2)) ** 2;
export const rankineKp = (phi: number) => Math.tan(rad(45 + phi / 2)) ** 2;
/** The active coefficient behind a vertical wall: Rankine for level ground, Coulomb (Eq. 3.11.5.3-1, δ = 0) for a
 * backslope β (≤ φ; a cohesive layer, φ = 0, takes none). */
export const activeK = (phi: number, beta: number) => (beta > 0 && phi > 0 ? coulombKa(phi, Math.min(beta, phi - 0.5), 90, 0) : rankineKa(phi));

/** AASHTO Table 3.11.6.4-2: the equivalent height of soil for vehicular load on a wall parallel to traffic, by the
 * wall's height (ft), the load 1 ft or more from the wall: 5 ft at 5 ft, 3.5 at 10, 2 at 20 and over (interpolated). */
export function heqParallel(H: number) {
  if (H <= 5) return 5;
  if (H <= 10) return 5 - ((H - 5) / 5) * 1.5;
  if (H <= 20) return 3.5 - ((H - 10) / 10) * 1.5;
  return 2;
}

/** Mononobe–Okabe (AASHTO Eq. A11.3.1-1, vertical wall, δ = 0, kv = 0): the seismic active coefficient for a
 * backslope β, ψ = arctan(kh). */
export function moKae(phi: number, kh: number, beta = 0) {
  const psi = Math.atan(kh);
  const f = rad(phi);
  const b = rad(beta);
  const under = Math.sin(f) * Math.sin(f - psi - b);
  if (under < 0) return null;
  return Math.cos(f - psi) ** 2 / (Math.cos(psi) ** 2 * (1 + Math.sqrt(under / (Math.cos(psi) * Math.cos(b)))) ** 2);
}
/** Mononobe–Okabe's seismic passive coefficient (level ground in front, δ = 0, kv = 0). */
export function moKpe(phi: number, kh: number) {
  const psi = Math.atan(kh);
  const f = rad(phi);
  return Math.cos(f - psi) ** 2 / (Math.cos(psi) ** 2 * (1 - Math.sqrt((Math.sin(f) * Math.sin(f - psi)) / Math.cos(psi))) ** 2);
}
/** The seismic active coefficient a layer takes: Mononobe–Okabe where it applies, otherwise (clay, or φ − ψ − β < 0) the
 * static coefficient plus Seed and Whitman's 3/4·kh (C11.6.5.3). */
export const seismicKa = (phi: number, kh: number, beta: number) => (phi > 0 ? moKae(phi, kh, beta) : null) ?? activeK(phi, beta) + 0.75 * kh;
/** The seismic active wedge's angle from the horizontal (Zarrabi's solution of M–O, δ = 0): 45° + φ/2 when kh = 0. */
export function seismicWedge(phi: number, kh: number, beta = 0) {
  const psi = Math.atan(kh);
  const f = rad(phi);
  const b = rad(beta);
  const t = Math.tan(f - psi - b);
  if (!(t > 0)) return rad(45);
  const cot = 1 / Math.tan(f - psi);
  const C1 = Math.sqrt(t * (t + cot) * (1 + Math.tan(psi) * cot)); // δ = 0
  const C2 = 1 + Math.tan(psi) * (t + cot);
  return f - psi + Math.atan((-t + C1) / C2);
}

/** Steady seepage under a sheet pile wall with water behind above the excavation (the hydraulic gradient method, USACE
 * EM 1110-2-2504): the head lost evenly along the path down the back of the wall and up the front, Lp = (H + D − zw) + D. */
export function seepageOf(i: ShoringInputs) {
  if (i.wall !== "sheet" || !i.seepage || i.water === null || i.water >= i.H) return null;
  const dh = i.H - i.water;
  const Lp = i.H + i.D - i.water + i.D;
  return { dh, Lp, grad: dh / Lp };
}

/** The flow net for a sheet pile wall with seepage, when asked for. */
export function flowNetOf(i: ShoringInputs) {
  if (!i.flowNet || !seepageOf(i) || i.water === null) return null;
  const toe = i.H + i.D;
  return flowNet({ H: i.H, toe, water: i.water, base: i.baseDepth > toe ? i.baseDepth : 2 * toe, layers: i.layers.map((l) => ({ thickness: l.thickness, k: l.k ?? 1, kRatio: l.kRatio ?? 1 })) });
}

/** Liquefaction triggering at depth z, behind the wall (from the top) or in front (from the excavation), during the
 * design earthquake (amax = As): Idriss and Boulanger (2008); only cohesionless layers below the water table. */
export function liquefactionAt(i: ShoringInputs, z: number, front: boolean) {
  if (!i.liquefaction || !i.seismic || i.water === null) return null;
  const top = front ? i.H : 0;
  const wt = front ? Math.max(i.water, i.H) : i.water;
  if (z <= wt || z <= top) return null;
  const layer = soilAt(i.layers, null, z).layer;
  if (!(layer.phi > 0)) return null;
  const sv = soilAt(i.layers, null, z, top).sv;
  const svEff = soilAt(i.layers, wt, z, top).sv;
  return triggering({ z: z - top, sv, svEff, N60: layer.n60 ?? i.N60, fines: layer.fines ?? 10, amax: i.As, M: i.Mw });
}

/** The soil at depth z (ft from the top): its layer, and the effective vertical stress (ksf) from the soil alone. */
function soilAt(layers: SoilLayer[], water: number | null, z: number, top = 0) {
  let acc = 0;
  let sv = 0;
  let layer = layers[layers.length - 1];
  const wt = water ?? Infinity;
  for (let k = 0; k < layers.length; k++) {
    const l = layers[k];
    const a = acc;
    const b = k === layers.length - 1 ? Infinity : acc + l.thickness;
    const from = Math.max(a, top);
    const to = Math.min(b, z);
    if (to > from) {
      const g = l.gamma / 1000;
      const dry = Math.max(0, Math.min(to, wt) - from);
      const wet = to - from - dry;
      sv += g * dry + (g - GW) * wet;
    }
    if (z >= a && z < b) layer = l;
    acc = b;
  }
  return { layer, sv };
}

/** Rankine active pressure (ksf, unfactored parts) behind the wall at depth z: soil, surcharge and live load. */
export function activeAt(i: ShoringInputs, z: number, kh = 0) {
  const { layer, sv: sv0 } = soilAt(i.layers, i.water, z);
  // Seepage down the back of a sheet pile wall adds i·γw per foot to the effective stress.
  const seep = seepageOf(i);
  const fn = flowNetOf(i);
  const sv = fn && i.water !== null && z > i.water ? sv0 - (fn.uBack(z) - GW * (z - i.water)) : sv0 + (seep && i.water !== null && z > i.water ? seep.grad * GW * (z - i.water) : 0);
  // Pore water in the seismic inertia (Ebeling and Morrison 1992): restrained, the saturated weight; free, the dry.
  const below = i.water !== null && z > i.water && layer.gamma > 62.4;
  const khE = kh > 0 && i.seismicWater && below ? (kh * (i.freeWater ? layer.gamma - i.porosity * 62.4 : layer.gamma)) / (layer.gamma - 62.4) : kh;
  const ka = kh > 0 ? seismicKa(layer.phi, khE, i.backslope) : activeK(layer.phi, i.backslope);
  const c = layer.c / 1000;
  const soil = Math.max(0, ka * sv - 2 * c * Math.sqrt(ka));
  const qLS = i.traffic ? (heqParallel(i.H) * (i.layers[0].gamma / 1000)) : 0;
  return { soil, ES: ka * (i.surcharge / 1000), LS: ka * qLS, ka, layer };
}

/** Passive resistance (ksf, unfactored) in front of the wall at depth z below the top (below the excavation), and the
 * width (ft) it acts on per pile (discrete) or per foot (sheets). */
export function passiveAt(i: ShoringInputs, z: number, kh = 0) {
  const zz = z - i.H;
  if (zz <= 0) return { p: 0, width: 0 };
  const waterFront = i.water === null ? null : Math.max(i.water, i.H); // the water in front no higher than the excavation
  const { layer, sv: sv0 } = soilAt(i.layers, waterFront, z, i.H);
  // Seepage up in front lowers the effective stress by i·γw per foot.
  const seep = seepageOf(i);
  const fn = flowNetOf(i);
  const sv = Math.max(0, fn ? sv0 - (fn.uFront(z) - GW * zz) : sv0 - (seep ? seep.grad * GW * zz : 0));
  // A layer that liquefies in the design earthquake gives no passive resistance then.
  if (kh > 0) {
    const liq = liquefactionAt(i, z, true);
    if (liq && liq.FS < 1) return { p: 0, width: i.wall === "sheet" ? 1 : Math.min(3 * pileWidth(i), i.spacing) };
  }
  const kp = kh > 0 && layer.phi > 0 ? moKpe(layer.phi, kh) : rankineKp(layer.phi);
  const c = layer.c / 1000;
  if (i.wall === "sheet") return { p: kp * sv + 2 * c * Math.sqrt(kp), width: 1 };
  const b = pileWidth(i);
  if (layer.phi > 0) return { p: kp * sv + 2 * c * Math.sqrt(kp), width: Math.min(3 * b, i.spacing) }; // C3.11.5.6: 3b
  return { p: zz > 1.5 * b ? 9 * c : 0, width: b }; // Broms in clay: 9c over b, none in the top 1.5b
}

/** A rolled H or W section with a thickness lost from each exposed face: the plastic and elastic moduli and area by the
 * section's formulas, scaled to the tabulated values (the fillets kept in proportion). */
export function reducedPile(p: (typeof PILE_SECTIONS)[string], loss: number) {
  if (!(loss > 0)) return p;
  const zOf = (bf: number, tf: number, d: number, tw: number) => bf * tf * (d - tf) + (tw * (d - 2 * tf) ** 2) / 4;
  const sOf = (bf: number, tf: number, d: number, tw: number) => (bf * d ** 3 - (bf - tw) * (d - 2 * tf) ** 3) / (6 * d);
  const aOf = (bf: number, tf: number, d: number, tw: number) => 2 * bf * tf + (d - 2 * tf) * tw;
  const r = { bf: p.bf - 2 * loss, tf: Math.max(0.01, p.tf - 2 * loss), d: p.d - 2 * loss, tw: Math.max(0.01, p.tw - 2 * loss) };
  return {
    ...p,
    ...r,
    Zx: (p.Zx * zOf(r.bf, r.tf, r.d, r.tw)) / zOf(p.bf, p.tf, p.d, p.tw),
    Sx: (p.Sx * sOf(r.bf, r.tf, r.d, r.tw)) / sOf(p.bf, p.tf, p.d, p.tw),
    A: (p.A * aOf(r.bf, r.tf, r.d, r.tw)) / aOf(p.bf, p.tf, p.d, p.tw),
  };
}

/** The pile's width below the excavation (ft): the drilled hole, or the flange. */
export function pileWidth(i: ShoringInputs) {
  const s = PILE_SECTIONS[i.section];
  return i.drilled ? i.holeDia / 12 : s.bf / 12;
}

/** Net differential water pressure on a sheet pile wall (ksf) at depth z: from the water table behind, less the water in
 * front from the excavation's level, constant below it. Soldier pile walls drain through the lagging. */
function waterAt(i: ShoringInputs, z: number, kh = 0) {
  if (i.wall !== "sheet" || i.water === null || i.water >= i.H) return 0;
  // Free pore water in an earthquake: Westergaard's hydrodynamic pressure, 7/8·kh·γw·√(hw·(z − zw)), to the excavation.
  const hydro = kh > 0 && i.seismicWater && i.freeWater && z > i.water && z <= i.H ? (7 / 8) * kh * GW * Math.sqrt((i.H - i.water) * (z - i.water)) : 0;
  return hydro + staticWater(i, z);
}

function staticWater(i: ShoringInputs, z: number) {
  if (i.water === null) return 0;
  const fn = flowNetOf(i);
  if (fn) return fn.uBack(z) - fn.uFront(z);
  const seep = seepageOf(i);
  if (!seep) return GW * Math.max(0, Math.min(z, i.H) - i.water);
  // With seepage: the pore pressure behind falls and the one in front rises, to meet at the toe.
  const back = z > i.water ? GW * ((z - i.water) - (seep.dh * (z - i.water)) / seep.Lp) : 0;
  const front = z > i.H ? GW * ((z - i.H) + (seep.dh * (z - i.H)) / seep.Lp) : 0;
  return back - front;
}

/** Integrate f from a to b (Simpson, n even). */
function integrate(f: (z: number) => number, a: number, b: number, n = 400) {
  if (b <= a) return 0;
  const h = (b - a) / n;
  let s = f(a) + f(b);
  for (let k = 1; k < n; k++) s += (k % 2 ? 4 : 2) * f(a + k * h);
  return (s * h) / 3;
}

/** Shear and moment down a beam loaded by w(z) (kip/ft, positive toward the excavation), from the top. */
function diagram(w: (z: number) => number, L: number, n = 600) {
  const z: number[] = [];
  const V: number[] = [];
  const M: number[] = [];
  let v = 0;
  let m = 0;
  const dz = L / n;
  for (let k = 0; k <= n; k++) {
    const zk = k * dz;
    if (k > 0) {
      const wa = w(zk - dz);
      const wb = w(zk);
      const v0 = v;
      v += ((wa + wb) / 2) * dz;
      m += ((v0 + v) / 2) * dz;
    }
    z.push(zk);
    V.push(v);
    M.push(m);
  }
  return { z, V, M };
}

/** One element's loads: the factored active pressure behind (ksf), the driving load on the element (kip per ft of
 * height: the spacing above the excavation, the width b below it) and φ times the passive resistance in front. */
function loadsOf(i: ShoringInputs, kh = 0) {
  const discrete = i.wall === "soldier";
  const s = discrete ? i.spacing : 1; // the width one element carries above the excavation (ft)
  const b = discrete ? pileWidth(i) : 1;
  const pBack = (z: number, gSoil: number, gES = i.gES, gLS = i.gLS) => {
    const a = activeAt(i, z, kh);
    return gSoil * a.soil + gES * a.ES + gLS * a.LS + waterAt(i, z, kh);
  };
  const driving = (z: number, gSoil: number, gES = i.gES, gLS = i.gLS) => pBack(z, gSoil, gES, gLS) * (z <= i.H ? s : discrete ? b : 1);
  const resisting = (z: number) => {
    const p = passiveAt(i, z, kh);
    return i.phiP * p.p * p.width;
  };
  return { discrete, s, b, pBack, driving, resisting };
}

/** A cantilever's embedment by moment equilibrium about the toe (C11.8.4.1) with the factored driving loads and φ times
 * the passive, D = 1.2·D0, and its shear and moment down to D0 (one pile, or a foot of sheet). */
export function cantileverOf(i: ShoringInputs, kh = 0) {
  const { driving, resisting } = loadsOf(i, kh);
    // --- moment equilibrium about the toe (C11.8.4.1): f(D) = Σ driving·arm − Σ φ·passive·arm --------------------
    const f = (D: number) => {
      const L = i.H + D;
      return integrate((z) => driving(z, i.gEH) * (L - z), 0, L) - integrate((z) => resisting(z) * (L - z), i.H, L);
    };
    let lo = 0.01;
    let hi = 2 * i.H + 20;
    if (f(hi) > 0) {
      hi = 8 * i.H + 80;
      if (f(hi) > 0) throw new DesignError("No embedment balances this wall: the soil in front can't hold it as a cantilever. Anchor it, or check the soil.");
    }
    for (let k = 0; k < 80; k++) {
      const mid = (lo + hi) / 2;
      if (f(mid) > 0) lo = mid;
      else hi = mid;
    }
    const D0 = hi;
    const L0 = i.H + D0;
    const d = diagram((z) => driving(z, i.gEH) - (z > i.H ? resisting(z) : 0), L0);
    const Mmax = Math.max(...d.M.map(Math.abs));
    // Shear down to the largest moment: below it the toe's reaction (the simplified method's concentrated force F) is
    // spread over the added 20% of embedment.
    const kM = d.M.reduce((best, m, k) => (Math.abs(m) > Math.abs(d.M[best]) ? k : best), 0);
    const Vmax = Math.max(...d.V.slice(0, kM + 1).map(Math.abs));
    return { D0, Dreq: 1.2 * D0, z: d.z, V: d.V, M: d.M, Mmax, Vmax };
}

/** Overall (external) stability by Bishop's simplified method (AASHTO 11.6.3.7; GEC 4 5.8.3): circles through the
 * element's toe; for anchored walls also circles passing just behind each tier's bond zone (GEC 4 Fig. 52), each
 * anchor restraining by its unfactored design load times the share of its bond length outside the circle. The wall is
 * taken to move with the sliding mass (its shear resistance neglected). Effective unit weights below the water table
 * (hydrostatic, no seepage), the surcharges on the ground behind. x behind the wall, y up from its top (ft). */
export function overallStability(i: ShoringInputs, anch: { rows: { Tservice: number }[] } | null, kh = 0) {
  const L = i.H + i.D;
  const tb = Math.tan(rad(Math.min(Math.max(0, i.backslope), 60)));
  const ground = (x: number) => (x < 0 ? -i.H : Math.min(x * tb, 3 * i.H));
  const q = (i.surcharge + (i.traffic ? heqParallel(i.H) * i.layers[0].gamma : 0)) / 1000;
  const wt = i.water ?? Infinity;
  const unitWeight = (y: number) => {
    if (y > 0) return i.layers[0].gamma / 1000;
    const g = soilAt(i.layers, null, -y).layer.gamma / 1000;
    return -y > wt ? g - GW : g;
  };
  const crackDepth = (z: number) => {
    const l = soilAt(i.layers, null, z).layer;
    return ((2 * (l.c / 1000)) / (l.gamma / 1000)) * Math.tan(rad(45 + l.phi / 2));
  };
  const zcBack = crackDepth(0.01);
  const zcFront = crackDepth(i.H + 0.01);
  const crack = (x: number) => (x < 0 ? zcFront : zcBack);
  const anchors = [...i.anchors].sort((a, b) => a.depth - b.depth);
  const bonds = i.support === "anchored" && anch
    ? anchors.map((a, k) => {
        const c = Math.cos(rad(a.angle));
        const s = Math.sin(rad(a.angle));
        return { a, T: anch.rows[k]?.Tservice ?? 0, c, s, p0: [a.unbondedLength * c, -a.depth - a.unbondedLength * s] as [number, number], p1: [(a.unbondedLength + a.bondLength) * c, -a.depth - (a.unbondedLength + a.bondLength) * s] as [number, number] };
      })
    : [];
  const per = i.wall === "soldier" ? i.spacing : i.anchorSpacing; // the anchors' loads spread along the wall
  const fsOf = (xc: number, yc: number, R: number): number => {
    // The slip surface comes up through the ground at each end, or, where the circle turns vertical below the ground, a
    // tension crack no deeper than 2c/γ·tan(45° + φ/2) takes it up the rest of the way (no strength along the crack).
    const crackOk = (x: number) => ground(x) - yc <= crack(x) + 1e-9;
    if (!crackOk(xc - R) || !crackOk(xc + R)) return Infinity;
    const n = 90;
    const x0 = xc - R;
    const bw = (2 * R) / n;
    let resist = 0;
    let drive = 0;
    const parts: { W: number; c: number; tanPhi: number; sinA: number; cosA: number }[] = [];
    for (let k = 0; k < n; k++) {
      const xm = x0 + (k + 0.5) * bw;
      const dx = xm - xc;
      if (Math.abs(dx) >= R) continue;
      const yb = yc - Math.sqrt(R * R - dx * dx);
      const top = ground(xm);
      if (yb >= top) continue;
      let W = 0;
      const m = 8;
      for (let t = 0; t < m; t++) {
        const y = yb + ((t + 0.5) * (top - yb)) / m;
        W += unitWeight(y) * ((top - yb) / m);
      }
      W = W * bw + (xm > 0 ? q * bw : 0);
      const layer = soilAt(i.layers, null, Math.max(0, -yb)).layer;
      const sinA = dx / R;
      parts.push({ W, c: (layer.c / 1000) * bw, tanPhi: Math.tan(rad(layer.phi)), sinA, cosA: Math.sqrt(1 - sinA * sinA) });
      drive += W * dx + kh * W * (yc - (yb + top) / 2); // pseudo-static kh·W toward the excavation at the slice's middle
    }
    if (!parts.length) return Infinity;
    // The anchors' restraint (a moment against the slide), per foot of wall.
    let Ma = 0;
    for (const b of bonds) {
      let out = 0;
      for (let t = 0; t <= 20; t++) {
        const px = b.p0[0] + ((b.p1[0] - b.p0[0]) * t) / 20;
        const py = b.p0[1] + ((b.p1[1] - b.p0[1]) * t) / 20;
        if (Math.hypot(px - xc, py - yc) > R) out++;
      }
      const T = (b.T * (out / 21)) / per;
      Ma += T * (xc * b.s + (b.a.depth + yc) * b.c);
    }
    const den = drive - Ma;
    if (den <= 1e-9) return Infinity;
    let F = 1.5;
    for (let it = 0; it < 40; it++) {
      resist = 0;
      for (const p of parts) resist += (p.c + p.W * p.tanPhi) / (p.cosA + (p.sinA * p.tanPhi) / F);
      const next = (resist * R) / den;
      if (Math.abs(next - F) < 1e-6) {
        F = next;
        break;
      }
      F = next;
    }
    return F;
  };
  const toe: [number, number] = [0, -L - 0.05];
  let best = { FS: Infinity, xc: 0, yc: 0, R: 0 };
  const consider = (xc: number, yc: number, R: number) => {
    const F = fsOf(xc, yc, R);
    if (F > 0 && F < best.FS) best = { FS: F, xc, yc, R };
  };
  // Circles through the toe, their centers on a grid, refined twice.
  let cx = 0.25 * L;
  let cy = 0.8 * L;
  let span = 1.5 * L;
  for (let pass = 0; pass < 3; pass++) {
    for (let a = 0; a <= 14; a++)
      for (let b = 0; b <= 14; b++) {
        const xc = cx - span + (2 * span * a) / 14;
        const yc = Math.max(-L + 1, cy - span + (2 * span * b) / 14);
        consider(xc, yc, Math.hypot(xc - toe[0], yc - toe[1]));
      }
    cx = best.xc;
    cy = best.yc;
    span /= 4;
  }
  // Circles through the toe and just behind each tier's bond zone.
  for (const b of bonds) {
    const Q: [number, number] = [b.p1[0] + 0.5 * b.c, b.p1[1] - 0.5 * b.s];
    const mx = (toe[0] + Q[0]) / 2;
    const my = (toe[1] + Q[1]) / 2;
    const dx = Q[0] - toe[0];
    const dy = Q[1] - toe[1];
    const len = Math.hypot(dx, dy);
    let nx = -dy / len;
    let ny = dx / len;
    if (ny < 0) {
      nx = -nx;
      ny = -ny;
    }
    for (let t = -0.4; t <= 4; t += 0.02) {
      const xc = mx + t * len * nx;
      const yc = my + t * len * ny;
      consider(xc, yc, Math.hypot(xc - toe[0], yc - toe[1]));
    }
  }
  return best;
}

/** The element as a beam on springs with the excavation at He (ft): loads w(z) (kip/in along it, toward the excavation),
 * the soil below He as linear springs from the p–y curves' initial moduli (API sand k·z; clays 67·Su, Davisson), and
 * the anchors installed so far, each a spring A·E/(Lu + Lb/2)·cos²θ (GEC 4's apparent free length) that was locked off
 * at P0 when the wall stood at yInst there: its force P0 + k·(y − yInst). Returns the deflection (in) down the element. */
function beamOnSprings(i: ShoringInputs, He: number, w: (z: number) => number, anchors: { node: number; k: number; P0: number; yInst: number }[]) {
  const discrete = i.wall === "soldier";
  const L = (i.H + i.D) * 12; // in
  const n = beamNodes(i);
  const h = L / n;
  const EI = 29000 * (discrete ? PILE_SECTIONS[i.section].Ix : SHEET_SECTIONS[i.sheet].I);
  const N = 2 * (n + 1);
  const K: number[][] = Array.from({ length: N }, () => new Array(N).fill(0));
  const F = new Array(N).fill(0);
  const ke = [
    [12, 6 * h, -12, 6 * h],
    [6 * h, 4 * h * h, -6 * h, 2 * h * h],
    [-12, -6 * h, 12, -6 * h],
    [6 * h, 2 * h * h, -6 * h, 4 * h * h],
  ].map((r) => r.map((v) => (v * EI) / h ** 3));
  for (let e = 0; e < n; e++) {
    const dof = [2 * e, 2 * e + 1, 2 * e + 2, 2 * e + 3];
    for (let a = 0; a < 4; a++) for (let c = 0; c < 4; c++) K[dof[a]][dof[c]] += ke[a][c];
  }
  for (let k = 0; k <= n; k++) {
    const zft = (k * h) / 12;
    const trib = k === 0 || k === n ? h / 2 : h;
    F[2 * k] += w(zft) * trib;
    if (zft > He) {
      const layer = soilAt(i.layers, null, zft).layer;
      const depthIn = (zft - He) * 12;
      const wet = i.water !== null && zft > Math.max(i.water, He);
      const Es = layer.phi > 0 ? ((wet ? (layer.phi < 30 ? 20 : layer.phi < 36 ? 60 : 125) : layer.phi < 30 ? 25 : layer.phi < 36 ? 90 : 225) * depthIn) / 1000 : (67 * layer.c) / 144000; // kip/in²
      K[2 * k][2 * k] += Es * trib;
    }
  }
  for (const a of anchors) {
    K[2 * a.node][2 * a.node] += a.k;
    F[2 * a.node] += -a.P0 + a.k * a.yInst;
  }
  const A = K.map((r, k) => [...r, F[k]]);
  for (let c = 0; c < N; c++) {
    let p = c;
    for (let r = c + 1; r < N; r++) if (Math.abs(A[r][c]) > Math.abs(A[p][c])) p = r;
    [A[c], A[p]] = [A[p], A[c]];
    const d = A[c][c];
    if (Math.abs(d) < 1e-14) throw new DesignError("The wall's beam model is unstable: check the soil and the anchors.");
    for (let r = c + 1; r < N; r++) {
      const m = A[r][c] / d;
      if (m === 0) continue;
      for (let k = c; k <= N; k++) A[r][k] -= m * A[c][k];
    }
  }
  const u = new Array(N).fill(0);
  for (let r = N - 1; r >= 0; r--) {
    let t = A[r][N];
    for (let k = r + 1; k < N; k++) t -= A[r][k] * u[k];
    u[r] = t / A[r][r];
  }
  return Array.from({ length: n + 1 }, (_, k) => u[2 * k]);
}

const beamNodes = (i: ShoringInputs) => Math.max(40, Math.min(240, Math.round((i.H + i.D) * 2)));

/** Each anchor as a spring: its node, horizontal stiffness and horizontal lock-off load, per element (kip/in, kip). */
function anchorSprings(i: ShoringInputs, Tservice: number[]) {
  const discrete = i.wall === "soldier";
  const sa = discrete ? i.spacing : i.anchorSpacing;
  const n = beamNodes(i);
  const h = ((i.H + i.D) * 12) / n;
  return [...i.anchors]
    .sort((x, y) => x.depth - y.depth)
    .map((a, k) => {
      const c = Math.cos(rad(a.angle));
      const area = i.tendon === "strand" ? i.strands * STRAND.area : BARS_150[i.bar] ?? 1.25;
      const E = i.tendon === "strand" ? 28500 : 29000;
      const kAx = (area * E) / ((a.unbondedLength + a.bondLength / 2) * 12);
      return { depth: a.depth, node: Math.min(n, Math.max(0, Math.round((a.depth * 12) / h))), k: (kAx * c * c) / (discrete ? 1 : sa), P0: (i.lockOff * Tservice[k] * c) / (discrete ? 1 : sa), c, per: discrete ? 1 : sa, lockOff: i.lockOff * Tservice[k] };
    });
}

/** An anchored wall's deflection in its final state under the unfactored apparent pressure envelope and surcharges
 * (above the excavation) and the active pressure (below it), the anchors locked off from a wall at rest. Linear. */
export function anchoredDeflection(i: ShoringInputs, anch: { env: (z: number) => number; surchService: number; rows: { Tservice: number }[] }) {
  const discrete = i.wall === "soldier";
  const s = discrete ? i.spacing : 1;
  const b = discrete ? pileWidth(i) : 1;
  const springs = anchorSprings(i, anch.rows.map((r) => r.Tservice));
  const w = (z: number) => {
    if (z <= i.H) return ((anch.env(z) + anch.surchService + waterAt(i, z)) * s) / 12;
    const a = activeAt(i, z);
    return ((a.soil + a.ES + a.LS + waterAt(i, z)) * b) / 12;
  };
  const y = beamOnSprings(i, i.H, w, springs.map((sp) => ({ ...sp, yInst: 0 })));
  const n = beamNodes(i);
  const z = Array.from({ length: n + 1 }, (_, k) => ((k * (i.H + i.D)) / n));
  const kMax = y.reduce((best, v, k) => (Math.abs(v) > Math.abs(y[best]) ? k : best), 0);
  const anchorsOut = springs.map((sp) => ({ y: y[sp.node], T: ((sp.P0 + sp.k * y[sp.node]) * sp.per) / sp.c, lockOff: sp.lockOff }));
  return { z, y, max: y[kMax], zMax: z[kMax], top: y[0], anchors: anchorsOut };
}

/** The construction sequence (GEC 4 5.5.1): for each anchor, excavate to a set depth below it with the anchors above in
 * place, then install and lock it off; finally excavate to the bottom. Rankine active pressures with the surcharges at
 * each stage (unfactored), the soil springs below each stage's excavation, each anchor's spring taking up the wall's
 * movement after its lock-off. The largest movement over all stages, and each anchor's load at each stage. */
export function stagedDeflection(i: ShoringInputs, Tservice: number[]) {
  const discrete = i.wall === "soldier";
  const s = discrete ? i.spacing : 1;
  const b = discrete ? pileWidth(i) : 1;
  const springs = anchorSprings(i, Tservice);
  const n = beamNodes(i);
  const z = Array.from({ length: n + 1 }, (_, k) => ((k * (i.H + i.D)) / n));
  const wAt = (He: number) => (zz: number) => {
    const a = activeAt(i, zz);
    return ((a.soil + a.ES + a.LS + waterAt(i, zz)) * (zz <= He ? s : b)) / 12;
  };
  const installed: { node: number; k: number; P0: number; yInst: number }[] = [];
  const stages: { name: string; He: number; y: number[]; max: number; zMax: number; anchors: number[] }[] = [];
  const record = (name: string, He: number) => {
    const y = beamOnSprings(i, He, wAt(He), installed);
    const kMax = y.reduce((best, v, k) => (Math.abs(v) > Math.abs(y[best]) ? k : best), 0);
    const forces = installed.map((a, k) => ((a.P0 + a.k * (y[a.node] - a.yInst)) * springs[k].per) / springs[k].c);
    stages.push({ name, He, y, max: y[kMax], zMax: z[kMax], anchors: forces });
    return y;
  };
  springs.forEach((sp, k) => {
    const He = Math.min(i.H, sp.depth + i.stageOver);
    const y = record(`Excavate to ${He.toFixed(1)} ft`, He);
    installed.push({ node: sp.node, k: sp.k, P0: sp.P0, yInst: y[sp.node] });
    record(`Lock off anchor ${k + 1}`, He);
  });
  record(`Excavate to the bottom, ${i.H.toFixed(1)} ft`, i.H);
  const worst = stages.reduce((a, st) => (Math.abs(st.max) > Math.abs(a.max) ? st : a), stages[0]);
  return { z, stages, max: worst.max, zMax: worst.zMax, at: worst.name };
}

/** A cantilever's deflection at the top under the unfactored pressures: the embedded part by p–y (foundations/lateral.ts)
 * under the shear and moment at the excavation, the exposed part a cantilever beam from there. inches. */
export function cantileverDeflection(i: ShoringInputs) {
  const { driving } = loadsOf(i);
  const w = (z: number) => driving(z, 1, 1, 1);
  const H = i.H;
  const V = integrate(w, 0, H, 200);
  const M = integrate((z) => w(z) * (H - z), 0, H, 200);
  const discrete = i.wall === "soldier";
  const EI = 29000 * (discrete ? PILE_SECTIONS[i.section].Ix : SHEET_SECTIONS[i.sheet].I); // kip·in², a pile or a foot of sheet
  const width = discrete ? pileWidth(i) * 12 : 12;
  // The soil below the excavation as p–y layers (API sand, Matlock soft clay, Welch–Reese stiff clay).
  const layers: PyLayer[] = [];
  let acc = 0;
  for (let k = 0; k < i.layers.length; k++) {
    const l = i.layers[k];
    const a = acc;
    const bot = k === i.layers.length - 1 ? H + i.D + 1 : acc + l.thickness;
    acc = bot;
    const from = Math.max(a, H);
    const to = Math.min(bot, H + i.D + 1);
    if (to <= from) continue;
    const wet = i.water !== null && from >= Math.max(i.water, H);
    const g = wet ? l.gamma - 62.4 : l.gamma;
    const model: PyLayer["model"] =
      l.phi > 0
        ? { kind: "sand", phi: l.phi, gamma: g, k: wet ? (l.phi < 30 ? 20 : l.phi < 36 ? 60 : 125) : l.phi < 30 ? 25 : l.phi < 36 ? 90 : 225 }
        : l.c < 1000
          ? { kind: "soft-clay", su: l.c, gamma: g, e50: 0.02 }
          : { kind: "stiff-clay", su: l.c, gamma: g, e50: l.c < 2000 ? 0.01 : l.c < 4000 ? 0.007 : 0.005 };
    layers.push({ thickness: to - from, model });
  }
  const r = analyzeLateral({ length: i.D, D: width, EI, head: { kind: "free", H: V, M }, layers });
  const Mz = (z: number) => integrate((t) => w(t) * (z - t), 0, z, 40);
  const bend = (integrate((z) => Mz(z) * z, 0, H, 60) * 1728) / EI;
  const top = Math.abs(r.y0) + Math.abs(r.theta0) * H * 12 + bend;
  return { top, y0: r.y0, theta0: r.theta0, bend, V, M };
}

export function designShoring(i: ShoringInputs) {
  if (!(i.H > 0 && i.D > 0)) throw new DesignError("The wall needs an excavation depth and an embedment.");
  if (!i.layers.length) throw new DesignError("The wall needs the soil.");
  if (i.wall === "soldier" && !PILE_SECTIONS[i.section]) throw new DesignError("Choose a soldier pile section.");
  if (i.wall === "sheet" && !SHEET_SECTIONS[i.sheet]) throw new DesignError("Choose a sheet pile section.");
  const checks: Check[] = [];
  const add = (c: Omit<Check, "ok"> & { ok?: boolean }) => checks.push({ ...c, ok: c.ok ?? c.demand <= c.capacity });
  const { discrete, s, b, pBack } = loadsOf(i);

  let cant: { D0: number; Dreq: number; z: number[]; V: number[]; M: number[]; Mmax: number; Vmax: number } | null = null;
  let anch: {
    pa: number;
    total: number;
    surch: number;
    method: string;
    aep: Exclude<AepSoil, "auto">;
    Th: number[]; // kip/ft, factored
    ThService: number[];
    R: number; // kip/ft, factored
    moments: { at: string; M: number }[]; // kip·ft/ft, factored
    Mmax: number;
    Dreq: number;
    rows: { T: number; Tservice: number; Th: number; free: number; LuReq: number; bondReq: number; tendon: number; Rbond: number }[];
    surchService: number;
    env: (z: number) => number;
    quake: { kh: number; ratio: number; Th: number[]; R: number; Mmax: number; Dreq: number; wedge: number; rows: { T: number; free: number }[] } | null;
  } | null = null;

  if (i.support === "cantilever") {
    cant = cantileverOf(i);
    const D0 = cant.D0;
    add({ id: "embedment", name: "Embedment (moment about the toe, D = 1.2·D0)", demand: 1.2 * D0, capacity: i.D, unit: "ft", ref: "AASHTO C11.8.4.1, 3.11.5.6" });
  } else {
    // --- apparent earth pressure (3.11.5.7) --------------------------------------------------------------------
    const anchors = [...i.anchors].sort((a, c) => a.depth - c.depth);
    if (!anchors.length) throw new DesignError("An anchored wall needs at least one anchor.");
    if (anchors.some((a) => !(a.depth > 0 && a.depth < i.H))) throw new DesignError("Each anchor must be between the top and the excavation.");
    const H = i.H;
    const H1 = anchors[0].depth;
    const Hn1 = H - anchors[anchors.length - 1].depth;
    // The retained soil's average unit weight and friction angle over H (thickness-weighted), and its strength.
    const avg = (key: "gamma" | "phi" | "c") => integrate((z) => soilAt(i.layers, null, z).layer[key], 0, H, 200) / H;
    const gAvg = avg("gamma") / 1000;
    const phiAvg = avg("phi");
    const su = avg("c") / 1000;
    const below = soilAt(i.layers, null, H + 0.01).layer;
    const aep: Exclude<AepSoil, "auto"> = i.aepSoil !== "auto" ? i.aepSoil : phiAvg > 0 ? "sand" : (gAvg * H) / Math.max(su, 1e-6) >= 6 ? "soft-clay" : "stiff-clay";
    let pa: number;
    if (aep === "sand") pa = (activeK(phiAvg, i.backslope) * gAvg * H * H) / (1.5 * H - 0.5 * H1 - 0.5 * Hn1); // Eq. 3.11.5.7.1-2 (ka by Eq. 3.11.5.3-1 for β ≠ 0)
    else if (aep === "stiff-clay") pa = i.kStiffClay * gAvg * H; // Eq. 3.11.5.7.2a-1
    else {
      const sub = below.c / 1000;
      const d = H; // the base failure surface's depth below the excavation: taken as H (conservative where no firm layer is closer)
      const ka = Math.max(0.22, 1 - (4 * su) / (gAvg * H) + 2 * Math.SQRT2 * (d / H) * (1 - (5.14 * sub) / (gAvg * H))); // Eq. 3.11.5.7.2b-2
      pa = ka * gAvg * H;
    }
    const total = pa * (H - H1 / 3 - Hn1 / 3); // the trapezoid's area (unfactored)
    // The envelope (ksf, unfactored): rises over 2/3 H1, flat, falls over 2/3 Hn+1.
    const env = (z: number) => (z <= (2 / 3) * H1 ? (pa * z) / ((2 / 3) * H1) : z >= H - (2 / 3) * Hn1 ? (pa * (H - z)) / ((2 / 3) * Hn1) : pa);
    const a0 = activeAt(i, H / 2);
    const surch = i.gES * a0.ES + i.gLS * a0.LS; // the surcharges' rectangle, factored (GEC 4 5.2)
    const surchService = a0.ES + a0.LS;
    const pz = (z: number, g: number, sur: number, kq = 0) => (z < 0 || z > H ? 0 : g * env(z) + sur + waterAt(i, z, kq));
    const loadOver = (a: number, c: number, g: number, sur: number, kq = 0) => integrate((z) => pz(z, g, sur, kq), a, c, 200);
    const momentAbout = (a: number, c: number, at: number, g: number, sur: number, kq = 0) => integrate((z) => pz(z, g, sur, kq) * (z - at), a, c, 200);
    const supports = [...anchors.map((x) => x.depth), H]; // the anchors and the subgrade
    const solve = (g: number, sur: number, kq = 0) => {
      const Th: number[] = [];
      let R = 0;
      if (i.method === "tributary") {
        // GEC 4 Fig. 34: each anchor carries the load from midway up to midway down; R the half span above the subgrade.
        for (let k = 0; k < anchors.length; k++) {
          const top = k === 0 ? 0 : (supports[k - 1] + supports[k]) / 2;
          const bot = (supports[k] + supports[k + 1]) / 2;
          Th.push(loadOver(top, bot, g, sur, kq));
        }
        R = loadOver((supports[anchors.length - 1] + H) / 2, H, g, sur, kq);
      } else {
        // Hinge method (GEC 4 Fig. 34): hinges at the lower anchors and the subgrade; each part statically determinate.
        let carry = 0; // load from the part above, taken by the current anchor's upper part
        for (let k = 0; k < anchors.length; k++) {
          const top = k === 0 ? 0 : supports[k]; // the part starts at the top, then at each hinge (the anchor itself)
          const zi = supports[k];
          const zn = supports[k + 1];
          // The part from `top` (a hinge, or the top) to zn (the next hinge), supported at zi and zn: ΣM about zn = 0.
          const W = loadOver(top, zn, g, sur, kq);
          const Mzn = integrate((z) => pz(z, g, sur, kq) * (zn - z), top, zn, 200);
          const Ti = Mzn / (zn - zi); // the support at zi from this part
          Th.push(Ti + carry);
          carry = W - Ti; // the reaction at the hinge zn, carried by the next anchor (or R)
        }
        R = carry;
      }
      return { Th, R };
    };
    const fac = solve(i.gAEP, surch);
    const svc = solve(1, surchService);
    // Moments (kip·ft per ft of wall): the cantilever above the top anchor by statics; between supports 1/10·p·l²
    // (tributary, GEC 4 Fig. 39) or the largest by statics on each simple span (hinge).
    const momentsOf = (gm: number, sm: number, kq = 0) => {
    const moments: { at: string; M: number }[] = [{ at: "At the top anchor", M: momentAbout(0, H1, H1, gm, sm, kq) * -1 }];
    for (let k = 0; k < anchors.length; k++) {
      const z0 = supports[k];
      const z1 = supports[k + 1];
      const l = z1 - z0;
      if (i.method === "tributary") {
        let pmax = 0;
        for (let t = 0; t <= 20; t++) pmax = Math.max(pmax, pz(z0 + (l * t) / 20, gm, sm, kq));
        moments.push({ at: k === anchors.length - 1 ? "Between the lowest anchor and the subgrade" : `Between anchors ${k + 1} and ${k + 2}`, M: (pmax * l * l) / 10 });
      } else {
        // the simple span z0–z1 under the load between them: its largest moment
        const Ra = integrate((z) => pz(z, gm, sm, kq) * (z1 - z), z0, z1, 200) / l;
        let best = 0;
        for (let t = 1; t < 60; t++) {
          const x = z0 + (l * t) / 60;
          const m = Ra * (x - z0) - integrate((z) => pz(z, gm, sm, kq) * (x - z), z0, x, 60);
          best = Math.max(best, m);
        }
        moments.push({ at: k === anchors.length - 1 ? "Between the lowest anchor and the subgrade" : `Between anchors ${k + 1} and ${k + 2}`, M: best });
      }
    }
    return moments;
    };
    const moments = momentsOf(i.gAEP, surch);
    const Mmax = Math.max(...moments.map((m) => Math.abs(m.M)));
    // --- the toe: R per element against φ × passive below the excavation, with the active below on b (GEC 4 5.5.3) --
    const toeDepth = (Rk: number, phiP: number, kh: number, gSoil: number) => {
      const pb = loadsOf(i, kh).pBack;
      const g = (D: number) => phiP * integrate((z) => passiveAt(i, z, kh).p * passiveAt(i, z, kh).width, H, H + D, 200) - Rk * s - integrate((z) => pb(z, gSoil) * (discrete ? b : 1), H, H + D, 200);
      if (g(0.01) >= 0) return 0;
      let lo = 0.01;
      let hi = 3 * H + 30;
      if (g(hi) < 0) return Infinity;
      for (let k = 0; k < 70; k++) {
        const mid = (lo + hi) / 2;
        if (g(mid) < 0) lo = mid;
        else hi = mid;
      }
      return hi;
    };
    const Dreq = toeDepth(fac.R, i.phiP, 0, i.gAEP);
    if (!Number.isFinite(Dreq)) throw new DesignError("The soil below the excavation can't carry the toe's reaction: the lowest anchor must take it (GEC 4 5.5.3).");
    add({ id: "embedment", name: "Embedment for the toe's reaction R (passive below the excavation)", demand: Dreq, capacity: i.D, unit: "ft", ref: "GEC 4 5.5.3; AASHTO 11.9.5.2" });

    // --- the anchors (11.9.4.2, 11.9.5.1; GEC 4 5.3) -----------------------------------------------------------
    const sa = discrete ? i.spacing : i.anchorSpacing;
    const phiBond = i.proofTested ? 1 : phiAvg > 0 ? 0.65 : 0.7;
    const tendonArea = i.tendon === "strand" ? i.strands * STRAND.area : BARS_150[i.bar] ?? 1.25;
    const fpu = i.tendon === "strand" ? STRAND.fpu : 150;
    const phiT = 0.8; // high-strength steel (Table 11.5.7-1)
    const minFree = i.tendon === "strand" ? 15 : 10; // GEC 4 5.3.4: 4.5 m strand, 3 m bar
    const t45 = Math.tan(rad(45 - phiAvg / 2));
    const rows = anchors.map((a, k) => {
      const Th = fac.Th[k] * sa;
      const T = Th / Math.cos(rad(a.angle)); // Eq. 20
      const Tservice = (svc.Th[k] * sa) / Math.cos(rad(a.angle));
      // The length along the anchor to the critical surface from the excavation's corner at 45° + φ/2 (GEC 4 5.3.2).
      const free = ((H - a.depth) * t45) / (Math.cos(rad(a.angle)) + Math.sin(rad(a.angle)) * t45);
      const LuReq = Math.max(minFree, free + Math.max(H / 5, 5));
      const Rbond = phiBond * Math.PI * (i.holeDiaAnchor / 12) * i.bond * a.bondLength; // Eq. 11.9.4.2-1
      const bondReq = T / (phiBond * Math.PI * (i.holeDiaAnchor / 12) * i.bond);
      const tendon = phiT * fpu * tendonArea;
      add({ id: `anchor${k + 1}-tendon`, name: `Anchor ${k + 1}: tendon (${i.tendon === "strand" ? `${i.strands} × 0.6 in strand` : `${i.bar} Grade 150 bar`})`, demand: T, capacity: tendon, unit: "kip", ref: "AASHTO 11.9.5.1, Table 11.5.7-1" });
      add({ id: `anchor${k + 1}-bond`, name: `Anchor ${k + 1}: pullout over its ${a.bondLength} ft bond length`, demand: T, capacity: Rbond, unit: "kip", ref: "AASHTO Eq. 11.9.4.2-1" });
      add({ id: `anchor${k + 1}-free`, name: `Anchor ${k + 1}: unbonded length past the critical surface`, demand: LuReq, capacity: a.unbondedLength, unit: "ft", ref: "GEC 4 5.3.2, 5.3.4" });
      add({ id: `anchor${k + 1}-test`, name: `Anchor ${k + 1}: test load 1.33·DL ≤ 0.80·fpu·A`, demand: 1.33 * Tservice, capacity: 0.8 * fpu * tendonArea, unit: "kip", ref: "GEC 4 5.3.8, 7.4" });
      add({ id: `anchor${k + 1}-minbond`, name: `Anchor ${k + 1}: bond length at least 15 ft`, demand: 15, capacity: a.bondLength, unit: "ft", ref: "GEC 4 5.3.6" });
      return { T, Tservice, Th, free, LuReq, bondReq, tendon, Rbond };
    });
    // --- seismic (Extreme Event I, AASHTO 11.9.6, 11.8.6): γ = 1.0, φ = 1.0; PAE distributed like the static envelope -----
    let quake: { kh: number; ratio: number; Th: number[]; R: number; Mmax: number; Dreq: number; wedge: number; rows: { T: number; free: number }[] } | null = null;
    if (i.seismic) {
      const kh = i.As * (i.khHalf ? 0.5 : 1);
      const kaS = aep === "sand" ? activeK(phiAvg, i.backslope) : 0;
      // With pore water in the seismic inertia, the coefficient averaged over the height (Ebeling and Morrison).
      const wt = i.water;
      const khEff = i.seismicWater && wt !== null && wt < H
        ? integrate((z) => {
            const l = soilAt(i.layers, null, z).layer;
            return z > wt && l.gamma > 62.4 ? (kh * (i.freeWater ? l.gamma - i.porosity * 62.4 : l.gamma)) / (l.gamma - 62.4) : kh;
          }, 0, H, 100) / H
        : kh;
      const ratio = aep === "sand" ? seismicKa(phiAvg, khEff, i.backslope) / kaS : 1 + (0.75 * khEff * gAvg * H * H) / 2 / Math.max(1e-9, total);
      const surEq = (a0.ES + 0.5 * a0.LS) * (aep === "sand" ? ratio : 1);
      const eq = solve(ratio, surEq, kh);
      const mEq = momentsOf(ratio, surEq, kh);
      const Dq = toeDepth(eq.R, 1.0, kh, 1);
      const wedge = seismicWedge(phiAvg, kh, i.backslope);
      const tw = 1 / Math.tan(wedge);
      const qrows = anchors.map((a, k) => {
        const T = (eq.Th[k] * sa) / Math.cos(rad(a.angle));
        const free = ((H - a.depth) * tw) / (Math.cos(rad(a.angle)) + Math.sin(rad(a.angle)) * tw);
        add({ id: `eq-anchor${k + 1}-tendon`, name: `Seismic: anchor ${k + 1}'s tendon (φ 1.0)`, demand: T, capacity: rows[k].tendon / phiT, unit: "kip", ref: "AASHTO 11.9.6, 11.5.8" });
        add({ id: `eq-anchor${k + 1}-bond`, name: `Seismic: anchor ${k + 1}'s pullout (φ 1.0)`, demand: T, capacity: rows[k].Rbond / phiBond, unit: "kip", ref: "AASHTO 11.9.6, Eq. 11.9.4.2-1" });
        add({ id: `eq-anchor${k + 1}-free`, name: `Seismic: anchor ${k + 1}'s bond behind the seismic wedge (${((wedge * 180) / Math.PI).toFixed(1)}°)`, demand: free, capacity: a.unbondedLength, unit: "ft", ref: "AASHTO 11.9.6" });
        return { T, free };
      });
      const MqMax = Math.max(...mEq.map((m) => Math.abs(m.M)));
      quake = { kh, ratio, Th: eq.Th, R: eq.R, Mmax: MqMax, Dreq: Dq, wedge, rows: qrows };
      add({ id: "eq-embedment", name: "Seismic: embedment for the toe's reaction (M–O passive, φ 1.0)", demand: Dq, capacity: i.D, unit: "ft", ref: "AASHTO 11.8.6.3, 11.9.6" });
    }
    const envelope = (z: number) => (z < 0 || z > H ? 0 : env(z));
    anch = { pa, total, surch, surchService, env: envelope, method: i.method, aep, Th: fac.Th, ThService: svc.Th, R: fac.R, moments, Mmax, Dreq, rows, quake };
  }

  // --- the element (AASHTO 11.8.5.1, 11.9.5.2), its section less any corrosion loss (11.8.7, 11.9.7) ---------------
  const Mft = cant ? cant.Mmax / s : anch!.Mmax; // per foot of wall
  const Mu = Mft * s; // kip·ft per element (pile) or per foot (sheet)
  const Vu = cant ? cant.Vmax : Math.max(...anch!.Th, anch!.R) * s;
  const loss = i.temporary ? 0 : Math.max(0, i.corrosionLoss); // in, from each exposed face
  let elem: { name: string; Mn: number; Vn: number; Pn: number; compact?: boolean; Z: number };
  if (discrete) {
    const p = reducedPile(PILE_SECTIONS[i.section], loss);
    const compact = p.bf / (2 * p.tf) <= 0.38 * Math.sqrt(29000 / i.Fy);
    const Z = compact ? p.Zx : p.Sx;
    const Mn = (Z * i.Fy) / 12;
    const Vn = 0.58 * i.Fy * p.d * p.tw;
    elem = { name: i.section, Mn, Vn, Pn: i.Fy * p.A, compact, Z };
    const lossNote = loss > 0 ? `, less ${loss} in per face` : "";
    add({ id: "pile-flexure", name: `${i.section} in flexure (${compact ? "Fy·Zx, compact flanges" : "Fy·Sx"}${lossNote})`, demand: Mu, capacity: i.phiF * Mn, unit: "kip·ft", ref: "AASHTO 11.8.5.1, Table 11.5.7-1, 6.12.2.2" });
    add({ id: "pile-shear", name: `${i.section} in shear (0.58·Fy·d·tw${lossNote})`, demand: Vu, capacity: 1.0 * Vn, unit: "kip", ref: "AASHTO 11.8.5.1, 6.10.9.2" });
  } else {
    const p = SHEET_SECTIONS[i.sheet];
    const kept = Math.max(0, (p.t - 2 * loss) / p.t); // both faces exposed: S, A and the web scale with the thickness
    const Z = p.S * kept;
    const Mn = (Z * i.Fy) / 12;
    const Vn = 0.58 * i.Fy * (p.t * kept) * p.depth * (12 / p.width); // one web per sheet width, per foot of wall
    elem = { name: i.sheet, Mn, Vn, Pn: i.Fy * p.A * kept, Z };
    const lossNote = loss > 0 ? `, less ${loss} in per face` : "";
    add({ id: "pile-flexure", name: `${i.sheet} in flexure (Fy·S per foot${lossNote})`, demand: Mu, capacity: i.phiF * Mn, unit: "kip·ft/ft", ref: "AASHTO 11.8.5.1, Table 11.5.7-1" });
    add({ id: "pile-shear", name: `${i.sheet} in shear (0.58·Fy over the webs, per foot${lossNote})`, demand: Vu, capacity: 1.0 * Vn, unit: "kip/ft", ref: "AASHTO 11.8.5.1, 6.10.9.2" });
  }

  // --- facing between soldier piles (AASHTO 11.8.5.2, 11.9.5.3; C11.8.5.2 moments) ----------------------------------
  // M = c·p·L², c = 0.125 simple without arching, 0.083 simple or continuous with arching, 0.1 continuous without; p the
  // factored pressure at the excavation (the largest, where the average is asked for: conservative).
  const facingCoef = i.facingSupport === "continuous" ? (i.arching ? 0.083 : 0.1) : i.arching ? 0.083 : 0.125;
  const facingLabel = `${i.facingSupport === "continuous" ? "continuous" : "simple"} spans, ${i.arching ? "soil arching" : "no arching"}: ${facingCoef}·p·L²`;
  let lag: { clear: number; tReq: number | null; pMax: number; Mu: number; Mr: number; Fb: number; fb: ReturnType<typeof timberFb>; Vu: number; Vr: number | null; coef: number } | null = null;
  let precast: { span: number; pMax: number; Mu: number; phiMn: number; Vu: number; phiVc: number; d: number; As: number; coef: number; cip: boolean } | null = null;
  if (discrete) {
    const pile = PILE_SECTIONS[i.section];
    const clear = Math.max(0.5, i.spacing - pile.bf / 12);
    const pMax = cant ? pBack(i.H, i.gEH) : anch!.pa * i.gAEP + anch!.surch;
    if (i.lagging === "timber") {
      const tReq = laggingThickness(i.laggingSoil, i.H, clear);
      // Permanent timber facing (Section 8): Mr = φ·Fb·S, φ 0.85; Vr = φ·Fv·b·t/1.5, φ 0.75 (8.5.2.2, 8.7).
      const L = clear + pile.bf / 12 / 2; // to the bearing centers on the flanges
      const MuL = facingCoef * pMax * L ** 2;
      const fb = i.timberGrade === "custom" ? null : timberFb(i.timberGrade, i.laggingT, i.timberWidth, { wet: i.timberWet, incised: i.timberIncised, cLambda: i.timberCl });
      const Fb = fb?.Fb ?? i.timberFb;
      const Mr = (0.85 * Fb * ((12 * i.laggingT ** 2) / 6)) / 12;
      const VuL = (pMax * L) / 2;
      const Fv = fb ? fb.Fv : null;
      const Vr = Fv === null ? null : (0.75 * Fv * 12 * i.laggingT) / 1.5;
      lag = { clear, tReq, pMax, Mu: MuL, Mr, Fb, fb, Vu: VuL, Vr, coef: facingCoef };
      if (i.temporary) add({ id: "lagging", name: `Timber lagging (GEC 4 Table 12, ${i.laggingSoil} soil, ${clear.toFixed(1)} ft clear)`, demand: tReq ?? Infinity, capacity: i.laggingT, unit: "in", ref: "GEC 4 Table 12", ok: tReq !== null && tReq <= i.laggingT + 1e-9 });
      else {
        add({ id: "lagging", name: `Timber facing in flexure (${fb ? fb.label : "Fb as entered"}, Fb ${Fb.toFixed(3)} ksi; ${facingLabel})`, demand: MuL, capacity: Mr, unit: "kip·ft/ft", ref: "AASHTO 11.8.5.2, C11.8.5.2, Eq. 8.4.4.1-1" });
        if (Vr !== null) add({ id: "lagging-shear", name: `Timber facing in shear (Fv ${Fv!.toFixed(3)} ksi)`, demand: VuL, capacity: Vr, unit: "kip/ft", ref: "AASHTO 8.7, Eq. 8.4.4.1-2" });
      }
    } else {
      // Precast panels or a cast-in-place facing: reinforced concrete one-way slabs between the piles.
      const cip = i.lagging === "cip";
      const span = i.spacing; // center to center
      const MuP = facingCoef * pMax * span ** 2; // per foot of height
      const bar = BARS[i.precastBar] ?? BARS[4];
      const As = (bar.area * 12) / i.precastBarSpacing;
      const d = i.precastT - (cip ? 2 : 1.5) - bar.dia / 2; // cover: 2 in CIP against soil-side forms, 1.5 in precast
      const a = (As * 60) / (0.85 * i.precastFc * 12);
      const phiMn = (0.9 * As * 60 * (d - a / 2)) / 12;
      const VuP = (pMax * span) / 2;
      const phiVc = 0.9 * 0.0316 * 2 * Math.sqrt(i.precastFc) * 12 * d; // β = 2 (5.7.3.4.1)
      precast = { span, pMax, Mu: MuP, phiMn, Vu: VuP, phiVc, d, As, coef: facingCoef, cip };
      add({ id: "lagging", name: `${cip ? "Cast-in-place facing" : "Precast lagging"} in flexure (${i.precastT} in, #${i.precastBar} @ ${i.precastBarSpacing} in; ${facingLabel})`, demand: MuP, capacity: phiMn, unit: "kip·ft/ft", ref: "AASHTO 11.8.5.2, C11.8.5.2; 5.6.3" });
      add({ id: "lagging-shear", name: `${cip ? "Cast-in-place facing" : "Precast lagging"} in shear`, demand: VuP, capacity: phiVc, unit: "kip/ft", ref: "AASHTO 5.7.3.3" });
    }
  }

  // --- the cantilever stage before the first anchor (GEC 4 5.5.1): excavated a little below it --------------------
  let stage: { Hs: number; D0: number; Dreq: number; Mmax: number; avail: number } | null = null;
  if (anch) {
    const top = Math.min(...i.anchors.map((x) => x.depth));
    const Hs = Math.min(i.H, top + i.stageOver);
    const st = cantileverOf({ ...i, support: "cantilever", H: Hs, D: i.H + i.D - Hs });
    stage = { Hs, D0: st.D0, Dreq: st.Dreq, Mmax: st.Mmax, avail: i.H + i.D - Hs };
    add({ id: "stage-embedment", name: `Stage: a cantilever excavated to ${Hs.toFixed(1)} ft, before anchor 1`, demand: st.Dreq, capacity: stage.avail, unit: "ft", ref: "GEC 4 5.5.1; AASHTO C11.8.4.1" });
    add({ id: "stage-flexure", name: "Stage: the element in flexure as a cantilever", demand: st.Mmax, capacity: i.phiF * elem.Mn, unit: discrete ? "kip·ft" : "kip·ft/ft", ref: "AASHTO Table 11.5.7-1" });
  }

  // --- wales for anchored sheet piles (GEC 4 5.4.3): continuous over the anchors, M = w·l²/10 -----------------------
  let wales: { w: number; Mu: number; Vu: number; phiMn: number; phiVn: number }[] = [];
  if (anch && !discrete) {
    const c = CHANNELS[i.wale];
    if (!c) throw new DesignError("Choose the wale's channels.");
    wales = anch.Th.map((w, k) => {
      const l = i.anchorSpacing;
      const Mu = (w * l * l) / 10;
      const Vu = 0.6 * w * l;
      const phiMn = (0.9 * i.waleFy * 2 * c.Zx) / 12;
      const phiVn = 1.0 * 0.58 * i.waleFy * 2 * c.d * c.tw;
      add({ id: `wale${k + 1}`, name: `Wale at anchor ${k + 1}: 2 ${i.wale} in flexure (w·l²/10)`, demand: Mu, capacity: phiMn, unit: "kip·ft", ref: "GEC 4 5.4.3, Table 13" });
      add({ id: `wale${k + 1}-shear`, name: `Wale at anchor ${k + 1}: shear`, demand: Vu, capacity: phiVn, unit: "kip", ref: "AASHTO 6.10.9.2" });
      return { w, Mu, Vu, phiMn, phiVn };
    });
  }

  // --- vertical capacity under the anchors' downward components (GEC 4 5.6, AASHTO 11.9.5.2) -----------------------
  let axial: { Pu: number; Tv: number; DC: number; side: number; tip: number; phiSide: number; phiTip: number; Rr: number; method: string } | null = null;
  if (anch) {
    const sa = discrete ? i.spacing : i.anchorSpacing;
    const per = discrete ? 1 : 1 / sa; // per pile, or per foot of sheet wall (the anchor loads spread over the spacing)
    const anchors = [...i.anchors].sort((x, y) => x.depth - y.depth);
    const Tv = anch.rows.reduce((t, r, k) => t + r.T * Math.sin(rad(anchors[k].angle)), 0) * per;
    const L = i.H + i.D;
    const facing = discrete ? (i.lagging === "precast" ? 0.15 * (i.precastT / 12) : 0.035 * (i.laggingT / 12)) * i.spacing * i.H : 0;
    const steel = discrete ? (PILE_SECTIONS[i.section].W * L) / 1000 : (SHEET_SECTIONS[i.sheet].psf * L) / 1000;
    const DC = steel + facing;
    const Pu = Tv + 1.25 * DC;
    // Resistance below the excavation only (GEC 4: all external loads carried by the embedded part).
    const mid = soilAt(i.layers, null, i.H + i.D / 2).layer;
    const behind = soilAt(i.layers, i.water, i.H + i.D / 2).sv;
    const front = soilAt(i.layers, i.water === null ? null : Math.max(i.water, i.H), i.H + i.D / 2, i.H).sv;
    const po = (behind + front) / 2; // GEC 4: half the stress behind plus half in front, at the embedment's midpoint
    const pile = discrete ? PILE_SECTIONS[i.section] : null;
    const drilled = discrete && i.drilled;
    const perim = drilled ? Math.PI * (i.holeDia / 12) : pile ? (2 * (pile.d + pile.bf)) / 12 : 2; // a foot of sheet: both faces
    const tipArea = drilled ? (Math.PI * (i.holeDia / 12) ** 2) / 4 : pile ? (pile.d * pile.bf) / 144 : SHEET_SECTIONS[i.sheet].A / 144;
    let fs: number;
    let qt: number;
    let phiSide: number;
    let phiTip: number;
    let method: string;
    if (mid.phi > 0) {
      if (drilled) {
        const beta = Math.min(1.2, Math.max(0.25, 1.5 - 0.135 * Math.sqrt(i.H + i.D / 2))) * Math.min(1, i.N60 / 15); // GEC 4 Eq. 29
        fs = beta * po;
        qt = Math.min(1.2 * i.N60, 60); // GEC 4 Eq. 30: 57.5·N kPa
        phiSide = 0.55;
        phiTip = 0.5; // AASHTO Table 10.5.5.2.4-1
        method = `drilled-in, sand: β = ${beta.toFixed(3)}, qt = 1.2·N60`;
      } else {
        const beta = Math.tan(rad((2 / 3) * mid.phi)); // Ks = 1.0, δ = 2/3·φ: β = Ks·tan δ (GEC 4 Eq. 25)
        fs = beta * po;
        const Db = i.D * 12;
        qt = Math.min((0.8 * i.N60 * Db) / (pile ? pile.bf : 12), 8 * i.N60); // AASHTO 10.7.3.8.6g
        phiSide = 0.3;
        phiTip = 0.3; // SPT methods (Table 10.5.5.2.3-1)
        method = `driven, sand: β = tan(2/3·φ) = ${beta.toFixed(3)}, qt by SPT`;
      }
    } else {
      const su = mid.c / 1000;
      fs = 0.55 * su; // α-method (AASHTO 10.8.3.5.1b; GEC 4 Eqs. 27, 31)
      qt = 9 * su; // GEC 4 Eqs. 28, 32
      phiSide = drilled ? 0.45 : 0.35;
      phiTip = drilled ? 0.4 : 0.35;
      method = `${drilled ? "drilled-in" : "driven"}, clay: α = 0.55, qt = 9·Su`;
    }
    const side = fs * perim * i.D;
    const tip = qt * tipArea;
    const Rr = phiSide * side + phiTip * tip;
    axial = { Pu, Tv, DC, side, tip, phiSide, phiTip, Rr, method };
    add({ id: "axial", name: `Vertical capacity below the excavation (${method})`, demand: Pu, capacity: Rr, unit: discrete ? "kip" : "kip/ft", ref: "GEC 4 5.6; AASHTO 10.7, 10.8, 11.9.5.2" });
    // The element under the anchors' vertical components with its bending (11.9.5.2; Eqs. 6.9.2.2-1, -2), braced by the
    // facing and soil (no buckling): Pr = φc·Fy·A, φc 0.90; Mr = φf·Mn.
    const Pr = 0.9 * elem.Pn;
    const Mr = i.phiF * elem.Mn;
    const ratio = Pu / Pr;
    const inter = ratio < 0.2 ? ratio / 2 + Mu / Mr : ratio + (8 / 9) * (Mu / Mr);
    add({ id: "pile-combined", name: `Axial load and flexure (Pu/Pr ${ratio.toFixed(3)}; Eq. 6.9.2.2-${ratio < 0.2 ? 1 : 2})`, demand: inter, capacity: 1, unit: "", ref: "AASHTO 11.9.5.2, 6.9.2.2" });
  }

  // --- basal heave in clay below the excavation (GEC 4 5.8.2.2, Eq. 34) ------------------------------------------
  let heave: { Nc: number; Su: number; Sub: number; FS: number; target: number; sv: number } | null = null;
  const base = soilAt(i.layers, null, i.H + 0.1).layer;
  if (base.phi === 0 && base.c > 0) {
    const B = Math.max(1, i.excavationWidth);
    const Nc = Math.min(7.5, 5 * (1 + (0.2 * i.H) / B)); // strip: Fig. 51c (Skempton)
    const sv = soilAt(i.layers, null, i.H).sv + i.surcharge / 1000;
    const Su = integrate((z) => soilAt(i.layers, null, z).layer.c, 0, i.H, 100) / i.H / 1000;
    const Sub = base.c / 1000;
    const FS = (Nc * Sub) / Math.max(1e-6, sv - (Math.SQRT2 * Su * i.H) / B); // B' = B/√2
    const target = i.temporary ? 1.5 : 2.0;
    heave = { Nc, Su, Sub, FS, target, sv };
    add({ id: "heave", name: `Basal heave: FS = Nc·Su,b / (γH + q − √2·Su·H/B) ≥ ${target}`, demand: target, capacity: FS, unit: "", ref: "GEC 4 5.8.2.2, Eq. 34" });
  }

  // --- overall (external) stability: Bishop circles under the toe, behind each anchor (GEC 4 5.8.3) -----------------
  const stab = overallStability(i, anch);
  add({ id: "stability", name: `Overall stability: Bishop circles under the toe${anch ? ", passing behind each anchor tier" : ""} (FS ≥ 1/φ)`, demand: 1 / i.phiStability, capacity: stab.FS, unit: "", ref: "AASHTO 11.6.3.7, 11.8.4.1; GEC 4 5.8.3" });

  // --- deflection at the top under service loads (cantilevers): p–y below the excavation, the exposed part a beam ----
  let deflection: { top: number; y0: number; theta0: number; bend: number; V: number; M: number } | null = null;
  if (cant) {
    deflection = cantileverDeflection(i);
    add({ id: "deflection", name: "Deflection at the top (service; p–y below the excavation)", demand: deflection.top, capacity: i.deflectionLimit, unit: "in", ref: "AASHTO 11.8.3.1, 10.7.2.2; FHWA GEC 9", advisory: true });
  }
  let beam: ReturnType<typeof anchoredDeflection> | null = null;
  let staged: ReturnType<typeof stagedDeflection> | null = null;
  if (anch) {
    beam = anchoredDeflection(i, anch);
    if (i.staged) staged = stagedDeflection(i, anch.rows.map((r) => r.Tservice));
    const worst = staged ? Math.abs(staged.max) : Math.abs(beam.max);
    add({ id: "deflection", name: staged ? `Deflection (service; the construction sequence, the largest at "${staged.at}")` : `Deflection (service; a beam on springs, anchors locked off at ${Math.round(i.lockOff * 100)}%)`, demand: worst, capacity: i.deflectionLimit, unit: "in", ref: "AASHTO 11.9.3.1; GEC 4 5.5.1, 5.11.1", advisory: true });
  }

  // --- seismic, Extreme Event I (AASHTO 11.8.6, 11.9.6): γ = 1.0, φ = 1.0, overall stability φ = 0.9 ----------------
  let quakeCant: { kh: number; D0: number; Dreq: number; Mmax: number } | null = null;
  let quakeStab: ReturnType<typeof overallStability> | null = null;
  if (i.seismic) {
    const kh = i.As * (i.khHalf ? 0.5 : 1);
    if (cant) {
      let q: ReturnType<typeof cantileverOf> | null = null;
      try {
        q = cantileverOf({ ...i, gEH: 1, gES: 1, gLS: 0.5, phiP: 1 }, kh);
      } catch {
        q = null; // no embedment balances it in the earthquake (e.g. the passive soil liquefies)
      }
      quakeCant = q ? { kh, D0: q.D0, Dreq: q.Dreq, Mmax: q.Mmax } : { kh, D0: Infinity, Dreq: Infinity, Mmax: Infinity };
      add({ id: "eq-embedment", name: q ? "Seismic: embedment (M–O active and passive, γ 1.0, φ 1.0)" : "Seismic: no embedment balances the wall in the earthquake", demand: quakeCant.Dreq, capacity: i.D, unit: "ft", ref: "AASHTO 11.8.6.2, 11.8.6.3" });
      if (q) add({ id: "eq-flexure", name: "Seismic: the element in flexure (φ 1.0)", demand: q.Mmax, capacity: elem.Mn, unit: discrete ? "kip·ft" : "kip·ft/ft", ref: "AASHTO 11.8.6.1" });
    } else if (anch?.quake) {
      add({ id: "eq-flexure", name: "Seismic: the element in flexure (φ 1.0)", demand: anch.quake.Mmax * s, capacity: elem.Mn, unit: discrete ? "kip·ft" : "kip·ft/ft", ref: "AASHTO 11.9.6" });
    }
    quakeStab = overallStability(i, anch, 0.5 * i.As);
    add({ id: "eq-stability", name: "Seismic: overall stability, kh = 0.5·As (FS ≥ 1/0.9)", demand: 1 / 0.9, capacity: quakeStab.FS, unit: "", ref: "AASHTO 11.8.6.1, 11.5.8" });
  }

  // --- liquefaction (Idriss and Boulanger 2008; AASHTO 10.5.4.2) ----------------------------------------------------
  let liquefaction: { z: number; front: boolean; FS: number; N1cs: number; CSR: number }[] = [];
  if (i.liquefaction && i.seismic && i.water !== null) {
    for (let z = Math.ceil(i.water); z <= i.H + i.D; z += 1) {
      const back = liquefactionAt(i, z, false);
      if (back) liquefaction.push({ z, front: false, FS: back.FS, N1cs: back.N1cs, CSR: back.CSR });
      const fr = liquefactionAt(i, z, true);
      if (fr) liquefaction.push({ z, front: true, FS: fr.FS, N1cs: fr.N1cs, CSR: fr.CSR });
    }
    const worst = liquefaction.reduce((a, x) => (x.FS < a ? x.FS : a), Infinity);
    add({ id: "eq-liquefaction", name: liquefaction.length ? "Liquefaction: the lowest FS against triggering (behind and in front; passive lost where it liquefies)" : "Liquefaction: no saturated cohesionless soil", demand: 1, capacity: worst, unit: "", ref: "AASHTO 10.5.4.2; Idriss and Boulanger (2008)" });
  } else liquefaction = [];

  // --- piping where water seeps under a sheet pile wall (EM 1110-2-2504; a flow net, EM 1110-2-1901) ---------------
  const seep = seepageOf(i);
  const net = flowNetOf(i);
  let piping: { grad: number; ic: number; FS: number; target: number } | null = null;
  if (seep) {
    const front = soilAt(i.layers, null, i.H + 0.1).layer;
    const ic = (front.gamma - 62.4) / 62.4;
    const FS = ic / (net ? net.exitGradient : seep.grad);
    const target = i.temporary ? 1.5 : 2.0;
    piping = { grad: net ? net.exitGradient : seep.grad, ic, FS, target };
    add({ id: "piping", name: `Piping: the critical gradient γ′/γw over the exit gradient ≥ ${target}`, demand: target, capacity: FS, unit: "", ref: "USACE EM 1110-2-2504; GEC 4 5.8" });
  }

  return {
    ok: checks.every((c) => c.ok || c.advisory),
    checks,
    b,
    s,
    cant,
    anch,
    element: { ...elem, Mu, Vu, Mft },
    lagging: lag,
    precast,
    stage,
    wales,
    axial,
    heave,
    stability: stab,
    deflection,
    beam,
    staged,
    liquefaction,
    net,
    quakeCant,
    quakeStab,
    seep,
    piping,
    pressures: {
      back: (z: number) => pBack(z, i.support === "cantilever" ? i.gEH : 1),
      front: (z: number) => (z > i.H ? i.phiP * passiveAt(i, z).p : 0),
    },
  };
}

export type ShoringResult = ReturnType<typeof designShoring>;
