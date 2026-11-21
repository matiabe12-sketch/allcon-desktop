import { BARS, DesignError, type Check } from "../walls/cip";
import { roundSection } from "../piers/round-section";
import { broms, type SoilKind } from "../signals/foundation";
import { PILE_SECTIONS } from "../shoring/sections";
import type { TakeoffSettings } from "../takeoff/types";

// A ground-mounted noise wall, CDOT's typical (BDM 15.3): precast concrete panels between steel W posts set in drilled
// shafts, by AASHTO LRFD Section 15 and CDOT BDM Section 15.
// - Wind (15.8.2, 3.8.1): Pz = 2.56E-6·V²·Kz·G·CD, G 0.85 and CD 1.2 for sound barriers (Tables 3.8.1.2.1-1, -2), Kz by
//   exposure at Z ≥ 33 ft (Eqs. 3.8.1.2.1-2 to -4), Strength III (γWS 1.0); Service I at 70 mph with Kz = G = 1.
//   The panels take the pressure over their area; the posts and shafts a line load at 0.55·H (3.8.1.2.4).
// - Vehicle collision (15.8.4), Extreme Event II: Cases 1–4 by the setback behind a crashworthy railing; the panel takes
//   the full force between two posts, the post the full force at its height. CDOT BDM 15.4: none beyond 4 ft of setback
//   or outside the clear zone; TL-3 otherwise.
// - Earthquake (15.9.9), Extreme Event I: kh × the wall's weight at mid-height.
// - Panels (Section 5): flexure and shear spanning between the posts, minimum reinforcement, two mats (C15.8.4).
// - Posts (6.12): flexure Mp (the panels brace the compression flange) and shear.
// - Shafts (15.9; 11.8.4 as a single row; 3.11.5.10): Broms' embedment with φ 0.75 on the passive resistance (Table
//   11.5.7-1; 1.0 at the extreme events), flexure and shear of the shaft, CDOT's 18 in. minimum (BDM 10.6.1.1).
// - Service I: the post's deflection at the top, with the line load at 0.55·H.
// kip, ft, in.

export type Exposure = "B" | "C" | "D";

export type NoiseWallInputs = {
  H: number; // ft, the wall's height above the ground
  spacing: number; // ft, post to post
  // Panels
  tp: number; // in
  panelH: number; // ft, each precast panel's height (horizontal planks stacked between the posts)
  bar: number; // horizontal bars, each face
  barSpacing: number; // in
  cover: number; // in
  fc: number; // ksi
  fy: number; // ksi
  // Posts
  post: string; // a W shape
  Fy: number; // ksi
  // Wind
  V: number; // mph, the 3-second gust (Figure 3.8.1.1.2-1; BDM Section 32 in the special wind region)
  exposure: Exposure;
  // Collision
  collision: boolean; // in the clear zone, behind a crashworthy railing
  setback: number; // ft, the railing's traffic face to the wall (Figure 15.8.4-1)
  testLevel: 3 | 4 | 5;
  // Earthquake
  kh: number; // 0: none
  // Shaft
  shaftD: number; // in
  shaftL: number; // ft, below the ground
  shaftBars: number;
  shaftBar: number;
  shaftFc: number; // ksi
  soil: SoilKind;
  c: number; // ksf
  gamma: number; // pcf
  phi: number; // deg
  deflRatio: number; // the top's Service I deflection limit, H/ratio
  takeoff?: TakeoffSettings;
};

export const NOISE_WALL_DEFAULTS: NoiseWallInputs = {
  H: 16,
  spacing: 20,
  tp: 7,
  panelH: 4,
  bar: 4,
  barSpacing: 12,
  cover: 1.5,
  fc: 5,
  fy: 60,
  post: "W10x45",
  Fy: 50,
  V: 115,
  exposure: "C",
  collision: false,
  setback: 6,
  testLevel: 3,
  kh: 0,
  shaftD: 30,
  shaftL: 14,
  shaftBars: 8,
  shaftBar: 8,
  shaftFc: 4,
  soil: "cohesionless",
  c: 1,
  gamma: 120,
  phi: 32,
  deflRatio: 120,
};

/** Kz for Strength III by exposure (Eqs. 3.8.1.2.1-2 to -4), Z ft, at least 33 ft. */
export function kz(Z: number, e: Exposure) {
  const z = Math.max(33, Z);
  const [a, z0, d] = e === "B" ? [6.87, 0.9834, 345.6] : e === "C" ? [7.35, 0.0984, 478.4] : [7.65, 0.0164, 616.1];
  return (2.5 * Math.log(z / z0) + a) ** 2 / d;
}

/** The collision force on the wall and its height above the pavement (15.8.4), or null where it needn't be applied. */
export function collisionForce(setback: number, tl: 3 | 4 | 5) {
  const Ft = tl === 5 ? 124 : 54; // Table A13.2-1
  const Lt = tl === 3 ? 4 : tl === 4 ? 3.5 : 8;
  const h1 = tl <= 3 ? 4 : 6;
  const h2 = tl <= 3 ? 4 : 14;
  if (setback > 4) return null; // Case 4
  if (setback <= 1) return { F: Ft, h: h1, Lt, case: 1 };
  if (setback >= 4) return { F: 4, h: h2, Lt, case: 2 };
  const t = (setback - 1) / 3; // Case 3: linear between Cases 1 and 2
  return { F: Ft + (4 - Ft) * t, h: h1 + (h2 - h1) * t, Lt, case: 3 };
}

export function designNoiseWall(i: NoiseWallInputs) {
  const post = PILE_SECTIONS[i.post];
  if (!post) throw new DesignError("Choose a W shape for the posts.");
  if (!(i.H > 0 && i.spacing > 0 && i.tp > 0 && i.shaftD > 0)) throw new DesignError("The wall needs a height, a post spacing, panels and shafts.");
  const checks: Check[] = [];
  const add = (c: Omit<Check, "ok"> & { ok?: boolean }) => checks.push({ ...c, ok: c.ok ?? c.demand <= c.capacity });
  const L = i.spacing;

  // --- loads ------------------------------------------------------------------------------------------------------
  const Kz = kz(i.H, i.exposure);
  const Pz = 2.56e-6 * i.V ** 2 * Kz * 0.85 * 1.2; // ksf, Strength III
  const Ps = 2.56e-6 * 70 ** 2 * 1.2; // ksf, Service I (V 70 mph, Kz = G = 1.0)
  const arm = 0.55 * i.H;
  const Fw = Pz * i.H * L; // kip on a post
  const panelWt = 0.15 * (i.tp / 12) * i.H * L; // kip
  const postWt = (post.W / 1000) * i.H;
  const col = i.collision ? collisionForce(i.setback, i.testLevel) : null;
  const eq = i.kh > 0 ? { F: i.kh * (panelWt + postWt), h: i.H / 2 } : null;

  // --- panels (per ft of height, spanning L between the posts; the bars on each face) -------------------------------
  const As = (BARS[i.bar].area * 12) / i.barSpacing; // in²/ft, each face
  const d = i.tp - i.cover - BARS[i.bar].dia / 2;
  const a = (As * i.fy) / (0.85 * i.fc * 12);
  const Mn = (As * i.fy * (d - a / 2)) / 12; // kip·ft per ft of height
  const Lc = L - post.bf / 12 / 2; // the panel's span, bearing on the flanges' middles
  const MuP = (Pz * Lc ** 2) / 8;
  const VuP = (Pz * Lc) / 2;
  const fr = 0.24 * Math.sqrt(i.fc);
  const Mcr = (1.6 * 0.67 * fr * ((12 * i.tp ** 2) / 6)) / 12;
  const Vc = 0.0316 * 2 * Math.sqrt(i.fc) * 12 * Math.max(0.9 * d, 0.72 * i.tp);
  add({ id: "panel-flexure", name: `Panel flexure under wind (#${i.bar} @ ${i.barSpacing} in. each face, span ${Lc.toFixed(2)} ft)`, demand: MuP, capacity: 0.9 * Mn, unit: "kip·ft/ft", ref: "AASHTO 3.8.1.2.4, 5.6.3.2" });
  add({ id: "panel-min", name: "Panel minimum reinforcement: φMn ≥ the lesser of 1.33·Mu and Mcr", demand: Math.min(1.33 * MuP, Mcr), capacity: 0.9 * Mn, unit: "kip·ft/ft", ref: "AASHTO 5.6.3.3" });
  add({ id: "panel-shear", name: "Panel shear under wind (β = 2)", demand: VuP, capacity: 0.9 * Vc, unit: "kip/ft", ref: "AASHTO 5.7.3.3" });
  // Shrinkage and temperature (5.10.6): each face As ≥ 1.30·b·h/(2(b + h)·fy), 0.11 to 0.60 in²/ft; spacing ≤ 3·t and 18 in.
  const bLeast = Math.min(i.panelH, i.H) * 12;
  const AsTs = Math.min(0.6, Math.max(0.11, (1.3 * bLeast * i.tp) / (2 * (bLeast + i.tp) * i.fy)));
  add({ id: "panel-ts", name: "Shrinkage and temperature bars, each face", demand: AsTs, capacity: As, unit: "in²/ft", ref: "AASHTO Eq. 5.10.6-1" });
  add({ id: "panel-spacing", name: "Bar spacing ≤ 3·t and 18 in.", demand: i.barSpacing, capacity: Math.min(3 * i.tp, 18), unit: "in.", ref: "AASHTO 5.10.6" });
  let panelCol: { Mu: number; Vu: number; Mn: number; Vc: number } | null = null;
  if (col) {
    // One panel, panelH tall, between two posts takes the full force over Lt at midspan (C15.8.4); φ 1.0.
    const MnPanel = Mn * i.panelH;
    const VcPanel = Vc * i.panelH;
    const Mu = col.F * (Lc / 4 - col.Lt / 8);
    const Vu = col.F / 2;
    panelCol = { Mu, Vu, Mn: MnPanel, Vc: VcPanel };
    add({ id: "panel-collision", name: `Panel under the collision force (${col.F.toFixed(1)} kip over ${col.Lt} ft, Case ${col.case}), a ${i.panelH} ft panel`, demand: Mu, capacity: MnPanel, unit: "kip·ft", ref: "AASHTO 15.8.4, Extreme Event II" });
    add({ id: "panel-collision-shear", name: "Panel shear under the collision force", demand: Vu, capacity: VcPanel, unit: "kip", ref: "AASHTO 15.8.4, 5.7.3.3" });
  }

  // --- posts -------------------------------------------------------------------------------------------------------
  const Mp = (i.Fy * post.Zx) / 12; // kip·ft
  const Vn = (0.6 * i.Fy * post.d * post.tw) / 1; // kip, Cv = 1
  const cases: { name: string; M: number; V: number; phiSoil: number; ee: boolean }[] = [{ name: "Strength III (wind)", M: Fw * arm, V: Fw, phiSoil: 0.75, ee: false }];
  if (col) cases.push({ name: `Extreme Event II (collision, Case ${col.case})`, M: col.F * col.h, V: col.F, phiSoil: 1.0, ee: true });
  if (eq) cases.push({ name: "Extreme Event I (earthquake)", M: eq.F * eq.h, V: eq.F, phiSoil: 1.0, ee: true });
  for (const k of cases) {
    add({ id: `post-flexure-${k.ee ? (k.name.includes("collision") ? "col" : "eq") : "wind"}`, name: `Post ${i.post} flexure, ${k.name}`, demand: k.M, capacity: (k.ee ? 1.0 : 0.9) * Mp, unit: "kip·ft", ref: "AASHTO 6.12.2.2.1 (Mp, the flange braced by the panels)" });
    add({ id: `post-shear-${k.ee ? (k.name.includes("collision") ? "col" : "eq") : "wind"}`, name: `Post shear, ${k.name}`, demand: k.V, capacity: 1.0 * Vn, unit: "kip", ref: "AASHTO 6.10.9.2" });
  }
  add({ id: "post-slot", name: "The panel fits between the post's flanges: t + 1 in. ≤ d − 2·tf", demand: i.tp + 1, capacity: post.d - 2 * post.tf, unit: "in.", ref: "Detailing", advisory: true });

  // --- shafts ------------------------------------------------------------------------------------------------------
  const Dft = i.shaftD / 12;
  const ring = i.shaftD - 2 * (3 + 0.5 + BARS[i.shaftBar].dia / 2);
  const sec = roundSection(i.shaftD, ring, i.shaftBars, BARS[i.shaftBar].area, i.shaftFc, i.fy);
  const MnS = sec.momentAt(0).M / 12; // kip·ft
  const de = i.shaftD / 2 + ring / Math.PI; // 5.7.2.8
  const VcS = 0.0316 * 2 * Math.sqrt(i.shaftFc) * i.shaftD * 0.9 * de;
  add({ id: "shaft-min", name: "Shaft diameter ≥ 18 in. for sound walls", demand: 18, capacity: i.shaftD, unit: "in.", ref: "CDOT BDM 10.6.1.1" });
  const shaft = cases.map((k) => {
    // φ on the passive resistance: the soil's strength scaled (γ·Kp for sand, c for clay).
    const b = broms(i.soil, k.M, k.V, Dft, k.phiSoil * i.c, (k.phiSoil * i.gamma) / 1000, i.phi);
    return { ...k, b };
  });
  for (const s of shaft) {
    const tag = s.ee ? (s.name.includes("collision") ? "col" : "eq") : "wind";
    add({ id: `embed-${tag}`, name: `Shaft embedment, ${s.name} (Broms, φ ${s.phiSoil} on passive)`, demand: s.b.L, capacity: i.shaftL, unit: "ft", ref: "AASHTO 15.9.8, 11.8.4, 3.11.5.10" });
    add({ id: `shaft-flexure-${tag}`, name: `Shaft flexure, ${s.name}`, demand: s.b.Mu, capacity: (s.ee ? 1.0 : 0.9) * MnS, unit: "kip·ft", ref: "AASHTO 5.6.3, 10.8.3.9" });
    add({ id: `shaft-shear-${tag}`, name: `Shaft shear, ${s.name}`, demand: s.V, capacity: (s.ee ? 1.0 : 0.9) * VcS, unit: "kip", ref: "AASHTO 5.7.3.3" });
  }

  // --- Service I deflection ----------------------------------------------------------------------------------------
  const Fs = Ps * i.H * L;
  const EI = 29000 * post.Ix; // kip·in²
  const aIn = arm * 12;
  const Hin = i.H * 12;
  const defl = (Fs * aIn ** 2 * (3 * Hin - aIn)) / (6 * EI); // the post fixed at the ground
  add({ id: "deflection", name: `Top deflection, Service I (the post above the ground) ≤ H/${i.deflRatio}`, demand: defl, capacity: Hin / i.deflRatio, unit: "in.", ref: "AASHTO 15.9.3", advisory: true });

  return {
    ok: checks.every((c) => c.ok || c.advisory),
    checks,
    post,
    wind: { Kz, Pz, Ps, arm, Fw, Fs },
    weights: { panelWt, postWt },
    col,
    eq,
    panel: { As, d, a, Mn, Lc, MuP, VuP, Mcr, Vc, col: panelCol },
    postCap: { Mp, Vn },
    shaft: { ring, MnS, VcS, de, cases: shaft },
    defl,
  };
}

export type NoiseWallResult = ReturnType<typeof designNoiseWall>;
