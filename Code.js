/**
 * Code.gs - Google Apps Script Backend for PinjamAlat Web App
 * Integrates with Google Sheets and Google Drive
 * Deploy as Web App: Execute as Me, Anyone can access
 */

const SPREADSHEET_ID = '1xjZqhlt6RxFUHtFbkNE_1nqyph1xbA78jtIYz98A6vw';
const IMAGE_FOLDER_ID = '1K5ycuoVqPbONG8nUAwU7CMSRnhR-cu8P';

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
        users: getSheetDataAsObjects(ss.getSheetByName('Users')),
        jurusan: getSheetDataAsObjects(ss.getSheetByName('Jurusan')),
        kategori: getSheetDataAsObjects(ss.getSheetByName('Kategori')),
        alat: getSheetDataAsObjects(ss.getSheetByName('Alat')),
        peminjaman: getSheetDataAsObjects(ss.getSheetByName('Peminjaman')),
        bahan: getSheetDataAsObjects(ss.getSheetByName('bahan') || ss.getSheetByName('Bahan')),
        bahan_keluar: getSheetDataAsObjects(ss.getSheetByName('bahan_keluar') || ss.getSheetByName('Bahan_Keluar'))
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
      for (var i = 0; i < params.queue.length; i++) processSyncTask(ss, params.queue[i]);
      response = { status: 'success', message: 'Sync completed' };
    }
    else if (params.action === 'upload_image') {
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

function getPayloadValue(payload, header) {
  if (payload === null || payload === undefined) return undefined;
  if (header === null || header === undefined) return undefined;

  var clean = function (s) {
    var c = String(s).trim().toLowerCase().replace(/[\s_-]/g, '');
    if (c === 'jurusan') return 'jurusanid';
    if (c === 'namabarang' || c === 'namaalat') return 'nama';
    if (c === 'idbarang' || c === 'id') return 'id';
    return c;
  };

  var hStr = clean(header);
  for (var key in payload) {
    if (clean(key) === hStr) {
      return payload[key];
    }
  }
  return undefined;
}

function processSyncTask(ss, task) {
  var sheetName = getCorrectSheetName(task.storeName);
  var sheet = ss.getSheetByName(sheetName);
  if (!sheet) return;

  var payload = task.payload;

  // Handle image upload
  if (payload.foto && typeof payload.foto === 'string' && payload.foto.indexOf('data:image/') === 0) {
    try {
      var blob = Utilities.newBlob(Utilities.base64Decode(payload.foto.split(',')[1]), 'image/png', (payload.id || 'foto_' + Date.now()) + '.png');
      var file = DriveApp.getFolderById(IMAGE_FOLDER_ID).createFile(blob);
      try { file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW); } catch (e) { }
      payload.foto = file.getDownloadUrl() ? file.getDownloadUrl().replace('&gd=true', '') : file.getUrl();
    } catch (e) {
      payload.foto = 'ERROR_UPLOAD: ' + e.toString();
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
      if (action.startsWith('update')) {
        var data = sheet.getDataRange().getValues();
        var updateRow = headers.map(function (h) {
          var val = getPayloadValue(payload, h);
          return val !== undefined ? val : data[rowIdx][headers.indexOf(h)];
        });
        sheet.getRange(rowIdx + 1, 1, 1, headers.length).setValues([updateRow]);
      } else {
        sheet.deleteRow(rowIdx + 1);
      }
    }
  }
}

function findRowIndex(sheet, headers, payload, sheetName) {
  var data = sheet.getDataRange().getValues();
  var idField = sheetName === 'Peminjaman' ? 'newId' : (sheetName === 'Bahan' || sheetName === 'Bahan_Keluar' ? 'ID_Barang' : 'id');

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

  var idIdx = getHeaderIndex(headers, [idField, 'id', 'ID', 'ID_Barang', 'ID Barang', 'newId', 'Nomor_Peminjaman', 'nomor_peminjaman']);
  var nomorIdx = getHeaderIndex(headers, ['nomor_peminjaman', 'Nomor_Peminjaman', 'nomor peminjaman', 'No. Peminjaman', 'trx']);

  for (var i = 1; i < data.length; i++) {
    var rowId = idIdx > -1 ? String(data[i][idIdx]).trim() : '';
    var rowNomor = nomorIdx > -1 ? String(data[i][nomorIdx]).trim() : '';

    var matched = candidates.some(function (c) {
      return c && rowId.toLowerCase() === c.toLowerCase();
    });
    if (!matched && valNomorPeminjaman && rowNomor.toLowerCase() === String(valNomorPeminjaman).trim().toLowerCase()) {
      matched = true;
    }
    if (matched) return i;
  }
  return -1;
}

function getCorrectSheetName(storeName) {
  var map = { 'users': 'Users', 'jurusan': 'Jurusan', 'kategori': 'Kategori', 'alat': 'Alat', 'peminjaman': 'Peminjaman', 'bahan': 'Bahan', 'bahan_keluar': 'Bahan_Keluar' };
  return map[storeName] || storeName;
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
