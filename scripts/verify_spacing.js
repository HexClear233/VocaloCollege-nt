// scripts/verify_spacing.js — 实测期页面左右留白与容器宽度
// 修复目标：期页面此前用满宽容器，读起来过于紧凑
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

const CASES = [
  ['期页面', '/editions/2026-vol2.html'],
  ['首页', '/index.html']
];

const wrapper = (target, w) => `<!DOCTYPE html><meta charset="utf-8">
<style>html,body{margin:0;padding:0}#frame{width:${w}px;height:1200px;border:0;display:block}</style>
<iframe id="frame" src="${target}"></iframe>
<pre id="out">pending</pre>
<script>
window.addEventListener('load', function () {
  setTimeout(function () {
    var d = document.getElementById('frame').contentDocument;
    var de = d.documentElement;
    var vw = de.clientWidth;

    // 取第一个作品卡片的实际内容宽度，以及容器左右边距
    var wc = d.querySelector('.wc');
    var card = wc ? wc.getBoundingClientRect() : null;

    // 容器：找到承载卡片的 .wrap
    var wrap = d.querySelector('.edition-layout') || d.querySelector('main .wrap');
    var wr = wrap ? wrap.getBoundingClientRect() : null;
    var ws = wrap ? getComputedStyle(wrap) : null;

    // 内容区（卡片网格）左右边界
    var grid = d.querySelector('.grid--works');
    var gr = grid ? grid.getBoundingClientRect() : null;

    document.getElementById('out').textContent = JSON.stringify({
      vw: vw,
      wrapWidth: wr ? Math.round(wr.width) : -1,
      wrapLeft: wr ? Math.round(wr.left) : -1,
      wrapRight: wr ? Math.round(vw - wr.right) : -1,
      padL: ws ? ws.paddingLeft : '',
      padR: ws ? ws.paddingRight : '',
      gridLeft: gr ? Math.round(gr.left) : -1,
      gridRight: gr ? Math.round(vw - gr.right) : -1,
      scrollW: de.scrollWidth,
      overflowX: de.scrollWidth > vw + 1
    });
  }, 1600);
});
</script>`;

console.log('═'.repeat(76));
console.log('期页面留白实测');
console.log('═'.repeat(76));

let fail = 0;
const data = {};

for (const [label, target] of CASES) {
  console.log(`\n[${label}]  ${target}`);
  console.log('  视口   容器宽  左留白  右留白  网格左  网格右  溢出');
  for (const w of [768, 1024, 1280, 1440, 1920]) {
    const file = `__sp_${w}.html`;
    fs.writeFileSync(path.join(SITE, file), wrapper(target, w), 'utf8');
    let r;
    try {
      const html = execFileSync(CHROME, [
        '--headless=new', '--disable-gpu', '--no-sandbox', '--hide-scrollbars',
        '--virtual-time-budget=12000', '--window-size=1600,1300',
        '--dump-dom', '--user-data-dir=' + freshProfile(OUT, 'spacing'),
        BASE + '/' + file
      ], { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
      const m = html.match(/<pre id="out">([\s\S]*?)<\/pre>/);
      r = JSON.parse(m[1].replace(/&quot;/g, '"').replace(/&amp;/g, '&'));
    } catch (e) {
      console.log(`  ${w} 失败: ${e.message.slice(0, 50)}`);
      fail++;
      continue;
    } finally {
      try { fs.unlinkSync(path.join(SITE, file)); } catch (e) {}
    }
    data[label + w] = r;
    const ok = !r.overflowX;
    if (!ok) fail++;
    console.log(`  ${String(w).padEnd(6)} ${String(r.wrapWidth).padEnd(7)} ${String(r.wrapLeft).padEnd(7)} ` +
      `${String(r.wrapRight).padEnd(7)} ${String(r.gridLeft).padEnd(7)} ${String(r.gridRight).padEnd(7)} ${ok ? '无' : '有❌'}`);
  }
}

console.log('\n' + '═'.repeat(76));
console.log('留白断言：');
const asserts = [];

// 1280 下期页容器应明显窄于视口（此前是 ~1240 满宽）
const e1280 = data['期页面1280'];
const i1280 = data['首页1280'];
if (e1280 && i1280) {
  asserts.push(['期页容器 ≤1080px（原为满宽 ~1240）', e1280.wrapWidth <= 1080]);
  asserts.push(['期页左右留白各 ≥100px', e1280.wrapLeft >= 100 && e1280.wrapRight >= 100]);
  asserts.push(['期页容器比首页窄', e1280.wrapWidth < i1280.wrapWidth]);
  asserts.push(['期页网格左右不均 ≤2px（居中）', Math.abs(e1280.gridLeft - e1280.gridRight) <= 2]);
}
const e1920 = data['期页面1920'];
if (e1920) {
  asserts.push(['1920 下期页留白充裕（≥250px）', e1920.wrapLeft >= 250]);
}
const e768 = data['期页面768'];
if (e768) {
  asserts.push(['768 下期页释放为全宽（容器≈视口）', Math.abs(e768.wrapWidth - e768.vw) <= 40]);
}
asserts.push(['全程无横向溢出', Object.values(data).every(r => !r.overflowX)]);

for (const [n, ok] of asserts) {
  console.log(`  ${ok ? '✅' : '❌'} ${n}`);
  if (!ok) fail++;
}

console.log('\n' + '═'.repeat(76));
console.log(fail ? `❌ ${fail} 项未通过` : '✅ 全部通过');
process.exit(fail ? 1 : 0);
