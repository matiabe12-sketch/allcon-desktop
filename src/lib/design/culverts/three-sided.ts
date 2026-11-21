import { Frame, type DistLoad, type FrameElement, type FrameNode, type LoadCase } from "../frame";
import { BARS, DesignError, type Check } from "../walls/cip";
import type { TakeoffSettings } from "../takeoff/types";

// A precast reinforced concrete three-sided culvert (AASHTO LRFD 12.14): a flat top slab on two legs, on cast-in-place
// footings, per foot of length.
// - Loads: DC; EV, the fill over the top with Fe = 1 + 0.20·H/Bc ≤ 1.15 (12.11.2.2.1); at-rest EH on the legs
//   (k0 = 1 − sin φ, 3.11.5.2); LS where traffic runs over (3.11.6.4); HL-93 through the fill (3.6.1.2.6), or on the top
//   slab's strip with less than 2 ft of fill (4.6.2.10), with IM (3.6.2.2) and m = 1.2, the truck, tandem and lane moved
//   across.
// - Analysis: the frame by the stiffness method, the legs pinned or fixed at the footings.
// - Strength I (Table 3.4.1-1, -2: DC 1.25/0.90, EV 1.35 rigid frame/0.90, EH 1.35 or 50% of it, 3.11.7, LS 1.75, LL
//   1.75) and Service I.
// - Checks: flexure (φ 0.95) and shear (φ 0.90, Table 12.5.5-1; 5.12.8.6 with 2 ft or more of fill, else 5.7.3.3) at the
//   top slab's midspan and corners and over the legs; crack control (5.6.7); minimum reinforcement (5.6.3.3); live load
//   deflection L/800 (12.14.5.9, 2.5.2.6.2); the footings' bearing (φ 0.45), sliding (φ 0.80), flexure and shear
//   (12.14.5.10, 10.6.3).
// kip, ft, in.

export type Bars = { bar: number; spacing: number }; // in

export type ThreeSidedInputs = {
  span: number; // ft, clear between the legs
  rise: number; // ft, clear, the footing's top to the top slab's underside
  ts: number; // in, top slab
  tw: number; // in, legs
  fill: number; // ft, over the top slab
  gamma: number; // pcf
  phi: number; // deg, the backfill
  traffic: boolean;
  lldf: number;
  fc: number; // ksi
  fy: number; // ksi
  cover: number; // in
  slabBottom: Bars; // top slab, inside face (positive moment)
  slabTop: Bars; // top slab, outside face (corner moment)
  legOut: Bars; // legs, outside face
  legIn: Bars; // legs, inside face
  base: "pinned" | "fixed";
  // Footings (cast in place)
  footW: number; // ft
  footT: number; // in
  footDepth: number; // ft, the footing's base below the stream bed
  footBars: Bars; // bottom, transverse
  qn: number; // ksf, nominal bearing resistance
  baseFriction: number; // deg, the footing on its soil
  takeoff?: TakeoffSettings;
};

export const THREE_SIDED_DEFAULTS: ThreeSidedInputs = {
  span: 24,
  rise: 8,
  ts: 14,
  tw: 12,
  fill: 3,
  gamma: 120,
  phi: 34,
  traffic: true,
  lldf: 1.15,
  fc: 5,
  fy: 60,
  cover: 2,
  slabBottom: { bar: 8, spacing: 5 },
  slabTop: { bar: 7, spacing: 6 },
  legOut: { bar: 7, spacing: 6 },
  legIn: { bar: 5, spacing: 12 },
  base: "pinned",
  footW: 6,
  footT: 18,
  footDepth: 4,
  footBars: { bar: 6, spacing: 12 },
  qn: 12,
  baseFriction: 32,
};

const As = (b: Bars) => (BARS[b.bar].area * 12) / b.spacing; // in²/ft

type Section = "slabMid" | "slabCorner" | "legTop" | "legMid";

/** The frame per foot of length: the members' centerlines, the top slab in many elements, the legs too. */
function buildFrame(i: ThreeSidedInputs) {
  const L = i.span + i.tw / 12; // centerline span
  const h = i.rise + i.ts / 24; // centerline height above the footings' tops
  const nS = 24;
  const nL = 12;
  const nodes: FrameNode[] = [];
  const els: FrameElement[] = [];
  const At = i.ts; // per foot: A = 12·t (in²) and I = 12·t³/12, the ratio is all that matters (E = 1)
  const It = i.ts ** 3;
  const Aw = i.tw;
  const Iw = i.tw ** 3;
  // Left leg, bottom to top
  for (let k = 0; k <= nL; k++) nodes.push({ x: 0, y: (h * k) / nL });
  const leftTop = nL;
  // Top slab, left to right
  for (let k = 1; k <= nS; k++) nodes.push({ x: (L * k) / nS, y: h });
  const rightTop = nodes.length - 1;
  // Right leg, top to bottom
  for (let k = 1; k <= nL; k++) nodes.push({ x: L, y: h - (h * k) / nL });
  const rightBase = nodes.length - 1;
  for (let k = 0; k < nL; k++) els.push({ i: k, j: k + 1, A: Aw * 12, I: Iw });
  const slab0 = els.length;
  for (let k = 0; k < nS; k++) els.push({ i: leftTop + k, j: leftTop + k + 1, A: At * 12, I: It });
  const right0 = els.length;
  for (let k = 0; k < nL; k++) els.push({ i: rightTop + k, j: rightTop + k + 1, A: Aw * 12, I: Iw });
  const fixed = i.base === "fixed";
  const frame = new Frame(nodes, els, [
    { node: 0, ux: true, uy: true, rz: fixed },
    { node: rightBase, ux: true, uy: true, rz: fixed },
  ]);
  return { frame, L, h, nS, nL, slab0, right0, leftTop, rightTop, nodes };
}

export function designThreeSided(i: ThreeSidedInputs) {
  if (!(i.span > 0 && i.rise > 0 && i.ts > 0 && i.tw > 0)) throw new DesignError("The culvert needs a span, rise and thicknesses.");
  const checks: Check[] = [];
  const add = (c: Omit<Check, "ok"> & { ok?: boolean }) => checks.push({ ...c, ok: c.ok ?? c.demand <= c.capacity });
  const f = buildFrame(i);
  const { frame, L, h, nS, nL, slab0, right0 } = f;
  const gs = i.gamma / 1000;
  const Bc = i.span + (2 * i.tw) / 12;
  const Fe = Math.min(1.15, 1 + (0.2 * i.fill) / Bc); // 12.11.2.2.1
  const k0 = 1 - Math.sin((i.phi * Math.PI) / 180);
  const slabLoad = (q: number): DistLoad[] => Array.from({ length: nS }, (_, k) => ({ el: slab0 + k, dir: "y" as const, s0: 0, s1: L / nS, q0: -q, q1: -q }));
  // Lateral pressure on both legs, inward, linear from p(top) to p(bottom); the right leg's elements run top to bottom.
  const legLoadR = (pTop: number, pBot: number): DistLoad[] => {
    const out: DistLoad[] = [];
    const p = (y: number) => pBot + ((pTop - pBot) * y) / h;
    for (let k = 0; k < nL; k++) {
      const y0 = (h * k) / nL;
      const y1 = (h * (k + 1)) / nL;
      out.push({ el: k, dir: "x", s0: 0, s1: h / nL, q0: p(y0), q1: p(y1) });
      const ya = h - (h * k) / nL;
      const yb = h - (h * (k + 1)) / nL;
      out.push({ el: right0 + k, dir: "x", s0: 0, s1: h / nL, q0: -p(ya), q1: -p(yb) });
    }
    return out;
  };
  // Depth from the ground to the slab's centerline, and the legs' pressures (at-rest).
  const zTop = i.fill + i.ts / 24;
  const DC: LoadCase = { dist: slabLoad(0.15 * (i.ts / 12) + 0) };
  const EV: LoadCase = { dist: slabLoad(Fe * gs * i.fill) };
  const EH: LoadCase = { dist: legLoadR(k0 * gs * zTop, k0 * gs * (zTop + h)) };
  const heq = (() => {
    const H = i.rise + i.ts / 12 + i.fill;
    return H <= 5 ? 4 : H <= 10 ? 4 - (H - 5) * 0.2 : H <= 20 ? 3 - (H - 10) * 0.1 : 2;
  })(); // Table 3.11.6.4-1 (abutment height)
  const LS: LoadCase = { dist: legLoadR(k0 * gs * heq, k0 * gs * heq) };

  // Live load: patches through the fill (3.6.1.2.6) or a strip on the slab (4.6.2.10), moved across.
  const H = i.fill;
  const IM = Math.max(0, 33 * (1 - 0.125 * H)) / 100;
  const shallow = H < 2;
  const Lp = shallow ? (10 + i.lldf * H * 12) / 12 : 10 / 12 + i.lldf * H;
  const Wp = shallow ? (96 + 1.44 * i.span) / 12 : 6 + 20 / 12 + i.lldf * H;
  const m = 1.2;
  const laneW = i.span > 15 ? (0.64 * m) / (10 + (shallow ? 0 : i.lldf * H)) : 0;
  const vehicles = [
    { name: "truck", axles: [8, 32, 32], gaps: [14, 14] },
    { name: "tandem", axles: [25, 25], gaps: [4] },
  ];
  const patchLoads = (axles: number[], gaps: number[], x0: number) => {
    const xs = axles.map((_, k) => x0 + gaps.slice(0, k).reduce((a, g) => a + g, 0));
    const out: { a: number; b: number; w: number }[] = [];
    let k = 0;
    while (k < axles.length) {
      let j = k;
      while (j + 1 < axles.length && xs[j + 1] - xs[j] < Lp) j++;
      const a = xs[k] - Lp / 2;
      const b = xs[j] + Lp / 2;
      const P = axles.slice(k, j + 1).reduce((s, p) => s + p, 0);
      out.push({ a, b, w: (P * m * (1 + IM)) / (Wp * (b - a)) });
      k = j + 1;
    }
    return out;
  };
  const onSlab = (ps: { a: number; b: number; w: number }[]): LoadCase => ({
    dist: ps.flatMap((p) =>
      Array.from({ length: nS }, (_, k) => {
        const x0 = (L * k) / nS;
        const x1 = (L * (k + 1)) / nS;
        const a = Math.max(p.a, x0);
        const b = Math.min(p.b, x1);
        return b > a ? [{ el: slab0 + k, dir: "y" as const, s0: a - x0, s1: b - x0, q0: -p.w, q1: -p.w }] : [];
      }).flat(),
    ),
  });

  // The section forces: the top slab's midspan (sagging +), its corner (the slab's end), the leg's top and its largest
  // inside-face moment; shear at d from the leg's face; the legs' axial loads; the base reactions.
  const dSlab = i.ts - i.cover - BARS[i.slabBottom.bar].dia / 2;
  const xShear = i.tw / 24 + dSlab / 12; // from the leg's centerline
  const kShear = Math.min(nS - 1, Math.floor((xShear / L) * nS));
  const sections = (lc: LoadCase) => {
    const ef = frame.solve(lc);
    const mid = ef[slab0 + nS / 2 - 1].Mj;
    const corner = Math.min(ef[slab0].Mi, ef[slab0 + nS - 1].Mj); // hogging is negative
    const legTop = ef[nL - 1].Mj; // the left leg's top: positive = inside tension
    let legIn = -Infinity;
    let legOut = Infinity;
    for (let k = 0; k < nL; k++) {
      legIn = Math.max(legIn, ef[k].Mi, ef[k].Mj, ef[right0 + k].Mi, ef[right0 + k].Mj); // both legs: + is inside tension
      legOut = Math.min(legOut, ef[k].Mi, ef[k].Mj, ef[right0 + k].Mi, ef[right0 + k].Mj);
    }
    const V = Math.max(Math.abs(ef[slab0 + kShear].Vi), Math.abs(ef[slab0 + nS - 1 - kShear].Vj));
    const Mv = Math.max(Math.abs(ef[slab0 + kShear].Mi), Math.abs(ef[slab0 + nS - 1 - kShear].Mj));
    const N = Math.max(ef[0].Ni, ef[right0 + nL - 1].Nj); // legs' compression at the base
    const Hb = Math.max(Math.abs(ef[0].Vi), Math.abs(ef[right0 + nL - 1].Vj));
    // Midspan deflection from the end and midspan moments: δ = 5L²/(48EI)·(Mc + 0.1(Ma + Mb)), hogging negative.
    const dM = mid + 0.1 * (ef[slab0].Mi + ef[slab0 + nS - 1].Mj);
    return { mid, corner, legTop, legIn, legOut, V, Mv, N, Hb, dM };
  };
  const sDC = sections(DC);
  const sEV = sections(EV);
  const sEH = sections(EH);
  const sLS = sections(LS);
  // Live load envelope: every vehicle at 1 ft steps, and the lane on the whole slab.
  const llRuns: ReturnType<typeof sections>[] = [];
  if (i.traffic) {
    for (const v of vehicles) {
      const len = v.gaps.reduce((a, g) => a + g, 0);
      for (let x0 = -len; x0 <= L; x0 += 1) {
        const ps = patchLoads(v.axles, v.gaps, x0);
        if (ps.every((p) => p.b < 0 || p.a > L)) continue;
        const lane = laneW > 0 ? [{ a: 0, b: L, w: laneW }] : [];
        llRuns.push(sections(onSlab([...ps, ...lane])));
      }
    }
  }
  const env = (key: keyof ReturnType<typeof sections>) => ({
    max: Math.max(0, ...llRuns.map((r) => r[key])),
    min: Math.min(0, ...llRuns.map((r) => r[key])),
  });
  const ll = { dM: env("dM"), mid: env("mid"), corner: env("corner"), legTop: env("legTop"), legIn: env("legIn"), legOut: env("legOut"), V: env("V"), N: env("N"), Hb: env("Hb") };

  // Strength I: the factors that make each effect largest (EH at 1.35, or 50% of 0.90 where it relieves).
  const pick = (vals: { DC: number; EV: number; EH: number; LS: number; LLmax: number; LLmin: number }, sign: 1 | -1) => {
    const c = (x: number, hi: number, lo: number) => (sign * x >= 0 ? hi * x : lo * x);
    return c(vals.DC, 1.25, 0.9) + c(vals.EV, 1.35, 0.9) + c(vals.EH, 1.35, 0.5 * 0.9) + c(vals.LS, 1.75, 0) + 1.75 * (sign > 0 ? vals.LLmax : vals.LLmin);
  };
  const svc = (vals: { DC: number; EV: number; EH: number; LS: number; LLmax: number; LLmin: number }, sign: 1 | -1) =>
    vals.DC + vals.EV + (sign * vals.EH >= 0 ? vals.EH : 0.5 * vals.EH) + (sign * vals.LS >= 0 ? vals.LS : 0) + (sign > 0 ? vals.LLmax : vals.LLmin);
  const v = (key: "mid" | "corner" | "legIn" | "legOut" | "legTop", llKey: keyof typeof ll) => ({ DC: sDC[key], EV: sEV[key], EH: sEH[key], LS: sLS[key], LLmax: ll[llKey].max, LLmin: ll[llKey].min });
  const Mu = {
    slabMid: pick(v("mid", "mid"), 1),
    slabCorner: -pick(v("corner", "corner"), -1),
    legOut: -pick(v("legOut", "legOut"), -1),
    legIn: pick(v("legIn", "legIn"), 1),
  };
  const Ms = {
    slabMid: svc(v("mid", "mid"), 1),
    slabCorner: -svc(v("corner", "corner"), -1),
    legOut: -svc(v("legOut", "legOut"), -1),
    legIn: svc(v("legIn", "legIn"), 1),
  };
  const Vu = 1.25 * sDC.V + 1.35 * sEV.V + 1.75 * ll.V.max + 1.35 * Math.max(0, sEH.V);
  const Muv = Math.max(1e-6, 1.25 * sDC.Mv + 1.35 * sEV.Mv);

  // --- section checks per foot -------------------------------------------------------------------------------
  const fc = i.fc;
  const Ec = 120000 * 0.15 ** 2 * fc ** 0.33; // AASHTO Eq. 5.4.2.4-1, K1 1, wc 0.150 kcf
  const n = 29000 / Ec;
  const fr = 0.24 * Math.sqrt(fc);
  const sectionOf = (t: number, b: Bars) => {
    const A = As(b);
    const d = t - i.cover - BARS[b.bar].dia / 2;
    const a = (A * i.fy) / (0.85 * fc * 12);
    const Mn = (A * i.fy * (d - a / 2)) / 12; // kip·ft per ft
    const rho = A / (12 * d);
    const k = Math.sqrt(2 * rho * n + (rho * n) ** 2) - rho * n;
    const j = 1 - k / 3;
    const dc = i.cover + BARS[b.bar].dia / 2;
    const Sg = (12 * t * t) / 6;
    const Mcr = (0.67 * 1.6 * fr * Sg) / 12;
    return { A, d, Mn, j, dc, t, Mcr };
  };
  const members: { id: Section | "legIn"; name: string; t: number; b: Bars; Mu: number; Ms: number }[] = [
    { id: "slabMid", name: `Top slab at midspan (inside face, #${i.slabBottom.bar} @ ${i.slabBottom.spacing})`, t: i.ts, b: i.slabBottom, Mu: Mu.slabMid, Ms: Ms.slabMid },
    { id: "slabCorner", name: `Top slab at the corners (outside face, #${i.slabTop.bar} @ ${i.slabTop.spacing})`, t: i.ts, b: i.slabTop, Mu: Mu.slabCorner, Ms: Ms.slabCorner },
    { id: "legTop", name: `Legs, outside face (#${i.legOut.bar} @ ${i.legOut.spacing})`, t: i.tw, b: i.legOut, Mu: Mu.legOut, Ms: Ms.legOut },
    { id: "legIn", name: `Legs, inside face (#${i.legIn.bar} @ ${i.legIn.spacing})`, t: i.tw, b: i.legIn, Mu: Mu.legIn, Ms: Ms.legIn },
  ];
  const sec = members.map((mbr) => {
    const s = sectionOf(mbr.t, mbr.b);
    add({ id: `${mbr.id}-flexure`, name: `${mbr.name}: flexure`, demand: Math.max(0, mbr.Mu), capacity: 0.95 * s.Mn, unit: "kip·ft/ft", ref: "AASHTO 5.6.3.2, Table 12.5.5-1" });
    // Minimum reinforcement (5.6.3.3): φMn ≥ the lesser of 1.33·Mu and Mcr.
    add({ id: `${mbr.id}-min`, name: `${mbr.name}: minimum reinforcement`, demand: Math.min(1.33 * Math.max(0, mbr.Mu), s.Mcr), capacity: 0.95 * s.Mn, unit: "kip·ft/ft", ref: "AASHTO 5.6.3.3" });
    // Crack control (5.6.7), γe = 1.0.
    const fss = Math.min(0.6 * i.fy, (Math.max(0, mbr.Ms) * 12) / (s.A * s.j * s.d));
    const bs = 1 + s.dc / (0.7 * (mbr.t - s.dc));
    const smax = fss > 0 ? (700 * 1.0) / (bs * fss) - 2 * s.dc : Infinity;
    add({ id: `${mbr.id}-crack`, name: `${mbr.name}: crack control (fss ${fss.toFixed(1)} ksi)`, demand: mbr.b.spacing, capacity: smax, unit: "in", ref: "AASHTO 5.6.7" });
    return { ...mbr, ...s, fss, smax };
  });
  // Shear in the top slab (5.12.8.6.2 with 2 ft or more of fill; else 5.7.3.3, β = 2).
  const sS = sectionOf(i.ts, i.slabBottom);
  const de = sS.d;
  const ratio = Math.min(1, (Vu * de) / (Muv * 12));
  const Vc = H >= 2 ? Math.min((0.0676 * Math.sqrt(fc) + 4.6 * (sS.A / (12 * de)) * ratio) * 12 * de, 0.126 * Math.sqrt(fc) * 12 * de) : 0.0316 * 2 * Math.sqrt(fc) * 12 * Math.max(0.9 * de, 0.72 * i.ts);
  add({ id: "slab-shear", name: `Top slab in shear at d from the legs (${H >= 2 ? "5.12.8.6.2" : "5.7.3.3, β = 2"})`, demand: Vu, capacity: 0.9 * Vc, unit: "kip/ft", ref: `AASHTO ${H >= 2 ? "5.12.8.6.2" : "5.7.3.3"}, Table 12.5.5-1` });

  // Live load deflection at midspan (12.14.5.9, 2.5.2.6.2: L/800), the gross section.
  const Ig = (12 * i.ts ** 3) / 12;
  const defl = ((5 / 48) * (ll.dM.max * 12) * (L * 12) ** 2) / (Ec * Ig);
  add({ id: "deflection", name: "Live load deflection at midspan ≤ L/800", demand: defl, capacity: (i.span * 12) / 800, unit: "in", ref: "AASHTO 12.14.5.9, 2.5.2.6.2" });

  // --- footings (12.14.5.10, 10.6.3) ----------------------------------------------------------------------------
  const legW = 0.15 * (i.tw / 12) * h;
  const footWt = 0.15 * i.footW * (i.footT / 12);
  const soilOver = gs * i.footW * Math.max(0, i.footDepth - i.footT / 12) * 0.5; // half the footing under soil (the outer half)
  const Nu = 1.25 * (sDC.N + legW + footWt) + 1.35 * (sEV.N + soilOver) + 1.75 * ll.N.max;
  const Hu = 1.35 * sEH.Hb + 1.75 * sLS.Hb;
  const Mbase = Hu * (i.footT / 12); // the leg's shear acting at the footing's top
  const e = Mbase / Math.max(1e-6, Nu);
  const Beff = i.footW - 2 * e;
  const qu = Nu / Math.max(0.1, Beff);
  add({ id: "bearing", name: `Footing bearing (B′ = B − 2e = ${Beff.toFixed(2)} ft)`, demand: qu, capacity: 0.45 * i.qn, unit: "ksf", ref: "AASHTO 10.6.3.1, Table 10.5.5.2.2-1" });
  const Nmin = 0.9 * (sDC.N + legW + footWt) + 0.9 * (sEV.N + soilOver);
  add({ id: "sliding", name: "Footing sliding", demand: Hu, capacity: 0.8 * Nmin * Math.tan((i.baseFriction * Math.PI) / 180), unit: "kip/ft", ref: "AASHTO 10.6.3.4, Table 10.5.5.2.2-1" });
  const proj = (i.footW - i.tw / 12) / 2;
  const qNet = Nu / i.footW - 1.25 * footWt / i.footW;
  const MuF = (qNet * proj ** 2) / 2;
  const fs = sectionOf(i.footT, i.footBars);
  add({ id: "footing-flexure", name: `Footing flexure at the leg's face (#${i.footBars.bar} @ ${i.footBars.spacing})`, demand: MuF, capacity: 0.9 * fs.Mn, unit: "kip·ft/ft", ref: "AASHTO 5.6.3.2" });
  const VuF = qNet * Math.max(0, proj - fs.d / 12);
  add({ id: "footing-shear", name: "Footing shear at d from the leg (β = 2)", demand: VuF, capacity: 0.9 * 0.0316 * 2 * Math.sqrt(fc) * 12 * Math.max(0.9 * fs.d, 0.72 * i.footT), unit: "kip/ft", ref: "AASHTO 5.7.3.3" });

  return {
    ok: checks.every((c) => c.ok || c.advisory),
    checks,
    geometry: { L, h, Bc, Fe, k0, heq, zTop },
    live: { IM, shallow, Lp, Wp, laneW, runs: llRuns.length },
    unit: { DC: sDC, EV: sEV, EH: sEH, LS: sLS },
    ll,
    Mu,
    Ms,
    Vu,
    Vc,
    sections: sec,
    deflection: defl,
    footing: { Nu, Hu, e, Beff, qu, MuF, VuF, proj },
  };
}

export type ThreeSidedResult = ReturnType<typeof designThreeSided>;
