import { LRFR_DEFAULTS, ratingFactors, ratingVehicles, summarizeRatings, truncate, type LrfrSettings, type RatingAt, type VehicleRating } from "../girders/lrfr";
import { CASES, combos, designCbc, type CbcInputs } from "./cbc";

// Load and Resistance Factor Rating of a reinforced concrete box culvert (MBE 6A.5.12 with the CDOT Bridge Rating Manual),
// from the Box Culvert design's own frame: every station's faces in flexure and its shear, against the permanent loads
// of each Strength I combination (DC, EV, EH max or min, LS, water, as designed) and the vehicles moved across the top
// through the fill. CDOT's culvert factors (BRM 1.3 M): HL-93 inventory 1.75 and operating 1.35 with the multiple
// presence factor 1.2; the legal loads 2.0 and the permits 1.4 at every traffic level, one lane with m = 1.0. The service
// limit states aren't rated (BRM 1.3 P). kip, ft, per foot of the box.

export const CULVERT_GAMMA = { inventory: 1.75, operating: 1.35, legal: 2.0, permit: 1.4 };

export function rateCulvert(i: CbcInputs, settings: LrfrSettings = { ...LRFR_DEFAULTS, ...(i.rating ?? {}), on: true }) {
  const s = settings;
  const f = ratingFactors(s);
  const r = designCbc(i);
  const C = combos(1).filter((c) => c.strength);
  const dead = (m: number, key: "M" | "V") => C.map((c) => ({ id: c.id, v: CASES.reduce((sum, cs) => sum + c.f[cs.id] * r.unfactored[cs.id][m][key], 0) }));
  type Env = (typeof r.env)[number];
  /** The lowest RF over the faces and shears for a live load envelope (per foot), at γL. */
  const lowest = (env: Env[], gammaL: number): RatingAt => {
    let best: RatingAt = { rf: Infinity, span: 0, girder: "interior", x: 0, limit: "" };
    const take = (rf: number, name: string, limit: string) => {
      if (Number.isFinite(rf) && rf < best.rf) best = { rf, span: 0, girder: "interior", x: 0, limit, at: name };
    };
    for (const fc of r.faces) {
      const m = fc.index;
      const LL = fc.sign > 0 ? env[m].pos.M : -env[m].neg.M; // on this face's side
      if (!(LL > 1e-9)) continue;
      for (const d of dead(m, "M")) take((f.phiCS * fc.flex.Mr - fc.sign * d.v) / (gammaL * LL), fc.station.name, `Strength, flexure (${fc.face})`);
    }
    for (const sh of r.shears) {
      const m = sh.index;
      for (const d of dead(m, "V")) {
        const LL = d.v >= 0 ? env[m].vmax : -env[m].vmin;
        if (!(LL > 1e-9)) continue;
        take((f.phiCV * sh.Vr - Math.abs(d.v)) / (gammaL * LL), sh.station.name, "Strength, shear");
      }
    }
    return best;
  };
  // HL-93: the design's own envelope (truck or tandem, and the lane load where the span passes 15 ft), m = 1.2.
  const inventory = lowest(r.env, CULVERT_GAMMA.inventory);
  const operating = lowest(r.env, CULVERT_GAMMA.operating);
  const ratings: VehicleRating[] = ratingVehicles(s).map((v) => {
    const gammaL = v.level === "permit" ? CULVERT_GAMMA.permit : v.level === "ev" && s.evAt130 ? 1.3 : CULVERT_GAMMA.legal;
    // The patches carry the design's multiple presence factor: one lane, m = 1.0, for the legal and permit loads.
    const axles = v.axles.map((a) => a.P / i.mpf);
    const gaps = v.axles.slice(1).map((a, k) => a.d - v.axles[k].d);
    const rf = lowest(r.vehicleEnv(axles, gaps), gammaL);
    return { name: v.name, level: v.level, tons: v.tons, gammaL, rf, rfInterior: rf, ratingTons: v.tons === null ? null : truncate(rf.rf * v.tons, 1) };
  });
  return {
    settings: s,
    factors: { ...f, gLegal: CULVERT_GAMMA.legal, gPermit: CULVERT_GAMMA.permit, gEV: s.evAt130 ? 1.3 : CULVERT_GAMMA.legal, tensLimit: 0 },
    hl93: { inventory: { ...inventory, rf: truncate(inventory.rf, 2) }, inventoryStrength: inventory, inventoryService: inventory, operating: { ...operating, rf: truncate(operating.rf, 2) } },
    ratings,
    ...summarizeRatings(ratings, s),
  };
}

export type CulvertRatingResult = ReturnType<typeof rateCulvert>;
