// scripts/verify_darkmode.js — 暗色模式验证（基于真实渲染像素）
//
// 为什么用像素而不是 getComputedStyle：
//   2026-09-28 排查主题问题时发现，headless Chrome 下若元素带
//   `transition: background-color`，运行时切换 data-theme 后
//   getComputedStyle().backgroundColor 会持续返回**过渡前**的值，
//   而页面实际绘制是正确的（截图取像素验证）。
//   这会让人误以为「主题切换失效」，实际上只是读数不可靠。
//   因此本脚本改为：截图 → 读取关键区域像素 → 与期望颜色比对。
//
// 同时保留 :root 变量检查（变量读取不受 transition 影响）。
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

/** 断言并立即打印（避免"通过了但看不到"的情况） */
function check(cond, msg) {
  const line = `  ${cond ? '✅' : '❌'} ${msg}`;
  lines.push(line);
  console.log(line);
  cond ? pass++ : fail++;
}

/** 期望色值（与 tokens.css 一致） */
const EXPECT = {
  light: { '--background': '#F5F5F2', '--surface': '#FFFFFF', '--text': '#181818',
           '--secondary': '#777777', '--border': '#DDDDD8' },
  dark:  { '--background': '#0B0C10', '--surface': '#15171D', '--text': '#E7E9ED',
           '--secondary': '#969AA5', '--border': '#292C34' }
};

// ---------------------------------------------------------------- 1. 变量断言
// 变量读取不受 transition 影响，可安全用 getComputedStyle
const varProbe = `<!DOCTYPE html><meta charset="utf-8">
<script>
(function(){
  var t = new URLSearchParams(location.search).get('t') || 'light';
  localStorage.setItem('vc-theme', t);
  location.replace('/__dm_target.html');
})();
<\/script>`;

const targetPage = `<!DOCTYPE html><meta charset="utf-8">
<link rel="stylesheet" href="/assets/css/tokens.css">
<link rel="stylesheet" href="/assets/css/base.css">
<link rel="stylesheet" href="/assets/css/layout.css">
<link rel="stylesheet" href="/assets/css/components.css">
<link rel="stylesheet" href="/assets/css/archive.css">
<link rel="stylesheet" href="/assets/css/charts.css">
<body>
<div class="wc"><span class="wc__body">probe</span></div>
<div class="stat">probe</div>
<audio controls></audio>
<pre id="probe"></pre>
<script>
(function () {
  var de = document.documentElement;
  var m = localStorage.getItem('vc-theme') || 'system';
  var sysDark = matchMedia('(prefers-color-scheme: dark)').matches;
  var theme = m === 'system' ? (sysDark ? 'dark' : 'light') : m;
  // 顺序：先设属性，再读（否则读到默认主题）
  de.setAttribute('data-theme', theme);
  de.setAttribute('data-theme-mode', m);
  void de.offsetHeight;
  var cs = getComputedStyle(de);
  var out = { mode: m, theme: theme, vars: {} };
  ['--background','--surface','--text','--secondary','--border','--accent','--cover-filter']
    .forEach(function (v) { out.vars[v] = cs.getPropertyValue(v).trim(); });
  out.colorScheme = cs.colorScheme;
  out.imgFilter = cs.getPropertyValue('--cover-filter').trim();
  document.getElementById('probe').textContent = JSON.stringify(out);
})();
<\/script>
</body>`;

fs.writeFileSync(path.join(SITE, '__dm_var.html'), varProbe, 'utf8');
fs.writeFileSync(path.join(SITE, '__dm_target.html'), targetPage, 'utf8');

function readVars(theme) {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const html = execFileSync(CHROME, [
        '--headless=new', '--disable-gpu', '--no-sandbox',
        '--virtual-time-budget=12000', '--dump-dom',
        '--user-data-dir=' + freshProfile(OUT, 'dmv-' + theme),
        BASE + '/__dm_var.html?t=' + theme
      ], { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
      const m = html.match(/<pre id="probe">([\s\S]*?)<\/pre>/);
      if (!m) throw new Error('未取到探针输出');
      return JSON.parse(m[1].replace(/&quot;/g, '"').replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<').replace(/&gt;/g, '>'));
    } catch (e) {
      if (attempt === 2) throw e;
    }
  }
}

function norm(hex) {
  const m = /^rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(hex);
  if (!m) return String(hex).toUpperCase();
  const h = (n) => (+n).toString(16).padStart(2, '0');
  return ('#' + h(m[1]) + h(m[2]) + h(m[3])).toUpperCase();
}

console.log('═'.repeat(66));
console.log('暗色模式验证（变量 + 真实渲染像素）');
console.log('═'.repeat(66));

const V = {};
for (const t of ['light', 'dark']) {
  const r = readVars(t);
  V[t] = r;
  console.log(`\n[${t}]  mode=${r.mode}  解析主题=${r.theme}  color-scheme=${r.colorScheme}`);
  for (const k of Object.keys(EXPECT[t])) {
    const got = norm(r.vars[k]);
    const want = EXPECT[t][k];
    lines.push(`  ${got === want ? '✅' : '❌'} ${k.padEnd(14)} ${got}  (期望 ${want})`);
    got === want ? pass++ : fail++;
  }
  console.log(lines.splice(-Object.keys(EXPECT[t]).length).join('\n'));
  console.log(`  · 封面滤镜   ${r.imgFilter}`);
}

// ---------------------------------------------------------------- 2. 像素断言
// 这是关键：用截图确认「实际画出来的颜色」正确。
// 绕过 getComputedStyle 在 transition 下的读数问题，同时验证真实渲染管线。
console.log('\n渲染像素断言（截图取色）：');

const shotPage = `<!DOCTYPE html><meta charset="utf-8">
<link rel="stylesheet" href="/assets/css/tokens.css">
<link rel="stylesheet" href="/assets/css/base.css">
<link rel="stylesheet" href="/assets/css/layout.css">
<link rel="stylesheet" href="/assets/css/components.css">
<style>
  html, body { margin: 0; padding: 0; }
  #card { width: 200px; height: 100px; margin: 20px; }
  #pad  { width: 200px; height: 20px; margin: 0 20px; }
</style>
<body data-theme="">
<div id="card" class="wc"></div>
<div id="pad"></div>
<pre id="probe" style="margin:20px"></pre>
<script>
(function () {
  // 主题在样式加载「之前」的 head 内脚本里已由引导页写入 localStorage，
  // 这里再显式设一次，确保与真实站点同一路径（属性设在 documentElement）
  var m = localStorage.getItem('vc-theme') || 'light';
  document.documentElement.setAttribute('data-theme', m);
  document.documentElement.setAttribute('data-theme-mode', m);
  document.getElementById('probe').textContent = JSON.stringify({ theme: m });
})();
<\/script>
</body>`;

fs.writeFileSync(path.join(SITE, '__dm_shot.html'), shotPage, 'utf8');

function shot(theme) {
  const png = path.join(OUT, 'dm-' + theme + '.png');
  try { fs.unlinkSync(png); } catch (e) {}
  execFileSync(CHROME, [
    '--headless=new', '--disable-gpu', '--no-sandbox', '--hide-scrollbars',
    '--virtual-time-budget=12000',
    '--window-size=300,200',
    '--screenshot=' + png,
    '--user-data-dir=' + freshProfile(OUT, 'dms-' + theme),
    BASE + '/__dm_boot_' + theme + '.html'
  ], { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
  return png;
}

// 引导页：先写 localStorage 再跳转，保证主题在样式解析前生效
for (const t of ['light', 'dark']) {
  fs.writeFileSync(path.join(SITE, '__dm_boot_' + t + '.html'),
    `<!DOCTYPE html><meta charset="utf-8"><script>
localStorage.setItem('vc-theme','${t}');location.replace('/__dm_shot.html');
<\/script>`, 'utf8');
}

/**
 * 读取 PNG 指定像素。
 * 实现方式：把 PNG 拷进站点，用 Chrome 载入 <img> → canvas → ImageData。
 * 不依赖任何图像库，也不依赖宿主 PowerShell 的 System.Drawing。
 * 用「真实文件 URL」而非 data: URL —— 后者在极长 base64 下容易被截断。
 */
function readPixels(pngPath, points) {
  const name = '__dm_px_input.png';
  fs.copyFileSync(pngPath, path.join(SITE, name));

  const probe = `<!DOCTYPE html><meta charset="utf-8">
<body>
<img id="i" src="/${name}">
<pre id="p"></pre>
<script>
document.getElementById('i').onload = function () {
  try {
    var c = document.createElement('canvas');
    c.width = this.naturalWidth; c.height = this.naturalHeight;
    var g = c.getContext('2d');
    g.drawImage(this, 0, 0);
    var pts = ${JSON.stringify(points)};
    var out = pts.map(function (p) {
      var d = g.getImageData(p[0], p[1], 1, 1).data;
      return '#' + [d[0], d[1], d[2]].map(function (n) {
        return ('0' + n.toString(16)).slice(-2);
      }).join('').toUpperCase();
    });
    document.getElementById('p').textContent = JSON.stringify({ size: [c.width, c.height], px: out });
  } catch (e) {
    document.getElementById('p').textContent = JSON.stringify({ __error: String(e) });
  }
};
document.getElementById('i').onerror = function () {
  document.getElementById('p').textContent = JSON.stringify({ __error: 'img load failed' });
};
<\/script></body>`;

  const f = '__dm_px.html';
  fs.writeFileSync(path.join(SITE, f), probe, 'utf8');
  try {
    const html = execFileSync(CHROME, [
      '--headless=new', '--disable-gpu', '--no-sandbox',
      '--virtual-time-budget=8000', '--dump-dom',
      '--user-data-dir=' + freshProfile(OUT, 'dmp'), BASE + '/' + f
    ], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
    const m = html.match(/<pre id="p">([\s\S]*?)<\/pre>/);
    if (!m || m[1].indexOf('__error') >= 0) {
      if (m) lines.push('        pixel probe error: ' + m[1]);
      return null;
    }
    return JSON.parse(m[1].replace(/&quot;/g, '"'));
  } finally {
    try { fs.unlinkSync(path.join(SITE, f)); } catch (e) {}
    try { fs.unlinkSync(path.join(SITE, name)); } catch (e) {}
  }
}

const PAD = [270, 10];      // 页面背景（距离卡片较远的空白处）
const CARD = [100, 70];     // 卡片中心

const px = {};
const pxInfo = [];
try {
  for (const t of ['light', 'dark']) {
    const png = shot(t);
    if (!fs.existsSync(png)) { check(false, `${t} 截图生成失败`); continue; }
    const r = readPixels(png, [PAD, CARD]);
    if (!r) { check(false, `${t} 截图取色失败`); continue; }
    pxInfo.push(`        ${t} 截图 ${r.size[0]}x${r.size[1]}  背景=${r.px[0]}  卡片=${r.px[1]}`);
    px[t] = { pad: r.px[0], card: r.px[1] };
  }
} catch (e) {
  check(false, '截图取色失败: ' + String(e.message).slice(0, 120));
}
pxInfo.forEach(function (l) { console.log(l); });

if (px.light && px.dark) {
  check(px.light.pad === EXPECT.light['--background'],
    `浅色页面背景像素 = ${px.light.pad}（期望 ${EXPECT.light['--background']}）`);
  check(px.light.card === EXPECT.light['--surface'],
    `浅色卡片像素 = ${px.light.card}（期望 ${EXPECT.light['--surface']}）`);
  check(px.dark.pad === EXPECT.dark['--background'],
    `暗色页面背景像素 = ${px.dark.pad}（期望 ${EXPECT.dark['--background']}）`);
  check(px.dark.card === EXPECT.dark['--surface'],
    `暗色卡片像素 = ${px.dark.card}（期望 ${EXPECT.dark['--surface']}）`);
  check(px.light.card !== px.dark.card, '浅色与暗色卡片渲染结果不同');
  check(px.light.pad !== px.dark.pad, '浅色与暗色背景渲染结果不同');
}

// ---------------------------------------------------------------- 3. 设计断言
function lum(hex) {
  const h = norm(hex).replace('#', '');
  const r = parseInt(h.slice(0, 2), 16), g = parseInt(h.slice(2, 4), 16), b = parseInt(h.slice(4, 6), 16);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
console.log('\n暗色模式设计断言：');
check(lum(V.dark.vars['--background']) < lum(V.light.vars['--background']), '暗色背景比浅色背景暗');
check(lum(V.dark.vars['--surface']) < lum(V.light.vars['--surface']), '暗色表面比浅色表面暗');
check(lum(V.dark.vars['--text']) > lum(V.light.vars['--text']), '暗色文字比浅色文字亮');
check(V.dark.imgFilter !== 'none' && V.dark.imgFilter !== '', '暗色下封面有压暗滤镜');
check(V.light.imgFilter === 'none' || V.light.imgFilter === '', '浅色下封面无滤镜');
check(V.dark.colorScheme === 'dark', '暗色 color-scheme = dark');
check(V.light.colorScheme === 'light', '浅色 color-scheme = light');
check(V.dark.vars['--surface'] !== V.light.vars['--surface'], '暗色 --surface 非简单沿用浅色');

// ---------------------------------------------------------------- 清理
for (const f of ['__dm_var.html', '__dm_target.html', '__dm_shot.html',
                 '__dm_boot_light.html', '__dm_boot_dark.html']) {
  try { fs.unlinkSync(path.join(SITE, f)); } catch (e) {}
}

console.log('\n' + '═'.repeat(66));
console.log(`通过 ${pass} / ${pass + fail}`);
process.exit(fail ? 1 : 0);
