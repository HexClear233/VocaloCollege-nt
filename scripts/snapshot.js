// scripts/snapshot.js — 数据快照（方案十三「数据快照」）
//
// 每次数据更新保存一条摘要到 data/snapshots/YYYY-MM-DD.json，
// 并维护 data/snapshots/index.json 作为时间序列索引，供网站展示
// 「Data updated」与长期历史趋势。
//
// 幂等：同一天重复运行会覆盖当天快照，不会产生重复条目。
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const D = path.join(ROOT, 'data');
const SNAP_DIR = path.join(D, 'snapshots');

const read = (p) => JSON.parse(fs.readFileSync(p, 'utf8'));
const write = (p, o) => fs.writeFileSync(p, JSON.stringify(o, null, 2) + '\n', 'utf8');

fs.mkdirSync(SNAP_DIR, { recursive: true });

const statsPath = path.join(D, 'statistics.json');
if (!fs.existsSync(statsPath)) {
  console.error('缺少 data/statistics.json，请先运行：node scripts/build_statistics.js');
  process.exit(1);
}
const S = read(statsPath);
const O = S.overview;

const date = S.generated_date;

// 单日快照：只存"总量 + 构成"，不存明细（明细可由该时间点的 git 版本还原）
const snap = {
  schema: 'vocalocollege/snapshot/1.0',
  date,
  generated_at: S.generated_at,
  works: O.works,
  editions: O.editions,
  schools: O.schools,
  clubs: O.clubs,
  vocals: O.vocals,
  engines: O.engines,
  OC: O.OC,
  RT: O.RT,
  VC: O.VC,
  IC: O.IC,
  DW: O.DW,
  sp: O.sp,
  onAir: O.onAir,
  listedOnly: O.listedOnly,
  collaborations: O.collaborations,
  crossSchoolWorks: O.crossSchoolWorks,
  multiClubWorks: O.multiClubWorks
};

write(path.join(SNAP_DIR, date + '.json'), snap);

// ---------------------------------------------------------------- 索引
const files = fs.readdirSync(SNAP_DIR)
  .filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f))
  .sort();

const series = files.map((f) => {
  const s = read(path.join(SNAP_DIR, f));
  return {
    date: s.date,
    works: s.works,
    schools: s.schools,
    clubs: s.clubs,
    vocals: s.vocals,
    editions: s.editions,
    OC: s.OC, RT: s.RT, VC: s.VC, IC: s.IC, DW: s.DW,
    sp: s.sp,
    collaborations: s.collaborations
  };
});

// 相邻快照的增量（有两条以上快照时才有意义）
const deltas = [];
for (let i = 1; i < series.length; i++) {
  const a = series[i - 1], b = series[i];
  const d = { from: a.date, to: b.date, works: b.works - a.works, schools: b.schools - a.schools,
              clubs: b.clubs - a.clubs, vocals: b.vocals - a.vocals };
  d.sum = d.works + d.schools + d.clubs + d.vocals;
  if (d.sum !== 0) deltas.push(d);
}

const idx = {
  schema: 'vocalocollege/snapshot-index/1.0',
  generated_at: S.generated_at,
  latest: date,
  count: series.length,
  first_date: series.length ? series[0].date : null,
  note: '每次运行 scripts/build_statistics.js 后运行 scripts/snapshot.js 追加一条。同日重复运行会覆盖。',
  series,
  deltas
};
write(path.join(SNAP_DIR, 'index.json'), idx);

// ---------------------------------------------------------------- 把"数据更新日期"写回 index.json
const indexPath = path.join(D, 'index.json');
const mainIndex = read(indexPath);
mainIndex.data_updated_at = date;
mainIndex.snapshots = { count: series.length, first_date: idx.first_date, latest: date };
write(indexPath, mainIndex);

console.log('快照已保存');
console.log('  日期        ' + date);
console.log('  快照总数    ' + series.length + (idx.first_date ? '（起始 ' + idx.first_date + '）' : ''));
console.log('  作品/高校/社团/歌声  ' + O.works + ' / ' + O.schools + ' / ' + O.clubs + ' / ' + O.vocals);
if (deltas.length) {
  const last = deltas[deltas.length - 1];
  console.log('  较上次变化  works ' + (last.works >= 0 ? '+' : '') + last.works +
    ', schools ' + (last.schools >= 0 ? '+' : '') + last.schools +
    ', clubs ' + (last.clubs >= 0 ? '+' : '') + last.clubs);
} else {
  console.log('  较上次变化  —（仅一条快照）');
}
console.log('  index.json 已更新 data_updated_at = ' + date);
