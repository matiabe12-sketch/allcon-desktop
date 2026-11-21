// The vertical temperature gradient (AASHTO LRFD 10th 3.12.3, Figure 3.12.3-2) on a composite precast girder: its
// self-equilibrating stresses (4.6.6) and its free curvature, which a continuous girder restrains.
//
// T1 at the deck's top and T2 4 in down (Table 3.12.3-1 by solar zone), falling to 0 at A = 12 in below that (T3 = 0);
// the negative gradient −0.30 (a plain concrete deck) or −0.20 (an asphalt overlay) times the positive. Free, the
// section takes a uniform strain α·Tu and a curvature α·G (plane sections); what is left, E·α·(T − Tu − G·(y − ȳ)),
// is the self-equilibrating stress. Inches, ksi, °F; compression +.

/** Table 3.12.3-1: T1 and T2 (°F) in each solar radiation zone (Figure 3.12.3-1). */
export const GRADIENT_T: Record<1 | 2 | 3 | 4, [number, number]> = { 1: [54, 14], 2: [46, 12], 3: [41, 11], 4: [38, 9] };
export const ALPHA_CONCRETE = 6e-6; // /°F (5.4.2.2)

export type GradientChoice = { zone: 1 | 2 | 3 | 4; asphalt: boolean };

/** The positive gradient's temperature (°F) at depth z (in) below the deck's top. */
export function gradientT(z: number, T1: number, T2: number) {
  if (z < 0) return 0;
  if (z <= 4) return T1 + ((T2 - T1) * z) / 4;
  if (z <= 16) return T2 * (1 - (z - 4) / 12);
  return 0;
}

/** The negative gradient's factor on the positive (3.12.3). */
export const negativeFactor = (asphalt: boolean) => (asphalt ? -0.2 : -0.3);

type Section = {
  profile: [number, number][]; // the girder's half-widths up from its bottom (in)
  H: number; // in, the girder's depth
  hh: number; // in, haunch in the section
  topWidth: number; // in, the girder's top flange (the haunch's width)
  ts: number; // in, structural deck
  beff: number; // in
  n: number; // E deck / E girder
};

/**
 * The positive gradient on the composite section `c` (A, I, yb in girder units): the uniform part Tu (°F), the
 * linear part G (°F/in, the top warmer +), the free curvature κ (1/in), and the self-equilibrating stresses (ksi,
 * compression +) at the deck's top, the girder's top and its bottom, for a girder modulus Ec.
 */
export function gradientOnGirder(s: Section, c: { A: number; I: number; yb: number }, Ec: number, zone: GradientChoice["zone"]) {
  const [T1, T2] = GRADIENT_T[zone];
  const half = (y: number) => {
    for (let k = 0; k < s.profile.length - 1; k++) {
      const [y0, w0] = s.profile[k];
      const [y1, w1] = s.profile[k + 1];
      if (y1 > y0 && y >= y0 && y <= y1) return w0 + ((w1 - w0) * (y - y0)) / (y1 - y0);
    }
    return 0;
  };
  const top = s.H + s.hh + s.ts;
  const width = (y: number) => (y >= s.H + s.hh ? s.beff * s.n : y >= s.H ? s.topWidth * s.n : 2 * half(y));
  const dy = 0.02;
  let P = 0;
  let M = 0;
  for (let z = dy / 2; z < 16; z += dy) {
    const y = top - z;
    if (y <= 0) break;
    const bT = width(y) * gradientT(z, T1, T2) * dy;
    P += bT;
    M += bT * (y - c.yb);
  }
  const Tu = P / c.A;
  const G = M / c.I;
  const free = (y: number) => gradientT(top - y, T1, T2) - Tu - G * (y - c.yb); // °F not taken up by the plane section
  const a = ALPHA_CONCRETE;
  return {
    T1,
    T2,
    Tu,
    G,
    kappa: a * G,
    deck: s.n * Ec * a * free(top),
    top: Ec * a * free(s.H),
    bot: Ec * a * free(0),
  };
}
