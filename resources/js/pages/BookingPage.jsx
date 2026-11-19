import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { Calendar, Clock } from 'lucide-react';
import Navbar from '../components/Navbar';
import Footer from '../components/Footer';
import api, { endpoints } from '../services/api';
import { useAuth } from '../context/AuthContext';
import toast from 'react-hot-toast';
import { useMidtransSnap } from '../hooks/useMidtransSnap';
import { useI18n } from '../i18n/I18nContext';
import { formatCurrency, formatDate, formatDateFull } from '../utils/format';

// Hanya tarif dasar untuk cadangan bila slot belum membawa rincian tarif.
// Penulisan mata uangnya diserahkan ke formatCurrency agar ikut bahasa aktif.
const PRICE_RANGE = {
  domestic: { base: 30000 },
  international: { base: 55000 },
};

const BookingPage = () => {
  const { user } = useAuth();
  const { t, locale } = useI18n();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { isReady, openSnap } = useMidtransSnap();

  const categoryPillLabel = user?.citizenship_type
    ? `${t(user.citizenship_type === 'international' ? 'common.international' : 'common.domestic')} - ${
        formatCurrency(PRICE_RANGE[user.citizenship_type]?.base ?? 0, locale)
      }`
    : t('booking.allCategories');

  const { data: slots } = useQuery({
    queryKey: ['slots'],
    queryFn: async () => {
      const { data } = await api.get(endpoints.slots);
      return data.data || [];
    },
  });

  const [selectedSlot, setSelectedSlot] = useState(null);
  const [selectedDate, setSelectedDate] = useState('all');
  // Jumlah pengunjung per tarif — satu pesanan boleh memuat WNI dan WNA sekaligus.
  const [counts, setCounts] = useState({ domestic: 0, international: 0 });

  // Satu sesi kini menjual kedua tarif, jadi tidak ada lagi penyaringan slot.
  const displaySlots = slots || [];

  // Daftar tanggal unik yang tersedia dari slot
  const availableDates = useMemo(() => {
    if (!slots?.length) return [];
    const dates = Array.from(new Set(slots.map((s) => s.visit_date).filter(Boolean)));
    return dates.sort();
  }, [slots]);

  // Filter slot sesuai tanggal yang dipilih
  const filteredSlots = useMemo(() => {
    if (!displaySlots.length) return [];
    if (selectedDate === 'all') return displaySlots;
    return displaySlots.filter((slot) => slot.visit_date === selectedDate);
  }, [displaySlots, selectedDate]);

  // Sesi lama (sebelum tarif dipisah) belum punya `tiers`; pakai harganya sendiri.
  const tiers = useMemo(() => {
    if (!selectedSlot) return [];
    if (selectedSlot.tiers?.length) return selectedSlot.tiers;
    return [{
      category: selectedSlot.ticket_category || 'domestic',
      label: selectedSlot.ticket_category === 'international' ? 'Mancanegara (WNA)' : 'Domestik (WNI)',
      price: selectedSlot.price ?? PRICE_RANGE[selectedSlot.ticket_category]?.base ?? 0,
    }];
  }, [selectedSlot]);

  // Tarif yang berlaku untuk akun ini ditampilkan lebih dulu; tarif lain
  // disembunyikan sampai pemesan memang butuh (rombongan campuran).
  const viewerCategory = user?.citizenship_type === 'international' ? 'international' : 'domestic';
  const primaryTier = tiers.find((tier) => tier.category === viewerCategory) || tiers[0];
  const otherTiers = tiers.filter((tier) => tier.category !== primaryTier?.category);
  const [showOtherTiers, setShowOtherTiers] = useState(false);
  const visibleTiers = showOtherTiers ? tiers : (primaryTier ? [primaryTier] : []);

  const totalGuests = (counts.domestic || 0) + (counts.international || 0);
  const totalPrice = tiers.reduce(
    (sum, tier) => sum + (counts[tier.category] || 0) * Number(tier.price || 0),
    0
  );

  // Setiap ganti sesi, mulai bersih: satu tiket sesuai kategori akun, dan
  // tarif tambahan tertutup lagi supaya tidak ada tiket terpesan tanpa terlihat.
  useEffect(() => {
    setShowOtherTiers(false);
    setCounts(selectedSlot ? { domestic: 0, international: 0, [viewerCategory]: 1 } : { domestic: 0, international: 0 });
  }, [selectedSlot?.id, viewerCategory]);

  useEffect(() => {
    if (selectedSlot && !filteredSlots.some((slot) => slot.id === selectedSlot.id)) {
      setSelectedSlot(null);
    }
  }, [filteredSlots, selectedSlot]);

  const handlePay = async () => {
    if (!user) {
      toast.error(t('booking.loginFirst'));
      navigate('/login');
      return;
    }
    if (!selectedSlot) {
      toast.error(t('booking.selectSchedule'));
      return;
    }
    if (totalGuests < 1) {
      toast.error('Tentukan jumlah pengunjung terlebih dahulu');
      return;
    }
    if (totalGuests > selectedSlot.quota_remaining) {
      toast.error('Kuota sesi ini tidak mencukupi');
      return;
    }

    try {
      const { data } = await api.post(endpoints.paymentToken, {
        slot_id: selectedSlot.id,
        lines: tiers
          .map((tier) => ({ category: tier.category, quantity: counts[tier.category] || 0 }))
          .filter((line) => line.quantity > 0),
      });

      toast.success('Memproses pembayaran...');
      openSnap(data.token, {
        onSuccess: async (snapResult) => {
          let redirectToDashboard = true;
          try {
            await api.post(endpoints.paymentVerify, {
              order_code: data.order_code,
              snap_payload: snapResult,
            });
            toast.success('Pembayaran sukses!');
          } catch (error) {
            if (error.response?.status === 401) {
              toast.error('Sesi Anda telah berakhir, silakan login kembali.');
              navigate('/login');
              redirectToDashboard = false;
            } else {
              toast.error(
                error.response?.data?.message ||
                  'Pembayaran berhasil, tapi status belum tersinkron. Cek dashboard Anda.'
              );
            }
          } finally {
            queryClient.invalidateQueries({ queryKey: ['orders'] });
            if (redirectToDashboard) navigate('/dashboard');
          }
        },
        onPending: () => toast('Menunggu konfirmasi Midtrans'),
        onClose: () => toast('Anda menutup Snap sebelum membayar'),
      });
    } catch (error) {
      if (error.response?.status === 401) {
        toast.error('Sesi Anda telah berakhir, silakan login kembali.');
        navigate('/login');
        return;
      }
      toast.error(error.response?.data?.message || t('booking.payFailed'));
    }
  };

  return (
    <div className="min-h-screen bg-cream text-ebony dark:bg-ebony dark:text-cream">
      <Navbar />
<main className="mx-auto max-w-6xl px-6 pt-28 pb-20">
  <div className="flex flex-col-reverse lg:flex-row lg:items-start lg:justify-between gap-10">
    
    {/* BAGIAN KIRI - SLOT KUNJUNGAN */}
    <section className="flex-1 space-y-5">
      <div>
        <h1 className="font-display text-3xl">{t('booking.title')}</h1>
        <p className="mt-1 text-xs uppercase tracking-[0.4em] text-gold">{categoryPillLabel}</p>
      </div>

      {/* Filter Tanggal Kunjungan */}
      {availableDates.length > 0 && (
        <div className="space-y-2 rounded-2xl border border-cream/70 bg-white/70 p-4 dark:border-white/10 dark:bg-charcoal/50">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-ebony/70 dark:text-cream/70">
            <Calendar size={14} className="text-gold" />
            <span>{t('booking.filterDate')}</span>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setSelectedDate('all')}
              className={`rounded-full px-4 py-1.5 text-xs font-semibold transition-all ${
                selectedDate === 'all'
                  ? 'bg-gold text-ebony shadow-sm ring-1 ring-gold'
                  : 'border border-cream/80 bg-white text-ebony/70 hover:border-gold/50 dark:bg-charcoal dark:border-white/10 dark:text-cream/70'
              }`}
            >
              {t('booking.allDates')} ({displaySlots.length})
            </button>
            {availableDates.map((dateStr) => {
              const count = displaySlots.filter((s) => s.visit_date === dateStr).length;
              return (
                <button
                  key={dateStr}
                  type="button"
                  onClick={() => setSelectedDate(dateStr)}
                  className={`rounded-full px-4 py-1.5 text-xs font-semibold transition-all ${
                    selectedDate === dateStr
                      ? 'bg-gold text-ebony shadow-sm ring-1 ring-gold'
                      : 'border border-cream/80 bg-white text-ebony/70 hover:border-gold/50 dark:bg-charcoal dark:border-white/10 dark:text-cream/70'
                  }`}
                >
                  {formatDate(dateStr, locale)} ({count})
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Daftar Kartu Slot */}
      <div className="grid gap-4 md:grid-cols-2">
        {filteredSlots.length ? (
          filteredSlots.map((slot) => (
            <motion.button
              whileHover={{ scale: 1.01 }}
              key={slot.id}
              onClick={() => setSelectedSlot(slot)}
              className={`rounded-3xl border p-5 text-left transition-all ${
                selectedSlot?.id === slot.id
                  ? 'border-gold bg-gold/10 shadow-md ring-1 ring-gold'
                  : 'border-cream/80 bg-white hover:border-gold/40 hover:shadow-sm dark:bg-charcoal dark:border-white/10'
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-gold/15 px-3 py-1 text-xs font-semibold text-gold border border-gold/30">
                  <Calendar size={13} />
                  {formatDate(slot.visit_date, locale)}
                </span>
                <span className="text-xs text-ebony/60 dark:text-cream/60 bg-ebony/5 dark:bg-white/5 px-2.5 py-0.5 rounded-full">
                  {t('booking.remainingQuota', { remaining: slot.quota_remaining, total: slot.quota_total })}
                </span>
              </div>

              <h3 className="mt-3 font-semibold text-base text-gold">{slot.ticket_name}</h3>
              {slot.description && (
                <p className="mt-1 text-xs text-ebony/70 dark:text-cream/70 line-clamp-2">
                  {slot.description}
                </p>
              )}

              <div className="mt-3 flex items-center gap-2">
                <Clock size={16} className="text-gold shrink-0" />
                <p className="text-lg font-bold tracking-tight">
                  {slot.start_time.slice(0, 5)} - {slot.end_time.slice(0, 5)}{' '}
                  <span className="text-xs font-normal text-ebony/60 dark:text-cream/60">WITA</span>
                </p>
              </div>

              <div className="mt-4 flex items-center justify-between border-t border-cream/50 pt-3 dark:border-white/5">
                <span className="text-xs text-ebony/60 dark:text-cream/60">Tarif mulai</span>
                <p className="font-semibold text-base text-ebony dark:text-cream">
                  {formatCurrency(
                    slot.tiers?.find((tier) => tier.category === viewerCategory)?.price ?? slot.price ?? 0,
                    locale
                  )}
                </p>
              </div>
            </motion.button>
          ))
        ) : (
          <div className="col-span-2 rounded-3xl border border-cream/80 bg-white p-8 text-center dark:bg-charcoal dark:border-white/10">
            <p className="text-sm text-ebony/70 dark:text-cream/70">
              {t('booking.noSlots')}
            </p>
          </div>
        )}
      </div>
    </section>

    {/* BAGIAN KANAN - RINGKASAN PEMBELIAN */}
    <aside className="lg:w-[340px] w-full">
      <div className="rounded-3xl bg-white/90 backdrop-blur-md p-6 shadow-lg dark:bg-white/10 dark:shadow-none">
        <h3 className="font-semibold text-sm text-gold uppercase tracking-[0.2em]">
          {t('booking.summary')}
        </h3>

        <div className="mt-5 space-y-5 text-sm">
          {/* Slot & Jadwal */}
          <div>
            <p className="text-[11px] uppercase text-ebony/60 dark:text-cream/60 mb-1">{t('booking.slot')}</p>
            <p className="text-base font-semibold">
              {selectedSlot ? selectedSlot.ticket_name : (
                <span className="text-ebony/40 dark:text-cream/50">{t('booking.notSelected')}</span>
              )}
            </p>
            {selectedSlot && (
              <div className="mt-2.5 rounded-2xl bg-ebony/5 p-3 dark:bg-white/5 space-y-1.5 text-xs">
                <div className="flex items-center gap-2 text-ebony/80 dark:text-cream/80">
                  <Calendar size={14} className="text-gold shrink-0" />
                  <span className="font-medium">{formatDateFull(selectedSlot.visit_date, locale)}</span>
                </div>
                <div className="flex items-center gap-2 text-ebony/80 dark:text-cream/80">
                  <Clock size={14} className="text-gold shrink-0" />
                  <span className="font-medium">{selectedSlot.start_time.slice(0, 5)} - {selectedSlot.end_time.slice(0, 5)} WITA</span>
                </div>
              </div>
            )}
          </div>

          {/* Jumlah Orang per Tarif */}
          <div>
            <p className="text-[11px] uppercase text-ebony/60 dark:text-cream/60 mb-2">{t('booking.people')}</p>
            {selectedSlot ? (
              <div className="space-y-3">
                {visibleTiers.map((tier) => (
                  <div key={tier.category} className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold">
                        {tier.category === 'international' || tier.category === 'domestic'
                          ? t(tier.category === 'international' ? 'booking.internationalTier' : 'booking.domesticTier')
                          : tier.label}
                      </p>
                      <p className="text-xs text-ebony/60 dark:text-cream/60">
                        {formatCurrency(tier.price, locale)} {t('ticket.perPerson')}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <button
                        type="button"
                        aria-label={`${t('booking.decrease')} ${tier.category}`}
                        onClick={() =>
                          setCounts((c) => ({ ...c, [tier.category]: Math.max(0, (c[tier.category] || 0) - 1) }))
                        }
                        className="h-8 w-8 rounded-full border border-cream/70 text-lg leading-none hover:bg-cream/40 dark:border-white/20"
                      >
                        −
                      </button>
                      <span className="w-5 text-center text-lg font-semibold">{counts[tier.category] || 0}</span>
                      <button
                        type="button"
                        aria-label={`${t('booking.increase')} ${tier.category}`}
                        disabled={totalGuests >= Math.min(10, selectedSlot.quota_remaining)}
                        onClick={() =>
                          setCounts((c) => ({ ...c, [tier.category]: (c[tier.category] || 0) + 1 }))
                        }
                        className="h-8 w-8 rounded-full border border-cream/70 text-lg leading-none hover:bg-cream/40 disabled:cursor-not-allowed disabled:opacity-40 dark:border-white/20"
                      >
                        +
                      </button>
                    </div>
                  </div>
                ))}
                {otherTiers.length > 0 && !showOtherTiers && (
                  <button
                    type="button"
                    onClick={() => setShowOtherTiers(true)}
                    className="text-xs font-semibold text-gold underline-offset-2 hover:underline"
                  >
                    {viewerCategory === 'international'
                      ? t('booking.askDomestic')
                      : t('booking.askInternational')}
                  </button>
                )}
                <p className="text-xs text-ebony/60 dark:text-cream/60">
                  {t('booking.maxTickets')}
                </p>
              </div>
            ) : (
              <p className="text-sm text-ebony/40 dark:text-cream/50">{t('booking.selectSessionFirst')}</p>
            )}
          </div>

          {/* Total Pembayaran */}
          <div className="border-t border-cream/40 pt-4">
            <div className="flex justify-between items-center">
              <p className="text-sm font-medium">{t('booking.total')}</p>
              <span className="text-lg font-semibold text-gold">
                {selectedSlot && totalGuests ? formatCurrency(totalPrice, locale) : '-'}
              </span>
            </div>
            <p className="mt-1 text-xs text-ebony/60 dark:text-cream/60">
              {totalGuests
                ? `${totalGuests} ${t(totalGuests === 1 ? 'booking.guestOne' : 'booking.guests')}${
                    counts.domestic && counts.international
                      ? ` (${counts.domestic} WNI + ${counts.international} WNA)`
                      : ''
                  }`
                : t('booking.noGuests')}
            </p>
          </div>
        </div>

        {/* Tombol Bayar */}
        <button
          onClick={handlePay}
          disabled={!isReady}
          className="mt-6 w-full rounded-xl bg-gold py-3 text-sm font-semibold text-ebony shadow transition hover:-translate-y-0.5 hover:shadow-lg disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {isReady ? t('booking.pay') : t('booking.loadingPay')}
        </button>
      </div>
    </aside>
  </div>
</main>

      <Footer />
    </div>
  );
};

export default BookingPage;
