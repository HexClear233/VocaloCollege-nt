// scripts/build_statistics.js — 生成 data/statistics.json
//
// 方案 6.1：VocaloCollege 自有数据的实时统计
// 方案十三：定时触发 → 获取数据 → 清洗 → 生成 JSON → 重新统计 → Build → Deploy
//
// 统计口径（严格遵守方案 16.2 与十九）：
//   - 只统计 status 已确认的字段；type 为 null 的计入 unknown，不摊派到任何类型
//   - 不含任何平台指标（播放/点赞等），那些存在 bilibili_stats.json 且独立
//   - 不含任何评价性聚合（如「社团平均排名」），方案十九明确禁止
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const D = path.join(ROOT, 'data');

const read = (p) => JSON.parse(fs.readFileSync(p, 'utf8'));
const write = (p, o) => fs.writeFileSync(p, JSON.stringify(o, null, 2) + '\n', 'utf8');

const TYPES = ['OC', 'RT', 'VC', 'IC', 'DW'];
const now = new Date();
const iso = (d) => {
  const p = (n) => String(n).padStart(2, '0');
  const off = -d.getTimezoneOffset();
  const sign = off >= 0 ? '+' : '-';
  const ah = p(Math.floor(Math.abs(off) / 60));
  const am = p(Math.abs(off) % 60);
  return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) +
    'T' + p(d.getHours()) + ':' + p(d.getMinutes()) + ':' + p(d.getSeconds()) +
    sign + ah + ':' + am;
};

// ---------------------------------------------------------------- 载入
const index = read(path.join(D, 'index.json'));
const schools = read(path.join(D, 'schools.json'));
const clubs = read(path.join(D, 'clubs.json'));
const vocals = read(path.join(D, 'vocals.json'));
const engines = read(path.join(D, 'engines.json'));

const editions = [];
const works = [];
for (const e of index.editions) {
  const ed = read(path.join(ROOT, e.file));
  editions.push(ed);
  ed.works.forEach((w) => works.push(Object.assign({ _editionId: ed.edition.id }, w)));
}

// ---------------------------------------------------------------- 工具
function emptyParts() {
  const o = { OC: 0, RT: 0, VC: 0, IC: 0, DW: 0, unknown: 0 };
  return o;
}
function countTypes(list) {
  const p = emptyParts();
  list.forEach((w) => {
    if (w.type && p[w.type] !== undefined) p[w.type]++;
    else p.unknown++;
  });
  p.total = list.length;
  return p;
}
function uniq(list, key) {
  const s = new Set();
  list.forEach((w) => (w[key] || []).forEach((x) => s.add(x)));
  return [...s];
}
function yearsOf(list) {
  const s = new Set();
  list.forEach((w) => { if (w.year) s.add(w.year); });
  return [...s].sort((a, b) => a - b);
}

// ---------------------------------------------------------------- 汇总
const typeCounts = countTypes(works);
const spWorks = works.filter((w) => w.is_sp);

// 合作
const collabAll = [];
editions.forEach((ed) => {
  (ed.collaborations || []).forEach((c) => collabAll.push(Object.assign({ _editionId: ed.edition.id }, c)));
});
const crossSchoolWorkIds = new Set();
collabAll.forEach((c) => {
  if (c.is_cross_school) (c.work_ids || []).forEach((id) => crossSchoolWorkIds.add(id));
});
const multiClubWorks = works.filter((w) => (w.club_ids || []).length > 1);

// 收录层级（源站 xuhao / non-display-xuhao）
const onAir = works.filter((w) => w.seq && w.seq.visible === true).length;

const overview = {
  works: works.length,
  editions: editions.length,
  schools: uniq(works, 'school_ids').length,
  clubs: uniq(works, 'club_ids').length,
  vocals: uniq(works, 'vocal_ids').length,
  engines: uniq(works, 'engine_ids').length,
  OC: typeCounts.OC,
  RT: typeCounts.RT,
  VC: typeCounts.VC,
  IC: typeCounts.IC,
  DW: typeCounts.DW,
  typeUnknown: typeCounts.unknown,
  sp: spWorks.length,
  onAir,
  listedOnly: works.length - onAir,
  collaborations: collabAll.length,
  crossSchoolWorks: crossSchoolWorkIds.size,
  multiClubWorks: multiClubWorks.length
};

// 按发布年
const byYearMap = {};
works.forEach((w) => {
  const y = w.year || 0;
  if (!byYearMap[y]) byYearMap[y] = [];
  byYearMap[y].push(w);
});
const byYear = Object.keys(byYearMap).map(Number).sort((a, b) => a - b).map((y) => {
  const list = byYearMap[y];
  const t = countTypes(list);
  return {
    year: y || null,
    total: t.total, OC: t.OC, RT: t.RT, VC: t.VC, IC: t.IC, DW: t.DW, unknown: t.unknown,
    schools: uniq(list, 'school_ids').length,
    clubs: uniq(list, 'club_ids').length,
    vocals: uniq(list, 'vocal_ids').length,
    sp: list.filter((w) => w.is_sp).length
  };
});

// 按期
const byEdition = editions.map((ed) => {
  const t = countTypes(ed.works);
  return {
    id: ed.edition.id,
    label: ed.edition.label,
    year: ed.edition.year,
    volume: ed.edition.volume,
    works: t.total, OC: t.OC, RT: t.RT, VC: t.VC, IC: t.IC, DW: t.DW, unknown: t.unknown,
    schools: uniq(ed.works, 'school_ids').length,
    clubs: uniq(ed.works, 'club_ids').length,
    vocals: uniq(ed.works, 'vocal_ids').length,
    sp: ed.works.filter((w) => w.is_sp).length,
    onAir: ed.works.filter((w) => w.seq && w.seq.visible).length,
    collect_window: ed.edition.collect_window || null,
    video_status: ed.edition.video ? ed.edition.video.status : null
  };
});

// 按歌声
const byVocal = uniq(works, 'vocal_ids').map((id) => {
  const list = works.filter((w) => (w.vocal_ids || []).indexOf(id) >= 0);
  const t = countTypes(list);
  const v = vocals.vocals.find((x) => x.id === id);
  return {
    id,
    name: v ? v.name : id,
    works: t.total, OC: t.OC, RT: t.RT, VC: t.VC, IC: t.IC, DW: t.DW,
    schools: uniq(list, 'school_ids').length,
    clubs: uniq(list, 'club_ids').length,
    firstYear: yearsOf(list)[0] || null,
    engine_ids: v ? (v.engine_ids || []) : []
  };
}).sort((a, b) => b.works - a.works || a.name.localeCompare(b.name, 'zh'));

// 按引擎
const byEngine = uniq(works, 'engine_ids').map((id) => {
  const list = works.filter((w) => (w.engine_ids || []).indexOf(id) >= 0);
  const t = countTypes(list);
  const e = engines.engines.find((x) => x.id === id);
  return { id, name: e ? e.name : id, works: t.total, OC: t.OC, RT: t.RT, VC: t.VC, IC: t.IC };
}).sort((a, b) => b.works - a.works);

// 按高校
// 命名说明：bySchool / byClub 按【名称】排序，不按作品数排序。
// 栏目方决定：不提供院校或社团的收录数量排行 —— 按作品数并排容易被读成
// 活跃度/实力对比，与方案十九「不做实力排行榜」「记录，而不是裁判」冲突。
// 这两组是"名录"：每项仍带 works 等字段供查档，但**顺序不表达任何评价**。
const bySchool = uniq(works, 'school_ids').map((id) => {
  const list = works.filter((w) => (w.school_ids || []).indexOf(id) >= 0);
  const t = countTypes(list);
  const s = schools.schools.find((x) => x.id === id);
  return {
    id,
    name: s ? s.name : id,
    works: t.total, OC: t.OC, RT: t.RT, VC: t.VC, IC: t.IC, DW: t.DW,
    clubs: uniq(list, 'club_ids').length,
    vocals: uniq(list, 'vocal_ids').length,
    firstYear: yearsOf(list)[0] || null,
    editionIds: [...new Set(list.map((w) => w._editionId))],
    // 院系/校区差异未定的院校在此标记，供前端提示；不做任何层级推断
    ambiguity: s && s.ambiguity ? s.ambiguity.distinction : null
  };
}).sort((a, b) => a.name.localeCompare(b.name, 'zh'));

// 按社团
const byClub = uniq(works, 'club_ids').map((id) => {
  const list = works.filter((w) => (w.club_ids || []).indexOf(id) >= 0);
  const t = countTypes(list);
  const c = clubs.clubs.find((x) => x.id === id);
  const partners = new Set();
  list.forEach((w) => (w.club_ids || []).forEach((x) => { if (x !== id) partners.add(x); }));
  return {
    id,
    name: c ? c.name : id,
    kind: c ? c.kind : null,
    school_id: c ? c.school_id : null,
    works: t.total, OC: t.OC, RT: t.RT, VC: t.VC, IC: t.IC, DW: t.DW,
    schools: uniq(list, 'school_ids').length,
    firstYear: yearsOf(list)[0] || null,
    editionIds: [...new Set(list.map((w) => w._editionId))],
    collaboratorCount: partners.size
  };
}).sort((a, b) => a.name.localeCompare(b.name, 'zh'));

// 合作关系
const byCollaboration = collabAll.map((c) => ({
  id: c.id,
  label: c.label || null,
  kind: c.kind,
  crossSchoolKind: c.cross_school_kind,
  isCrossSchool: !!c.is_cross_school,
  clubCount: (c.club_ids || []).length,
  clubIds: c.club_ids || [],
  schoolIds: c.school_ids || [],
  workIds: c.work_ids || [],
  editionIds: c.edition_ids || [],
  confidence: c.confidence != null ? c.confidence : null
}));

// 覆盖度（数据完整性自检，方案十六.1「未确认数据不入统计」的可解释性）
const coverage = {
  worksTotal: works.length,
  worksTyped: works.length - typeCounts.unknown,
  worksUntyped: typeCounts.unknown,
  typeCoverage: works.length ? +((works.length - typeCounts.unknown) / works.length).toFixed(4) : null,
  withPublishedAt: works.filter((w) => w.published_at).length,
  withCover: works.filter((w) => w.media && w.media.cover_legacy).length,
  withStaff: works.filter((w) => (w.staff || []).length > 0).length,
  withSchool: works.filter((w) => (w.school_ids || []).length > 0).length,
  withClub: works.filter((w) => (w.club_ids || []).length > 0).length,
  withVocal: works.filter((w) => (w.vocal_ids || []).length > 0).length,
  withChart: works.filter((w) => w.chart_peak_raw && w.chart_peak_raw !== '/').length,
  spWithNote: spWorks.filter((w) => w.sp_note).length,
  spTotal: spWorks.length
};

// ---------------------------------------------------------------- 输出
const out = {
  schema: 'vocalocollege/statistics/1.0',
  generated_at: iso(now),
  generated_date: iso(now).slice(0, 10),
  source: 'data/*.json',
  note: '本文件由 scripts/build_statistics.js 自动生成，请勿手工编辑。',
  policy: {
    counts_platform_metrics: false,
    contains_rankings: false,
    entity_lists_sorted_by: 'name',
    entity_ranking_removed: true,
    statement: '数据用于描述收录情况，不用于评价作品质量。' +
      '平台指标（播放/点赞等）另存 bilibili_stats.json，本站不展示、不聚合。' +
      'bySchool / byClub 按名称排序，按作品数的院校与社团排行已按要求移除。'
  },
  overview,
  coverage,
  typeCounts,
  byYear,
  byEdition,
  byVocal,
  byEngine,
  bySchool,
  byClub,
  byCollaboration
};

write(path.join(D, 'statistics.json'), out);

// ---------------------------------------------------------------- 控制台摘要
console.log('statistics.json 已生成');
console.log('  generated_at   ' + out.generated_at);
console.log('  works          ' + overview.works);
console.log('  editions       ' + overview.editions);
console.log('  schools        ' + overview.schools);
console.log('  clubs          ' + overview.clubs);
console.log('  vocals         ' + overview.vocals);
console.log('  类型构成        OC ' + overview.OC + ' / RT ' + overview.RT +
  ' / VC ' + overview.VC + ' / IC ' + overview.IC +
  (overview.DW ? ' / DW ' + overview.DW : '') +
  (overview.typeUnknown ? ' / 待定 ' + overview.typeUnknown : ''));
console.log('  SP             ' + overview.sp);
console.log('  收录于视频      ' + overview.onAir + '（仅网页 ' + overview.listedOnly + '）');
console.log('  跨校合作作品    ' + overview.crossSchoolWorks);
console.log('  类型覆盖率      ' + (coverage.typeCoverage * 100).toFixed(1) + '%');
