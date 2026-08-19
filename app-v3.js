const SYNC_LOGO_URL = 'https://blogger.googleusercontent.com/img/a/AVvXsEiKXQ1HoCQBJcO1Zya9IHEm0K31XGPxH5bWo-8HcJMDOPyhAyR3bQ16tXmMCKbFo5_lscfqiFYoooE653fOpUWbbu4vM8xmbRIRUmGnit0rWbzM3r6GOm_7426jITbxvlAI9TeKLLWOdcSrLd5FiDzytpG4R0EBKOX1oQfWXfITHtllsRE9__2nCK4ZDsA';

/**
 * app.js - PinjamAlat Main Application Logic
 */

const app = {
    state: {
        user: null, // {id, username, role, full_name}
        isOnline: navigator.onLine,
        data: {
            alat: [],
            kategori: [],
            jurusan: [],
            peminjaman: []
        },
        alatViewMode: 'list',
        alatPage: 1,
        alatLimit: 50,
        alatSort: { column: '', dir: 'asc' },
        bahanSort: { column: '', dir: 'asc' },
        alatStatusFilter: '',
        bahanStatusFilter: '',
        riwayatStatusFilter: ''
    },

    init: async function () {
        this.bindEvents();
        this.checkNetworkStatus();

        // Initial sync data dipindah ke app.showMainView agar tidak memblokir antarmuka login user

        // Check if user is logged in
        const savedUser = localStorage.getItem('pinjamalat_user');
        if (savedUser) {
            this.state.user = JSON.parse(savedUser);
            this.showMainView();
            // Lakukan sinkronisasi pasif ke db lokal jika ada update
            if (this.state.user.id) {
                db.stores.users.getItem(String(this.state.user.id)).then(u => {
                    if (u && u.foto && u.foto !== this.state.user.foto) {
                        this.state.user.foto = u.foto; // Update dengan link asli dari drive
                        localStorage.setItem('pinjamalat_user', JSON.stringify(this.state.user));
                        this.updateHeaderProfile();
                    }
                }).catch(() => { });
            }
        } else {
            this.showLoginView();
        }
    },

    bindEvents: function () {
        // Login Form
        document.getElementById('login-form').addEventListener('submit', (e) => {
            e.preventDefault();
            this.handleLogin();
        });

        // Logout
        document.getElementById('btn-logout').addEventListener('click', () => {
            this.handleLogout();
        });
        document.getElementById('btn-logout-mobile')?.addEventListener('click', () => {
            this.handleLogout();
        });

        // Test Koneksi
        document.getElementById('btn-test-koneksi')?.addEventListener('click', () => {
            this.testKoneksi();
        });

        // Profile Form
        document.getElementById('profile-form')?.addEventListener('submit', (e) => {
            e.preventDefault();
            this.saveProfile();
        });

        // Sidebar Navigation
        document.querySelectorAll('.nav-links li').forEach(item => {
            item.addEventListener('click', (e) => {
                e.preventDefault();
                const target = item.getAttribute('data-target');
                if (target) {
                    this.navigate(target);
                }
            });
        });

        // Mobile Sidebar Toggle
        document.getElementById('menu-toggle').addEventListener('click', () => {
            this.openSidebar();
        });
        document.getElementById('close-sidebar-btn').addEventListener('click', () => {
            this.closeSidebar();
        });
        document.getElementById('sidebar-backdrop')?.addEventListener('click', () => {
            this.closeSidebar();
        });

        // User Form
        document.getElementById('user-form')?.addEventListener('submit', (e) => {
            e.preventDefault();
            this.saveUser();
        });

        // Kategori Form
        document.getElementById('kategori-form')?.addEventListener('submit', (e) => {
            e.preventDefault();
            this.saveKategori();
        });

        // Alat Form
        document.getElementById('alat-form')?.addEventListener('submit', (e) => {
            e.preventDefault();
            this.saveAlat();
        });

        // Peminjaman Form
        document.getElementById('form-peminjaman')?.addEventListener('submit', (e) => {
            e.preventDefault();
            this.savePeminjaman(e);
        });

        // Edit Peminjaman Form
        document.getElementById('edit-peminjaman-form')?.addEventListener('submit', (e) => {
            e.preventDefault();
            this.saveEditPeminjaman(e);
        });

        // Bahan Form
        document.getElementById('bahan-form')?.addEventListener('submit', (e) => {
            e.preventDefault();
            this.saveBahan();
        });

        // Bahan Checkout Form
        document.getElementById('bahan-checkout-form')?.addEventListener('submit', (e) => {
            e.preventDefault();
            this.saveBahanCheckout();
        });

        // Network Status
        window.addEventListener('online', () => this.updateNetworkStatus(true));
        window.addEventListener('offline', () => this.updateNetworkStatus(false));

        // Global Barcode Scanner Gun Listener (USB / Bluetooth Hardware Scanner)
        let barcodeBuffer = '';
        let lastKeyTime = Date.now();

        window.addEventListener('keydown', (e) => {
            const activeElem = document.activeElement;
            const isInputFocused = activeElem && (activeElem.tagName === 'INPUT' || activeElem.tagName === 'TEXTAREA' || activeElem.isContentEditable);
            
            // Allow if nothing is focused or if focused in #barcode-gun-input
            if (isInputFocused && activeElem.id !== 'barcode-gun-input') {
                return;
            }

            const currentTime = Date.now();
            const timeDiff = currentTime - lastKeyTime;
            lastKeyTime = currentTime;

            if (e.key === 'Enter') {
                if (barcodeBuffer.length >= 2) {
                    const scanned = barcodeBuffer.trim();
                    barcodeBuffer = '';
                    this.handleScanResult(scanned);
                }
                barcodeBuffer = '';
            } else if (e.key && e.key.length === 1) {
                // If keys come rapidly (< 80ms between characters), it is a barcode scanner gun
                if (timeDiff > 120) {
                    barcodeBuffer = '';
                }
                barcodeBuffer += e.key;
            }
        });
    },

    testKoneksi: async function () {
        if (!navigator.onLine) {
            return await this.showDialog('Peringatan', 'Anda sedang offline!', 'error');
        }
        if (!db.GAS_URL || db.GAS_URL.includes('REPLACE')) {
            return await this.showDialog('Peringatan', 'GAS URL belum diatur di db.js!', 'error');
        }

        this.showLoading('Menguji koneksi ke Server...');
        try {
            const resp = await fetch(db.GAS_URL + '?action=get_data', { redirect: 'follow' });
            const text = await resp.text();
            this.hideLoading();

            try {
                const data = JSON.parse(text);
                if (data.status === 'success') {
                    await this.showDialog('Berhasil', 'Koneksi Sukses! Berhasil ditarik ' + (data.users ? data.users.length : 0) + ' data User dari Google Sheet.\nSilakan coba login ulang.', 'alert');
                    // Paksa simpan database lokal khusus users agar bisa langsung login
                    if (data.users) await db.saveMasterData('users', data.users);
                } else {
                    await this.showDialog('Gagal', 'Respons JSON ok, tetapi gagal tarik data:\n' + JSON.stringify(data), 'error');
                }
            } catch (jsonErr) {
                console.error("Non-JSON Response: ", text);
                await this.showDialog('Gagal', 'Gagal parsing JSON. Pastikan Web App GAS diatur "Who has access: Anyone".\nBisa jadi terblokir login Google (HTML page).\nRespons HTTP: ' + resp.status + '\n\nKutipan Teks:\n' + text.substring(0, 150), 'error');
            }
        } catch (e) {
            this.hideLoading();
            await this.showDialog('Error', 'Fetch gagal (CORS error / koneksi terputus).\nError: ' + e.message, 'error');
            console.error(e);
        }
    },

    handleLogin: async function () {
        const username = document.getElementById('login-username').value;
        const password = document.getElementById('login-password').value;

        if (!username || !password) return;

        this.showLoading('Memverifikasi...');

        try {
            let users = await db.getAll('users');
            // Check credentials (ignoring accidental trailing spaces)
            let user = users.find(u =>
                String(u.username || '').trim() === String(username).trim() &&
                String(u.password || '').trim() === String(password).trim()
            );

            // Fetch from server if user not found, and we are online (prevents empty DB login issues)
            if (!user && navigator.onLine && username !== 'admin') {
                this.showLoading('Mencari data pengguna baru di server...');
                await db.fetchServerData();
                users = await db.getAll('users');
                user = users.find(u =>
                    String(u.username || '').trim() === String(username).trim() &&
                    String(u.password || '').trim() === String(password).trim()
                );
            }

            this.hideLoading();

            if (user) {
                this.state.user = {
                    id: user.id || user.newId,
                    username: user.username,
                    full_name: user.full_name,
                    role: user.role,
                    jurusan_id: user.jurusan_id,
                    foto: user.foto || ''
                };

                localStorage.setItem('pinjamalat_user', JSON.stringify(this.state.user));
                this.showMainView();
            } else {
                this.showToast('Login gagal. Periksa username dan password.', 'error');
            }

            // If users table is empty and admin is trying, create default admin offline
            if (users.length === 0 && username === 'admin' && password === 'admin') {
                this.showToast('Login dengan akun default karena db kosong.', 'warning');
                this.state.user = { id: 0, username: 'admin', full_name: 'Super Admin', role: 'Admin', jurusan_id: 1 };
                localStorage.setItem('pinjamalat_user', JSON.stringify(this.state.user));
                this.showMainView();
            }
        } catch (e) {
            this.hideLoading();
            this.showToast('Terjadi kesalahan pada database.', 'error');
            console.error(e);
        }
    },

    handleLogout: function () {
        this.state.user = null;
        localStorage.removeItem('pinjamalat_user');
        this.showLoginView();
    },

    showLoginView: function () {
        document.getElementById('main-view').classList.add('hidden');
        document.getElementById('login-view').classList.remove('hidden');
        document.getElementById('login-view').classList.add('section-active');
    },

    showMainView: function () {
        document.getElementById('login-view').classList.add('hidden');
        document.getElementById('login-view').classList.remove('section-active');
        document.getElementById('main-view').classList.remove('hidden');

        // Update User Profile UI
        this.updateHeaderProfile();

        // Handle Role-based UI constraints
        this.applyRoleConstraints();

        // Initialize Bottom Navigation and mobile helpers
        this.initBottomNav();
        this.initMobileNavigation();

        // Pemicu sinkronisasi asinkronous transparan di balakang layar
        db.onSyncSuccess = () => {
            this.loadActivePeminjaman();
            this.loadRiwayat();
            this.loadDashboard();
        };
        db.onSyncPartial = () => {
            this.loadActivePeminjaman();
            this.loadRiwayat();
            this.loadDashboard();
        };
        // Task yang gagal disinkronkan berkali-kali (kemungkinan data korup/tidak valid)
        // dibuang otomatis oleh db.js agar tidak menyumbat antrean selamanya.
        // Beri tahu pengguna secara eksplisit alih-alih diam-diam menghilang.
        db.onSyncTaskDropped = (task) => {
            this.showToast(`Sebagian perubahan (${task.storeName}) gagal disinkronkan ke server setelah beberapa percobaan dan dibatalkan. Mohon periksa/ulangi input data tersebut.`, 'error');
        };
        this.backgroundSync();

        // Initial badge and section state
        this.loadActivePeminjaman();
        this.navigate('dashboard');
    },
    
    // ===== MOBILE NAVIGATION ENHANCEMENTS =====
    initMobileNavigation: function() {
        const isMobile = window.matchMedia('(max-width: 768px)').matches;
        if (!isMobile) return;

        const sidebar = document.getElementById('sidebar');
        const contentWrapper = document.querySelector('.content-wrapper');

        contentWrapper?.addEventListener('click', () => {
            if (sidebar?.classList.contains('open')) {
                this.closeSidebar();
            }
        });

        window.addEventListener('popstate', () => {
            if (sidebar?.classList.contains('open')) {
                this.closeSidebar();
            }
        });
    },

    updateHeaderProfile: function () {
        if (!this.state.user) return;
        this.updateSidebarJurusan();
        const nameForInitial = this.state.user.full_name || this.state.user.username || '?';
        const initial = encodeURIComponent(nameForInitial.charAt(0).toUpperCase());
        const defaultAvatar = `data:image/svg+xml;charset=UTF-8,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%2248%22 height=%2248%22%3E%3Crect width=%2248%22 height=%2248%22 rx=%2224%22 fill=%22%23343A40%22/%3E%3Ctext x=%2224%22 y=%2228%22 font-size=%2224%22 fill=%22%23F8FAFC%22 text-anchor=%22middle%22 dominant-baseline=%22middle%22%3E${initial}%3C/text%3E%3C/svg%3E`;

        document.getElementById('user-name-display').textContent = nameForInitial;
        const roleBadge = document.getElementById('user-role-badge');
        roleBadge.textContent = this.state.user.role;
        roleBadge.style.background = this.state.user.role === 'Admin' ? 'var(--primary)' : 'var(--success)';
        roleBadge.style.color = this.state.user.role === 'Admin' ? '#fff' : '#000';
        const avatarEl = document.getElementById('user-avatar');
        if (this.state.user.foto) {
            const avatarUrl = this.getDriveImageUrl(this.state.user.foto);
            avatarEl.dataset.fallbackTried = '0';
            avatarEl.onerror = () => {
                if (this.state.user.foto && avatarEl.dataset.fallbackTried === '0') {
                    avatarEl.dataset.fallbackTried = '1';
                    avatarEl.src = this.state.user.foto; // fallback to original URL if Drive thumbnail fails
                    return;
                }
                avatarEl.src = defaultAvatar;
                avatarEl.classList.add('no-avatar');
            };
            avatarEl.src = avatarUrl;
            avatarEl.classList.remove('no-avatar');
        } else {
            avatarEl.src = defaultAvatar;
            avatarEl.classList.add('no-avatar');
        }
    },

    updateSidebarJurusan: async function () {
        const jurusanEl = document.getElementById('sidebar-jurusan-name');
        if (!jurusanEl || !this.state.user) return;

        if (this.state.user.role === 'Admin') {
            jurusanEl.textContent = 'Semua Jurusan';
            return;
        }

        try {
            const jurusanList = await db.getAll('jurusan');
            const jurusan = jurusanList.find(item => String(item.id || item.newId) === String(this.state.user.jurusan_id));
            jurusanEl.textContent = jurusan?.nama || jurusan?.kode || `Jurusan ${this.state.user.jurusan_id || '-'}`;
        } catch (error) {
            jurusanEl.textContent = `Jurusan ${this.state.user.jurusan_id || '-'}`;
        }
    },

    openProfileModal: function () {
        document.getElementById('prof-nama').value = this.state.user.full_name || '';
        document.getElementById('prof-username').value = this.state.user.username || '';
        document.getElementById('prof-password').value = '';

        const img = document.getElementById('prof-foto-img');
        const icon = document.getElementById('prof-foto-icon');
        if (this.state.user.foto) {
            img.onerror = () => {
                img.style.display = 'none';
                icon.style.display = 'block';
            };
            img.src = this.getDriveImageUrl(this.state.user.foto);
            img.style.display = 'block';
            icon.style.display = 'none';
        } else {
            img.style.display = 'none';
            icon.style.display = 'block';
        }
        document.getElementById('prof-foto-url').textContent = this.state.user.foto || '';
        this.openModal('profile-modal');
    },

    handleProfFotoUpload: function (e) {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (evt) => {
            const imgEl = new Image();
            imgEl.onload = () => {
                const canvas = document.createElement('canvas');
                const ctx = canvas.getContext('2d');
                const MAX_WIDTH = 300;
                let scaleSize = 1;
                if (imgEl.width > MAX_WIDTH) scaleSize = MAX_WIDTH / imgEl.width;
                canvas.width = imgEl.width * scaleSize;
                canvas.height = imgEl.height * scaleSize;
                ctx.drawImage(imgEl, 0, 0, canvas.width, canvas.height);
                const dataUrl = canvas.toDataURL('image/jpeg', 0.85); // kompresi kualitas

                document.getElementById('prof-foto-url').textContent = dataUrl;
                const img = document.getElementById('prof-foto-img');
                img.src = dataUrl;
                img.style.display = 'block';
                document.getElementById('prof-foto-icon').style.display = 'none';
            };
            imgEl.src = evt.target.result;
        };
        reader.readAsDataURL(file);
    },

    saveProfile: async function () {
        const uid = String(this.state.user.id || this.state.user.newId);
        if (!uid) return;
        let uData = await db.stores.users.getItem(uid);
        if (!uData) uData = this.state.user;

        uData.full_name = document.getElementById('prof-nama').value;
        uData.username = document.getElementById('prof-username').value;
        const pwd = document.getElementById('prof-password').value;
        if (pwd) uData.password = pwd;

        const fUrl = document.getElementById('prof-foto-url').textContent;
        if (fUrl) uData.foto = fUrl;

        this.showLoading('Menyimpan Profil...');
        await db.stores.users.setItem(uid, uData);
        await db.queueSyncTask('update_users', 'users', uData);

        this.state.user = uData;
        localStorage.setItem('pinjamalat_user', JSON.stringify(uData));
        this.updateHeaderProfile();

        this.hideLoading();
        this.closeModal('profile-modal');
        this.showToast('Profil berhasil ditingkatkan', 'success');
        db.syncToServer();
    },

    togglePassword: function () {
        const input = document.getElementById('login-password');
        const icon = document.getElementById('toggle-password');
        if (input.type === 'password') {
            input.type = 'text';
            icon.classList.remove('ph-eye');
            icon.classList.add('ph-eye-slash');
        } else {
            input.type = 'password';
            icon.classList.remove('ph-eye-slash');
            icon.classList.add('ph-eye');
        }
    },

    applyRoleConstraints: function () {
        const role = this.state.user.role;
        const adminElements = document.querySelectorAll('.admin-only');

        if (role !== 'Admin') {
            adminElements.forEach(el => el.classList.add('hidden'));
        } else {
            adminElements.forEach(el => el.classList.remove('hidden'));
        }
    },

    navigate: function (targetId) {
        if (!targetId) {
            targetId = 'dashboard';
        }

        this.setActiveNavigation(targetId);
        this.state.currentView = targetId;

        const targetSectionId = `${targetId}-section`;
        const targetSection = document.getElementById(targetSectionId);

        document.querySelectorAll('.content-section').forEach(section => {
            if (section.id === targetSectionId) return;
            if (!section.classList.contains('hidden')) {
                section.style.opacity = '0';
                setTimeout(() => {
                    section.classList.add('hidden');
                    section.classList.remove('section-active');
                    section.style.opacity = '1';
                }, 150);
            }
        });

        if (targetSection) {
            targetSection.classList.remove('hidden');
            targetSection.classList.add('section-active');
            targetSection.style.opacity = '0';
            setTimeout(() => { targetSection.style.opacity = '1'; }, 10);

            const titleMap = {
                'dashboard': 'Dashboard',
                'peminjaman': 'Peminjaman Alat',
                'riwayat': 'Riwayat Peminjaman',
                'alat': 'Data Alat',
                'kategori': 'Kategori Alat',
                'users': 'Manajemen User',
                'bahan': 'Bahan Praktik',
                'bahan_keluar': 'Bahan Keluar'
            };
            document.getElementById('page-title').textContent = titleMap[targetId] || 'Halaman';
            this.loadSectionData(targetId);
        }

        if (window.matchMedia('(max-width: 768px)').matches) {
            this.closeSidebar();
            document.querySelector('.content-wrapper').scrollTop = 0;
        }
    },

    checkNetworkStatus: function () {
        this.updateNetworkStatus(navigator.onLine);
    },

    updateNetworkStatus: function (isOnline) {
        this.state.isOnline = isOnline;

        // Indikator untuk Main Dashboard
        const mainIndicator = document.getElementById('main-network-status');
        if (mainIndicator) {
            mainIndicator.classList.remove('hidden');
            if (!isOnline) {
                mainIndicator.style.background = 'var(--danger)';
                mainIndicator.style.color = '#fff';
                mainIndicator.innerHTML = '<i class="ph ph-wifi-slash"></i> Offline Mode';
            } else {
                mainIndicator.style.background = 'var(--success)';
                mainIndicator.style.color = '#fff';
                mainIndicator.innerHTML = '<i class="ph ph-wifi-high"></i> Online';
            }
        }

        // Indikator elegan untuk halaman Login Split Screen
        const loginLeft = document.querySelector('.login-split-left');
        const loginBadge = document.getElementById('login-offline-badge');
        const shapes = document.querySelectorAll('.login-bg-shapes .shape');
        const heroTitleSpan = document.querySelector('.hero-title span');
        
        if (loginLeft) {
            if (!isOnline) {
                // Berubah ke tema merah/offline
                if (loginBadge) loginBadge.classList.remove('hidden');
                if (shapes[0]) shapes[0].style.background = 'var(--danger)';
                if (shapes[1]) shapes[1].style.background = '#991b1b'; // Dark red
                if (shapes[2]) shapes[2].style.background = '#7f1d1d'; // Darker red
                if (heroTitleSpan) heroTitleSpan.style.background = 'linear-gradient(135deg, #ef4444, #b91c1c)';
                if (heroTitleSpan) heroTitleSpan.style.webkitBackgroundClip = 'text';
            } else {
                // Normal theme
                if (loginBadge) loginBadge.classList.add('hidden');
                if (shapes[0]) shapes[0].style.background = '';
                if (shapes[1]) shapes[1].style.background = '';
                if (shapes[2]) shapes[2].style.background = '';
                if (heroTitleSpan) heroTitleSpan.style.background = '';
                if (heroTitleSpan) heroTitleSpan.style.webkitBackgroundClip = '';
            }
        }

        if (!isOnline) {
            this.showToast('Koneksi terputus. Beralih ke mode Offline.', 'warning');
        } else {
            // Trigger sinkronisasi otomatis kembali saat internet pulih
            if (this.state.user) {
                this.backgroundSync();
            }
        }
    },

    backgroundSync: async function () {
        if (!this.state.isOnline) return;
        if (this.state.syncInProgress) return;
        this.state.syncInProgress = true;

        // Memutar ikon secara visual bila dipicu secara manual/otomatis
        const btnSync = document.getElementById('btn-sync');
        if (btnSync) {
            btnSync.innerHTML = '<i class="ph ph-spinner ph-spin"></i>';
        }
        this.showLoading('Menyinkronkan data...');

        try {
            const queue = await db.getAll('syncQueue');
            if (queue && queue.length > 0) {
                await db.syncToServer();
            } else {
                await db.fetchServerData();
            }
            // Auto muat ulang tampilan saat ini untuk memperbarui list data, tanpa membajak UI
            if (this.state.user) {
                this.navigate(this.state.currentView || 'dashboard');
            }
        } catch (e) {
            console.error("Background sync runtime issue:", e);
        } finally {
            if (btnSync) {
                btnSync.innerHTML = '<i class="ph ph-arrows-clockwise"></i>';
            }
            this.hideLoading();
            this.state.syncInProgress = false;
        }
    },

    showLoading: function (text = 'Memuat...') {
        const loadingLogo = document.getElementById('loading-logo');
        if (loadingLogo) loadingLogo.src = SYNC_LOGO_URL;
        document.getElementById('loading-text').textContent = text;
        document.getElementById('loading-overlay').classList.remove('hidden');
    },

    hideLoading: function () {
        document.getElementById('loading-overlay').classList.add('hidden');
    },

    loadSectionData: function (section) {
        if (section === 'users') {
            this.loadUsers();
        } else if (section === 'dashboard') {
            this.loadDashboard();
        } else if (section === 'kategori') {
            this.loadKategori();
        } else if (section === 'alat') {
            this.loadAlat();
        } else if (section === 'peminjaman') {
            this.initPeminjaman();
            this.loadActivePeminjaman();
        } else if (section === 'riwayat') {
            this.loadRiwayat();
            setTimeout(() => this.initSearchAndFilter(), 100);
        } else if (section === 'bahan') {
            this.loadBahan();
        } else if (section === 'bahan_keluar') {
            this.loadBahanKeluar();
        }
    },

    getFilteredData: function (arr) {
        if (!this.state.user || this.state.user.role === 'Admin') return arr;
        return arr.filter(item => String(item.jurusan_id || '') === String(this.state.user.jurusan_id || ''));
    },

    // --- Dashboard logic
    formatDate: function (dateStr) {
        if (!dateStr) return '-';
        try {
            const date = new Date(dateStr);
            if (isNaN(date.getTime())) return dateStr;
            return date.toLocaleDateString('id-ID', {
                day: '2-digit',
                month: 'long',
                year: 'numeric'
            });
        } catch (e) {
            return dateStr;
        }
    },

    isOverdue: function (estimasiDateStr) {
        if (!estimasiDateStr) return false;
        try {
            const estimasi = new Date(estimasiDateStr);
            if (isNaN(estimasi.getTime())) return false;
            
            // Set estimasi to end of day
            estimasi.setHours(23, 59, 59, 999);
            
            const today = new Date();
            return estimasi < today;
        } catch (e) {
            return false;
        }
    },

    // --- Dashboard Analytics & Interactive Charts
    dashboardState: {
        period: 'semua',
        chartType: 'line',
        chartInstance: null
    },

    animateValue: function (elementId, start, end, duration = 800) {
        const obj = document.getElementById(elementId);
        if (!obj) return;
        const target = Number(end);
        if (isNaN(target)) {
            obj.textContent = end;
            return;
        }
        if (start === target) {
            obj.textContent = target;
            return;
        }
        const range = target - start;
        let current = start;
        const increment = target > start ? 1 : -1;
        const stepTime = Math.max(15, Math.abs(Math.floor(duration / (range || 1))));
        const startTime = performance.now();

        const step = (currentTime) => {
            const progress = Math.min((currentTime - startTime) / duration, 1);
            // Ease out cubic
            const easeProgress = 1 - Math.pow(1 - progress, 3);
            const val = Math.round(start + range * easeProgress);
            obj.textContent = val;
            if (progress < 1) {
                requestAnimationFrame(step);
            } else {
                obj.textContent = target;
            }
        };
        requestAnimationFrame(step);
    },

    setDashboardPeriod: function (period) {
        this.dashboardState.period = period;
        // Update period buttons UI
        const pills = document.querySelectorAll('#dashboard-period-filter .period-pill');
        pills.forEach(p => {
            if (p.getAttribute('data-period') === period) {
                p.classList.add('active');
            } else {
                p.classList.remove('active');
            }
        });
        const periodLabels = {
            'semua': 'Semua Waktu',
            'bulan': 'Bulan Ini',
            'minggu': '7 Hari Terakhir',
            'hari': 'Hari Ini'
        };
        const lbl = document.getElementById('stat-periode-label');
        if (lbl) lbl.textContent = periodLabels[period] || 'Semua';

        this.loadDashboard();
    },

    toggleChartType: function (type) {
        this.dashboardState.chartType = type;
        const btnLine = document.getElementById('btn-chart-line');
        const btnBar = document.getElementById('btn-chart-bar');
        if (btnLine && btnBar) {
            if (type === 'line') {
                btnLine.classList.add('active');
                btnBar.classList.remove('active');
            } else {
                btnBar.classList.add('active');
                btnLine.classList.remove('active');
            }
        }
        this.loadDashboard();
    },

    filterRiwayatByPeriod: function (riwayat, period) {
        if (!riwayat || !riwayat.length) return [];
        const now = new Date();
        const todayStr = now.toISOString().split('T')[0];

        if (period === 'hari') {
            return riwayat.filter(p => {
                const pDate = (p.created_at || p.tanggal_pinjam || '').split('T')[0];
                return pDate === todayStr;
            });
        }
        if (period === 'minggu') {
            const sevenDaysAgo = new Date();
            sevenDaysAgo.setDate(now.getDate() - 7);
            const sevenDaysAgoStr = sevenDaysAgo.toISOString().split('T')[0];
            return riwayat.filter(p => {
                const pDate = (p.created_at || p.tanggal_pinjam || '').split('T')[0];
                return pDate >= sevenDaysAgoStr && pDate <= todayStr;
            });
        }
        if (period === 'bulan') {
            const currentMonthStr = todayStr.substring(0, 7); // yyyy-mm
            return riwayat.filter(p => {
                const pDate = (p.created_at || p.tanggal_pinjam || '').split('T')[0];
                return pDate.startsWith(currentMonthStr);
            });
        }
        return riwayat;
    },

    calculateTopAlat: function (period, riwayatFiltered, filteredAlat) {
        const container = document.getElementById('top-tools-leaderboard');
        if (!container) return;
        container.innerHTML = '';

        const myJurusanId = String(this.state.user?.jurusan_id || '');
        const isAdmin = !this.state.user || this.state.user.role === 'Admin';

        // Map alat lookup by ID & Name HANYA untuk alat jurusan terkait jika bukan Admin
        const validAlatMap = {};
        filteredAlat.forEach(a => {
            const aId = String(db.getItemId(a) || a.id || a.newId || '');
            if (aId) validAlatMap[aId] = a;
            if (a.nama) validAlatMap[String(a.nama).trim().toLowerCase()] = a;
        });

        // Tally borrowings
        const countMap = {};
        riwayatFiltered.forEach(p => {
            // Jika bukan Admin, pastikan peminjaman sesuai jurusan
            if (!isAdmin && p.jurusan_id && String(p.jurusan_id) !== myJurusanId) return;

            try {
                const items = JSON.parse(p.items || '[]');
                items.forEach(it => {
                    const itId = String(it.id || it.newId || '').trim();
                    const itName = it.nama || it.nama_alat || it.name || 'Alat';
                    
                    // Pastikan alat tersebut termasuk dalam jurusan yang login jika bukan Admin
                    const matchedAlat = validAlatMap[itId] || validAlatMap[itName.toLowerCase()] || null;
                    if (!isAdmin && !matchedAlat) {
                        return; // Lewati alat yang bukan milik jurusan ini
                    }

                    const key = itId || (matchedAlat ? String(db.getItemId(matchedAlat) || matchedAlat.id || itName.toLowerCase()) : itName.toLowerCase());
                    const qty = Number(it.qty || it.jumlah || 1);

                    if (!countMap[key]) {
                        countMap[key] = {
                            id: itId,
                            nama: matchedAlat ? matchedAlat.nama : itName,
                            count: 0,
                            alatObj: matchedAlat
                        };
                    }
                    countMap[key].count += qty;
                });
            } catch (e) { }
        });

        const sortedTools = Object.values(countMap).sort((a, b) => b.count - a.count).slice(0, 5);

        if (sortedTools.length === 0) {
            container.innerHTML = `
                <div style="text-align:center; padding: 2.5rem 1rem; color:var(--text-muted);">
                    <i class="ph ph-toolbox" style="font-size:2rem; opacity:0.4; margin-bottom:0.5rem; display:block;"></i>
                    <p style="font-size:0.85rem; margin:0;">Belum ada data peminjaman untuk periode ini</p>
                </div>
            `;
            return;
        }

        const maxCount = sortedTools[0].count || 1;

        sortedTools.forEach((t, idx) => {
            const rank = idx + 1;
            const rankClass = rank === 1 ? 'rank-1' : (rank === 2 ? 'rank-2' : (rank === 3 ? 'rank-3' : 'rank-other'));
            const percent = Math.max(12, Math.round((t.count / maxCount) * 100));
            const toolData = t.alatObj || {};
            const fotoUrl = toolData.foto ? this.formatDriveImageUrl(toolData.foto) : '';

            const itemDiv = document.createElement('div');
            itemDiv.className = 'top-tool-item';
            itemDiv.innerHTML = `
                <div class="top-tool-rank ${rankClass}">#${rank}</div>
                ${fotoUrl 
                    ? `<img class="top-tool-thumb" src="${fotoUrl}" alt="${t.nama}" onerror="this.outerHTML='<div class=\\'top-tool-thumb-placeholder\\'><i class=\\'ph ph-wrench\\'></i></div>'">` 
                    : `<div class="top-tool-thumb-placeholder"><i class="ph ph-wrench"></i></div>`
                }
                <div class="top-tool-body">
                    <div class="top-tool-name-row">
                        <span class="top-tool-name" title="${t.nama}">${t.nama}</span>
                        <span class="top-tool-count-badge">${t.count}x dipinjam</span>
                    </div>
                    <div class="top-tool-bar-bg">
                        <div class="top-tool-bar-fill" style="width: 0%" data-target-width="${percent}%"></div>
                    </div>
                </div>
            `;
            container.appendChild(itemDiv);
        });

        // Trigger smooth bar width animation
        setTimeout(() => {
            container.querySelectorAll('.top-tool-bar-fill').forEach(bar => {
                const target = bar.getAttribute('data-target-width');
                if (target) bar.style.width = target;
            });
        }, 100);
    },

    renderBorrowingTrendChart: function (period, riwayatFiltered) {
        const canvas = document.getElementById('borrowingTrendChart');
        if (!canvas || typeof Chart === 'undefined') return;

        const ctx = canvas.getContext('2d');
        const now = new Date();

        let labels = [];
        let dataDipinjam = [];
        let dataKembali = [];

        if (period === 'hari') {
            // Group by hour (08:00 - 17:00)
            labels = ['07:00', '09:00', '11:00', '13:00', '15:00', '17:00'];
            dataDipinjam = [0, 0, 0, 0, 0, 0];
            dataKembali = [0, 0, 0, 0, 0, 0];

            riwayatFiltered.forEach(p => {
                const d = new Date(p.created_at || p.tanggal_pinjam);
                const h = d.getHours();
                const bucket = h < 9 ? 0 : (h < 11 ? 1 : (h < 13 ? 2 : (h < 15 ? 3 : (h < 17 ? 4 : 5))));
                dataDipinjam[bucket]++;
                if (p.status === 'KEMBALI') dataKembali[bucket]++;
            });
        } else if (period === 'minggu') {
            // 7 Days
            const daysName = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'];
            labels = [];
            const dateKeys = [];
            for (let i = 6; i >= 0; i--) {
                const d = new Date();
                d.setDate(now.getDate() - i);
                const dStr = d.toISOString().split('T')[0];
                dateKeys.push(dStr);
                labels.push(daysName[d.getDay()] + ` (${d.getDate()})`);
            }
            dataDipinjam = dateKeys.map(k => riwayatFiltered.filter(p => (p.created_at || p.tanggal_pinjam || '').startsWith(k)).length);
            dataKembali = dateKeys.map(k => riwayatFiltered.filter(p => p.status === 'KEMBALI' && (p.tanggal_kembali_aktual || p.created_at || '').startsWith(k)).length);
        } else if (period === 'bulan') {
            // 4 Weeks
            labels = ['Minggu 1', 'Minggu 2', 'Minggu 3', 'Minggu 4', 'Minggu 5'];
            dataDipinjam = [0, 0, 0, 0, 0];
            dataKembali = [0, 0, 0, 0, 0];

            riwayatFiltered.forEach(p => {
                const d = new Date(p.created_at || p.tanggal_pinjam);
                const day = d.getDate();
                const weekIdx = Math.min(4, Math.floor((day - 1) / 7));
                dataDipinjam[weekIdx]++;
                if (p.status === 'KEMBALI') dataKembali[weekIdx]++;
            });
        } else {
            // All time: Last 6 Months
            const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
            labels = [];
            const monthKeys = [];
            for (let i = 5; i >= 0; i--) {
                const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
                const ym = d.toISOString().substring(0, 7);
                monthKeys.push(ym);
                labels.push(monthNames[d.getMonth()] + ' ' + d.getFullYear().toString().substring(2));
            }
            dataDipinjam = monthKeys.map(k => riwayatFiltered.filter(p => (p.created_at || p.tanggal_pinjam || '').startsWith(k)).length);
            dataKembali = monthKeys.map(k => riwayatFiltered.filter(p => p.status === 'KEMBALI' && (p.tanggal_kembali_aktual || p.created_at || '').startsWith(k)).length);
        }

        // Gradients
        const gradientPinjam = ctx.createLinearGradient(0, 0, 0, 260);
        gradientPinjam.addColorStop(0, 'rgba(99, 102, 241, 0.45)');
        gradientPinjam.addColorStop(1, 'rgba(99, 102, 241, 0.0)');

        const gradientKembali = ctx.createLinearGradient(0, 0, 0, 260);
        gradientKembali.addColorStop(0, 'rgba(16, 185, 129, 0.45)');
        gradientKembali.addColorStop(1, 'rgba(16, 185, 129, 0.0)');

        if (this.dashboardState.chartInstance) {
            this.dashboardState.chartInstance.destroy();
        }

        const isBar = this.dashboardState.chartType === 'bar';

        this.dashboardState.chartInstance = new Chart(ctx, {
            type: isBar ? 'bar' : 'line',
            data: {
                labels: labels,
                datasets: [
                    {
                        label: 'Peminjaman',
                        data: dataDipinjam,
                        borderColor: '#6366f1',
                        backgroundColor: isBar ? '#6366f1' : gradientPinjam,
                        borderWidth: 2.5,
                        fill: true,
                        tension: 0.38,
                        pointBackgroundColor: '#6366f1',
                        pointBorderColor: '#fff',
                        pointHoverRadius: 6,
                        borderRadius: isBar ? 6 : 0
                    },
                    {
                        label: 'Pengembalian',
                        data: dataKembali,
                        borderColor: '#10b981',
                        backgroundColor: isBar ? '#10b981' : gradientKembali,
                        borderWidth: 2.5,
                        fill: true,
                        tension: 0.38,
                        pointBackgroundColor: '#10b981',
                        pointBorderColor: '#fff',
                        pointHoverRadius: 6,
                        borderRadius: isBar ? 6 : 0
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                interaction: {
                    intersect: false,
                    mode: 'index'
                },
                plugins: {
                    legend: {
                        position: 'top',
                        labels: {
                            color: '#94a3b8',
                            font: { family: 'Inter', size: 11, weight: '600' },
                            usePointStyle: true,
                            pointStyle: 'circle',
                            boxWidth: 8
                        }
                    },
                    tooltip: {
                        backgroundColor: 'rgba(15, 23, 42, 0.92)',
                        titleColor: '#f8fafc',
                        bodyColor: '#e2e8f0',
                        borderColor: 'rgba(255, 255, 255, 0.12)',
                        borderWidth: 1,
                        padding: 10,
                        boxPadding: 4,
                        usePointStyle: true,
                        callbacks: {
                            label: function (context) {
                                return ` ${context.dataset.label}: ${context.parsed.y} transaksi`;
                            }
                        }
                    }
                },
                scales: {
                    x: {
                        grid: {
                            color: 'rgba(255, 255, 255, 0.04)',
                            drawBorder: false
                        },
                        ticks: {
                            color: '#94a3b8',
                            font: { family: 'Inter', size: 10 }
                        }
                    },
                    y: {
                        beginAtZero: true,
                        grid: {
                            color: 'rgba(255, 255, 255, 0.06)',
                            drawBorder: false
                        },
                        ticks: {
                            color: '#94a3b8',
                            font: { family: 'Inter', size: 10 },
                            stepSize: 1,
                            precision: 0
                        }
                    }
                }
            }
        });
    },

    loadDashboard: async function () {
        const allAlat = await db.getAll('alat');
        const alat = this.getFilteredData(allAlat);
        const riwayatRaw = await db.getAll('peminjaman');
        const riwayat = this.getFilteredData(riwayatRaw);

        // Filtered transactions by selected period
        const period = this.dashboardState.period || 'semua';
        const riwayatPeriod = this.filterRiwayatByPeriod(riwayat, period);

        // 1. Stat Cards with Animated Count-up
        const totalAlatCount = alat.length;
        const totalTersediaCount = alat.filter(a => Number(a.jumlah_tersedia) > 0).length;
        const activeBorrowings = riwayat.filter(p => p.status === 'DIPINJAM');
        const activeCount = activeBorrowings.length;
        const overdueCount = activeBorrowings.filter(p => this.isOverdue(p.tanggal_kembali_estimasi)).length;
        const totalTransaksiPeriod = riwayatPeriod.length;

        this.animateValue('stat-total-alat', 0, totalAlatCount);
        this.animateValue('stat-tersedia', 0, totalTersediaCount);
        this.animateValue('stat-dipinjam', 0, activeCount);
        this.animateValue('stat-terlambat', 0, overdueCount);
        this.animateValue('stat-total-transaksi', 0, totalTransaksiPeriod);

        // Availability percentage badge
        const pctElem = document.getElementById('stat-ketersediaan-pct');
        if (pctElem) {
            const pct = totalAlatCount > 0 ? Math.round((totalTersediaCount / totalAlatCount) * 100) : 0;
            pctElem.textContent = `${pct}% Siap`;
        }

        // Overdue badge styling
        const overdueBadge = document.getElementById('stat-overdue-alert');
        if (overdueBadge) {
            if (overdueCount > 0) {
                overdueBadge.textContent = `${overdueCount} Telat!`;
                overdueBadge.className = 'stat-subbadge bg-danger';
            } else {
                overdueBadge.textContent = 'Aman';
                overdueBadge.className = 'stat-subbadge bg-green';
            }
        }

        // 2. Interactive Charts & Top Borrowed Tools Leaderboard
        this.renderBorrowingTrendChart(period, riwayatPeriod);
        this.calculateTopAlat(period, riwayatPeriod, alat);

        // 3. Load Bahan Kritis (Habis/Menipis)
        const bahanTable = document.getElementById('dashboard-bahan-kritis-table');
        if (bahanTable) {
            bahanTable.innerHTML = '';
            
            let bahanRaw = await db.getAll('bahan');
            const myJurusanId = String(this.state.user.jurusan_id || '');
            if (this.state.user.role !== 'Admin') {
                bahanRaw = bahanRaw.filter(b => String(b.Kode_jurusan || b.jurusan_id || '') === myJurusanId);
            }
            
            let bahanKritis = bahanRaw.filter(b => {
                const stok = Number(b.Stok || 0);
                const min = Number(b.Stok_Minimal || 0);
                return stok <= min;
            }).sort((a, b) => Number(a.Stok || 0) - Number(b.Stok || 0));

            if (bahanKritis.length === 0) {
                bahanTable.innerHTML = '<div class="dashboard-card-empty"><i class="ph ph-check-circle"></i><span>Semua stok bahan dalam kondisi aman</span></div>';
            } else {
                bahanKritis.forEach((b, index) => {
                    const stok = Number(b.Stok || 0);
                    const isHabis = stok <= 0;
                    const bClass = isHabis ? 'bg-danger' : 'bg-warning';
                    const bText = isHabis ? 'Habis' : 'Menipis';
                    const card = document.createElement('div');
                    card.className = 'dashboard-horizontal-card dashboard-card-enter';
                    card.style.setProperty('--card-index', index);
                    card.innerHTML = `
                        <div class="dashboard-card-icon bahan-card-icon"><i class="ph ph-package"></i></div>
                        <div class="dashboard-card-main">
                            <div class="dashboard-card-title">${b.Nama_Barang || '-'}</div>
                            <div class="dashboard-card-meta">${b.ID_Barang || '-'} <span>•</span> Stok minimum ${b.Stok_Minimal || 0} ${b.Satuan || ''}</div>
                        </div>
                        <div class="dashboard-card-value"><strong>${stok}</strong><small>${b.Satuan || 'unit'}</small></div>
                        <span class="badge ${bClass} dashboard-card-status">${bText}</span>
                    `;
                    bahanTable.appendChild(card);
                });
            }
        }

        // 4. Load 10 Recent Peminjaman
        const recentTable = document.getElementById('table-recent-peminjaman');
        if (recentTable) {
            recentTable.innerHTML = '';
            const recentList = riwayat.sort((a, b) => new Date(b.created_at) - new Date(a.created_at)).slice(0, 10);
            
            if (recentList.length === 0) {
                recentTable.innerHTML = '<div class="dashboard-card-empty"><i class="ph ph-clock-counter-clockwise"></i><span>Tidak ada riwayat transaksi</span></div>';
            } else {
                recentList.forEach((p, index) => {
                    let statusBadge = p.status === 'DIPINJAM' ? '<span class="badge" style="background:var(--warning); color:white; padding:2px 6px;">DIPINJAM</span>' : '<span class="badge" style="background:var(--success); color:white; padding:2px 6px;">KEMBALI</span>';
                    const card = document.createElement('div');
                    card.className = 'dashboard-horizontal-card dashboard-card-enter';
                    card.style.setProperty('--card-index', index);
                    card.innerHTML = `
                        <div class="dashboard-card-icon transaction-card-icon"><i class="ph ph-hand-coins"></i></div>
                        <div class="dashboard-card-main">
                            <div class="dashboard-card-title">${p.nama_peminjam || '-'}</div>
                            <div class="dashboard-card-meta"><b>${p.nomor_peminjaman || '-'}</b> <span>•</span> ${this.formatDate(p.created_at)}</div>
                        </div>
                        <div class="dashboard-card-context">${p.kelas_unit || 'Kelas/Unit'}</div>
                        <div class="dashboard-card-status">${statusBadge}</div>
                    `;
                    recentTable.appendChild(card);
                });
            }
        }
    },

    // --- Modal logic
    openModal: function (modalId) {
        const modal = document.getElementById(modalId);
        modal.classList.remove('hidden');

        // Handle modal stacking z-index
        const openModals = document.querySelectorAll('.modal:not(.hidden)');
        let highestZ = 1000; // Base modal z-index from CSS
        openModals.forEach(m => {
            if (m !== modal) {
                const z = parseInt(window.getComputedStyle(m).zIndex) || 1000;
                if (z >= highestZ) highestZ = z + 10;
            }
        });
        modal.style.zIndex = highestZ;
    },
    closeModal: function (modalId) {
        const modal = document.getElementById(modalId);
        modal.classList.add('hidden');
        setTimeout(() => { modal.style.zIndex = ''; }, 300); // Reset after transition
    },

    // --- User Management
    loadUsers: async function () {
        const users = await db.getAll('users');
        const jurusanList = await db.getAll('jurusan');
        const jurusanMap = {};
        jurusanList.forEach(j => { jurusanMap[String(j.id || j.newId)] = j.kode || j.nama; });

        const tbody = document.querySelector('#table-users tbody');
        tbody.innerHTML = '';

        users.forEach(u => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td><b>${u.username}</b></td>
                <td>${u.full_name}</td>
                <td><span class="badge">${u.role}</span></td>
                <td>${u.jurusan_id ? (jurusanMap[String(u.jurusan_id)] || u.jurusan_id) : 'Semua'}</td>
                <td>
                    <button class="btn-icon" onclick='app.editUser(${JSON.stringify(u).replace(/'/g, "&#39;")})'><i class="ph ph-pencil"></i></button>
                </td>
            `;
            tbody.appendChild(tr);
        });
    },

    openUserModal: async function () {
        document.getElementById('user-form').reset();
        document.getElementById('user-id').value = '';
        
        // Load Jurusan untuk dropdown
        const selectJur = document.getElementById('user-jurusan');
        selectJur.innerHTML = '<option value="">Semua (Admin Umum)</option>';
        const jur = await db.getAll('jurusan');
        jur.forEach(j => {
            selectJur.innerHTML += `<option value="${j.id || j.newId}">${j.nama}</option>`;
        });

        document.getElementById('user-modal-title').textContent = 'Tambah User';
        this.openModal('user-modal');
    },

    editUser: async function (user) {
        document.getElementById('user-id').value = user.id || user.newId;
        document.getElementById('user-username').value = user.username;
        document.getElementById('user-password').value = user.password;
        document.getElementById('user-fullname').value = user.full_name;
        document.getElementById('user-role').value = user.role;
        
        // Load Jurusan untuk dropdown
        const selectJur = document.getElementById('user-jurusan');
        selectJur.innerHTML = '<option value="">Semua (Admin Umum)</option>';
        const jur = await db.getAll('jurusan');
        jur.forEach(j => {
            selectJur.innerHTML += `<option value="${j.id || j.newId}">${j.nama}</option>`;
        });
        
        document.getElementById('user-jurusan').value = user.jurusan_id || '';
        document.getElementById('user-modal-title').textContent = 'Edit User';
        this.openModal('user-modal');
    },

    saveUser: async function () {
        const id = document.getElementById('user-id').value;
        const payload = {
            username: document.getElementById('user-username').value,
            password: document.getElementById('user-password').value,
            full_name: document.getElementById('user-fullname').value,
            role: document.getElementById('user-role').value,
            jurusan_id: document.getElementById('user-jurusan').value || ""
        };

        if (payload.role !== 'Admin' && !payload.jurusan_id) {
            return this.showToast('ID Jurusan wajib diisi untuk peran Guru atau Toolman.', 'warning');
        }

        let action = 'insert_user';
        if (id) {
            action = 'update_user';
            payload.id = id;
        } else {
            payload.id = 'USR-' + Date.now();
        }

        this.showLoading('Menyimpan...');
        // Save locally first
        const storeId = payload.id;
        await db.stores.users.setItem(String(storeId), payload);

        // Queue for sync
        await db.queueSyncTask(action, 'users', payload);

        this.hideLoading();
        this.closeModal('user-modal');
        this.showToast('User berhasil disimpan.', 'success');
        this.loadUsers();

        // Attempt immediate sync
        db.syncToServer();
    },

    // --- Kategori Management
    loadKategori: async function () {
        const data = this.getFilteredData(await db.getAll('kategori'));
        const jurusanList = await db.getAll('jurusan');
        const jurusanMap = {};
        jurusanList.forEach(j => { jurusanMap[String(j.id || j.newId)] = j.kode || j.nama; });

        const tbody = document.querySelector('#table-kategori tbody');
        tbody.innerHTML = '';
        data.forEach(kat => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td><b>${kat.nama}</b></td>
                <td>${kat.jurusan_id ? (jurusanMap[String(kat.jurusan_id)] || kat.jurusan_id) : '-'}</td>
                <td style="text-align:right">
                    <button class="btn-icon" onclick='app.editKategori(${JSON.stringify(kat).replace(/'/g, "&#39;")})'><i class="ph ph-pencil"></i></button>
                </td>
            `;
            tbody.appendChild(tr);
        });
    },

    openKategoriModal: function () {
        document.getElementById('kategori-form').reset();
        document.getElementById('kat-id').value = '';
        document.getElementById('kategori-modal-title').textContent = 'Tambah Kategori';

        const jurusanBox = document.getElementById('kat-jurusan').closest('.input-group');
        if (this.state.user.role !== 'Admin') jurusanBox.style.display = 'none';
        else jurusanBox.style.display = 'block';

        this.openModal('kategori-modal');
    },

    editKategori: function (kat) {
        document.getElementById('kat-id').value = kat.id || kat.newId;
        document.getElementById('kat-nama').value = kat.nama;
        document.getElementById('kat-jurusan').value = kat.jurusan_id;
        document.getElementById('kategori-modal-title').textContent = 'Edit Kategori';

        const jurusanBox = document.getElementById('kat-jurusan').closest('.input-group');
        if (this.state.user.role !== 'Admin') jurusanBox.style.display = 'none';
        else jurusanBox.style.display = 'block';

        this.openModal('kategori-modal');
    },

    saveKategori: async function () {
        const id = document.getElementById('kat-id').value;
        const payload = {
            nama: document.getElementById('kat-nama').value,
            jurusan_id: this.state.user.role === 'Admin' ? document.getElementById('kat-jurusan').value : this.state.user.jurusan_id,
            created_at: new Date().toISOString()
        };

        const storeId = id || 'KAT-' + Date.now();
        payload.id = storeId; // Always assign to id so it maps to the Google Sheet 'id' column

        this.showLoading('Menyimpan...');
        await db.stores.kategori.setItem(String(storeId), payload);
        await db.queueSyncTask(id ? 'update_kategori' : 'insert_kategori', 'kategori', payload);

        this.hideLoading();
        this.closeModal('kategori-modal');
        this.showToast('Kategori berhasil disimpan', 'success');
        this.loadKategori();
        this.populateKategoriSelect(); // Segarkan dropdown di modal Alat dan Bahan secara real-time
        db.syncToServer();
    },

    // --- Alat Management
    getDriveImageUrl: function (url) {
        if (!url) return '';
        if (url.startsWith('data:image')) return url; // Offline base64 caching
        
        // Jika input dari spreadsheet HANYA berupa ID mentah (tanpa link https://)
        if (/^[a-zA-Z0-9_-]{25,40}$/.test(url)) {
            return `https://drive.google.com/thumbnail?id=${url}&sz=w400`;
        }

        const match = url.match(/id=([a-zA-Z0-9_-]+)/) || url.match(/\/d\/([a-zA-Z0-9_-]+)/);
        if (match && match[1]) {
            return `https://drive.google.com/thumbnail?id=${match[1]}&sz=w400`;
        }
        return url;
    },

    isNewAlat: function (alat) {
        const tanggalMasuk = alat?.tanggal_masuk || alat?.Tanggal_Masuk || alat?.['Tanggal Masuk'];
        if (!tanggalMasuk) return false;

        const dateText = String(tanggalMasuk).trim();
        const date = new Date(/^\d{4}-\d{2}-\d{2}$/.test(dateText) ? `${dateText}T00:00:00` : dateText);
        if (isNaN(date.getTime())) return false;

        const today = new Date();
        today.setHours(0, 0, 0, 0);
        date.setHours(0, 0, 0, 0);
        const ageDays = Math.floor((today.getTime() - date.getTime()) / (24 * 60 * 60 * 1000));
        return ageDays >= 0 && ageDays <= 5;
    },

    formatDriveImageUrl: function (url) {
        return this.getDriveImageUrl(url);
    },

    toggleAlatView: function () {
        this.state.alatViewMode = this.state.alatViewMode === 'list' ? 'grid' : 'list';
        this.state.alatPage = 1;
        this.loadAlat();
    },

    changePage: function (delta) {
        this.state.alatPage += delta;
        if (this.state.alatPage < 1) this.state.alatPage = 1;
        this.loadAlat();
    },
    sortAlat: function(col) {
        if (this.state.alatSort.column === col) {
            this.state.alatSort.dir = this.state.alatSort.dir === 'asc' ? 'desc' : 'asc';
        } else {
            this.state.alatSort.column = col;
            this.state.alatSort.dir = 'asc';
        }

        // Reset visual icons
        const uiCols = ['kode_seri', 'nama', 'kategori_id', 'jumlah_tersedia', 'kondisi'];
        uiCols.forEach(c => {
            const icon = document.getElementById(`sort-icon-alat-${c}`);
            if (icon) {
                if (c === col) {
                    icon.style.display = 'inline-block';
                    icon.className = this.state.alatSort.dir === 'asc' ? 'ph ph-caret-circle-up' : 'ph ph-caret-circle-down';
                    icon.style.color = 'var(--primary)';
                } else {
                    icon.style.display = 'none';
                }
            }
        });

        this.loadAlat();
    },

    setAlatFilterStatus: function (status) {
        this.state.alatStatusFilter = status;
        this.state.alatPage = 1;
        const container = document.getElementById('alat-tabs');
        if (container) {
            const btns = container.querySelectorAll('.quick-tab-pill');
            btns.forEach(b => b.classList.remove('active'));
            const targetBtn = Array.from(btns).find(b => {
                const attr = b.getAttribute('onclick');
                return attr && attr.includes(`'${status}'`);
            });
            if (targetBtn) targetBtn.classList.add('active');
        }
        this.loadAlat();
    },

    loadAlat: async function () {
        const query = document.getElementById('alat-search')?.value.toLowerCase() || '';
        const rawAlat = await db.getAll('alat');
        const uniqueAlat = [];
        const seenIds = new Set();
        rawAlat.forEach(alat => {
            const itemId = db.getStoreItemId('alat', alat);
            const code = String(alat.kode_seri || '').trim().toLowerCase();
            const identity = String(itemId || code || `${alat.nama || ''}|${alat.jurusan_id || ''}`).trim().toLowerCase();
            if (seenIds.has(identity)) return;
            seenIds.add(identity);
            uniqueAlat.push(alat);
        });
        const allJurusanAlat = this.getFilteredData(uniqueAlat);

        // Calculate counts for status tabs
        const countAll = allJurusanAlat.length;
        const countTersedia = allJurusanAlat.filter(a => Number(a.jumlah_tersedia || 0) > 0).length;
        const countDipinjam = allJurusanAlat.filter(a => (Number(a.jumlah_total || 0) - Number(a.jumlah_tersedia || 0)) > 0).length;
        const countPerbaikan = allJurusanAlat.filter(a => a.kondisi && a.kondisi !== 'Baik').length;

        const bAll = document.getElementById('alat-badge-all');
        const bTersedia = document.getElementById('alat-badge-tersedia');
        const bDipinjam = document.getElementById('alat-badge-dipinjam');
        const bPerbaikan = document.getElementById('alat-badge-perbaikan');
        if (bAll) bAll.textContent = countAll;
        if (bTersedia) bTersedia.textContent = countTersedia;
        if (bDipinjam) bDipinjam.textContent = countDipinjam;
        if (bPerbaikan) bPerbaikan.textContent = countPerbaikan;

        let alatDataFiltered = allJurusanAlat.filter(a => {
            const name = String(a.nama || '').toLowerCase();
            const code = String(a.kode_seri || '').toLowerCase();
            return name.includes(query) || code.includes(query);
        });

        // Filter by Status Tab
        if (this.state.alatStatusFilter === 'tersedia') {
            alatDataFiltered = alatDataFiltered.filter(a => Number(a.jumlah_tersedia || 0) > 0);
        } else if (this.state.alatStatusFilter === 'dipinjam') {
            alatDataFiltered = alatDataFiltered.filter(a => (Number(a.jumlah_total || 0) - Number(a.jumlah_tersedia || 0)) > 0);
        } else if (this.state.alatStatusFilter === 'perbaikan') {
            alatDataFiltered = alatDataFiltered.filter(a => a.kondisi && a.kondisi !== 'Baik');
        }

        // --- Proses Sorting Alat ---
        const sc = this.state.alatSort.column;
        const sdir = this.state.alatSort.dir;
        
        if (sc) {
            alatDataFiltered.sort((a, b) => {
                let valA, valB;
                if (sc === 'kode_seri') { valA = a.kode_seri || ''; valB = b.kode_seri || ''; }
                else if (sc === 'nama') { valA = a.nama || ''; valB = b.nama || ''; }
                else if (sc === 'kategori_id') { valA = String(a.kategori_id || ''); valB = String(b.kategori_id || ''); }
                else if (sc === 'jumlah_tersedia') { valA = Number(a.jumlah_tersedia || 0); valB = Number(b.jumlah_tersedia || 0); }
                else if (sc === 'kondisi') { valA = a.kondisi || ''; valB = b.kondisi || ''; }
                
                if (typeof valA === 'string') valA = valA.toLowerCase();
                if (typeof valB === 'string') valB = valB.toLowerCase();

                if (valA < valB) return sdir === 'asc' ? -1 : 1;
                if (valA > valB) return sdir === 'asc' ? 1 : -1;
                return 0;
            });
        }

        // Pagination logic
        const totalItems = alatDataFiltered.length;
        const totalPages = Math.ceil(totalItems / this.state.alatLimit) || 1;
        if (this.state.alatPage > totalPages) this.state.alatPage = totalPages;

        const pt = document.getElementById('page-total-items');
        if (pt) pt.textContent = `Menampilkan ${totalItems} item`;
        const pi = document.getElementById('page-info');
        if (pi) pi.textContent = `${this.state.alatPage} / ${totalPages}`;

        const bp = document.getElementById('btn-prev-page');
        if (bp) bp.disabled = this.state.alatPage <= 1;
        const bn = document.getElementById('btn-next-page');
        if (bn) bn.disabled = this.state.alatPage >= totalPages;

        const startIndex = (this.state.alatPage - 1) * this.state.alatLimit;
        const alatData = alatDataFiltered.slice(startIndex, startIndex + this.state.alatLimit);

        const katData = await db.getAll('kategori');
        const katMap = {};
        katData.forEach(k => katMap[k.id || k.newId] = k.nama);

        const tbody = document.querySelector('#table-alat tbody');
        const grid = document.querySelector('#grid-alat');
        tbody.innerHTML = '';
        if (grid) grid.innerHTML = '';

        if (alatData.length === 0) {
            tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; padding: 2.5rem; color:var(--text-muted);"><i class="ph ph-magnifying-glass" style="font-size:1.6rem; display:block; margin-bottom:0.5rem; opacity:0.5;"></i>Tidak ada alat yang cocok dengan filter</td></tr>';
        }

        alatData.forEach(a => {
            const katName = katMap[a.kategori_id] || a.kategori_id || '-';
            const imgUrl = this.getDriveImageUrl(a.foto);
            const newBadgeHtml = this.isNewAlat(a) ? '<span class="new-alat-badge">NEW</span>' : '';

            // Row Highlight Style & Grid Color berdasarkan Kondisi (tanpa teks kondisi di tabel)
            let rowHighlightStyle = '';
            let kondisiColor = 'var(--text-muted)';
            if (a.kondisi === 'Baik') {
                kondisiColor = 'var(--success)';
                rowHighlightStyle = 'border-left: 4px solid #10b981; background: rgba(16, 185, 129, 0.05);';
            } else if (a.kondisi === 'Butuh Perbaikan') {
                kondisiColor = '#fbbf24';
                rowHighlightStyle = 'border-left: 4px solid #f59e0b; background: rgba(245, 158, 11, 0.08);';
            } else if (a.kondisi === 'Rusak Ringan') {
                kondisiColor = '#fb923c';
                rowHighlightStyle = 'border-left: 4px solid #f97316; background: rgba(249, 115, 22, 0.08);';
            } else if (a.kondisi === 'Rusak Berat') {
                kondisiColor = 'var(--danger)';
                rowHighlightStyle = 'border-left: 4px solid #ef4444; background: rgba(239, 68, 68, 0.08);';
            } else {
                rowHighlightStyle = 'border-left: 4px solid rgba(255, 255, 255, 0.1);';
            }

            // Mini Stock Progress Bar
            const totalQty = Number(a.jumlah_total || 0);
            const availQty = Number(a.jumlah_tersedia || 0);
            const stockPct = totalQty > 0 ? Math.min(100, Math.round((availQty / totalQty) * 100)) : 0;
            let stockFillClass = 'bg-healthy';
            if (stockPct <= 25) stockFillClass = 'bg-empty';
            else if (stockPct <= 50) stockFillClass = 'bg-low';

            const stockMeterHtml = `
                <div class="mini-stock-container">
                    <div style="display:flex; justify-content:space-between; font-size:0.8rem;">
                        <b>${availQty}</b> <span style="color:var(--text-muted);">/ ${totalQty}</span>
                    </div>
                    <div class="mini-stock-bar">
                        <div class="mini-stock-fill ${stockFillClass}" style="width:${stockPct}%"></div>
                    </div>
                </div>
            `;

            // Render Tabel (Urutan: Foto, Nama Alat + Kode Seri di bawahnya, Kategori, Stok Meter, Aksi)
            const tr = document.createElement('tr');
            tr.style.cssText = `${rowHighlightStyle} transition: background 0.2s ease;`;
            tr.innerHTML = `
                <td style="width: 52px; padding: 0.6rem 0.5rem 0.6rem 0.75rem;">
                    ${imgUrl ? `<img src="${imgUrl}" style="width:44px; height:44px; object-fit:cover; border-radius:8px; border:1px solid rgba(255,255,255,0.1);">` : `<div style="width:44px; height:44px; background:rgba(255,255,255,0.06); border:1px solid rgba(255,255,255,0.1); border-radius:8px; display:flex; align-items:center; justify-content:center"><i class="ph ph-image" style="color:var(--text-muted); font-size:1.2rem;"></i></div>`}
                </td>
                <td style="padding: 0.6rem 0.75rem;">
                    <div style="display:flex; align-items:center; gap:0.4rem; flex-wrap:wrap; font-weight: 700; font-size: 0.95rem; color: var(--text-main); line-height: 1.25; margin-bottom: 0.2rem;">${a.nama}${newBadgeHtml}</div>
                    <div style="font-family: monospace; font-size: 0.8rem; color: var(--text-muted);">${a.kode_seri}</div>
                </td>
                <td style="padding: 0.6rem 0.75rem;">
                    <span class="badge" style="background:rgba(255,255,255,0.06); color:var(--text-main); font-size:0.75rem; border:1px solid rgba(255,255,255,0.08);">${katName}</span>
                </td>
                <td style="min-width: 110px; padding: 0.6rem 0.75rem;">
                    ${stockMeterHtml}
                </td>
                <td style="padding: 0.6rem 0.75rem; text-align: right;">
                    <div style="display:flex; gap:0.3rem; justify-content:flex-end;">
                        <button class="btn-icon" onclick='app.openCetakBarcodeModal(${JSON.stringify(a)})' title="Cetak Barcode / QR"><i class="ph ph-qr-code"></i></button>
                        <button class="btn-icon" onclick='app.editAlat(${JSON.stringify(a)})' title="Edit Alat"><i class="ph ph-pencil"></i></button>
                        <button class="btn-icon" onclick="app.hapusAlat('${a.id || a.newId}')" title="Hapus Alat"><i class="ph ph-trash" style="color:var(--danger)"></i></button>
                    </div>
                </td>
            `;
            tbody.appendChild(tr);

            // Render Grid
            if (grid) {
                const gridItem = document.createElement('div');
                gridItem.className = 'alat-grid-item';
                gridItem.innerHTML = `
                    <div style="position:relative;">
                        ${imgUrl ? `<img src="${imgUrl}" class="alat-grid-img">` : `<div class="alat-grid-img" style="display:flex; align-items:center; justify-content:center"><i class="ph ph-image" style="font-size: 3rem; color:var(--text-muted)"></i></div>`}
                        <span class="badge" style="position:absolute; top:8px; right:8px; background:rgba(0,0,0,0.65); backdrop-filter:blur(4px); font-size:0.7rem;">${katName}</span>
                        ${newBadgeHtml ? `<span class="new-alat-badge new-alat-badge-grid">NEW</span>` : ''}
                    </div>
                    <div style="font-size: 0.75rem; color: var(--text-muted); display:flex; justify-content:space-between; gap: 0.3rem; min-width: 0;">
                        <span style="flex: 1; font-family:monospace; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; font-weight:700;">${a.kode_seri}</span>
                    </div>
                    <h4 style="margin: 0.2rem 0; font-size: 0.95rem;">${a.nama}</h4>
                    <div style="margin-top:auto; padding-top:0.4rem;">
                        ${stockMeterHtml}
                    </div>
                    <div style="font-size: 0.8rem; display: flex; justify-content: space-between; margin-top: 0.4rem; align-items:center;">
                        <span style="font-size:0.75rem; color:var(--text-muted);">Kondisi:</span>
                        <span style="color: ${kondisiColor}; font-weight: 600; font-size:0.8rem;">${a.kondisi}</span>
                    </div>
                    <div style="display:flex; gap: 0.4rem; margin-top: 0.6rem;">
                        <button class="btn btn-outline btn-sm" style="flex:1" onclick='app.openCetakBarcodeModal(${JSON.stringify(a)})' title="Cetak Barcode / QR"><i class="ph ph-qr-code"></i></button>
                        <button class="btn btn-outline btn-sm" style="flex:1" onclick='app.editAlat(${JSON.stringify(a)})' title="Edit"><i class="ph ph-pencil"></i></button>
                        <button class="btn btn-outline btn-sm" style="flex:1; border-color: var(--danger); color: var(--danger);" onclick="app.hapusAlat('${a.id || a.newId}')" title="Hapus"><i class="ph ph-trash"></i></button>
                    </div>
                `;
                grid.appendChild(gridItem);
            }
        });

        // Toggle View Mode
        const tableContainer = document.getElementById('alat-table-container');
        const gridContainer = document.getElementById('alat-grid-container');
        const viewIcon = document.querySelector('#btn-view-toggle i');

        if (this.state.alatViewMode === 'grid') {
            if (tableContainer) tableContainer.classList.add('hidden');
            if (gridContainer) gridContainer.classList.remove('hidden');
            if (viewIcon) viewIcon.classList.replace('ph-squares-four', 'ph-list');
        } else {
            if (tableContainer) tableContainer.classList.remove('hidden');
            if (gridContainer) gridContainer.classList.add('hidden');
            if (viewIcon) viewIcon.classList.replace('ph-list', 'ph-squares-four');
        }
    },

    hapusAlat: async function (id) {
        if (!await this.showDialog('Hapus Alat', 'Apakah Anda yakin ingin menghapus alat ini permanen?', 'error')) return;
        this.showLoading('Menghapus alat...');
        const allItems = await db.getAll('alat');
        const targetId = String(id || '').trim().toLowerCase();
        const matchingItems = allItems.filter(item => {
            const identities = [db.getStoreItemId('alat', item), item.id, item.newId, item.kode_seri]
                .filter(Boolean).map(value => String(value).trim().toLowerCase());
            return identities.includes(targetId);
        });
        const item = matchingItems[0] || null;
        for (const matchingItem of matchingItems) {
            const keys = [db.getStoreItemId('alat', matchingItem), matchingItem.id, matchingItem.newId, matchingItem.kode_seri]
                .filter(Boolean).map(value => String(value));
            for (const key of new Set(keys)) await db.stores.alat.removeItem(key);
        }
        const payload = item ? { ...item, id: id, newId: id } : { id: id, newId: id };
        const queue = await db.getAll('syncQueue');
        for (const task of queue) {
            if (task.storeName !== 'alat' || task.action.startsWith('delete')) continue;
            const taskPayload = task.payload || {};
            const taskIdentities = [db.getStoreItemId('alat', taskPayload), taskPayload.id, taskPayload.newId, taskPayload.kode_seri]
                .filter(Boolean).map(value => String(value).trim().toLowerCase());
            const deletedIdentities = [id, payload.id, payload.newId, payload.kode_seri]
                .filter(Boolean).map(value => String(value).trim().toLowerCase());
            if (taskIdentities.some(identity => deletedIdentities.includes(identity))) {
                await db.stores.syncQueue.removeItem(task.id);
            }
        }
        await db.queueSyncTask('delete_alat', 'alat', payload);
        this.hideLoading();
        this.showToast('Alat berhasil dihapus', 'success');
        this.loadAlat();
        db.syncToServer();
    },

    openAlatModal: async function () {
        document.getElementById('alat-form').reset();
        document.getElementById('alat-id').value = '';
        document.getElementById('alat-foto-url').value = '';
        document.getElementById('alat-keterangan').value = '';
        document.getElementById('foto-preview').innerHTML = '<i class="ph ph-image" style="font-size: 3rem; color: var(--text-muted)"></i>';

        const jurusanBox = document.getElementById('alat-jurusan').closest('div');
        if (this.state.user.role !== 'Admin') jurusanBox.style.display = 'none';
        else jurusanBox.style.display = 'block';

        await this.populateKategoriSelect();

        document.getElementById('alat-modal-title').textContent = 'Tambah Alat';
        this.openModal('alat-modal');
    },

    editAlat: async function (a) {
        const jurusanBox = document.getElementById('alat-jurusan').closest('div');
        if (this.state.user.role !== 'Admin') jurusanBox.style.display = 'none';
        else jurusanBox.style.display = 'block';

        await this.populateKategoriSelect();

        document.getElementById('alat-id').value = a.id || a.newId;
        document.getElementById('alat-kode').value = a.kode_seri;
        document.getElementById('alat-nama').value = a.nama;
        document.getElementById('alat-kategori').value = a.kategori_id;
        document.getElementById('alat-jurusan').value = a.jurusan_id;
        document.getElementById('alat-total').value = a.jumlah_total;
        document.getElementById('alat-tersedia').value = a.jumlah_tersedia;
        document.getElementById('alat-kondisi').value = a.kondisi;
        document.getElementById('alat-keterangan').value = a.keterangan || a.Keterangan || '';
        document.getElementById('alat-foto-url').value = a.foto || '';


        if (a.foto) {
            const previewUrl = this.getDriveImageUrl(a.foto);
            document.getElementById('foto-preview').innerHTML = `<img src="${previewUrl}" style="width:100%; height:100%; object-fit:cover;">`;
        } else {
            document.getElementById('foto-preview').innerHTML = '<i class="ph ph-image" style="font-size: 3rem; color: var(--text-muted)"></i>';
        }

        document.getElementById('alat-modal-title').textContent = 'Edit Alat';
        this.openModal('alat-modal');
    },

    populateKategoriSelect: async function () {
        const rawData = await db.getAll('kategori');
        const dataAlat = this.getFilteredData(rawData);

        // Strict filter for Bahan category based on current user's jurusan
        let dataBahan = rawData;
        if (this.state.user && this.state.user.role !== 'Admin') {
            const myJurusanId = String(this.state.user.jurusan_id || '');
            dataBahan = rawData.filter(k => {
                const katJurusan = String(k.jurusan_id || k.Kode_jurusan || k.Jurusan_ID || '');
                // Allow if matches or if category somehow doesn't have a specific major listed
                return katJurusan === myJurusanId || katJurusan === '';
            });
        }

        const selectAlat = document.getElementById('alat-kategori');
        if (selectAlat) {
            selectAlat.innerHTML = '<option value="">Pilih Kategori...</option>';
            dataAlat.forEach(k => {
                selectAlat.innerHTML += `<option value="${k.id || k.newId}">${k.nama}</option>`;
            });
        }
        const selectBahan = document.getElementById('bahan-kategori');
        if (selectBahan) {
            selectBahan.innerHTML = '<option value="">Pilih Kategori...</option>';
            dataBahan.forEach(k => {
                selectBahan.innerHTML += `<option value="${k.nama}">${k.nama}</option>`;
            });
        }
    },

    triggerAlatFotoCamera: function () {
        document.getElementById('alat-foto-file-camera')?.click();
    },

    triggerAlatFotoGallery: function () {
        document.getElementById('alat-foto-file-gallery')?.click();
    },

    // Batas ukuran file mentah yang diterima dari input (sebelum dikompres).
    // File di atas ini ditolak agar tidak membebani browser saat resize/encode.
    MAX_FOTO_ALAT_RAW_BYTES: 8 * 1024 * 1024, // 8 MB
    MAX_FOTO_ALAT_WIDTH: 1024, // lebar maksimum hasil kompresi

    handleFotoUpload: function (event) {
        const file = event.target.files[0];
        if (!file) return;

        if (!file.type || !file.type.startsWith('image/')) {
            this.showToast('File harus berupa gambar.', 'error');
            event.target.value = '';
            return;
        }

        if (file.size > this.MAX_FOTO_ALAT_RAW_BYTES) {
            const maxMb = (this.MAX_FOTO_ALAT_RAW_BYTES / (1024 * 1024)).toFixed(0);
            this.showToast(`Ukuran foto terlalu besar (maks ${maxMb} MB). Pilih foto lain atau kecilkan dulu.`, 'error');
            event.target.value = '';
            return;
        }

        const reader = new FileReader();
        reader.onload = (evt) => {
            const imgEl = new Image();
            imgEl.onload = () => {
                // Resize & kompresi ke JPEG agar payload sync jauh lebih kecil,
                // konsisten dengan penanganan foto profil (handleProfFotoUpload).
                const canvas = document.createElement('canvas');
                const ctx = canvas.getContext('2d');
                const MAX_WIDTH = this.MAX_FOTO_ALAT_WIDTH;
                let scaleSize = 1;
                if (imgEl.width > MAX_WIDTH) scaleSize = MAX_WIDTH / imgEl.width;
                canvas.width = imgEl.width * scaleSize;
                canvas.height = imgEl.height * scaleSize;
                ctx.drawImage(imgEl, 0, 0, canvas.width, canvas.height);
                const dataUrl = canvas.toDataURL('image/jpeg', 0.8);

                document.getElementById('foto-preview').innerHTML = `<img src="${dataUrl}" style="width:100%; height:100%; object-fit:cover;">`;
                document.getElementById('alat-foto-url').value = dataUrl;
            };
            imgEl.onerror = () => {
                this.showToast('Gagal membaca file gambar.', 'error');
                event.target.value = '';
            };
            imgEl.src = evt.target.result;
        };
        reader.onerror = () => {
            this.showToast('Gagal membaca file gambar.', 'error');
            event.target.value = '';
        };
        reader.readAsDataURL(file);
    },

    saveAlat: async function () {
        const id = document.getElementById('alat-id').value;
        const payload = {
            kode_seri: document.getElementById('alat-kode').value,
            nama: document.getElementById('alat-nama').value,
            kategori_id: document.getElementById('alat-kategori').value,
            jumlah_total: parseInt(document.getElementById('alat-total').value),
            jumlah_tersedia: parseInt(document.getElementById('alat-tersedia').value),
            kondisi: document.getElementById('alat-kondisi').value,
            keterangan: document.getElementById('alat-keterangan').value,
            jurusan_id: this.state.user.role === 'Admin' ? document.getElementById('alat-jurusan').value : this.state.user.jurusan_id,
            foto: document.getElementById('alat-foto-url').value, // base64 or URL
            created_by: this.state.user.id
        };

        const storeId = id || 'ALT-' + Date.now();
        if (id) {
            payload.id = id;
        } else {
            payload.id = storeId;
            payload.tanggal_masuk = new Date().toISOString().split('T')[0];
        }

        this.showLoading('Menyimpan...');
        const existingItems = await db.getAll('alat');
        for (const existing of existingItems) {
            const sameId = id && [existing.id, existing.newId, db.getStoreItemId('alat', existing)]
                .filter(Boolean).some(value => String(value) === String(id));
            if (sameId) {
                const oldKeys = [existing.id, existing.newId, db.getStoreItemId('alat', existing)]
                    .filter(Boolean).map(value => String(value));
                for (const oldKey of new Set(oldKeys)) await db.stores.alat.removeItem(oldKey);
            }
        }
        // Note: We might want to upload base64 image to Google Drive via GAS when syncing.
        await db.stores.alat.setItem(String(storeId), payload);
        await db.queueSyncTask(id ? 'update_alat' : 'insert_alat', 'alat', payload);

        this.hideLoading();
        this.closeModal('alat-modal');
        this.showToast('Alat berhasil disimpan', 'success');
        this.loadAlat();
        db.syncToServer();
    },

    exportAlat: async function () {
        const data = this.getFilteredData(await db.getAll('alat'));
        if (!data || data.length === 0) return this.showToast('Belum ada data untuk diexport', 'warning');

        let csv = 'ID,Kode Seri,Nama,Kategori ID,Total,Tersedia,Kondisi,Jurusan ID\n';
        data.forEach(a => {
            csv += `"${a.id || a.newId}","${a.kode_seri}","${a.nama}","${a.kategori_id}","${a.jumlah_total}","${a.jumlah_tersedia}","${a.kondisi}","${a.jurusan_id}"\n`;
        });

        const blob = new Blob([csv], { type: 'text/csv' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'Data_Alat.csv';
        a.click();
    },

    // --- Barcode & QR Code Sticker Printing
    openCetakBarcodeModal: async function (selectedAlat = null) {
        const rawAlat = await db.getAll('alat');
        const alatList = this.getFilteredData(rawAlat);

        const selectSingle = document.getElementById('barcode-single-tool-select');
        const scopeSelect = document.getElementById('barcode-scope-select');
        const singleWrapper = document.getElementById('barcode-single-select-wrapper');

        if (selectSingle) {
            selectSingle.innerHTML = '';
            alatList.forEach(a => {
                const opt = document.createElement('option');
                opt.value = a.id || a.newId;
                opt.textContent = `${a.kode_seri} - ${a.nama}`;
                selectSingle.appendChild(opt);
            });
        }

        if (selectedAlat) {
            const targetId = selectedAlat.id || selectedAlat.newId;
            if (scopeSelect) scopeSelect.value = 'single';
            if (singleWrapper) singleWrapper.classList.remove('hidden');
            if (selectSingle) selectSingle.value = targetId;
        } else {
            if (scopeSelect) scopeSelect.value = 'all';
            if (singleWrapper) singleWrapper.classList.add('hidden');
        }

        this.openModal('barcode-modal');
        await this.renderBarcodePreview();
    },

    onBarcodeScopeChange: function () {
        const scope = document.getElementById('barcode-scope-select')?.value || 'all';
        const singleWrapper = document.getElementById('barcode-single-select-wrapper');
        if (singleWrapper) {
            if (scope === 'single') {
                singleWrapper.classList.remove('hidden');
            } else {
                singleWrapper.classList.add('hidden');
            }
        }
        this.renderBarcodePreview();
    },

    renderBarcodePreview: async function () {
        const container = document.getElementById('barcode-preview-container');
        const totalCountElem = document.getElementById('barcode-total-count');
        if (!container) return;

        container.innerHTML = '<div style="text-align:center; padding:2rem; color:#64748b;"><i class="ph ph-spinner" style="font-size:1.5rem; animation: spin 1s infinite linear;"></i> Memuat pratinjau stiker...</div>';

        const rawAlat = await db.getAll('alat');
        const filteredAlat = this.getFilteredData(rawAlat);
        const jurusanList = await db.getAll('jurusan');
        const jurusanMap = {};
        jurusanList.forEach(j => {
            jurusanMap[String(j.id || j.newId)] = j.nama || j.kode || 'UMUM';
        });

        const type = document.getElementById('barcode-type-select')?.value || 'barcode';
        const scope = document.getElementById('barcode-scope-select')?.value || 'all';
        const singleId = document.getElementById('barcode-single-tool-select')?.value;

        let targetAlat = [];
        if (scope === 'single') {
            targetAlat = filteredAlat.filter(a => String(a.id || a.newId) === String(singleId));
            if (targetAlat.length === 0 && filteredAlat.length > 0) targetAlat = [filteredAlat[0]];
        } else {
            targetAlat = filteredAlat;
        }

        if (totalCountElem) totalCountElem.textContent = targetAlat.length;

        if (targetAlat.length === 0) {
            container.innerHTML = '<div style="text-align:center; padding:2rem; color:#64748b;">Tidak ada data alat untuk dicetak</div>';
            return;
        }

        container.innerHTML = '';

        targetAlat.forEach((a, idx) => {
            const card = document.createElement('div');
            card.className = 'barcode-sticker-card';

            const kodeText = String(a.kode_seri || a.id || a.newId || 'ALAT-000').trim();
            const titleText = a.nama || 'Nama Alat';

            const graphicWrapper = document.createElement('div');
            graphicWrapper.className = 'barcode-sticker-graphic';

            if (type === 'barcode') {
                const svgElem = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
                svgElem.id = `barcode-svg-${idx}`;
                graphicWrapper.appendChild(svgElem);
                card.appendChild(graphicWrapper);

                const codeElem = document.createElement('div');
                codeElem.className = 'barcode-sticker-code';
                codeElem.textContent = kodeText;
                card.appendChild(codeElem);

                const titleElem = document.createElement('div');
                titleElem.className = 'barcode-sticker-title';
                titleElem.textContent = titleText;
                card.appendChild(titleElem);

                container.appendChild(card);

                // Render with JsBarcode
                try {
                    if (typeof JsBarcode !== 'undefined') {
                        JsBarcode(svgElem, kodeText, {
                            format: "CODE128",
                            width: 1.5,
                            height: 38,
                            displayValue: false, // Ditampilkan terpisah di barcode-sticker-code
                            margin: 2
                        });
                    }
                } catch (err) {
                    console.warn('JsBarcode error for text:', kodeText, err);
                }
            } else {
                // QR Code
                const qrDiv = document.createElement('div');
                qrDiv.id = `qrcode-div-${idx}`;
                graphicWrapper.appendChild(qrDiv);
                card.appendChild(graphicWrapper);

                const codeElem = document.createElement('div');
                codeElem.className = 'barcode-sticker-code';
                codeElem.textContent = kodeText;
                card.appendChild(codeElem);

                const titleElem = document.createElement('div');
                titleElem.className = 'barcode-sticker-title';
                titleElem.textContent = titleText;
                card.appendChild(titleElem);

                container.appendChild(card);

                // Render with QRCode.js
                try {
                    if (typeof QRCode !== 'undefined') {
                        new QRCode(qrDiv, {
                            text: kodeText,
                            width: 64,
                            height: 64,
                            colorDark: "#000000",
                            colorLight: "#ffffff",
                            correctLevel: QRCode.CorrectLevel.M
                        });
                    }
                } catch (err) {
                    console.warn('QRCode error for text:', kodeText, err);
                }
            }
        });
    },

    printBarcodeLabels: function () {
        const previewContainer = document.getElementById('barcode-preview-container');
        const printArea = document.getElementById('print-barcode-area');
        if (!previewContainer || !printArea) return;

        printArea.innerHTML = previewContainer.innerHTML;
        window.print();
    },

    // --- Peminjaman Logic
    initPeminjaman: function () {
        this.state.cart = [];
        document.getElementById('form-peminjaman').reset();
        document.getElementById('pem-kembali').valueAsDate = new Date(Date.now() + 86400000); // Tomorrow
        this.renderCart();
        this.loadActivePeminjaman();
    },

    loadActivePeminjaman: async function () {
        const rawData = await db.getAll('peminjaman');
        const filtered = this.getFilteredData(rawData);
        this.state.peminjaman = filtered;
        const data = filtered.filter(p => p.status && p.status.trim().toUpperCase() === 'DIPINJAM').sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

        const tbody = document.querySelector('#table-active-peminjaman tbody');
        const countBadge = document.getElementById('active-peminjaman-count');

        tbody.innerHTML = '';
        countBadge.textContent = `${data.length} Aktif`;
        
        // Update bottom nav badge
        this.updatePeminjamanBadge();

        if (data.length === 0) {
            tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; padding: 2rem; color: var(--text-muted);">Tidak ada peminjaman aktif saat ini</td></tr>';
            return;
        }

        data.forEach(p => {
            const tr = document.createElement('tr');
            const items = JSON.parse(p.items || '[]');
            let overdueBadge = '';
            if (this.isOverdue(p.tanggal_kembali_estimasi)) {
                overdueBadge = '<span class="badge bg-danger" style="margin-top:0.2rem; font-size:0.75rem;">TERLAMBAT</span>';
                tr.style.backgroundColor = 'rgba(239, 68, 68, 0.05)';
            }
            
            tr.innerHTML = `
                <td><b>${p.nomor_peminjaman}</b></td>
                <td><b>${p.nama_peminjam}</b><small>${p.kelas_unit}</small></td>
                <td>
                    <small>${this.formatDate(p.tanggal_kembali_estimasi)}</small><br>
                    ${overdueBadge}
                </td>
                <td>
                    <span class="badge badge-outline clickable-badge" 
                           onclick='app.showPeminjamanDetail(${JSON.stringify(p)})'
                           style="cursor:pointer; border-color:var(--primary); color:var(--primary)">
                        ${items.length} Item <i class="ph ph-eye"></i>
                    </span>
                </td>
                <td>
                    <div class="action-buttons">
                        <button class="btn btn-sm btn-outline" onclick='app.cetakReceipt(${JSON.stringify(p)})' title="Cetak Struk"><i class="ph ph-printer"></i></button>
                        <button class="btn btn-sm btn-outline" onclick='app.editPeminjaman(${JSON.stringify(p)})' title="Edit Transaksi"><i class="ph ph-pencil"></i></button>
                        <button class="btn btn-sm btn-primary" onclick='app.kembalikanAlat(${JSON.stringify(p)})' title="Kembalikan"><i class="ph ph-arrow-u-up-left"></i></button>
                    </div>
                </td>
            `;
            tbody.appendChild(tr);
        });
    },

    // --- Audio Beep Feedback (Web Audio API) ---
    playBeep: function () {
        try {
            const AudioCtx = window.AudioContext || window.webkitAudioContext;
            if (AudioCtx) {
                const ctx = new AudioCtx();
                const osc = ctx.createOscillator();
                const gain = ctx.createGain();
                osc.connect(gain);
                gain.connect(ctx.destination);
                osc.type = 'sine';
                osc.frequency.setValueAtTime(880, ctx.currentTime);
                osc.frequency.exponentialRampToValueAtTime(1320, ctx.currentTime + 0.1);
                gain.gain.setValueAtTime(0.25, ctx.currentTime);
                gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.15);
                osc.start(ctx.currentTime);
                osc.stop(ctx.currentTime + 0.15);
            }
        } catch (e) { }

        if (navigator.vibrate) {
            try { navigator.vibrate(100); } catch (e) { }
        }
    },

    // --- Barcode & QR Code Processing Logic ---
    handleScanResult: async function (scannedText) {
        if (!scannedText) return;
        const code = String(scannedText).trim();
        if (!code) return;

        const rawAlat = await db.getAll('alat');
        const filteredAlat = this.getFilteredData(rawAlat);

        // Find tool by kode_seri or id
        const targetAlat = filteredAlat.find(a => {
            const ks = String(a.kode_seri || '').trim().toLowerCase();
            const aid = String(a.id || a.newId || '').trim().toLowerCase();
            const searchKey = code.toLowerCase();
            return ks === searchKey || aid === searchKey;
        });

        if (!targetAlat) {
            this.showToast(`Alat dengan kode "${code}" tidak ditemukan!`, 'error');
            const statusBox = document.getElementById('scanner-status-box');
            if (statusBox) {
                statusBox.innerHTML = `<span style="color:var(--danger);"><i class="ph ph-warning"></i> Kode "${code}" tidak ditemukan dalam sistem</span>`;
            }
            return;
        }

        // Check stock availability
        const maxStok = Number(targetAlat.jumlah_tersedia || 0);
        if (maxStok <= 0) {
            this.showToast(`Stok alat "${targetAlat.nama}" sedang habis (0)!`, 'warning');
            const statusBox = document.getElementById('scanner-status-box');
            if (statusBox) {
                statusBox.innerHTML = `<span style="color:var(--warning);"><i class="ph ph-warning"></i> Stok "${targetAlat.nama}" sedang habis!</span>`;
            }
            return;
        }

        // Add to active cart
        const cartTarget = this.state.isEditingPeminjaman ? this.state.editCart : this.state.cart;
        if (!cartTarget) {
            if (this.state.isEditingPeminjaman) this.state.editCart = [];
            else this.state.cart = [];
        }
        const activeCart = this.state.isEditingPeminjaman ? this.state.editCart : this.state.cart;
        const targetId = db.getItemId(targetAlat);
        const existing = activeCart.find(item => db.getItemId(item) === targetId);

        if (existing) {
            if (existing.qty < maxStok) {
                existing.qty++;
            } else {
                this.showToast(`Jumlah alat "${targetAlat.nama}" mencapai batas stok (${maxStok})!`, 'warning');
                return;
            }
        } else {
            activeCart.push({ ...targetAlat, qty: 1 });
        }

        this.playBeep();

        if (this.state.isEditingPeminjaman) {
            this.renderEditCart();
        } else {
            this.renderCart();
        }

        this.showToast(`✓ Ditambahkan: ${targetAlat.nama}`, 'success');

        // Update Scanner Modal UI if open
        const statusBox = document.getElementById('scanner-status-box');
        if (statusBox) {
            statusBox.innerHTML = `<span style="color:var(--success);"><i class="ph ph-check-circle"></i> Berhasil di-scan: <b>${targetAlat.nama}</b> (${targetAlat.kode_seri})</span>`;
        }

        const previewContainer = document.getElementById('scanner-scanned-preview');
        const recentList = document.getElementById('scanner-recent-list');
        const countBadge = document.getElementById('scanner-count-badge');
        if (previewContainer && recentList) {
            previewContainer.style.display = 'block';
            const totalItemCount = activeCart.reduce((sum, item) => sum + (item.qty || 1), 0);
            if (countBadge) countBadge.textContent = `${totalItemCount} item`;

            const itemDiv = document.createElement('div');
            itemDiv.style.cssText = 'padding: 0.25rem 0; display: flex; justify-content: space-between; align-items: center; border-bottom: 1px dashed rgba(255,255,255,0.08);';
            itemDiv.innerHTML = `<span><b>${targetAlat.nama}</b> <small style="color:var(--text-muted);">(${targetAlat.kode_seri})</small></span> <span class="badge bg-indigo" style="font-size:0.7rem;">x${existing ? existing.qty : 1}</span>`;
            recentList.prepend(itemDiv);
        }

        // If continuous scan is unchecked, automatically close modal
        const continuousCheck = document.getElementById('scan-continuous-check');
        if (continuousCheck && !continuousCheck.checked) {
            setTimeout(() => this.closeScannerModal(), 700);
        }
    },

    // --- Hardware Barcode Gun Scanner Key Handler ---
    handleBarcodeGunKey: function (e) {
        if (e.key === 'Enter') {
            e.preventDefault();
            const input = document.getElementById('barcode-gun-input');
            if (input && input.value.trim()) {
                const code = input.value.trim();
                input.value = '';
                this.handleScanResult(code);
            }
        }
    },

    // --- Live Camera Scanner Modal Logic (html5-qrcode) ---
    openScannerModal: async function (isEdit = false) {
        this.state.isEditingPeminjaman = isEdit;
        this.openModal('scanner-modal');

        const statusBox = document.getElementById('scanner-status-box');
        if (statusBox) {
            statusBox.innerHTML = '<i class="ph ph-crosshair" style="color:var(--accent);"></i> Menyiapkan kamera scanner...';
        }
        const recentList = document.getElementById('scanner-recent-list');
        if (recentList) recentList.innerHTML = '';
        const previewContainer = document.getElementById('scanner-scanned-preview');
        if (previewContainer) previewContainer.style.display = 'none';

        if (typeof Html5Qrcode === 'undefined') {
            this.showToast('Library pemindai kamera sedang dimuat...', 'warning');
            return;
        }

        try {
            if (this.html5QrCodeInstance) {
                try { await this.html5QrCodeInstance.stop(); } catch (e) { }
            }

            this.html5QrCodeInstance = new Html5Qrcode("qr-reader");

            const cameras = await Html5Qrcode.getCameras();
            const select = document.getElementById('camera-select');
            if (select) {
                select.innerHTML = '';
                if (cameras && cameras.length > 0) {
                    cameras.forEach(cam => {
                        const opt = document.createElement('option');
                        opt.value = cam.id;
                        opt.textContent = cam.label || `Kamera ${cam.id}`;
                        select.appendChild(opt);
                    });

                    // Prefer back / environment camera
                    const backCam = cameras.find(c => /back|rear|environment|belakang/i.test(c.label));
                    if (backCam) {
                        select.value = backCam.id;
                    }
                } else {
                    select.innerHTML = '<option value="">Tidak ada kamera terdeteksi</option>';
                }
            }

            const chosenCameraId = select && select.value ? select.value : { facingMode: "environment" };
            await this.startCameraScanner(chosenCameraId);
        } catch (err) {
            console.error("Camera scan init error:", err);
            if (statusBox) {
                statusBox.innerHTML = `<span style="color:var(--danger);"><i class="ph ph-warning-circle"></i> Izin kamera ditolak atau kamera tidak tersedia</span>`;
            }
            this.showToast('Gagal mengakses kamera: ' + (err.message || err), 'error');
        }
    },

    startCameraScanner: async function (cameraIdOrConfig) {
        if (!this.html5QrCodeInstance) return;

        let lastScannedTime = 0;
        let lastScannedCode = '';

        const config = {
            fps: 15,
            qrbox: { width: 250, height: 160 },
            aspectRatio: 1.333334,
            experimentalFeatures: {
                useBarCodeDetectorIfSupported: true
            }
        };

        const onScanSuccess = (decodedText) => {
            const now = Date.now();
            // Prevent duplicate triggers within 1.5 seconds for the same code
            if (decodedText === lastScannedCode && (now - lastScannedTime) < 1500) {
                return;
            }
            lastScannedTime = now;
            lastScannedCode = decodedText;
            this.handleScanResult(decodedText);
        };

        try {
            await this.html5QrCodeInstance.start(
                cameraIdOrConfig,
                config,
                onScanSuccess,
                () => {} // Silent on scan failure frame
            );
            const statusBox = document.getElementById('scanner-status-box');
            if (statusBox) {
                statusBox.innerHTML = '<i class="ph ph-crosshair" style="color:var(--accent);"></i> Arahkan kamera ke Barcode 1D / QR Code alat';
            }
        } catch (e) {
            console.error("Start scanner error:", e);
        }
    },

    changeCamera: async function () {
        const select = document.getElementById('camera-select');
        if (!select || !select.value || !this.html5QrCodeInstance) return;

        try {
            await this.html5QrCodeInstance.stop();
            await this.startCameraScanner(select.value);
        } catch (e) {
            console.error("Change camera error:", e);
        }
    },

    closeScannerModal: async function () {
        if (this.html5QrCodeInstance) {
            try {
                await this.html5QrCodeInstance.stop();
            } catch (e) { }
        }
        this.closeModal('scanner-modal');
    },

    openPilihAlatModal: async function () {
        this.state.isEditingPeminjaman = false;
        this.openModal('pilih-alat-modal');
        this.filterPilihAlat();
    },

    filterPilihAlat: async function () {
        const keyword = document.getElementById('search-alat').value.toLowerCase();
        const alatData = this.getFilteredData(await db.getAll('alat'));
        const tbody = document.querySelector('#table-pilih-alat tbody');
        tbody.innerHTML = '';

        alatData.forEach(a => {
            if (a.nama.toLowerCase().includes(keyword) || a.kode_seri.toLowerCase().includes(keyword)) {
                if (Number(a.jumlah_tersedia) > 0) {
                    const tr = document.createElement('tr');
                    tr.innerHTML = `
                        <td><b>${a.nama}</b><br><small>${a.kode_seri}</small></td>
                        <td>${a.jumlah_tersedia}</td>
                        <td><button class="btn btn-sm btn-outline" onclick='app.addToCart(${JSON.stringify(a)})'>Pilih</button></td>
                    `;
                    tbody.appendChild(tr);
                }
            }
        });
    },

    addToCart: function (a) {
        const cartTarget = this.state.isEditingPeminjaman ? this.state.editCart : this.state.cart;
        if (!cartTarget) {
            this.state.editCart = [];
        }
        const activeCart = this.state.isEditingPeminjaman ? this.state.editCart : this.state.cart;
        
        const targetId = db.getItemId(a);
        const existing = activeCart.find(item => db.getItemId(item) === targetId);
        if (existing) {
            const maxStok = Number(a.jumlah_tersedia || a.Jumlah_Tersedia || 0);
            if (existing.qty < maxStok) {
                existing.qty++;
            } else {
                return this.showToast('Jumlah melebihi stok tersedia!', 'warning');
            }
        } else {
            activeCart.push({ ...a, qty: 1 });
        }
        this.closeModal('pilih-alat-modal');
        if (this.state.isEditingPeminjaman) {
            this.renderEditCart();
        } else {
            this.renderCart();
        }
    },

    renderCart: function () {
        const tbody = document.querySelector('#table-cart tbody');
        tbody.innerHTML = '';
        if (!this.state.cart || this.state.cart.length === 0) {
            tbody.innerHTML = '<tr id="cart-empty"><td colspan="4" style="text-align:center; color:gray;">Belum ada alat dipilih</td></tr>';
            return;
        }

        this.state.cart.forEach((item, index) => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>${item.kode_seri}</td>
                <td>${item.nama}</td>
                <td>
                    <input type="number" min="1" max="${item.jumlah_tersedia}" value="${item.qty}" 
                    style="width:60px; padding:0.2rem; background:rgba(0,0,0,0.2); border:1px solid #4f46e5; color:white;" 
                    onchange="app.updateCartQty(${index}, this.value)">
                </td>
                <td><button type="button" class="btn-icon" onclick="app.removeFromCart(${index})"><i class="ph ph-trash" style="color:var(--danger)"></i></button></td>
            `;
            tbody.appendChild(tr);
        });
    },

    updateCartQty: function (index, val) {
        const qty = parseInt(val);
        if (qty > 0 && qty <= this.state.cart[index].jumlah_tersedia) {
            this.state.cart[index].qty = qty;
        } else {
            this.showToast('Kuantitas tidak valid', 'warning');
            this.renderCart(); // reset view
        }
    },

    removeFromCart: function (index) {
        this.state.cart.splice(index, 1);
        this.renderCart();
    },

    savePeminjaman: async function (e) {
        if (e) e.preventDefault();
        if (this.state.cart.length === 0) return this.showToast('Pilih minimal 1 alat!', 'warning');

        let kodeJur = 'UMUM';
        try {
            const allJurusan = await db.getAll('jurusan');
            const myJurusan = allJurusan.find(j => String(j.id || j.newId) === String(this.state.user.jurusan_id));
            if (myJurusan && myJurusan.kode) {
                // Mengambil nilai variabel dari kolom 'kode' di Sheet Jurusan
                kodeJur = myJurusan.kode.trim().toUpperCase();
            } else if (myJurusan && myJurusan.nama) {
                // Fallback aman jika kolom kode kebetulan belum terisi
                kodeJur = myJurusan.nama.trim().split(' ')[0].toUpperCase();
            }
        } catch (e) { }
        const tahunSaatIni = new Date().getFullYear();
        const acak = Math.floor(1000 + Math.random() * 9000);
        const nomorTrx = `${kodeJur}-${tahunSaatIni}-${acak}`;

        const payload = {
            id: nomorTrx,
            newId: nomorTrx,
            nomor_peminjaman: nomorTrx,
            nama_peminjam: document.getElementById('pem-nama').value,
            nomor_hp: document.getElementById('pem-hp').value,
            kelas_unit: document.getElementById('pem-kelas').value,
            tanggal_pinjam: new Date().toISOString().split('T')[0],
            tanggal_kembali_estimasi: document.getElementById('pem-kembali').value,
            tanggal_kembali_aktual: '',
            status: 'DIPINJAM',
            Keterangan: document.getElementById('pem-keterangan').value,
            items: JSON.stringify(this.state.cart.map(i => ({
                id: i.id || i.newId,
                nama: i.nama,
                kode_seri: i.kode_seri,
                qty: i.qty
            }))),
            jurusan_id: this.state.user.jurusan_id,
            petugas: this.state.user.full_name,
            created_by: this.state.user.id,
            created_at: new Date().toISOString().split('T')[0]
        };

        this.showLoading('Memproses...');

        // Save transaction
        await db.stores.peminjaman.setItem(nomorTrx, payload);
        await db.queueSyncTask('insert_peminjaman', 'peminjaman', payload);

        // Update stock
        for (const item of this.state.cart) {
            const alat = await db.stores.alat.getItem(String(item.id || item.newId));
            if (alat) {
                alat.jumlah_tersedia = Number(alat.jumlah_tersedia) - item.qty;
                await db.stores.alat.setItem(String(alat.id || alat.newId), alat);
                await db.queueSyncTask('update_alat', 'alat', alat);
            }
        }

        document.getElementById('form-peminjaman').reset();
        this.state.cart = [];
        this.renderCart();

        this.hideLoading();
        this.showToast('Peminjaman berhasil disimpan!', 'success');

        // Wait a small moment for DB to settle and refresh lists
        setTimeout(async () => {
            this.initPeminjaman();
            this.loadActivePeminjaman();
            this.loadRiwayat();

            const askCetak = await this.showDialog('Cetak Struk?', 'Peminjaman berhasil disimpan!\nCetak struk sekarang?', 'confirm');
            if (askCetak) {
                this.cetakReceipt(payload);
            }
        }, 100);

        const syncOk = await db.syncToServer();
        if (!syncOk) {
            this.showToast('Peminjaman tersimpan lokal dan menunggu sinkronisasi saat online.', 'warning');
        }
    },

    cetakReceipt: async function (p) {
        const nama = p.nama_peminjam || 'Nama Peminjam';
        const kelas = p.kelas_unit || 'Kelas';
        const timestamp = this.formatDate(p.created_at);
        const tglPinjam = this.formatDate(p.tanggal_pinjam || p.created_at);
        const tglEstimasi = p.tanggal_kembali_estimasi ? this.formatDate(p.tanggal_kembali_estimasi) : '-';

        let petugasName = p.petugas;
        if (!petugasName && p.created_by) {
            try {
                const users = await db.getAll('users');
                const u = users.find(user => String(user.id || user.newId) === String(p.created_by));
                if (u) petugasName = u.full_name || u.username;
            } catch (e) { console.error(e); }
        }
        const petugas = petugasName || this.state.user.full_name;

        // Find jurusan name
        let jurusanName = p.jurusan_id || 'Semua Jurusan';
        try {
            const allJurusan = await db.getAll('jurusan');
            const found = allJurusan.find(j => String(j.id || j.newId) === String(p.jurusan_id));
            if (found) jurusanName = found.nama;
        } catch (e) { console.error('Error lookup jurusan', e); }

        let cartHtml = '';
        try {
            const items = JSON.parse(p.items || '[]');
            const allAlat = await db.getAll('alat');
            if (items && items.length > 0) {
                items.forEach(item => {
                    const qty = item.qty || item.jumlah || 1;
                    let nama = item.nama || item.kode_seri;
                    if (!nama) {
                        const matchedAlat = allAlat.find(a => String(a.id || a.newId) === String(item.id || item.newId));
                        if (matchedAlat) nama = matchedAlat.nama;
                    }
                    cartHtml += `<tr><td>${nama || 'Alat'}</td><td style="text-align:right">${qty}</td></tr>`;
                });
            }
        } catch (e) {
            cartHtml = '<tr><td colspan="2">Error parsing items</td></tr>';
        }

        const printWindow = window.open('', '', 'width=300,height=500');
        printWindow.document.write(`
            <html><head><title>Struk Thermal - ${p.nomor_peminjaman}</title>
            <style>
                body { font-family: monospace; font-size: 11px; width: 58mm; margin: 0; padding: 5px; color: #000; }
                .center { text-align: center; }
                h2 { margin: 5px 0 0 0; font-size: 14px; }
                p { margin: 2px 0; }
                .divider { border-top: 1px dashed #000; margin: 5px 0; }
                table { width: 100%; border-collapse: collapse; margin: 5px 0; }
                th, td { text-align: left; padding: 1px 0; }
                .footer { font-size: 10px; margin-top: 8px; text-align: center; }
            </style>
            </head><body>
                <div class="center">
                    <h2>SMKN 1 Bumijawa</h2>
                    <p style="font-size: 10px;">${jurusanName}</p>
                    <p style="font-size: 11px; font-weight: bold; margin: 8px 0 5px 0;">BUKTI PEMINJAMAN ALAT</p>
                </div>
                <div class="divider"></div>
                <p>TRX: <b>${p.nomor_peminjaman}</b></p>
                <p>Peminjam: <b>${nama}</b></p>
                <p>Kelas: ${kelas}</p>
                <p>Waktu Transaksi: ${timestamp}</p>
                <div class="divider"></div>
                <table>
                    <thead><tr><th>Item</th><th style="text-align:right">Qty</th></tr></thead>
                    <tbody>${cartHtml || '<tr><td colspan="2">No items</td></tr>'}</tbody>
                </table>
                <div class="divider"></div>
                <p>Tgl Pinjam       : <b>${tglPinjam}</b></p>
                <p>Tgl Kembali      : <b>${tglEstimasi}</b></p>
                <p>Petugas          : ${petugas}</p>
                <div class="divider"></div>
                <div class="center" style="margin-top: 10px;">
                    <img src="https://bwipjs-api.metafloor.com/?bcid=code128&text=${p.nomor_peminjaman}&scale=2&height=10&includetext" alt="Barcode" style="max-width: 100%; height: auto; max-height: 40px;"/>
                </div>
                <div class="divider"></div>
                <div class="footer">
                    <p>Simpan bukti ini untuk pengembalian<br>Terima Kasih</p>
                </div>
            </body></html>
        `);
        printWindow.document.close();
        printWindow.focus();
        setTimeout(() => {
            printWindow.print();
            printWindow.close();
        }, 800);
    },

    // --- Riwayat Peminjaman
    setRiwayatFilterStatus: function (status) {
        this.state.riwayatStatusFilter = status;
        const container = document.getElementById('riwayat-tabs');
        if (container) {
            const btns = container.querySelectorAll('.quick-tab-pill');
            btns.forEach(b => b.classList.remove('active'));
            const targetBtn = Array.from(btns).find(b => {
                const attr = b.getAttribute('onclick');
                return attr && attr.includes(`'${status}'`);
            });
            if (targetBtn) targetBtn.classList.add('active');
        }
        this.loadRiwayat();
    },

    toggleRiwayatView: function () {
        const tableView = document.getElementById('riwayat-table-view');
        const timelineView = document.getElementById('riwayat-timeline-view');
        const btn = document.getElementById('btn-riwayat-timeline');
        if (!tableView || !timelineView) return;

        const isTimeline = tableView.classList.contains('hidden');
        if (isTimeline) {
            tableView.classList.remove('hidden');
            timelineView.classList.add('hidden');
            if (btn) btn.innerHTML = '<i class="ph ph-list-bullets"></i> Timeline';
        } else {
            tableView.classList.add('hidden');
            timelineView.classList.remove('hidden');
            if (btn) btn.innerHTML = '<i class="ph ph-table"></i> Tabel';
            this.renderRiwayatTimeline();
        }
    },

    loadRiwayat: async function () {
        const rawData = this.getFilteredData(await db.getAll('peminjaman'));
        
        // Calculate status counts for quick tabs
        const countAll = rawData.length;
        const countDipinjam = rawData.filter(p => p.status && p.status.trim().toUpperCase() === 'DIPINJAM').length;
        const countKembali = rawData.filter(p => p.status && p.status.trim().toUpperCase() === 'KEMBALI').length;
        const countOverdue = rawData.filter(p => p.status && p.status.trim().toUpperCase() === 'DIPINJAM' && this.isOverdue(p.tanggal_kembali_estimasi)).length;

        const bAll = document.getElementById('riwayat-badge-all');
        const bDipinjam = document.getElementById('riwayat-badge-dipinjam');
        const bKembali = document.getElementById('riwayat-badge-kembali');
        const bOverdue = document.getElementById('riwayat-badge-overdue');
        if (bAll) bAll.textContent = countAll;
        if (bDipinjam) bDipinjam.textContent = countDipinjam;
        if (bKembali) bKembali.textContent = countKembali;
        if (bOverdue) bOverdue.textContent = countOverdue;

        let filtered = rawData;
        if (this.state.riwayatStatusFilter === 'DIPINJAM') {
            filtered = filtered.filter(p => p.status && p.status.trim().toUpperCase() === 'DIPINJAM');
        } else if (this.state.riwayatStatusFilter === 'KEMBALI') {
            filtered = filtered.filter(p => p.status && p.status.trim().toUpperCase() === 'KEMBALI');
        } else if (this.state.riwayatStatusFilter === 'OVERDUE') {
            filtered = filtered.filter(p => p.status && p.status.trim().toUpperCase() === 'DIPINJAM' && this.isOverdue(p.tanggal_kembali_estimasi));
        }

        const data = filtered.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

        const tbody = document.querySelector('#table-riwayat tbody');
        tbody.innerHTML = '';
        if (data.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; padding: 2rem; color:var(--text-muted);"><i class="ph ph-magnifying-glass" style="font-size:1.5rem; display:block; margin-bottom:0.5rem; opacity:0.5;"></i>Tidak ada riwayat peminjaman yang cocok</td></tr>';
            return;
        }

        data.forEach(p => {
            let statusBadge = p.status === 'DIPINJAM' ? '<span class="badge" style="background:rgba(245,158,11,0.2); color:#fbbf24; border:1px solid rgba(245,158,11,0.35); font-size:0.75rem;">DIPINJAM</span>' : '<span class="badge" style="background:rgba(16,185,129,0.2); color:#34d399; border:1px solid rgba(16,185,129,0.35); font-size:0.75rem;">KEMBALI</span>';
            const tr = document.createElement('tr');
            tr.dataset.status = p.status || '';
            tr.dataset.tanggalPinjam = (p.tanggal_pinjam || p.created_at || '').split('T')[0];

            // Format Dates
            const pinjamDate = this.formatDate(p.created_at);
            const kembaliDate = p.tanggal_kembali_aktual ? this.formatDate(p.tanggal_kembali_aktual) : '-';
            const note = p.Keterangan || p.keterangan || '';
            const items = JSON.parse(p.items || '[]');

            let editButtonHtml = '';
            let overdueBadge = '';
            if (p.status === 'DIPINJAM') {
                editButtonHtml = `
                    <button class="btn-icon" onclick='app.editPeminjaman(${JSON.stringify(p)})' title="Edit Transaksi">
                        <i class="ph ph-pencil" style="color:var(--primary)"></i>
                    </button>
                `;
                
                if (this.isOverdue(p.tanggal_kembali_estimasi)) {
                    overdueBadge = '<span class="badge bg-danger" style="margin-top:0.2rem; font-size:0.7rem; padding:0.15rem 0.4rem;">TERLAMBAT</span>';
                    tr.style.backgroundColor = 'rgba(239, 68, 68, 0.04)';
                }
            }

            tr.innerHTML = `
                <td><b style="font-family:monospace; font-size:0.9rem;">${p.nomor_peminjaman}</b></td>
                <td>
                    <div style="font-weight:700;">${p.nama_peminjam}</div>
                    <small style="color:var(--text-muted); font-size:0.78rem;">${p.kelas_unit || '-'} • ${p.nomor_hp || '-'}</small>
                </td>
                <td>
                    <div style="font-size:0.82rem;"><b>Pinjam:</b> ${pinjamDate}</div>
                    <div style="font-size:0.8rem; color:var(--text-muted);"><b>Kembali:</b> ${kembaliDate}</div>
                    ${overdueBadge}
                </td>
                <td>
                    <span class="badge clickable-badge" 
                          onclick='app.showPeminjamanDetail(${JSON.stringify(p)})'
                          style="cursor:pointer; background:rgba(99,102,241,0.15); color:var(--primary-light); padding: 0.35rem 0.6rem; font-size:0.78rem;" title="Lihat Rincian Alat">
                        ${items.length} Item Alat <i class="ph ph-eye"></i>
                    </span>
                    ${note ? `<br><small style="color:var(--text-muted); font-size:0.75rem; font-style:italic;">${note}</small>` : ''}
                </td>
                <td>${statusBadge}</td>
                <td>
                    <div style="display:flex; align-items:center; gap:0.3rem;">
                        <button class="btn-icon" onclick='app.cetakReceipt(${JSON.stringify(p)})' title="Cetak Struk Thermal">
                            <i class="ph ph-printer" style="color:var(--accent)"></i>
                        </button>
                        <button class="btn-icon" onclick='app.showPeminjamanDetail(${JSON.stringify(p)})' title="Rincian Transaksi">
                            <i class="ph ph-info" style="color:var(--primary-light)"></i>
                        </button>
                        ${editButtonHtml}
                        <button class="btn-icon" onclick='app.hapusPeminjaman(${JSON.stringify(p)})' title="Hapus Riwayat">
                            <i class="ph ph-trash" style="color:var(--danger)"></i>
                        </button>
                    </div>
                </td>
            `;
            tbody.appendChild(tr);
        });
    },

    hapusPeminjaman: async function (idOrObj) {
        const diizinkan = await this.showDialog('Hapus Riwayat', 'Apakah Anda yakin ingin menghapus data riwayat ini permanen?', 'confirm');
        if (!diizinkan) return;

        this.showLoading('Menghapus...');
        let p = null;
        let id = '';
        if (typeof idOrObj === 'object' && idOrObj !== null) {
            p = idOrObj;
            id = db.getItemId(p) || p.nomor_peminjaman || p.id || p.newId;
        } else {
            id = String(idOrObj || '');
            const targetId = id.trim().toLowerCase();
            p = await db.stores.peminjaman.getItem(id);
            if (!p) {
                const allP = await db.getAll('peminjaman');
                p = allP.find(item => {
                    const itemId = String(db.getItemId(item) || '').trim().toLowerCase();
                    const nomor = String(item.nomor_peminjaman || item.Nomor_Peminjaman || '').trim().toLowerCase();
                    const itemNewId = String(item.newId || '').trim().toLowerCase();
                    const itemRealId = String(item.id || '').trim().toLowerCase();
                    return itemId === targetId || nomor === targetId || itemNewId === targetId || itemRealId === targetId;
                });
            }
            if (!p) {
                const queue = await db.getAll('syncQueue');
                const task = queue.find(t => t.storeName === 'peminjaman' && t.payload && (
                    String(db.getItemId(t.payload) || '').toLowerCase() === targetId ||
                    String(t.payload.newId || '').toLowerCase() === targetId ||
                    String(t.payload.id || '').toLowerCase() === targetId ||
                    String(t.payload.nomor_peminjaman || '').toLowerCase() === targetId
                ));
                if (task) p = task.payload;
            }
        }

        if (!p) {
            this.hideLoading();
            return this.showToast('Data tidak ditemukan', 'error');
        }

        // JIKA MASIH DIPINJAM, kembalikan stok terlebih dahulu agar tak minus
        if (p.status === 'DIPINJAM') {
            try {
                const items = JSON.parse(p.items || '[]');
                for (const item of items) {
                    const qtyToRestore = Number(item.qty || item.jumlah || 1);
                    const alatId = String(item.id || item.newId);
                    const alat = await db.stores.alat.getItem(alatId);
                    if (alat && !isNaN(qtyToRestore)) {
                        alat.jumlah_tersedia = Number(alat.jumlah_tersedia) + qtyToRestore;
                        await db.stores.alat.setItem(alatId, alat);
                        await db.queueSyncTask('update_alat', 'alat', alat);
                    }
                }
            } catch (e) { }
        }

        const realId = db.getItemId(p) || p.nomor_peminjaman || p.id || p.newId || id;
        await db.stores.peminjaman.removeItem(realId);
        if (p.id) await db.stores.peminjaman.removeItem(p.id);
        if (p.newId) await db.stores.peminjaman.removeItem(p.newId);
        if (p.nomor_peminjaman) await db.stores.peminjaman.removeItem(p.nomor_peminjaman);

        // Sertakan seluruh payload (nomor_peminjaman, id, newId) agar backend dijamin menemukan baris di spreadsheet
        const deletePayload = { ...p, id: realId, newId: realId, nomor_peminjaman: p.nomor_peminjaman || realId };
        await db.queueSyncTask('delete_peminjaman', 'peminjaman', deletePayload);

        this.hideLoading();
        this.showToast('Riwayat berhasil dihapus', 'success');
        this.loadRiwayat();
        this.loadActivePeminjaman();

        db.syncToServer();
    },

    editPeminjaman: async function (idOrObj) {
        let p = null;
        let id = '';
        if (typeof idOrObj === 'object' && idOrObj !== null) {
            p = idOrObj;
            id = db.getItemId(p) || p.nomor_peminjaman || p.id || p.newId;
        } else {
            id = String(idOrObj || '');
            const targetId = id.trim().toLowerCase();
            p = await db.stores.peminjaman.getItem(id);
            if (!p) {
                const allP = await db.getAll('peminjaman');
                p = allP.find(item => {
                    const itemId = String(db.getItemId(item) || '').trim().toLowerCase();
                    const nomor = String(item.nomor_peminjaman || item.Nomor_Peminjaman || '').trim().toLowerCase();
                    const itemNewId = String(item.newId || '').trim().toLowerCase();
                    const itemRealId = String(item.id || '').trim().toLowerCase();
                    return itemId === targetId || nomor === targetId || itemNewId === targetId || itemRealId === targetId;
                });
            }
            if (!p) {
                const queue = await db.getAll('syncQueue');
                const task = queue.find(t => t.storeName === 'peminjaman' && t.payload && (
                    String(db.getItemId(t.payload) || '').toLowerCase() === targetId ||
                    String(t.payload.newId || '').toLowerCase() === targetId ||
                    String(t.payload.id || '').toLowerCase() === targetId ||
                    String(t.payload.nomor_peminjaman || '').toLowerCase() === targetId
                ));
                if (task) p = task.payload;
            }
        }
        if (!p) return this.showToast('Data peminjaman tidak ditemukan', 'error');

        const resolvedId = db.getItemId(p) || p.nomor_peminjaman || p.id || p.newId || id;
        document.getElementById('edit-pem-id').value = resolvedId;
        document.getElementById('edit-pem-nama').value = p.nama_peminjam || '';
        document.getElementById('edit-pem-hp').value = p.nomor_hp || '';
        document.getElementById('edit-pem-kelas').value = p.kelas_unit || '';
        let estimasiDateStr = p.tanggal_kembali_estimasi || '';
        if (estimasiDateStr) {
            try {
                const d = new Date(estimasiDateStr);
                if (!isNaN(d.getTime())) {
                    estimasiDateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
                }
            } catch(e) {}
        }
        document.getElementById('edit-pem-kembali').value = estimasiDateStr;
        document.getElementById('edit-pem-keterangan').value = p.Keterangan || p.keterangan || '';
        document.getElementById('edit-peminjaman-trx-no').textContent = p.nomor_peminjaman || id;

        this.state.editCart = JSON.parse(p.items || '[]');
        this.state.originalEditCart = JSON.parse(p.items || '[]');
        this.renderEditCart();

        this.openModal('edit-peminjaman-modal');
    },

    renderEditCart: function () {
        const tbody = document.querySelector('#table-edit-cart tbody');
        tbody.innerHTML = '';
        if (!this.state.editCart || this.state.editCart.length === 0) {
            tbody.innerHTML = '<tr id="edit-cart-empty"><td colspan="4" style="text-align:center; color:var(--text-muted); padding: 2rem;">Belum ada alat dipilih</td></tr>';
            return;
        }

        this.state.editCart.forEach((item, index) => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>${item.kode_seri}</td>
                <td>${item.nama}</td>
                <td>
                    <input type="number" min="1" max="${item.jumlah_tersedia}" value="${item.qty}" 
                    style="width:60px; padding:0.2rem; background:rgba(0,0,0,0.2); border:1px solid #4f46e5; color:white;" 
                    onchange="app.updateEditCartQty(${index}, this.value)">
                </td>
                <td><button type="button" class="btn-icon" onclick="app.removeFromEditCart(${index})"><i class="ph ph-trash" style="color:var(--danger)"></i></button></td>
            `;
            tbody.appendChild(tr);
        });
    },

    updateEditCartQty: function (index, val) {
        const qty = parseInt(val);
        if (qty > 0 && qty <= this.state.editCart[index].jumlah_tersedia) {
            this.state.editCart[index].qty = qty;
        } else {
            this.showToast('Kuantitas tidak valid atau melebihi stok asli', 'warning');
            this.renderEditCart();
        }
    },

    removeFromEditCart: function (index) {
        this.state.editCart.splice(index, 1);
        this.renderEditCart();
    },

    openPilihAlatModalEdit: function () {
        this.state.isEditingPeminjaman = true;
        this.openModal('pilih-alat-modal');
        this.filterPilihAlat();
    },

    saveEditPeminjaman: async function (e) {
        const id = document.getElementById('edit-pem-id').value;
        if (!id) return;

        const newItems = this.state.editCart || [];
        if (newItems.length === 0) {
            return this.showToast('Pilih minimal 1 alat!', 'warning');
        }

        this.showLoading('Menyimpan Perubahan...');
        const p = await db.stores.peminjaman.getItem(id);
        if (!p) {
            this.hideLoading();
            return this.showToast('Gagal memuat data', 'error');
        }

        const deltaMap = {};
        const oldItems = this.state.originalEditCart || [];
        for (const old of oldItems) {
            const alatId = String(db.getItemId(old) || '');
            deltaMap[alatId] = (deltaMap[alatId] || 0) - Number(old.qty);
        }
        for (const item of newItems) {
            const alatId = String(db.getItemId(item) || '');
            deltaMap[alatId] = (deltaMap[alatId] || 0) + Number(item.qty);
        }

        for (const alatId in deltaMap) {
            const delta = deltaMap[alatId];
            if (delta > 0) {
                const alat = await db.stores.alat.getItem(alatId);
                if (alat && Number(alat.jumlah_tersedia) < delta) {
                    this.hideLoading();
                    return this.showToast('Stok tidak cukup untuk alat: ' + alat.nama, 'warning');
                }
            }
        }

        for (const alatId in deltaMap) {
            const delta = deltaMap[alatId];
            if (delta !== 0) {
                const alat = await db.stores.alat.getItem(alatId);
                if (alat) {
                    alat.jumlah_tersedia = Number(alat.jumlah_tersedia) - delta;
                    await db.stores.alat.setItem(alatId, alat);
                    await db.queueSyncTask('update_alat', 'alat', alat);
                }
            }
        }

        p.nama_peminjam = document.getElementById('edit-pem-nama').value;
        p.nomor_hp = document.getElementById('edit-pem-hp').value;
        p.kelas_unit = document.getElementById('edit-pem-kelas').value;
        p.tanggal_kembali_estimasi = document.getElementById('edit-pem-kembali').value;
        p.Keterangan = document.getElementById('edit-pem-keterangan').value;
        p.keterangan = p.Keterangan; 

        p.items = JSON.stringify(newItems.map(i => ({
            id: i.id || i.newId,
            nama: i.nama,
            kode_seri: i.kode_seri,
            qty: i.qty,
            jumlah_tersedia: i.jumlah_tersedia
        })));

        // Pastikan format tanggal bersih yyyy-mm-dd
        if (p.tanggal_pinjam && p.tanggal_pinjam.includes('T')) p.tanggal_pinjam = p.tanggal_pinjam.split('T')[0];
        if (p.tanggal_kembali_estimasi && p.tanggal_kembali_estimasi.includes('T')) p.tanggal_kembali_estimasi = p.tanggal_kembali_estimasi.split('T')[0];
        if (p.created_at && p.created_at.includes('T')) p.created_at = p.created_at.split('T')[0];

        p.id = p.id || id;
        p.newId = p.newId || id;
        p.nomor_peminjaman = p.nomor_peminjaman || id;

        await db.stores.peminjaman.setItem(id, p);
        await db.queueSyncTask('update_peminjaman', 'peminjaman', p);

        document.getElementById('edit-peminjaman-form').reset();

        this.hideLoading();
        this.closeModal('edit-peminjaman-modal');
        this.showToast('Perubahan berhasil disimpan!', 'success');
        
        this.loadActivePeminjaman();
        this.loadRiwayat();

        db.syncToServer();
    },

    kembalikanAlat: async function (idOrObj) {
        const tanya = await this.showDialog('Kembalikan Alat', 'Tandai alat ini sebagai sudah selesai dikembalikan?', 'confirm');
        if (!tanya) return;

        this.showLoading('Memproses...');
        let p = null;
        let peminjamanId = '';
        if (typeof idOrObj === 'object' && idOrObj !== null) {
            p = idOrObj;
            peminjamanId = db.getItemId(p) || p.nomor_peminjaman || p.id || p.newId;
        } else {
            peminjamanId = String(idOrObj || '');
            const targetId = peminjamanId.trim().toLowerCase();
            p = await db.stores.peminjaman.getItem(peminjamanId);
            if (!p) {
                const allP = await db.getAll('peminjaman');
                p = allP.find(item => {
                    const itemId = String(db.getItemId(item) || '').trim().toLowerCase();
                    const nomor = String(item.nomor_peminjaman || item.Nomor_Peminjaman || '').trim().toLowerCase();
                    const itemNewId = String(item.newId || '').trim().toLowerCase();
                    const itemRealId = String(item.id || '').trim().toLowerCase();
                    return itemId === targetId || nomor === targetId || itemNewId === targetId || itemRealId === targetId;
                });
            }
            if (!p) {
                const queue = await db.getAll('syncQueue');
                const task = queue.find(t => t.storeName === 'peminjaman' && t.payload && (
                    String(db.getItemId(t.payload) || '').toLowerCase() === targetId ||
                    String(t.payload.newId || '').toLowerCase() === targetId ||
                    String(t.payload.id || '').toLowerCase() === targetId ||
                    String(t.payload.nomor_peminjaman || '').toLowerCase() === targetId
                ));
                if (task) p = task.payload;
            }
        }
        if (!p) {
            this.hideLoading();
            return this.showToast('Data tidak ditemukan', 'error');
        }

        p.status = 'KEMBALI';
        p.tanggal_kembali_aktual = new Date().toISOString().split('T')[0];

        // Pastikan semua field tanggal berformat bersih yyyy-mm-dd
        if (p.tanggal_pinjam && p.tanggal_pinjam.includes('T')) p.tanggal_pinjam = p.tanggal_pinjam.split('T')[0];
        if (p.tanggal_kembali_estimasi && p.tanggal_kembali_estimasi.includes('T')) p.tanggal_kembali_estimasi = p.tanggal_kembali_estimasi.split('T')[0];
        if (p.created_at && p.created_at.includes('T')) p.created_at = p.created_at.split('T')[0];

        const realId = db.getItemId(p) || p.nomor_peminjaman || p.newId || peminjamanId;
        p.id = p.id || realId;
        p.newId = p.newId || realId;
        p.nomor_peminjaman = p.nomor_peminjaman || realId;

        await db.stores.peminjaman.setItem(realId, p);
        await db.queueSyncTask('update_peminjaman', 'peminjaman', p);

        // Restore alat stock
        try {
            const items = JSON.parse(p.items || '[]');
            for (const item of items) {
                const qtyToRestore = Number(item.qty || item.jumlah || 1);
                const alatId = String(item.id || item.newId);
                const alat = await db.stores.alat.getItem(alatId);
                if (alat && !isNaN(qtyToRestore)) {
                    alat.jumlah_tersedia = Number(alat.jumlah_tersedia) + qtyToRestore;
                    await db.stores.alat.setItem(alatId, alat);
                    await db.queueSyncTask('update_alat', 'alat', alat);
                }
            }
        } catch (e) {
            console.error("Gagal mengurai items peminjaman", e);
        }

        this.hideLoading();
        this.showToast('Peminjaman berhasil diselesaikan (Sinkronisasi latar belakang...)', 'success');
        
        // Update UI secara instan (Optimistic Update)
        this.loadRiwayat();
        this.loadActivePeminjaman();
        this.loadDashboard();

        // Lakukan sinkronisasi tanpa menahan thread / UI (Fire and Forget)
        db.syncToServer();
    },

    exportRiwayat: async function () {
        let data = this.getFilteredData(await db.getAll('peminjaman'));

        const filterBulan = document.getElementById('filter-bulan-riwayat')?.value;
        const filterTahun = document.getElementById('filter-tahun-riwayat')?.value;

        if (filterBulan || filterTahun) {
            data = data.filter(p => {
                const dateStr = p.created_at || p.tanggal_pinjam;
                if (!dateStr) return false;
                const date = new Date(dateStr);
                if (isNaN(date.getTime())) return false;
                
                const month = String(date.getMonth() + 1).padStart(2, '0');
                const year = String(date.getFullYear());
                
                let match = true;
                if (filterBulan && month !== filterBulan) match = false;
                if (filterTahun && year !== filterTahun) match = false;
                
                return match;
            });
        }

        if (!data || data.length === 0) return this.showToast('Belum ada data riwayat', 'warning');

        const allUsers = await db.getAll('users');
        const userMap = {};
        allUsers.forEach(u => userMap[u.id || u.newId] = u.full_name || u.username);

        const allJurusan = await db.getAll('jurusan');
        const myJurusanName = allJurusan.find(j => String(j.id || j.newId) === String(this.state.user.jurusan_id))?.nama || 'UMUM';

        try {
            const { jsPDF } = window.jspdf;
            const doc = new jsPDF('landscape');

            if (window.APP_LOGO_B64) {
                doc.addImage(window.APP_LOGO_B64, 'PNG', 260, 10, 22, 22);
            }

            doc.setFontSize(18);
            doc.text("Laporan Riwayat Peminjaman Alat", 14, 20);
            doc.setFontSize(10);

            const monthNames = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];
            const d = new Date();
            const printDateStr = `${d.getDate().toString().padStart(2, '0')} ${monthNames[d.getMonth()]} ${d.getFullYear()} (${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}:${d.getSeconds().toString().padStart(2, '0')}) - ${this.state.user.full_name || this.state.user.username} - ${myJurusanName} (SMK Negeri 1 Bumijawa)`;

            doc.text("Tanggal Cetak: " + printDateStr, 14, 28);

            const tableColumn = ["No. TRX", "Peminjam", "Kelas", "Tgl Pinjam", "Tgl Kembali", "Status", "Petugas", "Keterangan"];
            const tableRows = [];

            data.forEach(p => {
                const petugasName = userMap[p.created_by] || p.petugas || '-';
                const rowData = [
                    p.nomor_peminjaman || '-',
                    p.nama_peminjam || '-',
                    p.kelas_unit || '-',
                    this.formatDate(p.tanggal_pinjam || p.created_at),
                    p.tanggal_kembali_aktual ? this.formatDate(p.tanggal_kembali_aktual) : '-',
                    p.status || '-',
                    petugasName,
                    p.Keterangan || p.keterangan || '-'
                ];
                tableRows.push(rowData);
            });

            doc.autoTable({
                head: [tableColumn],
                body: tableRows,
                startY: 38,
                theme: 'grid',
                styles: { fontSize: 9, cellPadding: 2 },
                headStyles: { fillColor: [41, 128, 185], textColor: 255 },
                columnStyles: { 7: { cellWidth: 50 } }
            });

            doc.save('Laporan_Riwayat_Peminjaman.pdf');
        } catch (e) {
            console.error(e);
            this.showToast('Gagal merender PDF, pastikan koneksi memadai untuk memuat alat pembuat dokumen', 'error');
        }
    },

    exportRiwayatBahan: async function () {
        let keluarRaw = await db.getAll('bahan_keluar');
        const myJurusanId = String(this.state.user.jurusan_id || '');
        if (this.state.user.role !== 'Admin') {
            keluarRaw = keluarRaw.filter(k => String(k.Kode_jurusan || k.jurusan_id || '') === myJurusanId);
        }
        
        if (!keluarRaw || keluarRaw.length === 0) return this.showToast('Belum ada data pengeluaran bahan', 'warning');
        
        keluarRaw.reverse(); // Descending (terbaru di atas)

        const allJurusan = await db.getAll('jurusan');
        const myJurusanName = allJurusan.find(j => String(j.id || j.newId) === String(this.state.user.jurusan_id))?.nama || 'UMUM';

        try {
            const { jsPDF } = window.jspdf;
            const doc = new jsPDF('landscape');

            if (window.APP_LOGO_B64) {
                doc.addImage(window.APP_LOGO_B64, 'PNG', 260, 10, 22, 22);
            }

            doc.setFontSize(18);
            doc.text("Laporan Riwayat Pengeluaran Bahan", 14, 20);
            doc.setFontSize(10);

            const monthNames = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];
            const d = new Date();
            const printDateStr = `${d.getDate().toString().padStart(2, '0')} ${monthNames[d.getMonth()]} ${d.getFullYear()} (${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}:${d.getSeconds().toString().padStart(2, '0')}) - ${this.state.user.full_name || this.state.user.username} - ${myJurusanName} (SMK Negeri 1 Bumijawa)`;

            doc.text("Tanggal Cetak: " + printDateStr, 14, 28);

            const tableColumn = ["Tanggal / ID", "Nama Bahan", "Jml Keluar", "Satuan", "Status / Keterangan", "Petugas"];
            const tableRows = [];

            keluarRaw.forEach(k => {
                const rowData = [
                    k.Status && String(k.Status).includes('|') ? k.Status.split('|')[0] : (k.ID_Barang || '-'),
                    k.Nama_Barang || '-',
                    '- ' + (k.Total_Keluar || 0),
                    k.Satuan || '-',
                    k.Status && String(k.Status).includes('|') ? k.Status.split('|')[1]?.trim() : (k.Status || '-'),
                    k.Diinput_Oleh || '-'
                ];
                tableRows.push(rowData);
            });

            doc.autoTable({
                head: [tableColumn],
                body: tableRows,
                startY: 38,
                theme: 'grid',
                styles: { fontSize: 9, cellPadding: 2 },
                headStyles: { fillColor: [231, 76, 60], textColor: 255 }, // Warna merah khas 'Bahan Keluar'
                columnStyles: { 4: { cellWidth: 80 } }
            });

            doc.save('Laporan_Riwayat_Bahan_Keluar.pdf');
        } catch (e) {
            console.error(e);
            this.showToast('Gagal merender PDF.', 'error');
        }
    },

    exportAlat: async function (format) {
        const data = this.getFilteredData(await db.getAll('alat'));
        if (!data || data.length === 0) return this.showToast('Belum ada data alat', 'warning');

        const katData = await db.getAll('kategori');
        const katMap = {};
        katData.forEach(k => katMap[k.id || k.newId] = k.nama);

        const allUsers = await db.getAll('users');
        const userMap = {};
        allUsers.forEach(u => userMap[u.id || u.newId] = u.full_name || u.username);

        const allJurusan = await db.getAll('jurusan');
        const myJurusanName = allJurusan.find(j => String(j.id || j.newId) === String(this.state.user.jurusan_id))?.nama || 'UMUM';

        try {
            const monthNames = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];
            const shortMonthNames = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agt", "Sep", "Okt", "Nov", "Des"];
            const formatDDMMM = (dateStr) => {
                if (!dateStr) return '-';
                let d2 = new Date(dateStr);
                if (isNaN(d2.getTime())) return dateStr;
                return `${d2.getDate().toString().padStart(2, '0')} ${shortMonthNames[d2.getMonth()]} ${d2.getFullYear()}`;
            };

            const d = new Date();
            const printDateStr = `${d.getDate().toString().padStart(2, '0')} ${monthNames[d.getMonth()]} ${d.getFullYear()} (${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}:${d.getSeconds().toString().padStart(2, '0')}) - ${this.state.user.full_name || this.state.user.username} - ${myJurusanName} (SMK Negeri 1 Bumijawa)`;

            if (format === 'pdf') {
                const { jsPDF } = window.jspdf;
                const doc = new jsPDF('landscape');

                if (window.APP_LOGO_B64) {
                    doc.addImage(window.APP_LOGO_B64, 'PNG', 260, 10, 22, 22);
                }

                doc.setFontSize(18);
                doc.text("Data Inventaris Alat", 14, 20);
                doc.setFontSize(10);
                doc.text("Tanggal Cetak: " + printDateStr, 14, 28);

                const tableColumn = ["Kode Seri", "Nama Alat", "Kategori", "Total", "Tersedia", "Kondisi", "Tgl Input", "Petugas Input"];
                const tableRows = [];

                data.forEach(a => {
                    const katName = katMap[a.kategori_id] || a.kategori_id || '-';
                    const petugasName = userMap[a.created_by] || a.created_by || '-';
                    const tanggalMasuk = a.tanggal_masuk ? formatDDMMM(a.tanggal_masuk) : (a.created_at ? formatDDMMM(a.created_at) : '-');

                    tableRows.push([
                        a.kode_seri || '-',
                        a.nama || '-',
                        katName,
                        a.jumlah_total || '0',
                        a.jumlah_tersedia || '0',
                        a.kondisi || '-',
                        tanggalMasuk,
                        petugasName
                    ]);
                });

                doc.autoTable({
                    head: [tableColumn],
                    body: tableRows,
                    startY: 38,
                    theme: 'striped',
                    styles: { fontSize: 9 },
                    headStyles: { fillColor: [39, 174, 96] }
                });
                doc.save('Data_Inventaris_Alat.pdf');

            } else if (format === 'excel') {
                const excelData = data.map(a => ({
                    "Kode Seri": a.kode_seri || '-',
                    "Nama Alat": a.nama || '-',
                    "Kategori": katMap[a.kategori_id] || a.kategori_id || '-',
                    "Jumlah Total": Number(a.jumlah_total || 0),
                    "Jumlah Tersedia": Number(a.jumlah_tersedia || 0),
                    "Kondisi": a.kondisi || '-',
                    "Tgl Input": a.tanggal_masuk ? formatDDMMM(a.tanggal_masuk) : (a.created_at ? formatDDMMM(a.created_at) : '-'),
                    "Petugas Input": userMap[a.created_by] || a.created_by || '-'
                }));

                const worksheet = XLSX.utils.json_to_sheet(excelData);
                const workbook = XLSX.utils.book_new();
                XLSX.utils.book_append_sheet(workbook, worksheet, "Inventaris");

                const wscols = [{ wch: 15 }, { wch: 30 }, { wch: 20 }, { wch: 12 }, { wch: 15 }, { wch: 12 }, { wch: 15 }, { wch: 25 }];
                worksheet['!cols'] = wscols;

                XLSX.writeFile(workbook, 'Data_Inventaris_Alat.xlsx');
            }
        } catch (e) {
            console.error(e);
            this.showToast('Gagal merender dokumen, periksa koneksi internet Anda', 'error');
        }
    },

    showPeminjamanDetail: async function (idOrObj) {
        let p = null;
        if (typeof idOrObj === 'object' && idOrObj !== null) {
            p = idOrObj;
        } else {
            const targetId = String(idOrObj || '').trim().toLowerCase();
            p = await db.stores.peminjaman.getItem(String(idOrObj));
            if (!p) {
                const allP = await db.getAll('peminjaman');
                p = allP.find(item => {
                    const itemId = String(db.getItemId(item) || '').trim().toLowerCase();
                    const nomor = String(item.nomor_peminjaman || item.Nomor_Peminjaman || '').trim().toLowerCase();
                    const itemNewId = String(item.newId || '').trim().toLowerCase();
                    const itemRealId = String(item.id || '').trim().toLowerCase();
                    return itemId === targetId || nomor === targetId || itemNewId === targetId || itemRealId === targetId;
                });
            }
            if (!p) {
                const queue = await db.getAll('syncQueue');
                const task = queue.find(t => t.storeName === 'peminjaman' && t.payload && (
                    String(db.getItemId(t.payload) || '').toLowerCase() === targetId ||
                    String(t.payload.newId || '').toLowerCase() === targetId ||
                    String(t.payload.id || '').toLowerCase() === targetId ||
                    String(t.payload.nomor_peminjaman || '').toLowerCase() === targetId
                ));
                if (task) p = task.payload;
            }
        }
        if (!p) return this.showToast('Data tidak ditemukan', 'error');

        const detailInfoGrid = document.getElementById('detail-info-grid');
        const detailItems = document.getElementById('detail-items');
        const detailTrxNo = document.getElementById('detail-trx-no');
        const detailNote = document.getElementById('detail-note');
        const detailPetugas = document.getElementById('detail-petugas');

        let statusColor = p.status === 'DIPINJAM' ? 'var(--warning)' : 'var(--success)';

        detailTrxNo.textContent = p.nomor_peminjaman;

        let petugasName = p.petugas;
        if (!petugasName && p.created_by) {
            try {
                const users = await db.getAll('users');
                const u = users.find(user => String(user.id || user.newId) === String(p.created_by));
                if (u) petugasName = u.full_name || u.username;
            } catch (e) { console.error(e); }
        }
        detailPetugas.textContent = petugasName || 'Admin';

        detailNote.textContent = p.Keterangan || p.keterangan || '-';

        detailInfoGrid.innerHTML = `
            <div><small>Status</small><p><span class="badge" style="background:${statusColor}">${p.status}</span></p></div>
            <div><small>Peminjam</small><p>${p.nama_peminjam}</p></div>
            <div><small>Kelas/Unit</small><p>${p.kelas_unit}</p></div>
            <div><small>No HP</small><p>${p.nomor_hp || '-'}</p></div>
            <div><small>Tgl Pinjam</small><p>${this.formatDate(p.created_at || p.tanggal_pinjam)}</p></div>
            <div><small>Estimasi Kembali</small><p>${this.formatDate(p.tanggal_kembali_estimasi)}</p></div>
            <div><small>Tgl Kembali Aktual</small><p>${p.tanggal_kembali_aktual ? this.formatDate(p.tanggal_kembali_aktual) : '-'}</p></div>
        `;

        let itemsHtml = '';
        try {
            const items = JSON.parse(p.items || '[]');
            const allAlat = await db.getAll('alat');
            items.forEach(item => {
                const qty = item.qty || item.jumlah || 1;
                let nama = item.nama;
                let kode_seri = item.kode_seri;

                // Fallback lookup
                if (!nama || !kode_seri) {
                    const matchedAlat = allAlat.find(a => String(a.id || a.newId) === String(item.id || item.newId));
                    if (matchedAlat) {
                        nama = nama || matchedAlat.nama;
                        kode_seri = kode_seri || matchedAlat.kode_seri;
                    }
                }

                itemsHtml += `
                    <div class="detail-item-row">
                        <div class="detail-item-info">
                            <span class="detail-item-name">${nama || 'Alat'}</span>
                            <span class="detail-item-code">${kode_seri || '-'}</span>
                        </div>
                        <span class="detail-item-qty">${qty}</span>
                    </div>`;
            });
        } catch (e) { itemsHtml = '<p>Error parsing items</p>'; }

        detailItems.innerHTML = itemsHtml;

        // Print button functionality
        const btnPrint = document.getElementById('btn-print-from-detail');
        if (btnPrint) {
            btnPrint.onclick = () => this.cetakReceipt(p);
        }

        this.openModal('detail-modal');
    },    // --- Bahan Praktik Logic
    setBahanFilterStatus: function (status) {
        this.state.bahanStatusFilter = status;
        const container = document.getElementById('bahan-tabs');
        if (container) {
            const btns = container.querySelectorAll('.quick-tab-pill');
            btns.forEach(b => b.classList.remove('active'));
            const targetBtn = Array.from(btns).find(b => {
                const attr = b.getAttribute('onclick');
                return attr && attr.includes(`'${status}'`);
            });
            if (targetBtn) targetBtn.classList.add('active');
        }
        this.loadBahan();
    },

    loadBahan: async function () {
        this.showLoading('Memuat Bahan Praktik...');
        let bahanRaw = await db.getAll('bahan');

        let search = document.getElementById('bahan-search')?.value.toLowerCase() || '';

        const myJurusanId = String(this.state.user.jurusan_id || '');
        if (this.state.user.role !== 'Admin') {
            bahanRaw = bahanRaw.filter(b => String(b.Kode_jurusan || b.jurusan_id || '') === myJurusanId);
        }

        // Calculate summary stats
        const totalJenis = bahanRaw.length;
        let countAman = 0;
        let countKritis = 0;
        let countHabis = 0;

        bahanRaw.forEach(b => {
            const stok = Number(b.Stok || b.stok || b.Jumlah || b.jumlah || 0);
            const stokMin = Number(b.Stok_Minimal || b.Stok_minimal || b['Stok Minimal'] || b.stok_minimal || b.Minimal || 0);
            if (stok <= 0) countHabis++;
            else if (stok <= stokMin || stok <= 5) countKritis++;
            else countAman++;
        });

        const elTotal = document.getElementById('bahan-stat-total');
        const elAman = document.getElementById('bahan-stat-aman');
        const elKritis = document.getElementById('bahan-stat-kritis');
        const elHabis = document.getElementById('bahan-stat-habis');
        if (elTotal) elTotal.textContent = totalJenis;
        if (elAman) elAman.textContent = countAman;
        if (elKritis) elKritis.textContent = countKritis;
        if (elHabis) elHabis.textContent = countHabis;

        // Filter by search query
        if (search) {
            bahanRaw = bahanRaw.filter(b => {
                const idb = String(b.ID_Barang || b['ID Barang'] || b.ID || b.id || b.id_barang || b.Kode || '').toLowerCase();
                const namab = String(b.Nama_Barang || b['Nama Barang'] || b.Nama || b.nama || b.Barang || '').toLowerCase();
                const kat = String(b.Kategori || b.kategori || '').toLowerCase();
                return idb.includes(search) || namab.includes(search) || kat.includes(search);
            });
        }

        // Filter by Status Tab
        if (this.state.bahanStatusFilter === 'aman') {
            bahanRaw = bahanRaw.filter(b => {
                const stok = Number(b.Stok || b.stok || b.Jumlah || b.jumlah || 0);
                const min = Number(b.Stok_Minimal || b.Stok_minimal || 0);
                return stok > (min || 5);
            });
        } else if (this.state.bahanStatusFilter === 'menipis') {
            bahanRaw = bahanRaw.filter(b => {
                const stok = Number(b.Stok || b.stok || b.Jumlah || b.jumlah || 0);
                const min = Number(b.Stok_Minimal || b.Stok_minimal || 0);
                return stok > 0 && (stok <= min || stok <= 5);
            });
        } else if (this.state.bahanStatusFilter === 'habis') {
            bahanRaw = bahanRaw.filter(b => Number(b.Stok || b.stok || 0) <= 0);
        }

        // --- Proses Sorting ---
        const sc = this.state.bahanSort.column;
        const sdir = this.state.bahanSort.dir;
        
        if (sc) {
            bahanRaw.sort((a, b) => {
                let valA, valB;
                
                if (sc === 'id') {
                    valA = a.ID_Barang || a['ID Barang'] || a.ID || a.id || a.id_barang || a.Kode || '';
                } else if (sc === 'nama') {
                    valA = a.Nama_Barang || a['Nama Barang'] || a.Nama || a.nama || a.Barang || '';
                } else if (sc === 'kategori') {
                    valA = a.Kategori || a.kategori || '';
                } else if (sc === 'satuan') {
                    valA = a.Satuan || a.satuan || '';
                } else if (sc === 'stok') {
                    valA = Number(a.Stok || a.stok || a.Jumlah || a.jumlah || 0);
                    valB = Number(b.Stok || b.stok || b.Jumlah || b.jumlah || 0);
                }

                if (typeof valA === 'string') valA = valA.toLowerCase();
                if (typeof valB === 'string') valB = valB.toLowerCase();

                if (valA < valB) return sdir === 'asc' ? -1 : 1;
                if (valA > valB) return sdir === 'asc' ? 1 : -1;
                return 0;
            });
        }

        const tbody = document.querySelector('#table-bahan tbody');
        if (!tbody) return this.hideLoading();
        tbody.innerHTML = '';

        if (bahanRaw.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; padding: 2rem; color:var(--text-muted);"><i class="ph ph-package" style="font-size:1.5rem; display:block; margin-bottom:0.5rem; opacity:0.5;"></i>Data bahan tidak ditemukan</td></tr>';
            return this.hideLoading();
        }

        bahanRaw.forEach(b => {
            const tr = document.createElement('tr');
            
            // Normalize column names just in case Google Sheets headers differ slightly
            const idBarang = b.ID_Barang || b['ID Barang'] || b.ID || b.id || b.id_barang || b.Kode || '';
            const namaBarang = b.Nama_Barang || b['Nama Barang'] || b.Nama || b.nama || b.Barang || '';
            const kategori = b.Kategori || b.kategori || '';
            const satuan = b.Satuan || b.satuan || '';
            const stokTotal = Number(b.Stok || b.stok || b.Jumlah || b.jumlah || 0);
            const stokMin = Number(b.Stok_Minimal || b.Stok_minimal || b['Stok Minimal'] || b.stok_minimal || b.Minimal || 0);
            
            // Assign back standard keys so modals and actions work correctly
            b.ID_Barang = idBarang;
            b.Nama_Barang = namaBarang;
            b.Stok = stokTotal;
            b.Stok_Minimal = stokMin;

            let statusTag = '<span class="badge" style="background:rgba(16,185,129,0.2); color:#34d399; font-size:0.72rem; padding:0.15rem 0.4rem; border:1px solid rgba(16,185,129,0.35);">Aman</span>';
            let meterFill = 'bg-healthy';
            if (stokTotal <= stokMin || (stokTotal <= 5 && stokTotal > 0)) {
                statusTag = '<span class="badge" style="background:rgba(245,158,11,0.2); color:#fbbf24; font-size:0.72rem; padding:0.15rem 0.4rem; border:1px solid rgba(245,158,11,0.35);">Menipis</span>';
                meterFill = 'bg-low';
            }
            if (stokTotal <= 0) {
                statusTag = '<span class="badge" style="background:rgba(239,68,68,0.2); color:#f87171; font-size:0.72rem; padding:0.15rem 0.4rem; border:1px solid rgba(239,68,68,0.35);">Habis</span>';
                meterFill = 'bg-empty';
            }

            const maxStokRef = Math.max(stokTotal, (stokMin || 5) * 2, 20);
            const bahanPct = Math.min(100, Math.round((stokTotal / maxStokRef) * 100));

            const bahanStockMeter = `
                <div class="mini-stock-container">
                    <div style="display:flex; justify-content:space-between; align-items:center; font-size:0.82rem;">
                        <b>${stokTotal} ${satuan}</b>
                        ${statusTag}
                    </div>
                    <div class="mini-stock-bar">
                        <div class="mini-stock-fill ${meterFill}" style="width:${bahanPct}%"></div>
                    </div>
                </div>
            `;

            tr.innerHTML = `
                <td><b style="font-family:monospace; font-size:0.88rem;">${idBarang || '-'}</b></td>
                <td style="font-weight:600;">${namaBarang || '-'}</td>
                <td><span class="badge" style="background:rgba(255,255,255,0.06); color:var(--text-main); font-size:0.75rem;">${kategori || '-'}</span></td>
                <td style="color:var(--text-muted); font-size:0.85rem;">${satuan || '-'}</td>
                <td>${bahanStockMeter}</td>
                <td>
                    <div style="display:flex; gap:0.35rem; justify-content:center;">
                        <button class="btn btn-outline btn-sm" style="color:var(--warning); border-color:rgba(245,158,11,0.4); padding:0.25rem 0.5rem; font-size:0.78rem;" onclick="app.openBahanCheckoutModal('${idBarang}')" title="Alokasi / Input Pemakaian Bahan" ${stokTotal <= 0 ? 'disabled style="opacity:0.4;cursor:not-allowed;"' : ''}><i class="ph ph-minus-circle"></i> Pakai</button>
                        <button class="btn-icon" style="color:var(--primary-light);" onclick="app.openBahanModal('${idBarang}')" title="Edit Data"><i class="ph ph-pencil-simple"></i></button>
                        <button class="btn-icon" style="color:var(--danger);" onclick="app.deleteBahan('${idBarang}')" title="Hapus"><i class="ph ph-trash"></i></button>
                    </div>
                </td>
            `;
            tbody.appendChild(tr);
        });
        this.hideLoading();
    },

    sortBahan: function(col) {
        if (this.state.bahanSort.column === col) {
            this.state.bahanSort.dir = this.state.bahanSort.dir === 'asc' ? 'desc' : 'asc';
        } else {
            this.state.bahanSort.column = col;
            this.state.bahanSort.dir = 'asc';
        }

        // Reset visual icons
        const uiCols = ['id', 'nama', 'kategori', 'satuan', 'stok'];
        uiCols.forEach(c => {
            const icon = document.getElementById(`sort-icon-${c}`);
            if (icon) {
                if (c === col) {
                    icon.style.display = 'inline-block';
                    icon.className = this.state.bahanSort.dir === 'asc' ? 'ph ph-caret-circle-up' : 'ph ph-caret-circle-down';
                    icon.style.color = 'var(--primary)';
                } else {
                    icon.style.display = 'none';
                }
            }
        });

        this.loadBahan();
    },

    openBahanModal: async function (id = null) {
        document.getElementById('bahan-form').reset();
        await this.populateKategoriSelect();

        if (id) {
            document.getElementById('bahan-modal-title').textContent = 'Edit Data Bahan';
            const b = await db.stores.bahan.getItem(String(id));
            if (b) {
                document.getElementById('bahan-id').value = id;
                document.getElementById('bahan-kode').value = b.ID_Barang || '';
                document.getElementById('bahan-nama').value = b.Nama_Barang || '';
                document.getElementById('bahan-kategori').value = b.Kategori || '';
                document.getElementById('bahan-satuan').value = b.Satuan || '';
                document.getElementById('bahan-stok').value = b.Stok || '';
                document.getElementById('bahan-stok-minimum').value = b.Stok_Minimal || '';
                document.getElementById('bahan-keterangan').value = b.Keterangan || '';
            }
        } else {
            document.getElementById('bahan-modal-title').textContent = 'Tambah Data Bahan Baru';
            document.getElementById('bahan-id').value = '';
            document.getElementById('bahan-kode').value = 'BHN-' + Date.now().toString().slice(-6);
        }

        this.openModal('bahan-modal');
    },

    saveBahan: async function () {
        this.showLoading('Menyimpan Bahan...');
        const id = document.getElementById('bahan-id').value;
        const isNew = !id;
        const targetId = id || document.getElementById('bahan-kode').value;

        const nama = document.getElementById('bahan-nama').value;
        const kat = document.getElementById('bahan-kategori').value;
        const sat = document.getElementById('bahan-satuan').value;
        const stok = document.getElementById('bahan-stok').value;
        const stokMin = document.getElementById('bahan-stok-minimum').value;
        const ket = document.getElementById('bahan-keterangan').value;
        const jur = this.state.user.jurusan_id || '1';
        const userNow = this.state.user.full_name || this.state.user.username;

        const payload = {
            // Fat payload ensures Google Sheets matches column regardless of case/spacing
            ID_Barang: targetId, 'ID Barang': targetId, id: targetId, ID: targetId,
            Nama_Barang: nama, 'Nama Barang': nama, Nama: nama, nama: nama,
            Kategori: kat, kategori: kat,
            Satuan: sat, satuan: sat,
            Stok: stok, stok: stok, Jumlah: stok, jumlah: stok,
            Stok_Minimal: stokMin, 'Stok Minimal': stokMin, stok_minimal: stokMin,
            Keterangan: ket, keterangan: ket,
            Kode_jurusan: jur, 'Kode Jurusan': jur, jurusan: jur, jurusan_id: jur,
            Diinput_Oleh: userNow
        };

        try {
            await db.stores.bahan.setItem(targetId, payload);
            const actionType = isNew ? 'insert_bahan' : 'update_bahan';
            await db.queueSyncTask(actionType, 'bahan', payload);
            db.syncToServer();

            this.hideLoading();
            this.closeModal('bahan-modal');
            this.showToast('Data bahan berhasil disimpan!', 'success');
            this.loadBahan();
        } catch (e) {
            console.error(e);
            this.hideLoading();
            this.showToast('Gagal menyimpan data!', 'error');
        }
    },

    deleteBahan: async function (id) {
        const diizinkan = await this.showDialog('Hapus Bahan', 'Yakin ingin menghapus master data bahan praktik ini permanen?', 'confirm');
        if (!diizinkan) return;

        this.showLoading('Menghapus...');
        const item = await db.stores.bahan.getItem(String(id));
        await db.stores.bahan.removeItem(String(id));
        const payload = item ? { ...item, ID_Barang: id } : { ID_Barang: id };
        await db.queueSyncTask('delete_bahan', 'bahan', payload);
        db.syncToServer();

        this.hideLoading();
        this.showToast('Bahan berhasil dihapus', 'success');
        this.loadBahan();
    },

    exportBahanPDF: async function() {
        const query = document.getElementById('bahan-search')?.value.toLowerCase() || '';
        let bahanRaw = await db.getAll('bahan');
        
        const myJurusanId = String(this.state.user.jurusan_id || '');
        if (this.state.user.role !== 'Admin') {
            bahanRaw = bahanRaw.filter(b => String(b.Kode_jurusan || b.jurusan_id || '') === myJurusanId);
        }

        const dataBahan = bahanRaw.filter(b => 
            (b.Nama_Barang && b.Nama_Barang.toLowerCase().includes(query)) || 
            (b.ID_Barang && b.ID_Barang.toLowerCase().includes(query))
        );

        if (!dataBahan || dataBahan.length === 0) return this.showToast('Belum ada data bahan untuk diekspor', 'warning');
        
        const allJurusan = await db.getAll('jurusan');
        const myJurusanName = allJurusan.find(j => String(j.id || j.newId) === String(this.state.user.jurusan_id))?.nama || 'Semua Jurusan';

        try {
            const { jsPDF } = window.jspdf;
            const doc = new jsPDF('landscape');
            
            if (window.APP_LOGO_B64) {
                doc.addImage(window.APP_LOGO_B64, 'PNG', 260, 10, 22, 22);
            }

            doc.setFontSize(18);
            doc.text("Laporan Stok Bahan Praktik", 14, 20);
            doc.setFontSize(10);
            
            const monthNames = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];
            const d = new Date();
            const printDateStr = `${d.getDate().toString().padStart(2, '0')} ${monthNames[d.getMonth()]} ${d.getFullYear()} (${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}:${d.getSeconds().toString().padStart(2, '0')}) - ${this.state.user.full_name || this.state.user.username} - ${myJurusanName}`;
            
            doc.text("Tanggal Cetak: " + printDateStr, 14, 28);
            
            const tableColumn = ["ID/Kode", "Nama Bahan", "Kategori", "Satuan", "Sisa Stok", "Status"];
            const tableRows = [];

            dataBahan.forEach(b => {
                const stokText = Number(b.Stok || 0);
                const isHabis = stokText <= 0;
                const isMenipis = stokText <= Number(b.Stok_Minimal || 0) && !isHabis;
                const statusStr = isHabis ? 'Habis' : (isMenipis ? 'Menipis' : 'Aman');

                const rowData = [
                    b.ID_Barang || '-',
                    b.Nama_Barang || '-',
                    b.Kategori || '-',
                    b.Satuan || '-',
                    stokText,
                    statusStr
                ];
                tableRows.push(rowData);
            });

            doc.autoTable({
                head: [tableColumn],
                body: tableRows,
                startY: 38,
                theme: 'grid',
                styles: { fontSize: 9, cellPadding: 2 },
                headStyles: { fillColor: [41, 128, 185], textColor: 255 }
            });

            doc.save('Laporan_Stok_Bahan_Praktik.pdf');
        } catch(e) {
            console.error(e);
            this.showToast('Gagal merender PDF', 'error');
        }
    },

    exportRiwayatBahan: async function () {
        const rawData = await db.getAll('bahan_keluar');
        let data = rawData;
        const myJurusanId = String(this.state.user.jurusan_id || '');
        if (this.state.user.role !== 'Admin') {
            data = data.filter(k => String(k.Kode_jurusan || k.jurusan_id || '') === myJurusanId);
        }
        data.reverse();

        if (!data || data.length === 0) return this.showToast('Belum ada data pengeluaran bahan', 'warning');

        const allJurusan = await db.getAll('jurusan');
        const myJurusanName = allJurusan.find(j => String(j.id || j.newId) === String(this.state.user.jurusan_id))?.nama || 'UMUM';

        try {
            const { jsPDF } = window.jspdf;
            const doc = new jsPDF('landscape');

            if (window.APP_LOGO_B64) {
                doc.addImage(window.APP_LOGO_B64, 'PNG', 260, 10, 22, 22);
            }

            doc.setFontSize(18);
            doc.text("Laporan Riwayat Penggunaan Bahan", 14, 20);
            doc.setFontSize(10);

            const monthNames = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];
            const d = new Date();
            const printDateStr = `${d.getDate().toString().padStart(2, '0')} ${monthNames[d.getMonth()]} ${d.getFullYear()} (${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}:${d.getSeconds().toString().padStart(2, '0')}) - ${this.state.user.full_name || this.state.user.username} - ${myJurusanName}`;

            doc.text("Tanggal Cetak: " + printDateStr, 14, 28);

            const tableColumn = ["Tanggal / Waktu", "Nama Bahan", "Total Keluar", "Satuan", "Status / Keterangan", "Petugas"];
            const tableRows = [];

            data.forEach(k => {
                const rowData = [
                    k.Status && String(k.Status).includes('|') ? k.Status.split('|')[0] : (k.ID_Barang || '-'),
                    k.Nama_Barang || '-',
                    k.Total_Keluar || 0,
                    k.Satuan || '-',
                    k.Status && String(k.Status).includes('|') ? k.Status.split('|')[1]?.trim() : (k.Status || '-'),
                    k.Diinput_Oleh || '-'
                ];
                tableRows.push(rowData);
            });

            doc.autoTable({
                head: [tableColumn],
                body: tableRows,
                startY: 38,
                theme: 'grid',
                styles: { fontSize: 9, cellPadding: 2 },
                headStyles: { fillColor: [231, 76, 60], textColor: 255 }
            });

            doc.save('Laporan_Riwayat_Bahan.pdf');
        } catch (e) {
            console.error(e);
            this.showToast('Gagal merender PDF', 'error');
        }
    },

    loadBahanKeluar: async function () {
        this.showLoading('Memuat histori...');
        let keluarRaw = await db.getAll('bahan_keluar');

        const myJurusanId = String(this.state.user.jurusan_id || '');
        if (this.state.user.role !== 'Admin') {
            keluarRaw = keluarRaw.filter(k => String(k.Kode_jurusan || k.jurusan_id || '') === myJurusanId);
        }

        // Search query filter
        const query = document.getElementById('search-bahan-keluar')?.value.toLowerCase() || '';
        if (query) {
            keluarRaw = keluarRaw.filter(k => {
                const nb = String(k.Nama_Barang || '').toLowerCase();
                const pet = String(k.Diinput_Oleh || '').toLowerCase();
                const st = String(k.Status || '').toLowerCase();
                const idb = String(k.ID_Barang || '').toLowerCase();
                return nb.includes(query) || pet.includes(query) || st.includes(query) || idb.includes(query);
            });
        }

        // Urutkan riwayat secara descending (terbaru di atas)
        keluarRaw.reverse();

        const tbody = document.querySelector('#table-bahan-keluar tbody');
        if (!tbody) return this.hideLoading();
        tbody.innerHTML = '';

        if (keluarRaw.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; padding: 2rem; color:var(--text-muted);"><i class="ph ph-trend-down" style="font-size:1.5rem; display:block; margin-bottom:0.5rem; opacity:0.5;"></i>Belum ada riwayat pengeluaran bahan</td></tr>';
            return this.hideLoading();
        }

        keluarRaw.forEach(k => {
            const rawStatus = String(k.Status || '');
            let tglDisplay = rawStatus.includes('|') ? rawStatus.split('|')[0].trim() : (k.ID_Barang || '-');
            let keteranganDisplay = rawStatus.includes('|') ? rawStatus.split('|')[1]?.trim() : rawStatus;
            if (!keteranganDisplay) keteranganDisplay = 'Pemakaian Praktik';

            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>
                    <div style="display:flex; align-items:center; gap:0.4rem;">
                        <i class="ph ph-calendar" style="color:var(--primary-light);"></i>
                        <span style="font-size:0.85rem;">${tglDisplay}</span>
                    </div>
                </td>
                <td style="font-weight:600;">${k.Nama_Barang || '-'}</td>
                <td>
                    <span class="badge bg-danger" style="color:white; font-weight:700; font-size:0.8rem; padding:0.2rem 0.5rem;">
                        - ${k.Total_Keluar || 0}
                    </span>
                </td>
                <td style="color:var(--text-muted); font-size:0.85rem;">${k.Satuan || '-'}</td>
                <td>
                    <span class="badge" style="background:rgba(255,255,255,0.06); color:var(--text-main); font-size:0.75rem;">
                        ${keteranganDisplay}
                    </span>
                </td>
                <td>
                    <div style="display:flex; align-items:center; gap:0.4rem; font-size:0.82rem; color:var(--text-muted);">
                        <i class="ph ph-user-circle" style="font-size:1rem; color:var(--text-main);"></i>
                        <span>${k.Diinput_Oleh || '-'}</span>
                    </div>
                </td>
            `;
            tbody.appendChild(tr);
        });
        this.hideLoading();
    },

    openBahanCheckoutModal: async function (id) {
        document.getElementById('bahan-checkout-form').reset();
        document.getElementById('checkout-warning').textContent = '';

        const b = await db.stores.bahan.getItem(String(id));
        if (!b) return this.showToast('Data bahan coruppt/hilang!', 'error');

        document.getElementById('checkout-bahan-id').value = id;
        document.getElementById('checkout-nama-bahan').textContent = String(b.Nama_Barang || 'Unknown');
        document.getElementById('checkout-sisa-stok').textContent = String(b.Stok || 0);
        document.getElementById('checkout-satuan').textContent = String(b.Satuan || '');
        document.getElementById('checkout-jumlah').max = Number(b.Stok || 0);

        this.openModal('bahan-checkout-modal');
    },

    saveBahanCheckout: async function () {
        this.showLoading('Memproses Pengeluaran...');
        const id = document.getElementById('checkout-bahan-id').value;
        const keluarQty = Number(document.getElementById('checkout-jumlah').value || 1);
        const keterangan = document.getElementById('checkout-status').value || 'Pemakaian Reguler';

        try {
            const b = await db.stores.bahan.getItem(String(id));
            if (!b || Number(b.Stok) < keluarQty) {
                this.hideLoading();
                return document.getElementById('checkout-warning').textContent = 'Stok tidak mencukupi untuk jumlah ini!';
            }

            // 1. Kurangi stok Master Bahan
            b.Stok = Number(b.Stok) - keluarQty;
            await db.stores.bahan.setItem(String(id), b);
            await db.queueSyncTask('update_bahan', 'bahan', b);

            // 2. Catat riwayat Bahan Keluar
            const todayStr = new Date().toISOString().split('T')[0];
            const kelID = 'OUT-' + Date.now().toString();
            const logPayload = {
                ID_Barang: kelID,
                Nama_Barang: b.Nama_Barang,
                Satuan: b.Satuan,
                Total_Keluar: keluarQty,
                Status: todayStr + ' | ' + keterangan, // Kombinasi format tanggal + keterangan karena sheetnya kurang kolom Tanggal
                Kode_jurusan: this.state.user.jurusan_id || '1',
                Diinput_Oleh: this.state.user.full_name || this.state.user.username
            };

            await db.stores.bahan_keluar.setItem(kelID, logPayload);
            await db.queueSyncTask('insert_bahan_keluar', 'bahan_keluar', logPayload);

            db.syncToServer();
            this.hideLoading();
            this.closeModal('bahan-checkout-modal');
            this.showToast('Pengeluaran berhasil dicatat. Stok diperbarui.', 'success');

            if (document.getElementById('bahan-section').classList.contains('section-active')) {
                this.loadBahan();
            }
            if (document.getElementById('bahan_keluar-section').classList.contains('section-active')) {
                this.loadBahanKeluar();
            }
        } catch (e) {
            console.error(e);
            this.hideLoading();
            this.showToast('Gagal memproses pemakaian', 'error');
        }
    },
    showDialog: function (title, message, type = 'confirm') {
        return new Promise((resolve) => {
            const modal = document.getElementById('dialog-modal');
            const btnCancel = document.getElementById('btn-dialog-cancel');
            const btnConfirm = document.getElementById('btn-dialog-confirm');

            document.getElementById('dialog-title').textContent = title;
            document.getElementById('dialog-message').innerText = message;

            const iconDiv = document.getElementById('dialog-icon');
            if (type === 'alert' || type === 'info') {
                iconDiv.innerHTML = '<i class="ph ph-info" style="color: var(--primary)"></i>';
                btnCancel.style.display = 'none';
                btnConfirm.textContent = 'OK';
            } else if (type === 'error') {
                iconDiv.innerHTML = '<i class="ph ph-warning-circle" style="color: var(--danger)"></i>';
                btnCancel.style.display = 'none';
                btnConfirm.textContent = 'OK';
            } else { // confirm
                iconDiv.innerHTML = '<i class="ph ph-warning-circle" style="color: var(--warning)"></i>';
                btnCancel.style.display = 'block';
                btnConfirm.textContent = 'Ya';
            }

            modal.classList.remove('hidden');

            const handleConfirm = () => { cleanup(); resolve(true); };
            const handleCancel = () => { cleanup(); resolve(false); };
            const cleanup = () => {
                btnConfirm.removeEventListener('click', handleConfirm);
                btnCancel.removeEventListener('click', handleCancel);
                modal.classList.add('hidden');
            };

            btnConfirm.addEventListener('click', handleConfirm);
            btnCancel.addEventListener('click', handleCancel);
        });
    },

    showToast: function (message, type = 'info') {
        const container = document.getElementById('toast-container');
        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;

        let icon = 'ph-info';
        if (type === 'success') icon = 'ph-check-circle';
        if (type === 'error') icon = 'ph-x-circle';
        if (type === 'warning') icon = 'ph-warning';

        toast.innerHTML = `<i class="ph ${icon}"></i> <span>${message}</span>`;
        container.appendChild(toast);

        // Animate in (CSS)
        setTimeout(() => toast.classList.add('show'), 10);

        // Remove after 3 seconds
        setTimeout(() => {
            toast.classList.remove('show');
            setTimeout(() => toast.remove(), 300);
        }, 3000);
    },

    // ===== BOTTOM NAVIGATION =====
    initBottomNav: function() {
        document.querySelectorAll('.bottom-nav-item').forEach(item => {
            item.addEventListener('click', () => {
                const target = item.getAttribute('data-target');
                if (target) {
                    this.navigate(target);
                }
            });
        });
    },

    openSidebar: function() {
        const sidebar = document.getElementById('sidebar');
        const backdrop = document.getElementById('sidebar-backdrop');
        if (sidebar) sidebar.classList.add('open');
        if (backdrop) {
            backdrop.classList.remove('hidden');
            backdrop.classList.add('visible');
        }
        document.body.classList.add('sidebar-open');
    },

    closeSidebar: function() {
        const sidebar = document.getElementById('sidebar');
        const backdrop = document.getElementById('sidebar-backdrop');
        if (sidebar) sidebar.classList.remove('open');
        if (backdrop) {
            backdrop.classList.remove('visible');
            backdrop.classList.add('hidden');
        }
        document.body.classList.remove('sidebar-open');
    },

    setActiveNavigation: function(targetId) {
        document.querySelectorAll('.nav-links li').forEach(item => {
            item.classList.toggle('active', item.getAttribute('data-target') === targetId);
        });
        document.querySelectorAll('.bottom-nav-item').forEach(item => {
            item.classList.toggle('active', item.getAttribute('data-target') === targetId);
        });
    },

    // Update notification badge untuk peminjaman active
    updatePeminjamanBadge: function() {
        const active = (this.state.peminjaman || []).filter(p => String(p.status || '').trim().toUpperCase() === 'DIPINJAM').length;
        const badge = document.querySelector('.bottom-nav-item[data-target="peminjaman"] .badge-count');
        
        if (badge) {
            if (active > 0) {
                badge.textContent = active > 99 ? '99+' : active;
                badge.style.display = 'flex';
            } else {
                badge.style.display = 'none';
            }
        }
    },

    // ===== SEARCH & FILTER =====
    initSearchAndFilter: function() {
        const searchInput = document.getElementById('search-riwayat');
        const monthFilter = document.getElementById('filter-bulan-riwayat');
        const yearFilter = document.getElementById('filter-tahun-riwayat');
        const statusFilter = document.getElementById('filter-status-riwayat');
        const tanggalFilter = document.getElementById('filter-tanggal-riwayat');
        const timelineBtn = document.getElementById('btn-riwayat-timeline');
        
        [searchInput, monthFilter, yearFilter, statusFilter, tanggalFilter].forEach(el => {
            if (el) el.addEventListener('change', () => this.applyRiwayatFilters());
        });
        
        if (searchInput) {
            searchInput.addEventListener('input', () => {
                clearTimeout(this.searchTimeout);
                this.searchTimeout = setTimeout(() => this.applyRiwayatFilters(), 300);
            });
        }

        if (tanggalFilter) {
            tanggalFilter.addEventListener('input', () => this.applyRiwayatFilters());
        }
        
        if (timelineBtn) {
            timelineBtn.addEventListener('click', () => this.toggleTimelineView());
        }
    },

    applyRiwayatFilters: function() {
        const search = document.getElementById('search-riwayat')?.value.toLowerCase() || '';
        const bulan = document.getElementById('filter-bulan-riwayat')?.value || '';
        const tahun = document.getElementById('filter-tahun-riwayat')?.value || '';
        const status = document.getElementById('filter-status-riwayat')?.value || '';
        const tanggalPinjam = document.getElementById('filter-tanggal-riwayat')?.value || '';
        
        const rows = document.querySelectorAll('#table-riwayat tbody tr');
        let visibleCount = 0;
        
        rows.forEach(row => {
            const text = row.textContent.toLowerCase();
            const tgl = row.querySelector('td:nth-child(3)')?.textContent || '';
            const rowStatus = row.dataset.status || '';
            const rowTanggal = row.dataset.tanggalPinjam || '';
            
            const matchSearch = !search || text.includes(search);
            const matchBulan = !bulan || tgl.includes('/' + bulan);
            const matchTahun = !tahun || tgl.includes(tahun);
            const matchStatus = !status || String(rowStatus).trim().toUpperCase() === String(status).trim().toUpperCase();
            const matchTanggal = !tanggalPinjam || rowTanggal === tanggalPinjam;
            
            const visible = matchSearch && matchBulan && matchTahun && matchStatus && matchTanggal;
            row.style.display = visible ? '' : 'none';
            if (visible) visibleCount++;
        });
        
        this.updateFilterChips(search, bulan, tahun, status, tanggalPinjam);
    },

    updateFilterChips: function(search, bulan, tahun, status, tanggalPinjam) {
        const container = document.getElementById('filter-chips-riwayat');
        if (!container) return;
        container.innerHTML = '';
        
        if (search) {
            const chip = document.createElement('div');
            chip.className = 'filter-chip';
            chip.innerHTML = `<i class="ph ph-magnifying-glass"></i> "${search}"`;
            container.appendChild(chip);
        }
        if (status) {
            const chip = document.createElement('div');
            chip.className = 'filter-chip';
            chip.innerHTML = `<i class="ph ph-tag"></i> Status: ${status === 'DIPINJAM' ? 'Dipinjam' : 'Kembali'}`;
            container.appendChild(chip);
        }
        if (tanggalPinjam) {
            const chip = document.createElement('div');
            chip.className = 'filter-chip';
            chip.innerHTML = `<i class="ph ph-calendar"></i> Tgl: ${this.formatDate(tanggalPinjam)}`;
            container.appendChild(chip);
        }
        if (bulan) {
            const bulanNames = ['', 'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
            const chip = document.createElement('div');
            chip.className = 'filter-chip';
            chip.innerHTML = `<i class="ph ph-calendar"></i> Bulan: ${bulanNames[parseInt(bulan)]}`;
            container.appendChild(chip);
        }
        if (tahun) {
            const chip = document.createElement('div');
            chip.className = 'filter-chip';
            chip.innerHTML = `<i class="ph ph-calendar"></i> Tahun: ${tahun}`;
            container.appendChild(chip);
        }
    },

    // ===== TIMELINE VIEW =====
    toggleTimelineView: function() {
        const tableView = document.getElementById('riwayat-table-view');
        const timelineView = document.getElementById('riwayat-timeline-view');
        const btn = document.getElementById('btn-riwayat-timeline');
        
        if (!tableView || !timelineView || !btn) return;
        
        const showTimeline = tableView.classList.contains('hidden');
        tableView.classList.toggle('hidden');
        timelineView.classList.toggle('hidden');
        btn.classList.toggle('active', showTimeline);
        
        if (showTimeline) this.renderTimelineView();
    },

    renderTimelineView: function() {
        const container = document.getElementById('riwayat-timeline-view');
        if (!container || !this.state.peminjaman) return;
        
        let filtered = this.state.peminjaman.filter(p => {
            const rows = document.querySelectorAll('#table-riwayat tbody tr');
            for (let i = 0; i < rows.length; i++) {
                const tr = rows[i];
                const trxCell = tr.querySelector('td:first-child');
                if (trxCell && trxCell.textContent.trim() === String(p.nomor_peminjaman).trim()) {
                    return tr.style.display !== 'none';
                }
            }
            return true;
        });
        
        filtered.sort((a, b) => new Date(b.tanggal_pinjam || 0) - new Date(a.tanggal_pinjam || 0));
        
        container.innerHTML = filtered.map(p => {
            const isPinjam = p.status === 'DIPINJAM';
            const isKembali = p.status === 'KEMBALI';
            const tglKembali = new Date(p.tanggal_kembali_estimasi || '');
            const isOverdue = isPinjam && tglKembali < new Date();
            
            return `
                <div class="timeline-item">
                    <div class="timeline-marker ${isKembali ? 'returned' : isOverdue ? 'overdue' : ''}">
                        <i class="ph ${isKembali ? 'ph-check' : 'ph-minus'}"></i>
                    </div>
                    <div class="timeline-card">
                        <div class="timeline-date">${new Date(p.tanggal_pinjam).toLocaleDateString('id-ID')}</div>
                        <div class="timeline-header">
                            <div>
                                <div class="timeline-title">${p.nama_peminjam}</div>
                                <div style="font-size:0.8rem; color:var(--text-muted);">${p.kelas || 'N/A'}</div>
                            </div>
                            <span class="timeline-status-badge ${isKembali ? 'returned' : isOverdue ? 'overdue' : ''}">
                                ${isKembali ? 'KEMBALI' : isOverdue ? 'OVERDUE' : 'DIPINJAM'}
                            </span>
                        </div>
                        <div class="timeline-details">
                            <div class="timeline-detail-item">
                                <div class="timeline-detail-label">TRX</div>
                                <div class="timeline-detail-value">${p.nomor_peminjaman || '-'}</div>
                            </div>
                            <div class="timeline-detail-item">
                                <div class="timeline-detail-label">Alat</div>
                                <div class="timeline-detail-value">${p.nama_alat || '-'}</div>
                            </div>
                            <div class="timeline-detail-item">
                                <div class="timeline-detail-label">Tgl Kembali</div>
                                <div class="timeline-detail-value">${p.tanggal_kembali_estimasi ? new Date(p.tanggal_kembali_estimasi).toLocaleDateString('id-ID') : '-'}</div>
                            </div>
                            <div class="timeline-detail-item">
                                <div class="timeline-detail-label">Kondisi</div>
                                <div class="timeline-detail-value">${p.kondisi_alat || '-'}</div>
                            </div>
                        </div>
                    </div>
                </div>
            `;
        }).join('');
        
        if (filtered.length === 0) {
            container.innerHTML = '<div style="text-align: center; padding: 2rem; color: var(--text-muted);">Tidak ada data yang cocok</div>';
        }
    }
}

// CSS for toasts to append dynamically if not in style.css
const style = document.createElement('style');
style.textContent = `
    .toast-container {
        position: fixed;
        top: 20px;
        right: 20px;
        z-index: 10000;
        display: flex;
        flex-direction: column;
        gap: 10px;
    }
    .toast {
        background: var(--surface);
        backdrop-filter: blur(10px);
        color: white;
        padding: 12px 20px;
        border-radius: var(--radius-md);
        box-shadow: var(--shadow-lg);
        display: flex;
        align-items: center;
        gap: 10px;
        transform: translateX(120%);
        transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1);
        border-left: 4px solid var(--primary);
    }
    .toast.show {
        transform: translateX(0);
    }
    .toast-success { border-left-color: var(--success); }
    .toast-error { border-left-color: var(--danger); }
    .toast-warning { border-left-color: var(--warning); }
`;
document.head.appendChild(style);

// Initialize app when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    app.init();
});