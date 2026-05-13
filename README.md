# Online Delivery Plan

> 一个纯前端的「PO 交付计划工作台」：按迭代（Sprint）维度组织活动，自动生成甘特图，支持双计划切换、版本存档、节假日联网同步以及 PNG / JSON 导入导出。


---

## ✨ 功能特性

- **双计划切换**：内置两套独立的计划上下文
  - `项目交付计划`：业务&技术方案对齐 / 功能开发&测试 / 接口联调 / SIT / UAT / 上线 / Showcase 等
  - `第三方集成计划`：方案细化 / 功能开发&测试 / 接口联调 / SIT / Showcase & UAT / 上线 等
- **迭代（Sprint）**：自定义迭代名称与起止日期，作为甘特图时间轴基准
- **行 / 项目维度**：每行对应一个交付项或专题，活动归属到行 + 迭代
- **活动与工期**：活动名称与类型一体化下拉，开始/结束日期使用 `flatpickr` 日期控件，自动校验「结束 ≥ 开始」
- **甘特图渲染**：按活动类型上色，自带图例；时间轴覆盖迭代和活动日期并集
- **节假日联网同步**：通过 [`date.nager.at`](https://date.nager.at) 自动拉取中国大陆法定节假日，在日历、甘特图中高亮（手动标记优先级更高）
- **特殊时间标记**：展会、封版日、里程碑等可叠加到时间轴
- **版本存档**：一键保存当前两套计划快照（最多 40 条），可随时恢复、删除
- **本地持久化**：所有数据以 `localStorage` 形式保存在浏览器中
  - `delivery-plan-workbench-v1`：当前编辑中的两套计划
  - `delivery-plan-snapshots-v1`：历史版本
  - `delivery-plan-cn-holidays-nager-v1`：节假日缓存
- **导入 / 导出**
  - `导出 PNG`：基于 `html2canvas` 截图甘特图区域
  - `导出 / 导入 JSON`：便于跨电脑迁移、备份和团队共享

---

## 📦 项目结构

```text
.
├── index.html        # 页面骨架与表单结构
├── app.js            # 所有交互逻辑、甘特图渲染、节假日同步、导入导出
├── styles.css        # 样式（DM Sans + Noto Sans SC，浅色主题）
├── launch.command    # macOS 双击启动脚本（直接 open index.html）
└── README.md
```

无构建步骤，无后端依赖；外部脚本通过 CDN 引入：

- [flatpickr 4.6.13](https://flatpickr.js.org/) —— 日期选择控件（含中文 l10n）
- [html2canvas 1.4.1](https://html2canvas.hertzen.com/) —— 甘特图 PNG 导出
- Google Fonts：`DM Sans` + `Noto Sans SC`

---

## 🚀 快速开始

### 方式一：直接打开

```bash
git clone https://github.com/your-org/online-delivery-plan.git
cd online-delivery-plan
open index.html        # macOS
# 或在 Windows / Linux 上双击 index.html
```

macOS 用户也可以直接双击仓库根目录的 `launch.command`。

### 方式二：本地静态服务器（推荐）

部分浏览器对 `file://` 的字体、CDN 缓存策略略有差异，建议起一个本地静态服务：

```bash
# 任选其一
python3 -m http.server 5173
npx serve .
```

然后访问 <http://localhost:5173>。

### 方式三：GitHub Pages

仓库本身就是静态站点，可以直接在 GitHub 仓库 `Settings → Pages` 中选择 `main` 分支根目录发布，立即获得在线版本。

---

## 🧭 使用指南

1. 在顶部 Tab 中选择「项目交付计划」或「第三方集成计划」
2. 填写 **计划标题**（例如 `PO17 整体交付计划`）
3. 在 **迭代（Sprint）** 中添加 Sprint 行并填好起止日期
4. 在 **时间标记** 中可点击「同步法定节假日」获取当年节假日，并按需要追加展会 / 封版日等
5. 在 **行 / 项目维度** 中添加交付项 / 集成专题
6. 在 **活动与工期** 中选择所属模块、活动类型，并填写开始 / 结束日期
7. 点击 **刷新甘特图** 即可看到时间轴渲染结果
8. 排完一版后，在「计划版本」处填写说明并 **保存当前版本**，便于回溯
9. 通过头部按钮 **导出 PNG / 导出 JSON** 分享给团队；其他人通过 **导入 JSON** 即可还原计划

> 💡 节假日数据来自 `date.nager.at` 公共接口，调休补班可能未完全覆盖；如有差异，以「特殊时间标记」手动覆盖为准。

---

## 🛠️ 开发说明

- 项目无打包构建，所有逻辑集中在 `app.js`，使用 IIFE 包裹，避免污染全局
- 关键状态：
  - `store.project` / `store.integration`：两套 `PlanState`（标题、迭代、标记、行、任务）
  - `currentPlan`：当前激活的计划上下文
- 主要渲染入口：`renderIterationsTable / renderMarkersTable / renderRowsTable / renderTasksTable / renderGantt`
- 数据写入时机：表单 `change / blur` 后即时 `save()`，刷新无忧
- 自定义活动类型扩展：编辑 `app.js` 中的 `ACTIVITY_TYPES_PROJECT` / `ACTIVITY_TYPES_INTEGRATION` 数组即可

### 数据迁移 / 重置

在浏览器控制台执行：

```js
localStorage.removeItem('delivery-plan-workbench-v1');
localStorage.removeItem('delivery-plan-snapshots-v1');
localStorage.removeItem('delivery-plan-cn-holidays-nager-v1');
location.reload();
```

即可恢复初始状态。

---

## 🌐 浏览器兼容

推荐使用最新版 Chrome / Edge / Safari。需要 ES2018+ 支持（`async/await`、对象展开等）。

---

## 📄 License

MIT
