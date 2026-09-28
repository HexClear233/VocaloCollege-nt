// scripts/verify_p4.js — Phase 4 自动化验证
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
const DATA = path.join(__dirname, '..', 'data');
const OUT = path.join(__dirname, '..', '.verify');
fs.mkdirSync(OUT, { recursive: true });

let pass = 0, fail = 0;
const lines = [];
function ok(c, m) { if (c) { pass++; lines.push('     PASS ' + m); } else { fail++; lines.push('     FAIL ' + m); } }
function section(t) { lines.push('\n# ' + t); }

function probe(src, script) {
  const inject = ['<script>',
    'window.addEventListener("load", function () {',
    '  setTimeout(function () {',
    '    var out; try { out = (function(){ ' + script + ' })(); }',
    '    catch (e) { out = { __error: String(e && e.stack || e) }; }',
    '    var pre = document.createElement("pre");',
    '    pre.id = "__p4"; pre.textContent = JSON.stringify(out);',
    '    document.body.appendChild(pre);',
    '  }, 2600);',
    '});', '<\/script>'].join('\n');
  const safe = src.replace(/[\/.]/g, '_');
  const file = '__p4_' + safe + '.html';
  const orig = fs.readFileSync(path.join(SITE, src), 'utf8');
  const depth = src.split('/').length - 1;
  let patched = orig.replace('data-root=".."', 'data-root="."');
  if (depth > 0) patched = patched.replace(/(href|src)="\.\.\//g, '$1="');
  fs.writeFileSync(path.join(SITE, file), patched.replace('</body>', inject + '</body>'), 'utf8');
  // 每次用全新的 user-data-dir —— 复用 profile 会命中 HTTP 缓存，
  // 导致「改了 JS 但测试仍按旧脚本判定」，产生假通过/假失败。
  const profile = freshProfile(OUT, 'p4-' + safe);
  try {
    const html = execFileSync(CHROME, [
      '--headless=new', '--disable-gpu', '--no-sandbox', '--hide-scrollbars',
      '--disk-cache-size=1',
      '--virtual-time-budget=13000', '--window-size=1440,1400',
      '--dump-dom', '--user-data-dir=' + profile,
      BASE + '/' + file
    ], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
    const m = html.match(/<pre id="__p4">([\s\S]*?)<\/pre>/);
    return m ? JSON.parse(m[1].replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')) : { __error: 'no probe' };
  } finally { try { fs.unlinkSync(path.join(SITE, file)); } catch (e) {} }
}

console.log('='.repeat(74));
console.log('Phase 4 verification (automation)');
console.log('='.repeat(74));

// ============================================================ 1. 统计文件
section('Auto statistics - data/statistics.json');
{
  const p = path.join(DATA, 'statistics.json');
  ok(fs.existsSync(p), 'statistics.json exists');
  const S = JSON.parse(fs.readFileSync(p, 'utf8'));
  ok(S.schema === 'vocalocollege/statistics/1.0', 'schema ok: ' + S.schema);
  ok(!!S.generated_at, 'has generated_at: ' + S.generated_at);
  ok(S.overview.works === 108, 'overview.works = 108 (got ' + S.overview.works + ')');
  ok(S.overview.schools === 44, 'overview.schools = 44 (got ' + S.overview.schools + ')');
  ok(S.overview.clubs === 51, 'overview.clubs = 51 (got ' + S.overview.clubs + ')');
  ok(S.overview.vocals === 33, 'overview.vocals = 33 (got ' + S.overview.vocals + ')');
  ok(S.overview.OC === 40 && S.overview.RT === 24 && S.overview.VC === 40 && S.overview.IC === 4,
    'type counts OC40/RT24/VC40/IC4');
  ok(S.overview.sp === 3, 'SP = 3 (got ' + S.overview.sp + ')');
  ok(S.policy.counts_platform_metrics === false, 'policy: does NOT count platform metrics');
  ok(S.policy.contains_rankings === false, 'policy: contains no rankings');
  // 不得出现任何平台指标字段
  const raw = fs.readFileSync(p, 'utf8');
  ok(!/"(view|like|coin|favorite|danmaku|share)"\s*:/.test(raw),
    'statistics.json has no platform metric fields');
  // 分部数据齐全
  ['byYear', 'byEdition', 'byVocal', 'bySchool', 'byClub', 'byCollaboration'].forEach(function (k) {
    ok(Array.isArray(S[k]) && S[k].length > 0, 'has ' + k + ' (' + (S[k] || []).length + ')');
  });
}

// ============================================================ 2. 快照
section('Data snapshots');
{
  const dir = path.join(DATA, 'snapshots');
  ok(fs.existsSync(dir), 'snapshots/ exists');
  const files = fs.readdirSync(dir).filter(f => /^\d{4}-\d{2}-\d{2}\.json$/.test(f));
  ok(files.length >= 1, files.length + ' dated snapshot(s)');
  const idx = JSON.parse(fs.readFileSync(path.join(dir, 'index.json'), 'utf8'));
  ok(idx.schema === 'vocalocollege/snapshot-index/1.0', 'index schema ok');
  ok(idx.count === files.length, 'index.count matches files (' + idx.count + ')');
  ok(idx.series.length === files.length, 'series has ' + idx.series.length + ' entries');
  ok(!!idx.latest, 'latest = ' + idx.latest);
  const s = idx.series[0];
  ['date', 'works', 'schools', 'clubs', 'vocals'].forEach(function (k) {
    ok(s[k] != null, 'snapshot has ' + k + ' = ' + s[k]);
  });
  // 主索引写回了更新日期
  const main = JSON.parse(fs.readFileSync(path.join(DATA, 'index.json'), 'utf8'));
  ok(!!main.data_updated_at, 'data/index.json has data_updated_at = ' + main.data_updated_at);
}

// ============================================================ 3. B站隔离
section('Bilibili data - collected but NOT displayed');
{
  const bp = path.join(DATA, 'bilibili_stats.json');
  ok(fs.existsSync(bp), 'data/bilibili_stats.json exists (collection ran)');
  if (fs.existsSync(bp)) {
    const B = JSON.parse(fs.readFileSync(bp, 'utf8'));
    ok(B.policy.displayed_on_site === false, 'policy.displayed_on_site = false');
    ok(B.policy.used_in_rankings === false, 'policy.used_in_rankings = false');
    ok(B.policy.merged_into_statistics === false, 'policy.merged_into_statistics = false');
    ok(Array.isArray(B.notice) && B.notice.length > 0, 'has usage notice');
  }
  // 关键：不得出现在站点目录
  ok(!fs.existsSync(path.join(SITE, 'data', 'bilibili_stats.json')),
    'NOT synced to site/data/ (excluded)');
  // 关键：网站代码不得引用
  const jsFiles = fs.readdirSync(path.join(SITE, 'assets', 'js'));
  let referenced = false;
  jsFiles.forEach(function (f) {
    const c = fs.readFileSync(path.join(SITE, 'assets', 'js', f), 'utf8');
    if (/bilibili_stats|bilibili-stats/.test(c)) referenced = true;
  });
  ok(!referenced, 'no site JS references bilibili data');
  // statistics.json 不得含平台指标
  const S = JSON.parse(fs.readFileSync(path.join(DATA, 'statistics.json'), 'utf8'));
  ok(S.policy.counts_platform_metrics === false, 'statistics declares no platform metrics');
}

// ============================================================ 4. 数据更新日期与年报入口
section('Site shows data update date + report entry');
{
  const d = probe('data.html', `
    // 注意：document.body.textContent 会包含 <script> 的源码，
    // 探针自己的脚本里就写着「年度报告」，直接用会自匹配造成假结果。
    // 因此先剔除 script/style，再取可见文本。
    var clone = document.body.cloneNode(true);
    Array.prototype.forEach.call(clone.querySelectorAll('script,style'), function (n) {
      n.parentNode.removeChild(n);
    });
    var t = clone.textContent;
    return {
      hasUpdated: t.indexOf('Data updated') >= 0,
      hasReportLink: !!document.querySelector('a[href="reports/index.html"]'),
      hasReportWord: t.indexOf('年度报告') >= 0
    };
  `);
  ok(d.hasUpdated, 'data center shows "Data updated: ..."');
  ok(d.hasReportLink, 'data center links to annual reports');
  ok(d.hasReportWord, 'data center mentions 年度报告');
}

// ============================================================ 5. 年报数据与页面
section('Annual reports - data/reports/');
{
  const dir = path.join(DATA, 'reports');
  ok(fs.existsSync(dir), 'data/reports/ exists');

  const files = fs.readdirSync(dir).filter(f => /^\d{4}\.json$/.test(f));
  ok(files.length === 8, '8 year reports (got ' + files.length + ')');

  const idx = JSON.parse(fs.readFileSync(path.join(dir, 'index.json'), 'utf8'));
  ok(idx.years.length === files.length, 'report index has ' + idx.years.length + ' entries');

  const r2026 = JSON.parse(fs.readFileSync(path.join(dir, '2026.json'), 'utf8'));
  ok(r2026.year === 2026, 'report year = 2026');
  ok(r2026.summary.works === 48, '2026 works = 48 (got ' + r2026.summary.works + ')');
  ok(r2026.works.length === r2026.summary.works, 'works list matches summary');
  ok(Array.isArray(r2026.statement) && r2026.statement.length > 0,
    'has "record not ranking" statement');
  ok(Array.isArray(r2026.worksByVocal) && r2026.worksByVocal.length > 0,
    'keeps worksByVocal (' + (r2026.worksByVocal || []).length + ')');

  // 栏目方要求：不得提供按作品数排序的院校/社团榜
  ok(!('worksByClub' in r2026), 'report has NO worksByClub');
  ok(!('worksBySchool' in r2026), 'report has NO worksBySchool');
  ok(typeof r2026.summary.schools === 'number' && typeof r2026.summary.clubs === 'number',
    'summary still reports school/club counts (' +
    r2026.summary.schools + '/' + r2026.summary.clubs + ')');

  // 方案十四：不得出现评比性字段（按结构判断，不能全文搜词 ——
  // statement 本身就会写「不设『年度最佳…』」，那是声明而非评比内容）
  const RANKING_KEYS = /^(best|top|rank|ranking|score|rating|leaderboard)/i;
  const rankingKeys = [];
  (function walk(o, pathStr) {
    if (!o || typeof o !== 'object') return;
    if (Array.isArray(o)) { o.forEach((v, i) => walk(v, pathStr + '[' + i + ']')); return; }
    Object.keys(o).forEach(function (k) {
      if (RANKING_KEYS.test(k)) rankingKeys.push(pathStr + '.' + k);
      walk(o[k], pathStr + '.' + k);
    });
  })(r2026, '$');
  ok(rankingKeys.length === 0, 'no ranking-like fields in report structure (found: ' +
    (rankingKeys.join(', ') || 'none') + ')');
}

// ============================================================ 6. 报告页渲染
section('Report pages render');
{
  const list = probe('reports/index.html', `
    var clone = document.body.cloneNode(true);
    Array.prototype.forEach.call(clone.querySelectorAll('script,style'), function (n) {
      n.parentNode.removeChild(n);
    });
    return {
      title: (document.querySelector('.archive-head__title')||{}).textContent || '',
      stats: document.querySelectorAll('stat-block').length,
      hasNoRanking: clone.textContent.indexOf('不是评比') >= 0 ||
                    clone.textContent.indexOf('不做实力排名') >= 0,
      cards: document.querySelectorAll('work-card').length,
      charts: document.querySelectorAll('.chart-bars').length,
      failed: clone.textContent.indexOf('加载失败') >= 0
    };
  `);
  ok(!list.__error, 'report index loads' + (list.__error ? ' -> ' + String(list.__error).slice(0, 160) : ''));
  ok(!list.failed, 'report index has no load error');
  ok(/2026/.test(list.title), 'index shows latest year 2026: "' + list.title + '"');
  ok(list.stats >= 10, list.stats + ' overview stat blocks');
  ok(list.hasNoRanking, 'states it is not a ranking');
  ok(list.charts > 0, list.charts + ' charts rendered');
  ok(list.cards > 0, list.cards + ' work cards rendered');

  const y = probe('reports/2026.html', `
    var clone = document.body.cloneNode(true);
    Array.prototype.forEach.call(clone.querySelectorAll('script,style'), function (n) {
      n.parentNode.removeChild(n);
    });
    var titles = Array.prototype.map.call(document.querySelectorAll('.data-sec__title'),
      function (e) { return e.textContent; });
    return {
      title: (document.querySelector('.archive-head__title')||{}).textContent || '',
      stats: document.querySelectorAll('stat-block').length,
      groups: document.querySelectorAll('.data-sec__h3').length,
      cards: document.querySelectorAll('work-card').length,
      tags: document.querySelectorAll('.tag').length,
      titles: titles,
      hasOverview: titles.indexOf('收录概览') >= 0,
      // 「参与高校」「参与社团」作为**统计块的计数标签**是保留的
      // （只给"有多少"，不给"谁多"），故只能看是否存在以它们为标题的 section
      hasClubRank: titles.some(function (t) { return t.indexOf('参与社团') >= 0; }),
      hasSchoolRank: titles.some(function (t) { return t.indexOf('参与高校') >= 0; }),
      hasVocalList: titles.indexOf('使用的歌声') >= 0,
      hasExplain: titles.indexOf('收录说明') >= 0,
      collectCards: document.querySelectorAll('.collect-card').length,
      collectListItems: document.querySelectorAll('.collect-list li').length,
      hasCollectionApi: typeof window.VCCollection,
      yearButtons: document.querySelectorAll('.report-years a').length,
      failed: clone.textContent.indexOf('加载失败') >= 0
    };
  `);
  ok(!y.__error, '2026 report loads' + (y.__error ? ' -> ' + String(y.__error).slice(0, 160) : ''));
  ok(!y.failed, '2026 report has no load error');
  ok(/2026/.test(y.title), 'title mentions 2026: "' + y.title + '"');
  ok(y.hasOverview, 'has "收录概览" section');
  ok(y.hasExplain, 'has "收录说明" section');
  ok(y.groups >= 4, y.groups + ' overview groups (>=4)');
  ok(y.stats >= 14, y.stats + ' stat blocks (>=14)');
  ok(y.collectCards >= 4, y.collectCards + ' collection rule cards (>=4)');
  ok(y.collectListItems >= 4, y.collectListItems + ' methodology bullets (>=4)');
  ok(y.hasCollectionApi === 'object', 'VCCollection API loaded');
  ok(y.tags > 0, y.tags + ' new-entity tags');
  ok(y.cards > 0, y.cards + ' work cards');
  ok(!y.hasClubRank, 'NO "参与社团" ranking section');
  ok(!y.hasSchoolRank, 'NO "参与高校" ranking section');
  ok(y.hasVocalList, 'keeps "使用的歌声" list');
  ok(y.yearButtons === 9, 'year switcher has 9 buttons (back + 8 years) (got ' + y.yearButtons + ')');

  // 指定年份入口
  const y15 = probe('reports/2015.html', `
    return { title: (document.querySelector('.archive-head__title')||{}).textContent || '',
             cards: document.querySelectorAll('work-card').length };
  `);
  ok(/2015/.test(y15.title), 'per-year page reports/2015.html shows 2015: "' + y15.title + '"');
  ok(y15.cards === 2, '2015 report renders 2 works (got ' + y15.cards + ')');
}

// ============================================================ 7. 年报文件与 CLI
section('Annual report files and CLI');
{
  ok(fs.existsSync(path.join(__dirname, 'build_annual_report.js')),
    'scripts/build_annual_report.js exists');
  ok(fs.existsSync(path.join(SITE, 'assets', 'js', 'page-report.js')),
    'site/assets/js/page-report.js exists');
  ok(fs.existsSync(path.join(SITE, 'reports')), 'site/reports/ exists');

  const rep = fs.readdirSync(path.join(SITE, 'reports')).filter(f => f.endsWith('.html')).length;
  ok(rep === 9, 'site/reports/ has 9 pages (index + 8 years) (got ' + rep + ')');

  const bj = fs.readFileSync(path.join(__dirname, 'build_all.js'), 'utf8');
  ok(bj.indexOf('build_annual_report') >= 0, 'build_all.js runs the report builder');

  const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8'));
  ok(!!pkg.scripts['data:report'], 'package.json has data:report script');

  // 导航可达性
  ['index.html', 'data.html', 'works.html', 'editions/2026-vol2.html'].forEach(function (p) {
    const html = fs.readFileSync(path.join(SITE, p), 'utf8');
    ok(/href="(\.\.\/)?reports\/index\.html"/.test(html), p + ' nav links to reports');
  });
}

// ============================================================ 6. 资源版本号（缓存失效）
section('Asset cache-busting');
{
  const pages = [
    ['index.html', 'index'],
    ['about.html', 'about'],
    ['works.html', 'works'],
    ['data.html', 'data'],
    ['editions/2026-vol2.html', 'edition'],
    ['schools/index.html', 'schools index'],
    ['clubs/club-sysu-zhongshu.html', 'club detail'],
    ['vocals/index.html', 'vocals index']
  ];
  pages.forEach(function (p) {
    const html = fs.readFileSync(path.join(SITE, p[0]), 'utf8');
    const cssRefs = (html.match(/href="[^"]*assets\/css\/[^"]+"/g) || []);
    const jsRefs = (html.match(/src="[^"]*assets\/js\/[^"]+"/g) || []);
    const allRefs = cssRefs.concat(jsRefs);
    const versioned = allRefs.filter(function (r) { return /\?v=\d+/.test(r); });
    ok(allRefs.length > 0 && versioned.length === allRefs.length,
      p[1] + ': all ' + allRefs.length + ' asset refs versioned (' + versioned.length + ')');
  });

  // 样式也必须带版本号，否则改 CSS 后用户看到的还是旧样式
  const idx = fs.readFileSync(path.join(SITE, 'index.html'), 'utf8');
  ok(/assets\/css\/[^"]+\?v=\d+/.test(idx), 'index.html CSS refs are versioned');
  ok(!/\?v=\d+\?v=/.test(idx), 'no doubled ?v= in index.html (idempotent)');
}

// ============================================================ 7. 文件与 CLI
section('Files and CLI');
{
  ['build_statistics.js', 'snapshot.js', 'build_version.js', 'stamp_assets.js',
   'fetch_bilibili.js', 'build_all.js'].forEach(function (f) {
    ok(fs.existsSync(path.join(__dirname, f)), 'scripts/' + f + ' exists');
  });
  ok(fs.existsSync(path.join(__dirname, '..', 'package.json')), 'package.json exists');
  const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8'));
  ok(!!pkg.scripts.build, 'npm script build = ' + pkg.scripts.build);
  ok(!!pkg.scripts['verify:p2'], 'npm script verify:p2 exists');
}

console.log(lines.join('\n'));
console.log('\n' + '='.repeat(74));
console.log('passed ' + pass + ' / ' + (pass + fail));
process.exit(fail ? 1 : 0);
