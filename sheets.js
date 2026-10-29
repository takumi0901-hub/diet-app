// スプレッドシート連携の処理（API を呼ぶ関数だけを置く）
// URL と合言葉は、呼び出し側（設定画面で保存した値）から受け取る

const SHEETS_TIMEOUT_MS = 20000;

// API を呼ぶ共通の処理。成功なら応答の JSON を返し、失敗なら Error を投げる
async function callSheetsApi(url, token, payload) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), SHEETS_TIMEOUT_MS);
  let response;
  try {
    response = await fetch(url, {
      method: "POST",
      // text/plain にして、事前確認（preflight）のリクエストを避ける
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify(Object.assign({ token: token }, payload)),
      signal: controller.signal,
    });
  } catch (e) {
    throw new Error(e.name === "AbortError" ? "時間切れになりました" : "通信できませんでした");
  } finally {
    clearTimeout(timer);
  }

  if (!response.ok) {
    throw new Error("通信エラー（HTTP " + response.status + "）");
  }

  let data;
  try {
    data = await response.json();
  } catch (e) {
    throw new Error("応答の形式が正しくありません");
  }

  if (!data || data.ok !== true) {
    throw new Error(data && data.error ? String(data.error) : "不明なエラー");
  }
  return data;
}

// 記録の一覧を取得する
async function fetchRecords(url, token) {
  const data = await callSheetsApi(url, token, { action: "list" });
  return Array.isArray(data.records) ? data.records : [];
}

// 記録を追加・上書きする
async function upsertRecordToSheet(url, token, record) {
  await callSheetsApi(url, token, {
    action: "upsert",
    record: {
      date: record.date,
      weight: record.weight,
      meal: record.meal,
      exercise: record.exercise,
    },
  });
}

// 指定した日付の記録を削除する
async function deleteRecordFromSheet(url, token, date) {
  await callSheetsApi(url, token, { action: "delete", date: date });
}

// Node.js でテストするときのための書き出し（ブラウザでは何もしない）
if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    callSheetsApi,
    fetchRecords,
    upsertRecordToSheet,
    deleteRecordFromSheet,
  };
}
