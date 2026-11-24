import type { Line } from "@/lib/calcs/library/templates";
import type { Figure } from "../figures";
import { checksSummary } from "../checks-summary";
import { COLOR_NOTE, INPUT_COLOR, isInput, num } from "../calc-style";
import { designScour, type ScourInputs } from "./scour";

// The bridge scour calc: the bed material, each flood's contraction scour (live-bed or clear-water, pressure flow),
// each pier's local scour and each abutment's NCHRP 24-20 scour, worked as live math, then the totals and the minimum
// scour elevations at every element for the scour design flood and the check flood.

const METHOD: Record<string, string> = { hec18: "HEC-18 7.2, Eq. 7.3", fdot: "FDOT method, HEC-18 7.3", complex: "complex pier, HEC-18 7.5", cohesive: "cohesive bed, HEC-18 7.12", rock: "erodible rock, HEC-18 7.13" };
const SHAPE: Record<string, string> = { square: "square nose", round: "round nose", circular: "circular cylinder", sharp: "sharp nose", columns: "multiple columns" };

export function scourCalcLines(i: ScourInputs, title: string, figures?: { plot?: Figure }): Line[] {
  const lines: Line[] = [];
  const text = (t: string, style?: "heading" | "subheading" | "note") => lines.push({ text: t, ...(style ? { style } : {}) });
  const m = (math: string, ref?: string, unit?: string) => lines.push({ math, ...(ref ? { ref } : {}), ...(unit ? { unit } : {}), ...(isInput(math) ? { color: INPUT_COLOR } : {}) });
  const r = designScour(i);
  text(title.toUpperCase(), "heading");
  text(
    `Bridge scour by FHWA HEC-18, 5th Edition (2012), as CDOT requires it (Drainage Design Manual 10.6; Scour Program Procedures Manual 3.4.5): at each pier, long-term degradation, contraction scour (or pressure-flow scour, the larger) and local pier scour; at each abutment, long-term degradation and the NCHRP 24-20 depth, which includes contraction scour. For ${i.floods.map((f) => f.name).join(" and ")}. Countermeasures are not counted (DDM 10.6.3).`,
  );
  text(COLOR_NOTE, "note");

  text("Bed material", "subheading");
  m(`D_{50}\\coloneq ${num(i.D50)}\\mathrm{mm}`, i.D50 < 0.2 ? "0.2 mm used in Eqs. 6.1 and 6.4 (HEC-18 6.7)" : "Median size, the upper foot of the bed upstream");
  m(`\\omega\\coloneq ${num(r.contraction[0].fall, 4)}\\frac{\\mathrm{ft}}{\\mathrm{s}}`, i.fall > 0 ? "Fall velocity, entered" : "Fall velocity, natural sand SG 2.65 at 68 °F (Ferguson and Church 2004; HEC-18 Figure 6.8)");

  i.floods.forEach((f, k) => {
    const c = r.contraction[k];
    const n = k + 1;
    const cc = f.contraction;
    text(`${f.name}: contraction scour (HEC-18 Chapter 6)`, "subheading");
    m(`y_{1.${n}}\\coloneq ${num(cc.y1)}\\mathrm{ft}`, "Upstream main channel, average depth");
    m(`V_{${n}}\\coloneq\\frac{${num(cc.Q1)}\\frac{\\mathrm{ft}^{3}}{\\mathrm{s}}}{${num(cc.W1)}\\mathrm{ft}\\cdot y_{1.${n}}}=`, "Approach velocity, Q1 / (W1 y1)", "ft/s");
    m(`V_{c.${n}}\\coloneq 11.17\\cdot\\left(\\frac{y_{1.${n}}}{\\mathrm{ft}}\\right)^{\\frac{1}{6}}\\cdot\\left(\\frac{${num(Math.max(0.2, i.D50) / 304.8, 6)}\\mathrm{ft}}{\\mathrm{ft}}\\right)^{\\frac{1}{3}}\\cdot\\frac{\\mathrm{ft}}{\\mathrm{s}}=`, "Critical velocity, Eq. 6.1", "ft/s");
    text(c.live ? `${cc.mode === "live" ? "Live-bed, as chosen" : "V > Vc: live-bed"}${cc.armor ? ", limited by armoring (the smaller of the live-bed and clear-water depths, 6.3 Note 8)" : ""}.` : `${cc.mode === "clear" ? "Clear-water, as chosen" : "V ≤ Vc: clear-water"}.`);
    if (c.live) {
      m(`V_{*${n}}\\coloneq\\sqrt{32.2\\frac{\\mathrm{ft}}{\\mathrm{s}^{2}}\\cdot y_{1.${n}}\\cdot ${num(cc.S1, 5)}}=`, "Shear velocity, (g y1 S1)^½", "ft/s");
      text(`V*/ω = ${num(c.Vstar / c.fall, 3)}: k1 = ${c.k1} (HEC-18 6.3).`);
      m(`y_{2.${n}}\\coloneq y_{1.${n}}\\cdot\\left(\\frac{${num(cc.Q2)}}{${num(cc.Q1)}}\\right)^{\\frac{6}{7}}\\cdot\\left(\\frac{${num(cc.W1)}}{${num(cc.W2)}}\\right)^{${c.k1}}=`, "Live-bed, Eq. 6.2", "ft");
      if (cc.armor) m(`y_{2c.${n}}\\coloneq ${num(c.yClear, 4)}\\mathrm{ft}`, "Clear-water depth, Eq. 6.4; the smaller governs");
    } else {
      m(`y_{2.${n}}\\coloneq\\left(\\frac{0.0077\\cdot ${num(cc.Q2)}^{2}}{\\left(1.25\\cdot ${num(Math.max(0.2, i.D50) / 304.8, 6)}\\right)^{\\frac{2}{3}}\\cdot ${num(cc.W2)}^{2}}\\right)^{\\frac{3}{7}}\\cdot\\mathrm{ft}=`, "Clear-water, Eq. 6.4 (Dm = 1.25 D50)", "ft");
    }
    if (c.cohesive && cc.cohesive) {
      const co = cc.cohesive;
      text(`A cohesive bed (HEC-18 6.7): the granular depth (${num(c.granular, 3)} ft) is replaced by the ultimate scour by the bed's critical shear stress${c.cohesive.timed ? ", and the scour reached in the flood's duration" : ""}.`);
      m(`V_{2.${n}}\\coloneq\\frac{${num(cc.Q2)}\\frac{\\mathrm{ft}^{3}}{\\mathrm{s}}}{${num(cc.W2)}\\mathrm{ft}\\cdot ${num(cc.y0)}\\mathrm{ft}}=`, "Velocity at the bridge before scour", "ft/s");
      m(`y_{su.${n}}\\coloneq\\max\\left(0.94\\cdot y_{1.${n}}\\cdot\\left(\\frac{1.83\\cdot V_{2.${n}}}{\\sqrt{32.2\\frac{\\mathrm{ft}}{\\mathrm{s}^{2}}\\cdot y_{1.${n}}}}-\\frac{1.486\\cdot\\sqrt{\\frac{${num(co.tauc, 4)}}{1.94}}}{32.2\\cdot ${num(co.n, 4)}\\cdot\\left(\\frac{y_{1.${n}}}{\\mathrm{ft}}\\right)^{\\frac{1}{3}}}\\right),0\\mathrm{ft}\\right)=`, `Ultimate scour, Eq. 6.6 (τc ${num(co.tauc, 3)} psf, n ${num(co.n, 3)})`, "ft");
      if (c.cohesive.timed) m(`y_{s.${n}}\\coloneq\\frac{${num(co.hours)}}{\\frac{1}{${num(co.zdot, 4)}}+\\frac{${num(co.hours)}}{\\frac{y_{su.${n}}}{\\mathrm{ft}}}}\\cdot\\mathrm{ft}=`, `Scour in the flood's ${num(co.hours)} hours at an initial rate of ${num(co.zdot, 4)} ft/hr, Eq. 6.8`, "ft");
      else m(`y_{s.${n}}\\coloneq y_{su.${n}}=`, "Contraction scour, the ultimate depth", "ft");
    } else m(`y_{s.${n}}\\coloneq\\max\\left(${num(c.y2, 4)}\\mathrm{ft}-${num(cc.y0)}\\mathrm{ft},0\\mathrm{ft}\\right)=`, "Contraction scour, Eqs. 6.3/6.5 (y0 the existing depth)", "ft");
    if (c.pressure) {
      const p = f.pressure;
      text(`Pressure flow (6.10): the water ${num(p.hu)} ft deep upstream against an opening ${num(p.hb)} ft high${c.pressure.overtopping ? `, overtopping (hw ${num(c.pressure.hw, 3)} ft)` : ""}.`);
      m(`t_{${n}}\\coloneq ${num(p.hb)}\\mathrm{ft}\\cdot 0.5\\cdot\\left(\\frac{${num(p.hb)}\\cdot ${num(c.pressure.ht, 4)}}{${num(p.hu)}^{2}}\\right)^{0.2}\\cdot\\left(1-\\frac{${num(c.pressure.hw, 4)}}{${num(c.pressure.ht, 4)}}\\right)^{-0.1}=`, "Separation zone, Eq. 6.16", "ft");
      m(`y_{sp.${n}}\\coloneq ${num(c.pressure.y2, 4)}\\mathrm{ft}+t_{${n}}-${num(p.hb)}\\mathrm{ft}=`, "Pressure-flow scour, Eq. 6.14 (y2 for the opening's flow)", "ft");
      text(`The larger, ${c.governs === "pressure" ? "pressure-flow" : "contraction"} scour ${num(c.depth, 3)} ft, is used (DDM 10.6.2).`);
    }
  });

  r.piers.forEach(({ pier, local }) => {
    text(`${pier.name}: local scour (${METHOD[local[0]?.method ?? "hec18"]})`, "subheading");
    text(`${SHAPE[pier.shape]}, ${num(pier.a)} ft wide${pier.shape === "columns" ? `, ${pier.columns.n} columns at ${num(pier.columns.spacing)} ft` : `, ${num(pier.L)} ft long`}; bed: ${pier.bed.replace("-", " ")}; datum El. ${num(pier.datum)}${pier.rock !== null ? `; non-erodible rock at El. ${num(pier.rock)}` : ""}.`);
    local.forEach((l, k) => {
      const fl = pier.flow[k] ?? pier.flow[0];
      const n = `${k + 1}`;
      text(`${i.floods[k].name}: y1 ${num(fl.y1)} ft, V1 ${num(fl.V1)} ft/s, angle of attack ${num(fl.angle)}°.${l.notes.length ? ` ${l.notes.join("; ")}.` : ""}`);
      m(`F_{r${n}}\\coloneq\\frac{${num(fl.V1)}}{\\sqrt{32.2\\cdot ${num(fl.y1)}}}=`, "Froude number upstream");
      m(`K_{2.${n}}\\coloneq ${num(l.K2, 4)}`, "Angle of attack, Eq. 7.4 (L/a at most 12)");
      const gf = l.groupFactor !== 1 ? `${num(l.groupFactor)}\\cdot ` : "";
      if (l.method === "cohesive") {
        const Vc = pier.material!.Vc;
        m(`y_{sp${n}}\\coloneq ${gf}2.2\\cdot ${num(l.K1)}\\cdot K_{2.${n}}\\cdot ${num(l.a, 4)}^{0.65}\\cdot\\left(\\frac{\\max\\left(2.6\\cdot ${num(fl.V1)}-${num(Vc)},0\\right)}{\\sqrt{32.2}}\\right)^{0.7}\\cdot\\mathrm{ft}=`, `Cohesive bed, Eq. 7.35 (Vc ${num(Vc)} ft/s from erosion tests)`, "ft");
      } else if (l.method === "rock" && l.rock) {
        const mt = pier.material!;
        m(`P_{c${n}}\\coloneq ${num(mt.K)}^{0.75}=`, "Critical stream power, kW/m², Eq. 7.38 (K the erodibility index)");
        m(`\\tau_{r${n}}\\coloneq 9810\\cdot ${num(fl.y1 * 0.3048, 4)}\\cdot ${num(mt.S, 5)}=`, "Bed shear, γ y S, Pa (SI, as HEC-18 7.13 works it)");
        m(`P_{a${n}}\\coloneq 7.853\\cdot\\left(\\frac{\\tau_{r${n}}}{1000}\\right)^{1.5}=`, "Approach stream power, kW/m², Eq. 7.39");
        m(`y_{sp${n}}\\coloneq\\max\\left(\\frac{\\ln\\left(\\frac{8.42\\cdot P_{a${n}}}{P_{c${n}}}\\right)}{0.712},0\\right)\\cdot ${num(l.a, 4)}\\mathrm{ft}+${num(l.rock.abrasion, 4)}\\mathrm{ft}=`, "Plucking to where the pier's stream power (Eq. 7.40) falls to Pc, plus abrasion GSN·Ω (7.41)", "ft");
      } else if (l.method === "fdot" && l.fdot) {
        const fd = l.fdot;
        const D = num(Math.max(0.1, Math.min(100, i.D50)) / 304.8, 6);
        m(`a_{F.${n}}\\coloneq ${num(fd.Ksf, 4)}\\cdot ${num(fd.aproj, 4)}\\mathrm{ft}=`, "Effective width Ksf · a_proj, Eqs. 7.15–7.18", "ft");
        m(`V_{cF${n}}\\coloneq 5.75\\cdot ${num(fd.ustar, 5)}\\frac{\\mathrm{ft}}{\\mathrm{s}}\\cdot\\log\\left(\\frac{5.53\\cdot ${num(fl.y1)}\\mathrm{ft}}{${D}\\mathrm{ft}}\\right)=`, "Critical velocity, Eqs. 7.12–7.14 (u*c by D50)", "ft/s");
        m(`V_{lp${n}}\\coloneq\\max\\left(5\\cdot V_{cF${n}},0.6\\cdot\\sqrt{32.2\\frac{\\mathrm{ft}}{\\mathrm{s}^{2}}\\cdot ${num(fl.y1)}\\mathrm{ft}}\\right)=`, "Live-bed peak velocity, Eq. 7.11", "ft/s");
        m(`f_{1.${n}}\\coloneq\\tanh\\left(\\left(\\frac{${num(fl.y1)}\\mathrm{ft}}{a_{F.${n}}}\\right)^{0.4}\\right)=`, "Eq. 7.8");
        m(`f_{3.${n}}\\coloneq\\frac{\\left(\\frac{a_{F.${n}}}{${D}\\mathrm{ft}}\\right)^{1.13}}{10.6+0.4\\cdot\\left(\\frac{a_{F.${n}}}{${D}\\mathrm{ft}}\\right)^{1.33}}=`, "Eq. 7.10");
        m(`y_{sc${n}}\\coloneq 2.5\\cdot f_{1.${n}}\\cdot f_{3.${n}}\\cdot a_{F.${n}}=`, "Clear-water peak, Eq. 7.6", "ft");
        m(`y_{slp${n}}\\coloneq 2.2\\cdot f_{1.${n}}\\cdot a_{F.${n}}=`, "Live-bed peak, Eq. 7.7", "ft");
        m(`V_{1F.${n}}\\coloneq ${num(fl.V1)}\\frac{\\mathrm{ft}}{\\mathrm{s}}`, "Velocity upstream of the pier");
        const V1 = `V_{1F.${n}}`;
        const region = fd.region.split(" ")[0];
        const expr =
          region === "I"
            ? `0\\mathrm{ft}`
            : region === "II"
              ?`\\left(1-1.2\\cdot\\left(\\ln\\left(\\frac{${V1}}{V_{cF${n}}}\\right)\\right)^{2}\\right)\\cdot y_{sc${n}}`
              : region === "IV"
                ? `y_{slp${n}}`
                : `y_{sc${n}}+\\frac{${V1}-V_{cF${n}}}{V_{lp${n}}-V_{cF${n}}}\\cdot\\left(y_{slp${n}}-y_{sc${n}}\\right)`;
        m(`y_{sp${n}}\\coloneq ${gf}${expr}=`, `FDOT region ${fd.region}, Eqs. 7.5–7.7`, "ft");
      } else if (l.method === "complex" && l.complex) {
        const cx = l.complex;
        const c = pier.complex!;
        text(`Complex pier (HEC-18 7.5): a ${num(c.capWidth)} × ${num(c.capLength)} ft ${c.capShape} cap or footing, ${num(c.T)} ft thick, its bottom at El. ${num(c.capBottom)}, ${num(cx.h0, 3)} ft above the bed lowered by degradation and contraction scour (h0); overhang f ${num(c.f)} ft.`);
        m(`K_{hp${n}}\\coloneq ${num(cx.Kh, 4)}`, `Pier stem height factor, Figure 7.6 (h1/a ${num(cx.h1 / pier.a, 3)}, f/a ${num(c.f / pier.a, 3)})`);
        const K1s = Math.abs(fl.angle) > 5 ? 1 : l.K1;
        m(`y_{s1.${n}}\\coloneq K_{hp${n}}\\cdot 2.0\\cdot ${num(K1s)}\\cdot K_{2.${n}}\\cdot ${num(l.K3)}\\cdot ${num(pier.a, 4)}\\mathrm{ft}\\cdot\\left(\\frac{${num(fl.y1)}}{${num(pier.a, 4)}}\\right)^{0.35}\\cdot F_{r${n}}^{0.43}=`, "Pier stem, Eq. 7.23", "ft");
        const cp = cx.cap;
        const K1c = Math.abs(fl.angle) > 5 ? 1 : c.capShape === "square" ? 1.1 : 1.0;
        const th = (Math.abs(fl.angle) * Math.PI) / 180;
        const K2c = (Math.cos(th) + Math.min(Math.max(c.capLength, c.capWidth) / c.capWidth, 12) * Math.sin(th)) ** 0.65;
        text(cp.case === 1 ? `Case 1, the cap's bottom above the bed after the stem's scour (h2 ${num(cx.h0 + cx.ysPier / 2, 3)} ft): an equivalent full-depth pier ${num(cp.aStar, 4)} ft wide (Figure 7.7), in the flow deepened by half the stem's scour.` : `Case 2, the footing on or below the bed: its full width in the flow below its top, ${num(cp.y, 4)} ft deep at ${num(cp.V, 4)} ft/s (Eqs. 7.25, 7.26).`);
        m(`y_{s2.${n}}\\coloneq 2.0\\cdot ${num(K1c)}\\cdot ${num(K2c, 4)}\\cdot ${num(l.K3)}\\cdot ${num(cp.Kw, 4)}\\cdot ${num(cp.aStar, 4)}\\mathrm{ft}\\cdot\\left(\\frac{${num(cp.y, 4)}}{${num(cp.aStar, 4)}}\\right)^{0.35}\\cdot\\left(\\frac{${num(cp.V, 4)}}{\\sqrt{32.2\\cdot ${num(cp.y, 4)}}}\\right)^{0.43}=`, cp.case === 1 ? "Pile cap, Eq. 7.24" : "Footing, Eq. 7.27", "ft");
        let sum = `y_{s1.${n}}+y_{s2.${n}}`;
        if (cx.group) {
          const gp = cx.group;
          text(`Pile group: projected width ${num(gp.aproj, 3)} ft, Ksp ${num(gp.Ksp, 3)} (Figure 7.11), Km ${num(gp.Km, 3)} (Figure 7.12): a*pg ${num(gp.aStar, 3)} ft (Eq. 7.28); h3 ${num(gp.h3, 3)} ft above the bed, y3 ${num(gp.y3, 3)} ft (at most 3.5 a*pg), V3 ${num(gp.V3, 3)} ft/s; Kh pg ${num(gp.Kh, 3)} (Figure 7.13).`);
          m(`y_{s3.${n}}\\coloneq ${num(gp.Kh, 4)}\\cdot 2.0\\cdot ${num(c.piles.square ? 1.1 : 1.0)}\\cdot ${num(l.K3)}\\cdot ${num(gp.aStar, 4)}\\mathrm{ft}\\cdot\\left(\\frac{${num(gp.y3, 4)}}{${num(gp.aStar, 4)}}\\right)^{0.35}\\cdot\\left(\\frac{${num(gp.V3, 4)}}{\\sqrt{32.2\\cdot ${num(gp.y3, 4)}}}\\right)^{0.43}=`, "Pile group, Eq. 7.31", "ft");
          sum += `+y_{s3.${n}}`;
        }
        m(`y_{sp${n}}\\coloneq ${sum}=`, "Total for the complex pier, Eq. 7.22", "ft");
      } else {
        m(`y_{sp${n}}\\coloneq 2.0\\cdot ${num(l.K1)}\\cdot K_{2.${n}}\\cdot ${num(l.K3)}\\cdot ${num(l.Kw, 4)}\\cdot ${num(l.groupFactor)}\\cdot ${num(l.a, 4)}\\mathrm{ft}\\cdot\\left(\\frac{${num(fl.y1)}}{${num(l.a, 4)}}\\right)^{0.35}\\cdot F_{r${n}}^{0.43}=`, `K1 ${num(l.K1)}, K3 ${num(l.K3)}, Kw ${num(l.Kw, 3)}${l.groupFactor !== 1 ? ", 1.2 for spaced columns" : ""}`, "ft");
      }
    });
  });

  r.abutments.forEach(({ abutment, local }) => {
    text(`${abutment.name}: abutment scour (NCHRP 24-20, HEC-18 8.6.3)`, "subheading");
    text(`${abutment.type === "spill-through" ? "Spill-through" : "Wingwall"} abutment, L/Bf ${num(abutment.LBf, 3)}: scour condition ${abutment.LBf >= 0.75 ? "(a), in or near the main channel, live-bed" : "(b), set back on the floodplain, clear-water"}; datum El. ${num(abutment.datum)}.`);
    local.forEach((l, k) => {
      const fl = abutment.flow[k] ?? abutment.flow[0];
      const n = `${k + 1}`;
      text(`${i.floods[k].name}: q1 ${num(fl.q1)} ft²/s, q2 ${num(fl.q2)} ft²/s, q2/q1 ${num(l.ratio, 3)}; yc ${l.how}.`);
      m(`y_{c.${n}}\\coloneq ${num(l.yc, 4)}\\mathrm{ft}`, "Flow depth with contraction scour");
      m(`\\alpha_{${n}}\\coloneq ${num(l.alpha, 3)}`, `Amplification, HEC-18 Figure ${l.condition === "A" ? (abutment.type === "spill-through" ? "8.9" : "8.10") : abutment.type === "spill-through" ? "8.11" : "8.12"}`);
      m(`y_{sa.${n}}\\coloneq\\alpha_{${n}}\\cdot y_{c.${n}}-${num(fl.y0)}\\mathrm{ft}=`, "Eqs. 8.3 and 8.4, ymax − y0", "ft");
    });
  });

  text("Total scour and minimum scour elevations (CDOT Scour Program Manual 3.4.5.5)", "subheading");
  if (figures?.plot) lines.push({ region: figures.plot });
  for (const e of r.elements)
    for (const f of e.floods)
      text(
        `${e.name}, ${f.name}: LTD ${num(f.ltd, 2)} + ${e.kind === "pier" ? `contraction ${num(f.contraction, 2)} + local ${num(f.local, 2)}` : `abutment (with contraction) ${num(f.local, 2)}`} = ${num(f.total, 2)} ft; El. ${num(e.datum, 2)} − ${num(f.total, 2)} = El. ${num(f.elevation, 2)}${f.rockLimited ? " (stopped at non-erodible rock)" : ""}.`,
      );
  text("Foundations are designed for the scour design flood's scour at the Strength and Service limit states, and checked for the check flood's at the Extreme Event (AASHTO 2.6.4.4.2, 3.7.5; CDOT Scour Program Manual 3.4.5).", "note");
  lines.push(...checksSummary([{ checks: r.checks }]));
  return lines;
}
