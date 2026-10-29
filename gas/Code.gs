const SHEET_NAME = "records";
const HEADERS = ["date", "weight", "meal", "exercise", "updatedAt"];
const MAX_TEXT = 500;

// シートを取得する。なければ作る
// （日付・食事・運動・更新日時の列は「文字」として保存し、日付の自動変換や、数式の実行を防ぐ）
function getSheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME);
    sheet.getRange("A:A").setNumberFormat("@");
    sheet.getRange("C:E").setNumberFormat("@");
  }
  // 1行目がヘッダーでなければ、ヘッダー行を挿入する
  if (sheet.getRange("A1").getValue() !== "date") {
    sheet.insertRowBefore(1);
    sheet.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]);
  }
  return sheet;
}

function json_(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

// 合言葉の確認（合言葉は、コードに書かず、スクリプトプロパティに保存する）
function isAuthorized_(token) {
  const saved = PropertiesService.getScriptProperties().getProperty("API_TOKEN");
  return Boolean(saved) && token === saved;
}

function validateDate_(date) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(date))) {
    throw new Error("date は YYYY-MM-DD の形式で指定してください");
  }
  return String(date);
}

function validateRecord_(rec) {
  if (!rec) throw new Error("record がありません");
  const date = validateDate_(rec.date);
  let weight = null;
  if (rec.weight !== null && rec.weight !== undefined && rec.weight !== "") {
    weight = Number(rec.weight);
    if (!isFinite(weight) || weight < 20 || weight > 300) {
      throw new Error("weight は 20〜300 の数値で指定してください");
    }
  }
  return {
    date: date,
    weight: weight,
    meal: String(rec.meal || "").slice(0, MAX_TEXT),
    exercise: String(rec.exercise || "").slice(0, MAX_TEXT),
  };
}

// 日付が一致する行の番号を返す（なければ -1）
function findRow_(sheet, date) {
  const last = sheet.getLastRow();
  if (last < 2) return -1;
  const dates = sheet.getRange(2, 1, last - 1, 1).getValues();
  for (let i = 0; i < dates.length; i++) {
    if (String(dates[i][0]) === date) return i + 2;
  }
  return -1;
}

function listRecords_() {
  const sheet = getSheet_();
  const last = sheet.getLastRow();
  if (last < 2) return [];
  const rows = sheet.getRange(2, 1, last - 1, HEADERS.length).getValues();
  return rows.map(function (r) {
    return {
      date: String(r[0]),
      weight: r[1] === "" ? null : Number(r[1]),
      meal: String(r[2]),
      exercise: String(r[3]),
      updatedAt: String(r[4]),
    };
  });
}

// 同じ日付があれば上書き、なければ追加する
function upsertRecord_(input) {
  const rec = validateRecord_(input);
  const sheet = getSheet_();
  const updatedAt = new Date().toISOString();
  const values = [[rec.date, rec.weight === null ? "" : rec.weight, rec.meal, rec.exercise, updatedAt]];
  const row = findRow_(sheet, rec.date);
  const target = row === -1 ? sheet.getLastRow() + 1 : row;
  sheet.getRange(target, 1, 1, HEADERS.length).setValues(values);
  return { date: rec.date, weight: rec.weight, meal: rec.meal, exercise: rec.exercise, updatedAt: updatedAt };
}

function deleteRecord_(date) {
  const sheet = getSheet_();
  const row = findRow_(sheet, validateDate_(date));
  if (row === -1) return false;
  sheet.deleteRow(row);
  return true;
}

// URL をブラウザで開いたときの、動作確認用（データは返さない）
function doGet() {
  return json_({ ok: true, message: "diet-app API" });
}

// アプリからの要求を受け付ける（すべて POST。本文は JSON の文字列）
function doPost(e) {
  try {
    const req = JSON.parse(e.postData.contents);
    if (!isAuthorized_(req.token)) {
      return json_({ ok: false, error: "unauthorized" });
    }
    const lock = LockService.getScriptLock();
    lock.waitLock(10000);
    try {
      if (req.action === "list") return json_({ ok: true, records: listRecords_() });
      if (req.action === "upsert") return json_({ ok: true, record: upsertRecord_(req.record) });
      if (req.action === "delete") return json_({ ok: true, deleted: deleteRecord_(req.date) });
      return json_({ ok: false, error: "unknown action" });
    } finally {
      lock.releaseLock();
    }
  } catch (err) {
    return json_({ ok: false, error: String(err) });
  }
}