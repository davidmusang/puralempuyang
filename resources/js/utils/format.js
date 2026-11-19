// Format mata uang mengikuti bahasa yang sedang aktif.
//
// Rupiah tetap mata uangnya, hanya penulisannya yang menyesuaikan pembaca:
// "Rp 30.000" untuk pembaca Indonesia, "IDR 30,000" untuk pembaca asing.
// Lambang "Rp" tidak dikenal luas di luar Indonesia, sedangkan "IDR" adalah
// kode ISO 4217 yang dipakai secara internasional.

export const formatCurrency = (value, locale = 'id') => {
  const amount = Number(value || 0);
  return locale === 'en'
    ? `IDR ${amount.toLocaleString('en-US')}`
    : `Rp ${amount.toLocaleString('id-ID')}`;
};

// Bentuk ringkas untuk sumbu grafik: "Rp 180k" / "IDR 180k".
export const formatCurrencyCompact = (value, locale = 'id') => {
  const thousands = Number(value || 0) / 1000;
  return `${locale === 'en' ? 'IDR' : 'Rp'} ${thousands.toFixed(0)}k`;
};

export const numberLocale = (locale = 'id') => (locale === 'en' ? 'en-US' : 'id-ID');

export const parseLocalDate = (dateStr) => {
  if (!dateStr) return null;
  if (typeof dateStr === 'string') {
    const clean = dateStr.split('T')[0];
    const parts = clean.split('-');
    if (parts.length === 3) {
      const year = Number(parts[0]);
      const month = Number(parts[1]) - 1;
      const day = Number(parts[2]);
      return new Date(year, month, day);
    }
  }
  return new Date(dateStr);
};

export const formatDate = (dateStr, locale = 'id') => {
  const date = parseLocalDate(dateStr);
  if (!date || Number.isNaN(date.getTime())) return '-';
  return date.toLocaleDateString(locale === 'en' ? 'en-US' : 'id-ID', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
};

export const formatDateFull = (dateStr, locale = 'id') => {
  const date = parseLocalDate(dateStr);
  if (!date || Number.isNaN(date.getTime())) return '-';
  return date.toLocaleDateString(locale === 'en' ? 'en-US' : 'id-ID', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
};

