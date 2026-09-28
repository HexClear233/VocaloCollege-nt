// scripts/fix_collab_clubs.js — 修正多社团作品的 club_ids（含误加的三社联合拜年祭归属）
//
// 问题：在 Phase 0 补全"三社联合拜年祭"时，把 collab 的 3 个社团 id
//       追加到了 2026-vol2 的多个无关作品上（未完成ステージ / 世末歌者 /
//       权御天下 / 勾指起誓串烧），导致 club_ids 与 club_names_raw 不匹配。
//
// 依据：
//   - 三社联合拜年祭 = 南风(南开) + 沸点(复旦) + D-Touch(天津大学)，
//     仅适用于 2026 Vol.1 的 V2/V10/V11/V12/V13（薰风来时/有你的江湖/
//     モザイクロール/夜行少女/カワユイ星）。
//   - 2026-vol2 V6《未完成ステージ》原文只关联『青柠现视研』（山东大学）。
//   - 2026-vol2 V9《快乐手帐s》《世末歌者》原文只关联 FANTASY动漫社。
//   - 2026-vol2 V12《权御天下》原文只关联 南邮柒世纪动漫社。
//   - 2026-vol2 V10《勾指起誓x恋爱裁判x依存症》原文关联 LEO动漫协会，
//     制作方为中国科大歌声合成技术协会 → 保留这 2 个（同校多社团，正确）。
//   - 2025-vol2 SP《致你》原文关联 LEO动漫协会，鸣谢 USTC歌声合成技术协会
//     → 保留这 2 个（正确）。
const fs = require('fs');
const path = require('path');

const D = path.join(__dirname, '..', 'data');

// work.id → 正确的 club_ids 与 club_names_raw
const FIXES = {
  // 移除被误加的「南风/沸点/D-Touch」三社，恢复原文单一社团
  'work-2026-vol2-bv1zgowb3e78': {
    club_ids: ['club-sdu-qingning'],
    club_names_raw: ['青柠现视研'],
    reason: '原文关联社团仅『青柠现视研』；此前误加三社联合拜年祭归属'
  },
  'work-2026-vol2-bv18v7k6lefx': {
    club_ids: ['club-zju-fantasy'],
    club_names_raw: ['FANTASY动漫社'],
    reason: '原文关联社团仅『FANTASY动漫社』；此前误加三社联合拜年祭归属'
  },
  'work-2026-vol2-bv1pyvj6bejt': {
    club_ids: ['club-njupt-qishiji'],
    club_names_raw: ['南邮柒世纪动漫社'],
    reason: '原文关联社团仅『南邮柒世纪动漫社』；此前误加三社联合拜年祭归属'
  },
  'work-2026-vol2-bv1c4gx6ueqt': {
    club_ids: ['club-ustc-leo', 'club-ustc-vocalo'],
    club_names_raw: ['LEO动漫协会', 'USTC歌声合成技术协会'],
    reason: '原文关联『LEO动漫协会』，描述标明由中国科大歌声合成技术协会制作；同校多社团，保留 2 个'
  },
  // 补上第二个社团的原文名（chars 一致）
  'work-2025-vol2-bv1ku3czxezm': {
    club_ids: ['club-ustc-leo', 'club-ustc-vocalo'],
    club_names_raw: ['LEO动漫协会', 'USTC歌声合成技术协会'],
    reason: 'STAFF 鸣谢 USTC歌声合成技术协会，补上原文名使 id 与 name 数量一致'
  }
};

const editions = ['2024', '2025-vol1', '2025-vol2', '2026-vol1', '2026-vol2'];
let fixed = 0;

for (const e of editions) {
  const p = path.join(D, 'editions', e + '.json');
  const ed = JSON.parse(fs.readFileSync(p, 'utf8'));
  let changed = false;

  for (const w of ed.works) {
    const f = FIXES[w.id];
    if (!f) continue;

    const before = JSON.stringify({ ids: w.club_ids, names: w.club_names_raw });
    w.club_ids = f.club_ids;
    w.club_names_raw = f.club_names_raw;
    w.ext = w.ext || {};
    w.ext.club_fix = {
      at: '2026-09-28',
      reason: f.reason,
      before: before
    };
    // 若只剩一个社团，取消 collaboration 指向（不再构成合作）
    if (f.club_ids.length < 2 && w.collaboration_id) {
      w.ext.club_fix.removed_collaboration = w.collaboration_id;
      w.collaboration_id = null;
      w.status.collaboration_id = 'absent';
    }
    changed = true;
    fixed++;
    console.log('  [' + e + '] ' + (w.title_short || w.title) +
      '  ' + JSON.parse(before).ids.length + ' -> ' + f.club_ids.length + ' 社团');
  }

  if (changed) fs.writeFileSync(p, JSON.stringify(ed, null, 2) + '\n', 'utf8');
}

console.log('\n共修正 ' + fixed + ' 件作品的社团归属');
