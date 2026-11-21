import type { Line } from "@/lib/calcs/library/templates";
import { checksSummary } from "../checks-summary";
import { COLOR_NOTE, INPUT_COLOR, isInput, num } from "../calc-style";
import type { Figure } from "../figures";
import { schedule } from "../rebar/schedule";
import type { DetailView, Takeoff } from "../takeoff/types";
import { designSoilNail, faceX, groundOf, NAIL_BARS, type SoilNailInputs } from "./wall";

// A soil nail wall's drawings, after the layout of GEC 7 Appendix D's example plans and DOT soil nail worksheets:
// - the typical section: the ground (backslope, surcharge, water), the excavation, the face with its initial and final
//   facings, every nail with its row, length, inclination and drill hole, the vertical spacings, the critical internal
//   and global slip circles, and the zone behind the wall where the ground moves (DDEF, δh);
// - the face elevation: the nail pattern (SH × SV, the first row below the top, the last above the bottom) with the
//   waler bars at the heads;
// - the nail head: initial shotcrete with its mesh and waler bars, the bearing plate, nut, headed studs, the final facing
//   with its bars, the drain strip, and the nail and grout in its drill hole;
// - the nail's cross section: the bar, grout cover, centralizer and the drill hole.
// Its take-off and calc package follow.

type Pt = [number, number];
const rect = (x0: number, y0: number, x1: number, y1: number): Pt[] => [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
const band = (x0: number, y0: number, x1: number, y1: number, w: number): Pt[] => {
  const L = Math.hypot(x1 - x0, y1 - y0) || 1;
  const nx = (-(y1 - y0) / L) * (w / 2);
  const ny = ((x1 - x0) / L) * (w / 2);
  return [[x0 + nx, y0 + ny], [x1 + nx, y1 + ny], [x1 - nx, y1 - ny], [x0 - nx, y0 - ny]];
};
const circle = (cx: number, cy: number, r: number, n = 32): Pt[] => Array.from({ length: n }, (_, k) => [cx + r * Math.cos((2 * Math.PI * k) / n), cy + r * Math.sin((2 * Math.PI * k) / n)] as Pt);

/** A number for a drawing's label: plain, no exponent. */
const n2 = (v: number, d = 2) => String(+v.toFixed(d));

/** The part of a slip circle that is the slip surface: the run below the ground through `through`, inside [xa, xb]. */
function slipArc(i: SoilNailInputs, c: { xc: number; yc: number; R: number }, He: number, xa: number, xb: number, yMin: number): Pt[] {
  const ground = groundOf(i, He);
  const runs: Pt[][] = [];
  let cur: Pt[] = [];
  for (let k = 0; k <= 160; k++) {
    const x = c.xc - c.R + (2 * c.R * k) / 160;
    const y = c.yc - Math.sqrt(Math.max(0, c.R * c.R - (x - c.xc) ** 2));
    if (y < ground(x) + 1e-6 && x >= xa && x <= xb && y >= yMin) cur.push([x, y]);
    else if (cur.length) {
      runs.push(cur);
      cur = [];
    }
  }
  if (cur.length) runs.push(cur);
  return runs.reduce((a, r) => (r.length > a.length ? r : a), [] as Pt[]);
}

export function soilNailViews(i: SoilNailInputs): DetailView[] {
  const r = designSoilNail(i);
  const views: DetailView[] = [];

  // --- typical section (ft) ---------------------------------------------------------------------------------------
  const xTop = faceX(i, 0);
  const reach = Math.max(...r.nails.map((n) => n.p1[0]), xTop + r.deflection.DDEF) + 5;
  const ground = groundOf(i, i.H);
  const front = -Math.max(10, 0.45 * i.H);
  const gArc = Number.isFinite(r.global.FS) ? slipArc(i, r.global.c, i.H, front, reach, -i.H * 2.2) : [];
  const iArc = slipArc(i, r.internal.c, i.H, front, reach, -i.H * 2.2);
  const bottom = Math.min(-i.H - 6, ...gArc.map((p) => p[1] - 1.5), ...iArc.map((p) => p[1] - 1.5));
  const sec: DetailView = { title: `Typical section: ${n2(i.H)} ft wall, ${i.rows} rows of #${i.bar} nails at ${n2(i.sh)} ft × ${n2(i.sv)} ft, ${i.incline}° down`, polys: [], lines: [], dots: [], labels: [] };
  const behind: Pt[] = [[faceX(i, -i.H), -i.H], [xTop, 0]];
  for (let x = xTop; x <= reach + 1e-9; x += 1) behind.push([x, ground(x)]);
  behind.push([reach, bottom], [faceX(i, -i.H), bottom]);
  sec.polys.push({ pts: behind, style: "earth" });
  sec.polys.push({ pts: rect(front, bottom, faceX(i, -i.H), -i.H), style: "earth" });
  // The facings: the shotcrete on the cut, the final facing in front, down a foot below the finished grade.
  const hiFt = i.hi / 12;
  const hfFt = i.permanent ? i.hf / 12 : 0;
  const fx = (y: number) => faceX(i, y);
  sec.polys.push({ pts: [[fx(-i.H) - hiFt, -i.H], [fx(-i.H), -i.H], [fx(0), 0], [fx(0) - hiFt, 0]], style: "concrete" });
  if (i.permanent) sec.polys.push({ pts: [[fx(-i.H) - hiFt - hfFt, -i.H - 1], [fx(-i.H) - hiFt, -i.H - 1], [fx(0) - hiFt, 0.5], [fx(0) - hiFt - hfFt, 0.5]], style: "concrete" });
  // Drain strips on the cut (dashed down the face) and the toe drain.
  sec.lines.push({ pts: [[fx(-i.H) + 0.05, -i.H], [fx(0) + 0.05, 0]], mark: "", kind: "secondary" });
  sec.dots.push({ x: fx(-i.H) - hiFt - hfFt - 0.6, y: -i.H - 0.6, d: 0.5, mark: "" });
  // The nails: the grouted hole (dashed band) and the bar.
  for (const n of r.nails) {
    sec.polys.push({ pts: band(n.p0[0], n.p0[1], n.p1[0], n.p1[1], i.hole / 12), style: "dashed" });
    sec.lines.push({ pts: [[n.p0[0] - hiFt, n.p0[1]], n.p1], mark: "", kind: "main" });
    sec.labels!.push({ x: n.p1[0] + 0.4, y: n.p1[1] - 0.3, text: `Row ${n.row}: ${n2(n.L, 1)} ft`, anchor: "start" });
  }
  sec.labels!.push({ x: r.nails[0].p0[0] + 1.5, y: r.nails[0].p0[1] + 0.8, text: `${i.incline}° down, #${i.bar} Gr ${i.fy} in ${i.hole} in grouted holes`, anchor: "start" });
  // Vertical spacings, dimensioned in front of the wall.
  const xd = fx(-i.H) - hiFt - hfFt - 1.5;
  sec.lines.push({ pts: [[xd, 0], [xd, -i.H]], mark: "", kind: "secondary" });
  for (const y of [0, ...r.nails.map((n) => -n.z), -i.H]) sec.lines.push({ pts: [[xd - 0.35, y], [xd + 0.35, y]], mark: "", kind: "secondary" });
  sec.labels!.push({ x: xd - 0.5, y: -i.sv0 / 2 - 0.3, text: `SV0 ${n2(i.sv0)} ft`, anchor: "end" });
  if (r.nails.length > 1) sec.labels!.push({ x: xd - 0.5, y: -(r.nails[0].z + r.nails[1].z) / 2 - 0.3, text: `SV ${n2(i.sv)} ft`, anchor: "end" });
  sec.labels!.push({ x: xd - 0.5, y: -(r.nails[r.nails.length - 1].z + i.H) / 2 - 0.3, text: `SVN ${n2(i.H - r.nails[r.nails.length - 1].z)} ft`, anchor: "end" });
  sec.labels!.push({ x: xd - 0.5, y: -i.H / 2 - 0.3, text: `H ${n2(i.H)} ft`, anchor: "end" });
  // The surcharge as arrows on the ground behind, and the zone that moves (DDEF) above it.
  const yMaxBehind = Math.max(...Array.from({ length: 21 }, (_, k) => ground(xTop + ((reach - xTop) * k) / 20)));
  if (i.surcharge > 0) {
    for (let x = xTop + 1; x < reach; x += Math.max(1.5, (reach - xTop) / 10)) sec.lines.push({ pts: [[x, ground(x) + 1.6], [x, ground(x) + 0.2]], mark: "", kind: "secondary" });
    sec.labels!.push({ x: reach, y: yMaxBehind + 2.1, text: `q ${n2(i.surcharge, 0)} psf`, anchor: "end" });
  }
  const yD = yMaxBehind + (i.surcharge > 0 ? 3.6 : 1.6);
  sec.lines.push({ pts: [[xTop, yD], [xTop + r.deflection.DDEF, yD]], mark: "", kind: "secondary" });
  for (const x of [xTop, xTop + r.deflection.DDEF]) sec.lines.push({ pts: [[x, yD - 0.4], [x, yD + 0.4]], mark: "", kind: "secondary" });
  sec.labels!.push({ x: xTop + r.deflection.DDEF / 2, y: yD + 0.7, text: `DDEF ${n2(r.deflection.DDEF, 1)} ft (ground movement); the top moves about ${n2(r.deflection.dh)} in each way`, anchor: "middle" });
  if (i.water !== null && -i.water > bottom) {
    sec.lines.push({ pts: [[front, -Math.max(i.water, i.H)], [fx(-i.H), -Math.max(i.water, i.H)]], mark: "", kind: "secondary" });
    sec.lines.push({ pts: [[fx(-i.water), -i.water], [reach, -i.water]], mark: "", kind: "secondary" });
    sec.labels!.push({ x: reach - 0.3, y: -i.water + 0.4, text: "▽ water table", anchor: "end" });
  }
  // The critical circles, tagged where they cross the ground behind.
  if (iArc.length > 1) {
    sec.lines.push({ pts: iArc, mark: "", kind: "secondary" });
    const e = iArc[iArc.length - 1];
    sec.labels!.push({ x: e[0] + 0.3, y: e[1] - 1.2, text: `Internal ${n2(r.internal.FS)}`, anchor: "start" });
  }
  if (gArc.length > 1) {
    sec.lines.push({ pts: gArc, mark: "", kind: "secondary" });
    const e = gArc[gArc.length - 1];
    sec.labels!.push({ x: Math.min(e[0], reach) - 0.3, y: e[1] - 1.2, text: `Global ${n2(r.global.FS)}`, anchor: "end" });
  }
  // The legend under the section.
  const leg = [
    `Facing: ${i.hi} in shotcrete with ${n2(i.wwm, 3)} in²/ft mesh${i.permanent ? `, ${i.hf} in cast-in-place final facing ${i.permanent ? "1 ft below grade" : ""}` : ""}; geocomposite drain strips on the cut between nails; toe drain`,
    `Internal stability FS ${n2(r.internal.FS)} (≥ ${r.fsMin}); Tmax ${n2(r.Tmax, 1)} kip at row ${r.top.row} (${r.top.mode}); global FS ${n2(r.global.FS)}; lowest stage FS ${n2(Math.min(...r.stages.map((s) => s.FS)))}`,
    `${i.surcharge > 0 ? `Surcharge ${n2(i.surcharge, 0)} psf` : "No surcharge"}${i.backslope > 0 ? `; backslope ${i.backslope}°` : ""}${i.batter > 0 ? `; face batter ${i.batter}°` : ""}${i.water !== null ? `; water ${n2(i.water, 1)} ft below the top` : "; drained"}`,
  ];
  leg.forEach((t, k) => sec.labels!.push({ x: front + 0.3, y: bottom - 1.6 - 1.6 * k, text: t, anchor: "start" }));
  views.push(sec);

  // --- face elevation: the nail pattern (ft) ------------------------------------------------------------------------
  const cols = 4;
  const W = cols * i.sh;
  const el: DetailView = { title: `Face elevation: the nail pattern (${i.rows} rows, square, SH ${n2(i.sh)} ft × SV ${n2(i.sv)} ft)`, polys: [], lines: [], dots: [], labels: [] };
  el.polys.push({ pts: rect(0, -i.H, W, 0), style: "concrete" });
  for (const n of r.nails)
    for (let c = 0; c < cols; c++) {
      const x = (c + 0.5) * i.sh;
      el.dots.push({ x, y: -n.z, d: Math.max(0.5, i.plate / 12), mark: "" });
      el.lines.push({ pts: [[x - 0.3 * i.sh, -n.z], [x + 0.3 * i.sh, -n.z]], mark: "", kind: "secondary" });
      el.lines.push({ pts: [[x, -n.z - 0.3 * i.sv], [x, -n.z + 0.3 * i.sv]], mark: "", kind: "secondary" });
    }
  // SH across the top, SV0/SV/SVN down the right.
  const yT = 1;
  el.lines.push({ pts: [[0.5 * i.sh, yT], [1.5 * i.sh, yT]], mark: "", kind: "secondary" });
  el.labels!.push({ x: i.sh, y: yT + 0.4, text: `SH ${n2(i.sh)} ft`, anchor: "middle" });
  const xR = W + 0.8;
  el.lines.push({ pts: [[xR, 0], [xR, -i.H]], mark: "", kind: "secondary" });
  for (const y of [0, ...r.nails.map((n) => -n.z), -i.H]) el.lines.push({ pts: [[xR - 0.3, y], [xR + 0.3, y]], mark: "", kind: "secondary" });
  el.labels!.push({ x: xR + 0.5, y: -i.sv0 / 2 - 0.3, text: `SV0 ${n2(i.sv0)} ft`, anchor: "start" });
  if (r.nails.length > 1) el.labels!.push({ x: xR + 0.5, y: -(r.nails[0].z + r.nails[1].z) / 2 - 0.3, text: `SV ${n2(i.sv)} ft`, anchor: "start" });
  el.labels!.push({ x: xR + 0.5, y: -(r.nails[r.nails.length - 1].z + i.H) / 2 - 0.3, text: `SVN ${n2(i.H - r.nails[r.nails.length - 1].z)} ft`, anchor: "start" });
  el.labels!.push({ x: 0.2, y: -i.H - 1.2, text: `Bearing plates ${i.plate} in at each head; ${i.headBars} #${i.headBar} waler bars each way (≥ 0.6·SH and 0.6·SV long)`, anchor: "start" });
  views.push(el);

  // --- the nail head (in) -------------------------------------------------------------------------------------------
  const hd: DetailView = { title: "Nail head detail (section through a nail, inches)", polys: [], lines: [], dots: [], labels: [] };
  const hi = i.hi;
  const hf = i.permanent ? i.hf : 0;
  const half = Math.max(14, i.plate);
  const soilW = 30;
  const x0 = -hi - hf; // the wall's front
  hd.polys.push({ pts: rect(0, -half, soilW, half), style: "earth" });
  hd.polys.push({ pts: rect(-hi, -half, 0, half), style: "concrete" });
  if (i.permanent) hd.polys.push({ pts: rect(x0, -half, -hi, half), style: "concrete" });
  hd.lines.push({ pts: [[0.15, -half], [0.15, half]], mark: "", kind: "secondary" }); // drain strip
  hd.lines.push({ pts: [[-hi / 2, -half], [-hi / 2, half]], mark: "", kind: "secondary" }); // WWM at mid-thickness
  const sz = (b: number) => (({ 3: 0.375, 4: 0.5, 5: 0.625, 6: 0.75 }) as Record<number, number>)[b] ?? 0.5;
  const wd = sz(i.headBar);
  for (let k = 0; k < i.headBars; k++) {
    const y = (k < i.headBars / 2 ? -1 : 1) * (i.plate / 2 + 1.5 + Math.floor(k / 2) * 2);
    hd.dots.push({ x: -hi / 2 - wd, y, d: wd, mark: "" });
  }
  // The bar in its grouted hole, through the shotcrete to the nut.
  const barD = Math.sqrt((4 * (NAIL_BARS[i.bar] ?? 0.6)) / Math.PI);
  hd.polys.push({ pts: rect(0, -i.hole / 2, soilW, i.hole / 2), style: "concrete" });
  const steel = (pts: Pt[]) => hd.lines.push({ pts: [...pts, pts[0]], mark: "", kind: "main" });
  const plateX = -hi; // on the shotcrete's face
  steel(rect(plateX - 3, -barD / 2, soilW, barD / 2));
  steel(rect(plateX - i.plateT, -i.plate / 2, plateX, i.plate / 2));
  steel(rect(plateX - i.plateT - 1.4, -barD * 0.9, plateX - i.plateT, barD * 0.9)); // beveled washer and nut
  if (i.permanent) {
    for (const sy of [-i.studSpacing / 2, i.studSpacing / 2]) {
      steel(rect(plateX - i.plateT - i.studL + i.studHeadT, sy - i.studD / 2, plateX - i.plateT, sy + i.studD / 2));
      steel(rect(plateX - i.plateT - i.studL, sy - i.studHeadD / 2, plateX - i.plateT - i.studL + i.studHeadT, sy + i.studHeadD / 2));
    }
    const fb = sz(i.finalBar);
    const xb = x0 + 2 + fb / 2;
    hd.lines.push({ pts: [[xb, -half], [xb, half]], mark: "", kind: "main" });
    for (let y = -half + i.finalSpacing / 2; y < half; y += i.finalSpacing) hd.dots.push({ x: xb + fb, y, d: fb, mark: "" });
  }
  // Leaders to the notes on the soil side.
  const notes: [Pt, string][] = [
    [[-hi / 2, half - 1], `${i.hi} in shotcrete (f'c ${n2(i.fcI, 1)} ksi), WWM ${n2(i.wwm, 3)} in²/ft at mid-thickness`],
    [[-hi / 2 - wd, i.plate / 2 + 1.5], `${i.headBars} #${i.headBar} waler bars each way at the head`],
    [[plateX - i.plateT / 2, i.plate / 2 - 0.5], `${i.plate} × ${i.plate} × ${i.plateT} in bearing plate, beveled washer and nut`],
    [[0.15, -half + 1], "Geocomposite drain strip on the cut"],
    [[soilW / 2, -i.hole / 2], `#${i.bar} Grade ${i.fy} bar (${n2(NAIL_BARS[i.bar] ?? 0.6)} in²) in a ${i.hole} in grouted hole, centralizers`],
    ...(i.permanent
      ? ([
          [[plateX - i.plateT - i.studL / 2, i.studSpacing / 2], `${i.studs} headed studs ${n2(i.studD, 3)} × ${n2(i.studL, 3)} in at ${n2(i.studSpacing, 1)} in (head ${n2(i.studHeadD, 3)} × ${n2(i.studHeadT, 3)} in)`],
          [[x0 + 2, -half + 2], `${i.hf} in final facing (f'c ${n2(i.fcF, 1)} ksi), #${i.finalBar} @ ${i.finalSpacing} in each way, ≥ 2 in cover over the studs`],
        ] as [Pt, string][])
      : []),
  ];
  // The notes in slots above and below the drill hole, in the order of what they point at, so the leaders don't cross.
  notes.sort((p, q) => q[0][1] - p[0][1]);
  const clear = i.hole / 2 + 1.5;
  const above = notes.filter(([p]) => p[1] >= 0);
  const below = notes.filter(([p]) => p[1] < 0);
  const place = (group: [Pt, string][], yA: number, yB: number) =>
    group.forEach(([p, t], k) => {
      const ly = group.length === 1 ? (yA + yB) / 2 : yA - (k * (yA - yB)) / (group.length - 1);
      const lx = 6;
      hd.lines.push({ pts: [p, [lx - 0.5, ly]], mark: "", kind: "secondary" });
      hd.labels!.push({ x: lx, y: ly - 0.3, text: t, anchor: "start" });
    });
  place(above, half - 1.5, clear);
  place(below, -clear - 0.5, -half + 1.5);
  hd.labels!.push({ x: x0, y: -half - 1.6, text: `Front of the wall`, anchor: "start" });
  hd.labels!.push({ x: soilW, y: -half - 1.6, text: `Retained soil`, anchor: "end" });
  views.push(hd);

  // --- the nail's cross section (in) --------------------------------------------------------------------------------
  const cs: DetailView = { title: "Nail cross section (inches)", polys: [], lines: [], dots: [], labels: [] };
  const R = i.hole / 2;
  cs.polys.push({ pts: rect(-i.hole, -i.hole, i.hole, i.hole), style: "earth" });
  cs.polys.push({ pts: circle(0, 0, R), style: "concrete" });
  cs.dots.push({ x: 0, y: 0, d: barD, mark: "" });
  for (const a of [90, 210, 330]) cs.lines.push({ pts: [[(barD / 2) * Math.cos((a * Math.PI) / 180), (barD / 2) * Math.sin((a * Math.PI) / 180)], [R * Math.cos((a * Math.PI) / 180), R * Math.sin((a * Math.PI) / 180)]], mark: "", kind: "secondary" });
  cs.labels!.push({ x: -i.hole + 0.3, y: -i.hole - 1, text: `${i.hole} in drill hole, grout; #${i.bar} bar (${n2(NAIL_BARS[i.bar] ?? 0.6)} in²); cover ${n2((i.hole - barD) / 2)} in (≥ 1 in, GEC 7 Ch. 7); centralizers`, anchor: "start" });
  views.push(cs);
  return views;
}

/** The take-off for a length of wall: the soil nails (LF), the wall's face (SF) and the initial shotcrete (SF). */
export function soilNailTakeoff(i: SoilNailInputs, lengthFt = 100): Takeoff {
  const r = designSoilNail(i);
  const perRow = Math.ceil(lengthFt / i.sh - 1e-9) + 1;
  const lf = perRow * r.nails.reduce((a, n) => a + n.L, 0);
  const face = i.H * lengthFt;
  return {
    what: "soil nail wall",
    schedule: schedule([], []),
    quantities: {
      pile: { value: lf, basis: `${perRow} nails in each of ${i.rows} rows (${r.nails.map((n) => `${num(n.L, 1)} ft`).join(", ")}) over ${num(lengthFt, 1)} ft`, math: `${perRow}\\cdot\\left(${r.nails.map((n) => num(n.L, 2)).join("+")}\\right)\\mathrm{ft}`, ref: "Soil nails: nails per row × the rows' lengths" },
      wall: { value: face, basis: `${num(i.H, 2)} ft high by ${num(lengthFt, 1)} ft`, math: `${num(i.H, 2)}\\mathrm{ft}\\cdot ${num(lengthFt, 1)}\\mathrm{ft}`, ref: "Soil nail wall: the face's area" },
      facing: { value: face, basis: `${i.hi} in initial shotcrete facing over the face`, math: `${num(i.H, 2)}\\mathrm{ft}\\cdot ${num(lengthFt, 1)}\\mathrm{ft}`, ref: "Initial shotcrete facing: the face's area" },
    },
    views: soilNailViews(i),
    notes: [
      `${perRow * i.rows} nails, #${i.bar} Grade ${i.fy} in ${i.hole} in holes; verification and proof tests as GEC 7 Chapter 9 requires (CDOT BDM 11.5.15: at least two verification tests, more for varying strata or long walls).`,
      ...(i.permanent ? [`The ${i.hf} in final facing over ${num(face, 0)} SF, with headed studs at every nail head.`] : []),
    ],
    length: { label: "Wall length", value: lengthFt, unit: "ft" },
  };
}

const ok = (demand: string, capacity: string) => `\\operatorname{if}\\left(${demand}\\le ${capacity},\\text{OK},\\text{NG}\\right)=`;

export function soilNailCalcLines(i: SoilNailInputs, title: string, figures?: Figure[]): Line[] {
  const lines: Line[] = [];
  const text = (t: string, style?: "heading" | "subheading" | "note") => lines.push({ text: t, ...(style ? { style } : {}) });
  const m = (math: string, ref?: string, unit?: string) => lines.push({ math, ...(ref ? { ref } : {}), ...(unit ? { unit } : {}), ...(isInput(math) ? { color: INPUT_COLOR } : {}) });
  const r = designSoilNail(i);
  const f = r.facing;
  text(title.toUpperCase(), "heading");
  text(`A ${i.permanent ? "permanent" : "temporary"} soil nail wall, ${i.H} ft high, designed by FHWA GEC 7, Soil Nail Walls Reference Manual (FHWA-NHI-14-007, 2015), as CDOT's Bridge Design Manual 11.5.6 recommends; LRFD verifications with γ = γEV = 1.35 (GEC 7 6.6.1).`);
  text(COLOR_NOTE, "note");
  for (const fg of figures ?? []) lines.push({ region: fg });

  text("Overall stability (GEC 7 6.5)", "subheading");
  text(`Bishop's simplified method over circles through the toe; each nail crossing a circle pulls the sliding mass back with the least of its pullout behind the circle / 2.0, its tendon / 1.8 and its facing plus pullout in front / 1.5 (Table 5.1), its force acting along the nail; a tension crack to 2c/γ·tan(45° + φ/2) allowed. Minimum FS (Table 5.1): ${r.fsMin} for the final wall, ${r.fsStage} for the construction stages.`);
  m(`FS_{OS}\\coloneq ${num(r.internal.FS, 3)}`, "The critical circle, final stage");
  m(ok(`${r.fsMin}`, "FS_{OS}"), "Internal stability");
  for (const s of r.stages) text(`${s.name}: FS = ${num(s.FS, 3)}.`);
  m(`FS_{G}\\coloneq ${num(r.global.FS, 3)}`, "Circles behind all the nails and under the toe, nails disregarded (6.5.2)");
  m(ok(`${r.fsMin}`, "FS_{G}"), "Global stability");
  text(`Nail forces at the critical circle: ${r.internal.forces.map((x) => `row ${x.row} ${num(x.T, 2)} kip (${x.mode}, Lp ${num(x.Lp, 2)} ft)`).join("; ")}.`);

  text("Pullout and the tendon (GEC 7 6.6.2, 6.6.4)", "subheading");
  m(`T_{max}\\coloneq ${num(r.Tmax, 3)}\\mathrm{kip}`, `Row ${r.top.row}`);
  m(`q_{u}\\coloneq ${num(r.top.bond, 2)}\\mathrm{psi}`, "Nominal bond");
  m(`D_{DH}\\coloneq ${num(i.hole)}\\mathrm{in}`, "Drill hole");
  m(`L_{p}\\coloneq ${num(r.top.Lp, 3)}\\mathrm{ft}`, "Behind the critical circle");
  m("R_{PO}\\coloneq q_{u}\\cdot\\pi\\cdot D_{DH}\\cdot L_{p}=", "Nominal pullout", "kip");
  m(ok("1.35\\cdot T_{max}", "0.65\\cdot R_{PO}"), "Pullout, φPO = 0.65");
  m(`A_{t}\\coloneq ${num(NAIL_BARS[i.bar] ?? 0.6, 3)}\\mathrm{in}^{2}`, `#${i.bar} bar`);
  m(`f_{y}\\coloneq ${num(i.fy)}\\mathrm{ksi}`);
  m(ok("1.35\\cdot T_{max}", `${i.fy >= 95 ? "0.65" : "0.75"}\\cdot A_{t}\\cdot f_{y}`), "Tendon, φT (Table 6.3)");

  text("The facing (GEC 7 6.6.5 to 6.6.7)", "subheading");
  m(`S_{max}\\coloneq ${num(Math.max(i.sh, i.sv), 3)}\\mathrm{ft}`);
  m("T_{o}\\coloneq T_{max}\\cdot\\left(0.6+0.2\\cdot\\left(\\frac{S_{max}}{3.281\\mathrm{ft}}-1\\right)\\right)=", "The nail head force, Eq. 5.1 (Smax in m)", "kip");
  text(`Initial facing, ${i.hi} in shotcrete (f′c ${i.fcI} ksi): avn = ${num(f.initial.avn, 3)} in²/ft at the heads, avm = ${num(f.initial.avm, 3)} in²/ft between; m = a·fy·(h/2 − a·fy/(1.7·f′c·b)); RFF = CF·(mn + mm)·(8·SH/SV) with CF = ${num(f.initial.CF, 2)} (Table 6.5) = ${num(f.initial.RFF, 2)} kip. Punching: D′c = LBP + hi = ${num(f.initial.Dc, 2)} in, hc = ${num(f.initial.hc, 2)} in, VF = 0.58·√f′c·π·D′c·hc = ${num(f.initial.RFP, 2)} kip. ρ = ${num(f.initial.rho, 3)}% (${num(f.initial.rhoMin, 3)}% to ${num(f.initial.rhoMax, 3)}%).`);
  m(ok("1.35\\cdot T_{o}", `0.9\\cdot ${num(f.initial.RFF, 3)}\\mathrm{kip}`), "Initial facing, flexure (φFF 0.90)");
  m(ok("1.35\\cdot T_{o}", `0.9\\cdot ${num(f.initial.RFP, 3)}\\mathrm{kip}`), "Initial facing, punching (φFP 0.90)");
  if (f.final) {
    text(`Final facing, ${i.hf} in (f′c ${i.fcF} ksi), #${i.finalBar} @ ${i.finalSpacing} in each way (${num(f.final.a, 3)} in²/ft): RFF = ${num(f.final.RFF, 2)} kip (CF 1.0). Headed studs: hc = LS + tP − tH = ${num(f.final.hc, 3)} in, D′c = min(SSH + hc, 2·hc) = ${num(f.final.Dc, 3)} in, RFP = ${num(f.final.RFP, 2)} kip; RFH = NH·As·fy = ${num(f.final.RFH, 2)} kip.`);
    m(ok("1.35\\cdot T_{o}", `0.9\\cdot ${num(f.final.RFF, 3)}\\mathrm{kip}`), "Final facing, flexure");
    m(ok("1.35\\cdot T_{o}", `0.9\\cdot ${num(f.final.RFP, 3)}\\mathrm{kip}`), "Final facing, punching");
    m(ok("1.35\\cdot T_{o}", `${i.studA325 ? "0.8" : "0.7"}\\cdot ${num(f.final.RFH, 3)}\\mathrm{kip}`), `Headed studs (φFH ${i.studA325 ? "0.80 A325" : "0.70 A307"})`);
  }

  text("Sliding, heave and displacements", "subheading");
  const sl = r.sliding;
  text(`Sliding of the nailed block (Eqs. 5.17–5.23): width ${num(sl.BL, 2)} ft, thrust on ${num(sl.H1, 2)} ft with Ka = ${num(sl.Ka, 3)}: PA = ${num(sl.PA, 2)} kip/ft, surcharge ${num(sl.PQ, 2)} kip/ft; resistance c·BL + W·tan φ = ${num(sl.R, 2)} kip/ft.`);
  m(ok(`1.5\\cdot ${num(sl.PA + sl.PQ, 3)}\\frac{\\mathrm{kip}}{\\mathrm{ft}}`, `0.9\\cdot ${num(sl.R, 3)}\\frac{\\mathrm{kip}}{\\mathrm{ft}}`), "Sliding, φLS 0.90");
  if (r.heave) text(`Basal heave (Eq. 5.16): Nc = ${num(r.heave.Nc, 2)}, FS = ${num(r.heave.FS, 2)} against 2.0 (φBH 0.50).`);
  text(`Displacements (Eqs. 5.30, 5.31; Table 5.12): δh ≈ δv ≈ (δh/H)i·H = ${num(r.deflection.dh, 2)} in with (δh/H)i = 1/${Math.round(1 / r.deflection.ratio)}; the ground moves over DDEF = C·H·(1 − tan α) = ${num(r.deflection.DDEF, 1)} ft behind the wall (C = ${r.deflection.C}).`);
  if (r.quake) text(`Seismic (6.8): kh = ${num(r.quake.kh, 3)} in the stability analyses: internal FS ${num(r.quake.internal, 2)}, global FS ${num(r.quake.global, 2)}, against 1.1.`);
  lines.push(...checksSummary([{ checks: r.checks }]));
  return lines;
}
