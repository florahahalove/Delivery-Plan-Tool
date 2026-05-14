# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 项目概述

A pure front-end PO delivery plan workbench (交付计划工作台). No build steps, no framework, no backend. All logic lives in a single `app.js` (~1800 lines, IIFE-wrapped). External libraries (flatpickr, html2canvas) are loaded via CDN.

## 启动方式

```bash
# 直接打开
open index.html

# 或本地静态服务器
python3 -m http.server 5173
# 访问 http://localhost:5173
```

双击 `launch.command` 也可在 macOS 上直接打开。

## 代码架构

### 数据模型

两个独立的计划上下文，存储在 `store.project` 和 `store.integration`，通过 `currentPlan`（`"project"` | `"integration"`）切换。每个计划包含：

- `title` — 计划标题
- `iterations[]` — `{ id, name, start (YYYY-MM-DD), end }`
- `markers[]` — `{ id, label, date }`（特殊时间标记，如展会、封版日）
- `rows[]` — `{ id, name }`（交付项/专题）
- `tasks[]` — `{ id, rowId, name, type, start, end }`

`type` 决定甘特条颜色：`plan` / `dev` / `integ` / `sit` / `uat` / `live` / `show` / `integ_show` / `other`。

### localStorage 持久化

| Key | 内容 |
|-----|------|
| `delivery-plan-workbench-v1` | 当前两套计划 `store` |
| `delivery-plan-snapshots-v1` | 版本快照列表（最多 40 条） |
| `delivery-plan-cn-holidays-nager-v1` | 中国法定节假日缓存 |

数据在表单 `change`/`blur` 后即时 `save()` 写入 localStorage。

### 关键函数（app.js）

**状态与工具**：`getState()` 返回当前激活的计划对象。`uid()` 生成随机 ID。`parseYmd(s)` 将 `YYYY-MM-DD` 字符串解析为本地 Date。

**渲染入口**（每次数据变更时调用）：
- `renderIterationsTable()` — 迭代表格
- `renderMarkersTable()` — 时间标记表格
- `renderRowsTable()` — 行/项目维度表格
- `renderTasksTable()` — 活动表格
- `renderGantt()` — 甘特图（核心渲染，含时间轴、节假日条、甘特条、泳道堆叠）
- `renderSnapshotsTable()` — 版本快照列表
- `renderLegend()` — 甘特图图例

**甘特图**：`renderGantt()` 调用 `computeRange()` 计算时间范围（迭代与活动日期的并集），通过百分比定位甘特条。节假日通过 `buildCnHolidayBands()` 渲染为半透明斜纹背景。甘特条泳道堆叠由 `assignGanttTaskLanes()` 和 `layoutGanttLaneStacking()` 处理。标签自适应由 `fitGanttBarLabels()` 处理。

**计划切换**：`switchPlan(plan)` 保存当前计划的标题到 store，切换 `currentPlan`，重新渲染所有 UI。

**导入/导出**：
- `exportGanttPng()` — 基于 html2canvas，克隆甘特面板到离屏 DOM 后截图
- JSON 导出 — 直接序列化 `store` 对象
- JSON 导入 — 读取文件，merge 到 defaultPlanState 后覆盖 store

**节假日同步**：`ensureCnHolidaysLoaded()` / `forceRefreshCnHolidays()` 从 `date.nager.at` API 拉取中国大陆法定节假日，缓存到 localStorage。节假日显示在日历控件和甘特图中。

**版本快照**：`saveSnapshotVersion()` 同时保存两套计划，`restoreSnapshotVersion(id)` 恢复，`deleteSnapshotVersion(id)` 删除。

### 自定义活动类型

编辑 `ACTIVITY_TYPES_PROJECT` 和 `ACTIVITY_TYPES_INTEGRATION` 数组（`app.js:9-37`）即可。每个条目 `{ value, label }`，`value` 映射到 CSS 变量 `--bar-{value}` 控制甘特条颜色。

### 样式

`styles.css` 使用 CSS 自定义属性（`--bg`, `--surface`, `--accent`, `--bar-dev`, `--bar-live` 等）定义浅色主题。字体：DM Sans + Noto Sans SC。
