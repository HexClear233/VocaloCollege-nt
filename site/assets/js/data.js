/* ==========================================================================
   data.js — 数据加载与索引
   读取 Phase 0 产出的 data/ 目录（JSON），构建前端可用的索引

   加载策略：
     - loadCore()  仅核心（index / taxonomy / 5 期作品）≈ 540 KB，首屏渲染用
     - loadDicts() 追加字典（schools / clubs / vocals / engines）≈ 700 KB
     - load()      两者都加载；作品库搜索需要字典才能按高校/社团/歌声检索
   字典体积较大，故期页面与首页只调 loadCore()，作品库与档案页调 load()。
   ========================================================================== */
(function () {
  'use strict';

  // 站点根目录由 <body data-root> 提供：首页为 "."，子目录页为 ".."
  var ROOT = (document.body && document.body.getAttribute('data-root')) || '.';
  var DATA_BASE = ROOT + '/data';

  var cache = null;
  var coreLoading = null;
  var dictLoading = null;

  function fetchJSON(url) {
    return fetch(url, { cache: 'no-cache' }).then(function (r) {
      if (!r.ok) throw new Error('加载失败 ' + r.status + ': ' + url);
      return r.json();
    });
  }

  /** 加载核心数据（不含字典） */
  function loadCore() {
    if (cache && cache._core) return Promise.resolve(cache);
    if (coreLoading) return coreLoading;

    coreLoading = Promise.all([
      fetchJSON(DATA_BASE + '/index.json'),
      fetchJSON(DATA_BASE + '/taxonomy.json')
    ]).then(function (r) {
      var index = r[0], taxonomy = r[1];
      return Promise.all(index.editions.map(function (e) {
        var rel = e.file.replace(/^data\//, '');
        return fetchJSON(DATA_BASE + '/' + rel);
      })).then(function (editions) {
        cache = buildIndex({ index: index, editions: editions, taxonomy: taxonomy });
        cache._core = true;
        return cache;
      });
    });

    return coreLoading;
  }

  /** 追加字典（幂等） */
  function loadDicts() {
    if (cache && cache._dicts) return Promise.resolve(cache);
    if (dictLoading) return dictLoading;

    dictLoading = loadCore().then(function (D) {
      return Promise.all([
        fetchJSON(DATA_BASE + '/schools.json'),
        fetchJSON(DATA_BASE + '/clubs.json'),
        fetchJSON(DATA_BASE + '/vocals.json'),
        fetchJSON(DATA_BASE + '/engines.json')
      ]).then(function (r) {
        attachDicts(D, { schools: r[0], clubs: r[1], vocals: r[2], engines: r[3] });
        D._dicts = true;
        return D;
      });
    });

    return dictLoading;
  }

  /** 完整加载 */
  function load() {
    return loadCore().then(function () { return loadDicts(); });
  }

  // ---------------------------------------------------------------- 索引构建
  function buildIndex(raw) {
    var works = [];
    var editionMap = Object.create(null);

    raw.editions.forEach(function (ed) {
      editionMap[ed.edition.id] = ed;

      // 该期是否同时存在"收录进视频"(seq.visible=true) 与"仅网页收录"(false)
      var visibleCount = ed.works.filter(function (w) {
        return w.seq && w.seq.visible === true;
      }).length;
      ed.edition.has_seq_split = visibleCount > 0 && visibleCount < ed.works.length;

      ed.works.forEach(function (w) {
        w._edition = ed.edition;
        w._clubLabel = (w.club_names_raw || []).join('、');
        w._vocalLabel = (w.vocal_names_raw || []).join('、');
        w._schoolIds = w.school_ids || [];
        w._clubIds = w.club_ids || [];
        w._vocalIds = w.vocal_ids || [];
        w._engineIds = w.engine_ids || [];
        // 制作者名用于搜索
        w._people = [];
        (w.staff || []).forEach(function (s) {
          (s.people || []).forEach(function (p) { w._people.push(p); });
        });
        works.push(w);
      });
    });

    var editionsSorted = raw.editions.slice().sort(function (a, b) {
      return (a.edition.seq || 0) - (b.edition.seq || 0);
    });

    var D = {
      raw: raw,
      index: raw.index,
      taxonomy: raw.taxonomy,
      editions: editionsSorted,
      works: works,
      worksByDate: works.slice().sort(function (a, b) {
        var ta = a.published_at ? Date.parse(a.published_at) : 0;
        var tb = b.published_at ? Date.parse(b.published_at) : 0;
        return tb - ta;
      }),
      latestEdition: editionsSorted[editionsSorted.length - 1],
      editionMap: editionMap,
      schoolMap: Object.create(null),
      clubMap: Object.create(null),
      vocalMap: Object.create(null),
      engineMap: Object.create(null),
      uploaders: [],
      _core: true,
      _dicts: false
    };

    D.getEdition = function (id) { return editionMap[id]; };
    D.spOfEdition = function (id) {
      var ed = editionMap[id];
      if (!ed || !ed.edition.sp_work_id) return null;
      return ed.works.find(function (w) { return w.id === ed.edition.sp_work_id; }) || null;
    };
    /** 全部 SP，按期倒序（最新在前） */
    D.allSp = function () {
      return editionsSorted.slice().reverse().map(function (ed) {
        var w = D.spOfEdition(ed.edition.id);
        return w ? { edition: ed.edition, work: w } : null;
      }).filter(Boolean);
    };
    D.uniqueSchools = function (list) { return uniq(list || works, '_schoolIds'); };
    D.uniqueClubs = function (list) { return uniq(list || works, '_clubIds'); };
    D.uniqueVocals = function (list) { return uniq(list || works, '_vocalIds'); };
    D.typeCounts = function (list) {
      var c = { OC: 0, RT: 0, VC: 0, IC: 0, DW: 0, unknown: 0 };
      (list || works).forEach(function (w) {
        if (w.type && c[w.type] !== undefined) c[w.type]++;
        else c.unknown++;
      });
      return c;
    };
    D.worksOfSchool = function (id) {
      return works.filter(function (w) { return w._schoolIds.indexOf(id) >= 0; });
    };
    D.worksOfClub = function (id) {
      return works.filter(function (w) { return w._clubIds.indexOf(id) >= 0; });
    };
    D.worksOfVocal = function (id) {
      return works.filter(function (w) { return w._vocalIds.indexOf(id) >= 0; });
    };
    /** 某实体的"首次出现"年份（由作品发布时间推导） */
    D.firstYearOf = function (list) {
      var ys = list.map(function (w) { return w.year; }).filter(function (y) { return y; });
      return ys.length ? Math.min.apply(null, ys) : null;
    };
    D.yearsOf = function (list) {
      var s = {};
      list.forEach(function (w) { if (w.year) s[w.year] = 1; });
      return Object.keys(s).map(Number).sort();
    };

    return D;
  }

  function uniq(list, key) {
    var seen = Object.create(null);
    list.forEach(function (w) {
      (w[key] || []).forEach(function (i) { seen[i] = 1; });
    });
    return Object.keys(seen);
  }

  // ---------------------------------------------------------------- 字典挂载
  function attachDicts(D, dict) {
    var byId = function (arr) {
      var m = Object.create(null);
      arr.forEach(function (x) { m[x.id] = x; });
      return m;
    };
    D.schoolMap = byId(dict.schools.schools);
    D.clubMap = byId(dict.clubs.clubs);
    D.vocalMap = byId(dict.vocals.vocals);
    D.engineMap = byId(dict.engines.engines);
    D.uploaders = dict.clubs.uploaders || [];
    D.schoolsRaw = dict.schools.schools;
    D.clubsRaw = dict.clubs.clubs;

    // 回填作品的解析后关联对象与展示名
    D.works.forEach(function (w) {
      w._schools = w._schoolIds.map(function (i) { return D.schoolMap[i]; }).filter(Boolean);
      w._clubs = w._clubIds.map(function (i) { return D.clubMap[i]; }).filter(Boolean);
      w._vocals = w._vocalIds.map(function (i) { return D.vocalMap[i]; }).filter(Boolean);
      w._engines = w._engineIds.map(function (i) { return D.engineMap[i]; }).filter(Boolean);
      w._schoolLabel = w._schools.map(function (s) { return s.name; }).join('、');
      // 社团名优先用解析后的规范名，回退到原文
      w._clubLabelFull = w._clubs.length
        ? w._clubs.map(function (c) { return c.name; }).join('、')
        : w._clubLabel;
    });

    D.nameOfSchool = function (id) { var s = D.schoolMap[id]; return s ? s.name : id; };
    D.nameOfClub = function (id) { var c = D.clubMap[id]; return c ? c.name : id; };
    D.nameOfVocal = function (id) { var v = D.vocalMap[id]; return v ? v.name : id; };
  }

  /**
   * 解析封面地址（方案 C：封面已拷贝到 site/media/cover/{edition_id}/{bvid}.jpg）
   */
  function coverURL(work) {
    if (!work) return null;
    if (work.media && work.media.cover) return work.media.cover;
    var bvid = work.bilibili && work.bilibili.bvid;
    if (!bvid) return null;
    return ROOT + '/media/cover/' + work.edition_id + '/' + bvid + '.jpg';
  }

  window.VCData = {
    load: load,
    loadCore: loadCore,
    loadDicts: loadDicts,
    coverURL: coverURL,
    ROOT: ROOT
  };
})();
