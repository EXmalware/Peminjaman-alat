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
        }
    },

    init: async function() {
        this.bindEvents();
        this.checkNetworkStatus();
        
        // Initial sync/fetch to get Users and Master data
        if (this.state.isOnline) {
            this.showLoading('Menyinkronkan data...');
            const queue = await db.getAll('syncQueue');
            if (queue && queue.length > 0) {
                await db.syncToServer();
            } else {
                await db.fetchServerData();
            }
            this.hideLoading();
        }

        // Check if user is logged in
        const savedUser = localStorage.getItem('pinjamalat_user');
        if (savedUser) {
            this.state.user = JSON.parse(savedUser);
            this.showMainView();
        } else {
            this.showLoginView();
        }
    },

    bindEvents: function() {
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

        // Network Status
        window.addEventListener('online', () => this.updateNetworkStatus(true));
        window.addEventListener('offline', () => this.updateNetworkStatus(false));
    },

    testKoneksi: async function() {
        if(!navigator.onLine) {
            return alert('Anda sedang offline!');
        }
        if(!db.GAS_URL || db.GAS_URL.includes('REPLACE')) {
            return alert('GAS URL belum diatur di db.js!');
        }

        this.showLoading('Menguji koneksi ke Server...');
        try {
            const resp = await fetch(db.GAS_URL + '?action=get_data', { redirect: 'follow' });
            const text = await resp.text();
            this.hideLoading();
            
            try {
                const data = JSON.parse(text);
                if (data.status === 'success') {
                    alert('Koneksi Sukses! Berhasil ditarik ' + (data.users ? data.users.length : 0) + ' data User dari Google Sheet.\\nSilakan coba login ulang.');
                    // Paksa simpan database lokal khusus users agar bisa langsung login
                    if(data.users) await db.saveMasterData('users', data.users);
                } else {
                    alert('Respons JSON ok, tetapi gagal tarik data: ' + JSON.stringify(data));
                }
            } catch(jsonErr) {
                console.error("Non-JSON Response: ", text);
                alert('Gagal parsing JSON. Pastikan Web App GAS diatur "Who has access: Anyone".\\nBisa jadi terblokir login Google (HTML page).\\nRespons HTTP: ' + resp.status + '\\n\\nKutipan Teks:\\n' + text.substring(0, 150));
            }
        } catch(e) {
            this.hideLoading();
            alert('Fetch gagal (CORS error / koneksi terputus).\\nError: ' + e.message);
            console.error(e);
        }
    },

    handleLogin: async function() {
        const username = document.getElementById('login-username').value;
        const password = document.getElementById('login-password').value;
        
        if (!username || !password) return;
        
        this.showLoading('Memverifikasi...');
        
        try {
            const users = await db.getAll('users');
            // Check credentials (ignoring accidental trailing spaces)
            const user = users.find(u => 
                String(u.username || '').trim() === String(username).trim() && 
                String(u.password || '').trim() === String(password).trim()
            );
            
            this.hideLoading();
            
            if (user) {
                this.state.user = {
                    id: user.id || user.newId,
                    username: user.username,
                    full_name: user.full_name,
                    role: user.role,
                    jurusan_id: user.jurusan_id
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

    handleLogout: function() {
        this.state.user = null;
        localStorage.removeItem('pinjamalat_user');
        this.showLoginView();
    },

    showLoginView: function() {
        document.getElementById('main-view').classList.add('hidden');
        document.getElementById('login-view').classList.remove('hidden');
        document.getElementById('login-view').classList.add('section-active');
    },

    showMainView: function() {
        document.getElementById('login-view').classList.add('hidden');
        document.getElementById('login-view').classList.remove('section-active');
        document.getElementById('main-view').classList.remove('hidden');
        
        // Update User Profile UI
        document.getElementById('user-name-display').textContent = this.state.user.full_name;
        document.getElementById('user-role-badge').textContent = this.state.user.role;
        
        // Handle Role-based UI constraints
        this.applyRoleConstraints();
        
        // Default navigation
        this.navigate('dashboard');
    },

    applyRoleConstraints: function() {
        const role = this.state.user.role;
        const adminElements = document.querySelectorAll('.admin-only');
        
        if (role !== 'Admin') {
            adminElements.forEach(el => el.classList.add('hidden'));
        } else {
            adminElements.forEach(el => el.classList.remove('hidden'));
        }
    },

    navigate: function(targetId) {
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

    checkNetworkStatus: function() {
        this.updateNetworkStatus(navigator.onLine);
    },

    updateNetworkStatus: function(isOnline) {
        this.state.isOnline = isOnline;
        const indicator = document.getElementById('network-status');
        
        if (!isOnline) {
            indicator.classList.remove('hidden');
            this.showToast('Koneksi terputus. Beralih ke mode Offline.', 'warning');
        } else {
            indicator.classList.add('hidden');
            // If just back online, maybe trigger sync prompt
            if (indicator.classList.contains('hidden') === false) {
                this.showToast('Kembali online! Menyinkronkan data...', 'success');
            }
        }
    },

    showLoading: function(text = 'Memuat...') {
        document.getElementById('loading-text').textContent = text;
        document.getElementById('loading-overlay').classList.remove('hidden');
    },

    hideLoading: function() {
        document.getElementById('loading-overlay').classList.add('hidden');
    },

    loadSectionData: function(section) {
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
        }
    },
    
    getFilteredData: function(arr) {
        if (!this.state.user || this.state.user.role === 'Admin') return arr;
        return arr.filter(item => String(item.jurusan_id || '') === String(this.state.user.jurusan_id || ''));
    },

    // --- Dashboard logic
    formatDate: function(dateStr) {
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

    loadDashboard: async function() {
        const alat = this.getFilteredData(await db.getAll('alat'));
        const riwayatRaw = await db.getAll('peminjaman');
        const riwayat = this.getFilteredData(riwayatRaw);
        
        document.getElementById('stat-total-alat').textContent = alat.length;
        document.getElementById('stat-tersedia').textContent = alat.filter(a => Number(a.jumlah_tersedia) > 0).length;
        
        // Count active borrowings
        const activeCount = riwayat.filter(p => p.status === 'DIPINJAM').length;
        document.getElementById('stat-dipinjam').textContent = activeCount;

        // Load Active Borrowings to Dashboard
        const activeTable = document.getElementById('dashboard-active-table');
        if (activeTable) {
            const tbody = activeTable.querySelector('tbody');
            tbody.innerHTML = '';
            const activeList = riwayat.filter(p => p.status === 'DIPINJAM')
                                     .sort((a,b) => new Date(b.created_at) - new Date(a.created_at));
            
            if (activeList.length === 0) {
                tbody.innerHTML = '<tr><td colspan="3" style="text-align:center; padding: 2rem;">Tidak ada peminjaman aktif</td></tr>';
            } else {
                activeList.forEach(p => {
                    const tr = document.createElement('tr');
                    tr.innerHTML = `
                        <td><b>${p.nomor_peminjaman}</b></td>
                        <td>${p.nama_peminjam}</td>
                        <td style="text-align:right">
                            <span class="badge clickable-badge" 
                                  onclick="app.showPeminjamanDetail('${p.id || p.newId}')" 
                                  style="cursor:pointer; background:var(--primary-light); color:var(--primary)">
                                Lihat Item <i class="ph ph-eye"></i>
                            </span>
                        </td>
                    `;
                    tbody.appendChild(tr);
                });
            }
        }
    },

    // --- Modal logic
    openModal: function(modalId) {
        document.getElementById(modalId).classList.remove('hidden');
    },
    closeModal: function(modalId) {
        document.getElementById(modalId).classList.add('hidden');
    },

    // --- User Management
    loadUsers: async function() {
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

    openUserModal: function() {
        document.getElementById('user-form').reset();
        document.getElementById('user-id').value = '';
        document.getElementById('user-modal-title').textContent = 'Tambah User';
        this.openModal('user-modal');
    },

    editUser: function(user) {
        document.getElementById('user-id').value = user.id || user.newId;
        document.getElementById('user-username').value = user.username;
        document.getElementById('user-password').value = user.password;
        document.getElementById('user-fullname').value = user.full_name;
        document.getElementById('user-role').value = user.role;
        document.getElementById('user-jurusan').value = user.jurusan_id;
        document.getElementById('user-modal-title').textContent = 'Edit User';
        this.openModal('user-modal');
    },

    saveUser: async function() {
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
    loadKategori: async function() {
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

    openKategoriModal: function() {
        document.getElementById('kategori-form').reset();
        document.getElementById('kat-id').value = '';
        document.getElementById('kategori-modal-title').textContent = 'Tambah Kategori';
        
        const jurusanBox = document.getElementById('kat-jurusan').closest('.input-group');
        if (this.state.user.role !== 'Admin') jurusanBox.style.display = 'none';
        else jurusanBox.style.display = 'block';

        this.openModal('kategori-modal');
    },

    editKategori: function(kat) {
        document.getElementById('kat-id').value = kat.id || kat.newId;
        document.getElementById('kat-nama').value = kat.nama;
        document.getElementById('kat-jurusan').value = kat.jurusan_id;
        document.getElementById('kategori-modal-title').textContent = 'Edit Kategori';
        
        const jurusanBox = document.getElementById('kat-jurusan').closest('.input-group');
        if (this.state.user.role !== 'Admin') jurusanBox.style.display = 'none';
        else jurusanBox.style.display = 'block';

        this.openModal('kategori-modal');
    },

    saveKategori: async function() {
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
        db.syncToServer();
    },

    // --- Alat Management
    getDriveImageUrl: function(url) {
        if (!url) return '';
        if (url.startsWith('data:image')) return url; // Offline base64 caching
        const match = url.match(/id=([a-zA-Z0-9_-]+)/) || url.match(/\/d\/([a-zA-Z0-9_-]+)/);
        if (match && match[1]) {
            return `https://drive.google.com/thumbnail?id=${match[1]}&sz=w400`; // Extract ID and use thumbnail API
        }
        return url;
    },

    loadAlat: async function() {
        const query = document.getElementById('alat-search')?.value.toLowerCase() || '';
        const rawAlat = await db.getAll('alat');
        const alatData = this.getFilteredData(rawAlat).filter(a => 
            a.nama.toLowerCase().includes(query) || 
            a.kode_seri.toLowerCase().includes(query)
        );
        const katData = await db.getAll('kategori');
        const katMap = {};
        katData.forEach(k => katMap[k.id || k.newId] = k.nama);

        const tbody = document.querySelector('#table-alat tbody');
        tbody.innerHTML = '';
        alatData.forEach(a => {
            const katName = katMap[a.kategori_id] || a.kategori_id || '-';
            const imgUrl = this.getDriveImageUrl(a.foto);
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>${imgUrl ? `<img src="${imgUrl}" style="width:40px; height:40px; object-fit:cover; border-radius:8px;">` : `<div style="width:40px; height:40px; background:gray; border-radius:8px; display:flex; align-items:center; justify-content:center"><i class="ph ph-image" style="color:white"></i></div>`}</td>
                <td>${a.kode_seri}</td>
                <td>${a.nama}</td>
                <td><span class="badge">${katName}</span></td>
                <td><b>${a.jumlah_tersedia}</b> / ${a.jumlah_total}</td>
                <td>${a.kondisi}</td>
                <td><button class="btn-icon" onclick='app.editAlat(${JSON.stringify(a)})'><i class="ph ph-pencil"></i></button></td>
            `;
            tbody.appendChild(tr);
        });
    },

    openAlatModal: async function() {
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

    editAlat: async function(a) {
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

    populateKategoriSelect: async function() {
        const data = this.getFilteredData(await db.getAll('kategori'));
        const select = document.getElementById('alat-kategori');
        select.innerHTML = '<option value="">Pilih Kategori...</option>';
        data.forEach(k => {
            select.innerHTML += `<option value="${k.id || k.newId}">${k.nama}</option>`;
        });
    },

    handleFotoUpload: function(event) {
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

    saveAlat: async function() {
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

    exportAlat: async function() {
        const data = this.getFilteredData(await db.getAll('alat'));
        if (!data || data.length === 0) return this.showToast('Belum ada data untuk diexport', 'warning');
        
        let csv = 'ID,Kode Seri,Nama,Kategori ID,Total,Tersedia,Kondisi,Jurusan ID\n';
        data.forEach(a => {
            csv += `"${a.id||a.newId}","${a.kode_seri}","${a.nama}","${a.kategori_id}","${a.jumlah_total}","${a.jumlah_tersedia}","${a.kondisi}","${a.jurusan_id}"\n`;
        });
        
        const blob = new Blob([csv], { type: 'text/csv' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'Data_Alat.csv';
        a.click();
    },

    // --- Peminjaman Logic
    initPeminjaman: function() {
        this.state.cart = [];
        document.getElementById('form-peminjaman').reset();
        document.getElementById('pem-kembali').valueAsDate = new Date(Date.now() + 86400000); // Tomorrow
        this.renderCart();
        this.loadActivePeminjaman();
    },

    loadActivePeminjaman: async function() {
        const rawData = await db.getAll('peminjaman');
        const filtered = this.getFilteredData(rawData);
        const data = filtered.filter(p => p.status && p.status.trim().toUpperCase() === 'DIPINJAM').sort((a,b) => new Date(b.created_at) - new Date(a.created_at));
        
        const tbody = document.querySelector('#table-active-peminjaman tbody');
        const countBadge = document.getElementById('active-peminjaman-count');
        
        tbody.innerHTML = '';
        countBadge.textContent = `${data.length} Aktif`;

        if(data.length === 0) {
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

    openPilihAlatModal: async function() {
        this.openModal('pilih-alat-modal');
        this.filterPilihAlat();
    },

    filterPilihAlat: async function() {
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

    addToCart: function(a) {
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

    renderCart: function() {
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

    updateCartQty: function(index, val) {
        const qty = parseInt(val);
        if (qty > 0 && qty <= this.state.cart[index].jumlah_tersedia) {
            this.state.cart[index].qty = qty;
        } else {
            this.showToast('Kuantitas tidak valid', 'warning');
            this.renderCart(); // reset view
        }
    },

    removeFromCart: function(index) {
        this.state.cart.splice(index, 1);
        this.renderCart();
    },

    savePeminjaman: async function(e) {
        if(e) e.preventDefault();
        if (this.state.cart.length === 0) return this.showToast('Pilih minimal 1 alat!', 'warning');
        
        const payload = {
            newId: 'PEM-' + Date.now(),
            nomor_peminjaman: 'TRX' + Date.now(),
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
            
            if (confirm('Peminjaman berhasil disimpan! Cetak struk sekarang?')) {
                this.cetakReceipt(payload);
            }
        }, 100);
        
        db.syncToServer();
    },

    cetakReceipt: async function(p) {
        const nama = p.nama_peminjam || 'Nama Peminjam';
        const kelas = p.kelas_unit || 'Kelas';
        const timestamp = this.formatDate(p.created_at);
        const petugas = p.petugas || this.state.user.full_name;
        
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
            if (items && items.length > 0) {
                items.forEach(item => {
                    cartHtml += `<tr><td>${item.nama || item.kode_seri || 'Alat'}</td><td style="text-align:right">${item.qty}</td></tr>`;
                });
            }
        } catch(e) {
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
                    <p style="font-size: 9px; margin-bottom: 5px;">Sistem Inventaris Alur</p>
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
                <div class="footer">
                    <p>Harap kembalikan alat tepat waktu.</p>
                    <p>Terima kasih.</p>
                </div>
            </body></html>
        `);
        printWindow.document.close();
        printWindow.focus();
        setTimeout(() => { 
            printWindow.print(); 
            printWindow.close(); 
        }, 500);
    },

    // --- Riwayat Peminjaman
    loadRiwayat: async function() {
        const rawData = this.getFilteredData(await db.getAll('peminjaman'));
        const data = rawData.sort((a,b) => new Date(b.created_at) - new Date(a.created_at));
        
        const tbody = document.querySelector('#table-riwayat tbody');
        tbody.innerHTML = '';
        if(data.length === 0) {
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
                <td>${statusBadge}</td>
            `;
            tbody.appendChild(tr);
        });
    },

    kembalikanAlat: async function(peminjamanId) {
        if(!confirm('Tandai alat ini sebagai sudah selesai dikembalikan?')) return;
        
        this.showLoading('Memproses...');
        const p = await db.stores.peminjaman.getItem(peminjamanId);
        if(!p) {
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
                const alat = await db.stores.alat.getItem(String(item.id || item.newId));
                if (alat) {
                    alat.jumlah_tersedia = Number(alat.jumlah_tersedia) + Number(item.qty);
                    await db.stores.alat.setItem(String(alat.id || alat.newId), alat);
                    await db.queueSyncTask('update_alat', 'alat', alat);
                }
            }
        } catch(e) {
            console.error("Gagal mengurai items peminjaman", e);
        }

        this.hideLoading();
        this.showToast('Peminjaman berhasil diselesaikan', 'success');
        this.loadRiwayat();
        
        db.syncToServer();
    },

    exportRiwayat: async function() {
        const data = this.getFilteredData(await db.getAll('peminjaman'));
        if (!data || data.length === 0) return this.showToast('Belum ada data riwayat', 'warning');
        
        let csv = 'No TRX,Peminjam,Kelas,No HP,Tgl Pinjam,Tgl Kembali Est,Tgl Kembali Aktual,Status\\n';
        data.forEach(p => {
            let escapedItems = (p.items||'').replace(/"/g, '""');
            csv += `"${p.nomor_peminjaman}","${p.nama_peminjam}","${p.kelas_unit}","${p.nomor_hp}","${p.tanggal_pinjam}","${p.tanggal_kembali_estimasi}","${p.tanggal_kembali_aktual||''}","${p.status}"\\n`;
        });
        
        const blob = new Blob([csv], { type: 'text/csv' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'Riwayat_Peminjaman.csv';
        a.click();
    },

    showPeminjamanDetail: async function(id) {
        const p = await db.stores.peminjaman.getItem(id);
        if(!p) return this.showToast('Data tidak ditemukan', 'error');

        const detailInfo = document.getElementById('detail-info');
        const detailItems = document.getElementById('detail-items');
        
        let statusColor = p.status === 'DIPINJAM' ? 'var(--warning)' : 'var(--success)';
        
        detailInfo.innerHTML = `
            <div class="detail-grid">
                <div><small>No TRX</small><p><b>${p.nomor_peminjaman}</b></p></div>
                <div><small>Status</small><p><span class="badge" style="background:${statusColor}">${p.status}</span></p></div>
                <div><small>Peminjam</small><p>${p.nama_peminjam}</p></div>
                <div><small>Kelas/Unit</small><p>${p.kelas_unit}</p></div>
                <div><small>No HP</small><p>${p.nomor_hp}</p></div>
                <div><small>Tgl Pinjam</small><p>${this.formatDate(p.created_at)}</p></div>
                <div><small>Estimasi Kembali</small><p>${this.formatDate(p.tanggal_kembali_estimasi)}</p></div>
                <div><small>Tgl Kembali Aktual</small><p>${this.formatDate(p.tanggal_kembali_aktual)}</p></div>
            </div>
            <div style="margin-top:1rem;"><small>Keterangan</small><p>${p.Keterangan || '-'}</p></div>
        `;

        let itemsHtml = '';
        try {
            const items = JSON.parse(p.items || '[]');
            items.forEach(item => {
                itemsHtml += `
                    <div style="display:flex; justify-content:space-between; padding:0.5rem 0; border-bottom:1px solid rgba(255,255,255,0.05)">
                        <span>${item.nama || item.kode_seri}</span>
                        <b>x${item.qty}</b>
                    </div>`;
            });
        } catch(e) { itemsHtml = '<p>Error parsing items</p>'; }
        
        detailItems.innerHTML = itemsHtml;
        this.openModal('detail-modal');
    },

    showToast: function(message, type = 'info') {
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
