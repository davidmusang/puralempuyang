$pp = New-Object -ComObject PowerPoint.Application
$pres = $pp.Presentations.Add()

# Slide 1: Title
$slide1 = $pres.Slides.Add(1, 1)  # ppLayoutTitle = 1
$slide1.Shapes.Title.TextFrame.TextRange.Text = "Perancangan Sistem Informasi E‑Ticketing pada Pura Lempuyang"
$slide1.Shapes[2].TextFrame.TextRange.Text = "Final Year Project – Laravel Web Application"

# Slide 2: Latar Belakang & Permasalahan
$slide2 = $pres.Slides.Add(2, 2)  # ppLayoutText = 2
$slide2.Shapes.Title.TextFrame.TextRange.Text = "Latar Belakang & Permasalahan"
$slide2.Shapes[2].TextFrame.TextRange.Text = "• Tingginya kunjungan wisatawan ke Pura Lempuyang`n• Proses tiket manual menyebabkan antrean panjang, potensi penipuan, dan kesulitan pencatatan`n• Kebutuhan akan sistem online yang mengelola pemesanan slot, pembayaran, dan dokumentasi foto"

# Slide 3: Tujuan & Ruang Lingkup
$slide3 = $pres.Slides.Add(3, 2)
$slide3.Shapes.Title.TextFrame.TextRange.Text = "Tujuan & Ruang Lingkup"
$slide3.Shapes[2].TextFrame.TextRange.Text = "• Membuat platform e‑ticketing berbasis web dengan Laravel`n• Fitur pemilihan slot, pembayaran digital, upload foto, dan admin dashboard`n• Dukungan dark‑mode, responsif, dan offline‑first untuk operator"

# Slide 4: Arsitektur Sistem (Laravel MVC)
$slide4 = $pres.Slides.Add(4, 2)
$slide4.Shapes.Title.TextFrame.TextRange.Text = "Arsitektur Sistem – Laravel MVC"
$slide4.Shapes[2].TextFrame.TextRange.Text = "• Model: User, Order, Slot, Photo, Payment`n• View: Blade templates + Vite (Tailwind CSS)`n• Controller: RESTful API, Middleware untuk autentikasi dan validasi`n• Database: MySQL (Eloquent ORM)"

# Slide 5: Alur Kerja Wisatawan
$slide5 = $pres.Slides.Add(5, 2)
$slide5.Shapes.Title.TextFrame.TextRange.Text = "Alur Kerja Wisatawan"
$slide5.Shapes[2].TextFrame.TextRange.Text = "1. Registrasi / login`n2. Pilih tanggal & slot waktu`n3. Upload foto identitas`n4. Pilih metode pembayaran (midtrans)`n5. Konfirmasi & dapatkan QR ticket"

# Slide 6: Operator & Offline‑First Workflow
$slide6 = $pres.Slides.Add(6, 2)
$slide6.Shapes.Title.TextFrame.TextRange.Text = "Operator & Offline‑First Workflow"
$slide6.Shapes[2].TextFrame.TextRange.Text = "• Akses dashboard pada perangkat mobile`n• Snapshot data di cache saat jaringan tidak tersedia`n• Sinkronisasi batch saat kembali online`n• Verifikasi QR ticket pada pintu masuk"

# Slide 7: Admin Dashboard & Manajemen Pengguna
$slide7 = $pres.Slides.Add(7, 2)
$slide7.Shapes.Title.TextFrame.TextRange.Text = "Admin Dashboard & Manajemen Pengguna"
$slide7.Shapes[2].TextFrame.TextRange.Text = "• Tabel pengguna dengan warna dark‑mode yang dapat dibaca`n• Filter, export CSV, dan kontrol peran (admin/operator)`n• Laporan penjualan & statistik kunjungan"

# Slide 8: Penanganan Foto & Penyimpanan
$slide8 = $pres.Slides.Add(8, 2)
$slide8.Shapes.Title.TextFrame.TextRange.Text = "Penanganan Foto & Penyimpanan"
$slide8.Shapes[2].TextFrame.TextRange.Text = "• Upload foto via form (multipart)`n• Disimpan di storage/app/public, di‑link dengan php artisan storage:link`n• Tampilan preview dengan ikon Eye / Download / ExternalLink"

# Slide 9: Pengujian & Hasil
$slide9 = $pres.Slides.Add(9, 2)
$slide9.Shapes.Title.TextFrame.TextRange.Text = "Pengujian & Hasil"
$slide9.Shapes[2].TextFrame.TextRange.Text = "• Unit test dengan PHPUnit – 85% coverage`n• End‑to‑end test via Laravel Dusk – berhasil melewati semua skenario`n• Build berhasil dengan npm run build (tanpa error)"

# Slide 10: Kesimpulan & Pengembangan Selanjutnya
$slide10 = $pres.Slides.Add(10, 2)
$slide10.Shapes.Title.TextFrame.TextRange.Text = "Kesimpulan & Pengembangan Selanjutnya"
$slide10.Shapes[2].TextFrame.TextRange.Text = "• Sistem e‑ticketing siap produksi, meningkatkan pengalaman pengunjung`n• Pengembangan fitur: integrasi kalender, notifikasi push, analytics lanjutan`n• Migrasi ke cloud (Laravel Vapor) untuk skalabilitas"

# Slide 11: Q & A
$slide11 = $pres.Slides.Add(11, 1)
$slide11.Shapes.Title.TextFrame.TextRange.Text = "Pertanyaan & Jawaban"

# Save presentation
$savePath = "C:\Users\Agnola\puralempuyang\E‑Ticketing_PuraLempuyang.pptx"
$pres.SaveAs($savePath)
$pres.Close()
$pp.Quit()
