import type { Line } from "@/lib/calcs/library/templates";
import { checksSummary } from "../checks-summary";
import { COLOR_NOTE, num } from "../calc-style";
import type { Figure } from "../figures";
import { schedule, type ConcreteItem } from "../rebar/schedule";
import type { DetailView, Takeoff } from "../takeoff/types";
import { designHeadwall, type HeadwallInputs } from "./headwall";

// A pipe headwall's drawings (after CDOT M-601-10 and M-601-12), take-off and calc package:
// - the elevation from the outlet: the wall with its pipe(s), the dimensions the standard tabulates;
// - the section through the wall on the pipe's centerline: M-601-12's tapered wall (12 in. top, T at the base, 18 in.
//   below the invert) or M-601-10's 12 in. wall with its two mats, the fill behind;
// - the outlet paving where it's used.

type Pt = [number, number];
const rect = (x0: number, y0: number, x1: number, y1: number): Pt[] => [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
const circle = (cx: number, cy: number, r: number, n = 40): Pt[] => Array.from({ length: n }, (_, k) => [cx + r * Math.cos((2 * Math.PI * k) / n), cy + r * Math.sin((2 * Math.PI * k) / n)] as Pt);
const n2 = (v: number, d = 2) => String(+v.toFixed(d));
const ftIn = (inches: number) => `${Math.floor(inches / 12 + 1e-9)}'-${n2(inches - 12 * Math.floor(inches / 12 + 1e-9), 1)}"`;

export function headwallViews(i: HeadwallInputs): DetailView[] {
  const r = designHeadwall(i);
  const views: DetailView[] = [];
  const wallT = i.rigid ? 2 : 0; // the pipe's wall, drawn for RCP (in., about)
  if (r.small) {
    const { H, W, T, B, L } = r.small;
    const el: DetailView = { title: `Elevation: ${i.pipes === 2 ? "double" : "single"} ${i.D} in. ${i.rigid ? "RCP" : "CMP"} headwall, CDOT M-601-12 (inches)`, polys: [], lines: [], dots: [], labels: [] };
    el.polys.push({ pts: rect(0, 0, L, H), style: "concrete" });
    const centers = i.pipes === 2 ? [W / 2, W / 2 + B] : [W / 2];
    for (const cx of centers) {
      el.polys.push({ pts: circle(cx, 18 + i.D / 2, i.D / 2 + wallT), style: "void" });
      el.lines.push({ pts: [...circle(cx, 18 + i.D / 2, i.D / 2), circle(cx, 18 + i.D / 2, i.D / 2)[0]], mark: "", kind: "secondary" });
    }
    el.lines.push({ pts: [[0, -6], [L, -6]], mark: "", kind: "secondary" });
    el.labels!.push({ x: L / 2, y: -14, text: `${i.pipes === 2 ? "L = W + B" : "W = 3D + 18 in."} = ${ftIn(L)}`, anchor: "middle" });
    el.lines.push({ pts: [[L + 6, 0], [L + 6, H]], mark: "", kind: "secondary" });
    el.labels!.push({ x: L + 10, y: H / 2, text: `H = D + 30 in. = ${ftIn(H)}`, anchor: "start" });
    el.labels!.push({ x: L + 64, y: H / 2, text: " ", anchor: "start" }); // room for the label
    el.labels!.push({ x: centers[0], y: 18 + i.D + wallT + 4, text: `${i.D} in.`, anchor: "middle" });
    el.labels!.push({ x: 0, y: -26, text: `18 in. below the invert, 12 in. over the pipe; ${i.pipes === 2 ? `pipes B = 1.5D (30 in. min) = ${n2(B)} in. on centers; ` : ""}Class B concrete; 3/4 in. chamfers`, anchor: "start" });
    views.push(el);
    const sc: DetailView = { title: "Section on the pipe's centerline (inches)", polys: [], lines: [], dots: [], labels: [] };
    const top = 12;
    sc.polys.push({ pts: [[0, 0], [T, 0], [top, H], [0, H]], style: "concrete" });
    sc.polys.push({ pts: [[T, 0], [T + 48, 0], [T + 48, H - 2], [top, H]], style: "earth" });
    sc.polys.push({ pts: rect(-24, -12, T + 48, 0), style: "earth" });
    sc.polys.push({ pts: rect(-2, 18, T + 48, 18 + i.D), style: "void" });
    sc.lines.push({ pts: [[-2, 18], [T + 48, 18]], mark: "", kind: "secondary" }, { pts: [[-2, 18 + i.D], [T + 48, 18 + i.D]], mark: "", kind: "secondary" });
    sc.lines.push({ pts: [[3, 4], [3, H - 3]], mark: "", kind: "main" });
    sc.labels!.push({ x: top / 2, y: H + 4, text: "12 in.", anchor: "middle" });
    sc.labels!.push({ x: T / 2, y: -20, text: `T = 0.4H = ${T} in.`, anchor: "middle" });
    sc.labels!.push({ x: T + 50, y: 18 + i.D / 2, text: "Pipe", anchor: "start" });
    sc.labels!.push({ x: T + 50, y: H - 6, text: "Fill", anchor: "start" });
    sc.labels!.push({ x: -24, y: -32, text: "Bars in a pattern like M-601-10 (#4 @ 12 in. each way, 2 in. clear, a hoop round the pipe)", anchor: "start" });
    views.push(sc);
  } else if (r.large) {
    const g = r.large;
    const X = i.pipes === 2 ? g.X1 : g.X;
    const over = i.rigid ? 20 : 16;
    const el: DetailView = { title: `Elevation: ${i.pipes === 2 ? "double" : "single"} ${i.D} in. ${i.rigid ? "rigid" : "flexible"} round pipe headwall, CDOT M-601-10 (inches)`, polys: [], lines: [], dots: [], labels: [] };
    el.polys.push({ pts: rect(0, 0, X, g.y), style: "concrete" });
    const outside = i.rigid ? (g.Bc ?? i.D) : i.D;
    const edge = i.rigid ? 0.75 * i.D + 12 : 24 + i.D / 2;
    const centers = i.pipes === 2 ? [edge, X - edge] : [X / 2];
    for (const cx of centers) {
      el.polys.push({ pts: circle(cx, 36 + i.D / 2, outside / 2), style: "void" });
      if (i.rigid) el.lines.push({ pts: [...circle(cx, 36 + i.D / 2, i.D / 2), circle(cx, 36 + i.D / 2, i.D / 2)[0]], mark: "", kind: "secondary" });
      el.lines.push({ pts: [...circle(cx, 36 + i.D / 2, outside / 2 + (i.rigid ? 3 : 4)), circle(cx, 36 + i.D / 2, outside / 2 + (i.rigid ? 3 : 4))[0]], mark: "", kind: "main" }); // bar 601
    }
    // the mats: verticals at 12 in. from A (A1), horizontals at 12 in. from B
    const a = i.pipes === 2 ? g.A1 : g.A;
    for (let x = a; x <= X - a + 1e-6; x += 12) el.lines.push({ pts: [[x, 2], [x, g.y - 2]], mark: "", kind: "secondary" });
    for (let y = g.B; y <= g.y - g.B + 1e-6; y += 12) el.lines.push({ pts: [[2, y], [X - 2, y]], mark: "", kind: "secondary" });
    el.lines.push({ pts: [[0, -6], [X, -6]], mark: "", kind: "secondary" });
    el.labels!.push({ x: X / 2, y: -14, text: `${i.pipes === 2 ? "X1" : "X"} = ${ftIn(X)}${r.skewF > 1.0001 ? ` square (x ${n2(r.skewF, 3)} skewed: ${ftIn(X * r.skewF)})` : ""}`, anchor: "middle" });
    el.lines.push({ pts: [[X + 6, 0], [X + 6, g.y]], mark: "", kind: "secondary" });
    el.labels!.push({ x: X + 10, y: g.y / 2, text: `y = ${ftIn(g.y)}`, anchor: "start" });
    el.labels!.push({ x: X + 40, y: g.y / 2, text: " ", anchor: "start" }); // room for the label
    el.labels!.push({ x: 0, y: -26, text: `${over} in. over the pipe, 36 in. below; bars at 12 in. centers, 2 in. clear, A ${n2(a, 1)} in., B ${n2(g.B, 1)} in.${i.pipes === 2 ? `; spacing ${n2(g.gap, 1)} in.` : ""}; Class B`, anchor: "start" });
    views.push(el);
    const sc: DetailView = { title: "Section through the wall (inches)", polys: [], lines: [], dots: [], labels: [] };
    sc.polys.push({ pts: rect(0, 0, 12, g.y), style: "concrete" });
    sc.polys.push({ pts: rect(12, 0, 60, g.y - 6), style: "earth" });
    sc.polys.push({ pts: rect(-24, -12, 60, 0), style: "earth" });
    sc.polys.push({ pts: rect(-2, 36, 60, 36 + outside), style: "void" });
    for (const x of [2.5, 9.5]) sc.lines.push({ pts: [[x, 2], [x, g.y - 2]], mark: "", kind: "main" });
    for (let y = g.B; y <= g.y - g.B + 1e-6; y += 12) sc.dots.push({ x: 3.25, y, d: 0.5, mark: "" }, { x: 8.75, y, d: 0.5, mark: "" });
    sc.labels!.push({ x: 6, y: g.y + 4, text: "12 in.", anchor: "middle" });
    sc.labels!.push({ x: 62, y: 36 + outside / 2, text: "Pipe", anchor: "start" });
    sc.labels!.push({ x: -24, y: -26, text: `Two mats, bars 401-404 tied in pairs; 601 round the pipe; wingwalls by M-601-20${i.apron ? "; apron per M-601-10" : ""}`, anchor: "start" });
    views.push(sc);
  }
  return views;
}

export function headwallTakeoff(i: HeadwallInputs): Takeoff {
  const r = designHeadwall(i);
  const n = i.count;
  const concrete: ConcreteItem[] = [{ label: `${n} headwall${n > 1 ? "s" : ""}`, cy: r.cy * n, basis: `${num(r.cy, 3)} CY each (${r.standard}${r.skewF > 1.0001 ? `, × ${num(r.skewF, 3)} for the skew` : ""})`, math: `${n}\\cdot ${num(r.cy, 3)}\\mathrm{yd}^{3}`, ref: `CDOT ${r.standard}'s table` }];
  const extra = r.lb > 0 ? [{ label: "Headwall bars (M-601-10's table)", weight: r.lb * n, basis: `${num(r.lb, 1)} lb each${i.apron ? ", with the apron's 0.89·X" : ""}`, math: `${n}\\cdot ${num(r.lb, 1)}\\mathrm{lb}` }] : [];
  return {
    what: "pipe headwall",
    schedule: schedule([], concrete, extra),
    quantities: r.pave > 0 ? { outlet: { value: r.pave, basis: `${i.paving === "riprap" ? "18 in. riprap" : `${i.D <= 30 ? 4 : 6} in. concrete slope and ditch paving`} at the outlet${i.pipes === 2 ? ", both pipes" : ""}`, math: `${num(r.pave, 2)}\\mathrm{yd}^{3}`, ref: "CDOT M-601-12, pipe outlet paving" } } : {},
    views: headwallViews(i),
    notes: [
      r.standard === "M-601-12" ? `The bars (about ${num(r.lbEstimate * n, 0)} lb in all) are paid with the concrete (M-601-12 note 6) unless the plans list them.` : "Wingwalls by M-601-20 where the plans call for them (the Cantilever Wingwall tool).",
      "Class B concrete; exposed corners chamfered 3/4 in.",
    ],
  };
}

export function headwallCalcLines(i: HeadwallInputs, title: string, figures?: Figure[]): Line[] {
  const lines: Line[] = [];
  const text = (t: string, style?: "heading" | "subheading" | "note") => lines.push({ text: t, ...(style ? { style } : {}) });
  const r = designHeadwall(i);
  text(title.toUpperCase(), "heading");
  text(`Concrete headwalls for a ${i.pipes === 2 ? "double" : "single"} ${i.D} in. ${i.rigid ? "rigid (RCP)" : "flexible (corrugated metal)"} pipe by CDOT's standard plan ${r.standard}${i.skew < 90 ? `, skewed ${i.skew}°` : ""}. A standard detail: its dimensions and quantities are the plan's.`);
  text(COLOR_NOTE, "note");
  for (const fg of figures ?? []) lines.push({ region: fg });
  if (r.small) {
    const s = r.small;
    text("Dimensions (M-601-12)", "subheading");
    text(`H = D + 30 in. = ${s.H} in.; W = 3D + 18 in. = ${s.W} in.; T = 0.4·H = ${s.T} in. (nearest in.); ${i.pipes === 2 ? `B = 1.5·D, at least 30 in. = ${num(s.B, 1)} in.; L = W + B = ${num(s.L, 1)} in.` : ""}`);
  } else if (r.large) {
    const g = r.large;
    text("Dimensions (M-601-10)", "subheading");
    text(`X = ${g.X} in., X1 = ${g.X1} in., y = ${g.y} in., A = ${g.A} in., A1 = ${g.A1} in., B = ${g.B} in.${g.Bc ? `, Bc = ${g.Bc} in.` : ""}; the wall 12 in.`);
  }
  text("Quantities", "subheading");
  text(`Concrete ${num(r.cy, 3)} CY a headwall${r.skewF > 1.0001 ? ` (the table's × cosec ${i.skew}° = ${num(r.skewF, 3)})` : ""}${r.lb > 0 ? `; steel ${num(r.lb, 1)} lb` : ""}; ${i.count} headwalls.${r.pave > 0 ? ` Outlet paving ${num(r.pave, 2)} CY.` : ""}`);
  lines.push(...checksSummary([{ checks: r.checks }]));
  return lines;
}
