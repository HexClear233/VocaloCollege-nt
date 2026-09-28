/* ==========================================================================
   charts.js — 轻量图表原语（纯 SVG + CSS，无外部依赖）
   Phase 3 数据中心使用：堆叠柱 / 横条 / 环形 / 关系图
   设计约束（方案 5.8）：数据图表用于描述收录情况，不用于评价作品质量
   ========================================================================== */
(function () {
  'use strict';

  var TYPE_ORDER = ['OC', 'RT', 'VC', 'IC', 'DW'];
  var TYPE_ZH = { OC: '原创', RT: '翻调', VC: '人声翻唱', IC: '乐器翻奏', DW: '衍生' };
  var TYPE_VAR = {
    OC: '--type-oc', RT: '--type-rt', VC: '--type-vc',
    IC: '--type-ic', DW: '--type-dw'
  };

  function esc(s) { return window.VCComponents.esc(s); }
  function color(t) { return 'var(' + (TYPE_VAR[t] || '--secondary') + ')'; }

  /* ---------------------------------------------------------------- 堆叠柱状图
     用于「创作趋势」：每年一根柱，按类型堆叠
     rows: [{ label, total, parts: { OC:n, RT:n, ... } }]
     ---------------------------------------------------------------------- */
  function stackedBars(rows, opts) {
    opts = opts || {};
    var max = Math.max.apply(null, rows.map(function (r) { return r.total; }).concat([1]));
    var H = opts.height || 180;

    return '<div class="chart-stack" style="--chart-h:' + H + 'px">' +
      rows.map(function (r) {
        var segs = TYPE_ORDER.map(function (t) {
          var n = r.parts[t] || 0;
          if (!n) return '';
          var pct = (n / max * 100).toFixed(2);
          return '<span class="chart-stack__seg" style="height:' + pct + '%;background:' + color(t) +
            '" title="' + esc(r.label + ' ' + TYPE_ZH[t] + ' ' + n + ' 件') + '">' +
            (n / max > 0.08 ? '<span class="chart-stack__num">' + n + '</span>' : '') +
            '</span>';
        }).join('');
        return '<div class="chart-stack__col">' +
          '<div class="chart-stack__bar" style="height:' + H + 'px">' + segs + '</div>' +
          '<div class="chart-stack__label">' + esc(r.label) + '</div>' +
          '<div class="chart-stack__total">' + r.total + '</div>' +
        '</div>';
      }).join('') +
    '</div>';
  }

  /* ---------------------------------------------------------------- 横条图
     rows: [{ label, n, key?, href? }]   key 用于取类型色
     ---------------------------------------------------------------------- */
  function bars(rows, opts) {
    opts = opts || {};
    var max = Math.max.apply(null, rows.map(function (r) { return r.n; }).concat([1]));
    var total = opts.total || rows.reduce(function (a, r) { return a + r.n; }, 0);

    return '<div class="chart-bars">' + rows.map(function (r) {
      var w = (r.n / max * 100).toFixed(2);
      var pct = total ? (r.n / total * 100).toFixed(1) : '0.0';
      var bg = r.key ? color(r.key) : 'var(--accent)';
      var label = r.href
        ? '<a class="chart-bars__label" href="' + esc(r.href) + '">' + esc(r.label) + '</a>'
        : '<span class="chart-bars__label">' + esc(r.label) + '</span>';
      return '<div class="chart-bars__row">' +
        label +
        '<span class="chart-bars__track"><span class="chart-bars__fill" style="width:' + w +
          '%;background:' + bg + '"></span></span>' +
        '<span class="chart-bars__num">' + r.n +
          (opts.showPct === false ? '' : '<span class="chart-bars__pct">' + pct + '%</span>') +
        '</span>' +
      '</div>';
    }).join('') + '</div>';
  }

  /* ---------------------------------------------------------------- 环形图
     parts: { OC:n, RT:n, ... }
     ---------------------------------------------------------------------- */
  function donut(parts, opts) {
    opts = opts || {};
    var total = TYPE_ORDER.reduce(function (a, t) { return a + (parts[t] || 0); }, 0);
    if (!total) return '<p class="muted small">暂无数据。</p>';

    var R = 54, C = 2 * Math.PI * R;
    var offset = 0;
    var segs = TYPE_ORDER.map(function (t) {
      var n = parts[t] || 0;
      if (!n) return '';
      var frac = n / total;
      var len = frac * C;
      var s = '<circle class="chart-donut__seg" cx="70" cy="70" r="' + R + '"' +
        ' stroke="' + color(t) + '"' +
        ' stroke-dasharray="' + len.toFixed(2) + ' ' + (C - len).toFixed(2) + '"' +
        ' stroke-dashoffset="' + (-offset).toFixed(2) + '">' +
        '<title>' + TYPE_ZH[t] + ' ' + n + ' 件（' + (frac * 100).toFixed(1) + '%）</title>' +
        '</circle>';
      offset += len;
      return s;
    }).join('');

    var legend = TYPE_ORDER.filter(function (t) { return parts[t]; }).map(function (t) {
      var n = parts[t];
      return '<li class="chart-legend__item">' +
        '<span class="chart-legend__dot" style="background:' + color(t) + '"></span>' +
        '<span class="chart-legend__name">' + esc(TYPE_ZH[t]) + '</span>' +
        '<span class="chart-legend__n">' + n + '</span>' +
        '<span class="chart-legend__pct">' + (n / total * 100).toFixed(1) + '%</span>' +
      '</li>';
    }).join('');

    return '<div class="chart-donut-wrap">' +
      '<svg class="chart-donut" viewBox="0 0 140 140" role="img" aria-label="作品类型构成">' +
        '<g transform="rotate(-90 70 70)">' + segs + '</g>' +
        '<text class="chart-donut__total" x="70" y="66">' + total + '</text>' +
        '<text class="chart-donut__cap" x="70" y="84">作品</text>' +
      '</svg>' +
      '<ul class="chart-legend">' + legend + '</ul>' +
    '</div>';
  }

  /* ---------------------------------------------------------------- 关系图
     用于「合作网络」：社团为节点，合作为边。
     采用确定性布局（按合作度分环），不用力导向，保证每次渲染一致且无需动画。
     nodes: [{ id, label, n, degree }]
     edges: [{ a, b, w }]
     ---------------------------------------------------------------------- */
  function network(nodes, edges, opts) {
    opts = opts || {};
    var W = 720, H = opts.height || 440;
    var cx = W / 2, cy = H / 2;

    if (!nodes.length) return '<p class="muted small">暂无合作数据。</p>';

    // 按合作度分层：度越高越靠中心
    var maxDeg = Math.max.apply(null, nodes.map(function (n) { return n.degree; }).concat([1]));
    var rings = [];
    nodes.forEach(function (n) {
      var lvl = maxDeg <= 1 ? 1 : (n.degree >= 2 ? 0 : 1);
      (rings[lvl] = rings[lvl] || []).push(n);
    });

    var pos = {};
    rings.forEach(function (ring, lvl) {
      if (!ring) return;
      // lvl 0 中心区、lvl 1 外环
      var radius = lvl === 0 ? Math.min(110, 60 + ring.length * 4) : 180;
      ring.sort(function (a, b) { return b.degree - a.degree || a.label.localeCompare(b.label, 'zh'); });
      ring.forEach(function (n, i) {
        var ang = (i / ring.length) * Math.PI * 2 - Math.PI / 2;
        pos[n.id] = {
          x: cx + Math.cos(ang) * radius,
          y: cy + Math.sin(ang) * radius
        };
      });
    });

    var maxW = Math.max.apply(null, edges.map(function (e) { return e.w; }).concat([1]));

    var edgeSvg = edges.map(function (e) {
      var a = pos[e.a], b = pos[e.b];
      if (!a || !b) return '';
      var sw = (1 + (e.w / maxW) * 3).toFixed(2);
      return '<line class="net__edge" x1="' + a.x.toFixed(1) + '" y1="' + a.y.toFixed(1) +
        '" x2="' + b.x.toFixed(1) + '" y2="' + b.y.toFixed(1) +
        '" stroke-width="' + sw + '"><title>' + esc(e.title || (e.w + ' 次合作')) + '</title></line>';
    }).join('');

    var maxN = Math.max.apply(null, nodes.map(function (n) { return n.n; }).concat([1]));
    var nodeSvg = nodes.map(function (n) {
      var p = pos[n.id];
      var r = 7 + (n.n / maxN) * 11;
      return '<g class="net__node">' +
        '<circle cx="' + p.x.toFixed(1) + '" cy="' + p.y.toFixed(1) + '" r="' + r.toFixed(1) + '">' +
          '<title>' + esc(n.label + '：' + n.n + ' 件作品，' + n.degree + ' 个合作社团') + '</title>' +
        '</circle>' +
        '<text x="' + p.x.toFixed(1) + '" y="' + (p.y + r + 12).toFixed(1) + '">' + esc(n.label) + '</text>' +
      '</g>';
    }).join('');

    return '<div class="chart-net">' +
      '<svg viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="社团合作网络">' +
        '<g>' + edgeSvg + '</g>' +
        '<g>' + nodeSvg + '</g>' +
      '</svg>' +
      '<p class="chart-net__hint">节点大小 = 作品数；连线粗细 = 合作次数；越靠中心合作越多。</p>' +
    '</div>';
  }

  window.VCCharts = {
    TYPE_ORDER: TYPE_ORDER,
    TYPE_ZH: TYPE_ZH,
    color: color,
    stackedBars: stackedBars,
    bars: bars,
    donut: donut,
    network: network
  };
})();
