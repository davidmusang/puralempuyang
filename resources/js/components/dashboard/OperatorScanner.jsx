import { useEffect, useRef, useState } from 'react';
import { Html5Qrcode } from 'html5-qrcode';

// Antrean global agar proses stop() lama selesai 100% sebelum start() baru menyentuh DOM #qr-reader
let previousCleanupPromise = Promise.resolve();

const formatCameraError = (err) => {
  const raw = typeof err === 'string' ? err : err?.message || err?.name || '';
  if (/NotAllowedError|Permission denied|PermissionDismissed/i.test(raw)) {
    return 'Izin kamera ditolak. Izinkan akses kamera di browser (ikon gembok di address bar), lalu klik "Reload Kamera".';
  }
  if (/NotFoundError|Requested device not found|no camera/i.test(raw)) {
    return 'Kamera tidak ditemukan pada perangkat ini. Gunakan "Upload Gambar QR" atau masukkan kode manual di bawah.';
  }
  if (/NotReadableError|TrackStartError/i.test(raw)) {
    return 'Kamera sedang dipakai aplikasi lain. Tutup aplikasi lain lalu klik "Reload Kamera".';
  }
  return raw || 'Gagal membuka kamera. Gunakan "Upload Gambar QR" atau masukkan kode manual.';
};

// Tambahkan border putih (quiet zone) pada gambar yang di-upload agar QR yang terpotong rapat tetap terbaca
const createPaddedImageFile = (file) =>
  new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const pad = Math.max(48, Math.floor(Math.max(img.width, img.height) * 0.15));
      const canvas = document.createElement('canvas');
      canvas.width = img.width + pad * 2;
      canvas.height = img.height + pad * 2;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, pad, pad, img.width, img.height);
      URL.revokeObjectURL(url);
      canvas.toBlob((blob) => {
        if (!blob) {
          reject(new Error('Gagal memproses gambar'));
          return;
        }
        resolve(new File([blob], 'padded-qr.png', { type: 'image/png' }));
      }, 'image/png');
    };
    img.onerror = (err) => {
      URL.revokeObjectURL(url);
      reject(err);
    };
    img.src = url;
  });

const OperatorScanner = ({ onResult }) => {
  const [error, setError] = useState(null);
  const [statusText, setStatusText] = useState('Menyiapkan kamera...');
  const [manualCode, setManualCode] = useState('');
  const html5QrcodeRef = useRef(null);
  const isRunningRef = useRef(false);
  const resumeTimeoutRef = useRef(null);
  const fileInputRef = useRef(null);
  const callbackRef = useRef(onResult);
  const lastScannedRef = useRef({ code: null, time: 0 });
  const [isPaused, setIsPaused] = useState(false);
  const [restartToken, setRestartToken] = useState(0);

  useEffect(() => {
    callbackRef.current = onResult;
  }, [onResult]);

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;

    let cancelled = false;
    const elementId = 'qr-reader';
    setError(null);
    setStatusText('Menyiapkan kamera...');

    const onDecodeSuccess = (decodedText) => {
      const code = (decodedText || '').trim();
      if (!code) return;

      const now = Date.now();
      const last = lastScannedRef.current;
      if (last.code === code && now - last.time < 3000) {
        return;
      }
      lastScannedRef.current = { code, time: now };

      const activeScanner = html5QrcodeRef.current;
      setIsPaused(true);
      try {
        activeScanner?.pause(true);
      } catch (_) {
        /* ignore */
      }

      callbackRef.current?.(code);

      if (resumeTimeoutRef.current) {
        clearTimeout(resumeTimeoutRef.current);
      }
      resumeTimeoutRef.current = window.setTimeout(() => {
        if (!cancelled && html5QrcodeRef.current === activeScanner) {
          try {
            activeScanner?.resume();
          } catch (_) {
            /* ignore */
          }
          setIsPaused(false);
        }
      }, 2500);
    };

    const scanConfig = {
      fps: 10,
      qrbox: (viewfinderWidth, viewfinderHeight) => {
        const minEdge = Math.min(viewfinderWidth || 250, viewfinderHeight || 250);
        const boxSize = Math.max(140, Math.min(280, Math.floor(minEdge * 0.72)));
        return { width: boxSize, height: boxSize };
      },
    };

    const tryStartCandidate = async (cameraConstraint) => {
      const container = document.getElementById(elementId);
      if (container) {
        container.innerHTML = '';
      }
      const instance = new Html5Qrcode(elementId);
      html5QrcodeRef.current = instance;
      await instance.start(cameraConstraint, scanConfig, onDecodeSuccess, () => {});
      return instance;
    };

    const startWithFallback = async () => {
      // Tunggu sampai cleanup scanner sebelumnya benar-benar selesai
      await previousCleanupPromise.catch(() => {});
      if (cancelled) return;

      const candidates = [{ facingMode: 'environment' }, { facingMode: 'user' }];

      try {
        const cameras = await Html5Qrcode.getCameras();
        if (cameras && cameras.length > 0) {
          const backCam = cameras.find((c) => c.id && /back|rear|environment/i.test(c.label || ''));
          if (backCam?.id) candidates.unshift(backCam.id);
          cameras.forEach((c) => {
            if (c.id && !candidates.includes(c.id)) {
              candidates.push(c.id);
            }
          });
        }
      } catch (_) {
        // Abaikan jika getCameras gagal sebelum permission diberikan
      }

      let lastErr = null;
      let startedInstance = null;

      for (const candidate of candidates) {
        if (cancelled) return;
        try {
          startedInstance = await tryStartCandidate(candidate);
          break;
        } catch (err) {
          lastErr = err;
          try {
            html5QrcodeRef.current?.clear();
          } catch (_) {
            /* ignore */
          }
          html5QrcodeRef.current = null;
        }
      }

      if (cancelled) {
        if (startedInstance) {
          try {
            await startedInstance.stop();
            startedInstance.clear();
          } catch (_) {
            /* ignore */
          }
        }
        return;
      }

      if (startedInstance) {
        isRunningRef.current = true;
        setIsPaused(false);
        setStatusText('Kamera aktif — arahkan ke QR tiket');
      } else {
        setStatusText('');
        setError(formatCameraError(lastErr));
      }
    };

    startWithFallback();

    return () => {
      cancelled = true;
      if (resumeTimeoutRef.current) {
        clearTimeout(resumeTimeoutRef.current);
        resumeTimeoutRef.current = null;
      }
      const instance = html5QrcodeRef.current;
      const wasRunning = isRunningRef.current;
      html5QrcodeRef.current = null;
      isRunningRef.current = false;

      if (!instance) return;

      previousCleanupPromise = previousCleanupPromise
        .catch(() => {})
        .then(async () => {
          try {
            if (wasRunning) {
              await instance.stop();
            }
          } catch (_) {
            /* ignore */
          }
          try {
            instance.clear();
          } catch (_) {
            /* ignore */
          }
        });
    };
  }, [restartToken]);

  const handleManualSubmit = (e) => {
    e?.preventDefault();
    const code = manualCode.trim();
    if (!code) return;
    callbackRef.current?.(code);
    setManualCode('');
  };

  const handleRestart = () => {
    setError(null);
    setIsPaused(false);
    setRestartToken((token) => token + 1);
  };

  const handleFileUpload = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    setError(null);

    // 1. Coba native BarcodeDetector jika didukung browser (Chrome/Edge/Android modern)
    if (typeof window !== 'undefined' && 'BarcodeDetector' in window) {
      try {
        const detector = new window.BarcodeDetector({ formats: ['qr_code'] });
        const bitmap = await createImageBitmap(file);
        const barcodes = await detector.detect(bitmap);
        if (barcodes?.[0]?.rawValue) {
          callbackRef.current?.(barcodes[0].rawValue.trim());
          return;
        }
      } catch (_) {
        // Lanjut ke fallback Html5Qrcode
      }
    }

    // 2. Coba scanFile langsung dengan Html5Qrcode, dan jika gagal coba versi dengan quiet-zone putih
    const fileScanner = new Html5Qrcode('qr-file-reader-hidden');
    try {
      let decodedText = null;
      try {
        decodedText = await fileScanner.scanFile(file, false);
      } catch (_) {
        const paddedFile = await createPaddedImageFile(file);
        decodedText = await fileScanner.scanFile(paddedFile, false);
      }
      const code = (decodedText || '').trim();
      if (code) {
        callbackRef.current?.(code);
      } else {
        setError('QR tidak terbaca dari gambar tersebut.');
      }
    } catch (_) {
      setError('QR tidak ditemukan pada gambar. Gunakan tombol "Unduh QR" pada tiket atau masukkan kode manual.');
    } finally {
      try {
        fileScanner.clear();
      } catch (_) {
        /* ignore */
      }
    }
  };

  return (
    <div className="glass-panel rounded-3xl p-5">
      <div className="flex items-center justify-between gap-2">
        <p className="font-semibold">Scan QR</p>
        {statusText && !error && (
          <span className="text-xs text-ebony/60 dark:text-cream/60">{statusText}</span>
        )}
      </div>

      <div
        id="qr-reader"
        className="mt-3 w-full overflow-hidden rounded-2xl bg-black/20"
        style={{ minHeight: '280px', maxHeight: 440 }}
      />
      <div id="qr-file-reader-hidden" className="hidden" />

      {isPaused && (
        <p className="mt-2 text-xs text-amber-600 dark:text-amber-400">
          Scanner paused sesaat setelah validasi.
        </p>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={handleRestart}
          className="text-xs font-semibold text-gold underline-offset-2 hover:underline"
        >
          Reload Kamera
        </button>
        <span className="text-xs text-ebony/30 dark:text-cream/30">|</span>
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className="text-xs font-semibold text-gold underline-offset-2 hover:underline"
        >
          Upload Gambar QR
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          onChange={handleFileUpload}
          className="hidden"
        />
      </div>

      {error && <p className="mt-2 text-xs text-red-500 dark:text-red-400">{error}</p>}

      <form onSubmit={handleManualSubmit} className="mt-4 flex gap-2">
        <input
          value={manualCode}
          onChange={(e) => setManualCode(e.target.value)}
          placeholder="Masukkan kode tiket / kode order"
          className="flex-1 rounded-2xl border border-cream/70 bg-transparent px-3 py-2 text-sm dark:border-white/20"
        />
        <button
          type="submit"
          className="rounded-2xl bg-gold px-4 text-sm font-semibold text-ebony"
        >
          Validasi
        </button>
      </form>
    </div>
  );
};

export default OperatorScanner;
