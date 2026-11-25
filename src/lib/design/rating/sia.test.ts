import { describe, expect, it } from "vitest";
import { DT_DEFAULTS } from "./double-tee";
import { dtRatingInputs } from "../kinds";
import { applySia, conditionTags, readSia, textLines } from "./sia";

// Reading the SIA. The lines below follow the two report layouts as pdf.js gives them (pieces on a
// line joined with " | "), with a real bridge's values; the readings were checked against all ten
// SIAs of the five bridges rated (not kept here: they're the owner's files).

const SNBI = [
  "Structure Inspection and Inventory Report | Inspection Date: | 10/16/2025",
  "Structure Key: | AUR08.0-J.3",
  "Year Built 1983",
  "n | C02 - Superstructure Rating: | 6 - Satisfactory | n | C10 - Channel Protection Rating: | 7 - Good",
  "n | CL01 - Owner: | L03 - City or municipal highway agency | n | CL09A - Structure Type: | CDTPG - Concrete Double T Prestressed Girder",
  "n | CL01A - Responsible Party: | City of Aurora | n | CL10A - Construction Type 120B: | 21 - Concrete Twin 'T' Girder,",
  "n | CL02 - Maintenance Responsibility: | L03 - City or municipal highway | n | CL11A - Features Intersected: | EAST TOLLGATE CREEK",
  "n | CL03 - Federal or Tribal Land Access: | N - Not applicable | n | CL11B - Feature Carried: | 1ST AVENUE",
  "n | G01 - NBIS Length: | 130 | n | G10 - Median: | 0 - No median",
  "n | G02 - Total Length: | 134.2 | n | G11 - Skew: | 15",
  "n | G03 - Maximum Span: | 66 | n | G12 - Curved Bridge: | N - Not curved",
  "n | G04 - Minimum Span: | 66 | n | G13 - Maximum Height: | 14",
  "n | G05 - Out To Out: | 62 | n | G14 - Sidehill Bridge: | N - Not a sidehill bridge",
  "n | G06 - Width Curb to Curb: | 50 | n | G15 - Irregular Deck Area:",
  "n | G07 - Left Curb Or Sidewalk: | 5 | n | G16 - Federal Deck Area: | 8320",
  "n | G08 - Right Curb Or Sidewalk: | 5 | n | G17A - Asphalt / Fill Thickness: | 0",
  "n | ID01A - Structure Key: | AUR08.0-J.3 | n | ID06A - Parallel Structure Key 8P:",
  "n | IE03 - Inspection Date: | 2025-10-16 | n | IE09 - QA Date:",
  "n | SP02 - Number of Spans: | 2 | n | SP09 - Deck Material and Type: | C01 - Reinforced concrete, cast-in-place",
  "n | SP03 - Number of Beam Lines: | 9 | n | SP10 - Wearing Surface: | C01 - Concrete, Monolithic",
  "n | W01 - Year Built: | 1983 | n | W03A - Work Performed:",
  "n | LR02 - Design Method 31D: | Unknown | n | LR09A - Within 1 Mile 64LT10: | No",
];

const NBI = [
  "Bridge Key: | CENT 19-2.5 | Inspection Date: | 10/05/2023 | Suff Rating: | 86.0 | ND | G/F/P Condition: Fair",
  "Tran Region 2T: | 02 | Main Spans Unit 45: | 1 | Total Cost 96: | 0.00",
  "County Code 3: | 005 | Approach Spans 46: | 0 | Year of Cost Estimate 97: | 2017",
  "Place Code 4: | 12815 | Max Span 48: | 27.8 ft | Border Bridge Number 99:",
  "CENTENNIAL | Str Length 49: | 30.0 ft | Defense Highway 100: | 0",
  "Rte.(On/Under) 5A: | 1 | Curb Wdth L/R 50A/B: | 0.0 ft | 0.0 ft | Parallel Structure 101: | N",
  "Signing Prefix 5B: | 5 | Width Curb to Curb 51: | 29.80 ft | Direction of Traffic 102: | 2",
  "Level of Service 5C: | 1 | Width Out to Out 52: | 29.8 ft | Temporary Structure 103: | !",
  "Feature Intersected 6: | Min Clr Ovr Brdg 53: | 99.99 | Fed Lands Hiway 105: | 0",
  "BIG DRY CREEK | N | Year Reconstructed 106:",
  "Facility Carried 7: | Min Underclr 54B: | 0.0 ft | Deck Type 107: | 9",
  "FRANKLIN ST | Min Lat Clrnce Ref R 55A: | N | Wearing Surface 108A: | 6",
  "N/A | Super 59: | 6 | Trk Net 110: | 0",
  "Owner 22: | 04",
  "Year Built 27: | 1968",
  "Skew 34: | 0 ° | Inspector Name 90C: | Userkey 5, UW Sched:",
  "Rating Package Review Date (066R): | 01/01/1901 | Asphalt Thickness (066T): | 4.00",
  "109/1 | Pre Opn Conc Girder/Beam | ft | 360 | 98% | 351 | 3% | 9 | 0% | 0 | 0% | 0",
];

const val = (r: ReturnType<typeof readSia>, input: string) => r.values.find((v) => v.input === input)?.value;

describe("SIA, SNBI items (2025 on)", () => {
  const r = readSia(SNBI);
  it("reads the bridge, its geometry and its units", () => {
    expect(r.format).toBe("snbi");
    expect(r.structure).toBe("AUR08.0-J.3");
    expect(r.date).toBe("2025-10-16");
    expect([val(r, "bridge.facility"), val(r, "bridge.feature"), val(r, "bridge.owner")]).toEqual(["1ST AVENUE", "EAST TOLLGATE CREEK", "City of Aurora"]);
    expect([val(r, "bridge.yearBuilt"), val(r, "bridge.nbiSuper"), val(r, "numSpans"), val(r, "span"), val(r, "skew")]).toEqual([1983, 6, 2, 66, 15]);
    expect([val(r, "units.count"), val(r, "deck.present"), val(r, "loads.asphalt")]).toEqual([9, true, 0]);
    expect([val(r, "roadway.railToRail"), val(r, "roadway.curbToCurb"), val(r, "roadway.curbFaceOffset")]).toEqual([62, 50, 72]);
    expect(val(r, "loads.sidewalks")).toEqual([
      { width: 5, thk: 6 },
      { width: 5, thk: 6 },
    ]);
  });
  it("reads whether the bridge is within 1 mile of an Interstate (LR09A), for posting emergency vehicles", () => {
    expect(val(r, "bridge.nearInterstate")).toBe(false);
    const yes = readSia(SNBI.map((l) => l.replace("64LT10: | No", "64LT10: | Yes")));
    expect(val(yes, "bridge.nearInterstate")).toBe(true);
    expect(applySia(DT_DEFAULTS, yes, yes.values.filter((v) => v.input === "bridge.nearInterstate")).bridge.nearInterstate).toBe(true);
    // Left blank in the report: not read, so it stays the rater's call.
    const blank = readSia(SNBI.map((l) => l.replace("64LT10: | No", "64LT10:")));
    expect(val(blank, "bridge.nearInterstate")).toBeUndefined();
  });
  it("flags what the SIA can't say exactly", () => {
    const len = r.values.find((v) => v.input === "structureLength")!;
    expect(len.value).toBe(67.1);
    expect(len.note).toMatch(/piers/);
    expect(r.values.find((v) => v.input === "loads.sidewalks")!.note).toMatch(/rail edge/);
    expect(r.values.find((v) => v.input === "deck.present")!.note).toMatch(/thickness/);
  });
  it("applies only the values chosen, noting their sources and keeping a sidewalk thickness entered", () => {
    const start = { ...DT_DEFAULTS, loads: { ...DT_DEFAULTS.loads, sidewalks: [{ width: 6, thk: 8 }] } };
    const o = applySia(start, r, r.values.filter((v) => ["span", "units.count", "loads.sidewalks"].includes(v.input)));
    expect([o.span, o.units.count, o.skew]).toEqual([66, 9, DT_DEFAULTS.skew]);
    expect(o.loads.sidewalks).toEqual([
      { width: 5, thk: 8 },
      { width: 5, thk: 6 },
    ]);
    expect(o.notes.span).toMatch(/^SIA 2025-10-16, G03 Maximum Span: 66 \(Sometimes the clear span/);
    expect(start.span).toBe(DT_DEFAULTS.span);
  });
});

describe("SIA, NBI items (full reports before 2025)", () => {
  const r = readSia(NBI);
  it("reads the items, with values on the line below their labels", () => {
    expect(r.format).toBe("nbi");
    expect(r.date).toBe("2023-10-05");
    expect([val(r, "bridge.id"), val(r, "bridge.facility"), val(r, "bridge.feature"), val(r, "bridge.owner")]).toEqual(["CENT 19-2.5", "FRANKLIN ST", "BIG DRY CREEK", "City or municipal highway agency"]);
    expect([val(r, "bridge.yearBuilt"), val(r, "bridge.nbiSuper"), val(r, "numSpans"), val(r, "span"), val(r, "skew"), val(r, "structureLength")]).toEqual([1968, 6, 1, 27.8, 0, 30]);
    expect([val(r, "roadway.railToRail"), val(r, "loads.asphalt"), val(r, "deck.present"), val(r, "loads.sidewalks")]).toEqual([29.8, 4, false, []]);
  });
  it("counts the units from the girder element (two stems a unit) and flags item 48", () => {
    expect(val(r, "units.count")).toBe(6);
    expect(r.values.find((v) => v.input === "span")!.note).toMatch(/bearing to bearing/);
  });
  it("doesn't offer a rail face offset when the widths are equal", () => {
    expect(val(r, "roadway.railFaceOffset")).toBeUndefined();
    expect(r.findings.join(" ")).toMatch(/rail face/);
  });
});

describe("SIA with a sidewalk on one side (a 2026 report: IE03A for the inspection date)", () => {
  // G07 4.3 ft, G08 0: the sketch puts the curb faces 5'-0 1/2" and 1'-3" in from the edges.
  const r = readSia([
    "n | G02 - Total Length: | 47.2 | n | G11 - Skew: | 0",
    "n | G03 - Maximum Span: | 44.5 | n | G12 - Curved Bridge: | N - Not curved",
    "n | G05 - Out To Out: | 30.1 | n | G14 - Sidehill Bridge: | N - Not a sidehill bridge",
    "n | G06 - Width Curb to Curb: | 23.9 | n | G15 - Irregular Deck Area:",
    "n | G07 - Left Curb Or Sidewalk: | 4.3 | n | G16 - Federal Deck Area: | 1421",
    "n | G08 - Right Curb Or Sidewalk: | 0 | n | G17A - Asphalt / Fill Thickness: | 0",
    "n | ID01A - Structure Key: | TELLRD-PINE ST | n | ID06A - Parallel Structure Key 8P:",
    "n | IE03 - Field End Date: | 2026-06-24 | n | IE09 - QA Date:",
    "n | IE03A - Inspection Date: | 2026-06-24 | n | IE10 - Inspection Finalized: | 2026-09-25",
    "n | SP02 - Number of Spans: | 1 | n | SP09 - Deck Material and Type: | C01 - Reinforced concrete, cast-in-place",
    "n | SP03 - Number of Beam Lines: | 5 | n | SP10 - Wearing Surface: | C01 - Concrete, Monolithic",
  ]);
  it("reads the bridge and its one sidewalk", () => {
    expect([r.structure, r.date, val(r, "span"), val(r, "units.count"), val(r, "deck.present")]).toEqual(["TELLRD-PINE ST", "2026-06-24", 44.5, 5, true]);
    expect(val(r, "loads.sidewalks")).toEqual([{ width: 4.3, thk: 6 }]);
  });
  it("takes the narrower side's curb offset (both exterior girders are rated alike) and says why", () => {
    // Edge beyond the sidewalks: (30.1 − 23.9 − 4.3 − 0) / 2 = 0.95 ft, so 63 in and 11.4 in.
    expect(val(r, "roadway.curbFaceOffset")).toBeCloseTo(11.4, 6);
    expect(r.findings.join(" ")).toMatch(/sidewalks differ/);
  });
});

it("refuses a PDF that isn't an SIA", () => {
  expect(() => readSia(["SECTION | LOOKING NORTH", "(6) PRECAST, PRESTRESSED CONCRETE DOUBLE TEE GIRDERS"])).toThrow(/SIA/);
});

it("groups a page's text pieces into lines, top to bottom and left to right", () => {
  expect(
    textLines([
      { str: "66", x: 200, y: 500.5 },
      { str: "G03 - Maximum Span:", x: 50, y: 501 },
      { str: "Geometry (G)", x: 50, y: 520 },
      { str: " ", x: 10, y: 400 },
    ]),
  ).toEqual(["Geometry (G)", "G03 - Maximum Span: | 66"]);
});

// The inspection's condition, read as prompts. The layouts are the two reports' (as pdf.js gives
// them); the notes are made up for the test.
describe("SIA condition findings (prompts, never applied)", () => {
  const SNBI_COND = [
    "n | G03 - Maximum Span: | 40",
    "n | IE03 - Inspection Date: | 2025-10-14",
    "SI&A Notes and Schedule",
    "Notes",
    "nn | IE11A - Inspection Note :",
    "nn | L14A - Structure Note : | Direction of inventory is south to north.",
    "Superstructure is named Girder A through H from west to east.",
    "Schedule",
    "n | EP07A - Load Rater Name 66N: | Someone | n | EP19A - Rating Software Used 66RS:",
    "Elements",
    "Element/Defect | Unit | Total Qty | CS1 | CS2 | CS3 | CS4",
    "900 | 0 | 100 | 0",
    "510 - Wearing Surfaces | sq feet | 1000",
    "90% | 10%",
    "0 | 0 | 100 | 0",
    "3220 - Crack (Wearing Surface) | each | 100",
    "100%",
    "Lane 1, longitudinal crack/seam up to 0.25 inch wide over the joint between units. (40 CS3 3220)",
    "300 | 10 | 8 | 2",
    "109 - Prestressed Concrete Open Girder/Beam | feet | 320",
    "94% | 3% | 3% | 1%",
    "0 | 0 | 0 | 2",
    "1100 - Exposed Prestressing | each | 2",
    "Girder C, bottom of stem near mid-span, spall 3 foot long with 2 strands exposed and one broken. (2 CS4",
    "1100)",
    "Girder A, west face, crack 10 foot long due to impact. (8 CS3 1110)",
    "Girder | D, at Abutment 1, longitudinal crack with rust staining. (1 CS3 1110)",
    "Structure: X : 2025-10-14 - Routine | Page 8 of 21",
    "1 | 0 | 0 | 0",
    "215 - Reinforced Concrete Abutment | feet | 60",
    "Abutment 1, minor cracks.",
    "Photos",
    "Maintenance Items",
    "Moderate",
    "399.00 - Maintenance requiring engineering.",
    "Status | Date Entered | Target Date | Deterioration Category",
    "Open | 10/12/2017 | 10/14/2027",
    "Problem Description",
    "Repair the spall in Girder C and coat the exposed",
    "strands.",
    "Low",
  ];
  const NBI_COND = [
    "Bridge Key: | X 1-1.0 | Inspection Date: | 10/05/2023",
    "Max Span 48: | 30.0 ft",
    "Element Inspection Report",
    "Elm/Env | Description | Unit | Total Qty | % in 1 | Qty. St. 1 | % in 2 | Qty. St. 2 | % in 3 | Qty. St. 3 | % in 4 | Qty. St. 4",
    "16/1 | Re Conc Top Flange | sq.ft | 900 | 70% | 630 | 20% | 180 | 10% | 90 | 0% | 0",
    "Open joints between grout and top flange in three bays (90 SF CS3 -",
    "Tue 12/19/2023 15:02:34",
    "CDOT_SIA v12 - 03/05/2023 | Structure ID: X 1-1.0",
    "Page 3 of 7",
    "Routine Inspection | Highway Number (ON) 5D: | 00000 | U",
    "Structure Inspection and Inventory Report (English Units)",
    "1130).",
    "1130/1 | Cracking (RC and Other) | sq.ft | 90 | 0% | 0 | 0% | 0 | 100% | 90 | 0% | 0",
    "See Element 16 comments.",
    "109/1 | Pre Opn Conc Girder/Beam | ft | 360 | 100% | 360 | 0% | 0 | 0% | 0 | 0% | 0",
    "No significant defects.",
    "End diaphragm between Girders B and C is cracked.",
    "215/1 | Re Conc Abutment | ft | 60 | 100% | 60 | 0% | 0 | 0% | 0 | 0% | 0",
    "Inspection References and Definitions:",
    "Maintenance Activity Summary",
    "MMS Activity | Description | Recommended | Status | Target Year | Priority",
    "354.02 | Superstructure-Repair Concrete | 10/12/2017 | 1 | 2025 | Medium",
    "Seal joints where open between grout and top flange.",
    "Bridge Notes (Inspection > Inventory > Admin)",
    "Superstructure is labeled A to L from west to east.",
    "Inspection Notes (Inspection > Condition)",
    "Date: 10/05/2023",
  ];

  it("reads an SNBI report's elements, defects, notes and maintenance items", () => {
    const c = readSia(SNBI_COND).condition!;
    expect(c.date).toBe("2025-10-14");
    expect(c.elements.map((e) => e.code)).toEqual([510, 109]); // the abutment isn't the rating's
    const g = c.elements[1];
    expect([g.total, g.unit, g.cs]).toEqual([320, "feet", [300, 10, 8, 2]]);
    expect(g.defects).toEqual([{ code: 1100, name: "Exposed Prestressing", unit: "each", total: 2, cs: [0, 0, 0, 2] }]);
    expect(g.notes).toEqual([
      "Girder C, bottom of stem near mid-span, spall 3 foot long with 2 strands exposed and one broken. (2 CS4 1100)",
      "Girder A, west face, crack 10 foot long due to impact. (8 CS3 1110)",
      "Girder D, at Abutment 1, longitudinal crack with rust staining. (1 CS3 1110)",
    ]);
    expect(c.notes).toEqual([{ label: "Structure Note", text: "Direction of inventory is south to north. Superstructure is named Girder A through H from west to east." }]);
    expect(c.work).toEqual(["Repair the spall in Girder C and coat the exposed strands."]);
    // The rater's name on the load rating page isn't read.
    expect(JSON.stringify(c)).not.toContain("Someone");
  });

  it("reads an NBI report's, across a page break", () => {
    const c = readSia(NBI_COND).condition!;
    expect(c.elements.map((e) => [e.code, e.cs])).toEqual([
      [16, [630, 180, 90, 0]],
      [109, [360, 0, 0, 0]],
    ]);
    expect(c.elements[0].defects.map((d) => d.code)).toEqual([1130]);
    expect(c.elements[0].notes).toEqual(["Open joints between grout and top flange in three bays (90 SF CS3 - 1130)."]);
    expect(c.elements[1].notes).toEqual(["No significant defects.", "End diaphragm between Girders B and C is cracked."]);
    expect(c.notes).toEqual([{ label: "Structure Note", text: "Superstructure is labeled A to L from west to east." }]);
    expect(c.work).toEqual(["Seal joints where open between grout and top flange."]);
  });

  it("tags what a note bears on: strands, joints between units, impact; not an expansion joint or a diaphragm", () => {
    expect(conditionTags("2 strands exposed and one broken", 109)).toContain("strands");
    expect(conditionTags("longitudinal crack with rust staining", 109)).toEqual(expect.arrayContaining(["strands"]));
    expect(conditionTags("longitudinal crack with rust staining", 109)).not.toContain("joints");
    expect(conditionTags("longitudinal crack/seam in Lane 1", 510)).toContain("joints");
    expect(conditionTags("Top flanges, between double tee girders, efflorescence", 109)).toContain("joints");
    expect(conditionTags("crack due to impact", 109)).toContain("impact");
    expect(conditionTags("spalls along the compression joint over Pier 2", 12)).not.toContain("joints");
    expect(conditionTags("End diaphragm between Girders B and C is cracked", 109)).not.toContain("joints");
    expect(conditionTags("cracks showing the welded wire reinforcing pattern", 109)).not.toContain("joints");
  });

  it("keeps the findings with the design when the SIA is applied, without setting any condition", () => {
    const r = readSia(SNBI_COND);
    const o = applySia(DT_DEFAULTS, r, r.values.filter((v) => v.input === "span"));
    expect(o.siaCondition).toEqual(r.condition);
    expect(o.condition).toEqual(DT_DEFAULTS.condition);
    expect(dtRatingInputs(JSON.parse(JSON.stringify(o))).siaCondition).toEqual(r.condition);
    expect(dtRatingInputs({}).siaCondition).toBeNull();
  });
});
