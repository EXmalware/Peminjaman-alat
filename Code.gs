// Google Apps Script untuk PinjamAlat
// Deploy sebagai Web App dengan Execute as: me, Who has access: Anyone

const SPREADSHEET_ID = "1xjZqhlt6RxFUHtFbkNE_1nqyph1xbA78jtIYz98A6vw";
const DRIVE_FOLDER_ID = "1K5ycuoVqPbONG8nUAwU7CMSRnhR-cu8P";

function doGet(e) {
  return handleRequest(e);
}

function doPost(e) {
  return handleRequest(e);
}

function handleRequest(e) {
  try {
    // Set CORS headers untuk mengizinkan akses dari semua domain
    const origin = e.parameter.origin || '*';
    
    let action, data;
    
    if (e.postData) {
      const postData = JSON.parse(e.postData.contents);
      action = postData.action;
      data = postData.data || {};
    } else {
      action = e.parameter.action;
      data = e.parameter;
    }
    
    console.log('Action:', action, 'Data:', data);
    
    let result;
    
    switch(action) {
      case 'login':
        result = loginUser(data);
        break;
      case 'getAlat':
        result = getAllAlat(data);
        break;
      case 'getPeminjaman':
        result = getAllPeminjaman(data);
        break;
      case 'getKategori':
        result = getAllKategori(data);
        break;
      case 'getJurusan':
        result = getAllJurusan();
        break;
      case 'getUsers':
        result = getAllUsers();
        break;
      case 'getSettings':
        result = getSettings();
        break;
      case 'saveAlat':
        result = saveAlat(data);
        break;
      case 'savePeminjaman':
        result = savePeminjaman(data);
        break;
      case 'saveKategori':
        result = saveKategori(data);
        break;
      case 'saveJurusan':
        result = saveJurusan(data);
        break;
      case 'saveUser':
        result = saveUser(data);
        break;
      case 'saveSettings':
        result = saveSettings(data);
        break;
      case 'updateAlat':
        result = updateAlat(data);
        break;
      case 'updatePeminjaman':
        result = updatePeminjaman(data);
        break;
      case 'deleteAlat':
        result = deleteAlat(data);
        break;
      case 'deleteKategori':
        result = deleteKategori(data);
        break;
      case 'deleteJurusan':
        result = deleteJurusan(data);
        break;
      case 'deleteUser':
        result = deleteUser(data);
        break;
      case 'uploadFoto':
        result = uploadFotoToDrive(data);
        break;
      case 'processPengembalian':
        result = processPengembalian(data);
        break;
      case 'getDashboardStats':
        result = getDashboardStats(data);
        break;
      default:
        result = { success: false, message: 'Action not found' };
    }
    
    // Return response (CORS handled by deployment settings)
    return ContentService
      .createTextOutput(JSON.stringify(result))
      .setMimeType(ContentService.MimeType.JSON);
      
  } catch(error) {
    console.error('Error:', error);
    return ContentService
      .createTextOutput(JSON.stringify({
        success: false,
        message: error.toString()
      }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

// Fungsi OPTIONS untuk handle preflight request
function doOptions(e) {
  return ContentService
    .createTextOutput('{"status":"ok"}')
    .setMimeType(ContentService.MimeType.JSON);
}


// ================== FUNGSI UTAMA ==================

function loginUser(data) {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const usersSheet = ss.getSheetByName('Users');
  const lastRow = usersSheet.getLastRow();
  const lastCol = usersSheet.getLastColumn();
  
  if (lastRow < 2) return { success: false, message: 'Tidak ada data user' };
  
  const usersData = usersSheet.getRange(2, 1, lastRow-1, lastCol).getValues();
  
  const username = data.username;
  const password = data.password;
  
  for(let i = 0; i < usersData.length; i++) {
    const user = usersData[i];
    if(user[1] === username && user[2] === password) {
      return {
        success: true,
        data: {
          id: user[0],
          username: user[1],
          password: user[2],
          full_name: user[3],
          role: user[4],
          jurusan_id: user[5]
        }
      };
    }
  }
  
  return { success: false, message: 'Username atau password salah' };
}

function getAllAlat(data) {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const alatSheet = ss.getSheetByName('Alat');
  const lastRow = alatSheet.getLastRow();
  const lastCol = alatSheet.getLastColumn();
  
  if(lastRow < 2) return { success: true, data: [] };
  
  const alatData = alatSheet.getRange(2, 1, lastRow-1, lastCol).getValues();
  const jurusan = getAllJurusan().data;
  const kategori = getAllKategori({}).data;
  
  const alat = alatData.map(row => {
    // Filter berdasarkan jurusan jika user bukan superuser
    if(data.userRole && data.userRole !== 'superuser' && data.jurusanId && row[9] != data.jurusanId) {
      return null;
    }
    
    const jurusanData = jurusan.find(j => j.id == row[9]);
    const kategoriData = kategori.find(k => k.id == row[3]);
    
    return {
      id: row[0],
      kode_seri: row[1],
      nama: row[2],
      kategori_id: row[3],
      jumlah_total: row[4],
      jumlah_tersedia: row[5],
      kondisi: row[6],
      tanggal_masuk: row[7] ? new Date(row[7]).toISOString().split('T')[0] : null,
      keterangan: row[8],
      jurusan_id: row[9],
      foto: row[10],
      jurusan_nama: jurusanData ? jurusanData.nama : '',
      kategori_nama: kategoriData ? kategoriData.nama : ''
    };
  }).filter(item => item !== null);
  
  return { success: true, data: alat };
}

function getAllPeminjaman(data) {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const peminjamanSheet = ss.getSheetByName('Peminjaman');
  const lastRow = peminjamanSheet.getLastRow();
  const lastCol = peminjamanSheet.getLastColumn();
  
  if(lastRow < 2) return { success: true, data: [] };
  
  const peminjamanData = peminjamanSheet.getRange(2, 1, lastRow-1, lastCol).getValues();
  
  const peminjaman = peminjamanData.map(row => {
    // Filter berdasarkan jurusan jika user bukan superuser
    if(data.userRole && data.userRole !== 'superuser' && data.jurusanId && row[10] != data.jurusanId) {
      return null;
    }
    
    // Parse items JSON
    let items = [];
    try {
      items = JSON.parse(row[9] || '[]');
    } catch(e) {
      console.error('Error parsing items:', e);
    }
    
    return {
      id: row[0],
      nomor_peminjaman: row[1],
      nama_peminjam: row[2],
      nomor_hp: row[3] || '',
      kelas_unit: row[4],
      tanggal_pinjam: row[5] ? new Date(row[5]).toISOString().split('T')[0] : null,
      tanggal_kembali_estimasi: row[6] ? new Date(row[6]).toISOString().split('T')[0] : null,
      tanggal_kembali_aktual: row[7] ? new Date(row[7]).toISOString().split('T')[0] : null,
      status: row[8] || 'Dipinjam',
      items: items,
      jurusan_id: row[10],
      created_by: row[11],
      created_at: row[12] ? new Date(row[12]).toISOString() : null
    };
  }).filter(item => item !== null);
  
  return { success: true, data: peminjaman };
}

function getAllKategori(data) {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const kategoriSheet = ss.getSheetByName('Kategori');
  const lastRow = kategoriSheet.getLastRow();
  const lastCol = kategoriSheet.getLastColumn();
  
  if(lastRow < 2) return { success: true, data: [] };
  
  const kategoriData = kategoriSheet.getRange(2, 1, lastRow-1, lastCol).getValues();
  
  const kategori = kategoriData.map(row => {
    // Filter berdasarkan jurusan jika user bukan superuser
    if(data.userRole && data.userRole !== 'superuser' && data.jurusanId && row[2] != data.jurusanId) {
      return null;
    }
    
    return {
      id: row[0],
      nama: row[1],
      jurusan_id: row[2],
      created_at: row[3] ? new Date(row[3]).toISOString() : null
    };
  }).filter(item => item !== null);
  
  return { success: true, data: kategori };
}

function getAllJurusan() {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const jurusanSheet = ss.getSheetByName('Jurusan');
  const lastRow = jurusanSheet.getLastRow();
  const lastCol = jurusanSheet.getLastColumn();
  
  if(lastRow < 2) return { success: true, data: [] };
  
  const jurusanData = jurusanSheet.getRange(2, 1, lastRow-1, lastCol).getValues();
  
  const jurusan = jurusanData.map(row => ({
    id: row[0],
    nama: row[1],
    kode: row[2],
    created_at: row[3] ? new Date(row[3]).toISOString() : null
  }));
  
  return { success: true, data: jurusan };
}

function getAllUsers() {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const usersSheet = ss.getSheetByName('Users');
  const lastRow = usersSheet.getLastRow();
  const lastCol = usersSheet.getLastColumn();
  
  if(lastRow < 2) return { success: true, data: [] };
  
  const usersData = usersSheet.getRange(2, 1, lastRow-1, lastCol).getValues();
  
  const users = usersData.map(row => ({
    id: row[0],
    username: row[1],
    password: row[2],
    full_name: row[3],
    role: row[4],
    jurusan_id: row[5]
  }));
  
  return { success: true, data: users };
}

function getSettings() {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const settingsSheet = ss.getSheetByName('Settings');
  const lastRow = settingsSheet.getLastRow();
  
  if(lastRow < 2) return { 
    success: true, 
    data: {
      schoolName: "SMK Teknologi Indonesia",
      appName: "PinjamAlat",
      logo: ""
    } 
  };
  
  const settingsData = settingsSheet.getRange(2, 1, lastRow-1, 2).getValues();
  
  const settings = {};
  settingsData.forEach(row => {
    settings[row[0]] = row[1];
  });
  
  return { success: true, data: settings };
}

function saveAlat(data) {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const alatSheet = ss.getSheetByName('Alat');
  const lastRow = alatSheet.getLastRow();
  
  // Generate ID
  const newId = lastRow === 1 ? 1 : alatSheet.getRange(lastRow, 1).getValue() + 1;
  
  const newRow = [
    newId,
    data.kode_seri,
    data.nama,
    data.kategori_id,
    data.jumlah_total,
    data.jumlah_tersedia,
    data.kondisi,
    new Date(),
    data.keterangan || '',
    data.jurusan_id,
    data.foto || ''
  ];
  
  alatSheet.appendRow(newRow);
  
  return { 
    success: true, 
    message: 'Alat berhasil disimpan',
    data: { id: newId }
  };
}

function savePeminjaman(data) {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const peminjamanSheet = ss.getSheetByName('Peminjaman');
  const lastRow = peminjamanSheet.getLastRow();
  
  // Generate ID
  const newId = lastRow === 1 ? 1 : peminjamanSheet.getRange(lastRow, 1).getValue() + 1;
  
  // Format items
  const items = data.items || [];
  const itemsJSON = JSON.stringify(items);
  
  const newRow = [
    newId,
    data.nomor_peminjaman,
    data.nama_peminjam,
    data.nomor_hp || '',
    data.kelas_unit,
    new Date(data.tanggal_pinjam),
    new Date(data.tanggal_kembali_estimasi),
    null, // tanggal_kembali_aktual
    'Dipinjam',
    itemsJSON,
    data.jurusan_id,
    data.created_by,
    new Date()
  ];
  
  peminjamanSheet.appendRow(newRow);
  
  // Update ketersediaan alat
  updateStokAlat(items, 'decrease');
  
  return { 
    success: true, 
    message: 'Peminjaman berhasil disimpan',
    data: { id: newId }
  };
}

function updateStokAlat(items, action) {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const alatSheet = ss.getSheetByName('Alat');
  const lastRow = alatSheet.getLastRow();
  
  if(lastRow < 2) return;
  
  const alatData = alatSheet.getRange(2, 1, lastRow-1, 11).getValues();
  
  items.forEach(item => {
    for(let i = 0; i < alatData.length; i++) {
      const row = alatData[i];
      if(row[0] == item.id) {
        const currentStock = row[5]; // kolom jumlah_tersedia
        let newStock;
        
        if (action === 'decrease') {
          newStock = currentStock - item.jumlah;
        } else if (action === 'increase') {
          newStock = currentStock + item.jumlah;
        } else {
          newStock = currentStock;
        }
        
        // Update di spreadsheet
        alatSheet.getRange(i + 2, 6).setValue(newStock);
        break;
      }
    }
  });
}

function updateAlat(data) {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const alatSheet = ss.getSheetByName('Alat');
  const lastRow = alatSheet.getLastRow();
  
  if(lastRow < 2) return { success: false, message: 'Tidak ada data alat' };
  
  const alatData = alatSheet.getRange(2, 1, lastRow-1, 11).getValues();
  let found = false;
  
  for(let i = 0; i < alatData.length; i++) {
    const row = alatData[i];
    if(row[0] == data.id) {
      // Update row
      alatSheet.getRange(i + 2, 2).setValue(data.kode_seri); // kolom B
      alatSheet.getRange(i + 2, 3).setValue(data.nama); // kolom C
      alatSheet.getRange(i + 2, 4).setValue(data.kategori_id); // kolom D
      alatSheet.getRange(i + 2, 5).setValue(data.jumlah_total); // kolom E
      alatSheet.getRange(i + 2, 6).setValue(data.jumlah_tersedia); // kolom F
      alatSheet.getRange(i + 2, 7).setValue(data.kondisi); // kolom G
      alatSheet.getRange(i + 2, 9).setValue(data.keterangan || ''); // kolom I
      alatSheet.getRange(i + 2, 10).setValue(data.jurusan_id); // kolom J
      
      if(data.foto) {
        alatSheet.getRange(i + 2, 11).setValue(data.foto); // kolom K
      }
      
      found = true;
      break;
    }
  }
  
  if(!found) {
    return { success: false, message: 'Alat tidak ditemukan' };
  }
  
  return { 
    success: true, 
    message: 'Alat berhasil diperbarui'
  };
}

function updatePeminjaman(data) {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const peminjamanSheet = ss.getSheetByName('Peminjaman');
  const lastRow = peminjamanSheet.getLastRow();
  
  if(lastRow < 2) return { success: false, message: 'Tidak ada data peminjaman' };
  
  const peminjamanData = peminjamanSheet.getRange(2, 1, lastRow-1, 13).getValues();
  let found = false;
  
  for(let i = 0; i < peminjamanData.length; i++) {
    const row = peminjamanData[i];
    if(row[0] == data.id) {
      // Update row
      if(data.status) {
        peminjamanSheet.getRange(i + 2, 9).setValue(data.status); // kolom I (status)
      }
      
      if(data.tanggal_kembali_aktual) {
        peminjamanSheet.getRange(i + 2, 8).setValue(new Date(data.tanggal_kembali_aktual)); // kolom H
      }
      
      if(data.items) {
        peminjamanSheet.getRange(i + 2, 10).setValue(JSON.stringify(data.items)); // kolom J
      }
      
      found = true;
      break;
    }
  }
  
  if(!found) {
    return { success: false, message: 'Peminjaman tidak ditemukan' };
  }
  
  return { 
    success: true, 
    message: 'Peminjaman berhasil diperbarui'
  };
}

function deleteAlat(data) {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const alatSheet = ss.getSheetByName('Alat');
  const lastRow = alatSheet.getLastRow();
  
  if(lastRow < 2) return { success: false, message: 'Tidak ada data alat' };
  
  const alatData = alatSheet.getRange(2, 1, lastRow-1, 11).getValues();
  let foundRow = -1;
  
  for(let i = 0; i < alatData.length; i++) {
    const row = alatData[i];
    if(row[0] == data.id) {
      // Cek apakah alat masih dipinjam
      if(row[5] < row[4]) { // jumlah_tersedia < jumlah_total
        return { 
          success: false, 
          message: 'Alat tidak dapat dihapus karena masih ada yang dipinjam' 
        };
      }
      foundRow = i + 2; // +2 karena header row + 1-based index
      break;
    }
  }
  
  if(foundRow === -1) {
    return { success: false, message: 'Alat tidak ditemukan' };
  }
  
  // Delete row
  alatSheet.deleteRow(foundRow);
  
  return { 
    success: true, 
    message: 'Alat berhasil dihapus'
  };
}

function saveKategori(data) {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const kategoriSheet = ss.getSheetByName('Kategori');
  const lastRow = kategoriSheet.getLastRow();
  
  // Generate ID
  const newId = lastRow === 1 ? 1 : kategoriSheet.getRange(lastRow, 1).getValue() + 1;
  
  const newRow = [
    newId,
    data.nama,
    data.jurusan_id,
    new Date()
  ];
  
  kategoriSheet.appendRow(newRow);
  
  return { 
    success: true, 
    message: 'Kategori berhasil disimpan',
    data: { id: newId }
  };
}

function saveJurusan(data) {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const jurusanSheet = ss.getSheetByName('Jurusan');
  const lastRow = jurusanSheet.getLastRow();
  
  // Generate ID
  const newId = lastRow === 1 ? 1 : jurusanSheet.getRange(lastRow, 1).getValue() + 1;
  
  const newRow = [
    newId,
    data.nama,
    data.kode,
    new Date()
  ];
  
  jurusanSheet.appendRow(newRow);
  
  return { 
    success: true, 
    message: 'Jurusan berhasil disimpan',
    data: { id: newId }
  };
}

function saveUser(data) {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const usersSheet = ss.getSheetByName('Users');
  const lastRow = usersSheet.getLastRow();
  
  // Generate ID
  const newId = lastRow === 1 ? 1 : usersSheet.getRange(lastRow, 1).getValue() + 1;
  
  const newRow = [
    newId,
    data.username,
    data.password,
    data.full_name,
    data.role,
    data.jurusan_id || ''
  ];
  
  usersSheet.appendRow(newRow);
  
  return { 
    success: true, 
    message: 'User berhasil disimpan',
    data: { id: newId }
  };
}

function saveSettings(data) {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const settingsSheet = ss.getSheetByName('Settings');
  
  // Clear existing settings
  const lastRow = settingsSheet.getLastRow();
  if(lastRow > 1) {
    settingsSheet.getRange(2, 1, lastRow-1, 2).clearContent();
  }
  
  // Save new settings
  Object.keys(data).forEach((key, index) => {
    settingsSheet.getRange(index + 2, 1).setValue(key);
    settingsSheet.getRange(index + 2, 2).setValue(data[key]);
  });
  
  return { 
    success: true, 
    message: 'Settings berhasil disimpan'
  };
}

function deleteKategori(data) {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const kategoriSheet = ss.getSheetByName('Kategori');
  const lastRow = kategoriSheet.getLastRow();
  
  if(lastRow < 2) return { success: false, message: 'Tidak ada data kategori' };
  
  const kategoriData = kategoriSheet.getRange(2, 1, lastRow-1, 4).getValues();
  let foundRow = -1;
  
  for(let i = 0; i < kategoriData.length; i++) {
    const row = kategoriData[i];
    if(row[0] == data.id) {
      foundRow = i + 2;
      break;
    }
  }
  
  if(foundRow === -1) {
    return { success: false, message: 'Kategori tidak ditemukan' };
  }
  
  // Delete row
  kategoriSheet.deleteRow(foundRow);
  
  return { 
    success: true, 
    message: 'Kategori berhasil dihapus'
  };
}

function deleteJurusan(data) {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const jurusanSheet = ss.getSheetByName('Jurusan');
  const lastRow = jurusanSheet.getLastRow();
  
  if(lastRow < 2) return { success: false, message: 'Tidak ada data jurusan' };
  
  const jurusanData = jurusanSheet.getRange(2, 1, lastRow-1, 4).getValues();
  let foundRow = -1;
  
  for(let i = 0; i < jurusanData.length; i++) {
    const row = jurusanData[i];
    if(row[0] == data.id) {
      foundRow = i + 2;
      break;
    }
  }
  
  if(foundRow === -1) {
    return { success: false, message: 'Jurusan tidak ditemukan' };
  }
  
  // Delete row
  jurusanSheet.deleteRow(foundRow);
  
  return { 
    success: true, 
    message: 'Jurusan berhasil dihapus'
  };
}

function deleteUser(data) {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const usersSheet = ss.getSheetByName('Users');
  const lastRow = usersSheet.getLastRow();
  
  if(lastRow < 2) return { success: false, message: 'Tidak ada data user' };
  
  const usersData = usersSheet.getRange(2, 1, lastRow-1, 6).getValues();
  let foundRow = -1;
  
  for(let i = 0; i < usersData.length; i++) {
    const row = usersData[i];
    if(row[0] == data.id) {
      // Cek jika ini adalah admin utama
      if(row[4] === 'superuser' && row[0] == 1) {
        return { 
          success: false, 
          message: 'Tidak dapat menghapus admin utama' 
        };
      }
      foundRow = i + 2;
      break;
    }
  }
  
  if(foundRow === -1) {
    return { success: false, message: 'User tidak ditemukan' };
  }
  
  // Delete row
  usersSheet.deleteRow(foundRow);
  
  return { 
    success: true, 
    message: 'User berhasil dihapus'
  };
}

function uploadFotoToDrive(data) {
  try {
    const folder = DriveApp.getFolderById(DRIVE_FOLDER_ID);
    
    // Decode base64
    const bytes = Utilities.base64Decode(data.base64);
    const blob = Utilities.newBlob(bytes, data.mimeType, data.filename);
    
    // Upload to Drive
    const file = folder.createFile(blob);
    
    // Set sharing permissions
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    
    // Get direct download URL
    const downloadUrl = `https://drive.google.com/uc?id=${file.getId()}&export=download`;
    
    return {
      success: true,
      url: downloadUrl,
      id: file.getId(),
      downloadUrl: downloadUrl
    };
  } catch(error) {
    console.error('Upload error:', error);
    return {
      success: false,
      message: error.toString()
    };
  }
}

function processPengembalian(data) {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const peminjamanSheet = ss.getSheetByName('Peminjaman');
  const lastRow = peminjamanSheet.getLastRow();
  
  if(lastRow < 2) return { success: false, message: 'Tidak ada data peminjaman' };
  
  const peminjamanData = peminjamanSheet.getRange(2, 1, lastRow-1, 13).getValues();
  let foundRow = -1;
  let peminjamanItems = [];
  
  for(let i = 0; i < peminjamanData.length; i++) {
    const row = peminjamanData[i];
    if(row[0] == data.id) {
      foundRow = i + 2;
      
      // Parse items
      try {
        peminjamanItems = JSON.parse(row[9] || '[]');
      } catch(e) {
        console.error('Error parsing items:', e);
      }
      break;
    }
  }
  
  if(foundRow === -1) {
    return { success: false, message: 'Peminjaman tidak ditemukan' };
  }
  
  // Update status
  peminjamanSheet.getRange(foundRow, 9).setValue('Dikembalikan'); // kolom I (status)
  peminjamanSheet.getRange(foundRow, 8).setValue(new Date()); // kolom H (tanggal_kembali_aktual)
  
  // Update stok alat
  updateStokAlat(peminjamanItems, 'increase');
  
  return { 
    success: true, 
    message: 'Pengembalian berhasil diproses'
  };
}

function getDashboardStats(data) {
  const alatResult = getAllAlat(data);
  const peminjamanResult = getAllPeminjaman(data);
  const kategoriResult = getAllKategori(data);
  
  if(!alatResult.success || !peminjamanResult.success || !kategoriResult.success) {
    return { success: false, message: 'Gagal mengambil data dashboard' };
  }
  
  const alat = alatResult.data;
  const peminjaman = peminjamanResult.data;
  const kategori = kategoriResult.data;
  
  // Total alat
  const totalAlat = alat.length;
  
  // Peminjaman aktif
  const peminjamanAktif = peminjaman.filter(p => p.status === 'Dipinjam').length;
  
  // Alat terlambat
  const today = new Date();
  const alatTerlambat = peminjaman.filter(p => {
    if(p.status === 'Dipinjam' && p.tanggal_kembali_estimasi) {
      const estimasiDate = new Date(p.tanggal_kembali_estimasi);
      return estimasiDate < today;
    }
    return false;
  }).length;
  
  // Alat tersedia
  const alatTersedia = alat.reduce((sum, a) => sum + a.jumlah_tersedia, 0);
  
  // Total kategori
  const totalKategori = kategori.length;
  
  return {
    success: true,
    data: {
      totalAlat: totalAlat,
      peminjamanAktif: peminjamanAktif,
      alatTerlambat: alatTerlambat,
      alatTersedia: alatTersedia,
      totalKategori: totalKategori
    }
  };
}
