// scripts/chrome_profile.js — 为每次无头浏览器运行生成一次性 profile 目录
//
// 命名说明：刻意不以下划线开头，避免被「清理 scripts/_*.js 临时脚本」的习惯误删。
// 这是验证套件的**长期依赖**，不是一次性调试脚本。
//
// 为什么需要它：
//   Chrome 的 --user-data-dir 会持久化 HTTP 缓存。若多次运行复用同一目录，
//   改了 site/assets/js/*.js 之后，测试仍可能执行**缓存里的旧脚本**，
//   从而产生假通过（旧逻辑恰好满足断言）或假失败（旧逻辑已不满足新断言）。
//
// 实际踩到的坑（2026-09-28）：
//   移除年报功能后，verify_p4 的「数据中心不应再提年度报告」报失败。
//   排查后发现两个独立原因：
//     1) 探针复用了固定 profile，命中缓存的旧 page-data.js  → 已改为一次性 profile
//     2) 断言用 document.body.textContent，而它包含 <script> 源码 ——
//        探针自己的脚本里就写着「年度报告」，属于自匹配 → 已改为剔除 script/style
//
// 用法：
//   const freshProfile = require('./chrome_profile');
//   ... '--user-data-dir=' + freshProfile(OUT, 'p4')
const fs = require('fs');
const path = require('path');

let seq = 0;

/**
 * @param {string} baseDir 存放 profile 的父目录（如 .verify）
 * @param {string} tag     便于识别的标签
 * @returns {string} 新建的一次性目录路径
 */
module.exports = function freshProfile(baseDir, tag) {
  const name = [String(tag).replace(/[^\w.-]/g, '_'), process.pid, Date.now(), (seq++)].join('-');
  const dir = path.join(baseDir, 'profiles', name);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
};
