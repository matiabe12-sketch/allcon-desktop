import { describe, expect, it } from "vitest";
import { designGirder, GIRDER_DEFAULTS, type GirderInputs } from "./prestressed";

// FHWA NHI-04-043, "Comprehensive Design Example for Prestressed Concrete (PSC) Girder Superstructure Bridge" (2003),
// Design Step 5.3, Tables 5.3-1 (moments) and 5.3-3 (shears), the interior girder: two 110 ft spans of AASHTO Type VI
// girders made continuous for the loads after the deck (creep and shrinkage ignored, as the example does), six girders
// at 9'-8", 3'-6 ¼" overhangs, 8 in deck (½ in integral wearing surface), 4 in haunch, 20° skew; parapets 0.650 klf each
// shared by the six girders (0.216 klf), 30 psf future wearing surface on the interior girder's 9.667 ft (0.290 klf);
// one 5.0625 kip diaphragm at midspan. Girders 109 ft between bearings, the pier's bearings 1 ft off its centerline.
// Read from https://www.fhwa.dot.gov/bridge/Lrfd/pscus053.cfm (and pscus051/052, pscus02).

const NHI: GirderInputs = {
  ...GIRDER_DEFAULTS,
  shape: "aashto-vi",
  L: 109,
  extraSpans: [{ L: 109, strands: null, harped: null }],
  pierBearingOffset: 1,
  nGirders: 6,
  S: 9 + 8 / 12,
  overhang: 3.521,
  barrierWidth: 3.521 - (1 + 10 / 12),
  skew: 20,
  deckT: 8,
  sacrificial: 0.5,
  haunch: 4,
  fc: 6,
  fci: 4.8,
  fcDeck: 4,
  barrierWeight: 0.65,
  barriersOnExterior: false,
  fws: 30,
  diaphragms: 1,
  diaphragmWeight: 5.0625,
  restraintMoments: "none",
  criteria: "aashto",
  skewShearInterior: true,
  rigidMethod: true,
};

// Table 5.3-1 (k-ft), span 1 from the abutment's bearing: [location, parapet, FWS, +HL-93, −HL-93].
const MOMENTS: [number, number, number, number, number][] = [
  [11, 85, 114, 886, -116],
  [22, 144, 193, 1509, -233],
  [33, 177, 237, 1882, -349],
  [44, 183, 246, 2047, -465],
  [55, 164, 220, 2010, -581],
  [66, 118, 159, 1794, -698],
  [77, 46, 62, 1388, -814],
  [88, -52, -69, 825, -1124],
  [99, -176, -236, 297, -1371],
  [109, -311, -418, 15, -2006],
];

describe("FHWA NHI-04-043 (Design Step 5.3), the interior girder of span 1", () => {
  const r = designGirder(NHI);
  const line = r.spans[0].interior;
  // Linear between our stations (tenths of the 109 ft girder) to the table's locations.
  const interp = (x: number, f: (s: (typeof line.stations)[number]) => number) => {
    const st = line.stations;
    let k = 0;
    while (k < st.length - 2 && st[k + 1].x < x) k++;
    const [a, b] = [st[k], st[k + 1]];
    const t = Math.min(1, Math.max(0, (x - a.x) / (b.x - a.x)));
    return f(a) + (f(b) - f(a)) * t;
  };
  // Differences in the inputs, not the analysis: the example's interior moment DF is 0.796 (Kg with the haunch left out
  // of eg and an 8 in deck); the girder check's is 0.806 (the 4 in haunch in eg and the 7.5 in structural deck). Its FWS is
  // the 52 ft roadway shared equally (0.260 klf, 4.6.2.2.1) where the example puts the interior girder's 9.667 ft (0.290
  // klf). So: live load per lane, FWS per klf.
  const df = line.df.moment;
  it("its loads: parapets 0.2167 klf; the distribution factor 0.806 (the example, without the haunch: 0.796)", () => {
    expect(line.loads.wDC2).toBeCloseTo((2 * 0.65) / 6, 6);
    expect(df).toBeCloseTo(0.806, 3);
  });
  it("the noncomposite moment at midspan: girder 1,678, slab, haunch and diaphragm 1,695 + 137 k-ft (109 ft simple span)", () => {
    expect(interp(54.5, (s) => s.Mg) / 1678).toBeCloseTo(1, 2);
    expect(interp(54.5, (s) => s.Mdeck) / (1695 + 137)).toBeCloseTo(1, 2);
  });
  it("the parapets and FWS on the continuous beam: within 2% (or 3 k-ft) at every tenth point and the pier", () => {
    for (const [x, P, W] of MOMENTS) {
      const ours = interp(x, (s) => s.Mdc2);
      expect(Math.abs(ours - P), `parapet at ${x} ft: ${ours.toFixed(1)} against ${P}`).toBeLessThan(Math.max(3, 0.02 * Math.abs(P)));
      const fws = (interp(x, (s) => s.Mdw) * 0.29) / line.loads.wDW;
      expect(Math.abs(fws - W), `FWS at ${x} ft: ${fws.toFixed(1)} against ${W}`).toBeLessThan(Math.max(3, 0.02 * Math.abs(W)));
    }
  });
  it("HL-93 with IM, per lane: positive within 2% to 0.7 L, negative at the pier within 1.5%", () => {
    for (const [x, , , pos] of MOMENTS.filter(([x]) => x <= 77)) {
      const ours = interp(x, (s) => s.Mll) / df;
      expect(Math.abs(ours / (pos / 0.796) - 1), `+LL at ${x} ft: ${ours.toFixed(0)} per lane against ${(pos / 0.796).toFixed(0)}`).toBeLessThan(0.02);
    }
    const pier = line.stations.find((s) => s.pier && s.x > 1)!;
    expect(Math.abs(pier.negative!.Mll / df / (-2006 / 0.796) - 1)).toBeLessThan(0.015);
  });
});
