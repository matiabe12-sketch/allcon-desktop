import { BARS, DesignError, flexure, type Bars, type Check } from "../walls/cip";
import { continuousBeam } from "../girders/continuous";

// A cast-in-place concrete slab bridge, AASHTO LRFD 10th Edition: a solid slab spanning along the roadway over one to
// four spans, simple or cast continuous over its piers, its main bars parallel to traffic. The live load by the
// equivalent strip (4.6.2.3), HL-93 on influence lines (3.6.1.2, 3.6.1.3; 90% of two trucks with the lane over an
// interior support, 3.6.1.3.1), the edge strip under the barrier (4.6.2.1.4b); per foot of width. Checks: flexure
// (5.6.3.2), minimum reinforcement (5.6.3.3), crack control (5.6.7), the bars' fatigue (5.5.3.2, Fatigue I), shear
// (5.12.2.1: a slab designed for moment by 4.6.2.3 is deemed satisfactory, shown for information), distribution bars
// (9.7.3.2), shrinkage and temperature bars (5.10.6), the least depth (Table 2.5.2.6.3-1), live load deflection
// (2.5.2.6.2, L/800). The supports' reactions per foot for the substructure. Kip, foot; sections in inches.

export type SlabBridgeInputs = {
  spans: number[]; // ft, support centerline to centerline
  continuous: boolean; // cast monolithic over the piers; else a simple span each
  W: number; // ft, out to out
  barrierWidth: number; // ft, the deck's edge to the barrier's inside face
  barrierWeight: number; // klf, each barrier
  skew: number; // deg
  t: number; // in
  wearing: number; // in, the overlay (0 for none)
  gammaWS: number; // kcf
  fc: number; // ksi
  fy: number; // ksi
  gammaC: number; // kcf
  coverTop: number; // in, clear
  coverBot: number; // in, clear
  exposure: 1 | 2;
  bottom: Bars; // main, bottom, along the roadway
  top: Bars; // main, top over the piers (continuous)
  dist: Bars; // bottom, across (distribution)
  topTrans: Bars; // top, across (shrinkage and temperature)
  topLong: Bars; // top, along, where the top main bars aren't (shrinkage and temperature)
  /** Bars added in the edge strip (the edge beam), each edge, along its bottom and over the piers at its top: how many. */
  edgeBars: { count: number; bar: number } | null;
  llDeflection: boolean;
  deflectionLimit: number; // L / this
  /** Sidewalks inside the barriers (from the Bridge): ft wide each side to the curb, in above the slab. Their concrete
   * (DC), no overlay on them, the lanes between the curbs, and 0.075 ksf of pedestrians on those wider than 2 ft
   * (3.6.1.6), with the vehicles. */
  sidewalks?: { left: number; right: number; depth: number } | null;
  /** Load and Resistance Factor Rating (slabs/lrfr-slab.ts): its settings, off unless turned on. */
  rating?: import("../girders/lrfr").LrfrSettings;
};

export const SLAB_BRIDGE_DEFAULTS: SlabBridgeInputs = {
  spans: [30, 38, 30],
  continuous: true,
  W: 44,
  barrierWidth: 1.5,
  barrierWeight: 0.42,
  skew: 0,
  t: 20,
  wearing: 3,
  gammaWS: 0.14667,
  fc: 4.5,
  fy: 60,
  gammaC: 0.15,
  coverTop: 2.5,
  coverBot: 1.5,
  exposure: 1,
  bottom: { bar: 8, spacing: 6 },
  top: { bar: 8, spacing: 6 },
  dist: { bar: 5, spacing: 10 },
  topTrans: { bar: 5, spacing: 12 },
  topLong: { bar: 5, spacing: 12 },
  edgeBars: { count: 2, bar: 8 },
  llDeflection: true,
  deflectionLimit: 800,
};

const LANE = 0.64; // klf
const IM = 0.33;
const IM_FATIGUE = 0.15;
const mpf = (n: number) => (n <= 1 ? 1.2 : n === 2 ? 1 : n === 3 ? 0.85 : 0.65); // Table 3.6.1.1.2-1

export type SlabSection = {
  span: number; // index
  x: number; // ft from the span's start
  label: string;
  where: "interior" | "edge";
  negative: boolean; // top in tension
  E: number; // in, the strip
  MDC: number;
  MDW: number;
  MLL: number; // with IM, per foot (the skew factor in)
  Mu: number;
  Ms: number;
  Mfat: number; // Fatigue I's moment per foot (1.75 in)
  f: ReturnType<typeof flexure>;
  fRange: number;
  fMin: number;
  thresh: number;
};

export function designSlabBridge(i: SlabBridgeInputs) {
  const spans = i.spans.filter((L) => L > 0);
  if (!spans.length || spans.length > 4) throw new DesignError("Give one to four spans.");
  const swL = i.sidewalks?.left ?? 0;
  const swR = i.sidewalks?.right ?? 0;
  if (!(i.W > 2 * i.barrierWidth + swL + swR + 12) || !(i.t > 0)) throw new DesignError("The slab needs a width with room for a lane between the barriers, and a depth.");
  if (i.skew < 0 || i.skew > 45) throw new DesignError("The skew must be from 0° to 45°.");
  const checks: Check[] = [];
  const add = (c: Omit<Check, "ok"> & { ok?: boolean }) => checks.push({ ...c, ok: c.ok ?? c.demand <= c.capacity + 1e-9 });
  const rad = (i.skew * Math.PI) / 180;
  const continuous = i.continuous && spans.length > 1;

  // --- the strips (4.6.2.3) ------------------------------------------------------------------------------------------
  const roadway = i.W - 2 * i.barrierWidth - swL - swR; // between the barriers, or the sidewalks' curbs
  // The edge strip: the curb nearer its edge (the narrower sidewalk: the wheels nearest the edge), the wider sidewalk's
  // concrete and pedestrians in it (both the conservative side).
  const curbEdge = i.barrierWidth + Math.min(swL, swR);
  const swWide = Math.max(swL, swR);
  const wSw = i.sidewalks ? (i.gammaC * i.sidewalks.depth) / 12 : 0; // ksf
  const ped = (w: number) => (w > 2 ? w : 0);
  const NL = Math.max(1, Math.floor(roadway / 12)); // 3.6.1.1.1
  const strip = (L: number) => {
    const L1 = Math.min(L, 60);
    const E1 = 10 + 5 * Math.sqrt(L1 * Math.min(i.W, 30)); // in, Eq. 4.6.2.3-1
    const Em = Math.min(84 + 1.44 * Math.sqrt(L1 * Math.min(i.W, 60)), (12 * i.W) / NL); // in, Eq. 4.6.2.3-2
    const E = NL > 1 ? Math.min(E1, Em) : E1;
    // The edge strip (4.6.2.1.4b): the barrier's width, 12 in and a quarter strip, at most half the strip and 72 in.
    const Eedge = Math.min(curbEdge * 12 + 12 + E / 4, E / 2, 72);
    return { L1, E1, Em, E, Eedge };
  };
  const r = Math.min(1, 1.05 - 0.25 * Math.tan(rad)); // Eq. 4.6.2.3-3, on the longitudinal moments

  // --- dead loads per foot ---------------------------------------------------------------------------------------------
  const wSlab = (i.gammaC * i.t) / 12; // klf/ft
  const wDCint = wSlab + (2 * i.barrierWeight + wSw * (swL + swR)) / i.W; // the barriers and sidewalks spread over the width (interior strip)
  const wDW = (i.gammaWS * i.wearing * roadway) / (12 * i.W);
  const wPLint = (0.075 * (ped(swL) + ped(swR))) / i.W; // pedestrians spread over the width, ksf
  /** In the edge strip (Eedge, in): the wider sidewalk's part of it, ft. */
  const swIn = (Eedge: number) => Math.max(0, Math.min(swWide, Eedge / 12 - i.barrierWidth));

  // --- the beam: one continuous, or a simple span each ---------------------------------------------------------------------
  const beams = continuous ? [{ spans, first: 0 }] : spans.map((L, k) => ({ spans: [L], first: k }));
  const area = (b: Bars) => (BARS[b.bar].area * 12) / b.spacing;
  const beta1 = Math.min(0.85, Math.max(0.65, 0.85 - (i.fc - 4) * 0.05));
  const Ec = 120000 * i.gammaC ** 2 * i.fc ** 0.33; // Eq. 5.4.2.4-1
  const common = { fc: i.fc, fy: i.fy, Es: 29000, phiF: 0.9, exposure: i.exposure, n: 29000 / Ec, beta1 };
  const sections: SlabSection[] = [];
  const env: { span: number; x: number; Mpos: number; Mneg: number; MDC: number; MDW: number }[] = [];
  // The edge strip's added bars, per foot of the strip.
  const edgeExtra = (Eedge: number) => (i.edgeBars && i.edgeBars.count > 0 ? (i.edgeBars.count * BARS[i.edgeBars.bar].area) / (Eedge / 12) : 0);
  const eqBars = (b: Bars, As: number): Bars => ({ bar: b.bar, spacing: (BARS[b.bar].area * 12) / As });

  for (const beam of beams) {
    const cb = continuousBeam(beam.spans);
    cb.spans.forEach((L, s) => {
      const span = beam.first + s;
      const st = strip(L);
      const stAdj = (k: number) => strip(spans[Math.max(0, Math.min(spans.length - 1, k))]);
      const xs = Array.from({ length: 21 }, (_, q) => (q * L) / 20);
      for (const x of xs) {
        const live = cb.liveEnvelope(s, x, IM);
        const dc = cb.uniformAll(s, x, 1);
        env.push({ span, x, Mpos: live.Mpos, Mneg: live.Mneg, MDC: dc.M * wDCint, MDW: dc.M * wDW });
        const atSupport = x < 1e-9 || x > L - 1e-9;
        for (const negative of [false, true]) {
          const Mlane = negative ? -live.Mneg : live.Mpos; // per lane, with IM
          if (!(Mlane > 1e-9)) continue;
          if (negative && !continuous) continue;
          // Over a pier, the narrower of the adjacent spans' strips (the larger load per foot, conservative).
          const E = negative && atSupport ? Math.min(st.E, stAdj(x < 1e-9 ? span - 1 : span + 1).E) : st.E;
          const Eedge = negative && atSupport ? Math.min(st.Eedge, stAdj(x < 1e-9 ? span - 1 : span + 1).Eedge) : st.Eedge;
          const sign = negative ? -1 : 1;
          const MDCu = sign * dc.M; // per klf
          const fatLane = negative ? -live.fatNeg : live.fatPos;
          for (const where of ["interior", "edge"] as const) {
            const wDC = where === "interior" ? wDCint : wSlab + (i.barrierWeight + wSw * swIn(Eedge)) / (Eedge / 12);
            const wdw = where === "interior" ? wDW : (i.gammaWS * i.wearing * Math.max(0, Eedge / 12 - curbEdge)) / (12 * (Eedge / 12));
            const wPL = where === "interior" ? wPLint : swWide > 2 ? (0.075 * swIn(Eedge)) / (Eedge / 12) : 0;
            // The edge strip: one line of wheels (half the truck) and the lane's tributary part (the lane within it past
            // the barrier, of its 10 ft): the envelope's truck and lane together times the larger of half and that part,
            // with the one-lane multiple presence factor 1.2 (conservative).
            const tribLane = Math.min(1, Math.max(0, Eedge / 12 - curbEdge) / 10);
            const MLLlane = where === "interior" ? Mlane : 1.2 * Math.max(0.5, tribLane) * Mlane;
            // The vehicles over the strip, and the pedestrians (as the dead loads lie, where they add; no IM or r).
            const MLL = (MLLlane / ((where === "interior" ? E : Eedge) / 12)) * r + Math.max(0, MDCu * wPL);
            const MDC = Math.max(0, MDCu * wDC);
            const MDW = Math.max(0, MDCu * wdw);
            const Mu = 1.25 * MDC + 1.5 * MDW + 1.75 * MLL;
            const Ms = MDC + MDW + MLL;
            const mainBars = negative ? i.top : i.bottom;
            const As = area(mainBars) + (where === "edge" ? edgeExtra(Eedge) : 0);
            const f = flexure({ ...common, Mu, Ms, h: i.t, cover: negative ? i.coverTop : i.coverBot, bars: eqBars(mainBars, As) });
            // Fatigue I (1.75): one fatigue truck, 15% IM, over the one-lane strip without its 1.2 (C4.6.2.3: 1.2 E1).
            const Efat = (where === "interior" ? 1.2 * st.E1 : Eedge) / 12;
            // The edge strip: one wheel line, half the fatigue truck.
            const Mfat = (1.75 * fatLane * (where === "interior" ? 1 : 0.5) * (1 + IM_FATIGUE) * r) / Efat;
            const jd = f.j * f.de;
            const fRange = (Math.abs(Mfat) * 12) / (f.As * jd);
            const fMin = (Math.max(0, MDC + MDW) * 12) / (f.As * jd);
            const thresh = 26 - (22 * fMin) / i.fy; // Eq. 5.5.3.2-1
            sections.push({ span, x, label: `span ${span + 1}, ${(x / L).toFixed(2)}L`, where, negative, E: where === "interior" ? E : Eedge, MDC, MDW, MLL, Mu, Ms, Mfat, f, fRange, fMin, thresh });
          }
        }
      }
    });
  }

  // --- the checks: each kind's governing section --------------------------------------------------------------------------
  const pick = (where: "interior" | "edge", negative: boolean) => sections.filter((q) => q.where === where && q.negative === negative);
  for (const where of ["interior", "edge"] as const)
    for (const negative of continuous ? [false, true] : [false]) {
      const set = pick(where, negative);
      if (!set.length) continue;
      const tag = `${where === "interior" ? "Interior strip" : "Edge strip"}, ${negative ? "top bars over the piers" : "bottom bars"}`;
      const id = `${where}-${negative ? "neg" : "pos"}`;
      const fl = set.reduce((a, b) => (b.Mu / b.f.MR > a.Mu / a.f.MR ? b : a));
      add({ id: `${id}-flexure`, name: `${tag}: flexure (${fl.label})`, demand: fl.Mu, capacity: fl.f.MR, unit: "kip·ft/ft", ref: "AASHTO 5.6.3.2, 4.6.2.3" });
      const mn = set.reduce((a, b) => (b.f.minRequired / b.f.MR > a.f.minRequired / a.f.MR ? b : a));
      add({ id: `${id}-min`, name: `${tag}: minimum reinforcement (${mn.label})`, demand: mn.f.minRequired, capacity: mn.f.MR, unit: "kip·ft/ft", ref: "AASHTO 5.6.3.3" });
      const ck = set.reduce((a, b) => (b.f.sMax < a.f.sMax ? b : a));
      const s = (negative ? i.top : i.bottom).spacing;
      add({ id: `${id}-crack`, name: `${tag}: crack control (${ck.label})`, demand: s, capacity: ck.f.sMax, unit: "in", ref: "AASHTO 5.6.7" });
      const fa = set.reduce((a, b) => (b.fRange - b.thresh > a.fRange - a.thresh ? b : a));
      add({ id: `${id}-fatigue`, name: `${tag}: the bars' fatigue stress range (${fa.label})`, demand: fa.fRange, capacity: fa.thresh, unit: "ksi", ref: "AASHTO 5.5.3.2" });
    }

  // Spacing of the main bars (5.10.3.2).
  for (const [id, name, b] of [["bottom-spacing", "Bottom main bars", i.bottom], ...(continuous ? [["top-spacing", "Top main bars over the piers", i.top]] : [])] as [string, string, Bars][])
    add({ id, name: `${name}: spacing ≤ 1.5h and 18 in`, demand: b.spacing, capacity: Math.min(1.5 * i.t, 18), unit: "in", ref: "AASHTO 5.10.3.2" });

  // Shear (5.12.2.1): deemed satisfactory for a slab designed for moment by 4.6.2.3; φVc shown for information.
  const Vmax = (() => {
    let v = 0;
    for (const beam of beams) {
      const cb = continuousBeam(beam.spans);
      cb.spans.forEach((L, s) => {
        for (const x of [0, L]) {
          const st = strip(L);
          const live = cb.liveEnvelope(s, x, IM);
          const dc = cb.uniformAll(s, x, 1);
          v = Math.max(v, 1.25 * Math.abs(dc.V) * wDCint + 1.5 * Math.abs(dc.V) * wDW + (1.75 * live.V) / (st.E / 12) + 1.75 * Math.abs(dc.V) * wPLint);
        }
      });
    }
    return v;
  })();
  const deB = i.t - i.coverBot - BARS[i.bottom.bar].dia / 2;
  const dv = Math.max(0.9 * deB, 0.72 * i.t);
  const Vc = 0.0316 * 2 * Math.sqrt(i.fc) * 12 * dv;
  add({ id: "shear", name: "Shear at the supports, φVc (β 2): deemed satisfactory for a slab designed for moment", demand: Vmax, capacity: 0.9 * Vc, unit: "kip/ft", ref: "AASHTO 5.12.2.1, 5.7.3.3", advisory: true });

  // Distribution bars (9.7.3.2), main bars parallel to traffic: 100/√L %, at most 50%, of the positive moment bars.
  const Lmin = Math.min(...spans);
  const pct = Math.min(100 / Math.sqrt(Lmin), 50) / 100;
  add({ id: "dist", name: `Bottom transverse bars: distribution, ${(pct * 100).toFixed(1)}% of the main bars (shortest span)`, demand: pct * area(i.bottom), capacity: area(i.dist), unit: "in²/ft", ref: "AASHTO 9.7.3.2" });

  // Shrinkage and temperature, top each way (5.10.6, Eq. 5.10.6-1 per face, 0.11 to 0.60 in²/ft).
  const b = i.W * 12;
  const tempReq = Math.min(0.6, Math.max(0.11, (1.3 * b * i.t) / (2 * (b + i.t) * i.fy)));
  for (const [id, name, bb] of [["temp-trans", "Top transverse bars", i.topTrans], ["temp-long", "Top longitudinal bars where the main top bars aren't", i.topLong]] as [string, string, Bars][]) {
    add({ id, name: `${name}: shrinkage and temperature`, demand: tempReq, capacity: area(bb), unit: "in²/ft", ref: "AASHTO 5.10.6" });
    add({ id: `${id}-s`, name: `${name}: spacing ≤ 3h and 18 in`, demand: bb.spacing, capacity: Math.min(3 * i.t, 18), unit: "in", ref: "AASHTO 5.10.6" });
  }

  // The least depth (Table 2.5.2.6.3-1, slabs with the main bars parallel to traffic), the longest span.
  const S = Math.max(...spans);
  const hmin = continuous ? Math.max(0.54, (S + 10) / 30) : (1.2 * (S + 10)) / 30; // ft
  add({ id: "depth", name: `Least depth, ${continuous ? "continuous: (S + 10)/30 ≥ 0.54 ft" : "simple: 1.2 (S + 10)/30"}`, demand: hmin * 12, capacity: i.t, unit: "in", ref: "AASHTO Table 2.5.2.6.3-1" });

  // Live load deflection (2.5.2.6.2): every lane loaded with its multiple presence factor, the whole width deflecting
  // together, the gross section; the truck with IM, or 25% of it with the lane load (3.6.1.3.2); L/800.
  const deflection: { span: number; L: number; truck: number; lane: number; d: number; limit: number }[] = [];
  if (i.llDeflection) {
    const EI = Ec * ((i.W * 12 * i.t ** 3) / 12) / 144; // kip·ft²
    for (const beam of beams) {
      const cb = continuousBeam(beam.spans);
      cb.spans.forEach((L, s) => {
        const span = beam.first + s;
        const Xm = cb.starts[s] + L / 2;
        // δ at midspan for a unit load at X, by virtual work over the beam (both moments from the influence lines).
        const pts = 24;
        const mAtMid: { s: number; x: number; h: number; m: number }[] = [];
        cb.spans.forEach((Lj, j) => {
          for (let q = 0; q < pts; q++) {
            const x = ((q + 0.5) * Lj) / pts;
            mAtMid.push({ s: j, x, h: Lj / pts, m: cb.influence(j, x, "M")(Xm) });
          }
        });
        const dAt = (X: number) => mAtMid.reduce((t, p) => t + cb.influence(p.s, p.x, "M")(X) * p.m * p.h, 0) / EI;
        const grid = Array.from({ length: 81 }, (_, q) => cb.starts[s] + (q * L) / 80);
        const dGrid = grid.map(dAt);
        const dInterp = (X: number) => {
          if (X < grid[0] || X > grid[grid.length - 1]) return dAt(X);
          const q = Math.min(grid.length - 2, Math.floor(((X - grid[0]) / L) * 80));
          const f = (X - grid[q]) / (grid[q + 1] - grid[q]);
          return dGrid[q] * (1 - f) + dGrid[q + 1] * f;
        };
        let truckD = 0;
        for (const dir of [1, -1]) for (let p = cb.starts[s] - 30; p <= cb.starts[s] + L + 30; p += 0.5) {
          const ax = [{ P: 8, d: 0 }, { P: 32, d: 14 }, { P: 32, d: 28 }];
          const v = ax.reduce((t, a) => {
            const X = p + dir * a.d;
            return X < cb.starts[s] || X > cb.starts[s] + L ? t : t + a.P * dInterp(X);
          }, 0);
          truckD = Math.max(truckD, v);
        }
        const laneD = LANE * grid.slice(0, -1).reduce((t, X, q) => t + Math.max(0, (dGrid[q] + dGrid[q + 1]) / 2) * (L / 80), 0);
        const lanes = NL * mpf(NL);
        const d = Math.max(truckD * (1 + IM), 0.25 * truckD * (1 + IM) + laneD) * lanes * 12; // in
        deflection.push({ span, L, truck: truckD * (1 + IM) * lanes * 12, lane: laneD * lanes * 12, d, limit: (L * 12) / i.deflectionLimit });
        add({ id: `deflection-${span + 1}`, name: `Live load deflection, span ${span + 1} (all ${NL} lanes, the gross section)`, demand: d, capacity: (L * 12) / i.deflectionLimit, unit: "in", ref: "AASHTO 2.5.2.6.2, 3.6.1.3.2" });
      });
    }
  }

  // --- the supports' reactions per foot of width (unfactored), for the substructure ------------------------------------
  const nSup = spans.length + 1;
  const reactions = Array.from({ length: nSup }, () => ({ DC: 0, DW: 0, PL: 0, LLlane: 0, LLlaneIM: 0 }));
  for (const beam of beams) {
    const cb = continuousBeam(beam.spans);
    cb.spans.forEach((L, s) => {
      const k0 = beam.first + s;
      const dc0 = cb.uniformAll(s, 0, 1).V;
      const dc1 = -cb.uniformAll(s, L, 1).V;
      reactions[k0].DC += dc0 * wDCint;
      reactions[k0].DW += dc0 * wDW;
      reactions[k0].PL += dc0 * wPLint;
      reactions[k0 + 1].PL += dc1 * wPLint;
      reactions[k0 + 1].DC += dc1 * wDCint;
      reactions[k0 + 1].DW += dc1 * wDW;
    });
    // Live load: a lane's reaction at each support, from the shears either side of it (the most of them).
    cb.spans.forEach((L, s) => {
      const k0 = beam.first + s;
      const a = cb.liveEnvelope(s, 0, 0).V;
      const b = cb.liveEnvelope(s, L, 0).V;
      const aIM = cb.liveEnvelope(s, 0, IM).V;
      const bIM = cb.liveEnvelope(s, L, IM).V;
      reactions[k0].LLlane = Math.max(reactions[k0].LLlane, a);
      reactions[k0 + 1].LLlane = Math.max(reactions[k0 + 1].LLlane, b);
      reactions[k0].LLlaneIM = Math.max(reactions[k0].LLlaneIM, aIM);
      reactions[k0 + 1].LLlaneIM = Math.max(reactions[k0 + 1].LLlaneIM, bIM);
    });
  }
  // Every lane with its multiple presence factor, the most, over the width (per foot).
  const lanesM = Math.max(...Array.from({ length: NL }, (_, m) => (m + 1) * mpf(m + 1)));
  // The pedestrians with the vehicles (3.6.1.6), per foot of width.
  const perFoot = reactions.map((x) => ({ DC: x.DC, DW: x.DW, LL: (x.LLlane * lanesM) / i.W + x.PL, LLIM: (x.LLlaneIM * lanesM) / i.W + x.PL, PL: x.PL, lane: x.LLlane, laneIM: x.LLlaneIM }));

  return {
    ok: checks.every((c) => c.ok || c.advisory),
    checks,
    continuous,
    strips: spans.map((L) => ({ L, ...strip(L) })),
    NL,
    r,
    loads: { wSlab, wDCint, wDW, wPLint },
    sections,
    env,
    shear: { Vmax, dv, Vc },
    dist: { pct, Lmin },
    temp: { required: tempReq },
    depth: { S, hmin },
    deflection,
    reactions: perFoot,
    concrete: { Ec, beta1 },
  };
}

export type SlabBridgeResult = ReturnType<typeof designSlabBridge>;
