import { useRef } from 'react';
import QRCode from 'react-qr-code';
import { motion, AnimatePresence } from 'framer-motion';
import { Copy, Download } from 'lucide-react';
import toast from 'react-hot-toast';

const QrModal = ({ open, onClose, tickets = [] }) => {
  const svgRefs = useRef({});

  const handleCopy = async (code) => {
    try {
      await navigator.clipboard.writeText(code);
      toast.success('Kode tiket disalin');
    } catch {
      toast.error('Gagal menyalin kode');
    }
  };

  const handleDownloadPng = (code) => {
    const wrapper = svgRefs.current[code];
    const svg = wrapper?.querySelector('svg');
    if (!svg) {
      toast.error('QR belum siap diunduh');
      return;
    }

    const serializer = new XMLSerializer();
    const svgStr = serializer.serializeToString(svg);
    const svgBlob = new Blob([svgStr], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(svgBlob);

    const img = new Image();
    img.onload = () => {
      const size = 400;
      const padding = 40;
      const canvas = document.createElement('canvas');
      canvas.width = size + padding * 2;
      canvas.height = size + padding * 2;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, padding, padding, size, size);
      URL.revokeObjectURL(url);

      const pngUrl = canvas.toDataURL('image/png');
      const link = document.createElement('a');
      link.href = pngUrl;
      link.download = `QR-${code}.png`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      toast.error('Gagal membuat gambar QR');
    };
    img.src = url;
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
        >
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.9, opacity: 0 }}
            className="glass-panel max-h-[85vh] w-full max-w-2xl overflow-y-auto rounded-3xl p-6"
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-ebony/70 dark:text-cream/70">Tiket Digital</p>
                <h3 className="text-xl font-semibold">Scan QR di Gerbang</h3>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="rounded-full border border-cream/60 px-3 py-1 text-sm text-ebony/70 dark:border-white/20 dark:text-cream/70"
              >
                Tutup
              </button>
            </div>
            <div className="mt-6 grid gap-6 md:grid-cols-2">
              {tickets.map((ticket) => (
                <div
                  key={ticket.ticket_code}
                  className="rounded-2xl border border-cream/60 p-4 text-center dark:border-white/10"
                >
                  {/* Quiet zone putih wajib ada agar scanner kamera dapat membaca QR di dark mode */}
                  <div
                    ref={(el) => {
                      svgRefs.current[ticket.ticket_code] = el;
                    }}
                    className="mx-auto inline-block rounded-2xl bg-white p-4 shadow-md"
                  >
                    <QRCode
                      value={ticket.ticket_code}
                      size={176}
                      bgColor="#FFFFFF"
                      fgColor="#000000"
                      level="M"
                    />
                  </div>
                  <p className="mt-4 font-mono text-xs font-semibold break-all">{ticket.ticket_code}</p>
                  <p className="mt-1 text-xs text-ebony/60 dark:text-cream/60">Status: {ticket.status}</p>
                  <div className="mt-3 flex items-center justify-center gap-2">
                    <button
                      type="button"
                      onClick={() => handleDownloadPng(ticket.ticket_code)}
                      className="inline-flex items-center gap-1.5 rounded-full bg-gold px-3 py-1.5 text-xs font-semibold text-ebony"
                    >
                      <Download size={13} /> Unduh QR
                    </button>
                    <button
                      type="button"
                      onClick={() => handleCopy(ticket.ticket_code)}
                      className="inline-flex items-center gap-1.5 rounded-full border border-cream/70 px-3 py-1.5 text-xs font-semibold dark:border-white/20"
                    >
                      <Copy size={13} /> Salin Kode
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default QrModal;
