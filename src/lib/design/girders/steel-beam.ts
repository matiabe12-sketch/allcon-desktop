import { DesignError } from "../walls/cip";
import { continuousBeam, type NonprismaticSupports } from "./continuous";

// A continuous girder whose stiffness changes along it (a steel girder's flange plates step up over the
// piers), on knife-edge supports: Euler–Bernoulli beam elements, two per foot or finer, each with the
// EI of the section at its middle. From it come each interior support's moment for a unit load anywhere
// (its influence line) and for a unit load on every span, and the deflection at chosen points for a unit
// load anywhere (Maxwell's reciprocity). These feed the continuous-beam envelopes (continuous.ts), so the
// truck, tandem, lane and two-truck loadings are placed exactly as for a prestressed girder line.
// Feet, kips; EI in kip·ft².

/** EI (kip·ft²) at a distance X (ft) from the first bearing. */
export type Stiffness = (X: number) => number;

export function nonprismaticBeam(spans: number[], EI: Stiffness, perSpan = 80, deflectAt: number[] = []) {
  const n = spans.length;
  if (n < 1 || spans.some((L) => !(L > 0))) throw new DesignError("Every span needs a length.");
  // Nodes: equal divisions of every span; the supports are nodes.
  const xs: number[] = [];
  const supportNode: number[] = [0];
  let X0 = 0;
  spans.forEach((L, j) => {
    for (let q = j === 0 ? 0 : 1; q <= perSpan; q++) xs.push(X0 + (L * q) / perSpan);
    X0 += L;
    supportNode.push(xs.length - 1);
  });
  const nn = xs.length;
  const dof = 2 * nn;
  // Banded stiffness (half-bandwidth 3): K[i][j] stored at band[i][j − i + 3].
  const BW = 3;
  const band = Array.from({ length: dof }, () => new Array<number>(2 * BW + 1).fill(0));
  const addK = (i: number, j: number, v: number) => {
    band[i][j - i + BW] += v;
  };
  for (let e = 0; e + 1 < nn; e++) {
    const L = xs[e + 1] - xs[e];
    const k = EI((xs[e] + xs[e + 1]) / 2);
    if (!(k > 0)) throw new DesignError("Every part of the girder needs a stiffness.");
    const c = k / L ** 3;
    const ke = [
      [12, 6 * L, -12, 6 * L],
      [6 * L, 4 * L * L, -6 * L, 2 * L * L],
      [-12, -6 * L, 12, -6 * L],
      [6 * L, 2 * L * L, -6 * L, 4 * L * L],
    ];
    const d = [2 * e, 2 * e + 1, 2 * e + 2, 2 * e + 3];
    for (let a = 0; a < 4; a++) for (let b = 0; b < 4; b++) addK(d[a], d[b], c * ke[a][b]);
  }
  // Supports: vertical displacement held, by a stiff spring (the stiffness's scale times a large factor).
  const big = 1e10 * Math.max(...band.map((r) => Math.abs(r[BW])));
  for (const s of supportNode) addK(2 * s, 2 * s, big);
  // LU of the band (no pivoting: symmetric positive definite).
  for (let k = 0; k < dof; k++) {
    const piv = band[k][BW];
    for (let i = k + 1; i <= Math.min(dof - 1, k + BW); i++) {
      const f = band[i][k - i + BW] / piv;
      if (f === 0) continue;
      band[i][k - i + BW] = f; // store L
      for (let j = k + 1; j <= Math.min(dof - 1, k + BW); j++) band[i][j - i + BW] -= f * band[k][j - k + BW];
    }
  }
  const solve = (rhs: number[]) => {
    const y = rhs.slice();
    for (let i = 0; i < dof; i++) for (let k = Math.max(0, i - BW); k < i; k++) y[i] -= band[i][k - i + BW] * y[k];
    for (let i = dof - 1; i >= 0; i--) {
      for (let j = i + 1; j <= Math.min(dof - 1, i + BW); j++) y[i] -= band[i][j - i + BW] * y[j];
      y[i] /= band[i][BW];
    }
    return y;
  };
  /** The sagging moment at node s from the displacements (the element to its right, or left at the last node). */
  const momentAt = (u: number[], s: number) => {
    const e = s < nn - 1 ? s : s - 1;
    const L = xs[e + 1] - xs[e];
    const k = EI((xs[e] + xs[e + 1]) / 2);
    const [v1, t1, v2, t2] = [u[2 * e], u[2 * e + 1], u[2 * e + 2], u[2 * e + 3]];
    // M(ξ) = EI v″, v″ from the Hermite shape functions at the element's left (ξ = 0) or right end (ξ = 1).
    const xi = s === e ? 0 : 1;
    const N1 = (-6 + 12 * xi) / L ** 2;
    const N2 = (-4 + 6 * xi) / L;
    const N3 = (6 - 12 * xi) / L ** 2;
    const N4 = (-2 + 6 * xi) / L;
    return k * (N1 * v1 + N2 * t1 + N3 * v2 + N4 * t2);
  };
  // Unit loads (downward, 1 kip) at every node: each interior support's moment and the deflections asked for.
  const interior = supportNode.slice(1, -1);
  const il: number[][] = interior.map(() => new Array<number>(nn).fill(0)); // [support][node]
  const dn = deflectAt.map((x) => xs.reduce((b, v, i) => (Math.abs(v - x) < Math.abs(xs[b] - x) ? i : b), 0));
  const dIL: number[][] = deflectAt.map(() => new Array<number>(nn).fill(0)); // [point][node], ft per kip (down +)
  for (let p = 0; p < nn; p++) {
    if (supportNode.includes(p)) continue; // a load on a support makes no moment or deflection
    const rhs = new Array<number>(dof).fill(0);
    rhs[2 * p] = -1;
    const u = solve(rhs);
    interior.forEach((s, r) => (il[r][p] = momentAt(u, s)));
    dn.forEach((q, r) => (dIL[r][p] = -u[2 * q]));
  }
  // The unit uniform load on every span: each support's influence line integrated over the girder (exact
  // for the piecewise-cubic lines between nodes to the order of the mesh).
  const uniformSupports = new Array<number>(n + 1).fill(0);
  interior.forEach((_, r) => {
    let sum = 0;
    for (let e = 0; e + 1 < nn; e++) sum += ((il[r][e] + il[r][e + 1]) / 2) * (xs[e + 1] - xs[e]);
    uniformSupports[r + 1] = sum;
  });
  /** Linear interpolation of a node table at X. */
  const at = (row: number[], X: number) => {
    if (X <= 0 || X >= xs[nn - 1]) return 0;
    let lo = 0;
    let hi = nn - 1;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (xs[mid] <= X) lo = mid;
      else hi = mid;
    }
    const f = (X - xs[lo]) / (xs[hi] - xs[lo]);
    return row[lo] * (1 - f) + row[hi] * f;
  };
  const supports: NonprismaticSupports = { supportIL: (k, X) => at(il[k - 1], X), uniformSupports };
  return { spans, xs, supports, deflectionIL: (r: number, X: number) => at(dIL[r], X), beam: continuousBeam(spans, supports) };
}

export type NonprismaticBeam = ReturnType<typeof nonprismaticBeam>;
