/* ==========================================================================
   page-sp.js — SPECIAL PICK / Curator's Selection（方案 5.7）
   按时间排列，每个 SP 展示：作品信息 / 制作信息 / 社团 / 高校 / 原始视频 / 策展文字
   原则（方案 5.7）：SP 不是排名，数据统计与策展判断分离，保留 Curator's Note
   ========================================================================== */
(function () {
  'use strict';

  var ROOT = document.body.getAttribute('data-root') || '.';
  var D = null;
  // 到站点根的相对前缀：sp.html 位于站点根（data-root="."）时为空串
  function prefix() { return (ROOT === '.' || ROOT === '') ? '' : ROOT + '/'; }

  function esc(s) { return window.VCComponents.esc(s); }
  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }

  function boot() {
    window.VCData.load().then(function (data) {
      D = data;
      render();
    }).catch(function (e) {
      document.getElementById('sp-main').innerHTML =
        '<div class="wrap"><div class="load-error">数据加载失败：' + esc(String(e && e.message || e)) + '</div></div>';
      console.error(e);
    });
  }

  var ROLE_ZH = { music: '音乐', visual: '视觉', '策划': '策划', performance: '演绎', other: '其他' };

  function render() {
    var list = D.allSp();
    var host = document.getElementById('sp-main');
    host.innerHTML = '';
    var wrap = el('div', 'wrap');

    // ---- 头部 ----
    var head = el('div', 'archive-head');
    head.innerHTML =
      '<p class="archive-head__kicker">Curator\'s Selection</p>' +
      '<h1 class="archive-head__title">SPECIAL PICK</h1>' +
      '<p class="archive-head__meta">' +
        '共 <b>' + list.length + '</b> 期 SP Case。' +
        '<b>SP 不是排名</b>，也不是「年度最佳」，而是策展人的主观选择。' +
      '</p>';
    wrap.appendChild(head);

    // ---- 原则说明（方案 5.7 的五条原则）----
    var note = el('div', 'notice notice--plain');
    note.innerHTML =
      '<b>SP Case 原则</b>' +
      '<ol class="notice__list">' +
        '<li>SP 不是排名</li>' +
        '<li>SP 不是「年度最佳」</li>' +
        '<li>SP 是策展人的主观选择</li>' +
        '<li>数据统计与策展判断分离</li>' +
        '<li>保留 Curator\'s Note</li>' +
      '</ol>';
    wrap.appendChild(note);

    // ---- 按期倒序 ----
    list.forEach(function (item) {
      var w = item.work, E = item.edition;
      var cover = window.VCData.coverURL(w);
      var url = (w.bilibili && w.bilibili.url) || '#';

      var sec = el('section', 'sp-entry');
      var cov = cover
        ? '<img src="' + esc(cover) + '" alt="" loading="lazy">'
        : '<span class="wc__cover-fallback">暂无封面</span>';

      // 制作信息（用粗粒度 role）
      var staffHTML = (w.staff || []).map(function (s) {
        return '<div class="sp-entry__staffrow">' +
          '<span class="sp-entry__role">' + esc(ROLE_ZH[s.role] || s.role) + '</span>' +
          '<span class="sp-entry__people">' + esc((s.people || []).join('、')) + '</span>' +
        '</div>';
      }).join('') || '<p class="muted small">暂无制作信息。</p>';

      // 策展文字
      var curator = w.sp_note
        ? '<p>' + esc(w.sp_note) + '</p>'
        : '<p class="muted">Curator\'s Note 待补充。</p>';

      sec.innerHTML =
        '<div class="sp-entry__head">' +
          '<span class="sp-entry__edition">' + esc(E.label) + '</span>' +
          '<span class="badge badge--sp">SP</span>' +
          (w.type ? '<span class="badge badge--' + w.type.toLowerCase() + '">' + w.type + '</span>' : '') +
        '</div>' +
        '<div class="sp-entry__grid">' +
          '<div class="sp-entry__cover">' + cov + '</div>' +
          '<div class="sp-entry__body">' +
            '<h2 class="sp-entry__title">' + esc(w.title_short || w.title) + '</h2>' +
            (w._vocalLabel ? '<p class="sp-entry__vocal">feat. ' + esc(w._vocalLabel) + '</p>' : '') +
            '<dl class="sp-entry__facts">' +
              '<dt>社团</dt><dd>' + esc(w._clubLabel || '—') + '</dd>' +
              '<dt>高校</dt><dd>' + esc(w._schoolLabel || '—') + '</dd>' +
              (w.published_at ? '<dt>发布</dt><dd>' + esc((w.published_at || '').slice(0, 10)) + '</dd>' : '') +
              (w.bilibili && w.bilibili.bvid ? '<dt>BV</dt><dd class="mono">' + esc(w.bilibili.bvid) + '</dd>' : '') +
            '</dl>' +
            '<div class="sp-entry__actions">' +
              '<a class="btn btn--primary" href="' + esc(url) + '" target="_blank" rel="noopener noreferrer">在 B站观看</a>' +
              '<a class="btn" href="' + prefix() + 'editions/' + esc(E.id) + '.html">本期节目</a>' +
            '</div>' +
          '</div>' +
        '</div>' +
        '<div class="sp-entry__cols">' +
          '<div class="sp-entry__col">' +
            '<h3 class="sp-entry__h3">制作信息</h3>' + staffHTML +
          '</div>' +
          '<div class="sp-entry__col">' +
            '<h3 class="sp-entry__h3">Curator\'s Note</h3>' +
            '<div class="sp-entry__note">' + curator + '</div>' +
          '</div>' +
        '</div>';

      wrap.appendChild(sec);
    });

    host.appendChild(wrap);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
