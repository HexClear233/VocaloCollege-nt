// scripts/verify_viewport.js — 精确视口下的响应式实测
// 上一版用 iframe 导致视口被窗口 chrome 挤压（360 实测成 512）。
// 这一版直接用 --window-size 打开真实页面，并用 CSS 强制视口宽度来精确测量断点。
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const freshProfile = require('./chrome_profile');
const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const BASE = process.env.BASE_URL || 'http://127.0.0.1:4173';
// 站点根目录：默认源代码目录 site/，可用 SITE_ROOT 指向部署拷贝
// （用于验证 GitHub Pages 子路径等场景）
const SITE = process.env.SITE_ROOT
  ? path.resolve(__dirname, '..', process.env.SITE_ROOT)
  : path.join(__dirname, '..', 'site');
const OUT = path.join(__dirname, '..', '.verify');

// 用 CDP 更精确，但为保持零依赖，这里用 Chrome 的 --window-size + 页面内自测
// 关键技巧：--force-device-scale-factor 与 --window-size 组合可让 clientWidth 接近目标
const WIDTHS = [360, 375, 414, 640, 768, 960, 1024, 1280, 1440, 1920];

const PAGES = [
  ['index', '/index.html'],
  ['2026-vol2', '/editions/2026-vol2.html']
];

// 在每个真实页面上注入一次性测量脚本（通过 ?__measure=1 触发）
// 改为：本地新建 wrapper 页面，用精确 width 的容器 + iframe
const wrapper = (target, w) => `<!DOCTYPE html><meta charset="utf-8">
<style>
  html,body{margin:0;padding:0;background:#888}
  #frame{width:${w}px;height:900px;border:0;display:block;margin:0}
</style>
<iframe id="frame" src="${target}"></iframe>
<pre id="out">pending</pre>
<script>
window.addEventListener('load', function () {
  var f = document.getElementById('frame');
  function measure() {
    var d = f.contentDocument, de = d.documentElement;
    var vw = de.clientWidth;
    var overflowX = de.scrollWidth > vw + 1;
    var offenders = [];
    if (overflowX) {
      d.querySelectorAll('*').forEach(function (el) {
        var r = el.getBoundingClientRect();
        if (r.width > 0 && r.right > vw + 2) {
          var cls = (el.className && typeof el.className === 'string') ? '.' + el.className.trim().split(/\\s+/)[0] : '';
          offenders.push(el.tagName.toLowerCase() + cls);
        }
      });
    }
    var grid = d.querySelector('.grid--works');
    var cols = grid ? getComputedStyle(grid).gridTemplateColumns.split(' ').filter(Boolean).length : 0;
    var sp = d.querySelector('.sp-showcase');
    var spCols = sp ? getComputedStyle(sp).gridTemplateColumns.split(' ').filter(Boolean).length : 0;
    var header = d.querySelector('.site-header__inner');
    // 检查是否有元素宽度为 0（说明布局塌陷）
    var collapsed = 0;
    d.querySelectorAll('.wc, .ec, .stat').forEach(function (el) {
      if (el.getBoundingClientRect().width < 20) collapsed++;
    });
    document.getElementById('out').textContent = JSON.stringify({
      frameW: ${w}, vw: vw, scrollW: de.scrollWidth, overflowX: overflowX,
      offenders: offenders.slice(0, 5), cols: cols, spCols: spCols,
      headerH: header ? Math.round(header.getBoundingClientRect().height) : 0,
      collapsed: collapsed
    });
  }
  // iframe 内部还要等数据加载 + 自定义元素渲染
  setTimeout(measure, 1800);
});
</script>`;

fs.mkdirSync(OUT, { recursive: true });

console.log('═'.repeat(80));
console.log('响应式实测（精确容器宽度）');
console.log('═'.repeat(80));

let fail = 0;
const rows = [];

for (const [name, target] of PAGES) {
  console.log(`\n[${name}]`);
  console.log('  容器宽  实际视口  文档宽   溢出  卡片列  SP列  页头  塌陷');
  for (const w of WIDTHS) {
    const file = `__vp_${w}.html`;
    fs.writeFileSync(path.join(SITE, file), wrapper(target, w), 'utf8');
    let r;
    try {
      const profile = freshProfile(OUT, 'vp-' + w + '-' + name);
      const html = execFileSync(CHROME, [
        '--headless=new', '--disable-gpu', '--no-sandbox', '--hide-scrollbars',
        '--virtual-time-budget=12000',
        '--window-size=1600,1000',
        '--dump-dom',
        '--user-data-dir=' + profile,
        BASE + '/' + file
      ], { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
      const m = html.match(/<pre id="out">([\s\S]*?)<\/pre>/);
      r = JSON.parse(m[1].replace(/&quot;/g, '"').replace(/&amp;/g, '&'));
    } catch (e) {
      console.log(`  ${String(w).padEnd(7)} 测量失败: ${e.message.slice(0, 50)}`);
      fail++;
      continue;
    } finally {
      try { fs.unlinkSync(path.join(SITE, file)); } catch (e) {}
    }

    const ok = !r.overflowX && r.collapsed === 0;
    if (!ok) fail++;
    rows.push({ name, w, ...r, ok });

    console.log(`  ${String(w).padEnd(7)} ${String(r.vw).padEnd(9)} ${String(r.scrollW).padEnd(8)} ` +
      `${(r.overflowX ? '有❌' : '无').padEnd(5)} ${String(r.cols).padEnd(7)} ${String(r.spCols).padEnd(5)} ` +
      `${String(r.headerH).padEnd(5)} ${r.collapsed}` +
      (r.overflowX ? `\n          溢出: ${r.offenders.join(', ')}` : ''));
  }
}

console.log('\n' + '═'.repeat(80));

// 断点行为断言
console.log('断点行为断言：');
const idx = rows.filter(r => r.name === 'index');
function colsAt(w) { const r = idx.find(x => x.w === w); return r ? r.cols : -1; }
function headerAt(w) { const r = idx.find(x => x.w === w); return r ? r.headerH : -1; }

const asserts = [
  ['360 宽度卡片为 2 列', colsAt(360) === 2],
  ['640 宽度卡片为 2 列', colsAt(640) === 2],
  ['768 宽度卡片 ≥4 列', colsAt(768) >= 4],
  ['1280 宽度卡片 ≥5 列', colsAt(1280) >= 5],
  ['1920 宽度卡片 ≥5 列', colsAt(1920) >= 5],
  ['手机页头更矮（≤56px）', headerAt(360) <= 56],
  ['桌面页头更高（>56px）', headerAt(1280) > 56],
  ['全程无横向溢出', rows.every(r => !r.overflowX)],
  ['全程无布局塌陷', rows.every(r => r.collapsed === 0)]
];
for (const [n, ok] of asserts) {
  console.log(`  ${ok ? '✅' : '❌'} ${n}`);
  if (!ok) fail++;
}

console.log('\n' + '═'.repeat(80));
console.log(fail ? `❌ ${fail} 项未通过` : '✅ 全部通过');
process.exit(fail ? 1 : 0);
