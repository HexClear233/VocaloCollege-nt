// scripts/build_version.js — 统一构建版本号
//
// 用途：给页面里的 script / link 标签附加 ?v= 查询串，做缓存失效。
//
// 背景（2026-09-28）：曾出现浏览器缓存旧版 page-report.js，而数据已更新为
// 新结构，旧脚本访问已删除的 worksByClub / worksBySchool 导致整页报错
// 「can't access property "slice", arr is undefined」。
// 加版本号后每次构建都会改变 URL，浏览器必然重新拉取。
//
// 版本号取站点 JS/CSS 目录中最新的修改时间，因此：
//   - 只改数据、不改前端代码时，版本号不变（不会让用户白刷缓存）
//   - 改动任何前端资源时，版本号自动变化
const fs = require('fs');
const path = require('path');

function latestMtime(dir) {
  let max = 0;
  if (!fs.existsSync(dir)) return max;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) max = Math.max(max, latestMtime(p));
    else max = Math.max(max, fs.statSync(p).mtimeMs);
  }
  return max;
}

module.exports = function buildVersion(siteDir) {
  const jm = latestMtime(path.join(siteDir, 'assets', 'js'));
  const cm = latestMtime(path.join(siteDir, 'assets', 'css'));
  return String(Math.floor(Math.max(jm, cm)));
};
