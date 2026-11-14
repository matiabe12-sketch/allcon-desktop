import { bar } from "../stm/aashto";
import { development } from "../stm/anchorage";
import { barPositions } from "./column-section";
import type { ColumnInputs } from "./column";

// A column on a drilled shaft: how their bars connect, as CDOT details it (BDM 10.6.1.1, Figure 11-13).
// - Oversized shaft (the column's cage inside the shaft's): the column's bars run down into the shaft with a
//   noncontact lap splice of 1.7 ℓd + S, S the distance between the two cages.
// - Slightly oversized (the cages aligned, the cover adjusted): the column's bars lap the shaft's with a tension
//   (Class B) lap, AASHTO 5.10.8.4.3a.
// - Undersized shaft (CDOT allows a shaft smaller than its column, BDM 10.6.1.1: no separate dowels): the shaft's
//   bars run up into the column with the noncontact lap, 1.7 ℓd + S.
// AASHTO 5.10.8.4.2a: where the spliced bars are farther apart transversely than the greater of one-fifth of the
// lap and 6 in, the transverse reinforcement around the splice zone (the outer element's: the shaft's spiral, or
// for an undersized shaft the column's ties) is spaced no more than s_max = 2π·A_tr·f_ytr·ℓs / (k·Aℓ·f_uℓ)
// (Eq. 5.10.8.4.2a-1), k = 0.5 (C5.10.8.4.2a), f_uℓ 90 ksi (A615), ℓs the spliced bars' Class B tension lap.
// Inches and kips.

export type ColumnCage = Pick<ColumnInputs, "shape" | "T" | "W" | "cover" | "bar" | "bars" | "barsT" | "barsL" | "barsEnd" | "tieBar" | "tieSpacing" | "transverse" | "fc" | "fy">;
export type ShaftCage = { D: number; cover: number; bar: number; bars: number; tieBar: number; pitch: number; fc: number; fy: number };

const ALIGNED = 1.0; // in: cages within this of each other radially are aligned (a contact or near-contact lap)
const K = 0.5;
const FUL = 90; // ksi, A615

/** The shaft's bars' places (in, about its centre), the first on the +x axis as the shaft's cage is drawn. */
export function shaftBarPositions(s: ShaftCage): [number, number][] {
  const R = s.D / 2 - s.cover - bar(s.tieBar).db - bar(s.bar).db / 2;
  const n = Math.max(1, Math.round(s.bars));
  return Array.from({ length: n }, (_, k) => [R * Math.cos((2 * Math.PI * k) / n), R * Math.sin((2 * Math.PI * k) / n)]);
}

export type Connection = {
  kind: "oversized" | "aligned" | "undersized";
  /** Whose bars run into the other: the column's down into the shaft, or the shaft's up into the column. */
  projecting: "column" | "shaft";
  S: number; // in, the largest distance from a projecting bar to the nearest bar it laps
  ld: number; // in, the projecting bar's tension development length
  lap: number; // in, the length it runs into the other
  limit: number; // in, the greater of lap/5 and 6 in (beyond it the transverse reinforcement is checked)
  /** The splice zone's transverse reinforcement (Eq. 5.10.8.4.2a-1), when the bars are farther apart than the limit. */
  transverse: { what: string; s: number; sMax: number } | null;
  text: string;
};

export function columnShaftConnection(col: ColumnCage, sh: ShaftCage): Connection {
  const W = col.shape === "round" ? col.T : col.W;
  const cBars = barPositions({ shape: col.shape, T: col.T, W, cover: col.cover, bar: col.bar, bars: col.bars, barsT: col.barsT, barsL: col.barsL, barsEnd: col.barsEnd, tieBar: col.tieBar, transverse: col.transverse, fc: col.fc, fy: col.fy });
  const sBars = shaftBarPositions(sh);
  const Rs = Math.hypot(...sBars[0]);
  const rc = cBars.map(([x, y]) => Math.hypot(x, y));
  const fitsInside = Math.max(...rc) + (bar(col.bar).db + bar(sh.bar).db) / 2 <= Rs + 1e-9;
  const aligned = col.shape === "round" && Math.abs(Math.max(...rc) - Rs) <= ALIGNED;
  const kind: Connection["kind"] = aligned ? "aligned" : fitsInside ? "oversized" : "undersized";
  const projecting = kind === "undersized" ? "shaft" : "column";
  const nearest = (p: [number, number], to: [number, number][]) => Math.min(...to.map((q) => Math.hypot(p[0] - q[0], p[1] - q[1])));
  const [from, to] = projecting === "column" ? [cBars, sBars] : [sBars, cBars];
  const S = Math.max(...from.map((p) => nearest(p, to)));
  const size = projecting === "column" ? col.bar : sh.bar;
  const db = bar(size).db;
  const gap = Math.min(...from.flatMap((p, k) => from.filter((_, j) => j !== k).map((q) => Math.hypot(p[0] - q[0], p[1] - q[1]))));
  const cover = projecting === "column" ? col.cover + bar(col.tieBar).db : sh.cover + bar(sh.tieBar).db;
  const ld = development({ barSize: size, fy: projecting === "column" ? col.fy : sh.fy, fc: Math.min(col.fc, sh.fc), clearCover: cover, clearSpacing: Math.max(0.5, gap - db), horizontal: false, concreteBelow: 0, coating: "epoxy", kind: "straight" }).required;
  const classB = Math.max(12, 1.3 * ld);
  const lap = kind === "aligned" ? classB : 1.7 * ld + S;
  const limit = Math.max(lap / 5, 6);
  let transverse: Connection["transverse"] = null;
  if (kind !== "aligned" && S > limit) {
    // The outer element's transverse bars around the splice: the shaft's spiral, or the column's ties.
    const outer = projecting === "column" ? { size: sh.tieBar, s: sh.pitch, fy: sh.fy, what: `the shaft's #${sh.tieBar} spiral` } : { size: col.tieBar, s: col.tieSpacing, fy: col.fy, what: `the column's #${col.tieBar} ${col.transverse === "spiral" ? "spiral" : "ties"}` };
    const Al = from.length * bar(size).area;
    const sMax = (2 * Math.PI * bar(outer.size).area * outer.fy * classB) / (K * Al * FUL);
    transverse = { what: outer.what, s: outer.s, sMax };
  }
  const f1 = (v: number) => v.toFixed(1);
  const text =
    kind === "aligned"
      ? `The column's bars lap the shaft's, the cages aligned: a Class B tension lap of ${f1(lap)} in (CDOT BDM Figure 11-13, AASHTO 5.10.8.4.3a).`
      : kind === "oversized"
        ? `The column's cage sits inside the shaft's: its bars run ${f1(lap)} in down into the shaft, a noncontact lap of 1.7·ℓd + S = 1.7 × ${f1(ld)} + ${f1(S)} in (CDOT BDM Figure 11-13).`
        : `The shaft is smaller than the column (CDOT BDM 10.6.1.1): the shaft's bars run ${f1(lap)} in up into the column, a noncontact lap of 1.7·ℓd + S = 1.7 × ${f1(ld)} + ${f1(S)} in (CDOT BDM Figure 11-13); the column's bars start at the top of the shaft.`;
  return { kind, projecting, S, ld, lap, limit, transverse, text };
}

/** A shaft's cage taken as the column's (where no shaft design is linked): the shaft's diameter, 3 in cover (B-503-1), the column's bar and tie size, bars about 6 in apart. */
export function assumedShaft(col: ColumnCage, D: number): ShaftCage {
  const R = D / 2 - 3 - bar(col.tieBar).db - bar(col.bar).db / 2;
  return { D, cover: 3, bar: col.bar, bars: Math.max(8, Math.round((2 * Math.PI * R) / 6)), tieBar: col.tieBar, pitch: 6, fc: col.fc, fy: col.fy };
}
