import { bar } from "../stm/aashto";
import type { Pt } from "../stm/geometry";
import { ftIn, roundDown } from "../rebar/bars";
import { countAt, runGroups, type PreGroup, type RunOptions } from "../rebar/runs";
import { markGroups, schedule, type ConcreteItem } from "../rebar/schedule";
import { ftT, inT } from "../takeoff/tex";
import type { DetailView, Takeoff } from "../takeoff/types";
import type { ApproachSlabInputs } from "./approach-slab";

// An approach slab's bars as CDOT details them, and its quantities as the SOQ's approach slab
// column carries them (BDM Section 19: from the back of the approach notch; the anchorage bars into
// the abutment listed here, though CDOT's SOQ carries them with the superstructure). The main and
// top longitudinal bars run along the roadway, cut at stock lengths and lapped (CDOT Bridge Detail
// Manual 4.7); the transverse bars run parallel to the slab's ends (skewed with the abutment); the
// dowels come up out of the notch, hooked in the abutment; the sleeper slab has its own mats. Clear
// to the slab's edges and ends 2 in (Bridge Detail Manual 4.8). All bars epoxy coated (BDM 5.4.5).
// The details follow CDOT worksheet B-601-1EA (Approach Slab Details, Asphalt with 0–4" Joint):
// the #5 anchorage bars (2'-9" with a 10" leg, 1'-6" into the slab), #4 C-bars at 1'-6" around the
// slab's end at the abutment, and the sleeper's #5 bent bars at 1'-0" (two at each place), #5 (Tot
// 10) along it and #5 (Tot 2) in the block under the device. Shapes the worksheet only sketches are
// noted as read off it.

const C = 2; // in, clear to the edges and ends
const fit = (n: number) => Math.round(n * 1000) / 1000;
const rect = (x0: number, y0: number, x1: number, y1: number): Pt[] => [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];

export function approachSlabTakeoff(i: ApproachSlabInputs, count = 2): Takeoff {
  const N = Math.max(1, Math.round(count));
  const times = N > 1 ? `${N}\\cdot ` : "";
  const each = (what: string) => (N > 1 ? `${N} ${what}, each ` : "");
  const cos = Math.cos((i.skew * Math.PI) / 180);
  const Lr = i.L * 12; // in, along the roadway
  const Wn = i.W * 12; // in, normal to the roadway
  const Wsk = Wn / cos; // in, along the skewed ends
  const pre: PreGroup[] = [];
  const run = (o: Omit<RunOptions, "lap"> & { cover: number; spacing: number }) => {
    const r = runGroups({ ...o, lap: { fy: i.fy, fc: i.fc, clearCover: o.cover, clearSpacing: Math.max(0.5, o.spacing - bar(o.size).db), coating: "epoxy" } });
    pre.push(...r.groups.map((g) => ({ ...g, count: g.count * N })));
    return r;
  };
  const call = (b: { bar: number; spacing: number }, what: string) => `#${b.bar} @ ${ftIn(b.spacing)} (${what})`;

  // --- the slab --------------------------------------------------------------------------------------
  const nMain = countAt(Wn - 2 * C, i.mainBars.spacing);
  run({ size: i.mainBars.bar, count: nMain, straight: Lr - 2 * C, use: "Main bars, bottom", callout: call(i.mainBars, "bottom, along the roadway"), cover: i.coverBot, spacing: i.mainBars.spacing });
  const nTopL = countAt(Wn - 2 * C, i.topLong.spacing);
  run({ size: i.topLong.bar, count: nTopL, straight: Lr - 2 * C, use: "Longitudinal, top", callout: call(i.topLong, "top, along the roadway"), cover: i.coverTop, spacing: i.topLong.spacing });
  const nDist = countAt(Lr - 2 * C, i.distBars.spacing);
  run({ size: i.distBars.bar, count: nDist, straight: Wsk - 2 * C, use: "Transverse, bottom", callout: call(i.distBars, "bottom, parallel to the ends"), cover: i.coverBot, spacing: i.distBars.spacing });
  const nTopT = countAt(Lr - 2 * C, i.topTrans.spacing);
  run({ size: i.topTrans.bar, count: nTopT, straight: Wsk - 2 * C, use: "Transverse, top", callout: call(i.topTrans, "top, parallel to the ends"), cover: i.coverTop, spacing: i.topTrans.spacing });

  // --- anchorage dowels out of the notch (hooked in the abutment) ---------------------------------------------
  const nDowel = countAt(Wsk - 2 * C, i.dowels.spacing);
  const leg = i.dowelHook;
  const dowelStraight = i.dowelAbut + i.dowelSlab;
  pre.push({ size: i.dowels.bar, count: N * nDowel, shape: { kind: "hooked", dims: [roundDown(leg), roundDown(dowelStraight)], hooks: 1 }, length: roundDown(leg + dowelStraight), use: "Anchorage dowels", callout: `#${i.dowels.bar} @ ${ftIn(i.dowels.spacing)} (project ${ftIn(i.dowelSlab)} into the approach slab)`, where: "notch to slab" });
  // #4 C-bars around the slab's end at the abutment (B-601-1EA Detail 1), 1'-0" legs.
  const nC = countAt(Wsk - 2 * C, 18);
  const cH = i.t - i.coverTop - i.coverBot;
  pre.push({ size: 4, count: N * nC, shape: { kind: "bent", dims: [12, roundDown(cH), 12], hooks: 0 }, length: roundDown(24 + cH), use: "End bars at the abutment", callout: `#4 ⊏ @ 1'-6" (slab's end at the abutment)`, where: "abutment end" });

  // --- the sleeper slab --------------------------------------------------------------------------------------------
  const B = i.sleeperB * 12;
  const sc = 3; // in, cast against earth (BDM 5.4.3)
  if (i.sleeper) {
    const nAcross = countAt(Wsk - 2 * C, i.sleeperBars.spacing);
    const sb = i.sleeperBars.bar;
    if (i.joint === "device") {
      // Two bent bars at each place (B-601-1EA's sleeper section, shapes as read off it): one up into the block with an 8" leg over its top, one across the bottom with a 7" leg.
      pre.push({ size: sb, count: N * nAcross, shape: { kind: "bent", dims: [8, 21, 32], hooks: 0 }, length: 61, use: "Sleeper, bent into the block", callout: `#${sb} @ ${ftIn(i.sleeperBars.spacing)} (sleeper, 2 each place)`, where: "sleeper" });
      pre.push({ size: sb, count: N * nAcross, shape: { kind: "bent", dims: [7, 26], hooks: 0 }, length: 33, use: "Sleeper, across the bottom", callout: `#${sb} @ ${ftIn(i.sleeperBars.spacing)} (sleeper, 2 each place)`, where: "sleeper" });
    } else run({ size: sb, count: nAcross, straight: B - 2 * sc, use: "Sleeper, across the bottom", callout: call(i.sleeperBars, "sleeper, bottom"), cover: sc, spacing: i.sleeperBars.spacing });
    const nAlong = countAt(B - 2 * sc, i.sleeperLong.spacing);
    run({ size: i.sleeperLong.bar, count: 2 * nAlong, straight: Wsk - 2 * C, use: "Sleeper, along", callout: `#${i.sleeperLong.bar} (Tot ${2 * nAlong}) along the sleeper, top and bottom`, cover: sc, spacing: i.sleeperLong.spacing });
    if (i.joint === "device") run({ size: 5, count: 2, straight: Wsk - 2 * C, use: "Sleeper, in the block", callout: "#5 (Tot 2) in the block under the device", cover: 2, spacing: 6 });
  }

  // --- concrete and other quantities ---------------------------------------------------------------------------------
  const slabCy = (i.L * i.W * (i.t / 12)) / 27;
  const concrete: ConcreteItem[] = [
    { label: N > 1 ? "Approach slabs" : "Approach slab", cy: N * slabCy, basis: `${each("slabs")}${i.L} ft along the roadway (from the back of the notch) by ${i.W} ft by ${i.t} in`, math: `${times}${ftT(i.L)}\\cdot ${ftT(i.W)}\\cdot ${inT(i.t)}`, ref: "Approach slab: length from the back of the notch × width × thickness" },
  ];
  if (i.sleeper) {
    const len = Wsk / 12;
    const block = i.joint === "device";
    const area = i.sleeperB * (i.sleeperT / 12) + (block ? (i.blockW / 12) * (i.t / 12) : 0);
    const section = block ? `\\left(${ftT(i.sleeperB)}\\cdot ${inT(i.sleeperT)}+${inT(i.blockW)}\\cdot ${inT(i.t)}\\right)` : `${ftT(i.sleeperB)}\\cdot ${inT(i.sleeperT)}`;
    concrete.push({ label: N > 1 ? "Sleeper slabs" : "Sleeper slab", cy: (N * area * len) / 27, basis: `${each("sleepers")}${i.sleeperB} ft by ${i.sleeperT} in${block ? `, with a ${i.blockW} by ${i.t} in block under the device` : ""}, ${fit(len)} ft long (along the skewed end)`, math: `${times}${section}\\cdot\\frac{${ftT(i.W)}}{\\cos\\left(${i.skew}\\mathrm{deg}\\right)}`, ref: block ? "Sleeper slab: (base + block under the device) × its length along the slab's end" : "Sleeper slab: width × thickness × its length along the slab's end" });
  }
  const groups = markGroups(pre);
  const sch = schedule(groups, concrete);
  const markOf = (use: string) => groups.find((g) => g.use === use)?.mark ?? "";
  const quantities: Takeoff["quantities"] = {};
  if (i.wearing > 0) quantities.waterproofing = { value: (N * i.L * i.W) / 9, basis: `${each("slabs")}the slab's top under the ${i.wearing} in overlay, ${i.L} ft by ${i.W} ft`, math: `${times}${ftT(i.L)}\\cdot ${ftT(i.W)}`, ref: "the slab's top under the overlay: length × width" };
  // The poured joint (Item 408) at the abutment end; with no device, at the sleeper end too (B-601-1).
  const nSeal = i.joint === "device" ? 1 : 2;
  quantities.sealant = { value: (N * nSeal * Wsk) / 12, basis: `the poured joint along ${nSeal === 1 ? "the slab's end at the abutment" : "both of the slab's ends"}`, math: `${N * nSeal > 1 ? `${N * nSeal}\\cdot ` : ""}\\frac{${ftT(i.W)}}{\\cos\\left(${i.skew}\\mathrm{deg}\\right)}`, ref: "the poured joint sealant along the skewed end(s), Item 408" };
  if (i.joint === "device") quantities.joint = { value: (N * Wsk) / 12, basis: `${each("joints")}across the slab's end, ${fit(Wsk / 12)} ft along the skew`, math: `${times}\\frac{${ftT(i.W)}}{\\cos\\left(${i.skew}\\mathrm{deg}\\right)}`, ref: "the joint along the slab's skewed end" };

  // --- views (inches, y up) -------------------------------------------------------------------------------------------
  // Longitudinal section along the roadway: the abutment's backwall and notch at the left, the slab, the sleeper at the right.
  const t = i.t;
  const seatW = i.seat;
  const wall = 18; // backwall drawn 18 in thick
  const below = 36;
  const xEnd = Lr;
  const sT = i.sleeperT;
  // The slab sits on the sleeper's ledge (B-601-1EA): the sleeper starts `ledge` back from the slab's end; with the device, a block as deep as the slab next to the end.
  const ledge = i.sleeperSeat;
  const block = i.sleeper && i.joint === "device";
  const sx0 = Lr - ledge; // the sleeper's back edge
  const polys: DetailView["polys"] = [
    { pts: [[-wall, t + 2], [0, t + 2], [0, 0], [seatW, 0], [seatW, -below], [-wall, -below]], style: "concrete" }, // backwall with the notch's seat
    { pts: rect(0, 0, Lr, t), style: "concrete" },
    { pts: [[seatW, 0], [i.sleeper ? sx0 : Lr, 0], [i.sleeper ? sx0 : Lr, -below], [seatW, -below]], style: "earth" },
  ];
  if (i.sleeper) polys.push({ pts: rect(sx0, -sT, sx0 + B, 0), style: "concrete" });
  if (block) polys.push({ pts: rect(Lr + 0.5, 0, Lr + 0.5 + i.blockW, t), style: "concrete" });
  const yBot = i.coverBot + bar(i.distBars.bar).db + bar(i.mainBars.bar).db / 2;
  const yTop = t - i.coverTop - bar(i.topTrans.bar).db - bar(i.topLong.bar).db / 2;
  const lines: DetailView["lines"] = [
    { pts: [[C, yBot], [xEnd - C, yBot]], mark: markOf("Main bars, bottom"), kind: "main" },
    { pts: [[C, yTop], [xEnd - C, yTop]], mark: markOf("Longitudinal, top"), kind: "secondary" },
    { pts: [[-wall + 4, -i.dowelAbut + leg], [-wall + 4, -i.dowelAbut], [seatW / 2, -i.dowelAbut], [seatW / 2, t / 2], [seatW / 2 + i.dowelSlab, t / 2]], mark: markOf("Anchorage dowels"), kind: "stirrup" },
    { pts: [[C + 12, t - i.coverTop], [C, t - i.coverTop], [C, t - i.coverTop - cH], [C + 12, i.coverBot]], mark: markOf("End bars at the abutment"), kind: "stirrup" },
  ];
  const dots: DetailView["dots"] = [];
  const shown = (len: number, s: number) => Math.min(countAt(len, s), 80);
  for (let k = 0; k < shown(Lr - 2 * C, i.distBars.spacing); k++) dots.push({ x: C + k * i.distBars.spacing, y: i.coverBot + bar(i.distBars.bar).db / 2, d: bar(i.distBars.bar).db, mark: markOf("Transverse, bottom") });
  for (let k = 0; k < shown(Lr - 2 * C, i.topTrans.spacing); k++) dots.push({ x: C + k * i.topTrans.spacing, y: t - i.coverTop - bar(i.topTrans.bar).db / 2, d: bar(i.topTrans.bar).db, mark: markOf("Transverse, top") });
  if (i.sleeper) {
    const yb = -sT + sc;
    if (block) {
      const xb = Lr + 0.5 + i.blockW / 2;
      lines.push({ pts: [[xb - 4, t - 2], [xb + 4, t - 2], [xb + 4, yb], [sx0 + sc, yb]], mark: markOf("Sleeper, bent into the block"), kind: "stirrup" });
      lines.push({ pts: [[sx0 + B - sc, yb + 7], [sx0 + B - sc, yb], [sx0 + B - sc - 26, yb]], mark: markOf("Sleeper, across the bottom"), kind: "main" });
      for (const x of [xb - 3, xb + 3]) dots.push({ x, y: t - 3, d: bar(5).db, mark: markOf("Sleeper, in the block") });
    } else lines.push({ pts: [[sx0 + sc, yb], [sx0 + B - sc, yb]], mark: markOf("Sleeper, across the bottom"), kind: "main" });
    for (let k = 0; k < shown(B - 2 * sc, i.sleeperLong.spacing); k++) {
      const x = sx0 + sc + k * i.sleeperLong.spacing;
      dots.push({ x, y: yb + bar(i.sleeperBars.bar).db + bar(i.sleeperLong.bar).db / 2, d: bar(i.sleeperLong.bar).db, mark: markOf("Sleeper, along") });
      dots.push({ x, y: -sc - bar(i.sleeperLong.bar).db / 2, d: bar(i.sleeperLong.bar).db, mark: markOf("Sleeper, along") });
    }
  }
  const full: DetailView = {
    title: "Section along the roadway",
    polys,
    lines,
    dots,
    labels: [
      { x: -wall / 2, y: t + 8, text: "Abutment backwall", anchor: "middle" },
      { x: 30, y: t + 8, text: `Approach slab (${ftIn(Lr)} from the back of the notch)`, anchor: "start" },
      ...(i.sleeper ? [{ x: sx0 + B / 2, y: -sT - 8, text: `Sleeper slab, ${ftIn(B)}`, anchor: "middle" as const }, { x: Lr - 30, y: t + 8, text: "Approach slab", anchor: "middle" as const }] : [{ x: Lr - 20, y: t + 8, text: "End of slab", anchor: "middle" as const }]),
      ...(block ? [{ x: Lr + i.blockW / 2, y: t + 8, text: "0–4 in device", anchor: "middle" as const }] : []),
    ],
  };
  // The slab is too long and thin to read at one scale: CDOT's sheets show its two ends.
  const atAbutment = cropView(full, -wall - 2, Math.max(seatW + i.dowelSlab + 18, 72), "Section at the abutment");
  const atEnd = cropView(full, (i.sleeper ? sx0 : Lr) - 30, i.sleeper ? sx0 + B + 2 : Lr + 2, i.sleeper ? "Section at the sleeper slab" : "Section at the slab's end");
  // Plan: the slab's outline (skewed ends) with a few bars of each mat.
  const off = Wn * Math.tan((i.skew * Math.PI) / 180); // the far edge's shift along the roadway
  const plan: DetailView = {
    title: "Plan",
    polys: [{ pts: [[0, 0], [Lr, 0], [Lr + off, Wn], [off, Wn]], style: "concrete" }, ...(i.sleeper ? [{ pts: [[sx0, 0], [sx0 + B, 0], [sx0 + B + off, Wn], [sx0 + off, Wn]] as Pt[], style: "dashed" as const }] : [])],
    lines: [
      ...Array.from({ length: Math.min(nMain, 12) }, (_, k) => {
        const y = C + ((Wn - 2 * C) * k) / Math.max(1, Math.min(nMain, 12) - 1);
        const x = y * Math.tan((i.skew * Math.PI) / 180);
        return { pts: [[x + C, y], [x + Lr - C, y]] as Pt[], mark: markOf("Main bars, bottom"), kind: "main" as const };
      }),
      ...Array.from({ length: Math.min(nDist, 12) }, (_, k) => {
        const x = C + ((Lr - 2 * C) * k) / Math.max(1, Math.min(nDist, 12) - 1);
        return { pts: [[x, C], [x + off, Wn - C]] as Pt[], mark: markOf("Transverse, bottom"), kind: "secondary" as const };
      }),
    ],
    dots: [],
    labels: [
      { x: -6, y: Wn / 2, text: "Abutment", anchor: "end" },
      { x: Lr + off / 2 + 6, y: Wn / 2, text: i.joint === "none" ? "End of slab" : "Joint at the end", anchor: "start" },
    ],
  };

  const notes = [
    "Details after CDOT worksheet B-601-1EA (Approach Slab Details, Asphalt with 0–4\" Joint): Concrete Class DF (its Note 1), 2 in top and 3 in bottom clear. The C-bars' legs and the sleeper's bent bars are as read off the worksheet's sketches; check them against the sheet for the project.",
    "All reinforcing steel is epoxy coated (CDOT BDM 5.4.5: approach slabs, every layer).",
    `${i.joint === "device" ? "The 0–4 in expansion device (518) sits on the sleeper's block, with 20 Ga galvanized sheet metal under it (included in the work)." : "No expansion device (B-601-1: bridge movement ¾ in or less, asphalt approach)."} The ½ in expansion joint material (AASHTO M213) is included in the work; the poured joint sealant is Item 408.`,
    `Concrete is measured from the back of the approach notch (BDM Section 19). The ${N * nDowel} anchorage dowels are listed here; CDOT's summary of quantities carries the anchorage bars into the abutment with the superstructure.`,
    `Transverse bars run parallel to the slab's ends${i.skew > 0 ? ` (skewed ${i.skew}°), spaced along the roadway` : ""}. Where the skew is 30° or more, BDM 2.2.1.1 asks for the slab's far end square to the roadway where practical: detail that end's fanned bars by hand.`,
    "Drains on the high side of the joint (BDM 2.13), the notch's own bars and the curb or rail transition's bars are not included.",
  ];
  return { what: "approach slab", schedule: sch, quantities, views: [atAbutment, atEnd, plan], notes, length: { label: "Approach slabs", value: N, unit: "EA" } };
}

/** A polygon clipped to the band x0 ≤ x ≤ x1 (Sutherland–Hodgman, the two vertical edges). */
function clipPoly(pts: Pt[], x0: number, x1: number): Pt[] {
  const edge = (input: Pt[], inside: (p: Pt) => boolean, xe: number) => {
    const out: Pt[] = [];
    for (let k = 0; k < input.length; k++) {
      const a = input[k];
      const b = input[(k + 1) % input.length];
      const cut = (): Pt => [xe, a[1] + ((b[1] - a[1]) * (xe - a[0])) / (b[0] - a[0])];
      if (inside(b)) {
        if (!inside(a)) out.push(cut());
        out.push(b);
      } else if (inside(a)) out.push(cut());
    }
    return out;
  };
  return edge(edge(pts, (p) => p[0] >= x0, x0), (p) => p[0] <= x1, x1);
}

/** A polyline clipped to the band: the pieces inside it. */
function clipLine(pts: Pt[], x0: number, x1: number): Pt[][] {
  const pieces: Pt[][] = [];
  let cur: Pt[] = [];
  const at = (a: Pt, b: Pt, x: number): Pt => [x, a[1] + ((b[1] - a[1]) * (x - a[0])) / (b[0] - a[0] || 1)];
  for (let k = 0; k + 1 < pts.length; k++) {
    let a = pts[k];
    let b = pts[k + 1];
    const lo = Math.min(a[0], b[0]);
    const hi = Math.max(a[0], b[0]);
    if (hi < x0 || lo > x1) {
      if (cur.length > 1) pieces.push(cur);
      cur = [];
      continue;
    }
    if (a[0] < x0) a = at(a, b, x0);
    else if (a[0] > x1) a = at(a, b, x1);
    if (b[0] < x0) b = at(a, b, x0);
    else if (b[0] > x1) b = at(a, b, x1);
    if (!cur.length) cur.push(a);
    cur.push(b);
    if (pts[k + 1][0] < x0 || pts[k + 1][0] > x1) {
      pieces.push(cur);
      cur = [];
    }
  }
  if (cur.length > 1) pieces.push(cur);
  return pieces;
}

/** A part of a view, between x0 and x1. */
function cropView(v: DetailView, x0: number, x1: number, title: string): DetailView {
  return {
    title,
    polys: v.polys.map((p) => ({ ...p, pts: clipPoly(p.pts, x0, x1) })).filter((p) => p.pts.length >= 3),
    lines: v.lines.flatMap((l) => clipLine(l.pts, x0, x1).map((pts) => ({ ...l, pts }))),
    dots: v.dots.filter((d) => d.x >= x0 && d.x <= x1),
    labels: (v.labels ?? []).filter((l) => l.x >= x0 && l.x <= x1),
  };
}
