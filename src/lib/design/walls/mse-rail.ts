import { BARS } from "./cip";

// A traffic barrier on top of an MSE wall: the barrier on a rail anchor (moment) slab, checked for sliding and
// overturning under an equivalent static load and its coping for the dynamic impact load, and the impact's pressures
// on the top two layers of soil reinforcement. CDOT BDM 13.5.4 and 11 point to NCHRP Report 663 and NCHRP Web
// Document 326 (Project 22-20(02), MASH TL-3 to TL-5); AASHTO 11.10.10.2. A flexible post-and-beam barrier instead
// puts 300 lb/ft on the top two layers (AASHTO 11.10.10.2).

export type RailLevel = "TL-3" | "TL-4-1" | "TL-4-2" | "TL-5-1" | "TL-5-2" | "NCHRP-663";

/** The design loads by test level: Web Doc 326 Tables 9-1 to 9-4 (MASH); NCHRP Report 663 Appendix I (its 10 kip static load). */
export const RAIL_LEVELS: Record<RailLevel, { label: string; Ld: number; Ls: number; Hmin: number; He: number; Wmin: number; BL: number; pdp: [number, number]; pdy: [number, number]; h: [number, number]; phiSlide: number; phiOT: number; ref: string }> = {
  "TL-3": { label: "MASH TL-3", Ld: 70, Ls: 23, Hmin: 32, He: 24, Wmin: 4, BL: 10, pdp: [370, 165], pdy: [1415, 300], h: [2.25, 2.5], phiSlide: 1, phiOT: 1, ref: "NCHRP Web Doc 326 Tables 9-1, 9-2, 9-4" },
  "TL-4-1": { label: "MASH TL-4 (36 in barrier)", Ld: 70, Ls: 28, Hmin: 36, He: 25, Wmin: 4.5, BL: 10, pdp: [370, 270], pdy: [1755, 300], h: [2.25, 2.5], phiSlide: 1, phiOT: 1, ref: "NCHRP Web Doc 326 Tables 9-1, 9-2, 9-4" },
  "TL-4-2": { label: "MASH TL-4 (taller than 36 in)", Ld: 80, Ls: 28, Hmin: 36, He: 30, Wmin: 4.5, BL: 10, pdp: [370, 270], pdy: [1755, 300], h: [2.25, 2.5], phiSlide: 1, phiOT: 1, ref: "NCHRP Web Doc 326 Tables 9-1, 9-2, 9-4" },
  "TL-5-1": { label: "MASH TL-5 (42 in barrier)", Ld: 160, Ls: 80, Hmin: 42, He: 34, Wmin: 7, BL: 15, pdp: [725, 400], pdy: [3250, 485], h: [1.6, 2.5], phiSlide: 1, phiOT: 1, ref: "NCHRP Web Doc 326 Tables 9-1, 9-2, 9-4" },
  "TL-5-2": { label: "MASH TL-5 (taller than 42 in)", Ld: 260, Ls: 132, Hmin: 42, He: 43, Wmin: 12, BL: 15, pdp: [1240, 680], pdy: [4440, 675], h: [1.6, 2.5], phiSlide: 1, phiOT: 1, ref: "NCHRP Web Doc 326 Tables 9-1, 9-2, 9-4" },
  "NCHRP-663": { label: "NCHRP Report 663 (10 kip static load, TL-3/TL-4)", Ld: 54, Ls: 10, Hmin: 32, He: 24, Wmin: 4.5, BL: 10, pdp: [315, 230], pdy: [1200, 230], h: [1.8, 2.5], phiSlide: 0.8, phiOT: 0.9, ref: "NCHRP Report 663 Appendix I" },
};

export type MseRail = {
  kind: "none" | "anchor-slab" | "post-beam";
  level: RailLevel;
  He: number; // in, the impact's height above the top of the slab (0: the table's)
  barrierW: number; // klf, the barrier's weight
  barrierWidth: number; // in, its base width
  barrierX: number; // in, its c.g. from the slab's front face
  barrierH: number; // in, its height above the slab
  B: number; // ft, the slab's width from its front face
  ts: number; // in, the slab's thickness
  copingDepth: number; // in, the coping below the slab's bottom at the front
  copingWidth: number; // in
  cover: number; // in, pavement and soil on the slab behind the barrier
  gammaCover: number; // kcf
  Lj: number; // ft, the monolithic length between joints (at most 60 ft, NCHRP 663)
  rotation: "A" | "B"; // A: the coping isolated from the panel (its toe); B: bearing on the panel
  rotX: number; // in, the rotation point from the front face (B: the panel's back edge)
  precast: boolean; // a smooth (precast) base: tan φr = 2/3 tan φ
  copingT: number; // in, the coping's thickness at its critical section
  copingBar: { bar: number; spacing: number };
  copingCover: number; // in
  hCrit: number; // in, the critical section's middle below the top of the slab
};

export const RAIL_NONE: MseRail = {
  kind: "none",
  level: "TL-4-2",
  He: 0,
  barrierW: 0.5,
  barrierWidth: 18,
  barrierX: 8,
  barrierH: 42,
  B: 5,
  ts: 12,
  copingDepth: 18,
  copingWidth: 12,
  cover: 12,
  gammaCover: 0.125,
  Lj: 30,
  rotation: "A",
  rotX: 0,
  precast: false,
  copingT: 12,
  copingBar: { bar: 6, spacing: 10 },
  copingCover: 2,
  hCrit: 14,
};

/** The barrier-moment slab's weight and c.g. per foot (klf, ft from the front face), its parts listed. */
export function slabWeight(r: MseRail, gammaC = 0.15) {
  const bw = r.barrierWidth / 12;
  const parts = [
    { name: "Barrier", w: r.barrierW, x: r.barrierX / 12 },
    { name: "Moment slab", w: r.B * (r.ts / 12) * gammaC, x: r.B / 2 },
    { name: "Coping", w: (r.copingWidth / 12) * (r.copingDepth / 12) * gammaC, x: r.copingWidth / 24 },
    { name: "Cover on the slab", w: Math.max(0, r.B - bw) * (r.cover / 12) * r.gammaCover, x: (bw + r.B) / 2 },
  ].filter((p) => p.w > 0);
  const w = parts.reduce((s, p) => s + p.w, 0);
  return { parts, w, x: parts.reduce((s, p) => s + p.w * p.x, 0) / w };
}

/** Sliding and overturning of the barrier-moment slab (Web Doc 326 Eqs. 9-1 to 9-4; NCHRP 663 I-1.4.2, I-1.4.3). W in kips, l and h in ft. */
export function slabStability(o: { W: number; tanPhiR: number; l: number; h: number; Ls: number; phiSlide: number; phiOT: number }) {
  const P = o.W * o.tanPhiR;
  const M = o.W * o.l;
  return { P, phiP: o.phiSlide * P, M, phiM: o.phiOT * M, Mo: o.Ls * o.h };
}

/** The coping's flexural resistance over the barrier length BL against the dynamic load times its arm (NCHRP 663 J-1.3). */
export function copingFlexure(o: { Ld: number; hc: number; BL: number; t: number; cover: number; bar: number; spacing: number; fc: number; fy: number }) {
  const b = BL_IN(o.BL);
  const db = BARS[o.bar].dia;
  const As = (b / o.spacing) * BARS[o.bar].area;
  const d = o.t - o.cover - db / 2;
  const a = (As * o.fy) / (0.85 * o.fc * b);
  const Mn = (As * o.fy * (d - a / 2)) / 12; // kip-ft
  return { As, d, a, Mn, phiMn: 0.9 * Mn, Mu: o.Ld * o.hc };
}
const BL_IN = (ft: number) => ft * 12;

/** The full anchor slab design: weights, the rotation point's arms, stability and the coping. */
export function designAnchorSlab(r: MseRail, o: { phiFill: number; fc: number; fy: number; gammaC?: number }) {
  const L = RAIL_LEVELS[r.level];
  const He = r.He > 0 ? r.He : L.He;
  const wt = slabWeight(r, o.gammaC);
  const Lj = Math.min(r.Lj, 60);
  const W = wt.w * Lj;
  const tanPhiR = r.precast ? (2 / 3) * Math.tan((o.phiFill * Math.PI) / 180) : Math.tan((o.phiFill * Math.PI) / 180);
  const rotX = r.rotation === "A" ? 0 : r.rotX;
  const l = wt.x - rotX / 12;
  const h = (He + r.ts + r.copingDepth) / 12;
  const st = slabStability({ W, tanPhiR, l, h, Ls: L.Ls, phiSlide: L.phiSlide, phiOT: L.phiOT });
  const hc = (He + r.hCrit) / 12;
  const coping = copingFlexure({ Ld: L.Ld, hc, BL: L.BL, t: r.copingT, cover: r.copingCover, bar: r.copingBar.bar, spacing: r.copingBar.spacing, fc: o.fc, fy: o.fy });
  return { level: L, He, weight: wt, Lj, W, tanPhiR, rotX, l, h, ...st, hc, coping };
}
export type AnchorSlab = ReturnType<typeof designAnchorSlab>;
