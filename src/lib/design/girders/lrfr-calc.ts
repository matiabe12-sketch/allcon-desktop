import type { Line } from "@/lib/calcs/library/templates";
import { textTable } from "../svg-table";
import { num } from "../calc-style";
import { rateGirder, type LrfrResult, type RatingAt } from "./lrfr";
import type { GirderInputs, GirderResult } from "./prestressed";

// The girder check's calc package chapter for its Load and Resistance Factor Rating: the factors, the HL-93 ratings
// worked out live at the points that control, each vehicle's rating, the posting and color code, and the values for
// CDOT's LRFR Rating Summary Sheet (Form 1187a).

type Design = { spans: { index: number; L: number; interior: GirderResult; exterior: GirderResult }[]; continuous: boolean };

const trunc = (v: number, d: number) => Math.floor(v * 10 ** d + 1e-9) / 10 ** d;

export function lrfrCalcLines(i: GirderInputs, design: Design, q: LrfrResult = rateGirder(i, design, i.rating)): Line[] {
  const lines: Line[] = [];
  const text = (t: string, style?: "heading" | "subheading" | "note") => lines.push({ text: t, ...(style ? { style } : {}) });
  const m = (math: string, ref?: string, unit?: string) => lines.push({ math, ...(ref ? { ref } : {}), ...(unit ? { unit } : {}) });
  const f = q.factors;
  const s = q.settings;

  text("LOAD RATING (LRFR)", "heading");
  text("Load and Resistance Factor Rating by the AASHTO Manual for Bridge Evaluation, Section 6A, with the CDOT Bridge Rating Manual (BRM): from this check's capacities, dead loads, distribution factors and stresses at every point of interest. Vehicles moved over the spans with full impact, IM 33% (BRM 15-4); multi-lane distribution factors (BRM 1.3 C).");
  text("Factors", "subheading");
  m(`\\varphi_c\\coloneq ${num(f.phiC)}`, `Condition: ${s.condition} (MBE Table 6A.4.2.3-1; new bridges 1.0, BRM 15-6)`);
  m(`\\varphi_s\\coloneq ${num(f.phiS)}`, "System, MBE Table 6A.4.2.4-1");
  m("\\varphi_{cs}\\coloneq\\max\\left(0.85,\\varphi_c\\cdot\\varphi_s\\right)=", "MBE Eq. 6A.4.2.1-3; for shear φs = 1.0 (MBE C6A.4.2.4)");
  m(`\\gamma_{DC}\\coloneq ${num(f.gDC)}`, "MBE Table 6A.4.2.2-1");
  m(`\\gamma_{DW}\\coloneq ${num(f.gDW)}`, s.dwMeasured ? "Wearing surface measured" : "Wearing surface not measured");
  m(`\\gamma_{L}\\coloneq ${num(f.gLegal, 3)}`, `Legal loads, ADTT ${s.adtt ?? "unknown"} (MBE ${s.edition === "3rd" ? "3rd" : "2nd"} ed. Table 6A.4.4.2.3a-1)`);
  m(`\\gamma_{P}\\coloneq ${num(f.gPermit, 3)}`, "Routine permit, unlimited crossings, mixed with traffic, by its weight ratio: the CO Permit's 2.5 kip/ft shown, the Modified Tandem (over 3.0) its own (MBE 3rd ed. Table 6A.4.5.4.2a-1, BRM 1.4 X)");
  text("RF = (C − γDC·DC − γDW·DW ± γP·P) / (γL·(LL + IM)), MBE Eq. 6A.4.2.1-1; strength C = φc·φs·φRn (Eq. 6A.4.2.1-3).", "note");

  // The HL-93 ratings worked out at their controlling points.
  const lineOf = (a: RatingAt) => design.spans[a.span][a.girder];
  const stationOf = (a: RatingAt) => lineOf(a).stations.reduce((b, st) => (Math.abs(st.x - a.x) < Math.abs(b.x - a.x) ? st : b));
  const worked = (label: string, a: RatingAt, gammaL: number, sym: string) => {
    const st = stationOf(a);
    const line = lineOf(a);
    text(`${label}: ${a.girder} girder${design.spans.length > 1 ? `, span ${a.span + 1}` : ""}, ${num(a.x, 2)} ft from the bearing, ${a.limit.toLowerCase()}`, "subheading");
    if (a.limit.startsWith("Service")) {
      m(`f_R\\coloneq ${num(f.tensLimit, 3)}\\mathrm{ksi}`, "The tension limit, AASHTO Table 5.9.2.3.2b-1");
      m(`f_D\\coloneq ${num(st.service.botIII + (line.gammaLL3 * st.Mll * 12) / line.comp.Sbc, 3)}\\mathrm{ksi}`, "Prestress and dead loads at the bottom (compression +)");
      m(`f_L\\coloneq ${num((st.Mll * 12) / line.comp.Sbc, 3)}\\mathrm{ksi}`, "HL-93 with IM, on the composite section");
      m(`${sym}\\coloneq\\frac{f_R+f_D}{0.80\\cdot f_L}=`, "Service III, γL 0.80 (MBE Table 6A.4.2.2-1)");
      return;
    }
    if (a.limit.includes("negative")) {
      const n = st.negative!;
      m(`C\\coloneq\\varphi_{cs}\\cdot ${num(line.negativeSection!.phiMn, 1)}\\mathrm{kip}\\cdot\\mathrm{ft}=`, "φMn over the pier (the deck's bars)", "kip·ft");
      m(`DC\\coloneq ${num(-(st.Mg + st.Mdeck + n.Mdc2), 1)}\\mathrm{kip}\\cdot\\mathrm{ft}`, "Hogging +");
      m(`DW\\coloneq ${num(-n.Mdw, 1)}\\mathrm{kip}\\cdot\\mathrm{ft}`);
      m(`P\\coloneq ${num(-n.Mr, 1)}\\mathrm{kip}\\cdot\\mathrm{ft}`, "Restraint moments, γP 1.0");
      m(`LL\\coloneq ${num(-n.Mll, 1)}\\mathrm{kip}\\cdot\\mathrm{ft}`, "HL-93 with IM and the distribution factor");
      m(`${sym}\\coloneq\\frac{C-\\gamma_{DC}\\cdot DC-\\gamma_{DW}\\cdot DW-P}{${num(gammaL)}\\cdot LL}=`);
      return;
    }
    if (a.limit.includes("shear")) {
      m(`C\\coloneq\\varphi_{cs}\\cdot ${num(st.phiVn!, 1)}\\mathrm{kip}=`, "φVn, AASHTO 5.7.3", "kip");
      m(`DC\\coloneq ${num(Math.abs(st.Vdc), 1)}\\mathrm{kip}`);
      m(`DW\\coloneq ${num(Math.abs(st.Vdw), 1)}\\mathrm{kip}`);
      m(`LL\\coloneq ${num(st.Vll, 1)}\\mathrm{kip}`, "HL-93 with IM and the distribution factor");
      m(`${sym}\\coloneq\\frac{C-\\gamma_{DC}\\cdot DC-\\gamma_{DW}\\cdot DW}{${num(gammaL)}\\cdot LL}=`);
      return;
    }
    m(`C\\coloneq\\varphi_{cs}\\cdot ${num(st.phiMn, 1)}\\mathrm{kip}\\cdot\\mathrm{ft}=`, "φMn, AASHTO 5.6.3.2", "kip·ft");
    m(`DC\\coloneq ${num(st.Mg + st.Mdeck + st.Mdc2, 1)}\\mathrm{kip}\\cdot\\mathrm{ft}`, "Girder, deck and haunch, barriers");
    m(`DW\\coloneq ${num(st.Mdw, 1)}\\mathrm{kip}\\cdot\\mathrm{ft}`, "Wearing surface");
    m(`LL\\coloneq ${num(st.Mll, 1)}\\mathrm{kip}\\cdot\\mathrm{ft}`, "HL-93 with IM and the distribution factor");
    m(`${sym}\\coloneq\\frac{C-\\gamma_{DC}\\cdot DC-\\gamma_{DW}\\cdot DW}{${num(gammaL)}\\cdot LL}=`);
  };
  text("Design load: HL-93 (MBE 6A.4.3)", "subheading");
  worked("Inventory, Strength I (γL 1.75)", q.hl93.inventoryStrength, 1.75, "RF_{inv}");
  worked("Inventory, Service III", q.hl93.inventoryService, 0.8, "RF_{svc}");
  worked("Operating, Strength I (γL 1.35)", q.hl93.operating, 1.35, "RF_{op}");
  text(`HL-93: inventory RF ${num(q.hl93.inventory.rf, 2)}, operating RF ${num(q.hl93.operating.rf, 2)} (truncated, BRM 1.14).`, "note");

  lines.push(...ratingTableLines(q, `${num(i.fws, 2)} psf`));
  return lines;
}

type Summary = Pick<LrfrResult, "settings" | "hl93" | "ratings" | "posting" | "color">;

/** The rating's chapter end, shared by every rated design: each vehicle's rating, the posting and color code, and the values for CDOT's LRFR Rating Summary Sheet. */
export function ratingTableLines(q: Summary, wearing: string): Line[] {
  const lines: Line[] = [];
  const text = (t: string, style?: "heading" | "subheading" | "note") => lines.push({ text: t, ...(style ? { style } : {}) });
  const s = q.settings;
  text("Legal, specialized hauling, emergency and permit vehicles (MBE 6A.4.4, 6A.4.5; BRM 1.2)", "subheading");
  lines.push({
    region: textTable(
      [{ title: "Vehicle", x: 4 }, { title: ["Weight", "(tons)"], x: 170, anchor: "end" }, { title: "γL", x: 215, anchor: "end" }, { title: "RF", x: 260, anchor: "end" }, { title: ["Rating", "(tons)"], x: 320, anchor: "end" }, { title: "Controls", x: 335 }],
      q.ratings.map((v) => [v.name, v.tons === null ? "—" : num(v.tons, 2), num(v.gammaL, 2), num(trunc(v.rf.rf, 2), 2), v.ratingTons === null ? "—" : num(v.ratingTons, 1), v.rf.at ? `${v.rf.at}, ${v.rf.limit.replace("Strength, ", "")}` : `${v.rf.girder}, span ${v.rf.span + 1}, ${num(v.rf.x, 1)} ft, ${v.rf.limit.replace("Strength, ", "")}`]),
      680,
    ),
  });

  text("Posting (BRM 1.15) and color code (BRM 1.16)", "subheading");
  for (const p of q.posting) text(`${p.name}: ${num(p.tons, 1)} tons${p.limit !== null ? ` against ${p.limit} tons` : ""}: ${p.action}.`);
  text(`Overload color code: ${q.color.code} (interior girders: CO Permit ${num(q.color.permitTons, 1)} tons, CO Modified Tandem ${num(q.color.tandemTons, 1)} tons; Table 1-7).`);

  text("For the LRFR Rating Summary Sheet (CDOT Form 1187a)", "subheading");
  const by = (name: string) => q.ratings.find((v) => v.name === name);
  const tons = (name: string) => {
    const v = by(name);
    return v?.ratingTons === null || v === undefined ? "—" : num(v.ratingTons, 1);
  };
  const legal = s.route === "interstate" ? ["Interstate Type 3", "Interstate Type 3S2", "Interstate Type 3-2"] : ["CO Type 3", "CO Type 3S2", "CO Type 3-2"];
  lines.push({
    region: textTable(
      [{ title: "Item", x: 4 }, { title: "Rating", x: 300, anchor: "end" }],
      [
        ["HL-93 inventory (RF)", num(q.hl93.inventory.rf, 2)],
        ["HL-93 operating (RF)", num(q.hl93.operating.rf, 2)],
        [`Legal loads (${s.route === "interstate" ? "Interstate" : "Colorado"}): Type 3, 3S2, 3-2 (tons)`, legal.map(tons).join(", ")],
        ["NRL, SU4, SU5, SU6, SU7 (tons)", ["NRL", "SU4", "SU5", "CO SU6", "CO SU7"].map(tons).join(", ")],
        ["EV2, EV3 (tons)", ["EV2", "EV3"].map(tons).join(", ")],
        ["Permit truck, Modified Tandem (tons)", ["CO Permit", "CO Mod Tandem"].map(tons).join(", ")],
        ["Distribution for legal and permit vehicles", s.lanes === "multi" ? "Multi-lane" : "Single lane"],
        ["Wearing surface (DW)", wearing],
      ],
      420,
    ),
  });
  return lines;
}

/** The factors' part of a rating chapter, shared by every rated design. */
export function ratingFactorLines(q: Pick<LrfrResult, "settings" | "factors">, intro: string): Line[] {
  const lines: Line[] = [];
  const text = (t: string, style?: "heading" | "subheading" | "note") => lines.push({ text: t, ...(style ? { style } : {}) });
  const m = (math: string, ref?: string) => lines.push({ math, ...(ref ? { ref } : {}) });
  const f = q.factors;
  const s = q.settings;
  text("LOAD RATING (LRFR)", "heading");
  text(intro);
  text("Factors", "subheading");
  m(`\\varphi_c\\coloneq ${num(f.phiC)}`, `Condition: ${s.condition} (MBE Table 6A.4.2.3-1; new bridges 1.0, BRM 15-6)`);
  m(`\\varphi_s\\coloneq ${num(f.phiS)}`, "System, MBE Table 6A.4.2.4-1");
  m("\\varphi_{cs}\\coloneq\\max\\left(0.85,\\varphi_c\\cdot\\varphi_s\\right)=", "MBE Eq. 6A.4.2.1-3; for shear φs = 1.0 (MBE C6A.4.2.4)");
  m(`\\gamma_{L}\\coloneq ${num(f.gLegal, 3)}`, `Legal loads, ADTT ${s.adtt ?? "unknown"} (MBE ${s.edition} ed. Table 6A.4.4.2.3a-1)`);
  m(`\\gamma_{P}\\coloneq ${num(f.gPermit, 3)}`, "Routine permit, unlimited crossings, mixed with traffic, by its weight ratio: the CO Permit's 2.5 kip/ft shown, the Modified Tandem (over 3.0) its own (MBE 3rd ed. Table 6A.4.5.4.2a-1, BRM 1.4 X)");
  text("RF = (C − γDC·DC − γDW·DW ± γP·P) / (γL·(LL + IM)), MBE Eq. 6A.4.2.1-1; strength C = φc·φs·φRn (Eq. 6A.4.2.1-3).", "note");
  return lines;
}
