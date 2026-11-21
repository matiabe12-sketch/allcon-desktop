import { Frame, type DistLoad, type FrameElement, type FrameNode } from "../frame";
import { DesignError, type Check } from "../walls/cip";
import { designShaft, Kz, roundCd, SIGN_DEFAULTS, type ShaftGroup, type ShaftPart } from "./cantilever";
import { IMPORTANCE, roundTube, signCd, tubeToPlate, type Weld } from "./structure";

// A monotube sign bridge (CDOT S-614-50, "Static Sign Monotube Structures"): a round steel tube spanning the roadway on
// two round steel posts, bolted into a portal frame, each post on a drilled shaft. AASHTO LRFD Specifications for
// Structural Supports for Highway Signs, Luminaires, and Traffic Signals, 1st Edition (LRFD-LTS-1, 2015):
// - loads: dead (3.5), wind (3.8: P = 0.00256 Kz Kd G V² Cd), the combinations of Table 3.4-1;
// - in the frame's plane, the gravity loads on the portal (fixed at the shafts' tops, rigid at its knees) by the plane
//   frame solver; across it, the wind: the span as a beam simply supported on the posts' tops (conservative for the
//   span), each post a cantilever from its shaft under the span's reaction, its own wind and the span's end torsion;
// - the tubes by Section 5 (D/t, Table 5.8.2-1, 5.10, 5.11, Eqs. 5.12.1-1 to -3), the anchor bolts (5.16), the span's
//   flange bolts (5.15);
// - fatigue (Section 11) for a noncantilevered support: natural wind gust and truck-induced gust (no galloping,
//   Table 11.6-1), at the tube-to-plate welds by KF and KI (11.9.3.1);
// - the span's vertical deflection under Service I, L/150 (10.4.1);
// - each post's shaft (cantilever.ts designShaft).
// kip, ft, in, ksi.

export type BridgeSign = { length: number; height: number; at: number; weight: number; depth: number }; // ft, ft, ft from the left post to its center, kip (0: an aluminum panel), ft (a box sign)

export type SignBridgeInputs = ShaftPart & {
  span: number; // ft, post centerline to post centerline
  height: number; // ft, the shafts' tops to the span's centerline
  postD: number; // in
  postWall: number; // in
  beamD: number; // in
  beamWall: number; // in
  Fy: number; // ksi
  signs: BridgeSign[];
  signThickness: number; // in, the aluminum panels
  miscPct: number; // supports and walkways, % of the panels' weight
  // Wind (3.8)
  V: number;
  Kd: number;
  G: number;
  Cv: number;
  // Connections
  base: { plateT: number; plateW: number; opening: number; rods: number; rodD: number; rodCircle: number; rodFu: number };
  flange: { bolts: number; boltD: number; circle: number; plateT: number; opening: number; Fub: number };
  // Fatigue (11)
  fatigue: { category: "I" | "II" | "III"; vMean: number; truck: boolean; clearance: number; postWeld: Weld; beamWeld: Weld };
};

const shaftOf = (s: typeof SIGN_DEFAULTS): ShaftPart => ({ shaftD: s.shaftD, shaftLength: s.shaftLength, cover: s.cover, bars: s.bars, bar: s.bar, tieBar: s.tieBar, tieSpacing: s.tieSpacing, fc: s.fc, fy: s.fy, phiM: s.phiM, qp: s.qp, qs: s.qs, phiQp: s.phiQp, phiQs: s.phiQs, sideLength: s.sideLength, pyMoment: 0, pyShear: 0 });

/** The defaults: an 80 ft span 24 ft up on 16 in posts, an 18 in span tube, two 16 × 10 ft panels. */
export const SIGN_BRIDGE_DEFAULTS: SignBridgeInputs = {
  ...shaftOf(SIGN_DEFAULTS),
  shaftD: 42,
  shaftLength: 18,
  bars: 16,
  bar: 9,
  sideLength: 10,
  span: 80,
  height: 24,
  postD: 16,
  postWall: 0.5,
  beamD: 20,
  beamWall: 0.375,
  Fy: 55,
  signs: [
    { length: 16, height: 10, at: 26, weight: 0, depth: 0 },
    { length: 16, height: 10, at: 54, weight: 0, depth: 0 },
  ],
  signThickness: 7 / 32,
  miscPct: 50,
  V: 120,
  Kd: 0.85,
  G: 1.14,
  Cv: 1,
  base: { plateT: 2.5, plateW: 30, opening: 8, rods: 6, rodD: 1.75, rodCircle: 26, rodFu: 125 },
  flange: { bolts: 8, boltD: 1.25, circle: 26, plateT: 2, opening: 8, Fub: 120 },
  fatigue: { category: "I", vMean: 11.2, truck: true, clearance: 18, postWeld: "groove", beamWeld: "groove" },
};

const STEEL = 0.49; // kcf
const ALUMINUM = 0.175; // kcf
const E = 29000;
const N = 24; // the span's elements in the frame

export function designSignBridge(i: SignBridgeInputs) {
  if (!(i.span > 0 && i.height > 0 && i.postD > 0 && i.beamD > 0)) throw new DesignError("The sign bridge needs a span, a height and its tubes.");
  const checks: Check[] = [];
  const add = (c: Omit<Check, "ok"> & { ok?: boolean }) => checks.push({ ...c, ok: c.ok ?? c.demand <= c.capacity + 1e-9 });
  const post = roundTube(i.postD, i.postWall, i.Fy, i.height);
  const beam = roundTube(i.beamD, i.beamWall, i.Fy, i.span / 2);
  const phi = { f: 0.9, c: 0.9, v: 0.9, T: 0.95 };

  // --- dead loads (3.5) ---
  const wBeam = (beam.A / 144) * STEEL * 1.1; // klf, 10% for flanges and attachments
  const wPost = (post.A / 144) * STEEL * 1.1;
  const signs = i.signs.map((s) => {
    const area = s.length * s.height;
    const W = (s.weight > 0 ? s.weight : area * (i.signThickness / 12) * ALUMINUM) * (1 + i.miscPct / 100);
    const a = Math.max(0, s.at - s.length / 2);
    const b = Math.min(i.span, s.at + s.length / 2);
    return { ...s, area, W, a, b };
  });
  const DC = wBeam * i.span + 2 * wPost * i.height + signs.reduce((t, s) => t + s.W, 0);

  // --- the portal in its plane: posts fixed at the shafts' tops, the span in N elements ---
  const nodes: FrameNode[] = [{ x: 0, y: 0 }, ...Array.from({ length: N + 1 }, (_, k) => ({ x: (i.span * k) / N, y: i.height })), { x: i.span, y: 0 }];
  const top = (k: number) => 1 + k; // the span's nodes
  const right = N + 2;
  const els: FrameElement[] = [{ i: 0, j: top(0), A: post.A, I: post.I }, ...Array.from({ length: N }, (_, k) => ({ i: top(k), j: top(k + 1), A: beam.A, I: beam.I })), { i: right, j: top(N), A: post.A, I: post.I }];
  const frame = new Frame(nodes, els, [{ node: 0, ux: true, uy: true, rz: true }, { node: right, ux: true, uy: true, rz: true }]);
  const dx = i.span / N;
  /** A vertical load per foot along the span from a to b (kip/ft, down), on the elements it covers. */
  const spanLoad = (a: number, b: number, w: number): DistLoad[] =>
    Array.from({ length: N }, (_, k) => k).flatMap((k) => {
      const x0 = k * dx;
      const s0 = Math.max(a, x0) - x0;
      const s1 = Math.min(b, x0 + dx) - x0;
      return s1 > s0 + 1e-9 ? [{ el: 1 + k, dir: "y" as const, s0, s1, q0: -w, q1: -w }] : [];
    });
  const gravity = frame.solve({
    dist: [...spanLoad(0, i.span, wBeam), ...signs.flatMap((s) => spanLoad(s.a, s.b, s.W / Math.max(1e-6, s.b - s.a))), { el: 0, dir: "y", s0: 0, s1: i.height, q0: -wPost, q1: -wPost }, { el: N + 1, dir: "y", s0: 0, s1: i.height, q0: -wPost, q1: -wPost }],
  });
  // The span's moment at each node (sagging +), the posts' at their bases and tops, the posts' axial loads.
  const spanM = Array.from({ length: N + 1 }, (_, k) => (k < N ? gravity[1 + k].Mi : gravity[N].Mj)); // sagging + (the frame's convention: the −y side in tension)
  const postBase = { M: Math.abs(gravity[0].Mi), P: Math.max(gravity[0].Ni, gravity[N + 1].Ni), V: Math.abs(gravity[0].Vi) };
  const knee = Math.max(Math.abs(gravity[1].Mi), Math.abs(gravity[N].Mj));

  // --- wind across the frame (3.8): the span and signs, simply supported on the posts' tops ---
  const kz = Kz(i.height);
  const qOf = (Cd: number) => 0.00256 * kz * i.Kd * i.G * i.V ** 2 * Cd; // psf
  const CdBeam = roundCd(i.Cv * i.V * (i.beamD / 12));
  const CdPost = roundCd(i.Cv * i.V * (i.postD / 12));
  const wWindBeam = (qOf(CdBeam) * (i.beamD / 12)) / 1000; // klf
  const wWindPost = (qOf(CdPost) * (i.postD / 12)) / 1000;
  const signWind = signs.map((s) => ({ ...s, F: (qOf(signCd(Math.max(s.length, s.height) / Math.min(s.length, s.height))) * s.area) / 1000 }));
  /** The horizontal span's moment at x (simply supported) and its reactions, for a wind per foot on it and the signs' forces. */
  const horiz = (w: number, forces: { a: number; b: number; F: number }[]) => {
    const R0 = (w * i.span) / 2 + forces.reduce((t, f) => t + f.F * (1 - (f.a + f.b) / 2 / i.span), 0);
    const R1 = w * i.span + forces.reduce((t, f) => t + f.F, 0) - R0;
    const M = (x: number) => R0 * x - (w * x * x) / 2 - forces.reduce((t, f) => t + (f.F / (f.b - f.a)) * (Math.max(0, x - f.a) ** 2 - Math.max(0, x - f.b) ** 2) / 2, 0);
    return { R0, R1, M };
  };
  const wind = horiz(wWindBeam, signWind);
  const Rw = Math.max(wind.R0, wind.R1);
  const postWindBase = Rw * i.height + (wWindPost * i.height ** 2) / 2; // kip·ft, across the frame
  const Vw = Rw + wWindPost * i.height;
  // Torsion in the span: the signs hang in front of it by half its depth and their supports (dead), and the wind acts at
  // their centers, which are taken level with the span's axis.
  const ecc = (i.beamD / 2 + 6) / 12; // ft
  const Tdead = signs.reduce((t, s) => t + s.W * ecc, 0) / 2; // kip·ft at each end

  // --- combinations (Table 3.4-1) ---
  const combos = [
    { name: "Strength I", gDC: 1.25, gW: 0 },
    { name: "Extreme I", gDC: 1.1, gW: 1 },
    { name: "Extreme I (min DC)", gDC: 0.9, gW: 1 },
  ];
  const span = combos.map((c) => {
    // The span: in-plane (gravity, the frame's) and across (wind) at each node, their resultant (Eq. 5.12.1-4).
    let worst = { r: 0, x: 0, Min: 0, Mout: 0 };
    for (let k = 0; k <= N; k++) {
      const x = (i.span * k) / N;
      const Min = c.gDC * spanM[k];
      const Mout = c.gW * wind.M(x);
      const M = Math.hypot(Min, Mout);
      if (M > worst.r) worst = { r: M, x, Min, Mout };
    }
    const V = Math.hypot(c.gDC * Math.abs(gravity[1].Vi), c.gW * Rw);
    const T = c.gDC * Tdead;
    return { ...c, M: worst.r, x: worst.x, V, T };
  });
  const posts = combos.map((c) => {
    const Min = c.gDC * postBase.M;
    const Mout = c.gW * postWindBase + c.gDC * Tdead; // the span's end torsion bends the post across the frame
    return { ...c, P: c.gDC * postBase.P, M: Math.hypot(Min, Mout), V: Math.hypot(c.gDC * postBase.V, c.gW * Vw), T: 0 };
  });

  /** Eqs. 5.12.1-1 to -3. */
  const interaction = (P: number, BM: number, V: number, T: number, t: ReturnType<typeof roundTube>) => {
    const Pr = phi.c * t.Pn;
    const Mr = phi.f * t.Mn;
    const Tr = phi.T * t.Tn;
    if (T / Tr > 0.2) return P / Pr + BM / Mr + (V / (phi.v * t.Vn) + T / Tr) ** 2;
    return P / Pr >= 0.2 ? P / Pr + (8 / 9) * (BM / Mr) : P / (2 * Pr) + BM / Mr;
  };
  add({ id: "post-class", name: `Posts: D/t ${post.lam.toFixed(1)}, ${post.cls}`, demand: post.lam, capacity: (0.45 * E) / i.Fy, unit: "", ref: "LRFD-LTS Table 5.7.2-1" });
  add({ id: "beam-class", name: `Span: D/t ${beam.lam.toFixed(1)}, ${beam.cls}`, demand: beam.lam, capacity: (0.45 * E) / i.Fy, unit: "", ref: "LRFD-LTS Table 5.7.2-1" });
  let pw = { r: 0, name: "", B: 1 };
  for (const g of posts) {
    // The post as a cantilever across the frame (K = 2.1 in roundTube's Pn); the magnifier on the moment.
    const B = 1 / Math.max(0.05, 1 - g.P / post.Pe);
    const r = interaction(g.P, B * g.M * 12, g.V, g.T * 12, post);
    if (r > pw.r) pw = { r, name: g.name, B };
  }
  add({ id: "post-combined", name: `Posts at their bases: axial, flexure both ways, shear (${pw.name}, B ${pw.B.toFixed(3)})`, demand: pw.r, capacity: 1, unit: "", ref: "LRFD-LTS Eqs. 5.12.1-1 to -3" });
  let bw = { r: 0, name: "", x: 0 };
  for (const g of span) {
    const r = interaction(0, g.M * 12, g.V, g.T * 12, beam);
    if (r > bw.r) bw = { r, name: g.name, x: g.x };
  }
  add({ id: "beam-combined", name: `Span: flexure in and across the frame, shear, torsion (${bw.name}, ${bw.x.toFixed(1)} ft)`, demand: bw.r, capacity: 1, unit: "", ref: "LRFD-LTS Eqs. 5.12.1-1 to -3" });
  const kneeU = Math.max(...combos.map((c) => Math.hypot(c.gDC * knee, c.gDC * Tdead)));
  add({ id: "knee", name: "Span at the posts (the knees): flexure", demand: (kneeU * 12) / (phi.f * beam.Mn), capacity: 1, unit: "", ref: "LRFD-LTS Table 5.8.2-1" });

  // --- the anchor bolts (5.16) at each post, and the span's flange bolts (5.15) ---
  const b = i.base;
  const nt = Math.max(4.5, Math.round((13 / (b.rodD + 0.5)) * 2) / 2 + 2);
  const An = 0.7854 * (b.rodD - 0.9743 / nt) ** 2;
  const Ab = (Math.PI * b.rodD ** 2) / 4;
  const ext = posts[1];
  const rodT = (4 * ext.M * 12) / (b.rods * b.rodCircle) - ext.P / b.rods;
  const rodC = (4 * ext.M * 12) / (b.rods * b.rodCircle) + ext.P / b.rods;
  const rodV = ext.V / b.rods;
  const Rnt = 0.75 * b.rodFu * An;
  const Rnv = 0.75 * 0.45 * b.rodFu * Ab;
  add({ id: "rod-tension", name: `Anchor bolts: ${b.rods} of ${b.rodD} in on a ${b.rodCircle} in circle per post, tension`, demand: Math.max(0, rodT), capacity: Rnt, unit: "kip", ref: "LRFD-LTS 5.16.3 (AISC Design Guide 1)" });
  add({ id: "rod-compression", name: "Anchor bolts: compression (double-nut)", demand: rodC, capacity: Rnt, unit: "kip", ref: "LRFD-LTS 5.16.3" });
  add({ id: "rod-combined", name: "Anchor bolts: tension and shear", demand: (Math.max(0, rodT) / Rnt) ** 2 + (rodV / Rnv) ** 2, capacity: 1, unit: "", ref: "LRFD-LTS 5.16.3 (AISC Design Guide 1)" });
  const arm2 = Math.max(0.5, (b.rodCircle - i.postD) / 2);
  const beff = Math.min((Math.PI * b.rodCircle) / b.rods, 2 * arm2 + i.postD / 2);
  const tReq = Math.sqrt((4 * Math.max(rodT, rodC) * arm2) / (0.9 * i.Fy * Math.max(1, beff)));
  add({ id: "base-plate", name: `Base plates (bolts' force about the post's face, over ${beff.toFixed(1)} in)`, demand: tReq, capacity: b.plateT, unit: "in", ref: "LRFD-LTS 5.16.3 (AISC Design Guide 1), φ 0.90" });
  const f = i.flange;
  const Mflange = Math.max(...combos.map((c) => Math.hypot(c.gDC * knee, c.gW * 0))); // the span's end moment in the frame
  const boltT = (4 * Mflange * 12) / (f.bolts * f.circle);
  const boltV = (Math.max(...span.map((g) => g.V)) + (Math.max(...span.map((g) => g.T)) * 12) / (f.circle / 2)) / f.bolts;
  const fAb = (Math.PI * f.boltD ** 2) / 4;
  const Rt = 0.8 * 0.76 * f.Fub * fAb;
  const Rv = 0.8 * 0.45 * f.Fub * fAb;
  add({ id: "flange-bolts", name: `Span's flanges: ${f.bolts} bolts of ${f.boltD} in, tension and shear`, demand: (boltT / Rt) ** 2 + (boltV / Rv) ** 2, capacity: 1, unit: "", ref: "LRFD-LTS 5.15, AASHTO LRFD 6.13.2.11" });

  // --- fatigue (Section 11): a noncantilevered support, natural wind gust and truck-induced gust ---
  const F = i.fatigue;
  const IF = IMPORTANCE[F.category];
  const pNW = (Cd: number) => 5.2 * Cd * IF.NW * (F.vMean / 11.2) ** 2; // psf (Eq. C11.7.1.2-1)
  const nwSigns = signWind.map((s) => ({ ...s, F: (pNW(signCd(Math.max(s.length, s.height) / Math.min(s.length, s.height))) * s.area) / 1000 }));
  const nw = horiz((pNW(CdBeam) * (i.beamD / 12)) / 1000, nwSigns);
  const MNWpost = Math.max(nw.R0, nw.R1) * i.height + ((pNW(CdPost) * (i.postD / 12)) / 1000) * (i.height ** 2 / 2);
  // Truck gust: 18.8 Cd IF psf, vertical, over any 12 ft of the span's and signs' horizontal projection; full to 20 ft
  // above the road, none at 33 ft. Its moment in the frame at the span's ends from the portal (a unit load at midspan, scaled).
  const red = F.truck ? Math.max(0, Math.min(1, (33 - F.clearance) / (33 - 20))) : 0;
  const deepest = signs.reduce((d, s) => Math.max(d, s.depth), 0);
  const CdTG = deepest > 0 ? signCd(12 / deepest) : CdBeam;
  const wTG = (18.8 * CdTG * IF.TG * red * Math.max(deepest, i.beamD / 12)) / 1000; // klf over 12 ft
  const tg = red > 0 ? frame.solve({ dist: spanLoad(i.span / 2 - 6, i.span / 2 + 6, wTG) }) : null;
  const MTGknee = tg ? Math.max(Math.abs(tg[1].Mi), Math.abs(tg[N].Mj)) : 0;
  const MTGbase = tg ? Math.abs(tg[0].Mi) : 0;
  const postWeld = tubeToPlate(F.postWeld, { D: i.postD, t: i.postWall }, { t: b.plateT, circle: b.rodCircle, opening: b.opening });
  const beamWeld = tubeToPlate(F.beamWeld, { D: i.beamD, t: i.beamWall }, { t: f.plateT, circle: f.circle, opening: f.opening });
  const wname = (w: ReturnType<typeof tubeToPlate>, weld: Weld) => `${weld === "fillet" ? "fillet-welded socket" : "groove weld"}, KI ${w.KI.toFixed(2)}`;
  if (!postWeld.valid) add({ id: "fat-post-range", name: "Posts' base plate weld: outside the stress concentration factor's range of validity", demand: 1, capacity: 0, unit: "", ref: "LRFD-LTS Table 11.9.3.1-2", ok: false, advisory: true });
  if (!beamWeld.valid) add({ id: "fat-beam-range", name: "Span's flange weld: outside the stress concentration factor's range of validity", demand: 1, capacity: 0, unit: "", ref: "LRFD-LTS Table 11.9.3.1-2", ok: false, advisory: true });
  add({ id: "fat-post-nw", name: `Fatigue, natural wind gust: post at its base plate (${wname(postWeld, F.postWeld)})`, demand: (MNWpost * 12) / post.S, capacity: postWeld.CAFT, unit: "ksi", ref: `LRFD-LTS 11.7.1.2, Table 11.9.3.1-1 detail ${postWeld.detail}` });
  if (tg) {
    add({ id: "fat-post-tg", name: `Fatigue, truck-induced gust: post at its base plate (${wname(postWeld, F.postWeld)})`, demand: (MTGbase * 12) / post.S, capacity: postWeld.CAFT, unit: "ksi", ref: `LRFD-LTS 11.7.1.3, Table 11.9.3.1-1 detail ${postWeld.detail}` });
    add({ id: "fat-beam-tg", name: `Fatigue, truck-induced gust: span at its flange plate (${wname(beamWeld, F.beamWeld)})`, demand: (MTGknee * 12) / beam.S, capacity: beamWeld.CAFT, unit: "ksi", ref: `LRFD-LTS 11.7.1.3, Table 11.9.3.1-1 detail ${beamWeld.detail}` });
  }

  // --- deflection (10.4.1): the span's vertical under Service I, L/150 (simply supported, conservative) ---
  const L = i.span * 12;
  const w = (wBeam / 12) * 1; // kip/in
  let defl = (5 * w * L ** 4) / (384 * E * beam.I);
  for (const s of signs) {
    const a = s.at * 12;
    const P = s.W;
    const bb = L - a;
    const xm = L / 2;
    defl += xm <= a ? (P * bb * xm * (L * L - bb * bb - xm * xm)) / (6 * E * beam.I * L) : (P * a * (L - xm) * (L * L - a * a - (L - xm) ** 2)) / (6 * E * beam.I * L);
  }
  add({ id: "beam-deflection", name: "Span's vertical deflection under Service I (simply supported, conservative)", demand: defl, capacity: L / 150, unit: "in", ref: "LRFD-LTS 10.4.1 (L/150)" });

  // --- each post's shaft: the larger post's base forces ---
  const shaftGroups: ShaftGroup[] = [...posts.map((g) => ({ gW: g.gW, P: g.P, M: g.M, T: 0, V: g.V })), { gW: 1, P: postBase.P, M: Math.hypot(postBase.M, postWindBase), T: 0, V: Math.hypot(postBase.V, Vw) }];
  const shaft = designShaft(i, shaftGroups);
  checks.push(...shaft.checks.map((c) => ({ ...c, name: `Shaft (each post): ${c.name}` })));

  return {
    ok: checks.every((c) => c.ok || c.advisory),
    checks,
    post,
    beam,
    dead: { wBeam, wPost, signs: signs.map((s) => ({ at: s.at, W: s.W, area: s.area })), DC },
    frame: { spanM, postBase, knee, gravity: { Mmid: spanM[N / 2] } },
    wind: { kz, CdBeam, CdPost, wWindBeam, wWindPost, signs: signWind.map((s) => s.F), Rw, postWindBase, Vw, Tdead },
    combos: { span, posts },
    rods: { An, Ab, rodT, rodC, rodV, Rnt, Rnv, tReq },
    fatigue: { IF, MNWpost, wTG, red, MTGknee, MTGbase, postWeld, beamWeld },
    deflection: defl,
    shaft: shaft.shaft,
  };
}

export type SignBridgeResult = ReturnType<typeof designSignBridge>;
