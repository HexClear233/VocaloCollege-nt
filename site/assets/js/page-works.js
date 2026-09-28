/* ==========================================================================
   page-works.js — 作品库：搜索 + 多维筛选（方案 5.3）
   搜索范围（方案 5.3 原文）：作品名 / 高校 / 社团 / 制作者 / 歌声 / BV号
   筛选维度：类型 / 年份 / 节目 / 歌声 / 高校 / 社团
   ========================================================================== */
(function () {
  'use strict';

  var TYPE_ZH = { OC: '原创作品', RT: '翻调作品', VC: '人声翻唱', IC: '乐器翻奏', DW: '衍生创作' };
  var TYPE_ORDER = ['OC', 'RT', 'VC', 'IC', 'DW'];

  var state = {
    q: '',
    types: [],
    years: [],
    editions: [],
    vocals: [],
    schools: [],
    clubs: [],
    spOnly: false,
    onairOnly: false,
    sort: 'edition-desc'
  };

  var D = null;
  var els = {};

  function esc(s) { return window.VCComponents.esc(s); }

  // --------------------------------------------------------------- 初始化
  function boot() {
    els.results = document.getElementById('works-results');
    els.count = document.getElementById('works-count');
    els.active = document.getElementById('works-active');
    els.search = document.getElementById('works-search');
    els.filters = document.getElementById('works-filters');

    window.VCData.load().then(function (data) {
      D = data;
      buildFacets();
      bindSearch();
      // 支持从 URL 带入初始条件（例如从档案页跳转过来）
      readURL();
      render();
    }).catch(function (e) {
      els.results.innerHTML = '<div class="load-error">数据加载失败：' + esc(String(e && e.message || e)) + '</div>';
      console.error(e);
    });
  }

  // --------------------------------------------------------------- 统计辅助
  function countBy(list, pick) {
    var m = Object.create(null);
    list.forEach(function (w) {
      pick(w).forEach(function (k) { m[k] = (m[k] || 0) + 1; });
    });
    return m;
  }

  /** 各筛选维度的候选项，按作品数降序 */
  function facets() {
    var all = D.works;
    return {
      types: TYPE_ORDER.map(function (t) {
        return { value: t, label: t + ' ' + TYPE_ZH[t], n: all.filter(function (w) { return w.type === t; }).length };
      }).filter(function (x) { return x.n > 0; }),
      years: D.yearsOf(all).map(function (y) {
        return { value: String(y), label: y + ' 年', n: all.filter(function (w) { return w.year === y; }).length };
      }).sort(function (a, b) { return b.value.localeCompare(a.value); }),
      editions: D.editions.slice().reverse().map(function (d) {
        return { value: d.edition.id, label: d.edition.label_short || d.edition.label, n: d.works.length };
      }),
      vocals: Object.keys(countBy(all, function (w) { return w._vocalIds; }))
        .map(function (id) {
          return { value: id, label: D.nameOfVocal(id), n: D.worksOfVocal(id).length };
        }).sort(function (a, b) { return b.n - a.n || a.label.localeCompare(b.label, 'zh'); }),
      schools: Object.keys(countBy(all, function (w) { return w._schoolIds; }))
        .map(function (id) {
          return { value: id, label: D.nameOfSchool(id), n: D.worksOfSchool(id).length };
        }).sort(function (a, b) { return b.n - a.n || a.label.localeCompare(b.label, 'zh'); }),
      clubs: Object.keys(countBy(all, function (w) { return w._clubIds; }))
        .map(function (id) {
          return { value: id, label: D.nameOfClub(id), n: D.worksOfClub(id).length };
        }).sort(function (a, b) { return b.n - a.n || a.label.localeCompare(b.label, 'zh'); })
    };
  }

  // --------------------------------------------------------------- 构建筛选 UI
  var FACET_LIMIT = 8;   // 每个维度默认显示前 N 项，其余折叠

  function buildFacets() {
    var F = facets();
    var html = '';

    // 收录范围（快捷开关）
    var spN = D.works.filter(function (w) { return w.is_sp; }).length;
    var onairN = D.works.filter(function (w) { return w.seq && w.seq.visible; }).length;
    html += group('收录范围', 'quick', [
      { value: 'sp', label: '仅 SP Case', n: spN },
      { value: 'onair', label: '仅收录于视频', n: onairN }
    ], 'checkbox');

    html += group('类型', 'types', F.types, 'checkbox');
    html += group('年份', 'years', F.years, 'checkbox');
    html += group('节目', 'editions', F.editions, 'checkbox');
    html += group('歌声', 'vocals', F.vocals, 'checkbox');
    html += group('高校', 'schools', F.schools, 'checkbox');
    html += group('社团', 'clubs', F.clubs, 'checkbox');

    els.filters.innerHTML = html;

    // 折叠展开
    els.filters.querySelectorAll('[data-more]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var box = btn.closest('.facet').querySelector('.facet__items');
        var open = box.classList.toggle('is-expanded');
        btn.textContent = open ? '收起' : '更多（' + (box.children.length - FACET_LIMIT) + '）';
      });
    });

    // 勾选
    els.filters.querySelectorAll('input[type=checkbox]').forEach(function (cb) {
      cb.addEventListener('change', function () {
        var f = cb.getAttribute('data-facet');
        var v = cb.value;
        if (f === 'sp') { state.spOnly = cb.checked; }
        else if (f === 'onair') { state.onairOnly = cb.checked; }
        else {
          var arr = state[f];
          var i = arr.indexOf(v);
          if (cb.checked && i < 0) arr.push(v);
          else if (!cb.checked && i >= 0) arr.splice(i, 1);
        }
        render();
      });
    });
  }

  function group(title, facet, items, kind) {
    if (!items.length) return '';
    var shown = items.slice(0, FACET_LIMIT);
    var rest = items.slice(FACET_LIMIT);
    var body = shown.map(function (it) { return item(facet, it, kind); }).join('');
    if (rest.length) {
      body += rest.map(function (it) { return item(facet, it, kind, true); }).join('');
    }
    return '<div class="facet">' +
      '<div class="facet__title">' + esc(title) + '</div>' +
      '<div class="facet__items">' + body + '</div>' +
      (rest.length
        ? '<button type="button" class="facet__more" data-more>更多（' + rest.length + '）</button>'
        : '') +
      '</div>';
  }

  function item(facet, it, kind, hidden) {
    // 快捷开关（sp / onair）用各自的 facet 名，才能被 change 处理器正确识别
    var f = facet === 'quick' ? it.value : facet;
    var id = 'f-' + f + '-' + String(it.value).replace(/[^a-zA-Z0-9_-]/g, '_');
    return '<label class="facet__item' + (hidden ? ' facet__item--hidden' : '') + '" for="' + id + '">' +
      '<input type="checkbox" id="' + id + '" data-facet="' + f + '" value="' + esc(it.value) + '">' +
      '<span class="facet__label">' + esc(it.label) + '</span>' +
      '<span class="facet__n">' + it.n + '</span>' +
      '</label>';
  }

  // --------------------------------------------------------------- 搜索
  function bindSearch() {
    var t = null;
    els.search.addEventListener('input', function () {
      clearTimeout(t);
      t = setTimeout(function () {
        state.q = els.search.value.trim();
        render();
      }, 160);   // 防抖
    });
    var form = document.getElementById('works-search-form');
    if (form) form.addEventListener('submit', function (e) { e.preventDefault(); });
  }

  /** 六项搜索：作品名 / 高校 / 社团 / 制作者 / 歌声 / BV号 */
  function matches(w, q) {
    if (!q) return true;
    var needle = q.toLowerCase();
    // BV 号：允许带或不带 BV 前缀
    var bvid = (w.bilibili && w.bilibili.bvid || '').toLowerCase();
    if (bvid && (bvid.indexOf(needle) >= 0 || bvid.replace(/^bv/, '').indexOf(needle) >= 0)) return true;

    var hay = [
      w.title, w.title_short, (w.title_alt || []).join(' '),
      w._clubLabel, w._clubLabelFull, w._vocalLabel,
      w._people.join(' ')
    ].filter(Boolean).join(' ').toLowerCase();
    if (hay.indexOf(needle) >= 0) return true;

    // 高校与社团用字典中的规范名再匹配一遍（覆盖原文写法差异）
    if (w._schoolLabel && w._schoolLabel.toLowerCase().indexOf(needle) >= 0) return true;
    var clubs = (w._clubs || []).map(function (c) { return c.name + ' ' + (c.name_short || ''); }).join(' ');
    if (clubs && clubs.toLowerCase().indexOf(needle) >= 0) return true;
    var vocs = (w._vocals || []).map(function (v) {
      return [v.name, v.name_ja, v.name_en, (v.name_alt || []).join(' ')].filter(Boolean).join(' ');
    }).join(' ');
    if (vocs && vocs.toLowerCase().indexOf(needle) >= 0) return true;
    return false;
  }

  // --------------------------------------------------------------- 过滤 + 排序
  function apply() {
    var out = D.works.filter(function (w) {
      if (!matches(w, state.q)) return false;

      if (state.types.length && state.types.indexOf(w.type) < 0) return false;
      if (state.years.length && state.years.indexOf(String(w.year)) < 0) return false;
      if (state.editions.length && state.editions.indexOf(w.edition_id) < 0) return false;

      if (state.vocals.length &&
          !state.vocals.some(function (v) { return w._vocalIds.indexOf(v) >= 0; })) return false;
      if (state.schools.length &&
          !state.schools.some(function (s) { return w._schoolIds.indexOf(s) >= 0; })) return false;
      if (state.clubs.length &&
          !state.clubs.some(function (c) { return w._clubIds.indexOf(c) >= 0; })) return false;

      if (state.spOnly && !w.is_sp) return false;
      if (state.onairOnly && !(w.seq && w.seq.visible)) return false;
      return true;
    });

    // 排序
    var S = state.sort;
    out.sort(function (a, b) {
      if (S === 'edition-desc') {
        var d = (b._edition.seq || 0) - (a._edition.seq || 0);
        if (d) return d;
        return (a.seq.number || 99) - (b.seq.number || 99);
      }
      if (S === 'date-desc') {
        return (Date.parse(b.published_at) || 0) - (Date.parse(a.published_at) || 0);
      }
      if (S === 'date-asc') {
        return (Date.parse(a.published_at) || 0) - (Date.parse(b.published_at) || 0);
      }
      if (S === 'title') {
        return String(a.title_short || a.title).localeCompare(String(b.title_short || b.title), 'zh');
      }
      return 0;
    });
    return out;
  }

  // --------------------------------------------------------------- 渲染
  function render() {
    var list = apply();

    els.count.innerHTML = '共 <b>' + list.length + '</b> 件作品' +
      (list.length !== D.works.length ? '（全部 ' + D.works.length + ' 件）' : '');

    // 已选条件回显
    var chips = [];
    if (state.q) chips.push(chip('搜索：' + state.q, 'q'));
    state.types.forEach(function (v) { chips.push(chip(v + ' ' + TYPE_ZH[v], 'types', v)); });
    state.years.forEach(function (v) { chips.push(chip(v + ' 年', 'years', v)); });
    state.editions.forEach(function (v) {
      var e = D.getEdition(v);
      chips.push(chip(e ? (e.edition.label_short || e.edition.label) : v, 'editions', v));
    });
    state.vocals.forEach(function (v) { chips.push(chip(D.nameOfVocal(v), 'vocals', v)); });
    state.schools.forEach(function (v) { chips.push(chip(D.nameOfSchool(v), 'schools', v)); });
    state.clubs.forEach(function (v) { chips.push(chip(D.nameOfClub(v), 'clubs', v)); });
    if (state.spOnly) chips.push(chip('仅 SP Case', 'sp'));
    if (state.onairOnly) chips.push(chip('仅收录于视频', 'onair'));

    els.active.innerHTML = chips.length
      ? chips.join('') + '<button type="button" class="chip chip--clear" id="clear-all">清空全部</button>'
      : '';

    var clearBtn = document.getElementById('clear-all');
    if (clearBtn) clearBtn.addEventListener('click', reset);

    // 结果
    if (!list.length) {
      els.results.innerHTML = '<p class="empty">没有符合条件的作品。试试减少筛选条件。</p>' +
        '<button type="button" class="btn" id="clear-all-2">清空筛选</button>';
      var b2 = document.getElementById('clear-all-2');
      if (b2) b2.addEventListener('click', reset);
      return;
    }

    // 按当前排序分组：按期浏览时按期分段，否则平铺
    if (state.sort === 'edition-desc') {
      var groups = [];
      list.forEach(function (w) {
        var last = groups[groups.length - 1];
        if (!last || last.id !== w.edition_id) {
          groups.push({ id: w.edition_id, edition: w._edition, items: [w] });
        } else {
          last.items.push(w);
        }
      });
      els.results.innerHTML = groups.map(function (g) {
        return '<section class="type-section">' +
          '<div class="type-section__head">' +
            '<h2 class="type-section__name">' + esc(g.edition.label) + '</h2>' +
            '<a class="type-section__link" href="editions/' + esc(g.edition.id) + '.html">查看该期 →</a>' +
            '<span class="type-section__count">' + g.items.length + ' 件</span>' +
          '</div>' +
          '<div class="grid grid--works" data-grid></div>' +
        '</section>';
      }).join('');

      var grids = els.results.querySelectorAll('[data-grid]');
      groups.forEach(function (g, i) {
        g.items.forEach(function (w) {
          var c = document.createElement('work-card');
          c.ctx = { root: '.', showEdition: false };
          c.work = w;
          grids[i].appendChild(c);
        });
      });
    } else {
      els.results.innerHTML = '<div class="grid grid--works" data-grid></div>';
      var grid = els.results.querySelector('[data-grid]');
      list.forEach(function (w) {
        var c = document.createElement('work-card');
        c.ctx = { root: '.', showEdition: true };
        c.work = w;
        grid.appendChild(c);
      });
    }
  }

  function chip(label, facet, value) {
    return '<button type="button" class="chip" data-chip-facet="' + esc(facet) + '"' +
      (value != null ? ' data-chip-value="' + esc(value) + '"' : '') + '>' +
      esc(label) + '<span class="chip__x" aria-hidden="true">×</span></button>';
  }

  function reset() {
    state.q = '';
    state.types = []; state.years = []; state.editions = [];
    state.vocals = []; state.schools = []; state.clubs = [];
    state.spOnly = false; state.onairOnly = false;
    els.search.value = '';
    els.filters.querySelectorAll('input[type=checkbox]').forEach(function (cb) { cb.checked = false; });
    syncURL();
    render();
  }

  // 点击 chip 移除单个条件
  document.addEventListener('click', function (e) {
    var c = e.target.closest('[data-chip-facet]');
    if (!c) return;
    var f = c.getAttribute('data-chip-facet');
    var v = c.getAttribute('data-chip-value');
    if (f === 'q') { state.q = ''; els.search.value = ''; }
    else if (f === 'sp') { state.spOnly = false; }
    else if (f === 'onair') { state.onairOnly = false; }
    else {
      var arr = state[f];
      var i = arr.indexOf(v);
      if (i >= 0) arr.splice(i, 1);
      var cb = els.filters.querySelector('input[data-facet="' + f + '"][value="' + CSS.escape(v) + '"]');
      if (cb) cb.checked = false;
    }
    syncURL();
    render();
  });

  // --------------------------------------------------------------- URL 同步
  function readURL() {
    var p = new URLSearchParams(location.search);
    state.q = p.get('q') || '';
    els.search.value = state.q;
    ['types', 'years', 'editions', 'vocals', 'schools', 'clubs'].forEach(function (k) {
      var v = p.get(k);
      if (v) {
        state[k] = v.split(',').filter(Boolean);
        state[k].forEach(function (val) {
          var cb = els.filters.querySelector('input[data-facet="' + k + '"][value="' + CSS.escape(val) + '"]');
          if (cb) cb.checked = true;
        });
      }
    });
    if (p.get('sp') === '1') {
      state.spOnly = true;
      var cb1 = els.filters.querySelector('input[data-facet="sp"]');
      if (cb1) cb1.checked = true;
    }
    if (p.get('onair') === '1') {
      state.onairOnly = true;
      var cb2 = els.filters.querySelector('input[data-facet="onair"]');
      if (cb2) cb2.checked = true;
    }
    if (p.get('sort')) state.sort = p.get('sort');
  }

  function syncURL() {
    var p = new URLSearchParams();
    if (state.q) p.set('q', state.q);
    ['types', 'years', 'editions', 'vocals', 'schools', 'clubs'].forEach(function (k) {
      if (state[k].length) p.set(k, state[k].join(','));
    });
    if (state.spOnly) p.set('sp', '1');
    if (state.onairOnly) p.set('onair', '1');
    if (state.sort !== 'edition-desc') p.set('sort', state.sort);
    var s = p.toString();
    history.replaceState(null, '', s ? '?' + s : location.pathname);
  }

  // 排序切换
  document.addEventListener('change', function (e) {
    if (e.target && e.target.id === 'works-sort') {
      state.sort = e.target.value;
      syncURL();
      render();
    }
  });

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
