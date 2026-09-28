// scripts/sync_data.js — 把 data/ 同步到 site/data/（站点运行时需要的副本）
//
// 为什么需要副本：site/ 是要独立部署的站点根目录，而 data/ 是数据工作区。
// GitHub Pages 部署时只有 site/ 会被发布，因此运行时数据必须位于站点根目录下。
// data/ 始终是唯一事实来源（single source of truth），site/data/ 是生成产物。
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SRC = path.join(ROOT, 'data');
const DST = path.join(ROOT, 'site', 'data');

// 站点运行时不需要 / 不应发布的文件
//
// 注 1：Phase 2 起作品库需按高校 / 社团 / 歌声 / 制作者检索，
//       故两个大字典（约 700 KB）也必须同步，由 data.js 的 loadDicts() 按需加载。
//
// 注 2（重要）：bilibili_stats.json 与 .bilibili-cache/ 绝不发布到站点。
//       栏目方决定：B 站平台数据「采集但不展示」。
//       漏掉这条会把播放量等平台指标暴露给前端，违反方案十九「不做实力排行榜」。
const EXCLUDE_FILES = new Set([
  'bilibili_stats.json',
  '.bilibili-cache'
]);

function copyDir(src, dst, isRoot) {
  fs.mkdirSync(dst, { recursive: true });
  let n = 0, bytes = 0;
  for (const e of fs.readdirSync(src, { withFileTypes: true })) {
    if (isRoot && EXCLUDE_FILES.has(e.name)) continue;
    const s = path.join(src, e.name);
    const d = path.join(dst, e.name);
    if (e.isDirectory()) {
      const r = copyDir(s, d, false);
      n += r.n; bytes += r.bytes;
    } else {
      fs.copyFileSync(s, d);
      n++; bytes += fs.statSync(d).size;
    }
  }
  return { n, bytes };
}

const r = copyDir(SRC, DST, true);
console.log(`data/ → site/data/ 同步完成`);
console.log(`  ${r.n} 个文件，${(r.bytes / 1024).toFixed(1)} KB`);
console.log(`  已排除运行时不需要的文件：${[...EXCLUDE_FILES].join(', ')}`);
console.log(`\n注意：data/ 是唯一事实来源，site/data/ 为生成产物，请勿直接修改后者。`);
