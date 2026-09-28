// scripts/fetch_bilibili.js — Bilibili 平台数据采集（方案 6.2）
//
// ⚠️ 重要设计约束（栏目方 2026-09-28 决定：采集但不展示）
//   1. 采集结果写入 data/bilibili_stats.json —— 与 statistics.json 完全分离
//   2. 网站**不加载、不展示、不排序、不聚合**该文件
//   3. 不含任何排名逻辑；不写入 works.json / statistics.json
//   4. 目的是留档，供将来研究或人工参考，不参与任何评价
//
// 方案 6.2 明确：采用「定时采集 → 数据处理 → JSON → 网站」，
// 而非「浏览器 → Bilibili API」（因 API 限制、频率、CORS、接口变化）。
//
// 用法：
//   node scripts/fetch_bilibili.js              # 采集（默认 1.2s 间隔）
//   node scripts/fetch_bilibili.js --dry-run    # 只列出将要采集的 BV，不发请求
//   node scripts/fetch_bilibili.js --limit 5    # 只采前 5 条（调试用）
//   node scripts/fetch_bilibili.js --force      # 忽略缓存，全部重采
//
// 网络失败不会中断整体流程：失败的条目记入 errors，保留上次成功值。
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const D = path.join(ROOT, 'data');
const CACHE = path.join(D, 'bilibili_stats.json');
const CACHE_DIR = path.join(D, '.bilibili-cache');

const args = process.argv.slice(2);
const DRY = args.includes('--dry-run');
const FORCE = args.includes('--force');
const LIMIT = (() => {
  const i = args.indexOf('--limit');
  return i >= 0 ? parseInt(args[i + 1], 10) : 0;
})();
const INTERVAL = (() => {
  const i = args.indexOf('--interval');
  return i >= 0 ? parseInt(args[i + 1], 10) : 1200;
})();

const read = (p) => JSON.parse(fs.readFileSync(p, 'utf8'));
const write = (p, o) => fs.writeFileSync(p, JSON.stringify(o, null, 2) + '\n', 'utf8');

// ---------------------------------------------------------------- 收集目标 BV
const index = read(path.join(D, 'index.json'));
const bvs = new Map(); // bvid -> { edition_id, work_ids: [] }
for (const e of index.editions) {
  const ed = read(path.join(ROOT, e.file));
  for (const w of ed.works) {
    const bv = w.bilibili && w.bilibili.bvid;
    if (!bv) continue;
    if (!bvs.has(bv)) bvs.set(bv, { bvid: bv, edition_id: e.id, work_ids: [] });
    bvs.get(bv).work_ids.push(w.id);
  }
}
let targets = [...bvs.values()];
if (LIMIT > 0) targets = targets.slice(0, LIMIT);

console.log('Bilibili 采集');
console.log('  目标 BV 数   ' + targets.length + (LIMIT ? '（--limit ' + LIMIT + '）' : ''));
console.log('  请求间隔     ' + INTERVAL + ' ms');
console.log('  模式         ' + (DRY ? 'dry-run（不发请求）' : FORCE ? 'force（忽略缓存）' : '增量'));

if (DRY) {
  targets.slice(0, 20).forEach((t) => console.log('    ' + t.bvid + '  [' + t.edition_id + ']'));
  if (targets.length > 20) console.log('    ... 共 ' + targets.length + ' 条');
  process.exit(0);
}

// ---------------------------------------------------------------- 缓存与已有结果
fs.mkdirSync(CACHE_DIR, { recursive: true });

const prev = fs.existsSync(CACHE) ? read(CACHE) : null;
const prevMap = new Map();
if (prev && Array.isArray(prev.items)) {
  prev.items.forEach((it) => prevMap.set(it.bvid, it));
}

const today = new Date().toISOString().slice(0, 10);

/** 单条采集：调用 Bilibili 公开 view API */
async function fetchOne(bvid) {
  const url = 'https://api.bilibili.com/x/web-interface/view?bvid=' + encodeURIComponent(bvid);
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 10000);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: {
        // 使用常见浏览器 UA；B站对默认 UA 可能拒绝
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
                      '(KHTML, like Gecko) Chrome/124.0 Safari/537.36',
        'Referer': 'https://www.bilibili.com/'
      }
    });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const json = await res.json();
    if (json.code !== 0) throw new Error('API code ' + json.code + ' ' + (json.message || ''));
    const d = json.data || {};
    const st = d.stat || {};
    return {
      ok: true,
      data: {
        bvid,
        title: d.title || null,
        owner: d.owner ? d.owner.name : null,
        owner_mid: d.owner ? d.owner.mid : null,
        pubdate: d.pubdate || null,
        duration: d.duration || null,
        view: st.view != null ? st.view : null,
        danmaku: st.danmaku != null ? st.danmaku : null,
        reply: st.reply != null ? st.reply : null,
        favorite: st.favorite != null ? st.favorite : null,
        coin: st.coin != null ? st.coin : null,
        share: st.share != null ? st.share : null,
        like: st.like != null ? st.like : null,
        fetched_at: new Date().toISOString()
      }
    };
  } catch (e) {
    return { ok: false, error: String(e && e.message || e) };
  } finally {
    clearTimeout(timer);
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async function main() {
  const items = [];
  const errors = [];
  let fetched = 0, cached = 0;

  for (let i = 0; i < targets.length; i++) {
    const t = targets[i];
    const old = prevMap.get(t.bvid);

    // 增量：当天已成功采集过则跳过（除非 --force）
    if (!FORCE && old && old.ok && (old.fetched_at || '').slice(0, 10) === today) {
      items.push(Object.assign({}, old, { work_ids: t.work_ids, edition_id: t.edition_id }));
      cached++;
      continue;
    }

    const r = await fetchOne(t.bvid);
    if (r.ok) {
      items.push(Object.assign(r.data, { work_ids: t.work_ids, edition_id: t.edition_id, ok: true }));
      fetched++;
      process.stdout.write('  [' + (i + 1) + '/' + targets.length + '] ' + t.bvid + ' OK' +
        '  view=' + r.data.view + '\n');
    } else {
      // 保留上次成功值（若有），同时记录本次错误
      if (old && old.ok) {
        items.push(Object.assign({}, old, {
          work_ids: t.work_ids, edition_id: t.edition_id,
          last_error: r.error, last_attempt_at: new Date().toISOString()
        }));
      } else {
        items.push({ bvid: t.bvid, edition_id: t.edition_id, work_ids: t.work_ids,
                     ok: false, error: r.error, fetched_at: new Date().toISOString() });
      }
      errors.push({ bvid: t.bvid, error: r.error });
      process.stdout.write('  [' + (i + 1) + '/' + targets.length + '] ' + t.bvid + ' FAIL  ' + r.error + '\n');
    }

    if (i < targets.length - 1) await sleep(INTERVAL);
  }

  const okItems = items.filter((x) => x.ok && x.view != null);

  const out = {
    schema: 'vocalocollege/bilibili-stats/1.0',
    generated_at: new Date().toISOString(),
    generated_date: today,
    source: 'Bilibili public web-interface API',
    // 这一段会被网站忽略，但写清楚用途以免后人误用
    notice: [
      '本文件为 Bilibili 平台数据的留档，与 VocaloCollege 自有统计完全分离。',
      '网站不加载、不展示、不排序、不聚合本文件。',
      '平台指标受推荐算法、时间累积、粉丝基数等因素影响，不能反映作品质量。',
      '严禁用于任何形式的排名、评比或「实力」判断。'
    ],
    policy: {
      displayed_on_site: false,
      used_in_rankings: false,
      merged_into_statistics: false
    },
    fetch_summary: {
      targets: targets.length,
      fetched,
      from_cache: cached,
      succeeded: okItems.length,
      failed: errors.length
    },
    errors,
    items
  };

  write(CACHE, out);

  console.log('\n采集完成');
  console.log('  新采集    ' + fetched);
  console.log('  用缓存    ' + cached);
  console.log('  成功      ' + okItems.length + ' / ' + targets.length);
  console.log('  失败      ' + errors.length);
  if (errors.length) {
    console.log('  失败样例：');
    errors.slice(0, 5).forEach((e) => console.log('    ' + e.bvid + '  ' + e.error));
  }
  console.log('\n写入 ' + path.relative(ROOT, CACHE));
  console.log('提醒：该文件不会被网站加载，仅作留档。');
})();
