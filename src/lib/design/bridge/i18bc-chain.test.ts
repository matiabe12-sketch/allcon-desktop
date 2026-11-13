import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS, evaluateSheet, type SheetItem } from "@/lib/calcs/evaluate";
import { layout, type Line } from "@/lib/calcs/library/templates";
import { readingOrder } from "@/lib/calcs/types";
import { designApproachSlab, type ApproachSlabInputs } from "../approach/approach-slab";
import { approachSlabCalcLines } from "../approach/approach-slab-calc";
import { designBearing } from "../bearings/elastomeric";
import { bearingCalcLines } from "../bearings/elastomeric-calc";
import type { SummaryGroup } from "../checks-summary";
import { designDeck } from "../decks/deck";
import { deckCalcLines } from "../decks/deck-calc";
import { foundationCalcLines } from "../foundations/calc";
import { abutmentInputs, shaftInputs } from "../foundations/kinds";
import { runFoundation } from "../foundations/run";
import { girderCalcLines } from "../girders/prestressed-calc";
import { approachSlabInputs, bearingInputs, deckInputs, wingwallInputs } from "../kinds";
import { columnInputs, designColumn } from "../piers/column";
import { columnCalcLines } from "../piers/column-calc";
import { columnLinkFrom } from "../piers/column-link";
import { roundFor, type PayLine } from "../rebar/pay-lines";
import { nodeLpSolver } from "../stm/lp-node";
import { capDetailOrNull, stmPackageLines, stmPayLines } from "../stm/package";
import { designStm, stmInputs } from "../stm/strut-tie";
import { takeoffFor, takeoffPayLines } from "../takeoff";
import { designWingwall } from "../walls/wingwall";
import { wingwallCalcLines } from "../walls/wingwall-calc";
import { runBridge } from "./bridge";
import { bridgeCalcLines, soqRows, type CalcPart, type PayColumn, type SupportCalc } from "./calc";
import { bridgeIfc, meshVolume } from "./ifc";
import { I18BC, I18BC_DIAPHRAGM_TOP, I18BC_ABUT_SOIL, I18BC_GIRDER, I18BC_PAD, I18BC_PILE, I18BC_SHAFT_LAYERS, I18BC_SOQ } from "./i18bc.fixture";
import { MULTICOLUMN_DEFAULTS } from "../stm/templates";
import { deckLengthFor, abutmentFromBridge, approachSlabFromBridge, bearingFromBridge, capFromBridge, columnFromBridge, deckFromBridge, shaftFromColumn, wingwallFromBridge } from "./loadpath";
import { renderBridgeSvg } from "./render3d";

// CDOT 24610 I-18-BC, the whole bridge through the Bridge: every component designed from its load path,
// with the details the FOR quantities and sealed calcs give, the calc package built and worked out as one
// worksheet, and our quantities set against the FOR summary of quantities. The report is printed.

const pays = (kind: string, inputs: unknown, settings?: { length?: number }) => {
  const t = takeoffFor(kind, inputs, settings);
  return t ? takeoffPayLines(kind, t, {}, inputs) : [];
};
const scaled = (lines: PayLine[], k: number) => lines.map((l) => ({ ...l, quantity: roundFor(l.unit, l.quantity * k) }));
const verdict = (g: SummaryGroup[]) => {
  const c = g.flatMap((x) => x.checks).filter((x) => !x.advisory);
  const f = c.filter((x) => !x.ok);
  return { n: c.length, fail: f.map((x) => `${x.name} (${x.capacity > 0 ? (x.demand / x.capacity).toFixed(2) : "—"})`) };
};

async function build() {
  const b = I18BC;
  const run = runBridge(b, [I18BC_GIRDER]);
  const g = run.groups[0].inputs;
  const report: string[] = [];
  const superParts: CalcPart[] = [];
  const deck = { ...deckFromBridge(b, run, deckInputs({}), { id: "g", name: "Girders" }), topBars: { bar: 5, spacing: 6 }, botBars: { bar: 5, spacing: 6 }, topLong: { bar: 4, spacing: 6 }, botLong: { bar: 4, spacing: 5 } };
  superParts.push({ label: "Deck, overhang and rail", name: "I-18-BC deck", lines: deckCalcLines(deck, "I-18-BC deck"), checks: [{ checks: designDeck(deck).checks }] });
  const gr = run.groups[0].result;
  superParts.push({ label: "Girders, spans 1–2", name: "I-18-BC girders", lines: girderCalcLines(g, "I-18-BC girders"), checks: [...gr.spans.flatMap((s) => [s.interior, s.exterior].map((x) => ({ title: `span ${s.index + 1} ${x.exterior ? "exterior" : "interior"}`, checks: x.checks }))), ...gr.piers.flatMap((p) => (["interior", "exterior"] as const).map((side) => ({ title: `pier ${side}`, checks: p[side].checks })))] });
  // The deck back face to back face of the abutments (caps 4 ft wide, centered on the bearings).
  const abut = { ...abutmentInputs({}), type: "integral-piles" as const, capWidth: 4 };
  const deckFt = deckLengthFor(b, [abut, abut]);
  report.push(`Deck length, back face to back face: ${deckFt} ft (FOR 211.4 ft)`);
  const superPay = [...pays("lrfd-girder-check", g, { length: deckFt }), ...pays("deck-slab", { ...deck, fromGirder: { id: "g", name: "Girders" } }, { length: deckFt })];
  const pay: PayColumn[] = [{ label: "Superstructure", lines: superPay }];
  const approachPay: PayLine[] = [];
  const supports: SupportCalc[] = [];
  const pileBelowCap = [77.1, 67.8]; // the FOR piles' average length less the 1.5 ft in the cap, Abut 1 and Abut 3
  for (let k = 0; k < b.supports.length; k++) {
    const s = b.supports[k];
    const parts: CalcPart[] = [];
    const sPay: PayLine[] = [];
    // Sheet B17: 3/4 x 8 in x 3'-1" plain leveling pads, Method A.
    const br = { ...bearingFromBridge(b, run, k, bearingInputs({})), ...I18BC_PAD };
    parts.push({ label: "Bearings", name: `${s.name} bearings`, lines: bearingCalcLines(br, `${s.name} bearings`), checks: [{ checks: designBearing(br).checks }] });
    sPay.push(...pays("elastomeric-bearing", br, { length: b.nGirders * (k === 1 ? 2 : 1) }));
    if (s.type.endsWith("abutment")) {
      const a = { ...abutmentFromBridge(b, run, k, abutmentInputs({})), section: "HP14x89", nPiles: 10, pileLength: pileBelowCap[k === 0 ? 0 : 1], embed: 18, capWidth: 4, capDepth: 3.5, soil: I18BC_ABUT_SOIL, ...I18BC_PILE, prebore: 0 }; // no prebore in the FOR
      const ar = runFoundation("abutment", a);
      parts.push({ label: "Abutment", name: s.name, lines: foundationCalcLines("abutment", a, s.name), checks: ar.groups.map((x) => ({ title: x.title, checks: ar.checks.filter((c) => x.of(c.id)) })) });
      sPay.push(...pays("abutment", a));
      const w = wingwallFromBridge(b, k, a, wingwallInputs({}));
      parts.push({ label: "Wingwalls", name: `${s.name} wingwall`, lines: wingwallCalcLines(w, `${s.name} wingwall`), checks: [{ checks: designWingwall(w).checks }] });
      sPay.push(...scaled(pays("cantilever-wingwall", w), 2));
      const ap: ApproachSlabInputs = { ...approachSlabFromBridge(b, k, approachSlabInputs({})), L: 20, t: 12, mainBars: { bar: 9, spacing: 6 }, distBars: { bar: 5, spacing: 12 }, topLong: { bar: 4, spacing: 18 }, topTrans: { bar: 5, spacing: 12 } };
      parts.push({ label: "Approach slab", name: `${s.name} approach slab`, lines: approachSlabCalcLines(ap, `${s.name} approach slab`), checks: [{ checks: designApproachSlab(ap).checks }] });
      approachPay.push(...pays("approach-slab", ap, { length: 1 }));
    } else {
      // Sheet B17: 18 #11 top and bottom, #6 double stirrups at 5 to 10 in (7 in taken).
      const cap = capFromBridge(b, run, k, stmInputs({ template: { ...MULTICOLUMN_DEFAULTS, topBars: { size: 11, count: 18 }, bottomBars: { size: 11, count: 18 }, stirrups: { size: 6, legs: 4, spacing: 7 } }, stages: { enabled: true, diaphragmHeight: 0, topBars: I18BC_DIAPHRAGM_TOP } }), ["g"], ["Girders"]);
      const r = await designStm(cap, nodeLpSolver);
      parts.push({ label: "Pier cap", name: "Pier 2 cap", lines: stmPackageLines(cap, r, "Pier 2 cap"), checks: [{ checks: r.checks }] });
      const det = capDetailOrNull(cap);
      if (det) sPay.push(...stmPayLines(cap, det).lines);
      const col = { ...columnFromBridge(b, run, k, columnInputs({}), columnLinkFrom("cap", "Pier 2 cap", cap, new Map([["g", g]]))), bar: 11, bars: 22, tieBar: 5, tieSpacing: 6 };
      const cr = designColumn(col);
      parts.push({ label: "Columns", name: "Pier 2 columns", lines: columnCalcLines(col, "Pier 2 columns"), checks: [{ checks: cr.checks }] });
      sPay.push(...pays("pier-column", col, { length: 3 }));
      const sh = { ...shaftFromColumn(cr, shaftInputs({})), D: 60, length: 72, topDepth: 2, layers: I18BC_SHAFT_LAYERS, bar: 11, bars: 22 }; // the shaft's bars as the column's (assumed: the plans' shaft sheet is a template) // the shaft table: 69.3 to 76.6 ft, 2 ft below grade
      const sr = runFoundation("drilled-shaft", sh);
      parts.push({ label: "Drilled shafts, each of 3", name: "Pier 2 shafts", lines: foundationCalcLines("drilled-shaft", sh, "Pier 2 shafts"), checks: sr.groups.map((x) => ({ title: x.title, checks: sr.checks.filter((c) => x.of(c.id)) })) });
      sPay.push(...scaled(pays("drilled-shaft", sh), 3));
    }
    supports.push({ name: s.name, type: s.type, parts });
    pay.push({ label: s.name, lines: sPay });
  }
  pay.push({ label: "Approach slabs", lines: approachPay });
  const m = bridgeIfc(b, run);
  const svg = renderBridgeSvg(m, { width: 720, height: 400 });
  const lines: Line[] = bridgeCalcLines({ title: "I-18-BC Airport Rd over Powers Blvd (WB)", b, run, figures: { render: { kind: "image", width: 720, height: 400, svg } }, superstructure: superParts, supports, pay, tabulations: [], missing: [] });

  for (const p of [...superParts, ...supports.flatMap((s) => s.parts.map((x) => ({ ...x, label: `${s.name}, ${x.label}` })))]) {
    const v = verdict(p.checks);
    report.push(`${p.label.padEnd(36)} ${v.fail.length ? `${v.fail.length} of ${v.n} fail: ${v.fail.slice(0, 4).join("; ")}` : `all ${v.n} pass`}`);
  }
  const verdicts = Object.fromEntries([...superParts, ...supports.flatMap((s) => s.parts.map((x) => ({ ...x, label: `${s.name}, ${x.label}` })))].map((p) => [p.label, verdict(p.checks)]));
  return { run, lines, pay, report, m, verdicts, deckFt };
}

describe("I-18-BC through the Bridge, end to end", async () => {
  const r = await build();

  it("passes the checks the sealed calcs pass: bearing pads, abutments and piles, the two-stage pier cap, columns, shafts, wingwalls", () => {
    for (const k of Object.keys(r.verdicts).filter((x) => /Bearings|Abutment$|Columns|shafts|Wingwalls|Pier cap/.test(x))) expect([k, r.verdicts[k].fail]).toEqual([k, []]);
  });

  it("designs the girders with the girder schedule's 38 strands, all but the bearing's longitudinal reinforcement passing", () => {
    expect(r.verdicts["Girders, spans 1–2"].fail.every((x) => x.startsWith("Longitudinal reinforcement at the bearing"))).toBe(true);
  });

  it("works out the whole calc package as one worksheet with no errors", () => {
    const regions = readingOrder(layout(r.lines, { x: 0, y: 0 }));
    const items = regions.flatMap((x): SheetItem[] => (x.kind === "text" || x.kind === "image" ? [] : [x as SheetItem]));
    const res = evaluateSheet(items, DEFAULT_SETTINGS, new Map());
    const errors = regions.flatMap((x) => (res.get(x.id)?.kind === "error" ? [x.kind === "math" ? x.latex.slice(0, 50) : x.kind] : []));
    expect(errors).toEqual([]);
    expect(regions.length).toBeGreaterThan(1500);
  });

  it("models the deck at the FOR's size: 211 ft by 61.5 ft by 8 in, about 321 CY", () => {
    const vol = r.m.elements.filter((e) => e.name.startsWith("Deck")).reduce((s, e) => (e.profile.kind === "mesh" ? s + meshVolume(e.profile.pts, e.profile.tris) : s), 0);
    // Between the abutments' bearing lines (the FOR's 211 ft runs to the deck's ends past them).
    expect(vol / 27).toBeGreaterThan(300);
    expect(vol / 27).toBeLessThan(330);
  });

  it("matches the FOR quantities the Bridge models the same way: girders, rail, waterproofing, piles, shafts", () => {
    const rows = soqRows(r.pay);
    const total = (code: string) => rows.find((x) => x.code === code)?.total ?? 0;
    const table = Object.entries(I18BC_SOQ).map(([code, want]) => `${code.padEnd(10)} FOR ${String(want.total).padStart(8)}   ours ${String(Math.round(total(code) * 10) / 10).padStart(8)}   ${want.total ? `${(((total(code) - want.total) / want.total) * 100).toFixed(1)}%` : ""}`);
    console.log(["", "I-18-BC component checks:", ...r.report, "", "Summary of quantities, I-18-BC: FOR vs the Bridge", ...table, "", "Our SOQ:", ...rows.map((x) => `${x.code} ${x.description.slice(0, 40).padEnd(40)} ${x.unit} ${x.values.map((v) => String(Math.round(v * 10) / 10)).join(" | ")} = ${Math.round(x.total * 10) / 10}`)].join("\n"));
    // The deck back face to back face (FOR 211.4 ft); the rail on it (FOR 423 LF); the superstructure's bars with the
    // negative moment bars over the pier (FOR 120,000 LB), all bars (FOR 196,600 LB).
    expect(Math.abs(r.deckFt - 211.4)).toBeLessThan(0.1);
    const col = (code: string, k: number) => rows.find((x) => x.code === code)?.values[k] ?? 0;
    expect(Math.abs(col("606-11035", 0) - 423) / 423).toBeLessThan(0.005);
    expect(Math.abs(col("602-00020", 0) - 120000) / 120000).toBeLessThan(0.03);
    expect(Math.abs(total("602-00020") - 196600) / 196600).toBeLessThan(0.05);
    // Girders: six lines of two girders, bearing to bearing plus the end distances (FOR 1239 LF).
    expect(Math.abs(total("618-01154") - 1239) / 1239).toBeLessThan(0.02);
    // Piles: the FOR's lengths (10 a side).
    expect(Math.abs(total("502-11489") - 1479) / 1479).toBeLessThan(0.02);
  });
});
