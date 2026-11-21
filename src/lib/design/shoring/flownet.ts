// Steady seepage under a sheet pile wall through layered, anisotropic soil: a finite-difference flow net. Laplace's
// equation ∂/∂x(kh ∂h/∂x) + ∂/∂y(kv ∂h/∂y) = 0 on a grid round the wall, each layer with its own kh and kv (harmonic
// means between cells), solved by successive over-relaxation. Boundaries: the water table behind at a constant head, the
// excavation's surface in front at a constant head (water at the excavation's level), the wall an impervious cut from
// the top to its toe, an impervious base and no flow through the far sides. From it: the pore pressure on each face of
// the wall, and the exit gradient at the excavation next to the wall (Harr, Groundwater and Seepage; USACE EM
// 1110-2-1901, numerical seepage analysis). x behind the wall positive, depth z down from the top, feet; head in feet
// above the wall's toe... measured as elevation y = −z plus pressure head.

export type PermLayer = { thickness: number; k: number; kRatio: number }; // ft, ft/day horizontal, kh/kv

export type FlowNetInputs = {
  H: number; // excavation depth (ft)
  toe: number; // depth of the wall's toe (ft)
  water: number; // depth of the water table behind (ft)
  base: number; // depth of the impervious base (ft)
  layers: PermLayer[]; // from the top down; the last continues
};

export type FlowNet = {
  dx: number;
  xs: number[]; // ft
  zs: number[]; // ft
  head: number[][]; // [row][col], total head as elevation (ft, the top of the wall 0, up positive)
  uBack: (z: number) => number; // ksf, on the wall's back face
  uFront: (z: number) => number; // ksf, on the front face
  exitGradient: number; // upward, at the excavation within D/2 of the wall
  flow: number; // ft³/day per ft of wall (with k in ft/day)
  iterations: number;
};

const GW = 0.0624;
const cache = new Map<string, FlowNet>();

export function flowNet(o: FlowNetInputs): FlowNet {
  const key = JSON.stringify(o);
  const hit = cache.get(key);
  if (hit) return hit;
  const D = o.toe - o.H;
  const depth = Math.max(o.base, o.toe + 1);
  const width = Math.max(2 * o.toe, 30);
  const dx = Math.max(0.5, Math.min(2, (o.toe + width) / 60));
  const nx = Math.round((2 * width) / dx) + 1;
  const nz = Math.round(depth / dx) + 1;
  const xs = Array.from({ length: nx }, (_, c) => -width + c * dx);
  const zs = Array.from({ length: nz }, (_, r) => r * dx);
  const xWall = Math.round(width / dx); // the column just behind the wall; the wall lies between xWall−1 and xWall
  const layerAt = (z: number) => {
    let acc = 0;
    for (let k = 0; k < o.layers.length; k++) {
      const l = o.layers[k];
      if (k === o.layers.length - 1 || z < acc + l.thickness) return l;
      acc += l.thickness;
    }
    return o.layers[o.layers.length - 1];
  };
  const kh = zs.map((z) => Math.max(1e-9, layerAt(z).k));
  const kv = zs.map((z) => Math.max(1e-9, layerAt(z).k / Math.max(1e-6, layerAt(z).kRatio)));
  // The cells in the flow domain: behind, below the water table; in front, below the excavation.
  // The boundary rows on the grid lines nearest the water table and the excavation.
  const rW = Math.round(o.water / dx);
  const rH = Math.round(o.H / dx);
  const inside = (r: number, c: number) => (c >= xWall ? r >= rW : r >= rH);
  const fixed = (r: number, c: number): number | null => {
    if (c >= xWall && r === rW) return -o.water; // the water table: pressure 0, elevation −zw
    if (c < xWall && r === rH) return -o.H; // the excavation, water at its level
    return null;
  };
  const head: number[][] = zs.map((_, r) => xs.map((__, c) => fixed(r, c) ?? (c >= xWall ? -o.water : -o.H)));
  // Initial guess: a linear drop along the path.
  const rToe = Math.round(o.toe / dx);
  const blocked = (r: number, cA: number, cB: number) => Math.min(cA, cB) === xWall - 1 && Math.max(cA, cB) === xWall && r <= rToe;
  const harm = (a: number, b: number) => (2 * a * b) / (a + b);
  const omega = 1.85;
  let it = 0;
  for (; it < 6000; it++) {
    let change = 0;
    for (let r = 0; r < nz; r++) {
      for (let c = 0; c < nx; c++) {
        if (!inside(r, c) || fixed(r, c) !== null) continue;
        let num = 0;
        let den = 0;
        const nb = (rr: number, cc: number, k: number) => {
          num += k * head[rr][cc];
          den += k;
        };
        if (c > 0 && inside(r, c - 1) && !blocked(r, c, c - 1)) nb(r, c - 1, kh[r]);
        if (c < nx - 1 && inside(r, c + 1) && !blocked(r, c, c + 1)) nb(r, c + 1, kh[r]);
        if (r > 0 && inside(r - 1, c)) nb(r - 1, c, harm(kv[r], kv[r - 1]));
        if (r < nz - 1 && inside(r + 1, c)) nb(r + 1, c, harm(kv[r], kv[r + 1]));
        if (den === 0) continue;
        const next = head[r][c] + omega * (num / den - head[r][c]);
        change = Math.max(change, Math.abs(next - head[r][c]));
        head[r][c] = next;
      }
    }
    if (change < 1e-6) break;
  }
  const interp = (col: number, z: number) => {
    const f = Math.min(nz - 1, Math.max(0, z / dx));
    const r0 = Math.floor(f);
    const r1 = Math.min(nz - 1, r0 + 1);
    const t = f - r0;
    return head[r0][col] * (1 - t) + head[r1][col] * t;
  };
  // Pore pressure u = γw·(h − y), y = −z.
  const uBack = (z: number) => (z < o.water ? 0 : GW * Math.max(0, interp(xWall, z) + z));
  const uFront = (z: number) => (z < o.H ? 0 : GW * Math.max(0, interp(xWall - 1, z) + z));
  // The exit gradient: the head drop over the first cell below the excavation, the largest within D/2 of the wall.
  const r1 = Math.min(nz - 1, rH + 1);
  let exitGradient = 0;
  for (let c = xWall - 1; c >= 0 && xs[c] >= -Math.max(dx, D / 2); c--) exitGradient = Math.max(exitGradient, (head[r1][c] - -o.H) / dx);
  // The flow: across the column just behind the wall, below the toe.
  let flow = 0;
  for (let r = 0; r < nz; r++) if (zs[r] > o.toe && inside(r, xWall) && inside(r, xWall - 1)) flow += kh[r] * ((head[r][xWall] - head[r][xWall - 1]) / dx) * dx;
  const out: FlowNet = { dx, xs, zs, head, uBack, uFront, exitGradient, flow, iterations: it };
  if (cache.size > 8) cache.clear();
  cache.set(key, out);
  return out;
}
