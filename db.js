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

    // Fetch data from Google Apps Script Backend
    fetchServerData: async function () {
        if (!navigator.onLine) return null;
        if (!this.GAS_URL || this.GAS_URL.includes('REPLACE')) {
            console.warn("GAS_URL not set. Running in local-only mode.");
            return null;
        }

        try {
            const resp = await fetch(this.GAS_URL + '?action=get_data');
            const data = await resp.json();
            if (data.status === 'success') {
                await this.saveMasterData('users', data.users);
                await this.saveMasterData('jurusan', data.jurusan);
                await this.saveMasterData('kategori', data.kategori);
                await this.saveMasterData('alat', data.alat);
                await this.saveMasterData('peminjaman', data.peminjaman);
                if(data.bahan) await this.saveMasterData('bahan', data.bahan);
                if(data.bahan_keluar) await this.saveMasterData('bahan_keluar', data.bahan_keluar);
                return true;
            }
            return false;
        } catch (e) {
            console.error('Fetch server data failed', e);
            return false;
        }
    },

    // Perform Sync to Server
    syncToServer: async function () {
        if (!navigator.onLine) return;
        if (!this.GAS_URL || this.GAS_URL.includes('REPLACE')) return;

        const queue = await this.getAll('syncQueue');
        if (queue.length === 0) return; // Nothing to sync

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
            
            // Tarik ulang data GET (karena GET selalu diizinkan) untuk memastikan data masuk
            const respGet = await fetch(this.GAS_URL + '?action=get_data');
            const resultData = await respGet.json();
            
            if (resultData && resultData.status === 'success') {
                // Dianggap sukses dan queue lokal boleh dikosongkan
                await this.stores.syncQueue.clear();
                
                await this.saveMasterData('users', resultData.users);
                await this.saveMasterData('jurusan', resultData.jurusan);
                await this.saveMasterData('kategori', resultData.kategori);
                await this.saveMasterData('alat', resultData.alat);
                await this.saveMasterData('peminjaman', resultData.peminjaman);
                if(resultData.bahan) await this.saveMasterData('bahan', resultData.bahan);
                if(resultData.bahan_keluar) await this.saveMasterData('bahan_keluar', resultData.bahan_keluar);
                console.log("Sync sukses!");
            }
        } catch (e) {
            console.error('Silently failed POST sync:', e);
        }
    }
};

// Initialize early
db.init();
