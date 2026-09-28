// scripts/stamp_assets.js — 给手写页面（index.html / about.html）的资源引用打上版本号
//
// 由生成器产出的页面（editions/、schools/、reports/ 等）已在生成时写入 ?v=，
// 但 index.html 与 about.html 是手工维护的，无法靠生成器处理。
// 本脚本在构建末尾统一为它们的 css/js 引用补上 ?v=，实现全站一致的缓存失效。
//
// 幂等：重复运行会把已有的 ?v=xxx 替换为新值，不会叠加。
const fs = require('fs');
const path = require('path');

const SITE = path.join(__dirname, '..', 'site');
const VER = require('./build_version')(SITE);

const TARGETS = ['index.html', 'about.html'];

// 匹配 href/src="...assets/(css|js)/xxx.css|js" 后面可选的 ?v=...
// 注意：index.html 用的是相对路径 "assets/..."（无前导斜杠），
// 生成器产出的是 "./assets/..." 或 "../assets/..."，故这里不要求 /assets 前缀。
const RE = /(\s(?:href|src)="[^"]*?assets\/(?:css|js)\/[^"?]+)(\?v=[^"]*)?(")/g;

let changed = 0;

for (const rel of TARGETS) {
  const p = path.join(SITE, rel);
  if (!fs.existsSync(p)) continue;
  const before = fs.readFileSync(p, 'utf8');
  const after = before.replace(RE, (m, pre, _old, quote) => pre + '?v=' + VER + quote);
  if (after !== before) {
    fs.writeFileSync(p, after, 'utf8');
    changed++;
    console.log('  已打版本号 ' + rel);
  } else {
    console.log('  无需改动 ' + rel);
  }
}

console.log('stamp_assets: 版本号 ' + VER + '，更新 ' + changed + ' 个文件');
