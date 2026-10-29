// 計算の処理（画面に依存しない関数だけを置く）
// 日付はすべて "YYYY-MM-DD" の文字列で扱う

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

// "YYYY-MM-DD" を 1970-01-01 からの日数に変換する（タイムゾーンの影響を受けないよう UTC で計算）
function dateToDayNumber(dateStr) {
  const [y, m, d] = dateStr.split("-").map(Number);
  return Math.round(Date.UTC(y, m - 1, d) / MS_PER_DAY);
}

// 日数を "YYYY-MM-DD" に戻す
function dayNumberToDate(dayNumber) {
  return new Date(dayNumber * MS_PER_DAY).toISOString().slice(0, 10);
}

// 日付に日数を足す（負の数なら引く）
function addDays(dateStr, days) {
  return dayNumberToDate(dateToDayNumber(dateStr) + days);
}

// 正しい形式の日付かどうか
function isValidDate(dateStr) {
  if (typeof dateStr !== "string" || !DATE_PATTERN.test(dateStr)) return false;
  return dayNumberToDate(dateToDayNumber(dateStr)) === dateStr;
}

// 体重が数値として入っている記録かどうか
function hasWeight(record) {
  return typeof record.weight === "number" && Number.isFinite(record.weight);
}

// 小数第2位までに丸める（浮動小数点の誤差を表示に出さないため）
function round2(value) {
  return Math.round(value * 100) / 100;
}

// 日付の古い順に並べた新しい配列を返す
function sortByDate(records) {
  return records.slice().sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}

// 直近7日間（baseDate を含む過去7日）の体重の平均
// 体重の記録が1件もなければ null を返す
function averageOfLast7Days(records, baseDate) {
  const end = dateToDayNumber(baseDate);
  const start = end - 6;
  const weights = records
    .filter((r) => hasWeight(r) && isValidDate(r.date))
    .filter((r) => {
      const n = dateToDayNumber(r.date);
      return n >= start && n <= end;
    })
    .map((r) => r.weight);
  if (weights.length === 0) return null;
  const sum = weights.reduce((a, b) => a + b, 0);
  return {
    average: round2(sum / weights.length),
    count: weights.length,
    from: dayNumberToDate(start),
    to: baseDate,
  };
}

// 前日との差：体重がある最新の記録と、その前日の記録との差
// 体重の記録がなければ null。前日の記録がなければ diff は null
function diffFromPreviousDay(records) {
  const withWeight = sortByDate(records.filter((r) => hasWeight(r) && isValidDate(r.date)));
  if (withWeight.length === 0) return null;
  const latest = withWeight[withWeight.length - 1];
  const previousDate = addDays(latest.date, -1);
  const previous = withWeight.find((r) => r.date === previousDate);
  return {
    date: latest.date,
    weight: latest.weight,
    previousDate: previousDate,
    previousWeight: previous ? previous.weight : null,
    diff: previous ? round2(latest.weight - previous.weight) : null,
  };
}

// 外部（スプレッドシートや localStorage）から来た記録を、決まった形にそろえる
// 日付が正しくないものは null を返す
function normalizeRecord(raw) {
  if (!raw || typeof raw !== "object") return null;
  const date = String(raw.date || "").slice(0, 10);
  if (!isValidDate(date)) return null;
  let weight = null;
  if (raw.weight !== null && raw.weight !== undefined && raw.weight !== "") {
    const n = Number(raw.weight);
    weight = Number.isFinite(n) ? n : null;
  }
  return {
    date: date,
    weight: weight,
    meal: raw.meal == null ? "" : String(raw.meal),
    exercise: raw.exercise == null ? "" : String(raw.exercise),
    updatedAt: raw.updatedAt == null ? "" : String(raw.updatedAt),
  };
}

// 同じ日付があれば置き換え、なければ追加した新しい配列を返す
function upsertByDate(records, record) {
  return records.filter((r) => r.date !== record.date).concat([record]);
}

// Node.js でテストするときのための書き出し（ブラウザでは何もしない）
if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    addDays,
    isValidDate,
    hasWeight,
    sortByDate,
    averageOfLast7Days,
    diffFromPreviousDay,
    normalizeRecord,
    upsertByDate,
  };
}
