// A calc package's numbers are written for its math regions (1.107\cdot10^{-7}); in plain text and table
// cells that markup would show as typed, so there they're written 1.107×10⁻⁷.

const SUP: Record<string, string> = { "-": "⁻", "0": "⁰", "1": "¹", "2": "²", "3": "³", "4": "⁴", "5": "⁵", "6": "⁶", "7": "⁷", "8": "⁸", "9": "⁹" };

/** The text with every m\cdot10^{e} (or m\cdot 10^{e}) written as m×10ᵉ. */
export function plainNumbers(s: string): string {
  return s.replace(/\\cdot\s?10\^\{(-?\d+)\}/g, (_, e: string) => `×10${[...e].map((c) => SUP[c] ?? c).join("")}`);
}
