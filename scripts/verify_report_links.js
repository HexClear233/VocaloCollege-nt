// scripts/verify_report_links.js — 专项：年报页链接必须带 ../ 前缀
//
// 背景（2026-09-28）：年报页位于 /reports/ 子目录，但渲染脚本里的站内链接
// 写成了 "schools/school-XXX.html"，浏览器会解析为 /reports/schools/... → 404。
// 本脚本逐个检查年报页渲染出的所有站内链接，确认解析后的目标文件真实存在。
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const freshProfile = require('./chrome_profile');

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const BASE = process.env.BASE_URL || 'http://127.0.0.1:4181';
// 站点根目录：默认源代码目录 site/，可用 SITE_ROOT 指向部署拷贝
// （用于验证 GitHub Pages 子路径等场景）
const SITE = process.env.SITE_ROOT
  ? path.resolve(__dirname, '..', process.env.SITE_ROOT)
  : path.join(__dirname, '..', 'site');
const OUT = path.join(__dirname, '..', '.verify');
fs.mkdirSync(OUT, { recursive: true });

let pass = 0, fail = 0;
const lines = [];
function ok(c, m) { if (c) { pass++; lines.push('     PASS ' + m); } else { fail++; lines.push('     FAIL ' + m); } }

/** 用 iframe 加载真实 URL，读取渲染后的所有 a[href] */
function collectLinks(url, tag) {
  const wrap = `<!DOCTYPE html><meta charset="utf-8">
<iframe id="f" src="${url}" style="width:1280px;height:900px;border:0"></iframe>
<pre id="__r">pending</pre>
<script>
window.addEventListener('load', function () {
  setTimeout(function () {
    var out = {};
    try {
      var d = document.getElementById('f').contentDocument;
      out.base = document.getElementById('f').contentWindow.location.href;
      out.failed = d.body.textContent.indexOf('加载失败') >= 0;
      out.links = Array.prototype.map.call(d.querySelectorAll('a[href]'), function (a) {
        return { raw: a.getAttribute('href'), abs: a.href };
      });
    } catch (e) { out.__error = String(e); }
    document.getElementById('__r').textContent = JSON.stringify(out);
  }, 3000);
});
<\/script>`;
  const file = '__rl_' + tag + '.html';
  fs.writeFileSync(path.join(SITE, file), wrap, 'utf8');
  try {
    const html = execFileSync(CHROME, [
      '--headless=new', '--disable-gpu', '--no-sandbox', '--hide-scrollbars',
      '--virtual-time-budget=14000', '--window-size=1400,1100',
      '--dump-dom', '--user-data-dir=' + freshProfile(OUT, 'rl-' + tag), BASE + '/' + file
    ], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
    const m = html.match(/<pre id="__r">([\s\S]*?)<\/pre>/);
    return m ? JSON.parse(m[1].replace(/&quot;/g, '"').replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<').replace(/&gt;/g, '>')) : { __error: 'no probe' };
  } finally {
    try { fs.unlinkSync(path.join(SITE, file)); } catch (e) {}
  }
}

console.log('='.repeat(74));
console.log('Report page link audit (must resolve inside the site)');
console.log('='.repeat(74) + '\n');

const TARGETS = [
  ['reports/index.html', 'idx'],
  ['reports/index.html?year=2025', 'idx2025'],
  ['reports/2026.html', 'y2026'],
  ['reports/2015.html', 'y2015']
];

for (const [src, tag] of TARGETS) {
  const url = BASE + '/' + src;
  const r = collectLinks(url, tag);
  lines.push('\n# ' + src);

  if (r.__error) { ok(false, 'probe failed: ' + r.__error); continue; }
  ok(!r.failed, 'renders without load error');

  const sitePrefix = BASE + '/';
  const bad = [];
  (r.links || []).forEach(function (l) {
    const abs = l.abs;
    if (!abs || abs.indexOf(sitePrefix) !== 0) return;   // 站外/锚点忽略
    const rel = abs.slice(sitePrefix.length).split('#')[0].split('?')[0];
    if (!rel) return;                                     // 指向站点根
    const target = path.join(SITE, decodeURIComponent(rel));
    const exists = fs.existsSync(target) ||
      fs.existsSync(path.join(target, 'index.html'));
    if (!exists) bad.push({ raw: l.raw, rel: rel });
  });

  ok(bad.length === 0, 'all ' + (r.links || []).length + ' links resolve' +
    (bad.length ? '  (' + bad.length + ' broken)' : ''));
  bad.slice(0, 6).forEach(function (b) {
    lines.push('        broken: ' + b.raw + '  ->  ' + b.rel);
  });
}

console.log(lines.join('\n'));
console.log('\n' + '='.repeat(74));
console.log('passed ' + pass + ' / ' + (pass + fail));
process.exit(fail ? 1 : 0);
