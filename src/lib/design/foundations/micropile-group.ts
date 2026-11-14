// A group of micropiles (or any piles) under a rigid cap: each pile's axial force from the cap's vertical load
// and its moments by the elastic method, P/n ± M·c/Σc² about each axis (FHWA GEC 12 9.8, as CDOT's micropile
// group calcs do), along a battered pile's axis by 1/cos of its batter. Feet, kips.

export type GroupPile = { x: number; y: number; batter: number }; // ft from the group's centroid; deg from vertical

/**
 * A rectangular grid of piles about its centre: `nX` along x at `sX`, `nY` along y at `sY`; `perimeter` keeps only
 * the piles on its edges (a ring under a footing); `batterByRow` (deg) gives each row along y (index by y) a batter.
 */
export function gridPiles(nX: number, nY: number, sX: number, sY: number, o: { perimeter?: boolean; batterByRow?: number[] } = {}): GroupPile[] {
  const out: GroupPile[] = [];
  for (let b = 0; b < nY; b++)
    for (let a = 0; a < nX; a++) {
      if (o.perimeter && a > 0 && a < nX - 1 && b > 0 && b < nY - 1) continue;
      out.push({ x: -((nX - 1) * sX) / 2 + a * sX, y: -((nY - 1) * sY) / 2 + b * sY, batter: o.batterByRow?.[b] ?? 0 });
    }
  return out;
}

/** The group's centroid and Σx², Σy² about it. */
export function groupProps(piles: GroupPile[]) {
  const n = piles.length;
  const xc = piles.reduce((t, p) => t + p.x, 0) / n;
  const yc = piles.reduce((t, p) => t + p.y, 0) / n;
  return { n, xc, yc, Sx2: piles.reduce((t, p) => t + (p.x - xc) ** 2, 0), Sy2: piles.reduce((t, p) => t + (p.y - yc) ** 2, 0) };
}

/**
 * Each pile's axial force (kip, + compression) from the vertical load P and the moments Mx (about the x axis: it
 * varies with y) and My (about the y axis: with x), along its axis.
 */
export function groupForces(piles: GroupPile[], P: number, Mx: number, My: number): number[] {
  const g = groupProps(piles);
  return piles.map((p) => (P / g.n + (g.Sy2 > 0 ? (Mx * (p.y - g.yc)) / g.Sy2 : 0) + (g.Sx2 > 0 ? (My * (p.x - g.xc)) / g.Sx2 : 0)) / Math.cos((p.batter * Math.PI) / 180));
}
