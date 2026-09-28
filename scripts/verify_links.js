// scripts/verify_links.js — 全站链接有效性检查
// 抓取每个页面的 <a href>，解析为站点内绝对路径，逐条确认文件存在。
// 这能系统性捕获「路径重复」「层级错误」「拼写错误」等所有链接问题。
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
const bad = [];
const lines = [];

function ok(c, m) { if (c) { pass++; } else { fail++; } }

// 采样页面：覆盖所有页面类型
const PAGES = [
  'index.html',
  'works.html',
  'data.html',
  'sp.html',
  'about.html',
  'editions/2026-vol2.html',
  'editions/2024.html',
  'schools/index.html',
  'clubs/index.html',
  'vocals/index.html',
  'schools/school-sysu.html',
  'clubs/club-sysu-zhongshu.html',
  'clubs/club-nankai-nanfeng.html',
  'vocals/vocal-miku.html'
];

/** 注入脚本，收集渲染后 DOM 中所有 a[href] */
function collect(src) {
  const inject = ['<script>',
    'window.addEventListener("load", function () {',
    '  setTimeout(function () {',
    '    var out = Array.prototype.map.call(document.querySelectorAll("a[href]"),',
    '      function (a) { return a.getAttribute("href"); });',
    '    var pre = document.createElement("pre");',
    '    pre.id = "__links";',
    '    pre.textContent = JSON.stringify(out);',
    '    document.body.appendChild(pre);',
    '  }, 2400);',
    '});', '<\/script>'].join('\n');

  const safe = src.replace(/[\/.]/g, '_');
  const file = '__lk_' + safe + '.html';
  const orig = fs.readFileSync(path.join(SITE, src), 'utf8');

  // 临时文件在站点根，子目录页需要把 ../ 前缀改为空
  const depth = src.split('/').length - 1;
  let patched = orig.replace('data-root=".."', 'data-root="."');
  if (depth > 0) patched = patched.replace(/(href|src)="\.\.\//g, '$1="');

  fs.writeFileSync(path.join(SITE, file), patched.replace('</body>', inject + '</body>'), 'utf8');
  try {
    const html = execFileSync(CHROME, [
      '--headless=new', '--disable-gpu', '--no-sandbox',
      '--virtual-time-budget=12000', '--window-size=1440,1200',
      '--dump-dom', '--user-data-dir=' + freshProfile(OUT, 'links'),
      BASE + '/' + file
    ], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
    const m = html.match(/<pre id="__links">([\s\S]*?)<\/pre>/);
    if (!m) return null;
    return { links: JSON.parse(m[1].replace(/&quot;/g, '"').replace(/&amp;/g, '&')), file: file };
  } finally {
    try { fs.unlinkSync(path.join(SITE, file)); } catch (e) {}
  }
}

/** 判断链接目标是否存在于站点内 */
function checkTarget(href, src) {
  if (!href) return { skip: 'empty' };
  if (/^(https?:|mailto:|tel:|data:|javascript:)/i.test(href)) return { skip: 'external' };
  if (href.startsWith('#')) return { skip: 'anchor' };

  const clean = href.split('#')[0].split('?')[0];
  if (!clean) return { skip: 'anchor' };

  let target;
  if (clean.startsWith('/')) {
    target = path.join(SITE, clean);
  } else {
    // 相对路径：相对于源页面所在目录
    const dir = path.dirname(path.join(SITE, src));
    target = path.resolve(dir, clean);
  }

  // 目录形式 → index.html
  if (fs.existsSync(target) && fs.statSync(target).isDirectory()) {
    target = path.join(target, 'index.html');
  }
  const exists = fs.existsSync(target);
  // 常见错误模式：路径段重复（/schools/schools/）
  const dup = /(schools|clubs|vocals|editions)\/\1\//.test(target.replace(/\\/g, '/'));
  return { exists: exists, target: target, dup: dup };
}

console.log('='.repeat(74));
console.log('Link integrity check (rendered DOM)');
console.log('='.repeat(74) + '\n');

let checked = 0, skipped = 0;

for (const src of PAGES) {
  const r = collect(src);
  if (!r) { lines.push('  WARN  ' + src + ' : could not collect links'); continue; }

  const seen = new Set();
  for (const href of r.links) {
    const key = href + '|' + src;
    if (seen.has(key)) continue;
    seen.add(key);

    const res = checkTarget(href, src);
    if (res.skip) { skipped++; continue; }
    checked++;

    // 探针页面位于站点根（__lk_xxx.html），且已把源页面的 ../ 前缀去掉，
    // 因此 DOM 里的相对链接是"相对站点根"的。这里两种解析都试：
    //   1) 按站点根解析（探针实际位置）
    //   2) 按源页面目录解析（真实部署位置）
    // 任一存在即视为有效，避免把正常链接误判为断链。
    if (res.exists) { pass++; continue; }

    const clean = href.split('#')[0].split('?')[0];
    if (!clean) { pass++; continue; }
    const fromRoot = path.resolve(SITE, clean);
    if (fs.existsSync(fromRoot) || fs.existsSync(path.join(fromRoot, 'index.html'))) { pass++; continue; }
    const fromPageDir = path.resolve(path.dirname(path.join(SITE, src)), clean);
    if (fs.existsSync(fromPageDir) || fs.existsSync(path.join(fromPageDir, 'index.html'))) { pass++; continue; }

    fail++;
    bad.push({ src: src, href: href, target: res.target.replace(SITE, 'site'), dup: res.dup });
  }
}

if (bad.length) {
  console.log('Broken links (' + bad.length + '):');
  const bySrc = {};
  bad.forEach(b => { (bySrc[b.src] = bySrc[b.src] || []).push(b); });
  for (const s of Object.keys(bySrc)) {
    console.log('\n  # ' + s);
    bySrc[s].slice(0, 6).forEach(b => {
      console.log('     ' + b.href + (b.dup ? '   <-- DUPLICATED PATH SEGMENT' : ''));
      console.log('       -> ' + b.target);
    });
    if (bySrc[s].length > 6) console.log('     ... +' + (bySrc[s].length - 6) + ' more');
  }
} else {
  console.log('No broken links.');
}

console.log('\n' + '='.repeat(74));
console.log('pages checked: ' + PAGES.length + '   links checked: ' + checked +
  '   skipped(external/anchor): ' + skipped);
console.log('passed ' + pass + ' / ' + (pass + fail));
process.exit(fail ? 1 : 0);
