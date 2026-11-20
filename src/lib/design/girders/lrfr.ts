import { CDOT_VEHICLES, type Vehicle } from "../rating/vehicles";
import { axlesOf, continuousBeam, type Axle, type ContinuousBeam } from "./continuous";
import type { GirderInputs, GirderResult } from "./prestressed";

// Load and Resistance Factor Rating (LRFR) of a prestressed girder line, AASHTO Manual for Bridge Evaluation (MBE)
// Section 6A with the CDOT Bridge Rating Manual (BRM, September 2022), from the LRFD girder check's own results: its
// dead loads, distribution factors, capacities and stresses at every point of interest, so a design and its rating
// can't disagree. Kept apart from the double-tee Load Factor Rating (rating/double-tee.ts).
//
//   RF = (C − γDC·DC − γDW·DW ± γP·P) / (γL·(LL + IM))       MBE Eq. 6A.4.2.1-1
//   strength: C = φc·φs·φ·Rn, φc·φs ≥ 0.85                     MBE Eq. 6A.4.2.1-3
//
// Live loads: HL-93 (design load, inventory and operating; the girder check's envelopes), the Colorado or Interstate
// legal trucks, the specialized hauling vehicles (NRL, SU4–SU7) and the emergency vehicles (EV2, EV3) as legal loads,
// and the Colorado permit vehicles (BRM 1.2), each moved over the girder line's spans, IM 33% (BRM 15-4: full impact),
// with the girder's multi-lane distribution factors (BRM 1.3 C) unless single-lane is chosen. Service III is checked
// for the design load at inventory only (BRM 1.3 P lets the legal and permit ratings skip the service limit states).
// kip, ft, ksi.

export type MbeEdition = "2nd" | "3rd";
export type LrfrSettings = {
  on: boolean;
  /** Which legal trucks: Colorado's on state highways, the Interstate's on Interstate routes and ramps (BRM 1.2.2). */
  route: "state" | "interstate";
  /** Average daily truck traffic, one direction (BRM 15-6: ADT × % trucks from the SIA); null when unknown. */
  adtt: number | null;
  /** The member's condition for φc (MBE Table 6A.4.2.3-1); new bridges are "good" (BRM 15-6). */
  condition: "good" | "fair" | "poor";
  /** φs, MBE Table 6A.4.2.4-1: 1.00 for multi-girder bridges. */
  system: number;
  /** The wearing surface's thickness measured in the field (γDW 1.25), or not (1.50) (MBE Table 6A.4.2.2-1). */
  dwMeasured: boolean;
  /** The MBE edition's legal load factors (Table 6A.4.4.2.3a-1). */
  edition: MbeEdition;
  /** Distribution for legal and permit vehicles: multi-lane (BRM 1.3 C), or one lane (BRM 1.3 D, with the Rating Engineer's approval). */
  lanes: "multi" | "single";
  /** The emergency vehicles at γL 1.30 (BRM 1.3 L allows it at every traffic level), or at the legal loads' factor. */
  evAt130: boolean;
  /** Rate shear (BRM 1.4 M: required for LRFD concrete bridges built after 2001). */
  shear: boolean;
};

export const LRFR_DEFAULTS: LrfrSettings = { on: false, route: "state", adtt: null, condition: "good", system: 1, dwMeasured: false, edition: "3rd", lanes: "multi", evAt130: false, shear: true };

/** The Interstate legal trucks (BRM Figure 1-5): wheel-line loads (kip) and spacings (ft), as CDOT_VEHICLES. */
export const INTERSTATE_LEGAL: Vehicle[] = [
  { name: "Interstate Type 3", cls: "legal", P: [6, 9, 9], S: [13.5, 4] },
  { name: "Interstate Type 3S2", cls: "legal", P: [5, 7.5, 7.5, 9, 9], S: [12, 4, 25, 4] },
  { name: "Interstate Type 3-2", cls: "legal", P: [6, 9, 9, 7.5, 7.5], S: [14, 4, 16, 16] },
];

/** Weight limits for posting (BRM Tables 1-4 to 1-6), tons, by route. */
export const POSTING_LIMIT: Record<string, { state: number | null; interstate: number | null }> = {
  "CO Type 3": { state: 27, interstate: null },
  "CO Type 3S2": { state: 42.5, interstate: null },
  "CO Type 3-2": { state: 42.5, interstate: null },
  "Interstate Type 3": { state: null, interstate: 24 },
  "Interstate Type 3S2": { state: null, interstate: 38 },
  "Interstate Type 3-2": { state: null, interstate: 39 },
  SU4: { state: 27, interstate: 27 },
  SU5: { state: 31, interstate: 31 },
  "CO SU6": { state: 33, interstate: 34.75 },
  "CO SU7": { state: 35, interstate: 38.75 },
  NRL: { state: 40, interstate: 40 },
  EV2: { state: null, interstate: 28.75 },
  EV3: { state: null, interstate: 43 },
};

/** The overload color code by the permit vehicles' operating tons (BRM Table 1-7). */
export function colorCode(permitTons: number, tandemTons: number) {
  const of = (t: number, w: number, y: number, o: number) => (t >= w ? 0 : t >= y ? 1 : t >= o ? 2 : 3);
  const k = Math.min(of(permitTons, 96, 88.5, 80.5), of(tandemTons, 50, 46, 42)); // the tandem may set the code where it's less severe (BRM 1.16)
  return (["White", "Yellow", "Orange", "Black"] as const)[k];
}

/** φc, MBE Table 6A.4.2.3-1. */
export const CONDITION_FACTOR = { good: 1.0, fair: 0.95, poor: 0.85 };

/** γL for legal loads by ADTT (MBE Table 6A.4.4.2.3a-1), interpolated; unknown traffic takes the table's largest. */
export function legalGamma(adtt: number | null, edition: MbeEdition) {
  const t = edition === "3rd" ? [{ a: 1000, g: 1.3 }, { a: 5000, g: 1.45 }] : [{ a: 100, g: 1.4 }, { a: 1000, g: 1.65 }, { a: 5000, g: 1.8 }];
  if (adtt === null || !(adtt >= 0)) return t[t.length - 1].g;
  if (adtt <= t[0].a) return t[0].g;
  for (let k = 1; k < t.length; k++) if (adtt <= t[k].a) return t[k - 1].g + ((t[k].g - t[k - 1].g) * (adtt - t[k - 1].a)) / (t[k].a - t[k - 1].a);
  return t[t.length - 1].g;
}

/**
 * γL for routine (annual) permits, unlimited crossings, mixed with traffic, two or more lanes (MBE 3rd ed. Table
 * 6A.4.5.4.2a-1; BRM 1.4 X): by ADTT (over 5000, 1000, under 100, interpolated; unknown as over 5000, BRM 15-6) and the
 * permit's weight ratio, its gross weight over its front-to-rear axle length (kip/ft). The 2nd edition's 1.80/1.60/1.40.
 */
export function permitGamma(adtt: number | null, ratio = 2.5, edition: MbeEdition = "3rd") {
  const rows = edition === "2nd" ? [{ a: 100, g: [1.4, 1.4, 1.4] }, { a: 1000, g: [1.6, 1.6, 1.6] }, { a: 5000, g: [1.8, 1.8, 1.8] }] : [{ a: 100, g: [1.3, 1.2, 1.15] }, { a: 1000, g: [1.35, 1.25, 1.2] }, { a: 5000, g: [1.4, 1.35, 1.3] }];
  const col = ratio < 2 ? 0 : ratio <= 3 ? 1 : 2;
  const t = rows.map((r) => ({ a: r.a, g: r.g[col] }));
  if (adtt === null || !(adtt >= 0) || adtt >= t[2].a) return t[2].g;
  if (adtt <= t[0].a) return t[0].g;
  for (let k = 1; k < t.length; k++) if (adtt <= t[k].a) return t[k - 1].g + ((t[k].g - t[k - 1].g) * (adtt - t[k - 1].a)) / (t[k].a - t[k - 1].a);
  return t[2].g;
}

/** A permit vehicle's weight ratio, gross weight over front-to-rear axle length (kip/ft), for Table 6A.4.5.4.2a-1. */
export const weightRatio = (v: Pick<RatingVehicle, "axles">) => v.axles.reduce((t, a) => t + a.P, 0) / Math.max(1, v.axles[v.axles.length - 1].d - v.axles[0].d);

/** γL for a vehicle under a setting: legal, emergency (BRM 1.3 L) or permit (by its weight ratio). */
export function vehicleGamma(v: RatingVehicle, s: LrfrSettings) {
  const legal = legalGamma(s.adtt, s.edition);
  return v.level === "permit" ? permitGamma(s.adtt, weightRatio(v), s.edition) : v.level === "ev" && s.evAt130 ? 1.3 : legal;
}

export type RatingVehicle = { name: string; level: "design" | "legal" | "su" | "ev" | "permit"; tons: number | null; axles: Axle[] };

/** The vehicles to rate, by route (BRM 1.2). */
export function ratingVehicles(s: Pick<LrfrSettings, "route">): RatingVehicle[] {
  // Tons: the posted weight (the permit truck's 21.67 kip axles add to 96.02 T; CDOT posts it as 96 T).
  const toV = (v: Vehicle): RatingVehicle => ({ name: v.name, level: v.cls === "design" ? "design" : v.cls, tons: Math.round(v.P.reduce((a, b) => a + b, 0) * 4) / 4, axles: axlesOf(v.P.map((p) => 2 * p), v.S) });
  const legal = s.route === "interstate" ? INTERSTATE_LEGAL : CDOT_VEHICLES.filter((v) => v.cls === "legal");
  return [...legal.map(toV), ...CDOT_VEHICLES.filter((v) => v.cls === "su" || v.cls === "ev" || v.cls === "permit").map(toV)];
}

export type RatingAt = { rf: number; span: number; girder: "interior" | "exterior"; x: number; limit: string; /** Where, in words, when not a girder's span and distance (a culvert's station). */ at?: string };
export type VehicleRating = { name: string; level: RatingVehicle["level"] | "design"; tons: number | null; gammaL: number; rf: RatingAt; rfInterior: RatingAt; ratingTons: number | null };
export type LrfrResult = ReturnType<typeof rateGirder>;

const trunc = (v: number, d: number) => Math.floor(v * 10 ** d + 1e-9) / 10 ** d;

/**
 * The ratings of every girder line (interior and exterior, every span) for every vehicle: the lowest rating factor over
 * the points of interest and limit states, where it occurs, and its tons; the posting and color code (BRM 1.15, 1.16).
 */
export function rateGirder(i: GirderInputs, r: { spans: { index: number; L: number; interior: GirderResult; exterior: GirderResult }[]; continuous: boolean }, settings: LrfrSettings = LRFR_DEFAULTS) {
  const s = settings;
  const phiCS = Math.max(0.85, CONDITION_FACTOR[s.condition] * s.system);
  // Shear: φs = 1.0 (MBE C6A.4.2.4: system factors aren't for shear).
  const phiCV = Math.max(0.85, CONDITION_FACTOR[s.condition]);
  const gDC = 1.25;
  const gDW = s.dwMeasured ? 1.25 : 1.5;
  const gLegal = legalGamma(s.adtt, s.edition);
  const gPermit = permitGamma(s.adtt, 2.5, s.edition); // the CO Permit's ratio (192 kip over 77 ft); each permit takes its own below
  const gEV = s.evAt130 ? 1.3 : gLegal;
  const vehicles = ratingVehicles(s);
  const tensLimit = i.exposure === "moderate" ? Math.min(0.19 * Math.sqrt(i.fc), 0.6) : i.exposure === "severe" ? Math.min(0.0948 * Math.sqrt(i.fc), 0.3) : 0;

  // The beams the girder check analyzes: the spans' lengths on the continuous beam, and each span alone.
  const beam: ContinuousBeam | null = r.continuous ? continuousBeam(r.spans.map((sp) => sp.interior.La)) : null;
  const simple = r.spans.map((sp) => continuousBeam([sp.L]));
  const envCache = new Map<string, { Mpos: number; Mneg: number; V: number }>();
  const envelope = (v: RatingVehicle, k: number, line: GirderResult, x: number) => {
    const key = `${v.name}|${k}|${Math.round(x * 1000)}`;
    let e = envCache.get(key);
    if (!e) {
      const one = simple[k].vehicleEnvelope(0, x, v.axles, 0.33);
      if (beam) {
        const c = beam.vehicleEnvelope(k, x + line.shift, v.axles, 0.33);
        // A continuity joint that isn't fully effective is enveloped with the simple span, as the girder check does.
        e = { Mpos: Math.max(c.Mpos, one.Mpos), Mneg: c.Mneg, V: Math.max(c.V, one.V) };
      } else e = { Mpos: one.Mpos, Mneg: 0, V: one.V };
      // A permit's lane load (MBE 6A.4.5.4.1, BRM 15-8): 0.2 klf per lane where it adds to the permit's effect, on
      // spans of 200 ft or more, and for negative moments over the piers of continuous spans. No impact on it.
      if (v.level === "permit") {
        const lane = laneEffects(k, line, x);
        const long = r.spans[k].L >= 200;
        e = { Mpos: e.Mpos + (long ? lane.Mpos : 0), Mneg: e.Mneg + (beam ? lane.Mneg : 0), V: e.V + (long ? lane.V : 0) };
      }
      envCache.set(key, e);
    }
    return e;
  };

  const laneEffects = (k: number, line: GirderResult, x: number) => (beam ? laneEffect(beam, k, x + line.shift) : laneEffect(simple[k], 0, x));

  type Effect = { M: number; Mneg: number; V: number };
  /** The lowest RF on a girder line for a live load given per station (with its distribution), at a γL. */
  const lineRating = (k: number, girder: "interior" | "exterior", line: GirderResult, live: (st: GirderResult["stations"][number]) => Effect, gammaL: number): RatingAt => {
    let best: RatingAt = { rf: Infinity, span: k, girder, x: 0, limit: "" };
    const take = (rf: number, x: number, limit: string) => {
      if (Number.isFinite(rf) && rf < best.rf) best = { rf, span: k, girder, x, limit };
    };
    const negCap = line.negativeSection?.phiMn ?? 0;
    for (const st of line.stations) {
      const L = live(st);
      // Flexure, positive: C = φc·φs·φMn (5.6.3.2, the girder check's).
      if (L.M > 1e-6 && !st.pier) take((phiCS * st.phiMn - gDC * (st.Mg + st.Mdeck + st.Mdc2) - gDW * st.Mdw) / (gammaL * L.M), st.x, "Strength, flexure (positive)");
      // Flexure, negative, over the piers (the deck's bars; restraint moments at γP 1.0).
      const n = st.negative;
      if (n && n.inRegion && L.Mneg < -1e-6 && negCap > 0) {
        const dead = -(gDC * (st.Mg + st.Mdeck + n.Mdc2) + gDW * n.Mdw + n.Mr); // hogging, positive
        take((phiCS * negCap - dead) / (gammaL * -L.Mneg), st.x, "Strength, flexure (negative)");
      }
      // Shear, where the girder check works it out (from the critical section in).
      if (s.shear && st.phiVn && L.V > 1e-6) take((phiCV * st.phiVn - gDC * Math.abs(st.Vdc) - gDW * Math.abs(st.Vdw)) / (gammaL * L.V), st.x, "Strength, shear");
    }
    return best;
  };

  const lines = r.spans.flatMap((sp) => [
    { k: sp.index, girder: "interior" as const, line: sp.interior },
    { k: sp.index, girder: "exterior" as const, line: sp.exterior },
  ]);
  const lowest = (f: (l: (typeof lines)[number]) => RatingAt, onlyInterior = false) => lines.filter((l) => !onlyInterior || l.girder === "interior").map(f).reduce((a, b) => (b.rf < a.rf ? b : a));

  // HL-93: the girder check's envelopes (with IM and the distribution factors). Inventory 1.75, operating 1.35.
  const hl = (st: GirderResult["stations"][number]): Effect => ({ M: st.Mll, Mneg: st.negative?.Mll ?? 0, V: st.Vll });
  const invStrength = lowest((l) => lineRating(l.k, l.girder, l.line, hl, 1.75));
  const serviceOnly = lowest((l) => serviceRating(l.line, l.k, l.girder));
  /** Service III, bottom tension, design load inventory only (MBE Table 6A.4.2.2-1, γL 0.80): RF = (fR + fD) / (0.8·fL). */
  function serviceRating(line: GirderResult, k: number, girder: "interior" | "exterior"): RatingAt {
    let best: RatingAt = { rf: Infinity, span: k, girder, x: 0, limit: "Service III, tension" };
    for (const st of line.stations) {
      if (st.pier || !(st.Mll > 1e-6)) continue;
      const fL = (st.Mll * 12) / line.comp.Sbc; // ksi, tension from the live load
      const fD = st.service.botIII + (line.gammaLL3 * st.Mll * 12) / line.comp.Sbc; // prestress and dead loads, compression +
      const rf = (tensLimit + fD) / (0.8 * fL);
      if (rf < best.rf) best = { rf, span: k, girder, x: st.x, limit: "Service III, tension" };
    }
    return best;
  }
  const inventory = serviceOnly.rf < invStrength.rf ? serviceOnly : invStrength;
  const operating = lowest((l) => lineRating(l.k, l.girder, l.line, hl, 1.35));

  // The other vehicles, per lane with IM 33%, on the girder by its distribution factor: multi-lane (BRM 1.3 C), or
  // one lane with the multiple presence factor divided out (MBE 6A.4.5.4.2b).
  const dfOf = (line: GirderResult) => (s.lanes === "single" ? { M: line.df.momentOne / 1.2, V: line.df.shearOne / 1.2 } : { M: line.df.moment, V: line.df.shear });
  const ratings: VehicleRating[] = vehicles.map((v) => {
    const gammaL = vehicleGamma(v, s);
    const of = (l: (typeof lines)[number]) => {
      const df = dfOf(l.line);
      return lineRating(
        l.k,
        l.girder,
        l.line,
        (st) => {
          const e = envelope(v, l.k, l.line, st.x);
          return { M: e.Mpos * df.M, Mneg: e.Mneg * (st.negative?.df ?? df.M), V: e.V * df.V };
        },
        gammaL,
      );
    };
    const rf = lowest(of);
    const rfInterior = lowest(of, true);
    return { name: v.name, level: v.level, tons: v.tons, gammaL, rf, rfInterior, ratingTons: v.tons === null ? null : trunc(rf.rf * v.tons, 1) };
  });

  const summary = summarizeRatings(ratings, s);
  return {
    settings: s,
    factors: { phiC: CONDITION_FACTOR[s.condition], phiS: s.system, phiCS, phiCV, gDC, gDW, gLegal, gPermit, gEV, tensLimit },
    hl93: { inventory: { ...inventory, rf: trunc(inventory.rf, 2) }, inventoryStrength: invStrength, inventoryService: serviceOnly, operating: { ...operating, rf: trunc(operating.rf, 2) } },
    ratings,
    ...summary,
  };
}

/** Posting (BRM 1.15) and the overload color code (BRM 1.16, from the interior members' permit ratings) from a set of vehicle ratings. */
export function summarizeRatings(ratings: VehicleRating[], s: Pick<LrfrSettings, "route">) {
  // Posting (BRM 1.15): the legal loads below their weight limits; 95% exempts; under 0.3 restricted; under 3 tons closed.
  const legalish = ratings.filter((v) => v.level === "legal" || v.level === "su" || v.level === "ev");
  const nrl = ratings.find((v) => v.name === "NRL");
  const posting = legalish
    .filter((v) => !(v.level === "su" && v.name !== "NRL" && nrl && nrl.rf.rf >= 1))
    .map((v) => {
      const limit = POSTING_LIMIT[v.name]?.[s.route] ?? null;
      const tons = v.ratingTons ?? 0;
      const action = limit === null ? "not used on this route" : v.rf.rf < 0.3 ? "restrict all legal loads (RF under 0.3)" : tons < 3 ? "close the bridge (under 3 tons)" : v.rf.rf >= 0.95 || tons >= limit ? "none" : `post at ${tons.toFixed(1)} tons`;
      return { name: v.name, rf: v.rf.rf, tons, limit, action };
    });
  // The color code from the interior girders' permit ratings (BRM 1.16: not the exterior girders).
  const permit = ratings.find((v) => v.name === "CO Permit");
  const tandem = ratings.find((v) => v.name === "CO Mod Tandem");
  const pTons = permit ? trunc(permit.rfInterior.rf * (permit.tons ?? 0), 1) : 0;
  const tTons = tandem ? trunc(tandem.rfInterior.rf * (tandem.tons ?? 0), 1) : 0;
  return {
    posting,
    needsPosting: posting.some((p) => p.action !== "none" && p.action !== "not used on this route"),
    color: { permitTons: pTons, tandemTons: tTons, code: colorCode(pTons, tTons) },
  };
}

/** The rating factors and load factors a setting gives (MBE 6A.4.2, Tables 6A.4.4.2.3a-1 and 6A.4.5.4.2a-1; BRM 1.3 L). */
export function ratingFactors(s: LrfrSettings) {
  const gLegal = legalGamma(s.adtt, s.edition);
  return { phiC: CONDITION_FACTOR[s.condition], phiS: s.system, phiCS: Math.max(0.85, CONDITION_FACTOR[s.condition] * s.system), phiCV: Math.max(0.85, CONDITION_FACTOR[s.condition]), gDC: 1.25, gDW: s.dwMeasured ? 1.25 : 1.5, gLegal, gPermit: permitGamma(s.adtt, 2.5, s.edition), gEV: s.evAt130 ? 1.3 : gLegal };
}

export const truncate = trunc;

/** A 0.2 klf lane load's largest effects at x in span s of a beam, per lane: its influence lines' positive and negative areas (kip·ft and kip). */
export function laneEffect(b: ContinuousBeam, s: number, x: number, w = 0.2) {
  const ilM = b.influence(s, x, "M");
  const ilV = b.influence(s, x, "V");
  const step = Math.max(0.25, b.total / 2000);
  let Mpos = 0;
  let Mneg = 0;
  let V = 0;
  for (let p = step / 2; p < b.total; p += step) {
    const m = ilM(p);
    if (m > 0) Mpos += m * step;
    else Mneg += m * step;
    V += Math.max(0, ilV(p)) * step;
  }
  return { Mpos: w * Mpos, Mneg: w * Mneg, V: w * V };
}
