// sheets.js の API 呼び出しのテスト
// fetch は jest.fn() で置き換え、実際の通信は行わない（URL と合言葉は架空の値）
const { fetchRecords, upsertRecordToSheet, deleteRecordFromSheet } = require("../sheets.js");

const TEST_URL = "https://example.invalid/test-endpoint";
const TEST_TOKEN = "dummy-token";

// fetch が返す応答をまねる
function mockResponse(body, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status: status,
    json: jest.fn().mockResolvedValue(body),
  };
}

// fetch に渡された本文を、オブジェクトにして返す
function sentBody(callIndex = 0) {
  return JSON.parse(global.fetch.mock.calls[callIndex][1].body);
}

const originalFetch = global.fetch;

beforeEach(() => {
  global.fetch = jest.fn();
});

afterAll(() => {
  global.fetch = originalFetch;
});

describe("リクエストの形", () => {
  test("設定の URL に、text/plain の POST で送る", async () => {
    global.fetch.mockResolvedValue(mockResponse({ ok: true, records: [] }));
    await fetchRecords(TEST_URL, TEST_TOKEN);

    expect(global.fetch).toHaveBeenCalledTimes(1);
    const [url, options] = global.fetch.mock.calls[0];
    expect(url).toBe(TEST_URL);
    expect(options.method).toBe("POST");
    expect(options.headers).toEqual({ "Content-Type": "text/plain;charset=utf-8" });
    expect(typeof options.body).toBe("string");
  });
});

describe("fetchRecords（一覧の取得）", () => {
  test("本文に token と action: list を入れる", async () => {
    global.fetch.mockResolvedValue(mockResponse({ ok: true, records: [] }));
    await fetchRecords(TEST_URL, TEST_TOKEN);
    expect(sentBody()).toEqual({ token: TEST_TOKEN, action: "list" });
  });

  test("成功時は records を返す", async () => {
    const records = [
      { date: "2030-01-07", weight: 50.3, meal: "架空の食事", exercise: "", updatedAt: "2030-01-07T00:00:00.000Z" },
      { date: "2030-01-08", weight: null, meal: "", exercise: "架空の運動", updatedAt: "2030-01-08T00:00:00.000Z" },
    ];
    global.fetch.mockResolvedValue(mockResponse({ ok: true, records: records }));
    await expect(fetchRecords(TEST_URL, TEST_TOKEN)).resolves.toEqual(records);
  });

  test("records が配列でなければ空の配列を返す", async () => {
    global.fetch.mockResolvedValue(mockResponse({ ok: true }));
    await expect(fetchRecords(TEST_URL, TEST_TOKEN)).resolves.toEqual([]);
  });

  test("{ ok: false } のときは error の文字列でエラーにする", async () => {
    global.fetch.mockResolvedValue(mockResponse({ ok: false, error: "架空のエラー" }));
    await expect(fetchRecords(TEST_URL, TEST_TOKEN)).rejects.toThrow("架空のエラー");
  });
});

describe("upsertRecordToSheet（記録の追加・上書き）", () => {
  const record = {
    date: "2030-01-08",
    weight: 50.1,
    meal: "架空の食事",
    exercise: "架空の運動",
    // 以下は API に送らない項目
    updatedAt: "2030-01-08T00:00:00.000Z",
    pending: true,
  };

  test("本文に token と action: upsert と record を入れる", async () => {
    global.fetch.mockResolvedValue(mockResponse({ ok: true }));
    await upsertRecordToSheet(TEST_URL, TEST_TOKEN, record);
    expect(sentBody()).toEqual({
      token: TEST_TOKEN,
      action: "upsert",
      record: { date: "2030-01-08", weight: 50.1, meal: "架空の食事", exercise: "架空の運動" },
    });
  });

  test("体重が null のときは null のまま送る", async () => {
    global.fetch.mockResolvedValue(mockResponse({ ok: true }));
    await upsertRecordToSheet(TEST_URL, TEST_TOKEN, Object.assign({}, record, { weight: null }));
    expect(sentBody().record.weight).toBeNull();
  });

  test("成功時はエラーにならない", async () => {
    global.fetch.mockResolvedValue(mockResponse({ ok: true }));
    await expect(upsertRecordToSheet(TEST_URL, TEST_TOKEN, record)).resolves.toBeUndefined();
  });

  test("{ ok: false } のときはエラーにする", async () => {
    global.fetch.mockResolvedValue(mockResponse({ ok: false, error: "架空のエラー" }));
    await expect(upsertRecordToSheet(TEST_URL, TEST_TOKEN, record)).rejects.toThrow("架空のエラー");
  });
});

describe("deleteRecordFromSheet（記録の削除）", () => {
  test("本文に token と action: delete と date を入れる", async () => {
    global.fetch.mockResolvedValue(mockResponse({ ok: true }));
    await deleteRecordFromSheet(TEST_URL, TEST_TOKEN, "2030-01-08");
    expect(sentBody()).toEqual({ token: TEST_TOKEN, action: "delete", date: "2030-01-08" });
  });

  test("成功時はエラーにならない", async () => {
    global.fetch.mockResolvedValue(mockResponse({ ok: true }));
    await expect(deleteRecordFromSheet(TEST_URL, TEST_TOKEN, "2030-01-08")).resolves.toBeUndefined();
  });

  test("{ ok: false } のときはエラーにする", async () => {
    global.fetch.mockResolvedValue(mockResponse({ ok: false, error: "架空のエラー" }));
    await expect(deleteRecordFromSheet(TEST_URL, TEST_TOKEN, "2030-01-08")).rejects.toThrow("架空のエラー");
  });
});

describe("失敗のときのエラー", () => {
  test("{ ok: false } で error がなければ「不明なエラー」にする", async () => {
    global.fetch.mockResolvedValue(mockResponse({ ok: false }));
    await expect(fetchRecords(TEST_URL, TEST_TOKEN)).rejects.toThrow("不明なエラー");
  });

  test("HTTP のエラーはステータス番号つきのエラーにする", async () => {
    global.fetch.mockResolvedValue(mockResponse({}, 500));
    await expect(fetchRecords(TEST_URL, TEST_TOKEN)).rejects.toThrow("HTTP 500");
  });

  test("応答が JSON でなければエラーにする", async () => {
    const response = mockResponse(null);
    response.json = jest.fn().mockRejectedValue(new SyntaxError("Unexpected token"));
    global.fetch.mockResolvedValue(response);
    await expect(fetchRecords(TEST_URL, TEST_TOKEN)).rejects.toThrow("応答の形式が正しくありません");
  });

  test("通信できなければエラーにする", async () => {
    global.fetch.mockRejectedValue(new TypeError("Failed to fetch"));
    await expect(fetchRecords(TEST_URL, TEST_TOKEN)).rejects.toThrow("通信できませんでした");
  });
});
