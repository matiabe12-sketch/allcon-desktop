import { FATIGUE_CATEGORIES, fatigueResistance } from "./steel-details";

// Bolted field splices of a composite I-girder, AASHTO LRFD 10th Edition 6.13.6.1.3, designed here: each flange
// spliced by an outer plate and two inner plates (double shear), the web by a plate on each side, all
// slip-critical with standard holes (6.13.6.1.3a), at least two rows of bolts each side of the joint.
//  - Flanges (6.13.6.1.3b): each splice develops the smaller design yield resistance Pfy = Fyf Ae of the flanges
//    either side (Ae by Eq. 6.13.6.1.3b-2); bolts in shear with the filler factor of Eq. 6.13.6.1.4-1, bearing at
//    the holes (6.13.2.9), the plates in tension (6.13.5.2) and block shear (6.13.4); the flanges' moment
//    resistance against the factored moment, the rest to the web.
//  - Web (6.13.6.1.3c): the smaller factored shear resistance of the web either side, with the horizontal force
//    Hw where the flanges can't carry the moment; slip under the Service II or deck casting shear, with Hw where
//    the flange bolts' slip resistance can't carry the moment for slip.
//  - Slip (6.13.2.8) at Service II and the deck's casting; the tension flange's net section (6.10.1.8); the base
//    metal at the gross section, Category B (Table 6.6.1.2.3-1).
// Inches, kips, ksi; moments kip·ft.

export type SpliceInputs = {
  check: boolean;
  shopWelded: number[]; // ft: section changes made in the shop (welded), not bolted field splices
  d: number; // in, bolt diameter
  grade: "A325" | "A490"; // ASTM F3125
  threadsFlange: "excluded" | "included"; // from the shear planes
  threadsWeb: "excluded" | "included";
  surface: "A" | "B" | "C"; // faying surface class (Table 6.13.2.8-3)
  pitch: number; // in, bolt spacing along the girder (and the web's vertical spacing, at most the sealing limit)
  gage: number; // in, between the flange bolt lines on each side of the web
  edge: number; // in, edge and end distances on the splice plates
  endGirder: number; // in, the girders' ends to their first bolts
  gap: number; // in, between the girders' ends
  Fy: number; // ksi, splice plates
  Fu: number;
};

export const SPLICE_DEFAULTS: SpliceInputs = { check: true, shopWelded: [], d: 0.875, grade: "A325", threadsFlange: "excluded", threadsWeb: "included", surface: "B", pitch: 3, gage: 3, edge: 1.5, endGirder: 1.75, gap: 0.5, Fy: 50, Fu: 65 };

const FUB = { A325: 120, A490: 150 }; // ksi, Table 6.4.3.1.1-1
const PT: Record<string, { A325: number; A490: number }> = { "0.625": { A325: 19, A490: 24 }, "0.75": { A325: 28, A490: 35 }, "0.875": { A325: 39, A490: 49 }, "1": { A325: 51, A490: 64 }, "1.125": { A325: 56, A490: 80 }, "1.25": { A325: 71, A490: 102 } };
const KS = { A: 0.3, B: 0.5, C: 0.3 }; // Table 6.13.2.8-3
/** Minimum edge distance (Table 6.13.2.6.6-1), in. */
export const EDGE_MIN: Record<string, number> = { "0.625": 0.875, "0.75": 1, "0.875": 1.125, "1": 1.25, "1.125": 1.5, "1.25": 1.625 };
/** Standard hole (Table 6.13.2.4.2-1), in. */
export const holeOf = (d: number) => d + (d >= 1 - 1e-9 ? 1 / 8 : 1 / 16);
/** The flange's tensile strength from its yield strength (Table 6.4.1-1): Grade 36, 50, 50W, HPS 70W, HPS 100W. */
export const fuOf = (Fy: number) => (Fy <= 36 ? 58 : Fy <= 50 ? 65 : Fy <= 70 ? 85 : 110);

const PHI_S = 0.8;
const PHI_BB = 0.8;
const PHI_BS = 0.8;
const PHI_Y = 0.95;
const PHI_U = 0.8;
const PHI_V = 1.0;
const PHI_VU = 0.8; // shear rupture of connection elements (6.5.4.2)
const up16 = (x: number) => Math.ceil(x * 16 - 1e-9) / 16;
const down2 = (x: number) => Math.floor(x * 2 + 1e-9) / 2;

export type Plate = { b: number; t: number };
export type SpliceSection = { D: number; tw: number; top: Plate; bottom: Plate };
export type SpliceCheck = { name: string; demand: number; capacity: number; unit: string; ref: string };

export type SpliceForces = {
  MuPos: number; // kip·ft, Strength I (≥ 0)
  MuNeg: number; // kip·ft (≤ 0)
  Vr: number; // kip, the smaller factored shear resistance of the web either side
  MsPos: number; // kip·ft, Service II
  MsNeg: number;
  Vs: number; // kip, Service II shear
  Mdeck: number; // kip·ft, the deck's casting (factored, on the steel), signed
  Vdeck: number;
  ftPos: number; // ksi, the bottom flange's Strength I stress on the gross section (positive flexure), for 6.10.1.8
  ftNeg: number; // ksi, the top flange's (negative flexure)
  fatigue: { top: number; bot: number }; // ksi, γ(Δf) at each flange, the gross section
  adttSL: number;
  life: number;
  cycles: number;
};

/** A flange splice as detailed (a benchmark's, or the user's): its plates and rows. */
export type GivenFlange = { outer: Plate; inner: Plate; rows: number };

export type FlangeSplice = {
  which: "top" | "bottom";
  b: number; // in, the narrower flange
  t1: number;
  t2: number; // in, the two flanges' thicknesses (t1 the thinner)
  nAcross: number; // bolts across the flange in a row (half each side of the web)
  rows: number; // rows each side of the joint
  n: number; // bolts each side
  gage: number; // in, between the lines on each half
  outer: Plate;
  inner: Plate; // each of the two
  filler: number; // in, on the thinner flange's side
  R: number; // Eq. 6.13.6.1.4-1 (1 without a filler of 0.25 in or more)
  Ag: number;
  An: number;
  Ae: number; // in², the thinner flange's
  Pfy: number; // kip, Eq. 6.13.6.1.3b-1, the smaller of the two flanges
  Rn: number; // kip, one bolt in double shear
  Rslip: number; // kip, one bolt, two slip planes
  length: number; // in, the connection's length along the force (each side)
  plateL: number; // in, each splice plate's length
};

export type WebSplice = {
  plate: Plate & { h: number }; // each of the two plates: width along the girder (b), thickness, height
  cols: number; // vertical lines each side
  perCol: number;
  n: number; // bolts each side
  pitch: number; // in, vertical
  filler: number;
  R: number;
  Rn: number;
  Rslip: number;
  HwStrength: number; // kip
  HwSlip: number;
  Ruw: number; // kip, the design web force
  Rsw: number; // kip, the web slip force
};

export type SpliceResult = {
  X: number;
  left: number;
  right: number; // the sections spliced (indices)
  D: number; // in, the smaller web depth
  sides: [SpliceSection, SpliceSection]; // the sections left and right of the joint
  top: FlangeSplice;
  bottom: FlangeSplice;
  web: WebSplice;
  arms: { pos: number; neg: number; webPos: number; webNeg: number }; // in
  Mflange: { pos: number; neg: number }; // kip·ft, at the strength limit state
  Mslip: { pos: number; neg: number; deck: number }; // kip·ft, the flange bolts' slip resistance
  forces: SpliceForces;
  checks: SpliceCheck[];
};

/** Bolt values: shear (one bolt, two planes, with the long-connection factor) and slip (two planes). */
function boltValues(s: SpliceInputs, threads: "excluded" | "included", length: number) {
  const Ab = (Math.PI * s.d ** 2) / 4;
  const long = length > 38 ? 0.83 : 1; // 6.13.2.7: connections longer than 38 in
  const Rn = long * (threads === "excluded" ? 0.56 : 0.45) * Ab * FUB[s.grade] * 2; // Eqs. 6.13.2.7-1, -2
  const Pt = (PT[String(s.d)] ?? PT["0.875"])[s.grade];
  const Rslip = 1.0 * KS[s.surface] * 2 * Pt; // Eq. 6.13.2.8-1, Kh = 1 for standard holes, Ns = 2
  return { Ab, Rn, Pt, Rslip, long };
}

/**
 * A flange splice: the narrower flange's width for the outer plate, inner plates either side of the web; plate
 * thicknesses and rows of bolts from the smaller design yield resistance of the two flanges.
 */
function flangeSplice(s: SpliceInputs, which: "top" | "bottom", f1: Plate, f2: Plate, Fyf: number, tw: number, given?: GivenFlange): FlangeSplice {
  const Fuf = fuOf(Fyf);
  const dh = holeOf(s.d);
  const b = Math.min(f1.b, f2.b);
  const [t1, t2] = f1.t <= f2.t ? [f1.t, f2.t] : [f2.t, f1.t];
  // Bolts across: two lines each side of the web where the half-flange takes them, at the edge distance and a
  // gage of at least 3d, the inner line its minimum edge distance inside the inner plates (1/2 in off the web).
  const half = b / 2 - tw / 2 - 0.5 - (EDGE_MIN[String(s.d)] ?? 1.125) - s.edge;
  const gage = Math.max(3 * s.d, s.gage);
  const perHalf = b >= 22 && half >= 2 * gage ? 3 : half >= gage ? 2 : 1;
  const nAcross = 2 * perHalf;
  // The smaller design yield resistance: the thinner flange's (the narrower width for both).
  const effective = (t: number) => {
    const Ag = b * t;
    const An = (b - nAcross * dh) * t;
    return { Ag, An, Ae: Math.min(((PHI_U * Fuf) / (PHI_Y * Fyf)) * An, Ag) };
  };
  const e1 = effective(t1);
  const e2 = effective(t2);
  const thin = e1.Ae <= e2.Ae ? e1 : e2;
  const Pfy = Fyf * thin.Ae;
  // Plates: the outer the flange's width, the inners to the web's side; their areas within 10% (6.13.6.1.3b).
  const outerB = b;
  const innerB = Math.max(3, down2((b - tw) / 2 - 0.5)); // flush with the flange's edge, 1/2 in or more off the web
  let to = up16(Math.max(0.375, Pfy / (PHI_Y * s.Fy) / (outerB + 2 * innerB)));
  let ti = up16(Math.max(0.375, (to * outerB) / (2 * innerB)));
  const ok = () => {
    const Ag = outerB * to + 2 * innerB * ti;
    const Ao = outerB * to;
    const Ai = 2 * innerB * ti;
    const share = Math.abs(Ao - Ai) / Math.max(Ao, Ai) <= 0.1 ? [Pfy / 2, Pfy / 2] : [(Pfy * Ao) / Ag, (Pfy * Ai) / Ag];
    const AnO = Math.min((outerB - nAcross * dh) * to, 0.85 * Ao);
    const AnI = Math.min((2 * innerB - nAcross * dh) * ti, 0.85 * Ai);
    return PHI_Y * s.Fy * Ag >= Pfy && PHI_U * s.Fu * AnO >= share[0] && PHI_U * s.Fu * AnI >= share[1];
  };
  if (given) {
    to = given.outer.t;
    ti = given.inner.t;
  } else
    for (let k = 0; k < 60 && !ok(); k++) {
      to += 1 / 16;
      ti = up16((to * outerB) / (2 * innerB));
    }
  const innerBUsed = given?.inner.b ?? innerB;
  const outerBUsed = given?.outer.b ?? outerB;
  // Filler on the thinner flange: the difference in thickness (none for 1/16 in or less).
  const filler = t2 - t1 > 1 / 16 + 1e-9 ? t2 - t1 : 0;
  const Ap = Math.min(b * t1, outerBUsed * to + 2 * innerBUsed * ti);
  const gamma = filler >= 0.25 - 1e-9 ? (filler * b) / Ap : 0;
  const R = gamma > 0 ? (1 + gamma) / (1 + 2 * gamma) : 1; // Eq. 6.13.6.1.4-1
  // Rows of bolts, at least two: Pfy over the factored shear resistance of the bolts, and enough for bearing at
  // the holes and block shear of the flange and of the plates.
  let rows = given?.rows ?? 2;
  let v = boltValues(s, s.threadsFlange, (rows - 1) * s.pitch);
  const Fuf2 = fuOf(Fyf);
  const ph = nAcross / 2;
  const enough = () => {
    const Ag = outerBUsed * to + 2 * innerBUsed * ti;
    const Ao = outerBUsed * to;
    const Ai = 2 * innerBUsed * ti;
    const equal = Math.abs(Ao - Ai) / Math.max(Ao, Ai) <= 0.1;
    const [sO, sI] = equal ? [Pfy / 2, Pfy / 2] : [(Pfy * Ao) / Ag, (Pfy * Ai) / Ag];
    return (
      PHI_S * R * v.Rn * rows * nAcross >= Pfy &&
      PHI_BB * nAcross * bearingLine(rows, s.endGirder, s.pitch, dh, s.d, Math.min(t1, to + ti), Fuf2) >= Pfy &&
      blockShear(rows, s.endGirder, s.pitch, s.edge, ph, gage, dh, t1, Fyf, Fuf2) >= Pfy &&
      blockShear(rows, s.edge, s.pitch, s.edge, ph, gage, dh, to, s.Fy, s.Fu) >= sO &&
      blockShear(rows, s.edge, s.pitch, s.edge, ph, gage, dh, ti, s.Fy, s.Fu) >= sI
    );
  };
  for (let k = 0; k < 40 && !given; k++) {
    v = boltValues(s, s.threadsFlange, (rows - 1) * s.pitch);
    if (enough()) break;
    rows++;
  }
  const length = (rows - 1) * s.pitch;
  const plateL = 2 * (s.endGirder + length + s.edge) + s.gap;
  return { which, b, t1, t2, nAcross, rows, n: rows * nAcross, gage, outer: { b: outerBUsed, t: to }, inner: { b: innerBUsed, t: ti }, filler, R, Ag: thin.Ag, An: thin.An, Ae: thin.Ae, Pfy, Rn: v.Rn, Rslip: v.Rslip, length, plateL };
}

/** Bearing at the holes of one bolt line along the force: the end hole by its clear end distance, the rest by the clear spacing. */
function bearingLine(rows: number, endDist: number, pitch: number, dh: number, d: number, t: number, Fu: number) {
  const one = (Lc: number) => Math.min(1.2 * Math.max(0, Lc) * t * Fu, 2.4 * d * t * Fu); // Eqs. 6.13.2.9-1, -2
  return one(endDist - dh / 2) + (rows - 1) * one(pitch - dh);
}

/** Block shear (6.13.4) of a plate or flange: two blocks at its edges, each torn along a line of bolts and across to the edge. */
function blockShear(rows: number, endDist: number, pitch: number, edge: number, perHalf: number, gage: number, dh: number, t: number, Fy: number, Fu: number) {
  const Avg = 2 * (endDist + (rows - 1) * pitch) * t;
  const Avn = Avg - 2 * (rows - 0.5) * dh * t;
  const Atn = 2 * Math.max(0, edge + (perHalf - 1) * gage - (perHalf - 0.5) * dh) * t;
  return PHI_BS * 1.0 * Math.min(0.58 * Fu * Avn + Fu * Atn, 0.58 * Fy * Avg + Fu * Atn); // Eq. 6.13.4-1, Rp 1 (drilled), Ubs 1
}

/**
 * The field splice at X between sections L (left) and Rt (right): its plates and bolts designed, then checked.
 * deck: the deck's thickness and the depth from the web's top to the deck's bottom (in), for the composite arms.
 */
export function designSplice(s: SpliceInputs, X: number, left: number, right: number, L: SpliceSection, Rt: SpliceSection, Fyf: number, Fyw: number, deck: { ts: number; above: number }, f: SpliceForces, given?: { top?: GivenFlange; bottom?: GivenFlange }): SpliceResult {
  const checks: SpliceCheck[] = [];
  const dh = holeOf(s.d);
  const tw = Math.min(L.tw, Rt.tw);
  const D = Math.min(L.D, Rt.D);
  const top = flangeSplice(s, "top", L.top, Rt.top, Fyf, tw, given?.top);
  const bottom = flangeSplice(s, "bottom", L.bottom, Rt.bottom, Fyf, tw, given?.bottom);
  // Moment arms (6.13.6.1.3b, c): composite positive from the bottom flange's mid-thickness to the deck's; otherwise
  // between the flanges' mid-thicknesses; the web's Hw at the deck's mid-thickness from the web's mid-depth, or D/4.
  const tb = Math.min(L.bottom.t, Rt.bottom.t);
  const tt = Math.min(L.top.t, Rt.top.t);
  const arms = { pos: tb / 2 + D + deck.above + deck.ts / 2, neg: tb / 2 + D + tt / 2, webPos: D / 2 + deck.above + deck.ts / 2, webNeg: D / 4 };
  const Mflange = { pos: (bottom.Pfy * arms.pos) / 12, neg: (Math.min(top.Pfy, bottom.Pfy) * arms.neg) / 12 };
  const slipT = top.n * top.Rslip;
  const slipB = bottom.n * bottom.Rslip;
  const Mslip = { pos: (slipB * arms.pos) / 12, neg: (Math.min(slipT, slipB) * arms.neg) / 12, deck: (Math.min(slipT, slipB) * arms.neg) / 12 };
  // Hw: the part of the factored moment the flanges can't carry, over its arm.
  const HwPos = Math.max(0, f.MuPos - Mflange.pos) * 12 / arms.webPos;
  const HwNeg = Math.max(0, Math.abs(f.MuNeg) - Mflange.neg) * 12 / arms.webNeg;
  const HwStrength = Math.max(HwPos, HwNeg);
  const Ruw = Math.hypot(f.Vr, HwStrength);
  const HwSlip = Math.max(Math.max(0, f.MsPos - Mslip.pos) * 12 / arms.webPos, Math.max(0, Math.abs(f.MsNeg) - Mslip.neg) * 12 / arms.webNeg, Math.max(0, Math.abs(f.Mdeck) - Mslip.deck) * 12 / arms.webNeg);
  const Rsw = Math.hypot(Math.max(f.Vs, Math.abs(f.Vdeck)), HwSlip);

  // --- Web splice: two plates, as deep as the inner flange plates and bolt clearances allow ---
  const Fuw = fuOf(Fyw);
  const h = Math.floor(D - 2 * (Math.max(top.inner.t, bottom.inner.t) + 2.5));
  const fillerW = Math.abs(L.tw - Rt.tw) > 1 / 16 + 1e-9 ? Math.abs(L.tw - Rt.tw) : 0;
  let tp = up16(Math.max(0.3125, tw / 2));
  const shearOk = () => {
    const Ag = 2 * h * tp;
    return PHI_V * 0.58 * s.Fy * Ag >= f.Vr && PHI_VU * 0.58 * s.Fu * Ag * (1 - dh / Math.max(s.pitch, 3 * s.d)) >= f.Vr;
  };
  for (let k = 0; k < 40 && !shearOk(); k++) tp += 1 / 16;
  const sealing = Math.min(7, 4 + 4 * tp); // Eq. 6.13.2.6.2-1, the web plate the outside ply
  let pitchV = Math.max(3 * s.d, Math.min(sealing, 2 * s.pitch));
  let cols = 2;
  let perCol = 0;
  let wv = boltValues(s, s.threadsWeb, 0);
  let Rw = 1;
  const webBolts = () => {
    perCol = Math.max(2, Math.floor((h - 2 * s.edge) / pitchV + 1e-9) + 1);
    const n = cols * perCol;
    wv = boltValues(s, s.threadsWeb, Math.max((cols - 1) * s.pitch, (perCol - 1) * pitchV));
    const Ap = Math.min(D * tw, 2 * h * tp);
    const g = fillerW >= 0.25 - 1e-9 ? (fillerW * h) / Ap : 0;
    Rw = g > 0 ? (1 + g) / (1 + 2 * g) : 1;
    // Bearing on the web at each hole, by the clear edge distance (C6.13.6.1.3c, conservative for an inclined force).
    const tb = Math.min(tw, 2 * tp);
    const bear = Math.min(1.2 * Math.max(0, s.endGirder - dh / 2) * tb * Fuw, 2.4 * s.d * tb * Fuw);
    return { n, ok: PHI_S * Rw * wv.Rn * n >= Ruw && PHI_BB * bear * n >= Ruw && n * wv.Rslip >= Rsw, bear };
  };
  let wb = webBolts();
  for (let k = 0; k < 40 && !wb.ok; k++) {
    if (pitchV > 3 * s.d + 1e-9) pitchV = Math.max(3 * s.d, pitchV - 0.5);
    else cols++;
    wb = webBolts();
  }
  const web: WebSplice = { plate: { b: 2 * (s.endGirder + (cols - 1) * s.pitch + s.edge) + s.gap, t: tp, h }, cols, perCol, n: cols * perCol, pitch: pitchV, filler: fillerW, R: Rw, Rn: wv.Rn, Rslip: wv.Rslip, HwStrength, HwSlip, Ruw, Rsw };

  // --- Checks ---
  const at = `Field splice at ${X.toFixed(1)} ft`;
  const push = (name: string, demand: number, capacity: number, unit: string, ref: string) => checks.push({ name: `${at}: ${name}`, demand, capacity, unit, ref });
  for (const fl of [top, bottom]) {
    const nm = fl.which === "top" ? "top flange" : "bottom flange";
    push(`${nm} bolts in shear, ${fl.n} – ${s.d} in ${s.grade} each side${fl.R < 1 ? `, filler ${fl.filler} in (R ${fl.R.toFixed(3)})` : ""}`, fl.Pfy, PHI_S * fl.R * fl.Rn * fl.n, "kip", "AASHTO 6.13.6.1.3b, Eqs. 6.13.2.7-1, 6.13.6.1.4-1");
    const tPly = Math.min(fl.t1, fl.outer.t + fl.inner.t);
    const bear = fl.nAcross * bearingLine(fl.rows, s.endGirder, s.pitch, dh, s.d, tPly, fuOf(Fyf));
    push(`${nm} bearing at the bolt holes`, fl.Pfy, PHI_BB * bear, "kip", "AASHTO Eqs. 6.13.2.9-1, -2");
    const Ag = fl.outer.b * fl.outer.t + 2 * fl.inner.b * fl.inner.t;
    push(`${nm} splice plates, gross yielding`, fl.Pfy, PHI_Y * s.Fy * Ag, "kip", "AASHTO 6.13.5.2, Eq. 6.8.2.1-1");
    const Ao = fl.outer.b * fl.outer.t;
    const Ai = 2 * fl.inner.b * fl.inner.t;
    const equal = Math.abs(Ao - Ai) / Math.max(Ao, Ai) <= 0.1;
    const shareO = equal ? fl.Pfy / 2 : (fl.Pfy * Ao) / Ag;
    const shareI = equal ? fl.Pfy / 2 : (fl.Pfy * Ai) / Ag;
    push(`${nm} outer plate, net fracture`, shareO, PHI_U * s.Fu * Math.min((fl.outer.b - fl.nAcross * dh) * fl.outer.t, 0.85 * Ao), "kip", "AASHTO 6.13.5.2, Eq. 6.8.2.1-2");
    push(`${nm} inner plates, net fracture`, shareI, PHI_U * s.Fu * Math.min((2 * fl.inner.b - fl.nAcross * dh) * fl.inner.t, 0.85 * Ai), "kip", "AASHTO 6.13.5.2, Eq. 6.8.2.1-2");
    const ph = fl.nAcross / 2;
    push(`${nm} outer plate, block shear`, shareO, blockShear(fl.rows, s.edge, s.pitch, s.edge, ph, fl.gage, dh, fl.outer.t, s.Fy, s.Fu), "kip", "AASHTO Eq. 6.13.4-1");
    // The inner plates flush with the flange's edges: the same bolt lines and edge distance as the outer plate.
    push(`${nm} inner plates, block shear`, shareI, blockShear(fl.rows, s.edge, s.pitch, s.edge, ph, fl.gage, dh, fl.inner.t, s.Fy, s.Fu), "kip", "AASHTO Eq. 6.13.4-1");
    push(`${nm} block shear`, fl.Pfy, blockShear(fl.rows, s.endGirder, s.pitch, s.edge, ph, fl.gage, dh, fl.t1, Fyf, fuOf(Fyf)), "kip", "AASHTO Eq. 6.13.4-1");
    const lineIn = fl.b / 2 - s.edge - (ph - 1) * fl.gage; // the inner line from the web's center
    push(`${nm} inner bolt line inside the inner plates by the minimum edge distance`, (EDGE_MIN[String(s.d)] ?? 1.125) + tw / 2 + (fl.b - tw) / 2 - fl.inner.b, lineIn, "in", "AASHTO Table 6.13.2.6.6-1");
    push(`${nm} at least two rows each side`, 2, fl.rows, "rows", "AASHTO 6.13.6.1.3a");
    push(`${nm} edge distance at most 8t and 5 in`, s.edge, Math.min(5, 8 * Math.min(fl.outer.t, fl.inner.t)), "in", "AASHTO 6.13.2.6.6");
    push(`${nm} sealing: bolt spacing`, s.pitch, Math.min(7, 4 + 4 * Math.min(fl.outer.t, fl.inner.t)), "in", "AASHTO Eq. 6.13.2.6.2-1");
  }
  if (f.ftPos > 0) push("bottom flange net section at the holes, Strength I", f.ftPos, Math.min(0.84 * (bottom.An / bottom.Ag) * fuOf(Fyf), Fyf), "ksi", "AASHTO Eq. 6.10.1.8-1");
  if (f.ftNeg > 0) push("top flange net section at the holes, Strength I", f.ftNeg, Math.min(0.84 * (top.An / top.Ag) * fuOf(Fyf), Fyf), "ksi", "AASHTO Eq. 6.10.1.8-1");
  push(`web bolts in shear, ${web.n} – ${s.d} in each side (Vr ${f.Vr.toFixed(0)}${HwStrength > 0 ? `, Hw ${HwStrength.toFixed(0)}` : ""} kip)`, Ruw, PHI_S * web.R * web.Rn * web.n, "kip", "AASHTO 6.13.6.1.3c, Eqs. 6.13.2.7-1, -2");
  push("web bearing at the bolt holes (clear edge distance)", Ruw, PHI_BB * wb.bear * web.n, "kip", "AASHTO C6.13.6.1.3c, Eq. 6.13.2.9-2");
  push(`web bolts against slip (V ${Math.max(f.Vs, Math.abs(f.Vdeck)).toFixed(0)}${HwSlip > 0 ? `, Hw ${HwSlip.toFixed(0)}` : ""} kip)`, Rsw, web.n * web.Rslip, "kip", "AASHTO 6.13.6.1.3c, Eq. 6.13.2.8-1");
  push("web splice plates, shear yielding", f.Vr, PHI_V * 0.58 * s.Fy * 2 * h * tp, "kip", "AASHTO Eq. 6.13.5.3-1");
  push("web splice plates, shear rupture", f.Vr, PHI_VU * 0.58 * s.Fu * 2 * (h - web.perCol * dh) * tp, "kip", "AASHTO Eq. 6.13.5.3-2");
  if (HwStrength > 0) push("web splice plates in tension under Hw", HwStrength, PHI_Y * s.Fy * 2 * h * tp, "kip", "AASHTO 6.13.5.2");
  push("web at least two vertical lines each side", 2, web.cols, "lines", "AASHTO 6.13.6.1.3a");
  push("web sealing: vertical bolt spacing", web.pitch, Math.min(7, 4 + 4 * tp), "in", "AASHTO Eq. 6.13.2.6.2-1");
  push("bolt spacing at least 3d", 3 * s.d, s.pitch, "in", "AASHTO 6.13.2.6.1");
  push("edge distance at least the minimum", EDGE_MIN[String(s.d)] ?? 1.125, Math.min(s.edge, s.endGirder), "in", "AASHTO Table 6.13.2.6.6-1");
  // Fatigue: the base metal at the gross section next to the slip-critical connection, Category B.
  const fr = fatigueResistance(FATIGUE_CATEGORIES.B, f.adttSL, f.cycles, f.life);
  if (f.fatigue.bot > 0) push(`bottom flange base metal, category B, ${fr.combo}`, fr.gamma * f.fatigue.bot, fr.Fn, "ksi", "AASHTO 6.6.1.2.2, Table 6.6.1.2.3-1 (Condition 2.1)");
  if (f.fatigue.top > 0) push(`top flange base metal, category B, ${fr.combo}`, fr.gamma * f.fatigue.top, fr.Fn, "ksi", "AASHTO 6.6.1.2.2, Table 6.6.1.2.3-1 (Condition 2.1)");
  return { X, left, right, D, sides: [L, Rt], top, bottom, web, arms, Mflange, Mslip, forces: f, checks };
}
