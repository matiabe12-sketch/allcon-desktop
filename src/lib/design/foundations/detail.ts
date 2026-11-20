import { BARS } from "../walls/cip";
import { ftIn, roundDown } from "../rebar/bars";
import { countAt, runGroups, type PreGroup, type RunOptions } from "../rebar/runs";
import { markGroups, schedule, type ConcreteItem } from "../rebar/schedule";
import { ftT, inT, plus18T } from "../takeoff/tex";
import type { DetailView, Takeoff } from "../takeoff/types";
import { num } from "../calc-style";
import type { AbutmentInputs } from "./abutment";
import type { FootingInputs } from "./footing";
import type { MicropileInputs } from "./micropile";
import type { PileInputs } from "./piles";
import { MICROPILE_DEFAULTS } from "./micropile";
import { HP_SECTIONS } from "./hpile";
import type { ShaftInputs } from "./shaft";
import { columnShaftConnection } from "../piers/column-shaft";

// The foundation tools' bars and quantities, CDOT's way: the bars the design sizes, cut at stock
// lengths and lapped (Bridge Detail Manual 4.7), and the other quantities by pay item: piles by the
// foot of section (Section 502, a pile tip on every pile driven to rock, BDM 10.5.2.1), drilled shafts
// by the foot of diameter with their cage (Section 503), micropiles by the foot (503), structure
// excavation and backfill within M-206-1's limits (18 in beyond the concrete), concrete in Class D
// (Bridge).

const C = 3; // in, cast against earth
/** Load-tested micropiles (final design): one verification test pile at the substructure (AASHTO 10.9.3.5.4; CDOT, as F-15-E's plans). */
const VERIFICATION_TEST = { value: 1, basis: "one verification test pile at this substructure, its micropiles designed as load-tested (AASHTO 10.9.3.5.4)", math: "1", ref: "Section 503: verification test pile, each" };
type Pt = [number, number];
const rect = (x0: number, y0: number, x1: number, y1: number): Pt[] => [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
const fit = (n: number) => Math.round(n * 1000) / 1000;

function runner(fy: number, fc: number) {
  const pre: PreGroup[] = [];
  const run = (o: Omit<RunOptions, "lap"> & { cover: number; spacing: number; times?: number }) => {
    const r = runGroups({ ...o, lap: { fy, fc, clearCover: o.cover, clearSpacing: Math.max(0.5, o.spacing - BARS[o.size].dia), coating: "uncoated" } });
    pre.push(...r.groups.map((g) => ({ ...g, count: g.count * (o.times ?? 1) })));
  };
  return { pre, run };
}

/** A mat of bars both ways in a rectangle B × L (ft), bottom (and top if asked). */
function mat(run: ReturnType<typeof runner>["run"], B: number, L: number, barsB: { bar: number; spacing: number }, barsL: { bar: number; spacing: number }, where: string, cover = C, hooks = false) {
  const Bi = B * 12;
  const Li = L * 12;
  run({ size: barsB.bar, count: countAt(Li - 2 * cover, barsB.spacing), straight: Bi - 2 * cover, hooks: hooks ? [true, true] : undefined, use: `${where}, along B`, callout: `#${barsB.bar} @ ${ftIn(barsB.spacing)} (${where.toLowerCase()}, along B)`, cover, spacing: barsB.spacing });
  run({ size: barsL.bar, count: countAt(Bi - 2 * cover, barsL.spacing), straight: Li - 2 * cover, hooks: hooks ? [true, true] : undefined, use: `${where}, along L`, callout: `#${barsL.bar} @ ${ftIn(barsL.spacing)} (${where.toLowerCase()}, along L)`, cover, spacing: barsL.spacing });
}

/** Structure excavation and backfill within M-206-1's limits: 18 in beyond the concrete, from the ground to its base. */
function excavation(B: number, L: number, depth: number, concreteBelow: number): Takeoff["quantities"] {
  const ex = ((B + 3) * (L + 3) * depth) / 27;
  const exT = `${plus18T(ftT(fit(B)))}\\cdot ${plus18T(ftT(fit(L)))}\\cdot ${ftT(fit(depth))}`;
  return {
    excavation: { value: ex, basis: `(${fit(B)} + 3) ft × (${fit(L)} + 3) ft × ${fit(depth)} ft, M-206-1's 18 in beyond the concrete`, math: exT, ref: "CDOT M-206-1" },
    ...(ex - concreteBelow > 0 ? { backfill: { value: ex - concreteBelow, basis: "the excavation less the concrete in it", terms: [exT, `-${num(concreteBelow)}\\mathrm{yd}^{3}`], ref: "CDOT M-206-1" } } : {}),
  };
}

function section(title: string, B: number, t: number, labels: string): DetailView {
  return { title, polys: [{ pts: rect(0, 0, B * 12, t), style: "concrete" }], lines: [], dots: [], labels: [{ x: (B * 12) / 2, y: t + 6, text: labels, anchor: "middle" }] };
}

export function footingTakeoff(i: FootingInputs): Takeoff {
  const { pre, run } = runner(i.fy, i.fc);
  mat(run, i.B, i.L, i.barsB, i.barsL, "Bottom", i.cover);
  const groups = markGroups(pre);
  const cy = (i.B * i.L * (i.t / 12)) / 27;
  const concrete: ConcreteItem[] = [{ label: "Footing", cy, basis: `${i.B} ft × ${i.L} ft × ${i.t} in`, math: `${ftT(i.B)}\\cdot ${ftT(i.L)}\\cdot ${inT(i.t)}`, ref: "Footing: B × L × thickness" }];
  return {
    what: "spread footing",
    schedule: schedule(groups, concrete),
    quantities: excavation(i.B, i.L, i.Df, cy),
    views: [section("Footing", i.B, i.t, `${i.B} ft × ${i.L} ft, ${i.t} in`)],
    notes: ["Bottom bars both ways, straight, 3 in cover (cast against earth). The column's dowels are detailed with the column.", "Excavation and backfill within CDOT M-206-1's limits, 18 in beyond the footing, from the ground to its base."],
  };
}

export function pileTakeoff(i: PileInputs): Takeoff {
  const { pre, run } = runner(i.fy, i.fc);
  const capB = (i.nB - 1) * i.sB + 2 * i.edge;
  const capL = (i.nL - 1) * i.sL + 2 * i.edge;
  mat(run, capB, capL, i.barsB, i.barsL, "Bottom", i.cover);
  // The top mat (2 in cover) and the side bars all round, in rows between the mats.
  const topB = i.topB ?? { bar: 6, spacing: 9 };
  const topL = i.topL ?? { bar: 6, spacing: 9 };
  const side = i.sideBars ?? { bar: 5, spacing: 6 };
  mat(run, capB, capL, topB, topL, "Top", 2);
  const rows = Math.max(0, countAt(i.capT - i.cover - 2, side.spacing) - 2);
  if (rows > 0) {
    run({ size: side.bar, count: rows, times: 2, straight: capB * 12 - 2 * C, use: "Sides, along B", callout: `#${side.bar} @ ${ftIn(side.spacing)} each face (sides, along B)`, cover: C, spacing: side.spacing });
    run({ size: side.bar, count: rows, times: 2, straight: capL * 12 - 2 * C, use: "Sides, along L", callout: `#${side.bar} @ ${ftIn(side.spacing)} each face (sides, along L)`, cover: C, spacing: side.spacing });
  }
  const groups = markGroups(pre);
  const cy = (capB * capL * (i.capT / 12)) / 27;
  const n = i.perimeter ? Math.max(1, i.nB * i.nL - Math.max(0, i.nB - 2) * Math.max(0, i.nL - 2)) : i.nB * i.nL;
  const each = i.length + i.embed / 12;
  const micro = i.pileType === "micropile";
  const mp = { ...MICROPILE_DEFAULTS, ...(i.micropile ?? {}) };
  const mpEach = mp.cased + mp.bond;
  const piles: Takeoff["quantities"] = micro
    ? { micropile: { value: n * mpEach, basis: `${n} micropiles × (${mp.cased} ft cased + ${mp.bond} ft bonded)`, math: `${n}\\cdot\\left(${ftT(mp.cased)}+${ftT(mp.bond)}\\right)`, ref: "Section 503: by the foot, casing, bar and grout included" }, ...(mp.loadTested ? { testing: VERIFICATION_TEST } : {}) }
    : {
        pile: { value: n * each, basis: `${n} piles × (${i.length} ft + the ${i.embed} in embedment)`, math: `${n}\\cdot\\left(${ftT(i.length)}+${inT(i.embed)}\\right)`, ref: "Section 502: by the foot, cut-off to tip" },
        "pile-tip": { value: n, basis: `one on each of the ${n} piles (driven to bedrock, BDM 10.5.2.1)`, math: `${n}`, ref: "Section 502" },
      };
  return {
    what: micro ? "micropile footing" : "pile cap",
    schedule: schedule(groups, [{ label: "Pile cap", cy, basis: `${fit(capB)} ft × ${fit(capL)} ft × ${i.capT} in`, math: `${ftT(fit(capB))}\\cdot ${ftT(fit(capL))}\\cdot ${inT(i.capT)}`, ref: "Cap: B × L × thickness" }]),
    quantities: {
      ...piles,
      ...excavation(capB, capL, i.Df, cy),
    },
    views: pileCapViews(i, capB, capL, (use) => groups.find((g) => g.use === use)?.mark ?? ""),
    notes: [`The cap's bottom mat at ${i.cover} in cover, the piles passing between its bars and embedded ${micro ? mp.embed : i.embed} in.`, micro ? "Micropiles by the foot (casing, bar and grout included), from the cap's bottom." : "Piles by the foot from the cap's bottom less nothing for cut-off: add the plans' estimated lengths when known."],
  };
}

/**
 * A pile cap's plan and section, in inches with y up. Plan: the cap, its piles where the group has them (the ring only
 * when only the outer piles are used), the column's footprint and the bottom mat both ways. Section (along B): the bars
 * along B as a line at their cover, those along L as dots over them, the piles embedded into the cap (a micropile's
 * bearing plate on its head), the column above, dashed.
 */
function pileCapViews(i: PileInputs, capB: number, capL: number, markOf: (use: string) => string): DetailView[] {
  const B = capB * 12;
  const L = capL * 12;
  const t = i.capT;
  const micro = i.pileType === "micropile";
  const mp = { ...MICROPILE_DEFAULTS, ...(i.micropile ?? {}) };
  const s = HP_SECTIONS[i.section];
  const w = micro ? mp.casingOD : (s?.bf ?? 12);
  const embed = micro ? mp.embed : i.embed;
  const db = (bar: number) => BARS[bar]?.dia ?? 1;
  const at: { x: number; y: number }[] = [];
  for (let a = 0; a < i.nB; a++)
    for (let b = 0; b < i.nL; b++) {
      if (i.perimeter && a > 0 && a < i.nB - 1 && b > 0 && b < i.nL - 1) continue;
      at.push({ x: (i.edge + a * i.sB) * 12, y: (i.edge + b * i.sL) * 12 });
    }
  const circle = (cx: number, cy: number, r: number): Pt[] => Array.from({ length: 24 }, (_, k) => [cx + r * Math.cos((2 * Math.PI * k) / 24), cy + r * Math.sin((2 * Math.PI * k) / 24)] as Pt);
  const col: Pt[] = i.colShape === "round" ? circle(B / 2, L / 2, i.colB / 2) : rect(B / 2 - i.colB / 2, L / 2 - i.colL / 2, B / 2 + i.colB / 2, L / 2 + i.colL / 2);
  // Plan: the bottom mat's bars both ways (as many lines as they are bars), the piles, the column.
  const cB = i.cover + db(i.barsB.bar) / 2;
  const planLines: DetailView["lines"] = [];
  for (let y = i.cover; y <= L - i.cover + 1e-6; y += i.barsB.spacing) planLines.push({ pts: [[cB, y], [B - cB, y]], mark: markOf("Bottom, along B"), kind: "main" });
  for (let x = i.cover; x <= B - i.cover + 1e-6; x += i.barsL.spacing) planLines.push({ pts: [[x, cB], [x, L - cB]], mark: markOf("Bottom, along L"), kind: "secondary" });
  const plan: DetailView = {
    title: "Plan (bottom mat; the top mat and side bars in the section)",
    polys: [{ pts: rect(0, 0, B, L), style: "concrete" }, { pts: col, style: "dashed" }, ...at.map((p) => ({ pts: micro ? circle(p.x, p.y, w / 2) : rect(p.x - w / 2, p.y - w / 2, p.x + w / 2, p.y + w / 2), style: "void" as const }))],
    lines: planLines,
    dots: [],
    labels: [
      { x: B / 2, y: L + 8, text: `${ftIn(B)} × ${ftIn(L)} cap, ${at.length} ${micro ? `${mp.casingOD} in micropiles` : i.section} at ${ftIn(i.sB * 12)} × ${ftIn(i.sL * 12)}${i.perimeter ? " (the outer ring)" : ""}`, anchor: "middle" },
      { x: B + 6, y: L / 2, text: `#${i.barsB.bar} @ ${ftIn(i.barsB.spacing)} along B, #${i.barsL.bar} @ ${ftIn(i.barsL.spacing)} along L`, anchor: "start" },
      { x: B / 2, y: -10, text: `edge ${ftIn(i.edge * 12)} to the piles' centers`, anchor: "middle" },
    ],
  };
  // Section along B: through a row of piles.
  const yB = i.cover + db(i.barsB.bar) / 2;
  const below = Math.min(72, Math.max(36, t));
  const row = [...new Set(at.map((p) => p.x))];
  const polys: DetailView["polys"] = [{ pts: rect(0, 0, B, t), style: "concrete" }];
  const labels: NonNullable<DetailView["labels"]> = [];
  for (const x of row) {
    polys.push({ pts: rect(x - w / 2, -below, x + w / 2, embed), style: "dashed" });
    if (micro && mp.plate && mp.plate.size > 0) polys.push({ pts: rect(x - mp.plate.size / 2, embed, x + mp.plate.size / 2, embed + mp.plate.t), style: "concrete" });
  }
  polys.push({ pts: rect(B / 2 - i.colB / 2, t, B / 2 + i.colB / 2, t + 24), style: "dashed" });
  labels.push({ x: B / 2, y: t + 30, text: "Column", anchor: "middle" });
  labels.push({ x: B + 6, y: t / 2, text: `${ftIn(t)} deep, ${ftIn(i.cover)} cover to the bottom bars`, anchor: "start" });
  labels.push({ x: B + 6, y: embed / 2, text: `piles embedded ${ftIn(embed)}${micro && mp.plate && mp.plate.size > 0 ? `, ${mp.plate.size} × ${mp.plate.size} × ${mp.plate.t} in plates` : ""}`, anchor: "start" });
  labels.push({ x: B / 2, y: -below - 10, text: micro ? `${mp.casingOD} in casings, ${mp.cased} ft cased + ${mp.bond} ft bonded` : `${i.section}, ${i.length} ft`, anchor: "middle" });
  const top = { B: i.topB ?? { bar: 6, spacing: 9 }, L: i.topL ?? { bar: 6, spacing: 9 }, side: i.sideBars ?? { bar: 5, spacing: 6 } };
  labels.push({ x: B + 6, y: t - 6, text: `top: #${top.B.bar} @ ${ftIn(top.B.spacing)} along B, #${top.L.bar} @ ${ftIn(top.L.spacing)} along L; sides #${top.side.bar} @ ${ftIn(top.side.spacing)}`, anchor: "start" });
  const sDots: DetailView["dots"] = [];
  for (let x = i.cover + db(i.barsL.bar) / 2; x <= B - i.cover; x += i.barsL.spacing) sDots.push({ x, y: i.cover + db(i.barsB.bar) + db(i.barsL.bar) / 2, d: db(i.barsL.bar), mark: markOf("Bottom, along L") });
  const section2: DetailView = {
    title: "Section along B",
    polys,
    lines: [{ pts: [[cB, yB], [B - cB, yB]], mark: markOf("Bottom, along B"), kind: "main" }, { pts: [[cB, t - 2 - db(top.B.bar) / 2], [B - cB, t - 2 - db(top.B.bar) / 2]], mark: markOf("Top, along B"), kind: "main" }],
    dots: [
      ...sDots,
      ...Array.from({ length: Math.max(0, Math.floor((B - 2 * i.cover) / top.L.spacing) + 1) }, (_, k) => ({ x: i.cover + db(top.L.bar) / 2 + k * top.L.spacing, y: t - 2 - db(top.B.bar) - db(top.L.bar) / 2, d: db(top.L.bar), mark: markOf("Top, along L") })).filter((d) => d.x <= B - i.cover),
      ...Array.from({ length: Math.max(0, Math.floor((t - i.cover - 2) / top.side.spacing) - 1) }, (_, k) => i.cover + (k + 1) * top.side.spacing).filter((y) => y < t - 4).flatMap((y) => [{ x: 3 + db(top.side.bar) / 2, y, d: db(top.side.bar), mark: markOf("Sides, along L") }, { x: B - 3 - db(top.side.bar) / 2, y, d: db(top.side.bar), mark: markOf("Sides, along L") }]),
    ],
    labels,
  };
  return [plan, section2];
}

export function shaftTakeoff(i: ShaftInputs): Takeoff {
  const { pre, run } = runner(i.fy, i.fc);
  const L = i.length * 12;
  // Smaller than its column: its bars run up into the column by the noncontact lap (CDOT BDM Figure 11-13).
  const conn = i.column ? columnShaftConnection(i.column, { D: i.D, cover: i.cover, bar: i.bar, bars: i.bars, tieBar: i.tieBar, pitch: i.pitch, fc: i.fc, fy: i.fy }) : null;
  const up = conn?.projecting === "shaft" ? conn.lap : 0;
  run({ size: i.bar, count: i.bars, straight: L - 6 + up, use: "Longitudinal", callout: `${i.bars} #${i.bar} (longitudinal)${up ? `, ${ftIn(roundDown(up))} into the column` : ""}`, cover: i.cover, spacing: 6 });
  const Dsp = i.D - 2 * i.cover - BARS[i.tieBar].dia;
  const turns = Math.ceil(L / i.pitch) + 3;
  pre.push({ size: i.tieBar, count: 1, shape: { kind: "straight", dims: [roundDown(turns * Math.PI * Dsp)] }, length: roundDown(turns * Math.PI * Dsp), use: "Spiral", callout: `#${i.tieBar} spiral @ ${ftIn(i.pitch)} pitch (${turns} turns, ${fit(Dsp)} in)`, where: "spiral" });
  const groups = markGroups(pre);
  return {
    what: "drilled shaft",
    schedule: schedule(groups, []),
    quantities: {
      shaft: { value: i.length, basis: `${i.length} ft of ${i.D} in shaft`, ref: "Section 503: by the foot of diameter (concrete included)" },
      testing: { value: 1, basis: "crosshole sonic logging of the shaft (non-redundant shafts, BDM 10.6.3.2)", math: "1", ref: "Section 503" },
    },
    views: [section("Shaft", i.D / 12, 24, `${i.D} in, ${i.bars} #${i.bar}`)],
    notes: [`The shaft's concrete is paid in the drilled shaft item. ${conn ? conn.text : "The cage's bars run its length; laps to the column's bars are detailed with the column."}`, "CSL testing: drop it where the shafts are redundant and not in water or cased holes (BDM 10.6.3.2)."],
    length: { label: "Shafts", value: 1, unit: "EA" },
  };
}

export function micropileTakeoff(i: MicropileInputs, count = 1): Takeoff {
  const N = Math.max(1, Math.round(count));
  return {
    what: "micropiles",
    schedule: schedule([], []),
    quantities: { micropile: { value: N * (i.cased + i.bond), basis: `${N} × (${i.cased} ft cased + ${i.bond} ft bonded)`, math: `${N > 1 ? `${N}\\cdot ` : ""}\\left(${ftT(i.cased)}+${ftT(i.bond)}\\right)`, ref: "Section 503: by the foot, casing, bar and grout included" }, ...(i.loadTested ? { testing: VERIFICATION_TEST } : {}) },
    views: [section("Micropile", i.casingOD / 12, 12, `${i.casingOD} in casing, #${i.bar} bar`)],
    notes: ["The casing, bar and grout are included in the micropile item. Verification and proof tests by the special provision (AASHTO 10.9.3.5.4).", "The CDOT items are by nominal diameter (6, 7, 8, 10 in): choose the casing's."],
    length: { label: "Micropiles", value: N, unit: "EA" },
  };
}

/**
 * The abutment's typical section, square to it, in inches with y up. Seat and semi-integral: the footing (its toe toward
 * the bridge, on the left), the stem and the backwall or end diaphragm, their bars by the schedule's marks, and the
 * micropile rows or H-pile rows below at their batter. Integral: the pile cap and the end diaphragm over it, the cap's
 * top and bottom bars, its stirrup, the diaphragm's bars each face, and the piles, shafts or micropile rows below.
 */
function abutmentSection(i: AbutmentInputs, markOf: (use: string) => string): DetailView {
  const polys: DetailView["polys"] = [];
  const lines: DetailView["lines"] = [];
  const dots: DetailView["dots"] = [];
  const labels: NonNullable<DetailView["labels"]> = [];
  const db = (bar: number) => BARS[bar]?.dia ?? 1;
  const below = 72; // in of each pile drawn under the concrete
  const pile = (x: number, top: number, d: number, batterDeg: number, name: string) => {
    const t = Math.tan((batterDeg * Math.PI) / 180);
    // A battered pile leans toward the bridge (left): its tip below and to the left of its head.
    const dx = -below * t;
    polys.push({ pts: [[x - d / 2, top], [x + d / 2, top], [x + d / 2 + dx, top - below], [x - d / 2 + dx, top - below]], style: "dashed" });
    labels.push({ x: x + dx, y: top - below - 8, text: name, anchor: "middle" });
  };
  if (!i.type.startsWith("integral")) {
    const B = (i.toe + i.stemT + i.heel) * 12;
    const ft = i.footT * 12;
    const x1 = i.toe * 12;
    const x2 = (i.toe + i.stemT) * 12;
    // A tall stem drawn shortened, with a break line (its height labelled), so the footing and piles stay legible.
    const shown = Math.min(i.stemH * 12, 84);
    const top = ft + shown;
    polys.push({ pts: rect(0, 0, B, ft), style: "concrete" });
    polys.push({ pts: rect(x1, ft, x2, top), style: "concrete" });
    const semi = i.type === "semi-integral";
    const bwT = i.backwallT * 12;
    polys.push({ pts: rect(x2 - bwT, top, x2, top + i.backwallH * 12), style: semi ? "dashed" : "concrete" });
    labels.push({ x: x2 - bwT / 2, y: top + i.backwallH * 12 + 6, text: semi ? "End diaphragm (on the bearings)" : "Backwall", anchor: "middle" });
    polys.push({ pts: rect(x2, ft, B, top + (semi ? 0 : i.backwallH * 12)), style: "earth" });
    // Stem, back face: vertical bars from the footing's bottom mat to the seat, hooked into the footing.
    const sb = x2 - 2 - db(i.stemBars.bar) / 2;
    lines.push({ pts: [[sb - 12, 3 + db(i.toeBars.bar)], [sb, 3 + db(i.toeBars.bar)], [sb, top - 2]], mark: markOf("Stem, back face"), kind: "main" });
    labels.push({ x: B + 4, y: ft + shown / 2, text: `stem, back face: #${i.stemBars.bar} @ ${ftIn(i.stemBars.spacing)}`, anchor: "start" });
    if (shown < i.stemH * 12) {
      const yb = ft + shown / 2;
      lines.push({ pts: [[x1 - 6, yb - 3], [x1 + 6, yb + 3], [x2 - 6, yb - 3], [x2 + 6, yb + 3]], mark: "", kind: "secondary" });
      labels.push({ x: (x1 + x2) / 2, y: yb + 6, text: "(shortened)", anchor: "middle" });
    }
    if (!semi) {
      for (const xb of [x2 - bwT + 2 + db(i.backwallBars.bar) / 2, x2 - 2 - db(i.backwallBars.bar) / 2]) lines.push({ pts: [[xb, top - 12], [xb, top + i.backwallH * 12 - 2]], mark: markOf("Backwall, vertical"), kind: "secondary" });
    }
    // Footing: bottom and top bars across it.
    const yb = 3 + db(i.toeBars.bar) / 2;
    const yt = ft - 2 - db(i.heelBars.bar) / 2;
    lines.push({ pts: [[3, yb], [B - 3, yb]], mark: markOf("Footing, bottom"), kind: "main" });
    lines.push({ pts: [[3, yt], [B - 3, yt]], mark: markOf("Footing, top"), kind: "main" });
    labels.push({ x: B + 4, y: ft / 2, text: `${ftIn(B)} × ${ftIn(ft)} footing`, anchor: "start" });
    labels.push({ x: B + 4, y: top - 6, text: `${ftIn(i.stemT * 12)} stem, ${ftIn(i.stemH * 12)} to the seat`, anchor: "start" });
    if (i.foundation === "micropiles") {
      const mp = { ...MICROPILE_DEFAULTS, ...i.micropile };
      const list = i.mpRowList ?? [];
      for (const [k, r] of list.entries()) pile(r.x * 12, 0, mp.casingOD, r.batter, `${k + 1}`);
      labels.push({ x: B + 4, y: -below / 2, text: `${list.length} rows of ${i.mpPerRow ?? 1} micropiles, ${mp.casingOD} in casings`, anchor: "start" });
      labels.push({ x: B + 4, y: -below / 2 - 12, text: `rows from the toe: ${list.map((r, k) => `${k + 1}: ${ftIn(r.x * 12)}${r.batter > 0 ? ` (${(1 / Math.tan((r.batter * Math.PI) / 180)).toFixed(0)}:1)` : ""}`).join(", ")}`, anchor: "start" });
    } else if (i.foundation === "piles") {
      for (const [k, x] of [i.rowFront, i.rowBack].entries()) pile(x * 12, 0, 12, 0, `${k ? "Back" : "Front"} row, ${i.section} @ ${ftIn(i.pileSpacing * 12)}`);
    }
    return { title: "Typical section (the bridge to the left)", polys, lines, dots, labels };
  }
  const W = i.capWidth * 12;
  const capD = i.capDepth * 12;
  const D = i.totalDepth * 12;
  polys.push({ pts: rect(0, 0, W, capD), style: "concrete" });
  polys.push({ pts: rect(0, capD, W, D), style: "concrete" });
  labels.push({ x: W / 2, y: capD / 2, text: "Pile cap", anchor: "middle" });
  labels.push({ x: W / 2, y: (capD + D) / 2, text: "End diaphragm", anchor: "middle" });
  // The cap's stirrup and its top and bottom bars, spread across its width.
  lines.push({ pts: [[3, 3], [W - 3, 3], [W - 3, capD - 3], [3, capD - 3], [3, 3]], mark: markOf("Cap stirrups"), kind: "stirrup" });
  const across = (n: number, y: number, bar: number, use: string) => {
    for (let k = 0; k < n; k++) dots.push({ x: 4 + db(bar) / 2 + ((W - 8 - db(bar)) * k) / Math.max(1, n - 1), y, d: db(bar), mark: markOf(use) });
  };
  across(Math.min(i.capTop.count, 8), capD - 4 - db(i.capTop.bar) / 2, i.capTop.bar, "Cap, top");
  across(Math.min(i.capBot.count, 8), 4 + db(i.capBot.bar) / 2, i.capBot.bar, "Cap, bottom");
  for (let y = capD + i.diaphragmBars.spacing; y < D - 2; y += i.diaphragmBars.spacing) for (const x of [2 + db(i.diaphragmBars.bar) / 2, W - 2 - db(i.diaphragmBars.bar) / 2]) dots.push({ x, y, d: db(i.diaphragmBars.bar), mark: markOf("Diaphragm, horizontal") });
  labels.push({ x: W / 2, y: -10, text: `${ftIn(W)} wide, ${ftIn(D)} deep: ${i.capTop.count} #${i.capTop.bar} top, ${i.capBot.count} #${i.capBot.bar} bottom, #${i.stirrup.bar} stirrups @ ${ftIn(i.stirrup.spacing)}`, anchor: "middle" });
  if (i.type === "integral-micropiles") {
    const mp = { ...MICROPILE_DEFAULTS, ...i.micropile };
    const rows = Math.max(1, Math.round(i.mpRows));
    for (let r = 0; r < rows; r++) pile(W / 2 - ((rows - 1) * i.mpRowSpacing * 12) / 2 + r * i.mpRowSpacing * 12, 0, mp.casingOD, -(r === 0 ? i.mpBatterFront : i.mpBatterBack), `Row ${r + 1}`);
  } else if (i.type === "integral-shafts") pile(W / 2, 0, i.shaftD, 0, `${i.shaftD} in shafts`);
  else pile(W / 2, 0, 12, 0, `${i.section}, ${i.nPiles} piles`);
  return { title: "Typical section (the bridge to the left)", polys, lines, dots, labels };
}

export function abutmentTakeoff(i: AbutmentInputs): Takeoff {
  const { pre, run } = runner(i.fy, i.fc);
  const integral = i.type.startsWith("integral");
  const Li = i.length * 12;
  let cy = 0;
  const concrete: ConcreteItem[] = [];
  const q: Takeoff["quantities"] = {};
  if (integral) {
    run({ size: i.capTop.bar, count: i.capTop.count, straight: Li - 4, use: "Cap, top", callout: `${i.capTop.count} #${i.capTop.bar} (cap, top)`, cover: 2, spacing: 6 });
    run({ size: i.capBot.bar, count: i.capBot.count, straight: Li - 4, use: "Cap, bottom", callout: `${i.capBot.count} #${i.capBot.bar} (cap, bottom)`, cover: 3, spacing: 6 });
    const w = i.capWidth * 12 - 6;
    const h = i.capDepth * 12 - 6;
    pre.push({ size: i.stirrup.bar, count: countAt(Li - 4, i.stirrup.spacing), shape: { kind: "closed", dims: [roundDown(w), roundDown(h)], hook: 6 }, length: roundDown(2 * (w + h) + 12), use: "Cap stirrups", callout: `#${i.stirrup.bar} stirrups @ ${ftIn(i.stirrup.spacing)}`, where: "cap" });
    const above = (i.totalDepth - i.capDepth) * 12;
    run({ size: i.diaphragmBars.bar, count: 2 * countAt(above - 4, i.diaphragmBars.spacing), straight: Li - 4, use: "Diaphragm, horizontal", callout: `#${i.diaphragmBars.bar} @ ${ftIn(i.diaphragmBars.spacing)} each face (diaphragm)`, cover: 2, spacing: i.diaphragmBars.spacing });
    cy = (i.length * i.capWidth * i.totalDepth) / 27;
    concrete.push({ label: "Cap and end diaphragm", cy, basis: `${i.length} ft × ${i.capWidth} ft × ${i.totalDepth} ft (the girders' ends not deducted)`, math: `${ftT(i.length)}\\cdot ${ftT(i.capWidth)}\\cdot ${ftT(i.totalDepth)}`, ref: "Integral abutment: length × width × depth" });
    if (i.type === "integral-piles") {
      q.pile = { value: i.nPiles * (i.pileLength + i.embed / 12), basis: `${i.nPiles} piles × (${i.pileLength} ft + the ${i.embed} in embedment)`, math: `${i.nPiles}\\cdot\\left(${ftT(i.pileLength)}+${inT(i.embed)}\\right)`, ref: "Section 502" };
      q["pile-tip"] = { value: i.nPiles, basis: `${i.nPiles} piles`, math: `${i.nPiles}`, ref: "Section 502" };
      if (i.prebore > 0) q.prebore = { value: i.nPiles * i.prebore, basis: `${i.nPiles} × ${i.prebore} ft (the pipe sleeve and pea gravel included, BDM 11.3.1 Note 11)`, math: `${i.nPiles}\\cdot ${ftT(i.prebore)}`, ref: "Section 502" };
    } else if (i.type === "integral-micropiles") {
      const mp = { ...MICROPILE_DEFAULTS, ...i.micropile };
      const nm = i.nPiles * Math.max(1, Math.round(i.mpRows));
      q.micropile = { value: nm * (mp.cased + mp.bond), basis: `${nm} micropiles (${i.mpRows} rows of ${i.nPiles}) × (${mp.cased} ft cased + ${mp.bond} ft bonded)`, math: `${nm}\\cdot\\left(${ftT(mp.cased)}+${ftT(mp.bond)}\\right)`, ref: "Section 503: by the foot, casing, bar and grout included" };
      if (mp.loadTested) q.testing = VERIFICATION_TEST;
    } else q.shaft = { value: i.nPiles * i.shaftLength, basis: `${i.nPiles} shafts × ${i.shaftLength} ft`, math: `${i.nPiles}\\cdot ${ftT(i.shaftLength)}`, ref: "Section 503" };
    Object.assign(q, excavation(i.capWidth, i.length, i.capDepth + i.capEmbed, cy));
  } else {
    const B = i.toe + i.stemT + i.heel;
    // A stepped footing: the stem's average height for its quantities, the tallest for its design.
    const hq = i.stemHQty && i.stemHQty > 0 ? i.stemHQty : i.stemH;
    const Hst = i.stemH + i.backwallH;
    run({ size: i.stemBars.bar, count: countAt(Li - 4, i.stemBars.spacing), straight: hq * 12 + i.footT * 12 - 6, hooks: [true, false], use: "Stem, back face", callout: `#${i.stemBars.bar} @ ${ftIn(i.stemBars.spacing)} (stem, back face)`, cover: 2, spacing: i.stemBars.spacing });
    run({ size: i.backwallBars.bar, count: 2 * countAt(Li - 4, i.backwallBars.spacing), straight: i.backwallH * 12 + 24, use: "Backwall, vertical", callout: `#${i.backwallBars.bar} @ ${ftIn(i.backwallBars.spacing)} each face (backwall)`, cover: 2, spacing: i.backwallBars.spacing });
    run({ size: i.toeBars.bar, count: countAt(Li - 6, i.toeBars.spacing), straight: B * 12 - 6, use: "Footing, bottom", callout: `#${i.toeBars.bar} @ ${ftIn(i.toeBars.spacing)} (footing, bottom)`, cover: 3, spacing: i.toeBars.spacing });
    run({ size: i.heelBars.bar, count: countAt(Li - 6, i.heelBars.spacing), straight: B * 12 - 6, use: "Footing, top", callout: `#${i.heelBars.bar} @ ${ftIn(i.heelBars.spacing)} (footing, top)`, cover: 2, spacing: i.heelBars.spacing });
    // The stem's other bars, the seat's, and the footing's along the abutment (CDOT's usual #5 @ 12 in where not given).
    const sf = i.stemFrontBars ?? { bar: 5, spacing: 12 };
    const sh = i.stemHorizBars ?? { bar: 5, spacing: 12 };
    const flt = i.footLongTop ?? { bar: 5, spacing: 12 };
    const flb = i.footLongBot ?? { bar: 5, spacing: 12 };
    run({ size: sf.bar, count: countAt(Li - 4, sf.spacing), straight: hq * 12 + i.footT * 12 - 6, hooks: [true, false], use: "Stem, front face", callout: `#${sf.bar} @ ${ftIn(sf.spacing)} (stem, front face)`, cover: 2, spacing: sf.spacing });
    run({ size: sh.bar, count: countAt(hq * 12 - 4, sh.spacing), times: 2, straight: Li - 4, use: "Stem, horizontal", callout: `#${sh.bar} @ ${ftIn(sh.spacing)} each face (stem, horizontal)`, cover: 2, spacing: sh.spacing });
    if (i.seatTop && i.seatTop.count > 0) run({ size: i.seatTop.bar, count: i.seatTop.count, straight: Li - 4, use: "Seat, top", callout: `${i.seatTop.count}-#${i.seatTop.bar} Cont. (seat, top)`, cover: 2, spacing: 6 });
    if (i.seatU) run({ size: i.seatU.bar, count: countAt(Li - 4, i.seatU.spacing), straight: [24, i.stemT * 12 - 4, 24], use: "Seat, U bars", callout: `#${i.seatU.bar} @ ${ftIn(i.seatU.spacing)} (seat, U)`, cover: 2, spacing: i.seatU.spacing });
    run({ size: flt.bar, count: countAt(B * 12 - 6, flt.spacing), straight: Li - 6, use: "Footing, top, along", callout: `#${flt.bar} @ ${ftIn(flt.spacing)} (footing, top, along the abutment)`, cover: 2, spacing: flt.spacing });
    run({ size: flb.bar, count: countAt(B * 12 - 6, flb.spacing), straight: Li - 6, use: "Footing, bottom, along", callout: `#${flb.bar} @ ${ftIn(flb.spacing)} (footing, bottom, along the abutment)`, cover: 3, spacing: flb.spacing });
    // CDOT BDM 5.4.5: coated bars in abutment caps, diaphragms and wingwalls, not footings: the footing's bars plain
    // (602-00000). BDM 5.3.1.1: Class DF in elements exposed to deicing salts (the stem and the diaphragm or backwall,
    // by the roadway), Class D for the footing poured apart and buried.
    for (const g of pre) if (g.use.startsWith("Footing")) g.payAs = "602-00000";
    const stemV = i.length * i.stemT * hq;
    const bwV = i.length * i.backwallT * i.backwallH;
    const ftV = i.length * B * i.footT;
    cy = (stemV + bwV + ftV) / 27;
    if (i.type === "semi-integral") {
      // The end diaphragm rides on the bearings with the girders: a bridge's summary of quantities pays it, concrete and
      // bars, with the superstructure (as CDOT's plans do); the stem stays with the abutment.
      for (const g of pre) if (g.use.startsWith("Backwall")) g.paidWith = "superstructure";
      concrete.push({ label: "Stem", cy: stemV / 27, item: "601-03056", basis: `${i.length} ft × ${i.stemT} × ${hq} ft, Class DF (BDM 5.3.1.1)`, math: `${ftT(i.length)}\\cdot ${ftT(i.stemT)}\\cdot ${ftT(hq)}`, ref: "Abutment wall: length × section, Class DF" });
      concrete.push({ label: "End diaphragm", cy: bwV / 27, item: "601-03056", paidWith: "superstructure", basis: `${i.length} ft × ${i.backwallT} × ${i.backwallH} ft, Class DF (BDM 5.3.1.1); in the bridge's summary, with the superstructure`, math: `${ftT(i.length)}\\cdot ${ftT(i.backwallT)}\\cdot ${ftT(i.backwallH)}`, ref: "End diaphragm: length × width × height, Class DF" });
    } else concrete.push({ label: "Stem and backwall", cy: (stemV + bwV) / 27, item: "601-03056", basis: `${i.length} ft × (${i.stemT} × ${hq} + ${i.backwallT} × ${i.backwallH}) ft², Class DF (BDM 5.3.1.1)`, math: `${ftT(i.length)}\\cdot\\left(${ftT(i.stemT)}\\cdot ${ftT(hq)}+${ftT(i.backwallT)}\\cdot ${ftT(i.backwallH)}\\right)`, ref: "Abutment wall: length × section, Class DF" });
    concrete.push({ label: "Footing", cy: ftV / 27, item: "601-03040", basis: `${i.length} ft × ${fit(B)} × ${i.footT} ft, Class D (BDM 5.3.1.1)`, math: `${ftT(i.length)}\\cdot ${ftT(fit(B))}\\cdot ${ftT(i.footT)}`, ref: "Footing: length × width × depth, Class D" });
    if (i.foundation === "piles") {
      const n = 2 * Math.max(1, Math.floor(i.length / i.pileSpacing) + 1);
      q.pile = { value: n * (i.pileLength + 1), basis: `${n} piles in two rows × (${i.pileLength} + 1) ft`, math: `${n}\\cdot\\left(${ftT(i.pileLength)}+1\\mathrm{ft}\\right)`, ref: "Section 502" };
      q["pile-tip"] = { value: n, basis: `${n} piles`, math: `${n}`, ref: "Section 502" };
    } else if (i.foundation === "micropiles") {
      const mp = { ...MICROPILE_DEFAULTS, ...i.micropile };
      const rows = (i.mpRowList ?? []).length;
      const per = Math.max(1, Math.round(i.mpPerRow ?? 1));
      const nm = rows * per;
      q.micropile = { value: nm * (mp.cased + mp.bond), basis: `${nm} micropiles (${rows} rows of ${per}) × (${mp.cased} ft cased + ${mp.bond} ft bonded)`, math: `${nm}\\cdot\\left(${ftT(mp.cased)}+${ftT(mp.bond)}\\right)`, ref: "Section 503: by the foot, casing, bar and grout included" };
      if (mp.loadTested) q.testing = VERIFICATION_TEST;
    }
    Object.assign(q, excavation(B, i.length, Math.max(i.footT, i.Df), (i.length * B * i.footT) / 27));
    void Hst;
  }
  const groups = markGroups(pre);
  return {
    what: `${i.type.replace("-", " ")} abutment`,
    schedule: schedule(groups, concrete),
    quantities: q,
    views: [abutmentSection(i, (use) => groups.find((g) => g.use === use)?.mark ?? "")],
    notes: ["Concrete Class D (Bridge) or DF and epoxy-coated bars (BDM 11.3.1 Notes 1 and 6).", "Wingwalls are detailed in the Cantilever Wingwall tool; the approach slab's notch and the girders' anchorage (strands, #7 bars in PVC sleeves) are not included."],
  };
}
