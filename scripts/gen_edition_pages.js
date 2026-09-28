// scripts/gen_edition_pages.js — 生成 5 个期页面（共用同一模板）
const fs = require('fs');
const path = require('path');

const SITE = path.join(__dirname, '..', 'site');
const D = path.join(__dirname, '..', 'data');
const index = JSON.parse(fs.readFileSync(path.join(D, 'index.json'), 'utf8'));

// 构建版本号（缓存失效），与 gen_phase2_pages.js 共用同一实现
const VER = require('./build_version')(SITE);

fs.mkdirSync(path.join(SITE, 'editions'), { recursive: true });

const tpl = (id, label) => `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${label} | 高校术力口之声</title>
<meta name="theme-color" content="#F5F5F2" />

<!-- 首屏防闪（FOUC） -->
<script>
(function(){try{
  var m=localStorage.getItem('vc-theme')||'system';
  var d=m==='dark'||(m==='system'&&window.matchMedia('(prefers-color-scheme: dark)').matches);
  var r=document.documentElement;
  r.setAttribute('data-theme',d?'dark':'light');
  r.setAttribute('data-theme-mode',m);
}catch(e){}})();
</script>

<link rel="stylesheet" href="../assets/css/tokens.css?v=${VER}" />
<link rel="stylesheet" href="../assets/css/base.css?v=${VER}" />
<link rel="stylesheet" href="../assets/css/layout.css?v=${VER}" />
<link rel="stylesheet" href="../assets/css/components.css?v=${VER}" />
<link rel="stylesheet" href="../assets/css/charts.css?v=${VER}" />
</head>
<body data-edition="${id}" data-root="..">

<a class="skip-link" href="#edition-main">跳到主内容</a>

<header class="site-header">
  <div class="wrap site-header__inner">
    <a class="brand" href="../index.html">
      <span class="brand__mark" aria-hidden="true">VC</span>
      <span class="brand__text">高校术力口之声 <span>/ VocaloCollege</span></span>
    </a>
    <nav class="site-nav" aria-label="主导航">
      <a href="../index.html">首页</a>
      <a href="../works.html">作品库</a>
      <a href="../schools/index.html">高校</a>
      <a href="../clubs/index.html">社团</a>
      <a href="../vocals/index.html">歌声</a>
      <a href="../data.html">数据</a>
      <a href="../reports/index.html">年报</a>
      <a href="../sp.html">SP</a>
      <a href="../about.html">细则</a>
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
  </div>
</header>

<header class="edition-header" id="edition-header"></header>

<main id="edition-main" class="edition-main">
  <div class="wrap edition-layout"><p class="loading">加载中…</p></div>
</main>

<footer class="site-footer">
  <div class="wrap site-footer__inner">
    <p style="margin:0">© 2024–2026 高校术力口之声 | 非营利性同好交流项目</p>
    <p style="margin:0">
      <a href="../about.html">收录细则</a> ·
      本栏目为策展与档案记录，<b>非排行榜</b>。
    </p>
  </div>
</footer>

<script src="../assets/js/theme.js?v=${VER}"></script>
<script src="../assets/js/data.js?v=${VER}"></script>
<script src="../assets/js/components.js?v=${VER}"></script>
<script src="../assets/js/page-edition.js?v=${VER}"></script>
</body>
</html>
`;

let n = 0;
for (const e of index.editions) {
  const out = path.join(SITE, 'editions', `${e.id}.html`);
  fs.writeFileSync(out, tpl(e.id, e.label), 'utf8');
  n++;
  console.log(`  生成 ${e.id}.html  (${e.label})`);
}
console.log(`\n共生成 ${n} 个期页面`);
