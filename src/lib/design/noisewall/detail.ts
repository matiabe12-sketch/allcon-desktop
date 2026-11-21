import type { Line } from "@/lib/calcs/library/templates";
import { checksSummary } from "../checks-summary";
import { COLOR_NOTE, INPUT_COLOR, isInput, num } from "../calc-style";
import type { Figure } from "../figures";
import { schedule } from "../rebar/schedule";
import { ftT } from "../takeoff/tex";
import type { DetailView, Takeoff } from "../takeoff/types";
import { BARS } from "../walls/cip";
import { designNoiseWall, type NoiseWallInputs } from "./wall";

// A noise wall's drawings, take-off and calc package:
// - the elevation: two bays of stacked precast panels between W posts, the shafts below the ground;
// - the section through a post: the post on its shaft, the ground, the wind's line load at 0.55·H, the collision force
//   and the railing in front where it applies, the shaft's embedment and bars;
// - the plan at a post: the W shape with the panels seated between its flanges, the panel bars on both faces.

type Pt = [number, number];
const rect = (x0: number, y0: number, x1: number, y1: number): Pt[] => [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
const n2 = (v: number, d = 2) => String(+v.toFixed(d));
const ok = (demand: string, capacity: string) => `\\operatorname{if}\\left(${demand}\\le ${capacity},\\text{OK},\\text{NG}\\right)=`;

export function noiseWallViews(i: NoiseWallInputs): DetailView[] {
  const r = designNoiseWall(i);
  const p = r.post;
  const views: DetailView[] = [];
  const L = i.spacing;
  const D = i.shaftD / 12;
  const bf = p.bf / 12;

  // --- elevation (ft) ----------------------------------------------------------------------------------------------
  const el: DetailView = { title: `Elevation: ${n2(i.H)} ft wall, ${i.post} posts at ${n2(L)} ft on ${i.shaftD} in. shafts ${n2(i.shaftL)} ft deep`, polys: [], lines: [], dots: [], labels: [] };
  el.polys.push({ pts: rect(-3, -i.shaftL - 2, 2 * L + 3, 0), style: "earth" });
  for (let k = 0; k < 2; k++) {
    for (let y = 0; y < i.H - 1e-9; y += i.panelH) el.polys.push({ pts: rect(k * L + bf / 2, y, (k + 1) * L - bf / 2, Math.min(i.H, y + i.panelH)), style: "concrete" });
  }
  for (let k = 0; k <= 2; k++) {
    el.polys.push({ pts: rect(k * L - bf / 2, 0, k * L + bf / 2, i.H + 0.25), style: "concrete" });
    el.polys.push({ pts: rect(k * L - D / 2, -i.shaftL, k * L + D / 2, 0), style: "dashed" });
    el.lines.push({ pts: [[k * L, -i.shaftL + 0.5], [k * L, i.H]], mark: "", kind: "main" });
  }
  el.lines.push({ pts: [[0, i.H + 1], [L, i.H + 1]], mark: "", kind: "secondary" });
  el.labels!.push({ x: L / 2, y: i.H + 1.3, text: `${n2(L)} ft`, anchor: "middle" });
  el.lines.push({ pts: [[2 * L + 1.5, 0], [2 * L + 1.5, i.H]], mark: "", kind: "secondary" });
  el.labels!.push({ x: 2 * L + 2.2, y: i.H / 2, text: `H ${n2(i.H)} ft`, anchor: "start" });
  el.lines.push({ pts: [[2 * L + 1.5, 0], [2 * L + 1.5, -i.shaftL]], mark: "", kind: "secondary" });
  el.labels!.push({ x: 2 * L + 2.2, y: -i.shaftL / 2, text: `Shaft ${n2(i.shaftL)} ft`, anchor: "start" });
  el.labels!.push({ x: L * 1.5, y: i.panelH / 2 - 0.3, text: `Precast panels ${i.tp} in. x ${n2(i.panelH)} ft`, anchor: "middle" });
  el.labels!.push({ x: -3, y: -i.shaftL - 3, text: `Panels: #${i.bar} @ ${i.barSpacing} in. horizontal, each face (two mats, C15.8.4), f'c ${i.fc} ksi; posts ${i.post} Fy ${i.Fy} ksi; shafts ${i.shaftBars} #${i.shaftBar}, f'c ${i.shaftFc} ksi`, anchor: "start" });
  views.push(el);

  // --- section through a post (ft) ----------------------------------------------------------------------------------
  const sc: DetailView = { title: "Section at a post: loads and the shaft", polys: [], lines: [], dots: [], labels: [] };
  const w = Math.max(10, i.H * 0.6);
  sc.polys.push({ pts: rect(-w, -i.shaftL - 2, w, 0), style: "earth" });
  sc.polys.push({ pts: rect(-D / 2, -i.shaftL, D / 2, 0), style: "concrete" });
  sc.polys.push({ pts: rect(-p.d / 24, 0, p.d / 24, i.H), style: "concrete" });
  const ringFt = r.shaft.ring / 12;
  for (const x of [-ringFt / 2, ringFt / 2]) sc.lines.push({ pts: [[x, -i.shaftL + 0.25], [x, -0.25]], mark: "", kind: "main" });
  sc.lines.push({ pts: [[-p.d / 24, -i.shaftL + 0.5], [-p.d / 24, 0]], mark: "", kind: "secondary" }, { pts: [[p.d / 24, -i.shaftL + 0.5], [p.d / 24, 0]], mark: "", kind: "secondary" });
  // The wind's line load at 0.55H, from the road side.
  const ya = r.wind.arm;
  sc.lines.push({ pts: [[-w + 1, ya], [-p.d / 24 - 0.2, ya]], mark: "", kind: "main" });
  sc.lines.push({ pts: [[-p.d / 24 - 0.8, ya + 0.4], [-p.d / 24 - 0.2, ya], [-p.d / 24 - 0.8, ya - 0.4]], mark: "", kind: "main" });
  sc.labels!.push({ x: -w + 1, y: ya + 0.5, text: `Wind ${n2(r.wind.Fw, 1)} kip`, anchor: "start" });
  if (r.col) {
    const xr = -Math.max(1, i.setback) - 1.5;
    sc.polys.push({ pts: [[xr - 1.5, 0], [xr, 0], [xr - 0.3, 2.67], [xr - 1.2, 2.67]], style: "concrete" });
    sc.lines.push({ pts: [[xr - 3, r.col.h], [-p.d / 24 - 0.2, r.col.h]], mark: "", kind: "main" });
    sc.labels!.push({ x: xr - 3, y: r.col.h + 0.5, text: `Collision ${n2(r.col.F, 1)} kip`, anchor: "start" });
    sc.labels!.push({ x: xr - 0.75, y: -0.8, text: `Railing, setback ${n2(i.setback)} ft`, anchor: "middle" });
  }
  const gov = r.shaft.cases.reduce((a, c) => (c.b.L > a.b.L ? c : a));
  sc.lines.push({ pts: [[D / 2 + 0.5, 0], [D / 2 + 0.5, -gov.b.L]], mark: "", kind: "secondary" });
  sc.labels!.push({ x: D / 2 + 0.8, y: -gov.b.L / 2, text: `Needed ${n2(gov.b.L)} ft (${gov.name.split(" (")[0]})`, anchor: "start" });
  sc.labels!.push({ x: w - 0.3, y: 0.3, text: "Ground", anchor: "end" });
  sc.labels!.push({ x: -w, y: -i.shaftL - 3, text: `Wind Pz ${n2(r.wind.Pz * 1000, 1)} psf at 0.55H${r.col ? `; collision at ${n2(r.col.h, 1)} ft (Case ${r.col.case})` : ""}; ${i.soil === "cohesive" ? `clay, su ${i.c} ksf` : `sand, phi ${i.phi} deg, ${i.gamma} pcf`}; Broms with phi 0.75 on the passive resistance (1.0 at the extreme events)`, anchor: "start" });
  views.push(sc);

  // --- plan at a post (in) ------------------------------------------------------------------------------------------
  const pl: DetailView = { title: `Plan at a post: ${i.post} with the panels seated between its flanges (inches)`, polys: [], lines: [], dots: [], labels: [] };
  const hd = p.d / 2;
  const hb = p.bf / 2;
  // the W shape: flanges at y = ±(d/2 − tf/2), the web along y
  pl.polys.push({ pts: rect(-hb, hd - p.tf, hb, hd), style: "concrete" });
  pl.polys.push({ pts: rect(-hb, -hd, hb, -hd + p.tf), style: "concrete" });
  pl.polys.push({ pts: rect(-p.tw / 2, -hd + p.tf, p.tw / 2, hd - p.tf), style: "concrete" });
  const t = i.tp;
  for (const s of [-1, 1]) {
    const x0 = s * (p.tw / 2 + 0.5);
    const x1 = s * 30;
    pl.polys.push({ pts: rect(Math.min(x0, x1), -t / 2, Math.max(x0, x1), t / 2), style: "concrete" });
    const c = i.cover + BARS[i.bar].dia / 2;
    for (const y of [-t / 2 + c, t / 2 - c]) pl.lines.push({ pts: [[x0 + s * 1.5, y], [x1, y]], mark: "", kind: "main" });
  }
  pl.labels!.push({ x: 0, y: hd + 1.5, text: `${i.post}: d ${p.d} in., bf ${p.bf} in.`, anchor: "middle" });
  pl.labels!.push({ x: 30, y: t / 2 + 1, text: `Panel ${t} in., #${i.bar} @ ${i.barSpacing} in. each face, ${i.cover} in. cover`, anchor: "end" });
  pl.labels!.push({ x: -30, y: -hd - 2.5, text: `Clear between the flanges ${n2(p.d - 2 * p.tf)} in. for a ${t} in. panel; neoprene bearing strips on the flanges`, anchor: "start" });
  views.push(pl);
  return views;
}

/** The take-off over the wall's length: its face (SF), the shafts (LF) by diameter. */
export function noiseWallTakeoff(i: NoiseWallInputs, lengthFt = 200): Takeoff {
  const posts = Math.ceil(lengthFt / i.spacing - 1e-9) + 1;
  const area = i.H * lengthFt;
  return {
    what: "noise wall",
    schedule: schedule([], []),
    quantities: {
      wall: { value: area, basis: `${num(i.H, 2)} ft high by ${num(lengthFt, 1)} ft`, math: `${ftT(i.H)}\\cdot ${ftT(lengthFt)}`, ref: "Noise wall: its face" },
      shaft: { value: posts * i.shaftL, basis: `${posts} shafts, ${i.shaftD} in., ${num(i.shaftL, 2)} ft each`, math: `${posts}\\cdot ${ftT(i.shaftL)}`, ref: "Drilled shafts: count × length" },
    },
    views: noiseWallViews(i),
    notes: [
      `${posts} posts ${i.post} at ${num(i.spacing, 2)} ft, set in the shafts; the panels, posts and hardware paid with the wall (SF), the shafts' bars with the shafts (CDOT 503.07).`,
      "Wind from either side; where the ground differs in front and behind, check both directions (C3.11.5.10).",
    ],
    length: { label: "Wall length", value: lengthFt, unit: "ft" },
  };
}

export function noiseWallCalcLines(i: NoiseWallInputs, title: string, figures?: Figure[]): Line[] {
  const lines: Line[] = [];
  const text = (t: string, style?: "heading" | "subheading" | "note") => lines.push({ text: t, ...(style ? { style } : {}) });
  const m = (math: string, ref?: string, unit?: string) => lines.push({ math, ...(ref ? { ref } : {}), ...(unit ? { unit } : {}), ...(isInput(math) ? { color: INPUT_COLOR } : {}) });
  const r = designNoiseWall(i);
  text(title.toUpperCase(), "heading");
  text(`A ground-mounted noise wall ${i.H} ft high: ${i.tp} in. precast concrete panels between ${i.post} posts at ${i.spacing} ft, on ${i.shaftD} in. drilled shafts ${i.shaftL} ft deep, by AASHTO LRFD Section 15 and CDOT BDM Section 15.`);
  text(COLOR_NOTE, "note");
  for (const fg of figures ?? []) lines.push({ region: fg });

  text("Wind (15.8.2, 3.8.1)", "subheading");
  m(`V\\coloneq ${num(i.V)}\\mathrm{mph}`, "3-second gust, Figure 3.8.1.1.2-1 (BDM Section 32 in the special wind region)");
  m(`K_{z}\\coloneq ${num(r.wind.Kz, 3)}`, `Exposure ${i.exposure}, Z = max(H, 33 ft), Eq. 3.8.1.2.1-${i.exposure === "B" ? 2 : i.exposure === "C" ? 3 : 4}`);
  m("P_{z}\\coloneq 2.56\\cdot 10^{-6}\\cdot V^{2}\\cdot K_{z}\\cdot 0.85\\cdot 1.2=", "Eq. 3.8.1.2.1-1, G 0.85, CD 1.2 (ksf)");
  m(`F_{w}\\coloneq P_{z}\\cdot ${num(i.H, 3)}\\mathrm{ft}\\cdot ${num(i.spacing, 3)}\\mathrm{ft}=`, "On a post, at 0.55·H (3.8.1.2.4)", "kip");
  if (r.col) text(`Collision (15.8.4): setback ${i.setback} ft behind a TL-${i.testLevel} railing, Case ${r.col.case}: ${num(r.col.F, 2)} kip at ${num(r.col.h, 2)} ft above the pavement over Lt = ${r.col.Lt} ft (Table A13.2-1), Extreme Event II.`);
  else text(`Collision (15.8.4; BDM 15.4): not applied${i.collision ? ` (setback ${i.setback} ft, over 4 ft: Case 4)` : " (outside the clear zone or behind a crash-tested system)"}.`);
  if (r.eq) text(`Earthquake (15.9.9): kh ${i.kh} × (panels ${num(r.weights.panelWt, 2)} + post ${num(r.weights.postWt, 2)} kip) = ${num(r.eq.F, 2)} kip at mid-height, Extreme Event I.`);

  text("Panels (Section 5)", "subheading");
  const pn = r.panel;
  m(`A_{s}\\coloneq ${num(pn.As, 3)}\\frac{\\mathrm{in}^{2}}{\\mathrm{ft}}`, `#${i.bar} @ ${i.barSpacing} in., each face`);
  m(`d\\coloneq ${num(pn.d, 3)}\\mathrm{in}`);
  m(`M_{u}\\coloneq\\frac{${num(r.wind.Pz, 4)}\\cdot ${num(pn.Lc, 3)}^{2}}{8}=`, "The span between the flanges' middles, kip·ft/ft");
  m(`\\phi M_{n}\\coloneq 0.9\\cdot ${num(pn.Mn, 3)}=`, "kip·ft/ft");
  m(ok("M_{u}", "\\phi M_{n}"), "Flexure");
  if (pn.col) m(ok(`${num(pn.col.Mu, 2)}`, `${num(pn.col.Mn, 2)}`), `A ${i.panelH} ft panel under the collision force, F(L/4 − Lt/8), φ 1.0 (kip·ft)`);

  text("Posts (Section 6)", "subheading");
  m(`M_{p}\\coloneq ${num(i.Fy)}\\mathrm{ksi}\\cdot ${num(r.post.Zx, 1)}\\mathrm{in}^{3}=`, "The panels brace the compression flange", "kip·ft");
  m(`M_{u}\\coloneq F_{w}\\cdot 0.55\\cdot ${num(i.H, 3)}\\mathrm{ft}=`, "Strength III at the ground", "kip·ft");
  m(ok("M_{u}", "0.9\\cdot M_{p}"), "Flexure");

  text("Shafts (15.9; 11.8.4; 3.11.5.10)", "subheading");
  text(`A single row of shafts, free-headed, by Broms' method in ${i.soil === "cohesive" ? `clay (su ${i.c} ksf)` : `sand (φ ${i.phi}°, ${i.gamma} pcf)`}, with the resistance factor 0.75 on the passive resistance (Table 11.5.7-1) applied to the soil's strength, 1.0 at the extreme events. Flexure by strain compatibility (5.6.3), ${i.shaftBars} #${i.shaftBar}; shear β = 2.`);
  for (const s of r.shaft.cases) text(`${s.name}: M ${num(s.M, 2)} kip·ft, V ${num(s.V, 2)} kip at the ground; embedment needed ${num(s.b.L, 2)} ft against ${i.shaftL} ft; largest moment in the shaft ${num(s.b.Mu, 2)} kip·ft against φMn ${num((s.ee ? 1 : 0.9) * r.shaft.MnS, 2)}.`);
  text(`Service I: the post's top moves ${num(r.defl, 3)} in. under 70 mph wind (the post fixed at the ground), against H/${i.deflRatio} = ${num((i.H * 12) / i.deflRatio, 2)} in.`);
  lines.push(...checksSummary([{ checks: r.checks }]));
  return lines;
}
