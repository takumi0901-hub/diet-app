// logic.js の計算関数のテスト（データはすべて架空の値）
const { averageOfLast7Days, diffFromPreviousDay } = require("../logic.js");

describe("averageOfLast7Days（直近7日間の平均）", () => {
  test("基準日を含む過去7日間の体重だけを平均する", () => {
    const records = [
      { date: "2030-01-01", weight: 90.0 }, // 範囲外（8日前）
      { date: "2030-01-02", weight: 50.0 }, // 範囲の初日
      { date: "2030-01-05", weight: 51.0 },
      { date: "2030-01-08", weight: 52.0 }, // 基準日
      { date: "2030-01-09", weight: 90.0 }, // 範囲外（基準日より後）
    ];
    expect(averageOfLast7Days(records, "2030-01-08")).toEqual({
      average: 51.0,
      count: 3,
      from: "2030-01-02",
      to: "2030-01-08",
    });
  });

  test("体重が null の記録は数えない", () => {
    const records = [
      { date: "2030-01-07", weight: 50.0 },
      { date: "2030-01-08", weight: null, meal: "架空のメモ" },
    ];
    const result = averageOfLast7Days(records, "2030-01-08");
    expect(result.average).toBe(50.0);
    expect(result.count).toBe(1);
  });

  test("平均は小数第2位までに丸める", () => {
    const records = [
      { date: "2030-01-06", weight: 50.0 },
      { date: "2030-01-07", weight: 50.1 },
      { date: "2030-01-08", weight: 50.1 },
    ];
    // (50.0 + 50.1 + 50.1) / 3 = 50.0666...
    expect(averageOfLast7Days(records, "2030-01-08").average).toBe(50.07);
  });

  test("月をまたぐ範囲も正しく計算する", () => {
    const records = [
      { date: "2030-02-25", weight: 40.0 }, // 範囲外
      { date: "2030-02-26", weight: 41.0 },
      { date: "2030-03-04", weight: 43.0 },
    ];
    const result = averageOfLast7Days(records, "2030-03-04");
    expect(result.from).toBe("2030-02-26");
    expect(result.average).toBe(42.0);
    expect(result.count).toBe(2);
  });

  test("範囲内に体重の記録がなければ null を返す", () => {
    expect(averageOfLast7Days([], "2030-01-08")).toBeNull();
    expect(averageOfLast7Days([{ date: "2029-12-01", weight: 50.0 }], "2030-01-08")).toBeNull();
    expect(averageOfLast7Days([{ date: "2030-01-08", weight: null }], "2030-01-08")).toBeNull();
  });
});

describe("diffFromPreviousDay（前日との差）", () => {
  test("最新の記録と、その前日の記録との差を返す", () => {
    const records = [
      { date: "2030-01-07", weight: 50.3 },
      { date: "2030-01-08", weight: 50.1 },
    ];
    expect(diffFromPreviousDay(records)).toEqual({
      date: "2030-01-08",
      weight: 50.1,
      previousDate: "2030-01-07",
      previousWeight: 50.3,
      diff: -0.2,
    });
  });

  test("増えたときは正の値になる", () => {
    const records = [
      { date: "2030-01-07", weight: 50.0 },
      { date: "2030-01-08", weight: 50.5 },
    ];
    expect(diffFromPreviousDay(records).diff).toBe(0.5);
  });

  test("記録の並び順に関係なく、日付が最新のものを使う", () => {
    const records = [
      { date: "2030-01-08", weight: 50.1 },
      { date: "2030-01-05", weight: 60.0 },
      { date: "2030-01-07", weight: 50.3 },
    ];
    const result = diffFromPreviousDay(records);
    expect(result.date).toBe("2030-01-08");
    expect(result.diff).toBe(-0.2);
  });

  test("体重が null の記録は最新として扱わない", () => {
    const records = [
      { date: "2030-01-06", weight: 50.0 },
      { date: "2030-01-07", weight: 51.0 },
      { date: "2030-01-08", weight: null, exercise: "架空のメモ" },
    ];
    const result = diffFromPreviousDay(records);
    expect(result.date).toBe("2030-01-07");
    expect(result.diff).toBe(1.0);
  });

  test("前日の記録がなければ diff は null", () => {
    const records = [
      { date: "2030-01-05", weight: 50.0 }, // 前日ではない
      { date: "2030-01-08", weight: 50.1 },
    ];
    const result = diffFromPreviousDay(records);
    expect(result.previousDate).toBe("2030-01-07");
    expect(result.previousWeight).toBeNull();
    expect(result.diff).toBeNull();
  });

  test("月や年をまたぐ前日も見つける", () => {
    const records = [
      { date: "2029-12-31", weight: 50.0 },
      { date: "2030-01-01", weight: 49.8 },
    ];
    const result = diffFromPreviousDay(records);
    expect(result.previousDate).toBe("2029-12-31");
    expect(result.diff).toBe(-0.2);
  });

  test("体重の記録がなければ null を返す", () => {
    expect(diffFromPreviousDay([])).toBeNull();
    expect(diffFromPreviousDay([{ date: "2030-01-08", weight: null }])).toBeNull();
  });
});
