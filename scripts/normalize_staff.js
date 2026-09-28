// scripts/normalize_staff.js — 将 works[].staff 的细粒度 role 归并为粗粒度
//
// 依据栏目方 data_schema.md 的示例：
//   music       ← 作词/作曲/编曲/调教/调校/混音/母带/编曲指导/和声编写/... （音乐制作）
//   visual      ← 曲绘/PV/视频/剪辑/画师/原画/模型/动捕/分镜/服设/字幕/封面/... （视觉制作）
//   策划        ← 策划/监制/出品/主策划/立项
//   performance ← 演唱/Vo./Vocal/主唱/唱见/歌手/演奏/吉他/贝斯/鼓/键盘/... （演绎）
//   other       ← 其余无法归类（如「一般路过」「协力」「鸣谢」）
//
// 细粒度原文不丢失：已完整保存在 staff_raw。
const fs = require('fs');
const path = require('path');

const D = path.join(__dirname, '..', 'data');
const read = (p) => JSON.parse(fs.readFileSync(p, 'utf8'));
const write = (p, o) => fs.writeFileSync(p, JSON.stringify(o, null, 2) + '\n', 'utf8');

const MUSIC = [
  '词', '曲', '编', '调', '混', 'Music', 'Lyrics', 'Arrange', 'Arrangement',
  'Vocal Edit', '作词', '作曲', '编曲', '调教', '调校', '调声', '混音', '母带',
  '混音/母带', '编曲指导', '作词指导', '和声编写', '和声', 'midi', '音乐制作',
  '填词', '中文填词', '中文重填词', '母带制作', '和声改编', '语调校', '语调',
  '改编', '歌曲音频', 'Mix', 'Mix.', '混', '作', '原pv', 'vsqx作者'
];
const VISUAL = [
  '绘', '影', '视', 'PV', 'Movie', 'Illustration', '曲绘', '视频', '视频制作',
  '后期', '剪辑', '画师', '原画', '模型', '动捕', '分镜', '服设', '字幕模板',
  '字幕后期', '封面', '封面制作', '题字', '工程灌词', '摄影', '摄影/调色',
  '模型/动捕/分镜', 'pv', 'PV制作', 'PV艺术指导', '录像是', '背景图提供'
];
const PLAN = ['策划', '监制', '出品', '主策划', 'Plan', '统筹', '立项', '负责人'];
const PERF = [
  '演', 'Vo.', 'Vocal', 'vocal', '唱', '奏', '演唱', '演唱者', '唱见', '主唱',
  '歌手', '出演', '表演', '翻唱', '表演者', '钢琴', '吉他', '贝斯', '鼓', '架子鼓',
  '键盘', '古筝', '二胡', '扬琴', '琵琶', '小提琴', '口风琴', '合成器', '器乐',
  '节奏吉他', '旋律吉他', '主音吉他', '吉他2', '红衣女主唱', '蓝衣女主唱',
  '长发男主唱', '鼓手', '贝斯手', '舞', '歌', '乐队', '演出乐队', '翻调',
  '调教-苍穹', '调教-诗岸', '调教-teto', '调教-星尘', '录音', '修音', '调音',
  '录制', '录制协力',
  // 器乐英文缩写
  'Gt.', 'Ba.', 'Kb.', 'Dr.', 'Drum', 'Key', 'Bass', 'Guitar',
  'vol.', 'gui.', 'key.', 'drum.', 'bass'
];

const pick = (role) => {
  if (!role) return 'other';
  const r = role.trim();
  if (PLAN.includes(r)) return '策划';
  if (PERF.includes(r)) return 'performance';
  if (MUSIC.includes(r)) return 'music';
  if (VISUAL.includes(r)) return 'visual';
  // 模糊匹配
  if (/策划|监制|出品|负责/.test(r)) return '策划';
  if (/编曲|作曲|作词|调教|调校|调声|混音|母带|和声|midi|填词|改编|语调|vsqx|Mix|歌曲音频/.test(r)) return 'music';
  if (/曲绘|PV|视频|剪辑|后期|画师|原画|分镜|字幕|封面|摄影|题字|工程|服设|模型|动捕/.test(r)) return 'visual';
  if (/演唱|唱见|主唱|歌手|吉他|贝斯|鼓|键盘|钢琴|古筝|二胡|扬琴|琵琶|小提琴|口风琴|合成器|演奏|器乐|乐队|录|调音|修音|翻唱|翻调|出演|表演|舞/.test(r)) return 'performance';
  return 'other';
};

const ROLE_ZH = { music: '音乐', visual: '视觉', 策划: '策划', performance: '演绎', other: '其他' };

const editionFiles = ['2024', '2025-vol1', '2025-vol2', '2026-vol1', '2026-vol2'];
const stats = {};
let changed = 0, total = 0;

for (const eid of editionFiles) {
  const p = path.join(D, 'editions', `${eid}.json`);
  const ed = read(p);

  for (const w of ed.works) {
    total++;
    if (!w.staff || !w.staff.length) continue;

    // 幂等：若已归并过，则从 ext.staff_detail 取细粒度原文重算
    const source = (w.ext && w.ext.staff_detail) ? w.ext.staff_detail : w.staff;

    // 细粒度原文（供审计与未来回填）
    const detail = source.map(s => ({ role: s.role, people: s.people }));
    const before = JSON.stringify(w.staff);

    // 按粗粒度合并同 role 的人
    const buckets = new Map();
    for (const s of source) {
      const coarse = pick(s.role);
      stats[s.role] = coarse;
      if (!buckets.has(coarse)) buckets.set(coarse, new Set());
      for (const person of (s.people || [])) buckets.get(coarse).add(person);
    }
    const order = ['music', 'visual', '策划', 'performance', 'other'];
    w.staff = order
      .filter(k => buckets.has(k))
      .map(k => ({ role: k, people: [...buckets.get(k)] }));

    if (JSON.stringify(w.staff) !== before) changed++;

    // 细粒度存进 ext，不丢信息
    w.ext = w.ext || {};
    w.ext.staff_detail = detail;
    w.ext.staff_roles = [...new Set(detail.map(d => d.role))];
  }

  write(p, ed);
}

// 写映射表到 taxonomy
{
  const p = path.join(D, 'taxonomy.json');
  const t = read(p);
  t.staff_role_normalization = {
    note: '依据栏目方 data_schema.md 归并 STAFF role。细粒度原文保留在 works[].ext.staff_detail 与 staff_raw',
    coarse_roles: [
      { code: 'music', name_zh: '音乐', from: ['作词', '作曲', '编曲', '调教', '调校', '调声', '混音', '母带', '和声编写', '编曲指导', 'midi', '音乐制作'] },
      { code: 'visual', name_zh: '视觉', from: ['曲绘', 'PV', '视频制作', '剪辑', '后期', '画师', '原画', '分镜', '字幕', '封面', '题字', '摄影'] },
      { code: '策划', name_zh: '策划', from: ['策划', '监制', '出品', '主策划'] },
      { code: 'performance', name_zh: '演绎', from: ['演唱', '唱见', '主唱', '歌手', '出演', '乐队', '各器乐', '录音', '修音', '翻调'] },
      { code: 'other', name_zh: '其他', from: ['一般路过', '协力', '鸣谢', '混', '影 等无法归类者'] }
    ],
    role_labels: ROLE_ZH
  };
  write(p, t);
}

console.log(`STAFF 归并完成: 处理 ${total} 条作品，其中 ${changed} 条有变化`);
console.log(`\n细粒度 → 粗粒度 映射统计 (${Object.keys(stats).length} 种):`);
const byCoarse = {};
for (const [fine, coarse] of Object.entries(stats)) {
  (byCoarse[coarse] = byCoarse[coarse] || []).push(fine);
}
for (const [coarse, fines] of Object.entries(byCoarse)) {
  console.log(`\n  ${coarse} (${fines.length} 种):`);
  console.log(`    ${fines.join('、')}`);
}
