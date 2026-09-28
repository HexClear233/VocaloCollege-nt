// scripts/verify_sync.js — 确认 site/data/ 与 data/ 完全一致
//
// 背景（2026-09-28）：fix_collab_clubs.js 修正了 data/ 中 4 件作品的 club_ids，
// 但没有重新运行 sync_data.js，导致 site/data/ 保留旧数据。
// 站点因此显示出错误的「合作社团」数量（南风动漫社 8 个，实际 3 个）。
//
// 教训：data/ 是唯一事实来源，但站点读的是 site/data/。
// 任何直接编辑 data/ 的脚本（fix_*/mark_*/normalize_* 等）之后都必须重新同步，
// 否则会出现「数据改了但页面没变」的假象 —— 且验证脚本若只查 data/ 就发现不了。
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SRC = path.join(ROOT, 'data');
const DST = path.join(ROOT, 'site', 'data');

// 这些文件不发布到站点（见 sync_data.js 的 EXCLUDE_FILES）
const EXCLUDE = new Set(['bilibili_stats.json', '.bilibili-cache']);

let pass = 0, fail = 0;
const lines = [];
function ok(c, m) { if (c) { pass++; } else { fail++; lines.push('     FAIL ' + m); } }

console.log('='.repeat(74));
console.log('Data sync check: data/  vs  site/data/');
console.log('='.repeat(74) + '\n');

const missing = [];
const differing = [];

function walk(rel) {
  const s = path.join(SRC, rel);
  for (const e of fs.readdirSync(s, { withFileTypes: true })) {
    const r = rel ? rel + '/' + e.name : e.name;
    if (!rel && EXCLUDE.has(e.name)) continue;
    if (e.isDirectory()) { walk(r); continue; }

    const a = path.join(SRC, r);
    const b = path.join(DST, r);
    if (!fs.existsSync(b)) { missing.push(r); continue; }

    const ba = fs.readFileSync(a);
    const bb = fs.readFileSync(b);
    if (!ba.equals(bb)) {
      differing.push({ file: r, srcKB: (ba.length / 1024).toFixed(1), dstKB: (bb.length / 1024).toFixed(1) });
    }
  }
}
walk('');

ok(missing.length === 0, 'all source files present in site/data/' +
  (missing.length ? ' (missing: ' + missing.slice(0, 8).join(', ') + ')' : ''));

ok(differing.length === 0, 'all files byte-identical' +
  (differing.length ? ' (' + differing.length + ' differ)' : ''));

if (differing.length) {
  lines.push('     Files out of sync:');
  differing.slice(0, 15).forEach(function (d) {
    lines.push('        ' + d.file + '  (data/ ' + d.srcKB + 'KB vs site/data/ ' + d.dstKB + 'KB)');
  });
  if (differing.length > 15) lines.push('        ... +' + (differing.length - 15) + ' more');
  lines.push('');
  lines.push('     >>> 运行 node scripts/sync_data.js 修复');
}

// 额外：抽查关键字段是否真的同步（防止「文件相同但内容错」）
const KEYS = ['index.json', 'statistics.json', 'schools.json', 'clubs.json', 'vocals.json'];
KEYS.forEach(function (f) {
  const a = path.join(SRC, f), b = path.join(DST, f);
  if (!fs.existsSync(a) || !fs.existsSync(b)) return;
  try {
    const ja = JSON.parse(fs.readFileSync(a, 'utf8'));
    const jb = JSON.parse(fs.readFileSync(b, 'utf8'));
    ok(JSON.stringify(ja) === JSON.stringify(jb), f + ' parses identical');
  } catch (e) {
    ok(false, f + ' parse error: ' + e.message);
  }
});

console.log(lines.join('\n'));
console.log('\n' + '='.repeat(74));
console.log('passed ' + pass + ' / ' + (pass + fail));
process.exit(fail ? 1 : 0);
