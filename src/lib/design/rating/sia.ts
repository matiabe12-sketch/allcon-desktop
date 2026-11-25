import type { DtInputs } from "./double-tee";
import { applyBrm } from "./sources";

// Reading a CDOT Structure Inventory and Appraisal (SIA) report's text for a double-tee rating:
// the 2025-on reports with SNBI item codes ("G03 - Maximum Span: | 66"), and the older full reports
// with NBI item numbers ("Max Span 48: | 64.0 ft"). Only what the SIA states is read; each value
// carries its item, and what the SIA can't say exactly (the girder length of a multi-span bridge,
// a sidewalk's rail edge) is flagged. Nothing is applied until the engineer picks it.

/** A PDF page's text as lines: pieces on the same baseline joined left to right with " | ". */
export function textLines(items: { str: string; x: number; y: number }[]): string[] {
  const rows: { y: number; items: { x: number; s: string }[] }[] = [];
  for (const it of items) {
    if (!it.str?.trim()) continue;
    let row = rows.find((r) => Math.abs(r.y - it.y) <= 2);
    if (!row) rows.push((row = { y: it.y, items: [] }));
    row.items.push({ x: it.x, s: it.str.trim() });
  }
  return rows.sort((a, b) => b.y - a.y).map((r) => r.items.sort((a, b) => a.x - b.x).map((p) => p.s).join(" | "));
}

/** Where the values were read: an SIA (SNBI or NBI items), or an inspection sketch's callouts. */
export type SiaFormat = "snbi" | "nbi" | "sketch";
/** An input the SIA (or a sketch) gives a value for. */
export type SiaInput =
  | "units.spacing"
  | "units.flangeWidth"
  | "units.layout"
  | "units.flangeThk"
  | "deck.thk"
  | "loads.diaphragmKip"
  | "bridge.id"
  | "bridge.facility"
  | "bridge.feature"
  | "bridge.owner"
  | "bridge.yearBuilt"
  | "bridge.nbiSuper"
  | "bridge.nearInterstate"
  | "bridge.inspection"
  | "numSpans"
  | "span"
  | "structureLength"
  | "skew"
  | "units.count"
  | "deck.present"
  | "roadway.railToRail"
  | "roadway.curbToCurb"
  | "roadway.curbFaceOffset"
  | "roadway.railFaceOffset"
  | "loads.sidewalks"
  | "loads.asphalt";

export type SiaValue = {
  input: SiaInput;
  label: string;
  value: string | number | boolean | { width: number; thk: number }[] | { flangeWidth: number; stemSpacing: number }[];
  /** The SIA item and its text, e.g. "G03 Maximum Span: 66". */
  source: string;
  /** Why it needs a look. */
  note?: string;
};

export type SiaReading = { format: SiaFormat; structure: string; date: string; values: SiaValue[]; findings: string[]; condition?: SiaConditionData };

const NUM = /-?\d[\d,]*(?:\.\d+)?/;
const num = (s: string | null | undefined) => {
  const m = s?.match(NUM);
  return m ? Number(m[0].replace(/,/g, "")) : null;
};
const clean = (s: string) => s.replace(/\s+/g, " ").trim();

/** The cells of every line. */
const cellsOf = (lines: string[]) => lines.map((l) => l.split(" | ").map((c) => c.trim()));

/**
 * The value after a label: the next cell on its line, or (when the label ends its line, or the next
 * cell is another label) the first cell of the next line.
 */
function after(rows: string[][], label: RegExp): { value: string; text: string } | null {
  for (let r = 0; r < rows.length; r++) {
    const row = rows[r];
    const c = row.findIndex((cell) => label.test(cell));
    if (c < 0) continue;
    const next = row[c + 1];
    const isLabel = (s: string | undefined) => !s || /:\s*$/.test(s) || s === "n";
    if (!isLabel(next)) return { value: next!, text: `${row[c].replace(/:\s*$/, "")}: ${next}` };
    const below = rows[r + 1]?.[0];
    if (below && !isLabel(below)) return { value: below, text: `${row[c].replace(/:\s*$/, "")}: ${below}` };
    return null;
  }
  return null;
}

/** Two values after one label ("Curb Wdth L/R 50A/B: | 5.0 ft | 5.0 ft"). */
function afterTwo(rows: string[][], label: RegExp): [string, string] | null {
  for (const row of rows) {
    const c = row.findIndex((cell) => label.test(cell));
    if (c >= 0 && row[c + 2] !== undefined) return [row[c + 1], row[c + 2]];
  }
  return null;
}

const NBI_OWNER: Record<string, string> = {
  "01": "State highway agency",
  "02": "County highway agency",
  "03": "Town or township highway agency",
  "04": "City or municipal highway agency",
  "11": "State park, forest, or reservation agency",
  "21": "Other state agencies",
  "25": "Other local agencies",
  "26": "Private (other than railroad)",
  "27": "Railroad",
};

const isoDate = (s: string) => {
  const m = s.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (m) return `${m[3]}-${m[1].padStart(2, "0")}-${m[2].padStart(2, "0")}`;
  return s.match(/\d{4}-\d{2}-\d{2}/)?.[0] ?? s;
};

/** Reads an SIA's text (its pages' lines, in order). Throws if it isn't an SIA. */
export function readSia(lines: string[]): SiaReading {
  const rows = cellsOf(lines);
  const all = lines.join("\n");
  const snbi = /\bG03 - Maximum Span:/.test(all);
  const nbi = /Max Span 48:/.test(all);
  if (!snbi && !nbi) throw new Error("This doesn't look like an SIA report: no maximum span (SNBI G03 or NBI item 48) found.");
  const format: SiaFormat = snbi ? "snbi" : "nbi";
  const values: SiaValue[] = [];
  const findings: string[] = [];
  const add = (input: SiaInput, label: string, value: SiaValue["value"] | null, source: string, note?: string) => {
    if (value === null || value === "" || (typeof value === "number" && !Number.isFinite(value))) return;
    values.push({ input, label, value, source, ...(note ? { note } : {}) });
  };
  const get = (label: RegExp) => after(rows, label);

  let structure = "";
  let date = "";
  let total: number | null = null;
  let spans: number | null = null;
  let o2o: number | null = null;
  let c2c: number | null = null;
  let walks: [number, number] | null = null;

  if (snbi) {
    const id = get(/^ID01A - Structure Key:$/) ?? get(/^Structure Key:$/);
    structure = id?.value ?? "";
    add("bridge.id", "Structure number", structure, id ? `ID01A ${id.text.replace(/^ID01A - /, "")}` : "");
    const fac = get(/^CL11B - Feature Carried:$/);
    if (fac) add("bridge.facility", "Facility carried", clean(fac.value), `CL11B ${fac.text.replace(/^CL11B - /, "")}`);
    const fea = get(/^CL11A - Features Intersected:$/);
    if (fea) add("bridge.feature", "Feature intersected", clean(fea.value), `CL11A ${fea.text.replace(/^CL11A - /, "")}`);
    const own = get(/^CL01A - Responsible Party:$/) ?? get(/^CL01 - Owner:$/);
    if (own) add("bridge.owner", "Owner", clean(own.value.replace(/^[A-Z]\d\d - /, "")), own.text.replace(/^(CL01A?) - /, "$1 "));
    const yr = get(/^W01 - Year Built:$/);
    const yrSummary = lines.map((l) => l.match(/^Year Built (\d{4})$/)?.[1]).find(Boolean);
    add("bridge.yearBuilt", "Year built", num(yr?.value ?? yrSummary), yr ? `W01 ${yr.text.replace(/^W01 - /, "")}` : `Year Built ${yrSummary}`);
    const sup = get(/^C02 - Superstructure Rating:$/);
    if (sup) add("bridge.nbiSuper", "Superstructure condition", num(sup.value), `C02 ${sup.text.replace(/^C02 - /, "")}`);
    // Within 1 mile of an Interstate (BRM 1.15.1: emergency vehicles are posted only there).
    const near = get(/^LR09A - Within 1 Mile 64LT10:$/);
    if (near && /^(yes|no|y|n)$/i.test(near.value.trim())) add("bridge.nearInterstate", "Within 1 mile of an Interstate", /^y/i.test(near.value.trim()), `LR09A ${near.text.replace(/^LR09A - /, "")}`, "Sets whether emergency vehicles (EV2, EV3) are posted (BRM 1.15.1).");
    const d = get(/^IE03A? - Inspection Date:$/) ?? get(/^Inspection Date:$/);
    date = d ? isoDate(d.value) : "";
    const sp = get(/^SP02 - Number of Spans:$/);
    spans = num(sp?.value);
    if (sp) add("numSpans", "Spans", spans, `SP02 ${sp.text.replace(/^SP02 - /, "")}`);
    const mx = get(/^G03 - Maximum Span:$/);
    const mn = get(/^G04 - Minimum Span:$/);
    const L = num(mx?.value);
    if (L !== null) add("span", "Span", L, `G03 ${mx!.text.replace(/^G03 - /, "")}`, "Sometimes the clear span rather than bearing to bearing, and given to 0.1 ft: check the span between bearings on the sketch.");
    if (L !== null && num(mn?.value) !== null && num(mn?.value) !== L) findings.push(`The spans differ: maximum ${L} ft, minimum ${num(mn?.value)} ft (G03, G04). The tool rates identical simple spans: rate the longest, or each span as its own design.`);
    const tl = get(/^G02 - Total Length:$/);
    total = num(tl?.value);
    const sk = get(/^G11 - Skew:$/);
    if (sk) add("skew", "Skew", num(sk.value), `G11 ${sk.text.replace(/^G11 - /, "")}`);
    const g05 = get(/^G05 - Out To Out:$/);
    const g06 = get(/^G06 - Width Curb to Curb:$/);
    o2o = num(g05?.value);
    c2c = num(g06?.value);
    if (g05) add("roadway.railToRail", "Width, out to out", o2o, `G05 ${g05.text.replace(/^G05 - /, "")}`);
    const g07 = get(/^G07 - Left Curb Or Sidewalk:$/);
    const g08 = get(/^G08 - Right Curb Or Sidewalk:$/);
    if (g07 || g08) walks = [num(g07?.value) ?? 0, num(g08?.value) ?? 0];
    const as = get(/^G17A - Asphalt \/ Fill Thickness:$/);
    if (as) add("loads.asphalt", "Asphalt", num(as.value), `G17A ${as.text.replace(/^G17A - /, "")}`, "Inches.");
    const bl = get(/^SP03 - Number of Beam Lines:$/);
    if (bl) add("units.count", "Number of units", num(bl.value), `SP03 ${bl.text.replace(/^SP03 - /, "")}`);
    const dk = get(/^SP09 - Deck Material and Type:$/);
    if (dk) {
      const cip = /cast-in-place/i.test(dk.value) || /^C01\b/.test(dk.value);
      add("deck.present", "Composite CIP deck", cip, `SP09 ${dk.text.replace(/^SP09 - /, "")}`, cip ? "The SIA doesn't give its thickness: take it from the sketch." : undefined);
    }
  } else {
    const id = get(/^Bridge Key:$/);
    structure = id?.value ?? "";
    add("bridge.id", "Structure number", structure, id?.text ?? "");
    const fac = get(/^Facility Carried 7:$/);
    if (fac) add("bridge.facility", "Facility carried", clean(fac.value), `Item 7, ${fac.text}`);
    const fea = get(/^Feature Intersected 6:$/);
    if (fea) add("bridge.feature", "Feature intersected", clean(fea.value), `Item 6, ${fea.text}`);
    const own = get(/^Owner 22:$/);
    if (own) add("bridge.owner", "Owner", NBI_OWNER[own.value] ?? `Owner code ${own.value}`, `Item 22, ${own.text}`);
    const yr = get(/^Year Built 27:$/);
    if (yr) add("bridge.yearBuilt", "Year built", num(yr.value), `Item 27, ${yr.text}`);
    const sup = get(/^Super 59:$/);
    if (sup) add("bridge.nbiSuper", "Superstructure condition", num(sup.value), `Item 59, ${sup.text}`);
    const d = get(/^Inspection Date:$/);
    date = d ? isoDate(d.value) : "";
    const main = num(get(/^Main Spans Unit 45:$/)?.value);
    const appr = num(get(/^Approach Spans 46:$/)?.value) ?? 0;
    if (main !== null) {
      spans = main + appr;
      add("numSpans", "Spans", spans, `Items 45, 46: ${main} main, ${appr} approach`);
    }
    const mx = get(/^Max Span 48:$/);
    if (mx) add("span", "Span", num(mx.value), `Item 48, ${mx.text}`, "Item 48 isn't always bearing to bearing (it's often less): take the span from the sketch.");
    const tl = get(/^Str Length 49:$/);
    total = num(tl?.value);
    const sk = get(/^Skew 34:$/);
    if (sk) add("skew", "Skew", num(sk.value), `Item 34, ${sk.text}`);
    const w52 = get(/^Width Out to Out 52:$/);
    const w51 = get(/^Width Curb to Curb 51:$/);
    o2o = num(w52?.value);
    c2c = num(w51?.value);
    if (w52) add("roadway.railToRail", "Width, out to out", o2o, `Item 52, ${w52.text}`);
    const cw = afterTwo(rows, /^Curb Wdth L\/R 50A\/B:$/);
    if (cw) walks = [num(cw[0]) ?? 0, num(cw[1]) ?? 0];
    const as = get(/^Asphalt Thickness \(066T\):$/);
    if (as) add("loads.asphalt", "Asphalt", num(as.value), `066T ${as.text.replace(/\s*\(066T\)/, "")}`, "Inches.");
    const dt = get(/^Deck Type 107:$/);
    if (dt) {
      const cip = dt.value.trim() === "1";
      add("deck.present", "Composite CIP deck", cip, `Item 107, ${dt.text}`, cip ? "The SIA doesn't give its thickness: take it from the sketch." : undefined);
    }
    // The girder element's length over the structure's: the stems, two per double tee.
    const el = lines.find((l) => /^109\/\d+ \| Pre(stressed)? ?Opn Conc Girder\/Beam \| ft \|/.test(l));
    const qty = el ? num(el.split(" | ")[3]) : null;
    if (qty && total) {
      const stems = qty / total;
      const units = Math.round(stems / 2);
      if (units >= 2 && Math.abs(stems - 2 * units) < 0.25) add("units.count", "Number of units", units, `Element 109: ${qty} ft of girder ÷ ${total} ft = ${+stems.toFixed(2)} stems`, "Counted from the element quantity, two stems a unit.");
    }
  }

  // Derived from what the SIA states.
  if (total !== null) {
    const n = spans && spans > 0 ? spans : 1;
    add("structureLength", "Structure (girder) length", +(total / n).toFixed(3), n > 1 ? `Total length ${total} ft ÷ ${n} spans` : `Total length ${total} ft`, n > 1 ? "Includes the gap at the piers: take the girder length from the sketch." : undefined);
  }
  if (walks) {
    const sw = walks.filter((w) => w > 0);
    if (sw.length) {
      add("loads.sidewalks", "Sidewalks", sw.map((w) => ({ width: w, thk: 6 })), format === "snbi" ? `G07, G08: ${walks[0]} ft, ${walks[1]} ft` : `Item 50A/B: ${walks[0]} ft, ${walks[1]} ft`, "The walkway only: add any rail edge from the sketch. Thickness 6 in assumed.");
      if (c2c !== null) add("roadway.curbToCurb", "Curb to curb", c2c, format === "snbi" ? `G06 Width Curb to Curb: ${c2c}` : `Item 51, Width Curb to Curb: ${c2c}`);
      if (c2c !== null && o2o !== null) {
        if (Math.abs(walks[0] - walks[1]) < 0.05) add("roadway.curbFaceOffset", "Curb face in from the edge", +(((o2o - c2c) / 2) * 12).toFixed(2), `(out to out ${o2o} − curb to curb ${c2c}) ÷ 2`, "Inches, assuming the roadway is centered.");
        else {
          // A sidewalk on one side (or unequal ones): the edge beyond each sidewalk is shared equally,
          // and the rating, which treats both exterior girders alike, takes the narrower side.
          const edge = (o2o - c2c - walks[0] - walks[1]) / 2;
          const sides = walks.map((w) => (w + edge) * 12);
          const narrow = Math.max(0, Math.min(...sides));
          add("roadway.curbFaceOffset", "Curb face in from the edge", +narrow.toFixed(2), `Sidewalks ${walks[0]} ft and ${walks[1]} ft: curb faces about ${+(sides[0] / 12).toFixed(2)} ft and ${+(sides[1] / 12).toFixed(2)} ft in`, "Inches. The sides differ; the rating treats both exterior girders alike, so it takes the narrower side (conservative for the other). Check it on the sketch.");
          findings.push(`The sidewalks differ (${walks[0]} ft and ${walks[1]} ft): the rating treats both exterior girders alike, with the narrower side's curb offset. For the girder under the wider sidewalk that's conservative.`);
        }
      }
    } else {
      add("loads.sidewalks", "Sidewalks", [], format === "snbi" ? "G07, G08: none" : "Item 50A/B: none");
      if (c2c !== null && o2o !== null) {
        if (o2o > c2c) add("roadway.railFaceOffset", "Rail face in from the edge", +(((o2o - c2c) / 2) * 12).toFixed(2), `(out to out ${o2o} − curb to curb ${c2c}) ÷ 2`, "Inches, assuming the roadway is centered.");
        else findings.push("The SIA's curb-to-curb width equals the out-to-out width, so it doesn't locate the rail face: take it from the sketch.");
      }
    }
  }
  if (date) add("bridge.inspection", "Inspection", `SIA ${date}`, format === "snbi" ? `IE03 Inspection Date: ${date}` : `Inspection Date: ${date}`);
  return { format, structure, date, values, findings, condition: readSiaCondition(lines, format, date, format === "snbi" ? "SIA (SNBI)" : "SIA (NBI)") };
}

/** The current value of an input, for the comparison. */
export function currentSiaValue(i: DtInputs, input: SiaInput): SiaValue["value"] {
  switch (input) {
    case "bridge.id":
      return i.bridge.id;
    case "bridge.facility":
      return i.bridge.facility;
    case "bridge.feature":
      return i.bridge.feature;
    case "bridge.owner":
      return i.bridge.owner;
    case "bridge.yearBuilt":
      return i.bridge.yearBuilt;
    case "bridge.nbiSuper":
      return i.bridge.nbiSuper;
    case "bridge.nearInterstate":
      return i.bridge.nearInterstate;
    case "bridge.inspection":
      return i.bridge.inspection;
    case "numSpans":
      return i.numSpans;
    case "span":
      return i.span;
    case "structureLength":
      return i.structureLength;
    case "skew":
      return i.skew;
    case "units.count":
      return i.units.count;
    case "deck.present":
      return i.deck.present;
    case "roadway.railToRail":
      return i.roadway.railToRail;
    case "roadway.curbToCurb":
      return i.roadway.curbToCurb;
    case "roadway.curbFaceOffset":
      return i.roadway.curbFaceOffset;
    case "roadway.railFaceOffset":
      return i.roadway.railFaceOffset;
    case "loads.sidewalks":
      return i.loads.sidewalks;
    case "loads.asphalt":
      return i.loads.asphalt;
    case "units.spacing":
      return i.units.spacing;
    case "units.flangeWidth":
      return i.units.flangeWidth;
    case "units.flangeThk":
      return i.units.flangeThk;
    case "units.layout":
      return i.units.layout ?? [];
    case "deck.thk":
      return i.deck.thk;
    case "loads.diaphragmKip":
      return i.loads.diaphragmKip;
  }
}

/** The inputs with the chosen SIA values applied, each one's source noted. */
export function applySia(i: DtInputs, reading: SiaReading, chosen: SiaValue[]): DtInputs {
  const o: DtInputs = { ...i, bridge: { ...i.bridge }, units: { ...i.units }, deck: { ...i.deck }, roadway: { ...i.roadway }, loads: { ...i.loads }, notes: { ...i.notes } };
  // The unit layout after the count (a new count clears a layout of another length).
  const ordered = [...chosen].sort((a, b) => Number(a.input === "units.layout") - Number(b.input === "units.layout"));
  for (const v of ordered) {
    const x = v.value;
    switch (v.input) {
      case "bridge.id":
      case "bridge.facility":
      case "bridge.feature":
      case "bridge.owner":
      case "bridge.inspection":
        o.bridge[v.input.slice(7) as "id" | "facility" | "feature" | "owner" | "inspection"] = String(x);
        break;
      case "bridge.yearBuilt":
        o.bridge.yearBuilt = Number(x);
        break;
      case "bridge.nbiSuper":
        o.bridge.nbiSuper = Number(x);
        break;
      case "bridge.nearInterstate":
        o.bridge.nearInterstate = x === true;
        break;
      case "numSpans":
        o.numSpans = Math.max(1, Math.round(Number(x)));
        break;
      case "span":
        o.span = Number(x);
        break;
      case "structureLength":
        o.structureLength = Number(x);
        break;
      case "skew":
        o.skew = Number(x);
        break;
      case "units.count":
        o.units.count = Math.max(2, Math.round(Number(x)));
        if (o.units.layout && o.units.layout.length !== o.units.count) o.units.layout = null;
        break;
      case "deck.present":
        o.deck.present = Boolean(x);
        break;
      case "roadway.railToRail":
      case "roadway.curbToCurb":
      case "roadway.curbFaceOffset":
      case "roadway.railFaceOffset":
        o.roadway[v.input.slice(8) as "railToRail" | "curbToCurb" | "curbFaceOffset" | "railFaceOffset"] = Number(x);
        break;
      case "loads.sidewalks": {
        // Keep a thickness already entered.
        const sw = x as { width: number; thk: number }[];
        o.loads.sidewalks = sw.map((s, k) => ({ width: s.width, thk: i.loads.sidewalks[k]?.thk ?? s.thk, ...(i.loads.sidewalks[k]?.curb ? { curb: true } : {}) }));
        break;
      }
      case "loads.asphalt":
        o.loads.asphalt = Number(x);
        break;
      case "units.spacing":
      case "units.flangeWidth":
      case "units.flangeThk":
        o.units[v.input.slice(6) as "spacing" | "flangeWidth" | "flangeThk"] = Number(x);
        break;
      case "units.layout": {
        const lay = x as { flangeWidth: number; stemSpacing: number }[];
        o.units.layout = lay.length ? lay.map((u) => ({ ...u })) : null;
        if (lay.length) o.units.count = lay.length;
        break;
      }
      case "deck.thk":
        o.deck.thk = Number(x);
        break;
      case "loads.diaphragmKip":
        o.loads.diaphragmKip = Number(x);
        break;
    }
    o.notes[v.input] = `${reading.format === "sketch" ? "Sketch" : "SIA"} ${reading.date}, ${v.source}${v.note ? ` (${v.note})` : ""}`;
  }
  // The inspection's findings, as prompts for the condition (an SIA's, not a sketch's).
  if (reading.condition) o.siaCondition = reading.condition;
  o.sources = { ...i.sources };
  for (const v of chosen) o.sources[v.input] = { kind: reading.format === "sketch" ? "sketch" : "sia", note: `${reading.date}: ${v.source}${v.note ? ` (${v.note})` : ""}` };
  // A new year built: the BRM's materials for it, where nothing else has given them.
  return chosen.some((v) => v.input === "bridge.yearBuilt") ? applyBrm(o) : o;
}

// --- the condition the inspection found, as prompts (never applied) ---------------------------------

/** An element (or one of its defects) with its quantities in condition states 1 to 4. */
export type SiaElementRow = { code: number; name: string; unit: string; total: number; cs: [number, number, number, number] };
export type SiaElement = SiaElementRow & { defects: SiaElementRow[]; notes: string[] };
/**
 * What the inspection says of the girders, deck and wearing surface, in the inspector's words: the
 * element table, the structure and inspection notes, and the maintenance items. Shown beside the
 * condition inputs for the rater to enter what the inspection states; nothing here sets an input.
 */
export type SiaConditionData = { source: string; date: string; elements: SiaElement[]; notes: { label: string; text: string }[]; work: string[] };
export type ConditionTag = "strands" | "joints" | "impact" | "concrete" | "cracks";

/** The elements the rating's condition draws on: decks and top flanges, prestressed girders, the wearing surface, general notes. */
const CONDITION_ELEMENTS = new Set([12, 13, 15, 16, 38, 104, 109, 115, 510, 600]);

/** The girder elements; the rest (decks, top flanges, wearing surface) span the joints between units. */
const GIRDER_ELEMENTS = new Set([104, 109, 115]);

/**
 * What a note bears on, by its words: a pointer for the rater, not a finding. Defect 1100 is exposed
 * prestressing. A longitudinal crack over the deck may follow a joint; in a girder with rust it may
 * follow a strand.
 */
export function conditionTags(text: string, element?: number): ConditionTag[] {
  const t: ConditionTag[] = [];
  const girder = element !== undefined && GIRDER_ELEMENTS.has(element);
  const longitudinal = /longitudinal (crack|seam)|\bseams?\b/i.test(text);
  if (/\bstrands?\b|\btendons?\b|prestressing steel|exposed prestress|\b1100\)/i.test(text) || (girder && longitudinal && /rust/i.test(text))) t.push("strands");
  // The joints between units, not an expansion joint (compression, strip seal) or a diaphragm between girders.
  const between = /between (the )?(double tees?|units|tees)\b/i.test(text) || (/between (the )?(girders|beams)\b/i.test(text) && /flange/i.test(text) && !/diaphragm/i.test(text));
  const unitJoint = /\bjoints?\b/i.test(text) && !/(compression|expansion|strip seal|seal|armou?red|finger|modular|deck|bridge) joints?\b/i.test(text);
  if ((!girder && longitudinal) || between || unitJoint || /shear keys?|keyways?|differential (movement|deflection)|weld(ed)? (plates?|clips?|connect\w*|ties?)|\bclips?\b/i.test(text)) t.push("joints");
  if (/impact|struck|hit by/i.test(text)) t.push("impact");
  if (/spall|delaminat|section loss|exposed (re)?bar|honeycomb|scal(e|ing)\b/i.test(text)) t.push("concrete");
  if (/\bcrack/i.test(text) && !t.includes("joints")) t.push("cracks");
  return t;
}

const nums = (s: string) => Number(s.replace(/,/g, ""));
/** The pieces of a line joined as prose ("Girders | A, B" → "Girders A, B"). */
const prose = (s: string) => s.replace(/\s*\|\s*/g, " ").replace(/ ,/g, ",").replace(/\s+/g, " ").trim();
/** Note lines as sentences: a line that doesn't end one continues on the next. */
function sentences(lines: string[]) {
  const out: string[] = [];
  for (const l of lines.map(prose).filter(Boolean)) {
    const prev = out[out.length - 1];
    // A quantity tag on its own line ("(1 CS3 1080)") belongs to the sentence before it.
    if (prev !== undefined && (!/[.)]$/.test(prev) || /^\(\d/.test(l))) out[out.length - 1] = `${prev} ${l}`;
    else out.push(l);
  }
  return out.filter((s) => !/^See Element \d+ comments\.?$/i.test(s));
}

const SNBI_HEADER = /^(Structure Inspection and Inventory Report|Structure Key:|Structure: .* Page \d+ of \d+$|Element\/Defect \||Elements$|\d+%( \| \d+%)*$)/;
const NBI_HEADER = /^(\w+( \w+)? Inspection \| Highway Number|Colorado Department of Transportation \||Linear Ref\. Sys\. MP:|Structure Inspection and Inventory Report|Element Inspection Report$|Elm\/Env \||(Mon|Tue|Wed|Thu|Fri|Sat|Sun) \d+\/\d+\/\d{4}|CDOT_SIA v|Page \d+ of \d+$)/;

/** The element table, notes and maintenance items of an SIA's text. */
export function readSiaCondition(lines: string[], format: "snbi" | "nbi", date: string, source: string): SiaConditionData {
  const elements: SiaElement[] = [];
  const notes: { label: string; text: string }[] = [];
  const work: string[] = [];
  let cur: SiaElement | null = null;
  let buf: string[] = [];
  const flush = () => {
    if (cur) cur.notes.push(...sentences(buf));
    buf = [];
  };
  const take = (row: SiaElementRow) => {
    if (row.code >= 1000) {
      if (cur) cur.defects.push(row);
      return;
    }
    flush();
    cur = CONDITION_ELEMENTS.has(row.code) ? { ...row, defects: [], notes: [] } : null;
    if (cur) elements.push(cur);
  };
  const header = format === "snbi" ? SNBI_HEADER : NBI_HEADER;

  if (format === "snbi") {
    const start = lines.findIndex((l) => l === "Elements");
    let pending: [number, number, number, number] | null = null;
    for (let k = start < 0 ? lines.length : start + 1; k < lines.length; k++) {
      const l = lines[k];
      if (/^(Photos|Maintenance Items|Inspection References|Load Ratings|SI&A Notes and Schedule|Sketches|Attachments)$/.test(l)) break;
      const q = l.match(/^([\d,.]+) \| ([\d,.]+) \| ([\d,.]+) \| ([\d,.]+)$/);
      if (q) {
        pending = [nums(q[1]), nums(q[2]), nums(q[3]), nums(q[4])];
        continue;
      }
      const e = l.match(/^(\d{1,4}) - (.+?) \| ([A-Za-z. ]+) \| ([\d,.]+)$/);
      if (e) {
        take({ code: +e[1], name: e[2].trim(), unit: e[3].trim(), total: nums(e[4]), cs: pending ?? [0, 0, 0, 0] });
        pending = null;
        continue;
      }
      if (header.test(l)) continue;
      buf.push(l);
    }
    flush();
    // Notes: "nn | L14A - Structure Note : | text", continued on the lines after, up to the schedule.
    const n0 = lines.findIndex((l) => l === "Notes");
    let label = "";
    let text: string[] = [];
    const keep = () => {
      if (label && text.length && /Structure Note|Inspection Note/i.test(label)) notes.push({ label, text: sentences(text).join(" ") });
      text = [];
    };
    for (let k = n0 < 0 ? lines.length : n0 + 1; k < lines.length; k++) {
      const l = lines[k];
      if (/^(Schedule|Load Ratings)$/.test(l) || /^Structure: .* Page \d+ of \d+$/.test(l)) break;
      const m = l.match(/^nn \| [A-Z]+\d+[A-Z]? - (.+?)\s*:\s*(?:\| (.*))?$/);
      if (m) {
        keep();
        label = m[1].trim();
        if (m[2]) text.push(m[2]);
      } else text.push(l);
    }
    keep();
    // Maintenance items: each "Problem Description" and the lines after it, up to the next item.
    const endItem = /^(Low|Moderate|Medium|High|Critical|Urgent|Problem Description|Photos|Sketches|Attachments)$|^\d{3}\.\d{2} - |^Status \|/;
    lines.forEach((l, k) => {
      if (l !== "Problem Description") return;
      const text: string[] = [];
      for (let j = k + 1; j < lines.length && !endItem.test(lines[j]) && !header.test(lines[j]); j++) text.push(lines[j]);
      if (text.length) work.push(sentences(text).join(" "));
    });
  } else {
    const start = lines.findIndex((l) => l === "Element Inspection Report");
    for (let k = start < 0 ? lines.length : start + 1; k < lines.length; k++) {
      const l = lines[k];
      if (/^(Inspection References and Definitions:|Maintenance Activity Summary)$/.test(l)) break;
      const e = l.match(/^(\d+)\/\d+ \| (.+?) \| ([^|]+) \| ([\d,.]+) \| \d+% \| ([\d,.]+) \| \d+% \| ([\d,.]+) \| \d+% \| ([\d,.]+) \| \d+% \| ([\d,.]+)$/);
      if (e) {
        take({ code: +e[1], name: e[2].trim(), unit: e[3].replace(/[()]/g, "").trim(), total: nums(e[4]), cs: [nums(e[5]), nums(e[6]), nums(e[7]), nums(e[8])] });
        continue;
      }
      if (header.test(l)) continue;
      buf.push(l);
    }
    flush();
    // "Bridge Notes (Inspection > Inventory > Admin)" and "Inspection Notes (Inspection > Condition)".
    const blocks: [RegExp, string][] = [
      [/^Bridge Notes \(Inspection > /, "Structure Note"],
      [/^Inspection Notes \(Inspection > /, "Inspection Note"],
    ];
    for (const [re, label] of blocks) {
      const s = lines.findIndex((l) => re.test(l));
      if (s < 0) continue;
      const text: string[] = [];
      for (let k = s + 1; k < lines.length && !/\(Inspection > .*\)$/.test(lines[k]) && !header.test(lines[k]); k++) if (!/^(Date|Time): /.test(lines[k])) text.push(lines[k]);
      if (text.length) notes.push({ label, text: sentences(text).join(" ") });
    }
    // Maintenance: "156.00 | Deck-Seal | date | … | Priority", its description on the lines after.
    const m0 = lines.findIndex((l) => l === "Maintenance Activity Summary");
    const row = /^\d{3}\.\d{2} \| /;
    if (m0 >= 0)
      for (let k = m0 + 1; k < lines.length; k++) {
        if (/\(Inspection > .*\)$/.test(lines[k])) break;
        if (!row.test(lines[k])) continue;
        const text: string[] = [];
        for (let j = k + 1; j < lines.length && !row.test(lines[j]) && !header.test(lines[j]) && !/\(Inspection > .*\)$/.test(lines[j]) && !/^MMS Activity \|/.test(lines[j]); j++) text.push(lines[j]);
        if (text.length) work.push(sentences(text).join(" "));
      }
  }
  return { source, date, elements, notes, work };
}
