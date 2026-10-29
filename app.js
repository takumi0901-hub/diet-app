// 画面の処理（入力、一覧、グラフ、設定画面、同期の表示）
// 画面に表示する文字列は、すべて textContent で入れる（innerHTML は使わない）

// localStorage のキー
const STORAGE_RECORDS = "weightApp.records";
const STORAGE_PENDING_DELETES = "weightApp.pendingDeletes";
const STORAGE_SETTINGS = "weightApp.settings";

// 記録の配列（各要素: date, weight, meal, exercise, updatedAt, pending）
// pending が true の記録は、まだスプレッドシートに送れていない
let records = [];
// まだスプレッドシートに送れていない削除（日付の配列）
let pendingDeletes = [];
// グラフの Chart.js のインスタンス
let chart = null;
// 同期の処理を1つずつ順番に実行するためのつなぎ
let syncQueue = Promise.resolve();

// 画面の要素
const el = {
  syncStatus: document.getElementById("sync-status"),
  tabs: document.querySelectorAll(".tab"),
  recordForm: document.getElementById("record-form"),
  inputDate: document.getElementById("input-date"),
  inputWeight: document.getElementById("input-weight"),
  inputMeal: document.getElementById("input-meal"),
  inputExercise: document.getElementById("input-exercise"),
  overwriteNote: document.getElementById("overwrite-note"),
  formMessage: document.getElementById("form-message"),
  statAverage: document.getElementById("stat-average"),
  statAverageSub: document.getElementById("stat-average-sub"),
  statDiff: document.getElementById("stat-diff"),
  statDiffSub: document.getElementById("stat-diff-sub"),
  chartCanvas: document.getElementById("weight-chart"),
  chartMessage: document.getElementById("chart-message"),
  reloadButton: document.getElementById("reload-button"),
  emptyMessage: document.getElementById("empty-message"),
  recordList: document.getElementById("record-list"),
  settingsForm: document.getElementById("settings-form"),
  inputUrl: document.getElementById("input-url"),
  inputToken: document.getElementById("input-token"),
  clearSettingsButton: document.getElementById("clear-settings-button"),
  settingsMessage: document.getElementById("settings-message"),
};

// ---------- localStorage の読み書き ----------

// JSON を読み込む。壊れていたり使えなかったりしたら fallback を返す
function readJson(key, fallback) {
  try {
    const text = localStorage.getItem(key);
    return text ? JSON.parse(text) : fallback;
  } catch (e) {
    return fallback;
  }
}

function writeJson(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (e) {
    showMessage(el.formMessage, "ブラウザへの保存に失敗しました", "error");
  }
}

function loadLocalData() {
  const raw = readJson(STORAGE_RECORDS, []);
  records = (Array.isArray(raw) ? raw : [])
    .map((r) => {
      const n = normalizeRecord(r);
      if (n) n.pending = r.pending === true;
      return n;
    })
    .filter(Boolean);
  const deletes = readJson(STORAGE_PENDING_DELETES, []);
  pendingDeletes = Array.isArray(deletes) ? deletes.filter(isValidDate) : [];
}

function saveRecords() {
  writeJson(STORAGE_RECORDS, records);
}

function savePendingDeletes() {
  writeJson(STORAGE_PENDING_DELETES, pendingDeletes);
}

function getSettings() {
  const s = readJson(STORAGE_SETTINGS, {});
  return {
    url: typeof s.url === "string" ? s.url : "",
    token: typeof s.token === "string" ? s.token : "",
  };
}

function isSyncConfigured(settings) {
  return settings.url !== "" && settings.token !== "";
}

// ---------- 表示の小さな部品 ----------

// 今日の日付（端末の時刻で "YYYY-MM-DD"）
function todayString() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
}

// 数値を表示用の文字列にする（小数第1位まで）
function formatKg(value) {
  return value.toFixed(1) + " kg";
}

function formatSignedKg(value) {
  if (value === 0) return "±0.0 kg";
  return (value > 0 ? "+" : "−") + Math.abs(value).toFixed(1) + " kg";
}

function showMessage(target, text, type) {
  target.textContent = text;
  target.dataset.type = type || "";
}

// 同期の状態を表示する（state: off / busy / ok / error）
function showSyncStatus(state, detail) {
  const pendingCount = records.filter((r) => r.pending).length + pendingDeletes.length;
  let text;
  if (state === "off") {
    text = "連携なし（このブラウザにだけ保存）";
  } else if (state === "busy") {
    text = "同期中…";
  } else if (state === "ok") {
    const d = new Date();
    const time = String(d.getHours()).padStart(2, "0") + ":" + String(d.getMinutes()).padStart(2, "0");
    text = "同期済み（" + time + "）";
  } else {
    text = "同期失敗：" + detail;
    if (pendingCount > 0) text += "（未送信 " + pendingCount + " 件。次の同期で送ります）";
  }
  el.syncStatus.dataset.state = state;
  el.syncStatus.textContent = text;
}

// ---------- 描画 ----------

function renderAll() {
  renderSummary();
  renderChart();
  renderList();
  updateOverwriteNote();
}

// 直近7日間の平均と、前日との差
function renderSummary() {
  const avg = averageOfLast7Days(records, todayString());
  if (avg) {
    el.statAverage.textContent = formatKg(avg.average);
    el.statAverageSub.textContent = avg.from.slice(5) + "〜" + avg.to.slice(5) + "（" + avg.count + "件）";
  } else {
    el.statAverage.textContent = "—";
    el.statAverageSub.textContent = "この7日間の記録はありません";
  }

  const diff = diffFromPreviousDay(records);
  if (!diff) {
    el.statDiff.textContent = "—";
    el.statDiffSub.textContent = "体重の記録はありません";
  } else if (diff.diff === null) {
    el.statDiff.textContent = "—";
    el.statDiffSub.textContent = diff.date.slice(5) + " の前日の記録はありません";
  } else {
    el.statDiff.textContent = formatSignedKg(diff.diff);
    el.statDiffSub.textContent = diff.previousDate.slice(5) + " → " + diff.date.slice(5);
  }
}

// CSS の色の値を読む（グラフはキャンバスなので、CSS 変数を直接使えない）
function cssColor(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

// 体重の推移の折れ線グラフ
function renderChart() {
  if (typeof Chart === "undefined") {
    el.chartMessage.textContent = "グラフを読み込めませんでした（インターネット接続を確認してください）";
    el.chartMessage.hidden = false;
    return;
  }
  const points = sortByDate(records.filter(hasWeight));
  el.chartMessage.hidden = points.length > 0;
  el.chartMessage.textContent = "体重を記録すると、ここにグラフが表示されます";

  const labels = points.map((r) => r.date.slice(5).replace("-", "/"));
  const data = points.map((r) => r.weight);
  const accent = cssColor("--accent");
  const muted = cssColor("--text-muted");
  const grid = cssColor("--grid");
  const surface = cssColor("--surface");

  if (chart) {
    chart.data.labels = labels;
    chart.data.datasets[0].data = data;
    chart.update();
    return;
  }

  chart = new Chart(el.chartCanvas, {
    type: "line",
    data: {
      labels: labels,
      datasets: [
        {
          label: "体重（kg）",
          data: data,
          borderColor: accent,
          backgroundColor: accent,
          borderWidth: 2,
          pointRadius: 4,
          pointHoverRadius: 6,
          pointBorderColor: surface,
          pointBorderWidth: 2,
          tension: 0,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: "index", intersect: false },
      plugins: {
        legend: { display: false },
        tooltip: {
          displayColors: false,
          callbacks: {
            title: (items) => points[items[0].dataIndex].date,
            label: (item) => formatKg(item.parsed.y),
          },
        },
      },
      scales: {
        x: {
          grid: { display: false },
          ticks: { color: muted, maxRotation: 0, autoSkip: true, maxTicksLimit: 7 },
        },
        y: {
          grid: { color: grid },
          border: { display: false },
          ticks: { color: muted },
        },
      },
    },
  });
}

// 一覧（新しい日付が上）
function renderList() {
  const sorted = sortByDate(records).reverse();
  el.recordList.replaceChildren();
  el.emptyMessage.hidden = sorted.length > 0;

  for (const r of sorted) {
    const li = document.createElement("li");
    li.className = "record-item";

    const main = document.createElement("div");
    main.className = "record-main";

    const head = document.createElement("div");
    head.className = "record-head";
    const date = document.createElement("span");
    date.className = "record-date";
    date.textContent = r.date;
    const weight = document.createElement("span");
    weight.className = "record-weight";
    weight.textContent = hasWeight(r) ? formatKg(r.weight) : "体重なし";
    head.append(date, weight);
    if (r.pending && isSyncConfigured(getSettings())) {
      const pending = document.createElement("span");
      pending.className = "record-pending";
      pending.textContent = "未同期";
      head.append(pending);
    }
    main.append(head);

    if (r.meal) main.append(memoLine("食事：", r.meal));
    if (r.exercise) main.append(memoLine("運動：", r.exercise));

    const actions = document.createElement("div");
    actions.className = "record-actions";
    const editButton = document.createElement("button");
    editButton.type = "button";
    editButton.textContent = "編集";
    editButton.addEventListener("click", () => fillForm(r));
    const deleteButton = document.createElement("button");
    deleteButton.type = "button";
    deleteButton.className = "danger";
    deleteButton.textContent = "削除";
    deleteButton.addEventListener("click", () => deleteRecord(r.date));
    actions.append(editButton, deleteButton);

    li.append(main, actions);
    el.recordList.append(li);
  }
}

function memoLine(label, text) {
  const p = document.createElement("p");
  p.className = "record-memo";
  p.textContent = label + text;
  return p;
}

// 選んだ日付に記録があれば、上書きになることを知らせる
function updateOverwriteNote() {
  const date = el.inputDate.value;
  el.overwriteNote.hidden = !records.some((r) => r.date === date);
}

// 一覧の「編集」：フォームに値を入れる
function fillForm(record) {
  el.inputDate.value = record.date;
  el.inputWeight.value = hasWeight(record) ? String(record.weight) : "";
  el.inputMeal.value = record.meal;
  el.inputExercise.value = record.exercise;
  updateOverwriteNote();
  showMessage(el.formMessage, "", "");
  el.recordForm.scrollIntoView({ behavior: "smooth", block: "start" });
}

// ---------- 記録と削除 ----------

function handleRecordSubmit(event) {
  event.preventDefault();
  const date = el.inputDate.value;
  const weightText = el.inputWeight.value.trim();
  const meal = el.inputMeal.value.trim();
  const exercise = el.inputExercise.value.trim();

  if (!isValidDate(date)) {
    showMessage(el.formMessage, "日付を入力してください", "error");
    return;
  }
  let weight = null;
  if (weightText !== "") {
    weight = Number(weightText);
    if (!Number.isFinite(weight) || weight <= 0 || weight > 500) {
      showMessage(el.formMessage, "体重は 0 より大きく 500 以下の数値で入力してください", "error");
      return;
    }
  }
  if (weight === null && meal === "" && exercise === "") {
    showMessage(el.formMessage, "体重かメモのどれかを入力してください", "error");
    return;
  }

  const existed = records.some((r) => r.date === date);
  const record = {
    date: date,
    weight: weight,
    meal: meal,
    exercise: exercise,
    updatedAt: new Date().toISOString(),
    pending: true,
  };
  // まず localStorage に保存する
  records = upsertByDate(records, record);
  pendingDeletes = pendingDeletes.filter((d) => d !== date);
  saveRecords();
  savePendingDeletes();

  el.inputWeight.value = "";
  el.inputMeal.value = "";
  el.inputExercise.value = "";
  showMessage(el.formMessage, date + " の記録を" + (existed ? "上書きしました" : "保存しました"), "ok");
  renderAll();

  // 連携が設定されていれば、スプレッドシートにも送る
  runSync(false);
}

function deleteRecord(date) {
  if (!window.confirm(date + " の記録を削除しますか？")) return;
  records = records.filter((r) => r.date !== date);
  saveRecords();
  if (isSyncConfigured(getSettings()) && !pendingDeletes.includes(date)) {
    pendingDeletes.push(date);
    savePendingDeletes();
  }
  renderAll();
  runSync(false);
}

// ---------- 同期 ----------

// まだ送れていない削除と記録を、スプレッドシートに送る
async function pushPending(settings) {
  for (const date of pendingDeletes.slice()) {
    await deleteRecordFromSheet(settings.url, settings.token, date);
    pendingDeletes = pendingDeletes.filter((d) => d !== date);
    savePendingDeletes();
  }
  for (const r of records.filter((x) => x.pending)) {
    const sentVersion = r.updatedAt;
    await upsertRecordToSheet(settings.url, settings.token, r);
    // 送っている間に書き換えられていなければ、送信済みにする
    const current = records.find((x) => x.date === r.date);
    if (current && current.updatedAt === sentVersion) {
      current.pending = false;
      saveRecords();
    }
  }
}

// スプレッドシートから取得して、画面を更新する
// 未送信の記録と削除は、手元の内容を優先する
async function pullFromSheet(settings) {
  const remote = (await fetchRecords(settings.url, settings.token))
    .map(normalizeRecord)
    .filter(Boolean)
    .map((r) => Object.assign(r, { pending: false }));
  let merged = remote.filter((r) => !pendingDeletes.includes(r.date));
  for (const local of records.filter((r) => r.pending)) {
    merged = upsertByDate(merged, local);
  }
  records = merged;
  saveRecords();
  renderAll();
}

// 同期を実行する（withPull が true なら、送信のあとで取得もする）
// 失敗しても例外は外に出さず、状態の表示だけにする
function runSync(withPull) {
  const settings = getSettings();
  if (!isSyncConfigured(settings)) {
    showSyncStatus("off");
    return syncQueue;
  }
  syncQueue = syncQueue.then(async () => {
    showSyncStatus("busy");
    el.reloadButton.disabled = true;
    try {
      await pushPending(settings);
      if (withPull) await pullFromSheet(settings);
      showSyncStatus("ok");
    } catch (e) {
      showSyncStatus("error", e && e.message ? e.message : "不明なエラー");
    } finally {
      el.reloadButton.disabled = false;
      renderList();
    }
  });
  return syncQueue;
}

// ---------- 設定画面 ----------

function fillSettingsForm() {
  const s = getSettings();
  el.inputUrl.value = s.url;
  el.inputToken.value = s.token;
}

function handleSettingsSubmit(event) {
  event.preventDefault();
  const url = el.inputUrl.value.trim();
  const token = el.inputToken.value.trim();
  if (url === "" || token === "") {
    showMessage(el.settingsMessage, "連携URLと合言葉の両方を入力してください", "error");
    return;
  }
  let parsed;
  try {
    parsed = new URL(url);
  } catch (e) {
    parsed = null;
  }
  if (!parsed || (parsed.protocol !== "https:" && parsed.protocol !== "http:")) {
    showMessage(el.settingsMessage, "連携URLの形式が正しくありません", "error");
    return;
  }
  writeJson(STORAGE_SETTINGS, { url: url, token: token });
  showMessage(el.settingsMessage, "保存しました。同期を始めます", "ok");
  runSync(true);
}

function handleClearSettings() {
  if (!window.confirm("連携を解除しますか？（このブラウザの記録は残ります）")) return;
  try {
    localStorage.removeItem(STORAGE_SETTINGS);
  } catch (e) {
    // 消せなくても続ける
  }
  // 連携先がなくなるので、未送信の削除は捨てる
  pendingDeletes = [];
  savePendingDeletes();
  fillSettingsForm();
  showMessage(el.settingsMessage, "連携を解除しました", "ok");
  showSyncStatus("off");
  renderList();
}

// ---------- 画面の切り替え ----------

function showView(viewId) {
  for (const tab of el.tabs) {
    const active = tab.dataset.view === viewId;
    if (active) tab.setAttribute("aria-current", "page");
    else tab.removeAttribute("aria-current");
    document.getElementById(tab.dataset.view).hidden = !active;
  }
  if (viewId === "view-settings") {
    fillSettingsForm();
    showMessage(el.settingsMessage, "", "");
  }
}

// ---------- 起動 ----------

function init() {
  loadLocalData();
  el.inputDate.value = todayString();

  el.recordForm.addEventListener("submit", handleRecordSubmit);
  el.inputDate.addEventListener("change", updateOverwriteNote);
  el.reloadButton.addEventListener("click", () => runSync(true));
  el.settingsForm.addEventListener("submit", handleSettingsSubmit);
  el.clearSettingsButton.addEventListener("click", handleClearSettings);
  for (const tab of el.tabs) {
    tab.addEventListener("click", () => showView(tab.dataset.view));
  }

  renderAll();
  // 起動時にスプレッドシートから取得する（連携が設定されていなければ何もしない）
  runSync(true);
}

init();
