/* ==========================================================================
   page-edition.js — 期页面渲染
   从 URL ?e=<edition_id> 或 body[data-edition] 取得期号，渲染该期全部内容
   分段复用原页面的 [OC] / [RT] / [VC][IC] / SPECIAL PICK 结构
   ========================================================================== */
(function () {
  'use strict';

  var MODE = document.body.getAttribute('data-mode') || 'auto';
  var FIXED_ID = document.body.getAttribute('data-edition') || null;

  function qs(name) {
    var m = new RegExp('[?&]' + name + '=([^&]*)').exec(location.search);
    return m ? decodeURIComponent(m[1]) : null;
  }

  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }

  function esc(s) { return window.VCComponents.esc(s); }

  // 段落定义：对齐原页面的 normal-title 分组
  var SECTIONS = [
    { key: 'OC', name: '原创作品', code: '[OC]', types: ['OC'] },
    { key: 'RT', name: '翻调作品', code: '[RT]', types: ['RT'] },
    { key: 'VCIC', name: '翻唱翻奏作品', code: '[VC][IC]', types: ['VC', 'IC'] },
    { key: 'OTHER', name: '其他作品', code: '', types: null }  // 兜底：未被上面覆盖的
  ];

  function render(editionId, D) {
    var ed = D.getEdition(editionId);
    if (!ed) {
      document.getElementById('edition-main').innerHTML =
        '<div class="load-error">未找到期号：' + esc(editionId) + '</div>';
      return;
    }
    var E = ed.edition;

    // ---------- 期头 ----------
    document.title = E.label + ' | 高校术力口之声';

    var header = document.getElementById('edition-header');
    var schoolN = D.uniqueSchools(ed.works).length;
    var clubN = D.uniqueClubs(ed.works).length;

    var videoHTML = '';
    if (E.video && E.video.bvid) {
      if (E.video.status === 'deleted') {
        videoHTML = '<span class="badge badge--plain">原视频已删除</span>';
      } else {
        videoHTML = '<a class="btn" href="' + esc(E.video.url) + '" target="_blank" rel="noopener noreferrer">' +
                    '观看本期节目</a>';
      }
    }

    header.innerHTML =
      '<div class="wrap edition-layout">' +
        '<div class="edition-header__top">' +
          '<h1 class="edition-header__title">' + esc(E.label) + '</h1>' +
          videoHTML +
        '</div>' +
        '<div class="edition-header__meta">' +
          (E.collect_window && E.collect_window.raw
            ? '<span>收录时间：' + esc(E.collect_window.raw) + '</span>' : '') +
          '<span>' + ed.works.length + ' 件作品</span>' +
          '<span>' + schoolN + ' 所高校</span>' +
          '<span>' + clubN + ' 个社团</span>' +
        '</div>' +
        (E.has_seq_split
          ? '<p class="edition-legend">' +
              '<span class="wc__tier wc__tier--onair">收录于视频</span>' +
              '<span class="edition-legend__sep">·</span>' +
              '<span class="wc__tier wc__tier--listed">仅网页收录</span>' +
              '<span class="edition-legend__note">本期部分作品未进入节目视频，仅在站内收录展示</span>' +
            '</p>'
          : '') +
      '</div>';

    // ---------- 分段渲染 ----------
    // 注意：内容必须渲染进 .wrap.edition-layout 内部，才能继承收窄后的容器宽度；
    // 直接写 edition-main 会绕过容器导致铺满 100% 宽。
    var mount = document.getElementById('edition-main');
    mount.innerHTML = '<div class="wrap edition-layout"></div>';
    var host = mount.firstElementChild;

    var used = {};
    var extras = [];   // tier=extra（论外）
    var dwList = [];   // DW（衍生创作）—— 单行条目，不与 OC/RT/VC/IC 同级
    ed.works.forEach(function (w) {
      if (w.tier === 'extra') extras.push(w);
      else if (w.type === 'DW') dwList.push(w);
    });

    SECTIONS.forEach(function (sec) {
      var list;
      if (sec.types) {
        list = ed.works.filter(function (w) {
          return sec.types.indexOf(w.type) >= 0 && w.tier !== 'extra' && w.type !== 'DW';
        });
        sec.types.forEach(function (t) { used[t] = 1; });
      } else {
        // 兜底段：type 为 null 或未被前面覆盖的
        list = ed.works.filter(function (w) {
          return w.tier !== 'extra' && w.type !== 'DW' && (!w.type || !used[w.type]);
        });
      }
      if (!list.length) return;

      var section = el('section', 'type-section');
      var head = el('div', 'type-section__head');
      var name = el('h2', 'type-section__name');
      name.textContent = sec.name + (sec.code ? ' ' + sec.code : '');
      head.appendChild(name);

      // 段落计数：若该段同时含两种收录层级，分别标出
      var split = E.has_seq_split;
      var onAir = list.filter(function (w) { return w.seq && w.seq.visible; }).length;
      var listed = list.length - onAir;
      var cntTxt = list.length + ' 件';
      if (split && onAir && listed) {
        cntTxt += '（收录于视频 ' + onAir + ' · 仅网页 ' + listed + '）';
      }
      head.appendChild(el('span', 'type-section__count', cntTxt));
      section.appendChild(head);

      var grid = el('div', 'grid grid--works');
      list.forEach(function (w) {
        var c = document.createElement('work-card');
        c.work = w;
        grid.appendChild(c);
      });
      section.appendChild(grid);
      host.appendChild(section);
    });

    // ---------- 论外段（跨期补录）----------
    if (extras.length) {
      var se = el('section', 'type-section');
      var he = el('div', 'type-section__head');
      var ne = el('h2', 'type-section__name', '论外作品');
      he.appendChild(ne);
      he.appendChild(el('span', 'type-section__count', extras.length + ' 件'));
      se.appendChild(he);
      var ge = el('div', 'grid grid--works');
      extras.forEach(function (w) {
        var c = document.createElement('work-card');
        c.work = w;
        ge.appendChild(c);
      });
      se.appendChild(ge);
      host.appendChild(se);
    }

    // ---------- 衍生创作 [DW] ----------
    // DW 是「对既有曲目的二次演绎」，不与 OC/RT/VC/IC 同级，
    // 故以单行粗条目（详细信息式）呈现，而非作品卡片。
    if (dwList.length) {
      var sd = el('section', 'type-section');
      var hd = el('div', 'type-section__head');
      hd.appendChild(el('h2', 'type-section__name', '衍生创作 [DW]'));
      hd.appendChild(el('span', 'type-section__count', dwList.length + ' 件'));
      sd.appendChild(hd);
      sd.appendChild(el('p', 'data-note',
        '衍生创作是对既有术力口曲目的二次演绎（宅舞、MMD、打艺、视觉重制等），' +
        '与原创、翻调、翻唱翻奏并非同一层级，故以下以条目形式列出。'));

      var wrap = el('div', 'dw-list');
      // 表头（对齐列宽）
      var head = el('div', 'dw-list__head');
      ['序号', '封面', '标题', '分类', 'UP主', '日期', 'BVID'].forEach(function (t) {
        head.appendChild(el('span', '', t));
      });
      wrap.appendChild(head);

      dwList.forEach(function (w) {
        var row = document.createElement('dw-row');
        row.work = w;
        wrap.appendChild(row);
      });
      sd.appendChild(wrap);
      host.appendChild(sd);
    }

    // ---------- SPECIAL PICK ----------
    var sp = D.spOfEdition(E.id);
    if (sp) {
      var sSec = el('section', 'type-section');
      var sHead = el('div', 'type-section__head');
      sHead.appendChild(el('h2', 'type-section__name', 'SPECIAL PICK'));
      sHead.appendChild(el('span', 'type-section__count', 'Curator\'s Selection'));
      sSec.appendChild(sHead);

      var cov = VCData.coverURL(sp);
      var url = (sp.bilibili && sp.bilibili.url) || '#';
      var box = el('div', 'sp-showcase');
      box.innerHTML =
        '<div class="sp-showcase__cover">' +
          (cov ? '<img src="' + cov + '" alt="" loading="lazy">'
               : '<span class="wc__cover-fallback">暂无封面</span>') +
        '</div>' +
        '<div>' +
          '<h3 class="sp-showcase__title">' + esc(sp.title_short || sp.title) + '</h3>' +
          (sp._vocalLabel ? '<p class="sp-showcase__vocal">feat. ' + esc(sp._vocalLabel) + '</p>' : '') +
          '<p class="sp-showcase__meta">' +
            esc(sp._clubLabel || '—') +
          '</p>' +
          '<a class="btn btn--primary" href="' + esc(url) + '" target="_blank" rel="noopener noreferrer">在 B站观看</a>' +
        '</div>';
      sSec.appendChild(box);
      host.appendChild(sSec);
    }

    // ---------- 期备注 ----------
    var notes = E.notes || [];
    if (notes.length) {
      var nSec = el('section', 'type-section');
      var nHead = el('div', 'type-section__head');
      nHead.appendChild(el('h2', 'type-section__name', '期备注'));
      nHead.appendChild(el('span', 'type-section__count', notes.length + ' 条'));
      nSec.appendChild(nHead);

      var box2 = el('div', 'notes');
      var ul = el('ul', 'notes__list');
      notes.forEach(function (n) {
        var li = el('li');
        var tag = n.kind === 'omitted_work' ? '省略'
                : n.kind === 'uncollected_work' ? '未收录'
                : n.kind === 'asset_note' ? '素材'
                : '说明';
        li.innerHTML = '<span class="notes__tag">' + tag + '</span>';
        if (n.title) {
          li.innerHTML += '<b>' + esc(n.title) + '</b>' +
            (n.seq_label ? ' <span class="mono small muted">' + esc(n.seq_label) + '</span>' : '');
          var detail = n.note || n.text || n.reason || '';
          if (detail) li.innerHTML += '<br><span class="muted">' + esc(detail) + '</span>';
          var extraBits = [];
          if (n.club) extraBits.push('社团：' + n.club);
          if (n.school) extraBits.push('高校：' + n.school);
          if (n.bvid) extraBits.push('BV：' + n.bvid);
          if (extraBits.length) li.innerHTML += '<br><span class="muted small">' + esc(extraBits.join(' · ')) + '</span>';
        } else {
          li.innerHTML += esc(n.text || '');
        }
        ul.appendChild(li);
      });
      box2.appendChild(ul);
      nSec.appendChild(box2);
      host.appendChild(nSec);
    }

    // ---------- 上/下一期导航 ----------
    var idx = D.editions.findIndex(function (x) { return x.edition.id === E.id; });
    var nav = el('nav', 'section');
    nav.style.display = 'flex';
    nav.style.gap = 'var(--sp-3)';
    nav.style.flexWrap = 'wrap';
    nav.setAttribute('aria-label', '期数导航');
    if (idx > 0) {
      var prev = D.editions[idx - 1].edition;
      var a = el('a', 'btn', '← ' + (prev.label_short || prev.label));
      a.href = prev.id + '.html';
      nav.appendChild(a);
    }
    if (idx < D.editions.length - 1) {
      var next = D.editions[idx + 1].edition;
      var b = el('a', 'btn', (next.label_short || next.label) + ' →');
      b.href = next.id + '.html';
      nav.appendChild(b);
    }
    var back = el('a', 'btn', '返回首页');
    back.href = '../index.html';
    nav.appendChild(back);
    host.appendChild(nav);
  }

  // ---------- 启动 ----------
  function boot() {
    window.VCData.load().then(function (D) {
      var id = FIXED_ID || qs('e') || D.latestEdition.edition.id;
      render(id, D);
    }).catch(function (e) {
      var msg = String(e && e.message ? e.message : e);
      var host = document.getElementById('edition-main');
      if (host) {
        host.innerHTML = '<div class="load-error">数据加载失败：' + esc(msg) + '</div>';
      }
      console.error(e);
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
