import { L_SHAPES } from "./l-shapes";
import { ES } from "./steel-section";

// Intermediate cross-frames of a straight I-girder bridge, AASHTO LRFD 10th Edition: stability bracing
// stiffness and strength during deck placement (6.7.4.2.2) and the wind on the bottom flanges carried to the
// deck (4.6.2.7.1), with single-angle members designed as axially loaded by their effective slenderness
// (6.9.4.4), φc = 0.95 (6.5.4.2), and the secondary members' slenderness limit of 140 (6.9.3). Inches, kips.

export type CrossFrame = {
  type: "X" | "K"; // X: two diagonals and struts; K: two diagonals meeting the bottom strut at mid-width
  diagonal: string; // equal-leg angle
  strut: string;
  hb: number; // in, between the strut centroids
  Fy: number; // ksi
  fullDepthPlates: boolean; // connection plates attached to both flanges (6.6.1.3.1)
  plateWidth: number; // in, bs (both sides combined)
  plateThickness: number; // in, ts
};

export const L_SHAPE_NAMES = L_SHAPES.map((r) => r[0]);
export function angle(name: string) {
  const r = L_SHAPES.find((x) => x[0] === name) ?? L_SHAPES.find((x) => x[0] === "L4X4X3/8")!;
  return { name: r[0], A: r[2], b: r[3], t: r[4], x: r[5], rx: r[6], rz: r[7] };
}

/** A single angle connected through one leg, in compression over ℓ (6.9.4.4, equal legs): Pr = φc Pn with (Kℓ/r)eff. */
export function singleAngle(name: string, l: number, Fy: number) {
  const a = angle(name);
  const lr = l / a.rx;
  const eff = lr <= 80 ? 72 + 0.75 * lr : 32 + 1.25 * lr; // Eqs. 6.9.4.4-1, -2
  const Pe = (Math.PI ** 2 * ES * a.A) / eff ** 2; // Eq. 6.9.4.1.2-1
  const Po = Fy * a.A; // Q = 1 (legs not slender for these angles' use: checked below)
  const Pn = Pe / Po >= 0.44 ? 0.658 ** (Po / Pe) * Po : 0.877 * Pe;
  const slenderLeg = a.b / a.t > 0.45 * Math.sqrt(ES / Fy); // Table 6.9.4.2.1-1
  return { ...a, l, lr, eff, Pe, Po, Pn, Pr: 0.95 * Pn, Pt: 0.95 * Fy * a.A, slenderness: l / a.rz, slenderLeg };
}

/** The torsional brace system's stiffness (Eqs. 6.7.4.2.2-6 to -13) and the required stiffness and strength (Eqs. -2/-3, -14/-15). */
export function stabilityBracing(p: {
  cf: CrossFrame;
  S: number; // in, girder spacing
  ng: number;
  L: number; // in, span (or the average of the two at a pier)
  n: number; // intermediate brace points in the span
  Mu: number; // kip·in, factored noncomposite moment
  Iyeff: number; // in⁴
  Ix: number; // in⁴, noncomposite
  Cb: number;
  Lb: number; // in
  ho: number; // in, between the flange centroids
  D: number; // in, web depth
  tw: number;
  girderDepth: number; // in
}) {
  const { cf, S } = p;
  const d = angle(cf.diagonal);
  const s = angle(cf.strut);
  const Ad = 0.65 * d.A; // single angles: connection flexibility (4.6.3.3.4c)
  const As = 0.65 * s.A;
  const Ld = cf.type === "X" ? Math.hypot(S, cf.hb) : Math.hypot(S / 2, cf.hb);
  const bbr = cf.type === "X" ? (Ad * ES * S ** 2 * cf.hb ** 2) / Ld ** 3 : (2 * ES * S ** 2 * cf.hb ** 2) / ((8 * Ld ** 3) / Ad + S ** 3 / As); // Eqs. -8, -9
  const deep = cf.hb >= 0.8 * p.girderDepth;
  const full = deep && cf.fullDepthPlates;
  let bsec = Infinity;
  if (!full) {
    // Eq. 6.7.4.2.2-12 for the web above and below the cross-frame, in series.
    const hi = Math.max(0.5, (p.D - cf.hb) / 2);
    const one = ((3.3 * ES) / hi) * (p.ho / hi) ** 2 * ((1.5 * hi * p.tw ** 3) / 12 + (cf.plateThickness * cf.plateWidth ** 3) / 12);
    bsec = one / 2;
  }
  const bg = (24 * (p.ng - 1) ** 2 * S ** 2 * ES * p.Ix) / (p.ng * p.L ** 3); // Eq. -13
  const act = 1 / (1 / bbr + (Number.isFinite(bsec) ? 1 / bsec : 0) + 1 / bg); // Eq. -6
  const k = full ? 2.4 : 3.6;
  const req = (k * p.L * p.Mu ** 2) / (0.8 * Math.max(1, p.n) * ES * p.Iyeff * p.Cb ** 2); // Eqs. -2, -3, φsb = 0.8
  const Mbr = ((k * p.L * p.Mu ** 2) / (Math.max(1, p.n) * ES * p.Iyeff * p.Cb ** 2)) * (p.Lb / (500 * p.ho)); // Eqs. -14, -15
  // The brace moment as a couple at the struts; the diagonals carry its horizontal force over the bay.
  const Fstrut = Mbr / cf.hb;
  const Fdiag = (Fstrut * Ld) / (cf.type === "X" ? S : S / 2) / (cf.type === "K" ? 2 : 1);
  return { Ld, Ad, As, bbr, bsec, bg, act, req, k, full, Mbr, Fstrut, Fdiag };
}
