import { DesignError } from "../walls/cip";
import { W_SHAPES } from "./w-shapes";

// A steel I-girder's cross-section and its composite sections, AASHTO LRFD 10th Edition: the steel
// alone, the short-term (n) and long-term (3n) composite sections with the deck's effective width
// (6.10.1.1.1b), and the steel with the deck's longitudinal bars for negative flexure (6.10.1.1.1c);
// the plastic moment (D6.1), the depths of web in compression Dc (D6.3.1) and Dcp (D6.3.2). Inches,
// kips, ksi. Heights are measured up from the bottom of the steel.

export const ES = 29000; // ksi, 6.4.1
export const STEEL_UNIT_WEIGHT = 0.49; // kcf, Table 3.5.1-1

export type Plate = { b: number; t: number }; // in
/** A length of girder with one cross-section: welded plates, or a rolled W shape (AISC). */
export type SteelSegment = { length: number; kind: "plate" | "rolled"; shape?: string; D: number; tw: number; top: Plate; bottom: Plate };

/** The deck as the composite section sees it. */
export type DeckSection = {
  beff: number; // in, effective width (4.6.2.6.1)
  ts: number; // in, structural thickness (the deck less its sacrificial surface)
  tGross: number; // in, the deck's full thickness (for 6.10.1.7)
  haunch: number; // in, from the deck's bottom down to the top of the top flange
  n: number; // Es / Ec
  fc: number; // ksi
  /** Longitudinal bars in the effective width: areas (in²) and their centroids' heights above the deck's bottom (in). */
  bars: { A: number; y: number }[];
  fy: number; // ksi, the bars
};

/** A girder segment's plates; a rolled shape as its flanges and web, its fillets lumped at the web's ends. */
export function plates(seg: SteelSegment) {
  if (seg.kind === "rolled") {
    const row = W_SHAPES.find((r) => r[0] === seg.shape);
    if (!row) throw new DesignError(`Pick a W shape (${seg.shape ?? "none"} isn't in the AISC table).`);
    const [, , A, d, bf, tw, tf] = row;
    const D = d - 2 * tf;
    const fillet = Math.max(0, A - 2 * bf * tf - D * tw); // the rolled fillets' area, both ends of the web
    return { D, tw, top: { b: bf, t: tf }, bottom: { b: bf, t: tf }, fillet, name: seg.shape! };
  }
  if (!(seg.D > 0 && seg.tw > 0 && seg.top.b > 0 && seg.top.t > 0 && seg.bottom.b > 0 && seg.bottom.t > 0)) throw new DesignError("Every girder plate needs a width and a thickness.");
  return { D: seg.D, tw: seg.tw, top: seg.top, bottom: seg.bottom, fillet: 0, name: `${seg.D}×${seg.tw} web, ${seg.top.b}×${seg.top.t} top, ${seg.bottom.b}×${seg.bottom.t} bottom` };
}

type Part = { y0: number; y1: number; b: number; kind: "steel" | "concrete" | "bar"; Fy: number; area?: number; yc?: number };

/** The steel parts, bottom up. */
function steelParts(seg: SteelSegment, Fyw: number, Fyf: number): Part[] {
  const p = plates(seg);
  const tb = p.bottom.t;
  const parts: Part[] = [
    { y0: 0, y1: tb, b: p.bottom.b, kind: "steel", Fy: Fyf },
    { y0: tb, y1: tb + p.D, b: p.tw, kind: "steel", Fy: Fyw },
    { y0: tb + p.D, y1: tb + p.D + p.top.t, b: p.top.b, kind: "steel", Fy: Fyf },
  ];
  if (p.fillet > 0) {
    // Two lumps at the web's ends (centroid about 0.2·tf into the web), counted as web.
    const r = Math.min(p.D / 4, Math.sqrt(p.fillet / 2));
    parts.push({ y0: tb, y1: tb + r, b: p.fillet / 2 / r, kind: "steel", Fy: Fyw });
    parts.push({ y0: tb + p.D - r, y1: tb + p.D, b: p.fillet / 2 / r, kind: "steel", Fy: Fyw });
  }
  return parts;
}

export type Stage = "steel" | "n" | "3n" | "bars";

export type SectionProps = {
  A: number; // in², transformed to steel
  I: number; // in⁴
  yNA: number; // in, the neutral axis above the bottom of the steel
  Stop: number; // in³, to the top of the top flange
  Sbot: number; // in³, to the bottom of the bottom flange
  Sdeck: number; // in³, to the top of the structural deck (transformed: f_deck = M / (n·Sdeck)); 0 without a deck
  depth: number; // in, the steel's depth
  dTop: number; // in, the top of the deck (or of the steel) above the bottom of the steel
};

/** A segment's section for a loading stage. */
export function sectionProps(seg: SteelSegment, stage: Stage, deck: DeckSection | null, Fyw = 50, Fyf = 50): SectionProps {
  const steel = steelParts(seg, Fyw, Fyf);
  const p = plates(seg);
  const depth = p.bottom.t + p.D + p.top.t;
  const items: { A: number; y: number; Io: number }[] = steel.map((s) => ({ A: s.b * (s.y1 - s.y0), y: (s.y0 + s.y1) / 2, Io: (s.b * (s.y1 - s.y0) ** 3) / 12 }));
  let dTop = depth;
  if (deck && stage !== "steel") {
    const yDeck = depth + deck.haunch; // the deck's bottom
    dTop = yDeck + deck.ts;
    if (stage === "bars") for (const b of deck.bars) items.push({ A: b.A, y: yDeck + b.y, Io: 0 });
    else {
      const k = stage === "n" ? deck.n : 3 * deck.n;
      const b = deck.beff / k;
      items.push({ A: b * deck.ts, y: yDeck + deck.ts / 2, Io: (b * deck.ts ** 3) / 12 });
    }
  }
  const A = items.reduce((s, x) => s + x.A, 0);
  const yNA = items.reduce((s, x) => s + x.A * x.y, 0) / A;
  const I = items.reduce((s, x) => s + x.Io + x.A * (x.y - yNA) ** 2, 0);
  const deckTop = deck && (stage === "n" || stage === "3n") ? dTop : 0;
  return { A, I, yNA, Stop: I / (depth - yNA), Sbot: I / yNA, Sdeck: deckTop ? I / (deckTop - yNA) : 0, depth, dTop };
}

/**
 * The plastic moment (D6.1) by the plastic neutral axis found from equilibrium: in positive flexure the
 * deck (0.85 f'c) and the steel above the axis in compression, the bars neglected (as is conservative);
 * in negative flexure the deck cracked, its bars and the steel above the axis in tension. Returns Mp
 * (kip·in.), the axis's height above the bottom of the steel, Dp (top of deck to the axis, positive
 * flexure) and Dcp (the web's depth in compression at Mp, D6.3.2).
 */
export function plasticMoment(seg: SteelSegment, deck: DeckSection, positive: boolean, Fyw = 50, Fyf = 50) {
  const p = plates(seg);
  const steel = steelParts(seg, Fyw, Fyf);
  const depth = p.bottom.t + p.D + p.top.t;
  const yDeck = depth + deck.haunch;
  const parts: Part[] = [...steel];
  if (positive) parts.push({ y0: yDeck, y1: yDeck + deck.ts, b: deck.beff, kind: "concrete", Fy: 0.85 * deck.fc });
  else for (const b of deck.bars) parts.push({ y0: yDeck + b.y, y1: yDeck + b.y, b: 0, kind: "bar", Fy: deck.fy, area: b.A, yc: yDeck + b.y });
  // Force in a part above (compression side for positive) or below the axis at y.
  const split = (q: Part, y: number) => {
    if (q.kind === "bar") {
      const F = q.area! * q.Fy;
      return q.yc! >= y ? { above: F, below: 0, mAbove: F * (q.yc! - y), mBelow: 0 } : { above: 0, below: F, mAbove: 0, mBelow: F * (y - q.yc!) };
    }
    const a0 = Math.max(q.y0, y);
    const a1 = q.y1;
    const b0 = q.y0;
    const b1 = Math.min(q.y1, y);
    const fa = a1 > a0 ? q.b * (a1 - a0) * q.Fy : 0;
    const fb = b1 > b0 ? q.b * (b1 - b0) * q.Fy : 0;
    return { above: fa, below: q.kind === "concrete" ? 0 : fb, mAbove: fa * ((a0 + a1) / 2 - y), mBelow: q.kind === "concrete" ? 0 : fb * (y - (b0 + b1) / 2) };
  };
  // Positive: compression above (concrete only in compression). Negative: compression below.
  const net = (y: number) => {
    let up = 0;
    let down = 0;
    for (const q of parts) {
      const s = split(q, y);
      up += s.above;
      down += s.below;
    }
    return up - down; // decreases as y rises
  };
  let lo = 0;
  let hi = positive ? yDeck + deck.ts : depth;
  for (let k = 0; k < 100; k++) {
    const mid = (lo + hi) / 2;
    if (net(mid) > 0) lo = mid;
    else hi = mid;
  }
  const y = (lo + hi) / 2;
  let Mp = 0;
  for (const q of parts) {
    const s = split(q, y);
    Mp += s.mAbove + s.mBelow;
  }
  const webBottom = p.bottom.t;
  const webTop = p.bottom.t + p.D;
  const Dcp = positive ? Math.max(0, webTop - Math.max(y, webBottom)) : Math.max(0, Math.min(y, webTop) - webBottom);
  return { Mp, y, Dp: positive ? yDeck + deck.ts - y : 0, Dt: yDeck + deck.ts, Dcp };
}

/** The steel's weight (klf). */
export function selfWeight(seg: SteelSegment) {
  const p = plates(seg);
  const A = p.top.b * p.top.t + p.bottom.b * p.bottom.t + p.D * p.tw + p.fillet;
  return (A / 144) * STEEL_UNIT_WEIGHT;
}
