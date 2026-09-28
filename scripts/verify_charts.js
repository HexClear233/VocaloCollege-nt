// scripts/verify_charts.js — 验证图表样式真的生效（计算样式，非目视）
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

let pass = 0, fail = 0;
const lines = [];
function ok(c, m) { if (c) { pass++; lines.push('     PASS ' + m); } else { fail++; lines.push('     FAIL ' + m); } }

function probe(src, script) {
  const inject = ['<script>',
    'window.addEventListener("load", function () {',
    '  setTimeout(function () {',
    '    var out; try { out = (function(){ ' + script + ' })(); }',
    '    catch (e) { out = { __error: String(e && e.stack || e) }; }',
    '    var pre = document.createElement("pre");',
    '    pre.id = "__probe"; pre.textContent = JSON.stringify(out);',
    '    document.body.appendChild(pre);',
    '  }, 2500);',
    '});', '<\/script>'].join('\n');
  const safe = src.replace(/[\/.]/g, '_');
  const file = '__ch_' + safe + '.html';
  const orig = fs.readFileSync(path.join(SITE, src), 'utf8');
  fs.writeFileSync(path.join(SITE, file), orig.replace('</body>', inject + '</body>'), 'utf8');
  try {
    const html = execFileSync(CHROME, [
      '--headless=new', '--disable-gpu', '--no-sandbox', '--hide-scrollbars',
      '--virtual-time-budget=13000', '--window-size=1440,1400',
      '--dump-dom', '--user-data-dir=' + freshProfile(OUT, 'charts'),
      BASE + '/' + file
    ], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
    const m = html.match(/<pre id="__probe">([\s\S]*?)<\/pre>/);
    if (!m) return { __error: 'no probe' };
    return JSON.parse(m[1].replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>'));
  } finally { try { fs.unlinkSync(path.join(SITE, file)); } catch (e) {} }
}

const SCRIPT = `
  function cs(el, prop) { return el ? getComputedStyle(el)[prop] : null; }
  var edge = document.querySelector('.chart-net .net__edge');
  var circ = document.querySelector('.chart-net .net__node circle');
  var txt  = document.querySelector('.chart-net .net__node text');
  var seg  = document.querySelector('.chart-stack__seg');
  var fill = document.querySelector('.chart-bars__fill');
  var dseg = document.querySelector('.chart-donut__seg');
  var dtot = document.querySelector('.chart-donut__total');
  var hint = document.querySelector('.chart-net__hint');
  return {
    edgeStroke: cs(edge, 'stroke'),
    edgeOpacity: cs(edge, 'strokeOpacity'),
    circleFill: cs(circ, 'fill'),
    textAnchor: cs(txt, 'textAnchor'),
    textFill: cs(txt, 'fill'),
    segBg: cs(seg, 'backgroundColor'),
    barBg: cs(fill, 'backgroundColor'),
    donutStroke: cs(dseg, 'stroke'),
    donutStrokeW: cs(dseg, 'strokeWidth'),
    donutTotalFill: cs(dtot, 'fill'),
    hintAlign: cs(hint, 'textAlign'),
    hintExists: !!hint,
    edgeCount: document.querySelectorAll('.chart-net .net__edge').length,
    nodeCount: document.querySelectorAll('.chart-net .net__node').length
  };
`;

console.log('='.repeat(74));
console.log('Chart styling verification (computed styles)');
console.log('='.repeat(74) + '\n');

const r = probe('data.html', SCRIPT);
if (r.__error) { console.log('  ERROR: ' + String(r.__error).slice(0, 300)); process.exit(1); }

ok(r.edgeCount > 0 && r.nodeCount > 0, 'network has ' + r.edgeCount + ' edges / ' + r.nodeCount + ' nodes');
ok(r.edgeStroke && r.edgeStroke !== 'none', 'edge stroke applied: ' + r.edgeStroke);
ok(r.circleFill && r.circleFill !== 'none', 'node fill applied: ' + r.circleFill);
ok(r.textFill && r.textFill !== 'none', 'node label fill applied: ' + r.textFill);
ok(r.textAnchor === 'middle', 'node label centered (text-anchor=' + r.textAnchor + ')');
ok(r.hintExists, 'network hint element exists');

ok(r.segBg && r.segBg !== 'rgba(0, 0, 0, 0)', 'stacked bar segment colored: ' + r.segBg);
ok(r.barBg && r.barBg !== 'rgba(0, 0, 0, 0)', 'bar fill colored: ' + r.barBg);
ok(r.donutStroke && r.donutStroke !== 'none', 'donut segment stroked: ' + r.donutStroke);
ok(parseFloat(r.donutStrokeW) > 5, 'donut stroke width ' + r.donutStrokeW + ' (>5)');
ok(r.donutTotalFill && r.donutTotalFill !== 'none', 'donut total text filled: ' + r.donutTotalFill);

console.log(lines.join('\n'));
console.log('\n' + '='.repeat(74));
console.log('passed ' + pass + ' / ' + (pass + fail));
process.exit(fail ? 1 : 0);
