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

const SUMMARY_SHEET_NAME = "summary";
const SUMMARY_HEADERS = ["date", "weight", "avg7"];
const AVG_DAYS = 7;

// "YYYY-MM-DD" を、1970-01-01 からの日数に変換する（タイムゾーンの影響を受けない）
function dayNumber_(dateStr) {
  const p = String(dateStr).split("-");
  return Math.round(Date.UTC(Number(p[0]), Number(p[1]) - 1, Number(p[2])) / 86400000);
}

// グラフ用のシートを取得する。なければ作る
function getSummarySheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(SUMMARY_SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(SUMMARY_SHEET_NAME);
  }
  return sheet;
}

// 記録から「日付・体重・直近7日間の平均」を計算して、summary シートに書き直す
function rebuildSummary_() {
  const records = listRecords_()
    .filter(function (r) { return r.weight !== null; })
    .sort(function (a, b) { return a.date < b.date ? -1 : (a.date > b.date ? 1 : 0); });
  const days = records.map(function (r) { return dayNumber_(r.date); });

  const rows = records.map(function (r, i) {
    let sum = 0;
    let count = 0;
    for (let j = 0; j <= i; j++) {
      if (days[j] >= days[i] - (AVG_DAYS - 1)) {
        sum += records[j].weight;
        count++;
      }
    }
    return [r.date, r.weight, Math.round((sum / count) * 100) / 100];
  });

  const sheet = getSummarySheet_();
  sheet.clearContents();
  sheet.getRange(1, 1, 1, SUMMARY_HEADERS.length).setValues([SUMMARY_HEADERS]);
  if (rows.length > 0) {
    sheet.getRange(2, 1, rows.length, SUMMARY_HEADERS.length).setValues(rows);
  }
}

// エディタから手動で実行する用（最初の 1 回と、シートを手で直したあと）
function rebuildSummary() {
  rebuildSummary_();
}

// 動作確認用：架空のデータ（2030年の日付）を入れて、summary を作る
function testSummary() {
  [["2030-01-01", 50.0], ["2030-01-02", 51.0], ["2030-01-10", 60.0]].forEach(function (d) {
    upsertRecord_({ date: d[0], weight: d[1], meal: "テスト", exercise: "テスト" });
  });
  rebuildSummary_();
}

// 動作確認用：上のテストデータを消して、summary を作り直す
function cleanupTest() {
  ["2030-01-01", "2030-01-02", "2030-01-10"].forEach(function (d) {
    deleteRecord_(d);
  });
  rebuildSummary_();
}

// summary の更新に失敗しても、記録の保存・削除そのものは、成功として返す
function refreshSummary_() {
  try {
    rebuildSummary_();
  } catch (err) {
    console.error("summary の更新に失敗しました: " + err);
  }
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
      if (req.action === "upsert") {
        const record = upsertRecord_(req.record);
        refreshSummary_();
        return json_({ ok: true, record: record });
      }
      if (req.action === "delete") {
        const deleted = deleteRecord_(req.date);
        refreshSummary_();
        return json_({ ok: true, deleted: deleted });
      }
      return json_({ ok: false, error: "unknown action" });
    } finally {
      lock.releaseLock();
    }
  } catch (err) {
    return json_({ ok: false, error: String(err) });
  }
}