// scripts/build_annual_report.js — 年度报告（方案十四）
//
// 生成 data/reports/{year}.json，网站渲染为 /reports/{year}.html
//
// 严格遵守方案十四「不建议设置」：
//   不产出「年度最佳高校 / 年度最佳社团 / 年度最佳作品 / 社团实力排名 / 高校排名」
//   只做记录性描述：新增了什么、构成了什么、变化了多少。
//   ——「记录，而不是裁判。」
//
// 另按栏目方要求（2026-09-28）：
//   不提供「参与社团 / 参与高校」这类按作品数排序的实体榜。把院校与社团按
//   作品数并排排序，即便标注"非排名"，仍会被读成活跃度对比。
//   年度涉及的高校/社团**数量**保留在 summary（只给"有多少"，不给"谁多"）。
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const D = path.join(ROOT, 'data');
const REPORTS = path.join(D, 'reports');

const read = (p) => JSON.parse(fs.readFileSync(p, 'utf8'));
const write = (p, o) => fs.writeFileSync(p, JSON.stringify(o, null, 2) + '\n', 'utf8');

fs.mkdirSync(REPORTS, { recursive: true });

const index = read(path.join(D, 'index.json'));
const schools = read(path.join(D, 'schools.json'));
const clubs = read(path.join(D, 'clubs.json'));
const vocals = read(path.join(D, 'vocals.json'));

const editions = [];
const works = [];
for (const e of index.editions) {
  const ed = read(path.join(ROOT, e.file));
  editions.push(ed);
  ed.works.forEach((w) => works.push(Object.assign({ _editionId: ed.edition.id }, w)));
}

const TYPE_ZH = { OC: '原创', RT: '翻调', VC: '人声翻唱', IC: '乐器翻奏', DW: '衍生创作' };

function uniq(list, key) {
  const s = new Set();
  list.forEach((w) => (w[key] || []).forEach((x) => s.add(x)));
  return [...s];
}
function countTypes(list) {
  const p = { OC: 0, RT: 0, VC: 0, IC: 0, DW: 0, unknown: 0 };
  list.forEach((w) => { if (w.type && p[w.type] !== undefined) p[w.type]++; else p.unknown++; });
  return p;
}

function nameOfSchool(id) {
  const s = schools.schools.find((x) => x.id === id);
  return s ? s.name : id;
}
function nameOfClub(id) {
  const c = clubs.clubs.find((x) => x.id === id);
  return c ? c.name : id;
}
function nameOfVocal(id) {
  const v = vocals.vocals.find((x) => x.id === id);
  return v ? v.name : id;
}

/** 报告年份 = 数据中出现过的年份（作品发布年） */
const years = [...new Set(works.map((w) => w.year).filter(Boolean))].sort((a, b) => a - b);

const args = process.argv.slice(2);
const only = (() => { const i = args.indexOf('--year'); return i >= 0 ? +args[i + 1] : null; })();
const targetYears = only ? [only] : years;

let built = 0;

for (const year of targetYears) {
  const list = works.filter((w) => w.year === year);
  if (!list.length) continue;

  const prevAll = works.filter((w) => w.year && w.year < year);

  const tc = countTypes(list);
  const schoolIds = uniq(list, 'school_ids');
  const clubIds = uniq(list, 'club_ids');
  const vocalIds = uniq(list, 'vocal_ids');

  // 新增：该年首次出现的实体（相对更早年份）
  const prevSchools = new Set(uniq(prevAll, 'school_ids'));
  const prevClubs = new Set(uniq(prevAll, 'club_ids'));
  const prevVocals = new Set(uniq(prevAll, 'vocal_ids'));
  const newSchools = schoolIds.filter((x) => !prevSchools.has(x));
  const newClubs = clubIds.filter((x) => !prevClubs.has(x));
  const newVocals = vocalIds.filter((x) => !prevVocals.has(x));

  const edIds = [...new Set(list.map((w) => w._editionId))];

  // 合作（该年作品涉及的合作记录）
  const yearWorkIds = new Set(list.map((w) => w.id));
  const collabs = [];
  editions.forEach((ed) => {
    (ed.collaborations || []).forEach((c) => {
      const hit = (c.work_ids || []).filter((id) => yearWorkIds.has(id));
      if (hit.length) collabs.push({
        id: c.id, label: c.label || null, kind: c.kind,
        crossSchoolKind: c.cross_school_kind, isCrossSchool: !!c.is_cross_school,
        clubIds: c.club_ids || [], schoolIds: c.school_ids || [], workIds: hit
      });
    });
  });

  const sp = list.filter((w) => w.is_sp);

  const report = {
    schema: 'vocalocollege/annual-report/1.0',
    year,
    generated_at: new Date().toISOString(),
    title: 'VocaloCollege ' + year + ' Annual Report',
    subtitle: '高校术力口之声 ' + year + ' 年度记录',
    statement: [
      '本报告是一份**记录**，不是评比。',
      '不设「年度最佳高校」「年度最佳社团」「年度最佳作品」，不做任何实力排名。',
      '数字描述的是 VocaloCollege 的**收录情况**，不代表社团真实产出总量，也不构成质量评价。'
    ],

    summary: {
      works: list.length,
      editions: edIds.length,
      schools: schoolIds.length,
      clubs: clubIds.length,
      vocals: vocalIds.length,
      OC: tc.OC, RT: tc.RT, VC: tc.VC, IC: tc.IC, DW: tc.DW,
      typeUnknown: tc.unknown,
      sp: sp.length,
      collaborations: collabs.length,
      crossSchool: collabs.filter((c) => c.isCrossSchool).length,
      onAir: list.filter((w) => w.seq && w.seq.visible).length,
      listedOnly: list.filter((w) => !(w.seq && w.seq.visible)).length
    },

    typeBreakdown: ['OC', 'RT', 'VC', 'IC', 'DW'].map((t) => ({
      type: t, label: TYPE_ZH[t], count: tc[t],
      pct: list.length ? +((tc[t] / list.length) * 100).toFixed(1) : 0
    })).filter((x) => x.count > 0),

    newEntities: {
      schools: newSchools.map((id) => ({ id, name: nameOfSchool(id) })),
      clubs: newClubs.map((id) => ({ id, name: nameOfClub(id) })),
      vocals: newVocals.map((id) => ({ id, name: nameOfVocal(id) }))
    },

    editions: edIds.map((id) => {
      const ed = editions.find((e) => e.edition.id === id);
      return {
        id,
        label: ed ? ed.edition.label : id,
        works: ed ? ed.works.filter((w) => w.year === year).length : 0
      };
    }),

    collaborations: collabs,

    // 歌声榜保留：歌声是音源/乐器，不是需要避免比较的社群实体
    worksByVocal: (() => {
      const m = {};
      list.forEach((w) => (w.vocal_ids || []).forEach((v) => { m[v] = (m[v] || 0) + 1; }));
      return Object.keys(m).map((id) => ({ id, name: nameOfVocal(id), count: m[id] }))
        .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, 'zh'));
    })(),

    // 说明：此处**不**输出 worksByClub / worksBySchool。
    // 把院校与社团按作品数排序会被读成活跃度/实力对比，与方案十九
    // 「不做实力排行榜」冲突。需要按院校/社团浏览时，请看 /schools/ 与 /clubs/ 档案页。
    // 年度涉及的高校与社团数量仍在 summary 中（只给"有多少"，不给"谁多"）。

    // 全部作品清单（按发布时间）
    works: list.slice().sort((a, b) =>
      (Date.parse(b.published_at) || 0) - (Date.parse(a.published_at) || 0)
    ).map((w) => ({
      id: w.id,
      title: w.title,
      title_short: w.title_short || null,
      type: w.type,
      is_sp: !!w.is_sp,
      year: w.year,
      published_at: w.published_at,
      bvid: w.bilibili ? w.bilibili.bvid : null,
      url: w.bilibili ? w.bilibili.url : null,
      edition_id: w._editionId,
      vocal_names: w.vocal_names_raw || [],
      club_names: w.club_names_raw || [],
      onAir: !!(w.seq && w.seq.visible)
    }))
  };

  write(path.join(REPORTS, year + '.json'), report);
  built++;
  console.log('  ' + year + '.json  works=' + list.length +
    '  schools=' + schoolIds.length + '  clubs=' + clubIds.length +
    '  new: +' + newSchools.length + '校 +' + newClubs.length + '社 +' + newVocals.length + '歌声' +
    '  collab=' + collabs.length + '  SP=' + sp.length);
}

// 报告索引
const files = fs.readdirSync(REPORTS).filter((f) => /^\d{4}\.json$/.test(f)).sort().reverse();
const ridx = {
  schema: 'vocalocollege/report-index/1.0',
  generated_at: new Date().toISOString(),
  note: '本报告是记录，不是评比。不含院校/社团的作品数排行。',
  years: files.map((f) => {
    const r = read(path.join(REPORTS, f));
    return {
      year: r.year,
      file: 'reports/' + f,
      works: r.summary.works,
      schools: r.summary.schools,
      clubs: r.summary.clubs,
      vocals: r.summary.vocals,
      newSchools: r.newEntities.schools.length,
      newClubs: r.newEntities.clubs.length,
      newVocals: r.newEntities.vocals.length,
      collaborations: r.summary.collaborations,
      sp: r.summary.sp
    };
  })
};
write(path.join(REPORTS, 'index.json'), ridx);

console.log('\n年度报告生成完成：' + built + ' 份');
console.log('索引：data/reports/index.json');
