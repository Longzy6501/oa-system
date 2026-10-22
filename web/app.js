const $ = (id) => document.getElementById(id);
const SK_AUTH_BATCH_LIMIT = 100;
const LIVENESS_RESULT_VISIBLE_MS = 30000;

const state = {
  user: null,
  csrf: "",
  dailyDisplaySnapshotsEnabled: false,
  statsSerial: 0,
  statsTimer: null,
  statsDisplayedKey: null,
  users: [],
  userPriorityDrafts: new Map(),
  sub2apiSites: [{ id: "main", label: "主站", groupName: "Max", enabled: true }],
  quota: { deficit: 0, reserved: 0, available: 0 },
  siteQuotas: [],
  onboardingProgress: [],
  targetServer: { id: "", label: "自动分配", options: [] },
  addDefaults: { sub2apiConcurrency: 8, isthmusMaxProcs: 10, sub2apiSchedulable: true },
  sub2apiCapacityAutomation: { enabled: true, threshold: 0.35, scaleDownThreshold: 0.15 },
  sub2apiSiteControls: [{ siteId: "main", label: "主站", groupName: "Max", siteEnabled: true, dataSourceAvailable: true, automationEnabled: true, capacityAutomation: { enabled: true, threshold: 0.35, scaleDownThreshold: 0.15 }, newAccountSchedulable: true }],
  sub2apiSiteControlBusy: new Set(),
  sub2apiSiteThresholdDrafts: new Map(),
  settlementRates: { userId: null, username: "", timezone: "Asia/Shanghai", current: null, scheduled: [], history: [] },
  settlementRateDialogSerial: 0,
  settlementRateRequestSerial: 0,
  settlementRateFormDirty: false,
  userRuntimeUserId: null,
  serverLoads: [],
  accounts: null,
  category: "all",
  refundState: "pending",
  accountRequestSerial: 0,
  accountAbortController: null,
  accountWindowController: null,
  accountWindowTimer: null,
  accountWindowSnapshots: new Map(),
  accountWindowQueuedRefresh: false,
  page: 1,
  pageSize: 50,
  currentView: "accounts",
  activeJobId: null,
  jobTimer: null,
  addAuthMode: "cookie",
  addAuthModeExplicit: false,
  activeAuthId: null,
  authTimer: null,
  activeAuth: null,
  singleAuthJobs: [],
  reauthMode: "login",
  activeReauthId: null,
  reauthTimer: null,
  activeReauth: null,
  reauthAccountId: null,
  activeBulkReauthId: null,
  bulkReauthTimer: null,
  activeBulkReauth: null,
  bulkReauthMode: "session_key",
  activeBatchId: null,
  batchAuthTimer: null,
  activeBatch: null,
  batchAuthJobs: [],
  proxySummary: null,
  deleteJobId: null,
  livenessJob: null,
  livenessTimer: null,
  livenessResultTimer: null,
  livenessResultKey: "",
  livenessResultHideAt: 0,
  livenessResultExpanded: false,
  livenessBusy: false,
  livenessLoading: false,
  deleteJobTimer: null,
  deleteBatchId: null,
  deleteBatchTimer: null,
  refundBulkBusy: false,
  refundedPurgeBusy: false,
  detailAccount: null,
  noteAccount: null,
  noteReturnToDetail: false,
  accountSelection: new Set(),
  accountSelectionMeta: new Map(),
  priceMode: "dynamic",
  pricePreviewSignature: "",
  priceHistoryAccountId: null,
  liveTimer: null,
  liveRefreshBusy: false,
  realtimeMetrics: null,
  realtimeMetricsTimer: null,
  realtimeMetricsBusy: false,
  realtimeMetricsRequestSerial: 0,
  realtimeMetricsController: null,
  realtimeMetricsRequestScope: "",
  authStatsRequestSerial: 0,
  sessionSerial: 0,
  failedImportLines: [],
  skAuthOriginalLinesByJob: new Map(),
  claudeSkRows: [],
  claudeSkNextRowId: 1,
  claudeSkRunning: false,
  claudeSkPaused: false,
  claudeSkPollTimer: null,
  claudeSkPolling: false,
  claudeSkLinkJobId: null,
  claudeSkBrowserJobId: null,
  claudeSkBrowserTimer: null,
  claudeSkMailRowId: null,
};

let confirmationResolve = null;
const requestQuality = { page: 1, listSerial: 0, detailSerial: 0, controller: null, detailController: null, searchTimer: null, data: null, filters: null, selected: null, detailPage: 1, detail: null, focus: null, cache: new Map(), pendingKey: null, pending: null };
const requestIPs = { page: 1, serial: 0, controller: null, timer: null, data: null, token: "", selected: null, action: "", busy: false };
const errorStats = { page: 1, serial: 0, historySerial: 0, controller: null, historyController: null, filters: null, owner: null, data: null };
const weekly = {
  tab: "accounts", mode: "days", state: "all", day: "", page: 1, data: null,
  key: "", roleKey: "", serial: 0, controller: null, timer: null, searchTimer: null,
  exportController: null, detailController: null, detailSerial: 0, detailOpen: false,
};
const weeklyStateLabels = { all: "全部状态", upcoming: "即将刷新", confirmed: "已确认刷新", pending: "待确认" };
const weeklyKindLabels = { "5h": "5h", "7d": "普通 7d", "7d_f": "7df（F5）" };
let claudeSkBrowserPointerStart = null;
const MAX_BULK_DELETE_SELECTION = 100;

function accountSelectionKey(account) {
  const siteId = String(account?.siteId || "main");
  const localAccountId = Number(account?.localAccountId ?? account?.id);
  return `${siteId}:${localAccountId}`;
}

function accountIdentityText(account) {
  const siteId = String(account?.siteId || "main");
  const localAccountId = Number(account?.localAccountId ?? account?.id);
  return `${siteLabel(siteId)} · #${localAccountId}`;
}

const categoryLabels = {
  all: "全部",
  healthy: "正常",
  unschedulable: "暂不可调度",
  error: "错误",
};

const refundLabels = {
  pending: "待处理",
  requested: "已申请退款",
  refunded: "已成功退款",
  archived: "已归档",
};

const viewMeta = {
  accounts: ["首页", "全部当前账号"],
  archive: ["死亡账号", "待处理与退款进度"],
  add: ["上号", "缺口校验与实时进度"],
  "claude-sk": ["Claude 账号", "自动授权、Session Key 与退款邮件"],
  users: ["用户", "成员、归属账号与全局缺口"],
  servers: ["服务器", "资源监控与新账号目标"],
  stats: ["每日统计", "按用户统计账号成本与用量结算"],
  "request-quality": ["请求质量", "Sub2API 用户拒答统计 · 北京时间"],
  "request-ips": ["请求 IP", "Sub2API 用户来源 · 北京时间"],
  "auth-stats": ["授权统计", "按上号时间查看各授权方式掉登率"],
  "account-errors": ["上号错误统计", "上号归属 · 北京时间"],
};

const authStatsLabels = {
  session_key: "Cookie / Session Key",
  login: "OAuth 账号登录",
  setup_token: "Setup Token",
  unknown: "历史 / 未记录",
  total: "合计",
};

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function formatMoney(value, digits = 2) {
  return `$${Number(value || 0).toLocaleString("en-US", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })}`;
}

function formatAmount(value, digits = 2) {
  return Number(value || 0).toLocaleString("zh-CN", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

function accountBillingLabel(account) {
  if (account.billingPrice == null) return "-";
  return formatAmount(account.billingPrice);                                                            
}

function accountSubscriptionLabel(account) {
  return account.billingTag || "-";
}

function formatNumber(value) {
  return Number(value || 0).toLocaleString("en-US");
}

function formatBytes(value) {
  const bytes = Math.max(0, Number(value || 0));
  if (bytes >= 1024 ** 4) return `${(bytes / 1024 ** 4).toFixed(1)} TB`;
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(1)} GB`;
  return `${(bytes / 1024 ** 2).toFixed(0)} MB`;
}

function formatDateTime(value) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}

function formatFullDateTime(value) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(date);
}

function toShanghaiDateTimeInput(value) {
  if (!value) return "";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(date);
  const values = Object.fromEntries(parts.filter((part) => part.type !== "literal").map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}T${values.hour}:${values.minute}:${values.second}`;
}


async function copyText(text) {
  const value = String(text || "");
  if (!value) return false;
  if (navigator.clipboard?.writeText && window.isSecureContext) {
    await navigator.clipboard.writeText(value);
    return true;
  }
  const textarea = document.createElement("textarea");
  textarea.value = value;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.left = "-9999px";
  document.body.appendChild(textarea);
  textarea.select();
  try {
    document.execCommand("copy");
    return true;
  } finally {
    textarea.remove();
  }
}

function formatDuration(seconds) {
  let remaining = Math.max(0, Number(seconds || 0));
  const days = Math.floor(remaining / 86400);
  remaining %= 86400;
  const hours = Math.floor(remaining / 3600);
  remaining %= 3600;
  const minutes = Math.floor(remaining / 60);
  if (days > 0) return `${days}天 ${hours}小时 ${minutes}分`;
  if (hours > 0) return `${hours}小时 ${minutes}分`;
  if (remaining > 0 && minutes === 0) return `<1分`;
  return `${minutes}分`;
}

function shanghaiDateParts(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  return Object.fromEntries(parts.filter((part) => part.type !== "literal").map((part) => [part.type, part.value]));
}

function todayText() {
  const parts = shanghaiDateParts();
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function settlementDateTimeInput(value = new Date()) {
  const text = typeof value === "string" ? value.trim() : "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return `${text}T00:00`;
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?$/.test(text)) return text.slice(0, 16);
  return toShanghaiDateTimeInput(value).slice(0, 16);
}

function formatSettlementDateTime(value) {
  if (!value) return "-";
  return settlementDateTimeInput(value).replace("T", " ") || "-";
}

function formatSettlementFactor(value) {
  if (value == null || String(value).trim() === "") return "-";
  const factor = Number(value);
  if (!Number.isFinite(factor)) return "-";
  return `×${factor.toLocaleString("en-US", { useGrouping: false, maximumFractionDigits: 6 })}`;
}

function settlementTiersForRule(rule) {
  if (Array.isArray(rule?.accountTiers) && rule.accountTiers.length) return rule.accountTiers;
  const prices = rule?.accountTierPrices;
  if (!prices) return [];
  return ["6", "12", null].map((upToHours, index) => ({
    upToHours,
    prices: { "5x": String(prices["5x"]?.[index] ?? ""), "20x": String(prices["20x"]?.[index] ?? "") },
  }));
}

function settlementRuleDescription(rule) {
  if (!rule) return "-";
  if (rule.settlementMode !== "account") return `用量结算 ${formatSettlementFactor(rule.factor)}`;
  if (rule.accountPriceType === "subscription") {
    return `按订阅类型\n${["5x", "20x"].map((tag) => `${tag} ${formatAmount(rule.accountSubscriptionPrices?.[tag])} / 号`).join("\n")}`;
  }
  if (rule.accountPriceType !== "survival") return `${formatAmount(rule.accountUnitPrice)} / 号（固定）`;
  const tiers = settlementTiersForRule(rule);
  return tiers.map((tier, index) => {
    const previous = index ? tiers[index - 1].upToHours : null;
    const interval = tier.upToHours == null
      ? (previous == null ? "全部时长" : `> ${previous} 小时`)
      : (previous == null ? `≤ ${tier.upToHours} 小时` : `${previous}–${tier.upToHours} 小时（含上限）`);
    return `${interval}：5x ${formatAmount(tier.prices?.["5x"])} / 20x ${formatAmount(tier.prices?.["20x"])}`;
  }).join("\n");
}

function currentSettlementRule() {
  return state.settlementRates.current || state.settlementRates.defaults || null;
}

function readSettlementTierInputs() {
  return [...$("settlementTierRows").querySelectorAll(".settlement-tier-row")].map((row) => ({
    upToHours: row.querySelector("[data-tier-limit]")?.value.trim() ?? null,
    prices: Object.fromEntries([...row.querySelectorAll("[data-tier-price]")].map((input) => [input.dataset.tierPrice, input.value.trim()])),
  }));
}

function renderSettlementTierInputs(tiers) {
  $("settlementTierRows").innerHTML = tiers.map((tier, index) => `
    <div class="settlement-tier-row">
      ${tier.upToHours == null
        ? `<div class="settlement-tier-limit"><span>末档时长</span><strong>${index ? "超过前一档上限" : "全部存活时长"}</strong></div>`
        : `<label class="settlement-tier-limit"><span>第 ${index + 1} 档上限（小时，含）</span><input data-tier-limit type="number" min="0.000001" max="72000" step="0.000001" inputmode="decimal" value="${escapeHtml(tier.upToHours)}" required></label>`}
      <label><span>5x 每号价格</span><input data-tier-price="5x" type="number" min="0" max="1000000" step="0.01" inputmode="decimal" value="${escapeHtml(tier.prices?.["5x"] ?? "")}" required></label>
      <label><span>20x 每号价格</span><input data-tier-price="20x" type="number" min="0" max="1000000" step="0.01" inputmode="decimal" value="${escapeHtml(tier.prices?.["20x"] ?? "")}" required></label>
      ${tier.upToHours == null ? '<span class="settlement-tier-final">末档</span>' : `<button class="danger compact remove-settlement-tier" type="button" data-tier-index="${index}" aria-label="删除第 ${index + 1} 个时段">删除</button>`}
    </div>`).join("");
  updateSettlementRateFields();
}

function resetSettlementRateForm() {
  state.settlementRateFormDirty = false;
  $("settlementEffectiveFrom").value = settlementDateTimeInput();
  $("settlementMode").value = "usage";
  $("settlementFactor").value = "";
  $("settlementAccountPriceType").value = "fixed";
  $("settlementAccountUnitPrice").value = "";
  ["5x", "20x"].forEach((tag) => { $(`settlementSubscriptionPrice${tag}`).value = ""; });
  $("settlementTierRows").innerHTML = "";
  $("settlementNote").value = "";
  updateSettlementRateFields();
}

function fillSettlementRateForm() {
  const rule = currentSettlementRule();
  if (!rule || state.settlementRateFormDirty) return;
  $("settlementMode").value = rule.settlementMode === "account" ? "account" : "usage";
  $("settlementFactor").value = rule.factor == null ? "" : String(rule.factor);
  $("settlementAccountPriceType").value = ["survival", "subscription"].includes(rule.accountPriceType) ? rule.accountPriceType : "fixed";
  $("settlementAccountUnitPrice").value = String(rule.accountUnitPrice ?? "");
  ["5x", "20x"].forEach((tag) => { $(`settlementSubscriptionPrice${tag}`).value = String(rule.accountSubscriptionPrices?.[tag] ?? ""); });
  const tiers = settlementTiersForRule(rule);
  renderSettlementTierInputs(tiers.length ? tiers : [{ upToHours: null, prices: { "5x": "", "20x": "" } }]);
  updateSettlementRateFields();
}

function updateSettlementRateFields() {
  const accountMode = $("settlementMode").value === "account";
  const survival = accountMode && $("settlementAccountPriceType").value === "survival";
  const subscription = accountMode && $("settlementAccountPriceType").value === "subscription";
  const fields = [
    ["settlementUsageFields", !accountMode],
    ["settlementAccountTypeFields", accountMode],
    ["settlementFixedFields", accountMode && !survival && !subscription],
    ["settlementSubscriptionFields", subscription],
    ["settlementTierFields", survival],
  ];
  fields.forEach(([id, visible]) => {
    const node = $(id);
    node.classList.toggle("hidden", !visible);
    node.querySelectorAll("input, select, button").forEach((input) => { input.disabled = !visible; });
  });
  $("settlementFactor").required = !accountMode;
  $("settlementAccountUnitPrice").required = accountMode && !survival && !subscription;
  ["5x", "20x"].forEach((tag) => { $(`settlementSubscriptionPrice${tag}`).required = subscription; });
  $("addSettlementTier").disabled = !survival || $("settlementTierRows").children.length >= 32;
  const newUploadsOnly = accountMode || currentSettlementRule()?.settlementMode === "account";
  $("settlementEffectiveHint").textContent = newUploadsOnly
    ? "支持设置过去的生效时间；从该时间起上号的账号采用对应结算方式和价格，历史结算也会按规则更新。该时间之前上号的账号保留原规则。"
    : "按用量的倍率按生效分钟计算，支持调整历史倍率；切换结算方式只影响生效后新上的号。";
  $("settlementEffectiveFrom").removeAttribute("min");
}

function addSettlementTier() {
  const tiers = readSettlementTierInputs();
  if (tiers.length >= 32) return;
  const final = tiers.pop() || { upToHours: null, prices: { "5x": "", "20x": "" } };
  const previous = Number(tiers.at(-1)?.upToHours || "0");
  tiers.push({ upToHours: String(Number.isFinite(previous) ? previous + 6 : 6), prices: { ...final.prices } }, final);
  state.settlementRateFormDirty = true;
  renderSettlementTierInputs(tiers);
  $("settlementTierRows").querySelectorAll("[data-tier-limit]")[tiers.length - 2]?.focus();
}

function removeSettlementTier(event) {
  const button = event.target.closest(".remove-settlement-tier");
  if (!button) return;
  const tiers = readSettlementTierInputs();
  tiers.splice(Number(button.dataset.tierIndex), 1);
  state.settlementRateFormDirty = true;
  renderSettlementTierInputs(tiers);
}

function settlementRateStatus(status) {
  const normalized = String(status || "").toLowerCase();
  const labels = {
    active: ["已生效", "status-healthy"],
    scheduled: ["待生效", "status-temporary"],
    canceled: ["已取消", "status-deleted"],
    cancelled: ["已取消", "status-deleted"],
    superseded: ["已替代", "status-unschedulable"],
    historical: ["历史生效", "status-healthy"],
  };
  return labels[normalized] || [status || "-", ""];
}

function toast(message, error = false) {
  if (!message) return;
  const node = $("toast");
  node.textContent = message;
  node.classList.toggle("error", error);
  node.classList.add("show");
  clearTimeout(node._timer);
  node._timer = setTimeout(() => node.classList.remove("show"), 3200);
}

function settleConfirmation(accepted) {
  const dialog = $("confirmDialog");
  const resolve = confirmationResolve;
  confirmationResolve = null;
  if (dialog.open) dialog.close();
  if (resolve) resolve(Boolean(accepted));
}

function confirmAction({ title = "确认操作", message, confirmLabel = "确认", danger = false }) {
  if (confirmationResolve) settleConfirmation(false);
  const dialog = $("confirmDialog");
  $("confirmTitle").textContent = title;
  $("confirmMessage").textContent = message;
  $("confirmAccept").textContent = confirmLabel;
  $("confirmAccept").className = danger ? "danger" : "primary";
  dialog.classList.toggle("dangerous", danger);
  dialog.showModal();
  setTimeout(() => $("confirmCancel").focus(), 0);
  return new Promise((resolve) => {
    confirmationResolve = resolve;
  });
}

async function runButtonTask(button, busyLabel, task) {
  if (!button || button.disabled) return;
  const idleLabel = button.textContent;
  button.disabled = true;
  button.textContent = busyLabel;
  button.setAttribute("aria-busy", "true");
  try {
    return await task();
  } finally {
    button.disabled = false;
    button.textContent = idleLabel;
    button.removeAttribute("aria-busy");
  }
}

async function api(path, options = {}) {
  const requestSessionSerial = state.sessionSerial;
  const method = options.method || "GET";
  const headers = { Accept: "application/json", ...(options.headers || {}) };
  let body;
  if (options.body !== undefined) {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(options.body);
  }
  if (!["GET", "HEAD"].includes(method) && state.csrf) {
    headers["X-CSRF-Token"] = state.csrf;
  }
  const response = await fetch(new URL(path.replace(/^\//, ""), window.location.href), {
    method,
    headers,
    body,
    signal: options.signal,
    credentials: "same-origin",
    cache: "no-store",
  });
  let payload = {};
  try {
    payload = await response.json();
  } catch (_) {
    payload = { error: `HTTP ${response.status}` };
  }
  if (requestSessionSerial !== state.sessionSerial) {
    const stale = new Error("");
    stale.staleSession = true;
    throw stale;
  }
  if (!response.ok || payload.ok === false) {
    if (response.status === 401 && path !== "api/login") showLogin();
    const error = new Error(payload.error || payload.message || `HTTP ${response.status}`);
    error.requestId = payload.requestId || "";
    throw error;
  }
  return payload;
}

function finishBoot() {
  $("bootView").classList.add("hidden");
}

function showBoot() {
  $("loginView").classList.add("hidden");
  $("appView").classList.add("hidden");
  $("bootView").classList.remove("hidden");
}

function showLogin() {
  resetWeekly();
  state.accountWindowController?.abort();
  state.accountWindowController = null;
  clearInterval(state.accountWindowTimer);
  state.accountWindowTimer = null;
  state.accountWindowSnapshots.clear();
  state.accountWindowQueuedRefresh = false;
  resetRequestQuality();
  cancelRequestIPs(true);
  cancelErrorStats(true);
  state.userPriorityDrafts.clear();
  cancelRealtimeMetricsRequest(true);
  state.sessionSerial += 1;
  clearTimeout(state.jobTimer);
  clearTimeout(state.authTimer);
  clearTimeout(state.reauthTimer);
  clearTimeout(state.deleteJobTimer);
  clearTimeout(state.livenessTimer);
  state.livenessTimer = null;
  clearTimeout(state.livenessResultTimer);
  state.livenessResultTimer = null;
  state.livenessResultKey = "";
  state.livenessResultHideAt = 0;
  state.livenessResultExpanded = false;
  state.livenessJob = null;
  state.livenessBusy = false;
  state.livenessLoading = false;
  $("livenessJobPanel").classList.add("hidden");
  $("toggleLivenessResultButton").classList.add("hidden");
  $("toggleLivenessResultButton").setAttribute("aria-expanded", "false");
  clearTimeout(state.deleteBatchTimer);
  clearTimeout(state.claudeSkPollTimer);
  clearInterval(state.claudeSkBrowserTimer);
  clearInterval(state.liveTimer);
  clearInterval(state.realtimeMetricsTimer);
  state.jobTimer = null;
  state.authTimer = null;
  state.deleteJobTimer = null;
  state.deleteBatchTimer = null;
  state.liveTimer = null;
  state.realtimeMetricsTimer = null;
  state.claudeSkPollTimer = null;
  state.claudeSkBrowserTimer = null;
  state.claudeSkRunning = false;
  state.claudeSkPaused = false;
  state.claudeSkRows = [];
  state.claudeSkNextRowId = 1;
  state.claudeSkLinkJobId = null;
  state.claudeSkBrowserJobId = null;
  state.user = null;
  state.csrf = "";
  state.users = [];
  state.quota = { deficit: 0, reserved: 0, available: 0 };
  state.siteQuotas = [];
  state.onboardingProgress = [];
  $("addProgressOwner").value = "";
  state.targetServer = { id: "", label: "自动分配", options: [] };
  state.addDefaults = { sub2apiConcurrency: 8, isthmusMaxProcs: 10, sub2apiSchedulable: true };
  state.sub2apiCapacityAutomation = { enabled: true, threshold: 0.35, scaleDownThreshold: 0.15 };
  state.sub2apiSiteControls = [];
  state.sub2apiSiteControlBusy.clear();
  state.sub2apiSiteThresholdDrafts.clear();
  state.serverLoads = [];
  state.accounts = null;
  state.activeJobId = null;
  state.activeAuthId = null;
  state.activeAuth = null;
  state.addAuthMode = "cookie";
  state.addAuthModeExplicit = false;
  state.activeReauthId = null;
  state.activeReauth = null;
  state.reauthAccountId = null;
  state.proxySummary = null;
  state.settlementRates = { userId: null, username: "", timezone: "Asia/Shanghai", current: null, scheduled: [], history: [] };
  state.deleteJobId = null;
  state.deleteBatchId = null;
  state.refundBulkBusy = false;
  state.refundedPurgeBusy = false;
  state.currentView = "accounts";
  state.category = "all";
  state.refundState = "pending";
  state.page = 1;
  state.detailAccount = null;
  state.noteAccount = null;
  state.noteReturnToDetail = false;
  state.liveRefreshBusy = false;
  state.realtimeMetrics = null;
  state.realtimeMetricsBusy = false;
  state.authStatsRequestSerial += 1;
  state.accountAbortController?.abort();
  state.accountAbortController = null;
  state.accountRequestSerial += 1;
  ["accountsBody", "accountsMobile", "authJobsList", "jobsList", "usersBody", "usersMobile", "statsBody", "authStatsBody", "settlementScheduledList", "settlementHistoryList"].forEach((id) => {
    $(id).innerHTML = "";
  });
  ["jobEvents", "jobResults", "bulkDeleteResults", "serverLoadGrid", "detailFacts", "detailModels", "detailDaily"].forEach((id) => {
    $(id).innerHTML = "";
  });
  $("metricCost").textContent = "$0.00";
  $("metricRequests").textContent = "0";
  $("metricTodayAdditions").textContent = "0";
  $("metricAvailable").textContent = "0";
  $("realtimeMetrics").classList.add("hidden");
  $("realtimeRpm").textContent = "-";
  $("realtimeTpm").textContent = "-";
  $("realtimeConcurrency").textContent = "- / -";
  $("realtimeWaiting").textContent = "-";
  $("realtimeMetricsStatus").textContent = "正在读取";
  $("realtimeMetricsStatus").className = "realtime-status";
  $("realtimeMetricsMeta").textContent = "等待容量快照";
  $("categoryFilters").innerHTML = "";
  $("refundFilters").innerHTML = "";
  $("paginationText").textContent = "0 条";
  $("statsTotal").textContent = "0";
  $("statsUsageAccounts").textContent = "0";
  $("statsRequests").textContent = "0";
  $("statsCost").textContent = "0.00";
  $("statsBillingTotal").textContent = "0.00";
  $("statsSettlementTotal").textContent = "0.00";
  $("statsDays").textContent = "0";
  $("statsUsers").textContent = "0";
  $("proxyAvailable").textContent = "-";
  $("proxyPoolDetail").textContent = "正在读取";
  $("recognizedCount").textContent = "识别 0 个账号";
  $("proxyAssignmentCount").textContent = "自带 0 · 池分配 0";
  ["loginError", "addError", "settingsFormError", "targetServerError", "addDefaultsError", "settlementRateError", "userFormError"].forEach((id) => {
    $(id).textContent = "";
  });
  clearTimeout($("toast")._timer);
  $("toast").textContent = "";
  $("toast").classList.remove("show", "error");
  $("bulkRaw").value = "";
  $("bulkProxies").value = "";
  $("accountSearch").value = "";
  $("archiveSearch").value = "";
  $("accountSort").value = "cost_desc";
  $("ownerFilter").value = "";
  $("archiveOwnerFilter").value = "";
  $("siteFilter").value = "";
  $("archiveSiteFilter").value = "";
  $("archiveFrom").value = "";
  $("archiveTo").value = "";
  $("archiveSort").value = "deleted_desc";
  $("statsUser").value = "";
  $("authStatsUser").value = "";
  $("accountFrom").value = todayText();
  $("accountTo").value = todayText();
  $("statsFrom").value = todayText();
  $("statsTo").value = todayText();
  $("authStatsFrom").value = todayText();
  $("authStatsTo").value = todayText();
  resetSettlementRateForm();
  if ($("accountDialog").open) $("accountDialog").close();
  if ($("requestDiagnosticsDialog")?.open) $("requestDiagnosticsDialog").close();
  if ($("accountNoteDialog").open) $("accountNoteDialog").close();
  if ($("reauthDialog").open) $("reauthDialog").close();
  if ($("priceDialog").open) $("priceDialog").close();
  if ($("settlementRateDialog").open) $("settlementRateDialog").close();
  settleConfirmation(false);
  $("accountLoading").classList.add("hidden");
  $("accountsEmpty").classList.add("hidden");
  $("statsEmpty").classList.add("hidden");
  $("authStatsLoading").classList.add("hidden");
  $("serverLoadEmpty").classList.add("hidden");
  $("activeJob").classList.add("hidden");
  $("activeBrowserAuth").classList.add("hidden");
  $("activeBatchAuth").classList.add("hidden");
  $("deleteJobPanel").classList.add("hidden");
  $("bulkDeleteTools").classList.add("hidden");
  $("accountSelectionTools").classList.add("hidden");
  $("refundTransitionTools").classList.add("hidden");
  $("refundedPurgeTools").classList.add("hidden");
  $("bulkDeleteJobPanel").classList.add("hidden");
  $("failedImportCopyTools").classList.add("hidden");
  $("cancelQueuedSkBatch").classList.add("hidden");
  state.failedImportLines = [];
  state.skAuthOriginalLinesByJob.clear();
  clearTimeout(state.authTimer);
  clearTimeout(state.reauthTimer);
  clearTimeout(state.batchAuthTimer);
  state.activeAuthId = null;
  state.activeAuth = null;
  state.singleAuthJobs = [];
  state.activeReauthId = null;
  state.activeReauth = null;
  state.reauthAccountId = null;
  state.activeBatchId = null;
  state.activeBatch = null;
  state.batchAuthJobs = [];
  state.accountSelection.clear();
  state.accountSelectionMeta.clear();
  state.pricePreviewSignature = "";
  state.priceHistoryAccountId = null;
  document.querySelectorAll(".view").forEach((node) => node.classList.toggle("active", node.id === "view-accounts"));
  document.querySelectorAll(".nav-item").forEach((node) => node.classList.toggle("active", node.dataset.view === "accounts"));
  $("homeAccountControls").classList.remove("hidden");
  $("archiveAccountControls").classList.add("hidden");
  $("pageTitle").textContent = viewMeta.accounts[0];
  $("pageMeta").textContent = viewMeta.accounts[1];
  $("appView").classList.remove("menu-open", "sidebar-collapsed");
  $("appView").classList.add("hidden");
  finishBoot();
  $("loginView").classList.remove("hidden");
  setTimeout(() => $("loginUsername").focus(), 0);
}

function roleLabel(role) {
  return role === "admin" ? "管理员" : "用户";
}

function siteLabel(siteId) {
  const site = state.sub2apiSites.find((item) => item.id === String(siteId || "main"));
  return site?.label || String(siteId || "main");
}

function siteOptions(selected = "main") {
  return state.sub2apiSites
    .filter((site) => site.enabled || site.id === selected)
    .map((site) => `<option value="${escapeHtml(site.id)}" ${site.id === selected ? "selected" : ""}>${escapeHtml(site.label)}${site.groupName ? ` · ${escapeHtml(site.groupName)}` : ""}</option>`)
    .join("");
}

function siteFilterOptions(selected = "") {
  return [
    `<option value="" ${selected ? "" : "selected"}>全部站点</option>`,
    ...state.sub2apiSites.map((site) => `<option value="${escapeHtml(site.id)}" ${site.id === selected ? "selected" : ""}>${escapeHtml(site.label)}${site.groupName ? ` · ${escapeHtml(site.groupName)}` : ""}</option>`),
  ].join("");
}

function selectedAddOwner() {
  if (state.user?.role !== "admin") return state.user;
  const selectId = state.addAuthMode === "batch"
    ? "batchOwner"
    : ["login", "setup_token"].includes(state.addAuthMode)
      ? "browserOwner"
      : "addOwner";
  const selectedId = Number($(selectId)?.value || state.user.id);
  return state.users.find((user) => Number(user.id) === selectedId) || state.user;
}

function quotaForSite(siteId) {
  const normalized = String(siteId || "main");
  const item = state.siteQuotas.find((quota) => String(quota.siteId || "main") === normalized);
  if (item) return item;
  if (String(state.quota.siteId || "") === normalized || normalized === "main") return state.quota;
  return { siteId: normalized, deficit: 0, reserved: 0, available: 0 };
}

function selectedAddQuota() {
  return quotaForSite(selectedAddOwner()?.siteId || state.user?.siteId || "main");
}

function syncDefaultAddAuthMode() {
  if (!state.user || state.addAuthModeExplicit) return;
  const siteId = selectedAddOwner()?.siteId || state.user.siteId || "main";
  setAddAuthMode(siteId === "main" ? "sk_auth" : "cookie", { explicit: false, refreshQuota: false });
}

function renderOnboardingProgress(siteId) {
  const admin = state.user?.role === "admin";
  const empty = { total: 0, queued: 0, awaitingAuthorization: 0, running: 0 };
  const site = state.onboardingProgress.find((item) => item.siteId === siteId) || empty;
  const filter = $("addProgressOwner");
  filter.classList.toggle("hidden", !admin);
  let progress = site;
  if (admin) {
    const selected = filter.dataset.siteId === siteId ? filter.value : "";
    const owners = state.users.filter((user) => (user.siteId || "main") === siteId
      || (site.byOwner || []).some((item) => Number(item.userId) === Number(user.id)));
    const options = '<option value="">站点全部用户</option>' + owners.map((user) =>
      `<option value="${user.id}">${escapeHtml(user.username)}</option>`).join("");
    if (filter.innerHTML !== options) filter.innerHTML = options;
    filter.dataset.siteId = siteId;
    filter.value = owners.some((user) => String(user.id) === selected) ? selected : "";
    if (filter.value) progress = (site.byOwner || []).find((item) => String(item.userId) === filter.value) || empty;
  }
  $("addReservedLabel").textContent = admin ? (filter.value ? "用户待完成" : "站点待完成") : "我的待完成";
  $("addReserved").textContent = formatNumber(progress.total);
  $("addProgressDetail").textContent = `排队 ${formatNumber(progress.queued)} · 等待授权 ${formatNumber(progress.awaitingAuthorization)} · 执行中 ${formatNumber(progress.running)}`;
}

function applyRoleVisibility() {
  syncWeeklyRole();
  const admin = state.user?.role === "admin";
  const costVisible = Boolean(state.user?.usageCostVisible);
  $("appView").classList.toggle("role-admin", admin);
  $("appView").classList.toggle("cost-visible-enabled", costVisible);
  document.querySelectorAll(".admin-only").forEach((node) => node.classList.toggle("hidden", !admin));
  document.querySelectorAll(".cost-visible").forEach((node) => node.classList.toggle("hidden", !costVisible));
  $("costSortOption").hidden = !costVisible;
  $("costSortOption").disabled = !costVisible;
  if (!costVisible && $("accountSort").value === "cost_desc") $("accountSort").value = "added_desc";
  if (!admin && ["users", "servers", "claude-sk", "request-quality", "request-ips"].includes(state.currentView)) switchView("accounts");
}

function showApp() {
  finishBoot();
  $("loginView").classList.add("hidden");
  $("sidebarUsername").textContent = state.user.username;
  $("sidebarRole").textContent = roleLabel(state.user.role);
  $("sidebarAvatar").textContent = state.user.username.slice(0, 1).toUpperCase();
  applyRoleVisibility();
  $("appView").classList.remove("hidden");
  renderQuota();
}

function renderQuota() {
  if (!state.user) return;
  syncDefaultAddAuthMode();
  const selectedQuota = selectedAddQuota();
  const selectedSiteId = selectedAddOwner()?.siteId || state.user.siteId || "main";
  $("topDeficit").textContent = `可补 ${formatNumber(selectedQuota.available)}`;
  $("topDeficit").title = state.user.role === "admin"
    ? `${siteLabel(selectedSiteId)}额度，前往设置调整`
    : `${siteLabel(selectedSiteId)}可补额度`;
  $("addAvailable").textContent = formatNumber(selectedQuota.available);
  renderOnboardingProgress(selectedSiteId);
  $("addDeficit").textContent = formatNumber(selectedQuota.deficit);
  $("metricAvailable").textContent = formatNumber(selectedQuota.available);
  $("addTargetServer").textContent = state.targetServer.label || state.targetServer.id || "自动分配";
  $("addTargetSite").textContent = siteLabel(selectedAddOwner()?.siteId);
  updateAddButton();
  updateBatchAuthButton();
}

async function refreshMe(renderApp = true) {
  const previousWeeklyRole = weeklyRoleKey();
  const previousRealtimeMetricsVisible = Boolean(state.user?.realtimeMetricsVisible);
  const data = await api("api/me");
  state.user = data.user;
  state.csrf = data.csrfToken;
  state.dailyDisplaySnapshotsEnabled = data.dailyDisplaySnapshotsEnabled === true;
  state.quota = data.siteQuota || data.quota || state.quota;
  if (Array.isArray(data.siteQuotas)) state.siteQuotas = data.siteQuotas;
  if (Array.isArray(data.onboardingProgress)) state.onboardingProgress = data.onboardingProgress;
  if (Array.isArray(data.sites) && data.sites.length) state.sub2apiSites = data.sites;
  state.targetServer = { ...state.targetServer, ...(data.targetServer || {}) };
  state.addDefaults = { ...state.addDefaults, ...(data.addDefaults || {}) };
  if (renderApp) showApp();
  else {
    if (previousWeeklyRole !== weeklyRoleKey()) applyRoleVisibility();
    renderQuota();
    if (!$("appView").classList.contains("hidden") && previousRealtimeMetricsVisible !== Boolean(state.user?.realtimeMetricsVisible)) {
      syncRealtimeMetricsRefresh();
    }
  }
}

async function login(event) {
  event.preventDefault();
  $("loginError").textContent = "";
  $("loginButton").disabled = true;
  $("loginButton").textContent = "登录中";
  try {
    const data = await api("api/login", {
      method: "POST",
      body: { username: $("loginUsername").value.trim(), password: $("loginPassword").value },
    });
    state.user = data.user;
    state.csrf = data.csrfToken;
    state.quota = data.siteQuota || data.quota || state.quota;
    if (Array.isArray(data.siteQuotas)) state.siteQuotas = data.siteQuotas;
    if (Array.isArray(data.onboardingProgress)) state.onboardingProgress = data.onboardingProgress;
    if (Array.isArray(data.sites) && data.sites.length) state.sub2apiSites = data.sites;
    state.targetServer = { ...state.targetServer, ...(data.targetServer || {}) };
    state.addDefaults = { ...state.addDefaults, ...(data.addDefaults || {}) };
    $("loginPassword").value = "";
    showBoot();
    await initializeData();
  } catch (error) {
    if ($("loginView").classList.contains("hidden")) showLogin();
    $("loginError").textContent = error.message;
  } finally {
    $("loginButton").disabled = false;
    $("loginButton").textContent = "登录";
  }
}

async function logout() {
  cancelWeekly();
  try {
    await api("api/logout", { method: "POST", body: {} });
  } catch (_) {
    // Local state is cleared even if the session already expired.
  }
  showLogin();
}

async function switchView(name) {
  if (!Object.prototype.hasOwnProperty.call(viewMeta, name)) name = "accounts";
  if (["users", "servers", "claude-sk", "request-quality", "request-ips"].includes(name) && state.user?.role !== "admin") name = "accounts";
  if (state.currentView === "request-ips" && name !== "request-ips") cancelRequestIPs();
  if (state.currentView === "account-errors" && name !== "account-errors") cancelErrorStats();
  if (state.currentView === "request-quality" && name !== "request-quality") cancelRequestQuality();
  const wasAccountView = ["accounts", "archive"].includes(state.currentView);
  const isAccountView = ["accounts", "archive"].includes(name);
  if (wasAccountView && !isAccountView) {
    state.accountAbortController?.abort();
    state.accountAbortController = null;
    state.accountRequestSerial += 1;
    state.accountWindowController?.abort();
  }
  if (isAccountView && (!wasAccountView || state.currentView !== name)) {
    state.category = "all";
    state.page = 1;
    state.accountSelection.clear();
    state.accountSelectionMeta.clear();
  }
  state.currentView = name;
  renderHomeTabs();
  cancelWeekly();
  const viewURL = new URL(window.location.href);
  viewURL.hash = name;
  window.history.replaceState(null, "", viewURL);
  syncRealtimeMetricsRefresh();
  const archive = name === "archive";
  $("homeAccountControls").classList.toggle("hidden", archive);
  $("archiveAccountControls").classList.toggle("hidden", !archive);
  const sectionName = name === "archive" ? "accounts" : name;
  document.querySelectorAll(".view").forEach((node) => node.classList.toggle("active", node.id === `view-${sectionName}`));
  document.querySelectorAll(".nav-item").forEach((node) => node.classList.toggle("active", node.dataset.view === name));
  const [title, meta] = viewMeta[name];
  $("pageTitle").textContent = title;
  $("pageMeta").textContent = meta;
  $("appView").classList.remove("menu-open");
  const tasks = [];
  if (isAccountView && !weeklyActive()) tasks.push(loadAccounts(), loadDeleteJobs());
  if (name === "accounts" && !weeklyActive()) tasks.push(loadRealtimeMetrics(), loadLivenessJobs());
  if (weeklyActive()) tasks.push(loadWeekly());
  if (name === "add") tasks.push(loadSettings(), loadJobs(), loadProxyPool(), loadAuthorizationJobs(true));
  if (name === "claude-sk" && state.user?.role === "admin") tasks.push(loadClaudeSkJobs());
  if (name === "users" && state.user?.role === "admin") tasks.push(loadUsers(), loadSettings());
  if (name === "servers" && state.user?.role === "admin") tasks.push(loadSettings(), loadServerLoad());
  if (name === "stats") tasks.push(loadStats());
  if (name === "request-quality") tasks.push(loadRequestQuality());
  if (name === "request-ips") tasks.push(loadRequestIPs());
  if (name === "auth-stats") tasks.push(loadAuthStats());
  if (name === "account-errors") tasks.push(loadErrorStats());
  await Promise.all(tasks);
}

async function loadUserOptions() {
  if (state.user?.role !== "admin") return;
  try {
    const data = await api("api/users/options");
    const existing = new Map(state.users.map((user) => [user.id, user]));
    state.users = data.items.map((user) => ({ ...existing.get(user.id), ...user }));
    if (Array.isArray(data.sites) && data.sites.length) state.sub2apiSites = data.sites;
    populateUserSelects();
    renderQuota();
  } catch (error) {
    if (!error.staleSession) toast(error.message, true);
  }
}

async function loadUsers(quiet = false) {
  if (state.user?.role !== "admin") return;
  try {
    const data = await api("api/users");
    state.users = data.items;
    if (Array.isArray(data.sites) && data.sites.length) state.sub2apiSites = data.sites;
    state.quota = data.siteQuota || data.quota || state.quota;
    if (Array.isArray(data.siteQuotas)) state.siteQuotas = data.siteQuotas;
    renderQuota();
    renderUsers();
    populateUserSelects();
    $("newSiteId").innerHTML = siteOptions($("newSiteId").value || "main");
    renderQuota();
  } catch (error) {
    if (!quiet) toast(error.message, true);
  }
}

async function loadSettings(quiet = false) {
  if (!state.user) return;
  try {
    const data = await api("api/settings");
    state.quota = data.siteQuota || data.quota || state.quota;
    if (Array.isArray(data.siteQuotas)) state.siteQuotas = data.siteQuotas;
    if (Array.isArray(data.onboardingProgress)) state.onboardingProgress = data.onboardingProgress;
    state.targetServer = { ...state.targetServer, ...(data.targetServer || {}) };
    state.addDefaults = { ...state.addDefaults, ...(data.addDefaults || {}) };
    if (Array.isArray(data.sites) && data.sites.length) state.sub2apiSites = data.sites;
    state.sub2apiCapacityAutomation = {
      ...state.sub2apiCapacityAutomation,
      ...(data.sub2apiCapacityAutomation || {}),
    };
    if (Array.isArray(data.sub2apiSiteControls)) {
      state.sub2apiSiteControls = data.sub2apiSiteControls.map((item) => ({ ...item }));
    }
    renderQuota();
    renderSettings();
  } catch (error) {
    if (!quiet) toast(error.message, true);
  }
}

function settlementRateContextIsCurrent(userId, dialogSerial) {
  return state.user?.role === "admin" && $("settlementRateDialog").open
    && Number(state.settlementRates.userId) === userId
    && state.settlementRateDialogSerial === dialogSerial;
}

async function loadSettlementRates(quiet = false) {
  const userId = Number(state.settlementRates.userId);
  if (state.user?.role !== "admin" || !userId) return;
  const dialogSerial = state.settlementRateDialogSerial;
  const requestSerial = ++state.settlementRateRequestSerial;
  const isCurrent = () => settlementRateContextIsCurrent(userId, dialogSerial) && requestSerial === state.settlementRateRequestSerial;
  try {
    const data = await api(`api/admin/settlement-rates?user_id=${encodeURIComponent(userId)}`);
    if (!isCurrent()) return;
    if (Number(data.userId) !== userId) throw new Error("结算用户不匹配，请刷新后重试");
    state.settlementRates = {
      userId: Number(data.userId),
      username: data.username || "",
      timezone: data.timezone || "Asia/Shanghai",
      defaults: data.defaults || null,
      current: data.current || null,
      scheduled: Array.isArray(data.scheduled) ? data.scheduled : [],
      history: Array.isArray(data.history) ? data.history : [],
    };
    $("settlementRateError").textContent = "";
    renderSettlementRates();
    fillSettlementRateForm();
  } catch (error) {
    if (!quiet && isCurrent()) {
      $("settlementRateError").textContent = error.message;
      toast(error.message, true);
    }
  }
}

function settlementScheduledRow(rule) {
  return `
    <div class="settlement-rule-row settlement-scheduled-grid">
      <span data-label="生效时间" class="settlement-rule-effective"><strong>${escapeHtml(formatSettlementDateTime(rule.effectiveFrom))}</strong></span>
      <span data-label="结算方式 / 价格" class="settlement-rule-price"><strong>${rule.settlementMode === "account" ? "按上号" : "按用量"}</strong><span>${escapeHtml(settlementRuleDescription(rule))}</span></span>
      <span data-label="备注" class="settlement-rule-note" title="${escapeHtml(rule.note || "")}">${escapeHtml(rule.note || "-")}</span>
      <span data-label="创建时间" class="settlement-rule-created">${escapeHtml(formatFullDateTime(rule.createdAt))}</span>
      <button class="danger compact cancel-settlement-rate" type="button" data-rule-id="${escapeHtml(rule.id)}" data-effective-from="${escapeHtml(rule.effectiveFrom || "")}">取消</button>
    </div>`;
}

function settlementHistoryRow(rule) {
  const [statusLabel, statusClass] = settlementRateStatus(rule.status);
  return `
    <div class="settlement-rule-row settlement-history-grid">
      <span data-label="生效时间" class="settlement-rule-effective"><strong>${escapeHtml(formatSettlementDateTime(rule.effectiveFrom))}</strong></span>
      <span data-label="结算方式 / 价格" class="settlement-rule-price"><strong>${rule.settlementMode === "account" ? "按上号" : "按用量"}</strong><span>${escapeHtml(settlementRuleDescription(rule))}</span></span>
      <span data-label="备注" class="settlement-rule-note" title="${escapeHtml(rule.note || "")}">${escapeHtml(rule.note || "-")}</span>
      <span data-label="状态"><span class="status-badge ${statusClass}">${escapeHtml(statusLabel)}</span></span>
      <span data-label="创建时间" class="settlement-rule-created">${escapeHtml(formatFullDateTime(rule.createdAt))}</span>
    </div>`;
}

function renderSettlementRates() {
  if (state.user?.role !== "admin") return;
  const rates = state.settlementRates;
  const current = currentSettlementRule();
  $("settlementRateUsername").textContent = rates.username || "-";
  $("settlementRateTitle").textContent = `${rates.username || "用户"} 结算设置`;
  $("settlementRateTimezone").textContent = rates.timezone || "Asia/Shanghai";
  $("settlementCurrentMode").textContent = current ? (current.settlementMode === "account" ? "按上号" : "按用量") : "读取中";
  $("settlementCurrentFactor").textContent = settlementRuleDescription(current);
  $("settlementCurrentEffectiveFrom").textContent = rates.current ? formatSettlementDateTime(rates.current.effectiveFrom) : (current ? "默认规则" : "-");

  const scheduled = [...rates.scheduled].sort((left, right) => settlementDateTimeInput(left.effectiveFrom || "").localeCompare(settlementDateTimeInput(right.effectiveFrom || "")));
  const history = [...rates.history].sort((left, right) => settlementDateTimeInput(right.effectiveFrom || "").localeCompare(settlementDateTimeInput(left.effectiveFrom || "")));
  $("settlementScheduledList").innerHTML = scheduled.map(settlementScheduledRow).join("");
  $("settlementHistoryList").innerHTML = history.map(settlementHistoryRow).join("");
  $("settlementScheduledEmpty").classList.toggle("hidden", scheduled.length > 0);
  $("settlementHistoryEmpty").classList.toggle("hidden", history.length > 0);
}

async function saveSettlementRate(event) {
  event.preventDefault();
  if (state.user?.role !== "admin") return;
  const userId = Number(state.settlementRates.userId);
  const dialogSerial = state.settlementRateDialogSerial;
  const isCurrent = () => settlementRateContextIsCurrent(userId, dialogSerial);
  if (!userId || !isCurrent()) return;
  const form = event.currentTarget;
  const button = $("saveSettlementRate");
  const effectiveFrom = $("settlementEffectiveFrom").value;
  const factor = $("settlementFactor").value.trim();
  const settlementMode = $("settlementMode").value;
  const accountPriceType = $("settlementAccountPriceType").value;
  const accountUnitPrice = $("settlementAccountUnitPrice").value.trim();
  $("settlementRateError").textContent = "";
  updateSettlementRateFields();
  if (!form.reportValidity()) return;
  if (settlementMode === "usage" && (!factor || !Number.isFinite(Number(factor)) || Number(factor) < 0)) {
    $("settlementRateError").textContent = "结算倍率必须是大于或等于 0 的有效数字";
    return;
  }
  const body = { userId, effectiveFrom, settlementMode, note: $("settlementNote").value.trim() };
  if (settlementMode === "usage") body.factor = factor;
  else {
    body.accountPriceType = accountPriceType;
    const validPrice = (value) => value !== "" && Number.isFinite(Number(value)) && Number(value) >= 0 && Number(value) <= 1000000;
    if (accountPriceType === "fixed") {
      if (!validPrice(accountUnitPrice)) {
        $("settlementRateError").textContent = "每号价格必须为 0 至 1000000 之间的有效金额，最多两位小数";
        return;
      }
      body.accountUnitPrice = accountUnitPrice;
    } else if (accountPriceType === "subscription") {
      const prices = Object.fromEntries(["5x", "20x"].map((tag) => [tag, $(`settlementSubscriptionPrice${tag}`).value.trim()]));
      if (Object.values(prices).some((value) => !validPrice(value) || !/^(?:\d+|\d*\.\d{1,2})$/.test(value))) {
        $("settlementRateError").textContent = "5x 和 20x 单价均须为 0 至 1000000 之间的有效金额，最多两位小数";
        return;
      }
      body.accountSubscriptionPrices = prices;
    } else {
      const tiers = readSettlementTierInputs();
      const invalid = tiers.length === 0 || tiers.length > 32 || tiers.some((tier, index) => {
        const previous = tiers[index - 1];
        return (index === tiers.length - 1 ? tier.upToHours !== null : (!tier.upToHours || !Number.isFinite(Number(tier.upToHours)) || Number(tier.upToHours) <= Number(previous?.upToHours || 0)))
          || ["5x", "20x"].some((tag) => !validPrice(tier.prices[tag]) || (previous && Number(tier.prices[tag]) < Number(previous.prices[tag])));
      });
      if (invalid) {
        $("settlementRateError").textContent = "时段上限必须依次增大；每号价格须为 0 至 1000000 的金额，且随存活时长递增或保持不变";
        return;
      }
      body.accountTiers = tiers;
    }
  }
  const idleLabel = button.textContent;
  button.disabled = true;
  button.textContent = "保存中";
  try {
    await api("api/admin/settlement-rates", {
      method: "POST",
      body,
    });
    if (!isCurrent()) return;
    state.settlementRateFormDirty = false;
    $("settlementNote").value = "";
    $("settlementEffectiveFrom").value = settlementDateTimeInput();
    await loadSettlementRates(true);
    if (isCurrent()) toast("结算规则已保存");
  } catch (error) {
    if (isCurrent()) $("settlementRateError").textContent = error.message;
  } finally {
    if (isCurrent()) {
      button.disabled = false;
      button.textContent = idleLabel;
    }
  }
}

async function cancelSettlementRate(event) {
  const button = event.target.closest(".cancel-settlement-rate");
  if (!button || state.user?.role !== "admin") return;
  const userId = Number(state.settlementRates.userId);
  const dialogSerial = state.settlementRateDialogSerial;
  const isCurrent = () => settlementRateContextIsCurrent(userId, dialogSerial);
  const ruleId = button.dataset.ruleId;
  if (!ruleId) return;
  const accepted = await confirmAction({
    title: "取消结算规则排期",
    message: `确认取消生效时间为 ${formatSettlementDateTime(button.dataset.effectiveFrom)}（北京时间）的结算规则排期？`,
    confirmLabel: "取消排期",
    danger: true,
  });
  if (!accepted || !isCurrent()) return;
  try {
    await runButtonTask(button, "取消中", async () => {
      await api(`api/admin/users/${encodeURIComponent(userId)}/settlement-rates/${encodeURIComponent(ruleId)}`, { method: "DELETE" });
      if (isCurrent()) await loadSettlementRates(true);
    });
    if (isCurrent()) toast("结算规则排期已取消");
  } catch (error) {
    if (isCurrent()) {
      $("settlementRateError").textContent = error.message;
      toast(error.message, true);
    }
  }
}

function sub2apiThresholdPercent(value, fallback) {
  const ratio = Number(value);
  const normalized = Number.isFinite(ratio) ? ratio : fallback;
  return String(Number((normalized * 100).toFixed(4)));
}

function sub2apiThresholdValues(item, siteId) {
  // Prefer the per-site API shape; flat fields keep rolling upgrades readable.
  const capacityAutomation = item.capacityAutomation || {};
  const fallbackThreshold = siteId === "main"
    ? Number(state.sub2apiCapacityAutomation.threshold ?? 0.35)
    : 0.35;
  const fallbackScaleDownThreshold = siteId === "main"
    ? Number(state.sub2apiCapacityAutomation.scaleDownThreshold ?? 0.15)
    : 0.15;
  return state.sub2apiSiteThresholdDrafts.get(siteId) || {
    threshold: sub2apiThresholdPercent(
      capacityAutomation.threshold ?? item.threshold,
      fallbackThreshold,
    ),
    scaleDownThreshold: sub2apiThresholdPercent(
      capacityAutomation.scaleDownThreshold ?? item.scaleDownThreshold,
      fallbackScaleDownThreshold,
    ),
  };
}

function renderSub2apiSiteControls() {
  const items = state.sub2apiSiteControls.length
    ? state.sub2apiSiteControls
    : state.sub2apiSites.map((site) => ({
        siteId: site.id,
        label: site.label,
        groupName: site.groupName || "",
        siteEnabled: site.enabled !== false,
        dataSourceAvailable: true,
        automationEnabled: site.id === "main" ? state.sub2apiCapacityAutomation.enabled !== false : false,
        capacityAutomation: site.id === "main"
          ? { ...state.sub2apiCapacityAutomation }
          : { enabled: false, threshold: 0.35, scaleDownThreshold: 0.15 },
        newAccountSchedulable: site.id === "main" ? state.addDefaults.sub2apiSchedulable !== false : false,
      }));
  $("sub2apiSiteControlsList").innerHTML = items.map((item) => {
    const siteId = String(item.siteId || "main");
    const automationBusy = state.sub2apiSiteControlBusy.has(`${siteId}:automation`);
    const thresholdsBusy = state.sub2apiSiteControlBusy.has(`${siteId}:thresholds`);
    const newAccountBusy = state.sub2apiSiteControlBusy.has(`${siteId}:new-account`);
    const thresholds = sub2apiThresholdValues(item, siteId);
    const unavailable = item.siteEnabled === false || item.dataSourceAvailable === false;
    const automationDisabled = automationBusy || (unavailable && item.automationEnabled !== true);
    const newAccountDisabled = newAccountBusy || (unavailable && item.newAccountSchedulable !== true);
    const status = item.siteEnabled === false
      ? "站点已停用"
      : (item.dataSourceAvailable === false ? "数据源不可用" : (item.groupName || "已连接"));
    return `
      <div class="sub2api-site-control-row" data-site-id="${escapeHtml(siteId)}">
        <div class="sub2api-site-control-identity">
          <strong>${escapeHtml(item.label || siteId)}</strong>
          <span>${escapeHtml(siteId)} · ${escapeHtml(status)}</span>
        </div>
        <label class="toggle-label sub2api-site-control-toggle">
          <input class="site-automation-toggle" type="checkbox" role="switch" data-control="automation" ${item.automationEnabled ? "checked" : ""} ${automationDisabled ? "disabled" : ""}>
          <span>自动编排：${item.automationEnabled ? "开启" : "关闭"}</span>
        </label>
        <form class="sub2api-site-threshold-form" data-threshold-form novalidate ${thresholdsBusy ? 'aria-busy="true"' : ""}>
          <label class="sub2api-site-threshold-field">
            <span>扩容</span>
            <input class="site-threshold-input" name="threshold" type="number" min="1" max="100" step="0.1" inputmode="decimal" value="${escapeHtml(thresholds.threshold)}" aria-label="${escapeHtml(item.label || siteId)}扩容阈值百分比" ${thresholdsBusy ? "disabled" : ""}>
            <span aria-hidden="true">%</span>
          </label>
          <label class="sub2api-site-threshold-field">
            <span>缩容</span>
            <input class="site-threshold-input" name="scaleDownThreshold" type="number" min="0" max="99" step="0.1" inputmode="decimal" value="${escapeHtml(thresholds.scaleDownThreshold)}" aria-label="${escapeHtml(item.label || siteId)}缩容阈值百分比" ${thresholdsBusy ? "disabled" : ""}>
            <span aria-hidden="true">%</span>
          </label>
          <button class="secondary compact site-threshold-save" type="submit" ${thresholdsBusy ? "disabled" : ""}>${thresholdsBusy ? "保存中" : "保存"}</button>
        </form>
        <label class="toggle-label sub2api-site-control-toggle site-new-account-control">
          <input class="site-new-account-toggle" type="checkbox" role="switch" data-control="new-account" ${item.newAccountSchedulable ? "checked" : ""} ${newAccountDisabled ? "disabled" : ""}>
          <span>新账号：${item.newAccountSchedulable ? "参与调度" : "暂停调度"}</span>
        </label>
      </div>`;
  }).join("");
}

function updateSub2apiThresholdDraft(event) {
  const input = event.target.closest(".site-threshold-input");
  if (!input || state.user?.role !== "admin") return;
  const row = input.closest("[data-site-id]");
  const siteId = String(row?.dataset.siteId || "");
  if (!siteId) return;
  const form = input.closest("[data-threshold-form]");
  state.sub2apiSiteThresholdDrafts.set(siteId, {
    threshold: form.elements.threshold.value,
    scaleDownThreshold: form.elements.scaleDownThreshold.value,
  });
  form.elements.threshold.removeAttribute("aria-invalid");
  form.elements.scaleDownThreshold.removeAttribute("aria-invalid");
  $("sub2apiSiteControlsError").textContent = "";
}

async function saveSub2apiThresholds(event) {
  event.preventDefault();
  if (state.user?.role !== "admin") return;
  const form = event.target.closest("[data-threshold-form]");
  const row = form?.closest("[data-site-id]");
  const siteId = String(row?.dataset.siteId || "");
  const item = state.sub2apiSiteControls.find((candidate) => String(candidate.siteId) === siteId);
  if (!form || !siteId || !item) return;

  const thresholdInput = form.elements.threshold;
  const scaleDownInput = form.elements.scaleDownThreshold;
  const thresholdPercent = thresholdInput.valueAsNumber;
  const scaleDownPercent = scaleDownInput.valueAsNumber;
  const errorNode = $("sub2apiSiteControlsError");
  thresholdInput.removeAttribute("aria-invalid");
  scaleDownInput.removeAttribute("aria-invalid");
  errorNode.textContent = "";

  if (!Number.isFinite(thresholdPercent) || thresholdPercent < 1 || thresholdPercent > 100) {
    thresholdInput.setAttribute("aria-invalid", "true");
    errorNode.textContent = `${item.label || siteId}：扩容阈值必须在 1% 到 100% 之间`;
    thresholdInput.focus();
    return;
  }
  if (!Number.isFinite(scaleDownPercent) || scaleDownPercent < 0 || scaleDownPercent > 99) {
    scaleDownInput.setAttribute("aria-invalid", "true");
    errorNode.textContent = `${item.label || siteId}：缩容阈值必须在 0% 到 99% 之间`;
    scaleDownInput.focus();
    return;
  }
  if (thresholdPercent - scaleDownPercent < 1 - 1e-9) {
    thresholdInput.setAttribute("aria-invalid", "true");
    scaleDownInput.setAttribute("aria-invalid", "true");
    errorNode.textContent = `${item.label || siteId}：缩容阈值必须比扩容阈值至少低 1 个百分点`;
    scaleDownInput.focus();
    return;
  }

  const busyKey = `${siteId}:thresholds`;
  state.sub2apiSiteThresholdDrafts.set(siteId, {
    threshold: String(thresholdPercent),
    scaleDownThreshold: String(scaleDownPercent),
  });
  state.sub2apiSiteControlBusy.add(busyKey);
  renderSub2apiSiteControls();
  try {
    const data = await api("api/settings/sub2api-capacity-automation", {
      method: "PATCH",
      body: {
        siteId,
        threshold: thresholdPercent / 100,
        scaleDownThreshold: scaleDownPercent / 100,
      },
    });
    const saved = data.sub2apiCapacityAutomation || {};
    const savedThreshold = typeof saved.threshold === "number" ? saved.threshold : Number.NaN;
    const savedScaleDownThreshold = typeof saved.scaleDownThreshold === "number"
      ? saved.scaleDownThreshold
      : Number.NaN;
    if (
      !Number.isFinite(savedThreshold)
      || !Number.isFinite(savedScaleDownThreshold)
      || savedThreshold <= 0
      || savedThreshold > 1
      || savedScaleDownThreshold < 0
      || savedScaleDownThreshold > 0.99
      || savedThreshold - savedScaleDownThreshold < 0.01 - 1e-12
    ) {
      throw new Error("服务器返回的自动编排阈值无效");
    }
    const currentItem = state.sub2apiSiteControls.find(
      (candidate) => String(candidate.siteId) === siteId,
    ) || item;
    currentItem.capacityAutomation = {
      ...(currentItem.capacityAutomation || {}),
      threshold: savedThreshold,
      scaleDownThreshold: savedScaleDownThreshold,
    };
    if (siteId === "main") {
      state.sub2apiCapacityAutomation.threshold = savedThreshold;
      state.sub2apiCapacityAutomation.scaleDownThreshold = savedScaleDownThreshold;
    }
    state.sub2apiSiteThresholdDrafts.delete(siteId);
    toast(`${currentItem.label || siteId}：扩容阈值 ${sub2apiThresholdPercent(savedThreshold, 0.35)}%，缩容阈值 ${sub2apiThresholdPercent(savedScaleDownThreshold, 0.15)}%`);
  } catch (error) {
    errorNode.textContent = error.message;
    toast(error.message, true);
  } finally {
    state.sub2apiSiteControlBusy.delete(busyKey);
    renderSub2apiSiteControls();
  }
}

function renderSettings() {
  if (state.user?.role !== "admin") return;
  renderSiteQuotaSettings();
  if (document.activeElement !== $("targetServer")) {
    const options = state.targetServer.options || [];
    const selected = state.targetServer.id || "";
    const values = new Set(options.map((item) => String(item.id)));
    const rows = [`<option value="">自动分配</option>`];
    if (selected && !values.has(selected)) {
      rows.push(`<option value="${escapeHtml(selected)}">${escapeHtml(state.targetServer.label || selected)}（不可用）</option>`);
    }
    rows.push(...options.map((item) => `<option value="${escapeHtml(item.id)}">${escapeHtml(item.label)} · ${formatNumber(item.vmCount)} 个资源单元</option>`));
    $("targetServer").innerHTML = rows.join("");
    $("targetServer").value = selected;
  }
  if (document.activeElement !== $("defaultSub2apiConcurrency")) {
    $("defaultSub2apiConcurrency").value = String(state.addDefaults.sub2apiConcurrency ?? 8);
  }
  if (document.activeElement !== $("defaultIsthmusMaxProcs")) {
    $("defaultIsthmusMaxProcs").value = String(state.addDefaults.isthmusMaxProcs ?? 10);
  }
  renderSub2apiSiteControls();
}

function renderSiteQuotaSettings() {
  const list = $("siteQuotaSettingsList");
  if (!list) return;
  const items = state.siteQuotas.length
    ? state.siteQuotas
    : [{ siteId: "main", ...state.quota }];
  list.innerHTML = items.map((quota) => {
    const siteId = String(quota.siteId || "main");
    const inputId = siteId === "main" ? "globalDeficit" : `siteDeficit-${siteId}`;
    const busy = state.sub2apiSiteControlBusy.has(`${siteId}:quota`);
    const topupBusy = state.sub2apiSiteControlBusy.has(`${siteId}:quota-topup`);
    const control = state.sub2apiSiteControls.find(
      (item) => String(item.siteId || "main") === siteId,
    ) || {};
    const topup = control.quotaAutoTopup || {
      enabled: siteId === "main",
      targetDeficit: siteId === "main" ? 20 : 0,
    };
    const label = siteLabel(siteId);
    return `
      <div class="site-quota-setting-row" data-site-id="${escapeHtml(siteId)}">
        <div class="site-quota-setting-identity">
          <strong>${escapeHtml(label)}</strong>
          <span>${escapeHtml(siteId)} · 可补 ${formatNumber(quota.available)}</span>
        </div>
        <div class="site-quota-setting-stats">
          <span>处理中 ${formatNumber(quota.reserved)}</span>
          <span>当前缺口 ${formatNumber(quota.deficit)}</span>
        </div>
        <label class="site-quota-setting-input">
          <span>设定缺口</span>
          <input id="${escapeHtml(inputId)}" data-site-quota-input type="number" min="0" max="1000000" value="${escapeHtml(String(quota.deficit ?? 0))}" ${busy ? "disabled" : ""}>
        </label>
        <button class="secondary compact site-quota-save" data-site-quota-save type="button" ${busy ? "disabled" : ""}>${busy ? "保存中" : "保存"}</button>
        <div class="site-quota-topup" data-site-quota-topup>
          <label class="toggle-label"><input type="checkbox" data-quota-topup-enabled ${topup.enabled ? "checked" : ""} ${topupBusy ? "disabled" : ""}><span>自动补缺口</span></label>
          <label class="site-quota-topup-target"><span>目标</span><input type="number" min="0" max="1000000" data-quota-topup-target value="${escapeHtml(String(topup.targetDeficit ?? 0))}" ${topupBusy ? "disabled" : ""}></label>
          <button class="secondary compact" data-site-quota-topup-save type="button" ${topupBusy ? "disabled" : ""}>${topupBusy ? "保存中" : "保存自动补充"}</button>
        </div>
      </div>`;
  }).join("");
}

async function saveGlobalSettings(event) {
  event.preventDefault();
  const activeRow = document.activeElement?.closest?.("[data-site-id]");
  await saveSiteQuota(activeRow?.dataset.siteId || "main");
}

async function saveSiteQuota(siteId) {
  const normalized = String(siteId || "main");
  const input = document.querySelector(`[data-site-id="${CSS.escape(normalized)}"] [data-site-quota-input]`);
  if (!input) return;
  const value = input.valueAsNumber;
  const errorNode = $("settingsFormError");
  errorNode.textContent = "";
  if (!Number.isInteger(value) || value < 0 || value > 1000000) {
    errorNode.textContent = `${siteLabel(normalized)}：缺口必须是 0 到 1000000 的整数`;
    input.focus();
    return;
  }
  const busyKey = `${normalized}:quota`;
  state.sub2apiSiteControlBusy.add(busyKey);
  renderSiteQuotaSettings();
  try {
    const data = await api("api/quota", {
      method: "PATCH",
      body: { siteId: normalized, deficit: value },
    });
    if (Array.isArray(data.siteQuotas)) state.siteQuotas = data.siteQuotas;
    state.quota = quotaForSite(state.user?.role === "admin" ? "main" : state.user?.siteId);
    renderQuota();
    renderSettings();
    toast(`${siteLabel(normalized)}缺口已保存`);
  } catch (error) {
    errorNode.textContent = error.message;
  } finally {
    state.sub2apiSiteControlBusy.delete(busyKey);
    renderSiteQuotaSettings();
  }
}

async function saveSiteQuotaAutoTopup(siteId) {
  const normalized = String(siteId || "main");
  const row = document.querySelector(`[data-site-id="${CSS.escape(normalized)}"]`);
  if (!row) return;
  const enabled = row.querySelector("[data-quota-topup-enabled]")?.checked === true;
  const targetInput = row.querySelector("[data-quota-topup-target]");
  const targetDeficit = targetInput?.valueAsNumber;
  const errorNode = $("settingsFormError");
  errorNode.textContent = "";
  if (!Number.isInteger(targetDeficit) || targetDeficit < 0 || targetDeficit > 1000000) {
    errorNode.textContent = `${siteLabel(normalized)}：自动补充目标必须是 0 到 1000000 的整数`;
    targetInput?.focus();
    return;
  }
  const busyKey = `${normalized}:quota-topup`;
  state.sub2apiSiteControlBusy.add(busyKey);
  renderSiteQuotaSettings();
  try {
    const data = await api("api/settings/sub2api-quota-auto-topup", {
      method: "PATCH",
      body: { siteId: normalized, enabled, targetDeficit },
    });
    const saved = data.quotaAutoTopup;
    const item = state.sub2apiSiteControls.find(
      (candidate) => String(candidate.siteId || "main") === normalized,
    );
    if (item && saved) item.quotaAutoTopup = saved;
    renderSettings();
    toast(`${siteLabel(normalized)}自动补缺口配置已保存`);
  } catch (error) {
    errorNode.textContent = error.message;
  } finally {
    state.sub2apiSiteControlBusy.delete(busyKey);
    renderSiteQuotaSettings();
  }
}

async function saveTargetServer(event) {
  event.preventDefault();
  $("targetServerError").textContent = "";
  const button = event.currentTarget.querySelector("button[type=submit]");
  const idleLabel = button.textContent;
  button.disabled = true;
  button.textContent = "保存中";
  try {
    const data = await api("api/settings/target-server", {
      method: "PATCH",
      body: { serverId: $("targetServer").value },
    });
    state.targetServer = data.targetServer;
    renderQuota();
    renderSettings();
    toast("新账号目标服务器已保存");
  } catch (error) {
    $("targetServerError").textContent = error.message;
  } finally {
    button.disabled = false;
    button.textContent = idleLabel;
  }
}

async function saveAddDefaults(event) {
  event.preventDefault();
  $("addDefaultsError").textContent = "";
  const button = event.currentTarget.querySelector("button[type=submit]");
  const idleLabel = button.textContent;
  button.disabled = true;
  button.textContent = "保存中";
  try {
    const data = await api("api/settings/add-defaults", {
      method: "PATCH",
      body: {
        sub2apiConcurrency: Number($("defaultSub2apiConcurrency").value),
        isthmusMaxProcs: Number($("defaultIsthmusMaxProcs").value),
      },
    });
    state.addDefaults = data.addDefaults;
    renderSettings();
    toast("上号配置已保存，新任务将使用当前配置");
  } catch (error) {
    $("addDefaultsError").textContent = error.message;
  } finally {
    button.disabled = false;
    button.textContent = idleLabel;
  }
}

async function saveSub2apiSiteControl(event) {
  const input = event.target.closest("input[data-control]");
  if (!input || state.user?.role !== "admin") return;
  const row = input.closest("[data-site-id]");
  const siteId = String(row?.dataset.siteId || "");
  const item = state.sub2apiSiteControls.find((candidate) => String(candidate.siteId) === siteId);
  if (!siteId || !item) return;
  const control = input.dataset.control;
  const isAutomation = control === "automation";
  if (!["automation", "new-account"].includes(control)) return;
  const field = isAutomation ? "automationEnabled" : "newAccountSchedulable";
  const endpoint = isAutomation
    ? "api/settings/sub2api-capacity-automation"
    : "api/settings/sub2api-new-account-schedulable";
  const previous = item[field] === true;
  const enabled = input.checked;
  const busyKey = `${siteId}:${control}`;
  $("sub2apiSiteControlsError").textContent = "";
  state.sub2apiSiteControlBusy.add(busyKey);
  renderSub2apiSiteControls();
  try {
    const data = await api(endpoint, {
      method: "PATCH",
      body: { siteId, enabled },
    });
    const saved = isAutomation
      ? data.sub2apiCapacityAutomation?.enabled
      : data.sub2apiNewAccountSchedulable?.enabled;
    item[field] = saved === true;
    if (isAutomation) {
      item.capacityAutomation = {
        ...(item.capacityAutomation || {}),
        enabled: item[field],
      };
    }
    if (siteId === "main") {
      if (isAutomation) state.sub2apiCapacityAutomation.enabled = item[field];
      else state.addDefaults.sub2apiSchedulable = item[field];
    }
    const action = isAutomation
      ? `自动编排已${item[field] ? "开启" : "关闭"}`
      : `新账号已设为默认${item[field] ? "参与调度" : "暂停调度"}`;
    toast(`${item.label || siteId}：${action}`);
  } catch (error) {
    item[field] = previous;
    $("sub2apiSiteControlsError").textContent = error.message;
    toast(error.message, true);
  } finally {
    state.sub2apiSiteControlBusy.delete(busyKey);
    renderSub2apiSiteControls();
  }
}


function userOptions(selected = "", includeAll = false, includeUnassigned = false) {
  const rows = [];
  if (includeAll) rows.push(`<option value="">全部用户</option>`);
  if (includeUnassigned) rows.push(`<option value="unassigned">未分配</option>`);
  for (const user of state.users.filter((item) => item.active)) {
    rows.push(`<option value="${user.id}" ${String(selected) === String(user.id) ? "selected" : ""}>${escapeHtml(user.username)} · ${escapeHtml(siteLabel(user.siteId))}</option>`);
  }
  return rows.join("");
}

function populateUserSelects() {
  if (state.user?.role !== "admin") return;
  const ownerSelected = $("ownerFilter").value;
  $("ownerFilter").innerHTML = userOptions(ownerSelected, true, true);
  const archiveOwnerSelected = $("archiveOwnerFilter").value;
  $("archiveOwnerFilter").innerHTML = userOptions(archiveOwnerSelected, true, true);
  const siteSelected = $("siteFilter").value;
  $("siteFilter").innerHTML = siteFilterOptions(siteSelected);
  const archiveSiteSelected = $("archiveSiteFilter").value;
  $("archiveSiteFilter").innerHTML = siteFilterOptions(archiveSiteSelected);
  const addSelected = $("addOwner").value || String(state.user.id);
  $("addOwner").innerHTML = userOptions(addSelected);
  const browserSelected = $("browserOwner").value || String(state.user.id);
  $("browserOwner").innerHTML = userOptions(browserSelected);
  const batchSelected = $("batchOwner").value || String(state.user.id);
  $("batchOwner").innerHTML = userOptions(batchSelected);
  const claudeSkSelected = $("claudeSkOwner").value || String(state.user.id);
  $("claudeSkOwner").innerHTML = userOptions(claudeSkSelected);
  const statsSelected = $("statsUser").value;
  $("statsUser").innerHTML = userOptions(statsSelected, true, false);
  const authStatsSelected = $("authStatsUser").value;
  $("authStatsUser").innerHTML = userOptions(authStatsSelected, true, false);
  const detailSelected = state.detailAccount?.owner?.id || state.user.id;
  $("detailOwner").innerHTML = userOptions(detailSelected);
}

function renderUsers() {
  if (state.user?.role !== "admin") return;
  $("usersBody").innerHTML = state.users.map((user) => `
    <tr data-user-id="${user.id}">
      <td><strong>${escapeHtml(user.username)}</strong></td>
      <td>${roleLabel(user.role)}</td>
      <td><select class="user-site">${siteOptions(user.siteId)}</select></td>
      <td class="numeric">${formatNumber(user.accounts)}</td>
      <td class="numeric">${formatNumber(user.addedToday)}</td>
      <td class="numeric cost">${formatAmount(user.accountCost)}</td>
      <td>${userPriorityControls(user)}</td>
      <td>${usageFactorControl(user)}</td>
      <td>${realtimeMetricsControl(user)}</td>
      <td><label class="toggle-label"><input class="user-active" type="checkbox" ${user.active ? "checked" : ""} ${user.id === state.user.id ? "disabled" : ""}>${user.active ? "启用" : "停用"}</label></td>
      <td><input class="password-input user-password" type="password" placeholder="留空不修改"></td>
      <td><div class="user-row-actions"><button class="secondary compact edit-runtime-config" type="button">运行配置${Object.values(user.runtimeConfig || {}).some((value) => value !== null && value !== undefined) ? " · 已设置" : ""}</button><button class="secondary compact edit-settlement-rate" type="button">结算设置</button><button class="secondary compact save-user" type="button">保存</button></div></td>
    </tr>
  `).join("");
  $("usersMobile").innerHTML = state.users.map((user) => `
    <article class="user-card" data-user-id="${user.id}">
      <div class="card-head"><strong>${escapeHtml(user.username)}</strong><span class="status-badge ${user.active ? "status-healthy" : "status-error"}">${user.active ? "启用" : "停用"}</span></div>
      <div class="card-grid">
        <div class="card-field"><span>角色</span><span>${roleLabel(user.role)}</span></div>
        <label><span>上号站点</span><select class="user-site">${siteOptions(user.siteId)}</select></label>
        <div class="card-field"><span>账号数</span><span>${formatNumber(user.accounts)}</span></div>
        <div class="card-field"><span>今日上号</span><span>${formatNumber(user.addedToday)}</span></div>
        <div class="card-field"><span>账号成本</span><span class="cost">${formatAmount(user.accountCost)}</span></div>
        <div class="user-priority-card-field">${userPriorityControls(user)}</div>
        <div class="user-usage-card-field"><span>用量展示倍率</span>${usageFactorControl(user)}</div>
        <div class="user-realtime-card-field"><span>实时汇总</span>${realtimeMetricsControl(user)}</div>
        <label><span>重置密码</span><input class="user-password" type="password" placeholder="留空不修改"></label>
        <label><span>状态</span><select class="user-active" ${user.id === state.user.id ? "disabled" : ""}><option value="1" ${user.active ? "selected" : ""}>启用</option><option value="0" ${!user.active ? "selected" : ""}>停用</option></select></label>
      </div>
      <div class="card-actions"><button class="secondary compact edit-runtime-config" type="button">运行配置${Object.values(user.runtimeConfig || {}).some((value) => value !== null && value !== undefined) ? " · 已设置" : ""}</button><button class="secondary compact edit-settlement-rate" type="button">结算设置</button><button class="secondary compact save-user" type="button">保存</button></div>
    </article>
  `).join("");
}

function userPriorityControls(user) {
  const draft = state.userPriorityDrafts.get(Number(user.id)) || {};
  const normal = draft.sub2apiPriority ?? user.sub2apiPriority ?? 2;
  const limited = draft.sub2apiModelPriority ?? user.sub2apiModelPriority ?? Math.max(1, (user.sub2apiPriority ?? 2) - 1);
  return `<div class="user-priority-controls">
    <label><span>非模型限流</span><input class="user-priority" type="number" inputmode="numeric" min="1" max="6" step="1" value="${escapeHtml(normal)}" aria-label="非模型限流优先级"></label>
    <label><span>模型级限流</span><input class="user-model-priority" type="number" inputmode="numeric" min="1" max="6" step="1" value="${escapeHtml(limited)}" aria-label="模型级限流优先级"></label>
  </div>`;
}

function usageFactorControl(user) {
  const admin = user.role === "admin";
  const configured = user.usageCostFactor !== null && user.usageCostFactor !== undefined;
  const enabled = admin || configured;
  const value = admin ? "1" : configured ? String(user.usageCostFactor) : "1";
  return `
    <div class="user-usage-control">
      <label class="toggle-label"><input class="user-usage-visible" type="checkbox" ${enabled ? "checked" : ""} ${admin ? "disabled" : ""}>${admin ? "始终显示" : "显示"}</label>
      <input class="user-usage-factor" type="number" min="0" max="1" step="0.000001" inputmode="decimal" value="${escapeHtml(value)}" aria-label="用量展示倍率" ${enabled && !admin ? "" : "disabled"}>
    </div>
  `;
}

function realtimeMetricsControl(user) {
  const enabled = user.realtimeMetricsVisible === true;
  return `
    <label class="toggle-label user-realtime-control" title="控制该用户首页是否显示实时汇总">
      <input class="user-realtime-visible" type="checkbox" aria-label="是否显示实时汇总" ${enabled ? "checked" : ""}>
      <span>显示</span>
    </label>`;
}


async function openSettlementRateDialog(container) {
  const userId = Number(container?.dataset.userId);
  const user = state.users.find((item) => Number(item.id) === userId);
  if (state.user?.role !== "admin" || !user) return;
  state.settlementRateDialogSerial += 1;
  state.settlementRates = { userId, username: user.username, timezone: "Asia/Shanghai", current: null, scheduled: [], history: [] };
  $("settlementRateError").textContent = "";
  resetSettlementRateForm();
  $("saveSettlementRate").disabled = false;
  $("saveSettlementRate").textContent = "保存结算规则";
  renderSettlementRates();
  $("settlementRateDialog").showModal();
  await loadSettlementRates();
}

function closeSettlementRateDialog() {
  state.settlementRateDialogSerial += 1;
  if ($("settlementRateDialog").open) $("settlementRateDialog").close();
}

const USER_RUNTIME_INPUTS = [
  ["sub2apiConcurrency", "userRuntimeSub2apiConcurrency"],
  ["isthmusMaxProcs", "userRuntimeIsthmusMaxProcs"],
  ["containerCpus", "userRuntimeContainerCpus"],
  ["containerMemoryGiB", "userRuntimeContainerMemoryGiB"],
  ["containerMemorySwapGiB", "userRuntimeContainerMemorySwapGiB"],
  ["containerPidsLimit", "userRuntimeContainerPidsLimit"],
];

function openUserRuntimeConfig(container) {
  const userId = Number(container?.dataset.userId);
  const user = state.users.find((item) => Number(item.id) === userId);
  if (!user) return;
  state.userRuntimeUserId = userId;
  $("userRuntimeConfigUsername").textContent = user.username;
  $("userRuntimeConfigError").textContent = "";
  USER_RUNTIME_INPUTS.forEach(([key, inputId]) => {
    const input = $(inputId);
    const configured = user.runtimeConfig?.[key];
    const effective = user.effectiveRuntimeConfig?.[key];
    input.value = configured === null || configured === undefined ? "" : String(configured);
    input.placeholder = effective === null || effective === undefined ? "继承全局" : `继承：${effective}`;
  });
  $("userRuntimeConfigDialog").showModal();
}

function closeUserRuntimeConfig() {
  state.userRuntimeUserId = null;
  if ($("userRuntimeConfigDialog").open) $("userRuntimeConfigDialog").close();
}

function userRuntimePayload(clear = false) {
  const runtimeConfig = {};
  for (const [key, inputId] of USER_RUNTIME_INPUTS) {
    const input = $(inputId);
    const raw = clear ? "" : input.value.trim();
    if (!raw) {
      runtimeConfig[key] = null;
      continue;
    }
    const value = Number(raw);
    if (!input.checkValidity() || !Number.isInteger(value)) {
      input.reportValidity();
      throw new Error("运行配置必须填写范围内的整数");
    }
    runtimeConfig[key] = value;
  }
  const memory = runtimeConfig.containerMemoryGiB;
  const memorySwap = runtimeConfig.containerMemorySwapGiB;
  if ((memory === null) !== (memorySwap === null)) {
    throw new Error("内存和内存 + 交换必须同时设置或同时继承");
  }
  if (memory !== null && memorySwap < memory) {
    throw new Error("内存 + 交换不能小于内存");
  }
  return { runtimeConfig };
}

async function saveUserRuntimeConfig(button, clear = false) {
  const userId = Number(state.userRuntimeUserId);
  if (!userId) return;
  $("userRuntimeConfigError").textContent = "";
  await runButtonTask(button, clear ? "处理中" : "保存中", async () => {
    try {
      await api(`api/users/${userId}`, {
        method: "PATCH",
        body: userRuntimePayload(clear),
      });
      toast(clear ? "已恢复继承全局配置" : "用户运行配置已保存");
      closeUserRuntimeConfig();
      await loadUsers();
    } catch (error) {
      $("userRuntimeConfigError").textContent = error.message;
    }
  });
}

async function saveUser(container) {
  const userId = Number(container.dataset.userId);
  const activeInput = container.querySelector(".user-active");
  const siteInput = container.querySelector(".user-site");
  const usageVisibleInput = container.querySelector(".user-usage-visible");
  const usageFactorInput = container.querySelector(".user-usage-factor");
  const realtimeVisibleInput = container.querySelector(".user-realtime-visible");
  const priorityInput = container.querySelector(".user-priority");
  const modelPriorityInput = container.querySelector(".user-model-priority");
  const passwordInput = container.querySelector(".user-password");
  const button = container.querySelector(".save-user");
  const payload = {};
  if (siteInput) payload.siteId = siteInput.value;
  if (priorityInput) {
    const priority = Number(priorityInput.value);
    if (!Number.isInteger(priority) || priority < 1 || priority > 6) {
      toast("非模型限流优先级必须是 1 到 6 的整数", true);
      priorityInput.focus();
      return;
    }
    payload.sub2apiPriority = priority;
  }
  if (modelPriorityInput) {
    const priority = Number(modelPriorityInput.value);
    if (!Number.isInteger(priority) || priority < 1 || priority > 6) {
      toast("模型级限流优先级必须是 1 到 6 的整数", true);
      modelPriorityInput.focus();
      return;
    }
    payload.sub2apiModelPriority = priority;
  }
  if (activeInput && !activeInput.disabled) {
    payload.active = activeInput.type === "checkbox" ? activeInput.checked : activeInput.value === "1";
  }
  if (usageVisibleInput && !usageVisibleInput.disabled) {
    if (usageVisibleInput.checked) {
      const rawFactor = usageFactorInput?.value.trim() || "";
      const factor = Number(rawFactor);
      if (!rawFactor || !Number.isFinite(factor) || factor < 0 || factor > 1) {
        toast("用量展示倍率必须在 0 到 1 之间", true);
        usageFactorInput?.focus();
        return;
      }
      payload.usageCostFactor = rawFactor;
    } else {
      payload.usageCostFactor = null;
    }
  }
  if (realtimeVisibleInput && !realtimeVisibleInput.disabled) {
    payload.realtimeMetricsVisible = realtimeVisibleInput.checked;
  }
  if (passwordInput?.value) payload.password = passwordInput.value;
  await runButtonTask(button, "保存中", async () => {
    try {
      await api(`api/users/${userId}`, { method: "PATCH", body: payload });
      const draft = state.userPriorityDrafts.get(userId);
      if (!draft || Object.entries(draft).every(([key, value]) => Number(value) === payload[key])) {
        state.userPriorityDrafts.delete(userId);
      }
      toast("用户已更新");
      await Promise.all([loadUsers(), refreshMe()]);
    } catch (error) {
      toast(error.message, true);
    }
  });
}

async function createUser(event) {
  event.preventDefault();
  $("userFormError").textContent = "";
  const button = event.currentTarget.querySelector("button[type=submit]");
  await runButtonTask(button, "新增中", async () => {
    try {
      await api("api/users", {
        method: "POST",
        body: {
          username: $("newUsername").value.trim(),
          password: $("newPassword").value,
          siteId: $("newSiteId").value,
        },
      });
      $("createUserForm").reset();
      toast("用户已新增");
      await loadUsers();
    } catch (error) {
      $("userFormError").textContent = error.message;
    }
  });
}

function accountQuery() {
  const archive = state.currentView === "archive";
  const owner = archive ? $("archiveOwnerFilter").value : $("ownerFilter").value;
  const site = archive ? $("archiveSiteFilter").value : $("siteFilter").value;
  const params = new URLSearchParams({
    q: (archive ? $("archiveSearch").value : $("accountSearch").value).trim(),
    category: archive ? "all" : state.category,
    view: archive ? "dead" : "all",
    refund_state: state.refundState,
    sort: archive ? $("archiveSort").value : (!state.user?.usageCostVisible ? "added_desc" : $("accountSort").value),
    page: String(state.page),
    page_size: String(state.pageSize),
  });
  if (archive) {
    const from = $("archiveFrom").value;
    const to = $("archiveTo").value;
    if (from) params.set("archive_from", from);
    if (to) params.set("archive_to", to);
  } else {
    params.set("from", $("accountFrom").value);
    params.set("to", $("accountTo").value);
  }
  if (state.user?.role === "admin" && owner) params.set("owner", owner);
  if (state.user?.role === "admin" && site) params.set("site", site);
  return params.toString();
}

function archiveExportCell(value) {
  return `"${String(value ?? "").replaceAll('"', '""')}"`;
}

async function exportArchiveAccounts() {
  if (state.currentView !== "archive" || !state.user) return;
  const button = $("archiveExportButton");
  await runButtonTask(button, "导出中", async () => {
    const rows = [];
    const pageSize = 200;
    for (let page = 1; ; page += 1) {
      const params = new URLSearchParams(accountQuery());
      params.set("page", String(page));
      params.set("page_size", String(pageSize));
      const data = await api(`api/accounts?${params.toString()}`);
      rows.push(...(data.items || []));
      if (!data.pagination || page >= Number(data.pagination.pages || 1)) break;
    }
    if (!rows.length) {
      toast("当前筛选没有可导出的账号", true);
      return;
    }
    const headers = ["账号ID", "站点账号ID", "账号名", "站点", "归属用户", "账号状态", "退款处理状态", "归档时间", "上号时间", "最近使用", "请求数", "累计计费", "失败原因"];
    const lines = [headers, ...rows.map((account) => [
      account.id,
      account.localAccountId,
      account.name,
      siteLabel(account.siteId),
      account.owner?.username || "未分配",
      account.categoryLabel || account.status,
      account.refundStateLabel || "-",
      account.deletedAt || account.detectedAt || "",
      account.uploadedAt || "",
      account.lastUsedAt || "",
      account.usage?.requests || 0,
      account.usage?.standardCost == null ? "" : account.usage.standardCost,
      account.issue || "",
    ])];
    const csv = `\uFEFF${lines.map((line) => line.map(archiveExportCell).join(",")).join("\r\n")}`;
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `archived_accounts_${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
    toast(`已导出 ${formatNumber(rows.length)} 个归档账号`);
  });
}

function resetArchiveFilters() {
  $("archiveSearch").value = "";
  $("archiveOwnerFilter").value = "";
  $("archiveSiteFilter").value = "";
  $("archiveFrom").value = "";
  $("archiveTo").value = "";
  $("archiveSort").value = "deleted_desc";
  state.refundState = "pending";
  state.page = 1;
  state.accountSelection.clear();
  state.accountSelectionMeta.clear();
  renderCategoryFilters();
  loadAccounts();
}

async function loadAccounts(quiet = false) {
  if (!state.user || weeklyActive()) return;
  const startedAt = Date.now();
  state.accountAbortController?.abort();
  const controller = new AbortController();
  state.accountAbortController = controller;
  const serial = ++state.accountRequestSerial;
  if (!quiet) {
    $("accountLoading").classList.remove("hidden");
    $("accountDataSurface").classList.add("accounts-loading");
    $("accountDataSurface").setAttribute("aria-busy", "true");
    ["bulkDeleteTools", "accountSelectionTools", "refundTransitionTools", "refundedPurgeTools"].forEach((id) => {
      $(id).classList.add("hidden");
    });
  }
  try {
    const data = await api(`api/accounts?${accountQuery()}`, { signal: controller.signal });
    if (serial !== state.accountRequestSerial) return;
    for (const account of data.items || []) {
      const snapshot = state.accountWindowSnapshots.get(Number(account.id));
      if (snapshot && snapshot.at >= startedAt) {
        mergeAccountWindow(account, snapshot.window);
        if (snapshot.accountState) Object.assign(account, snapshot.accountState);
      }
    }
    state.accounts = data;
    renderAccounts();
    void loadAccountWindows(true);
  } catch (error) {
    if (error.name === "AbortError") return;
    if (!quiet) toast(error.message, true);
  } finally {
    if (state.accountAbortController === controller) state.accountAbortController = null;
    if (serial === state.accountRequestSerial && !quiet) {
      $("accountLoading").classList.add("hidden");
      $("accountDataSurface").classList.remove("accounts-loading");
      $("accountDataSurface").removeAttribute("aria-busy");
    }
  }
}

function realtimeMetricsEnabled() {
  return Boolean(state.user?.realtimeMetricsVisible);
}

function formatConcurrency(value) {
  if (value == null || value === "") return "-";
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return "-";
  return numeric.toLocaleString("en-US", { maximumFractionDigits: 3 });
}

function realtimeMetricNumber(...values) {
  for (const value of values) {
    if (value == null || value === "" || typeof value === "boolean") continue;
    const numeric = Number(value);
    if (Number.isFinite(numeric)) return Math.max(0, numeric);
  }
  return null;
}

function realtimeMetricObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function normalizeRealtimeConcurrency(value, fallback = {}) {
  const scope = realtimeMetricObject(value);
  const backup = realtimeMetricObject(fallback);
  const current = realtimeMetricNumber(scope.current, backup.current);
  const capacity = realtimeMetricNumber(
    scope.capacity,
    scope.limit,
    scope.allowed,
    backup.capacity,
    backup.limit,
    backup.allowed,
  );
  let remaining = realtimeMetricNumber(scope.remaining, backup.remaining);
  const waiting = realtimeMetricNumber(scope.waiting, backup.waiting);
  if (remaining == null && current != null && capacity != null) {
    remaining = Math.max(0, capacity - current);
  }
  return { current, capacity, remaining, waiting };
}

function normalizeRealtimeMetrics(data) {
  const concurrency = realtimeMetricObject(data?.concurrency);
  const accounts = realtimeMetricObject(data?.accounts);
  const hasAccountBreakdown = [
    "totalOwned",
    "started",
    "running",
    "accepting",
    "modelLimited",
    "f5Limited",
    "f5Eligible",
    "accountLimited",
    "temporaryLimited",
    "strictEligible",
    "telemetryMissing",
  ].some((key) => Object.prototype.hasOwnProperty.call(accounts, key));
  const capacitySnapshotMissing = Boolean(data?.stale) && !data?.sampledAt;

  const running = normalizeRealtimeConcurrency(concurrency.running, concurrency);
  const accepting = normalizeRealtimeConcurrency(concurrency.accepting, running);
  const strict = normalizeRealtimeConcurrency(concurrency.strict, running);
  const f5Eligible = normalizeRealtimeConcurrency(concurrency.f5Eligible, strict);
  if (capacitySnapshotMissing) {
    for (const scope of [running, accepting, f5Eligible, strict]) {
      scope.current = null;
      scope.capacity = null;
      scope.remaining = null;
      scope.waiting = null;
    }
  }

  return {
    // Keep the full running-pool object available to the renderer.  The
    // scalar fields below remain for legacy callers.
    running,
    current: running.current,
    capacity: running.capacity,
    remaining: running.remaining,
    waiting: running.waiting,
    accepting,
    f5Eligible,
    strict,
    accounts: {
      hasBreakdown: hasAccountBreakdown,
      totalOwned: realtimeMetricNumber(accounts.totalOwned, data?.totalAccounts),
      started: realtimeMetricNumber(accounts.started),
      running: realtimeMetricNumber(accounts.running, accounts.started),
      accepting: realtimeMetricNumber(accounts.accepting, data?.eligibleAccounts),
      modelLimited: realtimeMetricNumber(accounts.modelLimited),
      f5Limited: realtimeMetricNumber(accounts.f5Limited),
      f5Eligible: realtimeMetricNumber(accounts.f5Eligible, accounts.strictEligible),
      accountLimited: realtimeMetricNumber(accounts.accountLimited),
      temporaryLimited: realtimeMetricNumber(accounts.temporaryLimited),
      strictEligible: realtimeMetricNumber(accounts.strictEligible, data?.eligibleAccounts),
      telemetryMissing: realtimeMetricNumber(accounts.telemetryMissing),
    },
  };
}

function realtimeMetricsMeta(data, metrics) {
  const parts = [];
  const accounts = metrics.accounts;
  const scopeText = (label, scope) => {
    if (scope?.current == null || scope?.capacity == null) return label;
    return `${label} ${formatConcurrency(scope.current)} / ${formatConcurrency(scope.capacity)}`;
  };
  if (accounts.hasBreakdown) {
    if (accounts.running != null && accounts.totalOwned != null) {
      parts.push(`正常运行 ${formatNumber(accounts.running)} / ${formatNumber(accounts.totalOwned)}`);
    } else if (accounts.running != null) {
      parts.push(`正常运行 ${formatNumber(accounts.running)}`);
    } else if (accounts.totalOwned != null) {
      parts.push(`账号总数 ${formatNumber(accounts.totalOwned)}`);
    }
    if (accounts.accepting != null) {
      const acceptingLabel = `可接入 ${formatNumber(accounts.accepting)}`;
      parts.push(metrics.accepting.capacity == null
        ? acceptingLabel
        : `${acceptingLabel} · ${scopeText("并发", metrics.accepting)}`);
    }
    if (accounts.modelLimited != null && accounts.f5Limited != null) {
      parts.push(
        accounts.modelLimited === accounts.f5Limited
          ? `F5 受限 ${formatNumber(accounts.f5Limited)}`
          : `模型受限 ${formatNumber(accounts.modelLimited)}（F5 ${formatNumber(accounts.f5Limited)}）`,
      );
    } else if (accounts.modelLimited != null) {
      parts.push(`模型受限 ${formatNumber(accounts.modelLimited)}`);
    } else if (accounts.f5Limited != null) {
      parts.push(`F5 受限 ${formatNumber(accounts.f5Limited)}`);
    }
    if (accounts.f5Eligible != null) {
      const f5Label = `F5 池 ${formatNumber(accounts.f5Eligible)}`;
      parts.push(metrics.f5Eligible.capacity == null
        ? f5Label
        : `${f5Label} · ${scopeText("并发", metrics.f5Eligible)}`);
    }
    if (accounts.strictEligible != null) {
      const strictLabel = `严格池 ${formatNumber(accounts.strictEligible)}`;
      parts.push(metrics.strict.capacity == null
        ? strictLabel
        : `${strictLabel} · ${scopeText("并发", metrics.strict)}`);
    }
    if (accounts.accountLimited > 0) parts.push(`账号限额 ${formatNumber(accounts.accountLimited)}`);
    if (accounts.temporaryLimited > 0) parts.push(`临时限制 ${formatNumber(accounts.temporaryLimited)}`);
    if (accounts.telemetryMissing > 0) parts.push(`遥测缺失 ${formatNumber(accounts.telemetryMissing)}`);
  } else if (accounts.strictEligible != null || accounts.totalOwned != null) {
    const strict = accounts.strictEligible == null ? "-" : formatNumber(accounts.strictEligible);
    const total = accounts.totalOwned == null ? "-" : formatNumber(accounts.totalOwned);
    parts.push(`严格池 ${strict} / ${total}`);
  }

  if (data?.sampledAt) parts.push(`并发采样 ${formatFullDateTime(data.sampledAt)}`);
  if (data?.usageSampledAt) parts.push(`用量截止 ${formatFullDateTime(data.usageSampledAt)}`);
  return parts.join(" · ") || "等待容量快照";
}

function realtimeMetricsQuery() {
  const params = new URLSearchParams();
  if (state.user?.role === "admin") {
    if ($("siteFilter").value) params.set("site", $("siteFilter").value);
    if ($("ownerFilter").value) params.set("owner", $("ownerFilter").value);
  }
  return params.toString();
}

function cancelRealtimeMetricsRequest(clearData = false) {
  state.realtimeMetricsRequestSerial += 1;
  state.realtimeMetricsController?.abort();
  state.realtimeMetricsController = null;
  state.realtimeMetricsBusy = false;
  if (clearData) state.realtimeMetrics = null;
}

function refreshRealtimeMetricsScope() {
  cancelRealtimeMetricsRequest(true);
  renderRealtimeMetrics();
  return loadRealtimeMetrics();
}

function realtimeAdminMeta(data) {
  const coverage = data.coverage || {};
  const expected = (coverage.includedSites || []).length;
  const parts = ["按站点、用户汇总，不随日期、搜索、状态或分页变化"];
  if (data.quality?.capacity !== "complete") parts.push(`并发已获取 ${coverage.capacitySites?.length || 0}/${expected} 站点`);
  if (data.quality?.usage !== "complete") parts.push(`用量已获取 ${coverage.usageSites?.length || 0}/${expected} 站点`);
  const excluded = (coverage.excludedSites || []).map((item) => `${item.label}：${item.reason}`);
  if (excluded.length) parts.push(excluded.join("；"));
  const failures = (data.sites || []).filter((item) => item.status !== "实时" && !(coverage.excludedSites || []).some((s) => s.siteId === item.siteId));
  if (failures.length) parts.push(failures.map((item) => `${item.label}：${item.status}`).join("；"));
  if (data.accounts?.totalOwned === 0 && data.quality?.capacity === "complete") parts.push("当前范围无账号");
  return parts.join(" · ");
}

function renderRealtimeSiteDetails(data) {
  const details = $("realtimeSiteDetails");
  const sites = data?.sites || [];
  details.classList.toggle("hidden", data?.scope?.kind !== "admin" || sites.length < 2);
  $("realtimeSiteRows").innerHTML = sites.map((site) => {
    const running = site.concurrency?.running;
    const number = (value) => value == null ? "—" : formatNumber(value);
    return `<div class="realtime-site-row">
      <div><strong>${escapeHtml(site.label)}</strong><span>${escapeHtml(site.status)}</span></div>
      <div><span>RPM</span><strong>${number(site.rpm)}</strong></div>
      <div><span>TPM</span><strong>${number(site.tpm)}</strong></div>
      <div><span>运行并发</span><strong>${formatConcurrency(running?.current)} / ${formatConcurrency(running?.capacity)}</strong></div>
      <div><span>等待请求</span><strong>${formatConcurrency(running?.waiting)}</strong></div>
    </div>`;
  }).join("");
}

function renderRealtimeMetrics() {
  const visible = realtimeMetricsEnabled();
  $("realtimeMetrics").classList.toggle("hidden", !visible);
  if (!visible) return;
  const data = state.realtimeMetrics;
  const status = $("realtimeMetricsStatus");
  const admin = state.user?.role === "admin";
  $("realtimeMetricsTitle").textContent = data?.scope?.label ? `实时汇总 · ${data.scope.label}` : "实时汇总";
  $("realtimeScopeNote").classList.toggle("hidden", !admin);
  $("realtimeScopeNote").textContent = admin && data ? realtimeAdminMeta(data) : "按站点、用户汇总 · 最近 60 秒";
  renderRealtimeSiteDetails(data);
  if (!data) {
    $("realtimeRpm").textContent = $("realtimeTpm").textContent = $("realtimeWaiting").textContent = "—";
    $("realtimeConcurrency").textContent = "— / —";
    $("realtimeMetricsMeta").textContent = "等待容量快照";
    status.textContent = "正在读取";
    status.className = "realtime-status";
    return;
  }
  const metrics = normalizeRealtimeMetrics(data);
  const primary = metrics.running;
  $("realtimeRpm").textContent = data.rpm == null ? "—" : formatNumber(data.rpm);
  $("realtimeTpm").textContent = data.tpm == null ? "—" : formatNumber(data.tpm);
  $("realtimeConcurrency").textContent = `${formatConcurrency(primary.current)} / ${formatConcurrency(primary.capacity)}`;
  $("realtimeWaiting").textContent = formatConcurrency(metrics.waiting);
  const partial = (metrics.accounts.telemetryMissing || 0) > 0 || (data.quality && Object.values(data.quality).some((q) => q !== "complete"));
  const unavailable = data.quality && Object.values(data.quality).every((q) => q === "unavailable");
  const delayed = Boolean(data.stale) || partial;
  status.textContent = unavailable ? "暂不可用" : (partial ? "部分数据" : (data.stale ? "数据延迟" : "实时"));
  status.className = `realtime-status ${delayed ? "stale" : "live"}`;
  $("realtimeMetricsMeta").textContent = realtimeMetricsMeta(data, metrics);
}

async function loadRealtimeMetrics(quiet = false) {
  if (!realtimeMetricsEnabled() || state.currentView !== "accounts" || weeklyActive() || document.visibilityState !== "visible") return;
  const query = realtimeMetricsQuery();
  if (state.realtimeMetricsBusy && state.realtimeMetricsRequestScope === query) return;
  if (state.realtimeMetricsRequestScope !== query) {
    cancelRealtimeMetricsRequest(true);
    renderRealtimeMetrics();
  }
  const serial = ++state.realtimeMetricsRequestSerial;
  const session = state.sessionSerial;
  const controller = new AbortController();
  state.realtimeMetricsController = controller;
  state.realtimeMetricsRequestScope = query;
  state.realtimeMetricsBusy = true;
  const current = () => serial === state.realtimeMetricsRequestSerial && session === state.sessionSerial &&
    realtimeMetricsEnabled() && state.currentView === "accounts" && query === realtimeMetricsQuery();
  try {
    const data = await api(`api/realtime-metrics${query ? `?${query}` : ""}`, { signal: controller.signal });
    if (!current()) return;
    if (state.user?.role === "admin" && (data.scope?.kind !== "admin" || data.scope.site !== ($("siteFilter").value || "") || data.scope.owner !== ($("ownerFilter").value || ""))) {
      throw new Error("汇总范围发生变化，请重试");
    }
    state.realtimeMetrics = data;
    renderRealtimeMetrics();
  } catch (error) {
    if (!current() || error.name === "AbortError" || error.staleSession) return;
    const status = $("realtimeMetricsStatus");
    status.textContent = "读取失败";
    status.className = "realtime-status stale";
    if (!quiet || !state.realtimeMetrics) $("realtimeMetricsMeta").textContent = error.message;
  } finally {
    if (serial === state.realtimeMetricsRequestSerial) {
      state.realtimeMetricsBusy = false;
      state.realtimeMetricsController = null;
    }
  }
}

function syncRealtimeMetricsRefresh() {
  clearInterval(state.realtimeMetricsTimer);
  state.realtimeMetricsTimer = null;
  if (!realtimeMetricsEnabled() || state.currentView !== "accounts" || weeklyActive()) {
    cancelRealtimeMetricsRequest(true);
    renderRealtimeMetrics();
    return;
  }
  renderRealtimeMetrics();
  loadRealtimeMetrics(true);
  state.realtimeMetricsTimer = setInterval(() => {
    if (document.visibilityState === "visible") loadRealtimeMetrics(true);
  }, 5000);
}


function renderCategoryFilters() {
  const counts = state.accounts?.categoryCounts || {};
  const archive = state.currentView === "archive";
  if (!archive) {
    const order = ["all", "healthy", "unschedulable", "error"];
    $("categoryFilters").innerHTML = order.map((category) => `
      <button class="segment ${category === state.category ? "active" : ""}" data-category="${category}" type="button">
        ${categoryLabels[category]} ${formatNumber(counts[category] || 0)}
      </button>
    `).join("");
    return;
  }
  const archivedAccountsVisible = state.user?.role !== "admin"
    && state.user?.archivedAccountsVisible === true;
  const visibleRefundLabels = Object.entries(refundLabels).filter(
    ([value]) => value !== "archived" || archivedAccountsVisible,
  );
  $("refundFilters").innerHTML = visibleRefundLabels.map(([value, label]) => `
    <button class="segment refund-segment ${value === state.refundState ? "active" : ""}" data-refund-state="${value}" type="button">
      ${label} ${formatNumber(state.accounts?.refundCounts?.[value] || 0)}
    </button>
  `).join("");
}

function statusBadge(account) {
  return `<span class="status-badge status-${account.category}">${escapeHtml(account.categoryLabel)}</span>`;
}

function accountStatusMarkup(account) {
  const issue = String(account.issue || "").trim();
  let label = account.categoryLabel;
  if (account.category !== "healthy") {
    if (/token has been revoked/i.test(issue)) label = "授权已撤销";
    else if (/OAuth authentication is currently not allowed for this organization/i.test(issue)) label = "组织禁止 OAuth";
    else if (/限流|rate.?limit|too many requests|\b429\b/i.test(issue)) label = "限流中";
    else if (/\b401\b/i.test(issue)) label = "授权失败";
  }
  const limits = account.limits || {};
  const extra = [];
  if (limits.accountLimited) extra.push(["账号限额", `刷新 ${formatFullDateTime(limits.accountResetsAt)}`]);
  if (limits.modelLimited) extra.push(["模型限流", (limits.modelRateLimits || []).filter((row) => row.active).map((row) => `${row.scope}: ${formatFullDateTime(row.resetsAt)}`).join("\n")]);
  if (limits.tempCooldownActive) extra.push(["临时冷却", `${formatFullDateTime(account.tempUnschedulableUntil)} ${limits.tempCooldownReason || ""}`]);
  if (limits.manualSchedulableHold) extra.push(["手动暂停", limits.manualSchedulableHoldUntil ? formatFullDateTime(limits.manualSchedulableHoldUntil) : "手动暂停"]);
  return `<span class="status-badge status-${escapeHtml(account.category)}" title="${escapeHtml(issue || label)}">${escapeHtml(label)}</span>${extra.map(([text, title]) => `<span class="status-badge status-unschedulable" title="${escapeHtml(title)}">${escapeHtml(text)}</span>`).join("")}${issue ? `<button type="button" class="account-status-detail" data-id="${account.id}" title="${escapeHtml(issue)}" aria-label="查看 ${escapeHtml(account.name)} 的状态详情">详情</button>` : ""}`;
}

function openAccountError(accountId) {
  const account = state.accounts?.items?.find((item) => Number(item.id) === accountId);
  if (!account?.issue) return;
  let dialog = $("accountErrorDialog");
  if (!dialog) {
    dialog = document.createElement("dialog");
    dialog.id = "accountErrorDialog";
    dialog.className = "detail-dialog account-error-dialog";
    dialog.setAttribute("aria-labelledby", "accountErrorTitle");
    dialog.innerHTML = `<div class="dialog-head"><h3 id="accountErrorTitle">报错详情</h3><button type="button" class="secondary compact" aria-label="关闭报错详情">关闭</button></div><pre class="account-error-message"></pre>`;
    dialog.querySelector("button").addEventListener("click", () => dialog.close());
    dialog.addEventListener("click", (event) => {
      if (event.target !== dialog) return;
      const rect = dialog.getBoundingClientRect();
      if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) dialog.close();
    });
    document.body.appendChild(dialog);
  }
  dialog.querySelector(".account-error-message").textContent = String(account.issue);
  dialog.showModal();
}

function refundBadge(account) {
  if (!account.refundState) return "";
  return `<span class="status-badge refund-${account.refundState}">${escapeHtml(account.refundStateLabel)}</span>`;
}

function accountNoteText(account) {
  const note = String(account?.note || "").trim();
  return note || "-";
}

function accountNoteMarkup(account, className = "") {
  const note = accountNoteText(account);
  return `<span class="account-note-value ${className}" title="${escapeHtml(note)}">${escapeHtml(note)}</span>`;
}

function renderBulkDeleteTools() {
  const archive = Boolean(state.user) && state.currentView === "archive";
  const visible = archive && state.refundState === "pending";
  const transitionState = state.refundState === "pending"
    ? "requested"
    : state.refundState === "requested"
      ? "refunded"
      : "";
  const transitionVisible = archive && state.user?.role === "admin" && Boolean(transitionState);
  const refundedVisible = archive && state.refundState === "refunded" && state.user?.role === "admin";
  const busy = Boolean(state.deleteBatchId || state.deleteJobId);
  const deletable = Number(state.accounts?.deletableCount || 0);
  const transitionCount = Number(state.accounts?.adminRefundCounts?.[state.refundState] || 0);
  const refunded = Number(state.accounts?.refundedPurgeCount || 0);
  $("bulkDeleteTools").classList.toggle("hidden", !visible);
  $("deleteAllErrorsCount").textContent = `可删除错误账号 ${formatNumber(deletable)} 个`;
  $("deleteAllErrorsButton").textContent = "一键删除错误账号";
  $("deleteAllErrorsButton").disabled = !visible || deletable === 0 || busy;
  $("refundTransitionTools").classList.toggle("hidden", !transitionVisible);
  $("refundTransitionCount").textContent = `可批量处理 ${formatNumber(transitionCount)} 个`;
  $("transitionRefundsButton").textContent = transitionState === "requested"
    ? "一键标记已申请退款"
    : "一键标记退款成功";
  $("transitionRefundsButton").dataset.state = transitionState;
  $("transitionRefundsButton").disabled = !transitionVisible || transitionCount === 0 || busy || state.refundBulkBusy;
  $("refundedPurgeTools").classList.toggle("hidden", !refundedVisible);
  $("refundedPurgeCount").textContent = `可归档已成功退款 ${formatNumber(refunded)} 个`;
  $("purgeRefundedButton").textContent = "一键归档已成功退款账号";
  $("purgeRefundedButton").disabled = !refundedVisible || refunded === 0 || busy || state.refundedPurgeBusy;
}

function selectedAccountRecords() {
  return [...state.accountSelection]
    .map((selectionKey) => state.accountSelectionMeta.get(selectionKey) || {
      id: 0,
      selectionKey,
      name: selectionKey,
      deletedAt: true,
      canDelete: false,
    })
    .sort((a, b) => Number(a.id) - Number(b.id));
}

function accountCanBeSelected(account) {
  return state.user?.role === "admin" || !account.deletedAt;
}

function renderAccountSelectionTools() {
  const admin = state.user?.role === "admin";
  const pageIds = (state.accounts?.items || [])
    .filter(accountCanBeSelected)
    .map(accountSelectionKey);
  const selectedOnPage = pageIds.filter((selectionKey) => state.accountSelection.has(selectionKey)).length;
  const allSelected = pageIds.length > 0 && selectedOnPage === pageIds.length;
  const accounts = selectedAccountRecords();
  const selected = accounts.length;
  const copyEligible = accounts.every((account) => !account.deletedAt);
  const reauthSites = new Set(accounts.map((account) => String(account.siteId || "main")));
  const reauthSameSite = reauthSites.size <= 1;
  const reauthEligible = reauthSameSite
    && accounts.every((account) => !account.deletedAt && account.reauthAllowed !== false);
  const deleteEligible = accounts.every((account) => account.canDelete && !account.deletedAt);
  const deleteBusy = Boolean(state.deleteBatchId || state.deleteJobId);
  const visible = ["accounts", "archive"].includes(state.currentView);
  $("accountSelectionTools").classList.toggle("hidden", !visible);
  $("accountSelectedCount").textContent = `已选 ${formatNumber(selected)} 个`;
  $("selectAccountPage").checked = allSelected;
  $("selectAccountPage").indeterminate = selectedOnPage > 0 && !allSelected;
  $("selectAccountPage").disabled = !visible || pageIds.length === 0;
  $("clearAccountSelection").disabled = selected === 0;
  $("openBulkPrice").disabled = !admin || selected === 0;
  $("copySelectedImportLines").disabled = selected === 0 || !copyEligible;
  $("openBulkReauth").disabled = selected === 0 || !reauthEligible || selected > 20;
  $("openBulkReauth").textContent = selected > 20
    ? "一次最多 20 个"
    : !reauthEligible && selected
      ? !reauthSameSite
        ? "请选择同一站点账号"
        : accounts.some((account) => account.reauthAllowed === false)
        ? "所选含不可重授权站点"
        : "所选含已删除账号"
      : "批量重新授权";
  $("deleteSelectedErrorsButton").disabled = selected === 0
    || !deleteEligible
    || selected > MAX_BULK_DELETE_SELECTION
    || deleteBusy;
  $("deleteSelectedErrorsButton").textContent = selected > MAX_BULK_DELETE_SELECTION
    ? `一次最多 ${MAX_BULK_DELETE_SELECTION} 个`
    : !deleteEligible && selected
      ? "仅可删除错误账号"
      : "删除所选";
}

function accountActionButtons(account) {
  const archive = state.currentView === "archive";
  const canDelete = !archive && !account.deletedAt && (state.user?.role === "admin" || account.canDelete);
  const detailAction = `<button class="link-button detail-account" data-id="${account.id}" type="button">详情</button>`;
  const noteAction = `<button class="secondary compact edit-note-account" data-id="${account.id}" type="button">编辑备注</button>`;
  const reauthAction = !account.deletedAt && account.reauthAllowed !== false
    ? `<button class="secondary compact reauth-account" data-id="${account.id}" type="button">重新授权</button>`
    : `<button class="secondary compact" type="button" disabled title="${account.deletedAt ? "关联资源已删除" : "该站点暂不支持重新授权"}">${account.deletedAt ? "目标已删除" : "不可重授权"}</button>`;
  const refundAction = account.canMarkRequested
    ? `<button class="secondary compact refund-account" data-id="${account.id}" data-state="requested" type="button">标记已申请退款</button>`
    : account.canMarkRefunded
      ? `<button class="secondary compact refund-account" data-id="${account.id}" data-state="refunded" type="button">标记已成功退款</button>`
      : "";
  const deleteAction = canDelete
    ? `<button class="danger compact delete-account" data-id="${account.id}" type="button">删除</button>`
    : "";
  const swapAction = !archive && !account.deletedAt && state.user?.role === "admin"
    ? `<button class="secondary compact proxy-swap-account" data-id="${account.id}" type="button">换代理</button>` : "";
  return `<div class="card-actions">${detailAction}${reauthAction}${swapAction}${refundAction}${noteAction}${deleteAction}</div>`;
}

const proxySwapView = { serial: 0, accountId: null, preview: null, job: null, timer: null, requestId: null };
const proxySwapStages = {
  preflight: "正在选择并验证空闲代理", pausing: "正在设置人工暂停", draining: "等待现有请求排空",
  configuring: "正在写入新代理", restarting: "正在重启目标运行进程", verifying: "正在验证实际出口",
  binding: "正在更新代理绑定", restoring: "正在恢复原调度状态", completed: "换代理完成",
};

function proxySwapRequestId() {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 15) | 64;
  bytes[8] = (bytes[8] & 63) | 128;
  const hex = [...bytes].map((value) => value.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function renderProxySwap() {
  const job = proxySwapView.job;
  const preview = proxySwapView.preview;
  const busy = job && ["queued", "running"].includes(job.status);
  $("proxySwapAccount").textContent = preview?.accountName || job?.accountName || "";
  $("proxySwapContainer").textContent = preview?.baseUrl || job?.baseUrl || "-";
  $("proxySwapOld").textContent = job?.oldIp || preview?.oldIp || "-";
  $("proxySwapNew").textContent = job?.newIp || "待选择";
  $("proxySwapExit").textContent = job?.exitIp || "待验证";
  $("proxySwapStatus").textContent = job ? (job.status === "queued" ? "等待处理" :
    job.status === "recovery_required" ? (job.manualHoldSet ? "未完成，保持人工暂停" : "未完成，请检查暂停状态") :
    job.status === "failed" ? "未开始切换" : proxySwapStages[job.stage] || "正在处理") :
    "确认后人工暂停账号，禁用旧代理，从空闲池倒序替换。成功后恢复原调度状态。";
  $("proxySwapError").textContent = job?.error || "";
  $("proxySwapWarning").textContent = job?.warning || "";
  $("proxySwapSubmit").disabled = Boolean(busy || !preview);
  $("proxySwapSubmit").textContent = busy ? "处理中" : job?.retryable ? "继续处理" :
    job?.status === "completed" ? "再次更换" : "确认更换";
  $("proxySwapStatus").setAttribute("aria-busy", busy ? "true" : "false");
}

async function pollProxySwap(serial) {
  if (serial !== proxySwapView.serial || !$("proxySwapDialog").open || !proxySwapView.job) return;
  try {
    const data = await api(`api/proxy-swaps/${proxySwapView.job.id}`);
    if (serial !== proxySwapView.serial) return;
    proxySwapView.job = data.job;
    renderProxySwap();
    if (!["queued", "running"].includes(data.job.status)) {
      loadAccounts(true);
      return;
    }
  } catch (error) {
    if (serial !== proxySwapView.serial) return;
    $("proxySwapError").textContent = error.message;
  }
  proxySwapView.timer = setTimeout(() => pollProxySwap(serial), 2000);
}

async function openProxySwap(accountId) {
  if (state.user?.role !== "admin") return;
  clearTimeout(proxySwapView.timer);
  const serial = ++proxySwapView.serial;
  Object.assign(proxySwapView, { accountId, preview: null, job: null, requestId: proxySwapRequestId() });
  renderProxySwap();
  $("proxySwapStatus").textContent = "正在读取账号和代理";
  $("proxySwapDialog").showModal();
  try {
    const data = await api(`api/accounts/${accountId}/proxy-swap`);
    if (serial !== proxySwapView.serial) return;
    proxySwapView.preview = data;
    proxySwapView.job = data.job;
    renderProxySwap();
    if (data.job && ["queued", "running"].includes(data.job.status)) pollProxySwap(serial);
  } catch (error) {
    if (serial !== proxySwapView.serial) return;
    $("proxySwapStatus").textContent = "暂不可更换代理";
    $("proxySwapError").textContent = error.message;
  }
}

async function submitProxySwap() {
  if (!proxySwapView.preview || $("proxySwapSubmit").disabled) return;
  if (proxySwapView.job?.status === "completed") {
    proxySwapView.preview.oldIp = proxySwapView.job.newIp;
    proxySwapView.job = null;
    proxySwapView.requestId = proxySwapRequestId();
    renderProxySwap();
    return;
  }
  const serial = proxySwapView.serial;
  $("proxySwapSubmit").disabled = true;
  $("proxySwapError").textContent = "";
  try {
    const body = proxySwapView.job?.retryable ? { retryJobId: proxySwapView.job.id } : { requestId: proxySwapView.requestId };
    const data = await api(`api/accounts/${proxySwapView.accountId}/proxy-swap`, { method: "POST", body });
    if (serial !== proxySwapView.serial) return;
    proxySwapView.job = data.job;
    renderProxySwap();
    pollProxySwap(serial);
  } catch (error) {
    if (serial !== proxySwapView.serial) return;
    renderProxySwap();
    $("proxySwapError").textContent = error.message;
  }
}

function usageWindowResetText(value) {
  if (!value) return "已重置";
  const reset = new Date(value);
  const seconds = Math.ceil((reset.getTime() - Date.now()) / 1000);
  return seconds > 0 ? formatDuration(seconds) : "待刷新";
}

function usageWindowRow(label, window, showCost = false, detailed = false) {
  if (!window) return "";
  const utilization = Math.max(0, Number(window.utilization || 0));
  const level = utilization >= 100 ? "critical" : utilization >= 80 ? "warning" : "normal";
  const cost = showCost ? `<span class="usage-window-cost">${formatMoney(window.standardCost, 4)}</span>` : "";
  const sampled = window.sampledAt && Number.isFinite(new Date(window.sampledAt).getTime())
    ? `采样 ${formatFullDateTime(window.sampledAt)}` : "";
  const sampledTitle = sampled && !detailed ? ` title="${escapeHtml(sampled)}"` : "";
  const sampledDetail = sampled && detailed ? `<span class="usage-window-freshness">${escapeHtml(sampled)}</span>` : "";
  return `<div class="usage-window-row ${level}"${sampledTitle}>
    <span class="usage-window-label">${label}</span>
    <progress class="usage-window-track" max="100" value="${Math.min(utilization, 100)}" aria-label="${escapeHtml(label)} ${Math.round(utilization)}%">${Math.round(utilization)}%</progress>
    <strong>${Math.round(utilization)}%</strong>
    <span class="usage-window-reset">${escapeHtml(usageWindowResetText(window.resetsAt))}</span>
    ${cost}
    ${sampledDetail}
  </div>`;
}

function usageWindowMarkup(account, detailed = false) {
  const usageWindow = account.usageWindow;
  if (!usageWindow) return `<span class="muted">暂无快照</span>`;
  const rows = [
    usageWindowRow("5h", usageWindow.fiveHour, true, detailed),
    usageWindowRow("7d", usageWindow.sevenDay, false, detailed),
    usageWindowRow("7d F", usageWindow.sevenDayFable, false, detailed),
  ].filter(Boolean).join("");
  const fiveHourStats = usageWindow.fiveHour
    ? `<span class="usage-window-stats">${formatNumber(usageWindow.fiveHour.requests)} 请求 · ${formatNumber(usageWindow.fiveHour.tokens)} Token</span>`
    : "";
  const sampledAt = detailed
    && usageWindow.sampledAt ? `<span class="usage-window-sampled">旧版共享采样 ${escapeHtml(formatFullDateTime(usageWindow.sampledAt))}</span>`
    : "";
  return `<div class="usage-window-stack">${rows || `<span class="muted">暂无快照</span>`}${fiveHourStats}${sampledAt}</div>`;
}

function mergeAccountWindow(account, window) {
  const old = account.usageWindow || {};
  account.usageWindow = {
    ...old, ...window,
    fiveHour: window.fiveHour ? { ...(old.fiveHour || {}), ...window.fiveHour } : window.fiveHour,
  };
}

function renderAccountWindow(account) {
  const statusMarkup = accountStatusMarkup(account);
  document.querySelectorAll(`[data-status-account-id="${Number(account.id)}"]`).forEach((node) => {
    if (node.innerHTML !== statusMarkup) node.innerHTML = statusMarkup;
  });
  const actionMarkup = accountActionButtons(account);
  document.querySelectorAll(`[data-actions-account-id="${Number(account.id)}"]`).forEach((node) => {
    if (node.innerHTML !== actionMarkup) node.innerHTML = actionMarkup;
  });
  const key = accountSelectionKey(account);
  const selectedMeta = state.accountSelectionMeta.get(key);
  if (selectedMeta) Object.assign(selectedMeta, {issue:account.issue || "", deletedAt:account.deletedAt || null, canDelete:Boolean(account.canDelete)});
  if (!accountCanBeSelected(account)) {
    state.accountSelection.delete(key);
    document.querySelectorAll(`.account-select[data-id="${Number(account.id)}"]`).forEach((node) => {node.checked=false;node.disabled=true;});
  }
  if (state.user?.usageCostVisible) {
    const markup = usageWindowMarkup(account);
    document.querySelectorAll(`[data-usage-account-id="${Number(account.id)}"]`).forEach((node) => {
      if (node.innerHTML !== markup) node.innerHTML = markup;
    });
  }
  if (Number(state.detailAccount?.id) === Number(account.id)) {
    mergeAccountWindow(state.detailAccount, account.usageWindow);
    Object.assign(state.detailAccount, {status:account.status,schedulable:account.schedulable,category:account.category,
      categoryLabel:account.categoryLabel,issue:account.issue,limits:account.limits,deletedAt:account.deletedAt,
      canDelete:account.canDelete,lastUsedAt:account.lastUsedAt});
    $("detailStatus").textContent = account.categoryLabel;
    $("detailStatus").className = `status-badge status-${account.category}`;
    const facts = {"账号状态":account.status || "-", "可调度":account.schedulable ? "是" : "否",
      "最近使用":formatFullDateTime(account.lastUsedAt), "账号信息":account.issue || "无"};
    $("detailFacts").querySelectorAll(".detail-fact").forEach((node) => {
      const label = node.querySelector("span")?.textContent;
      if (Object.hasOwn(facts, label)) node.querySelector("strong").textContent = facts[label];
    });
    $("deleteDetailAccount").classList.toggle("hidden", state.currentView === "archive" || Boolean(account.deletedAt)
      || !(state.user.role === "admin" || account.canDelete));
    if (state.user?.usageCostVisible) {
      const detailMarkup = usageWindowMarkup(state.detailAccount, true);
      if ($("detailUsageWindow").innerHTML !== detailMarkup) $("detailUsageWindow").innerHTML = detailMarkup;
    }
  }
}

async function loadAccountWindows(queueIfBusy = false) {
  if (!state.user || !["accounts", "archive"].includes(state.currentView)
      || weeklyActive() || document.visibilityState !== "visible") return;
  if (state.accountWindowController) {
    state.accountWindowQueuedRefresh ||= queueIfBusy;
    return;
  }
  const accounts = (state.accounts?.items || []).filter((account) => account.siteId === "main");
  if (!accounts.length) return;
  const ids = accounts.map((account) => Number(account.id));
  const session = state.sessionSerial;
  const pageSerial = state.accountRequestSerial;
  const controller = new AbortController();
  state.accountWindowController = controller;
  try {
    const data = await api(`api/accounts/usage-windows?ids=${ids.join(",")}`, { signal: controller.signal });
    if (!state.user || session !== state.sessionSerial || pageSerial !== state.accountRequestSerial) return;
    const current = new Map((state.accounts?.items || []).map((account) => [Number(account.id), account]));
    const keep = new Set(current.keys());
    for (const id of state.accountWindowSnapshots.keys()) {
      if (!keep.has(id)) state.accountWindowSnapshots.delete(id);
    }
    for (const item of data.items || []) {
      const account = current.get(Number(item.id));
      if (!account || account.siteId !== "main" || item.siteId !== "main" || !item.usageWindow) continue;
      state.accountWindowSnapshots.set(Number(item.id), { at: Date.now(), window: item.usageWindow, accountState:item.accountState });
      mergeAccountWindow(account, item.usageWindow);
      if (item.accountState) Object.assign(account, item.accountState);
      renderAccountWindow(account);
    }
    renderAccountSelectionTools();
  } catch (_) {
    // Keep the last observed window; the next tick retries without a page reset.
  } finally {
    if (state.accountWindowController === controller) {
      state.accountWindowController = null;
      const queued = state.accountWindowQueuedRefresh;
      state.accountWindowQueuedRefresh = false;
      if (queued && state.user && session === state.sessionSerial) void loadAccountWindows();
    }
  }
}

function qualityNumber(value) {
  return value == null || value === "" || !Number.isFinite(Number(value)) ? "--" : formatNumber(value);
}

function qualityRate(value) {
  return value == null || value === "" || !Number.isFinite(Number(value)) ? "--" : `${(Number(value) * 100).toFixed(2)}%`;
}

function qualityOverviewMarkup(row = {}) {
  return `<div>总请求<strong>${qualityNumber(row.observed)}</strong><small>采集请求数</small></div><div>拒答数<strong>${qualityNumber(row.refusals)}</strong><small>零输出待查 ${qualityNumber(row.zeroPending)}</small></div><div>拒答率<strong>${qualityRate(row.refusalRate)}</strong><small>${qualityNumber(row.refusals)} / ${qualityNumber(row.observed)}</small></div>`;
}

function qualityCoverageMarkup(coverage) {
  const status = coverage?.state === "complete" ? "complete" : coverage?.state === "partial" ? "partial" : "unavailable";
  const labels = { complete: "采集完整", partial: "统计不完整", unavailable: "统计不可用" };
  const reasons = { before_user_stats_epoch: "所选范围早于统计启用时间", before_full_coverage: "所选范围包含非全量采集时段", historical_counts_unavailable: "历史计数未载入，当前仅含用户统计启用后的记录", collection_policy_unknown: "采集策略记录缺失", user_stats_not_started: "用户统计尚未启用", collector_delayed: "采集存在延迟", sampling_or_disabled: "采集未全量启用", collection_gaps: "存在采集缺口", session_gap: "采集会话中断", unclean_session: "采集会话异常结束", outside_retention: "所选范围超出保留期", diagnostics_unavailable: "站点诊断暂不可用" };
  const sites = Array.isArray(coverage?.sites) ? coverage.sites : [];
  const details = sites.map((site) => {
    const messages = (site.reasons || []).map((reason) => reasons[reason] || reason);
    if (site.delayed && !messages.includes(reasons.collector_delayed)) messages.push(reasons.collector_delayed);
    if (site.includesUnobservedTime && !messages.includes(reasons.before_user_stats_epoch)) messages.push(reasons.before_user_stats_epoch);
    if (site.fullSamplingSince) messages.push(`全量采集起始 ${formatFullDateTime(site.fullSamplingSince)}`);
    if ((site.historicalCountsUnavailable || site.countsScope === "user_stats_epoch") && !messages.includes(reasons.historical_counts_unavailable)) messages.push(reasons.historical_counts_unavailable);
    const gaps = (site.gaps || []).map((gap) => `${formatFullDateTime(gap.startedAt)} 至 ${formatFullDateTime(gap.endedAt)} · ${reasons[gap.reason] || gap.reason || "采集缺口"}`);
    return `<li>${escapeHtml(site.label || siteLabel(site.site))} · 启用 ${escapeHtml(formatFullDateTime(site.startedAt))}${messages.length ? ` · ${escapeHtml(messages.join("；"))}` : ""}${gaps.length ? `<ul>${gaps.map((gap) => `<li>${escapeHtml(gap)}</li>`).join("")}</ul>` : ""}</li>`;
  }).join("");
  return `<details${status !== "complete" ? " open" : ""}><summary><span class="quality-state ${status}">${labels[status]}</span>${status === "complete" ? "数据启用时间" : "拒答率暂不可判定"}</summary>${details ? `<ul>${details}</ul>` : '<div class="quality-user-meta">暂无采集信息</div>'}</details>`;
}

function cancelRequestQuality() {
  requestQuality.listSerial++;
  requestQuality.controller?.abort();
  requestQuality.controller = null;
  requestQuality.pendingKey = null;
  requestQuality.pending = null;
  clearTimeout(requestQuality.searchTimer);
  closeRequestQualityDetail();
  if ($("requestDiagnosticsDialog")?.classList.contains("quality-linked") && $("requestDiagnosticsDialog").open) $("requestDiagnosticsDialog").close();
}

function resetRequestQuality() {
  cancelRequestQuality();
  requestQuality.cache.clear();
  requestQuality.page = 1;
  requestQuality.data = null;
  requestQuality.filters = null;
  $("requestQualityUsers").replaceChildren();
  $("requestQualityOverview").innerHTML = qualityOverviewMarkup();
  $("requestQualityCoverage").replaceChildren();
  $("requestQualityError").textContent = "";
  $("requestQualityStatus").textContent = "";
  $("requestQualitySite").value = "main";
  $("requestQualityModel").innerHTML = '<option value="">全部模型</option>';
  $("requestQualitySearch").value = "";
  $("requestQualitySort").value = "refusals";
  $("requestQualityPeriod").value = "today";
  $("requestQualityPageSize").value = "50";
  setRequestQualityPeriod();
}

function setRequestQualityPeriod() {
  const today = todayText();
  $("requestQualityFrom").max = today;
  $("requestQualityTo").max = today;
  if ($("requestQualityPeriod").value === "custom") return;
  const start = new Date(`${today}T00:00:00Z`);
  if ($("requestQualityPeriod").value === "7days") start.setUTCDate(start.getUTCDate() - 6);
  $("requestQualityFrom").value = start.toISOString().slice(0, 10);
  $("requestQualityTo").value = today;
}

function requestQualityParams() {
  return new URLSearchParams({ site: $("requestQualitySite").value, from: $("requestQualityFrom").value, to: $("requestQualityTo").value, model: $("requestQualityModel").value, search: $("requestQualitySearch").value.trim(), sort: $("requestQualitySort").value, order: "desc", page: String(requestQuality.page), pageSize: $("requestQualityPageSize").value });
}

function qualityPagination(prefix, pagination = {}) {
  const page = Number(pagination.page) || 1;
  $(prefix + "Prev").disabled = page <= 1;
  $(prefix + "Next").disabled = !pagination.hasMore;
  $(prefix + "Page").textContent = `第 ${page} / ${Math.max(1, Number(pagination.totalPages) || 1)} 页 · 共 ${qualityNumber(pagination.total)} 条`;
}

function cachedRequestQuality(params) {
  const now = performance.now();
  for (const [key, entry] of requestQuality.cache) {
    if (now - entry.at >= 15000) requestQuality.cache.delete(key);
  }
  const exact = requestQuality.cache.get(params.toString());
  if (exact) return exact.data;
  for (const entry of requestQuality.cache.values()) {
    const { data, params: previous } = entry;
    // Only a complete, unfiltered user list can be sorted/paged locally.
    if (["site", "from", "to", "model"].some((name) => previous.get(name) !== params.get(name))
        || previous.get("search") || data.rows.length !== data.pagination.total
        || data.identityLookupIncomplete || data.coverage.state === "unavailable") continue;
    const search = params.get("search").toLowerCase();
    // Python casefold differs for some Unicode text; let the server handle it.
    if (search && /[^\x00-\x7f]/.test(search + data.rows.map((row) => row.email).join(""))) continue;
    let rows = data.rows.filter((row) => !search || search === String(row.userId) || row.email.toLowerCase().includes(search));
    const field = params.get("sort") === "rate" ? "refusalRate" : params.get("sort");
    rows.sort((a, b) => a.site < b.site ? -1 : a.site > b.site ? 1 : a.userId - b.userId);
    const known = rows.filter((row) => row[field] != null);
    known.sort((a, b) => (a[field] - b[field]) * (params.get("order") === "desc" ? -1 : 1));
    rows = known.concat(rows.filter((row) => row[field] == null));
    const overview = { users: rows.length };
    for (const field of ["observed", "refusals", "zeroPending", "errors", "incomplete"]) {
      overview[field] = data.overview[field] == null ? null : rows.reduce((sum, row) => sum + Number(row[field] || 0), 0);
    }
    overview.refusalRate = data.coverage.complete && overview.observed && overview.refusals <= overview.observed
      ? overview.refusals / overview.observed : null;
    const page = Number(params.get("page")), pageSize = Number(params.get("pageSize"));
    return { ...data, overview, rows: rows.slice((page - 1) * pageSize, page * pageSize),
      pagination: { page, pageSize, total: rows.length, totalPages: Math.ceil(rows.length / pageSize), hasMore: page * pageSize < rows.length } };
  }
  return null;
}

function rememberRequestQuality(params, data) {
  if (data.coverage?.state === "unavailable" || data.identityLookupIncomplete) return;
  const key = params.toString();
  requestQuality.cache.delete(key);
  while (requestQuality.cache.size >= 12) requestQuality.cache.delete(requestQuality.cache.keys().next().value);
  requestQuality.cache.set(key, { at: performance.now(), params: new URLSearchParams(params), data });
}

async function loadRequestQuality(force = false) {
  if (state.user?.role !== "admin" || state.currentView !== "request-quality") return;
  if ($("requestQualityPeriod").value !== "custom" || !$("requestQualityFrom").value) setRequestQualityPeriod();
  const params = requestQualityParams();
  const key = params.toString();
  if (requestQuality.pendingKey === key && requestQuality.pending) return requestQuality.pending;
  if (force) requestQuality.cache.clear();
  closeRequestQualityDetail();
  requestQuality.controller?.abort();
  const serial = ++requestQuality.listSerial;
  const session = state.sessionSerial;
  const controller = new AbortController();
  requestQuality.controller = controller;
  requestQuality.pendingKey = key;
  const current = () => serial === requestQuality.listSerial && session === state.sessionSerial && state.user?.role === "admin" && state.currentView === "request-quality";
  $("requestQualityError").textContent = "";
  const keepResults = requestQuality.data && requestQuality.filters?.toString() === key;
  if (!keepResults) {
    requestQuality.data = null;
    requestQuality.filters = null;
    $("requestQualityUsers").replaceChildren();
    $("requestQualityEmpty").classList.add("hidden");
    $("requestQualityOverview").innerHTML = qualityOverviewMarkup();
    $("requestQualityCoverage").replaceChildren();
    $("requestQualityPage").textContent = "";
  }
  $("requestQualityPrev").disabled = true;
  $("requestQualityNext").disabled = true;
  const from = params.get("from"), to = params.get("to");
  const days = (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86400000 + 1;
  if (!Number.isFinite(days) || days < 1 || days > 31 || to > todayText()) {
    $("requestQualityError").textContent = "请选择不超过今天、起止顺序正确且最多 31 天的日期范围";
    $("requestQualityStatus").textContent = "";
    $("requestQualityLoading").classList.add("hidden");
    $("view-request-quality").removeAttribute("aria-busy");
    requestQuality.controller = null;
    requestQuality.pendingKey = null;
    requestQuality.pending = null;
    return;
  }
  $("requestQualityStatus").textContent = "正在读取用户请求质量";
  $("requestQualityLoading").classList.remove("hidden");
  $("view-request-quality").setAttribute("aria-busy", "true");
  try {
    const cached = force ? null : cachedRequestQuality(params);
    const pending = cached ? Promise.resolve(cached) : api(`api/request-quality/users?${params}`, { signal: controller.signal });
    // Rapid duplicate clicks share the active query instead of restarting it.
    requestQuality.pending = pending.then(() => {}, () => {});
    const data = await pending;
    if (!current()) return;
    if (!cached) rememberRequestQuality(params, data);
    requestQuality.data = data;
    requestQuality.filters = new URLSearchParams(params);
    requestQuality.page = Number(data.pagination?.page) || 1;
    $("requestQualityOverview").innerHTML = qualityOverviewMarkup(data.overview);
    $("requestQualityCoverage").innerHTML = qualityCoverageMarkup(data.coverage);
    const models = [...new Set([...(data.models || []), params.get("model")].filter(Boolean))];
    $("requestQualityModel").innerHTML = '<option value="">全部模型</option>' + models.map((model) => `<option value="${escapeHtml(model)}">${escapeHtml(model)}</option>`).join("");
    $("requestQualityModel").value = params.get("model");
    $("requestQualityUsers").innerHTML = (data.rows || []).map((row) => `<tr><td><button type="button" class="quality-user" data-quality-site="${escapeHtml(row.site)}" data-quality-user="${escapeHtml(row.userId)}">${escapeHtml(row.email || `UID ${row.userId}`)}</button><span class="quality-user-meta">${escapeHtml(siteLabel(row.site))} · UID ${escapeHtml(row.userId)}</span></td><td class="quality-wide">${qualityNumber(row.observed)}</td><td class="quality-wide">${qualityNumber(row.refusals)}</td><td>${qualityRate(row.refusalRate)}${row.observed != null && Number(row.observed) < 100 ? '<span class="quality-sample">样本少</span>' : ""}<span class="quality-mobile-count">${qualityNumber(row.refusals)} / ${qualityNumber(row.observed)}</span></td><td class="quality-wide">${qualityNumber(row.zeroPending)}</td></tr>`).join("");
    $("requestQualityEmpty").textContent = data.coverage?.state === "unavailable" ? "当前站点统计不可用" : data.identityLookupIncomplete && params.get("search") && !/^\d+$/.test(params.get("search")) ? "部分邮箱暂时无法读取，搜索结果不完整" : "没有符合条件的用户";
    $("requestQualityEmpty").classList.toggle("hidden", Boolean(data.rows?.length));
    qualityPagination("requestQuality", data.pagination);
    $("requestQualityStatus").textContent = `${from} 至 ${to} · 北京时间${data.identityLookupIncomplete ? " · 部分用户邮箱暂时无法读取" : ""}`;
  } catch (error) {
    if (!current() || error.name === "AbortError") return;
    requestQuality.data = null;
    $("requestQualityError").textContent = error.message || "用户请求质量读取失败";
    $("requestQualityStatus").textContent = "读取失败";
  } finally {
    if (current()) {
      requestQuality.controller = null;
      requestQuality.pendingKey = null;
      requestQuality.pending = null;
      $("requestQualityLoading").classList.add("hidden");
      $("view-request-quality").removeAttribute("aria-busy");
    }
  }
}

function closeRequestQualityDetail() {
  requestQuality.detailSerial++;
  requestQuality.detailController?.abort();
  requestQuality.detailController = null;
  requestQuality.selected = null;
  requestQuality.detail = null;
  const dialog = $("requestQualityDialog");
  if (dialog.open) dialog.close();
}

function openRequestQualityDetail(button) {
  if (state.user?.role !== "admin" || !requestQuality.filters) return;
  const row = requestQuality.data?.rows?.find((item) => item.site === button.dataset.qualitySite && String(item.userId) === button.dataset.qualityUser);
  if (!row) return;
  requestQuality.focus = button;
  requestQuality.selected = { site: row.site, userId: row.userId };
  requestQuality.detailPage = 1;
  $("requestQualityDetailTitle").textContent = row.email || `UID ${row.userId}`;
  $("requestQualityDetailIdentity").textContent = `${siteLabel(row.site)} · UID ${row.userId}`;
  if (!$("requestQualityDialog").open) $("requestQualityDialog").showModal();
  $("requestQualityClose").focus();
  loadRequestQualityDetail();
}

async function loadRequestQualityDetail() {
  const selected = requestQuality.selected;
  if (!selected || state.user?.role !== "admin") return;
  requestQuality.detailController?.abort();
  const serial = ++requestQuality.detailSerial, session = state.sessionSerial;
  const controller = new AbortController();
  requestQuality.detailController = controller;
  const current = () => serial === requestQuality.detailSerial && session === state.sessionSerial && state.currentView === "request-quality" && state.user?.role === "admin" && $("requestQualityDialog").open && requestQuality.selected?.site === selected.site && String(requestQuality.selected?.userId) === String(selected.userId);
  const params = new URLSearchParams(requestQuality.filters);
  params.set("page", String(requestQuality.detailPage));
  params.set("pageSize", "20");
  requestQuality.detail = null;
  $("requestQualityDetailError").textContent = "";
  $("requestQualityDetailCoverage").replaceChildren();
  $("requestQualityDetailContent").classList.add("hidden");
  $("requestQualityDetailStatus").textContent = "正在读取用户详情";
  $("requestQualityDialog").setAttribute("aria-busy", "true");
  try {
    const data = await api(`api/request-quality/users/${encodeURIComponent(selected.site)}/${encodeURIComponent(selected.userId)}?${params}`, { signal: controller.signal });
    if (!current()) return;
    requestQuality.detail = data;
    requestQuality.detailPage = Number(data.pagination?.page) || 1;
    $("requestQualityDetailOverview").innerHTML = qualityOverviewMarkup(data.user);
    $("requestQualityDetailCoverage").innerHTML = qualityCoverageMarkup(data.coverage);
    $("requestQualityModels").innerHTML = (data.byModel || []).length ? '<div class="quality-model-row muted"><span>模型</span><span>拒答 / 请求</span><span>拒答率</span></div>' + data.byModel.map((row) => `<div class="quality-model-row"><span>${escapeHtml(row.model || "未知模型")}</span><span>${qualityNumber(row.refusals)} / ${qualityNumber(row.observed)}</span><span>${qualityRate(row.refusalRate)}${row.observed != null && Number(row.observed) < 100 ? '<small class="quality-sample">样本少</small>' : ""}</span></div>`).join("") : '<div class="empty-state">暂无模型记录</div>';
    $("requestQualityEvents").innerHTML = (data.requests || []).map((item, index) => {
      const flags = [item.refusal && "明确拒答", item.zeroPending && "零输出待查", item.error && "请求错误", item.incomplete && "响应不完整"].filter(Boolean);
      return `<article class="quality-event"><div class="quality-event-head"><time>${escapeHtml(formatFullDateTime(item.startedAt))}</time><span class="${item.refusal ? "diagnostics-refusal" : "muted"}">${flags.join(" · ") || "待判定"}</span></div><div class="quality-event-meta"><span>${escapeHtml(item.model || "未知模型")}</span>${item.diagnosticAccountId && item.diagnosticEventId ? `<button type="button" class="secondary quality-diagnostic" data-quality-event="${index}">查看诊断</button>` : '<span>诊断详情不可用</span>'}</div><code>${escapeHtml(item.requestId || "请求 ID 未采集")}</code></article>`;
    }).join("") || '<div class="empty-state">没有异常请求</div>';
    qualityPagination("requestQualityEvent", data.pagination);
    $("requestQualityDetailContent").classList.remove("hidden");
    $("requestQualityDetailStatus").textContent = `${params.get("from")} 至 ${params.get("to")} · 北京时间`;
  } catch (error) {
    if (!current() || error.name === "AbortError") return;
    $("requestQualityDetailError").textContent = error.message || "用户详情读取失败";
    $("requestQualityDetailStatus").textContent = "读取失败";
  } finally {
    if (current()) {
      requestQuality.detailController = null;
      $("requestQualityDialog").removeAttribute("aria-busy");
    }
  }
}

function openQualityDiagnostic(index) {
  const item = requestQuality.detail?.requests?.[index];
  if (state.user?.role !== "admin" || !item?.diagnosticAccountId || !item.diagnosticEventId) return;
  const dialog = diagnosticsDialog();
  requestDiagnostics.listSerial++;
  requestDiagnostics.detailSerial++;
  requestDiagnostics.account = { id: item.diagnosticAccountId };
  requestDiagnostics.eventId = "";
  requestDiagnostics.detail = null;
  requestDiagnostics.bodyLoaded = false;
  requestDiagnostics.tab = "evidence";
  $("requestDiagnosticsAccount").textContent = `${$("requestQualityDetailTitle").textContent} · ${$("requestQualityDetailIdentity").textContent}`;
  $("requestDiagnosticsFrom").value = requestQuality.filters.get("from");
  $("requestDiagnosticsTo").value = requestQuality.filters.get("to");
  $("requestDiagnosticsKind").value = "all";
  $("requestDiagnosticsCoverage").textContent = "";
  $("requestDiagnosticsList").replaceChildren();
  $("requestDiagnosticsMeta").replaceChildren();
  $("requestDiagnosticsControls").classList.add("hidden");
  $("requestDiagnosticsTabs").classList.add("hidden");
  $("requestDiagnosticsBodyState").textContent = "";
  dialog.classList.add("quality-linked");
  if (!dialog.open) dialog.showModal();
  $("closeRequestDiagnostics").focus();
  loadRequestDiagnosticDetail(item.diagnosticEventId);
}

function bindRequestQualityEvents() {
  const refresh = (force = false) => { clearTimeout(requestQuality.searchTimer); requestQuality.page = 1; loadRequestQuality(force); };
  $("requestQualityFilters").addEventListener("submit", (event) => { event.preventDefault(); refresh(true); });
  for (const id of ["requestQualitySite", "requestQualityModel", "requestQualitySort", "requestQualityPageSize"]) $(id).addEventListener("change", () => refresh());
  $("requestQualityPeriod").addEventListener("change", () => { setRequestQualityPeriod(); refresh(); });
  for (const id of ["requestQualityFrom", "requestQualityTo"]) $(id).addEventListener("change", () => { $("requestQualityPeriod").value = "custom"; refresh(); });
  $("requestQualitySearch").addEventListener("input", () => { clearTimeout(requestQuality.searchTimer); requestQuality.searchTimer = setTimeout(refresh, 250); });
  $("requestQualityPrev").addEventListener("click", () => { requestQuality.page = Math.max(1, requestQuality.page - 1); loadRequestQuality(); });
  $("requestQualityNext").addEventListener("click", () => { requestQuality.page++; loadRequestQuality(); });
  $("requestQualityUsers").addEventListener("click", (event) => { const button = event.target.closest("[data-quality-user]"); if (button) openRequestQualityDetail(button); });
  $("requestQualityClose").addEventListener("click", closeRequestQualityDetail);
  $("requestQualityDialog").addEventListener("cancel", (event) => { event.preventDefault(); closeRequestQualityDetail(); });
  $("requestQualityDialog").addEventListener("close", () => {
    // Native close events are queued; an old close must not clear a reopened user.
    if ($("requestQualityDialog").open) return;
    closeRequestQualityDetail();
    $("requestQualityDialog").removeAttribute("aria-busy");
    if (requestQuality.focus?.isConnected && state.currentView === "request-quality") requestQuality.focus.focus();
    requestQuality.focus = null;
  });
  $("requestQualityEventPrev").addEventListener("click", () => { requestQuality.detailPage = Math.max(1, requestQuality.detailPage - 1); loadRequestQualityDetail(); });
  $("requestQualityEventNext").addEventListener("click", () => { requestQuality.detailPage++; loadRequestQualityDetail(); });
  $("requestQualityEvents").addEventListener("click", (event) => { const button = event.target.closest("[data-quality-event]"); if (button) openQualityDiagnostic(Number(button.dataset.qualityEvent)); });
}

const requestDiagnostics = { account: null, page: 1, listSerial: 0, detailSerial: 0, eventId: "", detail: null, tab: "evidence", bodyLoaded: false };

function requestDiagnosticBodyUnavailable(bodyState) {
  return ["not_refusal", "not_retained", "expired", "unavailable"].includes(bodyState) || String(bodyState || "").startsWith("omitted_");
}

function requestDiagnosticAttempt() {
  const attempts = requestDiagnostics.detail?.event.attempts || [];
  return attempts.find((attempt) => String(attempt.number) === $("requestDiagnosticsAttempt").value) || attempts[0];
}

function requestDiagnosticTabNeedsBody() {
  if (requestDiagnostics.tab === "evidence" || requestDiagnosticBodyUnavailable(requestDiagnostics.detail?.bodyState)) return false;
  const body = requestDiagnostics.tab === "original" ? requestDiagnostics.detail?.event.original : requestDiagnosticAttempt()?.outgoing;
  return !requestDiagnosticBodyUnavailable(body?.state);
}

function diagnosticsCountMarkup(account) {
  const d = account.diagnostics;
  if (!d || d.state === "unavailable") return '<span class="muted">暂无记录</span>';
  const admin = state.user?.role === "admin";
  const period = state.accounts?.period || {};
  const note = `${period.from || ""} 至 ${period.to || ""}`;
  const counts = `<span class="diagnostics-refusal">${formatNumber(d.refusals)}${admin ? "<small>拒答</small>" : ""}</span>${admin ? `<span class="diagnostics-zero">${formatNumber(d.zeroPending)}<small>零输出待查</small></span>` : ""}`;
  const inner = admin
    ? `<button type="button" class="diagnostics-counts" data-diagnostics-account="${account.id}" title="${escapeHtml(note)}" aria-label="查看 ${escapeHtml(account.name)} 的请求诊断">${counts}</button>`
    : `<span class="diagnostics-counts" title="${escapeHtml(note)}">${counts}</span>`;
  return `<div class="diagnostics-count-cell">${inner}</div>`;
}

function diagnosticsDialog() {
  let dialog = $("requestDiagnosticsDialog");
  if (dialog) return dialog;
  dialog = document.createElement("dialog");
  dialog.id = "requestDiagnosticsDialog";
  dialog.className = "detail-dialog request-diagnostics-dialog";
  dialog.setAttribute("aria-labelledby", "requestDiagnosticsTitle");
  dialog.innerHTML = `<div class="dialog-head"><div><h3 id="requestDiagnosticsTitle">请求诊断</h3><div id="requestDiagnosticsAccount" class="dialog-account-label"></div></div><button id="closeRequestDiagnostics" class="icon-button" type="button" aria-label="关闭">×</button></div>
    <form id="requestDiagnosticsFilters" class="diagnostics-filters"><label>日期起<input id="requestDiagnosticsFrom" type="date" required></label><label>日期止<input id="requestDiagnosticsTo" type="date" required></label><label>结果<select id="requestDiagnosticsKind"><option value="refusal">明确拒答</option><option value="zero">零输出待查</option><option value="error">请求错误</option><option value="incomplete">响应不完整</option><option value="all">全部异常</option></select></label><button type="submit" class="secondary">查询</button></form>
    <div id="requestDiagnosticsCoverage" class="diagnostics-coverage" role="status"></div><div id="requestDiagnosticsError" class="form-error" role="alert"></div>
    <div class="diagnostics-workspace"><div class="diagnostics-results"><div id="requestDiagnosticsList" class="diagnostics-list"></div><div class="diagnostics-pagination"><button id="requestDiagnosticsPrev" type="button" class="icon-button" aria-label="上一页" title="上一页">←</button><span id="requestDiagnosticsPage"></span><button id="requestDiagnosticsNext" type="button" class="icon-button" aria-label="下一页" title="下一页">→</button></div></div>
    <section class="diagnostics-detail"><div id="requestDiagnosticsMeta" class="diagnostics-meta"></div><div id="requestDiagnosticsControls" class="diagnostics-controls hidden"><label>账号请求<select id="requestDiagnosticsAttempt"></select></label><button id="requestDiagnosticsDownload" type="button" class="secondary compact">导出 JSON</button></div><div id="requestDiagnosticsTabs" class="diagnostics-tabs hidden" role="tablist"><button type="button" role="tab" data-diagnostic-tab="evidence">响应证据</button><button type="button" role="tab" data-diagnostic-tab="original">原始请求</button><button type="button" role="tab" data-diagnostic-tab="outgoing">发出的请求</button></div><div id="requestDiagnosticsBodyState" class="diagnostics-body-state"></div><pre id="requestDiagnosticsContent" class="diagnostics-content">暂无记录</pre></section></div>`;
  document.body.appendChild(dialog);
  $("closeRequestDiagnostics").addEventListener("click", () => dialog.close());
  dialog.addEventListener("close", () => { if (dialog.open) return; requestDiagnostics.listSerial++; requestDiagnostics.detailSerial++; requestDiagnostics.detail = null; requestDiagnostics.account = null; dialog.classList.remove("quality-linked"); });
  $("requestDiagnosticsFilters").addEventListener("submit", (event) => { event.preventDefault(); requestDiagnostics.page = 1; loadRequestDiagnostics(); });
  $("requestDiagnosticsPrev").addEventListener("click", () => { requestDiagnostics.page--; loadRequestDiagnostics(); });
  $("requestDiagnosticsNext").addEventListener("click", () => { requestDiagnostics.page++; loadRequestDiagnostics(); });
  $("requestDiagnosticsList").addEventListener("click", (event) => { const button = event.target.closest("[data-diagnostic-event]"); if (button) loadRequestDiagnosticDetail(button.dataset.diagnosticEvent); });
  $("requestDiagnosticsAttempt").addEventListener("change", async () => {
    if (!requestDiagnostics.bodyLoaded && requestDiagnosticTabNeedsBody()) await loadRequestDiagnosticDetail(requestDiagnostics.eventId, true);
    else renderRequestDiagnosticDetail();
  });
  $("requestDiagnosticsTabs").addEventListener("click", async (event) => {
    const button = event.target.closest("[data-diagnostic-tab]"); if (!button) return;
    requestDiagnostics.tab = button.dataset.diagnosticTab;
    if (!requestDiagnostics.bodyLoaded && requestDiagnosticTabNeedsBody()) await loadRequestDiagnosticDetail(requestDiagnostics.eventId, true);
    else renderRequestDiagnosticDetail();
  });
  $("requestDiagnosticsDownload").addEventListener("click", async () => {
    const account = requestDiagnostics.account, eventId = requestDiagnostics.eventId, session = state.sessionSerial;
    if (!requestDiagnostics.bodyLoaded && !requestDiagnosticBodyUnavailable(requestDiagnostics.detail?.bodyState)) await loadRequestDiagnosticDetail(requestDiagnostics.eventId, true);
    if (!dialog.open || session !== state.sessionSerial || account !== requestDiagnostics.account || eventId !== requestDiagnostics.eventId) return;
    if (!requestDiagnostics.detail || (!requestDiagnostics.bodyLoaded && !requestDiagnosticBodyUnavailable(requestDiagnostics.detail.bodyState))) return;
    const url = URL.createObjectURL(new Blob([JSON.stringify(requestDiagnostics.detail.event, null, 2)], { type: "application/json" }));
    const link = document.createElement("a"); link.href = url; link.download = `request-${requestDiagnostics.eventId}.json`; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  });
  return dialog;
}

function diagnosticsParams() {
  return new URLSearchParams({ from: $("requestDiagnosticsFrom").value, to: $("requestDiagnosticsTo").value, kind: $("requestDiagnosticsKind").value, page: String(requestDiagnostics.page) });
}

function openRequestDiagnostics(accountId) {
  if (state.user?.role !== "admin") return;
  const account = state.accounts?.items.find((item) => Number(item.id) === Number(accountId));
  if (!account) return;
  const dialog = diagnosticsDialog();
  dialog.classList.remove("quality-linked");
  requestDiagnostics.account = account; requestDiagnostics.page = 1; requestDiagnostics.tab = "evidence";
  $("requestDiagnosticsAccount").textContent = `${account.name} · ${accountIdentityText(account)}`;
  $("requestDiagnosticsFrom").value = state.accounts.period.from;
  $("requestDiagnosticsTo").value = state.accounts.period.to;
  $("requestDiagnosticsKind").value = account.diagnostics.refusals > 0 ? "refusal" : account.diagnostics.zeroPending > 0 ? "zero" : "all";
  if (!dialog.open) dialog.showModal();
  loadRequestDiagnostics();
}

async function loadRequestDiagnostics() {
  if (!requestDiagnostics.account) return;
  const serial = ++requestDiagnostics.listSerial;
  requestDiagnostics.detailSerial++; requestDiagnostics.detail = null; requestDiagnostics.eventId = "";
  $("requestDiagnosticsError").textContent = "";
  $("requestDiagnosticsList").textContent = "正在读取";
  $("requestDiagnosticsPrev").disabled = true; $("requestDiagnosticsNext").disabled = true;
  $("requestDiagnosticsMeta").textContent = "";
  $("requestDiagnosticsControls").classList.add("hidden"); $("requestDiagnosticsTabs").classList.add("hidden");
  $("requestDiagnosticsContent").textContent = ""; $("requestDiagnosticsBodyState").textContent = "";
  try {
    const data = await api(`api/accounts/${requestDiagnostics.account.id}/request-events?${diagnosticsParams()}`);
    if (serial !== requestDiagnostics.listSerial) return;
    const c = data.collection;
    $("requestDiagnosticsCoverage").textContent = `开始采集 ${formatFullDateTime(c.startedAt)} · 正文保留 ${c.retentionDays} 天${c.includesUnobservedTime ? " · 起始时间前无记录" : ""}`;
    $("requestDiagnosticsList").innerHTML = data.items.length ? data.items.map((item) => `<button type="button" class="diagnostics-result" data-diagnostic-event="${escapeHtml(item.id)}"><span class="diagnostics-result-head"><time>${formatFullDateTime(new Date(item.started_at).toISOString())}</time><span class="${item.refusal ? "diagnostics-refusal" : "diagnostics-zero"}">${item.refusal ? "拒答" : item.zero_pending ? "零输出" : item.error ? "错误" : "不完整"}</span></span><span class="diagnostics-result-model">${escapeHtml(item.model || "未知模型")}</span><span class="muted">HTTP ${item.http_status || "未收到响应"}</span></button>`).join("") : '<div class="empty-state">没有符合条件的记录</div>';
    $("requestDiagnosticsPage").textContent = `第 ${data.pagination.page} 页`;
    $("requestDiagnosticsPrev").disabled = data.pagination.page <= 1;
    $("requestDiagnosticsNext").disabled = !data.pagination.hasMore;
    if (data.items.length) await loadRequestDiagnosticDetail(data.items[0].id);
    else $("requestDiagnosticsContent").textContent = "暂无记录";
  } catch (error) {
    if (serial !== requestDiagnostics.listSerial) return;
    $("requestDiagnosticsError").textContent = error.message; $("requestDiagnosticsList").textContent = "读取失败";
  }
}

async function loadRequestDiagnosticDetail(eventId, withBody = false) {
  if (!requestDiagnostics.account || !eventId) return;
  if (withBody && requestDiagnostics.eventId === eventId && requestDiagnosticBodyUnavailable(requestDiagnostics.detail?.bodyState)) {
    renderRequestDiagnosticDetail();
    return;
  }
  const serial = ++requestDiagnostics.detailSerial;
  const changed = requestDiagnostics.eventId !== eventId;
  requestDiagnostics.eventId = eventId;
  if (changed) { requestDiagnostics.tab = "evidence"; requestDiagnostics.detail = null; requestDiagnostics.bodyLoaded = false; }
  $("requestDiagnosticsError").textContent = "";
  $("requestDiagnosticsContent").textContent = "正在读取";
  $("requestDiagnosticsList").querySelectorAll("[data-diagnostic-event]").forEach((button) => button.classList.toggle("selected", button.dataset.diagnosticEvent === eventId));
  try {
    const params = diagnosticsParams(); if (withBody) params.set("body", "1");
    const result = await api(`api/accounts/${requestDiagnostics.account.id}/request-events/${encodeURIComponent(eventId)}?${params}`);
    if (serial !== requestDiagnostics.detailSerial) return;
    const selected = $("requestDiagnosticsAttempt").value;
    requestDiagnostics.detail = result; requestDiagnostics.bodyLoaded = withBody;
    $("requestDiagnosticsAttempt").innerHTML = (result.event.attempts || []).map((a) => `<option value="${a.number}">第 ${a.number} 次 · ${escapeHtml(a.model || "上游模型未采集")} · ${a.refusal ? "拒答" : a.zero_output ? "零输出" : a.transport_error || a.error_type ? "错误" : a.incomplete ? "不完整" : "完成"}</option>`).join("");
    if (!changed && [...$("requestDiagnosticsAttempt").options].some((option) => option.value === selected)) $("requestDiagnosticsAttempt").value = selected;
    renderRequestDiagnosticDetail();
  } catch (error) {
    if (serial !== requestDiagnostics.detailSerial) return;
    $("requestDiagnosticsError").textContent = error.message; $("requestDiagnosticsContent").textContent = "读取失败";
  }
}

function renderRequestDiagnosticDetail() {
  const detail = requestDiagnostics.detail;
  if (!detail) return;
  const r = detail.event;
  const attempt = requestDiagnosticAttempt();
  const email = r.sub2api_user?.email || (r.sub2api_user?.state === "unavailable" ? "暂时无法读取" : "暂无邮箱");
  const identifiers = [
    ["客户端请求 ID", r.client_request_id || "未采集"],
    ["网关请求 ID", r.local_request_id || "未采集"],
    ["上游请求 ID", attempt?.upstream_request_id || "未返回"],
  ];
  if (!r.client_request_id && !r.local_request_id) identifiers.push(["诊断记录 ID", r.id]);
  $("requestDiagnosticsMeta").innerHTML = `<span>${formatFullDateTime(new Date(r.started_at).toISOString())}</span><span>客户端 HTTP ${r.http_status}</span><span class="diagnostics-user">Sub2API 用户邮箱：${escapeHtml(email)}</span>${identifiers.map(([label, value]) => `<code>${label}：${escapeHtml(value)}</code>`).join("")}`;
  $("requestDiagnosticsControls").classList.remove("hidden"); $("requestDiagnosticsTabs").classList.remove("hidden");
  $("requestDiagnosticsTabs").querySelectorAll("[data-diagnostic-tab]").forEach((button) => button.setAttribute("aria-selected", String(button.dataset.diagnosticTab === requestDiagnostics.tab)));
  const states = { complete: "完整正文", partial: "正文部分缺失", expired: "正文已过期", not_observed: "未采集正文", memory_limit: "正文未保存：采集内存达到上限", size_limit: "正文未保存：超过单条上限", not_replayable: "未取得发出请求的副本", read_error: "正文读取失败", not_retained: "正常响应未保留正文", not_refusal: "正文未保留：不是明确拒答", unavailable: "正文不可用",
    omitted_disabled: "正文未采集：正文采集已关闭", omitted_disk_budget: "正文未采集：保存额度已满", omitted_free_space_reserve: "正文未采集：磁盘可用空间不足", omitted_storage_error: "正文未保存：存储异常", omitted_budget_unknown: "正文未采集：保存额度尚未确认", omitted_budget_unavailable: "正文未采集：暂时无法确认保存额度", omitted_retention_policy: "正文未保留：记录不符合留存规则" };
  let text;
  if (requestDiagnostics.tab === "evidence") {
    const { outgoing, ...evidence } = attempt || {};
    text = JSON.stringify(evidence, null, 2);
    $("requestDiagnosticsBodyState").textContent = states[detail.bodyState] || "正文不可用";
  } else {
    const body = requestDiagnostics.tab === "original" ? r.original : attempt?.outgoing;
    const bodyState = requestDiagnosticBodyUnavailable(detail.bodyState) ? detail.bodyState : body?.state;
    $("requestDiagnosticsBodyState").textContent = `${states[bodyState] || "正文不可用"}${body?.bytes ? ` · ${formatNumber(body.bytes)} 字节` : ""}`;
    text = requestDiagnosticBodyUnavailable(bodyState) ? "" : body?.json || "";
    if (text) { try { text = JSON.stringify(JSON.parse(text), null, 2); } catch (_) {} }
    else text = "暂无正文";
  }
  if (text.length > 512000) {
    $("requestDiagnosticsBodyState").textContent += " · 预览前 512,000 字符，导出包含已保存的完整正文";
    text = text.slice(0, 512000);
  }
  $("requestDiagnosticsContent").textContent = text;
}

function renderAccounts() {
  renderLivenessJob();
  const data = state.accounts;
  if (!data) return;
  const archive = state.currentView === "archive";
  $("diagnosticsColumn").classList.toggle("hidden", archive);
  const costVisible = Boolean(state.user.usageCostVisible);
  if (costVisible) $("metricCost").textContent = formatMoney(data.summary.standardCost);
  $("metricRequests").textContent = formatNumber(data.summary.requests);
  $("metricTodayAdditions").textContent = formatNumber(data.summary.todayAdditions);
  $("metricAvailable").textContent = formatNumber(state.quota.available);
  const unlimitedVisible = Number.isFinite(Number(data.summary.unlimitedAccounts));
  $("metricUnlimitedCard").classList.toggle("hidden", !unlimitedVisible);
  if (unlimitedVisible) $("metricUnlimited").textContent = formatNumber(data.summary.unlimitedAccounts);
  renderCategoryFilters();
  const admin = state.user.role === "admin";
  $("diagnosticsColumn").textContent = admin ? "拒答 / 待查" : "拒答数";
  (data.items || []).forEach((account) => {
    const selectionKey = accountSelectionKey(account);
    state.accountSelectionMeta.set(selectionKey, {
      id: Number(account.id),
      selectionKey,
      siteId: String(account.siteId || "main"),
      localAccountId: Number(account.localAccountId ?? account.id),
      name: account.name || "",
      issue: account.issue || "",
      deletedAt: account.deletedAt || null,
      canDelete: Boolean(account.canDelete),
      reauthAllowed: account.reauthAllowed !== false,
    });
    if (!accountCanBeSelected(account)) state.accountSelection.delete(selectionKey);
  });
  $("accountsBody").innerHTML = data.items.map((account) => `
    <tr class="${state.accountSelection.has(accountSelectionKey(account)) ? "account-selected" : ""}">
      <td class="account-select-column">${accountCanBeSelected(account) ? `<input class="account-select" data-id="${account.id}" data-selection-key="${escapeHtml(accountSelectionKey(account))}" type="checkbox" aria-label="选择 ${escapeHtml(account.name)}" ${state.accountSelection.has(accountSelectionKey(account)) ? "checked" : ""}>` : ""}</td>
      <td class="account-identity-cell"><div class="account-cell"><div class="account-main"><div class="account-name-line"><strong title="${escapeHtml(account.name)}">${escapeHtml(account.name)}</strong><button type="button" class="copy-account-name" data-name="${escapeHtml(account.name)}" title="复制账号名" aria-label="复制 ${escapeHtml(account.name)}">复制</button></div><span title="${escapeHtml(accountIdentityText(account))} · Team #${account.id}">${escapeHtml(accountIdentityText(account))}</span></div></div></td>
      <td><div class="badge-stack">${archive ? refundBadge(account) : ""}<span data-status-account-id="${Number(account.id)}">${accountStatusMarkup(account)}</span></div></td>
      <td>${escapeHtml(accountSubscriptionLabel(account))}</td>
      <td class="numeric cost">${escapeHtml(accountBillingLabel(account))}</td>
      ${admin ? `<td>${escapeHtml(account.owner?.username || "未分配")}</td>` : ""}
      ${costVisible ? `<td class="numeric cost">${formatMoney(account.usage.standardCost, 4)}</td>` : ""}
      ${costVisible ? `<td class="usage-window-cell" data-usage-account-id="${Number(account.id)}">${usageWindowMarkup(account)}</td>` : ""}
      <td class="numeric">${formatNumber(account.usage.requests)}</td>
      ${!archive ? `<td class="diagnostics-column">${diagnosticsCountMarkup(account)}</td>` : ""}
      <td>${formatDateTime(account.uploadedAt)}</td>
      <td>${formatDuration(account.survivalSeconds)}</td>
      <td>${formatDateTime(account.lastUsedAt)}</td>
      <td class="account-note-cell">${accountNoteMarkup(account)}</td>
      <td data-actions-account-id="${Number(account.id)}">${accountActionButtons(account)}</td>
    </tr>
  `).join("");
$("accountsMobile").innerHTML = data.items.map((account) => `
<article class="account-card ${state.accountSelection.has(accountSelectionKey(account)) ? "account-selected" : ""}">
<div class="card-head"><div class="account-card-identity">${accountCanBeSelected(account) ? `<input class="account-select" data-id="${account.id}" data-selection-key="${escapeHtml(accountSelectionKey(account))}" type="checkbox" aria-label="选择 ${escapeHtml(account.name)}" ${state.accountSelection.has(accountSelectionKey(account)) ? "checked" : ""}>` : ""}<strong>${escapeHtml(account.name)}</strong><button type="button" class="copy-account-name" data-name="${escapeHtml(account.name)}">复制</button></div><div class="badge-stack">${archive ? refundBadge(account) : ""}<span data-status-account-id="${Number(account.id)}">${accountStatusMarkup(account)}</span></div></div>
<div class="card-grid">
<div class="card-field"><span>站点账号</span><span>${escapeHtml(accountIdentityText(account))}</span></div>
<div class="card-field"><span>订阅类型</span><span>${escapeHtml(accountSubscriptionLabel(account))}</span></div>
<div class="card-field"><span>账号价格</span><span class="cost">${escapeHtml(accountBillingLabel(account))}</span></div>
${admin ? `<div class="card-field"><span>归属</span><span>${escapeHtml(account.owner?.username || "未分配")}</span></div>` : ""}
${costVisible ? `<div class="card-field"><span>账号总计费</span><span class="cost">${formatMoney(account.usage.standardCost, 4)}</span></div>` : ""}
<div class="card-field"><span>请求数</span><span>${formatNumber(account.usage.requests)}</span></div>
${!archive ? `<div class="card-field"><span>${admin ? "拒答 / 待查" : "拒答数"}</span>${diagnosticsCountMarkup(account)}</div>` : ""}
<div class="card-field"><span>上号时间</span><span>${formatDateTime(account.uploadedAt)}</span></div>
<div class="card-field"><span>存活时间</span><span>${formatDuration(account.survivalSeconds)}</span></div>
<div class="card-field"><span>最近使用</span><span>${formatDateTime(account.lastUsedAt)}</span></div>
<div class="card-field account-note-field"><span>备注</span>${accountNoteMarkup(account)}</div>
</div>
${costVisible ? `<div class="mobile-usage-window"><span>用量窗口</span><div data-usage-account-id="${Number(account.id)}">${usageWindowMarkup(account)}</div></div>` : ""}
<div data-actions-account-id="${Number(account.id)}">${accountActionButtons(account)}</div>
</article>
`).join("");                   
  const pagination = data.pagination;
  $("paginationText").textContent = `${formatNumber(pagination.total)} 条 · ${pagination.page}/${pagination.pages} 页`;
  $("prevPage").disabled = pagination.page <= 1;
  $("nextPage").disabled = pagination.page >= pagination.pages;
  $("accountsEmpty").textContent = archive ? `没有${refundLabels[state.refundState]}账号` : "没有符合条件的账号";
  $("accountsEmpty").classList.toggle("hidden", data.items.length > 0);
  renderBulkDeleteTools();
  renderAccountSelectionTools();
}

function openAccountNote(accountId) {
  const account = state.accounts?.items.find((item) => Number(item.id) === Number(accountId))
    || (Number(state.detailAccount?.id) === Number(accountId) ? state.detailAccount : null);
  if (!account || !state.user) return;
  state.noteAccount = account;
  state.noteReturnToDetail = Boolean($("accountDialog").open && Number(state.detailAccount?.id) === Number(account.id));
  if (state.noteReturnToDetail) closeAccountDialog();
  $("accountNoteAccount").textContent = `${account.name || "账号"} · ${accountIdentityText(account)}`;
  $("accountNoteInput").value = String(account.note || "");
  $("accountNoteError").textContent = "";
  $("accountNoteDialog").showModal();
  setTimeout(() => $("accountNoteInput").focus(), 0);
}

function closeAccountNote() {
  state.noteAccount = null;
  state.noteReturnToDetail = false;
  if ($("accountNoteDialog").open) $("accountNoteDialog").close();
}

async function saveAccountNote(event) {
  event?.preventDefault();
  const account = state.noteAccount;
  if (!account || !state.user) return;
  const input = $("accountNoteInput");
  const note = input.value.trim();
  $("accountNoteError").textContent = "";
  await runButtonTask($("saveAccountNote"), "保存中", async () => {
    try {
      const data = await api(`api/accounts/${account.id}/note`, {
        method: "PATCH",
        body: { note },
      });
      const normalized = Object.prototype.hasOwnProperty.call(data, "note")
        ? (data.note == null ? null : String(data.note))
        : (note || null);
      const returnToDetail = state.noteReturnToDetail;
      account.note = normalized;
      const listAccount = state.accounts?.items.find((item) => Number(item.id) === Number(account.id));
      if (listAccount) listAccount.note = normalized;
      if (state.detailAccount && Number(state.detailAccount.id) === Number(account.id)) {
        state.detailAccount.note = normalized;
      }
      closeAccountNote();
      renderAccounts();
      if (returnToDetail) {
        if (weeklyActive()) {
          cancelWeeklyDetail();
          const controller = new AbortController();
          weekly.detailController = controller;
          weekly.detailOpen = true;
          await openAccountDetail(account.id, account, { signal: controller.signal });
          if (weekly.detailController === controller) weekly.detailController = null;
        } else {
          await openAccountDetail(account.id, account);
        }
      }
      toast(normalized ? "账号备注已保存" : "账号备注已清除");
    } catch (error) {
      $("accountNoteError").textContent = error.message;
    }
  });
}

async function openAccountDetail(accountId, resolvedAccount = null, requestOptions = {}) {
  const account = resolvedAccount || state.accounts?.items.find((item) => Number(item.id) === Number(accountId))
    || (Number(state.detailAccount?.id) === Number(accountId) ? state.detailAccount : null);
  if (!account) return;
  const session = state.sessionSerial;
  const role = weeklyRoleKey();
  state.detailAccount = account;
  $("detailName").textContent = account.name;
  $("detailStatus").textContent = account.categoryLabel;
  $("detailStatus").className = `status-badge status-${account.category}`;
  const detailFacts = [
    ["账号站点", siteLabel(account.siteId)],
    ["站点账号 ID", `#${account.localAccountId ?? account.id}`],
    ["Team 全局 ID", `#${account.id}`],
    ["账号状态", account.status || "-"],
    ["可调度", account.schedulable ? "是" : "否"],
    ["请求数", formatNumber(account.usage.requests)],
    ["上号时间", formatFullDateTime(account.uploadedAt)],
    ["订阅类型", accountSubscriptionLabel(account)],
    ["计价方式", account.priceMode === "fixed" ? "固定价格" : "动态计价"],
    ["账号价格", accountBillingLabel(account)],
    ["存活时间", formatDuration(account.survivalSeconds)],
    ["最近使用", formatFullDateTime(account.lastUsedAt)],
    ["存活截止", formatFullDateTime(account.failedAt)],
    ["处理状态", account.refundStateLabel || "-"],
    ["归属", account.owner?.username || "未分配"],
    ["备注", accountNoteText(account)],
    ["账号信息", account.issue || "无"],
  ];
  const costVisible = Boolean(state.user.usageCostVisible);
  if (costVisible) detailFacts.splice(3, 0, ["账号总计费", formatMoney(account.usage.standardCost, 6)]);
  $("detailFacts").innerHTML = detailFacts.map(([label, value]) => `<div class="detail-fact"><span>${label}</span><strong>${escapeHtml(value)}</strong></div>`).join("");
  if (state.user.role === "admin") {
    $("detailOwner").innerHTML = userOptions(account.owner?.id || state.user.id);
  }
  const refundButton = $("refundDetailAccount");
  const nextRefundState = account.canMarkRequested ? "requested" : account.canMarkRefunded ? "refunded" : "";
  refundButton.classList.toggle("hidden", !nextRefundState);
  refundButton.dataset.id = String(account.id);
  refundButton.dataset.state = nextRefundState;
  refundButton.textContent = nextRefundState === "requested" ? "标记已申请退款" : "标记已成功退款";
  const deleteButton = $("deleteDetailAccount");
  const canDelete = state.currentView !== "archive" && !account.deletedAt
    && (state.user.role === "admin" || account.canDelete);
  deleteButton.classList.toggle("hidden", !canDelete);
  deleteButton.disabled = Boolean(state.deleteJobId || state.deleteBatchId);
  deleteButton.dataset.id = String(account.id);
  $("detailUsageWindow").innerHTML = costVisible ? usageWindowMarkup(account, true) : "";
  const modelColumns = costVisible ? 4 : 3;
  const dailyColumns = costVisible ? 3 : 2;
  $("detailModels").innerHTML = `<tr><td colspan="${modelColumns}" class="muted">读取中</td></tr>`;
  $("detailDaily").innerHTML = `<tr><td colspan="${dailyColumns}" class="muted">读取中</td></tr>`;
  $("accountDialog").showModal();
  try {
    const data = await api(`api/accounts/${account.id}/usage`, requestOptions);
    if (session !== state.sessionSerial || role !== weeklyRoleKey() || state.detailAccount !== account || !$("accountDialog").open) return;
    $("detailModels").innerHTML = data.models.length ? data.models.map((row) => `
      <tr><td>${escapeHtml(row.requested_model)}</td><td>${escapeHtml(row.billed_model)}</td><td class="numeric">${formatNumber(row.requests)}</td>${costVisible ? `<td class="numeric cost">${formatMoney(row.standard_cost, 6)}</td>` : ""}</tr>
    `).join("") : `<tr><td colspan="${modelColumns}" class="muted">该账号暂无用量</td></tr>`;
    $("detailDaily").innerHTML = data.daily.length ? data.daily.map((row) => `
      <tr><td>${escapeHtml(row.day)}</td><td class="numeric">${formatNumber(row.requests)}</td>${costVisible ? `<td class="numeric cost">${formatMoney(row.standard_cost, 6)}</td>` : ""}</tr>
    `).join("") : `<tr><td colspan="${dailyColumns}" class="muted">该账号暂无用量</td></tr>`;
  } catch (error) {
    if (error.name === "AbortError" || session !== state.sessionSerial || role !== weeklyRoleKey() || state.detailAccount !== account || !$("accountDialog").open) return;
    $("detailModels").innerHTML = `<tr><td colspan="${modelColumns}" class="issue-text">${escapeHtml(error.message)}</td></tr>`;
    $("detailDaily").innerHTML = "";
  }
}

async function markRefund(accountId, nextState, button = null) {
  const account = state.accounts?.items.find((item) => Number(item.id) === Number(accountId))
    || (Number(state.detailAccount?.id) === Number(accountId) ? state.detailAccount : null);
  if (!account) return;
  const label = refundLabels[nextState];
  if (!(await confirmAction({
    title: "标记退款状态",
    message: `将 ${account.name} 标记为“${label}”？`,
    confirmLabel: "确认标记",
  }))) return;
  const task = async () => {
    try {
      await api(`api/accounts/${account.id}/refund`, {
        method: "PATCH",
        body: { state: nextState },
      });
      if ($("accountDialog").open) $("accountDialog").close();
      toast(`已标记为${label}`);
      await loadAccounts();
    } catch (error) {
      toast(error.message, true);
    }
  };
  if (button) await runButtonTask(button, "处理中", task);
  else await task();
}

async function deleteAccount(accountId, button = null) {
  const account = state.accounts?.items.find((item) => Number(item.id) === Number(accountId))
    || (Number(state.detailAccount?.id) === Number(accountId) ? state.detailAccount : null);
  if (!account || !state.user) return;
  if (account.deletedAt) {
    toast("该账号已被删除，不能再次删除", true);
    return;
  }
  if (state.deleteJobId || state.deleteBatchId) {
    toast("请等待当前删除任务完成", true);
    return;
  }
  if (state.user.role !== "admin" && !account.canDelete) {
    toast("只允许删除当前异常账号", true);
    return;
  }
  if (!(await confirmAction({
    title: "删除账号",
    message: `确认删除账号 ${account.name} 及其关联资源？`,
    confirmLabel: "确认删除",
    danger: true,
  }))) return;
  const task = async () => {
    try {
      const endpoint = state.user.role === "admin"
        ? `api/admin/accounts/${account.id}`
        : `api/accounts/${account.id}`;
      const data = await api(endpoint, { method: "DELETE" });
      state.deleteJobId = data.jobId;
      state.accountSelection.delete(accountSelectionKey(account));
      renderAccountSelectionTools();
      if ($("accountDialog").open) $("accountDialog").close();
      $("deleteJobPanel").classList.remove("hidden");
      $("deleteJobProgress").value = 0;
      $("deleteJobAccount").textContent = account.name || `#${account.id}`;
      $("deleteJobMessage").textContent = "正在提交删除任务";
      $("deleteJobStatus").textContent = "删除中";
      $("deleteJobStatus").className = "status-badge status-temporary";
      toast("删除任务已创建");
      await pollDeleteJob(true);
    } catch (error) {
      toast(error.message, true);
    }
  };
  if (button) await runButtonTask(button, "提交中", task);
  else await task();
}

async function purgeRefundedAccounts() {
  if (state.user?.role !== "admin" || state.refundedPurgeBusy) return;
  const count = Number(state.accounts?.refundedPurgeCount || 0);
  if (!count || !(await confirmAction({
    title: "归档已退款账号",
    message: `归档 ${count} 个已成功退款账号？归档只会移出已成功退款队列，不会删除账号信息或计费数据。`,
    confirmLabel: "确认归档",
    danger: true,
  }))) return;
  state.refundedPurgeBusy = true;
  renderBulkDeleteTools();
  try {
    const data = await api("api/admin/refunded-accounts", { method: "DELETE" });
    toast(`已归档 ${formatNumber(data.archived ?? data.deleted ?? 0)} 个已成功退款账号`);
    await Promise.all([loadAccounts(), loadUsers(), loadStats()]);
  } catch (error) {
    toast(error.message, true);
  } finally {
    state.refundedPurgeBusy = false;
    renderBulkDeleteTools();
  }
}

async function bulkTransitionRefunds() {
  if (state.user?.role !== "admin" || state.refundBulkBusy) return;
  const nextState = $("transitionRefundsButton").dataset.state;
  const count = Number(state.accounts?.adminRefundCounts?.[state.refundState] || 0);
  if (!nextState || !count) return;
  const label = refundLabels[nextState];
  if (!(await confirmAction({
    title: "批量标记退款",
    message: `将 ${count} 个账号标记为“${label}”？`,
    confirmLabel: "确认标记",
  }))) return;
  state.refundBulkBusy = true;
  renderBulkDeleteTools();
  try {
    const data = await api("api/admin/refunds", {
      method: "PATCH",
      body: { state: nextState },
    });
    toast(`已将 ${formatNumber(data.updated)} 个账号标记为${label}`);
    await loadAccounts();
  } catch (error) {
    toast(error.message, true);
  } finally {
    state.refundBulkBusy = false;
    renderBulkDeleteTools();
  }
}

async function saveAccountOwner() {
  if (!state.detailAccount || state.user.role !== "admin") return;
  await runButtonTask($("saveOwner"), "保存中", async () => {
    try {
      await api(`api/accounts/${state.detailAccount.id}/owner`, {
        method: "PATCH",
        body: { ownerUserId: Number($("detailOwner").value) },
      });
      toast("账号归属已更新");
      $("accountDialog").close();
      await Promise.all([loadAccounts(), loadUsers()]);
    } catch (error) {
      toast(error.message, true);
    }
  });
}

function setPriceMode(mode) {
  state.priceMode = mode === "fixed" ? "fixed" : "dynamic";
  document.querySelectorAll("[data-price-mode]").forEach((button) => {
    button.classList.toggle("active", button.dataset.priceMode === state.priceMode);
  });
  $("fixedPriceWrap").classList.toggle("hidden", state.priceMode !== "fixed");
  invalidatePricePreview();
}

function invalidatePricePreview() {
  state.pricePreviewSignature = "";
  $("pricePreview").classList.add("hidden");
  $("applyPrice").disabled = true;
  $("priceFormError").textContent = "";
}

function priceChangePayload() {
  const lines = $("priceTargets").value
    .replaceAll("\r\n", "\n")
    .replaceAll("\r", "\n")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  if (!lines.length) throw new Error("请填写账号 ID 或邮箱");
  const entries = lines.map((line) => {
    const divider = line.lastIndexOf("----");
    if (divider < 0) return { identifier: line };
    const identifier = line.slice(0, divider).trim();
    const inlinePrice = line.slice(divider + 4).trim();
    if (state.priceMode !== "fixed") throw new Error("恢复动态计价时不要填写行内价格");
    if (!identifier || !inlinePrice) throw new Error(`价格条目格式无效：${line}`);
    return { identifier, fixedPrice: inlinePrice };
  });
  const payload = { mode: state.priceMode, entries };
  if (state.priceMode === "fixed" && $("fixedPrice").value !== "") {
    payload.fixedPrice = $("fixedPrice").value;
  }
  if (state.priceMode === "fixed" && payload.fixedPrice === undefined
      && entries.some((entry) => entry.fixedPrice === undefined)) {
    throw new Error("请填写统一固定价格，或为每个账号填写行内价格");
  }
  return payload;
}

function pricePayloadSignature(payload) {
  return JSON.stringify(payload);
}

async function loadPriceHistory() {
  if (state.user?.role !== "admin") return;
  const params = new URLSearchParams();
  if (state.priceHistoryAccountId) params.set("account_id", String(state.priceHistoryAccountId));
  const search = $("priceHistorySearch").value.trim();
  if (search) params.set("q", search);
  $("priceHistoryBody").innerHTML = '<tr><td colspan="6" class="muted">读取中</td></tr>';
  try {
    const data = await api(`api/admin/account-price-history?${params.toString()}`);
    $("priceHistoryBody").innerHTML = data.items.length ? data.items.map((item) => `
      <tr>
        <td>${formatDateTime(item.createdAt)}</td>
        <td><div class="account-main"><strong>${escapeHtml(item.accountName || `#${item.accountId}`)}</strong><span>#${item.accountId}</span></div></td>
        <td>${item.oldMode === "fixed" ? "固定" : "动态"} ${formatAmount(item.oldPrice)}</td>
        <td class="cost">${item.newMode === "fixed" ? "固定" : "动态"} ${formatAmount(item.newPrice)}</td>
        <td>${escapeHtml(item.actor)}</td>
        <td class="price-reason">${escapeHtml(item.reason)}</td>
      </tr>
    `).join("") : '<tr><td colspan="6" class="muted">暂无改价记录</td></tr>';
  } catch (error) {
    $("priceHistoryBody").innerHTML = `<tr><td colspan="6" class="issue-text">${escapeHtml(error.message)}</td></tr>`;
  }
}

function openPriceEditor(accountIds, account = null) {
  if (state.user?.role !== "admin") return;
  $("priceDialogTitle").textContent = accountIds.length === 1 ? "修改账号价格" : `批量修改 ${accountIds.length} 个账号`;
  $("priceEditor").classList.remove("hidden");
  $("priceTargets").value = accountIds.map((accountId) => `#${accountId}`).join("\n");
  $("priceReason").value = "";
  $("fixedPrice").value = account?.priceMode === "fixed" ? String(account.fixedPrice ?? "") : "";
  $("priceHistorySearch").value = "";
  state.priceHistoryAccountId = accountIds.length === 1 ? Number(accountIds[0]) : null;
  setPriceMode(account?.priceMode || "dynamic");
  $("priceDialog").showModal();
  loadPriceHistory();
}

function openPriceHistoryDialog() {
  if (state.user?.role !== "admin") return;
  $("priceDialogTitle").textContent = "账号改价记录";
  $("priceEditor").classList.add("hidden");
  $("priceHistorySearch").value = "";
  state.priceHistoryAccountId = null;
  $("priceDialog").showModal();
  loadPriceHistory();
}

function closePriceDialog() {
  if ($("priceDialog").open) $("priceDialog").close();
}

async function previewPriceChange() {
  $("priceFormError").textContent = "";
  let payload;
  try {
    payload = priceChangePayload();
  } catch (error) {
    $("priceFormError").textContent = error.message;
    return;
  }
  await runButtonTask($("previewPrice"), "预览中", async () => {
    try {
      const data = await api("api/admin/account-prices/preview", { method: "POST", body: payload });
      $("pricePreviewMatched").textContent = formatNumber(data.matched);
      $("pricePreviewOld").textContent = formatAmount(data.oldTotal);
      $("pricePreviewNew").textContent = formatAmount(data.newTotal);
      $("pricePreviewDelta").textContent = `${Number(data.delta) > 0 ? "+" : ""}${formatAmount(data.delta)}`;
      const rows = data.items.map((item) => `
        <tr><td>${escapeHtml(item.accountName || `#${item.accountId}`)} <span class="muted">#${item.accountId}</span></td><td>${item.oldMode === "fixed" ? "固定" : "动态"} ${formatAmount(item.oldPrice)}</td><td class="cost">${item.newMode === "fixed" ? "固定" : "动态"} ${formatAmount(item.newPrice)}</td></tr>
      `);
      rows.push(...data.errors.map((item) => `<tr><td>${escapeHtml(item.identifier)}</td><td colspan="2" class="issue-text">${escapeHtml(item.error)}</td></tr>`));
      $("pricePreviewBody").innerHTML = rows.join("");
      $("pricePreview").classList.remove("hidden");
      state.pricePreviewSignature = data.valid ? pricePayloadSignature(payload) : "";
      $("applyPrice").disabled = !data.valid || Number(data.changed) === 0;
      if (!data.valid) $("priceFormError").textContent = "存在未匹配或重复账号，不能提交";
      else if (!data.changed) $("priceFormError").textContent = "账号已是目标计价方式和价格";
    } catch (error) {
      invalidatePricePreview();
      $("priceFormError").textContent = error.message;
    }
  });
}

async function applyPriceChange() {
  let payload;
  try {
    payload = priceChangePayload();
  } catch (error) {
    $("priceFormError").textContent = error.message;
    return;
  }
  if (pricePayloadSignature(payload) !== state.pricePreviewSignature) {
    $("priceFormError").textContent = "价格内容已变化，请重新预览";
    $("applyPrice").disabled = true;
    return;
  }
  const reason = $("priceReason").value.trim();
  if (!reason) {
    $("priceFormError").textContent = "请填写改价原因";
    return;
  }
  await runButtonTask($("applyPrice"), "提交中", async () => {
    try {
      const data = await api("api/admin/account-prices", {
        method: "PATCH",
        body: { ...payload, reason },
      });
      state.accountSelection.clear();
      closePriceDialog();
      toast(`已修改 ${formatNumber(data.updated)} 个账号价格`);
      await loadAccounts();
      loadUsers(true);
    } catch (error) {
      $("priceFormError").textContent = error.message;
    }
  });
}

function sessionKeyInputMatches(raw) {
  return Array.from(String(raw || "").matchAll(/sk-ant-[A-Za-z0-9_-]+?(?=----|[^A-Za-z0-9_-]|$)/g));
}

function recognizedSessionKeys() {
  return new Set(sessionKeyInputMatches($("bulkRaw").value).map((match) => match[0]));
}

function skAuthOriginalLines(raw) {
  const text = String(raw || "");
  const seen = new Set();
  const lines = [];
  for (const match of sessionKeyInputMatches(text)) {
    const sessionKey = match[0];
    if (seen.has(sessionKey)) continue;
    seen.add(sessionKey);
    const matchIndex = Number(match.index || 0);
    const lineStart = text.lastIndexOf("\n", matchIndex) + 1;
    const nextNewline = text.indexOf("\n", matchIndex + sessionKey.length);
    const lineEnd = nextNewline < 0 ? text.length : nextNewline;
    lines.push(text.slice(lineStart, lineEnd).trim());
  }
  return lines;
}

function authTerminal(status) {
  return ["completed", "failed", "cancelled", "expired", "needs_attention"].includes(status);
}

function reauthTerminal(status) {
  return authTerminal(status);
}

function reauthStatusText(status) {
  return {
    starting: "创建任务",
    locating: "准备账号服务",
    quarantining: "准备处理",
    draining: "处理中",
    preparing: "准备授权",
    awaiting_code: "等待授权",
    awaiting_secret: "等待 Session Key",
    exchanging: "确认授权信息",
    minting: "处理授权信息",
    verifying: "确认账号",
    restarting: "恢复账号服务",
    testing: "测试账号",
    recovering: "恢复账号状态",
    restoring: "恢复账号状态",
    rolling_back: "恢复原状态",
    cancelling: "正在取消",
    recovery_required: "需要人工恢复",
    needs_attention: "需要处理",
    awaiting_input: "等待授权信息",
    processing: "处理中",
    completed: "完成",
    failed: "失败",
    cancelled: "已取消",
    expired: "已过期",
  }[status] || "处理中";
}

function setReauthMode(mode) {
  if (!["login", "setup_token", "session_key"].includes(mode)) return;
  state.reauthMode = mode;
  document.querySelectorAll("[data-reauth-mode]").forEach((button) => {
    button.classList.toggle("active", button.dataset.reauthMode === mode);
  });
  $("reauthLoginMethodWrap").classList.toggle("hidden", mode !== "login");
  $("reauthInitialSessionKeyWrap").classList.toggle("hidden", mode !== "session_key");
  if (mode !== "login") $("reauthLoginMethod").value = "claudeai";
  $("startReauthButton").textContent = mode === "session_key"
    ? "提交 SK 并开始"
    : "生成授权链接";
  if ($("reauthDialog").open && mode === "session_key") {
    requestAnimationFrame(() => $("reauthInitialSessionKey").focus());
  }
}

function renderReauthAccount(account) {
  $("reauthTitle").textContent = `重新授权 · ${account.name}`;
  $("reauthAccountFacts").innerHTML = [
    ["账号", account.name],
    ["账号 ID", `#${account.id}`],
    ["订阅类型", accountSubscriptionLabel(account)],
  ].map(([label, value]) => `<div class="detail-fact"><span>${label}</span><strong>${escapeHtml(value)}</strong></div>`).join("");
}

function renderReauth(auth) {
  if (!auth) return;
  state.activeReauth = auth;
  state.activeReauthId = auth.id;
  const manager = auth.manager || {};
  const status = auth.status || manager.status || "processing";
  const terminal = reauthTerminal(status);
  const recoveryRequired = status === "needs_attention";
  const awaiting = status === "awaiting_input" && auth.inputType === "code";
  const awaitingSecret = status === "awaiting_input" && ["session_key", "setup_token"].includes(auth.inputType);
  const directSetupToken = auth.inputType === "setup_token" || auth.authMode === "setup_token";
  const awaitingSessionKey = awaitingSecret && !directSetupToken;
  const awaitingSetupToken = awaitingSecret && directSetupToken;
  const statusLabel = awaitingSetupToken
    ? "等待 Setup Token"
    : reauthStatusText(status);
  const authorizationUrl = String(manager.authorizationUrl || auth.authorizationUrl || "");
  $("activeReauth").classList.remove("hidden");
  $("reauthForm").classList.toggle("hidden", !terminal || recoveryRequired);
  $("reauthStatus").textContent = statusLabel;
  $("reauthStatus").className = `status-badge ${status === "completed" ? "status-healthy" : terminal ? "status-error" : "status-temporary"}`;
  $("reauthMessage").textContent = status === "completed"
    ? `${auth.accountName} 已完成重新授权${auth.restoreSchedulable ? "并恢复调度" : ""}`
    : manager.error || auth.error || statusLabel;
  $("reauthExpires").textContent = manager.expiresAt ? `截至 ${formatDateTime(manager.expiresAt)}` : "-";
  $("reauthUrl").value = authorizationUrl;
  $("reauthUrl").title = authorizationUrl;
  $("reauthLinkRow").classList.toggle("hidden", !authorizationUrl || terminal);
  $("copyReauthUrl").disabled = !authorizationUrl;
  $("openReauthUrl").disabled = !authorizationUrl;
  $("reauthCodeRow").classList.toggle("hidden", !awaiting);
  $("submitReauthCode").disabled = !awaiting;
  $("cancelReauth").classList.toggle("hidden", !awaiting);
  $("reauthSessionKeyRow").classList.toggle("hidden", !awaitingSessionKey);
  $("submitReauthSessionKey").disabled = !awaitingSessionKey;
  $("cancelReauthSecret").classList.toggle("hidden", !awaitingSessionKey);
  $("reauthSetupTokenRow").classList.toggle("hidden", !awaitingSetupToken);
  $("submitReauthSetupToken").disabled = !awaitingSetupToken;
  $("cancelReauthSetupToken").classList.toggle("hidden", !awaitingSetupToken);
  const cancellable = auth.canCancel !== false && !terminal && !recoveryRequired;
  $("cancelReauthFallback").classList.toggle("hidden", !cancellable || awaiting || awaitingSecret);
  $("recoverReauth").classList.toggle("hidden", !recoveryRequired);
  $("reauthSessionActions").classList.toggle("hidden", (terminal && !recoveryRequired) || awaiting || awaitingSecret);
  $("reauthSessionError").textContent = terminal && status !== "completed"
    ? manager.error || auth.error || reauthStatusText(status)
    : "";
  if (terminal) {
    setReauthMode(auth.authMode || "login");
    $("reauthLoginMethod").value = auth.loginMethod || "claudeai";
    $("reauthRestoreSchedulable").checked = auth.restoreSchedulable !== false;
  }
}

async function openReauthDialog(accountId) {
  const account = state.accounts?.items.find((item) => Number(item.id) === Number(accountId));
  if (!account || account.deletedAt) return;
  clearTimeout(state.reauthTimer);
  state.reauthAccountId = Number(account.id);
  state.activeReauthId = null;
  state.activeReauth = null;
  setReauthMode("login");
  $("reauthLoginMethod").value = "claudeai";
  $("reauthRestoreSchedulable").checked = true;
  $("reauthCode").value = "";
  $("reauthSessionKey").value = "";
  $("reauthInitialSessionKey").value = "";
  $("reauthSetupToken").value = "";
  $("reauthFormError").textContent = "";
  $("reauthSessionError").textContent = "";
  $("reauthForm").classList.remove("hidden");
  $("activeReauth").classList.add("hidden");
  $("reauthStatus").textContent = "待开始";
  $("reauthStatus").className = "status-badge status-temporary";
  renderReauthAccount(account);
  $("reauthDialog").showModal();
  try {
    const data = await api(`api/reauth-sessions?account_id=${encodeURIComponent(account.id)}`);
    const items = data.items || [];
    const latest = items.find((item) => item.status === "needs_attention")
      || items.find((item) => !reauthTerminal(item.status));
    if (latest) {
      renderReauth(latest);
      if (!reauthTerminal(latest.status)) pollReauth(true);
    }
  } catch (error) {
    $("reauthFormError").textContent = error.message;
  }
}

function closeReauthDialog() {
  clearTimeout(state.reauthTimer);
  state.reauthTimer = null;
  if ($("reauthDialog").open) $("reauthDialog").close();
  if ($("proxySwapDialog").open) $("proxySwapDialog").close();
}

const clientAuthRequests = new Map();

function assertClientAuthSession(serial) {
  if (serial !== state.sessionSerial) {
    const error = new Error("登录状态已变化，请刷新");
    error.staleSession = true;
    throw error;
  }
}

async function clientAuthRequest(run, signal) {
  const controller = new AbortController();
  let rejectAbort;
  const aborted = new Promise((_, reject) => { rejectAbort = reject; });
  const abort = () => {
    controller.abort();
    rejectAbort(new Error("请求连接已中断，提交结果待确认，请查看任务记录或重试原提交"));
  };
  const timer = setTimeout(abort, 20000);
  signal?.addEventListener("abort", abort, { once: true });
  try {
    if (signal?.aborted) abort();
    return await Promise.race([aborted, Promise.resolve().then(() => {
      if (controller.signal.aborted) return aborted;
      return run(controller.signal);
    })]);
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", abort);
  }
}

async function clientAuthDigest(text, keyed = false) {
  const bytes = new TextEncoder().encode(text);
  const result = keyed
    ? await crypto.subtle.sign("HMAC", await crypto.subtle.importKey(
        "raw", new TextEncoder().encode(state.csrf), { name: "HMAC", hash: "SHA-256" }, false, ["sign"],
      ), bytes)
    : await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(result)].map((value) => value.toString(16).padStart(2, "0")).join("");
}

function clientAuthCanonical(value) {
  if (Array.isArray(value)) return value.map(clientAuthCanonical);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, clientAuthCanonical(value[key])]));
  }
  return value;
}

async function clientAuthStorageKey() {
  if (!state.user || !state.csrf) throw new Error("请先登录");
  return `team-auth-intents-v1:${state.user.id}:${await clientAuthDigest(state.csrf)}`;
}

function readClientAuthPending(key) {
  const raw = JSON.parse(sessionStorage.getItem(key) || "{}");
  if (!raw || Array.isArray(raw) || typeof raw !== "object" || Object.keys(raw).length > 32) {
    throw new Error("上次提交记录无法读取，请先在任务记录中核对结果");
  }
  return raw;
}

function clearClientAuthPending(key, slot, requestId) {
  const pending = readClientAuthPending(key);
  if (pending[slot]?.requestId !== requestId) return;
  delete pending[slot];
  sessionStorage.setItem(key, JSON.stringify(pending));
}

async function lookupClientAuthPending(intent, serial = state.sessionSerial) {
  assertClientAuthSession(serial);
  const query = new URLSearchParams({ kind: `/${intent.path}`, requestId: intent.requestId });
  const result = await clientAuthRequest((signal) => api(`api/client-auth-intents?${query}`, { signal }));
  assertClientAuthSession(serial);
  return result;
}

async function postClientAuth(path, options, requestId) {
  const serial = state.sessionSerial;
  return clientAuthRequest(async (signal) => {
    assertClientAuthSession(serial);
    const response = await fetch(new URL(path, window.location.href), {
      method: "POST", credentials: "same-origin", cache: "no-store", signal,
      headers: { Accept: "application/json", "Content-Type": "application/json",
        "X-CSRF-Token": state.csrf, "X-Client-Intent-ID": requestId },
      body: JSON.stringify(options.body),
    });
    const payload = await response.json();
    assertClientAuthSession(serial);
    if (!response.ok || payload.ok === false || !(payload.id || payload.jobId)) {
      if (response.status === 401) showLogin();
      const error = new Error(payload.error || payload.message || `HTTP ${response.status}`);
      error.clientIntentRejected = payload.clientIntentRejected === true;
      throw error;
    }
    return payload;
  }, options.signal);
}

async function submitClientAuth(path, options) {
  const serial = state.sessionSerial;
  const slot = path === "api/reauth-sessions" ? `${path}:${options.body.accountId}` : path;
  const lockKey = `${serial}:${state.user?.id}:${slot}`;
  const fingerprintPromise = clientAuthDigest(JSON.stringify([path, clientAuthCanonical(options.body)]), true);
  if (clientAuthRequests.has(lockKey)) {
    const active = clientAuthRequests.get(lockKey);
    if (await active.fingerprintPromise !== await fingerprintPromise) throw new Error("上次提交仍在处理中，请先查看原任务");
    return active.promise;
  }
  const execute = async () => {
    const key = await clientAuthStorageKey();
    const fingerprint = await fingerprintPromise;
    assertClientAuthSession(serial);
    const pending = readClientAuthPending(key);
    let intent = pending[slot];
    if (intent) {
      const prior = await lookupClientAuthPending(intent, serial);
      assertClientAuthSession(serial);
      if (prior.expired) {
        clearClientAuthPending(key, slot, intent.requestId);
        throw new Error("上次提交编号已过期，请核对任务记录后重新提交");
      } else if (prior.rejected) {
        clearClientAuthPending(key, slot, intent.requestId);
        intent = null;
      } else if (prior.found) {
        clearClientAuthPending(key, slot, intent.requestId);
        if (intent.fingerprint !== fingerprint) throw new Error("已找回上次提交的任务；当前输入尚未提交，请核对任务记录后再次提交");
        toast("已找回上次提交的任务");
        return prior.result;
      }
      if (intent && intent.fingerprint !== fingerprint) throw new Error("上次提交结果待确认，请保留原输入并在任务记录中查看");
    }
    if (!intent) {
      // Other slots may have been saved while this submission awaited its lookup.
      const pending = readClientAuthPending(key);
      if (Object.keys(pending).length >= 32) throw new Error("未确认的提交较多，请先查看任务记录");
      intent = { path, fingerprint, requestId: `${Date.now()}.${crypto.randomUUID().replaceAll("-", "")}` };
      pending[slot] = intent;
      // Only opaque IDs and a session-keyed digest survive refresh. No credentials.
      sessionStorage.setItem(key, JSON.stringify(pending));
    }
    try {
      const result = await postClientAuth(path, options, intent.requestId);
      clearClientAuthPending(key, slot, intent.requestId);
      return result;
    } catch (error) {
      if (serial !== state.sessionSerial) throw error;
      if (error.clientIntentRejected) {
        clearClientAuthPending(key, slot, intent.requestId);
        throw error;
      }
      try {
        const recovered = await lookupClientAuthPending(intent, serial);
        assertClientAuthSession(serial);
        if (recovered.rejected || recovered.expired) {
          clearClientAuthPending(key, slot, intent.requestId);
        } else if (recovered.found) {
          clearClientAuthPending(key, slot, intent.requestId);
          return recovered.result;
        }
      } catch (_) { /* Keep the original ID until the server confirms its task. */ }
      throw error;
    }
  };
  const promise = execute();
  clientAuthRequests.set(lockKey, { fingerprintPromise, promise });
  try { return await promise; }
  finally { clientAuthRequests.delete(lockKey); }
}

async function recoverClientAuthPending() {
  if (!state.user || recoverClientAuthPending.running) return;
  recoverClientAuthPending.running = true;
  const serial = state.sessionSerial;
  try {
    const key = await clientAuthStorageKey();
    assertClientAuthSession(serial);
    for (const [slot, intent] of Object.entries(readClientAuthPending(key))) {
      const recovered = await lookupClientAuthPending(intent, serial);
      assertClientAuthSession(serial);
      if (recovered.rejected || recovered.expired) clearClientAuthPending(key, slot, intent.requestId);
    }
  } catch (_) { /* Existing job lists remain available while reconciliation retries. */ }
  finally { recoverClientAuthPending.running = false; }
}

async function startReauth(event) {
  event.preventDefault();
  if (!state.reauthAccountId) return;
  $("reauthFormError").textContent = "";
  const payload = {
    accountId: state.reauthAccountId,
    authMode: state.reauthMode,
    loginMethod: state.reauthMode === "login" ? $("reauthLoginMethod").value : "claudeai",
    restoreSchedulable: $("reauthRestoreSchedulable").checked,
  };
  if (state.reauthMode === "session_key") {
    const sessionKey = $("reauthInitialSessionKey").value.trim();
    if (!/^sk-ant-sid[A-Za-z0-9_-]+$/.test(sessionKey)) {
      $("reauthFormError").textContent = "请输入有效的 sk-ant-sid Session Key";
      $("reauthInitialSessionKey").focus();
      return;
    }
    payload.sessionKey = sessionKey;
  }
  await runButtonTask($("startReauthButton"), "创建中", async () => {
    try {
      const auth = await submitClientAuth("api/reauth-sessions", { method: "POST", body: payload });
      payload.sessionKey = "";
      $("reauthInitialSessionKey").value = "";
      renderReauth(auth);
      pollReauth(true);
    } catch (error) {
      $("reauthFormError").textContent = error.message;
    }
  });
}

async function pollReauth(immediate = false) {
  clearTimeout(state.reauthTimer);
  if (!state.activeReauthId || !$("reauthDialog").open) return;
  let nextDelay = immediate ? 350 : 900;
  try {
    const data = await api(`api/reauth-sessions/${state.activeReauthId}`);
    const auth = data.items?.[0];
    if (!auth) return;
    renderReauth(auth);
    if (reauthTerminal(auth.status)) {
      state.reauthTimer = null;
      await loadAccounts(true);
      toast(auth.status === "completed" ? "重新授权完成" : (auth.error || "重新授权未完成"), auth.status !== "completed");
      return;
    }
    if (auth.status === "awaiting_input") nextDelay = 2500;
  } catch (error) {
    $("reauthSessionError").textContent = error.message;
  }
  state.reauthTimer = setTimeout(() => pollReauth(), nextDelay);
}

async function submitReauthCode() {
  const code = $("reauthCode").value.trim();
  if (!code || !state.activeReauthId) return;
  await runButtonTask($("submitReauthCode"), "提交中", async () => {
    try {
      const auth = await api(`api/reauth-sessions/${state.activeReauthId}/code`, { method: "POST", body: { code } });
      $("reauthCode").value = "";
      renderReauth(auth);
      pollReauth(true);
    } catch (error) {
      $("reauthSessionError").textContent = error.message;
    }
  });
}

async function submitReauthSessionKey() {
  let sessionKey = $("reauthSessionKey").value.trim();
  $("reauthSessionKey").value = "";
  if (!sessionKey || !state.activeReauthId) return;
  if (!/^sk-ant-sid[A-Za-z0-9_-]+$/.test(sessionKey)) {
    $("reauthSessionError").textContent = "Session Key 必须是有效的 sk-ant-sid";
    sessionKey = "";
    return;
  }
  await runButtonTask($("submitReauthSessionKey"), "提交中", async () => {
    try {
      const auth = await api(`api/reauth-sessions/${state.activeReauthId}/session-key`, {
        method: "POST",
        body: { sessionKey },
      });
      sessionKey = "";
      renderReauth(auth);
      pollReauth(true);
    } catch (error) {
      sessionKey = "";
      $("reauthSessionError").textContent = error.message;
    }
  });
}

async function submitReauthSetupToken() {
  let setupToken = $("reauthSetupToken").value.trim();
  $("reauthSetupToken").value = "";
  if (!setupToken || !state.activeReauthId) return;
  if (!/^sk-ant-oat[A-Za-z0-9_-]+$/.test(setupToken)) {
    $("reauthSessionError").textContent = "Setup Token 必须是有效的 sk-ant-oat";
    setupToken = "";
    return;
  }
  await runButtonTask($("submitReauthSetupToken"), "提交中", async () => {
    try {
      const auth = await api(`api/reauth-sessions/${state.activeReauthId}/setup-token`, {
        method: "POST",
        body: { setupToken },
      });
      setupToken = "";
      renderReauth(auth);
      pollReauth(true);
    } catch (error) {
      setupToken = "";
      $("reauthSessionError").textContent = error.message;
    }
  });
}

async function cancelReauth(event) {
  if (!state.activeReauthId) return;
  const button = event?.currentTarget;
  if (button?.disabled) return;
  await runButtonTask(button, "取消中", async () => {
    try {
      const auth = await api(`api/reauth-sessions/${state.activeReauthId}/cancel`, { method: "POST", body: {} });
      renderReauth(auth);
      pollReauth(true);
    } catch (error) {
      $("reauthSessionError").textContent = error.message;
    }
  });
}

async function recoverReauth(event) {
  if (!state.activeReauthId) return;
  const button = event?.currentTarget;
  if (button?.disabled) return;
  await runButtonTask(button, "恢复中", async () => {
    try {
      const auth = await api(`api/reauth-sessions/${state.activeReauthId}/recover`, {
        method: "POST",
        body: {},
      });
      renderReauth(auth);
      if (reauthTerminal(auth.status)) {
        await loadAccounts(true);
      } else {
        pollReauth(true);
      }
    } catch (error) {
      $("reauthSessionError").textContent = error.message;
    }
  });
}

function bulkReauthTerminal(status) {
  return ["done", "done_with_errors"].includes(status);
}

function selectedReauthAccounts() {
  return selectedAccountRecords();
}

function bulkReauthModeLabel(mode = state.bulkReauthMode) {
  return mode === "login" ? "OAuth 账号登录" : mode === "setup_token" ? "Setup Token" : "Session Key (旧版)";
}

function setBulkReauthMode(mode) {
  if (!["login", "setup_token", "session_key"].includes(mode)) return;
  state.bulkReauthMode = mode;
  document.querySelectorAll("[data-bulk-reauth-mode]").forEach((button) => {
    button.classList.toggle("active", button.dataset.bulkReauthMode === mode);
  });
  $("bulkReauthLoginMethodWrap").classList.toggle("hidden", mode !== "login");
  if (mode !== "login") $("bulkReauthLoginMethod").value = "claudeai";
  $("bulkReauthPasteWrap").classList.toggle("hidden", mode !== "session_key");
  $("bulkReauthHelp").textContent = mode === "session_key"
    ? "只会授权已勾选的账号；下面每个账号必须填写一个 sk-ant-sid。"
    : "只会授权已勾选的账号；创建后每个账号会显示自己的授权链接和授权码输入框。";
  renderBulkReauthSelectedAccounts();
  updateBulkReauthButton();
}

function renderBulkReauthSelectedAccounts() {
  const accounts = selectedReauthAccounts();
  $("bulkReauthSelectedAccounts").innerHTML = accounts.map((account, index) => {
    const secretInput = state.bulkReauthMode === "session_key"
      ? `<label class="bulk-reauth-key-wrap">
          <span>SK</span>
          <input class="bulk-reauth-key" data-account-id="${account.id}" type="password" maxlength="16384" autocomplete="off" spellcheck="false" placeholder="sk-ant-sid...">
        </label>`
      : `<div class="batch-auth-state">
          <span class="status-badge status-temporary">待创建</span>
          <small>${escapeHtml(bulkReauthModeLabel())} 创建后显示授权链接</small>
        </div>`;
    return `
      <div class="batch-auth-item bulk-reauth-input-row" data-account-id="${account.id}">
        <span class="batch-auth-index">${formatNumber(index + 1)}</span>
        <div class="batch-auth-identity">
          <strong>${escapeHtml(account.name || `#${account.id}`)}</strong>
          <small>#${escapeHtml(account.id)}</small>
        </div>
        ${secretInput}
      </div>`;
  }).join("");
}

function updateBulkReauthButton() {
  const accounts = selectedReauthAccounts();
  const tooMany = accounts.length > 20;
  if (state.bulkReauthMode === "session_key") {
    const inputs = [...document.querySelectorAll(".bulk-reauth-key")];
    const filled = inputs.filter((input) => input.value.trim()).length;
    const missingKey = inputs.some((input) => !/^sk-ant-sid[A-Za-z0-9_-]+$/.test(input.value.trim()));
    const duplicateKeys = new Set(inputs.map((input) => input.value.trim()).filter(Boolean)).size !== filled;
    $("bulkReauthRecognized").textContent = `已选 ${formatNumber(accounts.length)} 个 · 已填 ${formatNumber(filled)} 个`;
    $("startBulkReauthButton").disabled = accounts.length === 0 || tooMany || missingKey || duplicateKeys;
    $("startBulkReauthButton").textContent = tooMany
      ? "一次最多 20 个"
      : duplicateKeys
        ? "存在重复 SK"
        : missingKey
        ? "存在无效 SK"
        : "开始批量重新授权";
    return;
  }
  $("bulkReauthRecognized").textContent = `已选 ${formatNumber(accounts.length)} 个 · ${bulkReauthModeLabel()}`;
  $("startBulkReauthButton").disabled = accounts.length === 0 || tooMany;
  $("startBulkReauthButton").textContent = tooMany ? "一次最多 20 个" : "批量生成授权链接";
}

function fillBulkReauthKeysFromPaste() {
  const keys = $("bulkReauthPaste").value
    .replaceAll("\r\n", "\n")
    .replaceAll("\r", "\n")
    .split("\n")
    .map((line) => {
      const match = line.trim().match(/sk-ant-sid[A-Za-z0-9_-]+/);
      return match ? match[0] : "";
    })
    .filter(Boolean);
  document.querySelectorAll(".bulk-reauth-key").forEach((input) => {
    input.value = "";
  });
  document.querySelectorAll(".bulk-reauth-key").forEach((input, index) => {
    if (keys[index]) input.value = keys[index];
  });
  updateBulkReauthButton();
}

function openBulkReauthDialog() {
  const accounts = selectedReauthAccounts();
  if (!accounts.length) {
    toast("请先勾选需要重新授权的账号", true);
    return;
  }
  if (accounts.some((account) => account.deletedAt)) {
    toast("所选账号包含已删除账号，不能重新授权", true);
    return;
  }
  if (accounts.length > 20) {
    toast("一次最多批量重新授权 20 个账号", true);
    return;
  }
  clearTimeout(state.bulkReauthTimer);
  state.activeBulkReauthId = null;
  state.activeBulkReauth = null;
  setBulkReauthMode(state.bulkReauthMode || "session_key");
  $("bulkReauthPaste").value = "";
  $("bulkReauthRestoreSchedulable").checked = true;
  $("bulkReauthError").textContent = "";
  $("bulkReauthSessionError").textContent = "";
  renderBulkReauthSelectedAccounts();
  $("activeBulkReauth").classList.add("hidden");
  $("bulkReauthForm").classList.remove("hidden");
  $("bulkReauthStatus").textContent = "待开始";
  $("bulkReauthStatus").className = "status-badge status-temporary";
  updateBulkReauthButton();
  $("bulkReauthDialog").showModal();
}

function closeBulkReauthDialog() {
  clearTimeout(state.bulkReauthTimer);
  state.bulkReauthTimer = null;
  $("bulkReauthPaste").value = "";
  $("bulkReauthSelectedAccounts").innerHTML = "";
  if ($("bulkReauthDialog").open) $("bulkReauthDialog").close();
}

function renderBulkReauth(batch) {
  if (!batch) return;
  const list = $("bulkReauthItems");
  const pendingCodes = new Map(
    [...list.querySelectorAll("[data-role='code']")].map((input) => [input.closest("[data-reauth-id]")?.dataset.reauthId, input.value]),
  );
  const focused = document.activeElement?.closest?.("[data-reauth-id]");
  const focusedId = focused?.dataset.reauthId || "";
  const focusedRole = document.activeElement?.dataset?.role || "";
  const selectionStart = document.activeElement?.selectionStart;
  const selectionEnd = document.activeElement?.selectionEnd;
  state.activeBulkReauth = batch;
  state.activeBulkReauthId = batch.id;
  const counts = batch.counts || {};
  const terminal = bulkReauthTerminal(batch.status);
  $("activeBulkReauth").classList.remove("hidden");
  $("bulkReauthForm").classList.toggle("hidden", !terminal);
  $("bulkReauthStatus").textContent = terminal ? (batch.status === "done" ? "全部完成" : "部分失败") : "进行中";
  $("bulkReauthStatus").className = `status-badge ${batch.status === "done" ? "status-healthy" : terminal ? "status-error" : "status-temporary"}`;
  $("bulkReauthJobStatus").textContent = terminal ? (batch.status === "done" ? "全部完成" : "部分失败") : "进行中";
  $("bulkReauthJobStatus").className = `status-badge ${batch.status === "done" ? "status-healthy" : terminal ? "status-error" : "status-temporary"}`;
  $("bulkReauthMessage").textContent = batch.error || `成功 ${formatNumber(counts.completed || 0)}，等待 ${formatNumber(counts.waiting || 0)}，失败 ${formatNumber(counts.failed || 0)}`;
  $("bulkReauthNumbers").textContent = `${formatNumber(counts.completed || 0)} / ${formatNumber(counts.total || batch.requestedCount || 0)}`;
  list.innerHTML = batch.items?.length ? batch.items.map((item) => {
    const manager = item.manager || {};
    const status = item.status || manager.status || "processing";
    const awaiting = status === "awaiting_input" && item.inputType === "code";
    const authorizationUrl = awaiting ? String(manager.authorizationUrl || "") : "";
    const error = String(manager.error || item.error || "");
    const mode = item.authMode || batch.authMode || "session_key";
    const code = pendingCodes.get(item.id) || "";
    const codeControls = mode === "session_key" ? "" : `
        <div class="batch-auth-item-controls">
          ${authorizationUrl ? `<div class="batch-auth-link-actions">
            <input data-role="url" type="url" readonly value="${escapeHtml(authorizationUrl)}" aria-label="${escapeHtml(item.accountName || item.targetAccountId)} 授权链接">
            <button class="secondary compact" data-bulk-reauth-action="copy" type="button">复制链接</button>
            <button class="primary compact" data-bulk-reauth-action="open" type="button">打开</button>
          </div>` : ""}
          ${awaiting ? `<div class="batch-auth-code-actions">
            <input data-role="code" autocomplete="off" spellcheck="false" maxlength="8192" value="${escapeHtml(code)}" placeholder="浏览器显示的授权码">
            <button class="primary compact" data-bulk-reauth-action="submit-code" type="button">提交授权码</button>
          </div>` : ""}
        </div>`;
    return `
      <div class="batch-auth-item" data-reauth-id="${escapeHtml(item.id)}">
        <span class="batch-auth-index">${formatNumber(item.batchIndex || 0)}</span>
        <div class="batch-auth-identity">
          <strong>${escapeHtml(item.accountName || `#${item.targetAccountId}`)}</strong>
          <small>#${escapeHtml(item.targetAccountId)} · ${escapeHtml(bulkReauthModeLabel(mode))}</small>
        </div>
        <div class="batch-auth-state">
          <span class="status-badge ${status === "completed" ? "status-healthy" : reauthTerminal(status) ? "status-error" : "status-temporary"}">${escapeHtml(reauthStatusText(status))}</span>
          <small>${escapeHtml(error || (manager.expiresAt ? `截至 ${formatDateTime(manager.expiresAt)}` : ""))}</small>
        </div>
        ${codeControls}
      </div>`;
  }).join("") : `<div class="batch-auth-empty">暂无重新授权任务</div>`;
  $("bulkReauthSessionError").textContent = batch.error || "";
  if (focusedId && focusedRole) {
    const target = list.querySelector(`[data-reauth-id="${CSS.escape(focusedId)}"] [data-role="${CSS.escape(focusedRole)}"]`);
    if (target) {
      target.focus({ preventScroll: true });
      if (Number.isInteger(selectionStart) && Number.isInteger(selectionEnd)) target.setSelectionRange(selectionStart, selectionEnd);
    }
  }
}

async function startBulkReauth(event) {
  event.preventDefault();
  $("bulkReauthError").textContent = "";
  const accounts = selectedReauthAccounts();
  if (!accounts.length) return;
  const authMode = state.bulkReauthMode;
  const sessionKeys = authMode === "session_key"
    ? [...document.querySelectorAll(".bulk-reauth-key")].map((input) => ({
        accountId: Number(input.dataset.accountId),
        sessionKey: input.value.trim(),
      }))
    : [];
  await runButtonTask($("startBulkReauthButton"), "创建中", async () => {
    try {
      const batch = await submitClientAuth("api/reauth-batches", {
        method: "POST",
        body: {
          authMode,
          loginMethod: authMode === "login" ? $("bulkReauthLoginMethod").value : "claudeai",
          restoreSchedulable: $("bulkReauthRestoreSchedulable").checked,
          accountIds: accounts.map((account) => Number(account.id)),
          sessionKeys,
        },
      });
      sessionKeys.forEach((item) => { item.sessionKey = ""; });
      document.querySelectorAll(".bulk-reauth-key").forEach((input) => { input.value = ""; });
      $("bulkReauthPaste").value = "";
      renderBulkReauth(batch);
      pollBulkReauth(true);
      toast(`已创建 ${formatNumber(batch.requestedCount)} 个重新授权任务`);
    } catch (error) {
      $("bulkReauthError").textContent = error.message;
      toast(error.message, true);
    }
  });
  updateBulkReauthButton();
}

async function submitBulkReauthCodes(codes) {
  if (!state.activeBulkReauthId || !codes.length) return;
  try {
    const batch = await api(`api/reauth-batches/${state.activeBulkReauthId}/codes`, {
      method: "POST",
      body: { codes },
    });
    if (batch.submitErrors?.length) {
      $("bulkReauthSessionError").textContent = batch.submitErrors.map((item) => item.error).join("；");
    }
    renderBulkReauth(batch);
    pollBulkReauth(true);
  } catch (error) {
    $("bulkReauthSessionError").textContent = error.message;
  }
}

async function handleBulkReauthAction(event) {
  const button = event.target.closest("[data-bulk-reauth-action]");
  if (!button) return;
  const item = button.closest("[data-reauth-id]");
  const action = button.dataset.bulkReauthAction;
  if (!item) return;
  const reauthId = item.dataset.reauthId;
  if (action === "copy") {
    const url = item.querySelector("[data-role='url']")?.value || "";
    if (!url) return;
    try {
      await copyText(url);
      toast("授权链接已复制");
    } catch (_error) {
      toast("授权链接复制失败", true);
    }
    return;
  }
  if (action === "open") {
    const url = item.querySelector("[data-role='url']")?.value || "";
    if (!url) return;
    const opened = window.open(url, "_blank", "noopener,noreferrer");
    if (!opened) toast("浏览器阻止了弹窗，请复制链接后打开", true);
    return;
  }
  if (action === "submit-code") {
    const input = item.querySelector("[data-role='code']");
    const code = input?.value?.trim() || "";
    if (!code) {
      $("bulkReauthSessionError").textContent = "请先填写授权码";
      return;
    }
    await runButtonTask(button, "提交中", async () => {
      await submitBulkReauthCodes([{ reauthId, code }]);
      if (input) input.value = "";
    });
  }
}

async function pollBulkReauth(immediate = false) {
  clearTimeout(state.bulkReauthTimer);
  if (!state.activeBulkReauthId || !$("bulkReauthDialog").open) return;
  let nextDelay = immediate ? 350 : 900;
  try {
    const data = await api(`api/reauth-batches/${state.activeBulkReauthId}`);
    const batch = data.items?.[0];
    if (!batch) return;
    renderBulkReauth(batch);
    if (bulkReauthTerminal(batch.status)) {
      state.bulkReauthTimer = null;
      await loadAccounts(true);
      toast(batch.status === "done" ? "批量重新授权完成" : "批量重新授权部分失败", batch.status !== "done");
      return;
    }
    const activeItems = (batch.items || []).filter((item) => !reauthTerminal(item.status));
    if (activeItems.length && activeItems.every((item) => item.status === "awaiting_input")) {
      nextDelay = 2500;
    }
  } catch (error) {
    $("bulkReauthSessionError").textContent = error.message;
  }
  state.bulkReauthTimer = setTimeout(() => pollBulkReauth(), nextDelay);
}

async function copySelectedImportLines() {
  const accounts = selectedAccountRecords();
  const accountIds = accounts.map((account) => Number(account.id));
  if (!accountIds.length) return;
  if (accounts.some((account) => account.deletedAt)) {
    toast("所选账号包含已删除账号，无法复制上号信息", true);
    return;
  }
  await runButtonTask($("copySelectedImportLines"), "复制中", async () => {
    try {
      const data = await api("api/accounts/import-lines", {
        method: "POST",
        body: { accountIds },
      });
      if (!data.text) {
        toast("所选账号没有找到当初上号填写的信息", true);
        return;
      }
      await copyText(data.text);
      const missing = Number(data.requested || 0) - Number(data.found || 0);
      toast(missing > 0
        ? `已复制 ${formatNumber(data.found)} 条，${formatNumber(missing)} 条未找到`
        : `已复制 ${formatNumber(data.found)} 条上号信息`);
    } catch (error) {
      toast(error.message, true);
    }
  });
}

async function copyReauthAuthorization() {
  const url = $("reauthUrl").value.trim();
  if (!url) return;
  try {
    await copyText(url);
    toast("授权链接已复制");
  } catch (_) {
    toast("授权链接复制失败", true);
  }
}

function openReauthAuthorization() {
  const url = $("reauthUrl").value.trim();
  if (!url) return;
  const opened = window.open(url, "_blank", "noopener,noreferrer");
  if (!opened) toast("浏览器阻止了弹窗，请复制链接后打开", true);
}

function setAddAuthMode(mode, { explicit = true, refreshQuota = true } = {}) {
  if (!["cookie", "login", "setup_token", "batch", "sk_auth"].includes(mode)) return;
  state.addAuthMode = mode;
  if (explicit) state.addAuthModeExplicit = true;
  document.querySelectorAll("[data-auth-mode]").forEach((button) => button.classList.toggle("active", button.dataset.authMode === mode));
  $("addForm").classList.toggle("hidden", !["cookie", "sk_auth"].includes(mode));
  $("browserAuthForm").classList.toggle("hidden", !["login", "setup_token"].includes(mode));
  $("batchAuthForm").classList.toggle("hidden", mode !== "batch");
  $("activeBrowserAuth").classList.toggle("hidden", !state.activeAuth || !["login", "setup_token"].includes(mode));
  $("activeBatchAuth").classList.toggle("hidden", !state.activeBatch || mode !== "batch");
  $("skAuthBillingWrap").classList.toggle("hidden", mode !== "sk_auth");
  $("bulkRaw").placeholder = mode === "sk_auth"
    ? "user@example.com----sk-ant-sid...\nuser@example.com----20x----sk-ant-sid..."
    : "账号与 Session Key";
  $("browserAuthHint").textContent = mode === "setup_token"
    ? "生成一年期 Setup Token；长期 token 不会经过本页面"
    : "授权完成后会自动加入账号列表";
  if (mode === "batch") updateBatchAuthButton();
  if (["cookie", "sk_auth"].includes(mode)) updateAddButton();
  if (refreshQuota) renderQuota();
}

function browserAuthStatusText(status) {
  return {
    starting: "创建任务", reserving: "分配资源", preparing: "准备账号服务",
    awaiting_code: "等待授权", exchanging: "确认授权信息", verifying: "确认账号",
    finalizing: "完成授权", cleaning: "完成清理", cleanup_pending: "等待处理",
    starting_service: "处理中", registering_sub2api: "处理中",
    awaiting_input: "等待授权信息", processing: "处理中", needs_attention: "需要处理",
    completed: "完成", failed: "失败", cancelled: "已取消", expired: "已过期",
  }[status] || "处理中";
}

function renderBrowserAuth(auth) {
  if (!auth) return;
  state.activeAuth = auth;
  $("activeBrowserAuth").classList.toggle("hidden", !["login", "setup_token"].includes(state.addAuthMode));
  const manager = auth.manager || {};
  const status = auth.status || manager.status || "processing";
  const terminal = authTerminal(status);
  const canManage = auth.canManage !== false;
  const awaiting = canManage && status === "awaiting_input" && auth.inputType === "code";
  const error = auth.error || manager.error || "";
  $("browserAuthStatus").textContent = browserAuthStatusText(status);
  $("browserAuthStatus").className = `status-badge ${status === "completed" ? "status-healthy" : terminal ? "status-error" : "status-temporary"}`;
  $("browserAuthMessage").textContent = status === "completed"
    ? `${manager.providerName || auth.providerName} 已加入账号池 · ${auth.billingTag || "20x"}`
    : error || browserAuthStatusText(status);
  $("browserAuthExpires").textContent = manager.expiresAt ? `截至 ${formatDateTime(manager.expiresAt)}` : "-";
  const authorizationUrl = awaiting ? String(manager.authorizationUrl || "") : "";
  $("browserAuthUrl").value = authorizationUrl;
  $("browserAuthUrl").title = authorizationUrl;
  $("browserAuthLinkRow").classList.toggle("hidden", !authorizationUrl);
  $("copyBrowserAuth").disabled = !authorizationUrl;
  $("openBrowserAuth").disabled = !authorizationUrl;
  $("browserAuthCodeWrap").classList.toggle("hidden", !awaiting);
  $("submitBrowserAuthCode").classList.toggle("hidden", !awaiting);
  const cancellable = canManage && auth.canCancel === true && !terminal;
  $("cancelBrowserAuth").classList.toggle("hidden", terminal || !cancellable);
  $("retryBrowserAuth").classList.toggle("hidden", !canManage || status !== "needs_attention");
  $("browserAuthSessionError").textContent = terminal && status !== "completed" ? (error || browserAuthStatusText(status)) : "";
}

function normalizeAccountEmailName(value) {
  const name = String(value || "").trim();
  if (name.includes("----") && !/[\r\n]/.test(name)) {
    const email = name.split("----", 1)[0].trim();
    if (/^[A-Za-z0-9._%+-]+@(?:[A-Za-z0-9-]+\.)+[A-Za-z]{2,63}$/.test(email)) return email;
  }
  return name;
}

async function startBrowserAuth(event) {
  event.preventDefault();
  $("browserAuthError").textContent = "";
  $("browserProviderName").value = normalizeAccountEmailName($("browserProviderName").value);
  const payload = {
    authMode: state.addAuthMode,
    loginMethod: "claudeai",
    providerName: $("browserProviderName").value.trim(),
    billingTag: $("browserBillingTag").value,
    proxyUrl: $("browserProxy").value.trim(),
  };
  if (state.user.role === "admin") payload.ownerUserId = Number($("browserOwner").value || state.user.id);
  await runButtonTask($("startBrowserAuthButton"), "创建中", async () => {
    try {
      const auth = await submitClientAuth("api/auth-sessions", { method: "POST", body: payload });
      state.activeAuthId = auth.id;
      renderBrowserAuth(auth);
      await loadInteractiveAuth(true);
      pollBrowserAuth(true);
    } catch (error) {
      $("browserAuthError").textContent = error.message;
      toast(error.message, true);
    }
  });
}

async function pollBrowserAuth(immediate = false) {
  clearTimeout(state.authTimer);
  if (!state.activeAuthId) return;
  let nextDelay = immediate ? 350 : 900;
  try {
    const data = await api(`api/auth-sessions/${state.activeAuthId}`);
    const auth = data.items[0];
    renderBrowserAuth(auth);
    if (authTerminal(auth.status)) {
      state.authTimer = null;
      await Promise.all([refreshMe(), loadAccounts(), loadProxyPool(), loadInteractiveAuth(true), state.user.role === "admin" ? loadUsers() : Promise.resolve()]);
      return;
    }
    if (auth.status === "awaiting_input") nextDelay = 2500;
  } catch (error) {
    toast(error.message, true);
  }
  state.authTimer = setTimeout(() => pollBrowserAuth(), nextDelay);
}

function openBrowserAuthorization() {
  const url = $("browserAuthUrl").value.trim();
  if (!url) return;
  const opened = window.open(url, "_blank", "noopener,noreferrer");
  if (!opened) toast("浏览器阻止了弹窗，请复制链接后打开", true);
}

async function copyBrowserAuthorization() {
  const url = $("browserAuthUrl").value.trim();
  if (!url) return;
  try {
    await copyText(url);
    toast("授权链接已复制");
  } catch (error) {
    toast("授权链接复制失败", true);
  }
}

async function submitBrowserCode() {
  const code = $("browserAuthCode").value.trim();
  if (!code || !state.activeAuthId) return;
  await runButtonTask($("submitBrowserAuthCode"), "提交中", async () => {
    try {
      const auth = await api(`api/auth-sessions/${state.activeAuthId}/code`, { method: "POST", body: { code } });
      $("browserAuthCode").value = "";
      renderBrowserAuth(auth);
      pollBrowserAuth(true);
    } catch (error) {
      $("browserAuthSessionError").textContent = error.message;
    }
  });
}

async function retryBrowserAuth() {
  if (!state.activeAuthId) return;
  await runButtonTask($("retryBrowserAuth"), "重试中", async () => {
    try {
      const auth = await api(`api/auth-sessions/${state.activeAuthId}/retry`, { method: "POST", body: {} });
      renderBrowserAuth(auth);
      pollBrowserAuth(true);
    } catch (error) {
      $("browserAuthSessionError").textContent = error.message;
    }
  });
}

async function cancelBrowserAuth() {
  if (!state.activeAuthId) return;
  try {
    const auth = await api(`api/auth-sessions/${state.activeAuthId}/cancel`, { method: "POST", body: {} });
    renderBrowserAuth(auth);
    await Promise.all([refreshMe(), loadProxyPool(), loadInteractiveAuth(true)]);
  } catch (error) {
    $("browserAuthSessionError").textContent = error.message;
  }
}

async function loadInteractiveAuth(quiet = false) {
  try {
    const data = await api("api/auth-sessions");
    const singleItems = data.items.filter((item) => !item.batchId);
    state.singleAuthJobs = singleItems;
    renderAuthorizationJobs();
  } catch (error) {
    if (!quiet) toast(error.message, true);
  }
}

function batchAuthTerminal(status) {
  return ["done", "done_with_errors"].includes(status);
}

function batchInputRows() {
  return $("batchProviderNames").value
    .replaceAll("\r\n", "\n")
    .replaceAll("\r", "\n")
    .split("\n")
    .map(normalizeAccountEmailName)
    .filter(Boolean);
}

function batchProxyStats(accountCount) {
  const lines = $("batchProxies").value.replaceAll("\r\n", "\n").replaceAll("\r", "\n").split("\n");
  while (lines.length && !lines.at(-1).trim()) lines.pop();
  const explicit = lines.filter((line) => line.trim()).length;
  return { lines: lines.length, explicit, poolNeeded: Math.max(0, accountCount - explicit) };
}

function updateBatchAuthButton() {
  if (!state.user) return;
  const names = batchInputRows();
  const count = names.length;
  const proxyStats = batchProxyStats(count);
  const duplicates = new Set(names.map((name) => name.toLocaleLowerCase())).size !== count;
  const available = Number(selectedAddQuota().available || 0);
  const quotaShortage = state.user.role !== "admin" && count > available;
  const tooMany = count > 20;
  const tooManyProxyLines = proxyStats.lines > count;
  const poolShortage = Boolean(state.proxySummary) && proxyStats.poolNeeded > Number(state.proxySummary.available || 0);
  $("batchRecognizedCount").textContent = `识别 ${formatNumber(count)} 个账号`;
  $("batchProxyCount").textContent = `自带 ${formatNumber(proxyStats.explicit)} · 池分配 ${formatNumber(proxyStats.poolNeeded)}`;
  const button = $("startBatchAuthButton");
  button.disabled = count === 0 || tooMany || duplicates || quotaShortage || tooManyProxyLines || poolShortage;
  button.textContent = tooMany
    ? "一次最多 20 个"
    : duplicates
      ? "存在重复账号"
      : quotaShortage
        ? `最多可补 ${formatNumber(available)} 个`
        : tooManyProxyLines
          ? "代理行数超出"
          : poolShortage
            ? "代理池不足"
            : "批量生成授权链接";
}

function renderBatchAuth(batch) {
  if (!batch) return;
  const list = $("batchAuthItems");
  const pendingCodes = new Map(
    [...list.querySelectorAll("[data-role='code']")].map((input) => [input.closest("[data-auth-id]")?.dataset.authId, input.value]),
  );
  const focused = document.activeElement?.closest?.("[data-auth-id]");
  const focusedId = focused?.dataset.authId || "";
  const focusedRole = document.activeElement?.dataset?.role || "";
  const selectionStart = document.activeElement?.selectionStart;
  const selectionEnd = document.activeElement?.selectionEnd;
  state.activeBatch = batch;
  state.activeBatchId = batch.id;
  $("activeBatchAuth").classList.toggle("hidden", state.addAuthMode !== "batch");
  const counts = batch.counts || {};
  const terminal = batchAuthTerminal(batch.status);
  $("batchAuthStatus").textContent = terminal ? (batch.status === "done" ? "全部完成" : "部分失败") : "进行中";
  $("batchAuthStatus").className = `status-badge ${batch.status === "done" ? "status-healthy" : batch.status === "done_with_errors" ? "status-error" : "status-temporary"}`;
  $("batchAuthMessage").textContent = batch.error || `已完成 ${formatNumber(counts.completed || 0)}，等待 ${formatNumber(counts.waiting || 0)}，失败 ${formatNumber(counts.failed || 0)}`;
  $("batchAuthNumbers").textContent = `${formatNumber(counts.completed || 0)} / ${formatNumber(counts.total || batch.requestedCount || 0)}`;
  list.innerHTML = batch.items?.length ? batch.items.map((auth) => {
    const manager = auth.manager || {};
    const status = auth.status || manager.status || "processing";
    const canManage = batch.canManage !== false && auth.canManage !== false;
    const awaiting = canManage && status === "awaiting_input" && auth.inputType === "code";
    const authorizationUrl = awaiting ? String(manager.authorizationUrl || "") : "";
    const actualEmail = String(manager.accountEmail || (status === "completed" ? manager.providerName || "" : ""));
    // A completed item cannot also have an actionable authorization error.
    // This also protects the UI from stale fallback text in older records.
    const error = status === "completed" ? "" : String(auth.error || manager.error || "");
    const cancellable = canManage && auth.canCancel === true && !authTerminal(status);
    const retryable = canManage && authTerminal(status) && status !== "completed";
    const code = pendingCodes.get(auth.id) || "";
    return `
      <div class="batch-auth-item" data-auth-id="${escapeHtml(auth.id)}">
        <span class="batch-auth-index">${formatNumber(auth.batchIndex || 0)}</span>
        <div class="batch-auth-identity">
          <strong>${escapeHtml(auth.providerName)}</strong>
          <small>${actualEmail ? `授权账号：${escapeHtml(actualEmail)}` : `${escapeHtml(auth.billingTag || "20x")} · ${auth.authMode === "setup_token" ? "Setup Token" : "OAuth 账号登录"}`}</small>
        </div>
        <div class="batch-auth-state">
          <span class="status-badge ${status === "completed" ? "status-healthy" : authTerminal(status) ? "status-error" : "status-temporary"}">${escapeHtml(browserAuthStatusText(status))}</span>
          <small>${escapeHtml(error || (manager.expiresAt ? `截至 ${formatDateTime(manager.expiresAt)}` : ""))}</small>
        </div>
        <div class="batch-auth-item-controls">
          ${authorizationUrl ? `<div class="batch-auth-link-actions">
            <input data-role="url" type="url" readonly value="${escapeHtml(authorizationUrl)}" aria-label="${escapeHtml(auth.providerName)} 授权链接">
            <button class="secondary compact" data-batch-action="copy" type="button">复制链接</button>
            <button class="primary compact" data-batch-action="open" type="button">打开</button>
          </div>` : ""}
          ${awaiting ? `<div class="batch-auth-code-actions">
            <input data-role="code" autocomplete="off" spellcheck="false" maxlength="8192" value="${escapeHtml(code)}" placeholder="浏览器显示的授权码">
            <button class="primary compact" data-batch-action="submit" type="button">完成授权</button>
          </div>` : ""}
          ${(cancellable || retryable) ? `<div class="batch-auth-item-actions">
            ${cancellable ? `<button class="secondary compact" data-batch-action="cancel" type="button">取消</button>` : ""}
            ${retryable ? `<button class="secondary compact" data-batch-action="retry" type="button">重试</button>` : ""}
          </div>` : ""}
        </div>
      </div>`;
  }).join("") : `<div class="batch-auth-empty">暂无授权账号</div>`;
  $("batchAuthSessionError").textContent = batch.error || "";
  if (focusedId && focusedRole) {
    const target = list.querySelector(`[data-auth-id="${CSS.escape(focusedId)}"] [data-role="${CSS.escape(focusedRole)}"]`);
    if (target) {
      target.focus({ preventScroll: true });
      if (Number.isInteger(selectionStart) && Number.isInteger(selectionEnd)) target.setSelectionRange(selectionStart, selectionEnd);
    }
  }
}

async function startBatchAuth(event) {
  event.preventDefault();
  $("batchAuthError").textContent = "";
  const authMode = $("batchAuthType").value;
  const payload = {
    authMode,
    loginMethod: authMode === "setup_token" ? "claudeai" : $("batchLoginMethod").value,
    providerNames: batchInputRows().join("\n"),
    proxyRaw: $("batchProxies").value,
    billingTag: $("batchBillingTag").value,
  };
  if (state.user.role === "admin") payload.ownerUserId = Number($("batchOwner").value || state.user.id);
  await runButtonTask($("startBatchAuthButton"), "创建中", async () => {
    try {
      const batch = await submitClientAuth("api/auth-batches", { method: "POST", body: payload });
      renderBatchAuth(batch);
      await loadBatchAuth(true);
      pollBatchAuth(true);
      toast(`已创建 ${formatNumber(batch.requestedCount)} 个授权任务`);
    } catch (error) {
      $("batchAuthError").textContent = error.message;
      toast(error.message, true);
    }
  });
  updateBatchAuthButton();
}

async function pollBatchAuth(immediate = false) {
  clearTimeout(state.batchAuthTimer);
  if (!state.activeBatchId) return;
  let nextDelay = immediate ? 350 : 900;
  try {
    const data = await api(`api/auth-batches/${state.activeBatchId}`);
    const batch = data.items[0];
    renderBatchAuth(batch);
    if (batchAuthTerminal(batch.status)) {
      state.batchAuthTimer = null;
      await Promise.all([refreshMe(), loadAccounts(), loadProxyPool(), loadBatchAuth(true), state.user.role === "admin" ? loadUsers() : Promise.resolve()]);
      return;
    }
    const activeItems = (batch.items || []).filter((item) => !authTerminal(item.status));
    if (activeItems.length && activeItems.every((item) => item.status === "awaiting_input")) {
      nextDelay = 2500;
    }
  } catch (error) {
    $("batchAuthSessionError").textContent = error.message;
  }
  state.batchAuthTimer = setTimeout(() => pollBatchAuth(), nextDelay);
}

async function loadBatchAuth(quiet = false) {
  try {
    const data = await api("api/auth-batches");
    state.batchAuthJobs = data.items || [];
    renderAuthorizationJobs();
  } catch (error) {
    if (!quiet) toast(error.message, true);
  }
}

function authorizationJobModeLabel(item) {
  return item.authMode === "setup_token" ? "Setup Token" : "OAuth 账号登录";
}

function authorizationJobStatusLabel(item) {
  if (item.kind === "batch") {
    return item.status === "done" ? "完成" : item.status === "done_with_errors" ? "部分失败" : "进行中";
  }
  return browserAuthStatusText(item.status);
}

function authorizationJobSummary(item) {
  const mode = authorizationJobModeLabel(item);
  if (item.kind === "batch") {
    const counts = item.counts || {};
    return `${mode} · 成功 ${formatNumber(counts.completed || 0)} · 失败 ${formatNumber(counts.failed || 0)}`;
  }
  if (!authTerminal(item.status)) return `${mode} · 处理中`;
  return `${mode} · 成功 ${item.status === "completed" ? 1 : 0} · 失败 ${item.status === "completed" ? 0 : 1}`;
}

function authorizationJobError(item) {
  if (item.kind === "batch") {
    if (!Number(item.counts?.failed || 0)) return "";
    const failed = (item.items || []).find((auth) => auth.status !== "completed" && (auth.error || auth.manager?.error));
    return item.error || (failed && (failed.error || failed.manager?.error)) || "部分账号授权失败，请查看任务详情";
  }
  if (!["failed", "expired", "cancelled", "needs_attention"].includes(item.status)) return "";
  return item.error || item.manager?.error || browserAuthStatusText(item.status);
}

function renderAuthorizationJobs() {
  const items = [
    ...state.singleAuthJobs.map((item) => ({ ...item, kind: "single" })),
    ...state.batchAuthJobs.map((item) => ({ ...item, kind: "batch" })),
  ].sort((left, right) => (Date.parse(right.createdAt) || 0) - (Date.parse(left.createdAt) || 0));
  $("authJobsList").innerHTML = items.length ? items.map((item) => {
    const total = Number(item.counts?.total || item.requestedCount || 0);
    const title = item.kind === "batch" ? `批量授权 · ${formatNumber(total)} 个账号` : item.providerName;
    const error = authorizationJobError(item);
    return `
      <button class="job-row auth-job-row secondary open-auth-job" data-kind="${item.kind}" data-id="${escapeHtml(item.id)}" type="button">
        <strong title="${escapeHtml(title)}">${escapeHtml(title)}</strong>
        <span>${escapeHtml(authorizationJobStatusLabel(item))}</span>
        <span>${escapeHtml(authorizationJobSummary(item))}</span>
        <span class="auth-job-date">${formatFullDateTime(item.createdAt)}</span>
        ${error ? `<span class="auth-job-error">${escapeHtml(error)}</span>` : ""}
      </button>
    `;
  }).join("") : `<div class="empty-state">还没有授权上号任务</div>`;
}

async function loadAuthorizationJobs(quiet = false) {
  void recoverClientAuthPending();
  await Promise.all([loadInteractiveAuth(quiet), loadBatchAuth(quiet)]);
  if (state.activeAuthId || state.activeBatchId) return;
  const activeSingle = state.singleAuthJobs.find((item) => item.canManage !== false && !authTerminal(item.status));
  const activeBatch = state.batchAuthJobs.find((item) => item.canManage !== false && !batchAuthTerminal(item.status));
  const latest = [
    activeSingle ? { ...activeSingle, kind: "single" } : null,
    activeBatch ? { ...activeBatch, kind: "batch" } : null,
  ].filter(Boolean).sort((left, right) => (Date.parse(right.createdAt) || 0) - (Date.parse(left.createdAt) || 0))[0];
  if (!latest) return;
  if (latest.kind === "batch") {
    setAddAuthMode("batch");
    renderBatchAuth(latest);
    pollBatchAuth();
    return;
  }
  state.activeAuthId = latest.id;
  setAddAuthMode(latest.authMode);
  renderBrowserAuth(latest);
  pollBrowserAuth();
}

async function openAuthorizationJob(kind, jobId) {
  try {
    if (kind === "batch") {
      clearTimeout(state.batchAuthTimer);
      state.batchAuthTimer = null;
      const data = await api(`api/auth-batches/${jobId}`);
      const batch = data.items[0];
      setAddAuthMode("batch");
      renderBatchAuth(batch);
      $("activeBatchAuth").scrollIntoView({ behavior: "smooth", block: "start" });
      if (!batchAuthTerminal(batch.status)) pollBatchAuth();
      return;
    }
    clearTimeout(state.authTimer);
    state.authTimer = null;
    const data = await api(`api/auth-sessions/${jobId}`);
    const auth = data.items[0];
    state.activeAuthId = auth.id;
    setAddAuthMode(auth.authMode);
    renderBrowserAuth(auth);
    $("activeBrowserAuth").scrollIntoView({ behavior: "smooth", block: "start" });
    if (!authTerminal(auth.status)) pollBrowserAuth();
  } catch (error) {
    toast(error.message, true);
  }
}

async function handleBatchAuthAction(event) {
  const button = event.target.closest("[data-batch-action]");
  if (!button) return;
  const row = button.closest("[data-auth-id]");
  const authId = row?.dataset.authId;
  if (!authId) return;
  const action = button.dataset.batchAction;
  if (action === "copy" || action === "open") {
    const url = row.querySelector("[data-role='url']")?.value.trim();
    if (!url) return;
    if (action === "open") {
      const opened = window.open(url, "_blank", "noopener,noreferrer");
      if (!opened) toast("浏览器阻止了弹窗，请复制链接后打开", true);
    } else {
      try {
        await copyText(url);
        toast("授权链接已复制");
      } catch (error) {
        toast("授权链接复制失败", true);
      }
    }
    return;
  }
  await runButtonTask(button, action === "submit" ? "提交中" : action === "retry" ? "重试中" : "取消中", async () => {
    try {
      if (action === "submit") {
        const code = row.querySelector("[data-role='code']")?.value.trim();
        if (!code) return;
        await api(`api/auth-sessions/${authId}/code`, { method: "POST", body: { code } });
      } else if (action === "cancel") {
        await api(`api/auth-sessions/${authId}/cancel`, { method: "POST", body: {} });
      } else if (action === "retry") {
        await api(`api/auth-sessions/${authId}/retry`, { method: "POST", body: {} });
      }
      pollBatchAuth(true);
    } catch (error) {
      $("batchAuthSessionError").textContent = error.message;
      toast(error.message, true);
    }
  });
}

function proxyInputStats(accountCount) {
  const lines = $("bulkProxies").value.replaceAll("\r\n", "\n").replaceAll("\r", "\n").split("\n");
  while (lines.length && !lines.at(-1).trim()) lines.pop();
  const explicit = lines.filter((line) => line.trim()).length;
  return { lines: lines.length, explicit, poolNeeded: Math.max(0, accountCount - explicit) };
}

async function loadProxyPool(quiet = false) {
  try {
    const data = await api("api/proxy-pool");
    state.proxySummary = data.summary;
    $("proxyAvailable").textContent = formatNumber(data.summary.available);
    $("proxyPoolDetail").textContent = `容量 ${formatNumber(data.summary.capacity)} · 已占用 ${formatNumber(data.summary.used)} · 可分配 ${formatNumber(data.summary.available)}`;
  } catch (error) {
    state.proxySummary = null;
    $("proxyAvailable").textContent = "不可用";
    $("proxyPoolDetail").textContent = "读取失败";
    if (!quiet) toast(error.message, true);
  }
  updateAddButton();
  updateBatchAuthButton();
}

function updateAddButton() {
  const count = recognizedSessionKeys().size;
  const proxyStats = proxyInputStats(count);
  $("recognizedCount").textContent = `识别 ${formatNumber(count)} 个账号`;
  const poolRemaining = state.proxySummary
    ? Math.max(0, Number(state.proxySummary.available || 0) - proxyStats.poolNeeded)
    : null;
  $("proxyAssignmentCount").textContent = `自带 ${formatNumber(proxyStats.explicit)} · 池分配 ${formatNumber(proxyStats.poolNeeded)}${poolRemaining === null ? "" : ` · 分配后剩余 ${formatNumber(poolRemaining)}`}`;
  const available = Number(selectedAddQuota().available || 0);
  const blocked = state.user?.role !== "admin" && available <= 0;
  const quotaShortage = state.user?.role !== "admin" && count > available;
  const tooManyProxyLines = proxyStats.lines > count;
  const poolShortage = state.proxySummary && proxyStats.poolNeeded > Number(state.proxySummary.available || 0);
  const skAuth = state.addAuthMode === "sk_auth";
  const tooMany = skAuth && count > SK_AUTH_BATCH_LIMIT;
  $("startAddButton").disabled = (blocked || quotaShortage || poolShortage) || count === 0 || tooMany || tooManyProxyLines;
  $("startAddButton").textContent = tooMany
    ? `一次最多 ${SK_AUTH_BATCH_LIMIT} 个`
    : blocked
    ? "当前缺口为 0"
    : quotaShortage
      ? `最多可补 ${formatNumber(available)} 个`
      : tooManyProxyLines
        ? "代理行数超出"
          : poolShortage
            ? "代理池不足"
            : skAuth ? "开始 SK OAuth 登录" : "开始上号";
}

async function startAdd(event) {
  event.preventDefault();
  $("addError").textContent = "";
  const raw = $("bulkRaw").value;
  const skAuth = state.addAuthMode === "sk_auth";
  const originalLines = skAuth ? skAuthOriginalLines(raw) : [];
  $("startAddButton").disabled = true;
  try {
    const payload = {
      raw,
      proxyRaw: $("bulkProxies").value,
    };
    if (state.user.role === "admin") payload.ownerUserId = Number($("addOwner").value || state.user.id);
    if (skAuth) {
      payload.billingTag = $("skAuthBillingTag").value;
    }
    const endpoint = skAuth ? "api/sk-auth-batches" : "api/add";
    const data = await submitClientAuth(endpoint, { method: "POST", body: payload });
    state.activeJobId = data.jobId;
    if (skAuth && !data.reused) state.skAuthOriginalLinesByJob.set(String(data.jobId), originalLines);
    $("bulkRaw").value = "";
    $("bulkProxies").value = "";
    updateAddButton();
    $("activeJob").classList.remove("hidden");
    toast(`已进入队列：${data.queuedCount || data.requestedCount} 个账号`);
    await pollActiveJob(true);
  } catch (error) {
    $("addError").textContent = error.message;
    toast(error.message, true);
  } finally {
    updateAddButton();
  }
}

function jobTerminal(status) {
  return ["done", "done_with_errors", "error"].includes(status);
}

function pruneSkAuthOriginalLines(job, results) {
  if (job.result?.kind !== "automated_session_key" || !jobTerminal(job.status)) return;
  const jobId = String(job.id || "");
  const lines = state.skAuthOriginalLinesByJob.get(jobId);
  if (!lines) return;
  const failedIndexes = new Set(results
    .filter((item) => !item.ok && CLAUDE_SK_TERMINAL_STATUSES.has(String(item.status || "")))
    .map((item) => Number(item.index) - 1)
    .filter((index) => Number.isInteger(index) && index >= 0));
  if (!failedIndexes.size) {
    state.skAuthOriginalLinesByJob.delete(jobId);
    return;
  }
  state.skAuthOriginalLinesByJob.set(
    jobId,
    lines.map((line, index) => failedIndexes.has(index) ? line : ""),
  );
}

function failedImportLineForResult(job, item) {
  if (item.ok) return "";
  const persistedLine = String(item.importLine || "");
  if (persistedLine) return persistedLine;
  if (
    job.result?.kind !== "automated_session_key"
    || !CLAUDE_SK_TERMINAL_STATUSES.has(String(item.status || ""))
  ) return "";
  const index = Number(item.index) - 1;
  if (!Number.isInteger(index) || index < 0) return "";
  return String(state.skAuthOriginalLinesByJob.get(String(job.id || ""))?.[index] || "");
}

function renderActiveJob(job) {
  $("activeJob").classList.remove("hidden");
  const wrapper = job.progress || {};
  const progress = wrapper.progress || {};
  const percent = Math.min(100, Math.max(0, Number(progress.percent || (jobTerminal(job.status) ? 100 : 0))));
  $("jobProgress").value = percent;
  $("jobMessage").textContent = progress.message || job.error || "等待执行";
  $("jobNumbers").textContent = `${formatNumber(progress.current || 0)} / ${formatNumber(progress.total || job.requestedCount || 0)}`;
  $("jobStatus").textContent = job.status === "done" ? "完成" : job.status === "done_with_errors" ? "部分失败" : job.status === "error" ? "失败" : job.status === "queued" ? "排队中" : "执行中";
  $("jobStatus").className = `status-badge ${job.status === "done" ? "status-healthy" : jobTerminal(job.status) ? "status-error" : "status-temporary"}`;
  const queued = Number(progress.queued || 0);
  const cancelButton = $("cancelQueuedSkBatch");
  const cookieBulk = job.bulkCancelable === true;
  const skCancelable = job.result?.kind === "automated_session_key" && queued > 0;
  cancelButton.dataset.queued = String(queued);
  cancelButton.dataset.jobId = String(job.id || "");
  cancelButton.dataset.kind = cookieBulk ? "cookie" : "sk";
  cancelButton.dataset.cancelRequested = String(job.cancelRequested === true);
  cancelButton.classList.toggle("hidden", jobTerminal(job.status) || (!cookieBulk && !skCancelable));
  if (!cancelButton.hasAttribute("aria-busy")) {
    cancelButton.textContent = job.cancelRequested ? "已请求取消" : "取消排队";
    cancelButton.disabled = job.cancelRequested === true;
  }
  const events = (wrapper.events || []).slice(-30);
  $("jobEvents").innerHTML = events.map((event) => `
    <div class="event-row"><span>${Math.round(Number(event.percent || 0))}%</span><span>${escapeHtml(event.item?.name ? `${event.item.name} · ${event.message || event.item.detail || ""}` : event.message || "")}</span></div>
  `).join("");
  const rawResults = job.result?.results || [];
  pruneSkAuthOriginalLines(job, rawResults);
  state.failedImportLines = [];
  const results = rawResults.map((item) => {
    const importLine = failedImportLineForResult(job, item);
    const copyIndex = importLine ? state.failedImportLines.push(importLine) - 1 : -1;
    return { item, importLine, copyIndex };
  });
  $("failedImportCopyTools").classList.toggle("hidden", state.failedImportLines.length === 0);
  $("failedImportCopyCount").textContent = `失败 ${formatNumber(state.failedImportLines.length)} 个`;
  $("copyFailedImportsButton").disabled = state.failedImportLines.length === 0;
  $("jobResults").innerHTML = results.map(({ item, importLine, copyIndex }) => `
    <div class="result-row">
      <span class="status-badge ${item.ok ? "status-healthy" : item.status && !CLAUDE_SK_TERMINAL_STATUSES.has(item.status) ? "status-temporary" : "status-error"}">${item.ok ? "成功" : item.status && !CLAUDE_SK_TERMINAL_STATUSES.has(item.status) ? escapeHtml(claudeSkStatusLabels[item.status] || "处理中") : "失败"}</span>
      <div class="result-copy">
        <strong>${escapeHtml(item.providerName || `#${item.index}`)}</strong>
        <span>${escapeHtml(item.ok ? (item.automatedJobId ? (item.message || "SK OAuth 登录完成") : "账号已加入列表") : item.error || item.message || item.status || "上号失败")}</span>
      </div>
      ${item.needsBrowser && item.automatedJobId ? `<button class="secondary compact open-sk-browser" data-job-id="${escapeHtml(item.automatedJobId)}" type="button">查看浏览器</button>` : ""}
      ${importLine ? `<button class="secondary compact copy-import-line" data-copy-index="${copyIndex}" type="button">复制原始信息</button>` : ""}
    </div>
  `).join("");
}

async function cancelQueuedSkBatch(event) {
  const button = event.currentTarget;
  const jobId = button.dataset.jobId;
  const cookieBulk = button.dataset.kind === "cookie";
  const sessionSerial = state.sessionSerial;
  if (!jobId || button.disabled || button.dataset.cancelRequested === "true") return;
  const queued = Number(button.dataset.queued || 0);
  if (!(await confirmAction({
    title: "取消未开始的账号",
    message: cookieBulk
      ? "取消这批尚未开始的账号？已经开始的授权会继续处理，可补额度会在结果确认后更新。"
      : `取消尚未执行的 ${formatNumber(queued)} 个账号？这些 Session Key 不会保留，需要重新导入才能再次登录。`,
    confirmLabel: "确认取消",
    danger: true,
  }))) return;
  if (sessionSerial !== state.sessionSerial) return;
  try {
    await runButtonTask(button, "取消中", async () => {
      const endpoint = cookieBulk ? `api/jobs/${jobId}/cancel` : `api/sk-auth-batches/${jobId}/cancel`;
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 20000);
      let data;
      try {
        data = await api(endpoint, { method: "POST", body: {}, signal: controller.signal });
        if (controller.signal.aborted) {
          const error = new Error("Cancel response was not confirmed");
          error.name = "AbortError";
          throw error;
        }
      } finally {
        clearTimeout(timeout);
      }
      if (sessionSerial !== state.sessionSerial) return;
      if (cookieBulk && (!data.job || String(data.job.id || "") !== jobId)) {
        throw new Error("取消结果尚未确认，正在同步任务状态");
      }
      toast(cookieBulk ? "取消请求已记录" : `已取消 ${formatNumber(data.cancelled || 0)} 个排队账号`);
      if (state.activeJobId === jobId && data.job) renderActiveJob(data.job);
    });
  } catch (error) {
    if (sessionSerial === state.sessionSerial) {
      toast(error.name === "AbortError" ? "取消请求回复超时，任务状态会继续同步" : error.message, true);
    }
  } finally {
    if (!button.hasAttribute("aria-busy")) {
      const requested = button.dataset.cancelRequested === "true";
      button.disabled = requested;
      button.textContent = requested ? "已请求取消" : "取消排队";
    }
    if (sessionSerial === state.sessionSerial && state.activeJobId === jobId) await pollActiveJob(true);
  }
}

async function pollActiveJob(immediate = false) {
  clearTimeout(state.jobTimer);
  const jobId = state.activeJobId;
  const sessionSerial = state.sessionSerial;
  if (!jobId) return;
  try {
    const data = await api(`api/jobs/${jobId}`);
    if (sessionSerial !== state.sessionSerial || jobId !== state.activeJobId) return;
    const job = data.items[0];
    renderActiveJob(job);
    if (jobTerminal(job.status)) {
      state.jobTimer = null;
      await Promise.all([refreshMe(), loadJobs(), loadAccounts(), loadProxyPool(), state.user.role === "admin" ? loadUsers() : Promise.resolve()]);
      return;
    }
  } catch (error) {
    if (sessionSerial !== state.sessionSerial || jobId !== state.activeJobId) return;
    toast(error.message, true);
  }
  if (sessionSerial !== state.sessionSerial || jobId !== state.activeJobId) return;
  state.jobTimer = setTimeout(() => pollActiveJob(), immediate ? 500 : 1800);
}

async function loadJobs(quiet = false) {
  if (!state.user) return;
  try {
    const data = await api("api/jobs");
    renderJobs(data.items);
    if (!state.activeJobId) {
      const running = data.items.find((job) => !jobTerminal(job.status));
      if (running) {
        state.activeJobId = running.id;
        renderActiveJob(running);
        pollActiveJob();
      }
    }
  } catch (error) {
    if (!quiet) toast(error.message, true);
  }
}

function renderJobs(items) {
  $("jobsList").innerHTML = items.length ? items.map((job) => {
    const progress = job.progress?.progress || {};
    const success = job.result?.summary?.success ?? progress.success ?? 0;
    const failed = job.result?.summary?.failed ?? progress.failed ?? 0;
    return `
      <button class="job-row secondary open-job" data-id="${job.id}" type="button">
        <strong>${formatFullDateTime(job.createdAt)}</strong>
        <span>${job.status}</span>
        <span>成功 ${success} · 失败 ${failed}</span>
        <span>${Math.round(Number(progress.percent || 0))}%</span>
      </button>
    `;
  }).join("") : `<div class="empty-state">还没有上号任务</div>`;
}

async function openJob(jobId) {
  state.activeJobId = jobId;
  try {
    const data = await api(`api/jobs/${jobId}`);
    const job = data.items[0];
    renderActiveJob(job);
    $("activeJob").scrollIntoView({ behavior: "smooth", block: "start" });
    if (!jobTerminal(job.status)) pollActiveJob();
  } catch (error) {
    toast(error.message, true);
  }
}

function renderDeleteJob(job) {
  $("deleteJobPanel").classList.remove("hidden");
  const progress = job.progress?.progress || {};
  const terminal = jobTerminal(job.status);
  const percent = Math.min(100, Math.max(0, Number(progress.percent || (terminal ? 100 : 0))));
  const recordsRetained = job.result?.panelCleanup?.skipped;
  const successMessage = recordsRetained ? "账号及关联资源已删除，面板计费记录已保留" : "账号及关联资源已删除";
  $("deleteJobProgress").value = percent;
  $("deleteJobAccount").textContent = job.accountName || `#${job.accountId}`;
  $("deleteJobMessage").textContent = terminal
    ? (job.status === "done" ? successMessage : job.result?.error || job.error || "删除失败")
    : progress.message || job.result?.error || job.error || "等待删除";
  $("deleteJobStatus").textContent = job.status === "done" ? "已删除" : job.status === "error" ? "失败" : "删除中";
  $("deleteJobStatus").className = `status-badge ${job.status === "done" ? "status-healthy" : job.status === "error" ? "status-error" : "status-temporary"}`;
}

async function pollDeleteJob(immediate = false) {
  clearTimeout(state.deleteJobTimer);
  if (!state.deleteJobId) return;
  try {
    const data = await api(`api/delete-jobs/${state.deleteJobId}`);
    const job = data.items[0];
    renderDeleteJob(job);
    if (jobTerminal(job.status)) {
      state.deleteJobTimer = null;
      state.deleteJobId = null;
      if (job.status === "error") $("deleteJobPanel").classList.add("hidden");
      const recordsRetained = job.result?.panelCleanup?.skipped;
      toast(job.status === "done" ? `${job.accountName} 已删除${recordsRetained ? "，计费记录已保留" : ""}` : job.error || "删除失败", job.status !== "done");
      await Promise.all([
        loadAccounts(),
        loadProxyPool(),
        state.user.role === "admin" ? loadUsers() : Promise.resolve(),
      ]);
      return;
    }
  } catch (error) {
    toast(error.message, true);
  }
  state.deleteJobTimer = setTimeout(() => pollDeleteJob(), immediate ? 400 : 1500);
}

async function loadDeleteJobs(quiet = false) {
  if (!state.user || state.deleteJobId || state.deleteBatchId) return;
  try {
    const data = await api("api/delete-jobs");
    const running = data.items.find((job) => !jobTerminal(job.status));
    if (running) {
      if (running.batchId) {
        state.deleteBatchId = running.batchId;
        pollDeleteBatch(true);
      } else {
        state.deleteJobId = running.id;
        renderDeleteJob(running);
        pollDeleteJob();
      }
    } else {
      $("deleteJobPanel").classList.add("hidden");
      hideDeleteBatchPanel();
    }
  } catch (error) {
    if (!quiet) toast(error.message, true);
  }
}

function hideDeleteBatchPanel() {
  $("bulkDeleteJobPanel").classList.add("hidden");
  $("bulkDeleteProgress").value = 0;
  $("bulkDeleteNumbers").textContent = "0 / 0";
  $("bulkDeleteMessage").textContent = "正在准备批量删除";
  $("bulkDeleteResults").innerHTML = "";
}

function showDeleteBatchStart(message, total) {
  $("bulkDeleteJobPanel").classList.remove("hidden");
  $("bulkDeleteStatus").textContent = "删除中";
  $("bulkDeleteStatus").className = "status-badge status-temporary";
  $("bulkDeleteProgress").value = 0;
  $("bulkDeleteMessage").textContent = message;
  $("bulkDeleteNumbers").textContent = `0 / ${formatNumber(total)}`;
  $("bulkDeleteResults").innerHTML = "";
}

function renderDeleteBatch(items) {
  const total = items.length;
  const completed = items.filter((job) => jobTerminal(job.status)).length;
  const percent = total ? Math.round((completed / total) * 100) : 0;
  const current = items.find((job) => ["queued", "running"].includes(job.status))
    || items.find((job) => !jobTerminal(job.status));
  const terminal = total > 0 && completed === total;
  if (terminal) {
    hideDeleteBatchPanel();
    return true;
  }
  $("bulkDeleteJobPanel").classList.remove("hidden");
  $("bulkDeleteProgress").value = percent;
  $("bulkDeleteNumbers").textContent = `${formatNumber(completed)} / ${formatNumber(total)}`;
  $("bulkDeleteMessage").textContent = current
    ? `正在删除 ${current.accountName || `#${current.accountId}`}`
    : "等待删除任务开始";
  $("bulkDeleteStatus").textContent = "删除中";
  $("bulkDeleteStatus").className = "status-badge status-temporary";
  $("bulkDeleteResults").innerHTML = items.filter((job) => jobTerminal(job.status)).map((job) => `
    <div class="result-row">
      <span class="status-badge ${job.status === "done" ? "status-healthy" : "status-error"}">${job.status === "done" ? "已删除" : "失败"}</span>
      <div class="result-copy"><strong>${escapeHtml(job.accountName || `#${job.accountId}`)}</strong><span>${escapeHtml(job.status === "done" ? "账号及关联资源已删除，待处理记录已保留" : job.error || "删除失败")}</span></div>
    </div>
  `).join("");
  return terminal;
}

async function pollDeleteBatch(immediate = false) {
  clearTimeout(state.deleteBatchTimer);
  if (!state.deleteBatchId) return;
  try {
    const batchId = state.deleteBatchId;
    const data = await api(`api/delete-jobs?batch=${encodeURIComponent(batchId)}`);
    const terminal = renderDeleteBatch(data.items || []);
    if (terminal) {
      state.deleteBatchTimer = null;
      state.deleteBatchId = null;
      renderBulkDeleteTools();
      renderAccountSelectionTools();
      const failed = (data.items || []).filter((job) => job.status === "error").length;
      toast(failed ? `批量删除完成，${failed} 个失败` : "批量删除完成", failed > 0);
      await Promise.all([loadAccounts(), loadProxyPool(), loadUsers()]);
      return;
    }
  } catch (error) {
    toast(error.message, true);
  }
  state.deleteBatchTimer = setTimeout(() => pollDeleteBatch(), immediate ? 400 : 1500);
}

function livenessSite() {
  return state.user?.role === "admin" ? $("siteFilter").value : state.user?.siteId;
}

function livenessOutcome(job) {
  const progress = job.progress || {};
  if (job.status === "failed") return { label: "测活失败", error: true };
  if (job.status === "interrupted" || Number(progress.interrupted || 0) > 0) {
    return { label: "测活任务已中断", error: true };
  }
  if (Number(progress.notAttempted || 0) > 0) {
    return { label: `测活未完成，${formatNumber(progress.notAttempted)} 个账号未执行`, error: true };
  }
  if (Number(progress.usageRefreshFailed || 0) > 0 || Number(progress.usageCoverage?.partial || 0) > 0) {
    return { label: "测活完成，部分用量未更新", error: true };
  }
  if (livenessReasonSummary(progress)) {
    return { label: "测活完成，部分检测未能确认", error: false };
  }
  return { label: "测活完成", error: false };
}

function livenessReasonSummary(progress) {
  const total = progress.inconclusive;
  if (!Number.isSafeInteger(total) || total <= 0) return "";
  const reasons = progress.inconclusiveReasons;
  const labels = [
    ["upstream_429", "限流中（上游 429）"],
    ["timeout", "请求超时"],
    ["transport_error", "连接异常"],
    ["incomplete_response", "响应不完整"],
    ["upstream_error", "上游错误"],
    ["admin_http_error", "管理接口错误"],
    ["capacity_wait", "等待容量"],
    ["manager_error", "管理服务异常"],
    ["host_unmapped", "服务器匹配失败"],
    ["legacy_unknown", "未记录"],
  ];
  const counts = new Map();
  let remaining = total;
  for (const [code, label] of labels) {
    const count = reasons && !Array.isArray(reasons)
      && Object.prototype.hasOwnProperty.call(reasons, code) ? reasons[code] : 0;
    if (!Number.isSafeInteger(count) || count <= 0 || count > remaining) continue;
    if (code !== "upstream_429") counts.set(label, count);
    remaining -= count;
  }
  // Missing, legacy_unknown and unrecognized reasons never imply a diagnosis.
  if (remaining) counts.set("未记录", (counts.get("未记录") || 0) + remaining);
  const parts = [...counts].map(([label, count]) => `${label} ${formatNumber(count)}`);
  return parts.length ? ` · 检测异常：${parts.join("、")}` : "";
}

function livenessChangeLabels() {
  return [
    ["marked_error", "账号状态改为错误（401）"],
    ["scheduling_paused", "调度已暂停"],
    ["ordinary_limit_cleared", "普通窗口限流标记已解除"],
    ["f5_limit_cleared", "F5 模型限流标记已解除"],
  ];
}

function livenessChangeCounts(progress) {
  const counts = {};
  for (const [code] of livenessChangeLabels()) {
    const family = code === "ordinary_limit_cleared" ? "ordinary" : code === "f5_limit_cleared" ? "f5" : null;
    const value = progress.statusChanges?.[code] ?? (family ? progress.windowRecovery?.[family] : 0);
    counts[code] = Number.isSafeInteger(value) && value > 0 ? value : 0;
  }
  return counts;
}

function livenessAccountResultLines(job, names) {
  const items = [...job.resultAccounts].filter((item) => Number.isSafeInteger(item?.accountId) && item.accountId > 0);
  const rank = (item) => item.probeError || item.usageError ? 0 : item.changes?.length ? 1 : 2;
  items.sort((a, b) => rank(a) - rank(b) || a.accountId - b.accountId);
  const labels = { '5h': '5h', '7d': '7d', '7d_oi': 'F5 7d' };
  return items.map((item) => {
    const name = item.accountName || names.get(item.accountId) || `#${item.accountId}`;
    const parts = [];
    const windows = [...new Set(Array.isArray(item.refreshedWindows) ? item.refreshedWindows : [])].filter((key) => labels[key]);
    const preserved = [...new Set(Array.isArray(item.preservedWindows) ? item.preservedWindows : [])].filter((key) => labels[key] && !windows.includes(key));
    if (windows.length + preserved.length === 3) parts.push('全用量刷新（5h、7d、F5 7d）');
    else if (windows.length) parts.push(`部分用量刷新（${windows.map((key) => labels[key]).join('、')}）`);
    else if (preserved.length) parts.push('已保留较新的窗口用量');
    else if (item.usageError) parts.push(item.outcome === 'passed' ? '测活通过，用量未更新' : '用量未更新');
    else if (item.outcome === 'confirmed401') parts.push('确认 401，用量采集已跳过');
    else if (item.outcome === 'skipped') parts.push(item.reasonCode === 'not_paused' ? '调度未暂停，已跳过测活' : '已跳过');
    else if (item.reasonCode === 'upstream_429') parts.push('上游限流中，保留原限流状态');
    else if (item.probeError) parts.push('测活未能确认，用量采集已跳过');
    else parts.push('未记录全量用量刷新结果');
    for (const [code, label] of livenessChangeLabels()) {
      if (Array.isArray(item.changes) && item.changes.includes(code)) parts.push(label);
    }
    if (item.probeError) parts.push(`${item.reasonCode === 'upstream_429' ? '上游限流响应' : '测活报错'}：${item.probeError}`);
    if (Number.isSafeInteger(item.upstreamStatus) && item.upstreamStatus >= 400) parts.push(`上游 HTTP ${item.upstreamStatus}`);
    else if (Number.isSafeInteger(item.httpStatus) && item.httpStatus >= 400) parts.push(`测活接口 HTTP ${item.httpStatus}`);
    if (item.usageError) parts.push(`用量未更新原因：${item.usageError}`);
    if (item.usageNote) parts.push(item.usageNote);
    if (Number.isSafeInteger(item.retries) && item.retries > 0) parts.push(`已重试 ${item.retries} 次`);
    return `${name}${name === `#${item.accountId}` ? '' : `（#${item.accountId}）`} · ${parts.join('；')}`;
  });
}

function renderLivenessJob() {
  const available = Boolean(state.user && livenessSite() === "main");
  const job = state.livenessJob;
  const running = job && ["queued", "running"].includes(job.status);
  const terminal = Boolean(job && !running);
  const resultKey = terminal ? `${job.id}:${job.finishedAt || job.status}` : "";
  const now = Date.now();
  if (state.livenessResultKey !== resultKey) {
    state.livenessResultKey = resultKey;
    state.livenessResultExpanded = false;
    const finishedAt = Date.parse(job?.finishedAt || "");
    // Anchor to completion so polling and page reloads do not reopen old results.
    state.livenessResultHideAt = terminal
      ? Math.min(now, Number.isFinite(finishedAt) ? finishedAt : now) + LIVENESS_RESULT_VISIBLE_MS
      : 0;
  }
  clearTimeout(state.livenessResultTimer);
  state.livenessResultTimer = null;
  const resultHidden = terminal && !state.livenessResultExpanded && now >= state.livenessResultHideAt;
  const panelVisible = available && Boolean(job) && !resultHidden;
  const resultButton = $("toggleLivenessResultButton");
  resultButton.classList.toggle("hidden", !available || !terminal);
  resultButton.textContent = panelVisible ? "收起结果" : "上次结果";
  resultButton.setAttribute("aria-expanded", String(panelVisible));
  if (panelVisible && terminal && !state.livenessResultExpanded) {
    state.livenessResultTimer = setTimeout(renderLivenessJob, state.livenessResultHideAt - now);
  }
  $("startLivenessButton").disabled = !available || state.livenessBusy || Boolean(running);
  $("startLivenessButton").textContent = state.livenessBusy ? "正在提交…" : running ? "Main 测活并更新中" : "Main 测活并更新用量";
  $("startLivenessButton").title = available ? "Main 站已暂停调度账号" : "当前站点不可测活，仅支持 Main";
  $("startDueLivenessButton").disabled = !available || state.livenessBusy || Boolean(running);
  $("startDueLivenessButton").title = available
    ? "Main 已暂停调度，且 5h、7d、7d F 均已重置、待刷新或未采集；任一窗口仍倒计时则跳过"
    : "当前站点不可测活，仅支持 Main";
  $("retryLivenessButton").classList.toggle("hidden", !available || !job || Boolean(running) || !Number(job.progress?.notAttempted || 0));
  $("retryLivenessButton").disabled = state.livenessBusy || Boolean(running);
  $("livenessJobPanel").classList.toggle("hidden", !panelVisible);
  if (!job) return;
  const progress = job.progress || {};
  $("livenessStatus").textContent = running ? "测活并更新用量" : livenessOutcome(job).label;
  $("livenessNumbers").textContent = `${formatNumber(progress.current || 0)} / ${formatNumber(job.targetCount)}`;
  $("livenessProgress").value = Number(progress.percent || 0);
  const changeCounts = livenessChangeCounts(progress);
  const changes = livenessChangeLabels().filter(([code]) => changeCounts[code] > 0)
    .map(([code, label]) => `${label} ${formatNumber(changeCounts[code])}`);
  const legacy401 = !progress.statusChanges && Number(progress.confirmed401 || 0) > 0;
  const coverage = progress.usageCoverage;
  const usage = [];
  if (Number.isSafeInteger(coverage?.complete) && coverage.complete > 0) usage.push(`全用量刷新 ${formatNumber(coverage.complete)}`);
  if (Number.isSafeInteger(coverage?.partial) && coverage.partial > 0) usage.push(`部分用量刷新 ${formatNumber(coverage.partial)}`);
  const summary = [...usage, ...changes];
  const scopeLabel = job.windowScope === "reset_due" ? "Main · 三窗口已重置/待刷新" : "Main";
  $("livenessSummary").textContent = `${scopeLabel} · ${summary.join(" · ") || (legacy401 ? "旧任务未记录 401 前后状态" : running ? "暂无状态变更" : "未发现状态变更")}`;
  if (Number.isSafeInteger(progress.problemAccounts) && progress.problemAccounts > 0) {
    $("livenessSummary").textContent += ` · ${formatNumber(progress.problemAccounts)} 个账号检测未完成，原因见明细`;
  }
  if (Number.isSafeInteger(progress.notAttempted) && progress.notAttempted > 0) {
    $("livenessSummary").textContent += ` · 未执行 ${formatNumber(progress.notAttempted)}`;
  }
  if (!coverage && Number.isSafeInteger(progress.usageRefreshFailed) && progress.usageRefreshFailed > 0) {
    $("livenessSummary").textContent += ` · 用量采集失败 ${formatNumber(progress.usageRefreshFailed)}`;
  }
  if (Number.isSafeInteger(progress.interrupted) && progress.interrupted > 0) {
    $("livenessSummary").textContent += ` · 检测中断 ${formatNumber(progress.interrupted)}`;
  }
  if (!coverage && Number.isSafeInteger(progress.retryExhausted) && progress.retryExhausted > 0) {
    $("livenessSummary").textContent += ` · 重试 3 次后仍失败 ${formatNumber(progress.retryExhausted)}`;
  }
  if (!coverage) $("livenessSummary").textContent += livenessReasonSummary(progress);
  const active = Array.isArray(progress.active) ? progress.active : [];
  const queued = Number(progress.queued ?? Math.max(0, Number(job.targetCount || 0) - Number(progress.current || 0) - active.length));
  const names = new Map((state.accounts?.items || []).map((account) => [Number(account.id), account.name]));
  const lines = active.map((item) => {
    const retry = Number.isSafeInteger(item.retry) && item.retry > 0 && item.retry <= 3
      ? ` · 第 ${item.retry}/3 次重试` : "";
    return `${names.get(Number(item.accountId)) || `#${Number(item.accountId)}`} · ${item.phase === "confirming401" ? "确认 401 中" : "测活并采集用量中"}${retry}`;
  });
  if (Array.isArray(job.resultAccounts)) lines.push(...livenessAccountResultLines(job, names));
  for (const item of !Array.isArray(job.resultAccounts) && Array.isArray(job.changedAccounts) ? job.changedAccounts : []) {
    if (!Number.isSafeInteger(item?.accountId) || item.accountId <= 0 || !Array.isArray(item.changes)) continue;
    const labels = livenessChangeLabels().filter(([code]) => item.changes.includes(code)).map(([, label]) => label);
    if (labels.length) lines.push(`${names.get(item.accountId) || `#${item.accountId}`} · ${labels.join("；")}`);
  }
  if (state.livenessDetailsFailed === job.id) lines.push("账号检测明细加载失败，请刷新重试");
  $("livenessActive").textContent = lines.join("\n");
  $("livenessQueue").textContent = running ? `执行中 ${formatNumber(active.length)} · 排队 ${formatNumber(queued)}` : "";
  if (running && Number.isSafeInteger(progress.capacityWaiting) && progress.capacityWaiting > 0) {
    $("livenessQueue").textContent += ` · 等待容量 ${formatNumber(progress.capacityWaiting)}`;
  }
  if (running && Number.isSafeInteger(progress.retryWaiting) && progress.retryWaiting > 0) {
    $("livenessQueue").textContent += ` · 等待重试 ${formatNumber(progress.retryWaiting)}`;
  }
  $("livenessActive").classList.toggle("hidden", !lines.length);
}

function toggleLivenessResult() {
  if (!state.user || livenessSite() !== "main" || !state.livenessJob
      || ["queued", "running"].includes(state.livenessJob.status)) return;
  state.livenessResultExpanded = $("livenessJobPanel").classList.contains("hidden");
  state.livenessResultHideAt = 0;
  renderLivenessJob();
}

async function loadLivenessJobs() {
  if (!state.user || state.livenessLoading) return;
  const serial = state.sessionSerial;
  state.livenessLoading = true;
  clearTimeout(state.livenessTimer);
  try {
    const data = await api("api/account-liveness-jobs");
    if (!state.user || serial !== state.sessionSerial) return;
    const jobs = (data.items || []).filter((job) => job.siteId === "main");
    const previous = state.livenessJob;
    state.livenessJob = jobs.find((job) => ["queued", "running"].includes(job.status)) || jobs[0] || null;
    renderLivenessJob();
    const job = state.livenessJob;
    if (job && (!previous || previous.id !== job.id || previous.status !== job.status
        || Number(previous.progress?.current || 0) !== Number(job.progress?.current || 0)
        || ["ordinary", "f5"].some((family) => Number(previous.progress?.windowRecovery?.[family] || 0)
          !== Number(job.progress?.windowRecovery?.[family] || 0))
        || Number(previous.progress?.usageRefreshed || 0) !== Number(job.progress?.usageRefreshed || 0))) {
      void loadAccountWindows(true);
    }
    if (job && (!["queued", "running"].includes(job.status)
        || Object.values(livenessChangeCounts(job.progress || {})).some((count) => count > 0))) {
      if (previous?.id === job.id && previous.status === job.status
          && Number(previous.progress?.current || 0) === Number(job.progress?.current || 0)
          && Array.isArray(previous.changedAccounts)
          && JSON.stringify(livenessChangeCounts(previous.progress || {})) === JSON.stringify(livenessChangeCounts(job.progress || {}))) {
        job.changedAccounts = previous.changedAccounts;
        job.resultAccounts = previous.resultAccounts;
        if (previous.progress?.usageCoverage) {
          job.progress.usageCoverage = previous.progress.usageCoverage;
          job.progress.problemAccounts = previous.progress.problemAccounts;
        }
      } else {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 10000);
        try {
          const detail = await api(`api/account-liveness-jobs/${encodeURIComponent(job.id)}`, { signal: controller.signal });
          if (!state.user || serial !== state.sessionSerial || state.livenessJob?.id !== job.id) return;
          const full = (detail.items || []).find((item) => item.id === job.id && item.siteId === "main");
          if (!full || !Array.isArray(full.changedAccounts)) throw new Error("missing liveness changes");
          job.changedAccounts = full.changedAccounts;
          job.resultAccounts = full.resultAccounts;
          if (full.progress?.usageCoverage) {
            job.progress.usageCoverage = full.progress.usageCoverage;
            job.progress.problemAccounts = full.progress.problemAccounts;
          }
          state.livenessDetailsFailed = null;
        } catch (_) {
          if (serial !== state.sessionSerial) return;
          state.livenessDetailsFailed = job.id;
        } finally {
          clearTimeout(timeout);
        }
      }
      renderLivenessJob();
    }
  } catch (_) {
    // Durable jobs remain available on the next refresh after a transport failure.
  } finally {
    if (serial === state.sessionSerial) {
      state.livenessLoading = false;
      if (state.user && state.livenessJob && ["queued", "running"].includes(state.livenessJob.status)) {
        state.livenessTimer = setTimeout(loadLivenessJobs, 1800);
      }
    }
  }
}

async function retryLiveness() {
  const job = state.livenessJob;
  if (!state.user || state.livenessBusy || livenessSite() !== "main" || !job
      || ["queued", "running"].includes(job.status) || !Number(job.progress?.notAttempted || 0)) return;
  const serial = state.sessionSerial;
  state.livenessBusy = true;
  renderLivenessJob();
  try {
    if (!(await confirmAction({
      title: "补测未执行账号",
      message: `继续检测这批任务中未执行的 ${formatNumber(job.progress.notAttempted)} 个账号？`,
      confirmLabel: "开始补测",
    }))) return;
    if (!state.user || serial !== state.sessionSerial) return;
    const data = await api(`api/account-liveness-jobs/${encodeURIComponent(job.id)}/retry`, { method: "POST", body: {} });
    if (!state.user || serial !== state.sessionSerial) return;
    state.livenessJob = data.job;
    await loadLivenessJobs();
  } catch (error) {
    if (serial === state.sessionSerial) toast(error.message, true);
  } finally {
    if (serial === state.sessionSerial) {
      state.livenessBusy = false;
      renderLivenessJob();
    }
  }
}

async function startLiveness(windowScope = "all") {
  if (!state.user || state.livenessBusy || livenessSite() !== "main") return;
  if (state.livenessJob && ["queued", "running"].includes(state.livenessJob.status)) return;
  const serial = state.sessionSerial;
  state.livenessBusy = true;
  renderLivenessJob();
  try {
    const filtered = windowScope === "reset_due";
    const preview = await api(`api/account-liveness-preview?siteId=main&windowScope=${encodeURIComponent(windowScope)}`);
    if (!state.user || serial !== state.sessionSerial || livenessSite() !== "main") return;
    if (filtered && preview.windowScope !== windowScope) throw new Error("窗口筛选暂不可用，请刷新页面重试");
    const count = Number(preview.targetCount || 0);
    if (!count) { toast("Main 当前没有符合条件的账号"); return; }
    const scope = state.user.role === "admin" ? "Main 全部用户" : "我在 Main 的";
    const windowDescription = filtered ? "，仅包含 5h、7d、7d F 三个窗口均已重置、待刷新或未采集的账号，任一窗口仍倒计时则跳过" : "";
    if (!(await confirmAction({
      title: filtered ? "仅三窗口已重置/待刷新" : "Main 测活并更新用量",
      message: `测试${scope} ${formatNumber(count)} 个已暂停调度账号${windowDescription}，并分别刷新普通与 F5 窗口？已启用调度的账号一律跳过。仅明确成功后解除对应窗口限流，未确定保留原标记；仅确认上游 401 时标记错误；不删除，不恢复调度。`,
      confirmLabel: `开始 ${formatNumber(count)} 个`,
    }))) return;
    if (!state.user || serial !== state.sessionSerial || livenessSite() !== "main") return;
    const data = await api("api/account-liveness-jobs", {
      method: "POST", body: { siteId: "main", windowScope, targetCount: count, targetToken: preview.targetToken },
    });
    if (!state.user || serial !== state.sessionSerial) return;
    state.livenessJob = data.job;
    toast(data.reused ? "已继续显示现有测活任务" : "Main 测活任务已创建");
    await loadLivenessJobs();
  } catch (error) {
    if (serial === state.sessionSerial) toast(error.message, true);
  } finally {
    if (serial === state.sessionSerial) {
      state.livenessBusy = false;
      renderLivenessJob();
    }
  }
}

async function deleteSelectedErrors() {
  if (!state.user || state.deleteBatchId || state.deleteJobId) return;
  const accounts = selectedAccountRecords();
  const accountIds = accounts.map((account) => Number(account.id));
  if (!accountIds.length) return;
  if (!accounts.every((account) => account.canDelete && !account.deletedAt)) {
    toast("批量删除只能选择当前可删除的错误账号", true);
    return;
  }
  if (accountIds.length > MAX_BULK_DELETE_SELECTION) {
    toast(`单次最多批量删除 ${MAX_BULK_DELETE_SELECTION} 个账号`, true);
    return;
  }
  if (!(await confirmAction({
    title: "批量删除错误账号",
    message: `删除已勾选的 ${accountIds.length} 个错误账号及其关联资源？记录仍保留在待处理。`,
    confirmLabel: "删除所选",
    danger: true,
  }))) return;
  $("deleteSelectedErrorsButton").disabled = true;
  try {
    const data = await api("api/accounts/bulk-delete", {
      method: "POST",
      body: { scope: "selected", accountIds },
    });
    state.deleteBatchId = data.batchId;
    state.accountSelection.clear();
    renderAccounts();
    showDeleteBatchStart(`已提交 ${formatNumber(data.total)} 个所选错误账号`, data.total);
    toast("所选错误账号删除任务已创建");
    await pollDeleteBatch(true);
  } catch (error) {
    toast(error.message, true);
    renderAccountSelectionTools();
  }
}

async function deleteAllErrors() {
  if (!state.user || state.deleteBatchId || state.deleteJobId) return;
  const count = Number(state.accounts?.deletableCount || 0);
  if (!count) return;
  const scopeLabel = state.user.role === "admin" ? "全部" : "我的";
  if (!(await confirmAction({
    title: "一键删除错误账号",
    message: `删除${scopeLabel} ${count} 个错误账号及其关联资源？记录仍保留在待处理。`,
    confirmLabel: "开始删除",
    danger: true,
  }))) return;
  $("deleteAllErrorsButton").disabled = true;
  try {
    const data = await api("api/accounts/bulk-delete", {
      method: "POST",
      body: { scope: "all_errors" },
    });
    state.deleteBatchId = data.batchId;
    renderBulkDeleteTools();
    showDeleteBatchStart(`已提交 ${formatNumber(data.total)} 个错误账号`, data.total);
    toast("错误账号删除任务已创建");
    await pollDeleteBatch(true);
  } catch (error) {
    toast(error.message, true);
    renderBulkDeleteTools();
  }
}

function statsSnapshotEligible() {
  const days = (Date.parse($("statsTo").value) - Date.parse($("statsFrom").value)) / 86400000 + 1;
  return state.dailyDisplaySnapshotsEnabled && days >= 1 && days <= 366 && $("statsTo").value <= todayText();
}

const statsRequests = new Map();

function requestStatsData(params, snapshotMode, force) {
  const key = JSON.stringify([state.sessionSerial, state.user.id, state.user.role,
    state.user.siteId, params.toString(), snapshotMode, force]);
  if (statsRequests.has(key)) return statsRequests.get(key);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20000);
  const request = snapshotMode
    ? (force
      ? api("api/daily-display-snapshot/refresh", { method: "POST", signal: controller.signal,
          body: { from: params.get("from"), to: params.get("to") } })
      : api(`api/daily-display-snapshot?${params}`, { signal: controller.signal }))
    : api(`api/daily-additions?${params}`, { signal: controller.signal });
  const promise = request.finally(() => {
    clearTimeout(timer);
    statsRequests.delete(key);
  });
  statsRequests.set(key, promise);
  return promise;
}

function clearStatsSnapshot() {
  $("statsBody").replaceChildren();
  for (const id of ["statsTotal", "statsUsageAccounts", "statsRequests", "statsCost", "statsBillingTotal", "statsSettlementTotal", "statsDays", "statsUsers"]) {
    $(id).textContent = "待生成";
  }
  $("statsEmpty").classList.add("hidden");
}

async function loadStats(quiet = false, force = false) {
  if (!state.user) return;
  const serial = ++state.statsSerial;
  const actor = `${state.user.id}:${state.user.role}:${state.user.siteId}`;
  clearTimeout(state.statsTimer);
  const snapshotMode = statsSnapshotEligible();
  const displayKey = `${actor}:${$("statsFrom").value}:${$("statsTo").value}`;
  if (snapshotMode && state.statsDisplayedKey !== displayKey) {
    clearStatsSnapshot();
    $("statsSnapshotStatus").textContent = "正在读取统计快照";
  }
  $("statsSnapshotStatus").classList.toggle("hidden", !snapshotMode);
  $("rebuildStats").classList.toggle("hidden", !snapshotMode);
  try {
    const params = new URLSearchParams({ from: $("statsFrom").value, to: $("statsTo").value });
    const from = params.get("from"), to = params.get("to");
    let data;
    if (snapshotMode) {
      const envelope = await requestStatsData(params, true, force);
      if (serial !== state.statsSerial || actor !== `${state.user?.id}:${state.user?.role}:${state.user?.siteId}` || from !== $("statsFrom").value || to !== $("statsTo").value) return;
      const snapshot = envelope.snapshot;
      const stamp = (value) => new Date(value * 1000).toLocaleString("zh-CN", { hour12: false });
      const phase = { queued: "排队中", running: "生成中", done: "已生成", error: "生成失败", cancelled: "后台刷新已暂停", busy: "队列已满，等待重试" }[snapshot.state] || "待生成";
      $("statsSnapshotStatus").textContent = snapshot.complete
        ? `统计快照，非实时结算 · 生成批次 ${snapshot.generation} · 截至 ${stamp(snapshot.asOf ?? snapshot.oldestDayFinishedAt)} · 各日生成时间 ${stamp(snapshot.oldestDayFinishedAt)} 至 ${stamp(snapshot.calculationFinishedAt)} · ${phase}${snapshot.stale ? " · 已过期，待后台更新" : ""}${snapshot.error ? ` · ${snapshot.error}` : ""}`
        : `统计快照尚未生成 · ${phase} · ${snapshot.completedDays}/${snapshot.totalDays}天${snapshot.error ? ` · ${snapshot.error}` : ""}`;
      if (state.currentView === "stats") {
        const delay = ["queued", "running", "busy"].includes(snapshot.state) ? 2500 : 60000;
        const poll = () => {
          if (!state.user || state.currentView !== "stats") return;
          if (document.hidden) { state.statsTimer = setTimeout(poll, 60000); return; }
          loadStats(true);
        };
        state.statsTimer = setTimeout(poll, delay);
      }
      data = envelope.data;
      if (!data) { clearStatsSnapshot(); return; }
    } else {
      data = await requestStatsData(params, false, force);
    }
    if (serial !== state.statsSerial || actor !== `${state.user?.id}:${state.user?.role}:${state.user?.siteId}`) return;
    state.statsDisplayedKey = displayKey;
    const userFilter = state.user.role === "admin" ? $("statsUser").value : "";
    const rows = userFilter ? data.items.filter((row) => String(row.userId) === String(userFilter)) : data.items;
    $("statsBody").innerHTML = rows.map((row) => `<tr><td>${escapeHtml(row.day)}</td><td>${escapeHtml(row.username)}</td><td class="numeric">${formatNumber(row.count)}</td><td class="numeric">${formatNumber(row.usageAccountCount)}</td><td class="numeric">${formatNumber(row.requestCount)}</td><td class="numeric">${formatAmount(row.averageUnitPrice)}</td><td class="numeric cost">${formatAmount(row.accountCost)}</td><td class="numeric cost">${formatAmount(row.billingTotal)}</td><td class="numeric cost">${formatAmount(row.settlementTotal)}</td></tr>`).join("");
    $("statsTotal").textContent = formatNumber(rows.reduce((sum, row) => sum + Number(row.count), 0));
    $("statsUsageAccounts").textContent = formatNumber(rows.reduce((sum, row) => sum + Number(row.usageAccountCount), 0));
    $("statsRequests").textContent = formatNumber(rows.reduce((sum, row) => sum + Number(row.requestCount), 0));
    $("statsCost").textContent = formatAmount(rows.reduce((sum, row) => sum + Number(row.accountCost), 0));
    $("statsBillingTotal").textContent = formatAmount(rows.reduce((sum, row) => sum + Number(row.billingTotal), 0));
    $("statsSettlementTotal").textContent = formatAmount(rows.reduce((sum, row) => sum + Number(row.settlementTotal), 0));
    $("statsDays").textContent = formatNumber(new Set(rows.map((row) => row.day)).size);
    $("statsUsers").textContent = formatNumber(new Set(rows.map((row) => row.userId)).size);
    $("statsEmpty").classList.toggle("hidden", rows.length > 0);
  } catch (error) {
    if (serial !== state.statsSerial) return;
    if (snapshotMode) {
      clearStatsSnapshot();
      $("statsSnapshotStatus").textContent = "统计快照暂不可用，请重试";
    }
    if (!quiet) toast(error.message, true);
  }
}

async function loadAuthStats(quiet = false) {
  if (!state.user) return;
  const requestSerial = ++state.authStatsRequestSerial;
  $("authStatsLoading").classList.remove("hidden");
  try {
    const params = new URLSearchParams({
      from: $("authStatsFrom").value,
      to: $("authStatsTo").value,
    });
    if (state.user.role === "admin" && $("authStatsUser").value) {
      params.set("user", $("authStatsUser").value);
    }
    const data = await api(`api/auth-statistics?${params}`);
    if (requestSerial !== state.authStatsRequestSerial) return;
    const rows = [...(data.items || []), data.total].filter(Boolean);
    $("authStatsBody").innerHTML = rows.map((row) => {
      const totalRow = row.key === "total";
      const label = authStatsLabels[row.key] || row.key;
      const labelCell = totalRow ? `<strong>${escapeHtml(label)}</strong>` : escapeHtml(label);
      const total = formatNumber(row.total);
      const dropped = formatNumber(row.dropped);
      const rate = `${formatAmount(row.dropRate, 2)}%`;
      return `<tr><td>${labelCell}</td><td class="numeric">${totalRow ? `<strong>${total}</strong>` : total}</td><td class="numeric">${totalRow ? `<strong>${dropped}</strong>` : dropped}</td><td class="numeric">${totalRow ? `<strong>${rate}</strong>` : rate}</td></tr>`;
    }).join("");
  } catch (error) {
    if (requestSerial === state.authStatsRequestSerial && !quiet) toast(error.message, true);
  } finally {
    if (requestSerial === state.authStatsRequestSerial) {
      $("authStatsLoading").classList.add("hidden");
    }
  }
}


function resourceLevel(percent) {
  const value = Number(percent || 0);
  if (value >= 90) return "critical";
  if (value >= 75) return "warning";
  return "normal";
}

function renderSwapResource(swap) {
  const valid = swap && [swap.percent, swap.totalBytes, swap.usedBytes, swap.freeBytes]
    .every((value) => Number.isFinite(value) && value >= 0)
    && swap.percent <= 100 && swap.usedBytes <= swap.totalBytes && swap.freeBytes <= swap.totalBytes
    && (swap.totalBytes > 0 || swap.percent === 0);
  if (!valid) {
    return `<div class="resource-row resource-swap-state"><div class="resource-copy"><span>Swap</span><strong>—</strong></div><small>暂无采集数据</small></div>`;
  }
  if (swap.totalBytes === 0) {
    return `<div class="resource-row resource-swap-state"><div class="resource-copy"><span>Swap</span><strong>未启用</strong></div><small>${formatBytes(swap.usedBytes)} / ${formatBytes(swap.totalBytes)}</small></div>`;
  }
  return resourceRow("Swap", swap, `${formatBytes(swap.usedBytes)} / ${formatBytes(swap.totalBytes)}`);
}

function resourceRow(label,metric,detail) {const p=Math.min(100,Math.max(0,Number(metric?.percent||0)));return `<div class="resource-row"><div class="resource-copy"><span>${label}</span><strong>${p.toFixed(1)}%</strong></div><progress class="resource-progress ${resourceLevel(p)}" max="100" value="${p}" aria-label="${escapeHtml(label)} ${p.toFixed(1)}%">${p.toFixed(1)}%</progress><small>${escapeHtml(detail)}</small></div>`;}function renderServerLoads() {$("serverLoadGrid").innerHTML=state.serverLoads.map((s)=>{const c=s.cpu||{};const m=s.memory||{};const d=s.disk||{};const st=!s.ok?"offline":s.level==="critical"?"critical":s.level==="warning"?"warning":"online";return `<article class="server-card ${st}"><header class="server-card-head"><div><strong>${escapeHtml(s.label||s.id)}</strong><span>${escapeHtml(s.host||s.hostname||s.id)}</span></div><span class="server-state ${st}">${s.ok?"在线":"离线"}</span></header><div class="server-instance-count" title="${Number.isSafeInteger(s.totalVMCount)&&s.totalVMCount>=0?`覆盖 ${formatNumber(s.reportedVMCount)} / ${formatNumber(s.totalVMCount)} VM`:"容器数量暂不可用"}"><span>账号容器<small>运行 + 停止</small></span><strong>${s.complete===true&&Number.isSafeInteger(s.instanceCount)&&s.instanceCount>=0?`${formatNumber(s.instanceCount)} 个`:'—<small>采集不完整</small>'}</strong></div>${s.ok?`<div class="server-resources">${resourceRow("CPU",c,`${formatNumber(c.cores)} 核 · Load ${Number(c.load1||0).toFixed(2)}`)}${resourceRow("内存",m,`${formatBytes(m.usedBytes)} / ${formatBytes(m.totalBytes)}`)}${renderSwapResource(s.swap)}${resourceRow("硬盘",d,`${formatBytes(d.usedBytes)} / ${formatBytes(d.totalBytes)}`)}</div><footer>${formatDateTime(s.collectedAt)} · ${Number(s.elapsed||0).toFixed(2)}s</footer>`:`<div class="server-offline-message">${escapeHtml(s.error||"服务器负载采集失败")}</div>`}</article>`;}).join("");$("serverLoadEmpty").classList.toggle("hidden",state.serverLoads.length > 0);}                                           
async function loadServerLoad(force = false, quiet = false) {
  if (state.user?.role !== "admin") return;
  try {
    const data = await api(`api/server-load${force ? "?refresh=1" : ""}`);
    state.serverLoads = data.items || [];
    renderServerLoads();
  } catch (error) {
    if (!quiet) toast(error.message, true);
  }
}

const CLAUDE_SK_TERMINAL_STATUSES = new Set([
  "completed", "banned", "failed", "cancelled", "expired",
  "browser_seed_required", "browser_interaction_timed_out", "timed_out",
  "refund_detected", "refund_not_found",
  "refund_scan_inconclusive",
  "manual_required",
  "needs_attention",
]);

const CLAUDE_SK_FAILURE_STATUSES = new Set([
  "failed", "cancelled", "expired", "browser_seed_required",
  "browser_interaction_timed_out", "timed_out", "refund_scan_inconclusive",
]);

const CLAUDE_SK_BROWSER_VIEW_STATUSES = new Set([
  "browser_interaction_required", "opening_authorization", "authorizing",
]);

const claudeSkStatusLabels = {
  pending: "等待",
  submitting: "提交中",
  queued: "排队中",
  dispatching: "正在分配",
  waiting_manager: "准备账号服务",
  opening_mailbox: "登录邮箱",
  mailbox_ready: "邮箱就绪",
  submitting_email: "发送邮件",
  awaiting_magic_link: "等待邮件",
  waiting_magic_link: "等待邮件",
  magic_link_received: "收到链接",
  opening_magic_link: "验证链接",
  verifying: "验证中",
  checking_account: "检测账号",
  retrying_browser: "浏览器重试",
  need_manual: "待输入链接",
  browser_interaction_required: "待人工验证",
  submitting_code: "提交授权码",
  authorization_submitted: "等待完成",
  reserving: "分配资源",
  quarantining: "准备处理",
  draining: "处理中",
  preparing: "准备授权",
  starting: "启动授权",
  awaiting_secret: "等待提交 SK",
  minting: "处理授权信息",
  finalizing: "完成授权",
  starting_service: "启用账号",
  registering_sub2api: "更新账号信息",
  restarting: "恢复账号状态",
  testing: "验证账号",
  recovering: "恢复账号状态",
  restoring: "恢复账号状态",
  committing: "完成更新",
  rolling_back: "恢复原状态",
  awaiting_code: "等待授权",
  exchanging: "确认授权信息",
  registering: "更新账号信息",
  manual_required: "转手动授权",
  scanning_refund: "扫描退款邮件",
  completed: "成功",
  banned: "成功",
  failed: "失败",
  cancelled: "已取消",
  expired: "已过期",
  browser_seed_required: "浏览器受限",
  browser_interaction_timed_out: "验证超时",
  timed_out: "任务超时",
  refund_detected: "发现退款",
  refund_not_found: "未发现退款",
  refund_scan_inconclusive: "无法判断退款",
  needs_attention: "需要处理",
};

function claudeSkIsTerminal(status) {
  return CLAUDE_SK_TERMINAL_STATUSES.has(String(status || ""));
}

function claudeSkIsActive(row) {
  return row.status === "submitting" || Boolean(row.jobId && !claudeSkIsTerminal(row.status));
}

function claudeSkIsBatchActive(row) {
  return row.batchMember && claudeSkIsActive(row);
}

function claudeSkStatusClass(status) {
  if (["completed", "banned", "refund_detected", "refund_not_found"].includes(status)) return "success";
  if (CLAUDE_SK_FAILURE_STATUSES.has(status)) return "failed";
  if (["need_manual", "browser_interaction_required", "manual_required", "needs_attention"].includes(status)) return "manual";
  if (["pending", "queued"].includes(status)) return "pending";
  return "running";
}

function claudeSkAccountState(row) {
  if (row.status === "banned" || row.banned) return { label: "封号", className: "banned" };
  if (row.status === "refund_detected") return { label: "已发现退款", className: "normal" };
  if (row.status === "refund_not_found") return { label: "未发现退款", className: "pending" };
  if (row.status === "refund_scan_inconclusive") return { label: "无法判断", className: "banned" };
  if (row.status === "completed") return {
    label: ["oauth_login", "oauth_session_key"].includes(row.operation) ? "已上号" : "正常",
    className: "normal",
  };
  if (["oauth_login", "oauth_session_key"].includes(row.operation) && row.status === "manual_required") return { label: "待手动", className: "pending" };
  if (["checking_account", "verifying"].includes(row.status)) return { label: "检测中", className: "running" };
  return { label: "未检测", className: "pending" };
}

function maskClaudeSkSecret(value, start = 3, end = 2) {
  const text = String(value || "");
  if (!text) return "-";
  if (text.length <= start + end + 3) return `${text.slice(0, 1)}***`;
  return `${text.slice(0, start)}***${text.slice(-end)}`;
}

function parseClaudeSkInput(value) {
  const rows = [];
  const seen = new Set();
  let invalid = 0;
  for (const sourceLine of String(value || "").split(/\r?\n/)) {
    const line = sourceLine.trim();
    if (!line) continue;
    const parts = line.split("----");
    const email = String(parts[0] || "").trim();
    const password = String(parts[1] || "");
    const key = email.toLowerCase();
    if (
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
      || !password
      || ["5x", "20x"].includes(password.trim().toLowerCase())
    ) {
      invalid += 1;
      continue;
    }
    if (seen.has(key)) continue;
    seen.add(key);
    rows.push({ email, password });
  }
  return { rows, invalid };
}

function newClaudeSkRow(item = {}) {
  return {
    localId: state.claudeSkNextRowId++,
    email: String(item.email || ""),
    password: String(item.password || ""),
    proxyUrl: String(item.proxyUrl || ""),
    batchMember: Boolean(item.batchMember),
    jobId: String(item.jobId || item.id || ""),
    mode: String(item.mode || "mailcom_web"),
    operation: String(item.operation || (item.mode === "refund_check" ? "refund_check" : "session_key")),
    status: String(item.status || "pending"),
    message: String(item.message || ""),
    error: String(item.error || ""),
    sessionKey: String(item.sessionKey || ""),
    banned: Boolean(item.banned),
    banReason: String(item.banReason || ""),
    refundMatches: Array.isArray(item.refundMatches) ? item.refundMatches : [],
    recentMessages: Array.isArray(item.recentMessages) ? item.recentMessages : [],
    refundScannedCount: Number(item.refundScannedCount || 0),
    createdAt: item.createdAt || null,
    updatedAt: item.updatedAt || null,
    finishedAt: item.finishedAt || null,
    browserInteractionTimeoutSeconds: Number(item.browserInteractionTimeoutSeconds || 0),
    browserInteractionNotified: false,
    manualAuthId: String(item.manualAuthId || ""),
    manualAvailable: Boolean(item.manualAvailable),
    canRetryAdmission: Boolean(item.canRetryAdmission),
    authorizationUrl: String(item.authorizationUrl || ""),
    billingTag: String(item.billingTag || "20x"),
  };
}

function applyClaudeSkJob(row, job) {
  const result = job?.result && typeof job.result === "object" ? job.result : {};
  const previousStatus = row.status;
  row.jobId = String(job?.id || row.jobId || "");
  row.email = String(job?.email || row.email || "");
  row.mode = String(job?.mode || row.mode || "mailcom_web");
  row.operation = String(
    job?.operation || (job?.mode === "refund_check" ? "refund_check" : row.operation || "session_key")
  );
  row.status = String(job?.status || row.status || "pending");
  row.message = String(job?.message || "");
  row.error = String(job?.error || "");
  row.createdAt = job?.createdAt || row.createdAt || null;
  row.updatedAt = job?.updatedAt || row.updatedAt || null;
  row.finishedAt = job?.finishedAt || row.finishedAt || null;
  row.browserInteractionTimeoutSeconds = Number(
    job?.browserInteractionTimeoutSeconds || row.browserInteractionTimeoutSeconds || 0
  );
  row.manualAuthId = String(job?.manualAuthId || row.manualAuthId || "");
  row.manualAvailable = Boolean(job?.manualAvailable || row.manualAvailable);
  row.canRetryAdmission = Boolean(job?.canRetryAdmission);
  row.authorizationUrl = String(job?.authorizationUrl || row.authorizationUrl || "");
  row.billingTag = String(job?.billingTag || row.billingTag || "20x");
  if (result.sessionKey) row.sessionKey = String(result.sessionKey);
  if (typeof result.banned === "boolean") row.banned = result.banned;
  if (result.banReason) row.banReason = String(result.banReason);
  if (Array.isArray(result.matches)) row.refundMatches = result.matches;
  if (Array.isArray(result.recentMessages)) row.recentMessages = result.recentMessages;
  if (result.scannedCount) row.refundScannedCount = Number(result.scannedCount);
  if (
    row.operation === "refund_check"
    && row.status === "refund_not_found"
    && Number(result.scannedCount || 0) === 0
  ) {
    row.status = "refund_scan_inconclusive";
    row.message = "未读取到邮箱列表，无法判断退款";
  }
  if (row.status === "browser_interaction_required" && previousStatus !== row.status && !row.browserInteractionNotified) {
    row.browserInteractionNotified = true;
    toast(`${row.email} 需要点击“浏览器验证”`, true);
  }
  return row;
}

function claudeSkRowMessage(row) {
  if (row.status === "refund_detected") {
    const count = row.refundMatches.length;
    const preview = String(row.refundMatches[0]?.preview || "").trim();
    const scanned = row.refundScannedCount ? `，扫描 ${row.refundScannedCount} 封` : "";
    return `${row.message || "检测到退款邮件"}${count ? `（${count} 封）` : ""}${scanned}${preview ? `：${preview}` : ""}`;
  }
  if (row.status === "refund_not_found") {
    const scanned = row.refundScannedCount ? `（已扫描 ${row.refundScannedCount} 封）` : "";
    return `${row.message || "未发现已确认退款邮件"}${scanned}`;
  }
  if (row.status === "refund_scan_inconclusive") return row.message || "未读取到邮箱列表，无法判断退款";
  if (row.status === "banned") return row.banReason || row.message || "账号已封禁";
  if (row.status === "manual_required") return row.error || row.message || "自动授权未完成，请转手动授权";
  if (row.status === "browser_interaction_required") {
    const timeout = Number(row.browserInteractionTimeoutSeconds || 0);
    const updatedAt = Date.parse(row.updatedAt || "");
    const base = row.message || "需要完成浏览器人机验证";
    if (timeout > 0 && Number.isFinite(updatedAt)) {
      const remaining = Math.max(0, Math.ceil((updatedAt + timeout * 1000 - Date.now()) / 1000));
      const minutes = Math.floor(remaining / 60);
      const seconds = String(remaining % 60).padStart(2, "0");
      return `${base}，请点击“浏览器验证”（剩余 ${minutes}:${seconds}）`;
    }
    return `${base}，请点击“浏览器验证”`;
  }
  return row.error || row.message || "-";
}

function claudeSkActionButtons(row) {
  const buttons = [];
  if (row.status === "pending") buttons.push(`<button class="primary" type="button" data-claude-sk-action="execute" data-row-id="${row.localId}">执行</button>`);
  if (row.sessionKey && row.operation === "session_key") buttons.push(`<button class="secondary" type="button" data-claude-sk-action="copy-sk" data-row-id="${row.localId}">复制 SK</button>`);
  if (row.operation === "refund_check" && claudeSkIsTerminal(row.status)) buttons.push(`<button class="secondary" type="button" data-claude-sk-action="mail-detail" data-row-id="${row.localId}">邮件详情</button>`);
  if (row.status === "need_manual") buttons.push(`<button class="secondary" type="button" data-claude-sk-action="link" data-row-id="${row.localId}">输入链接</button>`);
  if (CLAUDE_SK_BROWSER_VIEW_STATUSES.has(row.status)) {
    const interactive = row.status === "browser_interaction_required";
    buttons.push(`<button class="${interactive ? "primary" : "secondary"}" type="button" data-claude-sk-action="browser-link" data-row-id="${row.localId}">${interactive ? "打开验证链接" : "查看浏览器"}</button>`);
    if (interactive) buttons.push(`<button class="secondary" type="button" data-claude-sk-action="browser" data-row-id="${row.localId}">内嵌验证</button>`);
  }
  if (row.canRetryAdmission && row.manualAuthId && row.jobId) {
    buttons.push(`<button class="primary" type="button" data-claude-sk-action="retry-admission" data-row-id="${row.localId}">重试运行验证</button>`);
  }
  if (row.operation === "oauth_login" && row.jobId && row.status !== "completed") {
    buttons.push(`<button class="secondary" type="button" data-claude-sk-action="manual-auth" data-row-id="${row.localId}">转手动</button>`);
  } else if (row.jobId && !claudeSkIsTerminal(row.status) && !["pending", "submitting"].includes(row.status)) {
    buttons.push(`<button class="secondary" type="button" data-claude-sk-action="cancel" data-row-id="${row.localId}">取消</button>`);
  }
  if (!row.canRetryAdmission && CLAUDE_SK_FAILURE_STATUSES.has(row.status) && row.password) {
    buttons.push(`<button class="secondary" type="button" data-claude-sk-action="retry" data-row-id="${row.localId}">重试</button>`);
  }
  return buttons.join("");
}

function renderClaudeSkRows() {
  const rows = state.claudeSkRows;
  $("claudeSkBody").innerHTML = rows.map((row, index) => {
    const account = claudeSkAccountState(row);
    return `
      <tr>
        <td>${index + 1}</td>
        <td class="claude-sk-email-cell" title="${escapeHtml(row.email)}">${escapeHtml(row.email)}</td>
        <td><span class="claude-sk-secret">${escapeHtml(maskClaudeSkSecret(row.password))}</span></td>
        <td>${row.operation === "refund_check" ? "退款检测" : row.operation === "oauth_session_key" ? "SK OAuth 登录" : row.operation === "oauth_login" ? "自动授权" : "获取 SK"}</td>
        <td><span class="claude-sk-status ${claudeSkStatusClass(row.status)}">${escapeHtml(claudeSkStatusLabels[row.status] || row.status)}</span></td>
        <td><span class="claude-sk-status ${account.className}">${account.label}</span></td>
        <td><span class="claude-sk-secret" title="${escapeHtml(row.sessionKey ? "Session Key 已获取" : "")}">${escapeHtml(["oauth_login", "oauth_session_key"].includes(row.operation) ? (row.status === "completed" ? "已注册" : "-") : maskClaudeSkSecret(row.sessionKey, 12, 5))}</span></td>
        <td class="claude-sk-message-cell" title="${escapeHtml(claudeSkRowMessage(row))}">${escapeHtml(claudeSkRowMessage(row))}</td>
        <td><div class="claude-sk-actions">${claudeSkActionButtons(row)}</div></td>
      </tr>`;
  }).join("");
  $("claudeSkMobile").innerHTML = rows.map((row) => {
    const account = claudeSkAccountState(row);
    return `
      <article class="account-card">
        <div class="card-head"><strong>${escapeHtml(row.email)}</strong><span class="claude-sk-status ${claudeSkStatusClass(row.status)}">${escapeHtml(claudeSkStatusLabels[row.status] || row.status)}</span></div>
        <div class="claude-sk-card-grid">
          <div><span>密码</span><span class="claude-sk-secret">${escapeHtml(maskClaudeSkSecret(row.password))}</span></div>
          <div><span>账号</span><span class="claude-sk-status ${account.className}">${account.label}</span></div>
          <div><span>${row.operation === "refund_check" ? "退款邮件" : ["oauth_login", "oauth_session_key"].includes(row.operation) ? "授权结果" : "Session Key"}</span><span class="claude-sk-secret">${escapeHtml(row.operation === "refund_check" ? (row.refundMatches.length ? `${row.refundMatches.length} 封` : "无") : ["oauth_login", "oauth_session_key"].includes(row.operation) ? (row.status === "completed" ? "已注册" : "-") : maskClaudeSkSecret(row.sessionKey, 12, 5))}</span></div>
          <div><span>信息</span><span>${escapeHtml(claudeSkRowMessage(row))}</span></div>
        </div>
        <div class="card-actions claude-sk-actions">${claudeSkActionButtons(row)}</div>
      </article>`;
  }).join("");
  $("claudeSkEmpty").classList.toggle("hidden", rows.length > 0);

  const success = rows.filter((row) => Boolean(row.sessionKey) || (["oauth_login", "oauth_session_key"].includes(row.operation) && row.status === "completed")).length;
  const waiting = rows.filter((row) => ["need_manual", "browser_interaction_required", "manual_required", "needs_attention"].includes(row.status)).length;
  const failed = rows.filter((row) => row.status === "banned" || CLAUDE_SK_FAILURE_STATUSES.has(row.status)).length;
  const refunded = rows.filter((row) => row.status === "refund_detected").length;
  const pending = rows.filter((row) => row.status === "pending" && row.password).length;
  const failedWithPassword = rows.filter((row) => CLAUDE_SK_FAILURE_STATUSES.has(row.status) && row.password);
  $("claudeSkTotal").textContent = formatNumber(rows.length);
  $("claudeSkSuccess").textContent = formatNumber(success);
  $("claudeSkWaiting").textContent = formatNumber(waiting);
  $("claudeSkFailed").textContent = formatNumber(failed);
  $("claudeSkRefunded").textContent = formatNumber(refunded);
  $("claudeSkRecognized").textContent = `待处理 ${formatNumber(pending)} 个`;
  $("claudeSkStart").disabled = state.claudeSkRunning || pending === 0;
  $("claudeSkAuthorize").disabled = state.claudeSkRunning || pending === 0;
  $("claudeSkAuthorizeByKey").disabled = state.claudeSkRunning || pending === 0;
  $("claudeSkRefund").disabled = state.claudeSkRunning || pending === 0;
  $("claudeSkPause").disabled = !state.claudeSkRunning;
  $("claudeSkPause").textContent = state.claudeSkPaused ? "继续" : "暂停";
  $("claudeSkCopyFailed").disabled = failedWithPassword.length === 0;
  $("claudeSkExport").disabled = rows.length === 0;
  $("claudeSkRunState").textContent = state.claudeSkRunning ? (state.claudeSkPaused ? "已暂停" : "运行中") : "空闲";
}

function generateClaudeSkRows() {
  $("claudeSkError").textContent = "";
  const parsed = parseClaudeSkInput($("claudeSkRaw").value);
  if (!parsed.rows.length) {
    $("claudeSkError").textContent = "未识别到包含邮箱和密码的账号";
    return;
  }
  const proxyUrl = $("claudeSkProxy").value.trim();
  const existing = new Map(state.claudeSkRows
    .filter((row) => !row.jobId && row.status === "pending")
    .map((row) => [row.email.toLowerCase(), row]));
  const selected = [];
  let added = 0;
  for (const item of parsed.rows) {
    const current = existing.get(item.email.toLowerCase());
    if (current) {
      current.password = item.password;
      current.proxyUrl = proxyUrl;
      current.batchMember = true;
      current.operation = "session_key";
      current.refundMatches = [];
      selected.push(current);
      continue;
    }
    const row = newClaudeSkRow({ ...item, proxyUrl, batchMember: true });
    selected.push(row);
    existing.set(item.email.toLowerCase(), row);
    added += 1;
  }
  const selectedIds = new Set(selected.map((row) => row.localId));
  state.claudeSkRows = [
    ...selected,
    ...state.claudeSkRows.filter((row) => !selectedIds.has(row.localId)),
  ];
  $("claudeSkRaw").value = "";
  if (parsed.invalid) $("claudeSkError").textContent = `已忽略 ${parsed.invalid} 行无效数据`;
  const reused = selected.length - added;
  toast(reused ? `已生成 ${selected.length} 个账号，其中 ${reused} 个已更新` : `已生成 ${added} 个账号`);
  renderClaudeSkRows();
  requestAnimationFrame(() => $("claudeSkResults").scrollIntoView({ behavior: "smooth", block: "start" }));
}

async function loadClaudeSkJobs(quiet = false) {
  if (state.user?.role !== "admin") return;
  try {
    const data = await api("api/admin/claude-sk/jobs");
    const jobs = Array.isArray(data.items) ? data.items : [];
    const detailed = await Promise.all(jobs.map(async (job) => {
      if (!job.resultAvailable) return job;
      try {
        return (await api(`api/admin/claude-sk/jobs/${job.id}`)).job || job;
      } catch (_) {
        return job;
      }
    }));
    const byJobId = new Map(state.claudeSkRows.filter((row) => row.jobId).map((row) => [row.jobId, row]));
    for (const job of detailed) {
      const jobId = String(job.id || "");
      let row = byJobId.get(jobId);
      if (!row) {
        row = newClaudeSkRow({ id: jobId, email: job.email, mode: job.mode, operation: job.operation });
        state.claudeSkRows.push(row);
        byJobId.set(jobId, row);
      }
      applyClaudeSkJob(row, job);
    }
    renderClaudeSkRows();
    scheduleClaudeSkPoll();
  } catch (error) {
    if (!quiet) toast(error.message, true);
  }
}

function claudeSkConcurrency() {
  return Math.max(1, Math.min(10, Number($("claudeSkConcurrency").value) || 10));
}

async function submitClaudeSkRow(row) {
  if (!row || !row.password || row.status === "submitting") return;
  row.status = "submitting";
  row.message = "正在提交任务";
  row.error = "";
  row.sessionKey = "";
  row.banned = false;
  renderClaudeSkRows();
  try {
    const body = {
      email: row.email,
      operation: row.operation || "session_key",
      proxyUrl: row.proxyUrl || $("claudeSkProxy").value.trim(),
      ownerUserId: Number($("claudeSkOwner").value || state.user.id),
      billingTag: $("claudeSkBillingTag").value,
    };
    if (row.operation === "oauth_session_key") body.sessionKey = row.password;
    else body.password = row.password;
    const data = await api("api/admin/claude-sk/jobs", {
      method: "POST",
      body,
    });
    applyClaudeSkJob(row, data.job || {});
    if (data.reused) row.message = row.message || "已复用该邮箱正在执行的任务";
  } catch (error) {
    row.status = "failed";
    row.error = error.message;
  } finally {
    renderClaudeSkRows();
    pumpClaudeSkQueue();
    scheduleClaudeSkPoll(300);
  }
}

function pumpClaudeSkQueue() {
  if (!state.claudeSkRunning || state.claudeSkPaused) return;
  let active = state.claudeSkRows.filter(claudeSkIsBatchActive).length;
  for (const row of state.claudeSkRows) {
    if (active >= claudeSkConcurrency()) break;
    if (!row.batchMember || row.status !== "pending" || !row.password) continue;
    active += 1;
    submitClaudeSkRow(row);
  }
  const hasPending = state.claudeSkRows.some((row) => row.batchMember && row.status === "pending" && row.password);
  const hasActive = state.claudeSkRows.some(claudeSkIsBatchActive);
  if (!hasPending && !hasActive) state.claudeSkRunning = false;
  renderClaudeSkRows();
}

function scheduleClaudeSkPoll(delay = 1500) {
  clearTimeout(state.claudeSkPollTimer);
  state.claudeSkPollTimer = null;
  if (!state.user || state.user.role !== "admin") return;
  const hasActive = state.claudeSkRows.some(claudeSkIsActive);
  if (hasActive) state.claudeSkPollTimer = setTimeout(pollClaudeSkJobs, delay);
}

async function pollClaudeSkJobs() {
  if (state.claudeSkPolling) return;
  state.claudeSkPolling = true;
  const active = state.claudeSkRows.filter((row) => row.jobId && !claudeSkIsTerminal(row.status));
  try {
    await Promise.all(active.map(async (row) => {
      try {
        const data = await api(`api/admin/claude-sk/jobs/${row.jobId}`);
        applyClaudeSkJob(row, data.job || {});
      } catch (error) {
        row.message = error.message;
      }
    }));
  } finally {
    state.claudeSkPolling = false;
    pumpClaudeSkQueue();
    renderClaudeSkRows();
    scheduleClaudeSkPoll();
  }
}

function startClaudeSkBatch(event) {
  event.preventDefault();
  const pending = state.claudeSkRows.filter((row) => row.status === "pending" && row.password);
  if (!pending.length) {
    $("claudeSkError").textContent = "没有待处理账号";
    return;
  }
  $("claudeSkError").textContent = "";
  pending.forEach((row) => {
    row.operation = "session_key";
    row.jobId = "";
  });
  state.claudeSkRunning = true;
  state.claudeSkPaused = false;
  pumpClaudeSkQueue();
}

function startClaudeSkAuthorizeBatch(event) {
  event.preventDefault();
  const pending = state.claudeSkRows.filter(
    (row) => row.status === "pending" && row.password && !row.password.startsWith("sk-ant-")
  );
  if (!pending.length) {
    $("claudeSkError").textContent = "没有待处理的邮箱密码账号";
    return;
  }
  $("claudeSkError").textContent = "";
  state.claudeSkRows.forEach((row) => {
    row.batchMember = pending.includes(row);
  });
  pending.forEach((row) => {
    row.operation = "oauth_login";
    row.jobId = "";
    row.ownerUserId = Number($("claudeSkOwner").value || state.user.id);
    row.billingTag = $("claudeSkBillingTag").value;
  });
  state.claudeSkRunning = true;
  state.claudeSkPaused = false;
  pumpClaudeSkQueue();
}

function startClaudeSkAuthorizeByKeyBatch(event) {
  event.preventDefault();
  const pending = state.claudeSkRows.filter(
    (row) => row.status === "pending" && /^sk-ant-sid[A-Za-z0-9_-]+$/.test(row.password)
  );
  if (!pending.length) {
    $("claudeSkError").textContent = "没有待处理的邮箱 + Session Key 账号";
    return;
  }
  $("claudeSkError").textContent = "";
  state.claudeSkRows.forEach((row) => {
    row.batchMember = pending.includes(row);
  });
  pending.forEach((row) => {
    row.operation = "oauth_session_key";
    row.jobId = "";
    row.ownerUserId = Number($("claudeSkOwner").value || state.user.id);
    row.billingTag = $("claudeSkBillingTag").value;
  });
  state.claudeSkRunning = true;
  state.claudeSkPaused = false;
  pumpClaudeSkQueue();
}

function startClaudeSkRefundBatch(event) {
  event.preventDefault();
  const pending = state.claudeSkRows.filter((row) => row.status === "pending" && row.password);
  if (!pending.length) {
    $("claudeSkError").textContent = "没有待处理账号";
    return;
  }
  $("claudeSkError").textContent = "";
  pending.forEach((row) => {
    Object.assign(row, { operation: "refund_check", jobId: "" });
  });
  state.claudeSkRunning = true;
  state.claudeSkPaused = false;
  pumpClaudeSkQueue();
}

function toggleClaudeSkPause() {
  if (!state.claudeSkRunning) return;
  state.claudeSkPaused = !state.claudeSkPaused;
  if (!state.claudeSkPaused) pumpClaudeSkQueue();
  renderClaudeSkRows();
}

function claudeSkRowById(value) {
  return state.claudeSkRows.find((row) => row.localId === Number(value));
}

async function handleClaudeSkAction(event) {
  const button = event.target.closest("[data-claude-sk-action]");
  if (!button) return;
  const row = claudeSkRowById(button.dataset.rowId);
  if (!row) return;
  const action = button.dataset.claudeSkAction;
  if (action === "copy-sk") {
    await copyText(row.sessionKey);
    toast("Session Key 已复制");
  } else if (action === "mail-detail") {
    openClaudeSkMailDialog(row);
  } else if (action === "execute") {
    submitClaudeSkRow(row);
  } else if (action === "retry-admission") {
    try {
      await runButtonTask(button, "重试中", async () => {
        if (!row.manualAuthId) throw new Error("自动授权任务没有关联的原授权任务");
        const data = await api(`api/admin/claude-sk/jobs/${row.jobId}/auth-sessions/${row.manualAuthId}/runtime-retry`, {
          method: "POST",
          body: {},
        });
        applyClaudeSkJob(row, data.job || {});
        renderClaudeSkRows();
        scheduleClaudeSkPoll(300);
      });
    } catch (error) {
      toast(error.message, true);
    }
  } else if (action === "retry") {
    row.jobId = "";
    row.batchMember = true;
      row.status = "pending";
    row.message = "";
      row.error = "";
    submitClaudeSkRow(row);
  } else if (action === "link") {
    openClaudeSkLinkDialog(row);
  } else if (action === "browser") {
    openClaudeSkBrowserDialog(row);
  } else if (action === "browser-link") {
    await openClaudeSkBrowserLink(row);
  } else if (action === "manual-auth") {
    try {
      const data = await api(`api/admin/claude-sk/jobs/${row.jobId}/manual`, { method: "POST", body: {} });
      applyClaudeSkJob(row, data.job || {});
      renderClaudeSkRows();
      if (!row.manualAuthId) throw new Error("自动授权任务没有关联的手动授权任务");
      await switchView("add");
      await openAuthorizationJob("single", row.manualAuthId);
    } catch (error) {
      toast(error.message, true);
    }
  } else if (action === "cancel") {
    try {
      const data = await api(`api/admin/claude-sk/jobs/${row.jobId}/cancel`, { method: "POST", body: {} });
      applyClaudeSkJob(row, data.job || {});
      renderClaudeSkRows();
    } catch (error) {
      toast(error.message, true);
    }
  }
}

async function openClaudeSkBrowserLink(row) {
  const popup = window.open("about:blank", "_blank");
  try {
    const data = await api(`api/claude-sk/jobs/${row.jobId}/browser-interaction`);
    const url = new URL(String(data.path || ""), window.location.origin);
    if (url.origin !== window.location.origin || !url.pathname.startsWith("/interaction/")) {
      throw new Error("浏览器验证链接无效");
    }
    if (popup) {
      popup.opener = null;
      popup.location.replace(url.href);
    } else {
      await copyText(url.href);
      toast("弹窗被浏览器阻止，验证链接已复制", true);
    }
  } catch (error) {
    if (popup) popup.close();
    toast(error.message, true);
  }
}

function openClaudeSkMailDialog(row) {
  state.claudeSkMailRowId = row.localId;
  $("claudeSkMailEmail").textContent = row.email;
  $("claudeSkMailNote").textContent = row.refundScannedCount
    ? `显示最近 ${Math.min(row.recentMessages.length, 5)} 封邮件正文，本次扫描 ${row.refundScannedCount} 封。`
    : "本次任务没有读取到邮件列表，请重新执行退款检测。";
  const messages = row.recentMessages.slice(0, 5);
  $("claudeSkMailList").innerHTML = messages.length
    ? messages.map((item, index) => `
        <details class="claude-sk-mail-item" ${index === 0 ? "open" : ""}>
          <summary><span class="claude-sk-mail-index">${index + 1}</span><span><strong>邮件 ${index + 1}</strong><em>${escapeHtml(item.preview || "-")}</em></span></summary>
          <pre class="claude-sk-mail-content">${escapeHtml(item.bodyText || "该任务未保存邮件正文，请重新检测")}</pre>
        </details>`).join("")
    : '<div class="empty-state">没有可展示的邮件摘要</div>';
  $("claudeSkMailDialog").showModal();
}

function closeClaudeSkMailDialog() {
  state.claudeSkMailRowId = null;
  if ($("claudeSkMailDialog").open) $("claudeSkMailDialog").close();
}

function failedClaudeSkCredentialLines() {
  return state.claudeSkRows
    .filter((row) => CLAUDE_SK_FAILURE_STATUSES.has(row.status) && row.password)
    .map((row) => `${row.email}----${row.password}`);
}

async function copyFailedClaudeSkRows() {
  const lines = failedClaudeSkCredentialLines();
  if (!lines.length) return;
  await copyText(lines.join("\n"));
  toast(`已复制 ${lines.length} 个失败账号`);
}

function csvCell(value) {
  return `"${String(value ?? "").replaceAll('"', '""')}"`;
}

function exportClaudeSkRows() {
  if (!state.claudeSkRows.length) return;
  const lines = [["邮箱", "密码", "检测类型", "任务状态", "账号状态", "SessionKey", "退款邮件数", "信息"]];
  for (const row of state.claudeSkRows) {
    lines.push([
      row.email,
      row.password,
      row.operation === "refund_check" ? "退款检测" : "自动密码",
      claudeSkStatusLabels[row.status] || row.status,
      claudeSkAccountState(row).label,
      row.sessionKey,
      row.refundMatches.length,
      claudeSkRowMessage(row),
    ]);
  }
  const csv = `\uFEFF${lines.map((line) => line.map(csvCell).join(",")).join("\r\n")}`;
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = `claude_sk_${Date.now()}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

function clearClaudeSkRows() {
  if (state.claudeSkRows.some((row) => row.jobId && !claudeSkIsTerminal(row.status))) {
    toast("存在运行中的任务，不能清空", true);
    return;
  }
  state.claudeSkRows = [];
  state.claudeSkRunning = false;
  state.claudeSkPaused = false;
  clearTimeout(state.claudeSkPollTimer);
  renderClaudeSkRows();
}

function openClaudeSkLinkDialog(row) {
  state.claudeSkLinkJobId = row.jobId;
  $("claudeSkLinkEmail").textContent = row.email;
  $("claudeSkMagicLink").value = "";
  $("claudeSkLinkError").textContent = "";
  $("claudeSkLinkDialog").showModal();
  setTimeout(() => $("claudeSkMagicLink").focus(), 0);
}

function closeClaudeSkLinkDialog() {
  state.claudeSkLinkJobId = null;
  if ($("claudeSkLinkDialog").open) $("claudeSkLinkDialog").close();
}

async function submitClaudeSkLink(event) {
  event.preventDefault();
  const jobId = state.claudeSkLinkJobId;
  if (!jobId) return;
  $("claudeSkLinkError").textContent = "";
  await runButtonTask($("submitClaudeSkLink"), "提交中", async () => {
    try {
      const data = await api(`api/admin/claude-sk/jobs/${jobId}/magic-link`, {
        method: "POST",
        body: { link: $("claudeSkMagicLink").value.trim() },
      });
      const row = state.claudeSkRows.find((item) => item.jobId === jobId);
      if (row) applyClaudeSkJob(row, data.job || {});
      closeClaudeSkLinkDialog();
      renderClaudeSkRows();
      scheduleClaudeSkPoll(200);
    } catch (error) {
      $("claudeSkLinkError").textContent = error.message;
    }
  });
}

function openClaudeSkBrowserDialog(row) {
  state.claudeSkBrowserJobId = row.jobId;
  $("claudeSkBrowserEmail").textContent = row.email;
  $("claudeSkBrowserStatus").textContent = row.message || "等待浏览器验证";
  $("claudeSkBrowserError").textContent = "";
  $("claudeSkBrowserDialog").showModal();
  refreshClaudeSkBrowser();
  clearInterval(state.claudeSkBrowserTimer);
  state.claudeSkBrowserTimer = setInterval(refreshClaudeSkBrowser, 1800);
}

function closeClaudeSkBrowserDialog() {
  clearInterval(state.claudeSkBrowserTimer);
  state.claudeSkBrowserTimer = null;
  state.claudeSkBrowserJobId = null;
  if ($("claudeSkBrowserDialog").open) $("claudeSkBrowserDialog").close();
}

async function refreshClaudeSkBrowser() {
  const jobId = state.claudeSkBrowserJobId;
  if (!jobId || !$("claudeSkBrowserDialog").open) return;
  try {
    const data = await api(`api/claude-sk/jobs/${jobId}/browser-screenshot`);
    $("claudeSkBrowserImage").src = `data:image/png;base64,${data.imageBase64}`;
    const row = state.claudeSkRows.find((item) => item.jobId === jobId);
    if (row) $("claudeSkBrowserStatus").textContent = claudeSkRowMessage(row);
    $("claudeSkBrowserError").textContent = "";
  } catch (error) {
    $("claudeSkBrowserError").textContent = error.message;
  }
}

async function sendClaudeSkBrowserAction(payload) {
  const jobId = state.claudeSkBrowserJobId;
  if (!jobId) return;
  try {
    await api(`api/claude-sk/jobs/${jobId}/browser-action`, {
      method: "POST",
      body: payload,
    });
    setTimeout(refreshClaudeSkBrowser, 150);
  } catch (error) {
    $("claudeSkBrowserError").textContent = error.message;
  }
}

function claudeSkBrowserPoint(event) {
  const image = $("claudeSkBrowserImage");
  if (!image.naturalWidth || !image.naturalHeight) return null;
  const box = image.getBoundingClientRect();
  const scale = Math.min(box.width / image.naturalWidth, box.height / image.naturalHeight);
  const width = image.naturalWidth * scale;
  const height = image.naturalHeight * scale;
  const left = box.left + (box.width - width) / 2;
  const top = box.top + (box.height - height) / 2;
  const x = (event.clientX - left) / scale;
  const y = (event.clientY - top) / scale;
  if (x < 0 || y < 0 || x > image.naturalWidth || y > image.naturalHeight) return null;
  return { x, y };
}

async function initializeData() {
  if (!state.user) return;
  state.users = [state.user];
  populateUserSelects();
  if (!state.user) return;
  showApp();
  const viewTask = switchView(window.location.hash.slice(1) || "accounts");
  startLiveRefresh();
  await Promise.all([viewTask, loadUserOptions()]);
}

async function refreshVisibleData() {
  if (!state.user || state.liveRefreshBusy || document.visibilityState !== "visible") return;
  state.liveRefreshBusy = true;
  try {
    const tasks = [refreshMe(false)];
    if (["accounts", "archive"].includes(state.currentView) && !weeklyActive()) {
      tasks.push(loadAccounts(true), loadDeleteJobs(true), loadLivenessJobs());
    } else if (state.currentView === "add") {
      tasks.push(loadJobs(true), loadProxyPool(true), loadAuthorizationJobs(true));
    } else if (state.currentView === "claude-sk" && state.user.role === "admin") {
      tasks.push(loadClaudeSkJobs(true));
    } else if (state.currentView === "users" && state.user.role === "admin") {
      tasks.push(loadUsers(true), loadSettings(true));
    } else if (state.currentView === "servers" && state.user.role === "admin") {
      tasks.push(loadSettings(true), loadServerLoad(false, true));
    } else if (state.currentView === "stats") {
      tasks.push(loadStats(true));
    } else if (state.currentView === "account-errors") {
      tasks.push(loadErrorStats(true));
    }
    await Promise.all(tasks);
  } catch (_) {
    // Background refresh retries on the next interval.
  } finally {
    state.liveRefreshBusy = false;
  }
}

function startLiveRefresh() {
  clearInterval(state.liveTimer);
  state.liveTimer = setInterval(refreshVisibleData, 60000);
  clearInterval(state.accountWindowTimer);
  state.accountWindowTimer = setInterval(loadAccountWindows, 5000);
}

function debounce(fn, delay) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  };
}

function toggleSidebar() {
  const appView = $("appView");
  if (window.matchMedia("(max-width: 780px)").matches) {
    appView.classList.remove("menu-open");
    $("mobileMenu").setAttribute("aria-expanded", "false");
    return;
  }
  appView.classList.toggle("sidebar-collapsed");
}

function toggleMobileMenu() {
  const open = $("appView").classList.toggle("menu-open");
  $("mobileMenu").setAttribute("aria-expanded", String(open));
}

function closeAccountDialog() {
  const dialog = $("accountDialog");
  if (dialog.open) dialog.close();
}

function bindEvents() {
  bindWeekly();
  bindErrorStats();
  bindRequestQualityEvents();
  $("proxySwapSubmit").addEventListener("click", submitProxySwap);
  $("proxySwapClose").addEventListener("click", () => $("proxySwapDialog").close());
  $("proxySwapDialog").addEventListener("close", () => {
    proxySwapView.serial += 1;
    clearTimeout(proxySwapView.timer);
    proxySwapView.job = null;
    proxySwapView.preview = null;
  });
  document.body.appendChild($("settlementRateDialog"));
  $("confirmCancel").addEventListener("click", () => settleConfirmation(false));
  $("confirmAccept").addEventListener("click", () => settleConfirmation(true));
  $("confirmDialog").addEventListener("cancel", (event) => {
    event.preventDefault();
    settleConfirmation(false);
  });
  $("confirmDialog").addEventListener("click", (event) => {
    if (event.target === event.currentTarget) settleConfirmation(false);
  });
  $("loginForm").addEventListener("submit", login);
  $("logoutButton").addEventListener("click", logout);
  $("topDeficit").addEventListener("click", () => switchView(state.user?.role === "admin" ? "servers" : "add"));
  $("collapseSidebar").addEventListener("click", toggleSidebar);
  $("mobileMenu").addEventListener("click", toggleMobileMenu);
  document.querySelectorAll(".nav-item").forEach((button) => button.addEventListener("click", () => switchView(button.dataset.view)));
  $("globalRefresh").addEventListener("click", (event) => {
    runButtonTask(event.currentTarget, "刷新中", async () => {
      if (state.currentView === "servers") await loadServerLoad(true);
      else if (state.currentView === "request-quality") await loadRequestQuality(true);
      else if (state.currentView === "request-ips") await loadRequestIPs();
      else await switchView(state.currentView);
    });
  });
  $("claudeSkGenerate").addEventListener("click", generateClaudeSkRows);
  $("claudeSkForm").addEventListener("submit", startClaudeSkBatch);
  $("claudeSkAuthorize").addEventListener("click", startClaudeSkAuthorizeBatch);
  $("claudeSkAuthorizeByKey").addEventListener("click", startClaudeSkAuthorizeByKeyBatch);
  $("claudeSkRefund").addEventListener("click", startClaudeSkRefundBatch);
  $("claudeSkPause").addEventListener("click", toggleClaudeSkPause);
  $("claudeSkCopyFailed").addEventListener("click", copyFailedClaudeSkRows);
  $("claudeSkExport").addEventListener("click", exportClaudeSkRows);
  $("claudeSkClear").addEventListener("click", clearClaudeSkRows);
  $("claudeSkRefresh").addEventListener("click", (event) => runButtonTask(event.currentTarget, "刷新中", () => loadClaudeSkJobs()));
  $("claudeSkBody").addEventListener("click", handleClaudeSkAction);
  $("claudeSkMobile").addEventListener("click", handleClaudeSkAction);
  $("claudeSkLinkForm").addEventListener("submit", submitClaudeSkLink);
  $("closeClaudeSkLink").addEventListener("click", closeClaudeSkLinkDialog);
  $("cancelClaudeSkLink").addEventListener("click", closeClaudeSkLinkDialog);
  $("claudeSkLinkDialog").addEventListener("cancel", (event) => {
    event.preventDefault();
    closeClaudeSkLinkDialog();
  });
  $("closeClaudeSkMail").addEventListener("click", closeClaudeSkMailDialog);
  $("claudeSkMailDialog").addEventListener("cancel", (event) => {
    event.preventDefault();
    closeClaudeSkMailDialog();
  });
  $("closeClaudeSkBrowser").addEventListener("click", closeClaudeSkBrowserDialog);
  $("refreshClaudeSkBrowser").addEventListener("click", refreshClaudeSkBrowser);
  $("claudeSkBrowserDialog").addEventListener("cancel", (event) => {
    event.preventDefault();
    closeClaudeSkBrowserDialog();
  });
  document.querySelectorAll("[data-claude-sk-key]").forEach((button) => {
    button.addEventListener("click", () => sendClaudeSkBrowserAction({ type: "press", key: button.dataset.claudeSkKey }));
  });
  $("claudeSkBrowserImage").addEventListener("pointerdown", (event) => {
    claudeSkBrowserPointerStart = claudeSkBrowserPoint(event);
    if (claudeSkBrowserPointerStart) event.currentTarget.setPointerCapture(event.pointerId);
  });
  $("claudeSkBrowserImage").addEventListener("pointerup", (event) => {
    const start = claudeSkBrowserPointerStart;
    const end = claudeSkBrowserPoint(event);
    claudeSkBrowserPointerStart = null;
    if (!start || !end) return;
    const distance = Math.hypot(end.x - start.x, end.y - start.y);
    if (distance >= 8) {
      sendClaudeSkBrowserAction({ type: "drag", fromX: start.x, fromY: start.y, toX: end.x, toY: end.y });
    } else {
      sendClaudeSkBrowserAction({ type: "click", x: end.x, y: end.y });
    }
  });
  $("accountSearch").addEventListener("input", debounce(() => { state.page = 1; loadAccounts(); }, 350));
  $("archiveSearch").addEventListener("input", debounce(() => { state.page = 1; loadAccounts(); }, 350));
  ["accountFrom", "accountTo", "ownerFilter", "siteFilter", "accountSort"].forEach((id) => $(id).addEventListener("change", () => {
    state.page = 1;
    loadAccounts();
    if (id === "ownerFilter" || id === "siteFilter") refreshRealtimeMetricsScope();
  }));
  ["archiveOwnerFilter", "archiveSiteFilter", "archiveFrom", "archiveTo", "archiveSort"].forEach((id) => $(id).addEventListener("change", () => { state.page = 1; loadAccounts(); }));
  $("archiveResetFilters").addEventListener("click", resetArchiveFilters);
  $("archiveExportButton").addEventListener("click", exportArchiveAccounts);
  $("categoryFilters").addEventListener("click", (event) => {
    const button = event.target.closest("[data-category]");
    if (!button) return;
    state.category = button.dataset.category;
    state.page = 1;
    renderCategoryFilters();
    loadAccounts();
  });
  $("refundFilters").addEventListener("click", (event) => {
    const button = event.target.closest("[data-refund-state]");
    if (!button) return;
    state.refundState = button.dataset.refundState;
    state.page = 1;
    state.accountSelection.clear();
    state.accountSelectionMeta.clear();
    renderCategoryFilters();
    renderBulkDeleteTools();
    renderAccountSelectionTools();
    loadAccounts();
  });
  $("prevPage").addEventListener("click", () => { state.page = Math.max(1, state.page - 1); loadAccounts(); });
  $("nextPage").addEventListener("click", () => { state.page += 1; loadAccounts(); });
  [$("accountsBody"), $("accountsMobile")].forEach((node) => node.addEventListener("click", (event) => {
    const diagnosticsButton = event.target.closest("[data-diagnostics-account]");
    if (diagnosticsButton) { openRequestDiagnostics(diagnosticsButton.dataset.diagnosticsAccount); return; }
    const errorButton = event.target.closest(".account-status-detail");
    if (errorButton) {
      openAccountError(Number(errorButton.dataset.id));
      return;
    }
    const copyButton = event.target.closest(".copy-account-name");
    if (copyButton) {
      copyText(copyButton.dataset.name).then(() => toast("账号名已复制")).catch(() => toast("复制失败，请手动复制", true));
      return;
    }
    const noteButton = event.target.closest(".edit-note-account");
    if (noteButton) {
      openAccountNote(Number(noteButton.dataset.id));
      return;
    }
    const deleteButton = event.target.closest(".delete-account");
    if (deleteButton) {
      deleteAccount(Number(deleteButton.dataset.id), deleteButton);
      return;
    }
    const reauthButton = event.target.closest(".reauth-account");
    if (reauthButton) {
      openReauthDialog(Number(reauthButton.dataset.id));
      return;
    }
    const swapButton = event.target.closest(".proxy-swap-account");
    if (swapButton) {
      openProxySwap(Number(swapButton.dataset.id));
      return;
    }
    const detailButton = event.target.closest(".detail-account");
    if (detailButton) {
      openAccountDetail(Number(detailButton.dataset.id));
      return;
    }
    const refundButton = event.target.closest(".refund-account");
    if (refundButton) markRefund(Number(refundButton.dataset.id), refundButton.dataset.state, refundButton);
  }));
  [$("accountsBody"), $("accountsMobile")].forEach((node) => node.addEventListener("change", (event) => {
    const checkbox = event.target.closest(".account-select");
    if (!checkbox) return;
    const selectionKey = checkbox.dataset.selectionKey;
    if (checkbox.checked) state.accountSelection.add(selectionKey);
    else state.accountSelection.delete(selectionKey);
    document.querySelectorAll(`.account-select[data-selection-key="${CSS.escape(selectionKey)}"]`).forEach((input) => {
      input.checked = checkbox.checked;
      input.closest("tr, .account-card")?.classList.toggle("account-selected", checkbox.checked);
    });
    renderAccountSelectionTools();
  }));
  $("selectAccountPage").addEventListener("change", (event) => {
    (state.accounts?.items || []).filter(accountCanBeSelected).forEach((account) => {
      const selectionKey = accountSelectionKey(account);
      if (event.currentTarget.checked) state.accountSelection.add(selectionKey);
      else state.accountSelection.delete(selectionKey);
    });
    renderAccounts();
  });
  $("openBulkPrice").addEventListener("click", () => openPriceEditor(selectedAccountRecords().map((account) => Number(account.id))));
  $("copySelectedImportLines").addEventListener("click", copySelectedImportLines);
  $("clearAccountSelection").addEventListener("click", () => {
    state.accountSelection.clear();
    renderAccounts();
  });
  $("openPriceHistory").addEventListener("click", openPriceHistoryDialog);
  $("deleteAllErrorsButton").addEventListener("click", deleteAllErrors);
  $("startLivenessButton").addEventListener("click", () => startLiveness());
  $("startDueLivenessButton").addEventListener("click", () => startLiveness("reset_due"));
  $("retryLivenessButton").addEventListener("click", retryLiveness);
  $("toggleLivenessResultButton").addEventListener("click", toggleLivenessResult);
  $("siteFilter").addEventListener("change", renderLivenessJob);
  $("deleteSelectedErrorsButton").addEventListener("click", deleteSelectedErrors);
  $("transitionRefundsButton").addEventListener("click", bulkTransitionRefunds);
  $("purgeRefundedButton").addEventListener("click", purgeRefundedAccounts);
  $("closeDetail").addEventListener("click", closeAccountDialog);
  $("accountDialog").addEventListener("cancel", closeAccountDialog);
  $("editDetailNote").addEventListener("click", () => {
    const account = state.detailAccount;
    if (account) openAccountNote(Number(account.id));
  });
  $("saveOwner").addEventListener("click", saveAccountOwner);
  $("editDetailPrice").addEventListener("click", () => {
    const account = state.detailAccount;
    if (!account) return;
    closeAccountDialog();
    openPriceEditor([Number(account.id)], account);
  });
  $("closePriceDialog").addEventListener("click", closePriceDialog);
  $("priceDialog").addEventListener("cancel", closePriceDialog);
  $("accountNoteForm").addEventListener("submit", saveAccountNote);
  $("closeAccountNote").addEventListener("click", closeAccountNote);
  $("cancelAccountNote").addEventListener("click", closeAccountNote);
  $("accountNoteDialog").addEventListener("cancel", (event) => {
    event.preventDefault();
    closeAccountNote();
  });
  $("priceMode").addEventListener("click", (event) => {
    const button = event.target.closest("[data-price-mode]");
    if (button) setPriceMode(button.dataset.priceMode);
  });
  ["priceTargets", "fixedPrice"].forEach((id) => $(id).addEventListener("input", invalidatePricePreview));
  $("previewPrice").addEventListener("click", previewPriceChange);
  $("applyPrice").addEventListener("click", applyPriceChange);
  $("priceHistorySearch").addEventListener("input", debounce(loadPriceHistory, 300));
  $("refundDetailAccount").addEventListener("click", (event) => markRefund(Number(event.currentTarget.dataset.id), event.currentTarget.dataset.state, event.currentTarget));
  $("deleteDetailAccount").addEventListener("click", (event) => deleteAccount(Number(event.currentTarget.dataset.id), event.currentTarget));
  $("closeReauthDialog").addEventListener("click", closeReauthDialog);
  $("reauthDialog").addEventListener("cancel", closeReauthDialog);
  $("reauthForm").addEventListener("submit", startReauth);
  $("reauthMode").addEventListener("click", (event) => {
    const button = event.target.closest("[data-reauth-mode]");
    if (button) setReauthMode(button.dataset.reauthMode);
  });
  $("copyReauthUrl").addEventListener("click", copyReauthAuthorization);
  $("openReauthUrl").addEventListener("click", openReauthAuthorization);
  $("submitReauthCode").addEventListener("click", submitReauthCode);
  $("submitReauthSessionKey").addEventListener("click", submitReauthSessionKey);
  $("submitReauthSetupToken").addEventListener("click", submitReauthSetupToken);
  $("cancelReauth").addEventListener("click", cancelReauth);
  $("cancelReauthSecret").addEventListener("click", cancelReauth);
  $("cancelReauthSetupToken").addEventListener("click", cancelReauth);
  $("cancelReauthFallback").addEventListener("click", cancelReauth);
  $("recoverReauth").addEventListener("click", recoverReauth);
  $("openBulkReauth").addEventListener("click", openBulkReauthDialog);
  $("closeBulkReauthDialog").addEventListener("click", closeBulkReauthDialog);
  $("bulkReauthDialog").addEventListener("cancel", closeBulkReauthDialog);
  $("bulkReauthForm").addEventListener("submit", startBulkReauth);
  $("bulkReauthMode").addEventListener("click", (event) => {
    const button = event.target.closest("[data-bulk-reauth-mode]");
    if (button) setBulkReauthMode(button.dataset.bulkReauthMode);
  });
  $("bulkReauthSelectedAccounts").addEventListener("input", (event) => {
    if (event.target.closest(".bulk-reauth-key")) updateBulkReauthButton();
  });
  $("bulkReauthPaste").addEventListener("input", fillBulkReauthKeysFromPaste);
  $("bulkReauthItems").addEventListener("click", handleBulkReauthAction);
  $("bulkRaw").addEventListener("input", updateAddButton);
  $("bulkProxies").addEventListener("input", updateAddButton);
  $("addForm").addEventListener("submit", startAdd);
  $("addMode").addEventListener("click", (event) => {
    const button = event.target.closest("[data-auth-mode]");
    if (button) setAddAuthMode(button.dataset.authMode);
  });
  $("browserAuthForm").addEventListener("submit", startBrowserAuth);
  $("batchAuthForm").addEventListener("submit", startBatchAuth);
  $("batchProviderNames").addEventListener("input", updateBatchAuthButton);
  $("batchProxies").addEventListener("input", updateBatchAuthButton);
  $("batchAuthType").addEventListener("change", (event) => {
    $("batchLoginMethodWrap").classList.toggle("hidden", event.currentTarget.value === "setup_token");
  });
  $("addProgressOwner").addEventListener("change", renderQuota);
  for (const ownerSelectId of ["addOwner", "browserOwner", "batchOwner"]) {
    $(ownerSelectId).addEventListener("change", renderQuota);
  }
  $("batchAuthItems").addEventListener("click", handleBatchAuthAction);
  $("copyBrowserAuth").addEventListener("click", copyBrowserAuthorization);
  $("openBrowserAuth").addEventListener("click", openBrowserAuthorization);
  $("submitBrowserAuthCode").addEventListener("click", submitBrowserCode);
  $("cancelBrowserAuth").addEventListener("click", cancelBrowserAuth);
  $("retryBrowserAuth").addEventListener("click", retryBrowserAuth);
  $("copyFailedImportsButton").addEventListener("click", async () => {
    if (!state.failedImportLines.length) return;
    try {
      await copyText(state.failedImportLines.join("\n"));
      toast(`已复制 ${formatNumber(state.failedImportLines.length)} 个失败导入信息`);
    } catch (error) {
      toast("复制失败", true);
    }
  });
  $("cancelQueuedSkBatch").addEventListener("click", cancelQueuedSkBatch);
  $("jobResults").addEventListener("click", async (event) => {
    const browserButton = event.target.closest(".open-sk-browser");
    if (browserButton) {
      const popup = window.open("about:blank", "_blank");
      try {
        const data = await api(`api/claude-sk/jobs/${browserButton.dataset.jobId}/browser-interaction`);
        const url = new URL(String(data.path || ""), window.location.origin);
        if (url.origin !== window.location.origin || !url.pathname.startsWith("/interaction/")) throw new Error("浏览器验证链接无效");
        if (popup) popup.location.replace(url.href);
        else toast("浏览器阻止了弹窗", true);
      } catch (error) {
        if (popup) popup.close();
        toast(error.message, true);
      }
      return;
    }
    const button = event.target.closest(".copy-import-line");
    if (!button) return;
    const copyIndex = Number(button.dataset.copyIndex);
    const importLine = Number.isInteger(copyIndex) ? state.failedImportLines[copyIndex] : "";
    if (!importLine) return;
    try {
      await copyText(importLine);
      toast("已复制原始信息");
    } catch (error) {
      toast("复制失败", true);
    }
  });
  $("refreshJobs").addEventListener("click", (event) => runButtonTask(event.currentTarget, "刷新中", () => loadJobs()));
  $("refreshAuthJobs").addEventListener("click", (event) => runButtonTask(event.currentTarget, "刷新中", () => loadAuthorizationJobs()));
  $("authJobsList").addEventListener("click", (event) => {
    const button = event.target.closest(".open-auth-job");
    if (button) openAuthorizationJob(button.dataset.kind, button.dataset.id);
  });
  $("jobsList").addEventListener("click", (event) => {
    const button = event.target.closest(".open-job");
    if (button) openJob(button.dataset.id);
  });
  $("createUserForm").addEventListener("submit", createUser);
  $("globalSettingsForm").addEventListener("submit", saveGlobalSettings);
  $("siteQuotaSettingsList").addEventListener("click", (event) => {
    const button = event.target.closest("[data-site-quota-save]");
    const topupButton = event.target.closest("[data-site-quota-topup-save]");
    const row = (button || topupButton)?.closest("[data-site-id]");
    if (!row) return;
    if (topupButton) saveSiteQuotaAutoTopup(row.dataset.siteId || "main");
    else saveSiteQuota(row.dataset.siteId || "main");
  });
  $("siteQuotaSettingsList").addEventListener("keydown", (event) => {
    if (event.key !== "Enter") return;
    const row = event.target.closest("[data-site-id]");
    if (!row) return;
    event.preventDefault();
    if (event.target.closest("[data-quota-topup-target]")) {
      saveSiteQuotaAutoTopup(row.dataset.siteId || "main");
    } else {
      saveSiteQuota(row.dataset.siteId || "main");
    }
  });
  $("targetServerForm").addEventListener("submit", saveTargetServer);
  $("addDefaultsForm").addEventListener("submit", saveAddDefaults);
  $("sub2apiSiteControlsList").addEventListener("change", saveSub2apiSiteControl);
  $("sub2apiSiteControlsList").addEventListener("input", updateSub2apiThresholdDraft);
  $("sub2apiSiteControlsList").addEventListener("submit", saveSub2apiThresholds);
  $("settlementRateForm").addEventListener("submit", saveSettlementRate);
  $("settlementRateForm").addEventListener("input", () => { state.settlementRateFormDirty = true; });
  ["settlementMode", "settlementAccountPriceType"].forEach((id) => $(id).addEventListener("change", () => {
    state.settlementRateFormDirty = true;
    updateSettlementRateFields();
  }));
  $("addSettlementTier").addEventListener("click", addSettlementTier);
  $("settlementTierRows").addEventListener("click", removeSettlementTier);
  $("closeSettlementRateDialog").addEventListener("click", closeSettlementRateDialog);
  $("refreshSettlementRates").addEventListener("click", (event) => runButtonTask(event.currentTarget, "刷新中", () => loadSettlementRates()));
  $("closeUserRuntimeConfig").addEventListener("click", closeUserRuntimeConfig);
  $("userRuntimeConfigForm").addEventListener("submit", (event) => {
    event.preventDefault();
    saveUserRuntimeConfig($("saveUserRuntimeConfig"));
  });
  $("clearUserRuntimeConfig").addEventListener("click", (event) => {
    saveUserRuntimeConfig(event.currentTarget, true);
  });
  $("settlementScheduledList").addEventListener("click", cancelSettlementRate);
  $("refreshServerLoad").addEventListener("click", (event) => runButtonTask(event.currentTarget, "刷新中", () => loadServerLoad(true)));
  [$("usersBody"), $("usersMobile")].forEach((node) => node.addEventListener("click", (event) => {
    const runtimeButton = event.target.closest(".edit-runtime-config");
    if (runtimeButton) {
      openUserRuntimeConfig(runtimeButton.closest("[data-user-id]"));
      return;
    }
    const settlementButton = event.target.closest(".edit-settlement-rate");
    if (settlementButton) {
      openSettlementRateDialog(settlementButton.closest("[data-user-id]"));
      return;
    }
    const saveButton = event.target.closest(".save-user");
    if (saveButton) saveUser(saveButton.closest("[data-user-id]"));
  }));
  [$("usersBody"), $("usersMobile")].forEach((node) => node.addEventListener("input", (event) => {
    const input = event.target;
    if (!input.matches(".user-priority, .user-model-priority")) return;
    const userId = Number(input.closest("[data-user-id]").dataset.userId);
    const key = input.matches(".user-model-priority") ? "sub2apiModelPriority" : "sub2apiPriority";
    state.userPriorityDrafts.set(userId, { ...state.userPriorityDrafts.get(userId), [key]: input.value });
    const selector = key === "sub2apiModelPriority" ? ".user-model-priority" : ".user-priority";
    document.querySelectorAll(`[data-user-id="${userId}"] ${selector}`).forEach((peer) => {
      if (peer !== input) peer.value = input.value;
    });
  }));
  [$("usersBody"), $("usersMobile")].forEach((node) => node.addEventListener("change", (event) => {
    if (!event.target.matches(".user-usage-visible")) return;
    const factorInput = event.target.closest("[data-user-id]")?.querySelector(".user-usage-factor");
    if (!factorInput) return;
    factorInput.disabled = !event.target.checked;
    if (event.target.checked) factorInput.focus();
  }));
  $("refreshStats").addEventListener("click", (event) => runButtonTask(event.currentTarget, "查询中", () => loadStats()));
  $("rebuildStats").addEventListener("click", (event) => runButtonTask(event.currentTarget, "提交中", () => loadStats(false, true)));
  $("statsUser").addEventListener("change", loadStats);
  $("refreshAuthStats").addEventListener("click", (event) => runButtonTask(event.currentTarget, "查询中", () => loadAuthStats()));
  $("authStatsUser").addEventListener("change", loadAuthStats);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") {
      refreshVisibleData();
      loadRealtimeMetrics(true);
      void loadAccountWindows(true);
    } else {
      cancelRealtimeMetricsRequest();
      state.accountWindowController?.abort();
    }
  });
}

function cancelRequestIPs(reset = false) {
  clearTimeout(requestIPs.timer);
  requestIPs.timer = null;
  requestIPs.controller?.abort();
  requestIPs.controller = null;
  requestIPs.serial++;
  requestIPs.selected = null;
  $("requestIPDialog").close();
  if (reset) {
    requestIPs.data = null; requestIPs.token = ""; requestIPs.page = 1;
    $("requestIPRows").replaceChildren();
    $("requestIPOverview").replaceChildren();
    $("requestIPHealth").replaceChildren();
    $("requestIPHistory").replaceChildren();
    $("requestIPIdentity").textContent = "";
    $("requestIPSite").value = "main";
    $("requestIPState").value = "pending";
    $("requestIPSearch").value = "";
    $("requestIPPeriod").value = "all";
    $("requestIPReason").value = "";
    $("requestIPError").textContent = "";
    $("requestIPStatus").textContent = "";
    requestIPs.params = "";
  }
}

function ipTime(value) {
  return value ? new Date(value * 1000).toLocaleString("zh-CN", { timeZone: "Asia/Shanghai", hour12: false }) : "-";
}

function requestIPHealth(status) {
  const policy = status.applied ? "规则已生效" : status.enabled ? "规则待同步" : "封禁尚未开放";
  $("requestIPStatus").textContent = `${status.healthy ? "采集正常" : "采集延迟或尚未就绪"} · ${policy} · ${ipTime(status.updatedAt)}`;
  if (Number(status.trafficPercent || 0) < 100) $("requestIPStatus").textContent += ` · ${status.trafficPercent || 0}% 流量`;
  const baseline = { pending: "待导入", running: "导入中", completed: "已完成", failed: "失败" }[status.baseline?.state] || "未知";
  $("requestIPHealth").innerHTML = `<p>规则版本 ${escapeHtml(status.version)} · 基线${baseline} · 未收录观测 ${qualityNumber(status.dropped || 0)} · 未确认正常结束的采集实例 ${qualityNumber(status.uncleanBoots || 0)}</p>` +
    `<p>${status.fullSince ? "全流量覆盖起点 " + ipTime(status.fullSince) : "尚未确认全流量覆盖"}</p>` +
    (status.instances || []).map(item => `<p>${escapeHtml(item.instance)} · 最后落盘 ${ipTime(item.last_flush)} · ${item.applied ? "规则已同步" : "规则未同步"}${item.store_error ? " · " + escapeHtml(item.store_error) : ""}${item.rule_error ? " · " + escapeHtml(item.rule_error) : ""}</p>`).join("") +
    (status.publishError ? `<p class="form-error">${escapeHtml(status.publishError)}</p>` : "") +
    ((status.externalIPs || []).length ? `<p>Nginx 入口封禁：${status.externalIPs.map(escapeHtml).join("、")}</p>` : "");
}

function scheduleRequestIPs() {
  clearTimeout(requestIPs.timer);
  if (state.currentView === "request-ips" && state.user?.role === "admin" && document.visibilityState === "visible") {
    requestIPs.timer = setTimeout(() => loadRequestIPs(true), 15000);
  }
}

async function loadRequestIPs(checkOnly = false) {
  if (state.currentView !== "request-ips" || state.user?.role !== "admin" || document.visibilityState !== "visible") return;
  clearTimeout(requestIPs.timer);
  requestIPs.controller?.abort();
  const controller = new AbortController(); requestIPs.controller = controller;
  const serial = ++requestIPs.serial, session = state.sessionSerial;
  const current = () => serial === requestIPs.serial && session === state.sessionSerial && state.currentView === "request-ips" && state.user?.role === "admin";
  const params = new URLSearchParams({ site: $("requestIPSite").value, state: $("requestIPState").value, search: $("requestIPSearch").value.trim(), period: $("requestIPPeriod").value, page: String(requestIPs.page) });
  if (requestIPs.params !== params.toString()) {
    requestIPs.params = params.toString(); requestIPs.data = null;
    $("requestIPRows").replaceChildren();
    $("requestIPEmpty").classList.add("hidden");
    $("requestIPPrev").disabled = true; $("requestIPNext").disabled = true;
  }
  try {
    if (checkOnly) {
      const result = await api(`api/request-ips/status?site=${params.get("site")}`, { signal: controller.signal });
      if (!current()) return;
      requestIPHealth(result.status);
      if (JSON.stringify(result.status.changeToken) === requestIPs.token) return;
    }
    const data = await api(`api/request-ips?${params}`, { signal: controller.signal });
    if (!current()) return;
    requestIPs.data = data; requestIPs.page = data.pagination.page;
    requestIPs.token = JSON.stringify(data.status.changeToken);
    $("requestIPError").textContent = "";
    requestIPHealth(data.status);
    $("requestIPStatus").textContent += ` · 观测计数起点 ${ipTime(data.countsSince)}`;
    $("requestIPOverview").innerHTML = [["用户 / 来源组合",data.summary.total],["新增待确认",data.summary.pending],["已封禁",data.summary.blocked]].map(([label,count]) => `<div>${label}<strong>${qualityNumber(count)}</strong></div>`).join("");
    const labels = { pending: "新增待确认", baseline: "历史基线", normal: "已确认正常", blocked: "已封禁" };
    $("requestIPRows").innerHTML = data.rows.map((row,index) => {
      const bans = [];
      const external = (data.status.externalIPs || []).includes(row.ip);
      if (external) bans.push("Nginx 入口封禁仍生效");
      if (row.user_expires != null) bans.push(`用户封禁 · ${row.user_expires ? ipTime(row.user_expires) + " 到期" : "永久"}`);
      if (row.site_expires != null) bans.push(`本站封禁 · ${row.site_expires ? ipTime(row.site_expires) + " 到期" : "永久"}`);
      const ready = data.status.enabled && data.status.applied;
      const keys = row.keys.map(key => key.name || `Key #${key.key_id}`).join("、") || "-";
      return `<tr><td><button type="button" class="quality-user" data-ip-row="${index}" data-ip-action="detail">${escapeHtml(row.email || `UID ${row.user_id}`)}</button><span class="ip-address">${escapeHtml(row.ip)}</span><small>UID ${row.user_id}</small></td>` +
        `<td>${ipTime(row.first_seen)}<small>${ipTime(row.last_seen)}</small></td><td>${qualityNumber(row.requests24h)} / ${qualityNumber(row.requests5m)}<small>已拦截 ${qualityNumber(row.denied24h)}</small></td>` +
        `<td>${escapeHtml(keys)}<small>近 7 天 ${qualityNumber(row.sharedUsers)} 个用户</small></td><td>${labels[row.state]}${bans.map(ban => `<small>${ban}</small>`).join("")}</td>` +
        `<td><div class="ip-actions"><button type="button" class="secondary compact" data-ip-row="${index}" data-ip-action="${row.state === "normal" ? "pending" : "normal"}">${row.state === "normal" ? "待确认" : "标记正常"}</button>` +
        `<button type="button" class="secondary compact" data-ip-row="${index}" data-ip-action="${row.state === "blocked" ? "unblock" : "block"}" ${ready ? "" : "disabled"}>${row.state === "blocked" ? "解除" : "封禁"}</button></div></td></tr>`;
    }).join("");
    $("requestIPEmpty").classList.toggle("hidden", data.rows.length > 0);
    $("requestIPPage").textContent = `第 ${data.pagination.page} / ${data.pagination.pages} 页 · 共 ${data.pagination.total} 条`;
    $("requestIPPrev").disabled = data.pagination.page <= 1;
    $("requestIPNext").disabled = data.pagination.page >= data.pagination.pages;
  } catch (error) {
    if (current() && error.name !== "AbortError") {
      $("requestIPError").textContent = error.message || "IP 记录读取失败";
      $("requestIPStatus").textContent = "更新失败，当前结果可能已过期";
    }
  } finally {
    if (current()) { requestIPs.controller = null; scheduleRequestIPs(); }
  }
}

async function requestIPAction(row, action, extra = {}) {
  const version = requestIPs.data?.status.version;
  return api("api/request-ips/actions", { method: "POST", body: { site: row.site, userId: row.user_id, ip: row.ip, action, version, operation: crypto.randomUUID(), ...extra } });
}

function requestIPImpact() {
  const row = requestIPs.selected;
  if (!row) return;
  const all = $("requestIPScope").value === "site";
  $("requestIPImpact").textContent = `${all ? `${siteLabel(row.site)}全部用户，近 7 天关联 ${row.sharedUsers} 个用户` : `${siteLabel(row.site)} · ${row.email || `UID ${row.user_id}`}`} · ${row.ip} · 后续新请求${requestIPs.action === "block" ? "将被拦截" : "解除本范围限制"}`;
  if ((requestIPs.data?.status.externalIPs || []).includes(row.ip)) $("requestIPImpact").textContent += " · Nginx 入口封禁仍生效";
}

async function openRequestIP(row, action) {
  if (requestIPs.busy) return;
  if (["normal","pending"].includes(action)) {
    requestIPs.busy = true;
    try { await requestIPAction(row,action); await loadRequestIPs(); }
    catch (error) { $("requestIPError").textContent = error.message; }
    finally { requestIPs.busy = false; }
    return;
  }
  requestIPs.selected = row; requestIPs.action = action;
  $("requestIPDialogTitle").textContent = { detail: "来源记录", block: "封禁来源 IP", unblock: "解除来源 IP 封禁" }[action];
  $("requestIPIdentity").textContent = `${siteLabel(row.site)} · ${row.email || `UID ${row.user_id}`} · ${row.ip}`;
  $("requestIPDialogError").textContent = "";
  $("requestIPHistory").replaceChildren();
  $("requestIPActionForm").classList.toggle("hidden", action === "detail");
  $("requestIPScope").value = action === "unblock" && row.site_expires != null ? "site" : "user";
  $("requestIPDurationWrap").classList.toggle("hidden", action !== "block");
  $("requestIPReasonWrap").classList.toggle("hidden", action !== "block");
  $("requestIPReason").required = action === "block";
  $("requestIPReason").value = ""; $("requestIPDuration").value = "0";
  $("requestIPConfirm").textContent = action === "unblock" ? "确认解除" : "确认封禁";
  requestIPImpact(); $("requestIPDialog").showModal(); $("requestIPClose").focus();
  const session = state.sessionSerial;
  try {
    const query = new URLSearchParams({ site: row.site, userId: row.user_id, ip: row.ip });
    const detail = await api(`api/request-ips/detail?${query}`);
    if (requestIPs.selected !== row || state.sessionSerial !== session) return;
    const actionNames = { block: "封禁", unblock: "解除", normal: "标记正常", pending: "待确认" };
    $("requestIPHistory").innerHTML = `<h4>关联用户</h4><p>${detail.users.map(user => escapeHtml(user.email || `UID ${user.user_id}`)).join("、") || "-"}</p><h4>操作记录</h4>` +
      (detail.audit.length ? detail.audit.map(item => `<p>${ipTime(item.created_at)} · ${actionNames[item.action]} · ${item.user_id ? "用户范围" : "本站范围"} · 管理员 #${item.actor}<small>${escapeHtml(JSON.parse(item.payload).reason || "")}</small></p>`).join("") : '<p class="muted">暂无操作</p>') +
      `<details><summary>近 7 天模型请求（按小时）</summary>${detail.hours.map(item => `<p>${ipTime(item.bucket)} · 请求 ${qualityNumber(item.observed)} · 拦截 ${qualityNumber(item.denied)} · 错误 ${qualityNumber(item.errors)}</p>`).join("") || '<p class="muted">暂无观测</p>'}</details>`;
  } catch (error) { if (requestIPs.selected === row) $("requestIPDialogError").textContent = error.message; }
}

function bindRequestIPs() {
  $("requestIPFilters").addEventListener("submit", event => { event.preventDefault(); requestIPs.page = 1; loadRequestIPs(); });
  for (const id of ["requestIPSite","requestIPState","requestIPPeriod"]) $(id).addEventListener("change", () => { requestIPs.page = 1; requestIPs.token = ""; loadRequestIPs(); });
  $("requestIPPrev").addEventListener("click", () => { requestIPs.page = Math.max(1,requestIPs.page-1); loadRequestIPs(); });
  $("requestIPNext").addEventListener("click", () => { requestIPs.page++; loadRequestIPs(); });
  $("requestIPRows").addEventListener("click", event => { const button = event.target.closest("[data-ip-row]"); const row = requestIPs.data?.rows[Number(button?.dataset.ipRow)]; if (button && row) openRequestIP(row,button.dataset.ipAction); });
  $("requestIPClose").addEventListener("click", () => $("requestIPDialog").close());
  $("requestIPDialog").addEventListener("close", () => { requestIPs.selected = null; });
  $("requestIPScope").addEventListener("change", requestIPImpact);
  $("requestIPActionForm").addEventListener("submit", async event => {
    event.preventDefault();
    if (requestIPs.busy || !requestIPs.selected) return;
    const row = requestIPs.selected, action = requestIPs.action, session = state.sessionSerial;
    requestIPs.busy = true; $("requestIPConfirm").disabled = true;
    try {
      await requestIPAction(row,action,{ scope: $("requestIPScope").value, duration: Number($("requestIPDuration").value), reason: $("requestIPReason").value.trim() });
      if (session !== state.sessionSerial) return;
      $("requestIPDialog").close();
      await loadRequestIPs();
      clearTimeout(requestIPs.timer);
      requestIPs.timer = setTimeout(() => loadRequestIPs(), 2000);
    } catch (error) { if (session === state.sessionSerial) $("requestIPDialogError").textContent = error.message; }
    finally { requestIPs.busy = false; $("requestIPConfirm").disabled = false; }
  });
  document.addEventListener("visibilitychange", () => {
    if (state.currentView !== "request-ips") return;
    if (document.visibilityState === "visible") loadRequestIPs(true);
    else { clearTimeout(requestIPs.timer); requestIPs.controller?.abort(); }
  });
}

function cancelErrorStats(reset = false) {
  errorStats.serial++;
  errorStats.historySerial++;
  errorStats.controller?.abort();
  errorStats.historyController?.abort();
  errorStats.controller = null;
  errorStats.historyController = null;
  if ($("errorStatsDialog").open) $("errorStatsDialog").close();
  if (reset) {
    errorStats.filters = null;
    errorStats.owner = null;
    errorStats.page = 1;
    errorStats.data = null;
    $("errorStatsFilters").reset();
    $("errorStatsOwner").innerHTML = '<option value="">全部用户</option>';
    $("errorStatsTitle").textContent = "用户汇总";
    $("errorStatsDialogTitle").textContent = "账号记录";
    $("errorStatsBack").classList.add("hidden");
    $("errorStatsStateWrap").classList.add("hidden");
    ["errorStatsRows", "errorStatsOverview", "errorStatsHistory", "errorStatsFreshness", "errorStatsMessage", "errorStatsPage"].forEach(id => { $(id).textContent = ""; });
  }
}

function errorStatsReadFilters() {
  const params = {};
  for (const key of ["From", "To", "Site", "Owner", "Tag", "Source", "Search"]) {
    params[key.toLowerCase()] = $("errorStats" + key).value.trim();
  }
  if (state.user?.role !== "admin") params.owner = "";
  return params;
}

function errorStatsQuery(extra = {}) {
  return new URLSearchParams({ ...errorStats.filters, ...(errorStats.owner ? { owner: errorStats.owner.id, state: $("errorStatsState").value } : {}), page: errorStats.page, ...extra });
}

async function loadErrorStats(quiet = false) {
  if (!state.user || state.currentView !== "account-errors") return;
  if (!errorStats.filters) {
    const end = todayText();
    const start = new Date(end + "T00:00:00Z");
    start.setUTCDate(start.getUTCDate() - 6);
    $("errorStatsFrom").value = start.toISOString().slice(0, 10);
    $("errorStatsTo").value = end;
    errorStats.filters = errorStatsReadFilters();
  }
  const selectedOwner = $("errorStatsOwner").value;
  const users = new Map([...$("errorStatsOwner").options].filter(o => o.value).map(o => [Number(o.value), o.textContent]));
  for (const user of state.users) users.set(Number(user.id), user.username);
  if (state.user.role === "admin") {
    $("errorStatsOwner").innerHTML = '<option value="">全部用户</option>' + [...users].map(([id, name]) => `<option value="${id}">${escapeHtml(name)}</option>`).join("");
    $("errorStatsOwner").value = selectedOwner;
  }
  errorStats.controller?.abort();
  const controller = new AbortController();
  errorStats.controller = controller;
  const serial = ++errorStats.serial, session = state.sessionSerial;
  const current = () => serial === errorStats.serial && session === state.sessionSerial && state.currentView === "account-errors";
  $("errorStatsMessage").textContent = "";
  $("errorStatsExport").disabled = true;
  if (!quiet) $("errorStatsFreshness").textContent = "正在读取…";
  try {
    const data = await api(`api/account-errors${errorStats.owner ? "/accounts" : ""}?${errorStatsQuery()}`, { signal: controller.signal });
    if (!current()) return;
    errorStats.data = data;
    errorStats.page = data.pagination.page;
    for (const user of data.users) {
      if (state.user.role === "admin" && ![...$("errorStatsOwner").options].some(o => o.value === String(user.id))) {
        $("errorStatsOwner").add(new Option(user.username, String(user.id)));
      }
    }
    renderErrorStats(data);
  } catch (error) {
    if (!current() || error.name === "AbortError" || error.staleSession) return;
    $("errorStatsMessage").textContent = error.message;
    $("errorStatsFreshness").textContent = "更新失败";
    $("errorStatsRows").textContent = "";
    $("errorStatsOverview").textContent = "";
    $("errorStatsPage").textContent = "";
    $("errorStatsEmpty").classList.add("hidden");
    $("errorStatsExport").disabled = true;
    $("errorStatsPrev").disabled = true;
    $("errorStatsNext").disabled = true;
    errorStats.data = null;
  } finally {
    if (current()) errorStats.controller = null;
  }
}

function errorStatsStatus(row) {
  if (row.in_error) return row.state === "archived_error" ? "未恢复 · 已删除" : "未恢复错误";
  if (row.state === "archived") return row.recovery_count ? "已恢复 · 已删除" : "已删除";
  if (row.recovery_count && row.state === "normal") return "已恢复";
  return row.state === "normal" ? "正常" : "状态不明";
}

function errorStatsSource(source) {
  return ({ migration: "迁移接入", bootstrap: "历史导入", panel: "新上号", browser_auth: "新上号" })[source] || "未记录";
}

function renderErrorStats(data) {
  const detail = !!errorStats.owner, o = data.overview;
  const percent = value => value == null ? "-" : `${(value * 100).toFixed(1)}%`;
  $("errorStatsOverview").innerHTML = [["上号成功", formatNumber(o.total)], ["未恢复错误", formatNumber(o.errors)], ["错误占比", percent(o.errorRate)], ["已恢复", formatNumber(o.recovered)]].map(([label, value], i) => `<div class="${i === 1 ? "error-stats-bad" : ""}"><span>${label}</span><strong>${value}</strong></div>`).join("");
  $("errorStatsFreshness").textContent = `${data.stale ? "数据更新延迟 · " : ""}最近更新 ${data.sampledAt ? formatFullDateTime(data.sampledAt) : "尚未完成"}${o.unknown ? ` · 状态不明 ${formatNumber(o.unknown)}` : ""}`;
  $("errorStatsFreshness").classList.toggle("error-stats-warning", data.stale);
  $("errorStatsTitle").textContent = detail ? `${errorStats.owner.username} · 账号明细` : "用户汇总";
  $("errorStatsBack").classList.toggle("hidden", !detail);
  $("errorStatsStateWrap").classList.toggle("hidden", !detail);
  const headings = detail ? ["账号 / 站点", "订阅 / 来源", "上号时间", "状态", "最近错误 / 原因", "恢复时间", ""] : ["上号归属", "上号成功", "未恢复错误", "错误占比", "已恢复", "最近错误"];
  $("errorStatsHead").innerHTML = `<tr>${headings.map(h => `<th>${h}</th>`).join("")}</tr>`;
  $("errorStatsRows").innerHTML = data.rows.map(row => detail ? `<tr>
    <td><strong>${escapeHtml(row.name)}</strong><small>${escapeHtml(siteLabel(row.site))} · #${row.local_id}</small></td>
    <td>${escapeHtml(row.billing_tag || "未记录")}<small>${errorStatsSource(row.source)}</small></td>
    <td>${escapeHtml(formatFullDateTime(row.uploaded_at))}</td>
    <td class="${row.in_error ? "error-stats-bad" : ""}">${errorStatsStatus(row)}</td>
    <td>${escapeHtml(formatFullDateTime(row.last_error_at))}<small class="error-stats-reason">${escapeHtml(row.reason)}</small></td>
    <td>${escapeHtml(formatFullDateTime(row.recovered_at))}</td>
    <td><button class="secondary compact" type="button" data-error-history="${row.account_id}">记录</button></td></tr>` : `<tr>
    <td><button class="error-stats-link" type="button" data-error-owner="${row.userId}" data-error-state="">${escapeHtml(row.username)}</button>${row.unknown ? `<small>状态不明 ${formatNumber(row.unknown)}</small>` : ""}</td>
    <td>${formatNumber(row.total)}</td>
    <td><button class="error-stats-link error-stats-bad" type="button" data-error-owner="${row.userId}" data-error-state="error">${formatNumber(row.errors)}</button></td>
    <td>${percent(row.errorRate)}</td><td>${formatNumber(row.recovered)}</td><td>${escapeHtml(formatFullDateTime(row.lastErrorAt))}</td></tr>`).join("");
  $("errorStatsEmpty").classList.toggle("hidden", data.rows.length > 0);
  const p = data.pagination;
  $("errorStatsPage").textContent = `共 ${formatNumber(p.total)} 条 · 第 ${p.page} / ${Math.max(1, Math.ceil(p.total / p.pageSize))} 页`;
  $("errorStatsPrev").disabled = p.page <= 1;
  $("errorStatsNext").disabled = !p.hasMore;
  $("errorStatsExport").disabled = !p.total;
}

async function openErrorStatsHistory(id) {
  errorStats.historyController?.abort();
  const controller = new AbortController();
  errorStats.historyController = controller;
  const serial = ++errorStats.historySerial, session = state.sessionSerial;
  $("errorStatsDialogTitle").textContent = "账号记录";
  $("errorStatsHistory").textContent = "正在读取…";
  $("errorStatsDialog").showModal();
  try {
    const data = await api(`api/account-errors/history?${errorStatsQuery({ account: id })}`, { signal: controller.signal });
    if (serial !== errorStats.historySerial || session !== state.sessionSerial || !$("errorStatsDialog").open) return;
    $("errorStatsDialogTitle").textContent = data.account.name;
    $("errorStatsHistory").innerHTML = `<p class="muted">${escapeHtml(data.account.username)} · ${escapeHtml(siteLabel(data.account.site))} #${data.account.local_id}</p>` + data.events.map(event => `<article class="error-stats-event"><div><strong>${({ uploaded: "上号成功", error: "出现错误", recovered: "已恢复", archived: "已删除" })[event.kind] || escapeHtml(event.kind)}</strong><time>${escapeHtml(formatFullDateTime(event.occurred_at))}</time></div>${event.evidence.startsWith("historical") ? '<small class="muted">历史错误记录</small>' : ""}${event.reason ? `<pre>${escapeHtml(event.reason)}</pre>` : ""}</article>`).join("");
  } catch (error) {
    if (serial === errorStats.historySerial && session === state.sessionSerial && error.name !== "AbortError") $("errorStatsHistory").textContent = error.message;
  }
}

function errorStatsCSV(rows) {
  return "\uFEFF" + rows.map(row => row.map(value => {
    let text = String(value ?? "");
    if (/^[\s]*[=+\-@]/.test(text)) text = "'" + text;
    return '"' + text.replaceAll('"', '""') + '"';
  }).join(",")).join("\r\n");
}

async function exportErrorStats() {
  const serial = errorStats.serial, session = state.sessionSerial, detail = !!errorStats.owner;
  const data = await api(`api/account-errors${detail ? "/accounts" : ""}?${errorStatsQuery({ export: 1 })}`);
  if (serial !== errorStats.serial || session !== state.sessionSerial || state.currentView !== "account-errors") return;
  const rows = detail ? [["账号", "站点", "sub2api账号ID", "上号归属", "订阅", "来源", "上号时间", "状态", "首次错误", "最近错误", "错误原因", "最近恢复", "恢复次数"], ...data.rows.map(r => [r.name, siteLabel(r.site), r.local_id, r.username, r.billing_tag, errorStatsSource(r.source), formatFullDateTime(r.uploaded_at), errorStatsStatus(r), formatFullDateTime(r.first_error_at), formatFullDateTime(r.last_error_at), r.reason, formatFullDateTime(r.recovered_at), r.recovery_count])] : [["上号归属", "上号成功", "未恢复错误", "错误占比", "已恢复", "状态不明", "最近错误"], ...data.rows.map(r => [r.username, r.total, r.errors, r.errorRate == null ? "" : (100 * r.errorRate).toFixed(2) + "%", r.recovered, r.unknown, formatFullDateTime(r.lastErrorAt)])];
  const url = URL.createObjectURL(new Blob([errorStatsCSV(rows)], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url; link.download = `上号错误${detail ? "明细" : "汇总"}-${errorStats.filters.from}-${errorStats.filters.to}.csv`;
  document.body.appendChild(link); link.click(); link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function bindErrorStats() {
  $("errorStatsFilters").addEventListener("submit", event => {
    event.preventDefault(); errorStats.filters = errorStatsReadFilters(); errorStats.page = 1; errorStats.owner = null; loadErrorStats();
  });
  $("errorStatsRows").addEventListener("click", event => {
    const owner = event.target.closest("[data-error-owner]");
    if (owner) {
      const row = errorStats.data?.rows.find(r => r.userId === Number(owner.dataset.errorOwner));
      if (!row) return;
      errorStats.owner = { id: row.userId, username: row.username }; errorStats.page = 1;
      $("errorStatsState").value = owner.dataset.errorState; loadErrorStats();
    }
    const history = event.target.closest("[data-error-history]");
    if (history) openErrorStatsHistory(history.dataset.errorHistory);
  });
  $("errorStatsBack").addEventListener("click", () => { errorStats.owner = null; errorStats.page = 1; loadErrorStats(); });
  $("errorStatsState").addEventListener("change", () => { errorStats.page = 1; loadErrorStats(); });
  $("errorStatsPrev").addEventListener("click", () => { errorStats.page = Math.max(1, errorStats.page - 1); loadErrorStats(); });
  $("errorStatsNext").addEventListener("click", () => { errorStats.page++; loadErrorStats(); });
  $("errorStatsClose").addEventListener("click", () => $("errorStatsDialog").close());
  $("errorStatsDialog").addEventListener("close", () => { errorStats.historySerial++; errorStats.historyController?.abort(); $("errorStatsHistory").textContent = ""; });
  $("errorStatsExport").addEventListener("click", event => runButtonTask(event.currentTarget, "正在导出…", exportErrorStats));
}

function weeklyRoleKey() {
  return state.user ? `${state.user.id}:${state.user.role}:${state.user.siteId}:${Boolean(state.user.usageCostVisible)}` : "";
}

function weeklyActive() {
  return Boolean(state.user && state.currentView === "accounts" && weekly.tab === "weekly");
}

function weeklyVisible() {
  return weeklyActive() && document.visibilityState === "visible";
}

function cancelWeeklyDetail() {
  weekly.detailSerial++;
  weekly.detailController?.abort();
  weekly.detailController = null;
  if (weekly.detailOpen) {
    weekly.detailOpen = false;
    closeAccountDialog();
    state.detailAccount = null;
  }
}

function cancelWeekly() {
  weekly.serial++;
  clearTimeout(weekly.timer);
  clearTimeout(weekly.searchTimer);
  weekly.timer = weekly.searchTimer = null;
  weekly.controller?.abort();
  weekly.exportController?.abort();
  weekly.controller = weekly.exportController = null;
  cancelWeeklyDetail();
  $("weeklyResults").setAttribute("aria-busy", "false");
  $("weeklyExport").removeAttribute("aria-busy");
  $("weeklyExportStatus").textContent = "";
}

function weeklySetPreset() {
  const preset = $("weeklyPreset").value;
  if (preset === "custom") return;
  const minute = Math.floor(Date.now() / 60000) * 60000;
  const localMinute = (value) => new Date(value + 8 * 3600000).toISOString().slice(0, 16);
  if (preset === "next7") {
    $("weeklyFrom").value = localMinute(minute);
    $("weeklyTo").value = localMinute(minute + 7 * 86400000);
    return;
  }
  const today = localMinute(minute).slice(0, 10);
  const offset = preset === "yesterday" ? -1 : preset === "tomorrow" ? 1 : 0;
  const day = (n) => new Date(Date.parse(`${today}T00:00:00Z`) + n * 86400000).toISOString().slice(0, 10);
  $("weeklyFrom").value = preset === "today" ? localMinute(minute) : `${day(offset)}T00:00`;
  $("weeklyTo").value = `${day(offset + 1)}T00:00`;
}

function resetWeekly() {
  cancelWeekly();
  Object.assign(weekly, { tab: "accounts", mode: "days", state: "all", day: "", page: 1, data: null, key: "", roleKey: "" });
  $("weeklyFilters").reset();
  $("weeklyOwner").innerHTML = '<option value="">全部用户</option><option value="unassigned">未分配</option>';
  weeklySetPreset();
  renderWeekly();
  renderHomeTabs();
}

function syncWeeklyRole() {
  const key = weeklyRoleKey();
  if (weekly.roleKey === key) return;
  const changed = Boolean(weekly.roleKey);
  cancelWeekly();
  weekly.roleKey = key;
  weekly.data = null;
  weekly.key = "";
  weekly.page = 1;
  weekly.day = "";
  weekly.state = "all";
  if (changed) {
    $("weeklyFilters").reset();
    $("ownerFilter").value = "";
    $("siteFilter").value = "";
    weeklySetPreset();
  }
  weeklyOwnerOptions([]);
  $("weeklyOwnerWrap").classList.toggle("hidden", state.user?.role !== "admin");
  renderWeekly();
  if (weeklyVisible()) void loadWeekly();
}

function weeklyOwnerOptions(users) {
  const select = $("weeklyOwner");
  const selected = state.user?.role === "admin" ? select.value : "";
  const options = new Map(users.map((user) => [String(user.id), user.username]));
  if (state.user?.role === "admin" && !users.length) {
    state.users.forEach((user) => options.set(String(user.id), user.username));
  }
  if (selected && selected !== "unassigned" && !options.has(selected)) options.set(selected, `用户 #${selected}`);
  select.innerHTML = '<option value="">全部用户</option><option value="unassigned">未分配</option>'
    + [...options].map(([id, username]) => `<option value="${escapeHtml(id)}">${escapeHtml(username)}</option>`).join("");
  select.value = selected;
}

function renderHomeTabs() {
  const active = state.currentView === "accounts" && weekly.tab === "weekly";
  $("homeTabs").classList.toggle("hidden", state.currentView !== "accounts");
  $("accountListPanel").classList.toggle("hidden", active);
  $("weeklyPanel").classList.toggle("hidden", !active);
  document.querySelectorAll("[data-home-tab]").forEach((button) => {
    const selected = button.dataset.homeTab === weekly.tab;
    button.setAttribute("aria-selected", String(selected));
    button.tabIndex = selected ? 0 : -1;
  });
}

async function switchHomeTab(tab) {
  if (!state.user || state.currentView !== "accounts" || weekly.tab === tab) return;
  cancelWeekly();
  weekly.tab = tab;
  if (tab === "weekly") {
    state.accountAbortController?.abort();
    state.accountAbortController = null;
    state.accountRequestSerial++;
    state.accountWindowController?.abort();
    weeklyOwnerOptions(weekly.data?.users || []);
    if (state.user.role === "admin") {
      if ($("weeklySite").value !== $("siteFilter").value || $("weeklyOwner").value !== $("ownerFilter").value) {
        weekly.day = "";
        weekly.state = "all";
        weekly.page = 1;
        weekly.data = null;
        weekly.key = "";
      }
      $("weeklySite").value = $("siteFilter").value;
      const owner = $("ownerFilter").value;
      if (![...$("weeklyOwner").options].some((option) => option.value === owner)) {
        $("weeklyOwner").add(new Option(`用户 #${owner}`, owner));
      }
      $("weeklyOwner").value = owner;
    }
  }
  renderHomeTabs();
  syncRealtimeMetricsRefresh();
  if (tab === "weekly") await loadWeekly();
  else await Promise.all([loadAccounts(), loadDeleteJobs(), loadLivenessJobs()]);
}

function weeklyQuery(exporting = false) {
  weeklySetPreset();
  const kinds = weeklySelectedKinds();
  if (!kinds.length) throw new Error("请至少选择一种限额类型。");
  const from = $("weeklyFrom").value;
  const to = $("weeklyTo").value;
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(to)
      || !$("weeklyFrom").validity.valid || !$("weeklyTo").validity.valid || from >= to) {
    throw new Error("请选择有效的北京时间范围，结束时间须晚于开始时间。");
  }
  if (Date.parse(`${to}+08:00`) - Date.parse(`${from}+08:00`) > 90 * 86400000) {
    throw new Error("查询范围不能超过 90 天，请缩小时间范围。");
  }
  return new URLSearchParams({
    from: `${from}:00+08:00`, to: `${to}:00+08:00`, kinds: kinds.join(","),
    match: document.querySelector('input[name="weeklyMatch"]:checked')?.value || "any",
    site: $("weeklySite").value, owner: state.user?.role === "admin" ? $("weeklyOwner").value : "",
    tag: $("weeklyTag").value, includeErrors: $("weeklyIncludeErrors").checked ? "1" : "0",
    limitedOnly: $("weeklyLimitedOnly").checked ? "1" : "0", search: $("weeklySearch").value.trim(),
    state: weekly.state, day: weekly.day, page: String(exporting ? 1 : weekly.page), export: exporting ? "1" : "0",
  });
}

function weeklySchedule() {
  clearTimeout(weekly.timer);
  weekly.timer = weeklyVisible() ? setTimeout(() => loadWeekly(true), 30000) : null;
}

async function loadWeekly(quiet = false) {
  if (!weeklyVisible()) return;
  clearTimeout(weekly.timer);
  weekly.controller?.abort();
  const serial = ++weekly.serial;
  const controller = new AbortController();
  weekly.controller = controller;
  const role = weeklyRoleKey();
  const current = () => serial === weekly.serial && role === weeklyRoleKey() && weeklyVisible();
  try {
    const query = weeklyQuery();
    const key = query.toString();
    if (key !== weekly.key) {
      weekly.data = null;
      weekly.key = key;
      renderWeekly();
    }
    $("weeklyResults").setAttribute("aria-busy", "true");
    $("weeklyStatus").classList.remove("weekly-warning");
    $("weeklyStatus").textContent = quiet && weekly.data ? "正在更新" : "正在读取限额刷新记录";
    const data = await api(`api/weekly-resets?${query}`, { signal: controller.signal });
    if (!current()) return;
    weekly.data = data;
    weekly.page = data.pagination.page;
    weeklyOwnerOptions(data.users || []);
    renderWeekly();
    const delayed = data.coverage.stale || data.coverage.sites.some((site) => site.error);
    $("weeklyStatus").textContent = delayed ? "采样延迟或站点异常；当前结果可能不完整" : `已更新 · ${formatFullDateTime(new Date())} 北京时间`;
    $("weeklyStatus").classList.toggle("weekly-warning", Boolean(delayed));
  } catch (error) {
    if (!current() || error.name === "AbortError" || error.staleSession) return;
    const requestId = error.requestId ? `（请求 ID：${error.requestId}）` : "";
    $("weeklyStatus").textContent = `${weekly.data ? "更新失败，保留上次结果。" : "查询失败。"}${error.message}${requestId}`;
    $("weeklyStatus").classList.add("weekly-warning");
    if (!weekly.data) $("weeklyEmpty").textContent = "暂无可显示结果，请检查筛选条件后重试。";
  } finally {
    if (current()) {
      weekly.controller = null;
      $("weeklyResults").setAttribute("aria-busy", "false");
      renderWeeklyPagination();
      weeklySchedule();
    }
  }
}

function weeklyTime(value) {
  return value ? formatFullDateTime(value) : "-";
}

function renderWeeklyPagination() {
  const pagination = weekly.data?.pagination;
  const days = weekly.mode === "days";
  const busy = Boolean(weekly.controller);
  $("weeklyPaginationText").textContent = days
    ? `${formatNumber(weekly.data?.days.length)} 天 · 全部状态汇总`
    : pagination ? `${formatNumber(pagination.total)} 次刷新 · 第 ${pagination.page} / ${Math.max(1, Math.ceil(pagination.total / pagination.pageSize))} 页` : "-";
  $("weeklyPrev").disabled = days || busy || !pagination || pagination.page <= 1;
  $("weeklyNext").disabled = days || busy || !pagination?.hasMore;
  $("weeklyExport").disabled = !weekly.data || Boolean(weekly.exportController) || busy;
}

function weeklySelectedKinds() {
  return [...document.querySelectorAll('input[name="weeklyKind"]:checked')].map((input) => input.value);
}

function renderWeekly() {
  const selectedKinds = weeklySelectedKinds();
  document.querySelectorAll('input[name="weeklyKind"]').forEach((input) => {
    input.disabled = input.checked && selectedKinds.length === 1;
  });
  const data = weekly.data;
  const overview = data?.overview;
  [["Accounts", "accounts"], ["Upcoming", "upcoming"], ["Confirmed", "confirmed"], ["Pending", "pending"]].forEach(([id, field]) => {
    $("weekly" + id).textContent = overview ? formatNumber(overview[field]) : "-";
  });
  $("weeklyEvents").textContent = `${overview ? formatNumber(overview.events) : "-"} 次刷新`;
  $("weeklyTypeCounts").innerHTML = (data?.types || selectedKinds.map((kind) => ({ kind }))).map((item) => `<span><strong>${escapeHtml(weeklyKindLabels[item.kind] || item.kind)}</strong> · ${item.accounts == null ? "-" : formatNumber(item.accounts)} 个账号 · ${item.events == null ? "-" : formatNumber(item.events)} 次刷新</span>`).join("");
  document.querySelectorAll("[data-weekly-state]").forEach((button) => button.setAttribute("aria-pressed", String(button.dataset.weeklyState === weekly.state)));
  document.querySelectorAll("[data-weekly-mode]").forEach((button) => button.setAttribute("aria-pressed", String(button.dataset.weeklyMode === weekly.mode)));
  const coverage = data?.coverage;
  const coverageRange = coverage?.since && coverage?.through && Date.parse(coverage.through) >= Date.parse(coverage.since)
    ? `${weeklyTime(coverage.since)} 至 ${weeklyTime(coverage.through)}（北京）`
    : coverage ? "首次采样同步中" : "-";
  $("weeklyCoverage").textContent = coverage
    ? `未知刷新时间账号：${formatNumber(coverage.unknownAccounts)} · 观测覆盖：${coverageRange}`
    : "未知刷新时间账号：- · 观测覆盖：-";
  $("weeklyHistory").textContent = coverage?.partialHistory
    ? "所选范围历史不完整；仅覆盖上线后观测，上线前刷新无法补全。"
    : "仅覆盖上线后观测；上线前历史不完整。";
  $("weeklyHistory").classList.toggle("weekly-warning", Boolean(coverage?.partialHistory));
  $("weeklyKindCoverage").innerHTML = (coverage?.types || selectedKinds.map((kind) => ({ kind }))).map((item) => `<li><strong>${escapeHtml(weeklyKindLabels[item.kind] || item.kind)}</strong> · ${item.since && item.through && Date.parse(item.through) >= Date.parse(item.since) ? `${escapeHtml(weeklyTime(item.since))} 至 ${escapeHtml(weeklyTime(item.through))}` : "首次采样同步中"} · 时间未知 ${item.unknownAccounts == null ? "-" : formatNumber(item.unknownAccounts)}${item.partialHistory ? ' · 历史不完整' : ''}</li>`).join("");
  $("weeklySites").innerHTML = coverage ? coverage.sites.map((site) => `<li>${escapeHtml(siteLabel(site.site))} · ${escapeHtml(weeklyTime(site.sampledAt))}${site.error ? ` <span class="weekly-warning">${escapeHtml(site.error)}</span>` : ""}</li>`).join("") || "<li>暂无站点采样</li>" : "<li>等待采样信息</li>";
  const days = weekly.mode === "days";
  $("weeklyDaysWrap").classList.toggle("hidden", !days);
  $("weeklyRowsWrap").classList.toggle("hidden", days);
  $("weeklyBack").disabled = days;
  $("weeklyResultTitle").textContent = days ? "每日刷新" : `${weekly.day || "全部日期"} · ${weeklyStateLabels[weekly.state]}`;
  $("weeklyDays").innerHTML = (data?.days || []).map((day) => `<tr>
    <td><button type="button" class="weekly-link" data-weekly-day="${escapeHtml(day.date)}" aria-label="查看 ${escapeHtml(day.date)} 刷新记录">${escapeHtml(day.date)}</button></td>
    ${["accounts", "events"].map((field) => `<td>${formatNumber(day[field])}</td>`).join("")}
    <td>${(day.types || []).map((item) => `<small>${escapeHtml(weeklyKindLabels[item.kind] || item.kind)} ${formatNumber(item.events)}</small>`).join("")}</td>
    ${["upcoming", "confirmed", "pending"].map((field) => `<td>${formatNumber(day[field])}</td>`).join("")}</tr>`).join("");
  $("weeklyRows").innerHTML = (data?.rows || []).map((row, index) => `<tr>
    <td data-label="账号 / 归属">${row.canOpen === true ? `<button type="button" class="weekly-link" data-weekly-open="${index}" title="打开账号详情">${escapeHtml(row.name || `#${row.accountId}`)}</button>` : `<strong>${escapeHtml(row.name || `#${row.accountId}`)}</strong>`}<small>${escapeHtml(row.username || "未分配")} · #${escapeHtml(row.accountId)}</small>${!row.canOpen ? '<small>当前账号不可打开</small>' : ""}</td>
    <td data-label="站点 / 类型">${escapeHtml(siteLabel(row.site))} · #${escapeHtml(row.localId)}<small>${escapeHtml(row.billingTag || "未知")} · ${escapeHtml(weeklyKindLabels[row.kind] || row.kind)}</small></td>
    <td data-label="刷新时间（北京）">${escapeHtml(weeklyTime(row.resetAt))}</td>
    <td data-label="刷新状态"><span class="weekly-state weekly-${escapeHtml(row.state)}">${escapeHtml(weeklyStateLabels[row.state] || row.state)}</span><small>${escapeHtml(({ active: "正常", error: "错误" })[row.accountStatus] || row.accountStatus || "未知状态")}${row.deletedAt ? " · 已删除" : ""}</small></td>
    <td data-label="用量 / 调度">${row.utilization == null ? "-" : `${escapeHtml(formatAmount(row.utilization, 1))}%`}<small>${row.schedulable == null ? "调度未知" : row.schedulable ? "调度开启" : "调度暂停"}</small></td>
    <td data-label="观测时间（北京）">${escapeHtml(weeklyTime(row.sampledAt))}<small>确认：${escapeHtml(weeklyTime(row.confirmedAt))}</small>${row.deletedAt ? `<small>删除：${escapeHtml(weeklyTime(row.deletedAt))}</small>` : ""}</td>
  </tr>`).join("");
  const empty = !data || !(days ? data.days : data.rows).length;
  $("weeklyEmpty").classList.toggle("hidden", !empty);
  $("weeklyEmpty").textContent = data ? "没有符合条件的刷新记录；未知刷新时间账号见观测覆盖。" : "正在读取限额刷新记录";
  renderWeeklyPagination();
}

function weeklyFiltersChanged() {
  cancelWeekly();
  weekly.page = 1;
  weekly.day = "";
  weekly.data = null;
  weekly.key = "";
  if (state.user?.role === "admin") {
    $("siteFilter").value = $("weeklySite").value;
    const owner = $("weeklyOwner").value;
    if (![...$("ownerFilter").options].some((option) => option.value === owner)) {
      $("ownerFilter").add(new Option($("weeklyOwner").selectedOptions[0].textContent, owner));
    }
    $("ownerFilter").value = owner;
  }
  renderWeekly();
  void loadWeekly();
}

async function openWeeklyAccount(index) {
  const row = weekly.data?.rows[index];
  if (!weeklyVisible() || row?.canOpen !== true) return;
  cancelWeeklyDetail();
  const serial = weekly.detailSerial;
  const role = weeklyRoleKey();
  const controller = new AbortController();
  weekly.detailController = controller;
  const current = () => weeklyVisible() && serial === weekly.detailSerial && role === weeklyRoleKey();
  $("weeklyStatus").textContent = "正在读取账号详情";
  try {
    // The existing account API has substring search, so verify the global ID on every page.
    const query = new URLSearchParams({ q: String(row.accountId), site: row.site, view: "all", category: "all", sort: "added_desc", page_size: "200", from: todayText(), to: todayText() });
    let account = null;
    for (let page = 1; page <= 5 && current(); page++) {
      query.set("page", String(page));
      const result = await api(`api/accounts?${query}`, { signal: controller.signal });
      if (!current()) return;
      account = result.items.find((item) => String(item.id) === String(row.accountId) && item.siteId === row.site && !item.deletedAt);
      const pagination = result.pagination || {};
      const pages = Number(pagination.pages) || Math.ceil(Number(pagination.total || 0) / Number(pagination.pageSize || 200));
      if (account || !result.items.length || pagination.hasMore === false || (pages ? page >= pages : pagination.hasMore !== true)) break;
      if (page === 5) throw new Error("账号 ID 搜索匹配过多，无法定位详情，请在账号列表缩小范围。");
    }
    if (!current()) return;
    if (!account) throw new Error("账号已删除或归属已变化，请刷新记录。");
    weekly.detailOpen = true;
    await openAccountDetail(account.id, account, { signal: controller.signal });
    if (current()) $("weeklyStatus").textContent = "账号详情已读取";
  } catch (error) {
    if (current() && error.name !== "AbortError" && !error.staleSession) {
      $("weeklyStatus").textContent = error.message;
      $("weeklyStatus").classList.add("weekly-warning");
    }
  } finally {
    if (weekly.detailController === controller) weekly.detailController = null;
  }
}

function weeklyCSVCell(value) {
  let text = String(value ?? "");
  if (/^[\s\u0000-\u001f]*[=+@-]|^[\t\r\n]/.test(text)) text = "'" + text;
  return `"${text.replaceAll('"', '""')}"`;
}

async function exportWeekly() {
  if (!weeklyVisible() || !weekly.data || weekly.exportController) return;
  const controller = new AbortController();
  weekly.exportController = controller;
  const role = weeklyRoleKey();
  const current = () => weekly.exportController === controller && role === weeklyRoleKey() && weeklyVisible();
  $("weeklyExport").disabled = true;
  $("weeklyExport").setAttribute("aria-busy", "true");
  $("weeklyExportStatus").textContent = "正在导出全部匹配记录";
  try {
    const query = weeklyQuery(true);
    const rows = [];
    const ids = new Set();
    for (let page = 1; current(); page++) {
      query.set("page", String(page));
      const data = await api(`api/weekly-resets?${query}`, { signal: controller.signal });
      if (!current()) return;
      if (data.pagination.total > 20000 || rows.length + data.rows.length > 20000) throw new Error("匹配记录超过 20,000 条，请缩小范围后导出；未生成截断文件。");
      for (const row of data.rows) {
        if (ids.has(row.eventId)) throw new Error("导出期间记录发生变化，请重试。");
        ids.add(row.eventId);
        rows.push(row);
      }
      if (!data.pagination.hasMore) {
        if (rows.length !== data.pagination.total) throw new Error("导出结果不完整，请刷新后重试。");
        break;
      }
      if (!data.rows.length) throw new Error("导出结果不完整，请重试。");
    }
    if (!current()) return;
    const fields = ["eventId", "accountId", "localId", "site", "username", "name", "billingTag", "kind", "utilization", "resetAt", "state", "accountStatus", "schedulable", "sampledAt", "confirmedAt", "deletedAt", "canOpen"];
    const headers = ["事件 ID", "Team ID", "站点账号 ID", "站点", "归属用户", "邮箱 / 账号", "订阅类型", "限额类型", "用量百分比", "刷新时间（北京）", "刷新状态", "账号状态", "调度开关", "采样时间（北京）", "确认时间（北京）", "删除时间（北京）", "可打开"];
    const csv = [headers, ...rows.map((row) => fields.map((field) => field.endsWith("At") ? (row[field] ? `${toShanghaiDateTimeInput(row[field])}+08:00` : "") : field === "kind" ? (weeklyKindLabels[row.kind] || row.kind) : field === "schedulable" ? (row[field] == null ? "调度未知" : row[field] ? "调度开启" : "调度暂停") : row[field]))]
      .map((values) => values.map(weeklyCSVCell).join(",")).join("\r\n");
    const url = URL.createObjectURL(new Blob(["\uFEFF", csv], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `quota_resets_${query.get("from").slice(0, 10)}_${query.get("kinds").replaceAll(",", "-")}_${query.get("match")}.csv`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    $("weeklyExportStatus").textContent = `已导出 ${formatNumber(rows.length)} 条匹配记录`;
  } catch (error) {
    if (current() && error.name !== "AbortError" && !error.staleSession) $("weeklyExportStatus").textContent = error.message;
  } finally {
    if (weekly.exportController === controller) {
      weekly.exportController = null;
      $("weeklyExport").removeAttribute("aria-busy");
      renderWeeklyPagination();
    }
  }
}

function bindWeekly() {
  weeklySetPreset();
  $("homeTabs").addEventListener("click", (event) => {
    const button = event.target.closest("[data-home-tab]");
    if (button) void switchHomeTab(button.dataset.homeTab);
  });
  $("homeTabs").addEventListener("keydown", (event) => {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    const tab = event.key === "Home" ? "accounts" : event.key === "End" ? "weekly" : weekly.tab === "accounts" ? "weekly" : "accounts";
    document.querySelector(`[data-home-tab="${tab}"]`).focus();
    void switchHomeTab(tab);
  });
  $("weeklyFilters").addEventListener("submit", (event) => { event.preventDefault(); weeklyFiltersChanged(); });
  $("weeklyFilters").addEventListener("change", (event) => {
    if (event.target.id === "weeklySearch") return;
    if (["weeklyFrom", "weeklyTo"].includes(event.target.id)) $("weeklyPreset").value = "custom";
    weeklyFiltersChanged();
  });
  $("weeklySearch").addEventListener("input", () => {
    cancelWeekly();
    weekly.data = null;
    renderWeekly();
    weekly.searchTimer = setTimeout(weeklyFiltersChanged, 350);
  });
  $("weeklyOverview").addEventListener("click", (event) => {
    const button = event.target.closest("[data-weekly-state]");
    if (!button) return;
    cancelWeekly();
    weekly.state = button.dataset.weeklyState;
    weekly.mode = "accounts";
    weekly.page = 1;
    renderWeekly();
    void loadWeekly();
  });
  const mode = (value) => {
    cancelWeekly();
    weekly.mode = value;
    weekly.page = 1;
    weekly.day = "";
    if (value === "days") weekly.state = "all";
    renderWeekly();
    void loadWeekly();
  };
  document.querySelectorAll("[data-weekly-mode]").forEach((button) => button.addEventListener("click", () => mode(button.dataset.weeklyMode)));
  $("weeklyBack").addEventListener("click", () => mode("days"));
  $("weeklyDays").addEventListener("click", (event) => {
    const button = event.target.closest("[data-weekly-day]");
    if (!button) return;
    cancelWeekly();
    weekly.day = button.dataset.weeklyDay;
    weekly.mode = "accounts";
    weekly.page = 1;
    renderWeekly();
    void loadWeekly();
  });
  $("weeklyRows").addEventListener("click", (event) => {
    const button = event.target.closest("[data-weekly-open]");
    if (button) void openWeeklyAccount(Number(button.dataset.weeklyOpen));
  });
  $("accountDialog").addEventListener("close", () => {
    if (weekly.detailOpen) cancelWeeklyDetail();
  });
  [["weeklyPrev", -1], ["weeklyNext", 1]].forEach(([id, delta]) => $(id).addEventListener("click", () => {
    cancelWeekly();
    weekly.page = Math.max(1, weekly.page + delta);
    void loadWeekly();
  }));
  $("weeklyRetry").addEventListener("click", () => loadWeekly());
  $("weeklyExport").addEventListener("click", exportWeekly);
  document.addEventListener("visibilitychange", () => {
    if (weeklyVisible()) void loadWeekly(true);
    else cancelWeekly();
  });
}

async function boot() {
  bindRequestIPs();
  bindEvents();
  $("accountFrom").value = todayText();
  $("accountTo").value = todayText();
  $("statsFrom").value = todayText();
  $("statsTo").value = todayText();
  $("authStatsFrom").value = todayText();
  $("authStatsTo").value = todayText();
  try {
    await refreshMe(false);
  } catch (error) {
    if ($("loginView").classList.contains("hidden")) showLogin();
    if (!error.staleSession && error.message && error.message !== "请先登录") {
      $("loginError").textContent = error.message;
    }
    return;
  }
  await initializeData();
}

boot();
