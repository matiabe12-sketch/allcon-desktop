import type { Line } from "@/lib/calcs/library/templates";
import { checksSummary } from "../checks-summary";
import { COLOR_NOTE, INPUT_COLOR, isInput, num } from "../calc-style";
import type { Figure } from "../figures";
import { schedule } from "../rebar/schedule";
import type { DetailView, Takeoff } from "../takeoff/types";
import { BARS } from "../walls/cip";
import { designHighMast, type HighMastInputs } from "./highmast";

// A high-mast tower's foundation: the elevation (the tower, its luminaire ring, the loads at the base, the caisson and
// Broms' embedment), the caisson's plan (bars, spiral, the anchor bolt circle), its take-off and calc package.

type Pt = [number, number];
const rect = (x0: number, y0: number, x1: number, y1: number): Pt[] => [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
const circle = (cx: number, cy: number, r: number, n = 48): Pt[] => Array.from({ length: n }, (_, k) => [cx + r * Math.cos((2 * Math.PI * k) / n), cy + r * Math.sin((2 * Math.PI * k) / n)] as Pt);
const n2 = (v: number, d = 2) => String(+v.toFixed(d));

export function highMastViews(i: HighMastInputs): DetailView[] {
  const r = designHighMast(i);
  const views: DetailView[] = [];
  const D = i.shaftD / 12;
  const H = i.fromSupplier ? Math.max(i.H, 60) : i.H;
  const el: DetailView = { title: `Elevation: ${n2(H, 0)} ft high-mast tower on a ${i.shaftD} in. caisson ${n2(i.shaftLength)} ft deep`, polys: [], lines: [], dots: [], labels: [] };
  const w = Math.max(12, H * 0.25);
  el.polys.push({ pts: rect(-w, -i.shaftLength - 3, w, 0), style: "earth" });
  el.polys.push({ pts: rect(-D / 2, -i.shaftLength, D / 2, 0.5), style: "concrete" });
  const b = i.dBase / 24;
  const t = i.dTop / 24;
  el.polys.push({ pts: [[-b, 0.5], [b, 0.5], [t, H], [-t, H]], style: "concrete" });
  el.lines.push({ pts: [[-3, H], [3, H]], mark: "", kind: "main" });
  for (const x of [-3, -1.5, 1.5, 3]) el.dots.push({ x, y: H - 0.6, d: 0.8, mark: "" });
  el.labels!.push({ x: 3.5, y: H + 0.5, text: `${i.luminaires} luminaires on the ring`, anchor: "start" });
  const ring = (D / 2) * 0.8;
  for (const x of [-ring, ring]) el.lines.push({ pts: [[x, -i.shaftLength + 0.5], [x, 0]], mark: "", kind: "main" });
  el.lines.push({ pts: [[D / 2 + 1, 0], [D / 2 + 1, -r.broms.L]], mark: "", kind: "secondary" });
  el.labels!.push({ x: D / 2 + 1.5, y: -r.broms.L / 2, text: `Broms needs ${n2(r.broms.L)} ft`, anchor: "start" });
  el.labels!.push({ x: -w, y: -i.shaftLength - 3 - 0.06 * H, text: `At the base (unfactored): P ${n2(r.base.P, 1)} kip, M ${n2(r.base.M, 0)} kip-ft, V ${n2(r.base.V, 1)} kip${r.base.T > 0 ? `, T ${n2(r.base.T, 0)} kip-ft` : ""} (${i.fromSupplier ? "the supplier's" : `estimated at ${i.wind} mph`})`, anchor: "start" });
  el.labels!.push({ x: -w, y: -i.shaftLength - 3 - 0.12 * H, text: `${i.soil === "cohesive" ? `Clay, su ${i.c} psf` : `Sand, phi ${i.phi} deg, ${i.gamma} pcf`}; caisson ${i.bars} #${i.bar}, #${i.spiral} spiral @ ${i.pitch} in., f'c ${i.fc} ksi`, anchor: "start" });
  views.push(el);

  const pl: DetailView = { title: "Caisson plan at the top (inches)", polys: [], lines: [], dots: [], labels: [] };
  const R = i.shaftD / 2;
  pl.polys.push({ pts: circle(0, 0, R), style: "concrete" });
  const rs = R - i.cover - BARS[i.spiral].dia / 2;
  pl.lines.push({ pts: [...circle(0, 0, rs), circle(0, 0, rs)[0]], mark: "", kind: "stirrup" });
  const rb = rs - BARS[i.spiral].dia / 2 - BARS[i.bar].dia / 2;
  for (let k = 0; k < i.bars; k++) pl.dots.push({ x: rb * Math.cos((2 * Math.PI * k) / i.bars), y: rb * Math.sin((2 * Math.PI * k) / i.bars), d: BARS[i.bar].dia, mark: "" });
  pl.lines.push({ pts: [...circle(0, 0, i.boltCircle / 2), circle(0, 0, i.boltCircle / 2)[0]], mark: "", kind: "secondary" });
  for (let k = 0; k < 8; k++) pl.dots.push({ x: (i.boltCircle / 2) * Math.cos((2 * Math.PI * k) / 8 + Math.PI / 8), y: (i.boltCircle / 2) * Math.sin((2 * Math.PI * k) / 8 + Math.PI / 8), d: 1.75, mark: "" });
  pl.labels!.push({ x: 0, y: R + 3, text: `${i.shaftD} in. caisson, ${i.cover} in. cover`, anchor: "middle" });
  pl.labels!.push({ x: 0, y: -R - 5, text: `${i.bars} #${i.bar} in a #${i.spiral} spiral @ ${i.pitch} in.; anchor bolts on a ${i.boltCircle} in. circle (the supplier's template)`, anchor: "middle" });
  views.push(pl);
  return views;
}

export function highMastTakeoff(i: HighMastInputs): Takeoff {
  const cy = (Math.PI * (i.shaftD / 24) ** 2 * i.shaftLength) / 27;
  return {
    what: "high-mast foundation",
    schedule: schedule([], []),
    quantities: { foundation: { value: 1, basis: `one ${i.shaftD} in. caisson, ${num(i.shaftLength, 2)} ft deep`, math: "1", ref: "High mast foundation, each" } },
    views: highMastViews(i),
    notes: [`The caisson: ${num(cy, 2)} CY of concrete and ${i.bars} #${i.bar} bars with a #${i.spiral} spiral, paid with the foundation (613).`, "The tower, its anchor bolts and template are the supplier's."],
  };
}

export function highMastCalcLines(i: HighMastInputs, title: string, figures?: Figure[]): Line[] {
  const lines: Line[] = [];
  const text = (t: string, style?: "heading" | "subheading" | "note") => lines.push({ text: t, ...(style ? { style } : {}) });
  const m = (math: string, ref?: string, unit?: string) => lines.push({ math, ...(ref ? { ref } : {}), ...(unit ? { unit } : {}), ...(isInput(math) ? { color: INPUT_COLOR } : {}) });
  const r = designHighMast(i);
  text(title.toUpperCase(), "heading");
  text(`The drilled shaft under a high-mast lighting tower (CDOT D-613-2, the foundation on the plans), by AASHTO LRFD-LTS-1 13.6 and AASHTO LRFD Sections 5 and 10.`);
  text(COLOR_NOTE, "note");
  for (const fg of figures ?? []) lines.push({ region: fg });
  text("Loads at the base (LTS 3.5, 3.8)", "subheading");
  if (i.fromSupplier) text(`From the tower's supplier (unfactored, Extreme I wind): P ${num(r.base.P, 2)} kip, M ${num(r.base.M, 1)} kip·ft, V ${num(r.base.V, 2)} kip, T ${num(r.base.T, 1)} kip·ft.`);
  else {
    text(`Estimated from the tower: a ${i.H} ft tube tapering ${i.dBase} to ${i.dTop} in. (${i.wall} in. wall) in 40 pieces, P = 0.00256·Kz·Kd·G·V²·Cd (LTS Eq. 3.8.1-1), V ${i.wind} mph, Kd ${i.Kd}, G ${i.G}, Kz by height, Cd by Cv·V·d (Table 3.8.7-1); the ring and ${i.luminaires} luminaires (${i.epa} ft² EPA each, the ring ${i.ringEpa} ft²) at the top.`);
    m(`q_{top}\\coloneq ${num(r.est.qTop * 1000, 2)}\\mathrm{psf}`, "Without Cd, at the top");
    text(`Wind: the tube ${num(r.est.F - r.est.Fl, 2)} kip, the luminaires and ring ${num(r.est.Fl, 2)} kip; V = ${num(r.base.V, 2)} kip, M = ${num(r.base.M, 1)} kip·ft; dead load ${num(r.base.P, 2)} kip.`);
  }
  text("Embedment (LTS 13.6.1.1)", "subheading");
  text(`Broms, ${i.soil === "cohesive" ? `cohesive (su ${i.c} psf)` : `cohesionless (φ ${i.phi}°, ${i.gamma} pcf, Kp ${num(r.broms.Kp, 3)})`}, Extreme I (1.0 W), the soil's strength × φ ${i.phiLateral}: L = ${num(r.broms.L, 2)} ft against ${i.shaftLength} ft; the largest moment in the shaft ${num(r.broms.Mu, 1)} kip·ft.`);
  text("The shaft (LTS 13.6.2; AASHTO 5.6, 5.7, 10.8.3.5)", "subheading");
  text(`${i.shaftD} in., ${i.bars} #${i.bar}, #${i.spiral} spiral at ${i.pitch} in., f′c ${i.fc} ksi: axial load and bending at Broms' largest moment, shear, the ties' least area and spacing, torsion.`);
  lines.push(...checksSummary([{ checks: r.checks }]));
  return lines;
}
