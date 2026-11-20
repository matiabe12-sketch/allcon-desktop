import type { Line } from "@/lib/calcs/library/templates";
import { checksSummary } from "../checks-summary";
import { textTable } from "../svg-table";
import { COLOR_NOTE, INPUT_COLOR, isInput, num } from "../calc-style";
import type { Figure } from "../figures";
import { designModular, type ModularJointInputs } from "./modular";

// A modular joint as a Calcs worksheet: the movement with the added range, the seals and size, the opening at the
// planned installation temperature as live math; the settings table and what the plans give the manufacturer.

const ok = (demand: string, capacity: string) => `\\operatorname{if}\\left(${demand}\\le ${capacity},\\text{OK},\\text{NG}\\right)=`;

export function modularCalcLines(i: ModularJointInputs, title: string, figures?: Figure[]): Line[] {
  const lines: Line[] = [];
  const text = (t: string, style?: "heading" | "subheading" | "note") => lines.push({ text: t, ...(style ? { style } : {}) });
  const m = (math: string, ref?: string, unit?: string) => lines.push({ math, ...(ref ? { ref } : {}), ...(unit ? { unit } : {}), ...(math.length > 110 && ref ? { wide: true } : {}), ...(isInput(math) ? { color: INPUT_COLOR } : {}) });
  const r = designModular(i);

  text(title.toUpperCase(), "heading");
  text("A modular bridge joint system sized for the plans, AASHTO LRFD 14.5.3.2 and 14.5.6.9.2, CDOT BDM 14.4.5: the movement normal to the skewed joint with the added range, the seals at 3 in each at most, the size in 3 in steps, and the opening to set at installation. The centerbeams, support bars and anchorage are the manufacturer's design to 14.5.6.9.");
  text(COLOR_NOTE, "note");

  text("Movement (AASHTO 3.12.2, 14.5.3.2)", "subheading");
  m(`L\\coloneq ${num(i.L)}\\mathrm{ft}`, "From the neutral point to the joint");
  m(`\\theta\\coloneq ${num(i.skew)}\\mathrm{deg}`, "Skew");
  m(`\\alpha_T\\coloneq ${num(i.alpha * 1e6)}\\cdot10^{-6}`, "Per °F, AASHTO 5.4.2.2 / 6.4.1");
  m(`\\varepsilon_{cs}\\coloneq ${num(i.creepShrink)}`, "Creep and shrinkage still to come");
  m(`T_{max}\\coloneq ${num(i.Tmax)}`, "°F, AASHTO 3.12.2");
  m(`T_{min}\\coloneq ${num(i.Tmin)}`, "°F");
  m(`\\gamma_{TU}\\coloneq ${num(i.gammaTU)}`, "AASHTO T. 3.4.1-1");
  m("\\Delta_{tot}\\coloneq L\\cdot\\left(\\gamma_{TU}\\cdot\\left(T_{max}-T_{min}\\right)\\cdot\\alpha_T+\\varepsilon_{cs}\\right)\\cdot\\cos\\left(\\theta\\right)=", "Normal to the joint", "in");
  m(`\\Delta_{add}\\coloneq ${num(r.extra)}\\mathrm{in}`, "Added range, AASHTO Table 14.5.6.9.2-1");
  m("\\Delta_{des}\\coloneq\\Delta_{tot}+\\Delta_{add}=", undefined, "in");

  text("Seals and size (AASHTO 14.5.3.2-2, CDOT BDM 14.4.5)", "subheading");
  m(`g_{max}\\coloneq ${num(i.gap)}\\mathrm{in}`, "Each seal's largest opening");
  m(`n\\coloneq ${r.seals}`, `Seals: 0–${r.size} in, CDOT's 3 in steps, 6 in the least`);
  m(ok("\\Delta_{des}", "n\\cdot g_{max}"), "Within the joint's range");
  if (figures?.length) for (const f of figures) lines.push({ region: f });

  text(`Setting at ${num(i.Ti)}°F (AASHTO 14.5.5.1)`, "subheading");
  m(`T_i\\coloneq ${num(i.Ti)}`, "°F, installation temperature");
  m("\\Delta_c\\coloneq L\\cdot\\left(\\gamma_{TU}\\cdot\\left(T_i-T_{min}\\right)\\cdot\\alpha_T+\\varepsilon_{cs}\\right)\\cdot\\cos\\left(\\theta\\right)=", "Opening as it cools and shrinks", "in");
  m("\\Delta_h\\coloneq L\\cdot\\left(\\gamma_{TU}\\cdot\\left(T_{max}-T_i\\right)\\cdot\\alpha_T-\\varepsilon_{cs}\\right)\\cdot\\cos\\left(\\theta\\right)=", "Closing as it warms", "in");
  m("A_{max}\\coloneq n\\cdot g_{max}-\\Delta_c-\\frac{\\Delta_{add}}{2}=", "Half the added range kept each way", "in");
  m("A_{min}\\coloneq\\Delta_h+\\frac{\\Delta_{add}}{2}=", undefined, "in");
  m(ok("A_{min}", "A_{max}"), "The openings fit");
  m("A\\coloneq\\frac{A_{max}+A_{min}}{2}=", "Total opening to set", "in");
  m("\\frac{A}{n}=", "Each seal", "in");
  m(ok("\\frac{A+\\Delta_c}{n}", "3\\mathrm{in}"), "Each gap at the coldest, AASHTO 14.5.3.2-2");
  m(`t_{eb}\\coloneq ${num(i.edgeT)}\\mathrm{in}`, "Edgebeam thickness");
  m(ok("0.375\\mathrm{in}", "t_{eb}"), "AASHTO 14.5.6.9.7a");

  text("Settings by installation temperature", "subheading");
  lines.push({
    region: textTable(
      [{ title: ["Installation", "temperature (°F)"], x: 96, anchor: "end" }, { title: ["Opening A", "(in)"], x: 180, anchor: "end" }, { title: ["Each seal", "(in)"], x: 260, anchor: "end" }, { title: "Note", x: 280 }],
      r.table.map((row) => [num(row.Ti), row.status === "too small" ? "—" : num(row.A, 3), row.status === "too small" ? "—" : num(row.perGap, 3), row.status === "ok" ? "" : row.status === "outside" ? "outside the design temperatures" : "the joint can't take the movements from here"]),
      640,
    ),
  });

  text("For the manufacturer (AASHTO 14.5.6.9)", "subheading");
  text(`Movements: along ${num(r.plans.longitudinal, 3)} in (with the ${num(r.extra)} in added), across 1.0 in and vertical 1.0 in total, rotations 1° about the two horizontal axes and 0.5° about the vertical (Table 14.5.6.9.2-1, half each way). Blockout ${num(r.blockout.width, 2)} in wide × ${num(i.blockoutDepth)} in deep, to confirm with the manufacturer.`);
  text("Design to 14.5.6.9.4–14.5.6.9.7: the design tandem with IM 75% and 20% horizontal at Strength I, the distribution of Table 14.5.6.9.5-1, compact sections; infinite fatigue life for the 32 kip axle as a tandem (42 kip range with IM and γ), the centerbeam-to-support-bar connection tested per Appendix A19 of the AASHTO LRFD Bridge Construction Specifications. Calcs sealed by a Colorado PE with the shop drawings (CDOT BDM 14.4.5, 14.6).");
  lines.push(...checksSummary([{ checks: r.checks }]));
  return lines;
}
