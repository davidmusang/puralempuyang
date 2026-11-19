import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import api, { endpoints } from '../../services/api';
import toast from 'react-hot-toast';

const PhotoQueuePanel = () => {
  const queryClient = useQueryClient();
  const { data: points } = useQuery({
    queryKey: ['photo-points'],
    queryFn: async () => (await api.get(endpoints.photoPoints)).data.data || [],
  });
  const [pointId, setPointId] = useState(null);
  useEffect(() => {
    if (!pointId && points?.length) setPointId(points[0].id);
  }, [points, pointId]);

  const todayISO = new Date().toLocaleDateString('en-CA');
  const [selectedDate, setSelectedDate] = useState(todayISO);

  const { data: queueData } = useQuery({
    queryKey: ['photo-queue', pointId, selectedDate],
    queryFn: async () => {
      if (!pointId) return [];
      const { data } = await api.get(endpoints.photoQueueList, { params: { point_id: pointId, date: selectedDate } });
      return data.data || [];
    },
    enabled: Boolean(pointId),
    refetchInterval: 5000,
  });

  const callNext = useMutation({
    mutationFn: async () => (await api.post(endpoints.photoCallNext, { point_id: pointId, date: selectedDate })).data,
    onSuccess: () => { toast.success('Memanggil antrean berikut'); queryClient.invalidateQueries({ queryKey: ['photo-queue', pointId] }); },
    onError: () => toast.error('Gagal memanggil'),
  });
  const markShooting = useMutation({
    mutationFn: async (entry_id) => (await api.post(endpoints.photoMarkShooting, { entry_id })).data,
    onSuccess: () => { toast.success('Mulai pemotretan'); queryClient.invalidateQueries({ queryKey: ['photo-queue', pointId] }); },
  });
  const complete = useMutation({
    mutationFn: async (entry_id) => (await api.post(endpoints.photoComplete, { entry_id })).data,
    onSuccess: () => { toast.success('Selesai'); queryClient.invalidateQueries({ queryKey: ['photo-queue', pointId] }); },
  });
  const skip = useMutation({
    mutationFn: async (entry_id) => (await api.post(endpoints.photoSkip, { entry_id })).data,
    onSuccess: () => { toast('Diskip'); queryClient.invalidateQueries({ queryKey: ['photo-queue', pointId] }); },
  });

  const list = queueData || [];
  const nowServing = list.find((e) => e.status === 'called' || e.status === 'shooting');

  const uploadFiles = async (e) => {
    const files = e.target.files;
    if (!nowServing || !files?.length) return;
    const fd = new FormData();
    fd.append('entry_id', nowServing.id);
    Array.from(files).forEach((f) => fd.append('files[]', f));
    try {
      await api.post(endpoints.photoUpload, fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      toast.success('Foto diunggah');
      queryClient.invalidateQueries({ queryKey: ['photo-queue', pointId, selectedDate] });
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Gagal unggah foto (format JPG/PNG/WebP maks. 5MB)');
    } finally {
      e.target.value = '';
    }
  };
  const waiting = list.filter((e) => e.status === 'waiting');
  const skipped = list.filter((e) => e.status === 'skipped');

  const recall = async (entry_id) => {
    try {
      await api.post(endpoints.photoRecall, { entry_id });
      toast.success('Dipanggil kembali');
      queryClient.invalidateQueries({ queryKey: ['photo-queue', pointId] });
    } catch (e) {
      toast.error('Gagal recall');
    }
  };

  // Countdown no-show for current 'called' entry
  const NO_SHOW_MINUTES = 3; // keep in sync with PHOTO_NO_SHOW_MINUTES (server)
  const [timeLeft, setTimeLeft] = useState(null);
  useEffect(() => {
    let timer;
    const tick = () => {
      if (!nowServing || nowServing.status !== 'called' || !nowServing.called_at) {
        setTimeLeft(null); return;
      }
      const started = new Date(nowServing.called_at).getTime();
      const deadline = started + NO_SHOW_MINUTES * 60 * 1000;
      const remain = Math.max(0, Math.floor((deadline - Date.now()) / 1000));
      setTimeLeft(remain);
    };
    tick();
    timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [nowServing?.id, nowServing?.status, nowServing?.called_at]);

  return (
    <section className="glass-panel rounded-3xl p-4 sm:p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm text-gold">Antrean Foto</p>
          <h3 className="font-display text-xl sm:text-2xl">Kelola Panggilan</h3>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
          <select
            className="w-full sm:w-auto rounded-xl border border-cream/60 bg-white px-3 py-2 text-sm text-ebony dark:border-white/20 dark:bg-ebony/60 dark:text-cream"
            value={pointId || ''}
            onChange={(e) => setPointId(Number(e.target.value))}
          >
            {(points || []).map((p) => (
              <option key={p.id} value={p.id} className="text-ebony">
                {p.name}
              </option>
            ))}
          </select>
          <div className="flex items-center gap-2">
            <input
              type="date"
              className="min-w-0 flex-1 sm:flex-none rounded-xl border border-cream/60 bg-transparent px-3 py-2 text-sm dark:border-white/20"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
            />
            <button
              type="button"
              onClick={() => callNext.mutate()}
              className="shrink-0 rounded-xl bg-gold px-4 py-2 text-sm font-semibold text-ebony"
            >
              Next
            </button>
          </div>
        </div>
      </div>

      <div className="mt-4 grid gap-4 md:grid-cols-[1.2fr_1fr]">
        <div className="rounded-2xl border border-cream/60 p-4 dark:border-white/10">
          <p className="text-xs uppercase tracking-[0.3em] text-gold">Now Serving</p>
          {nowServing ? (
            <div className="mt-3 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-3xl sm:text-4xl font-display">#{nowServing.queue_number}</p>
                <p className="text-sm text-ebony/70 dark:text-cream/70">Order #{nowServing.order_id}</p>
                {nowServing.status === 'called' && (
                  <p className="mt-1 text-xs text-amber-700 dark:text-amber-400">
                    Waktu tersisa: {timeLeft !== null ? `${Math.floor(timeLeft/60)}:${String(timeLeft%60).padStart(2,'0')}` : '-'} sebelum auto-skip
                  </p>
                )}
              </div>
              <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
                {nowServing.status !== 'shooting' && (
                  <button
                    type="button"
                    onClick={() => markShooting.mutate(nowServing.id)}
                    className="rounded-xl border border-cream/70 px-3 py-2 text-center text-sm font-medium dark:border-white/20"
                  >
                    Mulai
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => complete.mutate(nowServing.id)}
                  className="rounded-xl bg-gold px-3 py-2 text-center text-sm font-semibold text-ebony"
                >
                  Selesai
                </button>
                <button
                  type="button"
                  onClick={() => skip.mutate(nowServing.id)}
                  className="rounded-xl border border-cream/70 px-3 py-2 text-center text-sm font-medium dark:border-white/20"
                >
                  Skip
                </button>
                <label className="cursor-pointer rounded-xl border border-gold/60 bg-gold/10 px-3 py-2 text-center text-sm font-semibold text-gold">
                  Upload Foto
                  <input type="file" multiple accept="image/jpeg,image/png,image/webp" className="hidden" onChange={uploadFiles} />
                </label>
              </div>
            </div>
          ) : (
            <p className="mt-2 text-sm text-ebony/70 dark:text-cream/70">Belum ada panggilan aktif.</p>
          )}
        </div>

        <div className="rounded-2xl border border-cream/60 p-4 dark:border-white/10">
          <p className="text-xs uppercase tracking-[0.3em] text-gold">Waiting</p>
          <div className="mt-2 max-h-64 overflow-auto">
            {waiting.length ? (
              <ul className="space-y-2">
                {waiting.slice(0, 20).map((e) => (
                  <li key={e.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-cream/50 px-3 py-2 text-sm dark:border-white/10">
                    <span className="font-semibold">#{e.queue_number}</span>
                    <span className="text-ebony/70 dark:text-cream/70">Order #{e.order_id}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-ebony/70 dark:text-cream/70">Kosong.</p>
            )}
          </div>
        </div>
      </div>
      {/* Skipped & Recall */}
      <div className="mt-4 rounded-2xl border border-cream/60 p-4 dark:border-white/10">
        <p className="text-xs uppercase tracking-[0.3em] text-gold">Skipped (No-Show)</p>
        <div className="mt-2 max-h-48 overflow-auto">
          {skipped.length ? (
            <ul className="space-y-2">
              {skipped.slice(0, 10).map((e) => (
                <li key={e.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-cream/50 px-3 py-2 text-sm dark:border-white/10">
                  <span className="font-semibold">#{e.queue_number}</span>
                  <div className="flex items-center gap-2">
                    <span className="text-ebony/70 dark:text-cream/70">Order #{e.order_id}</span>
                    <button type="button" onClick={() => recall(e.id)} className="rounded-xl border border-cream/70 px-3 py-1 text-xs font-medium dark:border-white/20">Recall</button>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-ebony/70 dark:text-cream/70">Tidak ada yang di-skip.</p>
          )}
        </div>
      </div>

      {/* Daftar foto untuk entry aktif */}
      {nowServing?.assets?.length ? (
        <div className="mt-4 rounded-2xl border border-cream/60 p-4 dark:border-white/10">
          <p className="text-xs uppercase tracking-[0.3em] text-gold">Foto Terunggah</p>
          <div className="mt-3 grid grid-cols-2 gap-2.5 sm:grid-cols-3 md:grid-cols-4">
            {nowServing.assets.map((a) => {
              const photoUrl = a.url || `/photo-assets/${a.id}`;
              return (
                <a key={a.id} href={photoUrl} target="_blank" rel="noreferrer" className="block overflow-hidden rounded-xl border border-cream/50 dark:border-white/10">
                  <img src={photoUrl} alt="Foto" className="h-28 sm:h-32 w-full object-cover" />
                </a>
              );
            })}
          </div>
        </div>
      ) : null}
    </section>
  );
};

export default PhotoQueuePanel;
