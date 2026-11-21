import type { Line } from "@/lib/calcs/library/templates";
import { checksSummary } from "../checks-summary";
import { COLOR_NOTE, INPUT_COLOR, isInput, num } from "../calc-style";
import type { Figure } from "../figures";
import { schedule } from "../rebar/schedule";
import type { DetailView, Takeoff } from "../takeoff/types";
import { CHANNELS, PILE_SECTIONS, SHEET_SECTIONS, STRAND } from "./sections";
import { designShoring, heqParallel, type ShoringInputs } from "./wall";

// A soldier pile or sheet pile wall's typical section and plan (after the layout of DOT standard soldier pile / tieback
// wall sheets: the pile and its embedment, lagging behind the flanges, the anchors at their angle with the unbonded and
// bond lengths and the critical surface at 45° + φ/2), its take-off and its calc package.

type Pt = [number, number];
const rect = (x0: number, y0: number, x1: number, y1: number): Pt[] => [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
const band = (x0: number, y0: number, x1: number, y1: number, w: number): Pt[] => {
  const L = Math.hypot(x1 - x0, y1 - y0) || 1;
  const nx = (-(y1 - y0) / L) * (w / 2);
  const ny = ((x1 - x0) / L) * (w / 2);
  return [[x0 + nx, y0 + ny], [x1 + nx, y1 + ny], [x1 - nx, y1 - ny], [x0 - nx, y0 - ny]];
};
const circle = (cx: number, cy: number, r: number, n = 28): Pt[] => Array.from({ length: n }, (_, k) => [cx + r * Math.cos((2 * Math.PI * k) / n), cy + r * Math.sin((2 * Math.PI * k) / n)] as Pt);

/** The typical section (ft; the top of the wall at 0, the retained side to the right) and the plan. */
export function shoringViews(i: ShoringInputs): DetailView[] {
  const r = designShoring(i);
  const L = i.H + i.D;
  const phi = i.layers[0].phi || 30;
  const reach = Math.max(i.H * 1.2, ...(i.support === "anchored" ? i.anchors.map((a) => (a.unbondedLength + a.bondLength) * Math.cos((a.angle * Math.PI) / 180) + 2) : [0]));
  const v: DetailView = { title: `Typical section: ${i.wall === "soldier" ? `${i.section} soldier piles at ${num(i.spacing, 2)} ft` : `${i.sheet} sheet piles`}, ${i.support === "anchored" ? `${i.anchors.length} tier${i.anchors.length === 1 ? "" : "s"} of anchors` : "cantilever"}`, polys: [], lines: [], dots: [], labels: [] };
  const tb = Math.tan(((Math.min(i.backslope, 60)) * Math.PI) / 180);
  v.polys.push({ pts: [[0, -L - 2], [reach, -L - 2], [reach, Math.min(reach * tb, 3 * i.H)], [0, 0]], style: "earth" });
  if (i.backslope > 0) v.labels!.push({ x: reach * 0.6, y: Math.min(reach * 0.6 * tb, 3 * i.H) + 0.8, text: `Backslope ${num(i.backslope, 1)}°`, anchor: "middle" });
  v.polys.push({ pts: rect(-Math.max(6, i.H * 0.5), -L - 2, 0, -i.H), style: "earth" });
  const d = i.wall === "soldier" ? PILE_SECTIONS[i.section].d / 12 : SHEET_SECTIONS[i.sheet].depth / 12;
  if (i.wall === "soldier" && i.drilled) v.polys.push({ pts: rect(-i.holeDia / 24, -L, i.holeDia / 24, -i.H), style: "concrete" });
  v.polys.push({ pts: rect(-d / 2, -L, d / 2, 0.5), style: "void" });
  if (i.wall === "soldier") v.polys.push({ pts: rect(d / 2, -i.H, d / 2 + i.laggingT / 12, 0), style: "dashed" });
  // The critical surface from the excavation's corner at 45° + φ/2 (GEC 4 5.3.2).
  const t = Math.tan(((45 - phi / 2) * Math.PI) / 180);
  v.lines.push({ pts: [[0, -i.H], [i.H * t, 0]], mark: "", kind: "secondary" });
  v.labels!.push({ x: i.H * t + 0.5, y: 0.8, text: `45° + φ/2`, anchor: "start" });
  if (i.support === "anchored") {
    [...i.anchors].sort((a, b) => a.depth - b.depth).forEach((a, k) => {
      const c = Math.cos((a.angle * Math.PI) / 180);
      const s = Math.sin((a.angle * Math.PI) / 180);
      const x1 = a.unbondedLength * c;
      const y1 = -a.depth - a.unbondedLength * s;
      const x2 = (a.unbondedLength + a.bondLength) * c;
      const y2 = -a.depth - (a.unbondedLength + a.bondLength) * s;
      v.lines.push({ pts: [[d / 2, -a.depth], [x1, y1]], mark: "", kind: "main" });
      if (i.wall === "sheet" && CHANNELS[i.wale]) {
        const cw = CHANNELS[i.wale];
        v.polys.push({ pts: rect(-d / 2 - (2 * cw.bf) / 12, -a.depth - cw.d / 24, -d / 2, -a.depth + cw.d / 24), style: "void" });
      }
      v.polys.push({ pts: band(x1, y1, x2, y2, Math.max(0.5, i.holeDiaAnchor / 12)), style: "concrete" });
      const row = r.anch?.rows[k];
      v.labels!.push({ x: x2 + 0.5, y: y2, text: `Anchor ${k + 1} at ${num(a.depth, 2)} ft, ${a.angle}°: Lu ${num(a.unbondedLength, 1)} + Lb ${num(a.bondLength, 1)} ft${row ? `, T = ${num(row.T, 1)} kip` : ""}`, anchor: "start" });
    });
  }
  v.labels!.push({ x: -0.5, y: -i.H / 2, text: `H = ${num(i.H, 2)} ft`, anchor: "end" });
  v.labels!.push({ x: -0.5, y: -i.H - i.D / 2, text: `D = ${num(i.D, 2)} ft`, anchor: "end" });
  // The critical slip circle (overall stability), from where it enters the ground to where it leaves it.
  if (Number.isFinite(r.stability.FS) && r.stability.R > 0) {
    const { xc, yc, R } = r.stability;
    const ground = (x: number) => (x < 0 ? -i.H : Math.min(x * tb, 3 * i.H));
    const pts: [number, number][] = [];
    for (let k = 0; k <= 60; k++) {
      const x = xc - R + (2 * R * k) / 60;
      const yb = yc - Math.sqrt(Math.max(0, R * R - (x - xc) ** 2));
      if (yb < ground(x)) pts.push([x, yb]);
    }
    if (pts.length > 1) {
      v.lines.push({ pts, mark: "", kind: "secondary" });
      v.labels!.push({ x: pts[Math.floor(pts.length / 2)][0], y: pts[Math.floor(pts.length / 2)][1] - 1, text: `Critical circle, FS = ${num(r.stability.FS, 2)}`, anchor: "middle" });
    }
  }
  if (i.water !== null) v.labels!.push({ x: reach - 0.5, y: -i.water, text: "▽ water", anchor: "end" });
  const views = [v];

  // The plan: three piles, the lagging behind their flanges (or the Z sheets).
  const p: DetailView = { title: "Plan", polys: [], lines: [], dots: [], labels: [] };
  if (i.wall === "soldier") {
    const s = PILE_SECTIONS[i.section];
    const bf = s.bf / 12;
    const dd = s.d / 12;
    const tf = s.tf / 12;
    const tw = s.tw / 12;
    p.polys.push({ pts: rect(-1, dd / 2 + i.laggingT / 12, 2 * i.spacing + 1, dd / 2 + i.laggingT / 12 + 2), style: "earth" });
    for (let k = 0; k < 3; k++) {
      const x = k * i.spacing;
      if (i.drilled) p.polys.push({ pts: circle(x, 0, i.holeDia / 24), style: "concrete" });
      p.polys.push({ pts: rect(x - bf / 2, dd / 2 - tf, x + bf / 2, dd / 2), style: "void" });
      p.polys.push({ pts: rect(x - bf / 2, -dd / 2, x + bf / 2, -dd / 2 + tf), style: "void" });
      p.polys.push({ pts: rect(x - tw / 2, -dd / 2 + tf, x + tw / 2, dd / 2 - tf), style: "void" });
      if (k < 2) p.polys.push({ pts: rect(x + bf / 2 - 0.15, dd / 2, x + i.spacing - bf / 2 + 0.15, dd / 2 + i.laggingT / 12), style: "dashed" });
    }
    p.labels!.push({ x: i.spacing / 2, y: dd / 2 + i.laggingT / 12 + 0.5, text: `${i.lagging === "timber" ? `${i.laggingT} in timber lagging` : i.lagging === "cip" ? `${i.precastT} in cast-in-place facing` : "Precast lagging"} behind the flanges`, anchor: "middle" });
    p.labels!.push({ x: i.spacing, y: -dd / 2 - 1.2, text: `${i.section} at ${num(i.spacing, 2)} ft${i.drilled ? `, ${i.holeDia} in drilled holes` : ""}`, anchor: "middle" });
  } else {
    const s = SHEET_SECTIONS[i.sheet];
    const w = s.width / 12;
    const h = s.depth / 12;
    const pts: Pt[] = [];
    for (let k = 0; k < 3; k++) {
      const x = k * w;
      pts.push([x, -h / 2], [x + 0.3 * w, -h / 2], [x + 0.5 * w, h / 2], [x + 0.8 * w, h / 2]);
    }
    for (let k = 0; k < pts.length - 1; k++) p.polys.push({ pts: band(pts[k][0], pts[k][1], pts[k + 1][0], pts[k + 1][1], Math.max(0.04, s.t / 12)), style: "void" });
    p.polys.push({ pts: rect(-0.2, h / 2 + 0.05, 3 * w, h / 2 + 1.5), style: "earth" });
    p.labels!.push({ x: 1.5 * w, y: -h / 2 - 0.6, text: `${i.sheet}: ${s.width} in wide, ${s.depth} in deep, S = ${s.S} in³/ft`, anchor: "middle" });
  }
  views.push(p);
  return views;
}

/** The take-off for a length of wall: the piles (or sheets), the lagging, the anchors and the wall's face. */
export function shoringTakeoff(i: ShoringInputs, lengthFt = 100): Takeoff {
  const L = i.H + i.D;
  const quantities: Takeoff["quantities"] = {};
  const notes: string[] = [];
  if (i.wall === "soldier") {
    const n = Math.ceil(lengthFt / i.spacing - 1e-9) + 1;
    const s = PILE_SECTIONS[i.section];
    quantities.pile = { value: n * L, basis: `${n} ${i.section} piles at ${num(i.spacing, 2)} ft over ${num(lengthFt, 1)} ft, ${num(L, 2)} ft each (${Math.round((n * L * s.W) / 100) / 10} kip of steel)`, math: `${n}\\cdot ${num(L, 2)}\\mathrm{ft}`, ref: "piles × (height + embedment)" };
    quantities.wall = { value: i.H * lengthFt, basis: `${num(i.H, 2)} ft high by ${num(lengthFt, 1)} ft`, math: `${num(i.H, 2)}\\mathrm{ft}\\cdot ${num(lengthFt, 1)}\\mathrm{ft}`, ref: "the wall's face: height × length" };
    notes.push(`Lagging: ${num(i.H * lengthFt, 0)} SF of ${i.lagging === "timber" ? `${i.laggingT} in timber (${num((i.H * lengthFt * i.laggingT) / 1000, 2)} MBM)` : i.lagging === "cip" ? `${i.precastT} in cast-in-place facing (on temporary lagging)` : "precast panels"}.`);
    if (i.drilled) notes.push(`${n} drilled holes ${i.holeDia} in in diameter, ${num(i.D, 2)} ft below the excavation, backfilled with concrete (the exposed height with lean concrete or flowable fill).`);
  } else {
    const s = SHEET_SECTIONS[i.sheet];
    quantities.wall = { value: L * lengthFt, basis: `${i.sheet}, ${num(L, 2)} ft long (height + embedment) by ${num(lengthFt, 1)} ft (${num((L * lengthFt * s.psf) / 2000, 1)} tons)`, math: `${num(L, 2)}\\mathrm{ft}\\cdot ${num(lengthFt, 1)}\\mathrm{ft}`, ref: "sheet piling: length × wall length" };
  }
  if (i.support === "anchored") {
    const sa = i.wall === "soldier" ? i.spacing : i.anchorSpacing;
    const per = Math.ceil(lengthFt / sa - 1e-9) + (i.wall === "soldier" ? 1 : 0);
    const count = per * i.anchors.length;
    const lf = per * i.anchors.reduce((a, x) => a + x.unbondedLength + x.bondLength, 0);
    notes.push(`Ground anchors: ${count} (${i.anchors.length} tier${i.anchors.length === 1 ? "" : "s"} at ${num(sa, 2)} ft), ${num(lf, 0)} LF of anchor in all; every anchor proof or performance tested (GEC 4 Ch. 7).`);
  }
  if (i.temporary) quantities.shoring = { value: 1, basis: "temporary shoring, lump sum", math: "1", ref: "Shoring, lump sum" };
  return {
    what: `${i.wall === "soldier" ? "soldier pile" : "sheet pile"} wall${i.temporary ? " (temporary shoring)" : ""}`,
    schedule: schedule([], []),
    quantities,
    views: shoringViews(i),
    notes,
    length: { label: "Wall length", value: lengthFt, unit: "ft" },
  };
}

const ok = (demand: string, capacity: string) => `\\operatorname{if}\\left(${demand}\\le ${capacity},\\text{OK},\\text{NG}\\right)=`;

export function shoringCalcLines(i: ShoringInputs, title: string, figures?: Figure[]): Line[] {
  const lines: Line[] = [];
  const text = (t: string, style?: "heading" | "subheading" | "note") => lines.push({ text: t, ...(style ? { style } : {}) });
  const m = (math: string, ref?: string, unit?: string) => lines.push({ math, ...(ref ? { ref } : {}), ...(unit ? { unit } : {}), ...(isInput(math) ? { color: INPUT_COLOR } : {}) });
  const r = designShoring(i);
  const soil = i.layers[0];
  text(title.toUpperCase(), "heading");
  text(
    `A ${i.temporary ? "temporary" : "permanent"} ${i.wall === "soldier" ? `soldier pile and ${i.lagging} lagging` : "steel sheet pile"} wall, ${i.support === "cantilever" ? "cantilevered (AASHTO LRFD 11.8)" : `anchored with ${i.anchors.length} tier${i.anchors.length === 1 ? "" : "s"} of ground anchors (AASHTO LRFD 11.9; FHWA GEC 4, Ground Anchors and Anchored Systems)`}.`,
  );
  text(COLOR_NOTE, "note");
  for (const f of figures ?? []) lines.push({ region: f });

  text("Soil and earth pressure coefficients", "subheading");
  m(`\\gamma\\coloneq ${num(soil.gamma)}\\mathrm{pcf}`, soil.name);
  m(`\\phi_{f}\\coloneq ${num(soil.phi)}\\mathrm{deg}`, "Friction angle");
  if (soil.c) m(`c\\coloneq ${num(soil.c)}\\mathrm{psf}`, "Cohesion");
  m("K_a\\coloneq\\tan\\left(45\\mathrm{deg}-\\frac{\\phi_{f}}{2}\\right)^{2}=", "Rankine active, level ground");
  m("K_p\\coloneq\\tan\\left(45\\mathrm{deg}+\\frac{\\phi_{f}}{2}\\right)^{2}=", "Rankine passive, δ = 0 (GEC 4 5.5.3)");
  m(`H\\coloneq ${num(i.H, 3)}\\mathrm{ft}`, "Excavation depth");
  m(`D\\coloneq ${num(i.D, 3)}\\mathrm{ft}`, "Embedment provided");
  if (i.traffic) {
    m(`h_{eq}\\coloneq ${num(heqParallel(i.H), 3)}\\mathrm{ft}`, "Live load surcharge, wall parallel to traffic (Table 3.11.6.4-2)");
    m("p_{LS}\\coloneq K_a\\cdot\\gamma\\cdot h_{eq}=", "Uniform with depth (Eq. 3.11.6.4-1)", "ksf");
  }
  if (i.surcharge) m(`q_{s}\\coloneq ${num(i.surcharge)}\\mathrm{psf}`, "Uniform surcharge (ES)");
  text(`Load factors: EH ${num(i.support === "cantilever" ? i.gEH : i.gAEP, 2)}${i.support === "anchored" ? " (apparent earth pressure)" : " (active)"}, ES ${num(i.gES, 2)}, LS ${num(i.gLS, 2)} (Table 3.4.1-2; CDOT BDM Table 11-2). Resistance: passive φ = ${num(i.phiP, 2)}, flexure φ = ${num(i.phiF, 2)} (Table 11.5.7-1).`);

  if (r.cant) {
    const c = r.cant;
    text("Cantilever: embedment by moment about the toe (C11.8.4.1, 3.11.5.6)", "subheading");
    text(
      i.wall === "soldier"
        ? `Above the excavation the active pressure acts on the pile spacing (${num(i.spacing, 2)} ft); below it on the pile's width b = ${num(r.b, 3)} ft, and the passive resistance over 3b = ${num(Math.min(3 * r.b, i.spacing), 3)} ft${soil.phi > 0 ? "" : " (in clay Broms' 9·c·b below 1.5b)"}. The factored driving pressures are balanced about the toe by φ times the passive pressures.`
        : "Per foot of wall: the factored active pressures (and the differential water) behind, balanced about the toe by φ times the Rankine passive in front.",
    );
    m(`D_{0}\\coloneq ${num(c.D0, 3)}\\mathrm{ft}`, "Moment equilibrium about the toe");
    m("D_{req}\\coloneq 1.2\\cdot D_{0}=", "To cover the simplified distribution (C11.8.4.1)", "ft");
    m(ok("D_{req}", "D"), "Embedment");
    m(`M_{u}\\coloneq ${num(c.Mmax, 2)}\\mathrm{kip}\\cdot\\mathrm{ft}`, `The largest moment${i.wall === "soldier" ? " in one pile" : " per foot of wall"}, at zero shear`);
  } else if (r.anch) {
    const a = r.anch;
    const anchors = [...i.anchors].sort((x, y) => x.depth - y.depth);
    text("Anchored: apparent earth pressure (3.11.5.7)", "subheading");
    m(`H_{1}\\coloneq ${num(anchors[0].depth, 3)}\\mathrm{ft}`, "Ground to the top anchor");
    m(`H_{n1}\\coloneq ${num(i.H - anchors[anchors.length - 1].depth, 3)}\\mathrm{ft}`, "The lowest anchor to the excavation");
    if (a.aep === "sand") m("p_{a}\\coloneq\\frac{K_a\\cdot\\gamma\\cdot H^{2}}{1.5\\cdot H-0.5\\cdot H_{1}-0.5\\cdot H_{n1}}=", "Eq. 3.11.5.7.1-2 (unfactored)", "ksf");
    else m(`p_{a}\\coloneq ${num(a.pa, 4)}\\mathrm{ksf}`, a.aep === "stiff-clay" ? `${num(i.kStiffClay, 2)}·γ·H, Eq. 3.11.5.7.2a-1` : "Eq. 3.11.5.7.2b-1, -2");
    text(`The envelope rises over 2/3·H1, is flat, and falls over 2/3·Hn+1 to the excavation; the surcharges are added as a rectangle (GEC 4 5.2). Factored by ${num(i.gAEP, 2)}. Anchor loads by the ${i.method === "tributary" ? "tributary area" : "hinge"} method (GEC 4 Fig. 34, AASHTO Fig. C11.9.5.1-2), per foot of wall:`);
    a.Th.forEach((t, k) => m(`T_{h${k + 1}}\\coloneq ${num(t, 3)}\\frac{\\mathrm{kip}}{\\mathrm{ft}}`, `Anchor ${k + 1}, horizontal`));
    m(`R\\coloneq ${num(a.R, 3)}\\frac{\\mathrm{kip}}{\\mathrm{ft}}`, "The reaction at the subgrade");
    for (const x of a.moments) text(`${x.at}: ${num(x.M, 2)} kip·ft per foot of wall.`);
    m(`D_{req}\\coloneq ${num(a.Dreq, 3)}\\mathrm{ft}`, "φ × passive below the excavation ≥ R × spacing + the active below (GEC 4 5.5.3)");
    m(ok("D_{req}", "D"), "Embedment");

    text("Ground anchors (11.9.4.2, 11.9.5.1; GEC 4 5.3)", "subheading");
    const sa = i.wall === "soldier" ? i.spacing : i.anchorSpacing;
    m(`s_{a}\\coloneq ${num(sa, 3)}\\mathrm{ft}`, "Horizontal spacing");
    m(`d_{h}\\coloneq ${num(i.holeDiaAnchor)}\\mathrm{in}`, "Drill hole");
    m(`\\tau_{n}\\coloneq ${num(i.bond, 3)}\\mathrm{ksf}`, "Nominal bond stress (Tables C11.9.4.2-1 to -3)");
    m(`\\phi_{po}\\coloneq ${i.proofTested ? "1.0" : soil.phi > 0 ? "0.65" : "0.70"}`, i.proofTested ? "Proof tested (Table 11.5.7-1 note 2)" : "Pullout, presumptive (Table 11.5.7-1)");
    anchors.forEach((x, k) => {
      const row = a.rows[k];
      const n = k + 1;
      m(`\\theta_{${n}}\\coloneq ${num(x.angle)}\\mathrm{deg}`, `Anchor ${n}'s inclination`);
      m(`T_{${n}}\\coloneq\\frac{T_{h${n}}\\cdot s_{a}}{\\cos\\left(\\theta_{${n}}\\right)}=`, "Eq. 20 (GEC 4)", "kip");
      m(`L_{b${n}}\\coloneq ${num(x.bondLength, 3)}\\mathrm{ft}`, "Bond length");
      m(ok(`T_{${n}}`, `\\phi_{po}\\cdot\\pi\\cdot d_{h}\\cdot\\tau_{n}\\cdot L_{b${n}}`), "Pullout, Eq. 11.9.4.2-1");
      text(`Tendon ${i.tendon === "strand" ? `${i.strands} × 0.6 in strand (${num(i.strands * STRAND.area, 3)} in², 270 ksi)` : `${i.bar} Grade 150 bar`}: φ·fpu·A = ${num(row.tendon, 1)} kip. Unbonded length: ${num(row.free, 2)} ft along the anchor to the critical surface + max(H/5, 5 ft), at least ${i.tendon === "strand" ? 15 : 10} ft = ${num(row.LuReq, 2)} ft against ${num(x.unbondedLength, 2)} ft provided. Test load 1.33 × ${num(row.Tservice, 1)} kip (unfactored) = ${num(1.33 * row.Tservice, 1)} kip.`);
    });
  }

  text(i.wall === "soldier" ? "The soldier pile" : "The sheet pile", "subheading");
  if (!i.temporary && i.corrosionLoss > 0) text(`Permanent wall: ${num(i.corrosionLoss, 4)} in of steel taken as lost from each exposed face over the design life (AASHTO 11.8.7, 11.9.7); the section's moduli, area and web reduced accordingly. Effective section modulus ${num(r.element.Z, 2)} in³${i.wall === "sheet" ? "/ft" : ""}.`);
  const e = r.element;
  const after = !i.temporary && i.corrosionLoss > 0 ? ", after the corrosion loss" : "";
  if (i.wall === "soldier") {
    m(`F_{y}\\coloneq ${num(i.Fy)}\\mathrm{ksi}`);
    m(`Z_{x}\\coloneq ${num(e.Z, 3)}\\mathrm{in}^{3}`, `${i.section}, ${e.compact ? "Zx (compact flanges)" : "Sx"}${after}`);
    m(`M_{p}\\coloneq ${num(e.Mu, 3)}\\mathrm{kip}\\cdot\\mathrm{ft}`, "Factored moment in one pile");
    m(ok("M_{p}", `${num(i.phiF, 2)}\\cdot F_{y}\\cdot Z_{x}`), "Flexure");
  } else {
    m(`F_{y}\\coloneq ${num(i.Fy)}\\mathrm{ksi}`);
    m(`S_{w}\\coloneq ${num(e.Z, 3)}\\mathrm{in}^{3}`, `${i.sheet}, per foot of wall${after}`);
    m(`M_{p}\\coloneq ${num(e.Mu, 3)}\\mathrm{kip}\\cdot\\mathrm{ft}`, "Factored moment per foot of wall");
    m(ok("M_{p}", `${num(i.phiF, 2)}\\cdot F_{y}\\cdot S_{w}`), "Flexure");
  }
  if (r.stage) {
    text("The cantilever stage before anchor 1 (GEC 4 5.5.1)", "subheading");
    text(`Excavated to ${num(r.stage.Hs, 2)} ft (${num(i.stageOver, 1)} ft below the top anchor) before the anchor is stressed, the wall stands as a cantilever with ${num(r.stage.avail, 2)} ft below the excavation: it needs 1.2·D0 = ${num(r.stage.Dreq, 2)} ft, and the element carries ${num(r.stage.Mmax, 1)} kip·ft.`);
  }
  if (r.wales.length) {
    text("Wales (GEC 4 5.4.3)", "subheading");
    const c = CHANNELS[i.wale];
    m(`Z_{w}\\coloneq 2\\cdot ${num(c.Zx)}\\mathrm{in}^{3}`, `Two ${i.wale}, back to back`);
    m(`F_{yw}\\coloneq ${num(i.waleFy)}\\mathrm{ksi}`);
    m(`l_{w}\\coloneq ${num(i.anchorSpacing, 3)}\\mathrm{ft}`, "Span between anchors");
    r.wales.forEach((w, k) => {
      m(`w_{${k + 1}}\\coloneq ${num(w.w, 3)}\\frac{\\mathrm{kip}}{\\mathrm{ft}}`, `Anchor ${k + 1}'s horizontal load per foot (factored)`);
      m(ok(`\\frac{w_{${k + 1}}\\cdot l_{w}^{2}}{10}`, "0.9\\cdot F_{yw}\\cdot Z_{w}"), "Continuous over three or more spans, w·l²/10");
    });
  }
  if (r.axial) {
    const a = r.axial;
    text("Vertical capacity (GEC 4 5.6; AASHTO 11.9.5.2)", "subheading");
    text(`Combined with the bending (AASHTO 11.9.5.2, Eqs. 6.9.2.2-1 and -2, the element braced by the facing and soil): Pu/Pr = ${num(a.Pu / (0.9 * r.element.Pn), 3)} with Pr = 0.90·Fy·A = ${num(0.9 * r.element.Pn, 1)} kip and Mr = ${num(i.phiF * r.element.Mn, 1)} kip·ft.`);
    text(`The anchors' vertical components (factored) ${num(a.Tv, 2)} kip and 1.25 × the wall's own weight ${num(a.DC, 2)} kip, carried below the excavation only: ${a.method}. Side ${num(a.side, 1)} kip × φ ${a.phiSide}, tip ${num(a.tip, 1)} kip × φ ${a.phiTip} (AASHTO Tables 10.5.5.2.3-1, 10.5.5.2.4-1).`);
    m(`P_{u}\\coloneq ${num(a.Pu, 3)}\\mathrm{kip}`);
    m(ok("P_{u}", `${num(a.phiSide, 2)}\\cdot ${num(a.side, 3)}\\mathrm{kip}+${num(a.phiTip, 2)}\\cdot ${num(a.tip, 3)}\\mathrm{kip}`), "Vertical capacity");
  }
  if (r.heave) {
    const h = r.heave;
    text("Basal heave (GEC 4 5.8.2.2)", "subheading");
    m(`N_{c}\\coloneq ${num(h.Nc, 3)}`, "Strip, 5·(1 + 0.2·H/B) ≤ 7.5 (Fig. 51c)");
    m(`S_{ub}\\coloneq ${num(h.Sub * 1000)}\\mathrm{psf}`, "Below the excavation");
    m(`S_{u}\\coloneq ${num(h.Su * 1000)}\\mathrm{psf}`, "Retained, average");
    m(`B_{x}\\coloneq ${num(i.excavationWidth)}\\mathrm{ft}`, "Excavation width");
    m(`\\sigma_{H}\\coloneq ${num(h.sv, 4)}\\mathrm{ksf}`, "γ·H + q at the excavation's level");
    m(`FS_{h}\\coloneq\\frac{N_{c}\\cdot S_{ub}}{\\sigma_{H}-\\frac{\\sqrt{2}\\cdot S_{u}\\cdot H}{B_{x}}}=`, "Eq. 34 with B′ = B/√2");
    m(ok(`${num(h.target, 1)}`, "FS_{h}"), "Basal heave");
  }
  text("Overall stability (AASHTO 11.6.3.7; GEC 4 5.8.3)", "subheading");
  text(`Bishop's simplified method over circles through the element's toe${r.anch ? " and circles passing just behind each anchor tier's bond zone, each anchor restraining by its unfactored load times the share of its bond outside the circle" : ""}; a tension crack up to 2c/γ·tan(45° + φ/2) where a circle turns vertical below the ground; the wall's shear resistance neglected. The critical circle's center is ${num(r.stability.xc, 1)} ft behind the wall and ${num(r.stability.yc, 1)} ft above its top, radius ${num(r.stability.R, 1)} ft.`);
  m(`FS_{s}\\coloneq ${num(r.stability.FS, 3)}`, "The smallest found");
  m(ok(`\\frac{1}{${num(i.phiStability, 2)}}`, "FS_{s}"), "Overall stability, φ = " + num(i.phiStability, 2));
  if (r.deflection) {
    const d = r.deflection;
    text("Deflection at the top (service)", "subheading");
    text(`Unfactored pressures. Below the excavation the element is analysed by p–y (API sand, Matlock and Welch–Reese clays; FHWA GEC 9) under the shear ${num(d.V, 2)} kip and moment ${num(d.M, 1)} kip·ft at the excavation: ${num(Math.abs(d.y0), 3)} in and ${num(Math.abs(d.theta0) * 1000, 3)} mrad there. The exposed part bends a further ${num(d.bend, 3)} in as a cantilever.`);
    m(`\\delta_{top}\\coloneq ${num(d.top, 3)}\\mathrm{in}`, "y0 + θ0·H + the cantilever's bending");
    m(`\\operatorname{if}\\left(\\delta_{top}\\le ${num(i.deflectionLimit, 2)}\\mathrm{in},\\text{OK},\\text{Info}\\right)=`, "Against the limit set (advisory)");
  }
  if (r.beam) {
    const bm = r.beam;
    text("Deflection of the anchored wall (service)", "subheading");
    text(`The element as a beam on springs from the top to the toe: the unfactored apparent pressure and surcharges above the excavation and the active pressure below it; each anchor a spring A·E/(Lu + Lb/2)·cos²θ (GEC 4's apparent free length) locked off at ${Math.round(i.lockOff * 100)}% of its design load; the soil below the excavation as linear springs from the p–y curves' initial moduli (API sand k·z; clays 67·Su). The final stage only; the construction sequence isn't modelled.`);
    m(`\\delta_{max}\\coloneq ${num(Math.abs(bm.max), 3)}\\mathrm{in}`, `At ${num(bm.zMax, 1)} ft below the top`);
    bm.anchors.forEach((a, k) => text(`Anchor ${k + 1}: locked off at ${num(a.lockOff, 1)} kip, ${num(a.T, 1)} kip in service (the wall moves ${num(a.y, 3)} in there).`));
    m(`\\operatorname{if}\\left(\\delta_{max}\\le ${num(i.deflectionLimit, 2)}\\mathrm{in},\\text{OK},\\text{Info}\\right)=`, "Against the limit set (advisory)");
  }
  if (i.seismic) {
    text("Seismic, Extreme Event I (AASHTO 11.8.6, 11.9.6)", "subheading");
    text(`${i.As <= 0.4 ? "With As ≤ 0.4 a seismic design isn't mandatory unless the wall supports a structure that must be designed for seismic loading, or the soil may lose strength in shaking (11.5.4.2); checked here as asked. " : ""}γ = 1.0 and φ = 1.0 (0.9 for overall stability). The seismic active force by Mononobe–Okabe (Appendix A11; Seed and Whitman's 3/4·kh where M–O doesn't apply), distributed like the static pressure (11.6.5.3); the passive by M–O with δ = 0 (conservative against the log-spiral of 11.6.5.5).`);
    m(`A_{s}\\coloneq ${num(i.As, 3)}`, "Fpga·PGA (3.10)");
    m(`k_{h}\\coloneq ${i.khHalf ? "0.5\\cdot " : ""}A_{s}=`, i.khHalf ? "Halved for 1 to 2 in. of movement (11.6.5.2.2)" : "kh0 = As, no reduction for movement (11.6.5.2.1)");
    m("\\psi\\coloneq\\arctan\\left(k_{h}\\right)=", undefined, "deg");
    if (soil.phi > 0) m("K_{ae}\\coloneq\\frac{\\cos\\left(\\phi_{f}-\\psi\\right)^{2}}{\\cos\\left(\\psi\\right)^{2}\\cdot\\left(1+\\sqrt{\\frac{\\sin\\left(\\phi_{f}\\right)\\cdot\\sin\\left(\\phi_{f}-\\psi\\right)}{\\cos\\left(\\psi\\right)}}\\right)^{2}}=", "M–O, level ground, δ = 0");
    if (r.quakeCant) text(`Cantilever: moment about the toe with the seismic pressures needs D = 1.2·D0 = ${num(r.quakeCant.Dreq, 2)} ft; the element carries ${num(r.quakeCant.Mmax, 1)} kip·ft.`);
    if (r.anch?.quake) {
      const q = r.anch.quake;
      text(`Anchored: the envelope scaled by ${num(q.ratio, 3)} (Kae/Ka); anchor loads ${q.rows.map((x, k) => `${k + 1}: ${num(x.T, 1)} kip`).join(", ")}; the toe needs ${num(q.Dreq, 2)} ft; the seismic active wedge is at ${num((q.wedge * 180) / Math.PI, 1)}° from the horizontal, and each bond zone must lie behind it.`);
    }
    if (r.quakeStab) m(`FS_{eq}\\coloneq ${num(r.quakeStab.FS, 3)}`, "Overall stability with kh = 0.5·As on each slice (Bishop)");
  }
  if (r.seep) {
    const sp = r.seep;
    text("Seepage under the wall (USACE EM 1110-2-2504, the hydraulic gradient method)", "subheading");
    text("The head is lost evenly along the path down the back of the wall and up the front: the pore pressure behind falls, the one in front rises, and they meet at the toe. The flow adds i·γw to the effective stress behind and takes it from the passive side in front.");
    m(`\\Delta_{h}\\coloneq ${num(sp.dh, 3)}\\mathrm{ft}`, "The water behind above the excavation");
    m(`L_{p}\\coloneq ${num(sp.Lp, 3)}\\mathrm{ft}`, "(H + D − zw) + D");
    m("i_{e}\\coloneq\\frac{\\Delta_{h}}{L_{p}}=", "The average (exit) gradient");
    if (r.piping) {
      m(`i_{c}\\coloneq ${num(r.piping.ic, 4)}`, "γ′/γw in front");
      m(`\\operatorname{if}\\left(${num(r.piping.target, 1)}\\le\\frac{i_{c}}{i_{e}},\\text{OK},\\text{NG}\\right)=`, "Piping");
    }
  }
  if (r.staged) {
    text("The construction sequence (GEC 4 5.5.1)", "subheading");
    text(`For each anchor the wall is excavated to ${num(i.stageOver, 1)} ft below it with the anchors above in place, then the anchor is installed and locked off at ${Math.round(i.lockOff * 100)}% of its design load; finally the excavation goes to the bottom. Rankine active pressures with the surcharges at each stage (unfactored); the soil springs below each stage's excavation; each anchor's spring takes up the wall's movement after its lock-off.`);
    for (const st of r.staged.stages) text(`${st.name}: ${num(Math.abs(st.max), 3)} in at ${num(st.zMax, 1)} ft${st.anchors.length ? `; anchor loads ${st.anchors.map((a) => `${num(a, 1)} kip`).join(", ")}` : ""}.`);
    m(`\\delta_{st}\\coloneq ${num(Math.abs(r.staged.max), 3)}\\mathrm{in}`, `The largest, at "${r.staged.at}"`);
    m(`\\operatorname{if}\\left(\\delta_{st}\\le ${num(i.deflectionLimit, 2)}\\mathrm{in},\\text{OK},\\text{Info}\\right)=`, "Against the limit set (advisory)");
  }
  if (i.seismic && i.seismicWater && i.water !== null) {
    text("Pore water in the earthquake (Ebeling and Morrison 1992)", "subheading");
    text(
      i.freeWater
        ? `Free pore water (pervious soil): below the water table the soil skeleton's inertia with its dry weight, kh·(γ − n·γw)/(γ − γw), n = ${num(i.porosity, 2)}, in Mononobe–Okabe on the buoyant weight; on a sheet pile wall, Westergaard's hydrodynamic pressure 7/8·kh·γw·√(hw·(z − zw)) down to the excavation.`
        : "Restrained pore water (low permeability): below the water table the saturated soil's inertia, kh·γ/(γ − γw), in Mononobe–Okabe on the buoyant weight; no separate hydrodynamic pressure.",
    );
  }
  if (r.liquefaction.length) {
    const w = r.liquefaction.reduce((a, x) => (x.FS < a.FS ? x : a));
    text("Liquefaction (AASHTO 10.5.4.2; Idriss and Boulanger 2008)", "subheading");
    text(`Saturated cohesionless soil behind the wall and in front of it, every foot: CSR = 0.65·(σv/σ′v)·amax·rd with amax = As = ${num(i.As, 3)}; CRR from (N1)60cs for M ${num(i.Mw, 1)} with MSF and Kσ; FS = CRR·MSF·Kσ/CSR. Where FS < 1 in front, the passive resistance is taken as lost in the seismic checks.`);
    m(`FS_{liq}\\coloneq ${num(w.FS, 3)}`, `The lowest: ${w.z} ft ${w.front ? "in front" : "behind"}, (N1)60cs = ${num(w.N1cs, 1)}, CSR = ${num(w.CSR, 3)}`);
    m("\\operatorname{if}\\left(1.0\\le FS_{liq},\\text{OK},\\text{NG}\\right)=", "Triggering");
  }
  if (r.net) {
    text("Flow net through the layers (USACE EM 1110-2-1901)", "subheading");
    text(`Laplace's equation ∂/∂x(kh·∂h/∂x) + ∂/∂z(kv·∂h/∂z) = 0 by finite differences on a ${num(r.net.dx, 2)} ft grid round the wall (each layer's kh and kv, harmonic means between cells), the wall an impervious cut to its toe, the water table behind and the excavation in front at constant heads, an impervious base. The pore pressures on each face and the exit gradient come from it (${r.net.iterations} iterations); the effective stresses use them.`);
    m(`i_{exit}\\coloneq ${num(r.net.exitGradient, 4)}`, "At the excavation next to the wall");
    text(`Flow under the wall: ${num(r.net.flow, 4)} ft³/day per foot of wall.`);
  }
  if (r.precast) {
    const p = r.precast;
    text(`${p.cip ? "Cast-in-place facing" : "Precast lagging"} (AASHTO 11.8.5.2, C11.8.5.2)`, "subheading");
    m(`p_{l}\\coloneq ${num(p.pMax, 4)}\\mathrm{ksf}`, "Factored pressure at the excavation");
    m(`l_{p}\\coloneq ${num(p.span, 3)}\\mathrm{ft}`, "Span between the piles (center to center)");
    m(`A_{sp}\\coloneq ${num(p.As, 4)}\\mathrm{in}^{2}`, `#${i.precastBar} @ ${i.precastBarSpacing} in, per foot of height`);
    m(`d_{p}\\coloneq ${num(p.d, 3)}\\mathrm{in}`, p.cip ? "2 in cover" : "1.5 in cover");
    m(`f_{cp}\\coloneq ${num(i.precastFc)}\\mathrm{ksi}`);
    m("a_{p}\\coloneq\\frac{A_{sp}\\cdot 60\\mathrm{ksi}}{0.85\\cdot f_{cp}\\cdot 12\\mathrm{in}}=", undefined, "in");
    m(ok(`${num(p.coef, 3)}\\cdot p_{l}\\cdot 1\\mathrm{ft}\\cdot l_{p}^{2}`, "0.9\\cdot A_{sp}\\cdot 60\\mathrm{ksi}\\cdot\\left(d_{p}-\\frac{a_{p}}{2}\\right)"), `Flexure per foot of height (C11.8.5.2: ${i.facingSupport} spans, ${i.arching ? "soil arching" : "no arching"})`);
    m(ok(`\\frac{p_{l}\\cdot 1\\mathrm{ft}\\cdot l_{p}}{2}`, `0.9\\cdot 0.0316\\cdot 2\\cdot\\sqrt{f_{cp}\\cdot 1\\mathrm{ksi}}\\cdot 12\\mathrm{in}\\cdot d_{p}`), "Shear, β = 2 (5.7.3.4.1)");
  }
  if (r.lagging) {
    text("Lagging", "subheading");
    text(
      i.temporary
        ? `Temporary timber lagging by GEC 4 Table 12 (after FHWA-RD-75-130): ${i.laggingSoil} soil, ${num(i.H, 1)} ft deep, ${num(r.lagging.clear, 2)} ft clear span: ${r.lagging.tReq === null ? "outside the table (a soldier pile wall is questionable here)" : `${r.lagging.tReq} in recommended`}; ${i.laggingT} in provided.`
        : `Permanent timber facing (AASHTO 11.8.5.2, Section 8) at the excavation, the factored pressure ${num(r.lagging.pMax, 3)} ksf: M = ${num(r.lagging.coef, 3)}·p·L² (C11.8.5.2, ${i.facingSupport} spans, ${i.arching ? "soil arching" : "no arching"}) = ${num(r.lagging.Mu, 3)} kip·ft per foot of height against φ·Fb·S = ${num(r.lagging.Mr, 3)}${r.lagging.Vr !== null ? `; shear ${num(r.lagging.Vu, 3)} kip/ft against φ·Fv·b·t/1.5 = ${num(r.lagging.Vr, 3)} (Fv = ${num(r.lagging.fb!.Fv, 3)} ksi)` : ""}. ${r.lagging.fb ? `${r.lagging.fb.label}, ${i.laggingT} × ${i.timberWidth} in on the flat: Fb = Fbo·CKF·CM·CF·Cfu·Ci·Cλ = ${num(r.lagging.fb.Fbo, 3)} × ${num(r.lagging.fb.CKF, 3)} × ${r.lagging.fb.CM} × ${r.lagging.fb.CF} × ${r.lagging.fb.Cfu} × ${r.lagging.fb.Ci} × ${r.lagging.fb.Cl} = ${num(r.lagging.fb.Fb, 3)} ksi (AASHTO Eq. 8.4.4.1-1; CKF = 2.5/φ, φ = 0.85).` : `Fb = ${num(r.lagging.Fb, 3)} ksi as entered.`}`,
    );
  }
  lines.push(...checksSummary([{ checks: r.checks }]));
  return lines;
}
