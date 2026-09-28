// scripts/verify_responsive.js — 实测各宽度下是否出现横向滚动 / 元素溢出
// 断点依据 layout.css：640 / 960 / 1280
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const BASE = process.env.BASE_URL || 'http://127.0.0.1:4173';
// 站点根目录：默认源代码目录 site/，可用 SITE_ROOT 指向部署拷贝
// （用于验证 GitHub Pages 子路径等场景）
const SITE = process.env.SITE_ROOT
  ? path.resolve(__dirname, '..', process.env.SITE_ROOT)
  : path.join(__dirname, '..', 'site');
const OUT = path.join(__dirname, '..', '.verify');

const WIDTHS = [360, 390, 640, 768, 960, 1024, 1280, 1440, 1920];
const PAGES = [
  ['index', '/'],
  ['2026-vol2', '/editions/2026-vol2.html'],
  ['2024', '/editions/2024.html']
];

// 探针页：报告文档宽度、是否有横向溢出、卡片列数
const probe = `<!DOCTYPE html><meta charset="utf-8">
<pre id="out">pending</pre>
<script>
window.addEventListener('load', function(){
  setTimeout(function(){
    var d = document.documentElement;
    var overflowX = d.scrollWidth > d.clientWidth + 1;

    // 找出溢出的元素（宽度超出视口）
    var offenders = [];
    if (overflowX) {
      document.querySelectorAll('*').forEach(function(el){
        var r = el.getBoundingClientRect();
        if (r.width > 0 && r.right > d.clientWidth + 2) {
          offenders.push(el.tagName.toLowerCase() + (el.className && typeof el.className === 'string' ? '.' + el.className.split(' ')[0] : ''));
        }
      });
    }

    // 作品卡片实际列数
    var grid = document.querySelector('.grid--works');
    var cols = 0;
    if (grid) {
      cols = getComputedStyle(grid).gridTemplateColumns.split(' ').filter(Boolean).length;
    }

    // 页头是否换行过高
    var header = document.querySelector('.site-header__inner');
    var headerH = header ? Math.round(header.getBoundingClientRect().height) : 0;

    document.getElementById('out').textContent = JSON.stringify({
      vw: d.clientWidth,
      scrollW: d.scrollWidth,
      overflowX: overflowX,
      offenders: offenders.slice(0, 6),
      cols: cols,
      headerH: headerH
    });
  }, 700);
});
</script>`;

fs.writeFileSync(path.join(SITE, '__resp.html'), probe, 'utf8');

function run(url, w, h) {
  const profile = path.join(OUT, 'r-' + w + '-' + Math.random().toString(36).slice(2, 7));
  const args = [
    '--headless=new', '--disable-gpu', '--no-sandbox', '--hide-scrollbars',
    '--virtual-time-budget=12000',
    `--window-size=${w},${h}`,
    '--dump-dom',
    '--user-data-dir=' + profile,
    url
  ];
  const html = execFileSync(CHROME, args, { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
  const m = html.match(/<pre id="out">([\s\S]*?)<\/pre>/);
  if (!m) throw new Error('未取到探针输出');
  return JSON.parse(m[1].replace(/&quot;/g, '"').replace(/&amp;/g, '&'));
}

console.log('═'.repeat(72));
console.log('响应式实测：横向溢出 / 卡片列数');
console.log('═'.repeat(72));

let fail = 0;
for (const [name, p] of PAGES) {
  console.log(`\n[${name}]`);
  console.log('  宽度   视口  文档宽  溢出  卡片列数  页头高');
  for (const w of WIDTHS) {
    // 探针页负责设置尺寸；真实页面通过 window-size 控制视口
    try {
      const target = p === '/' ? BASE + '/__resp-embed.html?u=' + encodeURIComponent('/')
                               : BASE + '/__resp-embed.html?u=' + encodeURIComponent(p);
      fs.writeFileSync(path.join(SITE, '__resp-embed.html'),
        `<!DOCTYPE html><meta charset="utf-8">
<style>html,body{margin:0;height:100%}iframe{width:100%;height:100%;border:0}</style>
<iframe src="${p}"></iframe>
<pre id="out">pending</pre>
<script>
window.addEventListener('load', function(){
  setTimeout(function(){
    var f = document.querySelector('iframe');
    var d = f.contentDocument;
    var de = d.documentElement;
    var overflowX = de.scrollWidth > de.clientWidth + 1;
    var offenders = [];
    if (overflowX) {
      d.querySelectorAll('*').forEach(function(el){
        var r = el.getBoundingClientRect();
        if (r.width > 0 && r.right > de.clientWidth + 2) {
          offenders.push(el.tagName.toLowerCase() + (el.className && typeof el.className === 'string' ? '.' + el.className.split(' ')[0] : ''));
        }
      });
    }
    var grid = d.querySelector('.grid--works');
    var cols = grid ? getComputedStyle(grid).gridTemplateColumns.split(' ').filter(Boolean).length : 0;
    var header = d.querySelector('.site-header__inner');
    document.getElementById('out').textContent = JSON.stringify({
      vw: de.clientWidth, scrollW: de.scrollWidth, overflowX: overflowX,
      offenders: offenders.slice(0,5), cols: cols,
      headerH: header ? Math.round(header.getBoundingClientRect().height) : 0
    });
  }, 1200);
});
</script>`, 'utf8');

      const r = run(target, w, 900);
      const ok = !r.overflowX;
      if (!ok) fail++;
      console.log(`  ${String(w).padEnd(6)} ${String(r.vw).padEnd(6)} ${String(r.scrollW).padEnd(7)} ${(ok ? '无' : '有 ❌').padEnd(6)} ${String(r.cols).padEnd(9)} ${r.headerH}px` +
        (ok ? '' : `\n         溢出元素: ${r.offenders.join(', ')}`));
    } catch (e) {
      console.log(`  ${String(w).padEnd(6)} 测量失败: ${e.message.slice(0, 60)}`);
      fail++;
    }
  }
}

for (const f of ['__resp.html', '__resp-embed.html']) {
  try { fs.unlinkSync(path.join(SITE, f)); } catch (e) {}
}

console.log('\n' + '═'.repeat(72));
console.log(fail ? `❌ ${fail} 处横向溢出` : '✅ 所有宽度均无横向溢出');
process.exit(fail ? 1 : 0);
