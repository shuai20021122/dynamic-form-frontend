<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";

import bossKnowLogo from "../assets/boss-know-logo.png";
import CodeFlowBackdrop from "../components/CodeFlowBackdrop.vue";
import DocumentManager from "../components/DocumentManager.vue";
import EmptyState from "../components/EmptyState.vue";
import ErrorAlert from "../components/ErrorAlert.vue";
import LoadingBlock from "../components/LoadingBlock.vue";
import StatusBadge from "../components/StatusBadge.vue";
import UiSelect from "../components/UiSelect.vue";
import { fetchCurrentUser } from "../api/auth.js";
import { createOnlineSummary, downloadDocument, getOnlineSummaryDetail, listEntryDocuments, previewDocument, updateOnlineSummary } from "../api/documents.js";
import { createEntry, deleteEntry, listReviews, moveEntrySlot, saveReview, updateEntry } from "../api/entries.js";
import { getFormEntryReviews, getFormTable, getSimpleDesigner, saveSimpleDesigner } from "../api/forms.js";
import { fetchInterviewerProfile, updateInterviewerProfile } from "../api/interviewerProfile.js";
import { getCachedResource, setCachedResource } from "../stores/resourceCache.js";
import { currentUiLanguage, t } from "../stores/uiLanguage.js";
import { closeDialogWithAnimation, getDialogOriginFromEvent, openDialogWithAnimation, resetDialogMotion } from "../utils/dialogMotion.js";
import { buildValueSummary, formatDateTime, getEntryStatusLabel, getFormStatusLabel, getReviewResultLabel } from "../utils/format.js";
import { buildOnlineSummaryPreviewHtml, downloadOnlineSummaryAsWord } from "../utils/onlineSummaryDocument.js";

const route = useRoute();
const router = useRouter();
const formId = computed(() => route.params.id);

const currentUser = ref(null);
const tableData = ref(null);
const loading = ref(true);
const saving = ref(false);
const movingSlot = ref(false);
const errorMessage = ref("");
const editorVisible = ref(false);
const editorDialog = ref(null);
const editingRow = ref(null);
const entryValues = ref({});
const simpleFormValues = ref({});
const simpleFormDocumentId = ref(null);
const simpleFormLoading = ref(false);
const simpleFormPreviewDialog = ref(null);
const simpleFormPreviewConfirmDialog = ref(null);
const simpleFormPreviewLoading = ref(false);
const simpleFormPreviewHtml = ref("");
const simpleFormPreviewFullscreen = ref(false);
const documentRow = ref(null);
const documentSimpleFillVisible = ref(false);
const documentDialog = ref(null);
const currentOperatorDialog = ref(null);
const currentOperatorNameValue = ref("");
const currentOperatorNameError = ref("");
const currentOperatorNameSubmitting = ref(false);
const currentOperatorDialogMode = ref("required");
const interviewerProfileState = ref({
  accountRealName: "",
  currentOperatorName: "",
  hasCurrentOperatorName: false,
});
const interviewerReviewDialog = ref(null);
const interviewerPreviewLoading = ref(false);
const interviewerPreviewHtml = ref("");
const interviewerPreviewFullscreen = ref(false);
const interviewerReviewLoading = ref(false);
const interviewerReviewSaving = ref(false);
const interviewerReviewRow = ref(null);
const interviewerReviewResult = ref("pending");
const interviewerReviewComment = ref("");
const interviewerReviewItems = ref([]);
const reviewStatusDialog = ref(null);
const reviewStatusLoading = ref(false);
const reviewStatusRow = ref(null);
const reviewStatusItems = ref([]);
const reviewStatusSummary = ref({
  candidateName: "",
  teamName: "",
  evaluatedCount: 0,
  totalInterviewerCount: null,
});
const deletingEntry = ref(false);
const deleteDialog = ref(null);
const deletingRow = ref(null);
const moveSlotDialog = ref(null);
const movingRow = ref(null);
const targetSlotId = ref("");
const designerConfig = ref(null);
const togglingDisabledSlot = ref(false);
const isAdminViewer = computed(() => ["super_admin", "academic_admin"].includes(currentUser.value?.role || ""));
const canViewInterviewDetail = computed(() => isInterviewer.value || isAdminViewer.value);
const canTrackDocumentUpload = computed(() => canViewInterviewDetail.value || isPersonalUser.value);
const canViewReviewStatusDetail = computed(() => isInterviewer.value || isAdminViewer.value || isPersonalUser.value);
const canEditInterviewReview = computed(() => isInterviewer.value);
const showRecentUpdatedColumn = computed(() => isAdminViewer.value);
const tableCacheKey = computed(() => `forms:table:${formId.value}:${currentUiLanguage.value}`);
const currentOperatorPromptStorageKey = computed(() => {
  const identity = currentUser.value?.id || currentUser.value?.user_id || currentUser.value?.username || "anonymous";
  return `forms:current-operator-prompt:${identity}:${formId.value}`;
});
const isInterviewer = computed(() => currentUser.value?.role === "interviewer");
const isPersonalUser = computed(() => currentUser.value?.role === "personal");
const showStatusColumn = computed(() => !isInterviewer.value);
const documentActionLabel = computed(() => (isInterviewer.value ? (currentUiLanguage.value === "en-US" ?  "View" : "查看") : currentUiLanguage.value === "en-US" ? "View" : "查看"));
const interviewerDocumentNote = computed(() =>
  currentUiLanguage.value === "en-US"
    ? "Blue outline means no resume has been uploaded yet. Green outline means a resume has already been uploaded and can be viewed."
    : "蓝色描边表示尚未上传简表，绿色描边表示已上传简表，可直接查看。"
);
const documentUploadStateMap = ref({});
const entryDocumentsMap = ref({});
const reviewResultStateMap = ref({});
const reviewSummaryMap = ref({});
const reviewResultOptions = computed(() => [
  { value: "pending", label: getReviewResultLabel("pending") },
  { value: "in_progress", label: getReviewResultLabel("in_progress") },
  { value: "pass", label: getReviewResultLabel("pass") },
  { value: "reject", label: getReviewResultLabel("reject") },
]);
const interviewerDialogTitle = computed(() => (currentUiLanguage.value === "en-US" ? "Resume Review" : "简表查看与评价"));
const interviewerReviewTitle = computed(() => (currentUiLanguage.value === "en-US" ? "Evaluation" : "评价"));
const interviewerReviewResultLabel = computed(() => (currentUiLanguage.value === "en-US" ? "Result" : "评价结果"));
const interviewerReviewCommentLabel = computed(() => (currentUiLanguage.value === "en-US" ? "Comments" : "评价内容"));
const interviewerReviewPlaceholder = computed(() => (currentUiLanguage.value === "en-US" ? "Enter your evaluation notes" : "请输入评价内容"));
const interviewerReviewEmpty = computed(() => (currentUiLanguage.value === "en-US" ? "No resume preview available yet." : "当前暂无可预览的简表。"));
const interviewerReviewListEmpty = computed(() => (currentUiLanguage.value === "en-US" ? "No interviewer reviews yet." : "当前暂无面试官评价。"));
const reviewerResultColumnLabel = computed(() => (currentUiLanguage.value === "en-US" ? "Review Result" : "评价结果"));
const interviewDetailActionLabel = computed(() => (currentUiLanguage.value === "en-US" ? "Interview Detail" : "面试详情"));
const interviewerEvaluationColumnLabel = computed(() => (currentUiLanguage.value === "en-US" ? "Interviewer Evaluation" : "面试官评价"));
const reviewStatusDialogTitle = computed(() => (currentUiLanguage.value === "en-US" ? "Interviewer Evaluation" : "面试官评价"));
const reviewStatusEmptyLabel = computed(() => (currentUiLanguage.value === "en-US" ? "No interviewer reviews yet." : "当前暂无面试官评价。"));
const reviewStatusNoPermissionLabel = computed(() =>
  currentUiLanguage.value === "en-US" ? "Your account cannot view interviewer evaluation details." : "当前账号暂不支持查看面试官评价详情。"
);
const reviewerNameLabel = computed(() => (currentUiLanguage.value === "en-US" ? "Reviewer" : "面试官"));
const reviewerUpdatedAtLabel = computed(() => (currentUiLanguage.value === "en-US" ? "Updated At" : "评价时间"));
const reviewerCommentLabel = computed(() => (currentUiLanguage.value === "en-US" ? "Comment" : "评价内容"));
const reviewerAdmissionStatusLabel = computed(() => (currentUiLanguage.value === "en-US" ? "Admission Suggestion" : "录取建议"));
const reviewerResultDisplayLabel = computed(() => (currentUiLanguage.value === "en-US" ? "Review Result" : "评价结果"));
const reviewerStatusLabel = computed(() => (currentUiLanguage.value === "en-US" ? "Review Status" : "评价状态"));
const reviewStatusCandidateLabel = computed(() => (currentUiLanguage.value === "en-US" ? "Candidate" : "候选人"));
const reviewStatusTeamLabel = computed(() => (currentUiLanguage.value === "en-US" ? "Team" : "团队"));
const currentOperatorDialogTitle = computed(() => (currentUiLanguage.value === "en-US" ? "Current Operator Name" : "当前使用人姓名"));
const currentOperatorFieldLabel = computed(() => (currentUiLanguage.value === "en-US" ? "Current Operator" : "当前使用人"));
const currentOperatorPlaceholder = computed(() => (currentUiLanguage.value === "en-US" ? "Please enter the current operator name" : "请输入当前使用人姓名"));
const currentOperatorConfirmLabel = computed(() => (currentUiLanguage.value === "en-US" ? "Confirm" : "确认"));
const currentOperatorCloseLabel = computed(() => (currentUiLanguage.value === "en-US" ? "Close" : "关闭"));
const currentOperatorBackLabel = computed(() => (currentUiLanguage.value === "en-US" ? "Back" : "返回上一页"));
const accountRealNameLabel = computed(() => (currentUiLanguage.value === "en-US" ? "Account Name" : "账号姓名"));
const currentOperatorSummaryLabel = computed(() => (currentUiLanguage.value === "en-US" ? "Current Operator" : "当前使用人"));
const accountRealNameDisplay = computed(
  () => interviewerProfileState.value.accountRealName || currentUser.value?.account_real_name || currentUser.value?.real_name || "-"
);
const currentOperatorNameDisplay = computed(() => interviewerProfileState.value.currentOperatorName || "-");
const fullscreenToggleLabel = computed(() => (currentUiLanguage.value === "en-US" ? "Fullscreen" : "全屏展示"));
const windowedToggleLabel = computed(() => (currentUiLanguage.value === "en-US" ? "Windowed" : "窗口展示"));
const simpleFormPreviewToggleLabel = computed(() => (simpleFormPreviewFullscreen.value ? windowedToggleLabel.value : fullscreenToggleLabel.value));
const interviewerPreviewToggleLabel = computed(() => (interviewerPreviewFullscreen.value ? windowedToggleLabel.value : fullscreenToggleLabel.value));
const simpleFormPreviewCloseConfirmTitle = computed(() => (currentUiLanguage.value === "en-US" ? "Confirm Close" : "确认关闭"));
const simpleFormPreviewCloseConfirmBody = computed(() =>
  currentUiLanguage.value === "en-US"
    ? "Are you sure you want to close the preview? This will close all related dialogs."
    : "确认关闭预览吗？确认后将关闭所有相关弹框。"
);

const documentDialogTitle = computed(() => (documentSimpleFillVisible.value ? (currentUiLanguage.value === "en-US" ? "Resume Fill" : "简表填写") : t("fill.documentTitle")));
const simpleFormActionLabel = computed(() => (currentUiLanguage.value === "en-US" ? "Resume Fill" : "简表填写"));

const simpleFormSubmitLabel = computed(() => (currentUiLanguage.value === "en-US" ? "Save" : "保存提交"));

const bubbleSelectOptions = {
  gender: [
    { value: "男", label: "男" },
    { value: "女", label: "女" },
  ],
  attendance: [
    { value: "线上", label: "线上" },
    { value: "现场", label: "现场" },
  ],
};

const extraBubbleSelectOptions = {
  listed: [
    { value: "是", label: "是" },
    { value: "否", label: "否" },
  ],
  language: [
    { value: "中文", label: "中文" },
    { value: "English", label: "English" },
  ],
  admission: [
    { value: "待定", label: "待定" },
    { value: "已录取", label: "已录取" },
    { value: "未录取", label: "未录取" },
  ],
};

const localizedFieldLabelMap = {
  "zh-CN": {
    姓名: "姓名",
    性别: "性别",
    "公司名称（中文）": "公司名称（中文）",
    "公司名称（英文）": "公司名称（英文）",
    公司是否上市: "公司是否上市",
    职务: "职务",
    "线上/现场": "线上/现场",
    线上现场: "线上/现场",
    语言: "语言",
    录取状态: "录取状态",
  },
  "en-US": {
    姓名: "Name",
    性别: "Gender",
    "公司名称（中文）": "Company Name (CN)",
    "公司名称（英文）": "Company Name (EN)",
    公司是否上市: "Listed Company",
    职务: "Position",
    "线上/现场": "Format",
    线上现场: "Format",
    语言: "Language",
    录取状态: "Admission Status",
  },
};

const localizedSelectValueMap = {
  gender: {
    "zh-CN": { 男: "男", 女: "女" },
    "en-US": { 男: "Male", 女: "Female" },
  },
  attendance: {
    "zh-CN": { 线上: "线上", 现场: "现场" },
    "en-US": { 线上: "Online", 现场: "On-site" },
  },
  listed: {
    "zh-CN": { 是: "是", 否: "否" },
    "en-US": { 是: "Yes", 否: "No" },
  },
  language: {
    "zh-CN": { 中文: "中文", English: "English" },
    "en-US": { 中文: "Chinese", English: "English" },
  },
  admission: {
    "zh-CN": { 待定: "待定", 已录取: "已录取", 未录取: "未录取" },
    "en-US": { 待定: "Pending", 已录取: "Admitted", 未录取: "Not Admitted" },
  },
};

function getTone(status) {
  if (status === "filled") return "success";
  if (status === "occupied") return "neutral";
  return "warning";
}

function normalizeDesignerSlot(slot) {
  const normalizeIsActive = (value) => {
    if (value === false || value === 0) return false;
    const normalizedValue = String(value ?? "").trim().toLowerCase();
    if (normalizedValue === "false" || normalizedValue === "0" || normalizedValue === "disabled") {
      return false;
    }
    return true;
  };

  if (typeof slot === "string") {
    return {
      title: String(slot || "").trim(),
      is_active: true,
    };
  }

  return {
    ...(slot || {}),
    title: String(slot?.title || slot?.label || slot?.value || "").trim(),
    is_active: normalizeIsActive(slot?.is_active),
  };
}

function normalizeSlotMatchKey(value) {
  return String(value || "")
    .trim()
    .replace(/[–—]/g, "-")
    .replace(/\s*-\s*/g, "-")
    .replace(/\s+/g, "");
}

function buildDesignerSlots(slots = [], disabledSlotTitles = []) {
  const disabledSet = new Set((disabledSlotTitles || []).map((slot) => normalizeSlotMatchKey(slot)).filter(Boolean));
  return (slots || []).map((slot) => {
    const normalizedSlot = normalizeDesignerSlot(slot);
    if (disabledSet.has(normalizeSlotMatchKey(normalizedSlot.title))) {
      return {
        ...normalizedSlot,
        is_active: false,
      };
    }
    return normalizedSlot;
  });
}

function hasExplicitIsActive(slot) {
  return !!slot && Object.prototype.hasOwnProperty.call(slot, "is_active") && slot.is_active !== null && slot.is_active !== undefined;
}

function getDesignerSlotDetailList(data = {}) {
  if (Array.isArray(data?.slot_details) && data.slot_details.length) {
    return data.slot_details;
  }

  return buildDesignerSlots(data?.slots || [], data?.disabled_slots || []);
}

function buildDesignerSlotStateMaps(slotDetails = []) {
  const byId = new Map();
  const byTitle = new Map();

  (slotDetails || [])
    .map((slot) => normalizeDesignerSlot(slot))
    .filter((slot) => slot.title)
    .forEach((slot) => {
      if (slot.id !== undefined && slot.id !== null && slot.id !== "") {
        byId.set(String(slot.id), slot);
      }
      byTitle.set(normalizeSlotMatchKey(slot.title), slot);
    });

  return { byId, byTitle };
}

function applyDesignerSlotStateToRows(rows = [], slotDetails = []) {
  const { byId, byTitle } = buildDesignerSlotStateMaps(slotDetails);

  return (rows || []).map((row) => {
    const rawSlot = row?.slot || {};
    const normalizedRowSlot = normalizeDesignerSlot(rawSlot);
    const matchedSlot =
      (rawSlot?.id !== undefined && rawSlot?.id !== null && rawSlot?.id !== "" ? byId.get(String(rawSlot.id)) : null) ||
      byTitle.get(normalizeSlotMatchKey(normalizedRowSlot.title));

    return {
      ...row,
      slot: {
        ...rawSlot,
        title: normalizedRowSlot.title,
        is_active: hasExplicitIsActive(rawSlot)
          ? normalizedRowSlot.is_active
          : normalizeDesignerSlot(matchedSlot).is_active,
      },
    };
  });
}

function buildDesignerConfigPayload(data = {}) {
  const normalizedSlotDetails = getDesignerSlotDetailList(data)
    .map((slot) => normalizeDesignerSlot(slot))
    .filter((slot) => slot.title);

  return {
    ...(data || {}),
    slots: normalizedSlotDetails.map((slot) => slot.title),
    slot_details: normalizedSlotDetails,
  };
}

function getRowStatusTone(row) {
  if (isSlotDisabledRow(row)) {
    return "disabled";
  }

  return getTone(row?.status);
}

function getOccupiedTeamName(row) {
  return (
    row?.entry?.team_name ||
    row?.team_name ||
    currentUser.value?.team_name ||
    currentUser.value?.team?.name ||
    ""
  );
}

function getEntryStatusText(row) {
  if (isSlotDisabledRow(row)) {
    return t("fill.disabledSlot");
  }

  const teamName = String(getOccupiedTeamName(row) || "").trim();

  if (isPersonalUser.value && row?.status === "occupied") {
    if (teamName) {
      return t("fill.occupiedByTeam", { team: teamName });
    }
  }

  if (!isPersonalUser.value && row?.status === "filled" && teamName) {
    return t("fill.filledByTeam", { team: teamName });
  }

  return getEntryStatusLabel(row?.status);
}

function normalizeFieldLabel(field) {
  return String(field?.display_label || field?.field_label || "").replace(/\s+/g, "");
}

function normalizeSimpleFieldText(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[\s/()（）:：,，.\-_*?？]/g, "");
}

function getFieldAliases(field) {
  return [field?.display_label, field?.field_label, field?.field_key, field?.name].map(normalizeSimpleFieldText).filter(Boolean);
}

function matchesSimpleField(field, aliases = []) {
  if (!field) {
    return false;
  }

  const fieldAliases = getFieldAliases(field);
  return aliases.some((alias) => fieldAliases.includes(normalizeSimpleFieldText(alias)));
}

function focusSimpleFieldCell(event) {
  const cell = event?.currentTarget;
  if (!(cell instanceof HTMLElement)) {
    return;
  }

  const activeElement = document.activeElement;
  if (activeElement && cell.contains(activeElement)) {
    return;
  }

  const primaryControl = cell.querySelector("input, textarea");
  if (primaryControl instanceof HTMLInputElement || primaryControl instanceof HTMLTextAreaElement) {
    primaryControl.focus();
    const valueLength = String(primaryControl.value || "").length;
    if (typeof primaryControl.setSelectionRange === "function") {
      primaryControl.setSelectionRange(valueLength, valueLength);
    }
    return;
  }

  const selectTrigger = cell.querySelector(".ui-select-trigger");
  if (selectTrigger instanceof HTMLElement) {
    selectTrigger.focus();
    selectTrigger.click();
  }
}

function createVirtualSimpleField(fieldKey, label, fieldType = "text") {
  return {
    id: `virtual-${fieldKey}`,
    field_key: fieldKey,
    display_label: label,
    field_label: label,
    field_type: fieldType,
    is_required: false,
    is_virtual: true,
  };
}

function getLocalizedFieldLabel(field) {
  const language = currentUiLanguage.value === "en-US" ? "en-US" : "zh-CN";
  const label = normalizeFieldLabel(field);
  return localizedFieldLabelMap[language]?.[label] || field?.display_label || field?.field_label || "";
}

function getBubbleSelectKind(field) {
  const label = normalizeFieldLabel(field);
  if (label === "性别") return "gender";
  if (label === "线上/现场" || label === "线上现场") return "attendance";
  if (label === "公司是否上市") return "listed";
  if (label === "语言") return "language";
  if (label === "录取状态") return "admission";
  return "";
}

function getBubbleSelectOptions(field) {
  const kind = getBubbleSelectKind(field);
  if (!kind) {
    return [];
  }

  const language = currentUiLanguage.value === "en-US" ? "en-US" : "zh-CN";
  const options = bubbleSelectOptions[kind] || extraBubbleSelectOptions[kind] || [];
  return options.map((option) => ({
    ...option,
    label: localizedSelectValueMap[kind]?.[language]?.[option.value] || option.label,
  }));
}

function getLocalizedFieldValue(field, value) {
  const kind = getBubbleSelectKind(field);
  if (!kind) {
    return value;
  }

  const language = currentUiLanguage.value === "en-US" ? "en-US" : "zh-CN";
  return localizedSelectValueMap[kind]?.[language]?.[value] || value;
}

function isHiddenPersonalField(field) {
  if (!isPersonalUser.value) {
    return false;
  }

  const label = normalizeFieldLabel(field);
  const key = String(field?.field_key || "").trim().toLowerCase();
  return label === "状态" || key === "status" || isAdmissionField(field);
}

function isCompanyEnglishField(field) {
  const label = normalizeFieldLabel(field);
  const key = String(field?.field_key || "").trim().toLowerCase();
  return (
    label === "公司名称（英文）" ||
    key === "company_name_en" ||
    key === "companynameen" ||
    key === "company_english_name" ||
    key === "companyenglishname"
  );
}

function isPersonalFieldRequired(field) {
  if (!field || !isPersonalUser.value || isHiddenPersonalField(field)) {
    return false;
  }

  return !isCompanyEnglishField(field);
}

function getFieldRequiredMark(field) {
  return field?.is_required || isPersonalFieldRequired(field);
}

function getFieldValueText(value) {
  return String(value ?? "").trim();
}

function validatePersonalEntryValues() {
  if (!isPersonalUser.value) {
    return;
  }

  const missingField = visibleFields.value.find((field) => isPersonalFieldRequired(field) && !getFieldValueText(entryValues.value[field.field_key]));
  if (!missingField) {
    return;
  }

  const fieldLabel = getLocalizedFieldLabel(missingField) || missingField.display_label || missingField.field_label || "";
  throw new Error(currentUiLanguage.value === "en-US" ? `${fieldLabel} is required.` : `${fieldLabel}为必填项`);
}

const visibleFields = computed(() => (tableData.value?.fields || []).filter((field) => !isHiddenPersonalField(field)));
const simpleFormFieldMap = computed(() => {
  const findField = (aliases) => visibleFields.value.find((field) => matchesSimpleField(field, aliases)) || null;

  return {
    name: findField(["姓名", "name"]),
    birthDate: findField(["出生日期", "date of birth", "dateofbirth", "birthday"]),
    gender: findField(["性别", "gender"]),
    nationality: findField(["国籍", "nationality"]),
    organization: findField(["公司名称", "organization name", "organizationname", "company name", "companyname"]),
    position: findField(["职务", "职位", "position", "position/title", "title"]),
    assets: findField(["总资产", "assets"]),
    employees: findField(["员工人数", "employees"]),
    revenue: findField(["企业营收", "revenue"]),
    industry: findField(["公司行业", "industry"]),
    introduction: findField(["企业简介", "introduction", "company profile", "companyprofile"]),
    professionalExperience: findField(["个人职业经历", "professional experience", "professionalexperience", "work experience", "workexperience"]),
    motivation: findField(["您为什么希望参加", "why do you want to join this program and what do you hope to gain from it", "motivation"]),
    note: findField(["备注", "note", "notes"]),
  };
});
const simpleFormMappedFieldIds = computed(() =>
  Object.values(simpleFormFieldMap.value)
    .map((field) => field?.id)
    .filter(Boolean)
);
const simpleFormExtraFields = computed(() => visibleFields.value.filter((field) => !simpleFormMappedFieldIds.value.includes(field.id)));
const simpleFormFallbackFields = {
  name: createVirtualSimpleField("name", "姓名"),
  birthDate: createVirtualSimpleField("birth_date", "出生日期"),
  gender: createVirtualSimpleField("gender", "性别"),
  nationality: createVirtualSimpleField("nationality", "国籍"),
  organization: createVirtualSimpleField("organization_name", "公司名称"),
  position: createVirtualSimpleField("position_title", "职务"),
  assets: createVirtualSimpleField("company_assets", "总资产"),
  employees: createVirtualSimpleField("company_employees", "员工人数"),
  revenue: createVirtualSimpleField("company_revenue", "企业营收"),
  industry: createVirtualSimpleField("company_industry", "公司行业"),
  introduction: createVirtualSimpleField("introduction", "企业简介"),
  professionalExperience: createVirtualSimpleField("professional_experience", "个人职业经历"),
  motivation: createVirtualSimpleField("program_motivation", "项目申请动机"),
  note: createVirtualSimpleField("note", "备注"),
};

function getResolvedSimpleField(name) {
  return simpleFormFieldMap.value?.[name] || simpleFormFallbackFields[name] || null;
}

const simpleFormLayoutExcludedFieldIds = computed(() =>
  [
    getResolvedSimpleField("name"),
    getResolvedSimpleField("birthDate"),
    getResolvedSimpleField("gender"),
    getResolvedSimpleField("nationality"),
    getResolvedSimpleField("organization"),
    getResolvedSimpleField("position"),
    getResolvedSimpleField("assets"),
    getResolvedSimpleField("employees"),
    getResolvedSimpleField("revenue"),
    getResolvedSimpleField("industry"),
  ]
    .map((field) => field?.id)
    .filter(Boolean)
);
const simpleFormGridFields = computed(() => visibleFields.value.filter((field) => !simpleFormLayoutExcludedFieldIds.value.includes(field.id)));

function getSimpleGridField(index, fieldKey, label) {
  return simpleFormGridFields.value[index] || createVirtualSimpleField(fieldKey, label);
}

const simpleFormWorkRows = computed(() =>
  Array.from({ length: 3 }, (_, index) => ({
    date: getSimpleGridField(index * 3, `work_${index + 1}_date`, `工作经历${index + 1}-起止日期`),
    organization: getSimpleGridField(index * 3 + 1, `work_${index + 1}_organization`, `工作经历${index + 1}-工作单位`),
    position: getSimpleGridField(index * 3 + 2, `work_${index + 1}_position`, `工作经历${index + 1}-担任职务`),
  }))
);
const simpleFormEducationRows = computed(() =>
  Array.from({ length: 3 }, (_, index) => ({
    date: getSimpleGridField(9 + index * 4, `education_${index + 1}_date`, `教育经历${index + 1}-起止日期`),
    institution: getSimpleGridField(9 + index * 4 + 1, `education_${index + 1}_institution`, `教育经历${index + 1}-毕业院校`),
    fieldOfStudy: getSimpleGridField(9 + index * 4 + 2, `education_${index + 1}_field`, `教育经历${index + 1}-学习专业`),
    degree: getSimpleGridField(9 + index * 4 + 3, `education_${index + 1}_degree`, `教育经历${index + 1}-学历学位`),
  }))
);

function isFieldReadOnly(field) {
  return isPersonalUser.value && isAdmissionField(field);
}

function isAdmissionField(field) {
  const label = normalizeFieldLabel(field);
  const key = String(field?.field_key || "").trim().toLowerCase();
  return label === "录取状态" || key === "admission_status" || key === "admissionstatus";
}

function getAdmissionTone(value) {
  if (value === "已录取") return "success";
  if (value === "未录取") return "danger";
  return "warning";
}

function isSlotDisabledRow(row) {
  return normalizeDesignerSlot(row?.slot).is_active === false;
}

function isRowFillDisabled(row) {
  return normalizeDesignerSlot(row?.slot).is_active === false || row?.can_fill === false;
}

const moveSlotOptions = computed(() => {
  if (!movingRow.value || !tableData.value?.rows?.length) {
    return [];
  }

  return tableData.value.rows
    .filter((row) => row.slot?.id !== movingRow.value.slot?.id)
    .filter((row) => !row.entry?.id)
    .filter((row) => row.status === "empty" || row.can_fill)
    .map((row) => ({
      value: row.slot.id,
      label: row.slot.title,
      disabled: isSlotDisabledRow(row),
      actionLabel: isAdminViewer.value ? (isSlotDisabledRow(row) ? "启用" : "禁用") : "",
      actionDisabled: movingSlot.value || togglingDisabledSlot.value,
    }));
});

const hasEnabledMoveSlotOptions = computed(() => moveSlotOptions.value.some((option) => !option.disabled));

function getEntryDocumentsCacheKey(entryId) {
  return `entry:documents:${entryId || ""}`;
}

function hasUploadedDocument(row) {
  const entryId = String(row?.entry?.id || "");
  return !!(entryId && documentUploadStateMap.value[entryId]);
}

function hasCompletedResume(row) {
  return hasUploadedDocument(row);
}

function getDocumentActionButtonClass(row) {
  return hasCompletedResume(row) ? ["fill-row-view-btn", "is-ready"] : "btn-secondary";
}

function isOccupiedLockedRow(row) {
  return isPersonalUser.value && row?.status === "occupied";
}

function getOccupiedLockedActionLabel() {
  return currentUiLanguage.value === "en-US" ? "Occupied - unavailable" : "已被占用不可操作";
}

function getPreviewableDocument(row) {
  const entryId = String(row?.entry?.id || "");
  const documents = entryId ? entryDocumentsMap.value[entryId] || [] : [];
  return (
    documents.find((item) => item.file_type === "docx" && item.document_kind === "bilingual") ||
    documents.find((item) => item.file_type === "docx" && item.document_kind === "original") ||
    documents.find((item) => item.file_type === "docx") ||
    null
  );
}

function getReviewResultValue(row) {
  const entryId = String(row?.entry?.id || "");
  return reviewResultStateMap.value[entryId] || "pending";
}

function getReviewResultToneByValue(result) {
  if (result === "pass") return "success";
  if (result === "reject") return "danger";
  if (result === "in_progress") return "warning";
  return "neutral";
}

function getReviewResultTone(row) {
  return getReviewResultToneByValue(getReviewResultValue(row));
}

function normalizeReviewPayload(result) {
  const payload = result?.data || result || {};
  const reviews = payload?.items || payload?.reviews || payload?.data || [];
  if (Array.isArray(reviews)) {
    return reviews;
  }
  if (payload?.review && typeof payload.review === "object") {
    return [payload.review];
  }
  if (typeof payload === "object" && payload?.result) {
    return [payload];
  }
  return [];
}

function normalizeReviewItem(item, index = 0) {
  const reviewer =
    item?.reviewer_name ||
    item?.reviewer?.real_name ||
    item?.reviewer?.name ||
    item?.interviewer_name ||
    item?.interviewer?.real_name ||
    item?.interviewer?.name ||
    item?.team_name ||
    item?.user_name ||
    item?.real_name ||
    `${reviewerNameLabel.value} ${index + 1}`;

  return {
    reviewer,
    result: item?.result || item?.review_result || item?.status || "pending",
    comment: item?.comment || item?.review_comment || item?.remarks || item?.content || "",
    updatedAt: item?.updated_at || item?.reviewed_at || item?.created_at || "",
  };
}

function isCompletedReviewItem(item) {
  if (!item) return false;
  const comment = String(item.comment || "").trim();
  const result = String(item.result || "").trim().toLowerCase();
  return Boolean(comment || (result && result !== "pending"));
}

function getCompletedReviewCount(items) {
  return (items || []).filter(isCompletedReviewItem).length;
}

const reviewStatusCountLabel = computed(() =>
  currentUiLanguage.value === "en-US"
    ? `${Number(reviewStatusSummary.value?.evaluatedCount || 0)}/2 reviewed`
    : `${Number(reviewStatusSummary.value?.evaluatedCount || 0)}/2\u4eba\u5df2\u8bc4\u4ef7`
);

function getReviewStatusButtonLabel(row) {
  const evaluatedCount = Number(row?.review_summary?.evaluated_count || 0);
  return currentUiLanguage.value === "en-US"
    ? `Interviewer Evaluation (${evaluatedCount}/2 reviewed)`
    : `\u9762\u8bd5\u5b98\u8bc4\u4ef7\uff08${evaluatedCount}/2\u4eba\u5df2\u8bc4\u4ef7\uff09`;
}

function getTableCellDisplayValue(field, row) {
  const rawValue = row.values?.[field.field_key]?.display_value || row.values?.[field.field_key]?.value;
  const localizedValue = getLocalizedFieldValue(field, rawValue);
  return localizedValue || (row.can_view ? "-" : "不可查看");
}

function getLatestTimestampValue(...values) {
  const candidates = values
    .flat()
    .map((value) => String(value || "").trim())
    .filter(Boolean)
    .map((value) => ({ raw: value, time: new Date(value).getTime() }))
    .filter((item) => !Number.isNaN(item.time));

  if (!candidates.length) {
    return "";
  }

  candidates.sort((left, right) => right.time - left.time);
  return candidates[0]?.raw || "";
}

function getRowLatestUpdatedAt(row) {
  const entryId = String(row?.entry?.id || "");
  const documents = entryId ? entryDocumentsMap.value[entryId] || [] : [];
  const latestDocumentTime = getLatestTimestampValue(
    documents.map((item) => item?.updated_at || item?.created_at || "")
  );
  return getLatestTimestampValue(row?.entry?.updated_at, row?.entry?.created_at, latestDocumentTime);
}

function getRowLatestUpdatedDisplay(row) {
  const latestValue = getRowLatestUpdatedAt(row);
  return latestValue ? formatDateTime(latestValue) : "-";
}

async function loadInterviewerReviewStates(rows) {
  if (!isInterviewer.value && !isAdminViewer.value) {
    reviewResultStateMap.value = {};
    reviewSummaryMap.value = {};
    return;
  }

  const entryIds = (rows || [])
    .map((row) => String(row?.entry?.id || ""))
    .filter(Boolean);

  if (!entryIds.length) {
    reviewResultStateMap.value = {};
    reviewSummaryMap.value = {};
    return;
  }

  const results = await Promise.allSettled(entryIds.map((entryId) => listReviews(entryId)));
  const nextMap = {};
  const nextSummaryMap = {};

  results.forEach((result, index) => {
    const entryId = entryIds[index];
    if (result.status !== "fulfilled") {
      nextMap[entryId] = "pending";
      nextSummaryMap[entryId] = [];
      return;
    }

    const reviews = normalizeReviewPayload(result.value);
    const latestReview = Array.isArray(reviews) && reviews.length ? reviews[0] : null;
    nextMap[entryId] = latestReview?.result || latestReview?.review_result || latestReview?.status || "pending";
    nextSummaryMap[entryId] = reviews.map((item, itemIndex) => normalizeReviewItem(item, itemIndex));
  });

  reviewResultStateMap.value = nextMap;
  reviewSummaryMap.value = nextSummaryMap;
}

async function loadInterviewerDocumentStates(rows) {
  if (!canTrackDocumentUpload.value) {
    documentUploadStateMap.value = {};
    entryDocumentsMap.value = {};
    return;
  }

  const entryIds = (rows || [])
    .map((row) => String(row?.entry?.id || ""))
    .filter(Boolean);

  if (!entryIds.length) {
    documentUploadStateMap.value = {};
    entryDocumentsMap.value = {};
    return;
  }

  const nextMap = {};
  const nextDocumentsMap = {};
  const pendingIds = [];

  entryIds.forEach((entryId) => {
    const cached = getCachedResource(getEntryDocumentsCacheKey(entryId));
    if (Array.isArray(cached)) {
      nextDocumentsMap[entryId] = cached;
      nextMap[entryId] = cached.length > 0;
    } else {
      pendingIds.push(entryId);
    }
  });

  documentUploadStateMap.value = nextMap;
  entryDocumentsMap.value = nextDocumentsMap;

  if (!pendingIds.length) {
    return;
  }

  const results = await Promise.allSettled(pendingIds.map((entryId) => listEntryDocuments(entryId)));
  const mergedMap = { ...documentUploadStateMap.value };
  const mergedDocumentsMap = { ...entryDocumentsMap.value };

  results.forEach((result, index) => {
    const entryId = pendingIds[index];
    if (result.status === "fulfilled") {
      const items = result.value?.data?.items || [];
      mergedMap[entryId] = items.length > 0;
      mergedDocumentsMap[entryId] = items;
      setCachedResource(getEntryDocumentsCacheKey(entryId), items);
      return;
    }

    if (!(entryId in mergedMap)) {
      mergedMap[entryId] = false;
    }
    if (!(entryId in mergedDocumentsMap)) {
      mergedDocumentsMap[entryId] = [];
    }
  });

  documentUploadStateMap.value = mergedMap;
  entryDocumentsMap.value = mergedDocumentsMap;
}

function openEditor(row, event) {
  if (isSlotDisabledRow(row)) {
    return;
  }
  editingRow.value = row;
  editorVisible.value = true;
  documentRow.value = null;
  populateEntryValuesFromRow(row);
  openDialogWithAnimation(editorDialog, {
    originPoint: getDialogOriginFromEvent(event, {
      x: window.innerWidth * 0.68,
      y: window.innerHeight * 0.3,
    }),
  });
}

function closeEditor() {
  if (editorDialog.value?.open) {
    closeDialogWithAnimation(editorDialog);
    return;
  }
  editorVisible.value = false;
  editingRow.value = null;
  entryValues.value = {};
}

function resetEditorState() {
  editorVisible.value = false;
  editingRow.value = null;
  entryValues.value = {};
}

function populateEntryValuesFromRow(row) {
  entryValues.value = {};
  Object.entries(row?.values || {}).forEach(([fieldKey, fieldValue]) => {
    entryValues.value[fieldKey] = fieldValue?.value || "";
  });
  visibleFields.value.forEach((field) => {
    entryValues.value[field.field_key] = row?.values?.[field.field_key]?.value || "";
  });
}

function resetDocumentDialogState() {
  documentRow.value = null;
  documentSimpleFillVisible.value = false;
  editingRow.value = null;
  entryValues.value = {};
  simpleFormValues.value = {};
  simpleFormDocumentId.value = null;
  simpleFormLoading.value = false;
  resetSimpleFormPreviewDialogState();
}

function closeDocumentDialog() {
  if (documentSimpleFillVisible.value) {
    closeSimpleFillInDocumentDialog();
    return;
  }

  if (documentDialog.value?.open) {
    closeDialogWithAnimation(documentDialog);
    return;
  }
  resetDocumentDialogState();
}

function openDocumentDialog(row, event) {
  documentRow.value = row;
  documentSimpleFillVisible.value = false;
  editorVisible.value = false;
  openDialogWithAnimation(documentDialog, {
    originPoint: getDialogOriginFromEvent(event, {
      x: window.innerWidth * 0.72,
      y: window.innerHeight * 0.28,
    }),
  });
}

async function openSimpleFillFromDocumentDialog() {
  if (!documentRow.value) {
    return;
  }

  editingRow.value = documentRow.value;
  simpleFormLoading.value = true;
  simpleFormValues.value = {};
  simpleFormDocumentId.value = null;
  documentSimpleFillVisible.value = true;

  try {
    const documentsResult = await listEntryDocuments(documentRow.value.entry?.id);
    const onlineSummaryDocument = getOnlineSummaryDocument(documentsResult?.data?.items || []);
    if (!onlineSummaryDocument?.id) {
      return;
    }

    simpleFormDocumentId.value = onlineSummaryDocument.id;
    const detailResult = await getOnlineSummaryDetail(onlineSummaryDocument.id);
    applyOnlineSummaryDetail(detailResult?.data || {});
  } catch (error) {
    errorMessage.value = error.message || t("common.loading");
  } finally {
    simpleFormLoading.value = false;
  }
}

function closeSimpleFillInDocumentDialog() {
  documentSimpleFillVisible.value = false;
  editingRow.value = null;
  simpleFormValues.value = {};
  simpleFormDocumentId.value = null;
  simpleFormLoading.value = false;
}

function resetSimpleFormPreviewDialogState() {
  simpleFormPreviewLoading.value = false;
  simpleFormPreviewHtml.value = "";
  simpleFormPreviewFullscreen.value = false;
}

function closeSimpleFormPreviewDialog() {
  openDialogWithAnimation(simpleFormPreviewConfirmDialog, {
    originPoint: {
      x: window.innerWidth * 0.76,
      y: window.innerHeight * 0.2,
    },
  });
}

function closeSimpleFormPreviewConfirmDialog() {
  if (simpleFormPreviewConfirmDialog.value?.open) {
    closeDialogWithAnimation(simpleFormPreviewConfirmDialog);
  }
}

function confirmCloseSimpleFormPreviewDialog() {
  closeSimpleFormPreviewConfirmDialog();
  if (simpleFormPreviewDialog.value?.open) {
    closeDialogWithAnimation(simpleFormPreviewDialog);
  } else {
    resetSimpleFormPreviewDialogState();
  }

  if (documentDialog.value?.open) {
    closeDialogWithAnimation(documentDialog);
    return;
  }

  resetDocumentDialogState();
}

function toggleSimpleFormPreviewFullscreen() {
  simpleFormPreviewFullscreen.value = !simpleFormPreviewFullscreen.value;
}

async function openSimpleFormPreviewDialog(event) {
  if (!simpleFormDocumentId.value) {
    return;
  }

  simpleFormPreviewHtml.value = "";
  simpleFormPreviewLoading.value = true;
  openDialogWithAnimation(simpleFormPreviewDialog, {
    originPoint: getDialogOriginFromEvent(event, {
      x: window.innerWidth * 0.78,
      y: window.innerHeight * 0.18,
    }),
  });

  try {
    const result = await getOnlineSummaryDetail(simpleFormDocumentId.value);
    simpleFormPreviewHtml.value = buildOnlineSummaryPreviewHtml(result?.data || {});
  } catch (error) {
    simpleFormPreviewDialog.value?.close();
    errorMessage.value = error.message || t("document.previewFailed");
  } finally {
    simpleFormPreviewLoading.value = false;
  }
}

function refreshDocumentRowReference() {
  if (!documentRow.value?.slot?.id || !tableData.value?.rows?.length) {
    return;
  }

  const latestRow = tableData.value.rows.find((row) => row.slot?.id === documentRow.value.slot?.id);
  if (!latestRow) {
    return;
  }

  documentRow.value = latestRow;
  if (documentSimpleFillVisible.value) {
    editingRow.value = latestRow;
  }
}

function getSimpleFieldValue(field) {
  if (!field) {
    return "";
  }
  return simpleFormValues.value[field.field_key] || "";
}

function setSimpleFieldValue(field, value) {
  if (!field) {
    return;
  }
  simpleFormValues.value[field.field_key] = value;
}

function getSimpleFieldInputType(field) {
  if (field?.field_type === "number") {
    return "number";
  }
  if (field?.field_type === "date") {
    return "date";
  }
  return "text";
}

function formatSimpleDateValue(value) {
  const text = String(value || "").trim();
  if (!text) {
    return "";
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    const [year, month, day] = text.split("-");
    return `${day}/${month}/${year}`;
  }
  return text;
}

async function handleSimpleFormDownload() {
  if (!simpleFormDocumentId.value) {
    return;
  }

  try {
    const result = await getOnlineSummaryDetail(simpleFormDocumentId.value);
    const filenameBase = String(documentRow.value?.entry?.display_name || documentRow.value?.slot?.title || "candidate-summary").trim();
    downloadOnlineSummaryAsWord(result?.data || {}, filenameBase || "candidate-summary");
  } catch (error) {
    errorMessage.value = error.message || t("document.loadFailed");
  }
}

function getSimpleTextareaRows(field) {
  const normalized = normalizeSimpleFieldText(field?.display_label || field?.field_label || field?.field_key || "");
  if (normalized.includes("professional") || normalized.includes("workexperience")) {
    return 8;
  }
  if (normalized.includes("introduction") || normalized.includes("companyprofile")) {
    return 6;
  }
  if (normalized.includes("motivation") || normalized.includes("whydoyouwanttojoin")) {
    return 6;
  }
  return 5;
}

function getOnlineSummaryDocument(items = []) {
  return (
    items.find((item) => item?.source_type === "online" && item?.document_kind === "candidate_summary") ||
    items.find((item) => item?.document_kind === "candidate_summary") ||
    null
  );
}

function buildOnlineSummaryPayload() {
  return {
    form_id: formId.value,
    slot_id: editingRow.value?.slot?.id,
    name: getSimpleFieldValue(getResolvedSimpleField("name")).trim(),
    date_of_birth: getSimpleFieldValue(getResolvedSimpleField("birthDate")).trim(),
    gender: getSimpleFieldValue(getResolvedSimpleField("gender")).trim(),
    nationality: getSimpleFieldValue(getResolvedSimpleField("nationality")).trim(),
    organization_name: getSimpleFieldValue(getResolvedSimpleField("organization")).trim(),
    position: getSimpleFieldValue(getResolvedSimpleField("position")).trim(),
    assets: getSimpleFieldValue(getResolvedSimpleField("assets")).trim(),
    employees: getSimpleFieldValue(getResolvedSimpleField("employees")).trim(),
    revenue: getSimpleFieldValue(getResolvedSimpleField("revenue")).trim(),
    industry: getSimpleFieldValue(getResolvedSimpleField("industry")).trim(),
    work_experiences: simpleFormWorkRows.value.map((row) => ({
      dates_of_employment: getSimpleFieldValue(row.date).trim(),
      organization: getSimpleFieldValue(row.organization).trim(),
      position_title: getSimpleFieldValue(row.position).trim(),
    })),
    education_backgrounds: simpleFormEducationRows.value.map((row) => ({
      dates_of_attendance: getSimpleFieldValue(row.date).trim(),
      institution: getSimpleFieldValue(row.institution).trim(),
      field_of_study: getSimpleFieldValue(row.fieldOfStudy).trim(),
      degree_obtained: getSimpleFieldValue(row.degree).trim(),
    })),
    introduction: getSimpleFieldValue(getResolvedSimpleField("introduction")).trim(),
    professional_experience: getSimpleFieldValue(getResolvedSimpleField("professionalExperience")).trim(),
    program_motivation: getSimpleFieldValue(getResolvedSimpleField("motivation")).trim(),
    note: getSimpleFieldValue(getResolvedSimpleField("note")).trim(),
  };
}

function applyOnlineSummaryDetail(detail) {
  simpleFormValues.value = {
    [getResolvedSimpleField("name").field_key]: detail?.name || "",
    [getResolvedSimpleField("birthDate").field_key]: detail?.date_of_birth || "",
    [getResolvedSimpleField("gender").field_key]: detail?.gender || "",
    [getResolvedSimpleField("nationality").field_key]: detail?.nationality || "",
    [getResolvedSimpleField("organization").field_key]: detail?.organization_name || "",
    [getResolvedSimpleField("position").field_key]: detail?.position || "",
    [getResolvedSimpleField("assets").field_key]: detail?.assets || "",
    [getResolvedSimpleField("employees").field_key]: detail?.employees || "",
    [getResolvedSimpleField("revenue").field_key]: detail?.revenue || "",
    [getResolvedSimpleField("industry").field_key]: detail?.industry || "",
    [getResolvedSimpleField("introduction").field_key]: detail?.introduction || "",
    [getResolvedSimpleField("professionalExperience").field_key]: detail?.professional_experience || "",
    [getResolvedSimpleField("motivation").field_key]: detail?.program_motivation || "",
    [getResolvedSimpleField("note").field_key]: detail?.note || "",
  };

  simpleFormWorkRows.value.forEach((row, index) => {
    const item = detail?.work_experiences?.[index] || {};
    simpleFormValues.value[row.date.field_key] = item?.dates_of_employment || "";
    simpleFormValues.value[row.organization.field_key] = item?.organization || "";
    simpleFormValues.value[row.position.field_key] = item?.position_title || "";
  });

  simpleFormEducationRows.value.forEach((row, index) => {
    const item = detail?.education_backgrounds?.[index] || {};
    simpleFormValues.value[row.date.field_key] = item?.dates_of_attendance || "";
    simpleFormValues.value[row.institution.field_key] = item?.institution || "";
    simpleFormValues.value[row.fieldOfStudy.field_key] = item?.field_of_study || "";
    simpleFormValues.value[row.degree.field_key] = item?.degree_obtained || "";
  });
}

async function openInterviewerPreview(row, event) {
  interviewerReviewRow.value = row;
  interviewerPreviewHtml.value = "";
  interviewerPreviewLoading.value = true;
  interviewerReviewLoading.value = true;
  interviewerReviewResult.value = "pending";
  interviewerReviewComment.value = "";
  interviewerReviewItems.value = [];
  interviewerPreviewFullscreen.value = false;
  interviewerReviewDialog.value?.showModal();

  try {
    const tasks = [];
    const previewableDocument = getPreviewableDocument(row);

    if (previewableDocument?.id) {
      tasks.push(
        previewDocument(previewableDocument.id).then((result) => {
          interviewerPreviewHtml.value = result?.data?.html || "";
        })
      );
    }

    if (row?.entry?.id) {
      tasks.push(
        listReviews(row.entry.id).then((result) => {
          const reviews = normalizeReviewPayload(result);
          interviewerReviewItems.value = Array.isArray(reviews)
            ? reviews.map((item, itemIndex) => normalizeReviewItem(item, itemIndex))
            : [];

          if (canEditInterviewReview.value) {
            const latestReview = Array.isArray(reviews) && reviews.length ? reviews[0] : null;
            interviewerReviewResult.value = latestReview?.result || latestReview?.review_result || latestReview?.status || "pending";
            interviewerReviewComment.value =
              latestReview?.comment || latestReview?.review_comment || latestReview?.remarks || latestReview?.content || "";
          }
        })
      );
    }

    await Promise.all(tasks);
  } catch (error) {
    errorMessage.value = error.message || t("document.previewFailed");
  } finally {
    interviewerPreviewLoading.value = false;
    interviewerReviewLoading.value = false;
  }
}

function handleDocumentAction(row, event) {
  if (isInterviewer.value) {
    openInterviewerPreview(row, event);
    return;
  }

  openDocumentDialog(row, event);
}

function closeInterviewerReviewDialog() {
  interviewerReviewDialog.value?.close();
}

async function openReviewStatusDialog(row) {
  if (!row?.entry?.id) return;

  reviewStatusRow.value = row;
  reviewStatusLoading.value = true;
  reviewStatusItems.value = [];
  reviewStatusSummary.value = {
    candidateName: "",
    teamName: "",
    evaluatedCount: 0,
    totalInterviewerCount: null,
  };
  reviewStatusDialog.value?.showModal();

  if (!canViewReviewStatusDetail.value) {
    reviewStatusLoading.value = false;
    errorMessage.value = "";
    return;
  }

  try {
    const result = await getFormEntryReviews(formId.value, row.entry.id);
    const payload = result?.data?.data || result?.data || result || {};
    const reviews = Array.isArray(payload?.reviews) ? payload.reviews : [];
    const items = reviews.map((item, index) => ({
      reviewer: item?.interviewer_name || `${reviewerNameLabel.value} ${index + 1}`,
      reviewStatus: item?.review_status || "",
      admissionStatus: item?.admission_status || "-",
      result: item?.result || "pending",
      comment: item?.comment || "",
      updatedAt: item?.updated_at || item?.created_at || "",
    }));

    reviewStatusSummary.value = {
      candidateName: payload?.candidate_name || "",
      teamName: payload?.team_name || "",
      evaluatedCount: Number(payload?.evaluated_count || 0),
      totalInterviewerCount: payload?.total_interviewer_count ?? null,
    };
    reviewStatusItems.value = items;
  } catch (error) {
    if (error?.status === 403) {
      errorMessage.value = reviewStatusNoPermissionLabel.value;
      closeReviewStatusDialog();
      return;
    }
    errorMessage.value = error.message || t("common.loading");
  } finally {
    reviewStatusLoading.value = false;
  }
}

function closeReviewStatusDialog() {
  reviewStatusDialog.value?.close();
}

function resetReviewStatusDialog() {
  reviewStatusLoading.value = false;
  reviewStatusRow.value = null;
  reviewStatusItems.value = [];
  reviewStatusSummary.value = {
    candidateName: "",
    teamName: "",
    evaluatedCount: 0,
    totalInterviewerCount: null,
  };
}

function toggleInterviewerPreviewFullscreen() {
  interviewerPreviewFullscreen.value = !interviewerPreviewFullscreen.value;
}

function resetInterviewerReviewDialog() {
  interviewerReviewRow.value = null;
  interviewerPreviewLoading.value = false;
  interviewerPreviewHtml.value = "";
  interviewerReviewLoading.value = false;
  interviewerReviewSaving.value = false;
  interviewerReviewResult.value = "pending";
  interviewerReviewComment.value = "";
  interviewerReviewItems.value = [];
  interviewerPreviewFullscreen.value = false;
}

async function submitInterviewerReview() {
  if (!interviewerReviewRow.value?.entry?.id) return;

  interviewerReviewSaving.value = true;
  errorMessage.value = "";

  try {
    await saveReview(interviewerReviewRow.value.entry.id, {
      result: interviewerReviewResult.value,
      comment: interviewerReviewComment.value.trim(),
    });
    const refreshedReviews = await listReviews(interviewerReviewRow.value.entry.id).catch(() => null);
    if (refreshedReviews) {
      const reviews = normalizeReviewPayload(refreshedReviews);
      interviewerReviewItems.value = Array.isArray(reviews)
        ? reviews.map((item, itemIndex) => normalizeReviewItem(item, itemIndex))
        : [];
    }
    reviewResultStateMap.value = {
      ...reviewResultStateMap.value,
      [String(interviewerReviewRow.value.entry.id)]: interviewerReviewResult.value,
    };
    closeInterviewerReviewDialog();
  } catch (error) {
    errorMessage.value = error.message || t("common.save");
  } finally {
    interviewerReviewSaving.value = false;
  }
}

function resetDeleteDialogState() {
  deletingRow.value = null;
}

function closeDeleteDialog() {
  if (deleteDialog.value?.open) {
    closeDialogWithAnimation(deleteDialog);
    return;
  }
  resetDeleteDialogState();
}

function openDeleteDialog(row, event) {
  deletingRow.value = row;
  openDialogWithAnimation(deleteDialog, {
    originPoint: getDialogOriginFromEvent(event, {
      x: window.innerWidth * 0.72,
      y: window.innerHeight * 0.34,
    }),
  });
}

const availableSlotOptions = computed(() => moveSlotOptions.value.filter((option) => !option.disabled));

function resetMoveSlotDialogState() {
  movingRow.value = null;
  targetSlotId.value = "";
}

function closeMoveSlotDialog() {
  if (moveSlotDialog.value?.open) {
    closeDialogWithAnimation(moveSlotDialog);
    return;
  }
  resetMoveSlotDialogState();
}

function openMoveSlotDialog(row, event) {
  if (isSlotDisabledRow(row)) {
    return;
  }
  movingRow.value = row;
  targetSlotId.value = "";
  documentRow.value = null;
  editorVisible.value = false;
  openDialogWithAnimation(moveSlotDialog, {
    originPoint: getDialogOriginFromEvent(event, {
      x: window.innerWidth * 0.72,
      y: window.innerHeight * 0.34,
    }),
  });
}

async function toggleDisabledMoveSlot(option) {
  if (!isAdminViewer.value || !option?.label || togglingDisabledSlot.value) {
    return;
  }

  const fallbackSlots = (tableData.value?.rows || []).map((row) => ({
    id: row?.slot?.id,
    title: String(row?.slot?.title || "").trim(),
    is_active: normalizeDesignerSlot(row?.slot).is_active,
  }));
  const baseSlots = Array.isArray(designerConfig.value?.slot_details) && designerConfig.value.slot_details.length
    ? designerConfig.value.slot_details
    : fallbackSlots;
  const nextSlots = baseSlots
    .map((slot) => normalizeDesignerSlot(slot))
    .filter((slot) => slot.title)
    .map((slot) => (
      slot.title === option.label
        ? { ...slot, is_active: !slot.is_active }
        : slot
    ));

  togglingDisabledSlot.value = true;
  errorMessage.value = "";

  try {
    await saveSimpleDesigner(formId.value, {
      headers: designerConfig.value?.headers || [],
      required_headers: designerConfig.value?.required_headers || [],
      slots: nextSlots.map((slot) => ({
        title: slot.title,
        is_active: slot.is_active !== false,
      })),
    });
    designerConfig.value = buildDesignerConfigPayload({
      ...(designerConfig.value || {}),
      slots: nextSlots.map((slot) => ({
        title: slot.title,
        is_active: slot.is_active !== false,
      })),
      slot_details: nextSlots,
    });
    tableData.value = tableData.value
      ? {
          ...tableData.value,
          rows: (tableData.value.rows || []).map((row) => {
            const rowTitle = normalizeSlotMatchKey(row?.slot?.title);
            const matchedSlot = nextSlots.find((slot) => normalizeSlotMatchKey(slot.title) === rowTitle);
            if (!matchedSlot) {
              return row;
            }

            return {
              ...row,
              slot: {
                ...(row?.slot || {}),
                is_active: matchedSlot.is_active,
              },
            };
          }),
        }
      : tableData.value;
    if (nextSlots.find((slot) => slot.title === option.label)?.is_active === false && targetSlotId.value === option.value) {
      targetSlotId.value = "";
    }
    setCachedResource(tableCacheKey.value, {
      currentUser: currentUser.value,
      tableData: tableData.value,
      designerConfig: designerConfig.value,
    });
  } catch (error) {
    errorMessage.value = error.message || t("common.save");
  } finally {
    togglingDisabledSlot.value = false;
  }
}

function validateLegacyCurrentOperatorName(value) {
  const normalizedValue = String(value || "");
  const trimmedValue = normalizedValue.trim();

  if (!trimmedValue) {
    return currentUiLanguage.value === "en-US" ? "Name is required." : "姓名不能为空";
  }

  if (/\s/.test(normalizedValue)) {
    return currentUiLanguage.value === "en-US" ? "Name cannot contain spaces." : "姓名不能包含空格";
  }

  if (trimmedValue.length < 2 || trimmedValue.length > 64) {
    return currentUiLanguage.value === "en-US" ? "Name must be 2 to 64 characters." : "姓名长度需为2到64个字符";
  }

  return "";
}

function openLegacyCurrentOperatorDialog() {
  if (currentOperatorDialog.value?.open) {
    return;
  }

  currentOperatorNameError.value = "";
  openDialogWithAnimation(currentOperatorDialog, {
    originPoint: {
      x: window.innerWidth / 2,
      y: window.innerHeight * 0.22,
    },
  });
}

function handleLegacyCurrentOperatorNameInput(event) {
  currentOperatorNameValue.value = String(event?.target?.value || "");
  currentOperatorNameError.value = "";
}

async function ensureLegacyCurrentOperatorProfile() {
  if (currentUser.value?.role !== "interviewer") {
    return;
  }

  try {
    const result = await fetchInterviewerProfile();
    const profile = result?.data || {};
    const displayName = String(profile?.current_operator_name || "").trim();

    currentOperatorNameValue.value = displayName;

    if (!profile?.has_current_operator_name) {
      await nextTick();
      openCurrentOperatorDialog();
    }
  } catch (error) {
    errorMessage.value = error.message || (currentUiLanguage.value === "en-US" ? "Failed to load interviewer profile." : "获取面试官信息失败");
  }
}

async function submitLegacyCurrentOperatorName() {
  const validationMessage = validateLegacyCurrentOperatorName(currentOperatorNameValue.value);
  if (validationMessage) {
    currentOperatorNameError.value = validationMessage;
    return;
  }

  currentOperatorNameSubmitting.value = true;
  currentOperatorNameError.value = "";

  try {
    const result = await updateInterviewerProfile(String(currentOperatorNameValue.value).trim());
    const profile = result?.data || {};
    const nextDisplayName = String(profile?.current_operator_name || "").trim();
    const nextUser = {
      ...(currentUser.value || {}),
      current_operator_name: nextDisplayName,
      has_current_operator_name: !!profile?.has_current_operator_name,
      real_name: nextDisplayName || currentUser.value?.real_name || "",
    };

    currentUser.value = nextUser;
    if (typeof window !== "undefined") {
      window.dispatchEvent(
        new CustomEvent("app:current-user-updated", {
          detail: { user: nextUser },
        })
      );
    }
    closeDialogWithAnimation(currentOperatorDialog);
  } catch (error) {
    currentOperatorNameError.value = error.message || (currentUiLanguage.value === "en-US" ? "Failed to save interviewer name." : "保存面试官姓名失败");
  } finally {
    currentOperatorNameSubmitting.value = false;
  }
}

function validateCurrentOperatorName(value) {
  const trimmedValue = String(value || "").trim();

  if (!trimmedValue) {
    return currentUiLanguage.value === "en-US" ? "Current operator name is required." : "当前使用人姓名不能为空";
  }

  if (trimmedValue.length < 2 || trimmedValue.length > 64) {
    return currentUiLanguage.value === "en-US" ? "Current operator name must be 2 to 64 characters." : "当前使用人姓名长度需为2到64个字符";
  }

  return "";
}

function openCurrentOperatorDialog() {
  if (currentOperatorDialog.value?.open) {
    return;
  }

  currentOperatorDialogMode.value = currentOperatorDialogMode.value || "required";
  currentOperatorNameError.value = "";
  openDialogWithAnimation(currentOperatorDialog, {
    originPoint: {
      x: window.innerWidth / 2,
      y: window.innerHeight * 0.22,
    },
  });
}

function handleCurrentOperatorNameInput(event) {
  currentOperatorNameValue.value = String(event?.target?.value || "");
  currentOperatorNameError.value = "";
}

async function ensureCurrentOperatorProfile() {
  if (currentUser.value?.role !== "interviewer") {
    return;
  }

  try {
    const result = await fetchInterviewerProfile();
    const profile = result?.data || {};
    interviewerProfileState.value = {
      accountRealName: String(profile?.account_real_name || currentUser.value?.account_real_name || currentUser.value?.real_name || "").trim(),
      currentOperatorName: String(profile?.current_operator_name || "").trim(),
      hasCurrentOperatorName: !!profile?.has_current_operator_name,
    };
    currentOperatorNameValue.value = interviewerProfileState.value.currentOperatorName;
    if (interviewerProfileState.value.hasCurrentOperatorName) {
      markCurrentOperatorPromptHandled();
      return;
    }
  } catch (error) {
    errorMessage.value = error.message || (currentUiLanguage.value === "en-US" ? "Failed to load interviewer profile." : "获取面试官信息失败");
  }

  if (getCurrentOperatorPromptHandled()) {
    return;
  }

  await nextTick();
  openCurrentOperatorDialog();
  markCurrentOperatorPromptHandled();
}

async function submitCurrentOperatorName() {
  const validationMessage = validateCurrentOperatorName(currentOperatorNameValue.value);
  if (validationMessage) {
    currentOperatorNameError.value = validationMessage;
    return;
  }

  currentOperatorNameSubmitting.value = true;
  currentOperatorNameError.value = "";

  try {
    const result = await updateInterviewerProfile(String(currentOperatorNameValue.value).trim());
    const profile = result?.data || {};
    interviewerProfileState.value = {
      accountRealName: String(profile?.account_real_name || interviewerProfileState.value.accountRealName || currentUser.value?.account_real_name || currentUser.value?.real_name || "").trim(),
      currentOperatorName: String(profile?.current_operator_name || "").trim(),
      hasCurrentOperatorName: !!profile?.has_current_operator_name,
    };
    currentOperatorNameValue.value = interviewerProfileState.value.currentOperatorName;
    markCurrentOperatorPromptHandled();
    closeDialogWithAnimation(currentOperatorDialog);
  } catch (error) {
    currentOperatorNameError.value =
      error?.response?.data?.message ||
      error?.payload?.message ||
      error.message ||
      (currentUiLanguage.value === "en-US" ? "Failed to save current operator name." : "保存当前使用人姓名失败");
  } finally {
    currentOperatorNameSubmitting.value = false;
  }
}

async function loadPage() {
  const cached = getCachedResource(tableCacheKey.value);
  if (cached) {
    currentUser.value = cached.currentUser || currentUser.value;
    designerConfig.value = cached.designerConfig || designerConfig.value;
    tableData.value = cached.tableData
      ? {
          ...cached.tableData,
          rows: applyDesignerSlotStateToRows(cached.tableData.rows || [], cached.designerConfig?.slot_details || []),
        }
      : tableData.value;
    loading.value = false;
  } else {
    loading.value = true;
  }
  errorMessage.value = "";
  try {
    const [me, tableResult] = await Promise.all([fetchCurrentUser(), getFormTable(formId.value, { ui_lang: currentUiLanguage.value })]);
    currentUser.value = me;
    tableData.value = tableResult?.data || null;

    const designerResult = await getSimpleDesigner(formId.value).catch(() => null);
    designerConfig.value = designerResult?.data ? buildDesignerConfigPayload(designerResult.data) : null;
    tableData.value = tableData.value
      ? {
          ...tableData.value,
          rows: applyDesignerSlotStateToRows(tableData.value.rows || [], designerConfig.value?.slot_details || []),
        }
      : tableData.value;

    await Promise.all([loadInterviewerDocumentStates(tableData.value?.rows || []), loadInterviewerReviewStates(tableData.value?.rows || [])]);
    setCachedResource(tableCacheKey.value, {
      currentUser: me,
      tableData: tableData.value,
      designerConfig: designerConfig.value,
    });
  } catch (error) {
    errorMessage.value = error.message || t("common.loading");
  } finally {
    loading.value = false;
    if (currentUser.value?.role === "interviewer" && !errorMessage.value) {
      await nextTick();
      await ensureCurrentOperatorProfile();
    }
  }
}

async function handleSaveEntry() {
  if (!editingRow.value) return;
  saving.value = true;
  errorMessage.value = "";
  try {
    if (documentSimpleFillVisible.value) {
      const payload = buildOnlineSummaryPayload();
      if (!payload.name) {
        throw new Error(currentUiLanguage.value === "en-US" ? "Name is required." : "姓名为必填项");
      }

      if (simpleFormDocumentId.value) {
        await updateOnlineSummary(simpleFormDocumentId.value, payload);
      } else {
        const result = await createOnlineSummary(payload);
        simpleFormDocumentId.value = result?.data?.document_id || null;
      }
      await loadPage();
      refreshDocumentRowReference();
      closeSimpleFillInDocumentDialog();
      return;
    }

    validatePersonalEntryValues();

    if (editingRow.value.entry?.id) {
      await updateEntry(editingRow.value.entry.id, { values: entryValues.value });
    } else {
      await createEntry(formId.value, {
        slot_id: editingRow.value.slot.id,
        values: entryValues.value,
      });
    }
    closeDialogWithAnimation(editorDialog, {
      afterClose: () => {
        loadPage();
      },
    });
  } catch (error) {
    errorMessage.value = error.message || t("common.save");
  } finally {
    saving.value = false;
  }
}

async function handleDeleteEntry(row) {
  if (!row?.entry?.id || !tableData.value?.rows?.length) return;
  const targetRow = tableData.value.rows.find((item) => item.slot?.id === row.slot?.id);
  if (!targetRow) return;

  targetRow.entry = null;
  targetRow.values = {};
  targetRow.status = "empty";
  targetRow.can_fill = true;
  targetRow.can_edit = false;
  targetRow.can_view = true;
  targetRow.can_upload_document = false;
  targetRow.can_delete_document = false;
}

async function confirmDeleteEntry() {
  if (!deletingRow.value?.entry?.id) return;
  deletingEntry.value = true;
  errorMessage.value = "";
  try {
    const deletedEntryId = deletingRow.value.entry.id;
    const deletedRow = deletingRow.value;
    await deleteEntry(deletedEntryId);
    handleDeleteEntry(deletedRow);
    if (documentRow.value?.entry?.id === deletedEntryId) {
      documentRow.value = null;
    }
    if (movingRow.value?.entry?.id === deletedEntryId) {
      closeMoveSlotDialog();
    }
    closeDialogWithAnimation(deleteDialog, {
      afterClose: () => {
        window.setTimeout(() => {
          loadPage();
        }, 180);
      },
    });
  } catch (error) {
    errorMessage.value = error.message || t("fill.delete");
  } finally {
    deletingEntry.value = false;
  }
}

async function handleMoveSlot() {
  if (!movingRow.value?.entry?.id || !targetSlotId.value) return;
  movingSlot.value = true;
  errorMessage.value = "";
  try {
    await moveEntrySlot(movingRow.value.entry.id, targetSlotId.value);
    closeDialogWithAnimation(moveSlotDialog, {
      afterClose: () => {
        loadPage();
      },
    });
  } catch (error) {
    errorMessage.value = error.message || t("fill.changeSlot");
  } finally {
    movingSlot.value = false;
  }
}

function handleInterviewerAccessGranted() {
  loadPage();
}

function openCurrentOperatorEditDialog() {
  currentOperatorDialogMode.value = "edit";
  currentOperatorNameValue.value = interviewerProfileState.value.currentOperatorName || "";
  currentOperatorNameError.value = "";
  openCurrentOperatorDialog();
}

function getCurrentOperatorPromptHandled() {
  if (typeof window === "undefined") {
    return false;
  }

  return window.sessionStorage.getItem(currentOperatorPromptStorageKey.value) === "1";
}

function markCurrentOperatorPromptHandled() {
  if (typeof window === "undefined") {
    return;
  }

  window.sessionStorage.setItem(currentOperatorPromptStorageKey.value, "1");
}

async function returnToPreviousPage() {
  closeDialogWithAnimation(currentOperatorDialog, {
    afterClose: async () => {
      if (window.history.length > 1) {
        await router.back();
        return;
      }

      await router.push("/forms");
    },
  });
}

function handleCurrentOperatorSecondaryAction() {
  if (currentOperatorDialogMode.value === "edit") {
    closeDialogWithAnimation(currentOperatorDialog);
    return;
  }

  returnToPreviousPage();
}

onMounted(loadPage);

onBeforeUnmount(() => {
  resetDialogMotion(editorDialog);
  resetDialogMotion(documentDialog);
  resetDialogMotion(currentOperatorDialog);
  resetDialogMotion(reviewStatusDialog);
  resetDialogMotion(simpleFormPreviewDialog);
  resetDialogMotion(simpleFormPreviewConfirmDialog);
  resetDialogMotion(deleteDialog);
  resetDialogMotion(moveSlotDialog);
  window.removeEventListener("app:interviewer-access-granted", handleInterviewerAccessGranted);
});

onMounted(() => {
  window.addEventListener("app:interviewer-access-granted", handleInterviewerAccessGranted);
});

watch(currentUiLanguage, () => {
  loadPage();
});
</script>

<template>
  <ErrorAlert :message="errorMessage" />
  <LoadingBlock v-if="loading" :label="t('common.loading')" />

  <div v-else-if="tableData" class="fill-page">
    <dialog ref="currentOperatorDialog" class="modal-dialog interviewer-name-dialog" @cancel.prevent>
      <div class="modal-shell interviewer-name-dialog-shell">
        <div class="modal-surface interviewer-name-dialog-surface">
          <div class="panel-header modal-header interviewer-name-dialog-header">
            <h3>{{ currentOperatorDialogTitle }}</h3>
          </div>
          <form class="panel-body stack-form modal-body interviewer-name-dialog-body" @submit.prevent="submitCurrentOperatorName">
            <label class="field-block interviewer-name-field">
              <span>{{ currentOperatorFieldLabel }}</span>
              <input
                :value="currentOperatorNameValue"
                type="text"
                autofocus
                maxlength="64"
                :disabled="currentOperatorNameSubmitting"
                :placeholder="currentOperatorPlaceholder"
                @input="handleCurrentOperatorNameInput"
              />
            </label>
            <p v-if="currentOperatorNameError" class="error-alert" role="alert">{{ currentOperatorNameError }}</p>
            <div class="form-actions interviewer-name-dialog-actions">
              <button class="btn btn-secondary" type="button" @click="handleCurrentOperatorSecondaryAction">
                {{ currentOperatorDialogMode === "edit" ? "取消" : currentOperatorBackLabel }}
              </button>
              <button class="btn btn-primary" type="submit" :disabled="currentOperatorNameSubmitting">
                {{ currentOperatorNameSubmitting ? t("forms.submitting") : currentOperatorConfirmLabel }}
              </button>
            </div>
          </form>
        </div>
      </div>
    </dialog>

    <section class="fill-hero panel">
      <CodeFlowBackdrop variant="banner" />
      <div class="fill-hero-body" :class="{ 'fill-hero-body--interviewer': isInterviewer }">
        <img v-if="!isInterviewer" class="fill-hero-logo" :src="bossKnowLogo" alt="BOSS KNOW" />
        <div class="fill-hero-copy">
          <h2 id="fill-form-title" class="fill-hero-title">
            {{ tableData.form.display_title || tableData.form.title }}<template v-if="!isInterviewer"> - {{ t("fill.heroTitleSuffix") }}</template>
          </h2>
          <p id="fill-form-meta" class="muted-text fill-hero-meta">
            {{ t("fill.currentStatus", { status: getFormStatusLabel(tableData.form.status) }) }}
          </p>
        </div>
      </div>
    </section>

    <section v-if="isInterviewer" class="panel fill-panel">
      <div class="panel-body fill-panel-body">
        <div class="fill-panel-head">
          <div class="fill-panel-intro">
            <div class="fill-panel-titlewrap">
              <h2>{{ accountRealNameLabel }}：{{ accountRealNameDisplay }}</h2>
              <p class="muted-text fill-note">{{ currentOperatorSummaryLabel }}：{{ currentOperatorNameDisplay }}</p>
            </div>
          </div>
          <div class="form-actions fill-panel-actions">
            <button class="btn btn-secondary" type="button" @click="openCurrentOperatorEditDialog">修改名字</button>
          </div>
        </div>
      </div>
    </section>

    <dialog ref="editorDialog" class="modal-dialog fill-editor-dialog" @close="resetEditorState">
        <div class="modal-shell fill-editor-dialog-shell">
          <div class="modal-surface fill-editor-dialog-surface">
            <div class="panel-header modal-header fill-editor-dialog-header">
              <h3>{{ editingRow?.entry?.id ? t("fill.edit") : t("fill.contentTitle") }}</h3>
              <div class="form-actions fill-editor-dialog-header-actions">
                <button class="btn btn-primary" type="submit" form="fill-editor-form" :disabled="saving">
                  {{ saving ? t("fill.submitting") : t("fill.submit") }}
                </button>
                <button class="btn btn-secondary" type="button" :disabled="saving" @click="closeEditor">{{ t("common.cancel") }}</button>
              </div>
            </div>
            <form
              v-if="editorVisible && editingRow"
              id="fill-editor-form"
              class="stack-form panel-body modal-body fill-editor-dialog-body"
              @submit.prevent="handleSaveEntry"
            >
            <label v-for="field in visibleFields" :key="field.id" class="field-block">
              <span>{{ getLocalizedFieldLabel(field) }}<em v-if="getFieldRequiredMark(field)"> *</em></span>
              <UiSelect
                v-if="getBubbleSelectKind(field)"
                v-model="entryValues[field.field_key]"
                class="fill-editor-select"
                :options="getBubbleSelectOptions(field)"
                :disabled="saving || isFieldReadOnly(field)"
                :placeholder="t('common.select')"
              />
              <textarea
                v-else-if="field.field_type === 'textarea'"
                v-model="entryValues[field.field_key]"
                rows="3"
                :required="getFieldRequiredMark(field)"
              />
              <input
                v-else
                v-model="entryValues[field.field_key]"
                :type="field.field_type === 'number' ? 'number' : field.field_type === 'date' ? 'date' : 'text'"
                :required="getFieldRequiredMark(field)"
              />
            </label>
          </form>
        </div>
      </div>
    </dialog>

    <section class="panel fill-panel">
      <div class="panel-body fill-panel-body">
        <div class="fill-panel-head">
          <div class="fill-panel-intro">
            <div class="fill-panel-icon" aria-hidden="true">✦</div>
            <div class="fill-panel-titlewrap">
              <h2 id="fill-table-section-title">{{ t("fill.sectionTitle") }}</h2>
              <p v-if="!isInterviewer" id="fill-note" class="muted-text fill-note">{{ t("fill.note") }}</p>
            </div>
          </div>
          <button class="btn btn-secondary" type="button" @click="loadPage">{{ t("fill.refreshStatus") }}</button>
        </div>
        <div class="fill-panel-divider"></div>

        <EmptyState v-if="!tableData.rows.length" :title="t('common.noData')" />
        <div v-else class="table-wrap fill-table-wrap">
          <table class="data-table excel-table">
            <thead>
              <tr>
                <th>{{ t("fill.timeSlot") }}</th>
                <th v-for="field in visibleFields" :key="field.id">{{ getLocalizedFieldLabel(field) }}</th>
                <th v-if="showRecentUpdatedColumn">{{ t("fill.lastUpdatedAt") }}</th>
                <th v-if="showStatusColumn">{{ t("forms.status") }}</th>
                <th>{{ t("fill.action") }}</th>
                <th v-if="isInterviewer">{{ reviewerResultColumnLabel }}</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="row in tableData.rows" :key="row.slot.id" :class="{ 'fill-slot-disabled-row': isSlotDisabledRow(row) }">
                <td>{{ row.slot.title }}</td>
                <td
                  v-for="field in visibleFields"
                  :key="`${row.slot.id}-${field.id}`"
                  :class="{ 'fill-admission-cell': isAdmissionField(field) && (row.values?.[field.field_key]?.display_value || row.values?.[field.field_key]?.value) }"
                  :data-admission-label="isAdmissionField(field) ? getLocalizedFieldValue(field, row.values?.[field.field_key]?.display_value || row.values?.[field.field_key]?.value || '') : ''"
                  :data-admission-tone="isAdmissionField(field) ? getAdmissionTone(row.values?.[field.field_key]?.display_value || row.values?.[field.field_key]?.value || '') : ''"
                >
                  {{ getTableCellDisplayValue(field, row) }}
                </td>
                <td v-if="showRecentUpdatedColumn" class="fill-last-updated-cell">
                  {{ getRowLatestUpdatedDisplay(row) }}
                </td>
                <td v-if="showStatusColumn">
                  <StatusBadge :text="getEntryStatusText(row)" :tone="getRowStatusTone(row)" />
                </td>
                <td>
                  <div class="form-actions fill-row-actions">
                    <span v-if="isOccupiedLockedRow(row)" class="fill-row-occupied-flag">{{ getOccupiedLockedActionLabel() }}</span>
                    <template v-else>
                      <button v-if="row.can_fill && !isRowFillDisabled(row)" class="btn btn-primary" type="button" @click="openEditor(row, $event)">{{ t("fill.fill") }}</button>
                      <button v-if="row.can_edit && !isSlotDisabledRow(row)" class="btn btn-secondary" type="button" @click="openEditor(row, $event)">{{ t("fill.edit") }}</button>
                      <button v-if="row.can_edit && row.entry?.id && !isSlotDisabledRow(row)" class="btn btn-secondary" type="button" @click="openMoveSlotDialog(row, $event)">{{ t("fill.changeSlot") }}</button>
                      <button
                        v-if="row.entry?.id"
                        class="btn"
                        :class="getDocumentActionButtonClass(row)"
                        type="button"
                        @click="handleDocumentAction(row, $event)"
                      >
                        {{ documentActionLabel }}
                      </button>
                      <button
                        v-if="isAdminViewer && row.entry?.id"
                        class="btn btn-secondary"
                        type="button"
                        @click="openInterviewerPreview(row, $event)"
                      >
                        {{ interviewDetailActionLabel }}
                      </button>
                      <button
                        v-if="isPersonalUser && row.entry?.id"
                        class="btn btn-secondary"
                        type="button"
                        @click="openReviewStatusDialog(row)"
                      >
                        {{ getReviewStatusButtonLabel(row) }}
                      </button>
                      <button v-if="row.can_edit && !isSlotDisabledRow(row)" class="btn btn-danger" type="button" @click="openDeleteDialog(row, $event)">{{ t("fill.delete") }}</button>
                    </template>
                  </div>
                </td>
                <td v-if="isInterviewer">
                  <StatusBadge
                    v-if="row.entry?.id"
                    :text="getReviewResultLabel(getReviewResultValue(row))"
                    :tone="getReviewResultTone(row)"
                  />
                  <span v-else class="interviewer-review-placeholder">-</span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </section>

    <section v-if="false && editorVisible && editingRow" id="entry-editor-panel" class="panel">
      <div class="panel-header">
        <h2 id="entry-editor-title">{{ t("fill.contentTitle") }}</h2>
      </div>
      <form class="stack-form panel-body" @submit.prevent="handleSaveEntry">
        <label v-for="field in visibleFields" :key="field.id" class="field-block">
          <span>{{ getLocalizedFieldLabel(field) }}<em v-if="getFieldRequiredMark(field)"> *</em></span>
          <UiSelect
            v-if="getBubbleSelectKind(field)"
            v-model="entryValues[field.field_key]"
            class="fill-editor-select"
            :options="getBubbleSelectOptions(field)"
            :disabled="saving || isFieldReadOnly(field)"
            :placeholder="t('common.select')"
          />
          <textarea
            v-else-if="field.field_type === 'textarea'"
            v-model="entryValues[field.field_key]"
            rows="3"
            :required="getFieldRequiredMark(field)"
          />
          <input
            v-else
            v-model="entryValues[field.field_key]"
            :type="field.field_type === 'number' ? 'number' : field.field_type === 'date' ? 'date' : 'text'"
            :required="getFieldRequiredMark(field)"
          />
        </label>
        <div class="form-actions">
          <button class="btn btn-primary" type="submit" :disabled="saving">{{ saving ? t("fill.submitting") : t("fill.submit") }}</button>
          <button class="btn btn-secondary" type="button" @click="closeEditor">{{ t("common.cancel") }}</button>
        </div>
      </form>
    </section>

    <dialog ref="interviewerReviewDialog" class="interviewer-review-dialog" :class="{ 'is-fullscreen': interviewerPreviewFullscreen }" @close="resetInterviewerReviewDialog">
      <div class="interviewer-review-shell">
        <section class="interviewer-review-panel interviewer-review-panel--preview">
          <div class="interviewer-review-head">
            <h3>{{ interviewerDialogTitle }}</h3>
          </div>
          <div class="interviewer-review-body">
            <div v-if="interviewerPreviewLoading" class="modal-note">{{ t("common.loading") }}</div>
            <div v-else-if="interviewerPreviewHtml" class="docx-preview-content document-preview-html" v-html="interviewerPreviewHtml" />
            <div v-else class="preview-box">{{ interviewerReviewEmpty }}</div>
          </div>
        </section>

        <section class="interviewer-review-panel interviewer-review-panel--editor">
          <div class="interviewer-review-head interviewer-review-head--editor">
            <h3>{{ interviewerReviewTitle }}</h3>
            <div class="form-actions interviewer-review-head-actions">
              <button class="btn btn-secondary document-preview-toggle-btn" type="button" @click="toggleInterviewerPreviewFullscreen">
                {{ interviewerPreviewToggleLabel }}
              </button>
              <button class="btn btn-secondary" type="button" @click="closeInterviewerReviewDialog">{{ t("common.close") }}</button>
              <button
                v-if="canEditInterviewReview"
                class="btn btn-primary interviewer-review-save"
                type="button"
                :disabled="interviewerReviewSaving"
                @click="submitInterviewerReview"
              >
                {{ interviewerReviewSaving ? t("document.saving") : t("common.save") }}
              </button>
            </div>
          </div>
          <div class="interviewer-review-body interviewer-review-body--editor">
            <div v-if="interviewerReviewLoading" class="modal-note">{{ t("common.loading") }}</div>
            <template v-else-if="canEditInterviewReview">
              <label class="field-block">
                <span>{{ interviewerReviewResultLabel }}</span>
                <UiSelect
                  v-model="interviewerReviewResult"
                  :options="reviewResultOptions"
                  :disabled="interviewerReviewSaving || !canEditInterviewReview"
                  :placeholder="t('common.select')"
                />
              </label>
              <label class="field-block interviewer-review-field">
                <span>{{ interviewerReviewCommentLabel }}</span>
                <textarea
                  v-model="interviewerReviewComment"
                  class="interviewer-review-textarea"
                  rows="18"
                  :disabled="interviewerReviewSaving || !canEditInterviewReview"
                  :readonly="!canEditInterviewReview"
                  :placeholder="interviewerReviewPlaceholder"
                />
              </label>
            </template>
            <template v-else>
              <div v-if="interviewerReviewItems.length" class="review-status-list interviewer-review-list">
                <article
                  v-for="(item, index) in interviewerReviewItems"
                  :key="`${interviewerReviewRow?.entry?.id || 'entry'}-interviewer-${index}`"
                  class="review-status-card"
                >
                  <div class="review-status-card-head">
                    <strong>{{ item.reviewer }}</strong>
                    <StatusBadge :text="getReviewResultLabel(item.result)" :tone="getReviewResultToneByValue(item.result)" />
                  </div>
                  <div class="review-status-card-meta">
                    <span>{{ reviewerUpdatedAtLabel }}</span>
                    <strong>{{ item.updatedAt ? formatDateTime(item.updatedAt) : "-" }}</strong>
                  </div>
                  <div class="review-status-card-body">
                    <span>{{ reviewerCommentLabel }}</span>
                    <p>{{ item.comment || "-" }}</p>
                  </div>
                </article>
              </div>
              <div v-else class="preview-box">{{ interviewerReviewListEmpty }}</div>
            </template>
          </div>
        </section>
      </div>
    </dialog>

    <dialog ref="reviewStatusDialog" class="modal-dialog review-status-dialog" @close="resetReviewStatusDialog">
      <div class="modal-shell review-status-dialog-shell">
        <div class="modal-surface review-status-dialog-surface">
          <div class="panel-header modal-header review-status-dialog-header">
            <div class="review-status-dialog-heading">
              <h3>{{ reviewStatusDialogTitle }}</h3>
              <p class="muted-text review-status-dialog-count">{{ reviewStatusCountLabel }}</p>
            </div>
            <button class="btn btn-secondary" type="button" @click="closeReviewStatusDialog">{{ t("common.close") }}</button>
          </div>
          <div class="panel-body stack-form modal-body review-status-dialog-body">
            <div v-if="reviewStatusLoading" class="modal-note">{{ t("common.loading") }}</div>
            <template v-else>
              <div class="review-status-summary">
                <div class="review-status-summary-item">
                  <span>{{ reviewStatusCandidateLabel }}</span>
                  <strong>{{ reviewStatusSummary.candidateName || "-" }}</strong>
                </div>
                <div class="review-status-summary-item">
                  <span>{{ reviewStatusTeamLabel }}</span>
                  <strong>{{ reviewStatusSummary.teamName || "-" }}</strong>
                </div>
                <div class="review-status-summary-item">
                  <span>{{ reviewerResultDisplayLabel }}</span>
                  <strong>{{ reviewStatusCountLabel }}</strong>
                </div>
              </div>
            <div v-if="reviewStatusItems.length" class="review-status-list">
              <article v-for="(item, index) in reviewStatusItems" :key="`${reviewStatusRow?.entry?.id || 'entry'}-${index}`" class="review-status-card">
                <div class="review-status-card-head">
                  <div class="review-status-card-meta">
                    <strong>{{ item.reviewer }}</strong>
                    <span>{{ reviewerNameLabel }}</span>
                  </div>
                  <StatusBadge :text="getReviewResultLabel(item.result)" :tone="getReviewResultToneByValue(item.result)" />
                </div>
                <div class="review-status-card-grid">
                  <div class="review-status-card-field" v-if="item.reviewStatus">
                    <span>{{ reviewerStatusLabel }}</span>
                    <strong>{{ item.reviewStatus }}</strong>
                  </div>
                  <div class="review-status-card-field">
                    <span>{{ reviewerAdmissionStatusLabel }}</span>
                    <strong>{{ item.admissionStatus || "-" }}</strong>
                  </div>
                  <div class="review-status-card-field">
                    <span>{{ reviewerUpdatedAtLabel }}</span>
                    <strong>{{ item.updatedAt ? formatDateTime(item.updatedAt) : "-" }}</strong>
                  </div>
                  <div class="review-status-card-field">
                    <span>{{ reviewerCommentLabel }}</span>
                    <p>{{ item.comment || "-" }}</p>
                  </div>
                </div>
              </article>
            </div>
            <div v-else class="preview-box">{{ canViewReviewStatusDetail ? reviewStatusEmptyLabel : reviewStatusNoPermissionLabel }}</div>
            </template>
          </div>
        </div>
      </div>
    </dialog>

    <dialog
      ref="documentDialog"
      class="modal-dialog fill-document-dialog"
      :class="{ 'is-simple-fill': documentSimpleFillVisible }"
      @close="resetDocumentDialogState"
    >
      <div class="modal-shell fill-document-dialog-shell">
        <div class="modal-surface fill-document-dialog-surface">
          <div class="panel-header modal-header fill-document-dialog-header">
            <h3>{{ documentDialogTitle }}</h3>
            <div class="form-actions fill-document-dialog-top-actions">
              <button
                v-if="documentSimpleFillVisible && simpleFormDocumentId"
                class="btn btn-secondary"
                type="button"
                :disabled="saving || simpleFormLoading"
                @click="handleSimpleFormDownload()"
              >
                {{ t("document.download") }}
              </button>
              <button v-if="documentSimpleFillVisible" class="btn btn-primary" type="button" :disabled="saving" @click="handleSaveEntry">
                {{ saving ? t("fill.submitting") : simpleFormSubmitLabel }}
              </button>
              <button class="btn btn-secondary" type="button" @click="closeDocumentDialog()">
                {{ t("common.close") }}
              </button>
            </div>
          </div>
          <div v-if="documentRow?.entry?.id" class="panel-body stack-form modal-body fill-document-dialog-body">
            <template v-if="!documentSimpleFillVisible">
              <DocumentManager
                :entry-id="documentRow.entry.id"
                :can-fill-simple="documentRow.can_fill || documentRow.can_edit"
                :can-upload="documentRow.can_upload_document"
                :can-delete="true"
                :embedded="true"
                @fill-simple="openSimpleFillFromDocumentDialog"
                @close-all="closeDocumentDialog"
                @updated="async () => { await loadPage(); refreshDocumentRowReference(); }"
              />

              <section class="panel fill-document-summary">
                <div class="panel-header compact">
                  <h3>{{ t("fill.currentRecord") }}</h3>
                </div>
                <div class="panel-body">
                  <pre class="value-summary">{{ buildValueSummary(documentRow.values) || t("fill.noContent") }}</pre>
                </div>
              </section>
            </template>

            <form v-else class="fill-simple-sheet-wrap" @submit.prevent="handleSaveEntry">
              <LoadingBlock v-if="simpleFormLoading" :label="t('common.loading')" />
              <section class="fill-simple-sheet">
                <header class="fill-simple-sheet-title">
                  <p>Candidate Summary Sheet</p>
                  <h4>候选人简表</h4>
                </header>

                <table class="fill-simple-grid">
                  <tbody>
                    <tr>
                      <th colspan="4" class="fill-simple-section">Basic Information<br />基本信息</th>
                    </tr>
                    <tr>
                      <td class="fill-simple-label">Name<br />姓名</td>
                      <td class="fill-simple-field" @click="focusSimpleFieldCell">
                        <input
                          :value="getSimpleFieldValue(getResolvedSimpleField('name'))"
                          :type="getSimpleFieldInputType(getResolvedSimpleField('name'))"
                          :required="getResolvedSimpleField('name').is_required"
                          @input="setSimpleFieldValue(getResolvedSimpleField('name'), $event.target.value)"
                        />
                      </td>
                      <td class="fill-simple-label">Date of Birth<br />出生日期<br />（格式: 日/月/年）</td>
                      <td class="fill-simple-field" @click="focusSimpleFieldCell">
                        <input
                          :value="getSimpleFieldValue(getResolvedSimpleField('birthDate'))"
                          :type="getSimpleFieldInputType(getResolvedSimpleField('birthDate'))"
                          :placeholder="formatSimpleDateValue(getSimpleFieldValue(getResolvedSimpleField('birthDate'))) || 'DD/MM/YYYY'"
                          :required="getResolvedSimpleField('birthDate').is_required"
                          @input="setSimpleFieldValue(getResolvedSimpleField('birthDate'), $event.target.value)"
                        />
                      </td>
                    </tr>
                    <tr>
                      <td class="fill-simple-label">Gender<br />性别</td>
                      <td class="fill-simple-field" @click="focusSimpleFieldCell">
                        <input
                          :value="getSimpleFieldValue(getResolvedSimpleField('gender'))"
                          :type="getSimpleFieldInputType(getResolvedSimpleField('gender'))"
                          :required="getResolvedSimpleField('gender').is_required"
                          @input="setSimpleFieldValue(getResolvedSimpleField('gender'), $event.target.value)"
                        />
                      </td>
                      <td class="fill-simple-label">Nationality<br />国籍</td>
                      <td class="fill-simple-field" @click="focusSimpleFieldCell">
                        <input
                          :value="getSimpleFieldValue(getResolvedSimpleField('nationality'))"
                          :type="getSimpleFieldInputType(getResolvedSimpleField('nationality'))"
                          :required="getResolvedSimpleField('nationality').is_required"
                          @input="setSimpleFieldValue(getResolvedSimpleField('nationality'), $event.target.value)"
                        />
                      </td>
                    </tr>
                    <tr>
                      <td class="fill-simple-label">Organization Name<br />公司名称</td>
                      <td colspan="2" class="fill-simple-field" @click="focusSimpleFieldCell">
                        <input
                          :value="getSimpleFieldValue(getResolvedSimpleField('organization'))"
                          :type="getSimpleFieldInputType(getResolvedSimpleField('organization'))"
                          :required="getResolvedSimpleField('organization').is_required"
                          @input="setSimpleFieldValue(getResolvedSimpleField('organization'), $event.target.value)"
                        />
                      </td>
                      <td class="fill-simple-field fill-simple-field--stacked" @click="focusSimpleFieldCell">
                        <span class="fill-simple-inline-label">Position<br />职务</span>
                        <input
                          :value="getSimpleFieldValue(getResolvedSimpleField('position'))"
                          :type="getSimpleFieldInputType(getResolvedSimpleField('position'))"
                          :required="getResolvedSimpleField('position').is_required"
                          @input="setSimpleFieldValue(getResolvedSimpleField('position'), $event.target.value)"
                        />
                      </td>
                    </tr>

                    <tr>
                      <th colspan="4" class="fill-simple-section">Company Profile<br />企业概况</th>
                    </tr>
                    <tr>
                      <td class="fill-simple-label">Assets<br />总资产</td>
                      <td class="fill-simple-field" @click="focusSimpleFieldCell">
                        <input
                          :value="getSimpleFieldValue(getResolvedSimpleField('assets'))"
                          :type="getSimpleFieldInputType(getResolvedSimpleField('assets'))"
                          @input="setSimpleFieldValue(getResolvedSimpleField('assets'), $event.target.value)"
                        />
                      </td>
                      <td class="fill-simple-label">Employees<br />员工人数</td>
                      <td class="fill-simple-field" @click="focusSimpleFieldCell">
                        <input
                          :value="getSimpleFieldValue(getResolvedSimpleField('employees'))"
                          :type="getSimpleFieldInputType(getResolvedSimpleField('employees'))"
                          @input="setSimpleFieldValue(getResolvedSimpleField('employees'), $event.target.value)"
                        />
                      </td>
                    </tr>
                    <tr>
                      <td class="fill-simple-label">Revenue<br />企业营收</td>
                      <td class="fill-simple-field" @click="focusSimpleFieldCell">
                        <input
                          :value="getSimpleFieldValue(getResolvedSimpleField('revenue'))"
                          :type="getSimpleFieldInputType(getResolvedSimpleField('revenue'))"
                          @input="setSimpleFieldValue(getResolvedSimpleField('revenue'), $event.target.value)"
                        />
                      </td>
                      <td class="fill-simple-label">Industry<br />公司行业</td>
                      <td class="fill-simple-field" @click="focusSimpleFieldCell">
                        <input
                          :value="getSimpleFieldValue(getResolvedSimpleField('industry'))"
                          :type="getSimpleFieldInputType(getResolvedSimpleField('industry'))"
                          @input="setSimpleFieldValue(getResolvedSimpleField('industry'), $event.target.value)"
                        />
                      </td>
                    </tr>
                  </tbody>
                </table>

                <section class="fill-simple-sheet-section-title">Work Experience<br />工作经历</section>
                <table class="fill-simple-grid fill-simple-grid--records">
                  <tbody>
                    <tr>
                      <th class="fill-simple-record-head">起止日期（年/月）<br /><small>Dates of Employment</small></th>
                      <th class="fill-simple-record-head">工作单位<br /><small>Organization</small></th>
                      <th class="fill-simple-record-head">担任职务<br /><small>Position/Title</small></th>
                    </tr>
                    <tr v-for="(row, index) in simpleFormWorkRows" :key="`work-${index}`">
                      <td class="fill-simple-field fill-simple-field--record" @click="focusSimpleFieldCell">
                        <input v-if="row.date" :value="getSimpleFieldValue(row.date)" :type="getSimpleFieldInputType(row.date)" @input="setSimpleFieldValue(row.date, $event.target.value)" />
                      </td>
                      <td class="fill-simple-field fill-simple-field--record" @click="focusSimpleFieldCell">
                        <input v-if="row.organization" :value="getSimpleFieldValue(row.organization)" :type="getSimpleFieldInputType(row.organization)" @input="setSimpleFieldValue(row.organization, $event.target.value)" />
                      </td>
                      <td class="fill-simple-field fill-simple-field--record" @click="focusSimpleFieldCell">
                        <input v-if="row.position" :value="getSimpleFieldValue(row.position)" :type="getSimpleFieldInputType(row.position)" @input="setSimpleFieldValue(row.position, $event.target.value)" />
                      </td>
                    </tr>
                  </tbody>
                </table>

                <section class="fill-simple-sheet-section-title">Educational Background<br />教育经历</section>
                <table class="fill-simple-grid fill-simple-grid--records">
                  <tbody>
                    <tr>
                      <th class="fill-simple-record-head">起止日期<br /><small>Dates of Attendance</small></th>
                      <th class="fill-simple-record-head">毕业院校<br /><small>Institution</small></th>
                      <th class="fill-simple-record-head">学习专业<br /><small>Field of Study</small></th>
                      <th class="fill-simple-record-head">学历/学位<br /><small>Degree Obtained</small></th>
                    </tr>
                    <tr v-for="(row, index) in simpleFormEducationRows" :key="`education-${index}`">
                      <td class="fill-simple-field fill-simple-field--record" @click="focusSimpleFieldCell">
                        <input v-if="row.date" :value="getSimpleFieldValue(row.date)" :type="getSimpleFieldInputType(row.date)" @input="setSimpleFieldValue(row.date, $event.target.value)" />
                      </td>
                      <td class="fill-simple-field fill-simple-field--record" @click="focusSimpleFieldCell">
                        <input v-if="row.institution" :value="getSimpleFieldValue(row.institution)" :type="getSimpleFieldInputType(row.institution)" @input="setSimpleFieldValue(row.institution, $event.target.value)" />
                      </td>
                      <td class="fill-simple-field fill-simple-field--record" @click="focusSimpleFieldCell">
                        <input v-if="row.fieldOfStudy" :value="getSimpleFieldValue(row.fieldOfStudy)" :type="getSimpleFieldInputType(row.fieldOfStudy)" @input="setSimpleFieldValue(row.fieldOfStudy, $event.target.value)" />
                      </td>
                      <td class="fill-simple-field fill-simple-field--record" @click="focusSimpleFieldCell">
                        <input v-if="row.degree" :value="getSimpleFieldValue(row.degree)" :type="getSimpleFieldInputType(row.degree)" @input="setSimpleFieldValue(row.degree, $event.target.value)" />
                      </td>
                    </tr>
                  </tbody>
                </table>

                <section class="fill-simple-block">
                  <div class="fill-simple-block-title">Introduction<br />企业简介</div>
                  <textarea
                    :value="getSimpleFieldValue(getResolvedSimpleField('introduction'))"
                    :rows="7"
                    @input="setSimpleFieldValue(getResolvedSimpleField('introduction'), $event.target.value)"
                  />
                </section>

                <section class="fill-simple-block">
                  <div class="fill-simple-block-title">Professional Experience<br />个人职业经历</div>
                  <textarea
                    :value="getSimpleFieldValue(getResolvedSimpleField('professionalExperience'))"
                    :rows="7"
                    @input="setSimpleFieldValue(getResolvedSimpleField('professionalExperience'), $event.target.value)"
                  />
                </section>

                <section class="fill-simple-block">
                  <div class="fill-simple-block-title">
                    Why do you want to join this program, and what do you hope to gain from it?<br />
                    您为什么希望来参加伦比亚大学商学院全球价值投资家项目? 您希望通过课程获得什么？
                  </div>
                  <textarea
                    :value="getSimpleFieldValue(getResolvedSimpleField('motivation'))"
                    :rows="7"
                    @input="setSimpleFieldValue(getResolvedSimpleField('motivation'), $event.target.value)"
                  />
                </section>

                <section class="fill-simple-block">
                  <div class="fill-simple-block-title">Note<br />备注</div>
                  <textarea
                    :value="getSimpleFieldValue(getResolvedSimpleField('note'))"
                    :rows="7"
                    @input="setSimpleFieldValue(getResolvedSimpleField('note'), $event.target.value)"
                  />
                </section>

                <div v-if="false" class="fill-simple-sheet-panels">
                  <section class="fill-simple-block" v-if="simpleFormFieldMap.introduction">
                    <div class="fill-simple-block-title">Introduction<br />企业简介</div>
                    <textarea
                      :value="getSimpleFieldValue(simpleFormFieldMap.introduction)"
                      :rows="getSimpleTextareaRows(simpleFormFieldMap.introduction)"
                      @input="setSimpleFieldValue(simpleFormFieldMap.introduction, $event.target.value)"
                    />
                  </section>

                  <section class="fill-simple-block" v-if="simpleFormFieldMap.professionalExperience">
                    <div class="fill-simple-block-title">Professional Experience<br />个人职业经历</div>
                    <textarea
                      :value="getSimpleFieldValue(simpleFormFieldMap.professionalExperience)"
                      :rows="getSimpleTextareaRows(simpleFormFieldMap.professionalExperience)"
                      @input="setSimpleFieldValue(simpleFormFieldMap.professionalExperience, $event.target.value)"
                    />
                  </section>

                  <section class="fill-simple-block" v-if="simpleFormFieldMap.motivation">
                    <div class="fill-simple-block-title">
                      Why do you want to join this program, and what do you hope to gain from it?<br />
                      您为什么希望参加本项目，您希望通过课程获得什么？
                    </div>
                    <textarea
                      :value="getSimpleFieldValue(simpleFormFieldMap.motivation)"
                      :rows="getSimpleTextareaRows(simpleFormFieldMap.motivation)"
                      @input="setSimpleFieldValue(simpleFormFieldMap.motivation, $event.target.value)"
                    />
                  </section>

                  <section class="fill-simple-block" v-if="simpleFormFieldMap.note">
                    <div class="fill-simple-block-title">Note<br />备注</div>
                    <textarea
                      :value="getSimpleFieldValue(simpleFormFieldMap.note)"
                      :rows="getSimpleTextareaRows(simpleFormFieldMap.note)"
                      @input="setSimpleFieldValue(simpleFormFieldMap.note, $event.target.value)"
                    />
                  </section>

                  <section v-if="simpleFormExtraFields.length" class="fill-simple-block">
                    <div class="fill-simple-block-title">Additional Fields<br />补充字段</div>
                    <div class="fill-simple-extra-grid">
                      <label v-for="field in simpleFormExtraFields" :key="field.id" class="field-block">
                        <span>{{ getLocalizedFieldLabel(field) }}<em v-if="field.is_required"> *</em></span>
                        <UiSelect
                          v-if="getBubbleSelectKind(field)"
                          :model-value="getSimpleFieldValue(field)"
                          :options="getBubbleSelectOptions(field)"
                          :disabled="saving || isFieldReadOnly(field)"
                          :placeholder="t('common.select')"
                          @update:model-value="setSimpleFieldValue(field, $event)"
                        />
                        <textarea
                          v-else-if="field.field_type === 'textarea'"
                          :value="getSimpleFieldValue(field)"
                          rows="4"
                          :required="field.is_required"
                          @input="setSimpleFieldValue(field, $event.target.value)"
                        />
                        <input
                          v-else
                          :value="getSimpleFieldValue(field)"
                          :type="getSimpleFieldInputType(field)"
                          :required="field.is_required"
                          @input="setSimpleFieldValue(field, $event.target.value)"
                        />
                      </label>
                    </div>
                  </section>
                </div>
              </section>
            </form>
          </div>
        </div>
      </div>
    </dialog>

    <dialog ref="simpleFormPreviewDialog" class="modal-dialog document-preview-dialog" :class="{ 'is-fullscreen': simpleFormPreviewFullscreen }" @close="resetSimpleFormPreviewDialogState">
      <div class="modal-shell document-preview-dialog-shell">
        <div class="modal-surface document-preview-dialog-surface">
          <div class="panel-header modal-header document-preview-dialog-header">
            <h3>{{ t("document.previewTitle") }}</h3>
            <div class="form-actions document-preview-dialog-header-actions">
              <button class="btn btn-secondary document-preview-toggle-btn" type="button" @click="toggleSimpleFormPreviewFullscreen">
                {{ simpleFormPreviewToggleLabel }}
              </button>
              <button class="btn btn-secondary" type="button" @click="closeSimpleFormPreviewDialog">{{ t("common.close") }}</button>
            </div>
          </div>
          <div class="panel-body stack-form modal-body document-preview-dialog-body">
            <div v-if="simpleFormPreviewLoading" class="modal-note">{{ t("common.loading") }}</div>
            <div v-else class="docx-preview-content document-preview-html" v-html="simpleFormPreviewHtml" />
          </div>
        </div>
      </div>
    </dialog>

    <dialog ref="simpleFormPreviewConfirmDialog" class="modal-dialog document-confirm-dialog" @close="() => {}">
      <div class="modal-shell document-confirm-dialog-shell">
        <div class="modal-surface document-confirm-dialog-surface">
          <div class="panel-header modal-header document-confirm-dialog-header">
            <h3>{{ simpleFormPreviewCloseConfirmTitle }}</h3>
          </div>
          <div class="panel-body stack-form modal-body document-confirm-dialog-body">
            <p class="document-confirm-copy">{{ simpleFormPreviewCloseConfirmBody }}</p>
            <div class="form-actions document-confirm-actions">
              <button class="btn btn-primary" type="button" @click="confirmCloseSimpleFormPreviewDialog">{{ t("common.confirm") }}</button>
              <button class="btn btn-secondary" type="button" @click="closeSimpleFormPreviewConfirmDialog">{{ t("common.cancel") }}</button>
            </div>
          </div>
        </div>
      </div>
    </dialog>

    <dialog ref="deleteDialog" class="modal-dialog fill-delete-dialog" @close="resetDeleteDialogState">
      <div class="modal-shell fill-delete-dialog-shell">
        <div class="modal-surface fill-delete-dialog-surface">
          <div class="panel-header modal-header fill-delete-dialog-header">
            <h3>{{ t("fill.deleteTitle") }}</h3>
            <button class="btn btn-secondary" type="button" @click="closeDeleteDialog">{{ t("common.close") }}</button>
          </div>
          <div class="panel-body stack-form modal-body fill-delete-dialog-body">
            <p class="fill-delete-copy">{{ t("fill.deleteBody") }}</p>
            <div class="form-actions fill-delete-actions">
              <button class="btn btn-danger" type="button" :disabled="deletingEntry" @click="confirmDeleteEntry">
                {{ deletingEntry ? t("fill.deleting") : t("fill.deleteAction") }}
              </button>
              <button class="btn btn-secondary" type="button" :disabled="deletingEntry" @click="closeDeleteDialog">{{ t("common.cancel") }}</button>
            </div>
          </div>
        </div>
      </div>
    </dialog>

    <dialog ref="moveSlotDialog" class="modal-dialog fill-move-dialog" @close="resetMoveSlotDialogState">
      <div class="modal-shell fill-move-dialog-shell">
        <div class="modal-surface fill-move-dialog-surface">
          <div class="panel-header modal-header fill-move-dialog-header">
            <h3>{{ t("fill.moveTitle") }}</h3>
            <button class="btn btn-secondary" type="button" @click="closeMoveSlotDialog">{{ t("common.close") }}</button>
          </div>
          <form class="panel-body stack-form modal-body fill-move-dialog-body" @submit.prevent="handleMoveSlot">
            <div class="fill-move-summary">
              <div class="fill-move-summary-item">
                <span class="fill-move-label">{{ t("fill.currentSlot") }}</span>
                <strong>{{ movingRow?.slot?.title || "-" }}</strong>
              </div>
              <div class="fill-move-summary-item">
                <span class="fill-move-label">{{ t("fill.newSlot") }}</span>
                <UiSelect
                  v-model="targetSlotId"
                  class="fill-move-select"
                  :options="moveSlotOptions"
                  :disabled="!moveSlotOptions.length || movingSlot || togglingDisabledSlot"
                  :placeholder="t('fill.selectSlot')"
                  @option-action="toggleDisabledMoveSlot"
                />
              </div>
            </div>
            <p v-if="!hasEnabledMoveSlotOptions" class="muted-text fill-move-empty">{{ t("fill.noSlot") }}</p>
            <div class="form-actions fill-move-actions">
              <button class="btn btn-primary" type="submit" :disabled="!targetSlotId || movingSlot">
                {{ movingSlot ? t("fill.moving") : t("fill.confirmMove") }}
              </button>
              <button class="btn btn-secondary" type="button" @click="closeMoveSlotDialog">{{ t("common.cancel") }}</button>
            </div>
          </form>
        </div>
      </div>
    </dialog>
  </div>
</template>
