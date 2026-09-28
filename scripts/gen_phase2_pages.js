// scripts/gen_phase2_pages.js — 生成 Phase 2 的全部页面
//
// 产出：
//   works.html                作品库（搜索 + 筛选）
//   sp.html                   SPECIAL PICK 专页
//   schools/index.html        高校列表  + schools/{id}.html × 44
//   clubs/index.html          社团列表  + clubs/{id}.html   × 51
//   vocals/index.html         歌声列表  + vocals/{id}.html  × 33
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SITE = path.join(ROOT, 'site');
const D = path.join(ROOT, 'data');

const read = (p) => JSON.parse(fs.readFileSync(p, 'utf8'));
const index = read(path.join(D, 'index.json'));
const schools = read(path.join(D, 'schools.json'));
const clubs = read(path.join(D, 'clubs.json'));
const vocals = read(path.join(D, 'vocals.json'));

// 汇总全部作品
const allWorks = [];
for (const e of index.editions) {
  const ed = read(path.join(D, '..', e.file));
  allWorks.push(...ed.works);
}

// ---------------------------------------------------------------- 公共片段

// 构建版本号：附加到脚本/样式 URL 上做缓存失效（见 build_version.js 的说明）。
// 必须在 HEAD / SCRIPTS 之前声明 —— 它们在模板里引用该值。
const BUILD_VER = require('./build_version')(SITE);

const HEAD = (title, desc, depth) => {
  const r = depth === 0 ? '.' : '..';
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${title}</title>
<meta name="description" content="${desc}" />
<meta name="theme-color" content="#F5F5F2" />

<script>
(function(){try{
  var m=localStorage.getItem('vc-theme')||'system';
  var d=m==='dark'||(m==='system'&&window.matchMedia('(prefers-color-scheme: dark)').matches);
  var r=document.documentElement;
  r.setAttribute('data-theme',d?'dark':'light');
  r.setAttribute('data-theme-mode',m);
}catch(e){}})();
</script>

<link rel="stylesheet" href="${r}/assets/css/tokens.css?v=${BUILD_VER}" />
<link rel="stylesheet" href="${r}/assets/css/base.css?v=${BUILD_VER}" />
<link rel="stylesheet" href="${r}/assets/css/layout.css?v=${BUILD_VER}" />
<link rel="stylesheet" href="${r}/assets/css/components.css?v=${BUILD_VER}" />
<link rel="stylesheet" href="${r}/assets/css/archive.css?v=${BUILD_VER}" />
<link rel="stylesheet" href="${r}/assets/css/charts.css?v=${BUILD_VER}" />`;
};

const NAV = (depth, current) => {
  const r = depth === 0 ? '' : '../';
  const mark = (k) => k === current ? ' aria-current="page"' : '';
  return `  <div class="wrap site-header__inner">
    <a class="brand" href="${r}index.html">
      <span class="brand__mark" aria-hidden="true">VC</span>
      <span class="brand__text">高校术力口之声 <span>/ VocaloCollege</span></span>
    </a>
    <nav class="site-nav" aria-label="主导航">
      <a href="${r}index.html"${mark('home')}>首页</a>
      <a href="${r}works.html"${mark('works')}>作品库</a>
      <a href="${r}schools/index.html"${mark('schools')}>高校</a>
      <a href="${r}clubs/index.html"${mark('clubs')}>社团</a>
      <a href="${r}vocals/index.html"${mark('vocals')}>歌声</a>
      <a href="${r}data.html"${mark('data')}>数据</a>
      <a href="${r}reports/index.html"${mark('reports')}>年报</a>
      <a href="${r}sp.html"${mark('sp')}>SP</a>
      <a href="${r}about.html"${mark('about')}>细则</a>
    </nav>
    <div class="theme-switch">
      <button class="theme-switch__trigger" data-theme-trigger
              aria-haspopup="true" aria-expanded="false" aria-label="主题">⛭</button>
      <div class="theme-switch__menu" data-theme-menu hidden role="menu" aria-label="主题模式">
        <button class="theme-switch__item" role="menuitemradio" data-theme-set="light" aria-checked="false">
          <span class="ico" aria-hidden="true">☀</span> 浅色
        </button>
        <button class="theme-switch__item" role="menuitemradio" data-theme-set="dark" aria-checked="false">
          <span class="ico" aria-hidden="true">☾</span> 深色
        </button>
        <button class="theme-switch__item" role="menuitemradio" data-theme-set="system" aria-checked="false">
          <span class="ico" aria-hidden="true">⛭</span> 跟随系统
        </button>
      </div>
    </div>
  </div>`;
};

const FOOT = (depth) => {
  const r = depth === 0 ? '' : '../';
  return `<footer class="site-footer">
  <div class="wrap site-footer__inner">
    <p style="margin:0">© 2024–2026 高校术力口之声 | 非营利性同好交流项目</p>
    <p style="margin:0">
      <a href="${r}about.html">收录细则</a> ·
      本栏目为策展与档案记录，<b>非排行榜</b>。
    </p>
  </div>
</footer>`;
};

// 构建版本号已在文件上方声明（HEAD 会用到）

const SCRIPTS = (depth, extra) => {
  const r = depth === 0 ? '.' : '..';
  return `\n<script src="${r}/assets/js/theme.js?v=${BUILD_VER}"></script>
<script src="${r}/assets/js/data.js?v=${BUILD_VER}"></script>
<script src="${r}/assets/js/components.js?v=${BUILD_VER}"></script>
<script src="${r}/assets/js/collection.js?v=${BUILD_VER}"></script>
${extra ? `<script src="${r}/assets/js/${extra}?v=${BUILD_VER}"></script>` : ''}
</body>
</html>
`;
};

/**
 * 在页面脚本列表末尾追加一个脚本。
 * 不用字符串 replace —— 脚本标签带 ?v= 版本号，写死匹配字符串很脆弱。
 * @param {string} html  已生成的页面 HTML
 * @param {string} depthR 到站点根的相对前缀（'.' 或 '..'）
 * @param {string} name  脚本文件名
 */
function appendScript(html, depthR, name) {
  const tag = `<script src="${depthR}/assets/js/${name}?v=${BUILD_VER}"></script>`;
  return html.replace('</body>', tag + '\n</body>');
}

function writePage(rel, html) {
  const full = path.join(SITE, rel);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, html, 'utf8');
}

// ---------------------------------------------------------------- 1. 作品库
writePage('works.html', `${HEAD('作品库 | 高校术力口之声',
  '检索 VocaloCollege 收录的全部高校术力口作品：按作品名、高校、社团、制作者、歌声、BV号搜索，并按类型、年份、节目筛选。', 0)}
</head>
<body data-root=".">

<a class="skip-link" href="#works-results">跳到主内容</a>

<header class="site-header">
${NAV(0, 'works')}
</header>

<main>
  <div class="wrap">
    <div class="works-head">
      <h1 class="works-head__title">作品库</h1>
      <form class="searchbar" id="works-search-form" role="search">
        <label class="sr-only" for="works-search">搜索作品</label>
        <input class="searchbar__input" id="works-search" type="search" autocomplete="off"
               placeholder="搜索作品名 / 高校 / 社团 / 制作者 / 歌声 / BV号…" />
        <label class="sr-only" for="works-sort">排序</label>
        <select class="searchbar__select" id="works-sort">
          <option value="edition-desc">按期（新→旧）</option>
          <option value="date-desc">按发布时间（新→旧）</option>
          <option value="date-asc">按发布时间（旧→新）</option>
          <option value="title">按作品名</option>
        </select>
      </form>
    </div>
  </div>

  <div class="wrap works-layout">
    <aside class="filters" aria-label="筛选">
      <div class="filters__head">
        <span class="filters__title">筛选</span>
        <button type="button" class="filters__reset" id="clear-all-top">清空</button>
      </div>
      <div id="works-filters"></div>
    </aside>

    <div>
      <div class="works-toolbar">
        <p class="works-count" id="works-count">加载中…</p>
      </div>
      <div class="works-active" id="works-active"></div>
      <div id="works-results"><p class="loading">加载中…</p></div>
    </div>
  </div>
</main>

${FOOT(0)}
${SCRIPTS(0, 'page-works.js')}`);

// 顶部的"清空"按钮与筛选面板内的清空同义
fs.appendFileSync(path.join(SITE, 'works.html'),
  `<script>document.addEventListener('click',function(e){if(e.target&&e.target.id==='clear-all-top'){var b=document.getElementById('clear-all');if(b)b.click();}});</script>\n`, 'utf8');

// ---------------------------------------------------------------- 2. SP 页
writePage('sp.html', `${HEAD("SPECIAL PICK | 高校术力口之声",
  "VocaloCollege 历期 SPECIAL PICK（Curator's Selection）：策展人主观选择的最推荐作品。SP 不是排名。", 0)}
</head>
<body data-root=".">

<a class="skip-link" href="#sp-main">跳到主内容</a>

<header class="site-header">
${NAV(0, 'sp')}
</header>

<main id="sp-main">
  <div class="wrap"><p class="loading">加载中…</p></div>
</main>

${FOOT(0)}
${SCRIPTS(0, 'page-sp.js')}`);

// ---------------------------------------------------------------- 3. 三种档案
const KINDS = [
  {
    key: 'school', dir: 'schools', title: '高校档案', sub: 'Universities',
    desc: 'VocaloCollege 收录作品涉及的全部高校：收录数、类型构成、参与年份与作品列表。',
    entities: (() => {
      const has = {};
      allWorks.forEach(w => (w.school_ids || []).forEach(i => has[i] = (has[i] || 0) + 1));
      return schools.schools.filter(s => has[s.id]);
    })()
  },
  {
    key: 'club', dir: 'clubs', title: '社团档案', sub: 'Clubs',
    desc: 'VocaloCollege 收录作品涉及的全部高校社团：作品数、类型构成、合作社团与作品列表。',
    entities: (() => {
      const has = {};
      allWorks.forEach(w => (w.club_ids || []).forEach(i => has[i] = (has[i] || 0) + 1));
      return clubs.clubs.filter(c => has[c.id]);
    })()
  },
  {
    key: 'vocal', dir: 'vocals', title: '歌声档案', sub: 'Vocals',
    desc: '出现在高校术力口作品中的歌声 / 虚拟歌手：作品数、类型构成、涉及高校与社团。',
    entities: (() => {
      const has = {};
      allWorks.forEach(w => (w.vocal_ids || []).forEach(i => has[i] = (has[i] || 0) + 1));
      return vocals.vocals.filter(v => has[v.id]);
    })()
  }
];

let pageCount = 0;

for (const K of KINDS) {
  // 列表页
  writePage(`${K.dir}/index.html`, `${HEAD(`${K.title} | 高校术力口之声`, K.desc, 1)}
</head>
<body data-root=".." data-entity="${K.key}">

<a class="skip-link" href="#archive-main">跳到主内容</a>

<header class="site-header">
${NAV(1, K.key + 's')}
</header>

<main id="archive-main">
  <div class="wrap"><p class="loading">加载中…</p></div>
</main>

${FOOT(1)}
${SCRIPTS(1, 'page-archive.js')}`);
  pageCount++;

  // 详情页
  for (const e of K.entities) {
    writePage(`${K.dir}/${e.id}.html`, `${HEAD(`${e.name} | ${K.title} | 高校术力口之声`,
      `${e.name} —— VocaloCollege ${K.title}，收录作品、类型构成与相关实体。`, 1)}
</head>
<body data-root=".." data-entity="${K.key}" data-id="${e.id}">

<a class="skip-link" href="#archive-main">跳到主内容</a>

<header class="site-header">
${NAV(1, K.key + 's')}
</header>

<main id="archive-main">
  <div class="wrap"><p class="loading">加载中…</p></div>
</main>

${FOOT(1)}
${SCRIPTS(1, 'page-archive.js')}`);
    pageCount++;
  }
  console.log(`  ${K.dir}/: 列表页 1 + 详情页 ${K.entities.length} = ${K.entities.length + 1}`);
}

// ---------------------------------------------------------------- 4. 数据中心（Phase 3）
const dataHtml = `${HEAD('数据中心 | 高校术力口之声',
  'VocaloCollege 收录数据总览：创作趋势、类型统计、歌声统计、高校统计与合作网络。数据用于描述收录情况，不用于评价作品质量。', 0)}
</head>
<body data-root=".">

<a class="skip-link" href="#data-main">跳到主内容</a>

<header class="site-header">
${NAV(0, 'data')}
</header>

<main id="data-main">
  <div class="wrap"><p class="loading">加载中…</p></div>
</main>

${FOOT(0)}
${SCRIPTS(0, 'charts.js')}`;
writePage('data.html', appendScript(dataHtml, '.', 'page-data.js'));
pageCount++;

// ---------------------------------------------------------------- 5. 年度报告（方案十四）
// 报告数据由 build_annual_report.js 生成；缺失时跳过，不影响其余页面
const reportHead = (title, desc, bodyAttrs) => `${HEAD(title, desc, 1)}
</head>
<body data-root=".."${bodyAttrs || ''}>

<a class="skip-link" href="#report-main">跳到主内容</a>

<header class="site-header">
${NAV(1, 'reports')}
</header>

<main id="report-main">
  <div class="wrap"><p class="loading">加载中…</p></div>
</main>

${FOOT(1)}
${SCRIPTS(1, 'charts.js')}`;

{
  const idxPath = path.join(ROOT, 'data', 'reports', 'index.json');
  if (fs.existsSync(idxPath)) {
    writePage('reports/index.html', appendScript(reportHead(
      '年度报告 | 高校术力口之声',
      'VocaloCollege 年度记录：每年收录作品、参与高校与社团的变化，以及跨校合作情况。本报告是记录，不是评比。',
      ''), '..', 'page-report.js'));
    pageCount++;

    const ridx = JSON.parse(fs.readFileSync(idxPath, 'utf8'));
    for (const y of ridx.years) {
      writePage(`reports/${y.year}.html`, appendScript(reportHead(
        y.year + ' 年度报告 | 高校术力口之声',
        'VocaloCollege ' + y.year + ' 年度记录：' + y.works + ' 件收录作品，' +
        y.schools + ' 所高校，' + y.clubs + ' 个社团。本报告是记录，不是评比。',
        ` data-year="${y.year}"`), '..', 'page-report.js'));
      pageCount++;
    }
    console.log(`  reports/: 索引 1 + 年度页 ${ridx.years.length} = ${ridx.years.length + 1}`);
  } else {
    console.log('  reports/: 跳过（尚无年度报告，请先运行 build_annual_report.js）');
  }
}

// ---------------------------------------------------------------- 5. 年度报告（Phase 4）
console.log(`\n页面生成完成：`);
console.log(`  works.html, sp.html, data.html, reports/`);
console.log(`  合计 ${pageCount + 2} 个页面`);
