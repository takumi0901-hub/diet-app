// manifest.json の内容と、アイコンのファイルがあることのテスト
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const manifest = JSON.parse(fs.readFileSync(path.join(root, "manifest.json"), "utf8"));

describe("manifest.json", () => {
  test("名前・開始URL・表示方法が正しい", () => {
    expect(manifest.name).toBe("体重記録");
    expect(manifest.start_url).toBe("./");
    expect(manifest.display).toBe("standalone");
  });

  test("192x192 と 512x512 のアイコンがある", () => {
    const sizes = manifest.icons.map((icon) => icon.sizes);
    expect(sizes).toContain("192x192");
    expect(sizes).toContain("512x512");
  });

  test("アイコンのファイルが実在する", () => {
    manifest.icons.forEach((icon) => {
      expect(fs.existsSync(path.join(root, icon.src))).toBe(true);
    });
  });
});
