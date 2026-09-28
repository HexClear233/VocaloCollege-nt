// scripts/validate.js — Phase 0 数据校验
// 用法: node scripts/validate.js
// 零 error 才进入下一阶段

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', 'data');
const errors = [];
const warnings = [];
const infos = [];

const readJSON = (p) => {
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch (e) {
    errors.push(`JSON 解析失败: ${p} → ${e.message}`);
    return null;
  }
};

const err = (m) => errors.push(m);
const warn = (m) => warnings.push(m);
const info = (m) => infos.push(m);

// ---------- 载入 ----------
const index = readJSON(path.join(ROOT, 'index.json'));
const schools = readJSON(path.join(ROOT, 'schools.json'));
const clubs = readJSON(path.join(ROOT, 'clubs.json'));
const vocals = readJSON(path.join(ROOT, 'vocals.json'));
const engines = readJSON(path.join(ROOT, 'engines.json'));
const taxonomy = readJSON(path.join(ROOT, 'taxonomy.json'));

if (!index || !schools || !clubs || !vocals || !engines || !taxonomy) {
  console.error('基础文件载入失败，终止。');
  process.exit(1);
}

// ---------- 建索引 ----------
const schoolIds = new Set(schools.schools.map(s => s.id));
const clubIds = new Set(clubs.clubs.map(c => c.id));
const vocalIds = new Set(vocals.vocals.map(v => v.id));
const engineIds = new Set(engines.engines.map(e => e.id));
const typeCodes = new Set(taxonomy.work_types.map(t => t.code));
const tierCodes = new Set(taxonomy.tiers.map(t => t.code));
const gradeCodes = new Set(taxonomy.chart_grades.map(g => g.code));
const statusCodes = new Set(taxonomy.status_codes.map(s => s.code));

// ---------- 逐期校验 ----------
const allWorks = [];
const editionIds = new Set();
const usedSchoolIds = new Set();
const usedClubIds = new Set();
const usedVocalIds = new Set();
const usedEngineIds = new Set();

for (const meta of index.editions) {
  const file = path.join(ROOT, '..', meta.file);
  const ed = readJSON(file);
  if (!ed) continue;

  const E = ed.edition;
  editionIds.add(E.id);

  if (E.id !== meta.id) err(`[${meta.id}] edition.id 与 index 不符: ${E.id}`);
  if (!/^\d{4}(-vol\d+)?$/.test(E.id)) err(`[${E.id}] edition.id 格式非法`);

  // 段落声明 vs 实际条目
  // sections[].work_count 记录"当期页面原有序号数"；被省略的作品（kind=omitted_work）
  // 在页面上有位置但不建条目，故允许 sections 合计 = works 数 + 省略数。
  if (E.sections) {
    const declared = E.sections.reduce((a, s) => a + s.work_count, 0);
    const omitted = (E.notes || []).filter(n => n.kind === 'omitted_work').length;
    if (declared !== ed.works.length + omitted) {
      err(`[${E.id}] sections 合计 ${declared} ≠ works ${ed.works.length} + 省略 ${omitted}（应为 ${ed.works.length + omitted}）`);
    }
  }

  if (meta.works !== ed.works.length) {
    err(`[${E.id}] index.works=${meta.works} ≠ 文件内 ${ed.works.length}`);
  }

  // 期备注
  const NOTE_KINDS = ['omitted_work', 'uncollected_work', 'comment', 'page_note', 'asset_note'];
  for (const n of (E.notes || [])) {
    if (!n.id) err(`[${E.id}] edition.notes 条目缺 id`);
    if (!NOTE_KINDS.includes(n.kind)) err(`[${E.id}] note.kind 非法: ${n.kind}`);
    if (['omitted_work', 'uncollected_work'].includes(n.kind) && !n.title) {
      err(`[${E.id}] note ${n.id} (${n.kind}) 缺 title`);
    }
    if (['page_note', 'asset_note', 'comment'].includes(n.kind) && !n.text) {
      warn(`[${E.id}] note ${n.id} (${n.kind}) 缺 text`);
    }
  }
  for (const n of (E.notes || []).filter(x => x.kind === 'omitted_work')) {
    if (n.seq_label && ed.works.some(w => w.seq.label === n.seq_label)) {
      err(`[${E.id}] 省略作品序号 ${n.seq_label} 与已收录条目冲突`);
    }
  }

  const seqSeen = new Map();
  let spCount = 0;
  let typed = 0, untyped = 0;

  for (const w of ed.works) {
    allWorks.push({ w, ed: E });

    if (!/^work-[a-z0-9\-]+$/.test(w.id.toLowerCase())) err(`[${E.id}] work.id 格式非法: ${w.id}`);
    if (!w.id.toLowerCase().startsWith(`work-${E.id}-`)) err(`[${E.id}] work.id 前缀不符: ${w.id}`);
    if (w.seq.label !== null) {
      if (seqSeen.has(w.seq.label)) err(`[${E.id}] seq.label 重复: ${w.seq.label}`);
      seqSeen.set(w.seq.label, w.id);
    }

    if (w.type === null) {
      untyped++;
      if (w.status.type !== 'pending') err(`[${w.id}] type=null 但 status.type=${w.status.type}`);
    } else {
      typed++;
      if (!typeCodes.has(w.type)) err(`[${w.id}] type 非法: ${w.type}`);
      if (w.status.type !== 'ok' && w.status.type !== 'inferred') {
        warn(`[${w.id}] type=${w.type} 但 status.type=${w.status.type}`);
      }
    }
    for (const t of (w.type_secondary || [])) {
      if (!typeCodes.has(t)) err(`[${w.id}] type_secondary 非法: ${t}`);
    }
    if (!w.type_raw && w.type === null) warn(`[${w.id}] type 留空但缺 type_raw`);

    if (!tierCodes.has(w.tier)) err(`[${w.id}] tier 非法: ${w.tier}`);
    if (w.is_sp) {
      spCount++;
      if (w.tier !== 'sp') err(`[${w.id}] is_sp=true 但 tier=${w.tier}`);
      if (!['OC', 'RT'].includes(w.type)) err(`[${w.id}] SP 作品类型必须为 OC/RT，实际 ${w.type}`);
    } else if (w.tier === 'sp') {
      err(`[${w.id}] tier=sp 但 is_sp=false`);
    }

    for (const s of (w.school_ids || [])) { if (!schoolIds.has(s)) err(`[${w.id}] school_id 不存在: ${s}`); else usedSchoolIds.add(s); }
    for (const c of (w.club_ids || [])) { if (!clubIds.has(c)) err(`[${w.id}] club_id 不存在: ${c}`); else usedClubIds.add(c); }
    for (const v of (w.vocal_ids || [])) { if (!vocalIds.has(v)) err(`[${w.id}] vocal_id 不存在: ${v}`); else usedVocalIds.add(v); }
    for (const e of (w.engine_ids || [])) { if (!engineIds.has(e)) err(`[${w.id}] engine_id 不存在: ${e}`); else usedEngineIds.add(e); }

    for (const [k, v] of Object.entries(w.status || {})) {
      if (typeof v === 'string' && !statusCodes.has(v)) err(`[${w.id}] status.${k} 非法值: ${v}`);
    }

    if (w.published_at !== null) {
      if (isNaN(Date.parse(w.published_at))) err(`[${w.id}] published_at 非法: ${w.published_at}`);
      else {
        const y = new Date(w.published_at).getFullYear();
        if (w.year !== y) warn(`[${w.id}] year=${w.year} 与 published_at 年份 ${y} 不符`);
      }
    } else if (!['absent', 'pending'].includes(w.status.published_at)) {
      warn(`[${w.id}] published_at 为 null 但 status=${w.status.published_at}`);
    }

    if ((w.type_secondary || []).includes(w.type)) warn(`[${w.id}] type_secondary 与 type 重复`);
    if (w.type === 'IC' && (w.vocal_ids || []).length > 0) warn(`[${w.id}] type=IC 但有 vocal_ids`);

    if (!w.title) err(`[${w.id}] 缺 title`);
    if (w.club_names_raw === undefined) warn(`[${w.id}] 缺 club_names_raw`);
    if (w.vocal_names_raw === undefined) warn(`[${w.id}] 缺 vocal_names_raw`);
    if (w.engine_names_raw === undefined) warn(`[${w.id}] 缺 engine_names_raw`);

    // STAFF role 白名单（Phase 1 归并后）
    const ROLE_OK = new Set(['music', 'visual', '策划', 'performance', 'other']);
    for (const s of (w.staff || [])) {
      if (s.role && !ROLE_OK.has(s.role)) warn(`[${w.id}] staff role 未归并: ${s.role}`);
    }
  }

  if (spCount > 1) err(`[${E.id}] SP 数量 ${spCount} > 1`);

  if (E.sp_work_id) {
    const spw = ed.works.find(w => w.id === E.sp_work_id);
    if (!spw) err(`[${E.id}] sp_work_id 指向不存在的 work: ${E.sp_work_id}`);
    else if (!spw.is_sp) err(`[${E.id}] sp_work_id 指向的作品 is_sp=false`);
  }

  info(`[${E.id}] works=${ed.works.length} typed=${typed} untyped=${untyped} sp=${spCount} notes=${(E.notes || []).length}`);
}

// ---------- 全局唯一性 ----------
const idSeen = new Set();
for (const { w } of allWorks) {
  if (idSeen.has(w.id)) err(`work.id 全局重复: ${w.id}`);
  idSeen.add(w.id);
}

// ---------- 字典反向校验 ----------
for (const s of schools.schools) {
  if (!s.id.startsWith('school-')) err(`school.id 格式非法: ${s.id}`);
  for (const c of (s.club_ids || [])) if (!clubIds.has(c)) err(`[${s.id}] club_ids 引用不存在: ${c}`);
}
for (const c of clubs.clubs) {
  if (!c.id.startsWith('club-')) err(`club.id 格式非法: ${c.id}`);
  if (c.school_id && !schoolIds.has(c.school_id)) err(`[${c.id}] school_id 不存在: ${c.school_id}`);
}
for (const v of vocals.vocals) {
  if (!v.id.startsWith('vocal-')) err(`vocal.id 格式非法: ${v.id}`);
  for (const e of (v.engine_ids || [])) if (!engineIds.has(e)) err(`[${v.id}] engine_id 不存在: ${e}`);
}

// ---------- 社团归属歧义（院系 vs 校区）----------
const ambSchools = schools.schools.filter(s => s.ambiguity && s.ambiguity.status !== 'resolved');
if (ambSchools.length) {
  info(`院校下多社团、院系/校区差异未定: ${ambSchools.length} 所`);
  for (const s of ambSchools) {
    info(`  ${s.name} [${s.ambiguity.distinction}] ${s.ambiguity.member_count} 个成员 — ${s.ambiguity.distinction_label}`);
  }
} else {
  info('院校下多社团的院系/校区歧义: 无');
}

// ---------- 未使用的字典条目 ----------
const unusedSchools = schools.schools.filter(s => !usedSchoolIds.has(s.id));
const unusedClubs = clubs.clubs.filter(c => !usedClubIds.has(c.id));
const unusedVocals = vocals.vocals.filter(v => !usedVocalIds.has(v.id));
const unusedEngines = engines.engines.filter(e => !usedEngineIds.has(e.id));

if (process.env.VERBOSE_UNUSED) {
  for (const s of unusedSchools) info(`school 未被引用: ${s.id} (${s.name})`);
  for (const c of unusedClubs) info(`club 未被引用: ${c.id} (${c.name})`);
} else {
  info(`未被作品引用的 school: ${unusedSchools.length} / ${schools.schools.length}`);
  info(`未被作品引用的 club:   ${unusedClubs.length} / ${clubs.clubs.length}`);
  info(`未被作品引用的 vocal:  ${unusedVocals.length} / ${vocals.vocals.length}`);
  info(`未被作品引用的 engine: ${unusedEngines.length} / ${engines.engines.length}（CeVIO / UTAU 为预留位）`);
}

// ---------- 输出 ----------
console.log('='.repeat(60));
console.log(`校验完成: 共 ${allWorks.length} 条作品，${editionIds.size} 期`);
console.log(`字典: schools=${schools.schools.length} clubs=${clubs.clubs.length} vocals=${vocals.vocals.length} engines=${engines.engines.length}`);
console.log('='.repeat(60));

if (errors.length) {
  console.log(`\n❌ ERROR (${errors.length})`);
  errors.forEach(e => console.log('  ' + e));
} else {
  console.log('\n✅ 零 error');
}

if (warnings.length) {
  console.log(`\n⚠️  WARN (${warnings.length})`);
  warnings.slice(0, 60).forEach(w => console.log('  ' + w));
  if (warnings.length > 60) console.log(`  ... 另有 ${warnings.length - 60} 条`);
}

if (infos.length) {
  console.log(`\nℹ️  INFO (${infos.length})`);
  infos.forEach(i => console.log('  ' + i));
}

process.exit(errors.length ? 1 : 0);
