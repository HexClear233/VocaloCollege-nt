/* ==========================================================================
   page-report.js — 年度报告页（方案十四）
   渲染 data/reports/{year}.json
   明确不呈现任何评比性内容（方案十四「不建议设置」）

   健壮性约定（2026-09-28 修复）：
     报告数据可能来自较旧版本而缺少某些字段。所有数组字段访问前都必须
     用 Array.isArray 校验，缺数据时降级跳过该区块，**不允许整页失败**。
     曾因此出现 "can't access property slice, arr is undefined" 整页报错。
   ========================================================================== */
(function () {
  'use strict';

  var D = null;
  var YEAR = null;

  function esc(s) { return window.VCComponents.esc(s); }
  function el(tag, cls, html) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (html != null) e.innerHTML = html;
    return e;
  }
  function arr(x) { return Array.isArray(x) ? x : []; }

  // 年报页位于 /reports/ 子目录内。
  // 所有指向站内其他目录（schools/ clubs/ vocals/ editions/ works.html …）的链接
  // 都必须加 "../" 前缀，否则浏览器会解析成 /reports/schools/xxx.html。
  // 曾因此出现「点击标签跳转到 /reports/schools/school-XXX.html」的错误。
  var ROOT = '..';
  function rootHref(p) { return ROOT + '/' + p; }

  function qs(n) {
    var m = new RegExp('[?&]' + n + '=([^&]*)').exec(location.search);
    return m ? decodeURIComponent(m[1]) : null;
  }
  function get(url) {
    return fetch(url, { cache: 'no-cache' }).then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    });
  }

  function boot() {
    var root = document.body.getAttribute('data-root') || '.';
    var years = [];
    window.VCData.loadCore().then(function (data) {
      D = data;
      return get(root + '/data/reports/index.json');
    }).then(function (idx) {
      years = arr(idx.years);
      if (!years.length) throw new Error('暂无年度报告');
      // 指定年份（URL 参数优先），否则用索引里的最新一年
      var want = qs('year') || document.body.getAttribute('data-year') || String(years[0].year);
      var meta = years.filter(function (y) { return String(y.year) === String(want); })[0] || years[0];
      YEAR = String(meta.year);
      return get(root + '/data/' + meta.file);
    }).then(function (R) {
      R.__years = years;
      render(R);
    }).catch(function (e) {
      document.getElementById('report-main').innerHTML =
        '<div class="wrap"><div class="load-error">加载失败：' + esc(String(e && e.message || e)) + '</div></div>';
      console.error(e);
    });
  }

  function render(R) {
    var C = window.VCCharts;
    var host = document.getElementById('report-main');
    host.innerHTML = '';
    var wrap = el('div', 'wrap');
    var S = R.summary || {};

    document.title = (R.title || ('VocaloCollege ' + R.year)) + ' | 高校术力口之声';

    /* ---- 头部 ---- */
    var head = el('div', 'archive-head');
    head.innerHTML =
      '<p class="archive-head__kicker">Annual Report</p>' +
      '<h1 class="archive-head__title">VocaloCollege ' + esc(String(R.year)) + '</h1>' +
      '<p class="archive-head__meta">' + esc(R.subtitle || '') + '</p>';
    wrap.appendChild(head);

    /* ---- 声明：记录，而不是裁判 ---- */
    var stmtLines = arr(R.statement);
    if (stmtLines.length) {
      var stmt = el('div', 'notice notice--plain');
      stmt.innerHTML = '<b>关于本报告</b><ul class="notice__list">' +
        stmtLines.map(function (s) {
          return '<li>' + esc(s).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>') + '</li>';
        }).join('') + '</ul>';
      wrap.appendChild(stmt);
    }

    /* ---- 概览 ---- */
    var sec = el('section', 'data-sec');
    sec.appendChild(el('h2', 'data-sec__title', '收录概览'));
    sec.appendChild(el('p', 'data-sec__sub',
      '本年度 VocaloCollege 的收录规模与构成。数字描述的是收录情况，' +
      '不代表院校或社团的真实产出总量。'));

    function statGroup(title, rows) {
      var keep = rows.filter(function (r) { return r[0] != null; });
      if (!keep.length) return;
      sec.appendChild(el('h3', 'data-sec__h3', title));
      var g = el('div', 'grid grid--stats');
      keep.forEach(function (r) {
        g.appendChild(el('stat-block',
          'num="' + r[0] + '" label="' + esc(r[1]) + '" sub="' + esc(r[2]) + '"'));
      });
      sec.appendChild(g);
    }

    statGroup('收录规模', [
      [S.works, 'Works', '收录作品'],
      [S.editions, 'Editions', '涉及期数'],
      [S.schools, 'Universities', '参与高校'],
      [S.clubs, 'Clubs', '参与社团'],
      [S.vocals, 'Vocals', '歌声']
    ]);

    statGroup('类型构成', [
      [S.OC, 'OC', '原创'],
      [S.RT, 'RT', '翻调'],
      [S.VC, 'VC', '人声翻唱'],
      [S.IC, 'IC', '乐器翻奏'],
      [S.DW || null, 'DW', '衍生创作']
    ]);

    // 收录层级：与数据中心保持同一概念
    statGroup('收录层级', [
      [S.onAir, 'On-air', '收录于视频'],
      [S.listedOnly, 'Listed', '仅网页收录'],
      [S.sp, 'SP', '最推荐']
    ]);

    statGroup('合作', [
      [S.collaborations, 'Collab', '合作记录'],
      [S.crossSchool, 'Cross-school', '跨校合作']
    ]);

    if (S.typeUnknown) {
      sec.appendChild(el('p', 'data-note',
        '另有 ' + S.typeUnknown + ' 件作品分类待定，未纳入类型统计。'));
    }
    if (S.onAir != null && S.listedOnly != null) {
      sec.appendChild(el('p', 'data-note',
        '本年度 ' + S.onAir + ' 件作品收录进视频，' + S.listedOnly + ' 件仅在本站收录。' +
        '高校与社团的完整名录见 <a href="' + rootHref('schools/index.html') + '">高校档案</a> 与 ' +
        '<a href="' + rootHref('clubs/index.html') + '">社团档案</a>；本站不按作品数为院校或社团排序。'));
    }
    wrap.appendChild(sec);

    /* ---- 本年度收录说明 ---- */
    // 「收录」概念：年报需要说明"这一年的数字是怎么来的"
    var COL = window.VCCollection;
    if (COL) {
      var secC = el('section', 'data-sec');
      secC.appendChild(el('h2', 'data-sec__title', '收录说明'));
      secC.appendChild(el('p', 'data-sec__sub',
        '栏目以「期」为收录单位，本期报告按<b>作品发布年份</b>归集。' +
        '以下为栏目通行规则，完整说明见 ' +
        '<a href="' + rootHref('about.html') + '">收录细则</a>。'));
      secC.appendChild(el('div', 'collect-grid-wrap', COL.rules({ compact: 4 })));

      // 本年度口径：说明按年归集的口径与年份跨度
      var method = [];
      method.push('本页统计范围为<b>发布年份 ' + esc(String(R.year)) + ' 年</b>的作品，共 ' +
        (S.works || 0) + ' 件。');
      method.push('跨期补录作品按<b>发布时间</b>归年，因此较早年份的数字可能随补录而增加。');
      if (S.onAir != null && S.listedOnly != null) {
        method.push('其中 ' + S.onAir + ' 件收录于视频，' + S.listedOnly + ' 件仅网页收录，两者都计入总数。');
      }
      method.push('不采集、不展示播放量等平台指标；数字描述<b>本站收录情况</b>，不代表社团真实产出总量。');
      method.push('本站只记录「谁出现过、做了什么、什么时候做的」，不判断「谁更强」。');
      secC.appendChild(el('div', 'chart-box', '<ul class="collect-list">' +
        method.map(function (t) { return '<li>' + t + '</li>'; }).join('') + '</ul>'));
      wrap.appendChild(secC);
    }

    /* ---- 类型构成 ---- */
    var breakdown = arr(R.typeBreakdown);
    if (C && breakdown.length) {
      var sec2 = el('section', 'data-sec');
      sec2.appendChild(el('h2', 'data-sec__title', '作品类型构成'));
      sec2.appendChild(el('div', 'two-col',
        '<div class="chart-box">' + C.bars(breakdown.map(function (t) {
          return { label: t.label + ' (' + t.type + ')', n: t.count, key: t.type };
        }), { total: S.works }) + '</div>' +
        '<div class="chart-box">' + C.donut({
          OC: S.OC || 0, RT: S.RT || 0, VC: S.VC || 0, IC: S.IC || 0, DW: S.DW || 0
        }) + '</div>'));
      wrap.appendChild(sec2);
    }

    /* ---- 新增实体 ---- */
    var N = R.newEntities || {};
    var nSchools = arr(N.schools), nClubs = arr(N.clubs), nVocals = arr(N.vocals);
    var sec3 = el('section', 'data-sec');
    sec3.appendChild(el('h2', 'data-sec__title', '这一年新出现的'));
    sec3.appendChild(el('p', 'data-sec__sub',
      '相对更早年份首次进入 VocaloCollege 收录范围的高校、社团与歌声。'));

    function chips(list, hrefBase, empty) {
      if (!list.length) return '<p class="muted small">' + esc(empty) + '</p>';
      return '<div class="tagrow">' + list.map(function (x) {
        // hrefBase 是相对站点根的目录名，必须补上 "../" 才能从 /reports/ 正确跳转
        return '<a class="tag" href="' + rootHref(hrefBase + '/' + x.id + '.html') + '">' +
          esc(x.name) + '</a>';
      }).join('') + '</div>';
    }

    sec3.appendChild(el('h3', 'data-sec__h3', '新增高校（' + nSchools.length + '）'));
    sec3.appendChild(el('div', 'chart-box', chips(nSchools, 'schools', '无')));
    sec3.appendChild(el('h3', 'data-sec__h3', '新增社团（' + nClubs.length + '）'));
    sec3.appendChild(el('div', 'chart-box', chips(nClubs, 'clubs', '无')));
    sec3.appendChild(el('h3', 'data-sec__h3', '新增歌声（' + nVocals.length + '）'));
    sec3.appendChild(el('div', 'chart-box', chips(nVocals, 'vocals', '无')));
    wrap.appendChild(sec3);

    /* ---- 合作 ---- */
    var collabs = arr(R.collaborations);
    var sec4 = el('section', 'data-sec');
    sec4.appendChild(el('h2', 'data-sec__title', '跨校与合作'));
    if (!collabs.length) {
      sec4.appendChild(el('p', 'muted small', '本年度没有记录到多社团合作。'));
    } else {
      if (C) {
        sec4.appendChild(el('div', 'chart-box', C.bars(collabs.map(function (c) {
          return { label: c.label || c.id, n: arr(c.workIds).length };
        }), { showPct: false })));
      }
      sec4.appendChild(el('ul', 'data-about', collabs.map(function (c) {
        var schools = arr(c.schoolIds).length;
        return '<li>' + esc(c.label || c.id) + ' —— ' +
          arr(c.clubIds).length + ' 个社团' +
          (schools ? '、' + schools + ' 所高校' : '') +
          '，本年度 ' + arr(c.workIds).length + ' 件作品' +
          (c.isCrossSchool ? '（跨校）' : '（同校）') + '</li>';
      }).join('')));
    }
    wrap.appendChild(sec4);

    /* ---- 名录 ---- */
    // 注：此处不出「参与社团」「参与高校」两份按作品数排序的条形榜。
    // 栏目方要求移除 —— 即便标注「非排名」，把院校与社团按作品数并排排序，
    // 仍会被读成活跃度/实力对比，与方案十九「不做实力排行榜」相冲突。
    // 社团与高校的完整名录见上方的「新出现的实体」与 /clubs/ /schools/ 档案页。
    function listSec(title, sub, list, hrefBase) {
      // 防御：缺数据时静默跳过，而不是抛错让整页失败
      if (!Array.isArray(list) || !list.length || !C) return null;
      var s = el('section', 'data-sec');
      s.appendChild(el('h2', 'data-sec__title', title));
      s.appendChild(el('p', 'data-sec__sub', sub));
      s.appendChild(el('div', 'chart-box chart-box--tall', C.bars(list.slice(0, 20).map(function (x) {
        return { label: x.name, n: x.count, href: rootHref(hrefBase + '/' + x.id + '.html') };
      }), { total: S.works, showPct: false })));
      if (list.length > 20) {
        s.appendChild(el('p', 'data-note', '共 ' + list.length + ' 个，此处显示前 20。'));
      }
      return s;
    }
    // 歌声是音源/乐器，不是需要避免比较的社群实体，故此榜保留
    var secVocal = listSec('使用的歌声', '按本年度出现次数排列。', R.worksByVocal, 'vocals');
    if (secVocal) wrap.appendChild(secVocal);

    /* ---- 全部作品 ---- */
    var works = arr(R.works);
    var sec5 = el('section', 'data-sec');
    sec5.appendChild(el('h2', 'data-sec__title', '本年度收录作品（' + works.length + '）'));
    var grid2 = el('div', 'grid grid--works');
    works.forEach(function (w) {
      var c = document.createElement('work-card');
      // root 必须是 '..'：work-card 内部会用它拼 editions/xxx.html，
      // 传 '.' 会生成 /reports/editions/xxx.html（404）。
      c.ctx = { root: ROOT, showEdition: true };
      c.work = {
        id: w.id, title: w.title, title_short: w.title_short,
        type: w.type, is_sp: w.is_sp, tier: 'featured',
        edition_id: w.edition_id,
        _edition: ((D.editionMap || {})[w.edition_id] || {}).edition || null,
        _vocalLabel: arr(w.vocal_names).join('、'),
        _clubLabel: arr(w.club_names).join('、'),
        seq: { visible: w.onAir },
        bilibili: { bvid: w.bvid, url: w.url },
        media: {}
      };
      grid2.appendChild(c);
    });
    sec5.appendChild(grid2);
    wrap.appendChild(sec5);

    /* ---- 年份切换 ---- */
    var yearList = arr(R.__years);
    if (yearList.length) {
      var nav = el('nav', 'report-years');
      nav.setAttribute('aria-label', '年度切换');
      nav.innerHTML = '<a class="btn" href="index.html">← 全部年度</a>' +
        yearList.map(function (y) {
          return '<a class="btn' + (String(y.year) === String(R.year) ? ' btn--primary' : '') +
            '" href="?year=' + y.year + '">' + y.year + '（' + y.works + '）</a>';
        }).join('');
      wrap.appendChild(nav);
    }

    host.appendChild(wrap);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
