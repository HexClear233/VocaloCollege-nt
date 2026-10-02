// scripts/verify_p2.js — Phase 2 功能验证
// 真跑浏览器：加载页面、读取渲染结果、验证筛选与搜索
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

/**
 * 注入脚本到页面副本，执行后把结果写进 pre#__probe 再 dump DOM。
 * url    - 访问 URL
 * script - 页面内执行的函数体，需 return 可 JSON 化的值
 * src    - 站点内源文件相对路径（如 'works.html'、'schools/index.html'）
 */
function probe(url, script, src) {
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
    '  }, 2200);',
    '});',
    '<\/script>'
  ].join('\n');

  const safeTag = src.replace(/[\/.]/g, '_');
  const file = '__p2_' + safeTag + '.html';
  const orig = fs.readFileSync(path.join(SITE, src), 'utf8');

  // 保留原 URL 的查询串：筛选/搜索正是靠 ?types=... 等参数驱动的，
  // 丢失查询串会导致所有筛选断言拿到全量结果（假失败）。
  const qIdx = url.indexOf('?');
  const qs = qIdx >= 0 ? url.slice(qIdx) : '';

  // 临时文件位于站点根，子目录页的相对路径需上提一级
  const depth = src.split('/').length - 1;
  let patched = orig.replace('data-root=".."', 'data-root="."');
  if (depth > 0) patched = patched.replace(/(href|src)="\.\.\//g, '$1="');

  fs.writeFileSync(path.join(SITE, file), patched.replace('</body>', inject + '</body>'), 'utf8');

  try {
    const html = execFileSync(CHROME, [
      '--headless=new', '--disable-gpu', '--no-sandbox', '--hide-scrollbars',
      '--virtual-time-budget=12000', '--window-size=1440,1200',
      '--dump-dom', '--user-data-dir=' + freshProfile(OUT, 'p2'),
      BASE + '/' + file + qs
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
console.log('Phase 2 verification (works / archives / SP)');
console.log('='.repeat(74));

// ============================================================ 1. structure
section('Works library - structure');
{
  const r = probe(BASE + '/works.html', `
    return {
      initial: document.querySelectorAll('work-card').length,
      facets: document.querySelectorAll('.facet').length,
      types: document.querySelectorAll('input[data-facet="types"]').length,
      editions: document.querySelectorAll('input[data-facet="editions"]').length,
      vocals: document.querySelectorAll('input[data-facet="vocals"]').length,
      schools: document.querySelectorAll('input[data-facet="schools"]').length,
      clubs: document.querySelectorAll('input[data-facet="clubs"]').length,
      sortOptions: document.querySelectorAll('#works-sort option').length,
      hasSearch: !!document.getElementById('works-search'),
      count: (document.getElementById('works-count')||{}).textContent || ''
    };
  `, 'works.html');

  ok(!r.__error, 'loads without error' + (r.__error ? ' -> ' + String(r.__error).slice(0, 160) : ''));
  ok(r.initial === 155, 'initial render 155 works (got ' + r.initial + ')');
  ok(r.hasSearch, 'search box present');
  ok(r.facets === 7, '7 facet groups (got ' + r.facets + ')');
  ok(r.types === 5, '5 type options (OC/RT/VC/IC/DW) (got ' + r.types + ')');
  ok(r.editions === 6, '6 edition options (got ' + r.editions + ')');
  ok(r.vocals === 33, '33 vocal options (got ' + r.vocals + ')');
  ok(r.schools === 57, '57 school options (got ' + r.schools + ')');
  ok(r.clubs === 64, '64 club options (got ' + r.clubs + ')');
  ok(r.sortOptions === 4, '4 sort options (got ' + r.sortOptions + ')');
  ok(/155/.test(r.count), 'count text has 155 ("' + r.count.trim() + '")');
}

// ============================================================ 2. filter/search
section('Works library - filter and search');
{
  const cases = [
    ['works.html?types=OC', 44, 'type=OC'],
    ['works.html?types=RT', 26, 'type=RT'],
    ['works.html?types=VC', 47, 'type=VC'],
    ['works.html?types=IC', 5, 'type=IC'],
    ['works.html?editions=2024', 10, 'edition=2024'],
    ['works.html?editions=2026-vol2', 33, 'edition=2026-vol2'],
    ['works.html?sp=1', 4, 'SP only'],
    ['works.html?onair=1', 77, 'on-air only'],
    ['works.html?q=' + encodeURIComponent('烟花说'), 1, 'search title'],
    ['works.html?q=' + encodeURIComponent('南京邮电'), 2, 'search school'],
    ['works.html?q=' + encodeURIComponent('柒世纪'), 2, 'search club'],
    ['works.html?q=' + encodeURIComponent('4000光年'), 1, 'search producer'],
    ['works.html?q=' + encodeURIComponent('初音未来'), 11, 'search vocal'],
    ['works.html?q=BV1jvVf6hEia', 1, 'search BV full'],
    ['works.html?q=BV1jvVf6h', 1, 'search BV prefix'],
    ['works.html?types=OC&editions=2026-vol2', 9, 'combined OC + 2026-vol2']
  ];

  for (const c of cases) {
    const r = probe(BASE + '/' + c[0], `
      return { n: document.querySelectorAll('work-card').length };
    `, 'works.html');
    ok(!r.__error && r.n === c[1], c[2] + ' -> ' + c[1] + ' (got ' + r.n + ')');
  }
}

// ============================================================ 3. archives
section('Archives - list and detail');
{
  const kinds = [
    ['schools', 'school', 57, 'school-sysu', '中山大学'],
    ['clubs', 'club', 64, 'club-sysu-zhongshu', '中术大学'],
    ['vocals', 'vocal', 33, 'vocal-miku', '初音未来']
  ];

  for (const k of kinds) {
    const dir = k[0], kind = k[1], expectCount = k[2], sampleId = k[3], sampleName = k[4];

    const list = probe(BASE + '/' + dir + '/index.html', `
      return {
        cards: document.querySelectorAll('.ac').length,
        title: (document.querySelector('.archive-head__title')||{}).textContent || ''
      };
    `, dir + '/index.html');
    ok(!list.__error && list.cards === expectCount,
      kind + ' list ' + expectCount + ' (got ' + list.cards + ')');
    ok(String(list.title).length > 0, kind + ' list title = "' + list.title + '"');

    const detail = probe(BASE + '/' + dir + '/' + sampleId + '.html', `
      return {
        title: (document.querySelector('.archive-head__title')||{}).textContent || '',
        stats: document.querySelectorAll('stat-block').length,
        works: document.querySelectorAll('work-card').length,
        years: document.querySelectorAll('.year-head').length
      };
    `, dir + '/' + sampleId + '.html');
    ok(!detail.__error && detail.title === sampleName,
      kind + ' detail title = "' + detail.title + '" (expect "' + sampleName + '")');
    ok(detail.stats >= 6, kind + ' detail has ' + detail.stats + ' stat blocks (>=6)');
    ok(detail.works > 0, kind + ' detail has ' + detail.works + ' works');
    ok(detail.years > 0, kind + ' detail grouped into ' + detail.years + ' years');
  }
}

// ============================================================ 4. partners
section('Club archive - partner clubs');
{
  // 中术大学的作品均为单社团，故合作社团为 0；南风动漫社有 8 个合作社团。
  // 两者都验证：前者确认"无合作时不显示空区块"，后者确认区块正常渲染。
  const solo = probe(BASE + '/clubs/club-sysu-zhongshu.html', `
    return { partnerTags: document.querySelectorAll('.tag').length };
  `, 'clubs/club-sysu-zhongshu.html');
  ok(!solo.__error && solo.partnerTags === 0,
    'club with no partners shows 0 tags (got ' + solo.partnerTags + ')');

  const r = probe(BASE + '/clubs/club-nankai-nanfeng.html', `
    var links = Array.prototype.map.call(document.querySelectorAll('a[href]'),
      function (a) { return a.getAttribute('href'); });
    return {
      partnerTags: document.querySelectorAll('.tag').length,
      toWorks: links.filter(function (h) { return h.indexOf('works.html') >= 0; }).length,
      toEdition: links.filter(function (h) { return h.indexOf('../editions/') === 0; }).length,
      hasSchool: document.body.textContent.indexOf('南开大学') >= 0
    };
  `, 'clubs/club-nankai-nanfeng.html');
  ok(!r.__error, 'club detail loads' + (r.__error ? ' -> ' + String(r.__error).slice(0, 160) : ''));
  // 南风动漫社真实的合作社团为 3 个：D-Touch（天津大学）、西交现视妍、沸点（复旦）。
  // 注：先前一度出现 8 个，是因为「三社联合拜年祭」的社团被误加到若干
  // 2026-vol2 无关作品上；该数据缺陷已在 fix_collab_clubs.js 中修正，
  // 故此处期望值应为 3（与源页面「关联社团」字段一致）。
  ok(r.partnerTags === 3, '3 partner club tags for 南风动漫社 (got ' + r.partnerTags + ')');
  ok(r.toWorks > 0, r.toWorks + ' links to works library');
  ok(r.toEdition > 0, r.toEdition + ' links to editions');
  ok(r.hasSchool, 'shows owning school');
}

// ============================================================ 5. ambiguity
section('School archive - department/campus ambiguity');
{
  const r = probe(BASE + '/schools/school-ucas.html', `
    return {
      hasNotice: !!document.querySelector('.notice'),
      text: (document.querySelector('.notice')||{}).textContent || '',
      works: document.querySelectorAll('work-card').length
    };
  `, 'schools/school-ucas.html');
  ok(!r.__error, 'UCAS archive loads' + (r.__error ? ' -> ' + String(r.__error).slice(0, 160) : ''));
  ok(r.hasNotice, 'shows ambiguity notice block');
  ok(/院系|校区/.test(r.text), 'notice mentions department/campus');
}

// ============================================================ 6. SP page
section('SPECIAL PICK page');
{
  const r = probe(BASE + '/sp.html', `
    return {
      entries: document.querySelectorAll('.sp-entry').length,
      title: (document.querySelector('.archive-head__title')||{}).textContent || '',
      hasCurator: document.body.textContent.indexOf('Curator') >= 0,
      hasPrinciple: document.body.textContent.indexOf('SP 不是排名') >= 0,
      staffRows: document.querySelectorAll('.sp-entry__staffrow').length,
      editions: Array.prototype.map.call(document.querySelectorAll('.sp-entry__edition'),
        function (e) { return e.textContent; })
    };
  `, 'sp.html');
  ok(!r.__error, 'SP page loads' + (r.__error ? ' -> ' + String(r.__error).slice(0, 160) : ''));
  ok(r.entries === 4, '4 SP entries (got ' + r.entries + ')');
  ok(r.title === 'SPECIAL PICK', 'title = "' + r.title + '"');
  ok(r.hasCurator, 'has Curator Note block');
  ok(r.hasPrinciple, 'has SP principles');
  ok(r.staffRows > 0, r.staffRows + ' staff rows');
  ok(r.editions.length === 4 && /2026/.test(r.editions[0]),
    'reverse chronological: ' + r.editions.join(' / '));
}

// ============================================================ 7. files
section('Files and data integrity');
{
  const need = ['works.html', 'sp.html', 'schools/index.html', 'clubs/index.html', 'vocals/index.html'];
  for (const f of need) ok(fs.existsSync(path.join(SITE, f)), 'exists ' + f);
  for (const f of ['schools.json', 'clubs.json', 'vocals.json', 'engines.json']) {
    ok(fs.existsSync(path.join(SITE, 'data', f)), 'site/data/' + f + ' synced');
  }
  const nSchool = fs.readdirSync(path.join(SITE, 'schools')).filter(f => f.endsWith('.html')).length;
  const nClub = fs.readdirSync(path.join(SITE, 'clubs')).filter(f => f.endsWith('.html')).length;
  const nVocal = fs.readdirSync(path.join(SITE, 'vocals')).filter(f => f.endsWith('.html')).length;
  ok(nSchool === 58, 'schools/ has 58 pages (got ' + nSchool + ')');
  ok(nClub === 65, 'clubs/ has 65 pages (got ' + nClub + ')');
  ok(nVocal === 34, 'vocals/ has 34 pages (got ' + nVocal + ')');
}

console.log(lines.join('\n'));
console.log('\n' + '='.repeat(74));
console.log('passed ' + pass + ' / ' + (pass + fail));
process.exit(fail ? 1 : 0);
