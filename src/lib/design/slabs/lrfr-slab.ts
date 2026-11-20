import { continuousBeam } from "../girders/continuous";
import { LRFR_DEFAULTS, vehicleGamma, ratingFactors, ratingVehicles, summarizeRatings, truncate, type LrfrSettings, type RatingAt, type VehicleRating } from "../girders/lrfr";
import { designSlabBridge, type SlabBridgeInputs } from "./slab-bridge";

// Load and Resistance Factor Rating of a cast-in-place slab bridge (MBE 6A.5 with the CDOT Bridge Rating Manual), from the
// Slab Bridge design's own sections: the interior and edge strips' flexure (4.6.2.3), positive and, where continuous,
// negative over the piers. A slab designed for moment by 4.6.2.3 is satisfactory for shear (AASHTO 5.12.2.1), so shear
// isn't rated; the service limit states aren't rated for reinforced concrete (BRM 1.3 P for legal and permit loads). The
// other vehicles take HL-93's strip, scaled by their effect over HL-93's on the same beam. kip, ft.

export function rateSlabBridge(i: SlabBridgeInputs, settings: LrfrSettings = { ...LRFR_DEFAULTS, ...(i.rating ?? {}), on: true }) {
  const s = settings;
  const f = ratingFactors(s);
  const r = designSlabBridge(i);
  // The beams the design analyzes: one continuous, or a span each.
  const beams = r.continuous ? [{ cb: continuousBeam(i.spans), first: 0 }] : i.spans.map((L, k) => ({ cb: continuousBeam([L]), first: k }));
  const beamOf = (span: number) => {
    const b = r.continuous ? beams[0] : beams[span];
    return { cb: b.cb, s: span - b.first };
  };
  const hlAt = (span: number, x: number) => r.env.find((e) => e.span === span && Math.abs(e.x - x) < 1e-6)!;
  type Sec = (typeof r.sections)[number];
  const lowest = (gammaL: number, ratio: (q: Sec) => number): RatingAt => {
    let best: RatingAt = { rf: Infinity, span: 0, girder: "interior", x: 0, limit: "" };
    for (const q of r.sections) {
      const LL = q.MLL * ratio(q);
      if (!(LL > 1e-9)) continue;
      const rf = (f.phiCS * q.f.MR - f.gDC * q.MDC - f.gDW * q.MDW) / (gammaL * LL);
      if (rf < best.rf) best = { rf, span: q.span, girder: q.where === "interior" ? "interior" : "exterior", x: q.x, limit: `Strength, flexure (${q.negative ? "negative" : "positive"}, ${q.where === "interior" ? "interior" : "edge"} strip)` };
    }
    return best;
  };
  const inventory = lowest(1.75, () => 1);
  const operating = lowest(1.35, () => 1);
  const ratings: VehicleRating[] = ratingVehicles(s).map((v) => {
    const gammaL = vehicleGamma(v, s);
    const cache = new Map<string, { Mpos: number; Mneg: number }>();
    const ratio = (q: Sec) => {
      const key = `${q.span}|${Math.round(q.x * 1000)}`;
      let e = cache.get(key);
      if (!e) {
        const b = beamOf(q.span);
        cache.set(key, (e = b.cb.vehicleEnvelope(b.s, q.x, v.axles, 0.33)));
      }
      const h = hlAt(q.span, q.x);
      return q.negative ? (h.Mneg < 0 ? e.Mneg / h.Mneg : 0) : h.Mpos > 0 ? e.Mpos / h.Mpos : 0;
    };
    const rf = lowest(gammaL, ratio);
    const interiorOnly = (() => {
      let best: RatingAt = rf;
      best = { ...best, rf: Infinity };
      for (const q of r.sections.filter((x) => x.where === "interior")) {
        const LL = q.MLL * ratio(q);
        if (!(LL > 1e-9)) continue;
        const v2 = (f.phiCS * q.f.MR - f.gDC * q.MDC - f.gDW * q.MDW) / (gammaL * LL);
        if (v2 < best.rf) best = { rf: v2, span: q.span, girder: "interior", x: q.x, limit: `Strength, flexure (${q.negative ? "negative" : "positive"}, interior strip)` };
      }
      return best;
    })();
    return { name: v.name, level: v.level, tons: v.tons, gammaL, rf, rfInterior: interiorOnly, ratingTons: v.tons === null ? null : truncate(rf.rf * v.tons, 1) };
  });
  return {
    settings: s,
    factors: { ...f, tensLimit: 0 },
    hl93: { inventory: { ...inventory, rf: truncate(inventory.rf, 2) }, inventoryStrength: inventory, inventoryService: inventory, operating: { ...operating, rf: truncate(operating.rf, 2) } },
    ratings,
    ...summarizeRatings(ratings, s),
  };
}

export type SlabRatingResult = ReturnType<typeof rateSlabBridge>;
