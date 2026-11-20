import { continuousBeam } from "./continuous";
import { LRFR_DEFAULTS, vehicleGamma, ratingFactors, ratingVehicles, summarizeRatings, truncate, type LrfrSettings, type RatingAt, type VehicleRating } from "./lrfr";
import { designSteelGirder, type SteelGirderInputs } from "./steel";

// Load and Resistance Factor Rating of a composite steel I-girder (MBE 6A.6 with the CDOT Bridge Rating Manual), from
// the Steel Girder Design Check's own checks at every point: flexure (positive, and negative by 6.10.8 or Appendix A6),
// shear, and Service II's flange stresses (6.10.4.2.2, MBE 6A.6.4.2.2). Each check's demand is linear in the live load, so
// the check is run twice, with almost none and with all of it, to split its demand into the dead loads' part and the
// live load's: RF = (φc·φs − d₀/C) / (γL · (d₁ − d₀)/(γ·C) · LLv/LLhl93), the vehicle's effect over HL-93's on the
// same beam. Fatigue (MBE Section 7) isn't rated here. kip, ft, ksi.

const EPS = 1e-3;
const STRENGTH = ["flex-pos", "flex-pos-c", "flex-pos-t", "flex-neg-a6c", "flex-neg-a6t", "flex-neg-c", "flex-neg-t", "shear"];
const SERVICE = ["svc-top", "svc-bot"];
const LIMIT: Record<string, string> = {
  "flex-pos": "Strength, flexure (positive)",
  "flex-pos-c": "Strength, flexure (positive, compression flange)",
  "flex-pos-t": "Strength, flexure (positive, tension flange)",
  "flex-neg-a6c": "Strength, flexure (negative, A6 compression)",
  "flex-neg-a6t": "Strength, flexure (negative, A6 tension)",
  "flex-neg-c": "Strength, flexure (negative, compression flange)",
  "flex-neg-t": "Strength, flexure (negative, tension flange)",
  shear: "Strength, shear",
  "svc-top": "Service II, top flange",
  "svc-bot": "Service II, bottom flange",
};
/** Service II's live load factors (MBE Table 6A.4.2.2-1): design inventory 1.30, operating 1.00, legal 1.30, permit 1.00. */
const SVC = { inventory: 1.3, operating: 1.0, legal: 1.3, permit: 1.0 };

export function rateSteelGirder(i: SteelGirderInputs, settings: LrfrSettings = { ...LRFR_DEFAULTS, ...(i.rating ?? {}), on: true }) {
  const s = settings;
  const f = ratingFactors(s);
  const base = { ...i, eta: 1 };
  const r0 = designSteelGirder({ ...base, llScale: EPS });
  const r1 = designSteelGirder({ ...base, llScale: 1 });
  const girder: "interior" | "exterior" = i.girder === "interior" ? "interior" : "exterior";
  const beam = continuousBeam(i.spans);
  const hlCache = new Map<string, { Mpos: number; Mneg: number; V: number }>();
  const hl = (sp: number, x: number) => {
    const k = `${sp}|${Math.round(x * 1000)}`;
    let e = hlCache.get(k);
    if (!e) {
      const l = beam.liveEnvelope(sp, x, i.IM);
      hlCache.set(k, (e = { Mpos: l.Mpos, Mneg: l.Mneg, V: l.V }));
    }
    return e;
  };
  // Each check at each point: its dead part d₀/C and its live part per unit of HL-93 (unfactored), from the two runs.
  type Term = { id: string; st: (typeof r1.stations)[number]; d0: number; u: number; sign: "pos" | "neg" | "V" };
  const terms: Term[] = [];
  r1.stations.forEach((st, k) => {
    const s0 = r0.stations[k];
    if (!s0 || Math.abs(s0.X - st.X) > 1e-6) return;
    for (const id of [...STRENGTH, ...SERVICE]) {
      const a = s0.ratios[id];
      const b = st.ratios[id];
      if (a === undefined || b === undefined || !Number.isFinite(a) || !Number.isFinite(b)) continue;
      const gamma = SERVICE.includes(id) ? 1.3 : 1.75;
      const u = (b - a) / (1 - EPS) / gamma;
      if (!(u > 1e-9)) continue;
      const sign = id === "shear" ? "V" : id.includes("neg") || (SERVICE.includes(id) && st.negativeRegion) ? "neg" : "pos";
      terms.push({ id, st, d0: a, u, sign });
    }
  });
  /** The lowest RF for a live load given as a multiple of HL-93 at each point, at a strength γL and a service γL. */
  const lowest = (ratio: (t: Term) => number, gammaL: number, gammaS: number | null): RatingAt => {
    let best: RatingAt = { rf: Infinity, span: 0, girder, x: 0, limit: "" };
    for (const t of terms) {
      const service = SERVICE.includes(t.id);
      if (service && gammaS === null) continue;
      const v = ratio(t);
      if (!(v > 1e-9)) continue;
      const rf = service ? (1 - t.d0) / (gammaS! * t.u * v) : ((t.id === "shear" ? f.phiCV : f.phiCS) - t.d0) / (gammaL * t.u * v);
      if (rf < best.rf) best = { rf, span: t.st.span, girder, x: t.st.x, limit: LIMIT[t.id] };
    }
    return best;
  };
  const one = () => 1;
  const invStrength = lowest(one, 1.75, null);
  const invService = lowest((t) => (SERVICE.includes(t.id) ? 1 : 0), 1, SVC.inventory);
  const inventory = invService.rf < invStrength.rf ? invService : invStrength;
  const operating = lowest(one, 1.35, SVC.operating);

  const ratings: VehicleRating[] = ratingVehicles(s).map((v) => {
    const gammaL = vehicleGamma(v, s);
    const cache = new Map<string, { Mpos: number; Mneg: number; V: number }>();
    const ratio = (t: Term) => {
      const key = `${t.st.span}|${Math.round(t.st.x * 1000)}`;
      let e = cache.get(key);
      if (!e) cache.set(key, (e = beam.vehicleEnvelope(t.st.span, t.st.x, v.axles, i.IM)));
      const h = hl(t.st.span, t.st.x);
      return t.sign === "V" ? (h.V > 0 ? e.V / h.V : 0) : t.sign === "neg" ? (h.Mneg < 0 ? e.Mneg / h.Mneg : 0) : h.Mpos > 0 ? e.Mpos / h.Mpos : 0;
    };
    const rf = lowest(ratio, gammaL, v.level === "permit" ? SVC.permit : SVC.legal);
    return { name: v.name, level: v.level, tons: v.tons, gammaL, rf, rfInterior: rf, ratingTons: v.tons === null ? null : truncate(rf.rf * v.tons, 1) };
  });
  return {
    settings: s,
    factors: { ...f, tensLimit: 0 },
    hl93: { inventory: { ...inventory, rf: truncate(inventory.rf, 2) }, inventoryStrength: invStrength, inventoryService: invService, operating: { ...operating, rf: truncate(operating.rf, 2) } },
    ratings,
    ...summarizeRatings(ratings, s),
  };
}

export type SteelRatingResult = ReturnType<typeof rateSteelGirder>;
