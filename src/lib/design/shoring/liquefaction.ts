// Liquefaction triggering by the SPT-based simplified procedure of Idriss and Boulanger (2008), the empirical method
// AASHTO C10.5.4.2 refers to: CSR = 0.65·(σv/σ′v)·amax·rd; CRR for M 7.5 and 1 atm from (N1)60cs, scaled by MSF and
// Kσ; FS = CRR·MSF·Kσ / CSR. Units: ksf, ft (rd's depth in m).

const PA = 2.116; // ksf, 1 atm

export function triggering(o: { z: number; sv: number; svEff: number; N60: number; fines: number; amax: number; M: number }) {
  const zm = o.z * 0.3048;
  // Fines: Δ(N1)60 = exp(1.63 + 9.7/(FC+0.01) − (15.7/(FC+0.01))²).
  const dN = Math.exp(1.63 + 9.7 / (o.fines + 0.01) - (15.7 / (o.fines + 0.01)) ** 2);
  // CN by iteration: CN = (Pa/σ′v)^m ≤ 1.7, m = 0.784 − 0.0768·√(N1)60cs.
  let N1 = o.N60;
  let N1cs = N1 + dN;
  for (let k = 0; k < 20; k++) {
    const m = 0.784 - 0.0768 * Math.sqrt(Math.min(46, Math.max(0, N1cs)));
    const CN = Math.min(1.7, (PA / Math.max(1e-6, o.svEff)) ** m);
    N1 = CN * o.N60;
    N1cs = N1 + dN;
  }
  const n = Math.min(N1cs, 37.5);
  const CRR = Math.exp(n / 14.1 + (n / 126) ** 2 - (n / 23.6) ** 3 + (n / 25.4) ** 4 - 2.8);
  const alpha = -1.012 - 1.126 * Math.sin(zm / 11.73 + 5.133);
  const beta = 0.106 + 0.118 * Math.sin(zm / 11.28 + 5.142);
  const rd = Math.exp(alpha + beta * o.M);
  const MSF = Math.min(1.8, 6.9 * Math.exp(-o.M / 4) - 0.058);
  const Cs = Math.min(0.3, 1 / (18.9 - 2.55 * Math.sqrt(Math.min(37, N1cs))));
  const Ks = Math.min(1.1, 1 - Cs * Math.log(o.svEff / PA));
  const CSR = 0.65 * (o.sv / o.svEff) * o.amax * rd;
  const FS = N1cs >= 37.5 ? Infinity : (CRR * MSF * Ks) / CSR;
  return { N1, N1cs, CRR, rd, MSF, Ks, CSR, FS };
}
