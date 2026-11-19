import { useCallback, useEffect, useRef, useState } from 'react';
import jsQR from 'jsqr';

/**
 * Pemindai QR petugas gerbang.
 *
 * Tidak lagi memakai html5-qrcode: library itu hanya memindai kotak kecil di tengah
 * dan sering gagal membaca QR yang ditampilkan dari layar HP (silau, miring, kecil).
 * Di sini kamera dibuka langsung lewat getUserMedia, lalu setiap frame dipindai:
 *   1. BarcodeDetector bawaan browser (jika tersedia, paling cepat & akurat),
 *   2. jsQR pada seluruh frame (normal + warna terbalik),
 *   3. jsQR pada potongan tengah yang diperbesar (untuk QR yang kecil/jauh),
 *   4. jsQR pada frame yang dicerminkan (beberapa webcam laptop mirror di level driver).
 */

const SCAN_INTERVAL_MS = 120;
const MAX_SCAN_EDGE = 960;
const DUPLICATE_WINDOW_MS = 3000;
const COOLDOWN_AFTER_HIT_MS = 2000;

const formatCameraError = (err) => {
  const raw = `${err?.name || ''} ${err?.message || err || ''}`;
  if (!window.isSecureContext) {
    return 'Kamera hanya bisa dibuka lewat HTTPS. Buka situs memakai alamat https://';
  }
  if (/NotAllowed|Permission|denied/i.test(raw)) {
    return 'Izin kamera ditolak. Klik ikon gembok di address bar → izinkan Kamera, lalu tekan "Muat Ulang Kamera".';
  }
  if (/NotFound|DevicesNotFound|Overconstrained/i.test(raw)) {
    return 'Kamera tidak ditemukan. Gunakan "Upload Gambar QR" atau ketik kode secara manual.';
  }
  if (/NotReadable|TrackStart|in use/i.test(raw)) {
    return 'Kamera sedang dipakai aplikasi lain (Zoom/WA/Meet). Tutup aplikasi tersebut lalu tekan "Muat Ulang Kamera".';
  }
  return 'Gagal membuka kamera. Gunakan "Upload Gambar QR" atau ketik kode secara manual.';
};

const createBarcodeDetector = async () => {
  if (typeof window === 'undefined' || !('BarcodeDetector' in window)) return null;
  try {
    const formats = await window.BarcodeDetector.getSupportedFormats?.();
    if (formats && !formats.includes('qr_code')) return null;
    return new window.BarcodeDetector({ formats: ['qr_code'] });
  } catch {
    return null;
  }
};

/** Jalankan jsQR pada area tertentu dari sumber (video/gambar) yang digambar ke canvas. */
const decodeRegion = (ctx, canvas, source, region, { mirror = false, maxEdge = MAX_SCAN_EDGE } = {}) => {
  const { sx, sy, sw, sh } = region;
  if (!sw || !sh) return null;
  const scale = Math.min(1, maxEdge / Math.max(sw, sh));
  const cw = Math.max(1, Math.round(sw * scale));
  const ch = Math.max(1, Math.round(sh * scale));
  canvas.width = cw;
  canvas.height = ch;
  ctx.save();
  if (mirror) {
    ctx.translate(cw, 0);
    ctx.scale(-1, 1);
  }
  ctx.drawImage(source, sx, sy, sw, sh, 0, 0, cw, ch);
  ctx.restore();
  const image = ctx.getImageData(0, 0, cw, ch);
  const result = jsQR(image.data, cw, ch, { inversionAttempts: 'attemptBoth' });
  return result?.data?.trim() || null;
};

/** Pindai gambar statis (upload) dengan beberapa strategi, termasuk menambah bingkai putih. */
const decodeImageElement = (img) => {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  const w = img.naturalWidth || img.width;
  const h = img.naturalHeight || img.height;
  const full = { sx: 0, sy: 0, sw: w, sh: h };

  const direct =
    decodeRegion(ctx, canvas, img, full, { maxEdge: 1400 }) ||
    decodeRegion(ctx, canvas, img, full, { maxEdge: 700 });
  if (direct) return direct;

  // Tambahkan quiet zone putih untuk screenshot yang terpotong rapat di tepi QR.
  const pad = Math.max(48, Math.round(Math.max(w, h) * 0.15));
  const padded = document.createElement('canvas');
  padded.width = w + pad * 2;
  padded.height = h + pad * 2;
  const pctx = padded.getContext('2d');
  pctx.fillStyle = '#FFFFFF';
  pctx.fillRect(0, 0, padded.width, padded.height);
  pctx.drawImage(img, pad, pad, w, h);
  return decodeRegion(ctx, canvas, padded, { sx: 0, sy: 0, sw: padded.width, sh: padded.height }, { maxEdge: 1400 });
};

const OperatorScanner = ({ onResult }) => {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);
  const timerRef = useRef(null);
  const detectorRef = useRef(null);
  const scanningRef = useRef(false);
  const frameCountRef = useRef(0);
  const cooldownUntilRef = useRef(0);
  const lastScannedRef = useRef({ code: null, time: 0 });
  const callbackRef = useRef(onResult);
  const fileInputRef = useRef(null);

  const [status, setStatus] = useState('starting'); // starting | active | error
  const [error, setError] = useState(null);
  const [cameras, setCameras] = useState([]);
  const [deviceId, setDeviceId] = useState('');
  const [lastDetected, setLastDetected] = useState(null);
  const [restartToken, setRestartToken] = useState(0);
  const [manualCode, setManualCode] = useState('');

  useEffect(() => {
    callbackRef.current = onResult;
  }, [onResult]);

  const emitCode = useCallback((rawCode) => {
    const code = (rawCode || '').trim();
    if (!code) return false;
    const now = Date.now();
    const last = lastScannedRef.current;
    if (last.code === code && now - last.time < DUPLICATE_WINDOW_MS) return false;

    lastScannedRef.current = { code, time: now };
    cooldownUntilRef.current = now + COOLDOWN_AFTER_HIT_MS;
    setLastDetected({ code, time: now });
    setTimeout(() => {
      setLastDetected((current) => (current && current.time === now ? null : current));
    }, 4000);
    try {
      navigator.vibrate?.(120);
    } catch {
      /* ignore */
    }
    callbackRef.current?.(code);
    return true;
  }, []);

  const stopCamera = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    scanningRef.current = false;
    const stream = streamRef.current;
    streamRef.current = null;
    stream?.getTracks().forEach((track) => {
      try {
        track.stop();
      } catch {
        /* ignore */
      }
    });
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  }, []);

  const scanFrame = useCallback(async () => {
    const video = videoRef.current;
    if (!video || !streamRef.current) return;
    if (scanningRef.current || Date.now() < cooldownUntilRef.current) return;
    if (video.readyState < 2 || !video.videoWidth || !video.videoHeight) return;

    scanningRef.current = true;
    try {
      // 1) Detektor bawaan browser
      if (detectorRef.current) {
        try {
          const codes = await detectorRef.current.detect(video);
          const value = codes?.find((c) => c.rawValue)?.rawValue;
          if (value && emitCode(value)) return;
        } catch {
          detectorRef.current = null; // jatuh ke jsQR bila detektor bermasalah
        }
      }

      // 2-4) jsQR, strategi bergiliran per frame agar tetap ringan
      if (!canvasRef.current) {
        canvasRef.current = document.createElement('canvas');
      }
      const canvas = canvasRef.current;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      const vw = video.videoWidth;
      const vh = video.videoHeight;
      const turn = frameCountRef.current++ % 4;

      let value = null;
      if (turn === 0 || turn === 2) {
        value = decodeRegion(ctx, canvas, video, { sx: 0, sy: 0, sw: vw, sh: vh });
      } else if (turn === 1) {
        const side = Math.round(Math.min(vw, vh) * 0.6);
        value = decodeRegion(ctx, canvas, video, {
          sx: Math.round((vw - side) / 2),
          sy: Math.round((vh - side) / 2),
          sw: side,
          sh: side,
        });
      } else {
        value = decodeRegion(ctx, canvas, video, { sx: 0, sy: 0, sw: vw, sh: vh }, { mirror: true });
      }

      if (value) emitCode(value);
    } finally {
      scanningRef.current = false;
    }
  }, [emitCode]);

  useEffect(() => {
    let cancelled = false;

    const loop = async () => {
      if (cancelled) return;
      await scanFrame();
      if (!cancelled) {
        timerRef.current = setTimeout(loop, SCAN_INTERVAL_MS);
      }
    };

    const start = async () => {
      stopCamera();
      setStatus('starting');
      setError(null);

      if (!navigator.mediaDevices?.getUserMedia) {
        setStatus('error');
        setError(formatCameraError(new Error('NotFound')));
        return;
      }

      const videoConstraints = deviceId
        ? { deviceId: { exact: deviceId } }
        : { facingMode: { ideal: 'environment' } };

      const attempts = [
        { video: { ...videoConstraints, width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false },
        { video: videoConstraints, audio: false },
        { video: true, audio: false },
      ];

      let stream = null;
      let lastErr = null;
      for (const constraints of attempts) {
        try {
          stream = await navigator.mediaDevices.getUserMedia(constraints);
          break;
        } catch (err) {
          lastErr = err;
          if (/NotAllowed|Permission/i.test(`${err?.name} ${err?.message}`)) break;
        }
      }

      if (cancelled) {
        stream?.getTracks().forEach((t) => t.stop());
        return;
      }
      if (!stream) {
        setStatus('error');
        setError(formatCameraError(lastErr));
        return;
      }

      streamRef.current = stream;

      // Fokus otomatis kontinu bila didukung (membantu membaca layar HP dari dekat)
      const [track] = stream.getVideoTracks();
      try {
        const caps = track?.getCapabilities?.();
        if (caps?.focusMode?.includes('continuous')) {
          await track.applyConstraints({ advanced: [{ focusMode: 'continuous' }] });
        }
      } catch {
        /* ignore */
      }

      const video = videoRef.current;
      if (video) {
        video.srcObject = stream;
        video.setAttribute('playsinline', 'true');
        video.muted = true;
        try {
          await video.play();
        } catch {
          /* autoplay diblokir jarang terjadi karena video muted */
        }
      }

      detectorRef.current = await createBarcodeDetector();

      try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        if (!cancelled) {
          setCameras(devices.filter((d) => d.kind === 'videoinput'));
        }
      } catch {
        /* ignore */
      }

      if (cancelled) return;
      setStatus('active');
      loop();
    };

    start();

    return () => {
      cancelled = true;
      stopCamera();
    };
  }, [deviceId, restartToken, scanFrame, stopCamera]);

  const handleRestart = () => setRestartToken((t) => t + 1);

  const handleManualSubmit = (e) => {
    e?.preventDefault();
    const code = manualCode.trim();
    if (!code) return;
    lastScannedRef.current = { code: null, time: 0 };
    callbackRef.current?.(code);
    setManualCode('');
  };

  const handleFileUpload = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setError(null);

    const url = URL.createObjectURL(file);
    try {
      const img = await new Promise((resolve, reject) => {
        const image = new Image();
        image.onload = () => resolve(image);
        image.onerror = reject;
        image.src = url;
      });

      let value = null;
      const detector = await createBarcodeDetector();
      if (detector) {
        try {
          const codes = await detector.detect(img);
          value = codes?.find((c) => c.rawValue)?.rawValue || null;
        } catch {
          /* fallback ke jsQR */
        }
      }
      if (!value) value = decodeImageElement(img);

      if (value) {
        lastScannedRef.current = { code: null, time: 0 };
        emitCode(value);
      } else {
        setError('QR tidak ditemukan pada gambar. Pastikan QR terlihat utuh dan tidak buram.');
      }
    } catch {
      setError('Gagal membaca gambar.');
    } finally {
      URL.revokeObjectURL(url);
    }
  };

  const statusLabel =
    status === 'active'
      ? 'Kamera aktif — arahkan QR ke kotak'
      : status === 'starting'
        ? 'Menyiapkan kamera...'
        : 'Kamera tidak aktif';

  return (
    <div className="glass-panel rounded-3xl p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-1.5">
        <p className="font-semibold">Scan QR</p>
        <span
          className={`text-xs ${
            status === 'active'
              ? 'text-emerald-600 dark:text-emerald-400'
              : status === 'error'
                ? 'text-red-500'
                : 'text-ebony/60 dark:text-cream/60'
          }`}
        >
          {statusLabel}
        </span>
      </div>

      <div className="relative mt-3 w-full overflow-hidden rounded-2xl bg-black aspect-square sm:aspect-[4/3] max-h-[380px]">
        <video ref={videoRef} className="h-full w-full object-cover" playsInline muted autoPlay />

        {/* Panduan bidik: hanya visual, pemindaian tetap dilakukan pada seluruh frame */}
        {status === 'active' && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <div className="relative h-[64%] aspect-square rounded-2xl border-2 border-white/80 shadow-[0_0_0_9999px_rgba(0,0,0,0.25)]">
              <span className="absolute -left-0.5 -top-0.5 h-6 w-6 rounded-tl-2xl border-l-4 border-t-4 border-gold" />
              <span className="absolute -right-0.5 -top-0.5 h-6 w-6 rounded-tr-2xl border-r-4 border-t-4 border-gold" />
              <span className="absolute -bottom-0.5 -left-0.5 h-6 w-6 rounded-bl-2xl border-b-4 border-l-4 border-gold" />
              <span className="absolute -bottom-0.5 -right-0.5 h-6 w-6 rounded-br-2xl border-b-4 border-r-4 border-gold" />
            </div>
          </div>
        )}

        {status !== 'active' && (
          <div className="absolute inset-0 flex items-center justify-center p-6 text-center text-xs text-white/80">
            {status === 'starting' ? 'Menyiapkan kamera...' : 'Kamera tidak aktif'}
          </div>
        )}

        {lastDetected && (
          <div className="absolute inset-x-3 bottom-3 rounded-xl bg-emerald-600/90 px-3 py-2 text-center text-xs font-semibold text-white break-all">
            QR terbaca: <span className="font-mono">{lastDetected.code}</span>
          </div>
        )}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2.5 sm:gap-3">
        <button
          type="button"
          onClick={handleRestart}
          className="rounded-xl border border-gold/40 px-3 py-1.5 text-xs font-semibold text-gold hover:bg-gold/10"
        >
          Muat Ulang Kamera
        </button>
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className="rounded-xl border border-gold/40 px-3 py-1.5 text-xs font-semibold text-gold hover:bg-gold/10"
        >
          Upload Gambar QR
        </button>
        <input ref={fileInputRef} type="file" accept="image/*" onChange={handleFileUpload} className="hidden" />

        {cameras.length > 1 && (
          <select
            value={deviceId}
            onChange={(e) => setDeviceId(e.target.value)}
            className="w-full sm:w-auto sm:ml-auto sm:max-w-[55%] rounded-xl border border-cream/70 bg-white px-3 py-2 sm:py-1.5 text-xs text-ebony dark:border-white/20 dark:bg-ebony/60 dark:text-cream"
          >
            <option value="">Kamera otomatis</option>
            {cameras.map((cam, idx) => (
              <option key={cam.deviceId || idx} value={cam.deviceId}>
                {cam.label || `Kamera ${idx + 1}`}
              </option>
            ))}
          </select>
        )}
      </div>

      {error && <p className="mt-2 text-xs text-red-500 dark:text-red-400">{error}</p>}

      <p className="mt-2 text-[11px] text-ebony/50 dark:text-cream/50">
        Tips: naikkan kecerahan layar HP pengunjung, jauhkan ±15–25 cm dari kamera, dan hindari pantulan lampu.
      </p>

      <form onSubmit={handleManualSubmit} className="mt-4 flex flex-col gap-2 sm:flex-row">
        <input
          value={manualCode}
          onChange={(e) => setManualCode(e.target.value)}
          placeholder="Masukkan kode tiket / kode order"
          className="min-w-0 flex-1 rounded-2xl border border-cream/70 bg-transparent px-3 py-2.5 text-sm dark:border-white/20"
        />
        <button
          type="submit"
          className="shrink-0 rounded-2xl bg-gold px-5 py-2.5 text-sm font-semibold text-ebony"
        >
          Validasi
        </button>
      </form>
    </div>
  );
};

export default OperatorScanner;
