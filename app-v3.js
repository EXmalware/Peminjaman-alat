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
        alatLimit: 50
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
            document.getElementById('sidebar').classList.add('open');
        });
        document.getElementById('close-sidebar-btn').addEventListener('click', () => {
            document.getElementById('sidebar').classList.remove('open');
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

        // Pemicu sinkronisasi asinkronous transparan di balakang layar
        this.backgroundSync();

        // Default navigation
        this.navigate('dashboard');
    },

    updateHeaderProfile: function () {
        if (!this.state.user) return;
        document.getElementById('user-name-display').textContent = this.state.user.full_name || this.state.user.username;
        const roleBadge = document.getElementById('user-role-badge');
        roleBadge.textContent = this.state.user.role;
        roleBadge.style.background = this.state.user.role === 'Admin' ? 'var(--primary)' : 'var(--success)';
        if (this.state.user.foto) {
            document.getElementById('user-avatar').src = this.getDriveImageUrl(this.state.user.foto);
        }
    },

    openProfileModal: function () {
        document.getElementById('prof-nama').value = this.state.user.full_name || '';
        document.getElementById('prof-username').value = this.state.user.username || '';
        document.getElementById('prof-password').value = '';

        const img = document.getElementById('prof-foto-img');
        const icon = document.getElementById('prof-foto-icon');
        if (this.state.user.foto) {
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
        // Update active nav link
        document.querySelectorAll('.nav-links li').forEach(item => {
            item.classList.remove('active');
            if (item.getAttribute('data-target') === targetId) {
                item.classList.add('active');
            }
        });

        // Hide all sections
        document.querySelectorAll('.content-section').forEach(section => {
            section.classList.add('hidden');
            section.classList.remove('section-active');
        });

        // Show target section
        const section = document.getElementById(`${targetId}-section`);
        if (section) {
            section.classList.remove('hidden');
            section.classList.add('section-active');

            // Update Page Title
            const titleMap = {
                'dashboard': 'Dashboard',
                'peminjaman': 'Peminjaman Alat',
                'riwayat': 'Riwayat Peminjaman',
                'alat': 'Data Alat',
                'kategori': 'Kategori Alat',
                'users': 'Manajemen User'
            };
            document.getElementById('page-title').textContent = titleMap[targetId] || 'Halaman';
            // Load section data
            this.loadSectionData(targetId);
        }

        // Close sidebar on mobile
        if (window.innerWidth <= 768) {
            document.getElementById('sidebar').classList.remove('open');
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

        // Indikator elegan untuk halaman Login (Glassmorphism Color Shift)
        const loginGlass = document.querySelector('.login-glass');
        if (loginGlass) {
            if (!isOnline) {
                loginGlass.style.boxShadow = '0 8px 32px 0 rgba(231, 76, 60, 0.25)';
                loginGlass.style.border = '1px solid rgba(231, 76, 60, 0.4)';
            } else {
                loginGlass.style.boxShadow = '0 8px 32px 0 rgba(46, 204, 113, 0.25)';
                loginGlass.style.border = '1px solid rgba(46, 204, 113, 0.4)';
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

        // Memutar ikon secara visual bila dipicu secara manual/otomatis
        const btnSync = document.getElementById('btn-sync');
        if (btnSync) {
            btnSync.innerHTML = '<i class="ph ph-spinner ph-spin"></i>';
        }

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
        }
    },

    showLoading: function (text = 'Memuat...') {
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

    loadDashboard: async function () {
        const alat = this.getFilteredData(await db.getAll('alat'));
        const riwayatRaw = await db.getAll('peminjaman');
        const riwayat = this.getFilteredData(riwayatRaw);

        document.getElementById('stat-total-alat').textContent = alat.length;
        document.getElementById('stat-tersedia').textContent = alat.filter(a => Number(a.jumlah_tersedia) > 0).length;

        // Count active borrowings
        const activeCount = riwayat.filter(p => p.status === 'DIPINJAM').length;
        document.getElementById('stat-dipinjam').textContent = activeCount;

        // Load Bahan Kritis (Habis/Menipis)
        const bahanTable = document.getElementById('dashboard-bahan-kritis-table');
        if (bahanTable) {
            const tbody = bahanTable.querySelector('tbody');
            tbody.innerHTML = '';
            
            let bahanRaw = await db.getAll('bahan');
            const myJurusanId = String(this.state.user.jurusan_id || '');
            if (this.state.user.role !== 'Admin') {
                bahanRaw = bahanRaw.filter(b => String(b.Kode_jurusan || b.jurusan_id || '') === myJurusanId);
            }
            
            const statBahan = document.getElementById('stat-bahan-tersedia');
            if (statBahan) {
                const bahanTersediaCount = bahanRaw.filter(b => Number(b.Stok || 0) > 0).length;
                statBahan.textContent = bahanTersediaCount;
            }
            
            let bahanKritis = bahanRaw.filter(b => {
                const stok = Number(b.Stok || 0);
                const min = Number(b.Stok_Minimal || 0);
                return stok <= min;
            }).sort((a, b) => Number(a.Stok || 0) - Number(b.Stok || 0));

            if (bahanKritis.length === 0) {
                tbody.innerHTML = '<tr><td colspan="4" style="text-align:center; padding: 2rem;">Semua stok bahan aman</td></tr>';
            } else {
                bahanKritis.forEach(b => {
                    const stok = Number(b.Stok || 0);
                    const isHabis = stok <= 0;
                    const bClass = isHabis ? 'bg-danger' : 'bg-warning';
                    const bText = isHabis ? 'Habis' : 'Menipis';
                    const tr = document.createElement('tr');
                    tr.innerHTML = `
                        <td>${b.ID_Barang || '-'}</td>
                        <td><b>${b.Nama_Barang}</b></td>
                        <td>${stok} ${b.Satuan || ''}</td>
                        <td style="text-align:right">
                            <span class="badge ${bClass}" style="color:white; padding:0.25rem 0.5rem; font-size:0.75rem; border-radius:4px;">${bText}</span>
                        </td>
                    `;
                    tbody.appendChild(tr);
                });
            }
        }

        // Load 10 Recent Peminjaman
        const recentTable = document.getElementById('table-recent-peminjaman');
        if (recentTable) {
            const tbody = recentTable.querySelector('tbody');
            tbody.innerHTML = '';
            const recentList = riwayat.sort((a, b) => new Date(b.created_at) - new Date(a.created_at)).slice(0, 10);
            
            if (recentList.length === 0) {
                tbody.innerHTML = '<tr><td colspan="4" style="text-align:center; padding: 2rem;">Tidak ada riwayat transaksi</td></tr>';
            } else {
                recentList.forEach(p => {
                    let statusBadge = p.status === 'DIPINJAM' ? '<span class="badge" style="background:var(--warning); color:white; padding:2px 6px;">DIPINJAM</span>' : '<span class="badge" style="background:var(--success); color:white; padding:2px 6px;">KEMBALI</span>';
                    const tr = document.createElement('tr');
                    tr.innerHTML = `
                        <td><b>${p.nomor_peminjaman}</b></td>
                        <td>${p.nama_peminjam}</td>
                        <td>${this.formatDate(p.created_at)}</td>
                        <td>${statusBadge}</td>
                    `;
                    tbody.appendChild(tr);
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
        const tbody = document.querySelector('#table-users tbody');
        tbody.innerHTML = '';

        users.forEach(u => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td><b>${u.username}</b></td>
                <td>${u.full_name}</td>
                <td><span class="badge">${u.role}</span></td>
                <td>${u.jurusan_id || 'Semua'}</td>
                <td>
                    <button class="btn-icon" onclick='app.editUser(${JSON.stringify(u)})'><i class="ph ph-pencil"></i></button>
                </td>
            `;
            tbody.appendChild(tr);
        });
    },

    openUserModal: function () {
        document.getElementById('user-form').reset();
        document.getElementById('user-id').value = '';
        document.getElementById('user-modal-title').textContent = 'Tambah User';
        this.openModal('user-modal');
    },

    editUser: function (user) {
        document.getElementById('user-id').value = user.id || user.newId;
        document.getElementById('user-username').value = user.username;
        document.getElementById('user-password').value = user.password;
        document.getElementById('user-fullname').value = user.full_name;
        document.getElementById('user-role').value = user.role;
        document.getElementById('user-jurusan').value = user.jurusan_id;
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
        const tbody = document.querySelector('#table-kategori tbody');
        tbody.innerHTML = '';
        data.forEach(kat => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td><b>${kat.nama}</b></td>
                <td>${kat.jurusan_id || '-'}</td>
                <td style="text-align:right">
                    <button class="btn-icon" onclick='app.editKategori(${JSON.stringify(kat)})'><i class="ph ph-pencil"></i></button>
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
        const match = url.match(/id=([a-zA-Z0-9_-]+)/) || url.match(/\/d\/([a-zA-Z0-9_-]+)/);
        if (match && match[1]) {
            return `https://drive.google.com/thumbnail?id=${match[1]}&sz=w400`; // Extract ID and use thumbnail API
        }
        return url;
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

    loadAlat: async function () {
        const query = document.getElementById('alat-search')?.value.toLowerCase() || '';
        const rawAlat = await db.getAll('alat');
        const alatDataFiltered = this.getFilteredData(rawAlat).filter(a =>
            a.nama.toLowerCase().includes(query) ||
            a.kode_seri.toLowerCase().includes(query)
        );

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

        alatData.forEach(a => {
            const katName = katMap[a.kategori_id] || a.kategori_id || '-';
            const imgUrl = this.getDriveImageUrl(a.foto);

            // Render Tabel
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>${imgUrl ? `<img src="${imgUrl}" style="width:40px; height:40px; object-fit:cover; border-radius:8px;">` : `<div style="width:40px; height:40px; background:gray; border-radius:8px; display:flex; align-items:center; justify-content:center"><i class="ph ph-image" style="color:white"></i></div>`}</td>
                <td>${a.kode_seri}</td>
                <td>${a.nama}</td>
                <td><span class="badge">${katName}</span></td>
                <td><b>${a.jumlah_tersedia}</b> / ${a.jumlah_total}</td>
                <td>${a.kondisi}</td>
                <td>
                    <div style="display:flex; gap:0.25rem;">
                        <button class="btn-icon" onclick='app.editAlat(${JSON.stringify(a)})'><i class="ph ph-pencil"></i></button>
                        <button class="btn-icon" onclick="app.hapusAlat('${a.id || a.newId}')"><i class="ph ph-trash" style="color:var(--danger)"></i></button>
                    </div>
                </td>
            `;
            tbody.appendChild(tr);

            // Render Grid
            if (grid) {
                const gridItem = document.createElement('div');
                gridItem.className = 'alat-grid-item';
                gridItem.innerHTML = `
                    ${imgUrl ? `<img src="${imgUrl}" class="alat-grid-img">` : `<div class="alat-grid-img" style="display:flex; align-items:center; justify-content:center"><i class="ph ph-image" style="font-size: 3rem; color:var(--text-muted)"></i></div>`}
                    <div style="font-size: 0.75rem; color: var(--text-muted); display:flex; justify-content:space-between;">
                        <span>${a.kode_seri}</span>
                        <span class="badge" style="padding: 0.1rem 0.4rem; font-size:0.7rem;">${katName}</span>
                    </div>
                    <h4 style="margin: 0;">${a.nama}</h4>
                    <div style="font-size: 0.85rem; display: flex; justify-content: space-between; margin-top: auto;">
                        <span>Stok: <b>${a.jumlah_tersedia}</b>/${a.jumlah_total}</span>
                        <span style="color: ${a.kondisi === 'Baik' ? 'var(--success)' : 'var(--warning)'}">${a.kondisi}</span>
                    </div>
                    <div style="display:flex; gap: 0.5rem; margin-top: 0.5rem;">
                        <button class="btn btn-outline btn-sm" style="flex:1" onclick='app.editAlat(${JSON.stringify(a)})'><i class="ph ph-pencil"></i></button>
                        <button class="btn btn-outline btn-sm" style="flex:1; border-color: var(--danger); color: var(--danger);" onclick="app.hapusAlat('${a.id || a.newId}')"><i class="ph ph-trash"></i></button>
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
        await db.stores.alat.removeItem(id);
        await db.queueSyncTask('delete_alat', 'alat', { id: id, newId: id });
        this.hideLoading();
        this.showToast('Alat berhasil dihapus', 'success');
        this.loadAlat();
        db.syncToServer();
    },

    openAlatModal: async function () {
        document.getElementById('alat-form').reset();
        document.getElementById('alat-id').value = '';
        document.getElementById('alat-foto-url').value = '';
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
        const myJurusanId = String(this.state.user.jurusan_id || '');
        if (myJurusanId && myJurusanId !== 'undefined' && myJurusanId !== 'null') {
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

    handleFotoUpload: function (event) {
        const file = event.target.files[0];
        if (!file) return;

        // Preview rendering
        const reader = new FileReader();
        reader.onload = (e) => {
            document.getElementById('foto-preview').innerHTML = `<img src="${e.target.result}" style="width:100%; height:100%; object-fit:cover;">`;

            // If online, optionally upload to Backend right away or store base64 in local DB for later upload.
            // For now, we will save base64 string directly for offline use.
            document.getElementById('alat-foto-url').value = e.target.result;
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
        const data = filtered.filter(p => p.status && p.status.trim().toUpperCase() === 'DIPINJAM').sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

        const tbody = document.querySelector('#table-active-peminjaman tbody');
        const countBadge = document.getElementById('active-peminjaman-count');

        tbody.innerHTML = '';
        countBadge.textContent = `${data.length} Aktif`;

        if (data.length === 0) {
            tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; padding: 2rem; color: var(--text-muted);">Tidak ada peminjaman aktif saat ini</td></tr>';
            return;
        }

        data.forEach(p => {
            const tr = document.createElement('tr');
            const items = JSON.parse(p.items || '[]');
            tr.innerHTML = `
                <td><b>${p.nomor_peminjaman}</b></td>
                <td><b>${p.nama_peminjam}</b><small>${p.kelas_unit}</small></td>
                <td><small>${this.formatDate(p.tanggal_kembali_estimasi)}</small></td>
                <td>
                    <span class="badge badge-outline clickable-badge" 
                          onclick="app.showPeminjamanDetail('${p.id || p.newId}')"
                          style="cursor:pointer; border-color:var(--primary); color:var(--primary)">
                        ${items.length} Item <i class="ph ph-eye"></i>
                    </span>
                </td>
                <td>
                    <div class="action-buttons">
                        <button class="btn btn-sm btn-outline" onclick='app.cetakReceipt(${JSON.stringify(p)})' title="Cetak Struk"><i class="ph ph-printer"></i></button>
                        <button class="btn btn-sm btn-primary" onclick="app.kembalikanAlat('${p.id || p.newId}')" title="Kembalikan"><i class="ph ph-arrow-u-up-left"></i></button>
                    </div>
                </td>
            `;
            tbody.appendChild(tr);
        });
    },

    openPilihAlatModal: async function () {
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
        const existing = this.state.cart.find(item => (item.id || item.newId) === (a.id || a.newId));
        if (existing) {
            if (existing.qty < a.jumlah_tersedia) {
                existing.qty++;
            } else {
                return this.showToast('Jumlah melebihi stok tersedia!', 'warning');
            }
        } else {
            this.state.cart.push({ ...a, qty: 1 });
        }
        this.closeModal('pilih-alat-modal');
        this.renderCart();
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
            newId: 'PEM-' + Date.now(),
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
            created_at: new Date().toISOString()
        };

        this.showLoading('Memproses...');

        // Save transaction
        await db.stores.peminjaman.setItem(payload.newId, payload);
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

        db.syncToServer();
    },

    cetakReceipt: async function (p) {
        const nama = p.nama_peminjam || 'Nama Peminjam';
        const kelas = p.kelas_unit || 'Kelas';
        const timestamp = this.formatDate(p.created_at);

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
                .footer { font-size: 10px; margin-top: 10px; text-align: center; }
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
                <p>Waktu: ${timestamp}</p>
                <div class="divider"></div>
                <table>
                    <thead><tr><th>Item</th><th style="text-align:right">Qty</th></tr></thead>
                    <tbody>${cartHtml || '<tr><td colspan="2">No items</td></tr>'}</tbody>
                </table>
                <div class="divider"></div>
                <p>Petugas: ${petugas}</p>
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
    loadRiwayat: async function () {
        const rawData = this.getFilteredData(await db.getAll('peminjaman'));
        const data = rawData.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

        const tbody = document.querySelector('#table-riwayat tbody');
        tbody.innerHTML = '';
        if (data.length === 0) {
            tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; padding: 2rem;">Belum ada riwayat peminjaman</td></tr>';
            return;
        }

        data.forEach(p => {
            let statusBadge = p.status === 'DIPINJAM' ? '<span class="badge" style="background:var(--warning)">DIPINJAM</span>' : '<span class="badge" style="background:var(--success)">KEMBALI</span>';
            const tr = document.createElement('tr');

            // Format Dates
            const pinjamDate = this.formatDate(p.created_at);
            const kembaliDate = p.tanggal_kembali_aktual ? this.formatDate(p.tanggal_kembali_aktual) : '-';
            const note = p.Keterangan || p.keterangan || '-';
            const items = JSON.parse(p.items || '[]');

            tr.innerHTML = `
                <td><b>${p.nomor_peminjaman}</b></td>
                <td><b>${p.nama_peminjam}</b><small>${p.kelas_unit} • ${p.nomor_hp}</small></td>
                <td>
                    <b>Pinjam:</b> ${pinjamDate}<br>
                    <small>Kembali: ${kembaliDate}</small>
                </td>
                <td>
                    <span class="badge clickable-badge" 
                          onclick="app.showPeminjamanDetail('${p.id || p.newId}')"
                          style="cursor:pointer; background:var(--primary-light); color:var(--primary); padding: 0.4rem 0.6rem;">
                        ${items.length} Alat <i class="ph ph-eye"></i>
                    </span><br>
                    <small style="opacity:0.7">${note}</small>
                </td>
                <td>
                    <div style="display:flex; align-items:center; gap:0.5rem; justify-content:flex-start;">
                        ${statusBadge}
                        <button class="btn-icon" style="font-size: 1.1rem; padding: 0.2rem;" onclick="app.hapusPeminjaman('${p.id || p.newId}')" title="Hapus Riwayat">
                            <i class="ph ph-trash" style="color:var(--danger)"></i>
                        </button>
                    </div>
                </td>
            `;
            tbody.appendChild(tr);
        });
    },

    hapusPeminjaman: async function (id) {
        const diizinkan = await this.showDialog('Hapus Riwayat', 'Apakah Anda yakin ingin menghapus data riwayat ini permanen?', 'confirm');
        if (!diizinkan) return;

        this.showLoading('Menghapus...');
        const p = await db.stores.peminjaman.getItem(id);
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

        await db.stores.peminjaman.removeItem(id);
        await db.queueSyncTask('delete_peminjaman', 'peminjaman', { id: id, newId: id });

        this.hideLoading();
        this.showToast('Riwayat berhasil dihapus', 'success');
        this.loadRiwayat();
        this.loadActivePeminjaman();

        db.syncToServer();
    },

    kembalikanAlat: async function (peminjamanId) {
        const tanya = await this.showDialog('Kembalikan Alat', 'Tandai alat ini sebagai sudah selesai dikembalikan?', 'confirm');
        if (!tanya) return;

        this.showLoading('Memproses...');
        const p = await db.stores.peminjaman.getItem(peminjamanId);
        if (!p) {
            this.hideLoading();
            return this.showToast('Data tidak ditemukan', 'error');
        }

        p.status = 'KEMBALI';
        p.tanggal_kembali_aktual = new Date().toISOString().split('T')[0];

        await db.stores.peminjaman.setItem(peminjamanId, p);
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
        this.showToast('Peminjaman berhasil diselesaikan', 'success');
        this.loadRiwayat();
        this.loadActivePeminjaman();
        this.loadDashboard();

        db.syncToServer();
    },

    exportRiwayat: async function () {
        const data = this.getFilteredData(await db.getAll('peminjaman'));
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

    showPeminjamanDetail: async function (id) {
        const p = await db.stores.peminjaman.getItem(id);
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
    },

    // --- Bahan Praktik Logic
    loadBahan: async function () {
        this.showLoading('Memuat Bahan Praktik...');
        let bahanRaw = await db.getAll('bahan');

        let search = document.getElementById('bahan-search')?.value.toLowerCase() || '';

        const myJurusanId = String(this.state.user.jurusan_id || '');
        if (this.state.user.role !== 'Admin') {
            bahanRaw = bahanRaw.filter(b => String(b.Kode_jurusan || b.jurusan_id || '') === myJurusanId);
        }

        if (search) {
            bahanRaw = bahanRaw.filter(b =>
                (b.Nama_Barang || '').toLowerCase().includes(search) ||
                (b.ID_Barang || '').toLowerCase().includes(search)
            );
        }

        const tbody = document.querySelector('#table-bahan tbody');
        if (!tbody) return this.hideLoading();
        tbody.innerHTML = '';

        if (bahanRaw.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;">Data tidak ditemukan</td></tr>';
            return this.hideLoading();
        }

        bahanRaw.forEach(b => {
            const tr = document.createElement('tr');
            const stokTotal = Number(b.Stok || 0);
            const stokMin = Number(b.Stok_Minimal || 0);

            let stokBadgeClass = 'badge bg-success';
            if (stokTotal <= stokMin && stokTotal > 0) stokBadgeClass = 'badge bg-warning';
            if (stokTotal <= 0) stokBadgeClass = 'badge bg-danger';

            tr.innerHTML = `
                <td>${b.ID_Barang || '-'}</td>
                <td style="font-weight:600;">${b.Nama_Barang || '-'}</td>
                <td><span class="badge" style="background:var(--surface-light); color:var(--text);">${b.Kategori || '-'}</span></td>
                <td>${b.Satuan || '-'}</td>
                <td><span class="${stokBadgeClass}" style="color:white; padding:0.25rem 0.5rem; border-radius:4px;">${stokTotal} Sisa</span></td>
                <td>
                    <div style="display:flex; gap:0.5rem; justify-content:center;">
                        <button class="btn-icon" style="color:var(--warning);" onclick="app.openBahanCheckoutModal('${b.ID_Barang}')" title="Input Pemakaian" ${stokTotal <= 0 ? 'disabled style="opacity:0.5;cursor:not-allowed;"' : ''}><i class="ph ph-trend-down"></i></button>
                        <button class="btn-icon" style="color:var(--primary);" onclick="app.openBahanModal('${b.ID_Barang}')" title="Edit Data"><i class="ph ph-pencil-simple"></i></button>
                        <button class="btn-icon" style="color:var(--danger);" onclick="app.deleteBahan('${b.ID_Barang}')" title="Hapus"><i class="ph ph-trash"></i></button>
                    </div>
                </td>
            `;
            tbody.appendChild(tr);
        });
        this.hideLoading();
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

        const payload = {
            ID_Barang: targetId,
            Nama_Barang: document.getElementById('bahan-nama').value,
            Kategori: document.getElementById('bahan-kategori').value,
            Satuan: document.getElementById('bahan-satuan').value,
            Stok: document.getElementById('bahan-stok').value,
            Stok_Minimal: document.getElementById('bahan-stok-minimum').value,
            Keterangan: document.getElementById('bahan-keterangan').value,
            Kode_jurusan: this.state.user.jurusan_id || '1',
            Diinput_Oleh: this.state.user.full_name || this.state.user.username
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
        await db.stores.bahan.removeItem(String(id));
        await db.queueSyncTask('delete_bahan', 'bahan', { ID_Barang: id });
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

        // Urutkan riwayat secara descending (terbaru di atas)
        keluarRaw.reverse();

        const tbody = document.querySelector('#table-bahan-keluar tbody');
        if (!tbody) return this.hideLoading();
        tbody.innerHTML = '';

        if (keluarRaw.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;">Belum ada riwayat pengeluaran bahan</td></tr>';
            return this.hideLoading();
        }

        keluarRaw.forEach(k => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>${k.Status && String(k.Status).includes('|') ? k.Status.split('|')[0] : (k.ID_Barang || '-')}</td>
                <td style="font-weight:600;">${k.Nama_Barang || '-'}</td>
                <td style="color:var(--danger); font-weight:700;">- ${k.Total_Keluar || 0}</td>
                <td>${k.Satuan || '-'}</td>
                <td>${k.Status && String(k.Status).includes('|') ? k.Status.split('|')[1]?.trim() : (k.Status || '-')}</td>
                <td>${k.Diinput_Oleh || '-'}</td>
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
    }
};

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
