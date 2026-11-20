import type { Line } from "@/lib/calcs/library/templates";
import { INPUT_COLOR, isInput, num } from "../calc-style";
import { BARS, type Bars } from "../walls/cip";
import { abutmentLiveLoad, type AbutmentInputs, type AbutmentResult } from "./abutment";
import { groupProps } from "./micropile-group";
import { MICROPILE_BARS, type MicropileInputs, type MicropileResult } from "./micropile";
import type { designPiles, PileInputs } from "./piles";
import type { designShaft, ShaftInputs } from "./shaft";

// The abutment's and the micropile's checks worked out step by step, as Calcs math in the owner's style: the inputs in
// blue, each equation with its reference, each check ending in its demand against its resistance. Closed-form steps are
// live math; the numerical ones (the p–y analysis, the cap's continuous beam, the group's rigid-cap forces when the
// layout is a grid) are given as the analysis found them, with the method named.

export type Writer = {
  text: (t: string, style?: "heading" | "subheading" | "note", extra?: { newPage?: boolean; keepWithNext?: boolean }) => void;
  m: (math: string, ref?: string, unit?: string) => void;
};

export function writer(lines: Line[]): Writer {
  return {
    text: (t, style, extra) => lines.push({ text: t, ...(style ? { style } : {}), ...(extra ?? {}) }),
    m: (math, ref, unit) => lines.push({ math, ...(ref ? { ref } : {}), ...(unit ? { unit } : {}), ...(math.length > 110 && ref ? { wide: true } : {}), ...(isInput(math) ? { color: INPUT_COLOR } : {}) }),
  };
}

export const ok = (demand: string, capacity: string) => `\\operatorname{if}\\left(${demand}\\le ${capacity},\\text{OK},\\text{NG}\\right)=`;
const pick = <T,>(arr: T[], f: (t: T) => number) => arr.reduce((a, b) => (f(b) > f(a) ? b : a), arr[0]);
const rad = (d: number) => (d * Math.PI) / 180;

// --- micropile ---------------------------------------------------------------------------------------------------------

/** One micropile's structural, bond, development, lateral, shortening and connection checks (AASHTO 10.9). */
export function micropileWorked(w: Writer, i: MicropileInputs, r: MicropileResult) {
  const { text, m } = w;
  const bar = MICROPILE_BARS[i.bar];
  const nb = Math.max(1, Math.round(i.barCount ?? 1));
  const factored = i.cases.filter((c) => c.limit !== "service");
  const service = i.cases.filter((c) => c.limit === "service");

  text("Micropile: section and materials", "subheading", { keepWithNext: true });
  m("E_{sp}\\coloneq29000\\mathrm{ksi}", "Steel");
  m(`D_{o}\\coloneq ${num(i.casingOD)}\\mathrm{in}`, "Casing, outside diameter");
  m(`t_{w}\\coloneq ${num(i.casingT)}\\mathrm{in}`, "Casing wall");
  if (r.loss > 0) m(`\\Delta_{t}\\coloneq ${num(r.loss)}\\mathrm{in}`, `Sacrificial steel off the outside, aggressive ground: ${Math.max(0.001, i.corrosionRate ?? 0.001)} in/yr over ${Math.max(0, (i.designLife ?? 75) - Math.max(0, i.coatingLife ?? 0))} years (CDOT BDM 10.5.1.4)`);
  else m("\\Delta_{t}\\coloneq0\\mathrm{in}", "No corrosion allowance (ground not aggressive)");
  m("D_{c}\\coloneq D_{o}-2\\cdot\\Delta_{t}=", "The casing's outside after corrosion", "in");
  m("I_{D}\\coloneq D_{o}-2\\cdot t_{w}=", "Casing, inside diameter", "in");
  m(nb > 1 ? `A_{b}\\coloneq ${nb}\\cdot${num(bar.area)}\\mathrm{in}^{2}=` : `A_{b}\\coloneq ${num(bar.area)}\\mathrm{in}^{2}`, `${nb > 1 ? `${nb} ` : ""}#${i.bar} bar${nb > 1 ? "s" : ""} (${num(bar.dia)} in)`, nb > 1 ? "in^2" : undefined);
  m("A_{c}\\coloneq\\frac{\\pi}{4}\\cdot\\left(D_{c}^{2}-I_{D}^{2}\\right)=", "Casing", "in^2");
  m(`A_{thr}\\coloneq ${num(i.threadReduction)}\\mathrm{in}^{2}`, "Area lost at the threaded joints");
  m("A_{ct}\\coloneq\\max\\left(0\\mathrm{in}^{2},A_{c}-A_{thr}\\right)=", "Casing at the threads", "in^2");
  m(`d_{h}\\coloneq ${num(i.holeD)}\\mathrm{in}`, "Drill hole in the bond zone");
  m("A_{gc}\\coloneq\\frac{\\pi}{4}\\cdot I_{D}^{2}-A_{b}=", "Grout inside the casing", "in^2");
  m("A_{gu}\\coloneq\\frac{\\pi}{4}\\cdot d_{h}^{2}-A_{b}=", "Grout in the bond zone", "in^2");
  m(`f'_{cg}\\coloneq ${num(i.fcGrout)}\\mathrm{ksi}`, "Grout");
  m(`f_{yp}\\coloneq ${num(i.casingFy)}\\mathrm{ksi}`, "Casing");
  m(`f_{yr}\\coloneq ${num(i.barFy)}\\mathrm{ksi}`, "Bar");
  m("f_{yc}\\coloneq\\min\\left(f_{yp},f_{yr},87\\mathrm{ksi}\\right)=", "Cased length: one fy, the lesser of the bar's, the casing's and the stress at a strain of 0.003 (AASHTO C10.9.3.10.2a)", "ksi");
  m("f_{yb}\\coloneq\\min\\left(f_{yr},87\\mathrm{ksi}\\right)=", "The bar alone", "ksi");

  text("Micropile: structural resistance (AASHTO 10.9.3.10)", "subheading", { keepWithNext: true });
  m("R_{ncc}\\coloneq0.85\\cdot\\left(0.85\\cdot f'_{cg}\\cdot A_{gc}+f_{yc}\\cdot\\left(A_{b}+A_{c}\\right)\\right)=", "Cased length in compression, AASHTO Eq. 10.9.3.10.2a-1", "kip");
  m("R_{ncu}\\coloneq0.85\\cdot\\left(0.85\\cdot f'_{cg}\\cdot A_{gu}+f_{yb}\\cdot A_{b}\\right)=", "Uncased length in compression, AASHTO Eq. 10.9.3.10.2b-1", "kip");
  m("R_{ntc}\\coloneq\\min\\left(f_{yp},f_{yr}\\right)\\cdot\\left(A_{b}+A_{ct}\\right)=", "Cased length in tension, at the threads, AASHTO Eq. 10.9.3.10.3a-1", "kip");
  m("R_{ntu}\\coloneq f_{yr}\\cdot A_{b}=", "Uncased length in tension, the bar, AASHTO Eq. 10.9.3.10.3b-1", "kip");

  text("Micropile: grout-to-ground bond (AASHTO 10.9.3.5)", "subheading", { keepWithNext: true });
  m(`\\alpha_{b}\\coloneq ${num(r.bond.alpha)}\\mathrm{ksf}`, r.bond.range ? `Nominal bond, AASHTO Table C10.9.3.5.2-1 (FHWA NHI-05-039 Table 5-3), ${r.bond.row.name}, Type ${i.grouting}: ${r.bond.range[0]}–${r.bond.range[1]} ksf` : "Nominal bond, from a load test");
  m(`L_{b}\\coloneq ${num(i.bond)}\\mathrm{ft}`, "Bond length below the casing");
  m("R_{s}\\coloneq\\pi\\cdot d_{h}\\cdot\\alpha_{b}\\cdot L_{b}=", "Nominal side resistance, AASHTO Eq. 10.9.3.5.2-1", "kip");
  m(`\\phi_{g}\\coloneq ${num(r.phiG)}`, i.loadTested ? "Final design, load-tested (verification and proof tests in the plans), AASHTO Table 10.5.5.2.5-1" : "Preliminary design, presumptive, AASHTO Table 10.5.5.2.5-1");
  if (i.plunge > 0) {
    m(`L_{p}\\coloneq ${num(i.plunge)}\\mathrm{ft}`, "Plunge length, the casing in the bond zone");
    m("P_{pl}\\coloneq\\phi_{g}\\cdot\\pi\\cdot d_{h}\\cdot\\alpha_{b}\\cdot L_{p}=", "Load the plunge length transfers, AASHTO 10.9.3.10.4", "kip");
  } else m("P_{pl}\\coloneq0\\mathrm{kip}", "No plunge length");
  if (r.Rp > 0) {
    m(`q_{u}\\coloneq ${num(i.quKsf)}\\mathrm{ksf}`, "Rock under the tip, unconfined compressive strength");
    m("R_{p}\\coloneq2.5\\cdot q_{u}\\cdot\\frac{\\pi}{4}\\cdot d_{h}^{2}=", "Tip on competent rock, AASHTO 10.9.3.5.3 by 10.8.3.5.4c", "kip");
  } else m("R_{p}\\coloneq0\\mathrm{kip}", "Tip resistance not counted");

  if (factored.length) {
    const c = pick(factored, (x) => x.compression);
    const ext = c.limit === "extreme";
    text(`Micropile: compression (${c.name})`, "subheading", { keepWithNext: true });
    m(`P_{c}\\coloneq ${num(c.compression)}\\mathrm{kip}`, `The most compression, ${c.name}`);
    m(ok("P_{c}", ext ? "R_{s}+R_{p}+P_{pl}" : "\\phi_{g}\\cdot R_{s}+0.5\\cdot R_{p}+P_{pl}"), ext ? "Bond, extreme event (φ 1.0)" : "Bond: side, tip (φ 0.50) and the plunge length");
    m(ok("P_{c}", `${ext ? "1.0" : "0.75"}\\cdot R_{ncc}`), `Cased length${ext ? ", extreme event (AASHTO 1.3.2.1)" : ", φc 0.75 (AASHTO Table 10.5.5.2.5-2)"}`);
    m(ok("\\max\\left(0\\mathrm{kip},P_{c}-P_{pl}\\right)", `${ext ? "1.0" : "0.75"}\\cdot R_{ncu}`), "Uncased length, less the plunge length's transfer");
    const t = pick(factored, (x) => x.tension);
    if (t.tension > 0) {
      const tx = t.limit === "extreme";
      text(`Micropile: tension (${t.name})`, "subheading", { keepWithNext: true });
      m(`T_{u}\\coloneq ${num(t.tension)}\\mathrm{kip}`, `The most tension, ${t.name}`);
      m(ok("T_{u}", `${tx ? "0.8" : "\\phi_{g}"}\\cdot R_{s}+P_{pl}`), tx ? "Bond in tension, extreme event (φ 0.80, CDOT BDM 10.3.3)" : "Bond in tension, the compression bond (AASHTO 10.9.3.7, C10.9.3.7)");
      m(ok("T_{u}", `${tx ? "1.0" : "0.8"}\\cdot R_{ntc}`), "Cased length at the threads, φ 0.80");
      m(ok("\\max\\left(0\\mathrm{kip},T_{u}-P_{pl}\\right)", `${tx ? "1.0" : "0.8"}\\cdot R_{ntu}`), "Uncased length, the bar");
    }
    if (r.dev) {
      text("Micropile: the bar's development in the bond zone (AASHTO 10.9.3.10.5, 5.10.8.2)", "subheading", { keepWithNext: true });
      m(`d_{br}\\coloneq ${num(bar.dia)}\\mathrm{in}`, "Bar diameter");
      m("\\lambda_{rc}\\coloneq\\min\\left(1,\\max\\left(0.4,\\frac{d_{br}}{\\frac{d_{h}}{2}}\\right)\\right)=", "Cover factor, cb the hole's radius, Ktr 0 (AASHTO Eq. 5.10.8.2.1c-2)");
      if (r.dev.kind === "tension") {
        m("l_{dt}\\coloneq\\frac{2.4\\cdot d_{br}\\cdot\\frac{f_{yr}}{\\mathrm{ksi}}}{\\sqrt{\\frac{f'_{cg}}{\\mathrm{ksi}}}}\\cdot\\lambda_{rc}=", "Tension, AASHTO Eq. 5.10.8.2.1a-2", "in");
        m("l_{d}\\coloneq\\max\\left(12\\mathrm{in},l_{dt}\\cdot\\min\\left(1,\\frac{\\max\\left(0\\mathrm{kip},T_{u}-P_{pl}\\right)}{0.8\\cdot R_{ntu}}\\right)\\right)=", "Reduced by the excess steel, λer (5.10.8.2.1c)", "ft");
      } else {
        m("l_{dc}\\coloneq\\max\\left(\\frac{0.63\\cdot d_{br}\\cdot\\frac{f_{yr}}{\\mathrm{ksi}}}{\\sqrt{\\frac{f'_{cg}}{\\mathrm{ksi}}}},0.3\\cdot d_{br}\\cdot\\frac{f_{yr}}{\\mathrm{ksi}}\\right)=", "Compression, AASHTO Eq. 5.10.8.2.2a-1", "in");
        m("l_{d}\\coloneq\\max\\left(8\\mathrm{in},l_{dc}\\cdot\\min\\left(1,\\frac{\\max\\left(0\\mathrm{kip},P_{c}-P_{pl}\\right)}{0.75\\cdot R_{ncu}}\\right)\\right)=", "Reduced by the excess steel (5.10.8.2.2b)", "ft");
      }
      m(ok("l_{d}", "L_{b}"), "Developed within the bond length");
    }
  }

  // Lateral: the casing under the head's shear, by p–y.
  if (r.comb.length) {
    const g = pick(r.comb, (x) => x.value);
    const ext = g.c.limit === "extreme";
    text(`Micropile: the casing's axial and flexure (${g.c.name})`, "subheading", { keepWithNext: true });
    text(`Method:- the micropile as a beam on p–y springs (FHWA GEC 9), its head fixed in the cap, ${i.groupPm ? `in a group: the group's average p-multiplier ${num(i.groupPm.avg)} for its deflection, the lead row's ${num(i.groupPm.lead)} pushed to it for the moment (AASHTO Table 10.7.2.4-1)` : "alone"}; the cased section's stiffness with the grout cracked (EI = Es(Ic + Ib) + 0.4 Eg Ig). The analysis gives the largest moment and shear down the casing:`);
    m(`H_{p}\\coloneq ${num(g.c.H)}\\mathrm{kip}`, "Shear at the head");
    m(`M_{pm}\\coloneq ${num(g.r.Mmax)}\\mathrm{kip}\\cdot\\mathrm{ft}`, "Largest moment, p–y analysis");
    m(`P_{cm}\\coloneq ${num(g.c.compression)}\\mathrm{kip}`, `Its axial load, ${g.c.name}`);
    m("Z_{c}\\coloneq\\frac{D_{c}^{3}-I_{D}^{3}}{6}=", "Casing's plastic modulus", "in^3");
    m("M_{p}\\coloneq f_{yp}\\cdot Z_{c}=", "Casing, compact (AASHTO 6.12.2.2.3), φf 1.0", "kip*ft");
    if (g.KL > 0) {
      m(`K_{L}\\coloneq ${num(g.KL)}\\mathrm{in}`, "K = 1.2 over the unsupported length and the depth to fixity (AASHTO 10.9.3.10.6, 10.7.3.13.4)");
      m(`P_{r}\\coloneq ${num(g.Pr)}\\mathrm{kip}`, "The lesser of φc R_ncc and φc 0.877 Pe (AASHTO 6.9.4.1)");
    } else m(`P_{r}\\coloneq${ext ? "1.0" : "0.75"}\\cdot R_{ncc}=`, "No unsupported length: no buckling", "kip");
    m(ok("\\frac{P_{cm}}{P_{r}}+\\frac{M_{pm}}{M_{p}}", "1"), "Linear interaction, AASHTO 6.9.2.2 Eq. 6.9.2.2.1-3; FHWA NHI-05-039 5.6.4");

    const sh = pick(r.comb, (x) => Math.abs(x.r.Vmax));
    const Lv = ((sh.r.zZero ?? r.length) || r.length) * 12;
    text(`Micropile: the casing in shear (${sh.c.name})`, "subheading", { keepWithNext: true });
    m(`V_{pm}\\coloneq ${num(Math.abs(sh.r.Vmax))}\\mathrm{kip}`, "Largest shear, p–y analysis");
    m(`t_{v}\\coloneq\\max\\left(0.01\\mathrm{in},\\left(t_{w}-\\Delta_{t}\\right)\\cdot\\left(1-\\min\\left(0.9,\\frac{A_{thr}}{A_{c}}\\right)\\right)\\right)=`, "The wall after corrosion, less the threads' share", "in");
    m("\\lambda_{t}\\coloneq\\frac{D_{c}}{t_{v}}=", "D/t");
    m(`L_{v}\\coloneq ${num(Lv)}\\mathrm{in}`, "From the head to the first point of no deflection (the shear's reversal)");
    m("F_{cr}\\coloneq\\min\\left(0.58\\cdot f_{yp},\\max\\left(\\frac{1.60\\cdot E_{sp}}{\\sqrt{\\frac{L_{v}}{D_{c}}}\\cdot\\lambda_{t}^{1.25}},\\frac{0.78\\cdot E_{sp}}{\\lambda_{t}^{1.5}}\\right)\\right)=", "AASHTO Eqs. 6.12.1.2.3b-2 and -3", "ksi");
    m("A_{gv}\\coloneq\\frac{\\pi}{4}\\cdot\\left(D_{c}^{2}-\\left(D_{c}-2\\cdot t_{v}\\right)^{2}\\right)=", undefined, "in^2");
    m(ok("V_{pm}", "1.0\\cdot0.5\\cdot F_{cr}\\cdot A_{gv}"), "AASHTO Eq. 6.12.1.2.3b-1, φv 1.0");
  }

  if (r.elastic) {
    text(`Micropile: elastic shortening (${r.elastic.c.name})`, "subheading", { keepWithNext: true });
    m("E_{g}\\coloneq57\\cdot\\sqrt{1000\\cdot\\frac{f'_{cg}}{\\mathrm{ksi}}}\\cdot\\mathrm{ksi}=", "Grout, as concrete", "ksi");
    m("EA_{c}\\coloneq E_{sp}\\cdot\\left(A_{c}+A_{b}\\right)+E_{g}\\cdot A_{gc}=", "Cased length", "kip");
    m("EA_{u}\\coloneq E_{sp}\\cdot A_{b}+E_{g}\\cdot A_{gu}=", "Bond zone", "kip");
    m(`L_{c}\\coloneq ${num(i.cased)}\\mathrm{ft}`, "Cased length");
    m(`P_{sv}\\coloneq ${num(r.elastic.c.compression)}\\mathrm{kip}`, r.elastic.c.name);
    m("\\Delta_{e}\\coloneq\\frac{P_{sv}\\cdot L_{c}}{EA_{c}}+\\frac{P_{sv}\\cdot\\frac{L_{b}}{2}}{EA_{u}}=", `Over the cased length and half the bond length (FHWA-SA-97-070 5.F.1); for information, against ${num(i.tolerableAxial)} in`, "in");
  }
  const defl = r.checks.find((c) => c.id === "deflection");
  if (defl) {
    m(`y_{0}\\coloneq ${num(defl.demand)}\\mathrm{in}`, "Lateral deflection at the cap, Service, p–y analysis");
    m(ok("y_{0}", `${num(i.tolerable)}\\mathrm{in}`), "Tolerable (AASHTO 10.9.3.9)");
  }

  if (r.connection && i.plate) {
    const p = i.plate;
    const c = pick(factored, (x) => x.compression);
    text("Micropile: the connection into the cap (AASHTO 10.9.3.10.7)", "subheading", { keepWithNext: true });
    m(`N_{p}\\coloneq ${num(p.size)}\\mathrm{in}`, "Square bearing plate");
    m(`t_{p}\\coloneq ${num(p.t)}\\mathrm{in}`, "Its thickness");
    m(`F_{yl}\\coloneq ${num(p.Fy)}\\mathrm{ksi}`, "Plate");
    m(`f'_{cp}\\coloneq ${num(i.capFc ?? 4.5)}\\mathrm{ksi}`, "The cap's concrete");
    m(`P_{u}\\coloneq ${num(r.connection.Pu)}\\mathrm{kip}`, "The most axial force, compression or tension");
    m(`P_{cp}\\coloneq ${num(c.compression)}\\mathrm{kip}`, "The most compression");
    m("A_{1}\\coloneq N_{p}^{2}=", undefined, "in^2");
    m(ok("P_{cp}", "0.70\\cdot0.85\\cdot f'_{cp}\\cdot A_{1}"), "Concrete under the plate, AASHTO 5.6.5 (A2 taken as A1, φb 0.70)");
    m("l_{cp}\\coloneq\\max\\left(\\frac{N_{p}-0.8\\cdot D_{o}}{2},\\frac{D_{o}}{4}\\right)=", "Cantilever from the casing, AISC Design Guide 1, 3.1.3", "in");
    m("t_{min}\\coloneq l_{cp}\\cdot\\sqrt{\\frac{2\\cdot P_{cp}}{0.9\\cdot F_{yl}\\cdot A_{1}}}=", "Plate thickness needed, φ 0.90", "in");
    m(ok("t_{min}", "t_{p}"), "Plate thickness");
    m(`w_{f}\\coloneq ${num(p.weld)}\\mathrm{in}`, "Fillet weld all round the casing");
    m(`F_{exx}\\coloneq ${num(p.Fexx)}\\mathrm{ksi}`, "Electrode");
    m("R_{w}\\coloneq0.8\\cdot0.6\\cdot F_{exx}\\cdot0.707\\cdot w_{f}\\cdot\\pi\\cdot D_{o}=", "AASHTO Eq. 6.13.3.2.4b-1, φe2 0.80", "kip");
    m(ok("P_{u}", "R_{w}"), "Weld");
  }
  void service;
}

// --- abutment ----------------------------------------------------------------------------------------------------------

/** A reinforced section per foot: its effective depth, steel, stress block, resistance; minimum steel and crack control where the engine checks them. */
function member(w: Writer, k: string, name: string, o: { Mu: string; Ms?: string; h: number; cover: number; bars: Bars; min?: boolean; crack?: boolean; exposure: 1 | 2 }) {
  const { m } = w;
  const b = BARS[o.bars.bar];
  m(`h_{${k}}\\coloneq ${num(o.h)}\\mathrm{in}`, `${name}: thickness`);
  m(`c_{${k}}\\coloneq ${num(o.cover)}\\mathrm{in}`, "Cover to the bars");
  m(`s_{${k}}\\coloneq ${num(o.bars.spacing)}\\mathrm{in}`, `#${o.bars.bar} bars, spacing`);
  m(`d_{e${k}}\\coloneq h_{${k}}-c_{${k}}-\\frac{${num(b.dia)}\\mathrm{in}}{2}=`, "Effective depth", "in");
  m(`A_{s${k}}\\coloneq\\frac{${num(b.area)}\\mathrm{in}^{2}}{s_{${k}}}=`, "Steel per foot", "in^2/ft");
  m(`a_{${k}}\\coloneq\\frac{A_{s${k}}\\cdot f_{y}}{0.85\\cdot f'_{c}}=`, "Stress block depth", "in");
  m(`M_{u${k}}\\coloneq ${o.Mu}`, "Factored moment", o.Mu.endsWith("=") ? "kip*ft/ft" : undefined);
  m(`M_{r${k}}\\coloneq\\phi_{f}\\cdot A_{s${k}}\\cdot f_{y}\\cdot\\left(d_{e${k}}-\\frac{a_{${k}}}{2}\\right)=`, "AASHTO 5.6.3.2", "kip*ft/ft");
  m(ok(`M_{u${k}}`, `M_{r${k}}`), "Flexure");
  if (o.min) {
    m(`M_{cr${k}}\\coloneq0.67\\cdot1.6\\cdot f_{r}\\cdot\\frac{h_{${k}}^{2}}{6}=`, "Cracking moment, AASHTO Eq. 5.6.3.3-1 (γ1 1.6, γ3 0.67)", "kip*ft/ft");
    m(ok(`\\min\\left(1.33\\cdot M_{u${k}},M_{cr${k}}\\right)`, `M_{r${k}}`), "Minimum reinforcement, AASHTO 5.6.3.3");
  }
  if (o.crack && o.Ms) {
    m(`M_{s${k}}\\coloneq ${o.Ms}`, "Service I moment", o.Ms.endsWith("=") ? "kip*ft/ft" : undefined);
    m(`\\rho_{${k}}\\coloneq\\frac{A_{s${k}}}{d_{e${k}}}=`);
    m(`k_{${k}}\\coloneq\\sqrt{2\\cdot\\rho_{${k}}\\cdot n_{m}+\\left(\\rho_{${k}}\\cdot n_{m}\\right)^{2}}-\\rho_{${k}}\\cdot n_{m}=`);
    m(`f_{ss${k}}\\coloneq\\frac{M_{s${k}}}{A_{s${k}}\\cdot\\left(1-\\frac{k_{${k}}}{3}\\right)\\cdot d_{e${k}}}=`, "Service steel stress", "ksi");
    m(`d_{c${k}}\\coloneq c_{${k}}+\\frac{${num(b.dia)}\\mathrm{in}}{2}=`, undefined, "in");
    m(`\\beta_{s${k}}\\coloneq1+\\frac{d_{c${k}}}{0.7\\cdot\\left(h_{${k}}-d_{c${k}}\\right)}=`);
    m(`s_{max${k}}\\coloneq\\frac{700\\cdot${o.exposure === 1 ? "1.00" : "0.75"}\\cdot\\frac{\\mathrm{kip}}{\\mathrm{in}}}{\\beta_{s${k}}\\cdot f_{ss${k}}}-2\\cdot d_{c${k}}=`, `Crack control, AASHTO Eq. 5.6.7-1 (Class ${o.exposure})`, "in");
    m(ok(`s_{${k}}`, `s_{max${k}}`), "Bar spacing");
  }
}

/** One-way shear per foot, β = 2 (AASHTO 5.7.3.4.1), dv = de − a/2, not less than 0.9 de or 0.72 h (5.7.2.8), on member mk's bars. */
type WingEnd = NonNullable<NonNullable<NonNullable<AbutmentResult["integral"]>["wing"]>["end"]>;

/** The abutment's end section under a wingwall's Section B (the engine's wingEnd), k naming its variables. */
function wingEndWorked(w: Writer, e: WingEnd, k: string) {
  const { text, m } = w;
  text(`${e.name}:- the wingwall's Section B, Strength I, from the Cantilever Wingwall's design with this abutment's height, width, skew and backfill. Its thrust P is square to the wingwall: on the skew θ, P cos θ runs along the abutment as tension (P sin θ, square to it, is below). My is the corner's moment; its tension face is the abutment's back face, where the wingwall's corner bars run with the abutment's own bars.${e.MrX ? " Mx adds the abutment's own moment at its end support." : " Mx is in the wall's own plane, as deep as the wall: not checked."}`, undefined, { keepWithNext: true });
  m(`N_{w${k}}\\coloneq ${num(e.Nu / e.cos, 3)}\\mathrm{kip}\\cdot${num(e.cos, 4)}=`, "The wingwall's thrust × cos θ, tension", "kip");
  m(`M_{yw${k}}\\coloneq ${num(e.Myu, 3)}\\mathrm{kip}\\cdot\\mathrm{ft}`, "About the vertical axis");
  if (e.MrX) m(`M_{xw${k}}\\coloneq ${num(e.Mxu, 3)}\\mathrm{kip}\\cdot\\mathrm{ft}`, "About the horizontal axis: the wingwall's Mx × cos θ, with the end support's own");
  m(`A_{bw${k}}\\coloneq ${num(e.AsFace, 3)}\\mathrm{in}^{2}+${num(e.AsCorner, 3)}\\mathrm{in}^{2}=`, "The back face's bars over the height: its own and the corner bars", "in^2");
  m(`d_{yw${k}}\\coloneq ${num(e.dFace, 3)}\\mathrm{in}`, "To them from the front face");
  m(`a_{yw${k}}\\coloneq\\frac{A_{bw${k}}\\cdot f_{y}}{0.85\\cdot f'_{c}\\cdot${num(e.h, 3)}\\mathrm{in}}=`, "Over the section's height", "in");
  m(`M_{ryw${k}}\\coloneq0.9\\cdot A_{bw${k}}\\cdot f_{y}\\cdot\\left(d_{yw${k}}-\\frac{a_{yw${k}}}{2}\\right)=`, "AASHTO 5.6.3.2", "kip*ft");
  m(`P_{rw${k}}\\coloneq0.9\\cdot\\left(${num(e.AsLong, 3)}\\mathrm{in}^{2}+${num(e.AsCorner, 3)}\\mathrm{in}^{2}\\right)\\cdot f_{y}=`, "All the bars along the abutment, in tension", "kip");
  if (e.MrX) m(`M_{rxw${k}}\\coloneq ${num(e.MrX, 3)}\\mathrm{kip}\\cdot\\mathrm{ft}`, "The lesser of the top and bottom bars' resistance");
  m(ok(`\\frac{N_{w${k}}}{P_{rw${k}}}+\\frac{M_{yw${k}}}{M_{ryw${k}}}${e.MrX ? `+\\frac{M_{xw${k}}}{M_{rxw${k}}}` : ""}`, "1"), "Linear interaction, AASHTO 5.6.2");
  if (!e.Tcr) return;
  m(`T_{uw${k}}\\coloneq ${num(e.Tu, 3)}\\mathrm{kip}\\cdot\\mathrm{ft}`, "The wingwall's weight about the abutment's axis (its T_z)");
  m(`A_{cp${k}}\\coloneq ${num(e.b, 3)}\\mathrm{in}\\cdot${num(e.h, 3)}\\mathrm{in}=`, undefined, "in^2");
  m(`p_{c${k}}\\coloneq2\\cdot\\left(${num(e.b, 3)}\\mathrm{in}+${num(e.h, 3)}\\mathrm{in}\\right)=`, undefined, "in");
  m(`T_{cr${k}}\\coloneq0.126\\cdot\\sqrt{\\frac{f'_{c}}{\\mathrm{ksi}}}\\cdot\\mathrm{ksi}\\cdot\\frac{A_{cp${k}}^{2}}{p_{c${k}}}=`, "AASHTO Eq. 5.7.2.1-4, K = 1", "kip*ft");
  if (e.neglect) {
    m(ok(`T_{uw${k}}`, `0.25\\cdot0.9\\cdot T_{cr${k}}`), "Below the threshold: torsion neglected, AASHTO 5.7.2.1");
    return;
  }
  text("Over the threshold 0.25 φ Tcr (AASHTO 5.7.2.1): closed stirrups take the torsion with the shear (5.7.3.6.2, θ 45°).", undefined, { keepWithNext: true });
  const t = e.tors;
  if (!t || !e.stirrup) return;
  m(`A_{o${k}}\\coloneq0.85\\cdot${num(t.x0, 3)}\\mathrm{in}\\cdot${num(t.y0, 3)}\\mathrm{in}=`, "0.85 Aoh, to the stirrups' centerline", "in^2");
  m(`a_{t${k}}\\coloneq\\frac{T_{uw${k}}}{0.9\\cdot2\\cdot A_{o${k}}\\cdot f_{y}}=`, "One leg, per inch", "in^2/in");
  m(`a_{v${k}}\\coloneq ${num(t.Av, 5)}\\frac{\\mathrm{in}^{2}}{\\mathrm{in}}`, "For the shear, all legs: (Vu/φ − Vc)/(fy dv), not less than 0");
  m(`a_{h${k}}\\coloneq\\frac{${e.stirrup.legs}\\cdot${num(BARS[e.stirrup.bar].area)}\\mathrm{in}^{2}}{${num(e.stirrup.spacing)}\\mathrm{in}}=`, `${e.stirrup.legs} legs of #${e.stirrup.bar} @ ${num(e.stirrup.spacing)} in`, "in^2/in");
  m(ok(`a_{v${k}}+2\\cdot a_{t${k}}`, `a_{h${k}}`), "Transverse, AASHTO 5.7.3.6.2");
  m(`A_{l${k}}\\coloneq\\frac{T_{uw${k}}\\cdot${num(t.ph, 3)}\\mathrm{in}}{0.9\\cdot2\\cdot A_{o${k}}\\cdot f_{y}}=`, "Longitudinal round the perimeter ph, AASHTO 5.7.3.6.3", "in^2");
  m(ok(`A_{l${k}}`, `2\\cdot${num(e.AsFace, 3)}\\mathrm{in}^{2}`), "The face bars, both faces");
}

function shear(w: Writer, k: string, Vu: string, mk: string, ref: string) {
  w.m(`V_{u${k}}\\coloneq ${Vu}`, "Factored shear", Vu.endsWith("=") ? "kip/ft" : undefined);
  w.m(`d_{v${k}}\\coloneq\\max\\left(d_{e${mk}}-\\frac{a_{${mk}}}{2},0.9\\cdot d_{e${mk}},0.72\\cdot h_{${mk}}\\right)=`, "AASHTO 5.7.2.8", "in");
  w.m(`V_{r${k}}\\coloneq\\phi_{v}\\cdot0.0316\\cdot2\\cdot\\sqrt{\\frac{f'_{c}}{\\mathrm{ksi}}}\\cdot\\mathrm{ksi}\\cdot d_{v${k}}=`, "AASHTO Eq. 5.7.3.3-3, β 2", "kip/ft");
  w.m(ok(`V_{u${k}}`, `V_{r${k}}`), ref);
}

/** The abutment's checks worked out: its movement and CDOT's limits, then (by type) the integral cap and its foundation, or the seat abutment's stability, foundation, stem, backwall and footing. */
export function abutmentWorked(w: Writer, i: AbutmentInputs, r: AbutmentResult) {
  const { text, m } = w;
  const integral = i.type.startsWith("integral");
  text("Movement at the abutment (AASHTO 3.12.2, CDOT BDM 11.3.1)", "subheading", { keepWithNext: true });
  m(`L_{u}\\coloneq ${num(i.unitLength)}\\mathrm{ft}`, "Bridge unit length");
  m(`\\alpha_{t}\\coloneq ${num(i.alpha * 1e6)}\\cdot10^{-6}`, "Per °F");
  m(`T_{hi}\\coloneq ${num(Math.max(0, i.tMax - 60))}`, "°F above the 60 °F base, CDOT BDM 11.3.1");
  m(`T_{lo}\\coloneq ${num(Math.max(0, 60 - i.tMin))}`, "°F below it");
  m(`\\Delta_{cs}\\coloneq ${num(i.csMove)}\\mathrm{in}`, "Creep, shrinkage, elastic shortening");
  m("\\Delta_{e}\\coloneq\\alpha_{t}\\cdot\\frac{L_{u}}{2}\\cdot T_{hi}=", "Expansion from the unit's middle", "in");
  m("\\Delta_{c}\\coloneq\\alpha_{t}\\cdot\\frac{L_{u}}{2}\\cdot T_{lo}+\\Delta_{cs}=", "Contraction", "in");

  text("Materials", "subheading", { keepWithNext: true });
  m(`f'_{c}\\coloneq ${num(i.fc)}\\mathrm{ksi}`, "Concrete");
  m(`f_{y}\\coloneq ${num(i.fy)}\\mathrm{ksi}`, "Reinforcing steel");
  m(`\\gamma_{c}\\coloneq ${num(i.gammaC)}\\mathrm{kcf}`, "Concrete unit weight");
  m("E_{s}\\coloneq29000\\mathrm{ksi}");
  m("E_{c}\\coloneq120000\\cdot\\left(\\frac{\\gamma_{c}}{\\mathrm{kcf}}\\right)^{2}\\cdot\\left(\\frac{f'_{c}}{\\mathrm{ksi}}\\right)^{0.33}\\cdot\\mathrm{ksi}=", "AASHTO Eq. 5.4.2.4-1", "ksi");
  m("n_{m}\\coloneq\\frac{E_{s}}{E_{c}}=", "Modular ratio");
  m("f_{r}\\coloneq0.24\\cdot\\sqrt{\\frac{f'_{c}}{\\mathrm{ksi}}}\\cdot\\mathrm{ksi}=", "Modulus of rupture, AASHTO 5.4.2.6", "ksi");
  m("\\phi_{f}\\coloneq0.9", "Flexure, AASHTO 5.5.4.2");
  m("\\phi_{v}\\coloneq0.9", "Shear");
  m(`\\gamma_{s}\\coloneq ${num(i.backfillGamma / 1000)}\\mathrm{kcf}`, "Backfill unit weight");
  m(`\\phi_{bf}\\coloneq ${num(i.backfillPhi)}\\mathrm{deg}`, "Backfill friction angle");
  m(`n_{g}\\coloneq ${i.nGirders}`, "Girders");
  m(`R_{DC}\\coloneq ${num(i.RDC)}\\mathrm{kip}`, "Each girder's DC reaction");
  m(`R_{DW}\\coloneq ${num(i.RDW)}\\mathrm{kip}`, "DW");
  const LL = abutmentLiveLoad(i);
  m(`LL_{t}\\coloneq ${num(LL)}\\mathrm{kip}`, (i.RLane ?? 0) > 0 && (i.lanes ?? 0) >= 1 ? `The live load on the abutment, no IM: the most of k lanes × multiple presence × ${num(i.RLane ?? 0)} kip a lane (AASHTO 3.6.1.1.2, 3.6.2.1)` : `The girders × ${num(i.RLL)} kip each, no IM (AASHTO 3.6.2.1)`);

  if (integral && r.integral) integralWorked(w, i, r, r.integral);
  else if (r.seat) seatWorked(w, i, r, r.seat);
}

function integralWorked(w: Writer, i: AbutmentInputs, r: AbutmentResult, g: NonNullable<AbutmentResult["integral"]>) {
  const { text, m } = w;
  m(`\\gamma_{TU}\\coloneq ${num(i.gammaTU)}`, "AASHTO Table 3.4.1-1, deformations");
  m(ok("\\gamma_{TU}\\cdot\\max\\left(\\Delta_{e},\\Delta_{c}\\right)", "2\\mathrm{in}"), "CDOT BDM 11.3.1");
  m(ok("L_{u}", "460\\mathrm{ft}"), "CDOT BDM Table 11-1");
  text("CDOT's limits for integral abutments (BDM 11.3.1)", "subheading", { keepWithNext: true });
  m(ok(`${num(i.grade)}`, "5"), "Grade between the unit's ends, %");
  m(ok(`${num(i.skew)}\\mathrm{deg}`, "30\\mathrm{deg}"), "Skew");
  m(ok(`${num(i.curvature)}\\mathrm{deg}`, "5\\mathrm{deg}"), "Degree of curvature");
  m(`d_{cap}\\coloneq ${num(i.capDepth)}\\mathrm{ft}`, "Pile cap depth");
  m(ok("d_{cap}", "6\\mathrm{ft}"), "At most 6 ft");
  m(ok("3.5\\mathrm{ft}", "d_{cap}"), "At least 3.5 ft");
  m(ok("1.5\\mathrm{ft}", `${num(i.capEmbed)}\\mathrm{ft}`), "The cap's bottom embedded in the embankment");
  m(ok("2\\mathrm{ft}", `${num(i.girderClear)}\\mathrm{ft}`), "Embankment to the girders' bottom");
  text(`Depth, top of deck to the cap's bottom:- ${num(i.totalDepth)} ft (typically 13 ft or less, for information).`);
  if (i.type === "integral-micropiles") {
    const mp = { ...i.micropile };
    m(ok("10\\mathrm{ft}", `${num((mp.cased ?? 0) + (mp.bond ?? 0))}\\mathrm{ft}`), "Micropiles at least 10 ft below the cap (CDOT BDM 11.3)");
  }

  text("Loads on the foundation (no IM below ground, AASHTO 3.6.2.1)", "subheading", { keepWithNext: true });
  m(`L_{a}\\coloneq ${num(i.length)}\\mathrm{ft}`, "Abutment length");
  m(`W_{cap}\\coloneq ${num(i.capWidth)}\\mathrm{ft}`, "Cap width");
  m(`D_{t}\\coloneq ${num(i.totalDepth)}\\mathrm{ft}`, "Top of deck to the cap's bottom (cap and diaphragm)");
  m("w_{cap}\\coloneq\\gamma_{c}\\cdot W_{cap}\\cdot D_{t}=", "Cap and diaphragm, solid", "kip/ft");
  m(`w_{ap}\\coloneq0.5\\cdot${num(i.approachDC)}\\frac{\\mathrm{kip}}{\\mathrm{ft}}=`, "Half the approach slab", "kip/ft");
  m("W_{DC}\\coloneq n_{g}\\cdot R_{DC}+\\left(w_{cap}+w_{ap}\\right)\\cdot L_{a}=", "DC on the foundation", "kip");
  m("V_{u}\\coloneq1.25\\cdot W_{DC}+1.5\\cdot n_{g}\\cdot R_{DW}+1.75\\cdot LL_{t}=", "Strength I, the whole abutment", "kip");
  m("V_{s}\\coloneq W_{DC}+n_{g}\\cdot R_{DW}+LL_{t}=", "Service I", "kip");
  m(`\\delta_{h}\\coloneq ${num(i.thermalForce)}\\cdot\\max\\left(\\Delta_{e},\\Delta_{c}\\right)=`, "The movement the foundation is pushed through (its force factor on the thermal movement)", "in");

  const f = g.foundation;
  if (f?.kind === "piles") {
    text(`H-piles, ${i.section}: one row of ${g.n}`, "subheading", { keepWithNext: true });
    m(`n_{p}\\coloneq ${g.n}`, "Piles");
    m("P_{u}\\coloneq\\frac{V_{u}}{n_{p}}=", "Each pile", "kip");
    m(`R_{n}\\coloneq ${num(i.Rn)}\\mathrm{kip}`, "Nominal geotechnical resistance, geotechnical report");
    m(`\\phi_{dyn}\\coloneq ${num(i.phiDyn * (g.n <= 3 ? 0.8 : 1))}`, g.n <= 3 ? "AASHTO Table 10.5.5.2.3-1 × 0.8, three piles or fewer (CDOT BDM 10.5.2.2)" : "AASHTO Table 10.5.5.2.3-1");
    m(ok("P_{u}", "\\phi_{dyn}\\cdot R_{n}"), "Geotechnical axial, AASHTO 10.5.5.2.3");
    text(`Method:- the pile's head pinned at the cap (CDOT BDM 11.3.1) and pushed through δh by p–y (FHWA GEC 9)${i.prebore > 0 ? `, ${i.prebore} ft preboring ${i.peaGravel ? "filled with pea gravel" : "left open"}` : ""}; buckling over the unconfined length and the depth to fixity, K 2.1.`);
    m(`M_{py}\\coloneq ${num(f.lat.Mmax)}\\mathrm{kip}\\cdot\\mathrm{ft}`, "Largest moment, weak axis, p–y analysis");
    m(`P_{r}\\coloneq ${num(f.Pr)}\\mathrm{kip}`, `φc 0.70 × Pn (AASHTO 6.9.4.1)${f.KL > 0 ? `, KL ${num(f.KL)} in` : ""}`);
    m(`M_{ry}\\coloneq ${num(f.Mry / 12)}\\mathrm{kip}\\cdot\\mathrm{ft}`, "φf 1.0 × Mny, weak axis (AASHTO 6.12.2.2.1)");
    const expr = f.inter.eq.endsWith("-1") ? "\\frac{P_{u}}{2\\cdot P_{r}}+\\frac{M_{py}}{M_{ry}}" : f.inter.eq.endsWith("-2") ? "\\frac{P_{u}}{P_{r}}+\\frac{8}{9}\\cdot\\frac{M_{py}}{M_{ry}}" : "\\frac{P_{u}}{P_{r}}+\\frac{M_{py}}{M_{ry}}";
    m(ok(expr, "1"), `Axial with flexure, AASHTO Eq. ${f.inter.eq}`);
  } else if (f?.kind === "micropiles") {
    const gp = groupProps(f.group);
    const k = f.fS.indexOf(Math.max(...f.fS));
    const p = f.group[k];
    text(`Micropiles: ${f.nPiles} in ${g.rowsMP} rows under the cap (a rigid cap, FHWA GEC 12 9.8)`, "subheading", { keepWithNext: true });
    m(`n_{mp}\\coloneq ${f.nPiles}`, "Micropiles");
    m(`M_{x}\\coloneq ${num(i.groupMoment)}\\mathrm{kip}\\cdot\\mathrm{ft}`, "The group's moment across the rows, Strength I (the integral frame's end moments, from the girder design)");
    m(`M_{y}\\coloneq ${num(i.groupMomentAlong ?? 0)}\\mathrm{kip}\\cdot\\mathrm{ft}`, "Along the abutment (the lanes off center)");
    m(`\\Sigma_{y2}\\coloneq ${num(gp.Sy2)}\\mathrm{ft}^{2}`, "Σ(y − yc)² over the micropiles, across the rows");
    m(`\\Sigma_{x2}\\coloneq ${num(gp.Sx2)}\\mathrm{ft}^{2}`, "Σ(x − xc)², along the abutment");
    m(`y_{k}\\coloneq ${num(p.y - gp.yc)}\\mathrm{ft}`, "The most loaded micropile, from the centroid across the rows");
    m(`x_{k}\\coloneq ${num(p.x - gp.xc)}\\mathrm{ft}`, "and along the abutment");
    m(`\\beta_{k}\\coloneq ${num(p.batter)}\\mathrm{deg}`, "Its batter");
    const sy = gp.Sy2 > 0 ? "+\\frac{M_{x}\\cdot y_{k}}{\\Sigma_{y2}}" : "";
    const sx = gp.Sx2 > 0 ? "+\\frac{M_{y}\\cdot x_{k}}{\\Sigma_{x2}}" : "";
    m(`P_{mx}\\coloneq\\frac{\\frac{V_{u}}{n_{mp}}${sy}${sx}}{\\cos\\left(\\beta_{k}\\right)}=`, "Along its axis", "kip");
    micropileWorked(w, f.mpIn, r.micropileResult!);
    text("Micropile: the movement's moment (pinned head, CDOT BDM 11.3.1)", "subheading", { keepWithNext: true });
    text("Method:- the micropile's head pinned at the cap and pushed through δh by p–y (FHWA GEC 9); the casing bends with its axial load.");
    m(`M_{mv}\\coloneq ${num(f.lat.Mmax)}\\mathrm{kip}\\cdot\\mathrm{ft}`, "Largest moment, p–y analysis");
    m(`Z_{m}\\coloneq ${num(f.Zc)}\\mathrm{in}^{3}`, "The casing's plastic modulus (no corrosion allowance in the movement's check)");
    m("M_{rm}\\coloneq1.0\\cdot\\min\\left(f_{yp},80\\mathrm{ksi}\\right)\\cdot Z_{m}=", "AASHTO 6.12.2.2.3, φf 1.0", "kip*ft");
    m(`P_{rm}\\coloneq ${num(f.Pr)}\\mathrm{kip}`, "The micropile's compressive resistance (above)");
    m(ok("\\frac{P_{mx}}{P_{rm}}+\\frac{M_{mv}}{M_{rm}}", "1"), "AASHTO 10.9.3.10.1, 6.9.2.2");
  } else if (f?.kind === "shafts") {
    text(`Drilled shafts, ${num(i.shaftD)} in`, "subheading", { keepWithNext: true });
    m(`n_{p}\\coloneq ${g.n}`, "Shafts");
    m("P_{u}\\coloneq\\frac{V_{u}}{n_{p}}=", "Each shaft", "kip");
    m(`R_{n}\\coloneq ${num(i.Rn)}\\mathrm{kip}`, "Nominal axial resistance (the Drilled Shaft tool)");
    m(`\\phi_{dyn}\\coloneq ${num(i.phiDyn)}`);
    m(ok("P_{u}", "\\phi_{dyn}\\cdot R_{n}"), "Axial, AASHTO 10.8.3.5");
    m(`M_{py}\\coloneq ${num(f.lat.Mmax)}\\mathrm{kip}\\cdot\\mathrm{ft}`, "Largest moment, the shaft pushed through δh by p–y, its top pinned");
    m(`M_{rs}\\coloneq ${num(f.phiMn)}\\mathrm{kip}\\cdot\\mathrm{ft}`, "Its resistance at Pu, by strain compatibility (AASHTO 5.6.4.5)");
    m(ok("M_{py}", "M_{rs}"), "Axial with flexure");
  }

  // The cap over the piles.
  text("The cap: a continuous beam over the piles", "subheading", { keepWithNext: true });
  text("Method:- the cap and diaphragm (cast together) as a beam on point supports at the piles, the girders' factored reactions with IM as point loads, its own weight and half the approach slab spread; solved by the stiffness method.");
  m(`R_{LL}\\coloneq ${num(i.RLL)}\\mathrm{kip}`, "Each girder's live load reaction");
  m(`I_{M}\\coloneq ${num(i.IM)}`, "Dynamic load allowance");
  m("P_{g}\\coloneq1.25\\cdot R_{DC}+1.5\\cdot R_{DW}+1.75\\cdot R_{LL}\\cdot\\left(1+I_{M}\\right)=", "Each girder, Strength I", "kip");
  m("w_{u}\\coloneq1.25\\cdot\\left(w_{cap}+w_{ap}\\right)=", undefined, "kip/ft");
  m(`M_{pos}\\coloneq ${num(g.beam.Mpos)}\\mathrm{kip}\\cdot\\mathrm{ft}`, "Largest positive moment, the beam");
  m(`M_{neg}\\coloneq ${num(g.beam.Mneg)}\\mathrm{kip}\\cdot\\mathrm{ft}`, "Largest negative moment");
  m(`V_{cap}\\coloneq ${num(g.beam.Vmax)}\\mathrm{kip}`, "Largest shear");
  m("b_{c}\\coloneq W_{cap}=", undefined, "in");
  m("h_{c}\\coloneq D_{t}=", undefined, "in");
  m(`d_{c}\\coloneq h_{c}-${num(i.cover)}\\mathrm{in}-0.625\\mathrm{in}-\\frac{${num(BARS[i.capBot.bar].dia)}\\mathrm{in}}{2}=`, "To the bottom bars", "in");
  m(`A_{sb}\\coloneq ${i.capBot.count}\\cdot${num(BARS[i.capBot.bar].area)}\\mathrm{in}^{2}=`, `${i.capBot.count} #${i.capBot.bar} bottom`, "in^2");
  m(`A_{st}\\coloneq ${i.capTop.count}\\cdot${num(BARS[i.capTop.bar].area)}\\mathrm{in}^{2}=`, `${i.capTop.count} #${i.capTop.bar} top`, "in^2");
  m("M_{rb}\\coloneq\\phi_{f}\\cdot A_{sb}\\cdot f_{y}\\cdot\\left(d_{c}-\\frac{A_{sb}\\cdot f_{y}}{2\\cdot0.85\\cdot f'_{c}\\cdot b_{c}}\\right)=", "AASHTO 5.6.3.2", "kip*ft");
  m("M_{rt}\\coloneq\\phi_{f}\\cdot A_{st}\\cdot f_{y}\\cdot\\left(d_{c}-\\frac{A_{st}\\cdot f_{y}}{2\\cdot0.85\\cdot f'_{c}\\cdot b_{c}}\\right)=", undefined, "kip*ft");
  m(ok("M_{pos}", "M_{rb}"), "Positive moment");
  m(ok("M_{neg}", "M_{rt}"), "Negative moment");
  m("M_{crc}\\coloneq0.67\\cdot1.6\\cdot f_{r}\\cdot\\frac{b_{c}\\cdot h_{c}^{2}}{6}=", "AASHTO Eq. 5.6.3.3-1", "kip*ft");
  m(ok("\\min\\left(1.33\\cdot M_{pos},M_{crc}\\right)", "M_{rb}"), "Minimum reinforcement, AASHTO 5.6.3.3");
  m("d_{vc}\\coloneq\\max\\left(0.9\\cdot d_{c},0.72\\cdot h_{c}\\right)=", "AASHTO 5.7.2.8", "in");
  m("V_{cc}\\coloneq0.0316\\cdot2\\cdot\\sqrt{\\frac{f'_{c}}{\\mathrm{ksi}}}\\cdot\\mathrm{ksi}\\cdot b_{c}\\cdot d_{vc}=", "AASHTO Eq. 5.7.3.3-3, β 2", "kip");
  m(`V_{sc}\\coloneq\\frac{${i.stirrup.legs}\\cdot${num(BARS[i.stirrup.bar].area)}\\mathrm{in}^{2}\\cdot f_{y}\\cdot d_{vc}}{${num(i.stirrup.spacing)}\\mathrm{in}}=`, `${i.stirrup.legs} legs of #${i.stirrup.bar} @ ${num(i.stirrup.spacing)} in, AASHTO Eq. 5.7.3.3-4`, "kip");
  m(ok("V_{cap}", "\\phi_{v}\\cdot\\min\\left(V_{cc}+V_{sc},0.25\\cdot f'_{c}\\cdot b_{c}\\cdot d_{vc}\\right)"), "Shear, AASHTO 5.7.3.3");
  if (g.wing) {
    const gw = g.wing;
    text("The wingwalls on the cap's ends", "subheading", { keepWithNext: true });
    text(`Each wingwall's weight × 1.25 on the cap's end${(i.wing?.count ?? 2) === 2 ? "s" : ""} is in the beam above. The end pile takes it on the overhang with its average load, the cap rigid between the end supports.`, undefined, { keepWithNext: true });
    m(`P_{w}\\coloneq ${num(gw.Pw, 3)}\\mathrm{kip}`, "The wingwall's weight, Strength I (the Cantilever Wingwall's V_wu)");
    m(`\\lambda_{o}\\coloneq ${num(gw.lever, 3)}`, "The overhang over the span to the next support");
    m(`P_{ue}\\coloneq ${num(g.Pu, 3)}\\mathrm{kip}+P_{w}\\cdot\\left(1+\\lambda_{o}\\right)=`, "The end pile, Strength I", "kip");
    const ax = r.checks.find((c) => c.id === "wing-pile-axial" || c.id === "wing-shaft-geo");
    const geo = r.checks.find((c) => c.id === "wing-pile-geo");
    if (ax) m(ok("P_{ue}", `${num(ax.capacity, 3)}\\mathrm{kip}`), ax.name);
    if (geo) m(ok("P_{ue}", `${num(geo.capacity, 3)}\\mathrm{kip}`), geo.name);
    if (gw.end) wingEndWorked(w, gw.end, "c");
    const pu = gw.push;
    if (pu && gw.end) {
      text("The wingwall's push square to the abutment:- P sin θ pushes the cap and diaphragm's end past the exterior girder, which carries it into the superstructure. The end is a horizontal cantilever from that girder, with the wingwall's My, the passive pressure on it (1.35, AASHTO 3.11.5.4) and the tension along it. The corner bars count by how far they run past the girder against their ℓd.", undefined, { keepWithNext: true });
      m(`H_{wc}\\coloneq ${num(gw.end.Nu / gw.end.cos, 3)}\\mathrm{kip}\\cdot\\sin\\left(${num(Math.abs(i.skew))}\\mathrm{deg}\\right)=`, "The wingwall's thrust × sin θ", "kip");
      m(`a_{g}\\coloneq ${num(pu.a, 3)}\\mathrm{ft}`, "The cap's end to the exterior girder");
      m(`p_{oh}\\coloneq ${num(pu.pOh, 3)}\\frac{\\mathrm{kip}}{\\mathrm{ft}}`, "Passive pressure on the end, 1.35 × 0.5 Kp γs H², per foot along it");
      m("M_{pc}\\coloneq M_{ywc}+H_{wc}\\cdot a_{g}+\\frac{p_{oh}\\cdot a_{g}^{2}}{2}=", "About the vertical axis, at the girder", "kip*ft");
      m(`k_{C}\\coloneq\\min\\left(1,\\frac{${num(pu.past, 3)}\\mathrm{in}}{${num(pu.ld, 3)}\\mathrm{in}}\\right)=`, "The corner bars past the girder over their ℓd (AASHTO 5.10.8.2.1)");
      m(`A_{pc}\\coloneq ${num(pu.AsF - pu.kC * gw.end.AsCorner, 3)}\\mathrm{in}^{2}+k_{C}\\cdot${num(gw.end.AsCorner, 3)}\\mathrm{in}^{2}=`, "The back face's bars there", "in^2");
      m(`a_{pc}\\coloneq\\frac{A_{pc}\\cdot f_{y}}{0.85\\cdot f'_{c}\\cdot${num(gw.end.h, 3)}\\mathrm{in}}=`, undefined, "in");
      m("M_{rpc}\\coloneq0.9\\cdot A_{pc}\\cdot f_{y}\\cdot\\left(d_{ywc}-\\frac{a_{pc}}{2}\\right)=", "AASHTO 5.6.3.2", "kip*ft");
      m(`P_{rpc}\\coloneq ${num(pu.PrF, 3)}\\mathrm{kip}`, "All the bars along the abutment there, in tension");
      m(`M_{xpc}\\coloneq ${num(pu.Mx, 3)}\\mathrm{kip}\\cdot\\mathrm{ft}`, "About the horizontal axis: the wingwall's, with the cap's own at the girder");
      m(ok("\\frac{N_{wc}}{P_{rpc}}+\\frac{M_{pc}}{M_{rpc}}+\\frac{M_{xpc}}{M_{rxwc}}", "1"), "Linear interaction, AASHTO 5.6.2");
      m("V_{pc}\\coloneq H_{wc}+p_{oh}\\cdot a_{g}=", "Its shear there", "kip");
      m(`d_{vpc}\\coloneq ${num(pu.dvH, 3)}\\mathrm{in}`, "Across the cap's width, AASHTO 5.7.2.8");
      m(ok("V_{pc}", `0.9\\cdot0.0316\\cdot2\\cdot\\sqrt{\\frac{f'_{c}}{\\mathrm{ksi}}}\\cdot\\mathrm{ksi}\\cdot${num(gw.end.h, 3)}\\mathrm{in}\\cdot d_{vpc}`), "Shear, the concrete alone, AASHTO 5.7.3.3");
    }
  }

  text("The end diaphragm under passive pressure (AASHTO 3.11.5.4)", "subheading", { keepWithNext: true });
  m("K_{p}\\coloneq\\tan\\left(45\\mathrm{deg}+\\frac{\\phi_{bf}}{2}\\right)^{2}=", "Passive, Rankine", "");
  m("p_{b}\\coloneq K_{p}\\cdot\\gamma_{s}\\cdot D_{t}=", "At its bottom", "ksf");
  m(`S_{g}\\coloneq ${num(i.girderSpacing)}\\mathrm{ft}`, "Girder spacing: the diaphragm spans between girders");
  member(w, "d", "Diaphragm, horizontal bars", { Mu: "\\frac{1.35\\cdot p_{b}\\cdot S_{g}^{2}}{10}=", h: i.capWidth * 12, cover: 2, bars: i.diaphragmBars, exposure: i.exposure });

  // Steel girders' ends cast into the diaphragm: studs, the web at the through bars' holes, and the cap-to-diaphragm dowels.
  const se = g.steelEnds;
  if (se) {
    text("Steel girders' ends in the diaphragm (CDOT BDM 11.3.1, Figure 11-1 note 3)", "subheading", { keepWithNext: true });
    text("Method:- as the bridge contracts the girders pull the abutment through the piles' head shears, with braking; each girder's end carries its share into the diaphragm by studs. The web keeps its net section at the holes for the bars through it. The cap and diaphragm, cast apart, are tied by dowels across the joint for the larger of the contraction's pull and the expansion's push of the cap (the passive pressure on its own face with the piles' shears and braking).", undefined, { keepWithNext: true });
    m(`H_{p}\\coloneq ${num(se.piles)}\\mathrm{kip}`, "The foundation elements' head shears at the movement, all of them");
    m(`H_{br}\\coloneq1.75\\cdot ${num(i.braking)}\\mathrm{kip}=`, "Braking, Strength I", "kip");
    m(`T_{g}\\coloneq\\frac{H_{p}+H_{br}}{${i.nGirders}}=`, "Each girder's pull", "kip");
    m(`A_{sc}\\coloneq\\frac{\\pi\\cdot\\left(${num(se.studD, 3)}\\mathrm{in}\\right)^{2}}{4}=`, "One stud", "in^2");
    m(`Q_{r}\\coloneq1.0\\cdot0.70\\cdot A_{sc}\\cdot ${num(se.studFu)}\\mathrm{ksi}=`, "AASHTO Eq. 6.10.10.4.3-1, φsc 1.0", "kip");
    m(ok("T_{g}", `${se.studs}\\cdot Q_{r}`), `${se.studs} studs on each girder's end`);
    m(`V_{end}\\coloneq ${num(se.Vend)}\\mathrm{kip}`, "The girder's end shear, Strength I with IM");
    m(`D_{net}\\coloneq ${num(se.D)}\\mathrm{in}-${se.holes}\\cdot ${num(se.holeD, 4)}\\mathrm{in}=`, "The web less the through bars' holes", "in");
    m(ok("V_{end}", `1.0\\cdot0.58\\cdot ${num(se.Fyw)}\\mathrm{ksi}\\cdot D_{net}\\cdot ${num(se.tw, 4)}\\mathrm{in}`), "AASHTO 6.10.9.2, Vp on the net web");
    m(`p_{cap}\\coloneq ${num(se.pushCap, 3)}\\frac{\\mathrm{kip}}{\\mathrm{ft}}`, "1.35 × the passive pressure's resultant on the cap's face below the joint");
    m(`V_{ui}\\coloneq p_{cap}+\\frac{H_{p}+H_{br}}{${num(i.length)}\\mathrm{ft}}=`, "Across the joint, per foot", "kip/ft");
    m(`A_{cv}\\coloneq ${num(i.capWidth * 12)}\\mathrm{in}\\cdot12\\frac{\\mathrm{in}}{\\mathrm{ft}}=`, "The joint's area, per foot of abutment", "in^2/ft");
    m(`A_{vf}\\coloneq\\frac{${num(BARS[se.dowels.bar].area)}\\mathrm{in}^{2}}{${num(se.dowels.spacing)}\\mathrm{in}}=`, `#${se.dowels.bar} dowels @ ${num(se.dowels.spacing)} in`, "in^2/ft");
    m(`P_{c}\\coloneq ${num(se.Pc, 3)}\\frac{\\mathrm{kip}}{\\mathrm{ft}}`, "The diaphragm's weight on the joint");
    m("V_{ni}\\coloneq0.24\\mathrm{ksi}\\cdot A_{cv}+1.0\\cdot\\left(A_{vf}\\cdot f_{y}+P_{c}\\right)=", "AASHTO Eq. 5.7.4.3-3, roughened 1/4 in (c 0.24 ksi, μ 1.0)", "kip/ft");
    m("V_{nm}\\coloneq\\min\\left(V_{ni},0.25\\cdot f'_{c}\\cdot A_{cv},1.5\\mathrm{ksi}\\cdot A_{cv}\\right)=", "AASHTO 5.7.4.4 (K1 0.25, K2 1.5 ksi)", "kip/ft");
    m(ok("V_{ui}", "0.9\\cdot V_{nm}"), "AASHTO Eq. 5.7.4.3-1");
  }
}

function seatWorked(w: Writer, i: AbutmentInputs, r: AbutmentResult, s: NonNullable<AbutmentResult["seat"]>) {
  const { text, m } = w;
  const semi = i.type === "semi-integral";
  text("Geometry (per foot of abutment)", "subheading", { keepWithNext: true });
  m(`L_{a}\\coloneq ${num(i.length)}\\mathrm{ft}`, "Abutment length");
  m(`T_{t}\\coloneq ${num(i.toe)}\\mathrm{ft}`, "Toe");
  m(`T_{s}\\coloneq ${num(i.stemT)}\\mathrm{ft}`, "Stem thickness");
  m(`T_{h}\\coloneq ${num(i.heel)}\\mathrm{ft}`, "Heel");
  m("B\\coloneq T_{t}+T_{s}+T_{h}=", "Footing width", "ft");
  m(`t_{f}\\coloneq ${num(i.footT)}\\mathrm{ft}`, "Footing depth");
  m(`H_{s}\\coloneq ${num(i.stemH)}\\mathrm{ft}`, "Stem, footing to the seat (the tallest, for the design)");
  m(`H_{b}\\coloneq ${num(i.backwallH)}\\mathrm{ft}`, semi ? "End diaphragm, seat to the deck's top" : "Backwall, seat to the deck's top");
  m(`T_{b}\\coloneq ${num(i.backwallT)}\\mathrm{ft}`, semi ? "End diaphragm width" : "Backwall thickness");
  m("H\\coloneq t_{f}+H_{s}+H_{b}=", "Total height", "ft");
  if (i.pressure === "at-rest") m("K\\coloneq1-\\sin\\left(\\phi_{bf}\\right)=", "At rest (AASHTO Eq. 3.11.5.2-1)");
  else m("K\\coloneq\\tan\\left(45\\mathrm{deg}-\\frac{\\phi_{bf}}{2}\\right)^{2}=", "Active, Rankine (AASHTO 3.11.5.3)");
  const gEH = i.pressure === "at-rest" ? 1.35 : 1.5;
  m(`\\gamma_{EH}\\coloneq ${gEH}`, `AASHTO Table 3.4.1-2, ${i.pressure === "at-rest" ? "at rest" : "active"}`);

  text("Loads per foot and their arms from the toe", "subheading", { keepWithNext: true });
  m("DC_{st}\\coloneq\\gamma_{c}\\cdot T_{s}\\cdot H_{s}=", "Stem", "kip/ft");
  m("DC_{bw}\\coloneq\\gamma_{c}\\cdot T_{b}\\cdot H_{b}=", semi ? "End diaphragm" : "Backwall", "kip/ft");
  m("DC_{ft}\\coloneq\\gamma_{c}\\cdot B\\cdot t_{f}=", "Footing", "kip/ft");
  m("EV_{h}\\coloneq\\gamma_{s}\\cdot T_{h}\\cdot\\left(H_{s}+H_{b}\\right)=", "Soil on the heel", "kip/ft");
  m(`DC_{g}\\coloneq\\frac{n_{g}\\cdot R_{DC}}{L_{a}}+0.5\\cdot${num(i.approachDC)}\\frac{\\mathrm{kip}}{\\mathrm{ft}}=`, "The girders' DC and half the approach slab", "kip/ft");
  m("DW_{g}\\coloneq\\frac{n_{g}\\cdot R_{DW}}{L_{a}}=", undefined, "kip/ft");
  m("LL_{g}\\coloneq\\frac{LL_{t}}{L_{a}}=", "No IM below ground", "kip/ft");
  m("x_{st}\\coloneq T_{t}+\\frac{T_{s}}{2}=", "The stem's arm", "ft");
  m(`e_{b}\\coloneq ${num(s.ecc, 3)}\\mathrm{ft}`, "The bearings from the stem's centerline, toward the span");
  m("x_{br}\\coloneq x_{st}-e_{b}=", "The bearings' arm", "ft");
  m(`x_{dg}\\coloneq ${num(s.items.DC.x, 3)}\\mathrm{ft}`, "DC_g's arm: the girders at the bearings, the approach slab where it sits");
  m("x_{bw}\\coloneq T_{t}+T_{s}-\\frac{T_{b}}{2}=", undefined, "ft");
  m("x_{ft}\\coloneq\\frac{B}{2}=", undefined, "ft");
  m("x_{h}\\coloneq T_{t}+T_{s}+\\frac{T_{h}}{2}=", undefined, "ft");
  m("EH\\coloneq0.5\\cdot K\\cdot\\gamma_{s}\\cdot H^{2}=", "Earth pressure, at H/3", "kip/ft");
  m(`BR\\coloneq\\frac{${num(i.braking)}\\mathrm{kip}}{L_{a}}=`, "Braking (AASHTO 3.6.4)", "kip/ft");
  m(`TU\\coloneq ${num(i.bearingShear)}\\frac{\\mathrm{kip}}{\\mathrm{ft}}`, "The bearings' shear (uniform temperature)");
  m(semi ? "y_{BR}\\coloneq t_{f}+H_{s}+H_{b}=" : "y_{BR}\\coloneq t_{f}+H_{s}=", semi ? "At the deck, through the end diaphragm" : "At the seat", "ft");
  const ls = s.heqW > 0;
  if (ls) {
    m(`h_{eq}\\coloneq ${num(s.heqW, 3)}\\mathrm{ft}`, `Live load surcharge, AASHTO Table 3.11.6.4.1-1 for the ${num(s.H)} ft from the backfill's surface to the footing's bottom (no approach slab, CDOT BDM 11.3)`);
    m("\\Delta_{p}\\coloneq K\\cdot\\gamma_{s}\\cdot h_{eq}=", "AASHTO Eq. 3.11.6.4.1-1", "ksf");
    m("LS_{h}\\coloneq\\Delta_{p}\\cdot H=", "Horizontal, at H/2", "kip/ft");
    m("LS_{v}\\coloneq\\gamma_{s}\\cdot h_{eq}\\cdot T_{h}=", "Vertical on the heel: for bearing only (AASHTO C11.5.6)", "kip/ft");
  } else text("Live load surcharge:- left out, an approach slab carrying the traffic (AASHTO 3.11.6.5; CDOT BDM 11.3).", undefined, { keepWithNext: true });

  text("Load combinations (AASHTO Table 3.4.1-1), moments about the toe", "subheading", { keepWithNext: true });
  const combos = [
    { k: "a", name: "Strength I, maximum", dc: 1.25, dw: 1.5, ev: 1.35, ll: 1.75, tu: 0.5, eh: gEH, lsh: 1.75, lsv: 1.75 },
    { k: "b", name: "Strength I, minimum", dc: 0.9, dw: 0.65, ev: 1.0, ll: 0, tu: 0.5, eh: gEH, lsh: 1.75, lsv: 0 },
    { k: "c", name: "Service I", dc: 1, dw: 1, ev: 1, ll: 1, tu: 1, eh: 1, lsh: 1, lsv: 1 },
  ];
  const wg = s.items.wings.V > 0;
  if (wg) {
    m(`DC_{wg}\\coloneq ${num(s.items.wings.V, 3)}\\frac{\\mathrm{kip}}{\\mathrm{ft}}`, `The wingwalls' weight (${i.wing?.count ?? 2} of ${num(i.wing!.L)} ft), spread along the abutment`);
    m(`x_{wg}\\coloneq ${num(s.items.wings.x, 3)}\\mathrm{ft}`, "Their middle behind the stem, along the skew");
  }
  m(`DC_{t}\\coloneq DC_{st}+DC_{bw}+DC_{ft}+DC_{g}${wg ? "+DC_{wg}" : ""}=`, "All DC", "kip/ft");
  if (wg) {
    m("M_{DC0}\\coloneq DC_{st}\\cdot x_{st}+DC_{bw}\\cdot x_{bw}+DC_{ft}\\cdot x_{ft}+DC_{g}\\cdot x_{dg}=", "The abutment's own, about the toe", "kip*ft/ft");
    m("M_{DC}\\coloneq M_{DC0}+DC_{wg}\\cdot x_{wg}=", "With the wingwalls'", "kip*ft/ft");
  } else m("M_{DC}\\coloneq DC_{st}\\cdot x_{st}+DC_{bw}\\cdot x_{bw}+DC_{ft}\\cdot x_{ft}+DC_{g}\\cdot x_{dg}=", "Its moment about the toe", "kip*ft/ft");
  const wp = s.wingPush;
  const qW = !!wp && wp.qWu > 0;
  if (wp) {
    const two = wp.nWing === 2;
    text(`The wingwall${two ? "s'" : "'s"} thrust square to the abutment:- on the skew θ, P sin θ at ${two ? "each end, pushing opposite ways: a couple about the vertical axis" : "its end: a net force F, off the middle by L/2, with the wingwall's My"}. ${wp.onPiles ? "The piles share the couple elastically, linear along the abutment (6T/L² per foot at the ends): the piles are checked for the end strip." : `The footing takes ${two ? "the couple" : "F with the earth pressure, and the couple"} by friction (below).`}`, undefined, { keepWithNext: true });
    m(`\\theta_{w}\\coloneq ${num(Math.abs(i.skew))}\\mathrm{deg}`, "The skew");
    m(`L_{ab}\\coloneq ${num(i.length)}\\mathrm{ft}`, "The abutment's length");
    m(`H_{wu}\\coloneq ${num(wp.Pu, 3)}\\mathrm{kip}\\cdot\\sin\\left(\\theta_{w}\\right)=`, "The wingwall's thrust × sin θ, Strength I", "kip");
    m(`H_{ws}\\coloneq ${num(wp.Ps, 3)}\\mathrm{kip}\\cdot\\sin\\left(\\theta_{w}\\right)=`, "The same, Service I", "kip");
    if (two) {
      m("T_{wu}\\coloneq H_{wu}\\cdot L_{ab}=", "The couple, Strength I", "kip*ft");
      m("T_{ws}\\coloneq H_{ws}\\cdot L_{ab}=", "Service I", "kip*ft");
    } else {
      m(`T_{wu}\\coloneq H_{wu}\\cdot\\frac{L_{ab}}{2}+${num(wp.Myu, 3)}\\mathrm{kip}\\cdot\\mathrm{ft}=`, "About the middle, with the wingwall's My, Strength I", "kip*ft");
      m(`T_{ws}\\coloneq H_{ws}\\cdot\\frac{L_{ab}}{2}+${num(wp.Mys, 3)}\\mathrm{kip}\\cdot\\mathrm{ft}=`, "Service I", "kip*ft");
    }
    if (qW) {
      const F = (k: string) => (two ? "" : `\\frac{H_{w${k}}}{L_{ab}}`);
      const C = (k: string) => (wp.onPiles ? `${two ? "" : "+"}\\frac{6\\cdot T_{w${k}}}{L_{ab}^{2}}` : "");
      m(`q_{Wu}\\coloneq ${F("u")}${C("u")}=`, wp.onPiles ? "Per foot at the end, Strength I" : "The net force per foot, Strength I", "kip/ft");
      m(`q_{Ws}\\coloneq ${F("s")}${C("s")}=`, "Service I", "kip/ft");
      m(`y_{Wu}\\coloneq ${num(wp.yWu, 3)}\\mathrm{ft}`, "Its height above the footing's bottom, Strength I");
      m(`y_{Ws}\\coloneq ${num(wp.yWs, 3)}\\mathrm{ft}`, "Service I");
    }
  }
  for (const c of combos) {
    const f = (v: number) => (v === 1 ? "" : `${v}\\cdot `);
    const llV = c.ll > 0 ? `+${f(c.ll)}LL_{g}` : "";
    // The surcharge's factored parts, named so each line fits the page.
    if (ls && c.lsv > 0) m(`W_{l${c.k}}\\coloneq ${f(c.lsv)}LS_{v}=`, "The surcharge on the heel (bearing)", "kip/ft");
    if (ls) m(`H_{l${c.k}}\\coloneq ${f(c.lsh)}LS_{h}=`, "The surcharge, horizontal", "kip/ft");
    const lsvV = ls && c.lsv > 0 ? `+W_{l${c.k}}` : "";
    m(`V_{${c.k}}\\coloneq ${f(c.dc)}DC_{t}+${f(c.dw)}DW_{g}+${f(c.ev)}EV_{h}${llV}${lsvV}=`, c.name, "kip/ft");
    m(`P_{s${c.k}}\\coloneq ${f(c.dw)}DW_{g}${llV}=`, "DW and LL at the bearings", "kip/ft");
    m(`M_{R${c.k}}\\coloneq ${f(c.dc)}M_{DC}+P_{s${c.k}}\\cdot x_{br}+\\left(${f(c.ev)}EV_{h}${lsvV}\\right)\\cdot x_{h}=`, "Resisting", "kip*ft/ft");
    const br = c.ll > 0 ? "+1.75\\cdot BR" : "";
    const lsH = ls ? `+H_{l${c.k}}` : "";
    const wk = c.k === "c" ? "s" : "u";
    const qH = qW ? `+q_{W${wk}}` : "";
    if (qW) m(`M_{W${c.k}}\\coloneq q_{W${wk}}\\cdot y_{W${wk}}=`, "The wingwall's push, overturning", "kip*ft/ft");
    const qM = qW ? `+M_{W${c.k}}` : "";
    m(`F_{h${c.k}}\\coloneq ${f(c.eh)}EH${br}+${f(c.tu)}TU${lsH}${qH}=`, "Horizontal", "kip/ft");
    m(`M_{O${c.k}}\\coloneq ${f(c.eh)}EH\\cdot\\frac{H}{3}${c.ll > 0 ? "+1.75\\cdot BR\\cdot y_{BR}" : ""}+${f(c.tu)}TU\\cdot y_{BR}${lsH ? `${lsH}\\cdot\\frac{H}{2}` : ""}${qM}=`, "Overturning", "kip*ft/ft");
    m(`x_{R${c.k}}\\coloneq\\frac{M_{R${c.k}}-M_{O${c.k}}}{V_{${c.k}}}=`, "The resultant from the toe", "ft");
    m(`e_{${c.k}}\\coloneq\\frac{B}{2}-x_{R${c.k}}=`, "Eccentricity", "ft");
  }

  const strengthKey = (name: string) => (name.endsWith("maximum") ? "a" : "b");
  if (s.micropiles) {
    const mp = s.micropiles;
    const nr = mp.rows.length;
    text(`Micropiles: ${nr} row${nr > 1 ? "s" : ""} of ${mp.perRow} under the footing (a rigid footing, FHWA GEC 12 9.8)`, "subheading", { keepWithNext: true });
    text("Method:- per foot of abutment, each row's share of the load and of its moment about the group's centroid, P/n ± V·(xc − xR)(xc − x)/Σ(x − xc)², times the micropiles' spacing along the abutment, along a battered row's axis by 1/cos β.");
    m(`n_{r}\\coloneq ${nr}`, "Rows");
    mp.rows.forEach((row, k) => {
      m(`x_{${k + 1}}\\coloneq ${num(row.x)}\\mathrm{ft}`, `Row ${k + 1} from the toe`);
      m(`\\beta_{${k + 1}}\\coloneq ${num(row.batter)}\\mathrm{deg}`, "Its batter");
    });
    m(`x_{c}\\coloneq\\frac{${mp.rows.map((_, k) => `x_{${k + 1}}`).join("+")}}{n_{r}}=`, "The group's centroid", "ft");
    m(`S_{2}\\coloneq ${mp.rows.map((_, k) => `\\left(x_{${k + 1}}-x_{c}\\right)^{2}`).join("+")}=`, undefined, "ft^2");
    m(`s_{p}\\coloneq\\frac{L_{a}}{${mp.perRow}}=`, "Abutment per micropile in a row", "ft");
    const share = (c: string, k: number) => (mp.S2 > 0 ? `\\left(\\frac{V_{${c}}}{n_{r}}+\\frac{V_{${c}}\\cdot\\left(x_{c}-x_{R${c}}\\right)\\cdot\\left(x_{c}-x_{${k + 1}}\\right)}{S_{2}}\\right)` : `\\frac{V_{${c}}}{n_{r}}`);
    for (const c of ["a", "b"]) mp.rows.forEach((_, k) => m(`P_{${c}${k + 1}}\\coloneq\\frac{${share(c, k)}\\cdot s_{p}}{\\cos\\left(\\beta_{${k + 1}}\\right)}=`, `Row ${k + 1}, ${c === "a" ? "Strength I, maximum" : "Strength I, minimum"}`, "kip"));
    m("F_{mp}\\coloneq\\frac{F_{ha}\\cdot L_{a}}{n_{r}\\cdot" + mp.perRow + "}=", "Shear on each micropile (the batter's help not counted)", "kip");
    micropileWorked(w, mp.mpIn, mp.result);
    const ew = s.endWing;
    if (ew && ew.dP !== undefined) {
      text("The one wingwall's weight along the abutment:- off the group's middle, a moment along it; the footing rigid, the end micropiles take P/n ± M x/Σx².", undefined, { keepWithNext: true });
      m(`M_{Lm}\\coloneq ${num(ew.M, 3)}\\mathrm{kip}\\cdot\\mathrm{ft}`, `The weight (${num(ew.W, 3)} kip) × γDC × ${num(ew.lever, 3)} ft`);
      m(`\\Delta_{Pm}\\coloneq\\frac{M_{Lm}\\cdot${num(ew.xmax!, 3)}\\mathrm{ft}}{${ew.rows}\\cdot${num(ew.S2!, 3)}\\mathrm{ft}^{2}}=`, `The end micropile's share, ${ew.n} a row, Σx² of a row`, "kip");
      m(`P_{me}\\coloneq ${num(ew.P! - ew.dP, 3)}\\mathrm{kip}+\\Delta_{Pm}=`, "With the most loaded micropile's", "kip");
      m(ok("P_{me}", `${num(ew.R!, 3)}\\mathrm{kip}`), "End micropile, compression (the least of its resistances)");
    }
  } else if (s.footing) {
    text("Spread footing (AASHTO 10.6.3, 11.6.3)", "subheading", { keepWithNext: true });
    const worst = Math.abs(s.rows[0].e) >= Math.abs(s.rows[1].e) ? "a" : "b";
    m(ok(`\\max\\left(e_{${worst}},-e_{${worst}}\\right)`, "\\frac{B}{3}"), "Eccentricity, AASHTO 11.6.3.3");
    m("B_{e}\\coloneq B-2\\cdot\\max\\left(e_{a},-e_{a}\\right)=", "Effective width", "ft");
    const ew = s.endWing;
    if (ew && ew.Lp !== undefined) {
      text("The one wingwall's weight along the abutment:- off its middle by L/2 and its centroid's reach past the end, (Lw/2) sin θ; the footing rigid, so it's an eccentricity along the abutment (AASHTO 10.6.1.3).", undefined, { keepWithNext: true });
      m(`M_{La}\\coloneq1.25\\cdot${num(ew.W, 3)}\\mathrm{kip}\\cdot${num(ew.lever, 3)}\\mathrm{ft}=`, "The weight × 1.25 × its lever, Strength I, maximum", "kip*ft");
      m(`L_{ft}\\coloneq ${num(i.length)}\\mathrm{ft}`, "The footing's length");
      m("e_{La}\\coloneq\\frac{M_{La}}{V_{a}\\cdot L_{ft}}=", "Along the abutment", "ft");
      m(ok("e_{La}", "\\frac{L_{ft}}{3}"), "Eccentricity, AASHTO 10.6.3.3");
      m("L_{e}\\coloneq L_{ft}-2\\cdot e_{La}=", "Effective length", "ft");
      m("q_{eq}\\coloneq\\frac{V_{a}\\cdot L_{ft}}{B_{e}\\cdot L_{e}}=", "Uniform pressure on B′ × L′", "ksf");
    } else m("q_{eq}\\coloneq\\frac{V_{a}}{B_{e}}=", "Uniform pressure on B′", "ksf");
    m(`q_{n}\\coloneq ${num(s.footing.nb.qn)}\\mathrm{ksf}`, "Nominal bearing resistance, AASHTO Eq. 10.6.3.1.2a-1 on B′ (strip)");
    m(`\\phi_{b}\\coloneq ${num(i.phiB)}`, "AASHTO Table 10.5.5.2.2-1");
    m(ok("q_{eq}", "\\phi_{b}\\cdot q_{n}"), "Bearing");
    m(`\\phi_{s}\\coloneq ${num(i.phi)}\\mathrm{deg}`, "Foundation soil");
    m(`\\phi_{\\tau}\\coloneq ${num(i.phiTau)}`, "AASHTO Table 10.5.5.2.2-1");
    m(ok("F_{hb}", "\\phi_{\\tau}\\cdot V_{b}\\cdot\\tan\\left(\\phi_{s}\\right)"), "Sliding, AASHTO 10.6.3.4");
    if (s.footing.twist) {
      text("Sliding with the wingwalls' twist:- the footing slides and turns as a rigid body, the friction at its limit everywhere, reversed over a length x at one end. That length's couple R x (L − x) takes T; what is left, R √(1 − 4T/(R L²)) per foot, takes the sliding force.", undefined, { keepWithNext: true });
      m("R_{f}\\coloneq\\phi_{\\tau}\\cdot V_{b}\\cdot\\tan\\left(\\phi_{s}\\right)=", "Friction per foot", "kip/ft");
      m("k_{T}\\coloneq1-\\frac{4\\cdot T_{wu}}{R_{f}\\cdot L_{ab}^{2}}=", "What the twist leaves (0 or less: it slides)");
      m(ok("F_{hb}", "R_{f}\\cdot\\sqrt{\\max\\left(k_{T},0\\right)}"), "Sliding with the twist, AASHTO 10.6.3.4");
    }
  } else if (s.piles) {
    text(`H-piles, ${i.section}, two rows`, "subheading", { keepWithNext: true });
    m(`x_{f}\\coloneq ${num(i.rowFront)}\\mathrm{ft}`, "Front row from the toe");
    m(`x_{b}\\coloneq ${num(i.rowBack)}\\mathrm{ft}`, "Back row");
    m(`s_{pl}\\coloneq ${num(i.pileSpacing)}\\mathrm{ft}`, "Pile spacing along the abutment");
    m("M_{c}\\coloneq V_{a}\\cdot\\left(\\frac{x_{f}+x_{b}}{2}-x_{Ra}\\right)=", "About the group's center", "kip*ft/ft");
    m("P_{f}\\coloneq\\left(\\frac{V_{a}}{2}+\\frac{M_{c}}{x_{b}-x_{f}}\\right)\\cdot s_{pl}=", "Front row", "kip");
    m("P_{bk}\\coloneq\\left(\\frac{V_{a}}{2}-\\frac{M_{c}}{x_{b}-x_{f}}\\right)\\cdot s_{pl}=", "Back row", "kip");
    m(`R_{n}\\coloneq ${num(i.Rn)}\\mathrm{kip}`, "Geotechnical report");
    m(`\\phi_{dyn}\\coloneq ${num(i.phiDyn)}`);
    m(ok("\\max\\left(P_{f},P_{bk}\\right)", "\\phi_{dyn}\\cdot R_{n}"), "Geotechnical axial, AASHTO 10.5.5.2.3");
    const ew = s.endWing;
    if (ew && ew.dP !== undefined) {
      text("The one wingwall's weight along the abutment:- off the group's middle, a moment along it; the cap rigid, the end piles take P/n ± M x/Σx².", undefined, { keepWithNext: true });
      m(`M_{Lp}\\coloneq1.25\\cdot${num(ew.W, 3)}\\mathrm{kip}\\cdot${num(ew.lever, 3)}\\mathrm{ft}=`, "The weight × 1.25 × its lever", "kip*ft");
      m(`\\Delta_{Pe}\\coloneq\\frac{M_{Lp}\\cdot${num(ew.xmax!, 3)}\\mathrm{ft}}{2\\cdot${num(ew.S2!, 3)}\\mathrm{ft}^{2}}=`, `The end pile's share, ${ew.n} piles a row, Σx² of a row`, "kip");
      m(ok("\\max\\left(P_{f},P_{bk}\\right)+\\Delta_{Pe}", "\\phi_{dyn}\\cdot R_{n}"), "End pile, geotechnical axial, AASHTO 10.5.5.2.3");
    }
    m(`M_{py}\\coloneq ${num(s.piles.lat.Mmax)}\\mathrm{kip}\\cdot\\mathrm{ft}`, "Largest moment, strong axis, p–y with the group's p-multipliers, head fixed");
    m(`I_{xp}\\coloneq ${num(s.piles.inter.value)}`, `Axial with flexure, AASHTO Eq. ${s.piles.inter.eq} (φc 0.70 Pn, φf 1.0 Mn)`);
    m(ok("I_{xp}", "1"), "AASHTO 6.15.3.2");
  }

  // The stem at the footing's top.
  text("Stem at the footing", "subheading", { keepWithNext: true });
  m("H_{st}\\coloneq H_{s}+H_{b}=", undefined, "ft");
  m("y_{s}\\coloneq y_{BR}-t_{f}=", "The seat's (or deck's) height above the footing", "ft");
  if (ls) m("M_{ls}\\coloneq\\Delta_{p}\\cdot\\frac{H_{st}^{2}}{2}=", "The surcharge's moment, unfactored", "kip*ft/ft");
  m(`M_{vu}\\coloneq ${num(s.MstemV, 3)}\\frac{\\mathrm{kip}\\cdot\\mathrm{ft}}{\\mathrm{ft}}`, "The vertical loads about the stem's base, Strength I: the girders' DC, DW and LL with IM at e_b (the stem above ground, AASHTO 3.6.2.1), the approach slab and backwall where they sit, any behind the centerline at 0.9");
  m(`M_{vs}\\coloneq ${num(s.MstemVs, 3)}\\frac{\\mathrm{kip}\\cdot\\mathrm{ft}}{\\mathrm{ft}}`, "The same, Service I");
  m("M_{eh}\\coloneq K\\cdot\\gamma_{s}\\cdot\\frac{H_{st}^{3}}{6}=", "The earth pressure's moment, unfactored", "kip*ft/ft");
  m("M_{hu}\\coloneq\\left(1.75\\cdot BR+0.5\\cdot TU\\right)\\cdot y_{s}=", "Braking and the bearings' temperature force, Strength I", "kip*ft/ft");
  m("M_{hs}\\coloneq\\left(BR+TU\\right)\\cdot y_{s}=", "The same, Service I", "kip*ft/ft");
  member(w, "st", "Stem", {
    Mu: `\\gamma_{EH}\\cdot M_{eh}+M_{hu}${ls ? "+1.75\\cdot M_{ls}" : ""}+M_{vu}=`,
    Ms: `M_{eh}+M_{hs}${ls ? "+M_{ls}" : ""}+M_{vs}=`,
    h: i.stemT * 12,
    cover: i.wallCover ?? 2,
    bars: i.stemBars,
    min: true,
    crack: true,
    exposure: i.exposure,
  });
  if (ls) m("V_{lst}\\coloneq1.75\\cdot\\Delta_{p}\\cdot H_{st}=", "The surcharge's shear on the stem", "kip/ft");
  shear(w, "st", `\\gamma_{EH}\\cdot0.5\\cdot K\\cdot\\gamma_{s}\\cdot H_{st}^{2}+1.75\\cdot BR+0.5\\cdot TU${ls ? "+V_{lst}" : ""}=`, "st", "Stem shear, AASHTO 5.7.3.3");
  if (s.wingStem) wingEndWorked(w, s.wingStem, "s");
  if (s.wingPush?.stem) {
    const sp = s.wingPush.stem;
    text("The stem's end, pushed square by the wingwall:- P sin θ at height y on the end, toward the span at one corner (with the earth pressure). It spreads at 45° down to the footing one way, the end being free: over a width y at the base.", undefined, { keepWithNext: true });
    m(`y_{wp}\\coloneq ${num(sp.y, 3)}\\mathrm{ft}`, "The thrust's height above the footing");
    m("M_{pst}\\coloneq M_{ust}+\\frac{H_{wu}\\cdot y_{wp}}{y_{wp}}=", "The stem's moment at the end", "kip*ft/ft");
    const eb = sp.end;
    if (eb) {
      text(`Added bars at the end:- #${eb.bar} back-face bars between the main bars, over ${num(eb.width)} ft from ${eb.ends === 2 ? "each wingwall's end" : "the wingwall's end"}, hooked into the footing like them.`, undefined, { keepWithNext: true });
      m(`A_{sep}\\coloneq A_{sst}+\\frac{${num(BARS[eb.bar].area)}\\mathrm{in}^{2}}{${num(eb.spacing)}\\mathrm{in}}=`, "The main bars and the added ones", "in^2/ft");
      m("a_{ep}\\coloneq\\frac{A_{sep}\\cdot f_{y}}{0.85\\cdot f'_{c}}=", undefined, "in");
      m("M_{rep}\\coloneq\\phi_{f}\\cdot A_{sep}\\cdot f_{y}\\cdot\\left(d_{est}-\\frac{a_{ep}}{2}\\right)=", "AASHTO 5.6.3.2", "kip*ft/ft");
      m(ok("M_{pst}", "M_{rep}"), "Flexure at the end, AASHTO 5.6.3.2");
      if (eb.width < sp.y) m(ok(`${num(sp.y, 3)}\\mathrm{ft}`, `${num(eb.width)}\\mathrm{ft}`), "Over the spread width at the base");
    } else m(ok("M_{pst}", "M_{rst}"), "Flexure at the end, AASHTO 5.6.3.2");
    m("V_{pst}\\coloneq V_{ust}+\\frac{H_{wu}}{y_{wp}}=", "Its shear at the end", "kip/ft");
    m(ok("V_{pst}", "V_{rst}"), "Shear at the end, AASHTO 5.7.3.3");
  }

  if (!semi) {
    text("Backwall at the seat", "subheading", { keepWithNext: true });
    text("Loads per foot: earth pressure at H/3 (AASHTO 3.11.5), the live load surcharge at H/2 (3.11.6.4), and the trucks' rear axles with 2 ft of lane in every lane on its top, with IM and the multiple presence factor (3.6.1.1.2), eccentric to its centerline (as FHWA NHI-04-041 Step 7.9). Strength I governs over V (1.35).", undefined, { keepWithNext: true });
    m("R_{EHb}\\coloneq0.5\\cdot K\\cdot\\gamma_{s}\\cdot H_{b}^{2}=", "Earth pressure", "kip/ft");
    m(`h_{eqb}\\coloneq ${num(s.heqBw, 3)}\\mathrm{ft}`, s.heqBw > 0 ? `Table 3.11.6.4.1-1 for the abutment's ${num(s.H)} ft height (AASHTO 3.11.6.4.1)` : "No surcharge: an approach slab carries the traffic (AASHTO 3.11.6.5; CDOT BDM 11.3)");
    m("R_{LSb}\\coloneq K\\cdot\\gamma_{s}\\cdot h_{eqb}\\cdot H_{b}=", "Live load surcharge", "kip/ft");
    m(`R_{LLb}\\coloneq ${num(s.RLLbw, 3)}\\frac{\\mathrm{kip}}{\\mathrm{ft}}`, `${Math.max(1, Math.floor(i.lanes ?? 1))} lanes × m × (32 kip × (1 + IM) + 0.64 klf × 2 ft) / ${num(i.length)} ft`);
    m(`e_{LLb}\\coloneq ${num(s.eLL, 3)}\\mathrm{ft}`, "The axles from the backwall's centerline");
    member(w, "bw", "Backwall", {
      Mu: "1.75\\cdot R_{LLb}\\cdot e_{LLb}+\\gamma_{EH}\\cdot R_{EHb}\\cdot\\frac{H_{b}}{3}+1.75\\cdot R_{LSb}\\cdot\\frac{H_{b}}{2}=",
      Ms: "R_{LLb}\\cdot e_{LLb}+R_{EHb}\\cdot\\frac{H_{b}}{3}+R_{LSb}\\cdot\\frac{H_{b}}{2}=",
      h: i.backwallT * 12,
      cover: i.wallCover ?? 2,
      bars: i.backwallBars,
      min: true,
      crack: true,
      exposure: i.exposure,
    });
    shear(w, "bw", "\\gamma_{EH}\\cdot R_{EHb}+1.75\\cdot R_{LSb}=", "bw", "Backwall shear at the seat, AASHTO 5.7.3.3");
  }
  const sd = s.semi;
  if (semi && sd) {
    text("The end diaphragm (CDOT BDM 11.3.2, Figure 11-3)", "subheading", { keepWithNext: true });
    text("Method:- it rides on the bearings with the superstructure, a beam between the girders, not a wall fixed to the seat: its horizontal bars carry the passive pressure as the bridge expands; for replacing the bearings it carries each girder's permanent reaction × 1.3 (AASHTO 3.4.3.1) to a jack either side (CDOT BDM 14.5.6).", undefined, { keepWithNext: true });
    m("K_{pd}\\coloneq\\tan\\left(45\\mathrm{deg}+\\frac{\\phi_{bf}}{2}\\right)^{2}=", "Passive, Rankine");
    m("p_{bd}\\coloneq K_{pd}\\cdot\\gamma_{s}\\cdot H_{b}=", "At its bottom", "ksf");
    m(`S_{gd}\\coloneq ${num(i.girderSpacing)}\\mathrm{ft}`, "Girder spacing: the diaphragm spans between girders");
    member(w, "dh", "End diaphragm, horizontal bars", { Mu: "\\frac{1.35\\cdot p_{bd}\\cdot S_{gd}^{2}}{10}=", h: i.backwallT * 12, cover: i.wallCover ?? 2, bars: sd.horiz, exposure: i.exposure });
    m(`R_{j}\\coloneq1.3\\cdot\\left(${num(i.RDC)}\\mathrm{kip}+${num(i.RDW)}\\mathrm{kip}\\right)=`, "Each girder's permanent reaction, jacking, AASHTO 3.4.3.1", "kip");
    m("P_{j}\\coloneq\\frac{R_{j}}{2}=", "Each of the two jacks", "kip");
    m(`a_{j}\\coloneq ${num(sd.jackOffset)}\\mathrm{ft}`, "Each jack from its girder");
    m("M_{j}\\coloneq P_{j}\\cdot a_{j}=", "The diaphragm over the jacks", "kip*ft");
    m(`A_{sj}\\coloneq ${sd.bottom.count}\\cdot ${num(BARS[sd.bottom.bar].area)}\\mathrm{in}^{2}=`, `${sd.bottom.count} #${sd.bottom.bar} along the bottom`, "in^2");
    m(`d_{j}\\coloneq ${num(sd.d, 3)}\\mathrm{in}`, "To the bottom bars");
    m("a_{sj}\\coloneq\\frac{A_{sj}\\cdot f_{y}}{0.85\\cdot f'_{c}\\cdot T_{b}}=", undefined, "in");
    m(ok("M_{j}", "0.9\\cdot A_{sj}\\cdot f_{y}\\cdot\\left(d_{j}-\\frac{a_{sj}}{2}\\right)"), "AASHTO 5.6.3.2");
    m(`V_{cj}\\coloneq ${num(sd.Vc, 3)}\\mathrm{kip}`, "0.0316 β √f'c b dv, β 2, AASHTO Eq. 5.7.3.3-3");
    m(`V_{sj}\\coloneq ${num(sd.Vs, 3)}\\mathrm{kip}`, `${sd.stirrup.legs} legs of #${sd.stirrup.bar} @ ${num(sd.stirrup.spacing)} in, AASHTO Eq. 5.7.3.3-4`);
    m(ok("P_{j}", "0.9\\cdot\\left(V_{cj}+V_{sj}\\right)"), "Shear, AASHTO 5.7.3.3");
    m(ok("P_{j}", `${sd.jackTons * 2}\\mathrm{kip}`), `${sd.jackTons}-ton jacks, CDOT BDM 14.5.6`);
    m(ok("P_{j}", `0.7\\cdot0.85\\cdot f'_{c}\\cdot\\frac{\\pi\\cdot\\left(${sd.jackD}\\mathrm{in}\\right)^{2}}{4}`), "Concrete bearing under the jack, AASHTO 5.6.5");
  }

  if (i.type === "seat") {
    text("Bearing seat width (AASHTO 4.7.4.4)", "subheading", { keepWithNext: true });
    m(`S_{k}\\coloneq ${num(i.skew)}`, "Skew, degrees");
    m(`H_{N}\\coloneq ${num(i.seatH ?? 0)}\\mathrm{ft}`, "The columns' average height to the next expansion joint (0 for a single span)");
    m(`P_{N}\\coloneq ${num((i.seatPct ?? 100) / 100)}`, "Table 4.7.4.4-1, by seismic zone");
    m("N_{s}\\coloneq\\left(8+0.02\\cdot\\frac{L_{u}}{\\mathrm{ft}}+0.08\\cdot\\frac{H_{N}}{\\mathrm{ft}}\\right)\\cdot\\left(1+0.000125\\cdot S_{k}^{2}\\right)\\cdot P_{N}\\cdot\\mathrm{in}=", "AASHTO Eq. 4.7.4.4-1", "in");
    m(ok("N_{s}", `${num(i.seatWidth)}\\mathrm{in}`), "Seat width provided");
  }

  // The footing.
  if (s.micropiles?.onRows) {
    const o = s.micropiles.onRows;
    const mp = s.micropiles;
    const B = i.toe + i.stemT + i.heel;
    text("Footing across its width: a beam on the micropile rows (AASHTO 5.12.8)", "subheading", { keepWithNext: true, newPage: true });
    text("Method:- per foot of abutment, each row's reaction its axial force's vertical part over its spacing along the abutment; the footing's weight and the soil on the heel downward. A free body each side of the stem, out to the stem's vertical bars (the footing supported at the wall's steel, not its faces: the conservative choice), gives the moment at any section; the largest each way governs, and the shear at dv from each face is the reactions beyond the section (AASHTO 5.12.8.6.1).");
    m(`x_{s1}\\coloneq T_{t}+2\\mathrm{in}+\\frac{${num(BARS[i.stemBars.bar].dia)}\\mathrm{in}}{2}=`, "The stem's front bars from the toe", "ft");
    m(`x_{s2}\\coloneq T_{t}+T_{s}-\\left(2\\mathrm{in}+\\frac{${num(BARS[i.stemBars.bar].dia)}\\mathrm{in}}{2}\\right)=`, "Its back bars", "ft");
    const reactions = (c: string, dc: number, ev: number, sfx: string) => {
      mp.rows.forEach((_, k) => m(`R_{${sfx}${k + 1}}\\coloneq\\frac{P_{${c}${k + 1}}\\cdot\\cos\\left(\\beta_{${k + 1}}\\right)}{s_{p}}=`, `Row ${k + 1}'s reaction`, "kip/ft"));
      m(`w_{f${sfx}}\\coloneq ${dc}\\cdot\\gamma_{c}\\cdot t_{f}=`, "Footing", "ksf");
      m(`w_{s${sfx}}\\coloneq ${ev}\\cdot\\gamma_{s}\\cdot\\left(H_{s}+H_{b}\\right)=`, "Soil on the heel", "ksf");
    };
    const moment = (x: number, sfx: string) => {
      const toeSide = x <= o.x1 + 1e-9;
      const rs = mp.rows.map((row, k) => ({ row, k })).filter(({ row }) => (toeSide ? row.x < x : row.x > x));
      const terms = rs.map(({ k }) => (toeSide ? `R_{${sfx}${k + 1}}\\cdot\\left(x_{m${sfx}}-x_{${k + 1}}\\right)` : `R_{${sfx}${k + 1}}\\cdot\\left(x_{${k + 1}}-x_{m${sfx}}\\right)`));
      const load = toeSide ? `-\\frac{w_{f${sfx}}\\cdot x_{m${sfx}}^{2}}{2}` : `-\\frac{\\left(w_{f${sfx}}+w_{s${sfx}}\\right)\\cdot\\left(B-x_{m${sfx}}\\right)^{2}}{2}`;
      return { toeSide, expr: `${terms.length ? terms.join("+") : "0\\frac{\\mathrm{kip}\\cdot\\mathrm{ft}}{\\mathrm{ft}}"}${load}` };
    };
    // Bottom bars.
    const kb = strengthKey(o.bot.r.c.name);
    text(`Bottom bars (${o.bot.r.c.name})`, "subheading", { keepWithNext: true });
    reactions(kb, o.bot.r.c.dc, o.bot.r.c.ev, "p");
    m(`x_{mp}\\coloneq ${num(o.bot.a.xPos)}\\mathrm{ft}`, `The governing section from the toe (${o.bot.a.xPos <= o.x1 + 1e-9 ? "toe side, its free body from the toe" : "heel side, from the heel"})`);
    const mb = moment(o.bot.a.xPos, "p");
    m(`M_{fp}\\coloneq ${mb.expr}=`, "Positive moment (bottom in tension)", "kip*ft/ft");
    member(w, "fb", "Footing, bottom bars", { Mu: "M_{fp}=", Ms: `${num(o.MsBot)}\\frac{\\mathrm{kip}\\cdot\\mathrm{ft}}{\\mathrm{ft}}`, h: i.footT * 12, cover: 3, bars: i.toeBars, min: o.bot.a.Mpos >= 1, crack: o.MsBot >= 1, exposure: i.exposure });
    if (o.MsBot >= 1) text("The Service I moment is worked out the same way, with the Service case's reactions and loads.", "note");
    // Top bars.
    const kt = strengthKey(o.top.r.c.name);
    text(`Top bars (${o.top.r.c.name})`, "subheading", { keepWithNext: true });
    reactions(kt, o.top.r.c.dc, o.top.r.c.ev, "n");
    m(`x_{mn}\\coloneq ${num(o.top.a.xNeg)}\\mathrm{ft}`, `The governing section from the toe (${o.top.a.xNeg <= o.x1 + 1e-9 ? "toe side" : "heel side"})`);
    const mt = moment(o.top.a.xNeg, "n");
    m(`M_{fn}\\coloneq-\\left(${mt.expr}\\right)=`, "Negative moment (top in tension)", "kip*ft/ft");
    member(w, "ft", "Footing, top bars", { Mu: "M_{fn}=", Ms: `${num(o.MsTop)}\\frac{\\mathrm{kip}\\cdot\\mathrm{ft}}{\\mathrm{ft}}`, h: i.footT * 12, cover: 2, bars: i.heelBars, min: o.top.a.Mneg >= 1, crack: o.MsTop >= 1, exposure: i.exposure });
    // One-way shear.
    const ks = strengthKey(o.shear.r.c.name);
    text(`One-way shear at dv from the stem's ${o.shear.toe ? "front" : "back"} face (${o.shear.r.c.name})`, "subheading", { keepWithNext: true });
    reactions(ks, o.shear.r.c.dc, o.shear.r.c.ev, "v");
    m("d_{vf}\\coloneq\\max\\left(d_{efb}-\\frac{a_{fb}}{2},0.9\\cdot d_{efb},0.72\\cdot h_{fb}\\right)=", "AASHTO 5.7.2.8, on the bottom bars", "in");
    m(o.shear.toe ? "x_{vs}\\coloneq\\max\\left(0\\mathrm{ft},x_{s1}-d_{vf}\\right)=" : "x_{vs}\\coloneq\\min\\left(B,x_{s2}+d_{vf}\\right)=", "The section", "ft");
    const vr = mp.rows.map((row, k) => ({ row, k })).filter(({ row }) => (o.shear.toe ? row.x < o.shear.x : row.x > o.shear.x));
    const vsum = vr.length ? vr.map(({ k }) => `R_{v${k + 1}}`).join("+") : "0\\frac{\\mathrm{kip}}{\\mathrm{ft}}";
    m(`V_{sf}\\coloneq ${vsum}-${o.shear.toe ? "w_{fv}\\cdot x_{vs}" : "\\left(w_{fv}+w_{sv}\\right)\\cdot\\left(B-x_{vs}\\right)"}=`, "The reactions beyond the section less the loads there", "kip/ft");
    m("V_{uf}\\coloneq\\max\\left(V_{sf},-V_{sf}\\right)=", "Its size", "kip/ft");
    m("V_{rf}\\coloneq\\phi_{v}\\cdot0.0316\\cdot2\\cdot\\sqrt{\\frac{f'_{c}}{\\mathrm{ksi}}}\\cdot\\mathrm{ksi}\\cdot d_{vf}=", "AASHTO Eq. 5.7.3.3-3, β 2", "kip/ft");
    m(ok("V_{uf}", "V_{rf}"), "Footing shear, AASHTO 5.12.8.6.1");
    // Punching.
    const pu = o.punch;
    text("Punching at the most loaded micropile (AASHTO 5.12.8.6.3)", "subheading", { keepWithNext: true });
    m(`P_{pu}\\coloneq ${num(pu.P)}\\mathrm{kip}`, `Row ${pu.k + 1}, its axial force's vertical part`);
    m(`d_{vp}\\coloneq t_{f}-${num((i.micropile?.embed ?? 12))}\\mathrm{in}=`, "The concrete over the pile's head", "in");
    m(`a_{pl}\\coloneq ${num(mp.plate)}\\mathrm{in}`, "Bearing plate");
    m("b_{s}\\coloneq a_{pl}+d_{vp}=", "The perimeter's side, dv/2 round the plate", "in");
    if (pu.cut) {
      m(`e_{d}\\coloneq ${num(pu.edge)}\\mathrm{in}`, "From the pile's center to the footing's nearer edge");
      m("b_{o}\\coloneq b_{s}+2\\cdot\\left(e_{d}+\\frac{b_{s}}{2}\\right)=", "Cut by the footing's edge", "in");
    } else m("b_{o}\\coloneq4\\cdot b_{s}=", undefined, "in");
    m("V_{np}\\coloneq0.126\\cdot\\sqrt{\\frac{f'_{c}}{\\mathrm{ksi}}}\\cdot\\mathrm{ksi}\\cdot b_{o}\\cdot d_{vp}=", "AASHTO Eq. 5.12.8.6.3-1", "kip");
    m(ok("P_{pu}", "\\phi_{v}\\cdot V_{np}"), "Punching");
    // Along the abutment.
    const l = o.long;
    text("Footing along the abutment: spanning between the micropiles of each row", "subheading", { keepWithNext: true });
    text(`Method:- a continuous beam over the footing's full width, the wall's load w per foot of abutment, the micropiles ${num(l.sp)} ft apart: w s²/10 over them, w s²/14 between, the shear 1.15 w s/2; the stem's stiffening not counted (conservative).`);
    m("w_{L}\\coloneq\\max\\left(V_{a},V_{b}\\right)=", "The most vertical Strength case", "kip/ft");
    m("w_{LS}\\coloneq V_{c}=", "Service I", "kip/ft");
    member(w, "lt", "Footing, top bars along the abutment", { Mu: "\\frac{w_{L}\\cdot s_{p}^{2}}{10\\cdot B}=", Ms: "\\frac{w_{LS}\\cdot s_{p}^{2}}{10\\cdot B}=", h: i.footT * 12, cover: l.coverT, bars: l.lt, crack: true, exposure: i.exposure });
    member(w, "lb", "Footing, bottom bars along the abutment", { Mu: "\\frac{w_{L}\\cdot s_{p}^{2}}{14\\cdot B}=", h: i.footT * 12, cover: l.coverB, bars: l.lb, exposure: i.exposure });
    shear(w, "L", "\\frac{1.15\\cdot w_{L}\\cdot s_{p}}{2\\cdot B}=", "lt", "Shear along the abutment");
    void B;
  } else {
    text("Footing toe and heel: cantilevers from the stem", "subheading", { keepWithNext: true });
    if (i.foundation === "footing") {
      m("q_{t}\\coloneq" + (Math.abs(s.rows[0].e) <= (i.toe + i.stemT + i.heel) / 6 ? "\\frac{V_{a}}{B}\\cdot\\left(1+\\frac{6\\cdot e_{a}}{B}\\right)=" : "\\frac{2\\cdot V_{a}}{3\\cdot\\left(\\frac{B}{2}-e_{a}\\right)}="), "Pressure at the toe, Strength I maximum", "ksf");
      member(w, "to", "Toe", { Mu: "\\max\\left(0\\frac{\\mathrm{kip}\\cdot\\mathrm{ft}}{\\mathrm{ft}},\\frac{q_{t}\\cdot T_{t}^{2}}{2}-1.25\\cdot\\gamma_{c}\\cdot t_{f}\\cdot\\frac{T_{t}^{2}}{2}\\right)=", h: i.footT * 12, cover: 3, bars: i.toeBars, exposure: i.exposure });
    } else if (s.piles) {
      member(w, "to", "Toe", { Mu: "\\max\\left(0\\frac{\\mathrm{kip}\\cdot\\mathrm{ft}}{\\mathrm{ft}},\\frac{P_{f}}{s_{pl}}\\cdot\\max\\left(0\\mathrm{ft},T_{t}-x_{f}\\right)\\right)=", h: i.footT * 12, cover: 3, bars: i.toeBars, exposure: i.exposure });
    }
    member(w, "he", "Heel", { Mu: `1.35\\cdot\\gamma_{s}\\cdot\\left(H_{s}+H_{b}\\right)\\cdot\\frac{T_{h}^{2}}{2}+1.25\\cdot\\gamma_{c}\\cdot t_{f}\\cdot\\frac{T_{h}^{2}}{2}${ls ? "+1.75\\cdot\\gamma_{s}\\cdot h_{eq}\\cdot\\frac{T_{h}^{2}}{2}" : ""}=`, h: i.footT * 12, cover: 2, bars: i.heelBars, exposure: i.exposure });
  }
  void r;
  void rad;
}

// --- pile cap ----------------------------------------------------------------------------------------------------------

/** The concrete and steel a reinforced concrete member needs in the sheet (once per sheet). */
function concrete(w: Writer, fc: number, fy: number, gammaC: number) {
  const { m } = w;
  m(`f'_{c}\\coloneq ${num(fc)}\\mathrm{ksi}`, "Concrete");
  m(`f_{y}\\coloneq ${num(fy)}\\mathrm{ksi}`, "Reinforcing steel");
  m(`\\gamma_{c}\\coloneq ${num(gammaC)}\\mathrm{kcf}`, "Concrete unit weight");
  m("E_{s}\\coloneq29000\\mathrm{ksi}");
  m("E_{c}\\coloneq120000\\cdot\\left(\\frac{\\gamma_{c}}{\\mathrm{kcf}}\\right)^{2}\\cdot\\left(\\frac{f'_{c}}{\\mathrm{ksi}}\\right)^{0.33}\\cdot\\mathrm{ksi}=", "AASHTO Eq. 5.4.2.4-1", "ksi");
  m("n_{m}\\coloneq\\frac{E_{s}}{E_{c}}=", "Modular ratio");
  m("f_{r}\\coloneq0.24\\cdot\\sqrt{\\frac{f'_{c}}{\\mathrm{ksi}}}\\cdot\\mathrm{ksi}=", "Modulus of rupture, AASHTO 5.4.2.6", "ksi");
  m("\\phi_{f}\\coloneq0.9", "Flexure, AASHTO 5.5.4.2");
  m("\\phi_{v}\\coloneq0.9", "Shear");
}

type PileRes = ReturnType<typeof designPiles>;

/** The cap over the piles: the piles' reactions under the column, flexure each way, one-way and two-way shear, the top mat and side bars (AASHTO 5.12.8). */
export function pileCapWorked(w: Writer, i: PileInputs, r: PileRes) {
  const { text, m } = w;
  if (!r.capCases.length) return;
  const micro = !!r.micropileIn;
  const pileD = micro ? r.micropileIn!.casingOD : Math.max(r.section.bf, r.section.d);
  const colArea = i.colShape === "round" ? (Math.PI * (i.colB / 12) ** 2) / 4 : (i.colB / 12) * (i.colL / 12);
  const cB = i.colShape === "round" ? Math.sqrt(colArea) : i.colB / 12;
  const cL = i.colShape === "round" ? Math.sqrt(colArea) : i.colL / 12;
  const Sx2 = r.piles.reduce((t, p) => t + p.x ** 2, 0);
  const Sy2 = r.piles.reduce((t, p) => t + p.y ** 2, 0);
  const dvOf = (d: number) => Math.max(0.9 * d, 0.72 * i.capT);
  const share = (pos: number, section: number) => {
    const half = pileD / 24;
    const out = pos - section;
    return out >= half ? 1 : out <= -half ? 0 : (out + half) / (2 * half);
  };

  text("The pile cap (AASHTO 5.12.8, CDOT BDM 11.4)", "subheading", { keepWithNext: true, newPage: true });
  concrete(w, i.fc, i.fy, i.gammaC);
  m(`B_{cp}\\coloneq ${num(r.capB)}\\mathrm{ft}`, "Cap, across B: (nB − 1)·sB + 2·edge");
  m(`L_{cp}\\coloneq ${num(r.capL)}\\mathrm{ft}`, "Cap, along L");
  m(`t_{c}\\coloneq ${num(i.capT)}\\mathrm{in}`, "Depth");
  m(`e_{c}\\coloneq ${num(i.edge)}\\mathrm{ft}`, "Pile center to the cap's edge");
  m(`D_{p}\\coloneq ${num(pileD)}\\mathrm{in}`, micro ? "Micropile casing" : "Pile width");
  m(ok("9\\mathrm{in}", "e_{c}-\\frac{D_{p}}{2}"), "Pile side to the cap's edge, AASHTO 10.7.1.2");
  m(ok("30\\mathrm{in}", "t_{c}"), "Cap at least 2'-6\" deep, CDOT BDM 11.4");
  m(ok("2\\mathrm{ft}", `${num(i.Df)}\\mathrm{ft}-t_{c}`), "Cover over the cap's top, CDOT BDM 11.4");
  m(`l_{e}\\coloneq ${num(i.embed)}\\mathrm{in}`, "Pile embedment into the cap");
  m(ok("12\\mathrm{in}", "t_{c}-l_{e}"), "Concrete over the pile heads, AASHTO 10.7.1.2");
  m(`c_{B}\\coloneq ${num(cB)}\\mathrm{ft}`, i.colShape === "round" ? "The round column as its equal square (AASHTO 5.12.8.4)" : "Column, across B");
  m(`c_{L}\\coloneq ${num(cL)}\\mathrm{ft}`, "and along L");
  m(`d_{B}\\coloneq t_{c}-${num(i.cover)}\\mathrm{in}-\\frac{${num(BARS[i.barsB.bar].dia)}\\mathrm{in}}{2}=`, `Bars along B, #${i.barsB.bar}, the lower layer`, "in");
  m(`d_{L}\\coloneq t_{c}-${num(i.cover)}\\mathrm{in}-${num(BARS[i.barsB.bar].dia)}\\mathrm{in}-\\frac{${num(BARS[i.barsL.bar].dia)}\\mathrm{in}}{2}=`, `Bars along L, #${i.barsL.bar}, the upper layer`, "in");
  m(`n_{pc}\\coloneq ${r.n}`, "Piles");
  m(`\\Sigma_{xc}\\coloneq ${num(Sx2)}\\mathrm{ft}^{2}`, "Σx² about the cap's center");
  m(`\\Sigma_{yc}\\coloneq ${num(Sy2)}\\mathrm{ft}^{2}`, "Σy²");
  text("Method:- the piles' reactions from the column's load alone, P/n + M_B·x/Σx² + M_L·y/Σy² (the cap's and soil's weight bear on the piles directly); a section's moment and shear are the reactions beyond it (AASHTO 5.12.8.4, 5.12.8.6.1), a pile straddling a shear section counting in proportion.");

  const caseLoads = (c: (typeof r.capCases)[number], k: string) => {
    m(`P_{${k}}\\coloneq ${num(c.c.lc.P)}\\mathrm{kip}`, `${c.c.lc.name}: the column's axial load`);
    m(`M_{B${k}}\\coloneq ${num(c.c.MBb)}\\mathrm{kip}\\cdot\\mathrm{ft}`, "Moment along B at the cap's base");
    m(`M_{L${k}}\\coloneq ${num(c.c.MLb)}\\mathrm{kip}\\cdot\\mathrm{ft}`, "along L");
  };
  /** Each line of piles beyond a section as one reaction (a line shares x along B, or y along L). */
  const lines = (axis: "x" | "y", k: string, side: 1 | -1, keep: (pos: number) => boolean) => {
    const groups = new Map<number, { n: number; other: number }>();
    for (const p of r.piles) {
      const pos = side * (axis === "x" ? p.x : p.y);
      if (!keep(pos)) continue;
      const key = Math.round((axis === "x" ? p.x : p.y) * 1e6) / 1e6;
      const g = groups.get(key) ?? { n: 0, other: 0 };
      g.n += 1;
      g.other += axis === "x" ? p.y : p.x;
      groups.set(key, g);
    }
    return [...groups.entries()].map(([at, g], j) => {
      const name = `R_{${k}${j + 1}}`;
      const main = axis === "x" ? `M_{B${k}}` : `M_{L${k}}`;
      const cross = axis === "x" ? `M_{L${k}}` : `M_{B${k}}`;
      const S = axis === "x" ? "\\Sigma_{xc}" : "\\Sigma_{yc}";
      const So = axis === "x" ? "\\Sigma_{yc}" : "\\Sigma_{xc}";
      const crossTerm = Math.abs(g.other) > 1e-9 && (axis === "x" ? Sy2 : Sx2) > 0 ? `+\\frac{${cross}\\cdot${num(g.other)}\\mathrm{ft}}{${So}}` : "";
      m(`${name}\\coloneq ${g.n}\\cdot\\left(\\frac{P_{${k}}}{n_{pc}}+\\frac{${main}\\cdot${num(at)}\\mathrm{ft}}{${S}}\\right)${crossTerm}=`, `${g.n} pile${g.n > 1 ? "s" : ""} at ${axis} = ${num(at)} ft`, "kip");
      return { name, pos: side * at };
    });
  };

  const flex = (dir: "B" | "L") => {
    const axis = dir === "B" ? "x" : "y";
    const face = (dir === "B" ? cB : cL) / 2;
    const g = pick(r.capCases, (x) => (dir === "B" ? x.MuB : x.MuL));
    const k = dir === "B" ? "a" : "b";
    const mom = (sd: 1 | -1) => r.piles.reduce((t, p, j) => {
      const pos = sd * (axis === "x" ? p.x : p.y);
      return t + (pos > face ? g.R[j] * (pos - face) : 0);
    }, 0);
    const side: 1 | -1 = mom(1) >= mom(-1) ? 1 : -1;
    text(`Bars along ${dir}: flexure at the column's face (${g.c.lc.name})`, "subheading", { keepWithNext: true });
    caseLoads(g, k);
    const rs = lines(axis, k, side, (pos) => pos > face);
    const arm = dir === "B" ? "c_{B}" : "c_{L}";
    m(`M_{f${dir}}\\coloneq ${rs.length ? rs.map((x) => `${x.name}\\cdot\\left(${num(x.pos)}\\mathrm{ft}-\\frac{${arm}}{2}\\right)`).join("+") : "0\\mathrm{kip}\\cdot\\mathrm{ft}"}=`, "The reactions beyond the face, each by its arm", "kip*ft");
    const servR = r.cases.filter((c) => c.lc.limit === "service").map((c) => r.piles.map((p) => c.lc.P / r.n + (Sx2 > 0 ? (c.MBb * p.x) / Sx2 : 0) + (Sy2 > 0 ? (c.MLb * p.y) / Sy2 : 0)));
    const Ms = Math.max(0, ...servR.map((R) => Math.max(...([1, -1] as const).map((sd) => r.piles.reduce((t, p, j) => {
      const pos = sd * (axis === "x" ? p.x : p.y);
      return t + (pos > face ? R[j] * (pos - face) : 0);
    }, 0)))));
    const width = dir === "B" ? "L_{cp}" : "B_{cp}";
    member(w, `c${dir}`, `Cap, bars along ${dir}`, {
      Mu: `\\frac{M_{f${dir}}}{${width}}=`,
      Ms: servR.length ? `\\frac{${num(Ms)}\\mathrm{kip}\\cdot\\mathrm{ft}}{${width}}=` : undefined,
      h: i.capT,
      cover: dir === "B" ? i.cover : i.cover + BARS[i.barsB.bar].dia,
      bars: dir === "B" ? i.barsB : i.barsL,
      min: true,
      crack: servR.length > 0 && Ms > 0.01, // no service moment that way: nothing to crack
      exposure: i.exposure,
    });
  };
  flex("B");
  flex("L");

  const one = (dir: "B" | "L") => {
    const axis = dir === "B" ? "x" : "y";
    const d = dir === "B" ? r.dB : r.dL;
    const at = (dir === "B" ? cB : cL) / 2 + dvOf(d) / 12;
    const g = pick(r.capCases, (x) => (dir === "B" ? x.VuB : x.VuL));
    const k = dir === "B" ? "c" : "e";
    const sum = (sd: 1 | -1) => r.piles.reduce((t, p, j) => t + g.R[j] * share(sd * (axis === "x" ? p.x : p.y), at), 0);
    const side: 1 | -1 = sum(1) >= sum(-1) ? 1 : -1;
    text(`One-way shear at dv from the face, along ${dir} (${g.c.lc.name})`, "subheading", { keepWithNext: true });
    m(`d_{v${dir}}\\coloneq\\max\\left(0.9\\cdot d_{${dir}},0.72\\cdot t_{c}\\right)=`, "AASHTO 5.7.2.8", "in");
    m(`a_{v${dir}}\\coloneq\\frac{c_{${dir}}}{2}+d_{v${dir}}=`, "The section from the column's center", "ft");
    caseLoads(g, k);
    const rs = lines(axis, k, side, (pos) => share(pos, at) > 0);
    const terms = rs.map((x) => {
      const f = share(x.pos, at);
      return f >= 1 ? x.name : `${num(f)}\\cdot ${x.name}`;
    });
    m(`V_{u${dir}}\\coloneq ${terms.length ? terms.join("+") : "0\\mathrm{kip}"}=`, `The reactions beyond the section${terms.some((t) => t.includes("\\cdot")) ? ", a pile straddling it in proportion" : ""}`, "kip");
    const b = dir === "B" ? "L_{cp}" : "B_{cp}";
    m(`V_{r${dir}}\\coloneq\\phi_{v}\\cdot0.0316\\cdot2\\cdot\\sqrt{\\frac{f'_{c}}{\\mathrm{ksi}}}\\cdot\\mathrm{ksi}\\cdot ${b}\\cdot d_{v${dir}}=`, "AASHTO Eq. 5.7.3.3-3, β 2", "kip");
    m(ok(`V_{u${dir}}`, `V_{r${dir}}`), "AASHTO 5.12.8.6.1");
  };
  one("B");
  one("L");

  const sp = pick(r.capCases, (x) => x.Vpunch);
  text(`Two-way shear at the column (${sp.c.lc.name})`, "subheading", { keepWithNext: true });
  m("d_{vp}\\coloneq\\max\\left(0.9\\cdot\\frac{d_{B}+d_{L}}{2},0.72\\cdot t_{c}\\right)=", "AASHTO 5.12.8.6.3", "in");
  m(i.colShape === "round" ? `b_{o}\\coloneq\\pi\\cdot\\left(${num(i.colB)}\\mathrm{in}+d_{vp}\\right)=` : `b_{o}\\coloneq2\\cdot\\left(${num(i.colB)}\\mathrm{in}+d_{vp}\\right)+2\\cdot\\left(${num(i.colL)}\\mathrm{in}+d_{vp}\\right)=`, "The critical perimeter at dv/2 from the column", "in");
  const betaC = i.colShape === "round" ? 1 : Math.max(i.colB, i.colL) / Math.min(i.colB, i.colL);
  m(`\\beta_{c}\\coloneq ${num(betaC)}`, "Column's long side over its short");
  m(`V_{up}\\coloneq ${num(sp.Vpunch)}\\mathrm{kip}`, `The reactions of the piles outside the perimeter (those it crosses in proportion)`);
  m("V_{np}\\coloneq\\min\\left(0.063+\\frac{0.126}{\\beta_{c}},0.126\\right)\\cdot\\sqrt{\\frac{f'_{c}}{\\mathrm{ksi}}}\\cdot\\mathrm{ksi}\\cdot b_{o}\\cdot d_{vp}=", "AASHTO Eq. 5.12.8.6.3-1", "kip");
  m(ok("V_{up}", "\\phi_{v}\\cdot V_{np}"), "Two-way shear at the column");

  const rp = pick(r.capCases, (x) => x.Rmax);
  text(`Two-way shear at a corner pile (${rp.c.lc.name})`, "subheading", { keepWithNext: true });
  m(`R_{max}\\coloneq ${num(rp.Rmax)}\\mathrm{kip}`, "The most loaded pile, from the column's load");
  m("d_{vc}\\coloneq\\max\\left(0.9\\cdot\\left(t_{c}-l_{e}-3\\mathrm{in}\\right),6\\mathrm{in}\\right)=", "The concrete over its head", "in");
  m("b_{oc}\\coloneq\\min\\left(2\\cdot\\left(e_{c}+\\frac{D_{p}}{2}+\\frac{d_{vc}}{2}\\right),4\\cdot\\left(D_{p}+d_{vc}\\right)\\right)=", "Its perimeter at dv/2, cut by the two edges", "in");
  m("V_{nc}\\coloneq0.126\\cdot\\sqrt{\\frac{f'_{c}}{\\mathrm{ksi}}}\\cdot\\mathrm{ksi}\\cdot b_{oc}\\cdot d_{vc}=", "AASHTO Eq. 5.12.8.6.3-1", "kip");
  m(ok("R_{max}", "\\phi_{v}\\cdot V_{nc}"), "Corner pile");

  const topB = i.topB ?? { bar: 6, spacing: 9 };
  const topL = i.topL ?? { bar: 6, spacing: 9 };
  const tb = r.checks.find((c) => c.id === "cap-top-B");
  const tl = r.checks.find((c) => c.id === "cap-top-L");
  if (tb && tl) {
    text("Top bars: the piles in tension beyond a face (their uplift by its arm, per foot of the cap)", "subheading", { keepWithNext: true });
    member(w, "tB", "Top bars along B", { Mu: `${num(tb.demand)}\\frac{\\mathrm{kip}\\cdot\\mathrm{ft}}{\\mathrm{ft}}`, h: i.capT, cover: 2, bars: topB, exposure: i.exposure });
    member(w, "tL", "Top bars along L", { Mu: `${num(tl.demand)}\\frac{\\mathrm{kip}\\cdot\\mathrm{ft}}{\\mathrm{ft}}`, h: i.capT, cover: 2 + BARS[topB.bar].dia, bars: topL, exposure: i.exposure });
    text("Shrinkage and temperature steel (AASHTO 5.10.6)", "subheading", { keepWithNext: true });
    m("b_{l}\\coloneq\\min\\left(B_{cp},L_{cp}\\right)=", "The cap's least plan dimension", "in");
    m("A_{T0}\\coloneq\\frac{1.3\\cdot\\frac{\\mathrm{kip}}{\\mathrm{in}\\cdot\\mathrm{ft}}\\cdot b_{l}\\cdot t_{c}}{2\\cdot\\left(b_{l}+t_{c}\\right)\\cdot f_{y}}=", "AASHTO Eq. 5.10.6-1, each face", "in^2/ft");
    m("A_{T}\\coloneq\\min\\left(0.6\\frac{\\mathrm{in}^{2}}{\\mathrm{ft}},\\max\\left(0.11\\frac{\\mathrm{in}^{2}}{\\mathrm{ft}},A_{T0}\\right)\\right)=", "Within 0.11 and 0.60 in²/ft", "in^2/ft");
    m(`A_{tB}\\coloneq\\frac{${num(BARS[topB.bar].area)}\\mathrm{in}^{2}}{${num(topB.spacing)}\\mathrm{in}}=`, `Top along B, #${topB.bar} @ ${num(topB.spacing)} in`, "in^2/ft");
    m(`A_{tL}\\coloneq\\frac{${num(BARS[topL.bar].area)}\\mathrm{in}^{2}}{${num(topL.spacing)}\\mathrm{in}}=`, `Top along L, #${topL.bar} @ ${num(topL.spacing)} in`, "in^2/ft");
    m(ok("A_{T}", "\\min\\left(A_{tB},A_{tL}\\right)"), "The top mat, each way");
    const sMaxT = i.capT > 18 ? 12 : Math.min(3 * i.capT, 18);
    m(ok(`${num(Math.max(topB.spacing, topL.spacing))}\\mathrm{in}`, `${num(sMaxT)}\\mathrm{in}`), "Top mat spacing, AASHTO 5.10.6");
    const side = i.sideBars ?? { bar: 5, spacing: 6 };
    const de = Math.max(r.dB, r.dL);
    m(`A_{sd}\\coloneq\\frac{${num(BARS[side.bar].area)}\\mathrm{in}^{2}}{${num(side.spacing)}\\mathrm{in}}=`, `Side bars, #${side.bar} @ ${num(side.spacing)} in`, "in^2/ft");
    if (de > 36) {
      m(`A_{sk}\\coloneq0.012\\cdot\\left(${num(de)}-30\\right)\\cdot\\frac{\\mathrm{in}^{2}}{\\mathrm{ft}}=`, "Skin reinforcement, de over 3 ft (AASHTO 5.6.7)", "in^2/ft");
      m(ok("\\max\\left(A_{T},A_{sk}\\right)", "A_{sd}"), "Side bars, each face");
      m(ok(`${num(side.spacing)}\\mathrm{in}`, `${num(Math.min(de / 6, 12, sMaxT))}\\mathrm{in}`), "Side bar spacing: de/6, 12 in");
    } else {
      m(ok("A_{T}", "A_{sd}"), "Side bars, each face");
      m(ok(`${num(side.spacing)}\\mathrm{in}`, `${num(sMaxT)}\\mathrm{in}`), "Side bar spacing");
    }
  }
}

/** H-piles' own checks in the group: structural axial, uplift, axial with flexure from p–y, and the group's deflection. */
export function hPileWorked(w: Writer, i: PileInputs, r: PileRes) {
  const { text, m } = w;
  const factored = r.cases.filter((c) => c.lc.limit !== "service");
  if (!factored.length) return;
  const g = pick(factored, (c) => c.Pmax);
  text(`${i.section}: structural axial and uplift`, "subheading", { keepWithNext: true });
  const sa = r.checks.find((c) => c.id === "struct-axial");
  if (sa) m(ok(`${num(g.Pmax)}\\mathrm{kip}`, `${num(sa.capacity)}\\mathrm{kip}`), `Structural axial at the tip, φc ${i.driving === "good" ? "0.60 (good driving)" : "0.50 (severe driving)"} × Pn, AASHTO 6.15.3.1, 6.5.4.2`);
  const up = r.checks.find((c) => c.id === "uplift");
  if (up) m(ok(`${num(up.demand)}\\mathrm{kip}`, `${num(up.capacity)}\\mathrm{kip}`), `Uplift, the least loaded pile: φ × ${num(i.Rup)} kip (AASHTO 10.7.3.10)`);
  if (r.combined.length) {
    const c = pick(r.combined, (x) => x.inter.value);
    text(`Axial with flexure, the lead row's pile (${c.c.lc.name})`, "subheading", { keepWithNext: true });
    text("Method:- the group's shear spread over its piles, each pushed through the group's deflection by p–y with its row's p-multiplier (AASHTO Table 10.7.2.4-1); the lead row's pile bends the most. Its head fixed in the cap.");
    m(`P_{lu}\\coloneq ${num(c.c.Pmax)}\\mathrm{kip}`, "The most loaded pile");
    m(`M_{ux}\\coloneq ${num(c.Mstrong)}\\mathrm{kip}\\cdot\\mathrm{ft}`, "Strong axis, p–y analysis");
    m(`M_{uy}\\coloneq ${num(c.Mweak)}\\mathrm{kip}\\cdot\\mathrm{ft}`, "Weak axis");
    m(`P_{rh}\\coloneq ${num(c.Pr)}\\mathrm{kip}`, `φc 0.70 × Pn (AASHTO 6.9.4.1)${c.KL > 0 ? `, KL ${num(c.KL)} in` : ""}`);
    m(`M_{rx}\\coloneq ${num(c.Mrx / 12)}\\mathrm{kip}\\cdot\\mathrm{ft}`, "φf 1.0 × Mnx (AASHTO 6.12.2.2.1)");
    m(`M_{ry}\\coloneq ${num(c.Mry / 12)}\\mathrm{kip}\\cdot\\mathrm{ft}`, "φf 1.0 × Mny");
    const e = c.inter.eq;
    const flexTerm = "\\frac{M_{ux}}{M_{rx}}+\\frac{M_{uy}}{M_{ry}}";
    const expr = e.endsWith("-1") ? `\\frac{P_{lu}}{2\\cdot P_{rh}}+${flexTerm}` : e.endsWith("-2") ? `\\frac{P_{lu}}{P_{rh}}+\\frac{8}{9}\\cdot\\left(${flexTerm}\\right)` : `\\frac{P_{lu}}{P_{rh}}+${flexTerm}`;
    m(ok(expr, "1"), `AASHTO Eq. ${e}`);
  }
  const sw = r.checks.find((c) => c.id === "pile-shear-web");
  const sf = r.checks.find((c) => c.id === "pile-shear-flange");
  if (sw || sf) {
    const s = r.section;
    text("Pile shear (AASHTO 6.12.1.2.3, φv 1.0)", "subheading", { keepWithNext: true });
    text("The largest shear from the p–y analyses of the rows. Along the web, Vp = 0.58 Fy D tw (Eq. 6.10.9.3.3-1, k = 5); along the flanges, both flanges, b/t = bf/2tf with k = 1.2; C = 1 while b/t ≤ 1.12 √(E k / Fy) (Eq. 6.10.9.3.2-4).", undefined, { keepWithNext: true });
    if (sw) {
      m(`D_{wp}\\coloneq ${num(s.d)}\\mathrm{in}-2\\cdot${num(s.tf)}\\mathrm{in}=`, "The web between the flanges", "in");
      m(ok(`\\frac{D_{wp}}{${num(s.tw)}\\mathrm{in}}`, `1.12\\cdot\\sqrt{\\frac{29000\\mathrm{ksi}\\cdot5}{${num(i.Fy)}\\mathrm{ksi}}}`), "C = 1");
      m(ok(`${num(sw.demand)}\\mathrm{kip}`, `0.58\\cdot${num(i.Fy)}\\mathrm{ksi}\\cdot D_{wp}\\cdot${num(s.tw)}\\mathrm{in}`), sw.name);
    }
    if (sf) {
      m(ok(`\\frac{${num(s.bf)}}{2\\cdot${num(s.tf)}}`, `1.12\\cdot\\sqrt{\\frac{29000\\cdot1.2}{${num(i.Fy)}}}`), "C = 1");
      m(ok(`${num(sf.demand)}\\mathrm{kip}`, `0.58\\cdot${num(i.Fy)}\\mathrm{ksi}\\cdot2\\cdot${num(s.bf)}\\mathrm{in}\\cdot${num(s.tf)}\\mathrm{in}`), sf.name);
    }
  }
  const d = r.checks.find((c) => c.id === "deflection");
  if (d) m(ok(`${num(d.demand)}\\mathrm{in}`, `${num(i.tolerable)}\\mathrm{in}`), "The group's deflection at Service, p–y (AASHTO 10.7.2.4)");
}

// --- drilled shaft -----------------------------------------------------------------------------------------------------

type ShaftRes = ReturnType<typeof designShaft>;

/** A drilled shaft: axial and uplift, then the section under the p–y moment and shear, and its bars (AASHTO 10.8, 5.6, 5.7). */
export function shaftWorked(w: Writer, i: ShaftInputs, r: ShaftRes) {
  const { text, m } = w;
  const factored = i.cases.filter((c) => c.limit !== "service");
  concrete(w, i.fc, i.fy, i.gammaC);
  m(`D_{s}\\coloneq ${num(i.D)}\\mathrm{in}`, "Diameter");
  m(`L_{s}\\coloneq ${num(i.length)}\\mathrm{ft}`, "Length");
  m(ok("24\\mathrm{in}", "D_{s}"), "CDOT BDM 10.6.1.1");
  m("W_{s}\\coloneq\\frac{\\pi}{4}\\cdot D_{s}^{2}\\cdot L_{s}\\cdot\\gamma_{c}=", "The shaft's weight", "kip");

  text("Axial resistance (AASHTO 10.8.3.5)", "subheading", { keepWithNext: true });
  text("Side resistance:- by layer as the table below gives (clay α, AASHTO Eq. 10.8.3.5.1b-1, the top 5 ft not counted; sand β, Eq. 10.8.3.5.2b-1, with φ′ from N160 and σ′p from N60; rock, Eq. 10.8.3.5.4b-1; or the report's values), each at its φ.");
  m(`R_{s}\\coloneq ${num(r.ax.Rs)}\\mathrm{kip}`, "Nominal side resistance, Σ qs·π·D·Δz");
  m(`R_{Rs}\\coloneq ${num(r.ax.RRs)}\\mathrm{kip}`, "Σ φqs·Rs");
  m(`q_{p}\\coloneq ${num(r.ax.qp)}\\mathrm{ksf}`, `Unit tip resistance in ${r.ax.tipLayer.name}`);
  m("A_{p}\\coloneq\\frac{\\pi}{4}\\cdot D_{s}^{2}=", undefined, "ft^2");
  m("R_{p}\\coloneq q_{p}\\cdot A_{p}=", "Nominal tip resistance", "kip");
  m(`\\phi_{qp}\\coloneq ${num(r.ax.phiP)}`, "AASHTO Table 10.5.5.2.4-1");
  if (factored.length) {
    const g = pick(factored, (c) => c.P);
    const ext = g.limit === "extreme";
    m(`P_{a}\\coloneq ${num(g.P)}\\mathrm{kip}`, `${g.name}, at the shaft's top`);
    m(`P_{us}\\coloneq P_{a}+${g.limit === "strength" ? "1.25\\cdot " : ""}W_{s}=`, "With the shaft's weight", "kip");
    m(ok("P_{us}", ext ? "R_{s}+R_{p}" : "R_{Rs}+\\phi_{qp}\\cdot R_{p}"), ext ? "Extreme event, φ 1.0" : "Side and tip, AASHTO 10.8.3.5");
    const u = pick(factored, (c) => c.uplift);
    if (u.uplift > 0) {
      m(`T_{s}\\coloneq ${num(u.uplift)}\\mathrm{kip}`, `Uplift, ${u.name}`);
      m(`R_{up}\\coloneq ${num(u.limit === "extreme" ? 0.8 * r.ax.Rs : r.ax.RRup)}\\mathrm{kip}`, u.limit === "extreme" ? "0.80 × Rs (CDOT BDM 10.3.3)" : "Σ φup·Rs (AASHTO Table 10.5.5.2.4-1)");
      m(ok("T_{s}", "R_{up}+0.9\\cdot W_{s}"), "Uplift with the shaft's weight, AASHTO 10.8.3.7");
    }
  }

  if (r.structural.length) {
    const g = pick(r.structural, (s) => s.r.Mmax / Math.max(s.phiMn, 1e-9));
    text(`Axial with flexure (${g.c.name})`, "subheading", { keepWithNext: true });
    text("Method:- the shaft as a beam on p–y springs (FHWA GEC 9) under its top's shear and moment, the section's stiffness reduced for cracking; the resistance at the largest moment by strain compatibility over the section's bars (AASHTO 5.6.4.5, 5.6.2).");
    m(`k_{EI}\\coloneq ${num(i.EIfactor)}`, "Cracked stiffness factor");
    m("EI_{s}\\coloneq k_{EI}\\cdot E_{c}\\cdot\\frac{\\pi\\cdot D_{s}^{4}}{64}=", undefined, "kip*in^2");
    m(`H_{s}\\coloneq ${num(g.c.H)}\\mathrm{kip}`, "Shear at the top");
    m(`M_{s}\\coloneq ${num(g.c.M)}\\mathrm{kip}\\cdot\\mathrm{ft}`, "Moment at the top");
    m(`M_{ms}\\coloneq ${num(g.r.Mmax)}\\mathrm{kip}\\cdot\\mathrm{ft}`, "Largest moment, p–y analysis");
    m(`z_{m}\\coloneq ${num(g.r.zMmax)}\\mathrm{ft}`, "Its depth");
    m(`P_{um}\\coloneq${num(g.c.P)}\\mathrm{kip}+${g.c.limit === "strength" ? "1.25\\cdot " : ""}W_{s}\\cdot\\min\\left(1,\\frac{z_{m}}{L_{s}}\\right)=`, "Axial there, with the shaft's weight above it", "kip");
    m(`M_{rs}\\coloneq ${num(g.phiMn)}\\mathrm{kip}\\cdot\\mathrm{ft}`, `φMn at P_um, ${i.bars} #${i.bar} bars, strain compatibility`);
    m(ok("M_{ms}", "M_{rs}"), "AASHTO 5.6.4.5, 10.8.3.9");
    const v = pick(r.structural, (s) => s.Vu / s.phiVn);
    text(`Shear (${v.c.name})`, "subheading", { keepWithNext: true });
    m(`V_{us}\\coloneq ${num(v.Vu)}\\mathrm{kip}`, "Largest shear, p–y analysis");
    m(`D_{r}\\coloneq D_{s}-2\\cdot\\left(${num(i.cover)}\\mathrm{in}+${num(BARS[i.tieBar].dia)}\\mathrm{in}\\right)-${num(BARS[i.bar].dia)}\\mathrm{in}=`, "The bars' circle", "in");
    m("d_{es}\\coloneq\\frac{D_{s}}{2}+\\frac{D_{r}}{\\pi}=", "AASHTO Eq. C5.7.2.8-2", "in");
    m("d_{vs}\\coloneq0.9\\cdot d_{es}=", "AASHTO 5.7.2.8", "in");
    m("V_{cs}\\coloneq0.0316\\cdot2\\cdot\\sqrt{\\frac{f'_{c}}{\\mathrm{ksi}}}\\cdot\\mathrm{ksi}\\cdot D_{s}\\cdot d_{vs}=", "AASHTO Eq. 5.7.3.3-3, β 2", "kip");
    m(`V_{ss}\\coloneq\\frac{2\\cdot${num(BARS[i.tieBar].area)}\\mathrm{in}^{2}\\cdot f_{y}\\cdot d_{vs}}{${num(i.pitch)}\\mathrm{in}}=`, `#${i.tieBar} ${i.transverse === "spiral" ? "spiral" : "hoops"} @ ${num(i.pitch)} in, two legs, θ 45°`, "kip");
    m("V_{ns}\\coloneq\\min\\left(V_{cs}+V_{ss},0.25\\cdot f'_{c}\\cdot D_{s}\\cdot d_{vs}\\right)=", "AASHTO 5.7.3.3", "kip");
    m(ok("V_{us}", "\\phi_{v}\\cdot V_{ns}"), "Shear");
    const ax = r.checks.find((c) => c.id === "axial-struct");
    if (ax) m(ok(`${num(ax.demand)}\\mathrm{kip}`, `${num(ax.capacity)}\\mathrm{kip}`), "The section's axial resistance, φ 0.75 × 0.85 P0 (AASHTO 5.6.4.4)");
  }
  const d = r.checks.find((c) => c.id === "deflection");
  if (d) m(ok(`${num(d.demand)}\\mathrm{in}`, `${num(i.tolerable)}\\mathrm{in}`), "Deflection at the top, Service, p–y (AASHTO 10.8.2.4)");

  text("Longitudinal bars (AASHTO 5.6.4.2)", "subheading", { keepWithNext: true });
  m(`A_{st}\\coloneq ${i.bars}\\cdot${num(BARS[i.bar].area)}\\mathrm{in}^{2}=`, `${i.bars} #${i.bar}`, "in^2");
  m("A_{gs}\\coloneq\\frac{\\pi}{4}\\cdot D_{s}^{2}=", undefined, "in^2");
  m(ok("0.135", "\\frac{A_{st}\\cdot f_{y}}{A_{gs}\\cdot f'_{c}}"), "AASHTO Eq. 5.6.4.2-3");
  m(ok("\\frac{A_{st}}{A_{gs}}", "0.08"), "At most 8 %");
}
