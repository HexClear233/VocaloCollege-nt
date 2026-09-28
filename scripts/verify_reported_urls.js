// scripts/verify_reported_urls.js — 直接核对用户报告的 URL 形态
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
    '    catch (e) { out = { __error: String(e) }; }',
    '    var pre = document.createElement("pre");',
    '    pre.id = "__p"; pre.textContent = JSON.stringify(out);',
    '    document.body.appendChild(pre);',
    '  }, 2400);',
    '});', '<\/script>'].join('\n');
  const safe = src.replace(/[\/.]/g, '_');
  const file = '__u_' + safe + '.html';
  const orig = fs.readFileSync(path.join(SITE, src), 'utf8');
  const depth = src.split('/').length - 1;
  let patched = orig.replace('data-root=".."', 'data-root="."');
  if (depth > 0) patched = patched.replace(/(href|src)="\.\.\//g, '$1="');
  fs.writeFileSync(path.join(SITE, file), patched.replace('</body>', inject + '</body>'), 'utf8');
  try {
    const html = execFileSync(CHROME, [
      '--headless=new', '--disable-gpu', '--no-sandbox',
      '--virtual-time-budget=12000', '--window-size=1440,1200',
      '--dump-dom', '--user-data-dir=' + freshProfile(OUT, 'reported_urls'),
      BASE + '/' + file
    ], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
    const m = html.match(/<pre id="__p">([\s\S]*?)<\/pre>/);
    return m ? JSON.parse(m[1].replace(/&quot;/g, '"').replace(/&amp;/g, '&')) : null;
  } finally { try { fs.unlinkSync(path.join(SITE, file)); } catch (e) {} }
}

console.log('='.repeat(74));
console.log('Reported URL pattern verification');
console.log('='.repeat(74) + '\n');

// 1. 列表页 → 详情页 的链接形态
for (const [dir, kind] of [['schools', 'school'], ['clubs', 'club'], ['vocals', 'vocal']]) {
  const r = probe(dir + '/index.html', `
    var a = document.querySelector('.grid--archive a.ac');
    return { href: a ? a.getAttribute('href') : null, count: document.querySelectorAll('.grid--archive a.ac').length };
  `);
  const href = r && r.href;
  ok(!!href, kind + ' list renders ' + (r ? r.count : 0) + ' cards');
  ok(href && !new RegExp('^' + dir + '/').test(href),
    kind + ' list link has NO duplicated segment: "' + href + '"');
  ok(href && /^[a-z0-9-]+\.html$/.test(href),
    kind + ' list link is a sibling file: "' + href + '"');
}

// 2. 详情页 → 其他档案 的跨目录链接
{
  const r = probe('clubs/club-nankai-nanfeng.html', `
    var as = Array.prototype.map.call(document.querySelectorAll('a[href]'), function(x){return x.getAttribute('href');});
    return {
      school: as.filter(function(h){return h.indexOf('schools/')>=0;}),
      partner: as.filter(function(h){return /^club-[a-z0-9-]+\\.html$/.test(h);}),
      edition: as.filter(function(h){return h.indexOf('editions/')>=0;})
    };
  `);
  ok(r.school && r.school.length > 0, 'club detail links to school: ' + JSON.stringify((r.school || []).slice(0, 2)));
  // 关注具体高校详情链接（school-xxx.html），导航里的 schools/index.html 不算
  const schoolDetail = (r.school || []).filter(h => /school-[a-z0-9-]+\.html$/.test(h));
  ok(schoolDetail.length > 0, 'club detail links to a specific school detail: ' + JSON.stringify(schoolDetail));
  ok(schoolDetail.every(h => h.indexOf('schools/schools/') < 0),
    'school detail links have no duplicated segment');
  ok(schoolDetail.every(h => h === '../schools/' + h.split('/').pop() || h.indexOf('../schools/') === 0 || h.indexOf('schools/') === 0),
    'school detail links use a valid prefix: ' + JSON.stringify(schoolDetail));
  ok(r.partner && r.partner.length > 0, 'partner club links are siblings: ' + JSON.stringify((r.partner || []).slice(0, 2)));
  ok(r.edition && r.edition.every(h => h.indexOf('../editions/') === 0),
    'edition links use ../editions/ prefix');
}

// 3. SP 页 → 期页
{
  const r = probe('sp.html', `
    var as = Array.prototype.map.call(document.querySelectorAll('a[href]'), function(x){return x.getAttribute('href');});
    return { editions: as.filter(function(h){return h.indexOf('editions/')>=0;}) };
  `);
  ok(r.editions && r.editions.length > 0, 'SP page links to editions: ' + JSON.stringify((r.editions || []).slice(0, 3)));
  ok(r.editions && r.editions.every(h => h.indexOf('../') !== 0),
    'SP edition links are root-relative (no ../ since sp.html is at root)');
}

// 4. 数据中心 → 三种档案
{
  const r = probe('data.html', `
    var as = Array.prototype.map.call(document.querySelectorAll('a[href]'), function(x){return x.getAttribute('href');});
    return {
      schools: as.filter(function(h){return h.indexOf('schools/')===0;}),
      clubs: as.filter(function(h){return h.indexOf('clubs/')===0;}),
      vocals: as.filter(function(h){return h.indexOf('vocals/')===0;})
    };
  `);
  ['schools', 'clubs', 'vocals'].forEach(function (k) {
    const arr = r[k] || [];
    ok(arr.length > 0, 'data page links to ' + k + ' (' + arr.length + ')');
    ok(arr.every(h => !new RegExp('^' + k + '/' + k + '/').test(h)),
      k + ' links have no duplicated segment');
  });
}

console.log(lines.join('\n'));
console.log('\n' + '='.repeat(74));
console.log('passed ' + pass + ' / ' + (pass + fail));
process.exit(fail ? 1 : 0);
