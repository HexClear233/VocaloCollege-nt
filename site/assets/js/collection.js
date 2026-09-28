/* ==========================================================================
   collection.js — 收录概念：总览与规则说明（数据中心 / 年报共用）

   目的：把「收录」这件事本身讲清楚 —— 收录范围、单位、上限、口径。
   依据 site/about.html 的收录细则（源自栏目方原文），不自行发明规则。

   设计原则（方案十六.2、十九）：
     只说明「怎么收录的」，不评价「谁收得多」。
     任何数字都必须能被读者复算，因此全部来自 statistics.json。
   ========================================================================== */
(function () {
  'use strict';

  function esc(s) { return window.VCComponents.esc(s); }
  function el(tag, cls, html) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (html != null) e.innerHTML = html;
    return e;
  }

  /** 栏目固定的收录规则（来自 site/about.html，勿随意改动） */
  var RULES = [
    { k: 'scope', t: '收录范围', d: '高校社团（动漫社 / 动漫协会 / 歌声合成、音声合成相关社团）在哔哩哔哩发布的术力口相关作品。' },
    { k: 'unit', t: '收录单位', d: '以「期」为单位组织。每期有独立的收录时间窗口，作品按其发布时间归入对应期。' },
    { k: 'cap', t: '单社团上限', d: '每期每社团常态收录 1 件，最推荐（SP）情形额外 1 件。' },
    { k: 'sp', t: 'SP Case', d: '策展人主观选出的最推荐作品，类别必须为原创（OC）或翻调（RT）。' },
    { k: 'video', t: '收录与播出', d: '部分作品收录于视频，部分仅在本站网页收录；两者都计入收录。' },
    { k: 'no_rank', t: '不做排行', d: '只记录「谁出现过、做了什么、什么时候做的」，不判断「谁更强」。' }
  ];

  /**
   * 渲染「收录规则」卡片组。
   * @param {object} opts
   *   opts.compact  仅显示前 N 条（年报用较短版本）
   */
  function rules(opts) {
    opts = opts || {};
    var list = opts.compact ? RULES.slice(0, opts.compact) : RULES;
    return '<div class="collect-grid">' + list.map(function (r) {
      return '<div class="collect-card">' +
        '<div class="collect-card__t">' + esc(r.t) + '</div>' +
        '<div class="collect-card__d">' + esc(r.d) + '</div>' +
        '</div>';
    }).join('') + '</div>';
  }

  /**
   * 渲染「收录口径」说明：解释统计数字是怎么来的。
   * @param {object} S  statistics.json
   * @param {object} o  { scope: 'all' | 'year', year?: number }
   */
  function methodology(S, o) {
    o = o || {};
    var ov = S.overview || {};
    var cov = S.coverage || {};
    var items = [];

    items.push('全部数字由 <code>/data</code> 的公开数据实时计算，无第三方统计，可逐条复算。');

    if (cov.worksTotal) {
      var typed = cov.worksTyped != null ? cov.worksTyped : (cov.worksTotal - (cov.worksUntyped || 0));
      items.push('分类完整性：' + typed + ' / ' + cov.worksTotal + ' 件作品已完成类型归类' +
        (cov.typeCoverage != null ? '（' + (cov.typeCoverage * 100).toFixed(1) + '%）' : '') +
        (cov.worksUntyped ? '，另有 ' + cov.worksUntyped + ' 件待定，未摊派到任何类型' : '') + '。');
    }

    if (ov.onAir != null && ov.listedOnly != null) {
      items.push('收录层级：' + ov.onAir + ' 件收录于视频（On-air），' +
        ov.listedOnly + ' 件仅网页收录（Listed）；两者都计入总数。');
    }

    items.push('不采集、不展示任何平台指标（播放量 / 点赞 / 投币等）。' +
      '这类数据受推荐算法与粉丝基数影响，不能反映作品质量。');

    items.push('收录必然存在遗漏 —— 栏目受篇幅与观测视野限制。' +
      '因此数字描述的是<b>本站收录情况</b>，不代表社团真实产出总量。');

    if (o.scope === 'year' && o.year) {
      items.push('本页只统计<b>发布年份为 ' + o.year + ' 年</b>的作品。' +
        '跨期补录作品按发布时间归年，故较早年份的数字可能随补录增加。');
    }

    return '<ul class="collect-list">' + items.map(function (t) {
      return '<li>' + t + '</li>';
    }).join('') + '</ul>';
  }

  /**
   * 渲染「按期收录」表：窗口、规模、层级、完整性。
   * 这是「收录概念」在数据上的具体化 —— 每期收了什么、收了多久、收了多少。
   * @param {object} S statistics.json
   * @param {object} opts
   *   opts.linkPrefix  到站点根的相对前缀（data.html 用 './'，reports/*.html 用 '../'）
   *   opts.highlightEdition  需要高亮的期 id
   */
  function editionsTable(S, opts) {
    opts = opts || {};
    var TYPES = ['OC', 'RT', 'VC', 'IC', 'DW'];
    var eds = Array.isArray(S.byEdition) ? S.byEdition : [];
    if (!eds.length) return '<p class="muted small">暂无收录数据。</p>';

    // 期页面位于站点根的 editions/ 下。调用方所在的页面层级不同，
    // 因此前缀必须由调用方给出 —— 写死会导致 data.html 生成 editions/xxx.html
    // 之类的相对路径错误（曾因此出现 5 条断链）。
    var prefix = opts.linkPrefix != null ? opts.linkPrefix : './';

    var VIDEO_ZH = {
      available: '可观看',
      deleted: '视频已失效',
      unavailable: '不可用',
      unknown: '未知',
      pending: '待确认'
    };

    var rows = eds.map(function (e) {
      var w = e.collect_window;
      var win = w && w.raw ? w.raw : '—';
      var vid = VIDEO_ZH[e.video_status] || e.video_status || '—';
      var hl = e.id === opts.highlightEdition;
      return '<tr' + (hl ? ' class="dt__hl"' : '') + '>' +
        '<td><a href="' + prefix + 'editions/' + esc(e.id) + '.html">' +
          esc(e.label || e.id) + '</a></td>' +
        '<td class="dt__win">' + esc(win) + '</td>' +
        '<td><b>' + e.works + '</b></td>' +
        TYPES.map(function (t) {
          return '<td>' + (e[t] || '—') + '</td>';
        }).join('') +
        '<td>' + (e.sp || '—') + '</td>' +
        '<td>' + (e.onAir || 0) + ' / ' + ((e.works || 0) - (e.onAir || 0)) + '</td>' +
        '<td>' + esc(vid) + '</td>' +
        '</tr>';
    }).join('');

    return '<div class="table-wrap"><table class="dt dt--collect">' +
      '<thead><tr>' +
        '<th>期</th><th>收录时间窗口</th><th>收录</th>' +
        TYPES.map(function (t) { return '<th>' + t + '</th>'; }).join('') +
        '<th>SP</th><th>视频 / 仅网页</th><th>视频状态</th>' +
      '</tr></thead><tbody>' + rows +
      '<tr class="dt__total">' +
        '<td>合计</td><td>—</td><td><b>' + eds.reduce(function (a, e) { return a + e.works; }, 0) + '</b></td>' +
        TYPES.map(function (t) {
          var n = eds.reduce(function (a, e) { return a + (e[t] || 0); }, 0);
          return '<td>' + (n || '—') + '</td>';
        }).join('') +
        '<td>' + eds.reduce(function (a, e) { return a + (e.sp || 0); }, 0) + '</td>' +
        '<td>' + eds.reduce(function (a, e) { return a + (e.onAir || 0); }, 0) + ' / ' +
          (eds.reduce(function (a, e) { return a + e.works; }, 0) -
           eds.reduce(function (a, e) { return a + (e.onAir || 0); }, 0)) + '</td>' +
        '<td>—</td>' +
      '</tr></tbody></table></div>' +
      '<p class="data-note">「视频 / 仅网页」表示该期收录作品中收录进视频与仅在网页展示的件数。' +
      '「视频已失效」指该期原视频在哔哩哔哩已不可访问，但收录记录与作品信息完整保留。</p>';
  }

  window.VCCollection = {
    RULES: RULES,
    rules: rules,
    methodology: methodology,
    editionsTable: editionsTable
  };
})();
