import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import toast from 'react-hot-toast';
import Navbar from '../components/Navbar';
import Footer from '../components/Footer';
import api, { endpoints } from '../services/api';

const ResetPasswordPage = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const token = searchParams.get('token') || '';
  const initialEmail = searchParams.get('email') || '';

  const [email, setEmail] = useState(initialEmail);
  const [password, setPassword] = useState('');
  const [passwordConfirmation, setPasswordConfirmation] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!token) {
      toast.error('Token reset tidak ditemukan. Silakan minta link reset baru.');
      return;
    }
    if (password.length < 8) {
      toast.error('Password baru minimal 8 karakter');
      return;
    }
    if (password !== passwordConfirmation) {
      toast.error('Konfirmasi password tidak cocok');
      return;
    }

    setLoading(true);
    try {
      const { data } = await api.post(endpoints.resetPassword, {
        email: email.trim(),
        token,
        password,
        password_confirmation: passwordConfirmation,
      });
      toast.success(data?.message || 'Password berhasil diperbarui');
      navigate('/login', { replace: true });
    } catch (error) {
      toast.error(error.response?.data?.message || 'Gagal mereset password');
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
          <p className="text-sm uppercase tracking-[0.4em] text-gold">Password Baru</p>
          <h1 className="mt-2 font-display text-3xl">Atur Ulang Password</h1>

          {!token ? (
            <div className="mt-6 rounded-2xl border border-red-400/40 bg-red-500/10 p-4 text-xs text-red-700 dark:text-red-300">
              Link reset password tidak lengkap atau tidak valid.{' '}
              <Link to="/forgot-password" className="underline font-semibold">
                Minta link baru di sini
              </Link>
              .
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
                  className="mt-2 w-full rounded-2xl border border-cream/60 bg-transparent px-3 py-2 dark:border-white/20"
                />
              </div>
              <div>
                <label className="text-xs font-semibold">Password Baru (min. 8 karakter)</label>
                <input
                  type="password"
                  required
                  minLength={8}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="mt-2 w-full rounded-2xl border border-cream/60 bg-transparent px-3 py-2 dark:border-white/20"
                />
              </div>
              <div>
                <label className="text-xs font-semibold">Konfirmasi Password Baru</label>
                <input
                  type="password"
                  required
                  minLength={8}
                  value={passwordConfirmation}
                  onChange={(e) => setPasswordConfirmation(e.target.value)}
                  className="mt-2 w-full rounded-2xl border border-cream/60 bg-transparent px-3 py-2 dark:border-white/20"
                />
              </div>
              <button
                type="submit"
                disabled={loading}
                className="w-full rounded-2xl bg-gold py-3 text-sm font-semibold text-ebony disabled:opacity-60"
              >
                {loading ? 'Menyimpan...' : 'Simpan Password Baru'}
              </button>
            </form>
          )}

          <p className="mt-6 text-center text-xs text-ebony/70 dark:text-cream/70">
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

export default ResetPasswordPage;
