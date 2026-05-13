(function () {
  "use strict";

  const STORAGE_KEY = "delivery-plan-workbench-v1";
  const SNAPSHOTS_KEY = "delivery-plan-snapshots-v1";
  const SNAPSHOT_MAX = 40;

  /** 两种计划均保证含：方案/链路/契约对齐、功能开发&测试、SIT、UAT */
  const ACTIVITY_TYPES_PROJECT = [
    { value: "plan", label: "业务&技术方案&计划对齐" },
    { value: "plan", label: "接口契约对齐" },
    { value: "plan", label: "业务链路方案对齐" },
    { value: "dev", label: "功能开发&测试" },
    { value: "integ", label: "接口联调" },
    { value: "sit", label: "SIT" },
    { value: "uat", label: "UAT" },
    { value: "live", label: "上线" },
    { value: "integ", label: "联调&测试" },
    { value: "integ_show", label: "联调&测试&Showcase" },
    { value: "show", label: "Showcase" },
    { value: "other", label: "其他" },
  ];

  const ACTIVITY_TYPES_INTEGRATION = [
    { value: "plan", label: "业务&技术方案&计划对齐" },
    { value: "plan", label: "接口契约对齐" },
    { value: "plan", label: "业务链路方案对齐" },
    { value: "dev", label: "方案细化（功能拆解）" },
    { value: "dev", label: "功能开发&测试" },
    { value: "integ", label: "接口联调" },
    { value: "sit", label: "SIT" },
    { value: "uat", label: "UAT" },
    { value: "show", label: "Showcase" },
    { value: "integ_show", label: "Showcase & UAT" },
    { value: "live", label: "上线" },
    { value: "other", label: "其他" },
  ];

  /** @type {{ project: PlanState, integration: PlanState }} */
  let store = {
    project: defaultPlanState("project"),
    integration: defaultPlanState("integration"),
  };

  let currentPlan = "project";

  /** @typedef {{ id: string, name: string, start: string, end: string }} Iteration */
  /** @typedef {{ id: string, label: string, date: string }} Marker */
  /** @typedef {{ id: string, name: string }} Row */
  /** @typedef {{ id: string, rowId: string, name: string, type: string, start: string, end: string }} Task */
  /** @typedef {{ title: string, iterations: Iteration[], markers: Marker[], rows: Row[], tasks: Task[] }} PlanState */

  function defaultPlanState(kind) {
    const rowId = uid();
    return {
      title:
        kind === "project"
          ? "PO 整体交付计划"
          : "第三方集成交付计划",
      iterations: [
        {
          id: uid(),
          name: kind === "project" ? "Sprint 1" : "Sprint 2",
          start: "",
          end: "",
        },
        {
          id: uid(),
          name: kind === "project" ? "Sprint 2" : "Sprint 3",
          start: "",
          end: "",
        },
      ],
      markers: [],
      rows: [{ id: rowId, name: kind === "project" ? "交付项 A" : "集成专题" }],
      tasks: [
        {
          id: uid(),
          rowId,
          name: kind === "project" ? "功能开发&测试" : "功能开发&测试",
          type: "dev",
          start: "",
          end: "",
        },
      ],
    };
  }

  function uid() {
    return "id-" + Math.random().toString(36).slice(2, 11);
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

  function formatDisplay(d) {
    if (!d) return "";
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    return `${mm}.${dd}`;
  }

  const HOLIDAY_CACHE_KEY = "delivery-plan-cn-holidays-nager-v1";
  const cnHolidayByDate = Object.create(null);
  const loadedHolidayYears = new Set();
  let holidayEnsureTimer = null;

  function ymdFromDateObj(d) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  }

  /** 甘特条上方日期：起止同一天只显示一个 */
  function formatGanttBarDateLine(ds, de) {
    if (!ds || !de) return "";
    if (ymdFromDateObj(ds) === ymdFromDateObj(de)) return formatDisplay(ds);
    return `${formatDisplay(ds)} – ${formatDisplay(de)}`;
  }

  function formatGanttBarTitleDates(t, ds, de) {
    if (ymdFromDateObj(ds) === ymdFromDateObj(de)) {
      const s1 = (t.start || "").trim();
      const s2 = (t.end || "").trim();
      if (s1) return s1;
      if (s2) return s2;
      return ymdFromDateObj(ds);
    }
    return `${t.start || "未填"} → ${t.end || "未填"}`;
  }

  function holidayDayCreateHook(dObj, _dStr, _fp, dayElem) {
    const key = ymdFromDateObj(dObj);
    const label = cnHolidayByDate[key];
    if (label) {
      dayElem.classList.add("fp-day-cn-holiday");
      dayElem.title = label;
    }
  }

  function loadHolidaysFromCache() {
    try {
      const raw = localStorage.getItem(HOLIDAY_CACHE_KEY);
      if (!raw) return;
      const o = JSON.parse(raw);
      if (o.dates && typeof o.dates === "object") {
        Object.assign(cnHolidayByDate, o.dates);
      }
      if (Array.isArray(o.years)) {
        o.years.forEach((y) => loadedHolidayYears.add(Number(y)));
      }
    } catch (_) {
      /* ignore */
    }
  }

  function saveHolidaysCache() {
    try {
      const dates = { ...cnHolidayByDate };
      const years = [...loadedHolidayYears].sort((a, b) => a - b);
      localStorage.setItem(
        HOLIDAY_CACHE_KEY,
        JSON.stringify({ dates, years, savedAt: Date.now() })
      );
    } catch (_) {
      /* ignore */
    }
  }

  /** 仅根据各计划中「迭代」填写的起止日期决定需拉取节假日的年份（不再用活动/标记日期） */
  function collectHolidayYearsFromIterations() {
    const y = new Set();
    const ynow = new Date().getFullYear();
    for (const key of ["project", "integration"]) {
      const plan = store[key];
      if (!plan) continue;
      for (const it of plan.iterations || []) {
        const d1 = parseYmd(it.start);
        const d2 = parseYmd(it.end);
        if (d1) y.add(d1.getFullYear());
        if (d2) y.add(d2.getFullYear());
      }
    }
    if (!y.size) {
      y.add(ynow);
      y.add(ynow + 1);
    }
    return [...y].sort((a, b) => a - b);
  }

  async function fetchCnHolidaysForYears(years) {
    const lists = await Promise.all(
      years.map(async (year) => {
        const res = await fetch(
          `https://date.nager.at/api/v3/PublicHolidays/${year}/CN`
        );
        if (!res.ok) throw new Error(`${year} 年：${res.status}`);
        return res.json();
      })
    );
    for (const arr of lists) {
      for (const h of arr) {
        if (h.date)
          cnHolidayByDate[h.date] = h.localName || h.name || "法定节假日";
      }
    }
  }

  function updateHolidayStatus() {
    const el = document.getElementById("cnHolidayStatus");
    if (!el) return;
    const n = Object.keys(cnHolidayByDate).length;
    if (n === 0) {
      el.textContent =
        "尚未加载法定节假日数据；联网后将自动从 date.nager.at 同步（与国务院公布一致，调休补班可能未完全覆盖）。";
      return;
    }
    el.textContent = `已加载 ${n} 条中国法定节假日（按各计划「迭代」日期范围同步），日历与甘特图已标注；公司特殊日期请用下方「特殊标记」补充。`;
  }

  async function ensureCnHolidaysLoaded() {
    const years = collectHolidayYearsFromIterations();
    const missing = years.filter((y) => !loadedHolidayYears.has(y));
    if (!missing.length) {
      updateHolidayStatus();
      return;
    }
    const statusEl = document.getElementById("cnHolidayStatus");
    if (statusEl) statusEl.textContent = "正在同步法定节假日…";
    try {
      await fetchCnHolidaysForYears(missing);
      missing.forEach((y) => loadedHolidayYears.add(y));
      saveHolidaysCache();
      updateHolidayStatus();
      renderGantt();
    } catch (_) {
      if (statusEl)
        statusEl.textContent =
          "法定节假日接口暂不可用，请检查网络后点击「同步法定节假日」。接口：date.nager.at（CN）。";
    }
  }

  function scheduleEnsureHolidays() {
    clearTimeout(holidayEnsureTimer);
    holidayEnsureTimer = setTimeout(() => void ensureCnHolidaysLoaded(), 450);
  }

  function destroyFlatpickrIfAny(input) {
    if (!input) return;
    const fp = input._flatpickr;
    if (!fp) return;
    try {
      fp.destroy();
    } catch (_) {
      /* ignore */
    }
  }

  /** 表格区域有横向滚动时，日历默认挂在表内会被裁切，表现为点了没反应 */
  function flatpickrPortalOpts() {
    return typeof document !== "undefined"
      ? { appendTo: document.body }
      : {};
  }

  /** Flatpickr 各版本对 set / config 支持不一，避免抛错导致甘特图不刷新 */
  function fpSafeSet(fp, key, value) {
    if (!fp) return;
    try {
      if (typeof fp.set === "function") {
        fp.set(key, value);
        return;
      }
    } catch (_) {
      /* fall through */
    }
    try {
      if (fp.config) {
        fp.config[key] = value;
        if (typeof fp.redraw === "function") fp.redraw();
      }
    } catch (_) {
      /* ignore */
    }
  }

  async function forceRefreshCnHolidays() {
    const years = collectHolidayYearsFromIterations();
    const statusEl = document.getElementById("cnHolidayStatus");
    if (statusEl) statusEl.textContent = "正在重新同步法定节假日…";
    try {
      for (const y of years) loadedHolidayYears.delete(y);
      for (const k of Object.keys(cnHolidayByDate)) {
        const yy = parseInt(k.slice(0, 4), 10);
        if (years.includes(yy)) delete cnHolidayByDate[k];
      }
      await fetchCnHolidaysForYears(years);
      years.forEach((y) => loadedHolidayYears.add(y));
      saveHolidaysCache();
      updateHolidayStatus();
      flushGanttRefresh();
    } catch (e) {
      if (statusEl)
        statusEl.textContent = "同步失败：" + (e.message || String(e));
    }
  }

  /** 单日选择；无 Flatpickr 时回退为原生 date */
  function bindDatePicker(input, onCommit) {
    if (!input) return;
    destroyFlatpickrIfAny(input);
    const zh =
      typeof flatpickr !== "undefined" &&
      flatpickr.l10ns &&
      flatpickr.l10ns.zh;

    if (typeof flatpickr === "function") {
      const opts = {
        ...flatpickrPortalOpts(),
        dateFormat: "Y-m-d",
        allowInput: false,
        disableMobile: true,
        defaultDate: input.value || undefined,
        clickOpens: true,
        onDayCreate: holidayDayCreateHook,
        onChange: function (_dates, dateStr) {
          try {
            input.value = dateStr;
            onCommit(dateStr);
          } finally {
            flushGanttRefresh();
            scheduleEnsureHolidays();
          }
        },
      };
      if (zh) opts.locale = zh;
      flatpickr(input, opts);
      return;
    }

    input.type = "date";
    input.classList.remove("date-field");
    input.readOnly = false;
    input.removeAttribute("readonly");
    input.addEventListener("change", function () {
      try {
        onCommit(input.value);
      } finally {
        flushGanttRefresh();
        scheduleEnsureHolidays();
      }
    });
  }

  /**
   * 开始/结束成对：结束不得早于开始。
   * opts.useNativeDate：活动表等处于横向滚动容器内时用原生 date，避免日历无法弹出。
   */
  function bindRangedDatePair(startInput, endInput, onCommitSide, opts) {
    opts = opts || {};
    if (!startInput || !endInput) return;
    destroyFlatpickrIfAny(startInput);
    destroyFlatpickrIfAny(endInput);
    const zh =
      typeof flatpickr !== "undefined" &&
      flatpickr.l10ns &&
      flatpickr.l10ns.zh;

    function syncNativeRange() {
      if (
        startInput.value &&
        endInput.value &&
        endInput.value < startInput.value
      ) {
        endInput.value = startInput.value;
        onCommitSide("end", endInput.value);
      }
      endInput.min = startInput.value || "";
    }

    function wireNativeDatePair() {
      startInput.type = "date";
      endInput.type = "date";
      startInput.classList.remove("date-field");
      endInput.classList.remove("date-field");
      startInput.readOnly = false;
      endInput.readOnly = false;
      startInput.removeAttribute("readonly");
      endInput.removeAttribute("readonly");
      if (opts.useNativeDate) {
        startInput.classList.add("native-range-date");
        endInput.classList.add("native-range-date");
      }
      syncNativeRange();
      startInput.addEventListener("change", () => {
        syncNativeRange();
        onCommitSide("start", startInput.value);
        flushGanttRefresh();
        scheduleEnsureHolidays();
      });
      endInput.addEventListener("change", () => {
        syncNativeRange();
        onCommitSide("end", endInput.value);
        flushGanttRefresh();
        scheduleEnsureHolidays();
      });
    }

    if (opts.useNativeDate || typeof flatpickr !== "function") {
      wireNativeDatePair();
      return;
    }

    const base = {
      ...flatpickrPortalOpts(),
      dateFormat: "Y-m-d",
      allowInput: false,
      disableMobile: true,
      clickOpens: true,
      onDayCreate: holidayDayCreateHook,
    };
    if (zh) base.locale = zh;

    let startFp;
    let endFp;

    startFp = flatpickr(startInput, {
      ...base,
      defaultDate: startInput.value || undefined,
      onChange: function (_sel, dateStr) {
        try {
          startInput.value = dateStr;
          onCommitSide("start", dateStr);
          fpSafeSet(endFp, "minDate", dateStr || null);
          const ds = parseYmd(dateStr);
          const de = parseYmd(endInput.value);
          if (ds && de && de < ds && endFp) {
            endFp.setDate(dateStr, false);
            endInput.value = dateStr;
            onCommitSide("end", dateStr);
          }
        } finally {
          flushGanttRefresh();
          scheduleEnsureHolidays();
        }
      },
    });

    endFp = flatpickr(endInput, {
      ...base,
      defaultDate: endInput.value || undefined,
      minDate: startInput.value || null,
      onOpen: function () {
        if (!startInput.value) return;
        try {
          if (typeof endFp.jumpToDate === "function")
            endFp.jumpToDate(startInput.value, false);
        } catch (_) {
          /* ignore */
        }
      },
      onChange: function (_sel, dateStr) {
        try {
          endInput.value = dateStr;
          onCommitSide("end", dateStr);
          const ds = parseYmd(startInput.value);
          const de = parseYmd(dateStr);
          if (ds && de && ds > de && startFp) {
            startFp.setDate(dateStr, false);
            startInput.value = dateStr;
            onCommitSide("start", dateStr);
          }
        } finally {
          flushGanttRefresh();
          scheduleEnsureHolidays();
        }
      },
    });

    if (startInput.value) fpSafeSet(endFp, "minDate", startInput.value);
  }

  function getState() {
    return store[currentPlan];
  }

  function activityOptions() {
    const raw =
      currentPlan === "project"
        ? ACTIVITY_TYPES_PROJECT
        : ACTIVITY_TYPES_INTEGRATION;
    const seen = new Set();
    const out = [];
    for (const o of raw) {
      const key = o.value + "|" + o.label;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(o);
    }
    return out;
  }

  function load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const data = JSON.parse(raw);
      if (data.project) store.project = { ...defaultPlanState("project"), ...data.project };
      if (data.integration)
        store.integration = { ...defaultPlanState("integration"), ...data.integration };
    } catch (_) {
      /* ignore */
    }
  }

  function save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
    } catch (_) {
      /* ignore */
    }
  }

  function syncCurrentTitleFromDom() {
    const titleEl = document.getElementById("planTitle");
    if (titleEl && store[currentPlan]) store[currentPlan].title = titleEl.value;
  }

  function loadSnapshotsList() {
    try {
      const raw = localStorage.getItem(SNAPSHOTS_KEY);
      if (!raw) return [];
      const arr = JSON.parse(raw);
      return Array.isArray(arr) ? arr : [];
    } catch (_) {
      return [];
    }
  }

  function writeSnapshotsList(arr) {
    const trimmed = arr.slice(0, SNAPSHOT_MAX);
    try {
      localStorage.setItem(SNAPSHOTS_KEY, JSON.stringify(trimmed));
      return true;
    } catch (_) {
      alert(
        "写入版本存档失败，可能超出浏览器存储上限。请删除部分旧版本后再试。"
      );
      return false;
    }
  }

  function defaultSnapshotLabel() {
    syncCurrentTitleFromDom();
    const t = (store[currentPlan].title || "").trim();
    const d = new Date();
    const ts = d.toLocaleString("zh-CN", { hour12: false });
    return (t ? t.slice(0, 48) + " · " : "") + ts;
  }

  function saveSnapshotVersion() {
    syncCurrentTitleFromDom();
    save();
    const inp = document.getElementById("snapshotLabel");
    const label = (inp && inp.value.trim()) || defaultSnapshotLabel();
    const snap = {
      id: uid(),
      label: label.trim(),
      savedAt: Date.now(),
      currentPlan: currentPlan === "integration" ? "integration" : "project",
      store: JSON.parse(JSON.stringify(store)),
    };
    const list = loadSnapshotsList();
    list.unshift(snap);
    if (!writeSnapshotsList(list)) return;
    if (inp) inp.value = "";
    renderSnapshotsTable();
  }

  function applySnapshotToUI() {
    document.querySelectorAll(".tab").forEach((btn) => {
      const on = btn.dataset.plan === currentPlan;
      btn.classList.toggle("active", on);
      btn.setAttribute("aria-selected", on ? "true" : "false");
    });
    const titleEl = document.getElementById("planTitle");
    if (titleEl) titleEl.value = getState().title;
    renderIterationsTable();
    renderMarkersTable();
    renderRowsTable();
    renderTasksTable();
    flushGanttRefresh();
    renderSnapshotsTable();
    updateHolidayStatus();
    void ensureCnHolidaysLoaded();
  }

  function restoreSnapshotVersion(id) {
    const list = loadSnapshotsList();
    const snap = list.find((x) => x.id === id);
    if (!snap || !snap.store) return;
    if (
      !confirm(
        "确定用该存档覆盖当前工作台？当前未存档的修改将丢失（可先点「保存当前版本」备份）。"
      )
    ) {
      return;
    }
    const raw = snap.store;
    store = {
      project: { ...defaultPlanState("project"), ...(raw.project || {}) },
      integration: {
        ...defaultPlanState("integration"),
        ...(raw.integration || {}),
      },
    };
    currentPlan = snap.currentPlan === "integration" ? "integration" : "project";
    save();
    applySnapshotToUI();
  }

  function deleteSnapshotVersion(id) {
    if (!confirm("确定删除该版本存档？此操作不可撤销。")) return;
    writeSnapshotsList(loadSnapshotsList().filter((x) => x.id !== id));
    renderSnapshotsTable();
  }

  function formatSnapshotTime(ts) {
    if (!ts) return "";
    return new Date(ts).toLocaleString("zh-CN", { hour12: false });
  }

  function renderSnapshotsTable() {
    const tbody = document.getElementById("snapshotsTableBody");
    const emptyEl = document.getElementById("snapshotsEmpty");
    if (!tbody) return;
    const list = loadSnapshotsList();
    if (emptyEl) {
      emptyEl.classList.toggle("is-visible", list.length === 0);
    }
    tbody.innerHTML = list
      .map((s) => {
        const pt =
          (s.store && s.store.project && s.store.project.title) || "—";
        const it =
          (s.store &&
            s.store.integration &&
            s.store.integration.title) ||
          "—";
        return `
        <tr data-snapshot-id="${esc(s.id)}">
          <td>${esc(formatSnapshotTime(s.savedAt))}</td>
          <td>${esc(s.label || "未命名")}</td>
          <td>${esc(String(pt))}</td>
          <td>${esc(String(it))}</td>
          <td>
            <button type="button" class="btn btn-sm snapshot-restore">恢复</button>
            <button type="button" class="btn btn-sm btn-danger snapshot-del">删除</button>
          </td>
        </tr>`;
      })
      .join("");
    tbody.querySelectorAll(".snapshot-restore").forEach((btn) => {
      btn.addEventListener("click", () => {
        const tr = btn.closest("tr");
        const sid = tr && tr.dataset.snapshotId;
        if (sid) restoreSnapshotVersion(sid);
      });
    });
    tbody.querySelectorAll(".snapshot-del").forEach((btn) => {
      btn.addEventListener("click", () => {
        const tr = btn.closest("tr");
        const sid = tr && tr.dataset.snapshotId;
        if (sid) deleteSnapshotVersion(sid);
      });
    });
  }

  let ganttDebounceTimer = null;
  const GANTT_DEBOUNCE_MS = 320;

  function flushGanttRefresh() {
    if (ganttDebounceTimer) {
      clearTimeout(ganttDebounceTimer);
      ganttDebounceTimer = null;
    }
    save();
    renderGantt();
  }

  function scheduleGanttRefresh() {
    if (ganttDebounceTimer) clearTimeout(ganttDebounceTimer);
    ganttDebounceTimer = setTimeout(() => {
      ganttDebounceTimer = null;
      save();
      renderGantt();
    }, GANTT_DEBOUNCE_MS);
  }

  /** 输入过程中防抖刷新，失焦立即刷新（无需再点「刷新甘特图」） */
  function bindTextSyncGantt(input, apply) {
    input.addEventListener("input", () => {
      apply();
      scheduleGanttRefresh();
    });
    input.addEventListener("blur", () => {
      apply();
      flushGanttRefresh();
    });
  }

  function endOfCalendarDay(d) {
    const x = new Date(d);
    x.setHours(23, 59, 59, 999);
    return x;
  }

  /** 当前计划中所有迭代的起止并集；节假日仅在此范围内展示并参与扩展时间轴 */
  function getIterationBoundsForPlan(plan) {
    let min = null;
    let max = null;
    for (const it of plan.iterations || []) {
      let ds = parseYmd(it.start);
      let de = parseYmd(it.end);
      if (ds && !de) de = new Date(ds.getTime());
      else if (de && !ds) ds = new Date(de.getTime());
      if (!ds || !de) continue;
      if (!min || ds < min) min = new Date(ds);
      if (!max || de > max) max = new Date(de);
    }
    if (!min || !max) return null;
    return { min, maxEnd: endOfCalendarDay(max) };
  }

  function computeRange() {
    const s = getState();
    let min = null;
    let max = null;
    function bump(d) {
      if (!d) return;
      if (!min || d < min) min = d;
      if (!max || d > max) max = d;
    }
    for (const it of s.iterations) {
      bump(parseYmd(it.start));
      bump(parseYmd(it.end));
    }
    for (const t of s.tasks) {
      bump(parseYmd(t.start));
      bump(parseYmd(t.end));
    }
    for (const m of s.markers) bump(parseYmd(m.date));
    if (!min || !max) return { min: null, max: null, ms: 0 };
    const iterBounds = getIterationBoundsForPlan(s);
    if (iterBounds) {
      const lo = iterBounds.min.getTime();
      const hi = iterBounds.maxEnd.getTime();
      for (const hds of Object.keys(cnHolidayByDate)) {
        const hd = parseYmd(hds);
        if (!hd) continue;
        const ht = hd.getTime();
        if (ht < lo || ht > hi) continue;
        bump(hd);
      }
    }
    const endOfDay = new Date(max);
    endOfDay.setHours(23, 59, 59, 999);
    const ms = Math.max(endOfDay - min, 86400000);
    return { min, max: endOfDay, ms };
  }

  function dateToPct(d, range) {
    if (!range.min || !d) return null;
    const t = d.getTime() - range.min.getTime();
    return (t / range.ms) * 100;
  }

  const DAY_MS = 86400000;

  function isNationalDayLikeName(name) {
    return /国庆|National Day/i.test(name || "");
  }

  function isLabourLikeHolidayName(name) {
    return (
      /劳动/.test(name) ||
      /labour/i.test(name) ||
      /labor/i.test(name) ||
      /国际劳动节/.test(name)
    );
  }

  /**
   * 在迭代范围内，为常见连休补全日历日（接口常只给首日），便于甘特上显示放假「时长」。
   * 五一：5/1–5/5；国庆：10/1–10/7（若落在迭代区间内且未被标记覆盖）。
   */
  function augmentDisplayHolidayMap(displayMap, iterBounds, userMarkerDates) {
    if (!iterBounds) return;
    const lo = iterBounds.min.getTime();
    const hi = iterBounds.maxEnd.getTime();
    const addIf = (d, name) => {
      const k = ymdFromDateObj(d);
      if (userMarkerDates && userMarkerDates.has(k)) return;
      const ht = d.getTime();
      if (ht < lo || ht > hi) return;
      if (!displayMap[k]) displayMap[k] = name;
    };
    const snap = Object.keys(displayMap);
    for (const hds of snap) {
      const name = displayMap[hds];
      const d = parseYmd(hds);
      if (!d) continue;
      if (isLabourLikeHolidayName(name) && d.getMonth() === 4 && d.getDate() === 1) {
        for (let day = 2; day <= 5; day++) {
          addIf(new Date(d.getFullYear(), 4, day), name);
        }
      }
      if (isNationalDayLikeName(name) && d.getMonth() === 9 && d.getDate() === 1) {
        for (let day = 2; day <= 7; day++) {
          addIf(new Date(d.getFullYear(), 9, day), name);
        }
      }
    }
  }

  /** 将甘特范围内、连续同名法定日合并为一段，便于画「有宽度」的假期带 */
  function buildCnHolidayBands(range, userMarkerDates, iterBounds) {
    if (!range.min) return [];
    const tMin = range.min.getTime();
    const tMax = range.max.getTime();
    const displayMap = Object.create(null);
    for (const [hds, hname] of Object.entries(cnHolidayByDate)) {
      if (userMarkerDates.has(hds)) continue;
      const hd = parseYmd(hds);
      if (!hd) continue;
      const ht = hd.getTime();
      if (iterBounds) {
        if (ht < iterBounds.min.getTime() || ht > iterBounds.maxEnd.getTime()) continue;
      }
      displayMap[hds] = (hname || "").trim() || "法定节假日";
    }
    augmentDisplayHolidayMap(displayMap, iterBounds, userMarkerDates);
    const entries = [];
    for (const [hds, name] of Object.entries(displayMap)) {
      const hd = parseYmd(hds);
      if (!hd) continue;
      const ht = hd.getTime();
      if (ht < tMin || ht > tMax) continue;
      entries.push({ ymd: hds, name, d: hd, t: ht });
    }
    entries.sort((a, b) => a.t - b.t);
    const bands = [];
    let i = 0;
    while (i < entries.length) {
      const startE = entries[i];
      let j = i;
      let lastE = startE;
      while (
        j + 1 < entries.length &&
        entries[j + 1].name === startE.name &&
        entries[j + 1].t - lastE.t === DAY_MS
      ) {
        j++;
        lastE = entries[j];
      }
      bands.push({
        name: startE.name,
        startYmd: startE.ymd,
        endYmd: lastE.ymd,
        start: startE.d,
        end: lastE.d,
      });
      i = j + 1;
    }
    return bands;
  }

  function holidayBandLayout(band, range) {
    const left = dateToPct(band.start, range);
    const dayAfter = new Date(band.end);
    dayAfter.setDate(dayAfter.getDate() + 1);
    dayAfter.setHours(0, 0, 0, 0);
    const rightEdge = dateToPct(dayAfter, range);
    if (left == null || rightEdge == null) return null;
    const naturalDay = (DAY_MS / range.ms) * 100;
    let width = Math.max(rightEdge - left, naturalDay * 0.9, 0.12);
    let leftAdj = left;
    if (leftAdj < 0) {
      width += leftAdj;
      leftAdj = 0;
    }
    if (leftAdj + width > 100) {
      width = Math.max(100 - leftAdj, 0.12);
    }
    return { left: leftAdj, width };
  }

  function renderLegend() {
    const el = document.getElementById("legend");
    const colors = {
      dev: "var(--bar-dev)",
      live: "var(--bar-live)",
      integ: "var(--bar-integ)",
      plan: "var(--bar-plan)",
      sit: "var(--bar-sit)",
      uat: "var(--bar-uat)",
      other: "var(--bar-other)",
    };
    const items = [
      { key: "dev", label: "开发 / 测试" },
      { key: "live", label: "上线" },
      { key: "integ", label: "联调 / 集成" },
      { key: "plan", label: "方案 / 对齐" },
      { key: "sit", label: "SIT" },
      { key: "uat", label: "UAT" },
      { key: "other", label: "其他" },
    ];
    el.innerHTML =
      items
        .map(
          (i) =>
            `<span class="legend-item"><span class="legend-swatch" style="background:${colors[i.key]}"></span>${i.label}</span>`
        )
        .join("") +
      `<span class="legend-item"><span class="legend-swatch legend-swatch-holiday"></span>法定节假日</span>`;
  }

  function renderIterationsTable() {
    const tbody = document.querySelector("#iterationsTable tbody");
    const s = getState();
    tbody.innerHTML = s.iterations
      .map(
        (it) => `
      <tr data-id="${it.id}">
        <td><input type="text" data-field="name" value="${esc(it.name)}" /></td>
        <td><input type="date" data-field="start" value="${esc(it.start)}" /></td>
        <td><input type="date" data-field="end" value="${esc(it.end)}" /></td>
        <td><button type="button" class="btn btn-danger btn-del-iter">删除</button></td>
      </tr>`
      )
      .join("");

    tbody.querySelectorAll("tr").forEach((tr) => {
      const id = tr.dataset.id;
      const nameInp = tr.querySelector('input[data-field="name"]');
      bindTextSyncGantt(nameInp, () => {
        const it = s.iterations.find((x) => x.id === id);
        if (it) it.name = nameInp.value;
      });
      bindRangedDatePair(
        tr.querySelector('input[data-field="start"]'),
        tr.querySelector('input[data-field="end"]'),
        (side, str) => {
          const it = s.iterations.find((x) => x.id === id);
          if (!it) return;
          if (side === "start") it.start = str;
          else it.end = str;
        },
        { useNativeDate: true }
      );
      tr.querySelector(".btn-del-iter").addEventListener("click", () => {
        s.iterations = s.iterations.filter((x) => x.id !== id);
        flushGanttRefresh();
        renderIterationsTable();
      });
    });
  }

  function renderMarkersTable() {
    const tbody = document.querySelector("#markersTable tbody");
    const s = getState();
    if (!s.markers.length) {
      tbody.innerHTML =
        '<tr><td colspan="3" style="color:var(--muted);font-size:0.8rem;">暂无标记，可添加假期、展会等。</td></tr>';
      return;
    }
    tbody.innerHTML = s.markers
      .map(
        (m) => `
      <tr data-id="${m.id}">
        <td><input type="text" data-field="label" value="${esc(m.label)}" placeholder="如：春节假期" /></td>
        <td><input type="text" class="date-field" data-field="date" value="${esc(m.date)}" placeholder="选择日期" autocomplete="off" /></td>
        <td><button type="button" class="btn btn-danger btn-del-marker">删除</button></td>
      </tr>`
      )
      .join("");

    tbody.querySelectorAll("tr[data-id]").forEach((tr) => {
      const id = tr.dataset.id;
      const labInp = tr.querySelector('input[data-field="label"]');
      bindTextSyncGantt(labInp, () => {
        const m = s.markers.find((x) => x.id === id);
        if (m) m.label = labInp.value;
      });
      bindDatePicker(tr.querySelector('input[data-field="date"]'), (str) => {
        const m = s.markers.find((x) => x.id === id);
        if (m) m.date = str;
      });
      tr.querySelector(".btn-del-marker").addEventListener("click", () => {
        s.markers = s.markers.filter((x) => x.id !== id);
        flushGanttRefresh();
        renderMarkersTable();
      });
    });
  }

  function renderRowsTable() {
    const tbody = document.querySelector("#rowsTable tbody");
    const s = getState();
    tbody.innerHTML = s.rows
      .map(
        (r) => `
      <tr data-id="${r.id}">
        <td><input type="text" data-field="name" value="${esc(r.name)}" /></td>
        <td><button type="button" class="btn btn-danger btn-del-row">删除</button></td>
      </tr>`
      )
      .join("");

    tbody.querySelectorAll("tr").forEach((tr) => {
      const id = tr.dataset.id;
      const inp = tr.querySelector('input[data-field="name"]');
      bindTextSyncGantt(inp, () => {
        const r = s.rows.find((x) => x.id === id);
        if (r) r.name = inp.value;
      });
      tr.querySelector(".btn-del-row").addEventListener("click", () => {
        if (s.rows.length <= 1) return;
        s.rows = s.rows.filter((x) => x.id !== id);
        s.tasks = s.tasks.filter((t) => t.rowId !== id);
        flushGanttRefresh();
        renderRowsTable();
        renderTasksTable();
      });
    });
  }

  function optionSelectedForTask(o, t, opts) {
    if (t.name === o.label && t.type === o.value) return true;
    if (opts.some((x) => x.label === t.name)) return false;
    const same = opts.filter((x) => x.value === t.type);
    return same.length === 1 && same[0] === o;
  }

  function renderTasksTable() {
    const tbody = document.querySelector("#tasksTable tbody");
    const s = getState();

    tbody.innerHTML = s.tasks
      .map((t) => {
        const opts = activityOptions();
        const typeOpts = opts
          .map((o) => {
            const sel = optionSelectedForTask(o, t, opts) ? "selected" : "";
            return `<option value="${esc(o.value)}" data-label="${esc(o.label)}" ${sel}>${esc(o.label)}</option>`;
          })
          .join("");
        const rowSel = s.rows
          .map(
            (r) =>
              `<option value="${esc(r.id)}" title="${esc(r.name || "")}" ${r.id === t.rowId ? "selected" : ""}>${esc(r.name || "（未命名）")}</option>`
          )
          .join("");
        return `
      <tr data-id="${t.id}">
        <td class="task-row-cell">
          <select data-field="rowId" class="task-row-select">${rowSel}</select>
        </td>
        <td><select data-field="activityPreset" class="type-preset">${typeOpts}</select></td>
        <td><input type="date" data-field="start" value="${esc(t.start)}" /></td>
        <td><input type="date" data-field="end" value="${esc(t.end)}" /></td>
        <td><button type="button" class="btn btn-danger btn-del-task">删除</button></td>
      </tr>`;
      })
      .join("");

    tbody.querySelectorAll("tr").forEach((tr) => {
      const id = tr.dataset.id;
      const task = s.tasks.find((x) => x.id === id);
      if (!task) return;

      tr.querySelector(".type-preset").addEventListener("change", (e) => {
        const sel = e.target;
        const opt = sel.options[sel.selectedIndex];
        task.type = opt.value;
        task.name = opt.dataset.label || task.name;
        flushGanttRefresh();
        renderTasksTable();
      });

      const rowSel = tr.querySelector('select[data-field="rowId"]');
      rowSel.addEventListener("change", () => {
        task.rowId = rowSel.value;
        flushGanttRefresh();
      });

      bindRangedDatePair(
        tr.querySelector('input[data-field="start"]'),
        tr.querySelector('input[data-field="end"]'),
        (side, str) => {
          if (side === "start") task.start = str;
          else task.end = str;
        },
        { useNativeDate: true }
      );

      tr.querySelector(".btn-del-task").addEventListener("click", () => {
        s.tasks = s.tasks.filter((x) => x.id !== id);
        flushGanttRefresh();
        renderTasksTable();
      });
    });
  }

  function esc(s) {
    if (s == null) return "";
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/"/g, "&quot;");
  }

  function barTypeClass(type) {
    if (type === "integ_show") return "integ";
    if (type === "show") return "integ";
    const allowed = ["dev", "live", "integ", "plan", "sit", "uat", "other"];
    return allowed.includes(type) ? type : "other";
  }

  /** 日期重叠的活动分轨；纵向位置由 layoutGanttLaneStacking 按内容高度累加 */
  const GANTT_TRACK_TOP_PAD = 10;
  const GANTT_TRACK_BOTTOM_PAD = 10;
  const GANTT_LANE_STACK_GAP = 8;
  /** 短日程条不低于该时间轴比例，避免极窄条；文案单行超出时由色块向右变宽展示 */
  const GANTT_MIN_TASK_BAR_PCT = 2.25;

  function ganttTaskBarWidthPct(left, right) {
    const raw = Math.max(right - left, 0.02);
    return Math.min(100 - left, Math.max(raw, GANTT_MIN_TASK_BAR_PCT));
  }

  function rangesOverlapInclusive(ds1, de1, ds2, de2) {
    return ds1.getTime() <= de2.getTime() && de1.getTime() >= ds2.getTime();
  }

  function assignGanttTaskLanes(taskPayloads) {
    if (!taskPayloads.length) {
      return { laneById: Object.create(null), laneCount: 0 };
    }
    const sorted = [...taskPayloads].sort(
      (a, b) =>
        a.ds.getTime() - b.ds.getTime() ||
        a.de.getTime() - b.de.getTime()
    );
    const laneIntervals = [];
    const laneById = Object.create(null);
    for (const p of sorted) {
      let L = 0;
      for (;;) {
        if (!laneIntervals[L]) laneIntervals[L] = [];
        const busy = laneIntervals[L];
        const conflict = busy.some((x) =>
          rangesOverlapInclusive(p.ds, p.de, x.ds, x.de)
        );
        if (!conflict) {
          busy.push({ ds: p.ds, de: p.de });
          laneById[p.id] = L;
          break;
        }
        L++;
      }
    }
    const laneCount = laneIntervals.length;
    return { laneById, laneCount };
  }

  /** 所有活动条标签统一用样式表字号，不在窄条（SIT/UAT/上线等）上单独缩小 */
  function fitGanttBarLabels(ganttRoot) {
    if (!ganttRoot || ganttRoot.querySelector(".gantt-empty")) return;
    for (const slot of ganttRoot.querySelectorAll(".gantt-bar-slot")) {
      const main = slot.querySelector(".gantt-bar-main");
      if (!main) continue;
      main.style.fontSize = "";
      main.style.transform = "";
    }
  }

  /** 按每轨内任务条实际高度累加 top，避免多行文案与下一轨重叠 */
  function layoutGanttLaneStacking(ganttRoot) {
    if (!ganttRoot || ganttRoot.querySelector(".gantt-empty")) return;
    ganttRoot.querySelectorAll(".gantt-row-track").forEach((rowEl) => {
      const slots = [...rowEl.querySelectorAll(".gantt-bar-slot")];
      if (!slots.length) {
        rowEl.removeAttribute("data-gantt-lane-floor");
        return;
      }
      const byLane = new Map();
      for (const slot of slots) {
        const L = Number(slot.dataset.lane);
        const lane = Number.isFinite(L) && L >= 0 ? L : 0;
        if (!byLane.has(lane)) byLane.set(lane, []);
        byLane.get(lane).push(slot);
      }
      const maxL = Math.max(...byLane.keys(), 0);
      let y = GANTT_TRACK_TOP_PAD;
      for (let L = 0; L <= maxL; L++) {
        const group = byLane.get(L) || [];
        for (const slot of group) {
          slot.style.top = y + "px";
        }
        let maxH = 0;
        for (const slot of group) {
          maxH = Math.max(maxH, slot.offsetHeight);
        }
        y += maxH + GANTT_LANE_STACK_GAP;
      }
      y -= GANTT_LANE_STACK_GAP;
      rowEl.setAttribute(
        "data-gantt-lane-floor",
        String(Math.ceil(y + GANTT_TRACK_BOTTOM_PAD))
      );
    });
  }

  /** 任务条为绝对定位，需按内容抬高行高，否则多行文案会被裁切 */
  function syncGanttRowHeights(ganttRoot) {
    if (!ganttRoot || ganttRoot.querySelector(".gantt-empty")) return;
    ganttRoot.querySelectorAll(".gantt-grid").forEach((grid) => {
      const label = grid.querySelector(".gantt-row-label");
      const track = grid.querySelector(".gantt-row-track");
      if (!label || !track) return;
      track.style.minHeight = "";
      label.style.minHeight = "";
      void track.offsetHeight;
      const trackRect = track.getBoundingClientRect();
      let maxBottom = trackRect.top + track.offsetHeight;
      for (const el of track.querySelectorAll(
        ".gantt-bar-slot, .gantt-holiday-band-label, .gantt-marker-label"
      )) {
        const r = el.getBoundingClientRect();
        if (r.width > 0 || r.height > 0) {
          maxBottom = Math.max(maxBottom, r.bottom);
        }
      }
      const pad = 6;
      const needPx = Math.ceil(maxBottom - trackRect.top + pad);
      const minFromCss = parseFloat(getComputedStyle(track).minHeight);
      const floor = Number.isFinite(minFromCss) ? minFromCss : 0;
      const laneFloorAttr = track.getAttribute("data-gantt-lane-floor");
      const laneFloor = laneFloorAttr ? parseFloat(laneFloorAttr) : 0;
      const laneFloorOk = Number.isFinite(laneFloor) ? laneFloor : 0;
      const need = Math.max(floor, needPx, laneFloorOk);
      track.style.minHeight = need + "px";
      label.style.minHeight = need + "px";
    });
  }

  function renderGantt() {
    const root = document.getElementById("gantt");
    const s = getState();
    document.getElementById("planTitle").value = s.title;

    const range = computeRange();
    if (!range.min) {
      root.innerHTML =
        '<p class="gantt-empty">请至少填写一个迭代或活动的有效日期（开始/结束），即可生成时间轴。</p>';
      return;
    }

    const labelW = 168;
    root.style.setProperty("--label-w", labelW + "px");
    const rangeDays = Math.max(1, Math.ceil(range.ms / 86400000));
    /* 略增每自然日像素，短色块（如单日 UAT/SIT）更易辨认 */
    root.style.minWidth = Math.max(960, Math.min(10000, rangeDays * 32)) + "px";

    let html = "";
    html += `<div class="gantt-title">${esc(s.title)}</div>`;

    html += '<div class="gantt-sprints"><div class="gantt-sprints-label">迭代</div>';
    html += '<div class="gantt-sprints-track" id="sprintTrack"></div></div>';

    const rowsHtml = s.rows
      .map((r) => {
        const rowTasks = s.tasks.filter((t) => t.rowId === r.id);
        const has = rowTasks.some(
          (t) => parseYmd(t.start) || parseYmd(t.end)
        );
        return `
        <div class="gantt-grid">
          <div class="gantt-row-label">${esc(r.name)}</div>
          <div class="gantt-row-track ${has ? "has-tasks" : ""}" data-row="${r.id}"></div>
        </div>`;
      })
      .join("");
    html += rowsHtml;

    html += `<p class="gantt-meta">周期：${formatDisplay(range.min)} — ${formatDisplay(range.max)}（活动/标记定轴；法定节假日仅在「迭代」填写的时间范围内展示并扩展时间轴）</p>`;

    root.innerHTML = html;

    const track = root.querySelector("#sprintTrack");
    if (track) {
      s.iterations.forEach((it) => {
        let ds = parseYmd(it.start);
        let de = parseYmd(it.end);
        if (ds && !de) de = new Date(ds.getTime());
        else if (de && !ds) ds = new Date(de.getTime());
        if (!ds || !de) return;
        const left = dateToPct(ds, range);
        const right = dateToPct(de, range);
        if (left == null || right == null) return;
        const w = Math.max(right - left, 0.5);
        const cell = document.createElement("div");
        cell.className = "gantt-sprint-cell";
        cell.style.left = left + "%";
        cell.style.width = w + "%";
        cell.innerHTML = `<div class="gantt-sprint-box"><span class="gantt-sprint-name">${esc(it.name)}</span></div><span class="gantt-sprint-dates-out">${formatDisplay(ds)} – ${formatDisplay(de)}</span>`;
        track.appendChild(cell);
      });
    }

    const userMarkerDates = new Set(
      (s.markers || []).map((m) => m.date).filter(Boolean)
    );
    const firstRowId = s.rows.length ? s.rows[0].id : null;
    const iterBounds = getIterationBoundsForPlan(s);
    const holidayBands = buildCnHolidayBands(
      range,
      userMarkerDates,
      iterBounds
    );

    for (const r of s.rows) {
      const rowEl = root.querySelector(`.gantt-row-track[data-row="${r.id}"]`);
      if (!rowEl) continue;

      for (const band of holidayBands) {
        const geom = holidayBandLayout(band, range);
        if (!geom) continue;
        const bandEl = document.createElement("div");
        bandEl.className = "gantt-holiday-band";
        if (isLabourLikeHolidayName(band.name)) {
          bandEl.classList.add("gantt-holiday-band--labour");
        }
        bandEl.style.left = geom.left + "%";
        bandEl.style.width = geom.width + "%";
        bandEl.title =
          band.startYmd === band.endYmd
            ? `${band.startYmd} ${band.name}`
            : `${band.startYmd} ~ ${band.endYmd} ${band.name}`;
        rowEl.appendChild(bandEl);
        if (r.id === firstRowId) {
          const hlab = document.createElement("div");
          hlab.className = "gantt-holiday-band-label";
          if (isLabourLikeHolidayName(band.name)) {
            hlab.classList.add("gantt-holiday-band-label--labour");
          }
          hlab.style.left = geom.left + geom.width / 2 + "%";
          const spanText =
            band.startYmd === band.endYmd
              ? `${band.name} · ${formatDisplay(band.start)}`
              : `${band.name} · ${formatDisplay(band.start)}–${formatDisplay(
                  band.end
                )}`;
          hlab.textContent = spanText;
          hlab.title = bandEl.title;
          rowEl.appendChild(hlab);
        }
      }

      for (const m of s.markers) {
        const d = parseYmd(m.date);
        if (!d) continue;
        const p = dateToPct(d, range);
        if (p == null) continue;
        const line = document.createElement("div");
        line.className = "gantt-marker-line";
        line.style.left = p + "%";
        const lab = document.createElement("div");
        lab.className = "gantt-marker-label";
        lab.style.left = p + "%";
        lab.textContent = m.label || formatDisplay(d);
        rowEl.appendChild(line);
        rowEl.appendChild(lab);
      }

      const rowTasks = s.tasks.filter((t) => t.rowId === r.id);
      const taskPayloads = [];
      for (const t of rowTasks) {
        let ds = parseYmd(t.start);
        let de = parseYmd(t.end);
        if (ds && !de) de = new Date(ds.getTime());
        else if (de && !ds) ds = new Date(de.getTime());
        if (!ds || !de) continue;
        const left = dateToPct(ds, range);
        const right = dateToPct(de, range);
        if (left == null || right == null) continue;
        const w = ganttTaskBarWidthPct(left, right);
        taskPayloads.push({ id: t.id, t, ds, de, left, w });
      }

      const { laneById } = assignGanttTaskLanes(
        taskPayloads.map((p) => ({ id: p.id, ds: p.ds, de: p.de }))
      );

      taskPayloads.sort(
        (a, b) =>
          (laneById[a.id] ?? 0) - (laneById[b.id] ?? 0) || a.left - b.left
      );

      for (const p of taskPayloads) {
        const { t, ds, de, left, w } = p;
        const lane = laneById[p.id] ?? 0;
        const slot = document.createElement("div");
        slot.className = "gantt-bar-slot";
        slot.dataset.lane = String(lane);
        slot.style.left = left + "%";
        slot.style.width = w + "%";
        slot.style.top = GANTT_TRACK_TOP_PAD + "px";
        slot.style.zIndex = String(20 + lane);
        slot.title = [t.name, formatGanttBarTitleDates(t, ds, de)].join("\n");

        const datesOut = document.createElement("div");
        datesOut.className = "gantt-bar-dates-outside";
        datesOut.textContent = formatGanttBarDateLine(ds, de);

        const wrap = document.createElement("div");
        wrap.className = "gantt-bar-wrap";
        wrap.dataset.type = barTypeClass(t.type);
        const main = document.createElement("span");
        main.className = "gantt-bar-main";
        main.textContent = t.name;
        wrap.appendChild(main);

        slot.appendChild(datesOut);
        slot.appendChild(wrap);
        rowEl.appendChild(slot);
      }
    }

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        fitGanttBarLabels(root);
        layoutGanttLaneStacking(root);
        syncGanttRowHeights(root);
      });
    });
  }

  function bindFormTitle() {
    const inp = document.getElementById("planTitle");
    bindTextSyncGantt(inp, () => {
      getState().title = inp.value;
    });
  }

  function switchPlan(plan) {
    const titleEl = document.getElementById("planTitle");
    if (titleEl && store[currentPlan]) {
      store[currentPlan].title = titleEl.value;
      save();
    }
    currentPlan = plan;
    document.querySelectorAll(".tab").forEach((btn) => {
      const on = btn.dataset.plan === plan;
      btn.classList.toggle("active", on);
      btn.setAttribute("aria-selected", on ? "true" : "false");
    });
    document.getElementById("planTitle").value = getState().title;
    renderIterationsTable();
    renderMarkersTable();
    renderRowsTable();
    renderTasksTable();
    flushGanttRefresh();
  }

  document.querySelectorAll(".tab").forEach((btn) => {
    btn.addEventListener("click", () => switchPlan(btn.dataset.plan));
  });

  document.getElementById("btnAddIteration").addEventListener("click", () => {
    const s = getState();
    s.iterations.push({
      id: uid(),
      name: "Sprint " + (s.iterations.length + 1),
      start: "",
      end: "",
    });
    renderIterationsTable();
    flushGanttRefresh();
  });

  document.getElementById("btnAddMarker").addEventListener("click", () => {
    const s = getState();
    s.markers.push({ id: uid(), label: "", date: "" });
    save();
    renderMarkersTable();
  });

  document.getElementById("btnAddRow").addEventListener("click", () => {
    const s = getState();
    const id = uid();
    s.rows.push({ id, name: "新交付项" });
    renderRowsTable();
    renderTasksTable();
    flushGanttRefresh();
  });

  document.getElementById("btnAddTask").addEventListener("click", () => {
    const s = getState();
    const rowId = s.rows[0]?.id || uid();
    if (!s.rows.length) s.rows.push({ id: rowId, name: "默认行" });
    const opts = activityOptions();
    const devOpt =
      opts.find((o) => o.label === "功能开发&测试") || opts[0];
    s.tasks.push({
      id: uid(),
      rowId: s.rows[0].id,
      name: devOpt.label,
      type: devOpt.value,
      start: "",
      end: "",
    });
    renderTasksTable();
    flushGanttRefresh();
  });

  document.getElementById("btnRender").addEventListener("click", () => {
    flushGanttRefresh();
  });

  const btnSaveSnapshot = document.getElementById("btnSaveSnapshot");
  if (btnSaveSnapshot) {
    btnSaveSnapshot.addEventListener("click", () => saveSnapshotVersion());
  }

  function safeFilenamePart(s) {
    const t = String(s || "plan")
      .trim()
      .replace(/[/\\?%*:|"<>]/g, "-")
      .replace(/\s+/g, "-")
      .slice(0, 48);
    return t || "plan";
  }

  async function exportGanttPng() {
    const btn = document.getElementById("btnExportPng");
    const ganttRoot = document.getElementById("gantt");
    if (ganttRoot.querySelector(".gantt-empty")) {
      alert("请先填写日期生成甘特图后再导出图片。");
      return;
    }
    if (typeof html2canvas !== "function") {
      alert("图片导出库未加载，请检查网络后刷新页面。");
      return;
    }

    const panel = document.querySelector(".gantt-panel");
    const scroll = panel && panel.querySelector(".gantt-scroll");
    if (!panel || !scroll) return;

    if (document.fonts && document.fonts.ready) {
      try {
        await document.fonts.ready;
      } catch (_) {
        /* ignore */
      }
    }

    fitGanttBarLabels(ganttRoot);
    layoutGanttLaneStacking(ganttRoot);
    syncGanttRowHeights(ganttRoot);

    await new Promise((r) =>
      requestAnimationFrame(() => requestAnimationFrame(r))
    );

    void scroll.offsetHeight;
    void panel.offsetHeight;

    const exportW = Math.ceil(
      Math.max(
        panel.scrollWidth,
        scroll.scrollWidth,
        ganttRoot.scrollWidth,
        ganttRoot.offsetWidth
      )
    );
    const exportH = Math.ceil(Math.max(panel.scrollHeight, scroll.scrollHeight));
    const capW = Math.max(exportW, 400);
    const capH = Math.max(exportH, 240);

    btn.disabled = true;
    const prevText = btn.textContent;
    btn.textContent = "导出中…";

    const clone = panel.cloneNode(true);
    const dupGantt = clone.querySelector("#gantt");
    if (dupGantt) dupGantt.removeAttribute("id");
    const dupSprint = clone.querySelector("#sprintTrack");
    if (dupSprint) dupSprint.removeAttribute("id");

    clone.style.cssText = [
      "position:fixed",
      "left:-32000px",
      "top:0",
      "z-index:2147483646",
      "box-sizing:border-box",
      "width:" + capW + "px",
      "max-width:none",
      "min-width:" + capW + "px",
      "overflow:visible",
      "pointer-events:none",
      "opacity:1",
      "visibility:visible",
    ].join(";");
    const cScroll = clone.querySelector(".gantt-scroll");
    if (cScroll) {
      cScroll.style.width = capW + "px";
      cScroll.style.maxWidth = "none";
      cScroll.style.overflow = "visible";
      cScroll.style.minHeight = "0";
    }
    const cGantt = clone.querySelector(".gantt");
    if (cGantt) {
      cGantt.style.width = capW + "px";
      cGantt.style.maxWidth = "none";
      if (ganttRoot.style.minWidth) {
        cGantt.style.minWidth = ganttRoot.style.minWidth;
      }
    }

    document.body.appendChild(clone);
    void clone.offsetHeight;
    await new Promise((r) =>
      requestAnimationFrame(() => requestAnimationFrame(r))
    );

    try {
      const bg = getComputedStyle(panel).backgroundColor;
      const canvas = await html2canvas(clone, {
        scale: 2,
        useCORS: true,
        allowTaint: false,
        backgroundColor: bg || "#1a222c",
        logging: false,
        imageTimeout: 15000,
        scrollX: 0,
        scrollY: 0,
        windowWidth: capW,
        windowHeight: capH,
        onclone: (clonedDoc, rootEl) => {
          const p =
            rootEl ||
            (clonedDoc && clonedDoc.querySelector
              ? clonedDoc.querySelector(".gantt-panel")
              : null);
          if (!p || !p.style) return;
          p.style.width = capW + "px";
          p.style.maxWidth = "none";
          p.style.overflow = "visible";
          const sc = p.querySelector(".gantt-scroll");
          if (sc) {
            sc.style.width = capW + "px";
            sc.style.maxWidth = "none";
            sc.style.overflow = "visible";
          }
          const g = p.querySelector(".gantt");
          if (g) {
            g.style.width = capW + "px";
            g.style.maxWidth = "none";
            if (ganttRoot.style.minWidth) {
              g.style.minWidth = ganttRoot.style.minWidth;
            }
          }
          /* html2canvas 对 repeating-linear-gradient + 半透明条纹还原差，改为接近屏显的普通渐变 */
          const holidayBg =
            "linear-gradient(-42deg, #ffcc7a 0%, #fff0d0 22%, #ffd080 45%, #fff0d0 68%, #ffcc7a 100%)";
          const holidayLabourBg =
            "linear-gradient(-42deg, #ff9f4a 0%, #ffe0b8 22%, #ffb86b 45%, #ffe0b8 68%, #ff9f4a 100%)";
          p.querySelectorAll(".gantt-holiday-band").forEach((el) => {
            el.style.backgroundImage = "none";
            el.style.backgroundColor = "";
            if (el.classList.contains("gantt-holiday-band--labour")) {
              el.style.background = holidayLabourBg;
              el.style.borderColor = "rgba(196, 90, 18, 0.72)";
              el.style.boxShadow =
                "inset 0 0 0 1px rgba(255, 255, 255, 0.45), 0 0 0 1px rgba(196, 90, 18, 0.18)";
            } else {
              el.style.background = holidayBg;
              el.style.borderColor = "rgba(178, 110, 28, 0.5)";
              el.style.boxShadow = "inset 0 0 0 1px rgba(255, 255, 255, 0.35)";
            }
          });
        },
      });

      const title = safeFilenamePart(document.getElementById("planTitle").value);
      const planLabel = currentPlan === "integration" ? "集成" : "项目";
      const ymd = new Date().toISOString().slice(0, 10);

      await new Promise((resolve, reject) => {
        canvas.toBlob(
          (blob) => {
            if (!blob) {
              reject(new Error("无法生成图片"));
              return;
            }
            const a = document.createElement("a");
            a.href = URL.createObjectURL(blob);
            a.download = `甘特图-${planLabel}-${title}-${ymd}.png`;
            a.click();
            URL.revokeObjectURL(a.href);
            resolve();
          },
          "image/png",
          0.95
        );
      });
    } catch (e) {
      alert("导出失败：" + (e && e.message ? e.message : String(e)));
    } finally {
      if (clone.parentNode) {
        clone.parentNode.removeChild(clone);
      }
      fitGanttBarLabels(ganttRoot);
      layoutGanttLaneStacking(ganttRoot);
      syncGanttRowHeights(ganttRoot);
      btn.disabled = false;
      btn.textContent = prevText;
    }
  }

  document.getElementById("btnExportPng").addEventListener("click", () => {
    void exportGanttPng();
  });

  document.getElementById("btnExportJson").addEventListener("click", () => {
    const blob = new Blob([JSON.stringify(store, null, 2)], {
      type: "application/json",
    });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "delivery-plans.json";
    a.click();
    URL.revokeObjectURL(a.href);
  });

  document.getElementById("importJson").addEventListener("change", (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(String(reader.result));
        if (data.project) store.project = { ...defaultPlanState("project"), ...data.project };
        if (data.integration)
          store.integration = { ...defaultPlanState("integration"), ...data.integration };
        save();
        switchPlan(currentPlan);
        renderSnapshotsTable();
        void ensureCnHolidaysLoaded();
      } catch (err) {
        alert("JSON 解析失败：" + err.message);
      }
      e.target.value = "";
    };
    reader.readAsText(file);
  });

  document
    .getElementById("btnSyncCnHolidays")
    .addEventListener("click", () => void forceRefreshCnHolidays());

  let ganttRowSyncOnResizeTimer = null;
  window.addEventListener("resize", () => {
    const root = document.getElementById("gantt");
    if (!root || root.querySelector(".gantt-empty")) return;
    clearTimeout(ganttRowSyncOnResizeTimer);
    ganttRowSyncOnResizeTimer = setTimeout(() => {
      fitGanttBarLabels(root);
      layoutGanttLaneStacking(root);
      syncGanttRowHeights(root);
    }, 120);
  });

  load();
  loadHolidaysFromCache();
  bindFormTitle();
  renderSnapshotsTable();
  renderLegend();
  renderIterationsTable();
  renderMarkersTable();
  renderRowsTable();
  renderTasksTable();
  updateHolidayStatus();
  flushGanttRefresh();
  void ensureCnHolidaysLoaded();
})();
