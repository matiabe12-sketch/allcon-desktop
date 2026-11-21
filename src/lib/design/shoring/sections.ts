import { HP_SECTIONS } from "../foundations/hpile";

// Sections for soldier piles and sheet piles.
// - Soldier piles: the HP sections of foundations/hpile.ts and common W sections (AISC Shapes Database v16.0).
// - Steel sheet piles, per foot of wall: the heavy-duty PZ and the PZC Z-sections as tabulated in the Caltrans
//   Trenching and Shoring Manual, Appendix D (July 2025), Tables D-3 and D-4 (nominal dimensions; check the producer's
//   current catalog for final design).

export type PileSection = { W: number; A: number; d: number; bf: number; tw: number; tf: number; Ix: number; Zx: number; Sx: number }; // lb/ft, in², in, in⁴, in³

const W_SECTIONS: Record<string, PileSection> = {
  "W8x31": { W: 31, A: 9.13, d: 8, bf: 8, tw: 0.285, tf: 0.435, Ix: 110, Zx: 30.4, Sx: 27.5 },
  "W8x40": { W: 40, A: 11.7, d: 8.25, bf: 8.07, tw: 0.36, tf: 0.56, Ix: 146, Zx: 39.8, Sx: 35.5 },
  "W10x33": { W: 33, A: 9.71, d: 9.73, bf: 7.96, tw: 0.29, tf: 0.435, Ix: 171, Zx: 38.8, Sx: 35 },
  "W10x45": { W: 45, A: 13.3, d: 10.1, bf: 8.02, tw: 0.35, tf: 0.62, Ix: 248, Zx: 54.9, Sx: 49.1 },
  "W10x60": { W: 60, A: 17.7, d: 10.2, bf: 10.1, tw: 0.42, tf: 0.68, Ix: 341, Zx: 74.6, Sx: 66.7 },
  "W12x40": { W: 40, A: 11.7, d: 11.9, bf: 8.01, tw: 0.295, tf: 0.515, Ix: 307, Zx: 57, Sx: 51.5 },
  "W12x53": { W: 53, A: 15.6, d: 12.1, bf: 10, tw: 0.345, tf: 0.575, Ix: 425, Zx: 77.9, Sx: 70.6 },
  "W12x65": { W: 65, A: 19.1, d: 12.1, bf: 12, tw: 0.39, tf: 0.605, Ix: 533, Zx: 96.8, Sx: 87.9 },
  "W12x79": { W: 79, A: 23.2, d: 12.4, bf: 12.1, tw: 0.47, tf: 0.735, Ix: 662, Zx: 119, Sx: 107 },
  "W14x48": { W: 48, A: 14.1, d: 13.8, bf: 8.03, tw: 0.34, tf: 0.595, Ix: 484, Zx: 78.4, Sx: 70.2 },
  "W14x61": { W: 61, A: 17.9, d: 13.9, bf: 10, tw: 0.375, tf: 0.645, Ix: 640, Zx: 102, Sx: 92.1 },
  "W14x74": { W: 74, A: 21.8, d: 14.2, bf: 10.1, tw: 0.45, tf: 0.785, Ix: 795, Zx: 126, Sx: 112 },
  "W14x90": { W: 90, A: 26.5, d: 14, bf: 14.5, tw: 0.44, tf: 0.71, Ix: 999, Zx: 157, Sx: 143 },
  "W16x57": { W: 57, A: 16.8, d: 16.4, bf: 7.12, tw: 0.43, tf: 0.715, Ix: 758, Zx: 105, Sx: 92.2 },
  "W16x77": { W: 77, A: 22.6, d: 16.5, bf: 10.3, tw: 0.455, tf: 0.76, Ix: 1110, Zx: 150, Sx: 134 },
  "W18x60": { W: 60, A: 17.6, d: 18.2, bf: 7.56, tw: 0.415, tf: 0.695, Ix: 984, Zx: 123, Sx: 108 },
  "W18x76": { W: 76, A: 22.3, d: 18.2, bf: 11, tw: 0.425, tf: 0.68, Ix: 1330, Zx: 163, Sx: 146 },
  "W18x97": { W: 97, A: 28.5, d: 18.6, bf: 11.1, tw: 0.535, tf: 0.87, Ix: 1750, Zx: 211, Sx: 188 },
  "W21x68": { W: 68, A: 20, d: 21.1, bf: 8.27, tw: 0.43, tf: 0.685, Ix: 1480, Zx: 160, Sx: 140 },
  "W21x93": { W: 93, A: 27.3, d: 21.6, bf: 8.42, tw: 0.58, tf: 0.93, Ix: 2070, Zx: 221, Sx: 192 },
  "W24x76": { W: 76, A: 22.4, d: 23.9, bf: 8.99, tw: 0.44, tf: 0.68, Ix: 2100, Zx: 200, Sx: 176 },
  "W24x104": { W: 104, A: 30.7, d: 24.1, bf: 12.8, tw: 0.5, tf: 0.75, Ix: 3100, Zx: 289, Sx: 258 },
};

export const PILE_SECTIONS: Record<string, PileSection> = {
  ...Object.fromEntries(Object.entries(HP_SECTIONS).map(([k, s]) => [k, { W: s.W, A: s.A, d: s.d, bf: s.bf, tw: s.tw, tf: s.tf, Ix: s.Ix, Zx: s.Zx, Sx: s.Sx }])),
  ...W_SECTIONS,
};

export type SheetSection = { width: number; depth: number; t: number; A: number; psf: number; I: number; S: number }; // in, in, in (web), in²/ft, lb/ft², in⁴/ft, in³/ft

export const SHEET_SECTIONS: Record<string, SheetSection> = {
  "PZC 12": { width: 27.88, depth: 12.52, t: 0.335, A: 5.87, psf: 20, I: 140.6, S: 22.4 },
  "PZC 13": { width: 27.88, depth: 12.56, t: 0.375, A: 6.38, psf: 21.7, I: 152, S: 24.2 },
  "PZC 14": { width: 27.88, depth: 12.6, t: 0.42, A: 6.95, psf: 23.7, I: 164.8, S: 26 },
  "PZC 17": { width: 25, depth: 15.21, t: 0.335, A: 6.55, psf: 22.3, I: 236.6, S: 31 },
  "PZC 18": { width: 25, depth: 15.25, t: 0.375, A: 7.12, psf: 24.2, I: 255.5, S: 33.5 },
  "PZC 19": { width: 25, depth: 15.3, t: 0.42, A: 7.76, psf: 26.4, I: 276.7, S: 36.1 },
  "PZC 26": { width: 27.88, depth: 17.7, t: 0.525, A: 9.35, psf: 31.8, I: 428.1, S: 48.4 },
  "PZ 22": { width: 22, depth: 9.25, t: 0.375, A: 6.65, psf: 22.6, I: 85.1, S: 18.4 },
  "PZ 27": { width: 18, depth: 12.1, t: 0.375, A: 8.13, psf: 27.7, I: 187.3, S: 31 },
  "PZ 35": { width: 22.64, depth: 15.1, t: 0.5, A: 10.28, psf: 35, I: 369.4, S: 48.9 },
  "PZ 40": { width: 19.69, depth: 16.4, t: 0.5, A: 11.75, psf: 40, I: 502.7, S: 61.3 },
};

/** Prestressing steel for ground anchors (GEC 4 Table 9 and 10 sizes): 0.6 in, 270 ksi strand; Grade 150 bars (ASTM A722). */
export const STRAND = { area: 0.217, fpu: 270 }; // in², ksi
export const BARS_150: Record<string, number> = { '1"': 0.85, '1-1/4"': 1.25, '1-3/8"': 1.58, '1-3/4"': 2.62, '2-1/2"': 4.87 }; // in²

/** GEC 4 Table 12: recommended roughcut thickness of temporary timber lagging (in, from its mm), by soil, depth and clear span. */
export type LaggingSoil = "competent" | "difficult" | "dangerous";
const SPANS = [5, 6, 7, 8, 9, 10]; // ft (1.5 to 3.0 m)
const TABLE_12: Record<LaggingSoil, { to: number; t: (number | null)[] }[]> = {
  competent: [
    { to: 25, t: [2, 3, 3, 3, 4, 4] },
    { to: 60, t: [3, 3, 3, 4, 4, 5] },
  ],
  difficult: [
    { to: 25, t: [3, 3, 3, 4, 4, 5] },
    { to: 60, t: [3, 3, 4, 4, 5, 5] },
  ],
  dangerous: [
    { to: 15, t: [3, 3, 4, 5, null, null] },
    { to: 25, t: [3, 4, 5, 6, null, null] },
    { to: 35, t: [4, 5, 6, null, null, null] },
  ],
};

/** The recommended thickness for a clear span at the wall's depth; null where the table gives none (too deep or too wide). */
export function laggingThickness(soil: LaggingSoil, depth: number, clearSpan: number): number | null {
  const row = TABLE_12[soil].find((r) => depth <= r.to + 1e-9);
  if (!row) return null;
  const k = SPANS.findIndex((s) => clearSpan <= s + 1e-9);
  if (k < 0) return null;
  return row.t[k];
}

/** Channels for wales (two back to back, AISC Shapes Database v16.0): lb/ft, in, in³, in⁴ each. */
export type Channel = { W: number; d: number; bf: number; tw: number; Zx: number; Sx: number; Ix: number };
export const CHANNELS: Record<string, Channel> = {
  "C8x11.5": { W: 11.5, d: 8, bf: 2.26, tw: 0.22, Zx: 9.63, Sx: 8.14, Ix: 32.5 },
  "C8x18.75": { W: 18.75, d: 8, bf: 2.53, tw: 0.487, Zx: 13.9, Sx: 11, Ix: 43.9 },
  "C10x15.3": { W: 15.3, d: 10, bf: 2.6, tw: 0.24, Zx: 15.9, Sx: 13.5, Ix: 67.3 },
  "C10x20": { W: 20, d: 10, bf: 2.74, tw: 0.379, Zx: 19.4, Sx: 15.8, Ix: 78.9 },
  "C10x25": { W: 25, d: 10, bf: 2.89, tw: 0.526, Zx: 23.1, Sx: 18.2, Ix: 91.1 },
  "C10x30": { W: 30, d: 10, bf: 3.03, tw: 0.673, Zx: 26.7, Sx: 20.7, Ix: 103 },
  "C12x20.7": { W: 20.7, d: 12, bf: 2.94, tw: 0.282, Zx: 25.6, Sx: 21.5, Ix: 129 },
  "C12x25": { W: 25, d: 12, bf: 3.05, tw: 0.387, Zx: 29.4, Sx: 24, Ix: 144 },
  "C12x30": { W: 30, d: 12, bf: 3.17, tw: 0.51, Zx: 33.8, Sx: 27, Ix: 162 },
  "C15x33.9": { W: 33.9, d: 15, bf: 3.4, tw: 0.4, Zx: 50.8, Sx: 42, Ix: 315 },
  "C15x40": { W: 40, d: 15, bf: 3.52, tw: 0.52, Zx: 57.5, Sx: 46.5, Ix: 348 },
  "C15x50": { W: 50, d: 15, bf: 3.72, tw: 0.716, Zx: 68.5, Sx: 53.8, Ix: 404 },
};

/** Visually graded dimension lumber, AASHTO Table 8.4.1.1.4-1: Fbo (ksi). Southern Pine's values are already adjusted
 * for size, by the board's width (2–4, 5–6, 8, 10, 12 in.). */
export type TimberGrade = { label: string; Fbo: number | Record<number, number>; Fvo: number; southernPine?: boolean };
export const TIMBER_GRADES: Record<string, TimberGrade> = {
  "dfl-ss": { label: "Douglas Fir–Larch, Select Structural", Fbo: 1.5, Fvo: 0.18 },
  "dfl-1btr": { label: "Douglas Fir–Larch, No. 1 & Btr", Fbo: 1.2, Fvo: 0.18 },
  "dfl-1": { label: "Douglas Fir–Larch, No. 1", Fbo: 1.0, Fvo: 0.18 },
  "dfl-2": { label: "Douglas Fir–Larch, No. 2", Fbo: 0.9, Fvo: 0.18 },
  "hf-ss": { label: "Hem–Fir, Select Structural", Fbo: 1.4, Fvo: 0.15 },
  "hf-1btr": { label: "Hem–Fir, No. 1 & Btr", Fbo: 1.1, Fvo: 0.15 },
  "hf-1": { label: "Hem–Fir, No. 1", Fbo: 0.975, Fvo: 0.15 },
  "hf-2": { label: "Hem–Fir, No. 2", Fbo: 0.85, Fvo: 0.15 },
  "spf-ss": { label: "Spruce–Pine–Fir, Select Structural", Fbo: 1.25, Fvo: 0.135 },
  "spf-12": { label: "Spruce–Pine–Fir, No. 1/No. 2", Fbo: 0.875, Fvo: 0.135 },
  "sp-ss": { label: "Southern Pine, Select Structural", Fbo: { 4: 2.35, 6: 2.1, 8: 1.95, 10: 1.7, 12: 1.6 }, Fvo: 0.175, southernPine: true },
  "sp-1": { label: "Southern Pine, No. 1", Fbo: { 4: 1.5, 6: 1.35, 8: 1.25, 10: 1.05, 12: 1.0 }, Fvo: 0.175, southernPine: true },
  "sp-2": { label: "Southern Pine, No. 2", Fbo: { 4: 1.1, 6: 1.0, 8: 0.925, 10: 0.8, 12: 0.75 }, Fvo: 0.175, southernPine: true },
};

/** Table 8.4.4.4-1, Fbo, by width (in.): [2 and 3 in. thick, 4 in. thick]. */
const CF_BENDING: [number, number, number][] = [
  [4, 1.5, 1.5],
  [5, 1.4, 1.4],
  [6, 1.3, 1.3],
  [8, 1.2, 1.3],
  [10, 1.1, 1.2],
  [12, 1.0, 1.1],
  [Infinity, 0.9, 1.0],
];
/** Table 8.4.4.6-1, flat use, by width (in.): [2 and 3 in. thick, 4 in. thick]. */
const CFU: [number, number, number][] = [
  [3, 1.0, 1.0],
  [4, 1.1, 1.0],
  [5, 1.1, 1.05],
  [6, 1.15, 1.05],
  [8, 1.15, 1.05],
  [Infinity, 1.2, 1.1],
];

/** The adjusted bending design value of a lagging board loaded on its wide face (AASHTO Eq. 8.4.4.1-1):
 * Fb = Fbo·CKF·CM·CF·Cfu·Ci·Cλ, CKF = 2.5/φ (φ = 0.85), CM for wet use (Table 8.4.4.3-1: 0.85 where Fbo·CF > 1.15 ksi),
 * CF (Table 8.4.4.4-1; none for Southern Pine), Cfu (Table 8.4.4.6-1), Ci 0.80 if incised (Table 8.4.4.7-1), Cλ
 * (Table 8.4.4.9-1). t and width nominal (in.). */
export function timberFb(grade: string, t: number, width: number, o: { wet: boolean; incised: boolean; cLambda: number }) {
  const g = TIMBER_GRADES[grade];
  if (!g) return null;
  const thick = t >= 3.5 ? 2 : 1; // 4 in. column, else 2 and 3 in.
  const Fbo = typeof g.Fbo === "number" ? g.Fbo : g.Fbo[[4, 6, 8, 10, 12].find((w) => width <= w) ?? 12];
  const CF = g.southernPine ? (width > 12 ? 0.9 : 1) : CF_BENDING.find((r) => width <= r[0])![thick];
  const CM = o.wet && Fbo * CF > 1.15 ? 0.85 : 1;
  const Cfu = CFU.find((r) => width <= r[0])![thick];
  const Ci = o.incised ? 0.8 : 1;
  const CKF = 2.5 / 0.85;
  // Shear (Eq. 8.4.4.1-2): Fv = Fvo·CKF·CM·Ci·Cλ, CM 0.97 wet (Table 8.4.4.3-1).
  const Fv = g.Fvo * CKF * (o.wet ? 0.97 : 1) * Ci * o.cLambda;
  return { Fbo, CKF, CM, CF, Cfu, Ci, Cl: o.cLambda, Fb: Fbo * CKF * CM * CF * Cfu * Ci * o.cLambda, Fvo: g.Fvo, Fv, label: g.label };
}
