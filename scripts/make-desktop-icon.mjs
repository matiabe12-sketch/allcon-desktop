// Draws the ALLCON app icon (the logo's rounded "a" tile, as in components/brand/logo.tsx) to
// electron/icon.png and electron/icon.ico, for the desktop window and shortcut.
// Run: node scripts/make-desktop-icon.mjs
import { writeFileSync } from "node:fs";
import { createCanvas } from "@napi-rs/canvas";

function draw(size) {
  const c = createCanvas(size, size);
  const ctx = c.getContext("2d");
  const s = size / 32;
  ctx.scale(s, s);
  ctx.fillStyle = "#171717";
  ctx.beginPath();
  ctx.roundRect(0, 0, 32, 32, 8);
  ctx.fill();
  ctx.strokeStyle = "#ffffff";
  ctx.lineWidth = 3.4;
  ctx.beginPath();
  ctx.arc(14.6, 17.4, 5.3, 0, Math.PI * 2);
  ctx.stroke();
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(21.6, 12.2);
  ctx.lineTo(21.6, 22.6);
  ctx.stroke();
  return c.toBuffer("image/png");
}

writeFileSync("electron/icon.png", draw(512));

// ICO with PNG images (Windows Vista and later).
const sizes = [16, 24, 32, 48, 64, 128, 256];
const pngs = sizes.map(draw);
const header = Buffer.alloc(6);
header.writeUInt16LE(0, 0);
header.writeUInt16LE(1, 2);
header.writeUInt16LE(sizes.length, 4);
const entries = [];
let offset = 6 + 16 * sizes.length;
sizes.forEach((size, i) => {
  const e = Buffer.alloc(16);
  e.writeUInt8(size >= 256 ? 0 : size, 0);
  e.writeUInt8(size >= 256 ? 0 : size, 1);
  e.writeUInt8(0, 2);
  e.writeUInt8(0, 3);
  e.writeUInt16LE(1, 4);
  e.writeUInt16LE(32, 6);
  e.writeUInt32LE(pngs[i].length, 8);
  e.writeUInt32LE(offset, 12);
  offset += pngs[i].length;
  entries.push(e);
});
writeFileSync("electron/icon.ico", Buffer.concat([header, ...entries, ...pngs]));
console.log("Wrote electron/icon.png and electron/icon.ico");
