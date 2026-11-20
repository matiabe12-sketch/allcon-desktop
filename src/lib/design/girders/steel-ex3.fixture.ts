import { leverStrip, leverWeights, type GridInput, type GridStage } from "./steel-grid";
import { ES, sectionProps, type SteelSegment } from "./steel-section";

// FHWA Steel Bridge Design Handbook, Design Example 3 (FHWA-HIF-16-002 Vol. 23, December 2015): a three-span
// continuous horizontally curved composite I-girder bridge, 160-210-160 ft along its centerline, radius 700 ft,
// four girders at 11 ft with 3'-9" overhangs, radial supports, X cross-frames of 5.0 in² single angles at about
// 20 ft; 9 in structural deck (9.5 in cast), 4 in haunch from the web's top, n = 7.56; railings 495 plf, SIP
// forms 15 psf, FWS 30 psf; three 12 ft lanes on a 37'-6" roadway. Its girders' plates (Figure 3) and its 3D
// finite element results (Tables 5 and 8) for the inside girder G1 and the outside girder G4. Only numbers here.

/** Figure 3: each girder's field sections along its own arc (ft) and plates (in). */
const G = [
  { L1: 113.3, L2: 84.0, L3: 123.0, S1: 156.2, X: 0, a: [15, 1], b: [0, 0], c: [16, 1], e: [21, 1.25], f: [21, 2.5], h: [21, 1.5], i: [21, 3], l: [15, 1], m: [18, 1] },
  { L1: 115.1, L2: 85.3, L3: 125.0, S1: 158.7, X: 0, a: [15, 1], b: [0, 0], c: [16, 1], e: [18, 1.25], f: [18, 2.5], h: [19, 1.5], i: [19, 3], l: [15, 1], m: [17, 1] },
  { L1: 116.9, L2: 86.7, L3: 127.0, S1: 161.3, X: 0, a: [16, 1], b: [0, 0], c: [18, 1], e: [20, 1.25], f: [20, 2.5], h: [21, 1.5], i: [21, 3], l: [15, 1], m: [20, 1] },
  { L1: 118.7, L2: 88.0, L3: 129.0, S1: 163.8, X: 33.0, a: [20, 1], b: [21, 1], c: [21, 1.5], e: [28, 1.25], f: [28, 2.5], h: [27, 1.5], i: [27, 3], l: [17, 1], m: [21, 1.5] },
] as const;

const R = 700;
const ys = [-16.5, -5.5, 5.5, 16.5]; // G1 inside the curve … G4 outside

/** Girder j's plates at s along its own arc. */
export function ex3Segment(j: number, s: number): SteelSegment {
  const g = G[j];
  const total = 2 * g.L1 + 2 * g.L2 + g.L3;
  const t = s > total / 2 ? total - s : s; // symmetric
  const pl = (p: readonly number[]) => ({ b: p[0], t: p[1] });
  if (t <= g.L1) return { length: 0, kind: "plate", D: 84, tw: 0.5625, top: pl(g.a), bottom: pl(g.X > 0 && t < g.X ? g.b : g.c) };
  if (t <= g.L1 + g.L2) {
    const nearPier = Math.abs(t - g.S1) <= 20;
    return { length: 0, kind: "plate", D: 84, tw: 0.625, top: pl(nearPier ? g.f : g.e), bottom: pl(nearPier ? g.i : g.h) };
  }
  return { length: 0, kind: "plate", D: 84, tw: 0.5625, top: pl(g.l), bottom: pl(g.m) };
}

export function ex3Grid(): GridInput {
  const braces: number[] = [];
  for (let q = 1; q < 8; q++) braces.push(20 * q);
  for (let q = 1; q < 11; q++) braces.push(160 + (210 * q) / 11);
  for (let q = 1; q < 8; q++) braces.push(370 + 20 * q);
  const n = 7.56;
  const section = (X: number, stage: GridStage, j: number) => {
    const seg = ex3Segment(j, (X * (R + ys[j])) / R);
    const exterior = j === 0 || j === 3;
    const deck = { beff: exterior ? 111 : 132, ts: 9, tGross: 9.5, haunch: 4 - seg.top.t, n, fc: 4, fy: 60, bars: [] };
    const sp = sectionProps(seg, stage, stage === "steel" ? null : deck);
    const J = (seg.top.b * seg.top.t ** 3 + seg.bottom.b * seg.bottom.t ** 3 + seg.D * seg.tw ** 3) / 3;
    const Iyc = (seg.top.t * seg.top.b ** 3) / 12;
    const Iyt = (seg.bottom.t * seg.bottom.b ** 3) / 12;
    const h = seg.D + (seg.top.t + seg.bottom.t) / 2;
    return { I: sp.I, J, Cw: (h * h * Iyc * Iyt) / (Iyc + Iyt) };
  };
  return {
    spans: [160, 210, 160],
    nGirders: 4,
    S: 11,
    overhang: 3.75,
    barrierWidth: 1.5,
    radius: R,
    skew: 0,
    braces,
    extraStations: [],
    section,
    cf: { type: "X", Ad: 5, As: 5, hb: 86 },
    deck: { ts: 9, Ec: ES / n },
    E: ES,
    G: 11200,
  };
}

/** The girders' line loads (klf): the deck, haunch and SIP forms (DC1 concrete); the railings (DC2); the FWS (DW). */
export function ex3Loads() {
  const deck = leverStrip(ys, (9.5 / 12) * 0.15, -20.25, 20.25);
  const fws = leverStrip(ys, 0.03, -18.75, 18.75);
  const rail = ys.map((_, j) => 0.495 * (leverWeights(ys, -19.5)[j] + leverWeights(ys, 19.5)[j]));
  const segAt = (j: number, X: number) => ex3Segment(j, (X * (R + ys[j])) / R);
  return {
    dc1conc: (j: number, X: number) => {
      const top = segAt(j, X).top;
      const bays = (j > 0 ? 1 : 0) + (j < 3 ? 1 : 0);
      return deck[j] + (20 / 12) * ((4 - top.t) / 12) * 0.15 + bays * 0.5 * 0.015 * (11 - top.b / 12);
    },
    dc2: (j: number) => rail[j],
    dw: (j: number) => fws[j],
  };
}

/** Tables 5 and 8: G1 and G4 unfactored moments (kip·ft) at span 1's 0.4 point, pier 1, and span 2's middle; LL+I with multiple presence, impact and centrifugal force. */
export const EX3_MOMENTS = {
  G1: { span1: { conc: 1754, dc2: 316, dw: 373, pos: 3249 }, pier: { conc: -5897, dc2: -1169, dw: -1167, neg: -5274 }, span2: { conc: 1812, dc2: 335, dw: 400, pos: 3498 } },
  G4: { span1: { conc: 2744, dc2: 527, dw: 586, pos: 5134 }, pier: { conc: -7272, dc2: -1537, dw: -1478, neg: -6726 }, span2: { conc: 2658, dc2: 554, dw: 629, pos: 5192 } },
};
