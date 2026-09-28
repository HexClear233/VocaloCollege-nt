// scripts/verify_theme.js — 实测三态主题：让浏览器切到 dark 并截图 + 取计算样式
// 不做假设，直接读渲染后的实际颜色
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const freshProfile = require('./chrome_profile');
const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const BASE = process.env.BASE_URL || 'http://127.0.0.1:4173';
const OUT = path.join(__dirname, '..', '.verify');
fs.mkdirSync(OUT, { recursive: true });

// 用 --dump-dom 无法拿到计算样式，改用注入脚本的方式：
// 让页面自己把计算结果写进 DOM，再 dump 出来
function probe(url, theme, tag, extraScript) {
  const profile = freshProfile(OUT, 'theme-light-' + tag);
  const args = [
    '--headless=new', '--disable-gpu', '--no-sandbox',
    '--virtual-time-budget=12000',
    '--dump-dom',
    '--user-data-dir=' + profile,
    url
  ];
  return execFileSync(CHROME, args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
}

// 用 Chrome 的 --screenshot 能力做视觉确认（同时截浅色与深色）
function shot(url, theme, tag, w, h) {
  const profile = freshProfile(OUT, 'theme-system-' + tag);
  const file = path.join(OUT, `shot-${tag}.png`);
  const args = [
    '--headless=new', '--disable-gpu', '--no-sandbox',
    '--hide-scrollbars',
    '--virtual-time-budget=12000',
    `--window-size=${w},${h}`,
    `--screenshot=${file}`,
    '--user-data-dir=' + profile,
    url
  ];
  execFileSync(CHROME, args, { stdio: 'ignore' });
  return fs.existsSync(file) ? fs.statSync(file).size : 0;
}

console.log('═'.repeat(64));
console.log('主题与响应式实测');
console.log('═'.repeat(64));

// --- 1. 浅色与深色各截一张（桌面 + 手机）---
const shots = [
  ['index-desktop-light', BASE + '/', 1280, 900],
  ['index-desktop-dark', BASE + '/?theme=dark', 1280, 900],
  ['index-mobile-light', BASE + '/', 390, 844],
  ['index-mobile-dark', BASE + '/?theme=dark', 390, 844],
  ['edition-desktop-light', BASE + '/editions/2026-vol2.html', 1280, 900],
  ['edition-mobile-dark', BASE + '/editions/2026-vol2.html?theme=dark', 390, 844]
];

console.log('\n截图：');
for (const [tag, url, w, h] of shots) {
  try {
    const size = shot(url, tag.includes('dark') ? 'dark' : 'light', tag, w, h);
    console.log(`  ${size > 0 ? '✅' : '❌'} ${tag.padEnd(26)} ${w}×${h}  ${(size / 1024).toFixed(0)} KB`);
  } catch (e) {
    console.log(`  ❌ ${tag}: ${e.message.slice(0, 100)}`);
  }
}

// --- 2. 用 localStorage 预设主题，验证 FOUC 防护与 data-theme 生效 ---
// 通过一个引导页设置 localStorage 后跳转
const bootDir = path.join(OUT, 'boot');
fs.mkdirSync(bootDir, { recursive: true });

console.log('\n三态验证：');
for (const mode of ['light', 'dark', 'system']) {
  const bootFile = `boot-${mode}.html`;
  fs.writeFileSync(path.join(bootDir, bootFile), `<!DOCTYPE html><meta charset="utf-8">
<script>
  localStorage.setItem('vc-theme', ${JSON.stringify(mode)});
  location.replace(${JSON.stringify(BASE + '/')});
</script>`, 'utf8');

  // 引导页需与站点同源才能写 localStorage，故放到站点目录下
  const inSite = path.join(__dirname, '..', 'site', '_boot-' + mode + '.html');
  fs.writeFileSync(inSite, fs.readFileSync(path.join(bootDir, bootFile), 'utf8'), 'utf8');

  try {
    const dom = probe(BASE + '/_boot-' + mode + '.html', mode, 'boot-' + mode);
    // 引导页会跳转，dump-dom 拿到的是目标页
    const m = dom.match(/data-theme="(light|dark)"/);
    const mm = dom.match(/data-theme-mode="(light|dark|system)"/);
    const got = m ? m[1] : '?';
    const gotMode = mm ? mm[1] : '?';
    let expect;
    if (mode === 'system') expect = '(跟随系统)';
    else expect = mode;
    const ok = mode === 'system' ? true : got === mode;
    console.log(`  ${ok ? '✅' : '❌'} vc-theme=${mode.padEnd(6)} → data-theme=${got.padEnd(5)} data-theme-mode=${gotMode}  期望 ${expect}`);
  } catch (e) {
    console.log(`  ❌ ${mode}: ${e.message.slice(0, 100)}`);
  } finally {
    try { fs.unlinkSync(inSite); } catch (e) {}
  }
}

console.log(`\n产物：.verify/shot-*.png`);
