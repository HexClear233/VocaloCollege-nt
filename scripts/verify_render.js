// scripts/verify_render.js — 用无头 Chrome 实际渲染页面并检查 DOM
// 不做"应该能行"的假设：它真的加载页面、执行 JS、读回渲染结果
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const freshProfile = require('./chrome_profile');
const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const BASE = process.env.BASE_URL || 'http://127.0.0.1:4173';
const OUT = path.join(__dirname, '..', '.verify');
fs.mkdirSync(OUT, { recursive: true });

const PAGES = [
  { name: 'index', url: BASE + '/' },
  { name: '2026-vol2', url: BASE + '/editions/2026-vol2.html' },
  { name: '2024', url: BASE + '/editions/2024.html' },
  { name: '2025-vol1', url: BASE + '/editions/2025-vol1.html' },
  { name: 'about', url: BASE + '/about.html' }
];

function dump(url, tag) {
  const profile = freshProfile(OUT, 'render-' + tag);
  const args = [
    '--headless=new',
    '--disable-gpu',
    '--no-sandbox',
    '--virtual-time-budget=12000',   // 等待 fetch + 渲染完成
    '--dump-dom',
    '--user-data-dir=' + profile,
    url
  ];
  return execFileSync(CHROME, args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
}

let pass = 0, fail = 0;
const results = [];

for (const p of PAGES) {
  let html = '';
  try {
    html = dump(p.url, p.name);
  } catch (e) {
    results.push(`❌ ${p.name}: 渲染失败 ${e.message.slice(0, 160)}`);
    fail++;
    continue;
  }

  fs.writeFileSync(path.join(OUT, p.name + '.html'), html, 'utf8');

  const checks = [];
  const add = (ok, msg) => { checks.push({ ok, msg }); };

  // 去掉 <script> 内容后再断言，避免把内联源码里的错误处理逻辑误判为渲染错误
  const domOnly = html.replace(/<script[\s\S]*?<\/script>/gi, '');

  // 通用检查
  add(!/加载中…/.test(domOnly), '无残留"加载中…"');
  add(!/数据加载失败/.test(domOnly), '无数据加载错误');
  add(!/class="load-error"/.test(domOnly), '无 load-error 元素');
  add(html.includes('data-theme='), 'data-theme 已设置');
  add(html.includes('theme-switch__trigger'), '主题切换器存在');

  // 作品相关检查只对含作品列表的页面生效（about.html 是纯文本页）
  const hasWorkList = p.name !== 'about';
  if (hasWorkList) {
    add((domOnly.match(/class="wc[ "]/g) || []).length > 0, 'work-card 已渲染');
    const covers = (domOnly.match(/media\/cover\//g) || []).length;
    add(covers > 0, `封面引用 ${covers} 处`);
  }

  // 页面特有
  if (p.name === 'index') {
    add(domOnly.includes('最新一期'), '含 LATEST EDITION 段');
    add(domOnly.includes('往期节目'), '含「往期节目」段');
    add(domOnly.includes('SPECIAL PICK'), '含 SPECIAL PICK 段');
    add(domOnly.includes('最新收录'), '含 LATEST WORKS 段');
    add(domOnly.includes('数据中心'), '含 DATA 段');
    add(domOnly.includes('探索'), '含 EXPLORE 段');
    add(/stat-num">108</.test(domOnly), '作品总数 108 已渲染');
    add((domOnly.match(/class="stat-num"/g) || []).length >= 8, 'stat-block 已渲染出内容');
    // 往期节目：5 张期卡片
    add((domOnly.match(/class="ec"/g) || []).length >= 6, '往期节目卡片 ≥6（1 最新 + 5 列表）');
    // 数据区不再为空
    add((domOnly.match(/class="tbar"/g) || []).length === 5, '分类构成条 5 行');
    add((domOnly.match(/class="data-bar"/g) || []).length === 5, '各期规模条 5 行');
    add(domOnly.includes('收录细则'), '导航含收录细则');
  }
  if (p.name === 'about') {
    add(domOnly.includes('栏目简述'), '含栏目简述');
    add(domOnly.includes('栏目说明'), '含栏目说明');
    add(domOnly.includes('收录范围说明'), '含收录范围说明');
    add(domOnly.includes('相关符号说明'), '含符号说明');
    add(domOnly.includes('栏目视频结构'), '含视频结构');
    add(domOnly.includes('最推荐作品'), '含 SP Case 说明');
    add(domOnly.includes('vocalocollege@163.com'), '含联系方式');
    add(domOnly.includes('Original Content'), '含 OC 英文释义');
    add(domOnly.includes('Re-Tuning'), '含 RT 英文释义');
    add(domOnly.includes('Wota Gei'), '含 DW 说明');
  }
  if (p.name === '2026-vol2') {
    add(domOnly.includes('原创作品'), '含原创作品段');
    add(domOnly.includes('翻调作品'), '含翻调作品段');
    add(domOnly.includes('翻唱翻奏作品'), '含翻唱翻奏段');
    add(/SPECIAL PICK/.test(domOnly), '含 SP 段');
    add(/期备注/.test(domOnly), '含期备注段');
    add(/33 件作品/.test(domOnly), '作品数 33 正确');
    add(domOnly.includes('凌云漠'), '期备注含《凌云漠》');
    add(domOnly.includes('术力口'), '期备注含《术力口》');
    // 收录层级区分
    add((domOnly.match(/wc--onair/g) || []).length > 0, '有「收录于视频」卡片');
    add((domOnly.match(/wc--listed/g) || []).length > 0, '有「仅网页收录」卡片');
    add(domOnly.includes('收录于视频'), '卡片含收录层级标签');
    add((domOnly.match(/class="edition-legend"/g) || []).length === 1, '期头含收录层级图例');
    add(/收录于视频 \d+ · 仅网页 \d+/.test(domOnly), '段落计数标出两种层级');
    // 序号编码（沿用源站点 V1/H2/A3/SP，含复合形式如 "H1 [VC]"）
    const seqs = (domOnly.match(/class="wc__seq[^"]*"[^>]*>([^<]+)</g) || []);
    add(seqs.length === 33, `序号徽章 33 个（实际 ${seqs.length}）`);
    add(/wc__seq--onair/.test(domOnly) && /wc__seq--listed/.test(domOnly), '两种序号样式并存');
    ['V1', 'V12', 'H1 [VC]', 'H20 [IC]', 'SP [OC]'].forEach(function (s) {
      add(seqs.some(function (x) { return x.replace(/.*>/, '').replace(/<$/, '') === s; }), '含序号 ' + s);
    });
  }
  if (p.name === '2024') {
    add(/10 件作品/.test(domOnly), '作品数 10 正确');
    add(/原视频已删除/.test(domOnly), '已标注原视频删除');
    // 2024 全期只有一种序号，不应出现层级标签
    add(!/wc--onair/.test(domOnly) && !/wc--listed/.test(domOnly), '2024 不显示收录层级（全期一致）');
    // 但序号编码仍应显示
    add((domOnly.match(/class="wc__seq/g) || []).length === 10, '2024 序号徽章 10 个');
  }
  if (p.name === '2025-vol1') {
    add(/22 件作品/.test(domOnly), '作品数 22 正确');
    add(/论外作品/.test(domOnly), '含论外段（A1-A3）');
    add(/星愿之音/.test(domOnly), '论外作品已渲染');
    add(!/wc--onair/.test(domOnly), '2025-vol1 不显示收录层级（全期一致）');
    add((domOnly.match(/class="wc__seq/g) || []).length === 22, '2025-vol1 序号徽章 22 个');
    add(/class="wc__seq[^"]*"[^>]*>A1</.test(domOnly), '含论外序号 A1');
    add(/class="wc__seq[^"]*"[^>]*>A3</.test(domOnly), '含论外序号 A3');
  }

  const bad = checks.filter(c => !c.ok);
  if (bad.length) {
    fail++;
    results.push(`❌ ${p.name}`);
    bad.forEach(c => results.push(`     ✗ ${c.msg}`));
    checks.filter(c => c.ok).forEach(c => results.push(`     ✓ ${c.msg}`));
  } else {
    pass++;
    results.push(`✅ ${p.name}`);
    checks.forEach(c => results.push(`     ✓ ${c.msg}`));
  }
}

console.log('═'.repeat(64));
console.log('无头浏览器渲染验证');
console.log('═'.repeat(64));
console.log(results.join('\n'));
console.log('═'.repeat(64));
console.log(`通过 ${pass} / ${pass + fail} 页面`);
console.log(`DOM 快照：.verify/*.html`);
process.exit(fail ? 1 : 0);
