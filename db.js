/**
 * db.js - Database wrapper using localforage
 * Provides offline data caching and syncing for PinjamAlat
 */

const db = {
    stores: {
        users: localforage.createInstance({ name: 'PinjamAlat', storeName: 'users' }),
        jurusan: localforage.createInstance({ name: 'PinjamAlat', storeName: 'jurusan' }),
        kategori: localforage.createInstance({ name: 'PinjamAlat', storeName: 'kategori' }),
        alat: localforage.createInstance({ name: 'PinjamAlat', storeName: 'alat' }),
        peminjaman: localforage.createInstance({ name: 'PinjamAlat', storeName: 'peminjaman' }),
        bahan: localforage.createInstance({ name: 'PinjamAlat', storeName: 'bahan' }),
        bahan_keluar: localforage.createInstance({ name: 'PinjamAlat', storeName: 'bahan_keluar' }),
        syncQueue: localforage.createInstance({ name: 'PinjamAlat', storeName: 'syncQueue' }) // Stores offline actions
    },

    // Backend Web App URL (To be filled by user)
    GAS_URL: 'https://script.google.com/macros/s/AKfycbxW8qZzLOcnAMOql7FQxZQGqYFp5cks8V3VxGhy9HR760-zweNFHVZPMqrjqmpOD0D1/exec',
    SPREADSHEET_ID: '1xjZqhlt6RxFUHtFbkNE_1nqyph1xbA78jtIYz98A6vw',

    init: async function () {
        // Register Service Worker for PWA
        if ('serviceWorker' in navigator) {
            try {
                const reg = await navigator.serviceWorker.register('./sw.js?v=6');
                console.log('Service Worker Registered (v3)!', reg);
            } catch (err) {
                console.log('Service Worker registration failed: ', err);
            }
        }
    },

    getItemId: function (item) {
        if (!item) return null;
        const candidates = [
            item.id, item.newId, item.newid, item.NewId, item.ID_Barang, item.id_barang,
            item.kategori_id, item.kategoriid,
            item.nomor_peminjaman, item.Nomor_Peminjaman, item.ID, item.Id,
            item.kode_seri, item.Kode_Seri, item.nama, item.Nama
        ];
        for (const c of candidates) {
            if (c !== undefined && c !== null && String(c).trim() !== '') {
                return String(c).trim();
            }
        }
        return null;
    },

    // Save fetched data entirely
    saveMasterData: async function (storeName, dataArray) {
        await this.stores[storeName].clear();
        const seenIds = new Set();
        const promises = dataArray.map(item => {
            let id = this.getItemId(item);
            if (!id || seenIds.has(id)) {
                id = (id || 'GEN') + '_' + Math.random().toString(36).substr(2, 9);
            }
            seenIds.add(id);
            item.id = id; // Ensure the item object holds its unique identifier internally
            return this.stores[storeName].setItem(id, item);
        });
        return Promise.all(promises);
    },

    // Get all records from a specific store
    getAll: async function (storeName) {
        const items = [];
        await this.stores[storeName].iterate((value) => {
            items.push(value);
        });
        return items;
    },

    // Add task to Sync Queue
    queueSyncTask: async function (action, storeName, payload) {
        const taskId = 'task_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
        const task = { id: taskId, action, storeName, payload, timestamp: Date.now() };
        await this.stores.syncQueue.setItem(taskId, task);
        return task;
    },

    normalizeKeys: function (obj) {
        if (!obj) return obj;
        const normalizedObj = {};
        for (const key in obj) {
            const normKey = String(key).toLowerCase().replace(/[\s_-]/g, '');
            normalizedObj[normKey] = obj[key];
        }
        
        const result = { ...obj };
        
        const standardKeysMap = {
            id: ['id', 'newid', 'idbarang', 'kodebarang', 'id_barang', 'kode_barang', 'idkategori', 'kategoriid', 'kodekategori', 'kode_kategori', 'idpeminjaman', 'id_peminjaman', 'kodepeminjaman', 'kode_peminjaman', 'id_trx', 'idtrx'],
            newid: ['newid', 'id', 'new_id'],
            nama: ['nama', 'namabarang', 'namaalat', 'nama_barang', 'nama_alat', 'namakategori', 'nama_kategori'],
            kategori_id: ['kategoriid', 'idkategori', 'kategori_id', 'id_kategori', 'kategori', 'kodekategori', 'kode_kategori'],
            jurusan_id: ['jurusanid', 'idjurusan', 'kodejurusan', 'jurusan_id', 'id_jurusan', 'kode_jurusan', 'jurusan'],
            kode_seri: ['kodeseri', 'seri', 'kodeserial', 'kode_seri', 'kode_serial'],
            jumlah_total: ['jumlahtotal', 'totalstok', 'stoktotal', 'jumlah_total', 'total_stok', 'total'],
            jumlah_tersedia: ['jumlahtersedia', 'stoktersedia', 'stok', 'jumlah_tersedia', 'stok_tersedia', 'tersedia'],
            kondisi: ['kondisi'],
            keterangan: ['keterangan'],
            foto: ['foto', 'gambar', 'urlfoto', 'url_foto'],
            username: ['username', 'user'],
            password: ['password', 'pwd'],
            full_name: ['fullname', 'namalengkap', 'full_name', 'nama_lengkap'],
            role: ['role', 'peran', 'akses'],
            nomor_peminjaman: ['nomorpeminjaman', 'notrx', 'trx', 'nomor_peminjaman', 'no_trx'],
            nama_peminjam: ['namapeminjam', 'peminjam', 'nama_peminjam'],
            nomor_hp: ['nomorhp', 'hp', 'wa', 'nomor_hp', 'no_hp', 'whatsapp'],
            kelas_unit: ['kelasunit', 'kelas', 'unit', 'kelas_unit'],
            tanggal_pinjam: ['tanggalpinjam', 'tglpinjam', 'tanggal_pinjam', 'tgl_pinjam'],
            tanggal_kembali_estimasi: ['tanggalkembaliestimasi', 'estimasi', 'estimasi_kembali', 'tanggal_kembali_estimasi'],
            tanggal_kembali_aktual: ['tanggalkembaliaktual', 'kembaliaktual', 'tanggal_kembali_aktual', 'tgl_kembali_aktual'],
            created_at: ['createdat', 'created_at', 'tanggalpembuatan', 'tglpembuatan', 'tgl_pembuatan', 'tanggal_pembuatan'],
            status: ['status'],
            items: ['items', 'detail', 'daftaralat', 'daftar_alat'],
            petugas: ['petugas', 'operator'],
            id_barang: ['idbarang', 'id', 'kodebarang', 'id_barang', 'kode_barang'],
            nama_barang: ['namabarang', 'nama', 'nama_barang'],
            stok: ['stok', 'jumlah', 'sisa', 'stok_tersedia'],
            stok_minimal: ['stokminimal', 'minimal', 'stok_minimal'],
            satuan: ['satuan'],
            total_keluar: ['totalkeluar', 'jumlahkeluar', 'total_keluar', 'jumlah_keluar'],
            diinput_oleh: ['diinputoleh', 'petugas', 'diinput_oleh']
        };

        for (const stdKey in standardKeysMap) {
            const candidates = standardKeysMap[stdKey];
            for (let i = 0; i < candidates.length; i++) {
                const cand = candidates[i];
                const normCand = cand.replace(/[\s_-]/g, '').toLowerCase();
                if (normalizedObj[normCand] !== undefined) {
                    result[stdKey] = normalizedObj[normCand];
                    break;
                }
            }
        }
        return result;
    },

    // Fetch data directly from Google Sheets API for blazing fast reads
    fetchServerData: async function (saveToLocal = true) {
        if (!navigator.onLine) return null;
        if (!this.SPREADSHEET_ID) return null;

        try {
            const sheets = [
                { name: 'Users', store: 'users' },
                { name: 'Jurusan', store: 'jurusan' },
                { name: 'Kategori', store: 'kategori' },
                { name: 'Alat', store: 'alat' },
                { name: 'Peminjaman', store: 'peminjaman' },
                { name: 'Bahan', store: 'bahan' },
                { name: 'Bahan_Keluar', store: 'bahan_keluar' }
            ];

            const fetchSheet = async (sheetObj) => {
                const sheetNamesToTry = [sheetObj.name, sheetObj.name.replace(/_/g, ' '), sheetObj.name.replace(/\s+/g, '_')];
                const uniqueNames = [...new Set(sheetNamesToTry)];
                
                for (const sName of uniqueNames) {
                    try {
                        const url = `https://docs.google.com/spreadsheets/d/${this.SPREADSHEET_ID}/gviz/tq?tqx=out:json&sheet=${encodeURIComponent(sName)}&_=${Date.now()}`;
                        const resp = await fetch(url);
                        const text = await resp.text();
                        const jsonStr = text.substring(text.indexOf('{'), text.lastIndexOf('}') + 1);
                        const json = JSON.parse(jsonStr);
                        if (json && json.table && json.table.cols && json.table.rows && json.status !== 'error') {
                            const headers = json.table.cols.map(c => c.label);
                            const data = [];
                            for (let r = 0; r < json.table.rows.length; r++) {
                                const row = json.table.rows[r];
                                if (!row || !row.c) continue;
                                const obj = {};
                                let hasData = false;
                                for (let c = 0; c < headers.length; c++) {
                                    if (headers[c]) {
                                        let cell = row.c[c];
                                        let val = '';
                                        if (cell) {
                                            if (cell.v !== null && cell.v !== undefined) {
                                                if (typeof cell.v === 'string' && cell.v.startsWith('Date(')) {
                                                    const parts = cell.v.match(/Date\((\d+),(\d+),(\d+)(?:,(\d+),(\d+),(\d+))?\)/);
                                                    if (parts) {
                                                        const y = parseInt(parts[1]);
                                                        const m = parseInt(parts[2]);
                                                        const d = parseInt(parts[3]);
                                                        const pad = n => n.toString().padStart(2, '0');
                                                        val = `${y}-${pad(m+1)}-${pad(d)}`;
                                                    } else {
                                                        val = cell.f !== undefined ? cell.f : cell.v;
                                                    }
                                                } else {
                                                    val = cell.v;
                                                }
                                            } else if (cell.f !== undefined) {
                                                val = cell.f;
                                            }
                                        }
                                        obj[headers[c]] = val;
                                        if (val !== '') hasData = true;
                                    }
                                }
                                if (hasData) data.push(this.normalizeKeys(obj));
                            }
                            return { store: sheetObj.store, data: data };
                        }
                    } catch(e) {
                        // Coba variasi nama sheet berikutnya
                    }
                }
                return { store: sheetObj.store, data: [] };
            };

            const results = await Promise.all(sheets.map(fetchSheet));
            const serverDataObj = {};
            for (const res of results) {
                if (res.data.length > 0 || res.store === 'peminjaman' || res.store === 'alat') { 
                    if (saveToLocal) {
                        await this.saveMasterData(res.store, res.data);
                    }
                    serverDataObj[res.store] = res.data;
                }
            }
            if (saveToLocal) {
                await this.reapplyPendingQueue();
            }
            return serverDataObj;
        } catch (e) {
            console.error('Fetch server data failed', e);
            return null;
        }
    },

    // Memulihkan data antrean yang masih pending agar tidak hilang saat master data di-overwrite
    reapplyPendingQueue: async function () {
        try {
            const queue = await this.getAll('syncQueue');
            for (const task of queue) {
                const store = task.storeName;
                if (!this.stores[store] || !task.payload) continue;
                const payload = task.payload;
                const itemId = this.getItemId(payload) || payload.newId || payload.id || payload.ID_Barang;
                if (task.action && (task.action.startsWith('insert') || task.action.startsWith('update'))) {
                    if (itemId) {
                        await this.stores[store].setItem(String(itemId), payload);
                    }
                } else if (task.action && task.action.startsWith('delete')) {
                    if (itemId) {
                        await this.stores[store].removeItem(String(itemId));
                    }
                }
            }
        } catch(e) {
            console.error('reapplyPendingQueue failed', e);
        }
    },

    // Mengecek apakah SATU task tertentu sudah tercermin di data server.
    isTaskApplied: function (serverData, task) {
        const serverPeminjaman = serverData?.peminjaman || [];
        const serverAlat = serverData?.alat || [];
        const payload = task.payload || {};
        const action = task.action || '';
        const storeName = task.storeName || '';

        if (storeName === 'peminjaman') {
            const idCandidates = [payload.newId, payload.id, payload.ID_Barang, payload.nomor_peminjaman]
                .filter((value) => value !== undefined && value !== null && String(value).trim() !== '');

            const match = serverPeminjaman.find((item) => {
                const itemId = this.getItemId(item) || '';
                const itemNomor = String(item.nomor_peminjaman || item.Nomor_Peminjaman || '');
                return idCandidates.some((candidate) => {
                    const c = String(candidate).trim().toLowerCase();
                    return c === itemId.toLowerCase() || c === itemNomor.toLowerCase();
                });
            });

            if (action === 'delete_peminjaman') {
                return !match;
            }

            if (!match) return false;

            if (payload.status && String(match.status || '').toUpperCase() !== String(payload.status).toUpperCase()) {
                return false;
            }

            if (payload.tanggal_kembali_aktual && String(match.tanggal_kembali_aktual || '') !== String(payload.tanggal_kembali_aktual)) {
                return false;
            }

            return true;
        }

        if (storeName === 'alat') {
            const idCandidates = [payload.newId, payload.id, payload.ID_Barang]
                .filter((value) => value !== undefined && value !== null && String(value).trim() !== '');

            const match = serverAlat.find((item) => {
                const itemId = this.getItemId(item) || '';
                return idCandidates.some((candidate) => String(candidate).toLowerCase() === itemId.toLowerCase());
            });

            // Untuk aksi DELETE: task dianggap BERHASIL jika data SUDAH TIDAK ADA di server
            if (action === 'delete_alat') {
                return !match;
            }

            if (!match) return false;

            if (payload.jumlah_tersedia !== undefined && Number(match.jumlah_tersedia) !== Number(payload.jumlah_tersedia)) {
                return false;
            }

            return true;
        }

        return true;
    },

    // Kept for backward compatibility: true hanya jika SEMUA task di antrean sudah applied.
    queueHasBeenApplied: function (serverData, queue) {
        return queue.every((task) => this.isTaskApplied(serverData, task));
    },

    // Mengembalikan daftar task.id yang SUDAH terbukti tersimpan di server,
    // supaya task yang berhasil bisa dibersihkan dari antrean satu-satu tanpa
    // ikut menahan task lain yang belum/gagal.
    getAppliedTaskIds: function (serverData, queue) {
        return queue.filter((task) => this.isTaskApplied(serverData, task)).map((task) => task.id);
    },

    // Perform Sync to Server
    syncToServer: async function () {
        if (!navigator.onLine) return false;
        if (!this.GAS_URL || this.GAS_URL.includes('REPLACE')) return false;

        const queue = await this.getAll('syncQueue');
        if (queue.length === 0) return true; // Nothing to sync

        if (this._isSyncing) return false;
        this._isSyncing = true;

        const MAX_RETRY = 10; // setelah gagal terverifikasi sebanyak ini, task dibuang agar tidak menyumbat antrean selamanya

        try {
            console.log("Mencoba sync", queue.length, "data ke gsheet...");

            // Kirim secara "blind" menggunakan mode no-cors untuk mengelabui proteksi browser
            await fetch(this.GAS_URL, {
                method: 'POST',
                mode: 'no-cors',
                body: JSON.stringify({ action: 'sync', queue: queue }),
                headers: { 'Content-Type': 'text/plain;charset=utf-8' }
            });

            // Beri jeda 2.5 detik agar Google Apps Script sempat menyimpan ke baris spreadsheet
            await new Promise(r => setTimeout(r, 2500));

            // Tarik ulang data menggunakan gviz yang super cepat (tanpa menyimpan ke local dulu)
            const resultData = await this.fetchServerData(false);

            if (resultData) {
                const appliedIds = new Set(this.getAppliedTaskIds(resultData, queue));
                const stillPending = queue.filter((task) => !appliedIds.has(task.id));

                // PENTING: hapus HANYA task yang terbukti berhasil. Task yang belum/gagal
                // tetap di antrean untuk dicoba lagi di sync berikutnya, TANPA ikut menahan
                // task-task lain yang sudah berhasil (beda dari perilaku lama yang all-or-nothing).
                for (const task of queue) {
                    if (appliedIds.has(task.id)) {
                        await this.stores.syncQueue.removeItem(task.id);
                    }
                }

                // Simpan data final yang terkonfirmasi ke database lokal
                for (const store of Object.keys(resultData)) {
                    await this.saveMasterData(store, resultData[store]);
                }
                await this.reapplyPendingQueue();

                if (stillPending.length === 0) {
                    console.log("Sync sukses!");
                    if (typeof this.onSyncSuccess === 'function') {
                        try {
                            this.onSyncSuccess();
                        } catch (e) { console.error('onSyncSuccess callback error', e); }
                    }
                    this._isSyncing = false;
                    return true;
                }

                // Sebagian berhasil, sebagian belum. Naikkan hitungan percobaan tiap task
                // yang masih pending; buang task yang sudah gagal terlalu sering supaya
                // tidak menyumbat antrean untuk perubahan-perubahan baru selanjutnya.
                let droppedCount = 0;
                for (const task of stillPending) {
                    task.retryCount = (task.retryCount || 0) + 1;
                    if (task.retryCount > MAX_RETRY) {
                        console.warn('Task gagal disinkronkan setelah beberapa percobaan, dibuang dari antrean:', task);
                        await this.stores.syncQueue.removeItem(task.id);
                        droppedCount++;
                        if (typeof this.onSyncTaskDropped === 'function') {
                            try { this.onSyncTaskDropped(task); } catch (e) { console.error('onSyncTaskDropped callback error', e); }
                        }
                    } else {
                        await this.stores.syncQueue.setItem(task.id, task);
                    }
                }

                console.warn(`Sinkronisasi sebagian: ${queue.length - stillPending.length}/${queue.length} berhasil, ${stillPending.length - droppedCount} masih ditunda, ${droppedCount} dibuang karena gagal berulang.`);

                if (typeof this.onSyncPartial === 'function') {
                    try { this.onSyncPartial({ total: queue.length, applied: queue.length - stillPending.length, pending: stillPending.length - droppedCount, dropped: droppedCount }); } catch (e) { console.error('onSyncPartial callback error', e); }
                }

                this._isSyncing = false;
                return false;
            }

            this._isSyncing = false;
            return false;
        } catch (e) {
            console.error('Silently failed POST sync:', e);
            this._isSyncing = false;
            return false;
        }
    }
};


// Initialize early
db.init();