// scripts/build_site.js — 生成可部署的发布产物到 dist/
//
// 为什么需要这一步：
//   GitHub Pages 只能发布「一个目录」。本项目的源文件里，
//   数据源（data/）、构建脚本（scripts/）、源页面（site/）是分开的，
//   而站点实际需要的是 site/ 的全部内容。
//   因此这里把 site/ 原样复制到 dist/，作为唯一发布目录。
//
// 同时在 dist/ 放置：
//   .nojekyll         —— 关闭 Jekyll 处理（否则 _ 开头的文件/目录会被忽略）
//   CNAME / 404.html  —— 如需自定义域名或错误页，可后续添加
//
// 用法：
//   node scripts/build_site.js            # 复制到 dist/
//   node scripts/build_site.js --clean    # 先清空 dist/ 再复制
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SRC = path.join(ROOT, 'site');
const DST = path.join(ROOT, 'dist');

const args = process.argv.slice(2);
const CLEAN = args.includes('--clean');

if (!fs.existsSync(SRC)) {
  console.error('找不到 site/ 目录，请先运行 npm run build');
  process.exit(1);
}

if (CLEAN && fs.existsSync(DST)) {
  fs.rmSync(DST, { recursive: true, force: true });
}
fs.mkdirSync(DST, { recursive: true });

let files = 0, bytes = 0;

function copyDir(src, dst) {
  fs.mkdirSync(dst, { recursive: true });
  for (const e of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, e.name);
    const d = path.join(dst, e.name);
    if (e.isDirectory()) {
      copyDir(s, d);
    } else {
      fs.copyFileSync(s, d);
      files++;
      bytes += fs.statSync(d).size;
    }
  }
}
copyDir(SRC, DST);

// .nojekyll：GitHub Pages 默认用 Jekyll 处理站点，
// 会忽略以下划线开头的文件与目录。本项目虽未使用，但加上可避免意外。
fs.writeFileSync(path.join(DST, '.nojekyll'), '');

// 记录构建信息，便于线上排查「部署的是哪一版」
const ver = require('./build_version')(SRC);
fs.writeFileSync(path.join(DST, 'build-info.json'),
  JSON.stringify({
    built_at: new Date().toISOString(),
    asset_version: ver,
    source: 'site/',
    files, bytes
  }, null, 2) + '\n', 'utf8');

const mb = (bytes / 1024 / 1024).toFixed(1);
console.log('发布产物已生成：dist/');
console.log('  文件数   ' + files);
console.log('  体积     ' + mb + ' MB');
console.log('  资源版本 ' + ver);
console.log('');
console.log('GitHub Pages 限制提醒：已发布站点不得大于 1 GB，');
console.log('当前 ' + mb + ' MB，余量充足。');
