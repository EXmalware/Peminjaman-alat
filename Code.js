/**
 * Code.gs - Google Apps Script Backend for PinjamAlat Web App
 * Integrates with Google Sheets and Google Drive
 * 
 * IMPORTANT: Deploy this as a Web App:
 * 1. Execute as: User accessing the web app / Me (Choose "Me" if accessing via fetch)
 * 2. Who has access: Anyone (to allow CORS requests without strict Google auth if desired)
 */

const SPREADSHEET_ID = '1xjZqhlt6RxFUHtFbkNE_1nqyph1xbA78jtIYz98A6vw';
const IMAGE_FOLDER_ID = '1K5ycuoVqPbONG8nUAwU7CMSRnhR-cu8P';

function setupCORS() {
  return ContentService.createTextOutput()
    .setMimeType(ContentService.MimeType.JSON);
}

function doOptions(e) {
  var output = ContentService.createTextOutput("");
  output.setMimeType(ContentService.MimeType.TEXT);
  return output;
}

function doGet(e) {
  var action = e.parameter.action;
  var response = {};

  try {
    if (action === 'get_data') {
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
    } else {
      response.status = 'error';
      response.message = 'Invalid action';
    }
  } catch (error) {
    response.status = 'error';
    response.message = error.toString();
  }

  return setCORSResponse(response);
}

function doPost(e) {
  var response = { status: 'error', message: 'Unknown error' };
  
  try {
    var rawParams = e.postData.contents;
    var params = JSON.parse(rawParams);
    var action = params.action;
    
    var ss = SpreadsheetApp.openById(SPREADSHEET_ID);

    if (action === 'sync') {
      var queue = params.queue;
      
      // Process sync queue
      for (var i = 0; i < queue.length; i++) {
        var task = queue[i];
        processSyncTask(ss, task);
      }
      
      response.status = 'success';
      response.message = 'Sync completed';
    } 
    else if (action === 'upload_image') {
      var base64 = params.image; // Base64 string
      var filename = params.filename;
      
      var blob = Utilities.newBlob(Utilities.base64Decode(base64.split(',')[1]), 'image/png', filename);
      var folder = DriveApp.getFolderById(IMAGE_FOLDER_ID);
      var file = folder.createFile(blob);
      file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
      
      response.status = 'success';
      response.url = file.getDownloadUrl().replace('&gd=true', '') || file.getUrl();
    }
    
  } catch (error) {
    response.status = 'error';
    response.message = error.toString();
  }

  return setCORSResponse(response);
}

function processSyncTask(ss, task) {
  var sheetName = getCorrectSheetName(task.storeName);
  var sheet = ss.getSheetByName(sheetName);
  if (!sheet) return;

  var payload = task.payload;

  if (payload.foto && typeof payload.foto === 'string' && payload.foto.indexOf('data:image/') === 0) {
    try {
      var base64Data = payload.foto.split(',')[1];
      var blob = Utilities.newBlob(Utilities.base64Decode(base64Data), 'image/png', (payload.id || 'foto_' + new Date().getTime()) + '.png');
      var folder = DriveApp.getFolderById(IMAGE_FOLDER_ID);
      var file = folder.createFile(blob);
      try {
        file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
      } catch (shareErr) {
        // Abaikan jika akun Google Workspace sekolah memblokir fitur bagikan publik
      }
      payload.foto = file.getDownloadUrl() ? file.getDownloadUrl().replace('&gd=true', '') : file.getUrl();
    } catch (e) {
      payload.foto = 'ERROR_UPLOAD: ' + e.toString();
    }
  }
  
  if (task.action.startsWith('insert')) {
    var headers = getHeaders(sheet);
    var newRow = headers.map(function(h) { return payload[h] !== undefined ? payload[h] : ''; });
    sheet.appendRow(newRow);
  }
  else if (task.action.startsWith('update')) {
    var headers = getHeaders(sheet);
    var data = sheet.getDataRange().getValues();
    var idField = sheetName === 'Peminjaman' ? 'newId' : (sheetName === 'Bahan' || sheetName === 'Bahan_Keluar' ? 'ID_Barang' : 'id');
    var targetId = String(payload[idField]);
    
    for (var i = 1; i < data.length; i++) {
      if (String(data[i][headers.indexOf(idField)]) === targetId) {
        var rowToUpdate = i + 1;
        var updateRow = headers.map(function(h) {
          return payload[h] !== undefined ? payload[h] : data[i][headers.indexOf(h)];
        });
        sheet.getRange(rowToUpdate, 1, 1, headers.length).setValues([updateRow]);
        break;
      }
    }
  }
  else if (task.action.startsWith('delete')) {
    var headers = getHeaders(sheet);
    var data = sheet.getDataRange().getValues();
    var idField = sheetName === 'Peminjaman' ? 'newId' : (sheetName === 'Bahan' || sheetName === 'Bahan_Keluar' ? 'ID_Barang' : 'id');
    var targetId = String(payload[idField] || payload.id || payload.newId);
    
    for (var i = 1; i < data.length; i++) {
      var rowId = String(data[i][headers.indexOf(idField)]);
      if (!rowId || rowId === "undefined") {
         rowId = String(data[i][headers.indexOf('id')] || data[i][headers.indexOf('newId')] || data[i][headers.indexOf('ID_Barang')]);
      }
      if (rowId === targetId) {
        sheet.deleteRow(i + 1);
        break;
      }
    }
  }
}

function getCorrectSheetName(storeName) {
  var mapping = {
    'users': 'Users',
    'jurusan': 'Jurusan',
    'kategori': 'Kategori',
    'alat': 'Alat',
    'peminjaman': 'Peminjaman',
    'bahan': 'Bahan',
    'bahan_keluar': 'Bahan_Keluar'
  };
  return mapping[storeName] || storeName;
}

function getSheetDataAsObjects(sheet) {
  if (!sheet) return [];
  var data = sheet.getDataRange().getValues();
  if (data.length <= 1) return [];
  
  var headers = data[0];
  var result = [];
  
  for (var i = 1; i < data.length; i++) {
    var obj = {};
    for (var j = 0; j < headers.length; j++) {
      obj[headers[j]] = data[i][j];
    }
    result.push(obj);
  }
  return result;
}

function getHeaders(sheet) {
  if (sheet.getLastColumn() === 0) return [];
  return sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
}

function setCORSResponse(jsonObject) {
  return ContentService.createTextOutput(JSON.stringify(jsonObject))
    .setMimeType(ContentService.MimeType.JSON);
}
