// CDOT's MSE wall quantities per foot of wall, by the B-504 quantity sheets: structure excavation (EM1), structure
// backfill Class 1 (BM1), mechanical reinforcement of soil (MRS) and the geomembrane's pay length (PLG), for a core wall
// with 1:1 excavation (B-504-Q7) or a truncated base with ¾:1 soil (Q4) or ½:1 rock (Q3) excavation; and the wall split
// into segments along its stations with the quantities summed (as the sheets' notes suggest for a whole wall).

export type MseBase = "core" | "truncated-soil" | "truncated-rock";

/** The excavation's back slope (H:1V) behind a truncated base, and the reinforcement's growth with height. */
export const BASE_SLOPE: Record<MseBase, number> = { core: 0, "truncated-soil": 0.75, "truncated-rock": 0.5 };

/**
 * CDOT's least reinforcement length for a design height: 0.7 DH, and the B-504-D1 table's 6 ft up to 6 ft,
 * 7 ft up to 7'-4", 8 ft above (AASHTO 11.10.2.1 asks 0.7H and 8 ft).
 */
export function cdotMinLength(DH: number) {
  return Math.max(0.7 * DH, DH <= 6 + 1e-9 ? 6 : DH <= 7.334 ? 7 : 8);
}

/** The truncated base's least bottom length: 0.45 DH or 4 ft (B-504-A C note 6). */
export const truncatedMinLength = (DH: number) => Math.max(0.45 * DH, 4);

/**
 * Per foot of wall (CY/LF, PLG ft/LF), for a design height DH, the reinforcement length (core: uniform; truncated: at
 * the bottom), the excavation's height H at the wall layout line and the existing ground's average angle θ (deg).
 */
export function cdotQuantities(o: { base: MseBase; DH: number; L: number; H: number; theta: number }) {
  const s = BASE_SLOPE[o.base];
  const t = Math.tan((o.theta * Math.PI) / 180);
  const Hmin = 1.5 + 4 * t; // the sheets' condition, H at least 1.5 + 4 tan θ
  const H = Math.max(o.H, Hmin);
  const tail = (H / 2 + 1.5) * H - 0.5 * (H + 1.5) ** 2 * (t / (1 + t)); // the front: the toe cover's cut
  if (o.base === "core") {
    const RL = o.L;
    const denom = 1 - t;
    if (!(denom > 1e-6)) return null; // ground at 45° or steeper: the 1:1 cut never meets it
    const h = (H + RL + 1.5) * (t / denom);
    const EM1 = ((H + h / 2) * (h / t) - 0.5 * (H + h) ** 2 + tail) / 27;
    const BM1 = (o.DH * (RL + 1.5) + 0.5 * o.DH ** 2 + 3.375) / 27;
    return { RL, h, H, Hmin, raised: H > o.H, EM1, BM1, MRS: (o.DH * RL) / 27, PLG: RL + 1.5 + o.DH, sheet: "B-504-Q7" };
  }
  const Lb = o.L;
  const RL = Lb + (s * o.DH) / 2; // the average length
  const denom = 1 - s * t;
  if (!(denom > 1e-6)) return null;
  const h = (Lb + s * H) * (t / denom);
  const EM1 = ((H + h / 2) * (Lb + s * (H + h)) - (s / 2) * (H + h) ** 2 + tail) / 27;
  const BM1 = (3.375 + RL * o.DH) / 27;
  return { RL, h, H, Hmin, raised: H > o.H, EM1, BM1, MRS: (o.DH * RL) / 27, PLG: Lb + s * o.DH, sheet: o.base === "truncated-soil" ? "B-504-Q4" : "B-504-Q3" };
}
export type CdotQuantities = NonNullable<ReturnType<typeof cdotQuantities>>;

/** A point along the wall: its station (ft), design height there (ft), and the excavation's height at the layout line (ft). */
export type WallPoint = { station: number; DH: number; excH: number };

/**
 * The wall's segments between its points, each at its average height and excavation, its reinforcement length scaled
 * with the height as the designed section has it (and at least CDOT's least length), and the quantities per foot times
 * its length.
 */
export function wallSegments(points: WallPoint[], o: { base: MseBase; H: number; L: number; theta: number }) {
  const pts = [...points].filter((p) => Number.isFinite(p.station) && p.DH > 0).sort((a, b) => a.station - b.station);
  const ratio = o.L / o.H;
  const segs = pts.slice(1).map((p, k) => {
    const a = pts[k];
    const length = p.station - a.station;
    const DH = (a.DH + p.DH) / 2;
    const excH = (a.excH + p.excH) / 2;
    const L = o.base === "core" ? Math.max(ratio * DH, cdotMinLength(DH)) : Math.max(ratio * DH, truncatedMinLength(DH));
    const q = cdotQuantities({ base: o.base, DH, L, H: excH, theta: o.theta });
    return { from: a.station, to: p.station, length, DH, maxDH: Math.max(a.DH, p.DH), excH, L, q };
  }).filter((s) => s.length > 0);
  const sum = (f: (s: (typeof segs)[number]) => number) => segs.reduce((t, s) => t + f(s), 0);
  return {
    segments: segs,
    length: sum((s) => s.length),
    facing: sum((s) => s.DH * s.length),
    EM1: sum((s) => (s.q?.EM1 ?? 0) * s.length),
    BM1: sum((s) => (s.q?.BM1 ?? 0) * s.length),
    MRS: sum((s) => (s.q?.MRS ?? 0) * s.length),
    PLG: sum((s) => (s.q?.PLG ?? 0) * s.length),
    maxDH: Math.max(0, ...segs.map((s) => s.maxDH)),
    avgDH: segs.length ? sum((s) => s.DH * s.length) / sum((s) => s.length) : 0,
  };
}
export type WallSegments = ReturnType<typeof wallSegments>;
