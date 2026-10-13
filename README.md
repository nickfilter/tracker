# ClickDealer 联盟归因系统 · Render + PostgreSQL 版

部署到 [Render](https://render.com) 的完整联盟归因系统：**Node Web Service + 托管 PostgreSQL**。
Render 对外部服务器回调友好，ClickDealer 的 postback、广告落地页、后台管理全部正常工作。

**技术栈**：Express 4 + PostgreSQL(pg) + Node 20，支持 Blueprint 一键部署或 Docker 部署。

---

## 功能一览

- 📄 图文长文落地页（`**加粗**`、`img:URL` 行内图）+ 图文弹窗（CTA → 弹窗 → 跳转目标）
- 🎨 **GrapesJS 可视化编辑**：后台拖拽搭建落地页，5 个内置「归因组件」区块，按钮链接填 `GO` 自动跳 Offer，保存即生效、可无损再次编辑
- ⏳ **内置 Loading 过渡页**：进度环 + 倒计时自动跳转，广告点击先暖场再进 Offer，参数全量透传
- 🔗 `/go` 点击登记 + 302 跳 ClickDealer（URL 带 `s2=点击ID`，**UTM/gclid/gad_*/ttclid 全量透传**）
- 📥 `/postback` 接收联盟回传：**立即返回 JSON**，处理逻辑异步执行（联盟不超时）
  - 加 `?format=gif` 或 `?gif=1` 可切回 **1x1 GIF**（兼容 `<img>` 像素回传）
  - 超过 `POSTBACK_TIMEOUT_MS`（默认 8000ms）未处理完 → 返回 **202 Accepted** + `async:true`
- 📘 **Facebook CAPI**：`event_id = txid` 去重；`fbc/fbp/ip/ua` 归因；邮箱/电话 SHA-256 进 `user_data`
- 📗 **Google 增强转化**：`uploadClickConversions` + `userIdentifiers`（base64 哈希邮箱/电话）
- 🧩 三方统计宏回传（`{clickid}` `{payout}` `{txid}` `{offer}` `{source}` `{country}`）
- 🛠 后台：统计概览 / 三方统计 / 国家日报表 / 实时数据(5s 自动刷新 + FB·G 回写状态) / Offer 管理 / 系统配置(含 CAPI 自检) / 修改密码
- 💾 **一键数据备份**：后台 `/admin/backup` 一键下载 **JSON / CSV(zip) / SQL** 三种格式，默认自动**脱敏**密钥与密码哈希
- 📜 隐私政策 + 服务条款页（符合 FB/Google 广告政策）
- 🩺 数据库连接失败时返回**中文排障页**（当前配置 + 修复步骤）

---

## 一、目录结构

```
clickdealer-render/
├── src/
│   ├── server.js      # 入口：监听 Render 注入的 PORT
│   ├── app.js         # 全部路由（Express）+ 数据库排障页
│   ├── db.js          # PostgreSQL 连接池 + 建表 + 种子 + 迁移
│   ├── config.js      # 配置合并（环境变量 > DB settings > 默认值）
│   ├── security.js    # PBKDF2 密码 / HMAC 会话 / PII 哈希
│   ├── trackers.js    # /go、/postback、FB CAPI、Google 增强、三方宏、CAPI 自检
│   ├── backup.js      # 备份序列化：CSV（BOM/转义）+ SQL（TRUNCATE/INSERT/setval）
│   ├── zip.js         # 零依赖 ZIP 打包（CRC32 + deflateRaw，供 CSV 批量下载）
│   ├── pages.js       # 公开落地页 / Loading 过渡页 / hub / 隐私 / 条款
│   └── views.js       # 后台管理 HTML + GrapesJS 编辑器页 + 备份页
├── tests/             # 5 个端到端测试套件（共 229 项断言）
├── render.yaml        # Blueprint：自动建 Web Service + Postgres 并注入 DATABASE_URL
├── Dockerfile         # 可选：Docker 方式部署
├── .env.example       # 全部环境变量清单（按代码真实变量名逐项注释）
├── package.json
└── README.md
```

---

## 二、部署方式 A：Blueprint 一键部署（推荐）

1. 把本项目推到 GitHub / GitLab 仓库。
2. Render Dashboard → **New → Blueprint** → 选择仓库 → Apply。
   Render 会按 `render.yaml` 自动创建：
   - Web Service（Node 20，`npm install` + `node src/server.js`）
   - PostgreSQL 数据库（`clickdealer-db`）
   - 环境变量 `DATABASE_URL`、`SESSION_SECRET`（自动生成）
3. 部署时在面板**填入 `ADMIN_PASSWORD`**（render.yaml 里标记为 sync:false 的变量都要填，如 `FB_PIXEL_ID`、`FB_ACCESS_TOKEN`，可先留空后续补）。
4. 部署完成后访问 `https://你的服务.onrender.com/admin/init-db` 建表 → `/admin` 登录。

## 三、部署方式 B：手动创建

1. Render Dashboard → **New → PostgreSQL** 创建数据库（免费层 90 天过期，仅测试用；生产用 `basic-256mb` 及以上）。
2. 复制数据库的 **Internal Database URL**（形如 `postgres://user:pass@dpg-xxxx-a/clickdealer`）。
3. **New → Web Service** → 连接仓库：
   - Runtime: **Node** · Build: `npm install` · Start: `node src/server.js`
   - Environment 添加：`DATABASE_URL=<Internal Database URL>`
4. 其余环境变量（服务 → Environment）：

| 变量 | 必填 | 说明 |
| --- | --- | --- |
| `DATABASE_URL` | ✅ | Postgres 连接串（Blueprint 自动注入） |
| `ADMIN_USERNAME` | | 默认 `admin` |
| `ADMIN_PASSWORD` | ✅ | 后台登录密码 |
| `SESSION_SECRET` | ✅(Blueprint 自动生成) | 会话签名密钥 |
| `COOKIE_SECURE` | | HTTPS 下默认 `1` |
| `FB_PIXEL_ID` / `FB_ACCESS_TOKEN` / `FB_API_VERSION` / `FB_TEST_EVENT_CODE` | | FB CAPI |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` / `GOOGLE_REFRESH_TOKEN` / `GOOGLE_DEVELOPER_TOKEN` / `GOOGLE_CUSTOMER_ID` / `GOOGLE_CONVERSION_ACTION_ID` | | Google Ads 离线转化 |
| `GA_TAG_ID` / `BASE_URL` / `SITE_NAME` / `COMPANY_NAME` / `CONTACT_EMAIL` / `COMPANY_ADDRESS` | | 可选，也可后台在线改 |

5. 部署 → 访问 `/admin/init-db` → `/admin` 登录。

> 也可用 **Docker 方式**部署（仓库已带 Dockerfile）：New → Web Service → Runtime 选 Docker。

---

## 四、接入 ClickDealer

1. **Global Postback URL**：
   ```
   https://你的服务.onrender.com/postback?cid=#s2#&payout=#price#&txid=#txid#
   ```
2. 广告指向落地页：
   ```
   https://你的服务.onrender.com/p/<slug>
   ```
   流程：广告 → `/p/<slug>` → CTA → 弹窗 → `/go?offer=<slug>`（登记点击）→ 302 跳 ClickDealer → 转化后回调 `/postback` → 系统回写 FB CAPI / Google。

---

## 五、🎨 GrapesJS 可视化编辑

后台 **Offer 管理 → 🎨 可视化**：

- 拖拽模块排版，右侧调样式，双击改文字
- 按钮/链接 `href` 填 **`GO`** → 自动跳 `/go?offer=<slug>&<原始参数>`（fbclid/gclid/UTM 全量透传，不丢归因）
- FB Pixel / GA 自动注入；project JSON 保存，可无损继续编辑；每 30s 自动暂存
- 清空画布保存 → 回落默认图文模板

### 内置「归因组件」区块（左侧区块面板）

| 区块 | 说明 |
| --- | --- |
| 🎯 GO 跳转按钮 | 已绑定 `href="GO"` 的橙色 CTA，拖入即用，无需手填链接 |
| 📧 邮箱留资表单 | 提交后 POST `/api/lead` 写入线索（下次 postback 自动带上 em/ph），随即跳转 Offer |
| ⏳ 加载进度条 | 带百分比数字的动画进度条，点击 GO 前做心理铺垫 |
| 🛡️ 信任徽章 | 「安全支付 / 30天退款 / 限时优惠」三枚徽章 |
| ⚙️ 归因跳转脚本 | 手动放置的参数替换脚本锚点（一般无需使用） |

顶部栏还有 4 个一键插入按钮：**＋GO 按钮 / ＋留资表单 / ＋进度条 / ＋Loading 模板**，会插入到当前选中的容器（未选中则追加到页面末尾）。

### 链接里可用的跟踪宏

| 写法 | 运行结果 |
| --- | --- |
| `href="GO"` | 替换为 `/go?offer=<slug>&<当前页全部参数>` |
| `data-go` 属性 | 同上（作用于任意元素） |
| `data-loading-text="处理中…"` | 点击 GO 按钮后短暂显示的过渡文案 |

---

## 六、⏳ 内置 Loading 过渡页

后台 **Offer 管理 → 编辑 → 落地页模式 → Loading 过渡页**。

适用场景：广告点击后先落一个暖场过渡页（点亮像素、降低跳出），倒计时结束自动跳转 Offer。

| 参数 | 说明 |
| --- | --- |
| 模式 | `默认图文模板` / `⏳ Loading 过渡页` / `🎨 可视化自定义页` |
| Loading 倒计时秒数 | 1–15 秒，默认 3 秒 |
| Loading 页提示文案 | 留空用默认「正在为你准备专属优惠，请稍候…」 |

页面特性：

- 圆形进度环 + 百分比数字 + 横向进度条，三段分步文案（校验资格 → 锁定名额 → 准备结账）
- 倒计时结束自动 `location.href` 跳转 `/go`，**全量透传 fbclid/gclid/UTM/ttclid 等参数**
- 若被浏览器拦截未跳走，3 秒后显示「立即前往 →」手动兜底按钮
- 自动注入 FB Pixel / GA 统计代码（与其它模板一致）

> 落地页模式的优先级：**Loading 模式 > 有自定义内容（渲染自定义页）> 默认图文模板**。
> 旧数据（没设 `landing_mode` 但有 `custom_html`）仍按自定义页渲染，行为向后兼容。

---

## 七、报错排查：数据库连接失败

页面会直接显示中文排障页。常见原因：

| 错误码 | 原因 | 修复 |
| --- | --- | --- |
| `DATABASE_URL 未设置` | 没配连接串 | 按方式 B 第 2-3 步 |
| `ECONNREFUSED` | 地址不对/数据库休眠 | 用 **Internal** Database URL；确认 Web Service 与数据库同 Region |
| `28P01` | 用户名密码错误 | 重新复制 Internal Database URL |
| `3D000` | 库名不存在 | 检查连接串末尾数据库名 |

> Render 免费版 Web Service 15 分钟无流量会休眠，首个请求慢几秒——收 postback 的服务建议至少用 starter。

---

## 八、本地开发 / 自测

```bash
# 1. 起本地 Postgres
docker run -d --name cd-pg -e POSTGRES_PASSWORD=test123 \
  -e POSTGRES_DB=clickdealer -p 5432:5432 postgres:16-alpine

# 2. 装依赖 + 起服务
npm install
DATABASE_URL='postgres://postgres:test123@127.0.0.1:5432/clickdealer' \
PORT=8099 SESSION_SECRET=devsecret ADMIN_PASSWORD=admin123 COOKIE_SECURE=0 \
node src/server.js

# 3. 浏览器打开 http://127.0.0.1:8099/admin/init-db → 再进 /admin
```

也支持拆分变量（不用 DATABASE_URL）：`DB_HOST / DB_PORT / DB_USER / DB_PASSWORD / DB_NAME / DB_SSL`。

全部可用环境变量（含 FB / Google / 站点信息 / 法务页字段）见仓库根目录 **`.env.example`**，已按代码里的真实变量名逐项列出并加注释。

### postback 返回格式

| 场景 | 状态码 | 响应 |
| --- | --- | --- |
| 默认（处理成功） | 200 | `{"ok":true,"click_id":"…","txid":"…","payout":12.34,"status":1,"conversion_id":7,"fb_sent":false,"g_sent":false,"third_party_sent":false,"elapsed_ms":3}` |
| 重复 txid（幂等） | 200 | `{"ok":false,"dup":true,"code":"DUPLICATE_TXID","hint":"txid=… 已处理过…"}` |
| 缺少 cid | 400 | `{"ok":false,"error":"missing cid","hint":"需要 cid / click_id / s2 之一"}` |
| 未找到点击 | 200 | `{"ok":false,"code":"UNKNOWN_CLICK_ID","hint":"未找到 cid=… 对应的点击记录"}` |
| 处理超时 | 202 | `{"ok":true,"accepted":true,"async":true,…}` |
| `?format=gif` / `?gif=1` | 200 | **1x1 GIF**（`image/gif`，用于像素回传） |

> 幂等：同一 `txid` 重复回调只写入一条转化，返回 `ok:false` + `code:DUPLICATE_TXID`，联盟侧可据此判断是否已计费。
> 异步：`processPostback` 与响应解耦——即使下游 FB/Google 接口慢，联盟也不会拿到 5xx。

### 一键数据备份（`/admin/backup`）

后台「💾 数据备份」页显示各表数据量，并提供三种下载格式：

| 格式 | 内容 | 用途 |
| --- | --- | --- |
| **JSON** | 全表结构化数组 + `meta`（导出时间/版本/表计数） | 程序化迁移、二次处理 |
| **CSV (zip)** | 每表一个 `.csv`（UTF-8 BOM，Excel 直开）+ `meta.json` + `README.txt` | 人工查看、导入表格软件 |
| **SQL** | `TRUNCATE … RESTART IDENTITY CASCADE` + `INSERT` + `setval(...)` | 在新库一键重放恢复 |

- 默认**脱敏**：`users.password_hash / salt` 掩码；`settings.global` 里的 `*_TOKEN / *_SECRET / *_PASSWORD / CLIENT_SECRET / DEVELOPER_TOKEN` 等递归掩码
- 需要原始数据（含明文密钥）时加 `?mask=0`（**仅限内网/本地**，公网慎用）
- 导出为流式分表查询，单表上限 20 万行，避免内存打爆

### 已通过的自动化测试（真实 PostgreSQL 环境，共 **229 项**）

| 测试 | 项数 | 覆盖 |
| --- | --- | --- |
| `test_wxcloud.js` | 39 | 登录/鉴权/配置/点击/Postback(JSON)/线索/报表/404 全流程 |
| `test_builder.js` | 21 | GrapesJS 保存·恢复·清空回落·自定义页渲染·未登录 401 |
| `test_wx_fb.js` | 9 | FB CAPI 字段（event_id/fbc/fbp/ip/ua/em hash）+ Google 增强转化 |
| `test_features3.js` | 65 | **参数全量透传** · **归因组件区块** · **Loading 过渡页** · 模式优先级回归 |
| `test_backup.js` | 95 | 备份页/JSON/CSV/SQL 三格式 · 密钥脱敏 · 鉴权 · SQL 真实重放 · postback JSON 全分支 |

```bash
# 跑测试（需服务已在 8099 端口运行）
node tests/test_wxcloud.js && node tests/test_builder.js && node tests/test_wx_fb.js \
  && node tests/test_features3.js && node tests/test_backup.js
```

---

## 九、与之前版本的差异

| 项 | 微信云托管 | **Render（本版）** |
| --- | --- | --- |
| 运行形态 | 容器 | Web Service（Node/Docker 均可） |
| 数据库 | MySQL | **PostgreSQL**（`DATABASE_URL` 注入） |
| 一键部署 | 无 | **render.yaml Blueprint**（自动建库+注入连接串） |
| 收外部 postback | ✅ | ✅ |

归因逻辑、FB/Google 回写、图文落地页、GrapesJS 编辑器、后台功能**完全一致**。
