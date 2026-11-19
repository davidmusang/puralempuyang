import { useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import toast from 'react-hot-toast';
import Navbar from '../components/Navbar';
import Footer from '../components/Footer';
import api, { endpoints } from '../services/api';

const ForgotPasswordPage = () => {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!email.trim()) {
      toast.error('Masukkan email Anda terlebih dahulu');
      return;
    }
    setLoading(true);
    try {
      const { data } = await api.post(endpoints.forgotPassword, { email: email.trim() });
      setSent(true);
      toast.success(data?.message || 'Link reset password telah dikirim');
    } catch (error) {
      toast.error(error.response?.data?.message || 'Gagal mengirim link reset password');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-cream text-ebony dark:bg-ebony dark:text-cream">
      <Navbar />
      <main className="flex min-h-screen items-center justify-center px-6 pt-24">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="glass-panel w-full max-w-md rounded-3xl border border-cream/60 bg-white/95 px-8 py-10 shadow-2xl dark:border-white/10 dark:bg-ebony/90"
        >
          <p className="text-sm uppercase tracking-[0.4em] text-gold">Pemulihan Akun</p>
          <h1 className="mt-2 font-display text-3xl">Lupa Password</h1>
          <p className="mt-2 text-xs text-ebony/70 dark:text-cream/70">
            Masukkan email yang terdaftar. Kami akan mengirimkan tautan untuk mengatur ulang password Anda.
          </p>

          {sent ? (
            <div className="mt-6 rounded-2xl border border-gold/40 bg-gold/10 p-4 text-sm text-ebony dark:text-cream">
              <p className="font-semibold">Periksa Email Anda</p>
              <p className="mt-1 text-xs text-ebony/80 dark:text-cream/80">
                Jika email <strong>{email}</strong> terdaftar, kami telah mengirimkan link reset password. Cek folder
                Inbox maupun Spam.
              </p>
            </div>
          ) : (
            <form className="mt-8 space-y-4" onSubmit={handleSubmit}>
              <div>
                <label className="text-xs font-semibold">Email</label>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="nama@email.com"
                  className="mt-2 w-full rounded-2xl border border-cream/60 bg-transparent px-3 py-2 dark:border-white/20"
                />
              </div>
              <button
                type="submit"
                disabled={loading}
                className="w-full rounded-2xl bg-gold py-3 text-sm font-semibold text-ebony disabled:opacity-60"
              >
                {loading ? 'Mengirim...' : 'Kirim Link Reset Password'}
              </button>
            </form>
          )}

          <p className="mt-6 text-center text-xs text-ebony/70 dark:text-cream/70">
            Ingat password Anda?{' '}
            <Link to="/login" className="text-gold">
              Kembali ke Login
            </Link>
          </p>
        </motion.div>
      </main>
      <Footer />
    </div>
  );
};

export default ForgotPasswordPage;
