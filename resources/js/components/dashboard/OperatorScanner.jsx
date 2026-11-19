import { useEffect, useMemo, useRef, useState } from 'react';
import { Html5Qrcode } from 'html5-qrcode';

const getQrBoxSize = () => {
  if (typeof window === 'undefined') {
    return 260;
  }
  const responsiveSize = Math.floor(window.innerWidth * 0.45);
  return Math.min(320, Math.max(220, responsiveSize));
};

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
  return raw || 'Gagal membuka kamera. Pastikan situs dibuka lewat HTTPS dan izin kamera aktif.';
};

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
  const qrboxSize = useMemo(() => getQrBoxSize(), []);
  const [isPaused, setIsPaused] = useState(false);
  const [restartToken, setRestartToken] = useState(0);

  useEffect(() => {
    callbackRef.current = onResult;
  }, [onResult]);

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;

    let cancelled = false;
    const elementId = 'qr-reader';
    const scanner = new Html5Qrcode(elementId);
    html5QrcodeRef.current = scanner;
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

      setIsPaused(true);
      try {
        scanner.pause(true);
      } catch (_) {
        /* ignore */
      }

      callbackRef.current?.(code);

      if (resumeTimeoutRef.current) {
        clearTimeout(resumeTimeoutRef.current);
      }
      resumeTimeoutRef.current = window.setTimeout(() => {
        if (!cancelled && html5QrcodeRef.current === scanner) {
          try {
            scanner.resume();
          } catch (_) {
            /* ignore */
          }
          setIsPaused(false);
        }
      }, 2500);
    };

    const scanConfig = {
      fps: 10,
      qrbox: { width: qrboxSize, height: qrboxSize },
      aspectRatio: 1.0,
    };

    const startWithFallback = async () => {
      try {
        let cameraConfig = { facingMode: 'environment' };

        try {
          const cameras = await Html5Qrcode.getCameras();
          if (cancelled) return;
          if (cameras && cameras.length > 0) {
            const backCam = cameras.find((c) => /back|rear|environment/i.test(c.label || ''));
            cameraConfig = backCam ? backCam.id : cameras[0].id;
          }
        } catch (_) {
          // Lanjut pakai facingMode jika getCameras tidak tersedia sebelum izin diberikan
        }

        if (cancelled) return;

        try {
          await scanner.start(cameraConfig, scanConfig, onDecodeSuccess, () => {});
        } catch (firstErr) {
          if (cancelled) return;
          // Fallback ke kamera depan / default jika kamera belakang gagal (umum di laptop/PC)
          await scanner.start({ facingMode: 'user' }, scanConfig, onDecodeSuccess, () => {});
        }

        if (cancelled) {
          try {
            await scanner.stop();
            scanner.clear();
          } catch (_) {
            /* ignore */
          }
          return;
        }

        isRunningRef.current = true;
        setIsPaused(false);
        setStatusText('Kamera aktif — arahkan ke QR tiket');
      } catch (err) {
        if (!cancelled) {
          setStatusText('');
          setError(formatCameraError(err));
        }
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
      html5QrcodeRef.current = null;
      if (!instance) return;

      const doStop = async () => {
        try {
          if (isRunningRef.current) {
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
        isRunningRef.current = false;
      };
      doStop();
    };
  }, [qrboxSize, restartToken]);

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
    const fileScanner = new Html5Qrcode('qr-file-reader-hidden');
    try {
      const decodedText = await fileScanner.scanFile(file, false);
      const code = (decodedText || '').trim();
      if (code) {
        callbackRef.current?.(code);
      } else {
        setError('QR tidak terbaca dari gambar tersebut.');
      }
    } catch (_) {
      setError('QR tidak ditemukan pada gambar. Pastikan gambar QR jelas dan tidak terpotong.');
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
        style={{ minHeight: `${qrboxSize + 80}px`, maxHeight: 440 }}
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
          placeholder="Masukkan kode manual"
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
