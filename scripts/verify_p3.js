// scripts/verify_p3.js — Phase 3 数据中心验证
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
function ok(cond, msg) {
  if (cond) { pass++; lines.push('     PASS ' + msg); }
  else { fail++; lines.push('     FAIL ' + msg); }
}
function section(t) { lines.push('\n# ' + t); }

function probe(src, script) {
  const inject = [
    '<script>',
    'window.addEventListener("load", function () {',
    '  setTimeout(function () {',
    '    var out;',
    '    try { out = (function(){ ' + script + ' })(); }',
    '    catch (e) { out = { __error: String(e && e.stack || e) }; }',
    '    var pre = document.createElement("pre");',
    '    pre.id = "__probe";',
    '    pre.textContent = JSON.stringify(out);',
    '    document.body.appendChild(pre);',
    '  }, 2500);',
    '});',
    '<\/script>'
  ].join('\n');

  const safe = src.replace(/[\/.]/g, '_');
  const file = '__p3_' + safe + '.html';
  const orig = fs.readFileSync(path.join(SITE, src), 'utf8');
  fs.writeFileSync(path.join(SITE, file), orig.replace('</body>', inject + '</body>'), 'utf8');
  try {
    const html = execFileSync(CHROME, [
      '--headless=new', '--disable-gpu', '--no-sandbox', '--hide-scrollbars',
      '--virtual-time-budget=13000', '--window-size=1440,1400',
      '--dump-dom', '--user-data-dir=' + freshProfile(OUT, 'p3'),
      BASE + '/' + file
    ], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
    const m = html.match(/<pre id="__probe">([\s\S]*?)<\/pre>/);
    if (!m) return { __error: 'no probe output' };
    return JSON.parse(m[1].replace(/&quot;/g, '"').replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<').replace(/&gt;/g, '>'));
  } finally {
    try { fs.unlinkSync(path.join(SITE, file)); } catch (e) {}
  }
}

console.log('='.repeat(74));
console.log('Phase 3 verification (data center)');
console.log('='.repeat(74));

// ============================================================ 1. structure
section('Data center - structure');
{
  const r = probe('data.html', `
    return {
      sections: document.querySelectorAll('.data-sec').length,
      titles: Array.prototype.map.call(document.querySelectorAll('.data-sec__title'),
        function (e) { return e.textContent; }),
      overviewGroups: document.querySelectorAll('.data-sec:first-of-type .data-sec__h3').length,
      stats: document.querySelectorAll('stat-block').length,
      stackCharts: document.querySelectorAll('.chart-stack').length,
      barCharts: document.querySelectorAll('.chart-bars').length,
      donuts: document.querySelectorAll('.chart-donut').length,
      networks: document.querySelectorAll('.chart-net svg').length,
      tables: document.querySelectorAll('table.dt').length,
      // 确保没有任何按实体数量排序的排行区块。
      // 注意：不能用全文搜关键词 —— 「高校统计」会命中源码注释里的说明文字，
      // 而「社团」等词本来就会出现在别处。必须只看**渲染出的标题元素**。
      hasSchoolRank: Array.prototype.some.call(
        document.querySelectorAll('.data-sec__title, .data-sec__h3'),
        function (e) { return e.textContent.indexOf('高校统计') >= 0; }),
      hasClubRank: Array.prototype.some.call(
        document.querySelectorAll('.data-sec__title, .data-sec__h3'),
        function (e) { return e.textContent.indexOf('社团') >= 0 && e.textContent.indexOf('排行') >= 0; }),
      // 收录概念三件套
      collectCards: document.querySelectorAll('.collect-card').length,
      collectListItems: document.querySelectorAll('.collect-list li').length,
      collectTableRows: document.querySelectorAll('table.dt--collect tbody tr').length,
      hasCollectionApi: typeof window.VCCollection
    };
  `);

  ok(!r.__error, 'loads without error' + (r.__error ? ' -> ' + String(r.__error).slice(0, 180) : ''));
  ok(r.sections === 9, '9 sections incl. about (got ' + r.sections + ')');
  ['总览', '收录说明', '收录口径', '按期收录', '创作趋势', '类型统计', '歌声统计', '合作网络', '关于这些数据']
    .forEach(function (t) {
      ok((r.titles || []).indexOf(t) >= 0, 'has section "' + t + '"');
    });
  // 高校统计（含社团收录排行）已按要求移除
  ok((r.titles || []).indexOf('高校统计') < 0, 'has NO section "高校统计" (removed)');
  ok(r.overviewGroups === 4, 'overview split into 4 groups (got ' + r.overviewGroups + ')');
  ok(r.stats >= 16, r.stats + ' overview stat blocks (>=16)');
  ok(r.stackCharts === 2, '2 stacked bar charts (trend + per-edition) (got ' + r.stackCharts + ')');
  ok(r.barCharts >= 3, r.barCharts + ' horizontal bar charts (>=3)');
  ok(r.donuts === 1, '1 donut chart (got ' + r.donuts + ')');
  ok(r.networks === 1, '1 network graph (got ' + r.networks + ')');
  ok(r.tables === 2, '2 data tables (type + per-edition) (got ' + r.tables + ')');
  ok(!r.hasSchoolRank, 'no "高校统计" section rendered');
  ok(!r.hasClubRank, 'no "社团收录排行" rendered');

  // 收录概念
  ok(r.collectCards >= 5, r.collectCards + ' collection rule cards (>=5)');
  ok(r.collectListItems >= 4, r.collectListItems + ' methodology bullets (>=4)');
  ok(r.collectTableRows === 6, 'per-edition table 6 rows (5 editions + total) (got ' +
    r.collectTableRows + ')');
  ok(r.hasCollectionApi === 'object', 'VCCollection API loaded');
}

// ============================================================ 2. numbers
section('Data center - computed numbers');
{
  const r = probe('data.html', `
    var txt = document.body.textContent;
    return {
      has108: txt.indexOf('108') >= 0,
      donutTotal: (document.querySelector('.chart-donut__total')||{}).textContent,
      legend: Array.prototype.map.call(document.querySelectorAll('.chart-legend__item'),
        function (e) { return e.textContent.replace(/\\s+/g, ''); }),
      // 表格合计行
      totalRow: (function () {
        var tr = document.querySelector('.dt__total');
        return tr ? Array.prototype.map.call(tr.children, function (td) { return td.textContent; }) : null;
      })(),
      // 堆叠柱的年份标签。
      // 用「按标题定位」而不是 nth-of-type —— 区块顺序会随功能增删变化，
      // 写死序号会在插入新区块后静默指错对象（曾因此误报）。
      yearLabels: (function () {
        var secs = document.querySelectorAll('.data-sec');
        for (var i = 0; i < secs.length; i++) {
          var t = secs[i].querySelector('.data-sec__title');
          if (t && t.textContent === '创作趋势') {
            return Array.prototype.map.call(secs[i].querySelectorAll('.chart-stack__label'),
              function (e) { return e.textContent; });
          }
        }
        return [];
      })(),
      // 网络节点数（类名在 charts.js 中为 net__node / net__edge）
      netNodes: document.querySelectorAll('.chart-net .net__node').length,
      netEdges: document.querySelectorAll('.chart-net .net__edge').length
    };
  `);

  ok(r.donutTotal === '108', 'donut total = 108 (got ' + r.donutTotal + ')');
  // .chart-legend__item 同时命中环形图图例与行内图例，故取 ≥4
  ok(r.legend.length >= 4, 'legend has >=4 entries (got ' + r.legend.length + ')');
  ok(r.legend.join('|').indexOf('原创40') >= 0, 'legend shows 原创 40');
  ok(r.legend.join('|').indexOf('翻调24') >= 0, 'legend shows 翻调 24');
  ok(r.legend.join('|').indexOf('人声翻唱40') >= 0, 'legend shows 人声翻唱 40');
  ok(r.legend.join('|').indexOf('乐器翻奏4') >= 0, 'legend shows 乐器翻奏 4');

  // 类型表合计：OC40 RT24 VC40 IC4 合计108（DW 列为 —）
  if (r.totalRow) {
    const nums = r.totalRow.filter(x => /^\d+$/.test(x.trim())).map(Number);
    ok(nums.indexOf(108) >= 0, 'table total row contains 108 (got ' + JSON.stringify(r.totalRow) + ')');
  } else ok(false, 'table total row exists');

  ok(r.yearLabels.indexOf('2024') >= 0 && r.yearLabels.indexOf('2025') >= 0 && r.yearLabels.indexOf('2026') >= 0,
    'trend includes 2024/2025/2026 (got ' + r.yearLabels.join(',') + ')');
  ok(r.netNodes > 0, r.netNodes + ' network nodes');
  ok(r.netEdges > 0, r.netEdges + ' network edges');
}

// ============================================================ 3. no map
section('Data center - map intentionally omitted');
{
  const r = probe('data.html', `
    return {
      hasMap: !!document.querySelector('.chart-map, #map, [class*="map"]'),
      mentionsOmit: document.body.textContent.indexOf('不提供地域分布地图') >= 0
    };
  `);
  ok(!r.hasMap, 'no map component rendered (per curator decision)');
  ok(r.mentionsOmit, 'explicitly notes map is omitted');
}

// ============================================================ 4. links
section('Data center - links to Phase 2 pages');
{
  const r = probe('data.html', `
    var links = Array.prototype.map.call(document.querySelectorAll('a[href]'),
      function (a) { return a.getAttribute('href'); });
    return {
      works: links.filter(function (h) { return h.indexOf('works.html') === 0; }).length,
      schools: links.filter(function (h) { return h.indexOf('schools/') === 0; }).length,
      clubs: links.filter(function (h) { return h.indexOf('clubs/') === 0; }).length,
      vocals: links.filter(function (h) { return h.indexOf('vocals/') === 0; }).length,
      editions: links.filter(function (h) { return h.indexOf('editions/') === 0; }).length,
      dataFiles: links.filter(function (h) { return h.indexOf('data/') === 0; }).length
    };
  `);
  ok(r.works > 0, r.works + ' links to works library');
  ok(r.schools > 0, r.schools + ' links to school archives');
  ok(r.clubs > 0, r.clubs + ' links to club archives');
  ok(r.vocals > 0, r.vocals + ' links to vocal archives');
  ok(r.editions > 0, r.editions + ' links to editions');
  ok(r.dataFiles > 0, r.dataFiles + ' links to raw data (traceability)');
}

// ============================================================ 5. nav
section('Navigation - data center reachable from all page types');
{
  for (const [label, src] of [
    ['home', 'index.html'],
    ['edition', 'editions/2026-vol2.html'],
    ['works', 'works.html'],
    ['schools', 'schools/index.html'],
    ['clubs', 'clubs/index.html'],
    ['vocals', 'vocals/index.html'],
    ['sp', 'sp.html']
  ]) {
    const html = fs.readFileSync(path.join(SITE, src), 'utf8');
    const hasData = /href="(\.\.\/)?data\.html"/.test(html);
    ok(hasData, label + ' nav links to data.html');
  }
}

// ============================================================ 6. files
section('Files');
{
  ok(fs.existsSync(path.join(SITE, 'data.html')), 'data.html exists');
  ok(fs.existsSync(path.join(SITE, 'assets/js/charts.js')), 'charts.js exists');
  ok(fs.existsSync(path.join(SITE, 'assets/js/page-data.js')), 'page-data.js exists');
  ok(fs.existsSync(path.join(SITE, 'assets/css/charts.css')), 'charts.css exists');
  const n = fs.readdirSync(SITE).filter(f => f.endsWith('.html')).length;
  ok(n === 5, 'site root has 5 html pages (index/works/sp/about/data) (got ' + n + ')');
  // 防止调试脚本遗留的临时页面被误提交
  const strays = fs.readdirSync(SITE).filter(f => /^__/.test(f));
  ok(strays.length === 0, 'no leftover temp files in site root' +
    (strays.length ? ' (found: ' + strays.join(', ') + ')' : ''));
}

console.log(lines.join('\n'));
console.log('\n' + '='.repeat(74));
console.log('passed ' + pass + ' / ' + (pass + fail));
process.exit(fail ? 1 : 0);
