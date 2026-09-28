// scripts/build_all.js — 一键完整构建流水线
//
// 对应方案十三的流程：
//   获取数据 → 清洗 → 生成 JSON → 重新统计 → Build → Deploy
// 本脚本覆盖「重新统计 → Build」部分；数据获取（B站）为可选独立步骤。
//
// 用法：
//   node scripts/build_all.js                 # 统计 + 快照 + 年报 + 同步 + 生成页面
//   node scripts/build_all.js --no-verify     # 跳过校验（构建更快）
//   node scripts/build_all.js --with-bilibili # 额外采集 B 站数据（默认不采）
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const NODE = process.execPath;
const args = process.argv.slice(2);
const SKIP_VERIFY = args.includes('--no-verify');
const WITH_BILI = args.includes('--with-bilibili');

const steps = [
  { name: '数据校验',        script: 'validate.js',            always: true },
  { name: '生成统计',        script: 'build_statistics.js',    always: true },
  { name: '保存快照',        script: 'snapshot.js',            always: true },
  { name: '生成年度报告',    script: 'build_annual_report.js', always: true },
  { name: '同步数据到站点',  script: 'sync_data.js',           always: true },
  { name: '生成期页面',      script: 'gen_edition_pages.js',   always: true },
  { name: '生成其他页面',    script: 'gen_phase2_pages.js',    always: true },
  // 必须在所有生成器之后：给手写页面的资源引用补 ?v=，保证全站缓存失效一致
  { name: '资源版本号',      script: 'stamp_assets.js',        always: true },
  // 收尾自检：确认 site/data/ 与 data/ 完全一致
  // （曾因直接改 data/ 未重新同步，导致页面显示旧数据）
  { name: '校验数据同步',    script: 'verify_sync.js',         always: true }
];

if (WITH_BILI) {
  steps.splice(1, 0, { name: '采集 B 站数据', script: 'fetch_bilibili.js', always: true });
}

const t0 = Date.now();
let failed = 0;

console.log('='.repeat(66));
console.log('VocaloCollege 构建流水线');
console.log('='.repeat(66) + '\n');

for (const s of steps) {
  const p = path.join(__dirname, s.script);
  if (!fs.existsSync(p)) {
    console.log('[跳过] ' + s.name + '（缺少 ' + s.script + '）');
    continue;
  }
  process.stdout.write('[执行] ' + s.name + ' ... ');
  const start = Date.now();
  try {
    const out = execFileSync(NODE, [p], { cwd: ROOT, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
    const ms = Date.now() - start;
    console.log('完成 (' + ms + 'ms)');
    // 只回显脚本输出的前几行关键信息，保持流水线日志简洁
    const lines = out.trim().split('\n').filter(Boolean);
    if (lines.length && lines.length <= 12) {
      lines.forEach((l) => console.log('        ' + l));
    } else if (lines.length) {
      lines.slice(0, 6).forEach((l) => console.log('        ' + l));
      console.log('        ... 另有 ' + (lines.length - 6) + ' 行');
    }
  } catch (e) {
    console.log('失败');
    const msg = (e.stdout || '') + (e.stderr || '');
    console.log(msg.split('\n').slice(0, 30).map((l) => '        ' + l).join('\n'));
    failed++;
    break;   // 前置步骤失败则中止，避免产出不一致
  }
}

console.log('\n' + '='.repeat(66));
if (failed) {
  console.log('构建中止：有步骤失败');
  process.exit(1);
}

// ---------------------------------------------------------------- 收尾校验
if (!SKIP_VERIFY) {
  console.log('构建完成，运行回归验证 ...\n');
  const verifiers = fs.readdirSync(__dirname)
    .filter((f) => /^verify_.*\.js$/.test(f))
    .sort();
  const needsServer = verifiers.filter((f) => f !== 'verify_charts.js' ? true : true);

  console.log('可用的验证脚本（需要本地静态服务器）：');
  verifiers.forEach((f) => console.log('  node scripts/' + f));
  console.log('\n提示：先启动服务器再运行上述验证，例如：');
  console.log('  npx http-server site -p 4181 -c-1');
  console.log('  BASE_URL=http://127.0.0.1:4181 node scripts/verify_p2.js');
}

console.log('\n总耗时 ' + ((Date.now() - t0) / 1000).toFixed(1) + ' 秒');
console.log('站点目录：site/');
