// The St. Venant torsion constant J of a double-tee unit, solved on its actual shape: the flange and
// two tapered stems, with the junctions between them. J has no closed form for a section like this
// (unlike I, it isn't the sum of its parts: the shear flow runs across the junctions), so the
// Prandtl stress function is solved by finite elements: ∇²φ = −2 in the section, φ = 0 on its edge,
// J = 2∫φ dA. Linear triangles on a mesh that fits the edges exactly, solved by conjugate gradients.

export type DtShape = { bf: number; depth: number; flangeThk: number; stemSpacing: number; stemTop: number; stemBot: number };

/** Divisions of an interval so that no element is longer than h. */
const divs = (len: number, h: number) => Math.max(1, Math.ceil(len / h - 1e-9));

/** J (in⁴) of a double-tee unit; h, the largest element (default: a sixth of the flange). */
export function doubleTeeJ(s: DtShape, h = s.flangeThk / 6): number {
  const tf = s.flangeThk;
  const hs = s.depth - tf;
  const c = s.stemSpacing / 2;
  // A flange narrower than the stems' outer faces (trimmed flush) still covers them.
  const half = Math.max(s.bf / 2, c + s.stemTop / 2);
  const nodes: [number, number][] = [];
  const index = new Map<string, number>();
  const node = (x: number, y: number) => {
    const key = `${Math.round(x * 1e6)},${Math.round(y * 1e6)}`;
    let k = index.get(key);
    if (k === undefined) {
      k = nodes.length;
      nodes.push([x, y]);
      index.set(key, k);
    }
    return k;
  };
  const tris: [number, number, number][] = [];
  /** A quadrilateral region meshed as a structured grid: corners at the bottom (y0) and top (y1). */
  const region = (xb: number[], xt: number[], y0: number, y1: number, ny: number) => {
    // xb, xt: the node x's along the bottom and top edges (same count); rows interpolate between them.
    const nx = xb.length - 1;
    const id = (i: number, j: number) => {
      const t = j / ny;
      return node(xb[i] + (xt[i] - xb[i]) * t, y0 + (y1 - y0) * t);
    };
    for (let j = 0; j < ny; j++)
      for (let i = 0; i < nx; i++) {
        const a = id(i, j), b = id(i + 1, j), cc = id(i + 1, j + 1), d = id(i, j + 1);
        tris.push([a, b, cc], [a, cc, d]);
      }
  };
  // The flange's x nodes: its edges and the stems' top faces, every interval split to h or less.
  const breaks = [-half, -c - s.stemTop / 2, -c + s.stemTop / 2, c - s.stemTop / 2, c + s.stemTop / 2, half];
  const xs: number[] = [breaks[0]];
  for (let k = 1; k < breaks.length; k++) {
    const n = divs(breaks[k] - breaks[k - 1], h);
    for (let i = 1; i <= n; i++) xs.push(breaks[k - 1] + ((breaks[k] - breaks[k - 1]) * i) / n);
  }
  region(xs, xs, hs, s.depth, divs(tf, h));
  // Each stem: the flange's nodes over its top face, mapped down to the bottom face.
  for (const cx of [-c, c]) {
    const top = xs.filter((x) => x >= cx - s.stemTop / 2 - 1e-9 && x <= cx + s.stemTop / 2 + 1e-9);
    const bot = top.map((x) => cx + ((x - cx) * s.stemBot) / s.stemTop);
    region(bot, top, 0, hs, divs(hs, h));
  }

  // Boundary nodes: those on an edge that belongs to one triangle only.
  const edgeCount = new Map<string, number>();
  const ek = (a: number, b: number) => (a < b ? `${a},${b}` : `${b},${a}`);
  for (const [a, b, cc] of tris) for (const [p, q] of [[a, b], [b, cc], [cc, a]]) edgeCount.set(ek(p, q), (edgeCount.get(ek(p, q)) ?? 0) + 1);
  const fixed = new Uint8Array(nodes.length);
  for (const [k, n] of edgeCount) if (n === 1) for (const v of k.split(",")) fixed[+v] = 1;

  // Assembly: stiffness (sparse rows) and load 2∫N dA.
  const N = nodes.length;
  const rows: Map<number, number>[] = Array.from({ length: N }, () => new Map());
  const f = new Float64Array(N);
  for (const t of tris) {
    const [p0, p1, p2] = t.map((k) => nodes[k]);
    const b = [p1[1] - p2[1], p2[1] - p0[1], p0[1] - p1[1]];
    const cv = [p2[0] - p1[0], p0[0] - p2[0], p1[0] - p0[0]];
    const A = Math.abs(cv[2] * b[1] - cv[1] * b[2]) / 2;
    for (let i = 0; i < 3; i++) {
      f[t[i]] += (2 * A) / 3;
      for (let j = 0; j < 3; j++) {
        const kij = (b[i] * b[j] + cv[i] * cv[j]) / (4 * A);
        rows[t[i]].set(t[j], (rows[t[i]].get(t[j]) ?? 0) + kij);
      }
    }
  }
  const free: number[] = [];
  for (let k = 0; k < N; k++) if (!fixed[k]) free.push(k);
  const cols = free.map((k) => [...rows[k]].filter(([j]) => !fixed[j]));
  const pos = new Int32Array(N).fill(-1);
  free.forEach((k, i) => (pos[k] = i));
  const mul = (x: Float64Array) => {
    const y = new Float64Array(free.length);
    for (let i = 0; i < free.length; i++) {
      let s2 = 0;
      for (const [j, v] of cols[i]) s2 += v * x[pos[j]];
      y[i] = s2;
    }
    return y;
  };
  // Conjugate gradients, with the diagonal as preconditioner.
  const diag = free.map((k) => rows[k].get(k)!);
  const rhs = Float64Array.from(free, (k) => f[k]);
  const x = new Float64Array(free.length);
  const r = Float64Array.from(rhs);
  const z = r.map((v, i) => v / diag[i]);
  const p = Float64Array.from(z);
  let rz = r.reduce((a, v, i) => a + v * z[i], 0);
  const tol = 1e-12 * Math.sqrt(rhs.reduce((a, v) => a + v * v, 0));
  for (let it = 0; it < 10 * free.length && Math.sqrt(r.reduce((a, v) => a + v * v, 0)) > tol; it++) {
    const Ap = mul(p);
    const alpha = rz / p.reduce((a, v, i) => a + v * Ap[i], 0);
    for (let i = 0; i < x.length; i++) {
      x[i] += alpha * p[i];
      r[i] -= alpha * Ap[i];
    }
    for (let i = 0; i < z.length; i++) z[i] = r[i] / diag[i];
    const rz2 = r.reduce((a, v, i) => a + v * z[i], 0);
    const beta = rz2 / rz;
    rz = rz2;
    for (let i = 0; i < p.length; i++) p[i] = z[i] + beta * p[i];
  }
  // J = 2∫φ dA = φ·f.
  return x.reduce((a, v, i) => a + v * rhs[i], 0);
}

const memo = new Map<string, number>();
/**
 * J of a double-tee unit, to about 0.1%: solved on two meshes (a sixth and a twelfth of the flange
 * thickness) and extrapolated. The error falls about 3.3 times each time the mesh is halved (the
 * re-entrant corners at the junctions slow it from the 4 of a smooth section); kept per shape.
 */
export function unitJ(s: DtShape): number {
  const key = [s.bf, s.depth, s.flangeThk, s.stemSpacing, s.stemTop, s.stemBot].map((v) => +v.toFixed(6)).join(",");
  let J = memo.get(key);
  if (J === undefined) {
    const J1 = doubleTeeJ(s, s.flangeThk / 6);
    const J2 = doubleTeeJ(s, s.flangeThk / 12);
    J = J2 + (J2 - J1) / 2.3;
    if (memo.size > 200) memo.clear();
    memo.set(key, J);
  }
  return J;
}
