(function () {
  "use strict";

  const PLAN_STORAGE_KEY = "delivery-plan-workbench-v1";
  const STRATEGY_STORAGE_KEY = "delivery-plan-branch-strategy-v1";

  const DEFAULT_BRANCHES = {
    devBranch: "master",
    qaBranch: "QA",
    uatBranch: "UAT",
    releaseBranch: "release",
  };

  const DEFAULT_ENVS = {
    devEnv: "开发环境",
    qaEnv: "测试环境",
    uatEnv: "UAT环境",
    releaseEnv: "生产环境",
  };

  const FIELD_LABELS = {
    devBranch: "开发分支",
    qaBranch: "QA 分支",
    uatBranch: "UAT 分支",
    releaseBranch: "release 分支",
    devEnv: "开发环境",
    qaEnv: "测试环境",
    uatEnv: "UAT 环境",
    releaseEnv: "生产环境",
    devStart: "开发开始时间",
    devEnd: "开发结束时间",
    qaStart: "测试开始时间",
    qaEnd: "测试结束时间",
    uatStart: "UAT开始时间",
    uatEnd: "UAT结束时间",
    releaseStart: "生产开始时间",
    releaseEnd: "生产结束时间",
  };

  const ENV_PHASES = {
    plan: { key: "dev", label: "开发", envField: "devEnv", branchField: "devBranch" },
    dev: { key: "dev", label: "开发", envField: "devEnv", branchField: "devBranch" },
    other: { key: "dev", label: "开发", envField: "devEnv", branchField: "devBranch" },
    integ: { key: "qa", label: "测试", envField: "qaEnv", branchField: "qaBranch" },
    sit: { key: "qa", label: "测试", envField: "qaEnv", branchField: "qaBranch" },
    uat: { key: "uat", label: "UAT", envField: "uatEnv", branchField: "uatBranch" },
    show: { key: "uat", label: "UAT", envField: "uatEnv", branchField: "uatBranch" },
    integ_show: { key: "uat", label: "UAT", envField: "uatEnv", branchField: "uatBranch" },
    live: {
      key: "release",
      label: "生产",
      envField: "releaseEnv",
      branchField: "releaseBranch",
    },
  };

  const PHASE_COLUMNS = [
    {
      key: "dev",
      label: "开发",
      type: "dev",
      envField: "devEnv",
      branchField: "devBranch",
      startField: "devStart",
      endField: "devEnd",
    },
    {
      key: "qa",
      label: "测试",
      type: "sit",
      envField: "qaEnv",
      branchField: "qaBranch",
      startField: "qaStart",
      endField: "qaEnd",
    },
    {
      key: "uat",
      label: "UAT",
      type: "uat",
      envField: "uatEnv",
      branchField: "uatBranch",
      startField: "uatStart",
      endField: "uatEnd",
    },
    {
      key: "release",
      label: "生产",
      type: "live",
      envField: "releaseEnv",
      branchField: "releaseBranch",
      startField: "releaseStart",
      endField: "releaseEnd",
    },
  ];

  let store = loadPlans();
  let adjustments = loadAdjustments();
  let currentPlan = getInitialPlan();

  function getInitialPlan() {
    const params = new URLSearchParams(window.location.search);
    return params.get("plan") === "integration" ? "integration" : "project";
  }

  function loadPlans() {
    try {
      const raw = localStorage.getItem(PLAN_STORAGE_KEY);
      const data = raw ? JSON.parse(raw) : {};
      return {
        project: normalizePlan(data.project, "项目交付计划"),
        integration: normalizePlan(data.integration, "第三方集成计划"),
      };
    } catch (_) {
      return {
        project: normalizePlan(null, "项目交付计划"),
        integration: normalizePlan(null, "第三方集成计划"),
      };
    }
  }

  function normalizePlan(plan, title) {
    return {
      title: (plan && plan.title) || title,
      iterations: Array.isArray(plan && plan.iterations) ? plan.iterations : [],
      rows: Array.isArray(plan && plan.rows) ? plan.rows : [],
      tasks: Array.isArray(plan && plan.tasks) ? plan.tasks : [],
    };
  }

  function loadAdjustments() {
    try {
      const raw = localStorage.getItem(STRATEGY_STORAGE_KEY);
      const data = raw ? JSON.parse(raw) : {};
      return {
        project: normalizeAdjustmentPlan(data.project),
        integration: normalizeAdjustmentPlan(data.integration),
      };
    } catch (_) {
      return {
        project: normalizeAdjustmentPlan(null),
        integration: normalizeAdjustmentPlan(null),
      };
    }
  }

  function normalizeAdjustmentPlan(plan) {
    return {
      showDates: !!(plan && plan.showDates),
      rows: plan && typeof plan.rows === "object" && plan.rows ? plan.rows : {},
    };
  }

  function saveAdjustments() {
    try {
      localStorage.setItem(STRATEGY_STORAGE_KEY, JSON.stringify(adjustments));
    } catch (_) {
      /* ignore */
    }
  }

  function parseYmd(s) {
    if (!s || typeof s !== "string") return null;
    const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!m) return null;
    const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    if (Number.isNaN(d.getTime())) return null;
    d.setHours(0, 0, 0, 0);
    return d;
  }

  function esc(s) {
    if (s == null) return "";
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function planAdjustment() {
    if (!adjustments[currentPlan]) adjustments[currentPlan] = { rows: {} };
    if (!adjustments[currentPlan].rows) adjustments[currentPlan].rows = {};
    if (typeof adjustments[currentPlan].showDates !== "boolean") {
      adjustments[currentPlan].showDates = false;
    }
    return adjustments[currentPlan];
  }

  function rowAdjustment(rowId) {
    const plan = planAdjustment();
    if (!plan.rows[rowId]) plan.rows[rowId] = {};
    return plan.rows[rowId];
  }

  function getIterationForDate(plan, dateStr) {
    const d = parseYmd(dateStr);
    if (!d) {
      return { id: "__missing", name: "未填写上线日期", matched: false };
    }

    for (const it of plan.iterations || []) {
      const start = parseYmd(it.start);
      const end = parseYmd(it.end);
      if (!start || !end) continue;
      if (d >= start && d <= end) {
        return {
          id: it.id || `${it.start}-${it.end}`,
          name: it.name || "未命名迭代",
          matched: true,
        };
      }
    }

    return { id: `__unmatched:${dateStr}`, name: "未匹配迭代", matched: false };
  }

  function featureBranchName(activityName) {
    const safeName = String(activityName || "未命名活动")
      .trim()
      .replace(/[\\/]+/g, "-");
    return `feature/${safeName || "未命名活动"}`;
  }

  function uniqueStrings(items) {
    return [...new Set(items.filter(Boolean))];
  }

  function ymdFromDateObj(d) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  }

  function formatMd(d) {
    if (!d) return "";
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${m}.${day}`;
  }

  function endOfCalendarDay(d) {
    const x = new Date(d);
    x.setHours(23, 59, 59, 999);
    return x;
  }

  function daysBetweenInclusive(start, end) {
    return Math.max(
      1,
      Math.round((endOfCalendarDay(end) - start) / 86400000) + 1
    );
  }

  function pctForDate(d, range) {
    const total = Math.max(1, endOfCalendarDay(range.max) - range.min);
    return ((d - range.min) / total) * 100;
  }

  function pctSpan(start, end, range) {
    const clampedStart = start < range.min ? range.min : start;
    const clampedEnd = end > range.max ? range.max : end;
    const left = pctForDate(clampedStart, range);
    const right = pctForDate(endOfCalendarDay(clampedEnd), range);
    return {
      left: Math.max(0, left),
      width: Math.max(1.5, Math.min(100, right) - Math.max(0, left)),
    };
  }

  function getIterationRange(plan) {
    const iterations = (plan.iterations || [])
      .map((it) => {
        const start = parseYmd(it.start);
        const end = parseYmd(it.end);
        if (!start || !end || end < start) return null;
        return { ...it, startDate: start, endDate: end };
      })
      .filter(Boolean)
      .sort((a, b) => a.startDate - b.startDate);

    if (!iterations.length) return null;
    return {
      min: new Date(iterations[0].startDate),
      max: new Date(iterations.reduce((acc, it) => (it.endDate > acc ? it.endDate : acc), iterations[0].endDate)),
      iterations,
    };
  }

  function colorIndexForBranch(branch) {
    const raw = String(branch || "");
    let hash = 0;
    for (let i = 0; i < raw.length; i += 1) {
      hash = (hash * 31 + raw.charCodeAt(i)) >>> 0;
    }
    return (hash % 8) + 1;
  }

  function buildAutoStrategyForRow(plan, row) {
    const liveTasks = (plan.tasks || []).filter(
      (task) => task.rowId === row.id && task.type === "live" && task.end
    );
    const deployments = liveTasks.map((task) => {
      const iteration = getIterationForDate(plan, task.end);
      return {
        activityName: task.name || "上线",
        liveDate: task.end,
        iteration,
        featureBranch: featureBranchName(task.name || row.name || "上线"),
      };
    });

    const allMatched = deployments.length
      ? deployments.every((item) => item.iteration.matched)
      : false;
    const iterationIds = uniqueStrings(deployments.map((item) => item.iteration.id));
    const sameIteration = deployments.length > 0 && allMatched && iterationIds.length === 1;
    const autoDevBranch = sameIteration
      ? DEFAULT_BRANCHES.devBranch
      : uniqueStrings(deployments.map((item) => item.featureBranch)).join("、") ||
        "待补充上线活动";

    return {
      rowId: row.id,
      moduleName: row.name || "未命名模块",
      deployments,
      sameIteration,
      autoDevBranch,
      reason: buildReason(deployments, sameIteration),
    };
  }

  function buildReason(deployments, sameIteration) {
    if (!deployments.length) {
      return "该模块未找到“上线”活动，请回到交付计划补充 type=live 的活动。";
    }
    if (sameIteration) {
      return "上线活动处于同一个迭代，开发分支使用 master。";
    }
    return "上线活动不在同一个迭代或未匹配到迭代，开发阶段使用特性分支。";
  }

  function getStrategies() {
    const plan = store[currentPlan];
    return (plan.rows || []).map((row) => {
      const auto = buildAutoStrategyForRow(plan, row);
      const custom = rowAdjustment(row.id);
      const defaults = {
        devBranch: auto.autoDevBranch,
        qaBranch: DEFAULT_BRANCHES.qaBranch,
        uatBranch: DEFAULT_BRANCHES.uatBranch,
        releaseBranch: DEFAULT_BRANCHES.releaseBranch,
        ...DEFAULT_ENVS,
      };
      const effective = {};
      for (const field of Object.keys(defaults)) {
        const value = custom[field];
        effective[field] = value && String(value).trim() ? String(value).trim() : defaults[field];
      }
      return { ...auto, defaults, custom, effective };
    });
  }

  function branchForTask(task, strategy) {
    const phase = ENV_PHASES[task.type] || ENV_PHASES.other;
    if (phase.branchField === "devBranch" && !strategy.sameIteration) {
      return strategy.effective.devBranch;
    }
    return strategy.effective[phase.branchField];
  }

  function tasksForStrategy(plan, strategy, range) {
    const rowTasks = (plan.tasks || []).filter((task) => task.rowId === strategy.rowId);
    const bounds = getModuleBounds(rowTasks, range);
    return PHASE_COLUMNS.map((phase) =>
      buildPhaseItem(phase, rowTasks, bounds, strategy, range)
    ).filter(Boolean);
  }

  function phaseOrder(key) {
    return { dev: 1, qa: 2, uat: 3, release: 4 }[key] || 9;
  }

  function getModuleBounds(rowTasks, range) {
    const dates = [];
    for (const task of rowTasks) {
      const start = parseYmd(task.start);
      const end = parseYmd(task.end);
      if (start) dates.push(start);
      if (end) dates.push(end);
    }
    const min = dates.length
      ? new Date(Math.max(range.min.getTime(), Math.min(...dates.map((d) => d.getTime()))))
      : new Date(range.min);
    const max = dates.length
      ? new Date(Math.min(range.max.getTime(), Math.max(...dates.map((d) => d.getTime()))))
      : new Date(range.max);
    if (max < min) return { min: new Date(range.min), max: new Date(range.max) };
    return { min, max };
  }

  function buildPhaseItem(phase, rowTasks, bounds, strategy, range) {
    const actual = rowTasks
      .map((task) => {
        const taskPhase = ENV_PHASES[task.type] || ENV_PHASES.other;
        if (taskPhase.key !== phase.key) return null;
        const start = parseYmd(task.start);
        const end = parseYmd(task.end);
        if (!start || !end || end < start) return null;
        return { task, start, end };
      })
      .filter(Boolean);
    const generated = actual.length
      ? {
          start: new Date(Math.min(...actual.map((item) => item.start.getTime()))),
          end: new Date(Math.max(...actual.map((item) => item.end.getTime()))),
          synthetic: false,
          name: uniqueStrings(actual.map((item) => item.task.name)).join(" / "),
        }
      : generatePhaseDates(phase, bounds);
    const adjusted = applyPhaseDateAdjustment(strategy, phase, generated);
    const branch =
      phase.key === "dev" && !strategy.sameIteration
        ? strategy.effective.devBranch
        : strategy.effective[phase.branchField];

    return {
      synthetic: generated.synthetic,
      task: {
        name: generated.name || `${phase.label}策略`,
        type: phase.type,
        start: ymdFromDateObj(adjusted.start),
        end: ymdFromDateObj(adjusted.end),
      },
      defaultStart: ymdFromDateObj(generated.start),
      defaultEnd: ymdFromDateObj(generated.end),
      start: adjusted.start,
      end: adjusted.end,
      phase,
      branch,
      env: strategy.effective[phase.envField],
      span: pctSpan(adjusted.start, adjusted.end, range),
    };
  }

  function generatePhaseDates(phase, bounds) {
    const totalDays = daysBetweenInclusive(bounds.min, bounds.max);
    const slices = {
      dev: [0, 0.52],
      qa: [0.52, 0.7],
      uat: [0.7, 0.88],
      release: [0.88, 1],
    };
    const slice = slices[phase.key] || [0, 1];
    const start = addDays(bounds.min, Math.floor((totalDays - 1) * slice[0]));
    const end = addDays(bounds.min, Math.max(0, Math.floor((totalDays - 1) * slice[1])));
    const safeEnd = end < start ? new Date(start) : end;
    return {
      synthetic: true,
      start,
      end: safeEnd,
      name: `${phase.label}策略`,
    };
  }

  function applyPhaseDateAdjustment(strategy, phase, generated) {
    const start = parseYmd(strategy.custom[phase.startField]);
    const end = parseYmd(strategy.custom[phase.endField]);
    if (start && end && end >= start) return { start, end };
    return { start: generated.start, end: generated.end };
  }

  function addDays(d, days) {
    const x = new Date(d);
    x.setDate(x.getDate() + days);
    x.setHours(0, 0, 0, 0);
    return x;
  }

  function formatDeployments(deployments) {
    if (!deployments.length) {
      return '<span class="branch-muted">未找到上线活动</span>';
    }
    return deployments
      .map(
        (item) =>
          `${esc(item.activityName)} · ${esc(item.liveDate)} · ${esc(item.iteration.name)}`
      )
      .join("<br>");
  }

  function renderTable(strategies) {
    const tbody = document.getElementById("branchStrategyTableBody");
    if (!tbody) return;
    const plan = store[currentPlan];
    const range = getIterationRange(plan);
    tbody.innerHTML = strategies
      .map((strategy) => {
        const phaseItems = range ? tasksForStrategy(plan, strategy, range) : [];
        return `
          <tr data-row-id="${esc(strategy.rowId)}">
            <td><strong>${esc(strategy.moduleName)}</strong></td>
            <td class="branch-deployments">${formatDeployments(strategy.deployments)}</td>
            <td>${renderAdjustmentGrid(strategy, phaseItems)}</td>
            <td><button type="button" class="btn btn-sm btn-danger branch-reset-row">重置</button></td>
          </tr>`;
      })
      .join("");

    tbody.querySelectorAll("input[data-row-id]").forEach((input) => {
      input.addEventListener("input", () => {
        const rowId = input.dataset.rowId;
        const field = input.dataset.field;
        if (!rowId || !field) return;
        rowAdjustment(rowId)[field] = input.value;
        saveAdjustments();
        renderAll();
      });
    });

    tbody.querySelectorAll(".branch-reset-row").forEach((button) => {
      button.addEventListener("click", () => {
        const row = button.closest("tr");
        const rowId = row && row.dataset.rowId;
        if (!rowId) return;
        delete planAdjustment().rows[rowId];
        saveAdjustments();
        renderAll();
      });
    });
  }

  function renderAdjustmentGrid(strategy, phaseItems) {
    const showDates = planAdjustment().showDates;
    const itemByPhase = new Map((phaseItems || []).map((item) => [item.phase.key, item]));
    return `
      <div class="branch-adjust-grid" aria-label="${esc(strategy.moduleName)}策略调整">
        <div class="branch-adjust-row branch-adjust-head">
          <span></span>
          ${PHASE_COLUMNS.map((phase) => `<strong>${esc(phase.label)}</strong>`).join("")}
        </div>
        <div class="branch-adjust-row">
          <span>分支</span>
          ${PHASE_COLUMNS.map((phase) => renderAdjustInput(strategy, phase.branchField)).join("")}
        </div>
        <div class="branch-adjust-row">
          <span>环境</span>
          ${PHASE_COLUMNS.map((phase) => renderAdjustInput(strategy, phase.envField)).join("")}
        </div>
        ${
          showDates
            ? `
        <div class="branch-adjust-row branch-adjust-date-row">
          <span>开始</span>
          ${PHASE_COLUMNS.map((phase) =>
            renderDateInput(strategy, phase.startField, itemByPhase.get(phase.key)?.defaultStart || "")
          ).join("")}
        </div>
        <div class="branch-adjust-row branch-adjust-date-row">
          <span>结束</span>
          ${PHASE_COLUMNS.map((phase) =>
            renderDateInput(strategy, phase.endField, itemByPhase.get(phase.key)?.defaultEnd || "")
          ).join("")}
        </div>`
            : ""
        }
      </div>`;
  }

  function renderAdjustInput(strategy, field) {
    return `
      <input
        type="text"
        data-row-id="${esc(strategy.rowId)}"
        data-field="${esc(field)}"
        value="${esc(strategy.custom[field] || "")}"
        placeholder="${esc(strategy.defaults[field])}"
        aria-label="${esc(strategy.moduleName + FIELD_LABELS[field])}"
      />`;
  }

  function renderDateInput(strategy, field, defaultValue) {
    return `
      <input
        type="date"
        data-row-id="${esc(strategy.rowId)}"
        data-field="${esc(field)}"
        value="${esc(strategy.custom[field] || defaultValue || "")}"
        placeholder="${esc(defaultValue)}"
        aria-label="${esc(strategy.moduleName + FIELD_LABELS[field])}"
      />`;
  }

  function renderPreview(strategies) {
    const root = document.getElementById("branchStrategyPreview");
    if (!root) return;
    if (!strategies.length) {
      root.innerHTML = '<p class="branch-empty">当前计划没有行 / 项目维度，暂无可生成的分支策略。</p>';
      return;
    }

    const plan = store[currentPlan];
    const range = getIterationRange(plan);
    if (!range) {
      root.innerHTML = '<p class="branch-empty">请先在交付计划中填写有效迭代周期，才能按时间轴展示分支策略。</p>';
      return;
    }

    const rowItems = strategies.map((strategy) => ({
      strategy,
      tasks: tasksForStrategy(plan, strategy, range),
    }));
    const branches = uniqueStrings(
      rowItems.flatMap((item) => item.tasks.map((task) => task.branch))
    );
    const minWidth = Math.max(
      1180,
      daysBetweenInclusive(range.min, range.max) * 24 + 230
    );

    root.innerHTML = `
      <div class="branch-chart-scroll">
        <div class="branch-chart" style="min-width:${minWidth}px">
          <div class="branch-chart-title">${esc(plan.title || "分支策略")} · 分支与环境时间轴</div>
          <div class="branch-chart-legend">
            ${renderEnvLegend()}
            ${branches.map((branch) => renderBranchLegend(branch)).join("")}
          </div>
          <div class="branch-chart-sprints">
            <div class="branch-chart-sprints-label">迭代</div>
            <div class="branch-chart-sprints-track">
              ${range.iterations.map((it) => renderIterationCell(it, range)).join("")}
            </div>
          </div>
          <div class="branch-chart-grid">
            ${rowItems.map((item) => renderChartRow(item, range)).join("")}
          </div>
        </div>
      </div>`;
  }

  function renderEnvLegend() {
    return [
      ["dev", "开发环境"],
      ["qa", "测试环境"],
      ["uat", "UAT环境"],
      ["release", "生产环境"],
    ]
      .map(
        ([key, label]) =>
          `<span class="branch-chart-legend-item"><i class="branch-env-swatch branch-env-${key}"></i>${esc(label)}</span>`
      )
      .join("");
  }

  function renderBranchLegend(branch) {
    const colorIndex = colorIndexForBranch(branch);
    return `<span class="branch-chart-legend-item"><i class="branch-arrow-swatch branch-arrow-color-${colorIndex}"></i>${esc(branch)}</span>`;
  }

  function renderIterationCell(iteration, range) {
    const span = pctSpan(iteration.startDate, iteration.endDate, range);
    return `
      <div class="branch-chart-sprint-cell" style="left:${span.left}%;width:${span.width}%">
        <strong>${esc(iteration.name || "未命名迭代")}</strong>
        <span>${esc(formatMd(iteration.startDate))} - ${esc(formatMd(iteration.endDate))}</span>
      </div>`;
  }

  function renderChartRow(item, range) {
    const { strategy, tasks } = item;
    const rowHeight = Math.max(112, tasks.length * 54 + 18);
    return `
      <div class="branch-chart-row-label" style="min-height:${rowHeight}px">
        <strong>${esc(strategy.moduleName)}</strong>
      </div>
      <div class="branch-chart-row-track" style="min-height:${rowHeight}px">
        ${tasks.length ? tasks.map((task, idx) => renderEnvBlock(task, idx)).join("") : renderEmptyChartNote(strategy)}
        ${tasks.map((task, idx) => renderBranchArrow(task, idx)).join("")}
      </div>`;
  }

  function renderEmptyChartNote(strategy) {
    return `<span class="branch-chart-empty-note">${esc(strategy.reason)}</span>`;
  }

  function renderEnvBlock(item, index) {
    const top = 10 + index * 54;
    return `
      <div
        class="branch-env-block branch-env-${esc(item.phase.key)}"
        style="left:${item.span.left}%;width:${item.span.width}%;top:${top}px"
        title="${esc(item.task.name)} · ${esc(item.env)} · ${esc(item.task.start)} 至 ${esc(item.task.end)}"
      >
        <span>${esc(item.phase.label)} · ${esc(item.env)}</span>
      </div>`;
  }

  function renderBranchArrow(item, index) {
    const top = 38 + index * 54;
    const colorIndex = colorIndexForBranch(item.branch);
    const dateText =
      ymdFromDateObj(item.start) === ymdFromDateObj(item.end)
        ? item.task.start
        : `${item.task.start} - ${item.task.end}`;
    return `
      <div
        class="branch-arrow branch-arrow-color-${colorIndex}"
        style="left:${item.span.left}%;width:${item.span.width}%;top:${top}px"
        title="${esc(item.task.name)} · ${esc(item.branch)} · ${esc(dateText)}"
      >
        <span>${esc(item.branch)}</span>
      </div>`;
  }

  function renderStatus(strategies) {
    const el = document.getElementById("branchPageStatus");
    if (!el) return;
    const plan = store[currentPlan];
    const missingLiveCount = strategies.filter((item) => !item.deployments.length).length;
    const planLabel = currentPlan === "integration" ? "第三方集成计划" : "项目交付计划";
    el.textContent = `${planLabel}：${plan.title || "未命名计划"}。已生成 ${strategies.length} 个模块策略${
      missingLiveCount ? `，其中 ${missingLiveCount} 个模块缺少上线活动` : ""
    }。`;
  }

  function renderPlanTabs() {
    document.querySelectorAll(".tab[data-plan]").forEach((button) => {
      const active = button.dataset.plan === currentPlan;
      button.classList.toggle("active", active);
      button.setAttribute("aria-selected", active ? "true" : "false");
    });
  }

  function renderAll() {
    store = loadPlans();
    const strategies = getStrategies();
    const titleEl = document.getElementById("branchPlanTitle");
    const plan = store[currentPlan];
    if (titleEl) {
      titleEl.textContent = `${plan.title || "未命名计划"} · 根据上线迭代自动生成模块分支与环境使用策略`;
    }
    renderPlanTabs();
    renderDateToggle();
    renderStatus(strategies);
    renderTable(strategies);
    renderPreview(strategies);
  }

  function renderDateToggle() {
    const toggle = document.getElementById("toggleBranchDates");
    if (!toggle) return;
    toggle.checked = !!planAdjustment().showDates;
  }

  function timestampForFilename() {
    const d = new Date();
    const date = ymdFromDateObj(d).replace(/-/g, "");
    const time = [
      d.getHours(),
      d.getMinutes(),
      d.getSeconds(),
    ]
      .map((n) => String(n).padStart(2, "0"))
      .join("");
    return `${date}-${time}`;
  }

  function exportStrategyJson() {
    store = loadPlans();
    const payload = {
      exportedAt: new Date().toISOString(),
      plans: store,
      branchStrategy: adjustments,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: "application/json",
    });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `delivery-branch-strategy-${timestampForFilename()}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  function importStrategyJson(file) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(String(reader.result));
        const nextPlans = data.plans || (data.project || data.integration ? data : null);
        const nextStrategy = data.branchStrategy || data.strategy || null;
        if (nextPlans) {
          localStorage.setItem(PLAN_STORAGE_KEY, JSON.stringify(nextPlans));
        }
        if (nextStrategy) {
          localStorage.setItem(STRATEGY_STORAGE_KEY, JSON.stringify(nextStrategy));
          adjustments = loadAdjustments();
        }
        if (!nextPlans && !nextStrategy) {
          throw new Error("未识别到计划数据或分支策略数据");
        }
        store = loadPlans();
        renderAll();
      } catch (err) {
        alert("JSON 导入失败：" + (err && err.message ? err.message : String(err)));
      }
    };
    reader.readAsText(file);
  }

  document.querySelectorAll(".tab[data-plan]").forEach((button) => {
    button.addEventListener("click", () => {
      currentPlan = button.dataset.plan === "integration" ? "integration" : "project";
      const url = new URL(window.location.href);
      url.searchParams.set("plan", currentPlan);
      window.history.replaceState(null, "", url.toString());
      renderAll();
    });
  });

  const regenerateButton = document.getElementById("btnRegenerateStrategy");
  if (regenerateButton) {
    regenerateButton.addEventListener("click", () => renderAll());
  }

  const toggleBranchDates = document.getElementById("toggleBranchDates");
  if (toggleBranchDates) {
    toggleBranchDates.addEventListener("change", () => {
      planAdjustment().showDates = toggleBranchDates.checked;
      saveAdjustments();
      renderAll();
    });
  }

  const exportButton = document.getElementById("btnExportStrategyJson");
  if (exportButton) {
    exportButton.addEventListener("click", () => exportStrategyJson());
  }

  const importInput = document.getElementById("importStrategyJson");
  if (importInput) {
    importInput.addEventListener("change", (event) => {
      const file = event.target.files && event.target.files[0];
      importStrategyJson(file);
      event.target.value = "";
    });
  }

  renderAll();
})();
