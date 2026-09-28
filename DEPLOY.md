# 部署到 GitHub Pages

目标地址：**https://hexclear233.github.io/VocaloCollege-nt/**

---

## 一、前置状态

| 项目 | 状态 |
|---|---|
| 站点体积 | **30.7 MB**（GitHub Pages 上限 1 GB，余量充足） |
| 外部依赖 | **无**。全部脚本只用 Node 内置模块，CI 无需 `npm install` |
| 子路径兼容 | **已实测通过**。见下文「四、子路径验证」 |
| 目标仓库 | **尚未创建**（当前返回 404） |

---

## 二、部署步骤

### 1. 创建仓库

在 GitHub 新建仓库，名称必须是 **`VocaloCollege-nt`**
（仓库名决定访问路径；若改名，地址随之变化）。

设为 **Public** —— GitHub Pages 在免费账户下仅支持公开仓库。

> 不要勾选 "Add a README"，保持空仓库，避免首次推送冲突。

### 2. 推送代码

在本目录执行：

```bash
git init
git add .
git commit -m "Initial commit: VocaloCollege 站点"
git branch -M main
git remote add origin https://github.com/HexClear233/VocaloCollege-nt.git
git push -u origin main
```

### 3. 启用 Pages

仓库 → **Settings** → **Pages**：

- **Source** 选择 **GitHub Actions**（不要选 "Deploy from a branch"）

推送后 Actions 会自动运行。首次部署约 1–2 分钟。

### 4. 验证

访问 https://hexclear233.github.io/VocaloCollege-nt/

---

## 三、自动化流程

`main` 分支每次推送都会触发 `.github/workflows/deploy.yml`：

```
数据校验 → 生成统计 → 生成年报 → 同步数据
    → 生成页面 → 打资源版本号 → 产出 dist/
    → 体积检查 → 上传 → 部署
```

其中包含两道**保护性检查**：

1. **体积检查**：若 `dist/` 超过 900 MB 则直接失败（上限 1 GB）
2. **产物检查**：确认 `index.html` / `data/index.json` / `.nojekyll` 存在

都通过才会发布，避免把坏版本推上线。

也可以在仓库 **Actions** 页面手动触发（`workflow_dispatch`）。

---

## 四、子路径验证（已完成）

站点部署在 `/VocaloCollege-nt/` 这样的子路径下，而非域名根目录。
若代码里存在 `/assets/...` 这类**绝对路径**，会指向错误位置。

实测方法：把 `site/` 复制成 `.../VocaloCollege-nt/` 并在此路径下启动服务器，
然后用 `SITE_ROOT` 指向该拷贝跑全部验证。

结果：

```
链接完整性    337 / 337
Phase 2       73 / 73
Phase 3       56 / 56
Phase 4       107 / 107
```

**结论：无需任何路径修改。** 原因是全站资源引用都是相对路径，
且数据加载路径由 `<body data-root>` 推导：

```js
// data.js
var ROOT = document.body.getAttribute('data-root') || '.';
var DATA_BASE = ROOT + '/data';
```

`data-root` 在首页为 `.`，子目录页为 `..`，因此天然适配任意部署路径。

### 复现该方法

```bash
# 1. 造一份子路径拷贝
mkdir -p _subpath_test/VocaloCollege-nt
cp -r site/* _subpath_test/VocaloCollege-nt/

# 2. 在父目录起服务器（使 /VocaloCollege-nt/ 成为子路径）
npx http-server _subpath_test -p 4190 -c-1

# 3. 指向该拷贝跑验证
SITE_ROOT=../_subpath_test/VocaloCollege-nt \
BASE_URL=http://127.0.0.1:4190/VocaloCollege-nt \
node scripts/verify_links.js
```

---

## 五、日常更新

### 数据更新（改 `data/` 后）

```bash
npm run build        # 校验 → 统计 → 年报 → 同步 → 生成页面 → 打版本号
git add -A && git commit -m "更新数据" && git push
```

推送即自动重新部署。

### 只改样式或脚本

```bash
npm run pages        # 重新生成页面（会刷新资源版本号）
git add -A && git commit -m "调整样式" && git push
```

资源版本号会自动变化，用户浏览器强制拉取新资源（见 `scripts/build_version.js`）。

---

## 六、重要注意事项

### ① 音频未包含（约 466 MB）

源站提供 68 个 MP3，共 **466 MB**。
[GitHub Pages 限制](https://docs.github.com/en/pages/getting-started-with-github-pages/github-pages-limits)
规定已发布站点不得大于 **1 GB**，全量音频会占掉一半配额。

**当前方案**：作品卡不内置播放器，仅保留跳转 B 站的链接。

`.gitignore` 已排除音频目录，避免误推。若将来要启用，建议顺序：

1. 用 ffmpeg 压缩为 **96 kbps 单声道**（约 2–3 MB/首，总计约 150 MB）
2. 或只收录 **SP 与 OC 作品**（约 40 首）
3. 或只保留 **30–40 秒试听片段**（约 500 KB/首，总计约 35 MB）

### ② `dist/` 不入库

`dist/` 是 `scripts/build_site.js` 生成的发布产物，已在 `.gitignore` 中排除。
CI 会在每次部署时重新生成，避免仓库里存两份 30 MB 副本。

### ③ B 站数据不入库

`data/bilibili_stats.json`（播放/点赞等）已在 `.gitignore` 中排除。

栏目决定是**采集但不展示**：它不属于站点运行所需，也不应进入公开仓库，
以免被误用为「作品热度排行」——那与方案十九「不做实力排行榜」相冲突。

### ④ 若仓库改为非 `VocaloCollege-nt` 名称

访问路径会变成 `https://hexclear233.github.io/<仓库名>/`。
站点本身无需修改（全部是相对路径），但本文档与 README 中的链接需要同步更新。

### ⑤ 自定义域名（可选）

若要绑定自己的域名：

1. 在 `site/` 下新建 `CNAME` 文件，内容为域名（如 `vocalocollege.example.com`）
2. 在域名服务商添加 CNAME 记录指向 `hexclear233.github.io`
3. 仓库 Settings → Pages → Custom domain 填入域名并勾选 Enforce HTTPS

`build_site.js` 会把 `site/CNAME` 一并复制到 `dist/`。

---

## 七、故障排查

| 现象 | 原因与处理 |
|---|---|
| Actions 报 `validate.js` 失败 | 数据有问题。本地跑 `npm run data:validate` 看具体错误 |
| 页面 404 | 确认 Pages 的 Source 选的是 **GitHub Actions**，不是分支部署 |
| 样式全部丢失 | 检查 `dist/.nojekyll` 是否存在（Jekyll 会忽略下划线开头文件） |
| 部署成功但内容陈旧 | 浏览器缓存。资源已带 `?v=` 版本号，强制刷新一次即可 |
| Actions 体积检查失败 | 站点超过 900 MB。检查是否误把音频或 `node_modules` 推了上去 |
| 数据与页面不一致 | 改完 `data/` 后忘记跑 `npm run build`。`verify_sync.js` 会拦截这种情况 |

---

## 八、回滚

GitHub Pages 部署是原子的。要回滚只需还原提交：

```bash
git revert <问题提交的 SHA>
git push
```

Actions 会自动重新部署到上一个正常状态。
也可在 Actions 页面找到历史成功运行，点 **Re-run all jobs** 重新发布。
