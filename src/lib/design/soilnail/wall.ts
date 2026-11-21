import { DesignError, type Check } from "../walls/cip";
import type { TakeoffSettings } from "../takeoff/types";

// A soil nail wall by FHWA GEC 7, Soil Nail Walls Reference Manual (FHWA-NHI-14-007, 2015), the manual CDOT's Bridge
// Design Manual (11.5.6) recommends, LRFD after AASHTO:
// - internal stability (Step 6a): Bishop's simplified method over circles through the toe, each nail crossing a circle
//   pulling the sliding mass back with the least of its pullout behind the circle / FS_PO, its tendon / FS_T and its
//   facing plus pullout in front / FS_F (Table 5.1: 2.0, 1.8, 1.5); FS_OS against Table 5.1's minimums, at the final
//   stage and at each excavation stage; Tmax, the largest nail force at the critical circle;
// - global stability (Step 6b): circles behind all the nails and under the toe, the nails disregarded;
// - basal heave (Step 6c, Eq. 5.16) and sliding of the nailed block (Steps 6d, 7b; Eqs. 5.17 to 5.23);
// - the LRFD verifications (Step 7) on γ·Tmax, γ = γEV = 1.35: pullout, the tendon, the facing in flexure (Eqs. 6.9 to
//   6.14) and punching shear (Eqs. 6.19 to 6.25) at the nail head force To (Eq. 5.1), the headed studs (Eqs. 6.26 to
//   6.29), the facing's reinforcement ratios;
// - displacements (Step 8, Eqs. 5.30, 5.31); seismic (Step 9) by a pseudo-static kh in the stability analyses.
// kip, ft, in; bond in psi and unit weights in pcf as the manual gives them.

export type NailLayer = { name: string; thickness: number; gamma: number; phi: number; c: number; bond: number }; // ft, pcf, deg, psf, psi (nominal bond qu)

export type SoilNailInputs = {
  H: number; // ft, wall height
  batter: number; // deg from vertical (face leaning back)
  backslope: number; // deg, the ground behind
  surcharge: number; // psf, uniform behind the wall
  water: number | null; // ft below the top, the water table; null: drained
  layers: NailLayer[];
  // Nails
  rows: number;
  sv0: number; // ft, the top of the wall to the first row
  sv: number; // ft, vertical spacing
  sh: number; // ft, horizontal spacing
  lengths: number[]; // ft, each row from the top (the last repeats for the rest)
  incline: number; // deg below horizontal
  hole: number; // in, drill hole diameter
  bar: number; // bar size
  fy: number; // ksi (60 or 75, ASTM A615)
  // Initial facing (shotcrete)
  hi: number; // in
  fcI: number; // ksi
  wwm: number; // in²/ft each way (welded wire mesh)
  fyWwm: number; // ksi
  headBars: number; // added bars at each nail head, each way
  headBar: number; // bar size
  plate: number; // in, bearing plate side
  plateT: number; // in
  // Final facing (permanent walls)
  permanent: boolean;
  critical: boolean; // the Owner considers the wall critical (Table 5.1)
  hf: number; // in
  fcF: number; // ksi
  finalBar: number; // each way
  finalSpacing: number; // in
  studs: number; // headed studs per nail head
  studD: number; // in, shaft
  studHeadD: number; // in
  studHeadT: number; // in
  studL: number; // in
  studSpacing: number; // in
  studFy: number; // ksi
  studA325: boolean;
  // Displacements, heave, seismic
  stageOver: number; // ft, each lift excavated below its nail row before the row is installed
  stiff: boolean; // weathered rock or stiff soil (Table 5.12)
  excavationWidth: number; // ft (basal heave)
  seismic: boolean;
  As: number;
  khHalf: boolean;
  takeoff?: TakeoffSettings;
};

/** The defaults: GEC 7 Appendix C's 25 ft wall in medium dense silty sand, #7 Grade 75 nails at 5 ft (here 22 ft long,
 * a non-critical permanent wall), a 4 in shotcrete initial facing and an 8 in CIP final facing. */
export const SOIL_NAIL_DEFAULTS: SoilNailInputs = {
  H: 25,
  batter: 0,
  backslope: 0,
  surcharge: 150,
  water: null,
  layers: [{ name: "Medium dense silty sand", thickness: 60, gamma: 125, phi: 32, c: 100, bond: 14.5 }],
  rows: 5,
  sv0: 3,
  sv: 5,
  sh: 5,
  lengths: [22],
  incline: 15,
  hole: 6,
  bar: 7,
  fy: 75,
  hi: 4,
  fcI: 4,
  wwm: 0.058,
  fyWwm: 60,
  headBars: 2,
  headBar: 5,
  plate: 9,
  plateT: 1,
  permanent: true,
  critical: false,
  hf: 8,
  fcF: 4,
  finalBar: 4,
  finalSpacing: 12,
  studs: 4,
  studD: 0.5,
  studHeadD: 1,
  studHeadT: 0.31,
  studL: 4.125,
  studSpacing: 6,
  studFy: 60,
  studA325: false,
  stageOver: 1,
  stiff: false,
  excavationWidth: 40,
  seismic: false,
  As: 0.1,
  khHalf: false,
};

/** Solid threaded bars (GEC 7 Table A.1): nominal area (in²). */
export const NAIL_BARS: Record<number, number> = { 6: 0.44, 7: 0.6, 8: 0.79, 9: 1.0, 10: 1.27, 11: 1.56, 14: 2.25 };
const BAR_AREA: Record<number, number> = { 3: 0.11, 4: 0.2, 5: 0.31, 6: 0.44, 7: 0.6, 8: 0.79 };

const GW = 0.0624;
const rad = (d: number) => (d * Math.PI) / 180;

function layerAt(layers: NailLayer[], z: number) {
  let acc = 0;
  for (let k = 0; k < layers.length; k++) {
    if (k === layers.length - 1 || z < acc + layers[k].thickness) return layers[k];
    acc += layers[k].thickness;
  }
  return layers[layers.length - 1];
}

/** The nails: each row's depth, length and its head and end points (x behind the face's toe, y up from the wall's top). */
export function nailsOf(i: SoilNailInputs) {
  const tb = Math.tan(rad(i.batter));
  return Array.from({ length: i.rows }, (_, k) => {
    const z = i.sv0 + k * i.sv;
    const L = i.lengths[Math.min(k, i.lengths.length - 1)];
    const x0 = (i.H - z) * tb; // on the battered face
    const p0: [number, number] = [x0, -z];
    const p1: [number, number] = [x0 + L * Math.cos(rad(i.incline)), -z - L * Math.sin(rad(i.incline))];
    return { row: k + 1, z, L, p0, p1 };
  });
}

/** The nail's nominal resistances (kip): the tendon, and the facing (the least of flexure and punching at the head). */
export function facingOf(i: SoilNailInputs) {
  const smaxM = Math.max(i.sh, i.sv) / 3.281;
  const toFactor = 0.6 + 0.2 * (smaxM - 1); // Eq. 5.1: To = Tmax[0.6 + 0.2(Smax − 1)], Smax in m
  // Bending resistance per unit width (kip·ft/ft), bars at mid-thickness (Eqs. 6.9 to 6.12).
  const m = (a: number, fy: number, h: number, fc: number) => (a * fy * (h / 2 - (a * fy) / (1.7 * fc * 12))) / 12;
  // Initial facing: WWM everywhere, the added bars at the heads (Eqs. 6.7, 6.8, equivalent areas for different grades).
  const barA = BAR_AREA[i.headBar] ?? 0.31;
  const avn = i.wwm + ((i.headBars * barA) / i.sh) * (60 / i.fyWwm);
  const ahn = i.wwm + ((i.headBars * barA) / i.sv) * (60 / i.fyWwm);
  const CF = i.hi <= 4 ? 2 : i.hi >= 8 ? 1 : i.hi <= 6 ? 2 - ((i.hi - 4) / 2) * 0.5 : 1.5 - ((i.hi - 6) / 2) * 0.5; // Table 6.5
  const rffV = CF * (m(avn, i.fyWwm, i.hi, i.fcI) + m(i.wwm, i.fyWwm, i.hi, i.fcI)) * ((8 * i.sh) / i.sv); // Eq. 6.13
  const rffH = CF * (m(ahn, i.fyWwm, i.hi, i.fcI) + m(i.wwm, i.fyWwm, i.hi, i.fcI)) * ((8 * i.sv) / i.sh); // Eq. 6.14
  const initial = {
    CF,
    avn,
    avm: i.wwm,
    RFF: Math.min(rffV, rffH),
    // Punching (Eqs. 6.20 to 6.23): VF = 0.58·√f′c[psi]·π·D′c·hc [ft] kip, D′c = LBP + hi, hc = hi.
    Dc: i.plate + i.hi,
    hc: i.hi,
    RFP: 0.58 * Math.sqrt(i.fcI * 1000) * Math.PI * ((i.plate + i.hi) / 12) * (i.hi / 12),
    rho: ((avn + i.wwm) / (12 * (i.hi / 2))) * 100,
    rhoMin: (0.24 * Math.sqrt(i.fcI * 1000)) / i.fyWwm,
    rhoMax: 50 * (i.fcI / i.fyWwm) * (90 / (90 + i.fyWwm)),
  };
  let final: null | { a: number; RFF: number; Dc: number; hc: number; RFP: number; RFH: number; rho: number; rhoMin: number; rhoMax: number; As: number; AH: number } = null;
  if (i.permanent) {
    const a = ((BAR_AREA[i.finalBar] ?? 0.2) * 12) / i.finalSpacing;
    const RFF = Math.min((m(a, 60, i.hf, i.fcF) * 2 * 8 * i.sh) / i.sv, (m(a, 60, i.hf, i.fcF) * 2 * 8 * i.sv) / i.sh); // CF = 1
    const hc = i.studL + i.plateT - i.studHeadT; // Eq. 6.25
    const Dc = Math.min(i.studSpacing + hc, 2 * hc); // Eq. 6.24
    const As = (Math.PI * i.studD ** 2) / 4;
    const AH = (Math.PI * (i.studHeadD ** 2 - i.studD ** 2)) / 4;
    final = {
      a,
      RFF,
      Dc,
      hc,
      RFP: 0.58 * Math.sqrt(i.fcF * 1000) * Math.PI * (Dc / 12) * (hc / 12),
      RFH: i.studs * As * i.studFy, // Eq. 6.26
      rho: ((2 * a) / (12 * (i.hf / 2))) * 100,
      rhoMin: (0.24 * Math.sqrt(i.fcF * 1000)) / 60,
      rhoMax: 50 * (i.fcF / 60) * (90 / 150),
      As,
      AH,
    };
  }
  // The facing's resistance at the head that limits a nail in the stability analyses: the weaker facing.
  const facing = Math.min(initial.RFF, initial.RFP, ...(final ? [final.RFF, final.RFP, final.RFH] : []));
  return { toFactor, initial, final, facing };
}

type Circle = { xc: number; yc: number; R: number };

/** The face's x at height y (the face leans back by the batter from its toe at x = 0, y = −H). */
export const faceX = (i: SoilNailInputs, y: number) => (i.H + y) * Math.tan(rad(i.batter));

/** The ground's height at x with the excavation at depth He: in front the excavation's floor, then the face, then the
 * ground behind (level, or the backslope from the face's top). */
export function groundOf(i: SoilNailInputs, He: number) {
  const tbs = Math.tan(rad(Math.min(Math.max(0, i.backslope), 60)));
  const tb = Math.tan(rad(i.batter));
  const xToe = faceX(i, -He);
  const xTop = faceX(i, 0);
  return (x: number) => (x < xToe ? -He : x < xTop ? (tb > 0 ? x / tb - i.H : 0) : Math.min((x - xTop) * tbs, 3 * i.H));
}

/** Bishop's simplified method for one circle (per foot of wall): the soil's resistance divided by FS, the nails' allowable
 * forces (their own factors of safety) and kh as moments. Returns FS and each crossing nail's force (kip per nail). */
function bishop(i: SoilNailInputs, c: Circle, H: number, nails: ReturnType<typeof nailsOf>, useNails: boolean, kh: number) {
  const { xc, yc, R } = c;
  const groundAt = groundOf(i, H);
  const tb = Math.tan(rad(i.batter));
  // The circle must come up through the ground at each end, or within a tension crack 2c/γ·tan(45 + φ/2).
  const crack = (x: number) => {
    const l = layerAt(i.layers, x < 0 ? H + 0.01 : 0.01);
    return ((2 * l.c) / l.gamma) * Math.tan(rad(45 + l.phi / 2));
  };
  if (groundAt(xc - R) - yc > crack(xc - R) + 1e-9 || groundAt(xc + R) - yc > crack(xc + R) + 1e-9) return null;
  const n = 80;
  const bw = (2 * R) / n;
  const q = i.surcharge / 1000;
  const parts: { W: number; c: number; tanPhi: number; sinA: number; cosA: number; u: number }[] = [];
  let drive = 0;
  for (let k = 0; k < n; k++) {
    const xm = xc - R + (k + 0.5) * bw;
    const dx = xm - xc;
    if (Math.abs(dx) >= R) continue;
    const yb = yc - Math.sqrt(R * R - dx * dx);
    const gt = groundAt(xm);
    if (yb >= gt) continue;
    let W = 0;
    for (let t = 0; t < 6; t++) {
      const y = yb + ((t + 0.5) * (gt - yb)) / 6;
      W += (layerAt(i.layers, Math.max(0, -y)).gamma / 1000) * ((gt - yb) / 6);
    }
    W = W * bw + (xm > i.H * tb ? q * bw : 0);
    const lay = layerAt(i.layers, Math.max(0, -yb));
    const u = i.water !== null && -yb > i.water ? GW * (-yb - i.water) * bw : 0;
    const sinA = dx / R;
    parts.push({ W, c: (lay.c / 1000) * bw, tanPhi: Math.tan(rad(lay.phi)), sinA, cosA: Math.sqrt(1 - sinA * sinA), u });
    drive += W * dx + kh * W * (yc - (yb + gt) / 2);
  }
  if (!parts.length) return null;
  // The nails crossing the circle: from the face (inside the sliding mass) to beyond the circle.
  const D = i.hole / 12;
  const RT = (NAIL_BARS[i.bar] ?? 0.6) * i.fy;
  const fac = facingOf(i).facing;
  let Mn = 0;
  const forces: { row: number; T: number; mode: string; Lp: number; Lf: number; bond: number }[] = [];
  if (useNails) {
    for (const nl of nails) {
      if (-nl.p0[1] > H) continue; // not installed yet at this stage
      const [x0, y0] = nl.p0;
      const dx = Math.cos(rad(i.incline));
      const dy = -Math.sin(rad(i.incline));
      // |p0 + t·d − C|² = R²
      const fx = x0 - xc;
      const fy = y0 - yc;
      const b = fx * dx + fy * dy;
      const cc = fx * fx + fy * fy - R * R;
      if (cc >= 0) continue; // the head isn't inside the circle
      const t = -b + Math.sqrt(b * b - cc); // where the nail leaves the circle
      if (t >= nl.L) continue; // the whole nail moves with the mass
      const px = x0 + t * dx;
      const py = y0 + t * dy;
      const bondBehind = layerAt(i.layers, Math.max(0, -(py + (y0 + nl.L * dy - py) / 2))).bond;
      const bondFront = layerAt(i.layers, Math.max(0, -(y0 + py) / 2)).bond;
      const Lp = nl.L - t;
      const Rpo = (bondBehind * 144 * Math.PI * D * Lp) / 1000;
      const Rfront = (bondFront * 144 * Math.PI * D * t) / 1000;
      const cand = [
        { T: Rpo / 2.0, mode: "pullout" },
        { T: RT / 1.8, mode: "tensile" },
        { T: fac / 1.5 + Rfront / 2.0, mode: "facing" },
      ];
      const g = cand.reduce((a, x) => (x.T < a.T ? x : a));
      forces.push({ row: nl.row, T: g.T, mode: g.mode, Lp, Lf: t, bond: bondBehind });
      const T = g.T / i.sh;
      Mn += T * (-(px - xc) * Math.sin(rad(i.incline)) - (py - yc) * Math.cos(rad(i.incline)));
    }
  }
  // The nails' (allowable) forces resist alongside the soil, so FS = (soil + nails) / driving: the nails' moment isn't
  // taken off the driving side, where it would inflate FS.
  if (drive <= 1e-9) return { FS: Infinity, forces };
  let F = 1.5;
  for (let it = 0; it < 40; it++) {
    let res = 0;
    for (const p of parts) res += (p.c + Math.max(0, p.W - p.u) * p.tanPhi) / (p.cosA + (p.sinA * p.tanPhi) / F);
    const next = (res * R + Mn) / drive;
    if (Math.abs(next - F) < 1e-6) {
      F = next;
      break;
    }
    F = next;
  }
  return { FS: F, forces };
}

/** The lowest FS over circles through the toe (internal) or under it and behind all the nails (global). */
export function stabilitySearch(i: SoilNailInputs, o: { H: number; global: boolean; kh: number }) {
  const nails = nailsOf(i);
  const toe: [number, number] = [faceX(i, -o.H), -o.H];
  const maxReach = Math.max(...nails.map((n) => n.p1[0]), o.H);
  let best: { FS: number; c: Circle; forces: { row: number; T: number; mode: string; Lp: number; Lf: number; bond: number }[] } = { FS: Infinity, c: { xc: 0, yc: 0, R: 1 }, forces: [] };
  const consider = (c: Circle) => {
    if (o.global) {
      // Behind every nail: each nail's end inside the circle (the nails move with the mass).
      if (nails.some((n) => Math.hypot(n.p1[0] - c.xc, n.p1[1] - c.yc) >= c.R || Math.hypot(n.p0[0] - c.xc, n.p0[1] - c.yc) >= c.R)) return;
    }
    const r = bishop(i, c, o.H, nails, !o.global, o.kh);
    if (r && r.FS > 0 && r.FS < best.FS) best = { FS: r.FS, c, forces: r.forces };
  };
  const span0 = 1.5 * Math.max(o.H, maxReach);
  const depths = o.global ? [0, 0.15, 0.3, 0.5].map((f) => f * o.H) : [0];
  for (const dz of depths) {
    const P: [number, number] = [toe[0], toe[1] - dz];
    let cx = 0.4 * maxReach;
    let cy = 0.5 * o.H;
    let span = span0;
    for (let pass = 0; pass < 3; pass++) {
      for (let a = 0; a <= 14; a++)
        for (let b = 0; b <= 14; b++) {
          const xc = cx - span + (2 * span * a) / 14;
          const yc = cy - span + (2 * span * b) / 14;
          if (yc < P[1] + 1) continue;
          consider({ xc, yc, R: Math.hypot(xc - P[0], yc - P[1]) });
        }
      if (Number.isFinite(best.FS)) {
        cx = best.c.xc;
        cy = best.c.yc;
      }
      span /= 4;
    }
  }
  return best;
}

export function designSoilNail(i: SoilNailInputs) {
  if (!(i.H > 0 && i.rows > 0 && i.sv > 0 && i.sh > 0)) throw new DesignError("The wall needs a height and a nail pattern.");
  if (i.sv0 + (i.rows - 1) * i.sv >= i.H) throw new DesignError("The nail rows go below the bottom of the wall.");
  if (!i.layers.length) throw new DesignError("The wall needs the soil.");
  const checks: Check[] = [];
  const add = (c: Omit<Check, "ok"> & { ok?: boolean }) => checks.push({ ...c, ok: c.ok ?? c.demand <= c.capacity });
  const nails = nailsOf(i);
  const g = 1.35; // γEV, the load factor for the LRFD verifications (GEC 7 6.6.1)

  // --- internal stability, final and construction stages (Step 6a; Table 5.1) -------------------------------------
  const fsMin = i.permanent ? (i.critical ? 1.5 : 1.35) : i.critical ? 1.3 : 1.2;
  const fsStage = i.critical ? 1.3 : 1.2;
  const internal = stabilitySearch(i, { H: i.H, global: false, kh: 0 });
  add({ id: "internal", name: "Internal stability: Bishop circles through the toe, the nails limited by pullout/2.0, tendon/1.8, facing/1.5", demand: fsMin, capacity: internal.FS, unit: "", ref: "GEC 7 6.5.1, Table 5.1" });
  const stages = nails.map((n, k) => {
    const Hs = Math.min(i.H, n.z + i.stageOver); // each lift excavated a little below its row, to drill it
    const iStage = { ...i, rows: k }; // the rows above installed
    const r = k === 0 ? stabilitySearch({ ...i, rows: 0 } as SoilNailInputs, { H: Hs, global: false, kh: 0 }) : stabilitySearch(iStage, { H: Hs, global: false, kh: 0 });
    return { name: `Excavated to ${Hs.toFixed(1)} ft, before row ${k + 1}`, Hs, FS: r.FS, c: r.c };
  });
  const worstStage = stages.reduce((a, s) => (s.FS < a.FS ? s : a), stages[0]);
  add({ id: "stages", name: `Construction stages: the lowest at "${worstStage.name}"`, demand: fsStage, capacity: worstStage.FS, unit: "", ref: "GEC 7 6.5.1 (iii), Table 5.1" });

  // --- global stability (Step 6b): behind the nails, under the toe ---------------------------------------------------
  const global = stabilitySearch(i, { H: i.H, global: true, kh: 0 });
  add({ id: "global", name: "Global stability: circles behind all the nails and under the toe (nails disregarded)", demand: fsMin, capacity: global.FS, unit: "", ref: "GEC 7 6.5.2" });

  // --- Tmax and the LRFD verifications (Step 7) -----------------------------------------------------------------
  const top = internal.forces.reduce((a, f) => (f.T > a.T ? f : a), { row: 0, T: 0, mode: "-", Lp: 0, Lf: 0, bond: i.layers[0].bond });
  const Tmax = top.T;
  const D = i.hole / 12;
  const Rpo = (top.bond * 144 * Math.PI * D * top.Lp) / 1000;
  const RT = (NAIL_BARS[i.bar] ?? 0.6) * i.fy;
  add({ id: "pullout", name: `Pullout of row ${top.row} (Lp ${top.Lp.toFixed(1)} ft behind the critical circle)`, demand: g * Tmax, capacity: 0.65 * Rpo, unit: "kip", ref: "GEC 7 6.6.2, Eq. 5.4" });
  add({ id: "tendon", name: `Tendon: #${i.bar} Grade ${i.fy}`, demand: g * Tmax, capacity: (i.fy >= 95 ? 0.65 : 0.75) * RT, unit: "kip", ref: "GEC 7 6.6.4, Table 6.3" });
  const f = facingOf(i);
  const To = Tmax * f.toFactor;
  add({ id: "face-flexure-i", name: `Initial facing in flexure (${i.hi} in shotcrete, CF ${f.initial.CF.toFixed(2)})`, demand: g * To, capacity: 0.9 * f.initial.RFF, unit: "kip", ref: "GEC 7 6.6.5, Eqs. 6.9–6.14" });
  add({ id: "face-punch-i", name: `Initial facing in punching (${i.plate} in bearing plate)`, demand: g * To, capacity: 0.9 * f.initial.RFP, unit: "kip", ref: "GEC 7 6.6.6, Eqs. 6.20–6.23" });
  add({ id: "rho-i", name: "Initial facing: reinforcement ratio at least ρmin", demand: f.initial.rhoMin, capacity: f.initial.rho, unit: "%", ref: "GEC 7 6.6.5a" });
  add({ id: "rho-i-max", name: "Initial facing: reinforcement ratio at most ρmax", demand: f.initial.rho, capacity: f.initial.rhoMax, unit: "%", ref: "GEC 7 6.6.5a" });
  if (f.final) {
    add({ id: "face-flexure-f", name: `Final facing in flexure (${i.hf} in, #${i.finalBar} @ ${i.finalSpacing} in each way)`, demand: g * To, capacity: 0.9 * f.final.RFF, unit: "kip", ref: "GEC 7 6.6.5, Eqs. 6.9–6.14" });
    add({ id: "face-punch-f", name: `Final facing in punching (headed studs, D′c ${f.final.Dc.toFixed(2)} in)`, demand: g * To, capacity: 0.9 * f.final.RFP, unit: "kip", ref: "GEC 7 6.6.6, Eqs. 6.24, 6.25" });
    add({ id: "studs", name: `Headed studs: ${i.studs} × ${i.studD} in ${i.studA325 ? "A325" : "A307"}`, demand: g * To, capacity: (i.studA325 ? 0.8 : 0.7) * f.final.RFH, unit: "kip", ref: "GEC 7 6.6.7, Eq. 6.26" });
    add({ id: "stud-head", name: "Headed studs: head area AH ≥ 2.5·As", demand: 2.5 * f.final.As, capacity: f.final.AH, unit: "in²", ref: "GEC 7 Eq. 6.28" });
    add({ id: "stud-thick", name: "Headed studs: head thickness ≥ (DH − Dsc)/2", demand: (i.studHeadD - i.studD) / 2, capacity: i.studHeadT, unit: "in", ref: "GEC 7 Eq. 6.29" });
    add({ id: "rho-f", name: "Final facing: reinforcement ratio at least ρmin", demand: f.final.rhoMin, capacity: f.final.rho, unit: "%", ref: "GEC 7 6.6.5a" });
  }

  // --- sliding of the nailed block (Steps 6d, 7b; Eqs. 5.17–5.23) -------------------------------------------------
  const BL = Math.max(...nails.map((n) => n.p1[0])); // the block's width at its base
  const tbs = Math.tan(rad(Math.min(Math.max(0, i.backslope), 60)));
  const H1 = i.H + BL * tbs;
  const back = layerAt(i.layers, i.H / 2);
  const base = layerAt(i.layers, i.H + 0.1);
  const Ka = i.backslope > 0 && back.phi > i.backslope ? (Math.cos(rad(i.backslope)) * (Math.cos(rad(i.backslope)) - Math.sqrt(Math.cos(rad(i.backslope)) ** 2 - Math.cos(rad(back.phi)) ** 2))) / (Math.cos(rad(i.backslope)) + Math.sqrt(Math.cos(rad(i.backslope)) ** 2 - Math.cos(rad(back.phi)) ** 2)) : Math.tan(rad(45 - back.phi / 2)) ** 2;
  const PA = 0.5 * Ka * (back.gamma / 1000) * H1 * H1;
  const PQ = Ka * (i.surcharge / 1000) * H1;
  const W = (back.gamma / 1000) * (i.H * BL + 0.5 * BL * BL * tbs);
  const Rsl = (base.c / 1000) * BL + W * Math.tan(rad(base.phi));
  const sliding = { BL, H1, Ka, PA, PQ, W, R: Rsl };
  add({ id: "sliding", name: "Sliding of the nailed block on its base", demand: 1.5 * PA + 1.5 * PQ, capacity: 0.9 * Rsl, unit: "kip/ft", ref: "GEC 7 5.7.3, Eqs. 5.17–5.23; φLS 0.90" });

  // --- basal heave where clay is below the excavation (Step 6c; Eq. 5.16, φBH 0.50) --------------------------------
  let heave: { Nc: number; Su: number; FS: number; target: number } | null = null;
  if (base.phi === 0 && base.c > 0) {
    const B = Math.max(1, i.excavationWidth);
    const Su = base.c / 1000;
    const Nc = Math.min(7.5, 5 * (1 + (0.2 * i.H) / B));
    const FS = (Su * Nc) / Math.max(1e-6, (back.gamma / 1000) * i.H + i.surcharge / 1000 - (Su * i.H) / (0.7 * B));
    heave = { Nc, Su, FS, target: 2 };
    add({ id: "heave", name: "Basal heave: FS ≥ 1/φBH = 2.0", demand: 2, capacity: FS, unit: "", ref: "GEC 7 5.6.6, Eq. 5.16" });
  }

  // --- displacements (Step 8; Eqs. 5.30, 5.31, Table 5.12) ---------------------------------------------------------
  const fine = back.phi === 0;
  const ratio = i.stiff ? 1 / 1000 : fine ? 1 / 333 : 1 / 500;
  const C = i.stiff ? 0.8 : fine ? 1.5 : 1.25;
  const deflection = { ratio, dh: ratio * i.H * 12, DDEF: C * i.H * (1 - Math.tan(rad(i.batter))), C };

  // --- seismic (Step 9): pseudo-static kh in the stability analyses, FS ≥ 1.1 (Table 5.1) --------------------------
  let quake: { kh: number; internal: number; global: number } | null = null;
  if (i.seismic) {
    const kh = i.As * (i.khHalf ? 0.5 : 1);
    const a = stabilitySearch(i, { H: i.H, global: false, kh });
    const b = stabilitySearch(i, { H: i.H, global: true, kh });
    quake = { kh, internal: a.FS, global: b.FS };
    add({ id: "eq-internal", name: `Seismic internal stability (kh ${kh.toFixed(3)})`, demand: 1.1, capacity: a.FS, unit: "", ref: "GEC 7 6.8, Table 5.1" });
    add({ id: "eq-global", name: `Seismic global stability (kh ${kh.toFixed(3)})`, demand: 1.1, capacity: b.FS, unit: "", ref: "GEC 7 6.8, Table 5.1" });
  }

  return { ok: checks.every((c) => c.ok || c.advisory), checks, nails, internal, global, stages, Tmax, top, Rpo, RT, To, facing: f, sliding, heave, deflection, quake, fsMin, fsStage };
}

export type SoilNailResult = ReturnType<typeof designSoilNail>;
