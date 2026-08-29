# SYNPLAN — PHASE 15: MANUAL TESTING GUIDE

Dokumen panduan pengujian manual autentikasi OAuth untuk developer.

---

## 1. Persyaratan Pengujian OAuth Riil

> [!IMPORTANT]
> Pengujian tombol login Google & GitHub di browser memerlukan Client ID & Client Secret riil yang dikonfigurasikan di file `.env`.  
> Jika belum dikonfigurasi, mengklik tombol login akan menampilkan pesan peringatan yang elegan di halaman login (`google_not_configured` / `github_not_configured`).

---

## 2. Checklist Pengujian Manual

### A. Autentikasi & Sesi (Memerlukan Kredensial OAuth)
- [ ] **Login dengan Google**: Klik tombol `[ Continue with Google ]` di `/login`, selesaikan otorisasi di Google, dan pastikan diarahkan ke dashboard dengan sesi aktif.
- [ ] **Login dengan GitHub**: Klik tombol `[ Continue with GitHub ]` di `/login`, selesaikan otorisasi di GitHub, dan pastikan diarahkan ke dashboard dengan sesi aktif.
- [ ] **Logout**: Klik avatar di pojok kanan atas topbar $\rightarrow$ klik `[ Sign out ]` $\rightarrow$ konfirmasi `[ Sign Out ]` $\rightarrow$ pastikan diarahkan kembali ke `/login` dan cookie sesi dihapus.
- [ ] **Refresh Saat Login**: Tekan F5 saat berada di dashboard $\rightarrow$ pastikan profil pengguna, avatar, dan workspace tetap termuat tanpa ter-logout.
- [ ] **Buka Rute Terproteksi Saat Logout**: Setelah logout, akses `/tasks` atau `/projects` $\rightarrow$ pastikan permintaan terproteksi atau diarahkan ke `/login`.

### B. Profil & Ruang Kerja (Workspace)
- [ ] **Verifikasi Profil Pengguna**: Buka menu avatar di topbar $\rightarrow$ pastikan nama dan email yang tampil sesuai dengan akun Google/GitHub yang login.
- [ ] **Verifikasi Workspace**: Pastikan workspace aktif pengguna terpilih secara otomatis di sidebar.
- [ ] **Verifikasi Team**: Buka `/team` $\rightarrow$ pastikan data anggota workspace muncul sesuai peran (OWNER / ADMIN / MEMBER).
- [ ] **Verifikasi Tasks**: Buka `/tasks` $\rightarrow$ pastikan daftar task dan kanban board dapat diakses.

### C. Integrasi AI Assistant
- [ ] **Verifikasi AI Assistant**: Klik tombol `[ AI Assistant ]` di topbar $\rightarrow$ buka drawer $\rightarrow$ ketik perintah project.
- [ ] **Uji AI Entity Resolution**: Ketik `"tambahkan Marchel ke task ini"` $\rightarrow$ pastikan resolusi anggota tim dan konfirmasi berjalan lancar.
