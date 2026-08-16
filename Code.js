/**
 * Code.gs - Google Apps Script Backend for PinjamAlat Web App
 * Integrates with Google Sheets and Google Drive
 * Deploy as Web App: Execute as Me, Anyone can access
 */

const SPREADSHEET_ID = '1xjZqhlt6RxFUHtFbkNE_1nqyph1xbA78jtIYz98A6vw';
const IMAGE_FOLDER_ID = '1K5ycuoVqPbONG8nUAwU7CMSRnhR-cu8P';

// --- Batas Upload Gambar & Rate Limiting ---
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;       // 5 MB per gambar (setelah decode base64)
const MAX_UPLOADS_PER_USER_PER_HOUR = 20;      // batas wajar per akun
const MAX_UPLOADS_GLOBAL_PER_MINUTE = 30;      // jaring pengaman anti-flood (tidak ada info IP di Apps Script)

/**
 * Memperkirakan ukuran byte dari string base64 TANPA men-decode penuh.
 * Dipakai untuk menolak file yang terlalu besar sedini mungkin (hemat kuota eksekusi).
 */
function estimateBase64Bytes(base64Str) {
  if (!base64Str) return 0;
  var clean = base64Str.indexOf(',') > -1 ? base64Str.substring(base64Str.indexOf(',') + 1) : base64Str;
  var len = clean.length;
  var padding = 0;
  if (clean.slice(-2) === '==') padding = 2;
  else if (clean.slice(-1) === '=') padding = 1;
  return Math.floor((len * 3) / 4) - padding;
}

/**
 * Rate limiter sederhana berbasis CacheService.
 * key: identifier unik (mis. username atau 'global')
 * maxCount: jumlah maksimum permintaan dalam windowSeconds
 * Mengembalikan true jika MASIH dalam batas (boleh lanjut), false jika sudah melebihi.
 * Catatan: CacheService punya TTL maksimum 21600 detik (6 jam), cukup untuk window per-jam/menit di sini.
 */
function checkRateLimit(key, maxCount, windowSeconds) {
  var cache = CacheService.getScriptCache();
  var cacheKey = 'ratelimit_' + key + '_' + windowSeconds;
  var current = cache.get(cacheKey);
  var count = current ? parseInt(current, 10) : 0;
  if (count >= maxCount) return false;
  cache.put(cacheKey, String(count + 1), windowSeconds);
  return true;
}

/**
 * Validasi gabungan: ukuran file + rate limit, dipakai sebelum upload gambar apapun.
 * userKey: identitas pengguna jika tersedia (username/id), fallback ke 'anon'.
 * Melempar Error dengan pesan yang jelas jika ada batas yang dilanggar.
 */
function enforceImageUploadLimits(base64Data, userKey) {
  var size = estimateBase64Bytes(base64Data);
  if (size > MAX_IMAGE_BYTES) {
    throw new Error('Ukuran gambar melebihi batas maksimum ' + (MAX_IMAGE_BYTES / (1024 * 1024)) + ' MB.');
  }
  var uKey = userKey ? String(userKey).trim() : 'anon';
  if (!checkRateLimit('user_' + uKey, MAX_UPLOADS_PER_USER_PER_HOUR, 3600)) {
    throw new Error('Terlalu banyak upload gambar dari akun ini. Coba lagi dalam beberapa saat.');
  }
  if (!checkRateLimit('global', MAX_UPLOADS_GLOBAL_PER_MINUTE, 60)) {
    throw new Error('Server sedang menerima terlalu banyak upload gambar. Coba lagi sebentar lagi.');
  }
}

function doOptions(e) {
  return ContentService.createTextOutput("").setMimeType(ContentService.MimeType.TEXT);
}

function doGet(e) {
  var response = {};
  try {
    if (e.parameter.action === 'get_data') {
      var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
      response = {
        status: 'success',
        users: getSheetDataAsObjects(getSheetByNameFlexible(ss, 'users')),
        jurusan: getSheetDataAsObjects(getSheetByNameFlexible(ss, 'jurusan')),
        kategori: getSheetDataAsObjects(getSheetByNameFlexible(ss, 'kategori')),
        alat: getSheetDataAsObjects(getSheetByNameFlexible(ss, 'alat')),
        peminjaman: getSheetDataAsObjects(getSheetByNameFlexible(ss, 'peminjaman')),
        bahan: getSheetDataAsObjects(getSheetByNameFlexible(ss, 'bahan')),
        bahan_keluar: getSheetDataAsObjects(getSheetByNameFlexible(ss, 'bahan_keluar'))
      };
    } else response = { status: 'error', message: 'Invalid action' };
  } catch (error) {
    response = { status: 'error', message: error.toString() };
  }
  return setCORSResponse(response);
}

function doPost(e) {
  var response = { status: 'error', message: 'Unknown error' };
  try {
    var params = JSON.parse(e.postData.contents);
    var ss = SpreadsheetApp.openById(SPREADSHEET_ID);

    if (params.action === 'sync') {
      var results = [];
      for (var i = 0; i < params.queue.length; i++) {
        var task = params.queue[i];
        try {
          processSyncTask(ss, task);
          results.push({ id: task.id, status: 'ok' });
          Logger.log('Sync OK: ' + task.action + ' / ' + task.storeName + ' / id=' + task.id);
        } catch (taskError) {
          // KRITIS: jangan biarkan satu task yang error menghentikan pemrosesan task-task
          // berikutnya dalam antrean. Catat errornya lalu LANJUTKAN ke task selanjutnya.
          results.push({ id: task.id, status: 'error', message: taskError.toString() });
          Logger.log('Sync GAGAL: ' + task.action + ' / ' + task.storeName + ' / id=' + task.id + ' -> ' + taskError.toString());
        }
      }
      SpreadsheetApp.flush();
      response = { status: 'success', message: 'Sync completed', results: results };
    }
    else if (params.action === 'upload_image') {
      enforceImageUploadLimits(params.image, params.username || params.userId);
      var blob = Utilities.newBlob(Utilities.base64Decode(params.image.split(',')[1]), 'image/png', params.filename);
      var file = DriveApp.getFolderById(IMAGE_FOLDER_ID).createFile(blob);
      try { file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW); } catch (e) { }
      response = { status: 'success', url: file.getDownloadUrl().replace('&gd=true', '') || file.getUrl() };
    }
  } catch (error) {
    response = { status: 'error', message: error.toString() };
  }
  return setCORSResponse(response);
}

function getHeaderIndex(headers, candidateNames) {
  if (!headers || !headers.length) return -1;
  var map = {};
  for (var i = 0; i < headers.length; i++) map[String(headers[i]).trim().toLowerCase()] = i;
  for (var j = 0; j < candidateNames.length; j++) {
    var idx = map[String(candidateNames[j]).trim().toLowerCase()];
    if (idx !== undefined) return idx;
  }
  return -1;
}

/**
 * Peta sinonim nama kolom -> nama kanonik, agar pencocokan antara nama field di payload
 * (kirim dari frontend, mis. 'kategori_id', 'jumlah_total') dan nama kolom asli di Google Sheet
 * (mis. 'Kategori', 'Total Stok') tetap berhasil walau penulisannya berbeda.
 * Ini adalah cerminan dari peta sinonim yang sudah dipakai di db.js (normalizeKeys) di sisi frontend,
 * supaya kedua sisi "berbicara" dalam istilah yang sama.
 */
var FIELD_ALIAS_MAP = (function () {
  var groups = {
    id: ['id', 'newid', 'idbarang', 'kodebarang', 'id_barang', 'kode_barang', 'idalat', 'id_alat', 'kodealat', 'kode_alat', 'idpeminjaman', 'id_peminjaman', 'kodepeminjaman', 'kode_peminjaman', 'id_trx', 'idtrx', 'notrx', 'trx'],
    kategori_id: ['kategoriid', 'idkategori', 'kategori_id', 'id_kategori', 'kategori'],
    jurusan_id: ['jurusanid', 'idjurusan', 'kodejurusan', 'jurusan_id', 'id_jurusan', 'kode_jurusan', 'jurusan'],
    kode_seri: ['kodeseri', 'seri', 'kodeserial', 'kode_seri', 'kode_serial'],
    jumlah_total: ['jumlahtotal', 'totalstok', 'stoktotal', 'jumlah_total', 'total_stok', 'total'],
    jumlah_tersedia: ['jumlahtersedia', 'stoktersedia', 'stok', 'jumlah_tersedia', 'stok_tersedia', 'tersedia'],
    kondisi: ['kondisi'],
    keterangan: ['keterangan'],
    foto: ['foto', 'gambar', 'urlfoto', 'url_foto'],
    nama: ['nama', 'namabarang', 'namaalat', 'nama_barang', 'nama_alat'],
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
    petugas: ['petugas', 'operator', 'diinputoleh', 'diinput_oleh', 'oleh'],
    stok_minimal: ['stokminimal', 'minimal', 'stok_minimal'],
    satuan: ['satuan'],
    total_keluar: ['totalkeluar', 'jumlahkeluar', 'total_keluar', 'jumlah_keluar', 'jumlah', 'qty', 'keluar']
  };
  var alias = {};
  for (var canon in groups) {
    groups[canon].forEach(function (a) { alias[a] = canon; });
  }
  return alias;
})();

/**
 * Menormalkan sebuah nama field/kolom (dari payload ATAU dari header Sheet) menjadi bentuk kanonik,
 * supaya perbandingan antar keduanya tidak bergantung pada spasi/underscore/kapitalisasi
 * ataupun variasi penamaan (mis. 'Kategori' vs 'kategori_id' -> sama-sama 'kategori_id').
 */
function canonicalizeFieldName(s) {
  var c = String(s).trim().toLowerCase().replace(/[\s_-]/g, '');
  return FIELD_ALIAS_MAP[c] || c;
}

function getPayloadValue(payload, header) {
  if (payload === null || payload === undefined) return undefined;
  if (header === null || header === undefined) return undefined;

  var hStr = canonicalizeFieldName(header);
  for (var key in payload) {
    if (canonicalizeFieldName(key) === hStr) {
      var val = payload[key];
      // Jika string ISO tanggal, bersihkan menjadi format yyyy-mm-dd
      if (typeof val === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(val)) {
        val = val.split('T')[0];
      }
      return val;
    }
  }
  return undefined;
}

function processSyncTask(ss, task) {
  if (!task || typeof task !== 'object') {
    Logger.log('processSyncTask dipanggil tanpa argumen task yang valid. Untuk menguji, jalankan fungsi testSync().');
    return;
  }
  if (!ss) ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  
  var sheet = getSheetByNameFlexible(ss, task.storeName);
  if (!sheet) {
    throw new Error('Sheet untuk store "' + task.storeName + '" tidak ditemukan di Spreadsheet.');
  }

  var sheetName = sheet.getName();
  var payload = task.payload || {};

  // Handle image upload
  if (payload.foto && typeof payload.foto === 'string' && payload.foto.indexOf('data:image/') === 0) {
    try {
      // Validasi ukuran file + rate limit SEBELUM decode/upload ke Drive.
      // Identitas pengguna diambil dari payload jika tersedia (username/diinput_oleh/petugas/created_by).
      var userKey = payload.username || payload.diinput_oleh || payload.petugas || payload.created_by || payload.id;
      enforceImageUploadLimits(payload.foto, userKey);

      var blob = Utilities.newBlob(Utilities.base64Decode(payload.foto.split(',')[1]), 'image/png', (payload.id || 'foto_' + Date.now()) + '.png');
      var file = DriveApp.getFolderById(IMAGE_FOLDER_ID).createFile(blob);
      try { file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW); } catch (e) { }
      payload.foto = file.getId(); // HANYA SIMPAN ID UNTUK HEMAT KUOTA SEL
    } catch (e) {
      // Jangan simpan gambar gagal/ditolak sebagai string base64 raksasa ke Sheet.
      // Kosongkan foto dan catat pesan errornya secara ringkas.
      payload.foto = '';
      payload._foto_upload_error = e.toString();
    }
  }

  var headers = getHeaders(sheet);
  var action = task.action;

  if (action.startsWith('insert')) {
    var rowIdx = findRowIndex(sheet, headers, payload, sheetName);
    if (rowIdx > -1) {
      // Mencegah duplikasi: jika ID sudah ada (karena retry sync), lakukan update (Upsert)
      var data = sheet.getDataRange().getValues();
      var updateRow = headers.map(function (h) {
        var val = getPayloadValue(payload, h);
        return val !== undefined ? val : data[rowIdx][headers.indexOf(h)];
      });
      sheet.getRange(rowIdx + 1, 1, 1, headers.length).setValues([updateRow]);
    } else {
      sheet.appendRow(headers.map(function (h) {
        var val = getPayloadValue(payload, h);
        return val !== undefined ? val : '';
      }));
    }
  }
  else if (action.startsWith('update') || action.startsWith('delete')) {
    var rowIdx = findRowIndex(sheet, headers, payload, sheetName);
    if (rowIdx > -1) {
      var data = sheet.getDataRange().getValues();
      
      // Cleanup Orphaned File (Hapus file lama di Drive jika ada update foto / delete row)
      var fotoHeaders = FIELD_ALIAS_MAP ? (FIELD_ALIAS_MAP['foto'] || ['foto']) : ['foto', 'gambar', 'url_foto', 'urlfoto'];
      var oldFotoIdx = getHeaderIndex(headers, fotoHeaders);
      var oldFotoUrl = oldFotoIdx > -1 ? data[rowIdx][oldFotoIdx] : '';
      
      if (oldFotoUrl && (action.startsWith('delete') || (action.startsWith('update') && payload.foto && payload.foto !== oldFotoUrl))) {
        var oldIdMatch = String(oldFotoUrl).match(/[-\w]{25,}/); // Temukan ID (baik URL mentah maupun ID murni)
        if (oldIdMatch) {
          try {
            DriveApp.getFileById(oldIdMatch[0]).setTrashed(true);
          } catch(e) {
            // Abaikan jika file sudah tidak ada di Drive / permission error
          }
        }
      }

      if (action.startsWith('update')) {
        var updateRow = headers.map(function (h) {
          var val = getPayloadValue(payload, h);
          return val !== undefined ? val : data[rowIdx][headers.indexOf(h)];
        });
        sheet.getRange(rowIdx + 1, 1, 1, headers.length).setValues([updateRow]);
      } else {
        sheet.deleteRow(rowIdx + 1);
      }
    } else {
      throw new Error("Gagal Update/Delete: Data tidak ditemukan di Sheet (ID: " + (payload.id || payload.ID_Barang || payload.nomor_peminjaman || "unknown") + ")");
    }
  }
}

function findRowIndex(sheet, headers, payload, sheetName) {
  var normSheet = String(sheetName).toLowerCase().replace(/[\s_-]/g, '');
  var isLogSheet = normSheet === 'bahankeluar';

  var data = sheet.getDataRange().getValues();
  if (data.length <= 1) return -1;

  var idField = normSheet === 'peminjaman' ? 'newId' : (normSheet === 'bahan' || isLogSheet ? 'ID_Barang' : 'id');

  var candidates = [];
  var valIdField = getPayloadValue(payload, idField);
  if (valIdField !== undefined && valIdField !== '') candidates.push(String(valIdField).trim());
  var valId = getPayloadValue(payload, 'id');
  if (valId !== undefined && valId !== '') candidates.push(String(valId).trim());
  var valNewId = getPayloadValue(payload, 'newId');
  if (valNewId !== undefined && valNewId !== '') candidates.push(String(valNewId).trim());
  var valIDBarang = getPayloadValue(payload, 'ID_Barang');
  if (valIDBarang !== undefined && valIDBarang !== '') candidates.push(String(valIDBarang).trim());
  var valNomorPeminjaman = getPayloadValue(payload, 'nomor_peminjaman');
  if (valNomorPeminjaman !== undefined && valNomorPeminjaman !== '') candidates.push(String(valNomorPeminjaman).trim());
  
  // Fallbacks if sheet doesn't have an ID column (HANYA untuk master data Alat/Bahan/Kategori/Users/Jurusan, BUKAN untuk log transaksi/riwayat)
  if (!isLogSheet && normSheet !== 'peminjaman') {
    var valKodeSeri = getPayloadValue(payload, 'kode_seri');
    if (valKodeSeri !== undefined && valKodeSeri !== '') candidates.push(String(valKodeSeri).trim());
    var valNama = getPayloadValue(payload, 'nama');
    if (valNama !== undefined && valNama !== '') candidates.push(String(valNama).trim());
  }

  var idCanon = canonicalizeFieldName(idField);
  var idIdx = -1, nomorIdx = -1, kodeSeriIdx = -1, namaIdx = -1;
  for (var h = 0; h < headers.length; h++) {
    var hc = canonicalizeFieldName(headers[h]);
    if (idIdx === -1 && (hc === idCanon || hc === 'id')) idIdx = h;
    if (nomorIdx === -1 && hc === 'nomor_peminjaman') nomorIdx = h;
    if (kodeSeriIdx === -1 && hc === 'kode_seri') kodeSeriIdx = h;
    if (namaIdx === -1 && hc === 'nama') namaIdx = h;
  }

  for (var i = 1; i < data.length; i++) {
    var rowId = idIdx > -1 ? String(data[i][idIdx]).trim() : '';
    var rowNomor = nomorIdx > -1 ? String(data[i][nomorIdx]).trim() : '';
    var rowKode = kodeSeriIdx > -1 ? String(data[i][kodeSeriIdx]).trim() : '';
    var rowNama = namaIdx > -1 ? String(data[i][namaIdx]).trim() : '';

    var matched = candidates.some(function (c) {
      if (!c) return false;
      var cLow = c.toLowerCase();
      return (rowId && rowId.toLowerCase() === cLow) || 
             (!isLogSheet && normSheet !== 'peminjaman' && rowKode && rowKode.toLowerCase() === cLow) ||
             (!isLogSheet && normSheet !== 'peminjaman' && rowNama && rowNama.toLowerCase() === cLow) ||
             (rowNomor && rowNomor.toLowerCase() === cLow);
    });
    
    if (!matched && valNomorPeminjaman && rowNomor && rowNomor.toLowerCase() === String(valNomorPeminjaman).trim().toLowerCase()) {
      matched = true;
    }
    if (matched) return i;
  }
  return -1;
}

function getSheetByNameFlexible(ss, storeName) {
  var map = {
    'users': 'Users',
    'jurusan': 'Jurusan',
    'kategori': 'Kategori',
    'alat': 'Alat',
    'peminjaman': 'Peminjaman',
    'bahan': 'Bahan',
    'bahan_keluar': 'Bahan_Keluar'
  };
  var targetName = map[storeName] || storeName;
  var sheet = ss.getSheetByName(targetName);
  if (sheet) return sheet;

  var variations = [
    targetName,
    targetName.replace(/_/g, ' '),
    targetName.replace(/\s+/g, '_'),
    targetName.toLowerCase(),
    targetName.toUpperCase()
  ];
  for (var v = 0; v < variations.length; v++) {
    var s = ss.getSheetByName(variations[v]);
    if (s) return s;
  }

  var normTarget = String(targetName).toLowerCase().replace(/[\s_-]/g, '');
  var allSheets = ss.getSheets();
  for (var i = 0; i < allSheets.length; i++) {
    var sName = allSheets[i].getName();
    var normSName = String(sName).toLowerCase().replace(/[\s_-]/g, '');
    if (normSName === normTarget) {
      return allSheets[i];
    }
  }
  return null;
}

function getSheetDataAsObjects(sheet) {
  if (!sheet) return [];
  var data = sheet.getDataRange().getValues();
  if (data.length <= 1) return [];
  var headers = data[0];
  var result = [];
  for (var i = 1; i < data.length; i++) {
    var obj = {};
    for (var j = 0; j < headers.length; j++) obj[headers[j]] = data[i][j];
    result.push(obj);
  }
  return result;
}

function getHeaders(sheet) {
  return sheet.getLastColumn() === 0 ? [] : sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
}

function setCORSResponse(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

/**
 * FUNGSI DIAGNOSTIK — jalankan manual dari Apps Script Editor (pilih fungsi ini, klik Run),
 * lalu lihat hasilnya di menu Executions/Log (Lihat > Log / Ctrl+Enter).
 * Menampilkan header asli setiap sheet berdampingan dengan bentuk KANONIK-nya,
 * supaya mudah mengecek apakah nama kolom di Sheet Anda sudah dikenali sistem dengan benar.
 * Contoh: jika kolom kategori di sheet 'Alat' bernama "Kategori", cocok jika hasilnya
 * menunjukkan -> kanonik: "kategori_id" (bukan "kategori" polos).
 */
function debugFieldMapping() {
  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  var sheetNames = ['Alat', 'Kategori', 'Peminjaman', 'Users', 'Jurusan', 'Bahan', 'Bahan_Keluar'];
  sheetNames.forEach(function (name) {
    var sheet = ss.getSheetByName(name);
    if (!sheet) {
      Logger.log('Sheet "' + name + '" tidak ditemukan.');
      return;
    }
    var headers = getHeaders(sheet);
    Logger.log('--- Sheet: ' + name + ' ---');
    headers.forEach(function (h) {
      Logger.log('  "' + h + '"  ->  kanonik: "' + canonicalizeFieldName(h) + '"');
    });
  });
}