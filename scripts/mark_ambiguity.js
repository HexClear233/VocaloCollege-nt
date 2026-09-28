// scripts/mark_ambiguity.js — 标记"同一院校下多个社团，无法区分是院系还是校区差异"
//
// 栏目方说明（2026-09-28）：
//   某科学的国科子（uploader）与 果壳AVALON漫研社（club）均归属中国科学院大学，
//   但无法区分二者是因为【院系不同】还是【校区不同】。
//   这类情况并非个例 —— 部分院校底下确实有不止一个相关社团。
//
// 处理原则：
//   1. 不强行归并、也不强行拆出校区/院系层级
//   2. 在该 school 上记 ambiguity，列出旗下社团并说明未定原因
//   3. 该 school 的 club 各自独立，不做父子关系推断
const fs = require('fs');
const path = require('path');

const D = path.join(__dirname, '..', 'data');
const read = (p) => JSON.parse(fs.readFileSync(p, 'utf8'));
const write = (p, o) => fs.writeFileSync(p, JSON.stringify(o, null, 2) + '\n', 'utf8');

const schools = read(path.join(D, 'schools.json'));
const clubs = read(path.join(D, 'clubs.json'));
const uploaders = clubs.uploaders || [];

// 已知的「院校下多社团」情形。distinction: department | campus | unknown
const KNOWN = {
  'school-ucas': {
    distinction: 'unknown',
    note: '中国科学院大学下有两个相关实体：社团「果壳AVALON漫研社」与个人账号「某科学的国科子」。栏目方说明：无法区分二者是因为院系不同还是校区不同。',
    members: [
      { kind: 'club', id: 'club-csv-157', name: '果壳AVALON漫研社' },
      { kind: 'uploader', id: 'uploader-guokezi', name: '某科学的国科子' }
    ],
    extra_members: [
      { kind: 'work', id: 'work-2026-vol2-bv1ccjy66e2s', note: '《繁华唱遍》关联社团字段为 /，UP 主为暮雨_fx' },
      { kind: 'work', id: 'work-2026-vol2-bv18w7j6ketg', note: '《千年食谱颂&冠世一战》关联社团字段为「某科学的国科子」' }
    ],
    decided_by: 'user'
  },
  'school-ustc': {
    distinction: 'unknown',
    note: '中国科学技术大学下有 3 个社团（LEO动漫协会 / USTC歌声合成技术协会 / 饭团动漫社），另有跨校企划归属。无法区分是否为院系或校区差异。',
    members: [
      { kind: 'club', id: 'club-ustc-leo', name: '中科大LEO动漫协会' },
      { kind: 'club', id: 'club-ustc-vocalo', name: 'USTC歌声合成技术协会' },
      { kind: 'club', id: 'club-ustc-fantuan', name: '饭团动漫社' }
    ],
    decided_by: 'encoder'
  },
  'school-jlu': {
    distinction: 'unknown',
    note: '吉林大学下有 4 个相关社团（吉大动漫社 / 吉-ACG现视研 / 东北ACG音乐联合企划 / 拾光动漫社_office）。其中「东北ACG音乐联合企划」为跨校性质，其余是否为不同校区未定。',
    members: [
      { kind: 'club', id: 'club-jlu-jida', name: '吉大动漫社' },
      { kind: 'club', id: 'club-jlu-acg', name: '吉-ACG现视研' },
      { kind: 'club', id: 'club-jlu-northeast-acg', name: '东北ACG音乐联合企划' },
      { kind: 'club', id: 'club-csv-378', name: '拾光动漫社_office' }
    ],
    decided_by: 'encoder'
  },
  'school-sdu': {
    distinction: 'campus',
    note: '山东大学下 3 个社团分属不同校区（世伊漫协 / 青柠现视研 / JUMP动漫协会），原文自述「一校三地」。具体校区归属未填。',
    members: [
      { kind: 'club', id: 'club-sdu-shiyi', name: '世伊漫协' },
      { kind: 'club', id: 'club-sdu-qingning', name: '青柠现视研' },
      { kind: 'club', id: 'club-sdu-jump', name: 'JUMP动漫协会' }
    ],
    decided_by: 'user'
  },
  'school-xjtu': {
    distinction: 'unknown',
    note: '西安交通大学下 3 个相关账号（西交现视妍 / 史妍小九_official / XJTU火兰界隈）。「西交现视妍」与 CSV 的「史妍小九_official」是否同一社团、差异属院系还是校区，均未定。',
    members: [
      { kind: 'club', id: 'club-xjtu-xianshiyan', name: '西交现视妍' },
      { kind: 'club', id: 'club-csv-004', name: '史妍小九_official' },
      { kind: 'club', id: 'club-csv-391', name: 'XJTU火兰界隈' }
    ],
    decided_by: 'encoder'
  }
};

// 应用到 school
let n = 0;
for (const [sid, info] of Object.entries(KNOWN)) {
  const s = schools.schools.find(x => x.id === sid);
  if (!s) { console.log(`  ! 未找到 ${sid}`); continue; }

  s.ambiguity = {
    status: 'undetermined',
    distinction: info.distinction,          // department | campus | unknown
    distinction_label: { department: '院系不同', campus: '校区不同', unknown: '院系或校区未定' }[info.distinction],
    note: info.note,
    member_count: info.members.length,
    members: info.members,
    extra_members: info.extra_members || [],
    resolved: false,
    decided_by: info.decided_by,
    recorded_at: '2026-09-28'
  };
  n++;
}

// 同步到 club（便于前端在社团卡片上打角标）
for (const c of clubs.clubs) {
  const s = schools.schools.find(x => x.id === c.school_id);
  if (s && s.ambiguity) {
    c.ambiguity_ref = {
      school_id: s.id,
      distinction: s.ambiguity.distinction,
      note: '与其他社团同属一所院校，院系/校区差异未定'
    };
  } else {
    delete c.ambiguity_ref;
  }
}

schools.count = schools.schools.length;
clubs.count = clubs.clubs.length;
write(path.join(D, 'schools.json'), schools);
write(path.join(D, 'clubs.json'), clubs);

// taxonomy 登记该概念
{
  const t = read(path.join(D, 'taxonomy.json'));
  t.school_club_ambiguity = {
    note: '同一院校下存在多个相关社团时，差异可能来自【院系不同】或【校区不同】。栏目方说明：并非个例，部分院校底下确实有不止一个相关社团。',
    policy: '不强行归并，也不强行推断层级；在 schools[].ambiguity 中记录未定状态，实体各自保持独立。',
    distinction_values: [
      { code: 'department', name_zh: '院系不同' },
      { code: 'campus', name_zh: '校区不同' },
      { code: 'unknown', name_zh: '院系或校区未定' }
    ],
    affected_schools: Object.keys(KNOWN)
  };
  write(path.join(D, 'taxonomy.json'), t);
}

console.log(`已标记 ${n} 所院校的社团归属歧义：`);
for (const [sid, info] of Object.entries(KNOWN)) {
  const s = schools.schools.find(x => x.id === sid);
  console.log(`  ${s.name.padEnd(16)} [${info.distinction}]  ${info.members.length} 个成员`);
}
