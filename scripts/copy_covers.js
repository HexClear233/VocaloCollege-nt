// scripts/copy_covers.js — 方案 C：只拷贝封面（图片，约 20MB），不拷贝音频
//
// 源：HexClear233.github.io/VocaloCollege/{期目录}/...   由 works[].media.cover_legacy 指定
// 目标：site/media/cover/{edition_id}/{bvid}.jpg        规范化为 BV 命名
//
// 找不到源文件的条目会被记录，卡片将显示占位图。
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SITE = path.join(ROOT, 'site');
const D = path.join(ROOT, 'data');

// 旧站点根目录（素材来源）
const OLD_SITE = path.resolve(ROOT, '..', 'HexClear233.github.io', 'VocaloCollege');

// 期目录映射：data 的 edition_id → 旧站点下的目录名
const EDITION_DIR = {
  '2024': '2024',
  '2025-vol1': '2025',
  '2025-vol2': '2025-vol2',
  '2026-vol1': '2026-vol1',
  '2026-vol2': '2026-vol2'
};

const index = JSON.parse(fs.readFileSync(path.join(D, 'index.json'), 'utf8'));

let copied = 0, skipped = 0, missing = 0;
const missingList = [];

for (const meta of index.editions) {
  const eid = meta.id;
  const ed = JSON.parse(fs.readFileSync(path.join(D, '..', meta.file), 'utf8'));
  const outDir = path.join(SITE, 'media', 'cover', eid);
  fs.mkdirSync(outDir, { recursive: true });

  const dir = EDITION_DIR[eid] || eid;

  for (const w of ed.works) {
    const bvid = w.bilibili && w.bilibili.bvid;
    const legacy = w.media && w.media.cover_legacy;
    if (!bvid || !legacy) { missing++; missingList.push({ eid, id: w.id, reason: 'no bvid / no cover_legacy' }); continue; }

    const outName = bvid + '.jpg';
    const outPath = path.join(outDir, outName);
    if (fs.existsSync(outPath)) { skipped++; continue; }

    // legacy 形如 "./cover_display/BVxxx.jpg" 或 "2025/COVER/名.jpg"
    let rel = legacy.replace(/^\.\//, '');
    let srcPath = path.join(OLD_SITE, dir, rel);

    // 2024 与 2025 的 legacy 已含完整相对路径（./图片/、2025/COVER/），需分别处理
    if (!fs.existsSync(srcPath)) {
      srcPath = path.join(OLD_SITE, rel);
    }
    // 2025-vol1 的 legacy 形如 "2025/COVER/x.jpg"，其 dir 也是 2025 → 去重
    if (!fs.existsSync(srcPath)) {
      srcPath = path.join(OLD_SITE, dir, rel.replace(new RegExp('^' + dir + '/'), ''));
    }

    if (!fs.existsSync(srcPath)) {
      missing++;
      missingList.push({ eid, id: w.id, bvid, legacy, tried: srcPath.replace(ROOT, '') });
      continue;
    }

    try {
      fs.copyFileSync(srcPath, outPath);
      copied++;
    } catch (e) {
      missing++;
      missingList.push({ eid, id: w.id, bvid, error: e.message });
    }
  }
}

// 写出报告
const report = {
  generated_at: new Date().toISOString(),
  strategy: 'C — 仅拷贝封面，不拷贝音频',
  copied, skipped, missing,
  missing_detail: missingList
};
fs.writeFileSync(path.join(SITE, 'media', 'cover-report.json'), JSON.stringify(report, null, 2), 'utf8');

console.log(`封面拷贝完成：`);
console.log(`  已复制   ${copied}`);
console.log(`  已存在跳过 ${skipped}`);
console.log(`  缺失     ${missing}`);
if (missingList.length) {
  console.log(`\n缺失样例（最多 12 条）：`);
  missingList.slice(0, 12).forEach(m =>
    console.log(`  [${m.eid}] ${m.bvid || m.id} ← ${m.legacy || m.reason}`));
}
console.log(`\n报告：site/media/cover-report.json`);

// 统计目标大小
function dirSize(p) {
  let t = 0;
  if (!fs.existsSync(p)) return 0;
  for (const f of fs.readdirSync(p, { withFileTypes: true })) {
    const fp = path.join(p, f.name);
    if (f.isDirectory()) t += dirSize(fp);
    else t += fs.statSync(fp).size;
  }
  return t;
}
const total = dirSize(path.join(SITE, 'media'));
console.log(`封面总体积：${(total / 1024 / 1024).toFixed(1)} MB`);
