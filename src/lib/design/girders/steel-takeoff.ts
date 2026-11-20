import { num } from "../calc-style";
import { schedule } from "../rebar/schedule";
import { ftT, inT } from "../takeoff/tex";
import type { Takeoff } from "../takeoff/types";
import { designSteelGirder, type SteelGirderInputs, type SteelGirderResult } from "./steel";
import { L_SHAPES } from "./l-shapes";
import { connectionPlates, fieldSections, studZones, transverseStiffeners } from "./steel-sheet";
import { W_SHAPES } from "./w-shapes";

// The steel girders' quantity under CDOT Section 509 (Structural Steel, by the pound), by the computed weight
// of CDOT Standard Specifications 509.32(a): steel at 490.5 lb/ft³; plates at their net dimensions (clips
// deducted, no overrun); rolled shapes at their AISC nominal weight; high-strength bolts by Table 509-4 (head,
// nut, washer and stick-out); no allowance for welds or paint.

/** Steel, cast or rolled (CDOT 509.32(a)1), lb/ft³. */
export const STEEL_LB_FT3 = 490.5;

/** Net weight of 100 high-strength bolts outside the grip, with one nut and washer (CDOT Table 509-4), lb. */
export const BOLT_LB_PER_100: Record<string, number> = { "0.625": 32, "0.75": 53, "0.875": 81, "1": 117, "1.125": 165, "1.25": 212, "1.375": 280 };

const RHO = `${num(STEEL_LB_FT3)}\\frac{\\mathrm{lb}}{\\mathrm{ft}^{3}}`;
const fit = (n: number) => Math.round(n * 1000) / 1000;

export type SteelTakeoffRow = { part: string; count: number; desc: string; lb: number; term: string };

/** The bridge's steel, part by part, for nGirders girders (the design's own count unless given). */
export function steelQuantities(i: SteelGirderInputs, r: SteelGirderResult = designSteelGirder(i), nGirders = i.nGirders): { rows: SteelTakeoffRow[]; notes: string[] } {
  const rows: SteelTakeoffRow[] = [];
  const notes: string[] = [];
  const N = Math.max(1, Math.round(nGirders));
  const plate = (part: string, count: number, b: number, t: number, L: number, Lunit: "ft" | "in", clip = 0) => {
    if (!(count > 0) || !(b > 0) || !(t > 0) || !(L > 0)) return;
    const Lin = Lunit === "ft" ? L * 12 : L;
    const lb = ((count * (b * t * Lin - (clip > 0 ? clip * clip * t : 0))) / 1728) * STEEL_LB_FT3;
    const len = Lunit === "ft" ? ftT(fit(L)) : inT(fit(L));
    const vol = clip > 0 ? `\\left(${inT(b)}\\cdot ${len}-${inT(clip)}^{2}\\right)\\cdot ${inT(t)}` : `${inT(b)}\\cdot ${inT(t)}\\cdot ${len}`;
    rows.push({ part, count, desc: `${fit(b)} × ${fit(t)} in × ${Lunit === "ft" ? `${fit(L)} ft` : `${fit(L)} in`}${clip > 0 ? `, less two ${fit(clip)} in clips` : ""}`, lb, term: `${count}\\cdot ${vol}\\cdot ${RHO}` });
  };

  // The girders, field section by field section, end to end (to the girders' ends past the abutments' bearings).
  for (const f of fieldSections(i, r)) {
    const L = f.to - f.from;
    if (f.rolled) {
      const w = W_SHAPES.find((x) => x[0] === f.name)?.[1] ?? 0;
      if (w > 0) rows.push({ part: `Section ${f.letter}, ${f.name}`, count: N, desc: `${f.name} at ${w} lb/ft (AISC nominal) × ${fit(L)} ft`, lb: N * w * L, term: `${N}\\cdot ${num(w)}\\frac{\\mathrm{lb}}{\\mathrm{ft}}\\cdot ${ftT(fit(L))}` });
      continue;
    }
    plate(`Section ${f.letter}, top flange`, N, f.top.b, f.top.t, L, "ft");
    plate(`Section ${f.letter}, web`, N, f.D, f.tw, L, "ft");
    plate(`Section ${f.letter}, bottom flange`, N, f.bottom.b, f.bottom.t, L, "ft");
  }
  const Dat = (X: number) => {
    const fs = fieldSections(i, r);
    return (fs.find((f) => X >= f.from - 1e-9 && X <= f.to + 1e-9) ?? fs[0]).D;
  };

  // Bearing stiffeners: pairs at the abutments and piers, full depth, clipped at both flanges.
  if (i.bearing.use) {
    const piers = r.spans.length - 1;
    const sup = r.spans.reduce((s, L) => [...s, s[s.length - 1] + L], [0]);
    const atEnds = 2 * Math.max(1, i.bearing.pairsEnd) * 2;
    const atPiers = piers * Math.max(1, i.bearing.pairsPier) * 2;
    const Dend = Dat(sup[0]);
    plate("Bearing stiffeners, abutments", N * atEnds, i.bearing.bt, i.bearing.tp, Dend, "in", i.bearing.clip);
    if (piers > 0) plate("Bearing stiffeners, piers", N * atPiers, i.bearing.bt, i.bearing.tp, Dat(sup[1]), "in", i.bearing.clip);
  }

  // Intermediate transverse stiffeners at the given zones' spacing, one side or a pair.
  const ts = transverseStiffeners(i);
  if (ts.length) {
    const per = i.stiffener.pair ? 2 : 1;
    const byD = new Map<number, number>();
    for (const x of ts) byD.set(Dat(x), (byD.get(Dat(x)) ?? 0) + 1);
    for (const [D, n] of byD) plate(`Transverse stiffeners, ${fit(D)} in web`, N * n * per, i.stiffener.bt, i.stiffener.tp, D, "in", i.bearing.clip);
  }

  // Cross-frames: at the brace points between the supports and at the supports themselves.
  const cf = i.crossFrame;
  const lines = r.braces.length;
  const inner = connectionPlates(r);
  const frames = Math.max(0, N - 1);
  if (frames > 0 && inner.length) {
    // Connection plates: each frame on a plate at each of its two girders; full depth, or the working points' depth plus 6 in.
    const byD = new Map<number, number>();
    for (const x of inner) byD.set(Dat(x), (byD.get(Dat(x)) ?? 0) + 1);
    for (const [D, n] of byD) plate(`Connection plates, ${fit(D)} in web`, 2 * frames * n, cf.plateWidth, cf.plateThickness, cf.fullDepthPlates ? D : cf.hb + 6, "in", i.bearing.clip);
  }
  // At the abutments, the end cross-frames' members where they're designed (the intermediate frames' elsewhere).
  const ends = r.endFrames ? 2 : 0;
  if (frames > 0 && ends > 0) {
    const ef = i.endFrame;
    const tw = fieldSections(i, r)[0].tw;
    const clear = i.S * 12 - tw - 2 * cf.connection.plateT;
    const diag = ef.type === "X" ? Math.hypot(clear, (r.endFrames?.frame.hb ?? ef.hb)) : Math.hypot(clear / 2, (r.endFrames?.frame.hb ?? ef.hb));
    const w = (name: string) => L_SHAPES.find((x) => x[0] === name)?.[1] ?? 0;
    const n = frames * ends;
    rows.push({ part: "End cross-frame struts (abutments)", count: 2 * n, desc: `${ef.strut} at ${w(ef.strut)} lb/ft × ${fit(clear)} in`, lb: (2 * n * w(ef.strut) * clear) / 12, term: `${2 * n}\\cdot ${num(w(ef.strut))}\\frac{\\mathrm{lb}}{\\mathrm{ft}}\\cdot ${inT(fit(clear))}` });
    rows.push({ part: `End cross-frame diagonals (${ef.type})`, count: 2 * n, desc: `${ef.diagonal} at ${w(ef.diagonal)} lb/ft × ${fit(diag)} in`, lb: (2 * n * w(ef.diagonal) * diag) / 12, term: `${2 * n}\\cdot ${num(w(ef.diagonal))}\\frac{\\mathrm{lb}}{\\mathrm{ft}}\\cdot ${inT(fit(diag))}` });
    if (cf.connection.kind === "bolted") {
      const bolts = 8 * Math.max(1, Math.round(cf.connection.bolts)) * n;
      const per100 = BOLT_LB_PER_100[String(cf.connection.d)] ?? 81;
      rows.push({ part: "High-strength bolts, end cross-frames", count: bolts, desc: `${fit(cf.connection.d)} in, ${per100} lb per 100 (CDOT Table 509-4)`, lb: (bolts * per100) / 100, term: `${bolts}\\cdot\\frac{${num(per100)}\\mathrm{lb}}{100}` });
    }
  }
  if (frames > 0 && lines - ends > 0) {
    const tw = fieldSections(i, r)[0].tw;
    const clear = i.S * 12 - tw - 2 * cf.connection.plateT; // in, between the connection plates' faces
    const diag = cf.type === "X" ? Math.hypot(clear, cf.hb) : Math.hypot(clear / 2, cf.hb);
    const member = (part: string, name: string, n: number, L: number) => {
      const w = L_SHAPES.find((x) => x[0] === name)?.[1] ?? 0;
      if (!(w > 0)) return;
      rows.push({ part, count: n, desc: `${name} at ${w} lb/ft × ${fit(L)} in`, lb: (n * w * L) / 12, term: `${n}\\cdot ${num(w)}\\frac{\\mathrm{lb}}{\\mathrm{ft}}\\cdot ${inT(fit(L))}` });
    };
    const count = frames * (lines - ends);
    member("Cross-frame struts (top and bottom)", cf.strut, 2 * count, clear);
    member(`Cross-frame diagonals (${cf.type})`, cf.diagonal, 2 * count, diag);
    if (cf.connection.kind === "bolted") {
      const bolts = 8 * Math.max(1, Math.round(cf.connection.bolts)) * count;
      const per100 = BOLT_LB_PER_100[String(cf.connection.d)] ?? 81;
      rows.push({ part: "High-strength bolts, cross-frames", count: bolts, desc: `${fit(cf.connection.d)} in, ${per100} lb per 100 (CDOT Table 509-4)`, lb: (bolts * per100) / 100, term: `${bolts}\\cdot\\frac{${num(per100)}\\mathrm{lb}}{100}` });
    }
    notes.push(`Cross-frames: ${count} (${frames} per line at ${lines - ends} lines, ${ends ? "the piers included; the abutments' end cross-frames listed apart" : "the supports included"}), ${cf.type}-type, the members' lengths between the connection plates' faces at the working points${cf.type === "K" ? "; the K-frames' middle gusset plates aren't included" : ""}. At the supports the frames connect to the bearing stiffeners.`);
  }

  // Studs: shank area × height, across the girder at each zone's pitch, bearing to bearing.
  if (i.studs.d > 0 && i.studs.perRow > 0) {
    let studs = 0;
    for (const z of studZones(i, r)) if (z.pitch > 0) studs += (Math.floor(((z.to - z.from) * 12) / z.pitch + 1e-9) + 1) * i.studs.perRow;
    studs *= N;
    const each = ((Math.PI * i.studs.d ** 2) / 4) * i.studs.height;
    rows.push({ part: "Stud shear connectors", count: studs, desc: `${fit(i.studs.d)} in × ${fit(i.studs.height)} in`, lb: ((studs * each) / 1728) * STEEL_LB_FT3, term: `${studs}\\cdot\\frac{\\pi\\cdot\\left(${inT(i.studs.d)}\\right)^{2}}{4}\\cdot ${inT(i.studs.height)}\\cdot ${RHO}` });
    notes.push("Studs are counted as structural steel (CDOT 509.12 specifies them under Section 509, which pays the structural steel by the pound); each at its shank's area over its height.");
  }

  // Bolted field splices as designed: flange and web splice plates, fillers, and their bolts (both sides of each joint).
  for (const sp of r.splices) {
    const at = `Splice at ${fit(sp.X)} ft`;
    for (const fl of [sp.top, sp.bottom]) {
      const nm = fl.which === "top" ? "top" : "bottom";
      plate(`${at}, ${nm} outer plate`, N, fl.outer.b, fl.outer.t, fl.plateL, "in");
      plate(`${at}, ${nm} inner plates`, 2 * N, fl.inner.b, fl.inner.t, fl.plateL, "in");
      if (fl.filler > 0) plate(`${at}, ${nm} filler`, N, fl.b, fl.filler, (fl.plateL - i.splice.gap) / 2, "in");
    }
    plate(`${at}, web plates`, 2 * N, sp.web.plate.b, sp.web.plate.t, sp.web.plate.h, "in");
    if (sp.web.filler > 0) plate(`${at}, web filler`, N, sp.web.plate.h, sp.web.filler, (sp.web.plate.b - i.splice.gap) / 2, "in");
    const bolts = 2 * N * (sp.top.n + sp.bottom.n + sp.web.n);
    const per100 = BOLT_LB_PER_100[String(i.splice.d)] ?? 81;
    rows.push({ part: `${at}, high-strength bolts`, count: bolts, desc: `${fit(i.splice.d)} in, ${per100} lb per 100 (CDOT Table 509-4)`, lb: (bolts * per100) / 100, term: `${bolts}\\cdot\\frac{${num(per100)}\\mathrm{lb}}{100}` });
  }
  const undesigned = r.segmentStarts.slice(1).filter((x) => !r.splices.some((sp) => Math.abs(sp.X - x) < 0.05));
  if (undesigned.length) notes.push(`Section changes at ${undesigned.map((x) => `${fit(x)} ft`).join(", ")} are ${i.splice.check ? "welded in the shop" : "not designed as field splices here"}: ${i.splice.check ? "no splice plates" : "add their splice plates and bolts (Table 509-4) once detailed"}.`);
  notes.push("Not here: the bearings (Section 512), the deck and its bars (the deck tools), and the erection bolts, paint and shipping supports (CDOT 509.32(a)11). The weight shown on the plans is the pay weight unless the design changes or it is off by more than 2% (CDOT 509.32(b)).");
  return { rows, notes };
}

/** The steel girders' take-off: their structural steel by the pound (CDOT 509). */
export function steelTakeoff(i: SteelGirderInputs, nGirders?: number): Takeoff {
  const r = designSteelGirder(i);
  const N = Math.max(1, Math.round(nGirders ?? i.nGirders));
  const { rows, notes } = steelQuantities(i, r, N);
  const lb = rows.reduce((s, x) => s + x.lb, 0);
  return {
    what: "steel girders",
    schedule: schedule([], []),
    quantities: {
      girder: {
        value: lb,
        basis: `${N} girders, ${r.spans.map((L) => `${fit(L)}`).join(" + ")} ft: ${rows.map((x) => `${x.part} ${Math.round(x.lb).toLocaleString("en-US")} lb`).join("; ")}`,
        terms: rows.map((x) => x.term),
        ref: "Computed weight, CDOT 509.32(a): plates at net dimensions × 490.5 lb/ft³, rolled shapes and angles at their nominal weight, bolts by Table 509-4",
      },
      // The bearings with their sole plates and anchor bolts: Type I bearing devices, each (CDOT 512.03, 512.19).
      ...(r.soles && r.soles.supports.length
        ? {
            bearing: {
              value: N * r.soles.supports.length,
              basis: `${N} girders × ${r.soles.supports.length} supports (${r.soles.supports.map((x) => x.label).join(", ")}), each an elastomeric bearing with its sole plate and anchor bolts`,
              math: `${N}\\cdot ${r.soles.supports.length}`,
              ref: "girders × supports with bearings; the sole plate and anchor bolts are part of the bearing device (CDOT 512.03)",
            },
          }
        : {}),
    },
    views: [],
    notes: r.soles && r.soles.supports.length ? [...notes, "Sole plates and their anchor bolts (ASTM A449, CDOT 512.02) are part of the Type I bearing devices, paid each (512.19), not in the structural steel's weight."] : notes,
    length: { label: "Girders", value: N, unit: "EA" },
  };
}
