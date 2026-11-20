// A plane grid of an I-girder bridge (AASHTO 4.6.3.3, refined analysis): every girder as a line of beam
// elements bending and twisting (the torsion constant raised for warping restrained at the cross-frames, from
// Vlasov's theory), every cross-frame's truss condensed onto its two girders' deflection and twist, and in the
// composite stages the deck as transverse strips between the girders. Straight or horizontally curved (girders
// concentric about the bridge's centerline), supports normal or skewed (along the skew, cross-frames there on the
// bearing line), intermediate cross-frames normal to the girders. Three degrees of freedom per node: vertical
// deflection w (in, up +) and the rotations about the global X and Y axes; banded Cholesky. Live load by adjoint
// influence surfaces: HL-93 lanes placed across the roadway and along it for the extreme effect (3.6.1.3.1), with
// the multiple presence factors (3.6.1.1.2); the fatigue truck alone (3.6.1.4.3a). Loads are carried from the
// deck to the girders by the lever rule. Feet and kips outside, inches inside.

export type GridStage = "steel" | "3n" | "n";

export type GridInput = {
  spans: number[]; // ft, along the bridge's centerline
  nGirders: number;
  S: number; // ft, girder spacing (radial on a curved bridge)
  overhang: number; // ft, exterior girder to the deck's edge
  barrierWidth: number; // ft
  radius: number; // ft, the centerline's; 0: straight
  skew: number; // degrees, the supports from normal (radial)
  braces: number[]; // ft, the intermediate cross-frame lines along the centerline
  extraStations: number[]; // ft, stations to include (section changes)
  section: (X: number, stage: GridStage, j: number) => { I: number; J: number; Cw: number }; // in⁴, in⁴, in⁶ of girder j at X (along the centerline)
  cf: { type: "X" | "K"; Ad: number; As: number; hb: number }; // in², effective areas of a diagonal and a strut; in, between the struts
  deck: { ts: number; Ec: number }; // in, ksi
  E: number; // ksi, steel
  G: number; // ksi, steel
  perSpan?: number; // girder elements per span (default 20)
};

type Frame = { a: number; b: number; Xa: number; Xb: number; bay: number; support: boolean };

const ft = 12;

/** The bridge's geometry and its nodes: stations along the centerline, the girders' offsets, the nodes where each girder exists. */
export function gridGeometry(g: GridInput) {
  const total = g.spans.reduce((s, L) => s + L, 0);
  const supports = g.spans.reduce((s, L) => [...s, s[s.length - 1] + L], [0]);
  const ys = Array.from({ length: g.nGirders }, (_, j) => (j - (g.nGirders - 1) / 2) * g.S);
  const tanSkew = Math.tan((g.skew * Math.PI) / 180);
  /** A support's station on girder j (along the centerline). */
  const supportAt = (s: number, j: number) => supports[s] + ys[j] * tanSkew;
  const pts = new Set<number>();
  const add = (x: number) => pts.add(Math.round(x * 1e6) / 1e6);
  const per = g.perSpan ?? 20;
  g.spans.forEach((L, s) => {
    for (let q = 0; q <= per; q++) add(supports[s] + (L * q) / per);
  });
  for (let j = 0; j < g.nGirders; j++) for (let s = 0; s < supports.length; s++) add(supportAt(s, j));
  for (const b of g.braces) if (b > 1e-6 && b < total - 1e-6) add(b);
  for (const x of g.extraStations) if (x > 1e-6 && x < total - 1e-6) add(x);
  const stations = [...pts].sort((a, b) => a - b);
  // Nodes station by station (a narrow band).
  const nodeOf: number[][] = ys.map(() => new Array<number>(stations.length).fill(-1));
  const nodes: { j: number; k: number; X: number }[] = [];
  stations.forEach((X, k) => {
    ys.forEach((_, j) => {
      if (X >= supportAt(0, j) - 1e-6 && X <= supportAt(supports.length - 1, j) + 1e-6) {
        nodeOf[j][k] = nodes.length;
        nodes.push({ j, k, X });
      }
    });
  });
  const kOf = (X: number) => stations.findIndex((x) => Math.abs(x - X) < 1e-5);
  /** Plan position (ft): straight (X, y); curved about a center at (0, −R). */
  const pos = (X: number, y: number): [number, number] => {
    if (!(g.radius > 0)) return [X, y];
    const th = X / g.radius;
    const r = g.radius + y;
    return [r * Math.sin(th), r * Math.cos(th) - g.radius];
  };
  // Cross-frames: on the bearing lines at the supports, and at each intermediate line between girders that both reach it.
  const frames: Frame[] = [];
  for (let j = 0; j + 1 < g.nGirders; j++) {
    for (let s = 0; s < supports.length; s++) {
      const a = nodeOf[j][kOf(supportAt(s, j))];
      const b = nodeOf[j + 1][kOf(supportAt(s, j + 1))];
      if (a >= 0 && b >= 0) frames.push({ a, b, Xa: supportAt(s, j), Xb: supportAt(s, j + 1), bay: j, support: true });
    }
    for (const X of g.braces) {
      const k = kOf(X);
      if (k < 0) continue;
      const a = nodeOf[j][k];
      const b = nodeOf[j + 1][k];
      // Not where a support cross-frame already is (no skew: the same line).
      if (a >= 0 && b >= 0 && !frames.some((f) => f.a === a && f.b === b)) frames.push({ a, b, Xa: X, Xb: X, bay: j, support: false });
    }
  }
  const supportNodes = ys.flatMap((_, j) => supports.map((_, s) => nodeOf[j][kOf(supportAt(s, j))]).filter((n) => n >= 0));
  return { total, supports, ys, stations, nodes, nodeOf, frames, pos, supportAt, supportNodes, tanSkew };
}

export type GridGeometry = ReturnType<typeof gridGeometry>;

// --- banded symmetric matrix and its Cholesky factor ---

class Band {
  a: Float64Array;
  constructor(
    public n: number,
    public bw: number,
  ) {
    this.a = new Float64Array(n * (bw + 1));
  }
  add(i: number, j: number, v: number) {
    if (i < j) [i, j] = [j, i];
    const d = i - j;
    if (d > this.bw) throw new Error("outside the band");
    this.a[i * (this.bw + 1) + d] += v;
  }
  get(i: number, j: number) {
    if (i < j) [i, j] = [j, i];
    const d = i - j;
    return d > this.bw ? 0 : this.a[i * (this.bw + 1) + d];
  }
  /** Fix a degree of freedom at zero: its row and column cleared, a unit diagonal. */
  fix(i: number) {
    for (let j = Math.max(0, i - this.bw); j <= Math.min(this.n - 1, i + this.bw); j++) {
      if (j === i) continue;
      const [p, q] = i > j ? [i, j] : [j, i];
      this.a[p * (this.bw + 1) + (p - q)] = 0;
    }
    this.a[i * (this.bw + 1)] = 1;
  }
  /** In place: L with A = L Lᵀ. */
  factor() {
    const { n, bw, a } = this;
    const w = bw + 1;
    for (let i = 0; i < n; i++) {
      for (let j = Math.max(0, i - bw); j <= i; j++) {
        let s = a[i * w + (i - j)];
        const k0 = Math.max(0, i - bw, j - bw);
        for (let k = k0; k < j; k++) s -= a[i * w + (i - k)] * a[j * w + (j - k)];
        if (i === j) {
          if (!(s > 0)) throw new Error("The grid is unstable (a girder or cross-frame isn't supported).");
          a[i * w] = Math.sqrt(s);
        } else a[i * w + (i - j)] = s / a[j * w];
      }
    }
  }
  solve(b: Float64Array) {
    const { n, bw, a } = this;
    const w = bw + 1;
    const x = Float64Array.from(b);
    for (let i = 0; i < n; i++) {
      let s = x[i];
      for (let k = Math.max(0, i - bw); k < i; k++) s -= a[i * w + (i - k)] * x[k];
      x[i] = s / a[i * w];
    }
    for (let i = n - 1; i >= 0; i--) {
      let s = x[i];
      for (let k = i + 1; k <= Math.min(n - 1, i + bw); k++) s -= a[k * w + (k - i)] * x[k];
      x[i] = s / a[i * w];
    }
    return x;
  }
}

// --- elements ---

/** The beam's bending in [w1, φ1, w2, φ2], φ = dw/dx (in, kip). */
function beamK(EI: number, L: number) {
  const a = EI / L ** 3;
  return [
    [12 * a, 6 * L * a, -12 * a, 6 * L * a],
    [6 * L * a, 4 * L * L * a, -6 * L * a, 2 * L * L * a],
    [-12 * a, -6 * L * a, 12 * a, -6 * L * a],
    [6 * L * a, 2 * L * L * a, -6 * L * a, 4 * L * L * a],
  ];
}

/** A cross-frame's truss (transverse plane: η across from girder a, ζ up from mid-height), condensed to [wa, φa, wb, φb]: φ the twist about t = n × z. */
function frameK(type: "X" | "K", S: number, hb: number, Ad: number, As: number, E: number) {
  const h = hb / 2;
  // Corner nodes 0: top-a, 1: bottom-a, 2: top-b, 3: bottom-b; K: 4, the bottom strut's middle.
  const xy: [number, number][] = [
    [0, h],
    [0, -h],
    [S, h],
    [S, -h],
  ];
  const members: [number, number, number][] = [[0, 2, As]];
  if (type === "X") members.push([1, 3, As], [0, 3, Ad], [1, 2, Ad]);
  else {
    xy.push([S / 2, -h]);
    members.push([1, 4, As], [4, 3, As], [0, 4, Ad], [2, 4, Ad]);
  }
  const nn = xy.length;
  const K = Array.from({ length: 2 * nn }, () => new Array<number>(2 * nn).fill(0));
  for (const [p, q, A] of members) {
    const dx = xy[q][0] - xy[p][0];
    const dy = xy[q][1] - xy[p][1];
    const L = Math.hypot(dx, dy);
    const c = dx / L;
    const s = dy / L;
    const k = (E * A) / L;
    const e = [c * c, c * s, s * s];
    const blk = [
      [e[0], e[1]],
      [e[1], e[2]],
    ];
    for (const [r, rs] of [
      [p, 1],
      [q, -1],
    ])
      for (const [cc, cs] of [
        [p, 1],
        [q, -1],
      ])
        for (let u = 0; u < 2; u++) for (let v = 0; v < 2; v++) K[2 * r + u][2 * cc + v] += k * rs * cs * blk[u][v];
  }
  // Corner displacements from the girders: across u = −φ ζ, vertical v = w.
  const T = Array.from({ length: 8 }, () => [0, 0, 0, 0]);
  [0, 1].forEach((n) => {
    T[2 * n][1] = -xy[n][1];
    T[2 * n + 1][0] = 1;
  });
  [2, 3].forEach((n) => {
    T[2 * n][3] = -xy[n][1];
    T[2 * n + 1][2] = 1;
  });
  // Condense the K-frame's middle node.
  let Kb = K.slice(0, 8).map((r) => r.slice(0, 8));
  let back: ((q: number[]) => number[]) | null = null;
  if (nn === 5) {
    const Kii = [
      [K[8][8], K[8][9]],
      [K[9][8], K[9][9]],
    ];
    const det = Kii[0][0] * Kii[1][1] - Kii[0][1] * Kii[1][0];
    const inv = [
      [Kii[1][1] / det, -Kii[0][1] / det],
      [-Kii[1][0] / det, Kii[0][0] / det],
    ];
    const Kbi = K.slice(0, 8).map((r) => [r[8], r[9]]);
    Kb = Kb.map((r, p) => r.map((v, q) => v - (Kbi[p][0] * (inv[0][0] * Kbi[q][0] + inv[0][1] * Kbi[q][1]) + Kbi[p][1] * (inv[1][0] * Kbi[q][0] + inv[1][1] * Kbi[q][1]))));
    back = (d: number[]) => {
      const r0 = Kbi.reduce((s, row, p) => s + row[0] * d[p], 0);
      const r1 = Kbi.reduce((s, row, p) => s + row[1] * d[p], 0);
      return [-(inv[0][0] * r0 + inv[0][1] * r1), -(inv[1][0] * r0 + inv[1][1] * r1)];
    };
  }
  const k4 = [0, 1, 2, 3].map((p) => [0, 1, 2, 3].map((q) => T.reduce((s, row, m) => s + row[p] * Kb[m].reduce((t, v, n) => t + v * T[n][q], 0), 0)));
  /** The members' axial forces (kip, tension +) from [wa, φa, wb, φb]. */
  const forces = (q: number[]) => {
    const d = T.map((row) => row.reduce((s, v, p) => s + v * q[p], 0));
    if (back) d.push(...back(d));
    return members.map(([p, r, A]) => {
      const dx = xy[r][0] - xy[p][0];
      const dy = xy[r][1] - xy[p][1];
      const L = Math.hypot(dx, dy);
      return ((E * A) / L) * (((d[2 * r] - d[2 * p]) * dx + (d[2 * r + 1] - d[2 * p + 1]) * dy) / L);
    });
  };
  const names = type === "X" ? ["top strut", "bottom strut", "diagonal", "diagonal"] : ["top strut", "bottom strut", "bottom strut", "diagonal", "diagonal"];
  return { k4, forces, names };
}

/** The equivalent St. Venant torsion constant of an I-girder whose warping is restrained at its brace points Lb apart (in): T = GJ θ/L [1 − tanh(λL/2) 2/(λL)]⁻¹. */
export function jEquivalent(J: number, Cw: number, Lb: number, E: number, G: number) {
  if (!(Cw > 0) || !(Lb > 0)) return J;
  const lam = Math.sqrt((G * J) / (E * Cw));
  const x = lam * Lb;
  if (x < 1e-6) return J;
  const f = 1 - (2 / x) * Math.tanh(x / 2);
  return f > 1e-9 ? J / f : J * 1e9;
}

// --- one stage's model ---

export type Sparse = { idx: number[]; val: number[] };

export function gridModel(g: GridInput, geo: GridGeometry, stage: GridStage) {
  const { nodes, nodeOf, stations, frames, pos, ys } = geo;
  const N = nodes.length * 3;
  // Element list: [nodeA, nodeB, kind]
  type El = { a: number; b: number; k: number[][]; dofs: number[]; kind: "girder" | "frame" | "deck"; j: number; L: number; EI: number; T: number[][]; frame?: number };
  const els: El[] = [];
  const braceXs = [...new Set([...geo.supports, ...g.braces])].sort((p, q) => p - q);
  const unbracedAt = (X: number) => {
    let lo = 0;
    let hi = geo.total;
    for (const b of braceXs) {
      if (b <= X + 1e-9) lo = b;
      if (b > X + 1e-9) {
        hi = b;
        break;
      }
    }
    return Math.max(1, hi - lo) * ft;
  };
  // Girders.
  ys.forEach((y, j) => {
    let prev = -1;
    stations.forEach((X, k) => {
      const n = nodeOf[j][k];
      if (n < 0) return;
      if (prev >= 0) {
        const A = nodes[prev];
        const [x1, y1] = pos(A.X, y);
        const [x2, y2] = pos(X, y);
        const L = Math.hypot(x2 - x1, y2 - y1) * ft;
        const ex = (x2 - x1) / (L / ft);
        const ey = (y2 - y1) / (L / ft);
        const mid = (A.X + X) / 2;
        const sp = g.section(mid, stage, j);
        const EI = g.E * sp.I;
        const GJ = g.G * jEquivalent(sp.J, sp.Cw, unbracedAt(mid), g.E, g.G);
        const kb = beamK(EI, L);
        // Local [w1, θt1, φ1, w2, θt2, φ2]; θt = r·e, φ = −r·y' with y' = (−ey, ex).
        const kl = Array.from({ length: 6 }, () => new Array<number>(6).fill(0));
        const map = [0, 2, 3, 5];
        for (let p = 0; p < 4; p++) for (let q = 0; q < 4; q++) kl[map[p]][map[q]] = kb[p][q];
        kl[1][1] += GJ / L;
        kl[4][4] += GJ / L;
        kl[1][4] -= GJ / L;
        kl[4][1] -= GJ / L;
        // Global [w, rX, rY] per node → local.
        const Tn = [
          [1, 0, 0],
          [0, ex, ey],
          [0, ey, -ex], // φ = −(r·y') = −(−ey rX + ex rY) = ey rX − ex rY
        ];
        const T = Array.from({ length: 6 }, () => new Array<number>(6).fill(0));
        for (let p = 0; p < 3; p++)
          for (let q = 0; q < 3; q++) {
            T[p][q] = Tn[p][q];
            T[p + 3][q + 3] = Tn[p][q];
          }
        els.push({ a: prev, b: n, k: kl, dofs: [prev * 3, prev * 3 + 1, prev * 3 + 2, n * 3, n * 3 + 1, n * 3 + 2], kind: "girder", j, L, EI, T });
      }
      prev = n;
    });
  });
  // Cross-frames.
  const frameModels = frames.map((f, fi) => {
    const A = nodes[f.a];
    const B = nodes[f.b];
    const [x1, y1] = pos(A.X, ys[A.j]);
    const [x2, y2] = pos(B.X, ys[B.j]);
    const Sft = Math.hypot(x2 - x1, y2 - y1);
    const nx = (x2 - x1) / Sft;
    const ny = (y2 - y1) / Sft;
    const t = [ny, -nx]; // n × z
    const fm = frameK(g.cf.type, Sft * ft, g.cf.hb, g.cf.Ad, g.cf.As, g.E);
    // [wa, φa, wb, φb] from [wa, rXa, rYa, wb, rXb, rYb].
    const T = [
      [1, 0, 0, 0, 0, 0],
      [0, t[0], t[1], 0, 0, 0],
      [0, 0, 0, 1, 0, 0],
      [0, 0, 0, 0, t[0], t[1]],
    ];
    const k6 = Array.from({ length: 6 }, (_, p) => Array.from({ length: 6 }, (_, q) => T.reduce((s, row, m) => s + row[p] * fm.k4[m].reduce((u, v, r) => u + v * T[r][q], 0), 0)));
    const I6 = Array.from({ length: 6 }, (_, p) => Array.from({ length: 6 }, (_, q) => (p === q ? 1 : 0)));
    els.push({ a: f.a, b: f.b, k: k6, dofs: [f.a * 3, f.a * 3 + 1, f.a * 3 + 2, f.b * 3, f.b * 3 + 1, f.b * 3 + 2], kind: "frame", j: f.bay, L: Sft * ft, EI: 0, T: I6, frame: fi });
    return { ...fm, T, fi };
  });
  // Deck strips (composite stages), at every station between neighbouring girders.
  if (stage !== "steel") {
    const Ec = stage === "3n" ? g.deck.Ec / 3 : g.deck.Ec;
    const Gc = Ec / (2 * 1.2);
    stations.forEach((X, k) => {
      const trib = ((k + 1 < stations.length ? stations[k + 1] : X) - (k > 0 ? stations[k - 1] : X)) / 2;
      for (let j = 0; j + 1 < ys.length; j++) {
        const a = nodeOf[j][k];
        const b = nodeOf[j + 1][k];
        if (a < 0 || b < 0) continue;
        const scale = g.radius > 0 ? (g.radius + (ys[j] + ys[j + 1]) / 2) / g.radius : 1;
        const w = trib * scale * ft;
        const [x1, y1] = pos(X, ys[j]);
        const [x2, y2] = pos(X, ys[j + 1]);
        const Sft = Math.hypot(x2 - x1, y2 - y1);
        const nx = (x2 - x1) / Sft;
        const ny = (y2 - y1) / Sft;
        const t = [ny, -nx];
        const L = Sft * ft;
        const kb = beamK((Ec * w * g.deck.ts ** 3) / 12, L);
        const GJ = (Gc * w * g.deck.ts ** 3) / 6;
        // Local [w1, slope1 = r·t, twist1 = r·n, w2, slope2, twist2].
        const kl = Array.from({ length: 6 }, () => new Array<number>(6).fill(0));
        const map = [0, 1, 3, 4];
        for (let p = 0; p < 4; p++) for (let q = 0; q < 4; q++) kl[map[p]][map[q]] = kb[p][q];
        kl[2][2] += GJ / L;
        kl[5][5] += GJ / L;
        kl[2][5] -= GJ / L;
        kl[5][2] -= GJ / L;
        const Tn = [
          [1, 0, 0],
          [0, t[0], t[1]],
          [0, nx, ny],
        ];
        const T = Array.from({ length: 6 }, () => new Array<number>(6).fill(0));
        for (let p = 0; p < 3; p++)
          for (let q = 0; q < 3; q++) {
            T[p][q] = Tn[p][q];
            T[p + 3][q + 3] = Tn[p][q];
          }
        els.push({ a, b, k: kl, dofs: [a * 3, a * 3 + 1, a * 3 + 2, b * 3, b * 3 + 1, b * 3 + 2], kind: "deck", j, L, EI: 0, T });
      }
    });
  }
  // Assemble.
  let bw = 0;
  for (const e of els) bw = Math.max(bw, Math.max(...e.dofs) - Math.min(...e.dofs));
  const K = new Band(N, bw);
  let diag = 0;
  for (const e of els) {
    // kg = Tᵀ k T
    const kg = e.T.map((_, p) => e.T.map((__, q) => e.T.reduce((s, row, m) => s + row[p] * e.k[m].reduce((u, v, r) => u + v * e.T[r][q], 0), 0)));
    for (let p = 0; p < 6; p++) for (let q = 0; q <= p; q++) if (kg[p][q] !== 0 && e.dofs[p] >= e.dofs[q]) K.add(e.dofs[p], e.dofs[q], kg[p][q]);
    for (let p = 0; p < 6; p++) for (let q = p + 1; q < 6; q++) if (kg[p][q] !== 0 && e.dofs[p] > e.dofs[q]) K.add(e.dofs[p], e.dofs[q], kg[p][q]);
    diag = Math.max(diag, ...kg.map((r, p) => Math.abs(r[p])));
  }
  // A whisper of rotational stiffness everywhere (no free mechanisms), the supports' deflection fixed.
  for (let n = 0; n < nodes.length; n++) {
    K.add(n * 3 + 1, n * 3 + 1, diag * 1e-10);
    K.add(n * 3 + 2, n * 3 + 2, diag * 1e-10);
  }
  const fixed = new Set(geo.supportNodes.map((n) => n * 3));
  for (const d of fixed) K.fix(d);
  K.factor();
  const solve = (f: Float64Array) => {
    const b = Float64Array.from(f);
    for (const d of fixed) b[d] = 0;
    return K.solve(b);
  };

  // Responses as sparse rows: R = cᵀ u.
  const girderEls = els.filter((e) => e.kind === "girder");
  /** Girder j's element starting (side +1) or ending (side −1) at station k. */
  const elAt = (j: number, k: number, side: 1 | -1) => {
    const n = nodeOf[j][k];
    return girderEls.find((e) => e.j === j && (side > 0 ? e.a === n : e.b === n));
  };
  /** Internal moment (kip·in, sagging +) or shear (kip) at an element's end, as a sparse row on the global dofs. */
  const endRow = (e: El, end: 0 | 1, what: "M" | "V"): Sparse => {
    const L = e.L;
    const x = end === 0 ? 0 : L;
    // [w1, φ1, w2, φ2] at local indices [0, 2, 3, 5]
    const c4 =
      what === "M"
        ? [-6 / L ** 2 + (12 * x) / L ** 3, -4 / L + (6 * x) / L ** 2, 6 / L ** 2 - (12 * x) / L ** 3, -2 / L + (6 * x) / L ** 2].map((v) => v * e.EI)
        : [12 / L ** 3, 6 / L ** 2, -12 / L ** 3, 6 / L ** 2].map((v) => v * e.EI);
    const local = [c4[0], 0, c4[1], c4[2], 0, c4[3]];
    const idx: number[] = [];
    const val: number[] = [];
    for (let q = 0; q < 6; q++) {
      const v = local.reduce((s, l, p) => s + l * e.T[p][q], 0);
      if (v !== 0) {
        idx.push(e.dofs[q]);
        val.push(v);
      }
    }
    return { idx, val };
  };
  const scaleRow = (r: Sparse, s: number): Sparse => ({ idx: r.idx, val: r.val.map((v) => v * s) });
  const sumRows = (a: Sparse, b: Sparse): Sparse => ({ idx: [...a.idx, ...b.idx], val: [...a.val, ...b.val] });
  /** Girder j's moment at station k (kip·in), the two elements' average where both meet there. */
  const momentRow = (j: number, k: number): Sparse | null => {
    const r = elAt(j, k, 1);
    const l = elAt(j, k, -1);
    if (r && l) return scaleRow(sumRows(endRow(r, 0, "M"), endRow(l, 1, "M")), 0.5);
    if (r) return endRow(r, 0, "M");
    if (l) return endRow(l, 1, "M");
    return null;
  };
  /** Girder j's shear just right of station k (kip; left of the last). */
  const shearRow = (j: number, k: number): Sparse | null => {
    const r = elAt(j, k, 1);
    if (r) return endRow(r, 0, "V");
    const l = elAt(j, k, -1);
    return l ? endRow(l, 1, "V") : null;
  };
  /** A cross-frame member's axial force (kip, tension +) as a sparse row. */
  const memberRow = (fi: number, m: number): Sparse => {
    const fm = frameModels[fi];
    const f = frames[fi];
    const dofs = [f.a * 3, f.a * 3 + 1, f.a * 3 + 2, f.b * 3, f.b * 3 + 1, f.b * 3 + 2];
    const idx: number[] = [];
    const val: number[] = [];
    for (let q = 0; q < 6; q++) {
      // Unit q: the 4 condensed dofs from T, then the member forces.
      const q4 = fm.T.map((row) => row[q]);
      const v = fm.forces(q4)[m];
      if (Math.abs(v) > 0) {
        idx.push(dofs[q]);
        val.push(v);
      }
    }
    return { idx, val };
  };
  const apply = (r: Sparse, u: Float64Array) => r.val.reduce((s, v, p) => s + v * u[r.idx[p]], 0);
  /** Line loads (klf along each girder, down +) as nodal forces (kip, up +), lumped. */
  /** Line loads (klf along each girder, down +) as consistent nodal loads (kip, kip·in; up +), with each element's load kept for its fixed-end forces. */
  const lineLoads = (w: (j: number, X: number) => number) => {
    const f = new Float64Array(N);
    const per = new Map<El, number>();
    for (const e of girderEls) {
      const A = nodes[e.a];
      const B = nodes[e.b];
      const q = w(e.j, (A.X + B.X) / 2) / ft; // kip/in, down
      per.set(e, q);
      const L = e.L;
      // Local [w1, θt1, φ1, w2, θt2, φ2]: −qL/2, 0, −qL²/12, −qL/2, 0, +qL²/12; to the global dofs by Tᵀ.
      const local = [-(q * L) / 2, 0, -(q * L * L) / 12, -(q * L) / 2, 0, (q * L * L) / 12];
      for (let p = 0; p < 6; p++) f[e.dofs[p]] += local.reduce((sum, l, m) => sum + l * e.T[m][p], 0);
    }
    return { f, per };
  };
  /** A girder's dead load moment (kip·ft) or shear (kip) at station k: the element ends' from the displacements and their own load's fixed-end forces. */
  const deadAt = (u: Float64Array, per: Map<El, number>, j: number, k: number, what: "M" | "V") => {
    const end = (e: El, side: 0 | 1) => {
      const q = per.get(e) ?? 0;
      const L = e.L;
      if (what === "M") return apply(endRow(e, side, "M"), u) - (q * L * L) / 12;
      return apply(endRow(e, side, "V"), u) + (side === 0 ? (q * L) / 2 : -(q * L) / 2);
    };
    const r = elAt(j, k, 1);
    const l = elAt(j, k, -1);
    if (what === "M") {
      if (r && l) return (end(r, 0) + end(l, 1)) / 24;
      return r ? end(r, 0) / 12 : l ? end(l, 1) / 12 : 0;
    }
    return r ? end(r, 0) : l ? end(l, 1) : 0;
  };
  const adjoint = (r: Sparse) => {
    const c = new Float64Array(N);
    r.idx.forEach((d, p) => (c[d] += r.val[p]));
    return solve(c);
  };
  return { N, els, frameModels, solve, momentRow, shearRow, memberRow, apply, lineLoads, deadAt, adjoint, nodes };
}

export type GridModel = ReturnType<typeof gridModel>;

// --- the deck's loads to the girders, and the live load's placement ---

/** The lever rule across the deck: a unit load at η (ft from the centerline) on the girders. */
export function leverWeights(ys: number[], eta: number) {
  const n = ys.length;
  const w = new Array<number>(n).fill(0);
  if (n === 1) {
    w[0] = 1;
    return w;
  }
  if (eta <= ys[0]) {
    const S = ys[1] - ys[0];
    w[0] = 1 + (ys[0] - eta) / S;
    w[1] = -(ys[0] - eta) / S;
    return w;
  }
  if (eta >= ys[n - 1]) {
    const S = ys[n - 1] - ys[n - 2];
    w[n - 1] = 1 + (eta - ys[n - 1]) / S;
    w[n - 2] = -(eta - ys[n - 1]) / S;
    return w;
  }
  let j = 0;
  while (j + 2 < n && eta > ys[j + 1]) j++;
  const S = ys[j + 1] - ys[j];
  w[j] = (ys[j + 1] - eta) / S;
  w[j + 1] = (eta - ys[j]) / S;
  return w;
}

/** A uniform load q (per ft of width) from η1 to η2 on the girders (per ft along the bridge). */
export function leverStrip(ys: number[], q: number, eta1: number, eta2: number) {
  const n = 200;
  const h = (eta2 - eta1) / n;
  const out = new Array<number>(ys.length).fill(0);
  for (let p = 0; p < n; p++) leverWeights(ys, eta1 + (p + 0.5) * h).forEach((v, j) => (out[j] += v * q * h));
  return out;
}

export type LiveOptions = {
  IM: number; // dynamic load allowance on the design truck and tandem
  roadway: [number, number]; // ft from the centerline, the barriers' faces
  lanes: number; // design lanes (floor(w / 12))
  negative: boolean; // 90% of two trucks with 90% of the lane (3.6.1.3.1), for negative moment
};

const MPF = [0, 1.2, 1, 0.85, 0.65];
const mpf = (m: number) => MPF[Math.min(m, 4)] ?? 0.65;

/**
 * The live load's extremes for one response, from its influence surface (values at the nodes for a unit downward
 * load): HL-93 (the design truck with 14 or 30 ft rear axles, or the tandem, with the lane, each lane's vehicle placed
 * for the extreme along it; lanes 12 ft wide anywhere across the roadway, the wheels 2 ft from a lane's edge), with the
 * multiple presence factors; and the fatigue truck (30 ft rear axles, 15% IM) alone, its range at one transverse place.
 */
export function liveExtremes(g: GridInput, geo: GridGeometry, infl: Float64Array, o: LiveOptions) {
  const { stations, nodeOf, ys } = geo;
  const nSt = stations.length;
  const x0 = stations[0];
  const x1 = stations[nSt - 1];
  // Each girder line's influence at the stations (0 where it has no node).
  const line = ys.map((_, j) => stations.map((__, k) => (nodeOf[j][k] >= 0 ? infl[nodeOf[j][k]] : 0)));
  // A wheel line at η: the lever rule on the girders' lines.
  const step = 1;
  const etas: number[] = [];
  for (let e = o.roadway[0]; e <= o.roadway[1] + 1e-9; e += step) etas.push(e);
  const wheel = etas.map((e) => {
    const w = leverWeights(ys, e);
    return stations.map((_, k) => w.reduce((s, f, j) => s + f * line[j][k], 0));
  });
  const R = g.radius;
  const scaleAt = (eta: number) => (R > 0 ? R / (R + eta) : 1); // centerline length per length along the wheel's path
  // Integrals of the positive and negative parts along a wheel line (per klf along the path).
  const integ = wheel.map((v, p) => {
    let pos = 0;
    let neg = 0;
    for (let k = 0; k + 1 < nSt; k++) {
      const a = v[k];
      const b = v[k + 1];
      const h = (stations[k + 1] - stations[k]) / scaleAt(etas[p]);
      if (a >= 0 && b >= 0) pos += ((a + b) / 2) * h;
      else if (a <= 0 && b <= 0) neg += ((a + b) / 2) * h;
      else {
        const z = (a / (a - b)) * h;
        if (a > 0) {
          pos += (a * z) / 2;
          neg += (b * (h - z)) / 2;
        } else {
          neg += (a * z) / 2;
          pos += (b * (h - z)) / 2;
        }
      }
    }
    return { pos, neg };
  });
  const at = (v: number[], X: number) => {
    if (X < x0 || X > x1) return 0;
    let lo = 0;
    let hi = nSt - 1;
    while (hi - lo > 1) {
      const m = (lo + hi) >> 1;
      if (stations[m] <= X) lo = m;
      else hi = m;
    }
    const t = stations[hi] > stations[lo] ? (X - stations[lo]) / (stations[hi] - stations[lo]) : 0;
    return v[lo] + (v[hi] - v[lo]) * t;
  };
  const idxOf = (eta: number) => Math.max(0, Math.min(etas.length - 1, Math.round((eta - o.roadway[0]) / step)));
  /** A vehicle (axle loads and offsets along its path, ft) centered at c: its extremes along the bridge, both ways. */
  const vehicle = (c: number, axles: [number, number][]) => {
    const a = wheel[idxOf(c - 3)];
    const b = wheel[idxOf(c + 3)];
    const sc = scaleAt(c);
    const tr = stations.map((_, k) => (a[k] + b[k]) / 2);
    const cands: number[] = [];
    for (const X of stations) for (const [, d] of axles) cands.push(X - d * sc, X + d * sc);
    let max = 0;
    let min = 0;
    const vals: { X: number; v: number }[] = [];
    for (const lead of cands)
      for (const dir of [1, -1]) {
        let v = 0;
        for (const [P, d] of axles) v += P * at(tr, lead + dir * d * sc);
        if (v > max) max = v;
        if (v < min) min = v;
        vals.push({ X: lead, v });
      }
    return { max, min, vals };
  };
  const truck14: [number, number][] = [
    [8, 0],
    [32, 14],
    [32, 28],
  ];
  const truck30: [number, number][] = [
    [8, 0],
    [32, 14],
    [32, 44],
  ];
  const tandem: [number, number][] = [
    [25, 0],
    [25, 4],
  ];
  // Each lane's extreme at its truck's center c: the vehicle with IM and the lane load (10 ft wide, 0.64 klf).
  const cs: number[] = [];
  for (let c = o.roadway[0] + 5; c <= o.roadway[1] - 5 + 1e-9; c += step) cs.push(c);
  const im = 1 + o.IM;
  const perC = cs.map((c) => {
    const t14 = vehicle(c, truck14);
    const t30 = vehicle(c, truck30);
    const td = vehicle(c, tandem);
    let lanePos = 0;
    let laneNeg = 0;
    let cnt = 0;
    for (let e = c - 5; e <= c + 5 + 1e-9; e += step) {
      const p = integ[idxOf(e)];
      lanePos += p.pos;
      laneNeg += p.neg;
      cnt++;
    }
    lanePos = (0.64 * lanePos) / cnt;
    laneNeg = (0.64 * laneNeg) / cnt;
    const pos = Math.max(t14.max, t30.max, td.max) * im + lanePos;
    let neg = Math.min(t14.min, t30.min, td.min) * im + laneNeg;
    if (o.negative) {
      // Two design trucks (14 ft rear axles) at least 50 ft apart, 90% with 90% of the lane.
      const v = t14.vals.slice().sort((p, q) => p.X - q.X);
      let best = 0;
      let run = 0;
      let i2 = 0;
      for (const p of v) {
        while (i2 < v.length && v[i2].X <= p.X - (28 + 50) * scaleAt(c)) {
          run = Math.min(run, v[i2].v);
          i2++;
        }
        best = Math.min(best, p.v + run);
      }
      neg = Math.min(neg, 0.9 * (best * im + laneNeg));
    }
    return { pos, neg, t30 };
  });
  // Lanes across the roadway: a lane from a to a + 12 holds its truck centered from a + 5 to a + 7.
  const lanesOf = (sign: 1 | -1) => {
    const width = o.roadway[1] - o.roadway[0];
    const starts: number[] = [];
    for (let a = o.roadway[0]; a <= o.roadway[1] - 12 + 1e-9; a += step) starts.push(a);
    const laneVal = starts.map((a) => {
      let best = -Infinity;
      cs.forEach((c, p) => {
        if (c >= a + 5 - 1e-9 && c <= a + 7 + 1e-9) best = Math.max(best, sign > 0 ? perC[p].pos : -perC[p].neg);
      });
      return best === -Infinity ? 0 : best;
    });
    let result = 0;
    for (let m = 1; m <= Math.min(o.lanes, Math.floor(width / 12 + 1e-9)); m++) {
      // dp over lanes placed left to right without overlap: f[q][i] best using q lanes with the last starting at i or before.
      const ln = starts.length;
      let prev = new Array<number>(ln).fill(0);
      for (let q = 1; q <= m; q++) {
        const cur = new Array<number>(ln).fill(-Infinity);
        let run = -Infinity;
        for (let i = 0; i < ln; i++) {
          // previous lanes end at or before starts[i]: their start ≤ starts[i] − 12
          const lim = starts[i] - 12 + 1e-9;
          let prevBest = q === 1 ? 0 : -Infinity;
          if (q > 1) for (let p2 = 0; p2 < ln && starts[p2] <= lim; p2++) prevBest = Math.max(prevBest, prev[p2]);
          const v = prevBest + laneVal[i];
          run = Math.max(run, v);
          cur[i] = run;
        }
        prev = cur;
      }
      result = Math.max(result, Math.max(...prev) * mpf(m));
    }
    return sign * result;
  };
  // The fatigue truck: its range at one transverse place.
  let fat = { max: 0, min: 0, range: 0 };
  for (const pc of perC) {
    const v = pc.t30;
    if (v.max - v.min > fat.range) fat = { max: v.max * 1.15, min: v.min * 1.15, range: (v.max - v.min) * 1.15 };
  }
  return { pos: lanesOf(1), neg: lanesOf(-1), fatigue: fat };
}

/** Each girder's moments (kip·ft) and shears (kip) at every station, and each cross-frame member's force (kip), under line loads on one stage. */
export function deadEffects(geo: GridGeometry, model: GridModel, w: (j: number, X: number) => number) {
  const { f, per } = model.lineLoads(w);
  const u = model.solve(f);
  const M = geo.ys.map((_, j) => geo.stations.map((__, k) => model.deadAt(u, per, j, k, "M")));
  const V = geo.ys.map((_, j) => geo.stations.map((__, k) => model.deadAt(u, per, j, k, "V")));
  const frames = model.frameModels.map((fm, fi) => fm.names.map((_, m) => model.apply(model.memberRow(fi, m), u)));
  return { M, V, frames, u };
}
