/* ==========================================================================
   page-archive.js — 高校 / 社团 / 歌声 档案页（方案 5.4 / 5.5 / 5.6）
   由 <body data-entity="school|club|vocal" data-id="..."> 驱动
   同一份逻辑适配三种实体，字段差异用 ENTITY 配置表描述
   ========================================================================== */
(function () {
  'use strict';

  var KIND = document.body.getAttribute('data-entity') || 'school';
  var ID = document.body.getAttribute('data-id') || null;
  // var ROOT = document.body.getAttribute('data-root') || '..';

  var D = null;

  function esc(s) { return window.VCComponents.esc(s); }
  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }

  function qs(n) {
    var m = new RegExp('[?&]' + n + '=([^&]*)').exec(location.search);
    return m ? decodeURIComponent(m[1]) : null;
  }

  // ---------------------------------------------------------------- 启动
  function boot() {
    var id = ID || qs('id');
    window.VCData.load().then(function (data) {
      D = data;
      if (!id) { renderList(); return; }
      renderDetail(id);
    }).catch(function (e) {
      var m = document.getElementById('archive-main');
      if (m) m.innerHTML = '<div class="load-error">数据加载失败：' + esc(String(e && e.message || e)) + '</div>';
      console.error(e);
    });
  }

  // ---------------------------------------------------------------- 列表页
  var LIST_CFG = {
    school: {
      title: '高校档案', sub: 'Universities',
      nameOf: function (id) { return D.nameOfSchool(id); },
      idsWithWorks: function () { return D.uniqueSchools(); },
      worksOf: function (id) { return D.worksOfSchool(id); },
      dir: 'schools',
      meta: function (id) {
        var s = D.schoolMap[id];
        var bits = [];
        if (s && s.name_short) bits.push(s.name_short);
        if (s && s.ambiguity && s.ambiguity.status !== 'resolved') {
          bits.push('院系/校区差异未定');
        }
        return bits.join(' · ');
      }
    },
    club: {
      title: '社团档案', sub: 'Clubs',
      nameOf: function (id) { return D.nameOfClub(id); },
      idsWithWorks: function () { return D.uniqueClubs(); },
      worksOf: function (id) { return D.worksOfClub(id); },
      dir: 'clubs',
      meta: function (id) {
        var c = D.clubMap[id];
        if (!c) return '';
        var s = c.school_id ? D.schoolMap[c.school_id] : null;
        var bits = [];
        if (s) bits.push(s.name);
        if (c.kind && c.kind !== 'anime') bits.push({ vocalo: '歌声合成社团', acg_union: '联合企划', music: '音乐社团', individual: '个人账号' }[c.kind] || c.kind);
        if (c.bilibili && c.bilibili.uid) bits.push('UID ' + c.bilibili.uid);
        return bits.join(' · ');
      }
    },
    vocal: {
      title: '歌声档案', sub: 'Vocals',
      nameOf: function (id) { return D.nameOfVocal(id); },
      idsWithWorks: function () { return D.uniqueVocals(); },
      worksOf: function (id) { return D.worksOfVocal(id); },
      dir: 'vocals',
      meta: function (id) {
        var v = D.vocalMap[id];
        if (!v) return '';
        var bits = [];
        if (v.name_ja) bits.push(v.name_ja);
        if (v.engine_ids && v.engine_ids.length) {
          bits.push(v.engine_ids.map(function (e) {
            return D.engineMap[e] ? D.engineMap[e].name : e;
          }).join(' / '));
        }
        return bits.join(' · ');
      }
    }
  };

  function renderList() {
    var cfg = LIST_CFG[KIND];
    var ids = cfg.idsWithWorks();

    // 按作品数降序
    var rows = ids.map(function (id) {
      var ws = cfg.worksOf(id);
      return { id: id, name: cfg.nameOf(id), n: ws.length, works: ws, meta: cfg.meta(id) };
    }).sort(function (a, b) { return b.n - a.n || a.name.localeCompare(b.name, 'zh'); });

    var host = document.getElementById('archive-main');
    host.innerHTML = '';

    var wrap = el('div', 'wrap');

    // 顶部统计
    var totalWorks = rows.reduce(function (a, r) { return a + r.n; }, 0);
    var head = el('div', 'archive-head');
    head.innerHTML =
      '<h1 class="archive-head__title">' + esc(cfg.title) + '</h1>' +
      '<p class="archive-head__meta">共 <b>' + rows.length + '</b> 个实体，累计参与 <b>' + totalWorks + '</b> 次收录</p>';
    wrap.appendChild(head);

    // 按作品数分档呈现，便于快速定位
    var grid = el('div', 'grid grid--archive');
    rows.forEach(function (r) {
      var a = el('a', 'ac');
      // 列表页自身就位于 /schools/ 、/clubs/ 、/vocals/ 目录内，
      // 故详情页为同级文件，不能再拼 cfg.dir，否则会出现
      // /schools/schools/xxx.html 这类重复路径。
      a.href = r.id + '.html';
      a.innerHTML =
        '<span class="ac__name">' + esc(r.name) + '</span>' +
        (r.meta ? '<span class="ac__meta">' + esc(r.meta) + '</span>' : '') +
        '<span class="ac__foot">' +
          '<span class="ac__n"><b>' + r.n + '</b> 件作品</span>' +
          '<span class="ac__years">' + (D.yearsOf(r.works).join(' · ') || '—') + '</span>' +
        '</span>';
      grid.appendChild(a);
    });
    wrap.appendChild(grid);
    host.appendChild(wrap);
  }

  // ---------------------------------------------------------------- 详情页
  function renderDetail(id) {
    var cfg = LIST_CFG[KIND];
    var works = cfg.worksOf(id);
    var entity = KIND === 'school' ? D.schoolMap[id]
               : KIND === 'club' ? D.clubMap[id]
               : D.vocalMap[id];

    if (!entity && !works.length) {
      document.getElementById('archive-main').innerHTML =
        '<div class="wrap"><div class="load-error">未找到：' + esc(id) + '</div></div>';
      return;
    }

    var name = cfg.nameOf(id);
    document.title = name + ' | 高校术力口之声';

    var host = document.getElementById('archive-main');
    host.innerHTML = '';
    var wrap = el('div', 'wrap');

    // ---- 头部 ----
    var tc = D.typeCounts(works);
    var years = D.yearsOf(works);
    var spCount = works.filter(function (w) { return w.is_sp; }).length;

    var metaBits = [];
    if (KIND === 'club' && entity) {
      if (entity.school_id && D.schoolMap[entity.school_id]) {
        metaBits.push('<a href="../schools/' + esc(entity.school_id) + '.html">' +
          esc(D.schoolMap[entity.school_id].name) + '</a>');
      }
      if (entity.bilibili && entity.bilibili.uid) {
        metaBits.push('<a href="' + esc(entity.bilibili.url) + '" target="_blank" rel="noopener noreferrer">B站 UID ' +
          esc(entity.bilibili.uid) + '</a>');
      }
    }
    if (KIND === 'school' && entity) {
      var cs = (entity.club_ids || []).filter(function (cid) { return D.clubMap[cid]; });
      if (cs.length) {
        metaBits.push(cs.map(function (cid) {
          return '<a href="../clubs/' + esc(cid) + '.html">' + esc(D.clubMap[cid].name) + '</a>';
        }).join('、'));
      }
    }
    if (KIND === 'vocal' && entity) {
      if (entity.name_ja) metaBits.push(entity.name_ja);
      (entity.engine_ids || []).forEach(function (e) {
        var en = D.engineMap[e];
        if (en) metaBits.push(esc(en.name));
      });
    }

    var head = el('div', 'archive-head');
    head.innerHTML =
      '<p class="archive-head__kicker">' + esc({ school: 'Universities', club: 'Clubs', vocal: 'Vocals' }[KIND]) + '</p>' +
      '<h1 class="archive-head__title">' + esc(name) + '</h1>' +
      (metaBits.length ? '<p class="archive-head__meta">' + metaBits.join(' · ') + '</p>' : '') +
      (years.length
        ? '<p class="archive-head__range">参与 VocaloCollege：' + years[0] + ' — ' + years[years.length - 1] + '</p>'
        : '');
    wrap.appendChild(head);

    // ---- 院系/校区歧义提示（方案要求不强行归并，但需告知）----
    if (KIND === 'school' && entity && entity.ambiguity && entity.ambiguity.status !== 'resolved') {
      var amb = el('div', 'notice');
      var others = (entity.ambiguity.members || []).filter(function (m) { return m.id !== id; });
      amb.innerHTML =
        '<b>院系 / 校区差异未定</b>' +
        '<p>' + esc(entity.ambiguity.note) + '</p>' +
        (others.length
          ? '<p class="notice__sub">同一院校下的其他实体：' +
            others.map(function (m) {
              var href = m.kind === 'uploader' ? null : '../' + (m.kind === 'club' ? 'clubs' : 'schools') + '/' + m.id + '.html';
              return href ? '<a href="' + href + '">' + esc(m.name) + '</a>' : esc(m.name) + '（个人账号）';
            }).join('、') + '</p>'
          : '');
      wrap.appendChild(amb);
    }

    // ---- 数据块 ----
    var stats = el('div', 'grid grid--stats');
    var rows = [
      [works.length, 'Works', '作品'],
      [tc.OC, 'OC', '原创'],
      [tc.RT, 'RT', '翻调'],
      [tc.VC, 'VC', '人声翻唱'],
      [tc.IC, 'IC', '乐器翻奏']
    ];
    if (spCount) rows.push([spCount, 'SP', '最推荐']);
    // 高校 / 社团维度的附加统计
    if (KIND !== 'school') rows.push([D.uniqueSchools(works).length, 'Universities', '涉及高校']);
    if (KIND !== 'club') rows.push([D.uniqueClubs(works).length, 'Clubs', '涉及社团']);
    if (KIND !== 'vocal') rows.push([D.uniqueVocals(works).length, 'Vocals', '涉及歌声']);
    rows.push([D.editions.filter(function (d) {
      return d.works.some(function (w) { return works.indexOf(w) >= 0; });
    }).length, 'Editions', '参与期数']);

    stats.innerHTML = rows.map(function (r) {
      return '<stat-block num="' + r[0] + '" label="' + esc(r[1]) + '" sub="' + esc(r[2]) + '"></stat-block>';
    }).join('');
    wrap.appendChild(stats);

    // ---- 合作社团（方案 5.5 要求）----
    if (KIND === 'club') {
      var partners = Object.create(null);
      works.forEach(function (w) {
        (w._clubIds || []).forEach(function (cid) {
          if (cid !== id) partners[cid] = (partners[cid] || 0) + 1;
        });
      });
      var pk = Object.keys(partners);
      if (pk.length) {
        var sec = el('section', 'type-section');
        sec.innerHTML = '<div class="type-section__head">' +
          '<h2 class="type-section__name">合作社团</h2>' +
          '<span class="type-section__count">' + pk.length + ' 个</span></div>' +
          '<div class="tagrow">' + pk.sort(function (a, b) { return partners[b] - partners[a]; }).map(function (cid) {
            return '<a class="tag" href="' + esc(cid) + '.html">' + esc(D.nameOfClub(cid)) +
              '<span class="tag__n">' + partners[cid] + '</span></a>';
          }).join('') + '</div>';
        wrap.appendChild(sec);
      }
    }

    // ---- 作品列表（按年份分组，对应方案 5.4 的展示方式）----
    var sec2 = el('section', 'type-section');
    sec2.innerHTML = '<div class="type-section__head">' +
      '<h2 class="type-section__name">收录作品</h2>' +
      '<span class="type-section__count">' + works.length + ' 件</span></div>';
    wrap.appendChild(sec2);

    if (!works.length) {
      sec2.appendChild(el('p', 'empty', '暂无收录作品。'));
    } else {
      // 按年分组（倒序）
      var byYear = {};
      works.forEach(function (w) {
        var y = w.year || '未知';
        (byYear[y] = byYear[y] || []).push(w);
      });
      Object.keys(byYear).sort(function (a, b) {
        if (a === '未知') return 1;
        if (b === '未知') return -1;
        return b - a;
      }).forEach(function (y) {
        var items = byYear[y].sort(function (a, b) {
          return (Date.parse(b.published_at) || 0) - (Date.parse(a.published_at) || 0);
        });
        var gh = el('div', 'year-head');
        gh.innerHTML = '<span class="year-head__y">' + esc(y) + '</span>' +
          '<span class="year-head__n">' + items.length + ' 件</span>';
        sec2.appendChild(gh);

        var grid = el('div', 'grid grid--works');
        items.forEach(function (w) {
          var c = document.createElement('work-card');
          c.ctx = { root: '..', showEdition: true };
          c.work = w;
          grid.appendChild(c);
        });
        sec2.appendChild(grid);
      });
    }

    // ---- 返回 ----
    var back = el('nav', 'section');
    back.style.display = 'flex';
    back.style.gap = 'var(--sp-3)';
    back.style.flexWrap = 'wrap';
    back.innerHTML =
      '<a class="btn" href="index.html">← 返回' + esc({ school: '高校', club: '社团', vocal: '歌声' }[KIND]) + '档案</a>' +
      '<a class="btn" href="../works.html?q=' + encodeURIComponent(name) + '">在作品库中检索 →</a>';
    wrap.appendChild(back);

    host.appendChild(wrap);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
