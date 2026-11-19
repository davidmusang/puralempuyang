// Uji dekoder jsQR terhadap QR tiket (UUID) dalam beberapa kondisi kamera simulasi.
import jsQR from 'jsqr';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const QRCodeImpl = require('qr.js/lib/QRCode');
const ErrorCorrectLevel = require('qr.js/lib/ErrorCorrectLevel');

const code = 'E651EA9D-BEF3-44CC-9B92-4236A63D9031';

const makeMatrix = (text) => {
  const qr = new QRCodeImpl(-1, ErrorCorrectLevel.M);
  qr.addData(text);
  qr.make();
  return qr.modules;
};

// Render ke frame RGBA berukuran W x H, QR berukuran px di posisi (ox, oy)
const render = ({ W, H, modules, px, ox, oy, fg = 0, bg = 255, frameBg = 90, quiet = 4, noise = 0, contrast = 1 }) => {
  const data = new Uint8ClampedArray(W * H * 4);
  const n = modules.length;
  const cell = px / (n + quiet * 2);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      let v = frameBg;
      const lx = x - ox;
      const ly = y - oy;
      if (lx >= 0 && ly >= 0 && lx < px && ly < px) {
        const mx = Math.floor(lx / cell) - quiet;
        const my = Math.floor(ly / cell) - quiet;
        const dark = mx >= 0 && my >= 0 && mx < n && my < n && modules[my][mx];
        v = dark ? fg : bg;
        v = 128 + (v - 128) * contrast;
      }
      v += (Math.random() - 0.5) * noise;
      const i = (y * W + x) * 4;
      data[i] = data[i + 1] = data[i + 2] = Math.max(0, Math.min(255, v));
      data[i + 3] = 255;
    }
  }
  return data;
};

const mirror = (data, W, H) => {
  const out = new Uint8ClampedArray(data.length);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const s = (y * W + x) * 4, d = (y * W + (W - 1 - x)) * 4;
    out[d] = data[s]; out[d + 1] = data[s + 1]; out[d + 2] = data[s + 2]; out[d + 3] = 255;
  }
  return out;
};

const modules = makeMatrix(code);
const W = 960, H = 540;
const cases = [
  ['QR jelas di tengah (layar HP terang)', { px: 300, ox: 330, oy: 120 }],
  ['QR kecil/jauh (140px) di pojok, tidak di tengah', { px: 140, ox: 60, oy: 60 }],
  ['Kontras rendah + noise (silau layar)', { px: 260, ox: 350, oy: 140, contrast: 0.45, noise: 40 }],
  ['Dark mode: QR terbalik (putih di atas hitam)', { px: 280, ox: 340, oy: 130, fg: 255, bg: 0, frameBg: 20 }],
  ['Tanpa bingkai putih (quiet zone 0) di bg gelap', { px: 260, ox: 350, oy: 140, quiet: 0, frameBg: 30 }],
];

let pass = 0;
for (const [name, opts] of cases) {
  const data = render({ W, H, modules, ...opts });
  const r = jsQR(data, W, H, { inversionAttempts: 'attemptBoth' });
  const ok = r?.data === code;
  pass += ok ? 1 : 0;
  console.log(`${ok ? 'LULUS' : 'GAGAL'}  ${name}${ok ? '' : ' -> ' + (r?.data ?? 'tidak terbaca')}`);
}

// Webcam yang mirror di level driver: frame normal gagal, frame dicerminkan ulang harus lulus
const mirrored = mirror(render({ W, H, modules, px: 300, ox: 330, oy: 120 }), W, H);
const direct = jsQR(mirrored, W, H, { inversionAttempts: 'attemptBoth' });
const flippedBack = jsQR(mirror(mirrored, W, H), W, H, { inversionAttempts: 'attemptBoth' });
const mirrorOk = flippedBack?.data === code;
pass += mirrorOk ? 1 : 0;
console.log(`${mirrorOk ? 'LULUS' : 'GAGAL'}  Webcam mirror (langsung: ${direct ? 'terbaca' : 'tidak terbaca'}, setelah dibalik: ${flippedBack ? 'terbaca' : 'tidak terbaca'})`);

console.log(`\nHasil: ${pass}/${cases.length + 1} skenario lulus`);
