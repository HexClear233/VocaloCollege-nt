/* ==========================================================================
   components.js — Web Components
   <work-card>     统一作品卡片（方案 5.3）
   <edition-card>  期卡片
   <stat-block>    数据块
   ========================================================================== */
(function () {
  'use strict';

  var TYPE_LABEL = { OC: 'OC', RT: 'RT', VC: 'VC', IC: 'IC', DW: 'DW' };
  var TYPE_NAME = {
    OC: '原创作品', RT: '翻调作品', VC: '人声翻唱', IC: '乐器翻奏', DW: '衍生创作'
  };

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  /* ======================================================================
     <work-card>
     用法：
       const el = document.createElement('work-card');
       el.work = workObject;
       el.ctx  = { root: '..', showEdition: true }   // root 为到站点根的相对前缀
     ====================================================================== */
  var WorkCard = /** @class */ (function () {
    function WorkCard() {
      var self = Reflect.construct(HTMLElement, [], WorkCard);
      self._work = null;
      self._ctx = null;
      return self;
    }
    WorkCard.prototype = Object.create(HTMLElement.prototype);
    WorkCard.prototype.constructor = WorkCard;
    Object.setPrototypeOf(WorkCard, HTMLElement);

    Object.defineProperty(WorkCard.prototype, 'work', {
      set: function (w) { this._work = w; if (this.isConnected) this.render(); },
      get: function () { return this._work; }
    });
    Object.defineProperty(WorkCard.prototype, 'ctx', {
      set: function (c) { this._ctx = c || null; if (this.isConnected) this.render(); },
      get: function () { return this._ctx; }
    });

    WorkCard.prototype.connectedCallback = function () { this.render(); };

    WorkCard.prototype.render = function () {
      var w = this._work;
      if (!w) return;

      var ctx = this._ctx || {};
      var root = ctx.root != null ? ctx.root : '.';
      var prefix = (root === '.' || root === '') ? '' : root + '/';
      var showEdition = ctx.showEdition !== false;

      var url = (w.bilibili && w.bilibili.url) ||
                (w.links && w.links[0] && w.links[0].url) || null;
      var cover = window.VCData ? window.VCData.coverURL(w) : null;
      var ed = w._edition;

      // --- 徽章 ---
      var badges = [];
      if (w.is_sp) {
        badges.push('<span class="badge badge--sp" title="最推荐作品 SP Case">SP</span>');
      }
      if (w.type) {
        badges.push('<span class="badge badge--' + w.type.toLowerCase() +
          '" title="' + esc(TYPE_NAME[w.type] || w.type) + '">' + TYPE_LABEL[w.type] + '</span>');
      } else {
        badges.push('<span class="badge badge--plain" title="分类待填写">分类待定</span>');
      }
      if (w.tier === 'extra') {
        badges.push('<span class="badge badge--extra" title="跨期补录作品">论外</span>');
      }
      (w.type_secondary || []).forEach(function (t) {
        badges.push('<span class="badge badge--' + t.toLowerCase() + '">' + TYPE_LABEL[t] + '</span>');
      });

      var edLabel = ed ? (ed.label_short || ed.label) : '';

      // --- 收录层级（对应源站 xuhao / non-display-xuhao）---
      // 判定只看「是否进入视频正片」(seq.visible)，与 tier 无关：
      // 快闪段作品 tier=flash 且 visible=false，同样应标记为「仅网页收录」并变暗。
      var hasTierSplit = !!(ed && ed.has_seq_split);
      var onAir = !!(w.seq && w.seq.visible === true);
      var isDW = (w.type === 'DW');
      var tierHTML = '';
      if (hasTierSplit && !isDW) {
        tierHTML = onAir
          ? '<span class="wc__tier wc__tier--onair" title="该作品已收录进本期栏目视频">收录于视频</span>'
          : '<span class="wc__tier wc__tier--listed" title="该作品仅在本站收录，未进入本期栏目视频">仅网页收录</span>';
      }

      // --- 序号编码（沿用源站点 V1 / H2 / A3 / SP）---
      var seqLabel = w.seq && w.seq.label ? w.seq.label : '';
      var seqHTML = seqLabel
        ? '<span class="wc__seq' + (onAir ? ' wc__seq--onair' : ' wc__seq--listed') + '" ' +
          'title="源站编号 ' + esc(seqLabel) + (onAir ? '（收录于视频）' : '（仅网页收录）') + '">' +
          esc(seqLabel) + '</span>'
        : '';

      var vocalLine = w._vocalLabel
        ? '<div class="wc__vocal">feat. ' + esc(w._vocalLabel) + '</div>'
        : '';

      var meta = [];
      if (w._clubLabel) meta.push('<div class="wc__club">' + esc(w._clubLabel) + '</div>');

      var footLeft;
      if (edLabel && showEdition && ed) {
        footLeft = '<a class="wc__edition wc__edition--link" href="' + prefix + 'editions/' +
          esc(ed.id) + '.html" onclick="event.stopPropagation()">' + esc(edLabel) + '</a>';
      } else if (edLabel) {
        footLeft = '<span class="wc__edition">' + esc(edLabel) + '</span>';
      } else {
        footLeft = '';
      }

      this.innerHTML =
        '<a class="wc__link"' + (url ? ' href="' + esc(url) + '" target="_blank" rel="noopener noreferrer"' : '') + '>' +
          '<span class="wc__cover">' +
            (cover
              ? '<img src="' + esc(cover) + '" alt="' + esc(w.title_short || w.title) + '" loading="lazy" decoding="async"' +
                ' onerror="this.replaceWith(Object.assign(document.createElement(\'span\'),{className:\'wc__cover-fallback\',textContent:\'暂无封面\'}))">'
              : '<span class="wc__cover-fallback">暂无封面</span>') +
            seqHTML +
          '</span>' +
          '<span class="wc__body">' +
            '<span class="wc__title">' + esc(w.title_short || w.title) + '</span>' +
            vocalLine +
            '<span class="wc__badges">' + badges.join('') + '</span>' +
            '<span class="wc__meta">' + meta.join('') + '</span>' +
            '<span class="wc__foot">' + footLeft + tierHTML + '</span>' +
          '</span>' +
        '</a>';

      this.classList.add('wc');
      if (w.tier === 'extra') this.classList.add('wc--extra');
      if (w.is_sp) this.classList.add('wc--sp');
      // DW 为低一级的衍生创作，卡片形态下也做视觉降级（作品库混排时）
      if (w.type === 'DW') this.classList.add('wc--dw');
      this.classList.toggle('wc--numbered', !!seqLabel);
      // 层级样式：未进入视频正片的作品变暗（含快闪段作品）
      if (hasTierSplit && !isDW) {
        this.classList.add(onAir ? 'wc--onair' : 'wc--listed');
      }
    };

    customElements.define('work-card', WorkCard);
    return WorkCard;
  })();

  /* ======================================================================
     <dw-row>  衍生创作单行条目（Windows 资源管理器「详细信息」式）
     DW 不与 OC/RT/VC/IC 同级，故以单行粗条目呈现，而非卡片。
     列：序号（可选） · 缩略图 · 标题 · 类型 · UP主 · 日期 · BV号
     用法：
       const el = document.createElement('dw-row');
       el.work = workObject;
       el.ctx  = { root: '..' }
     ====================================================================== */
  var DwRow = /** @class */ (function () {
    function DwRow() {
      var self = Reflect.construct(HTMLElement, [], DwRow);
      self._work = null;
      self._ctx = null;
      return self;
    }
    DwRow.prototype = Object.create(HTMLElement.prototype);
    DwRow.prototype.constructor = DwRow;
    Object.setPrototypeOf(DwRow, HTMLElement);

    Object.defineProperty(DwRow.prototype, 'work', {
      set: function (w) { this._work = w; if (this.isConnected) this.render(); },
      get: function () { return this._work; }
    });
    Object.defineProperty(DwRow.prototype, 'ctx', {
      set: function (c) { this._ctx = c || null; if (this.isConnected) this.render(); },
      get: function () { return this._ctx; }
    });

    DwRow.prototype.connectedCallback = function () { this.render(); };

    DwRow.prototype.render = function () {
      var w = this._work;
      if (!w) return;

      var url = (w.bilibili && w.bilibili.url) ||
                (w.links && w.links[0] && w.links[0].url) || null;
      var bvid = (w.bilibili && w.bilibili.bvid) || '';
      var cover = window.VCData ? window.VCData.coverURL(w) : null;
      var seqLabel = (w.seq && w.seq.label) ? w.seq.label : '';

      // 日期：只取 YYYY-MM-DD
      var date = '';
      if (w.published_at_raw) date = String(w.published_at_raw).slice(0, 10);
      else if (w.published_at) date = String(w.published_at).slice(0, 10);

      // UP主：优先原始上传者，回退社团名
      var uploader = (w.bilibili && w.bilibili.uploader) || '';
      if (!uploader && w.club_names_raw && w.club_names_raw.length) {
        uploader = w.club_names_raw.join('、');
      }

      var projectBadge = w.project
        ? '<span class="dw-row__pjsk" title="世界计划（Project Sekai）相关">' + esc(w.project) + '</span>'
        : '';

      this.innerHTML =
        '<a class="dw-row' + (url ? '' : ' dw-row--nolink') + '"' +
          (url ? ' href="' + esc(url) + '" target="_blank" rel="noopener noreferrer"' : '') + '>' +
          '<span class="dw-row__seq">' + esc(seqLabel) + '</span>' +
          '<span class="dw-row__thumb">' +
            (cover
              ? '<img src="' + esc(cover) + '" alt="" loading="lazy" decoding="async"' +
                ' onerror="this.replaceWith(Object.assign(document.createElement(\'span\'),{className:\'dw-row__thumb-fallback\'}))">'
              : '<span class="dw-row__thumb-fallback"></span>') +
          '</span>' +
          '<span class="dw-row__title" title="' + esc(w.title) + '">' + esc(w.title_short || w.title) + '</span>' +
          '<span class="dw-row__cat"><span class="badge badge--dw">DW</span>' + projectBadge + '</span>' +
          '<span class="dw-row__up" title="' + esc(uploader) + '">' + esc(uploader) + '</span>' +
          '<span class="dw-row__date">' + esc(date) + '</span>' +
          '<span class="dw-row__bvid">' + esc(bvid) + '</span>' +
        '</a>';

      this.classList.add('dw-row-host');
    };

    customElements.define('dw-row', DwRow);
    return DwRow;
  })();

  /* ======================================================================
     <edition-card>
     ====================================================================== */
  (function () {
    var EditionCard = /** @class */ (function () {
      function EditionCard() { return Reflect.construct(HTMLElement, [], EditionCard); }
      EditionCard.prototype = Object.create(HTMLElement.prototype);
      EditionCard.prototype.constructor = EditionCard;
      Object.setPrototypeOf(EditionCard, HTMLElement);

      Object.defineProperty(EditionCard.prototype, 'edition', {
        set: function (v) { this._ed = v; if (this.isConnected) this.render(); },
        get: function () { return this._ed; }
      });
      Object.defineProperty(EditionCard.prototype, 'ctx', {
        set: function (c) { this._ctx = c || null; if (this.isConnected) this.render(); },
        get: function () { return this._ctx; }
      });

      EditionCard.prototype.connectedCallback = function () { this.render(); };

      EditionCard.prototype.render = function () {
        var d = this._ed;
        if (!d) return;
        var E = d.edition;
        var n = d.works.length;
        var prefix = (this._ctx && this._ctx.root && this._ctx.root !== '.')
          ? this._ctx.root + '/' : '';

        var counts = { OC: 0, RT: 0, VC: 0, IC: 0, DW: 0 };
        d.works.forEach(function (w) { if (counts[w.type] !== undefined) counts[w.type]++; });
        var bar = ['OC', 'RT', 'VC', 'IC', 'DW'].map(function (t) {
          if (!counts[t]) return '';
          var pct = (counts[t] / n * 100).toFixed(1);
          return '<span class="ec__seg ec__seg--' + t.toLowerCase() + '" style="width:' + pct + '%" title="' +
            TYPE_NAME[t] + ' ' + counts[t] + '"></span>';
        }).join('');

        var win = E.collect_window && E.collect_window.raw ? E.collect_window.raw : '';

        this.innerHTML =
          '<a class="ec__link" href="' + prefix + 'editions/' + esc(E.id) + '.html">' +
            '<span class="ec__head">' +
              '<span class="ec__label">' + esc(E.label) + '</span>' +
              (E.video && E.video.status === 'deleted'
                ? '<span class="badge badge--plain">原视频已删除</span>' : '') +
            '</span>' +
            (win ? '<span class="ec__window">收录时间：' + esc(win) + '</span>' : '') +
            '<span class="ec__bar">' + bar + '</span>' +
            '<span class="ec__foot">' +
              '<span class="ec__count"><b>' + n + '</b> 件作品</span>' +
              (E.sp_work_id ? '<span class="badge badge--sp">SP</span>' : '') +
            '</span>' +
          '</a>';
        this.classList.add('ec');
      };

      customElements.define('edition-card', EditionCard);
      return EditionCard;
    })();
  })();

  /* ======================================================================
     <stat-block>  可带链接的数据块
     ====================================================================== */
  (function () {
    var StatBlock = /** @class */ (function () {
      function StatBlock() { return Reflect.construct(HTMLElement, [], StatBlock); }
      StatBlock.prototype = Object.create(HTMLElement.prototype);
      StatBlock.prototype.constructor = StatBlock;
      Object.setPrototypeOf(StatBlock, HTMLElement);
      StatBlock.prototype.connectedCallback = function () {
        var num = this.getAttribute('num') || '—';
        var label = this.getAttribute('label') || '';
        var sub = this.getAttribute('sub') || '';
        var href = this.getAttribute('href') || '';
        var body =
          '<span class="stat-num">' + esc(num) + '</span>' +
          '<span class="stat-label">' + esc(label) + '</span>' +
          (sub ? '<span class="stat-sub">' + esc(sub) + '</span>' : '');
        this.innerHTML = href
          ? '<a class="stat__link" href="' + esc(href) + '">' + body + '</a>'
          : body;
        this.classList.add('stat');
      };
      customElements.define('stat-block', StatBlock);
      return StatBlock;
    })();
  })();

  window.VCComponents = {
    esc: esc,
    TYPE_NAME: TYPE_NAME,
    TYPE_LABEL: TYPE_LABEL
  };
})();
