/* ==========================================================================
   page-data.js — 数据中心（方案 5.8 / Phase 3）
   七项：数据总览 / 创作趋势 / 类型统计 / 歌声统计 / 高校统计 / 合作网络
   （地域地图经栏目方决定略过，此处不做）

   两条硬规则（方案 16.2、十九）：
     1. 图表只描述收录情况，不用于评价作品质量
     2. status 为 pending / inferred 的字段不参与统计 —— 本站数据已全部确认，
        此处仅对 type 为 null 的作「分类待定」单列，不摊派到任何类型
   ========================================================================== */
(function () {
  'use strict';

  var D = null;
  var C = null;
  var STATS = null;   // data/statistics.json（构建产物，可能缺失）

  function esc(s) { return window.VCComponents.esc(s); }
  function el(tag, cls, html) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (html != null) e.innerHTML = html;
    return e;
  }

  function boot() {
    C = window.VCCharts;
    var root = document.body.getAttribute('data-root') || '.';
    // 需要 statistics.json 来展示「收录口径」与「按期收录」。
    // 它是构建产物（build_statistics.js 生成），缺失时降级：只跳过这两个区块，
    // 不影响其余图表渲染。
    var statsP = fetch(root + '/data/statistics.json', { cache: 'no-cache' })
      .then(function (r) { return r.ok ? r.json() : null; })
      .catch(function () { return null; });

    Promise.all([window.VCData.load(), statsP]).then(function (a) {
      D = a[0];
      STATS = a[1];
      render();
    }).catch(function (e) {
      document.getElementById('data-main').innerHTML =
        '<div class="wrap"><div class="load-error">数据加载失败：' + esc(String(e && e.message || e)) + '</div></div>';
      console.error(e);
    });
  }

  /* ---------------------------------------------------------------- 统计计算 */
  function overview() {
    var tc = D.typeCounts(D.works);
    var sp = D.works.filter(function (w) { return w.is_sp; });
    // 跨校合作：collaboration 中 is_cross_school 为真的作品数
    var crossIds = {};
    D.editions.forEach(function (ed) {
      (ed.collaborations || []).forEach(function (c) {
        if (c.is_cross_school) (c.work_ids || []).forEach(function (id) { crossIds[id] = 1; });
      });
    });
    return {
      works: D.works.length,
      schools: D.uniqueSchools().length,
      clubs: D.uniqueClubs().length,
      vocals: D.uniqueVocals().length,
      editions: D.editions.length,
      tc: tc,
      sp: sp.length,
      crossSchool: Object.keys(crossIds).length,
      multiClub: D.works.filter(function (w) { return (w._clubIds || []).length > 1; }).length
    };
  }

  /** 按年份统计各类型数量（用作品发布年，而非收录年） */
  function byYear() {
    var years = {};
    D.works.forEach(function (w) {
      var y = w.year;
      if (!y) return;
      var r = years[y] = years[y] || { year: y, total: 0, parts: { OC: 0, RT: 0, VC: 0, IC: 0, DW: 0 } };
      r.total++;
      if (r.parts[w.type] !== undefined) r.parts[w.type]++;
    });
    return Object.keys(years).map(function (y) { return years[y]; })
      .sort(function (a, b) { return a.year - b.year; });
  }

  /** 按期统计 */
  function byEdition() {
    return D.editions.map(function (ed) {
      var parts = { OC: 0, RT: 0, VC: 0, IC: 0, DW: 0 };
      ed.works.forEach(function (w) { if (parts[w.type] !== undefined) parts[w.type]++; });
      return { id: ed.edition.id, label: ed.edition.label_short || ed.edition.label,
               total: ed.works.length, parts: parts, edition: ed.edition };
    });
  }

  /** 歌声排行 */
  function vocalRank() {
    return Object.keys(D.uniqueVocals().reduce(function (m, id) { m[id] = 1; return m; }, {}))
      .map(function (id) {
        var ws = D.worksOfVocal(id);
        var p = { OC: 0, RT: 0, VC: 0, IC: 0, DW: 0 };
        ws.forEach(function (w) { if (p[w.type] !== undefined) p[w.type]++; });
        var v = D.vocalMap[id];
        return { id: id, label: v ? v.name : id, n: ws.length, parts: p, works: ws, entity: v };
      })
      .sort(function (a, b) { return b.n - a.n || a.label.localeCompare(b.label, 'zh'); });
  }

  // 说明：此处原有两个函数 schoolRank() / clubRank()，用于生成「高校统计」与
  // 「社团收录排行」。栏目方决定移除这类按实体数量的排行 —— 按作品数给高校或
  // 社团排序，容易被读成实力/活跃度排名，与方案十九「不做实力排行榜」
  // 「记录，而不是裁判」相冲突。
  // 高校与社团的完整列表见 /schools/ 与 /clubs/ 档案页（按名称组织，非排名）。

  /** 合作网络：节点 = 参与过合作的社团，边 = 共同出现次数 */
  function collaborationNetwork() {
    var edgeMap = {};
    var nodeSet = {};
    D.works.forEach(function (w) {
      var ids = w._clubIds || [];
      if (ids.length < 2) return;
      ids.forEach(function (a) { nodeSet[a] = 1; });
      for (var i = 0; i < ids.length; i++) {
        for (var j = i + 1; j < ids.length; j++) {
          var a = ids[i] < ids[j] ? ids[i] : ids[j];
          var b = ids[i] < ids[j] ? ids[j] : ids[i];
          var k = a + '|' + b;
          if (!edgeMap[k]) edgeMap[k] = { a: a, b: b, w: 0, works: [] };
          edgeMap[k].w++;
          edgeMap[k].works.push(w);
        }
      }
    });

    var deg = {};
    Object.keys(edgeMap).forEach(function (k) {
      var e = edgeMap[k];
      deg[e.a] = (deg[e.a] || 0) + 1;
      deg[e.b] = (deg[e.b] || 0) + 1;
    });

    var nodes = Object.keys(nodeSet).map(function (id) {
      return {
        id: id,
        label: D.nameOfClub(id),
        n: D.worksOfClub(id).length,
        degree: deg[id] || 0
      };
    });
    var edges = Object.keys(edgeMap).map(function (k) {
      var e = edgeMap[k];
      return {
        a: e.a, b: e.b, w: e.w,
        title: D.nameOfClub(e.a) + ' × ' + D.nameOfClub(e.b) + '：合作 ' + e.w + ' 次'
      };
    });
    return { nodes: nodes, edges: edges };
  }

  /** 合作类型分布 */
  function collaborationKinds() {
    var kinds = {};
    D.editions.forEach(function (ed) {
      (ed.collaborations || []).forEach(function (c) {
        var k = c.cross_school_kind || 'unknown';
        kinds[k] = (kinds[k] || 0) + 1;
      });
    });
    return kinds;
  }

  /* ---------------------------------------------------------------- 渲染 */
  var KIND_ZH = {
    single_club: '单社团',
    same_university_multi_club: '同校多社团',
    same_university_multi_campus: '同校多校区',
    cross_school: '跨校',
    cross_region: '跨地区联合企划',
    unknown: '待定'
  };

  function render() {
    var host = document.getElementById('data-main');
    host.innerHTML = '';
    var wrap = el('div', 'wrap');

    var O = overview();
    var years = byYear();
    var eds = byEdition();
    var vocals = vocalRank();
    // 注：不再计算高校/社团排行（见上方说明）
    var net = collaborationNetwork();
    var kinds = collaborationKinds();

    /* ---- 头部 ---- */
    var updated = D.index.data_updated_at || (D.index.snapshots && D.index.snapshots.latest) || null;
    wrap.appendChild(el('div', 'archive-head',
      '<p class="archive-head__kicker">Data Center</p>' +
      '<h1 class="archive-head__title">数据中心</h1>' +
      '<p class="archive-head__meta">' +
        '本站全部统计均由 <code>/data</code> 的公开数据实时计算，可追溯、可复核。' +
        '<b>数据用于描述收录情况，不用于评价作品质量。</b>' +
      '</p>' +
      (updated ? '<p class="archive-head__range">Data updated: ' + esc(updated) + '</p>' : '')));

    /* ---- 年度报告入口 ---- */
    wrap.appendChild(el('div', 'notice notice--plain',
      '<b>年度报告</b>' +
      '<p>按年整理的收录记录：新增高校 / 社团 / 歌声、跨校合作与全部作品清单。' +
      '<b>本报告是记录，不是评比</b> —— 不设年度最佳、不做实力排名。</p>' +
      '<p><a class="btn" href="reports/index.html">查看年度报告 →</a></p>'));

    /* ---- 1. 总览 ---- */
    var sec1 = el('section', 'data-sec');
    sec1.appendChild(el('h2', 'data-sec__title', '总览'));
    sec1.appendChild(el('p', 'data-sec__sub',
      '本站收录规模的整体快照。数字描述的是 VocaloCollege 的收录情况，' +
      '不代表社团真实产出总量。'));

    // 规模：先给出"有多少"的基本面
    sec1.appendChild(el('h3', 'data-sec__h3', '收录规模'));
    var gridScale = el('div', 'grid grid--stats');
    [
      [O.works, 'Works', '作品', 'works.html'],
      [O.editions, 'Editions', '期数', null],
      [O.schools, 'Universities', '高校', 'schools/index.html'],
      [O.clubs, 'Clubs', '社团', 'clubs/index.html'],
      [O.vocals, 'Vocals', '歌声', 'vocals/index.html'],
      [O.engines, 'Engines', '引擎', null]
    ].forEach(function (r) {
      gridScale.appendChild(el('stat-block',
        'num="' + r[0] + '" label="' + esc(r[1]) + '" sub="' + esc(r[2]) + '"' +
        (r[3] ? ' href="' + r[3] + '"' : '')));
    });
    sec1.appendChild(gridScale);

    // 类型构成
    sec1.appendChild(el('h3', 'data-sec__h3', '类型构成'));
    var gridType = el('div', 'grid grid--stats');
    [
      [O.tc.OC, 'OC', '原创', 'works.html?types=OC'],
      [O.tc.RT, 'RT', '翻调', 'works.html?types=RT'],
      [O.tc.VC, 'VC', '人声翻唱', 'works.html?types=VC'],
      [O.tc.IC, 'IC', '乐器翻奏', 'works.html?types=IC'],
      [O.tc.DW || null, 'DW', '衍生创作', null]
    ].filter(function (r) { return r[0]; }).forEach(function (r) {
      gridType.appendChild(el('stat-block',
        'num="' + r[0] + '" label="' + esc(r[1]) + '" sub="' + esc(r[2]) + '"' +
        (r[3] ? ' href="' + r[3] + '"' : '')));
    });
    sec1.appendChild(gridType);

    // 收录层级：视频 vs 仅网页
    sec1.appendChild(el('h3', 'data-sec__h3', '收录层级'));
    var gridLv = el('div', 'grid grid--stats');
    [
      [O.onAir, 'On-air', '收录于视频', 'works.html?onair=1'],
      [O.listedOnly, 'Listed', '仅网页收录', null],
      [O.sp, 'SP', '最推荐', 'works.html?sp=1']
    ].forEach(function (r) {
      gridLv.appendChild(el('stat-block',
        'num="' + r[0] + '" label="' + esc(r[1]) + '" sub="' + esc(r[2]) + '"' +
        (r[3] ? ' href="' + r[3] + '"' : '')));
    });
    sec1.appendChild(gridLv);

    // 合作
    sec1.appendChild(el('h3', 'data-sec__h3', '合作'));
    var gridC = el('div', 'grid grid--stats');
    [
      [O.collaborations, 'Collab', '合作记录', null],
      [O.crossSchool, 'Cross-school', '跨校合作作品', 'works.html?onair=1'],
      [O.multiClub, 'Multi-club', '多社团作品', null]
    ].forEach(function (r) {
      gridC.appendChild(el('stat-block',
        'num="' + r[0] + '" label="' + esc(r[1]) + '" sub="' + esc(r[2]) + '"' +
        (r[3] ? ' href="' + r[3] + '"' : '')));
    });
    sec1.appendChild(gridC);

    // 数据完整性（方案十六.2「可解释」）
    var cov = D.index.coverage || null;
    if (cov && cov.works_total != null) {
      sec1.appendChild(el('p', 'data-note',
        '数据完整性：' + cov.works_typed + ' / ' + cov.works_total + ' 件作品已完成分类' +
        (cov.type_coverage_ratio != null
          ? '（' + (cov.type_coverage_ratio * 100).toFixed(1) + '%）' : '') + '。' +
        (O.tc.unknown ? '另有 ' + O.tc.unknown + ' 件分类待定，未纳入类型统计。' : '')));
    } else if (O.tc.unknown) {
      sec1.appendChild(el('p', 'data-note',
        '另有 ' + O.tc.unknown + ' 件作品分类待定，未纳入类型统计。'));
    }

    sec1.appendChild(el('p', 'data-note',
      '高校与社团的完整名录请见 <a href="schools/index.html">高校档案</a> 与 ' +
      '<a href="clubs/index.html">社团档案</a>；本站不按作品数为院校或社团排序。'));

    wrap.appendChild(sec1);

    /* ---- 2. 收录说明 ---- */
    var COL = window.VCCollection;
    var secC = el('section', 'data-sec');
    secC.appendChild(el('h2', 'data-sec__title', '收录说明'));
    secC.appendChild(el('p', 'data-sec__sub',
      '「收录」是本栏目的核心动作。以下说明收录什么、以什么为单位、有何上限 —— ' +
      '数据页的所有数字都建立在这套口径上。完整规则见 ' +
      '<a href="about.html">收录细则</a>。'));
    secC.appendChild(el('div', 'collect-grid-wrap', COL.rules()));
    wrap.appendChild(secC);

    /* ---- 3. 收录口径（数字怎么来的）---- */
    var secM = el('section', 'data-sec');
    secM.appendChild(el('h2', 'data-sec__title', '收录口径'));
    secM.appendChild(el('p', 'data-sec__sub',
      '为保证可追溯、可复核，此处说明每个数字的计算方式。'));
    if (STATS) {
      secM.appendChild(el('div', 'chart-box', COL.methodology(STATS, { scope: 'all' })));
    } else {
      secM.appendChild(el('p', 'data-note',
        '统计文件（statistics.json）尚未生成，请运行 <code>npm run data:stats</code>。'));
    }
    wrap.appendChild(secM);

    /* ---- 4. 按期收录 ---- */
    var secE = el('section', 'data-sec');
    secE.appendChild(el('h2', 'data-sec__title', '按期收录'));
    secE.appendChild(el('p', 'data-sec__sub',
      '栏目以「期」为收录单位。每期有独立的收录时间窗口，' +
      '窗口内的作品按发布时间归入该期。'));
    if (STATS) {
      // data.html 位于站点根，故前缀为 './'
      secE.appendChild(el('div', 'chart-box', COL.editionsTable(STATS, { linkPrefix: './' })));
    } else {
      secE.appendChild(el('p', 'data-note', '统计文件尚未生成。'));
    }
    wrap.appendChild(secE);

    /* ---- 2. 创作趋势 ---- */
    var sec2 = el('section', 'data-sec');
    sec2.appendChild(el('h2', 'data-sec__title', '创作趋势'));
    sec2.appendChild(el('p', 'data-sec__sub',
      '按作品发布年份统计。含跨期补录与早期作品，故年份跨度大于栏目期数。'));

    var trendRows = years.map(function (y) {
      return { label: String(y.year), total: y.total, parts: y.parts };
    });
    sec2.appendChild(el('div', 'chart-box', C.stackedBars(trendRows, { height: 200 })));
    sec2.appendChild(el('div', 'chart-legend-inline',
      C.TYPE_ORDER.map(function (t) {
        return '<span class="chart-legend__item"><span class="chart-legend__dot" style="background:' +
          C.color(t) + '"></span>' + C.TYPE_ZH[t] + '</span>';
      }).join('')));

    sec2.appendChild(el('h3', 'data-sec__h3', '按期收录规模'));
    sec2.appendChild(el('div', 'chart-box', C.stackedBars(
      eds.map(function (e) {
        return { label: e.label.replace(/\s*Vol\.?/, ' V'), total: e.total, parts: e.parts };
      }), { height: 200 })));
    wrap.appendChild(sec2);

    /* ---- 3. 类型统计 ---- */
    var sec3 = el('section', 'data-sec');
    sec3.appendChild(el('h2', 'data-sec__title', '类型统计'));
    sec3.appendChild(el('div', 'two-col',
      '<div class="chart-box">' + C.donut(O.tc) + '</div>' +
      '<div class="chart-box">' + C.bars(
        C.TYPE_ORDER.filter(function (t) { return O.tc[t]; }).map(function (t) {
          return { label: C.TYPE_ZH[t] + ' (' + t + ')', n: O.tc[t], key: t,
                   href: 'works.html?types=' + t };
        }), { total: O.works }) + '</div>'));

    sec3.appendChild(el('h3', 'data-sec__h3', '各期类型构成'));
    sec3.appendChild(el('div', 'table-wrap', '<table class="dt">' +
      '<thead><tr><th>期</th>' + C.TYPE_ORDER.map(function (t) {
        return '<th>' + t + '</th>';
      }).join('') + '<th>合计</th></tr></thead><tbody>' +
      eds.map(function (e) {
        return '<tr><td><a href="editions/' + esc(e.id) + '.html">' + esc(e.label) + '</a></td>' +
          C.TYPE_ORDER.map(function (t) {
            return '<td>' + (e.parts[t] || '—') + '</td>';
          }).join('') +
          '<td><b>' + e.total + '</b></td></tr>';
      }).join('') +
      '<tr class="dt__total"><td>合计</td>' +
        C.TYPE_ORDER.map(function (t) { return '<td>' + (O.tc[t] || '—') + '</td>'; }).join('') +
        '<td><b>' + O.works + '</b></td></tr>' +
      '</tbody></table>'));
    wrap.appendChild(sec3);

    /* ---- 4. 歌声统计 ---- */
    var sec4 = el('section', 'data-sec');
    sec4.appendChild(el('h2', 'data-sec__title', '歌声统计'));
    sec4.appendChild(el('p', 'data-sec__sub', '共 ' + vocals.length + ' 位歌声参与收录。'));

    sec4.appendChild(el('div', 'two-col',
      '<div class="chart-box">' + C.bars(vocals.slice(0, 12).map(function (v) {
        return { label: v.label, n: v.n, href: 'vocals/' + v.id + '.html' };
      }), { total: D.works.length, showPct: false }) + '</div>' +
      '<div class="chart-box">' + C.bars(vocals.filter(function (v) { return v.n >= 2; })
        .slice(0, 12).map(function (v) {
          return { label: v.label, n: v.parts.OC, key: 'OC', href: 'works.html?types=OC&vocals=' + v.id };
        }), { total: O.tc.OC, showPct: false }) +
        '<p class="chart-box__cap">上：各歌声作品数　下：各歌声原创（OC）作品数</p>' +
      '</div>'));
    wrap.appendChild(sec4);

    /* ---- 5. 合作网络 ---- */
    var sec6 = el('section', 'data-sec');
    sec6.appendChild(el('h2', 'data-sec__title', '合作网络'));
    sec6.appendChild(el('p', 'data-sec__sub',
      '共 ' + O.multiClub + ' 件作品由多个社团共同参与，涉及 ' + net.nodes.length +
      ' 个社团、' + net.edges.length + ' 条合作关系。'));

    sec6.appendChild(el('div', 'chart-box', C.network(net.nodes, net.edges)));

    sec6.appendChild(el('h3', 'data-sec__h3', '合作关系一览'));
    sec6.appendChild(el('div', 'chart-box', C.bars(
      net.edges.slice().sort(function (a, b) { return b.w - a.w; }).map(function (e) {
        return { label: D.nameOfClub(e.a) + ' × ' + D.nameOfClub(e.b), n: e.w };
      }), { showPct: false })));

    sec6.appendChild(el('h3', 'data-sec__h3', '合作类型'));
    sec6.appendChild(el('div', 'chart-box', C.bars(
      Object.keys(kinds).map(function (k) {
        return { label: KIND_ZH[k] || k, n: kinds[k] };
      }), { showPct: false })));
    sec6.appendChild(el('p', 'data-note',
      '跨校合作与同校多社团合作分开统计 —— 同校不同社团（甚至不同校区）不构成跨校合作。'));
    wrap.appendChild(sec6);

    /* ---- 页脚说明 ---- */
    wrap.appendChild(el('section', 'data-sec',
      '<h2 class="data-sec__title">关于这些数据</h2>' +
      '<ul class="data-about">' +
        '<li>全部数字由本站公开数据实时计算，不含第三方播放量、点赞等平台指标。</li>' +
        '<li>数据用于描述<b>收录情况</b>，不代表社团或作品的真实产出总量，也不构成质量评价。</li>' +
        '<li>受栏目篇幅与观测视野限制，收录必然存在遗漏，请勿据此比较社团实力。</li>' +
        '<li>跨期补录作品（论外）计入其<b>发布年份</b>，因此早期年份数字会随补录增加。</li>' +
        '<li>原始数据：<a href="data/index.json">index.json</a> · ' +
          '<a href="data/taxonomy.json">taxonomy.json</a></li>' +
      '</ul>'));

    host.appendChild(wrap);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
