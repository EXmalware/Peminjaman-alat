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

    // Save fetched data entirely
    saveMasterData: async function (storeName, dataArray) {
        await this.stores[storeName].clear();
        const promises = dataArray.map(item => this.stores[storeName].setItem(String(item.id || item.newId || item.ID_Barang), item));
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
                const url = `https://docs.google.com/spreadsheets/d/${this.SPREADSHEET_ID}/gviz/tq?tqx=out:json&sheet=${sheetObj.name}`;
                const resp = await fetch(url);
                const text = await resp.text();
                // Ekstrak JSON dari respons JSONP ala Google
                const jsonStr = text.substring(text.indexOf('{'), text.lastIndexOf('}') + 1);
                
                try {
                    const json = JSON.parse(jsonStr);
                    const data = [];
                    if (json && json.table && json.table.cols && json.table.rows) {
                        const headers = json.table.cols.map(c => c.label);
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
                                                    const m = parseInt(parts[2]); // bulan di gviz dimulai dari 0
                                                    const d = parseInt(parts[3]);
                                                    const hr = parts[4] ? parseInt(parts[4]) : 0;
                                                    const min = parts[5] ? parseInt(parts[5]) : 0;
                                                    const sec = parts[6] ? parseInt(parts[6]) : 0;
                                                    const pad = n => n.toString().padStart(2, '0');
                                                    val = `${y}-${pad(m+1)}-${pad(d)}T${pad(hr)}:${pad(min)}:${pad(sec)}.000Z`;
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
                            if (hasData) data.push(obj);
                        }
                    }
                    return { store: sheetObj.store, data: data };
                } catch(e) {
                    return { store: sheetObj.store, data: [] }; // abaikan jika sheet kosong/error
                }
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
            return serverDataObj;
        } catch (e) {
            console.error('Fetch server data failed', e);
            return null;
        }
    },

    queueHasBeenApplied: function (serverData, queue) {
        const serverPeminjaman = serverData?.peminjaman || [];
        const serverAlat = serverData?.alat || [];

        return queue.every((task) => {
            const payload = task.payload || {};
            const action = task.action || '';
            const storeName = task.storeName || '';

            if (storeName === 'peminjaman') {
                const idCandidates = [payload.newId, payload.id, payload.ID_Barang, payload.nomor_peminjaman]
                    .filter((value) => value !== undefined && value !== null && String(value).trim() !== '');

                const match = serverPeminjaman.find((item) => {
                    const itemId = String(item.newId || item.id || item.ID_Barang || '');
                    const itemNomor = String(item.nomor_peminjaman || '');
                    return idCandidates.some((candidate) => String(candidate) === itemId || String(candidate) === itemNomor);
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
                    const itemId = String(item.newId || item.id || item.ID_Barang || '');
                    return idCandidates.some((candidate) => String(candidate) === itemId);
                });

                if (!match) return false;

                if (payload.jumlah_tersedia !== undefined && Number(match.jumlah_tersedia) !== Number(payload.jumlah_tersedia)) {
                    return false;
                }

                return true;
            }

            return true;
        });
    },

    // Perform Sync to Server
    syncToServer: async function () {
        if (!navigator.onLine) return false;
        if (!this.GAS_URL || this.GAS_URL.includes('REPLACE')) return false;

        const queue = await this.getAll('syncQueue');
        if (queue.length === 0) return true; // Nothing to sync

        if (this._isSyncing) return false;
        this._isSyncing = true;
        
        try {
            console.log("Mencoba sync", queue.length, "data ke gsheet...");

            // Kirim secara "blind" menggunakan mode no-cors untuk mengelabui proteksi browser
            await fetch(this.GAS_URL, {
                method: 'POST',
                mode: 'no-cors',
                body: JSON.stringify({ action: 'sync', queue: queue }),
                headers: { 'Content-Type': 'text/plain;charset=utf-8' }
            });

            // Beri jeda 2 detik agar Google Apps Script sempat menyimpan ke baris spreadsheet
            await new Promise(r => setTimeout(r, 2000));

            // Tarik ulang data menggunakan gviz yang super cepat (tanpa menyimpan ke local dulu)
            const resultData = await this.fetchServerData(false);

            if (resultData) {
                const applied = this.queueHasBeenApplied(resultData, queue);
                if (!applied) {
                    console.warn('Sinkronisasi belum terlihat di server, queue dipertahankan.');
                    this._isSyncing = false;
                    return false;
                }

                await this.stores.syncQueue.clear();
                
                // Simpan data final yang terkonfirmasi ke database lokal
                for (const store of Object.keys(resultData)) {
                    await this.saveMasterData(store, resultData[store]);
                }
                
                console.log("Sync sukses!");
                this._isSyncing = false;
                return true;
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
