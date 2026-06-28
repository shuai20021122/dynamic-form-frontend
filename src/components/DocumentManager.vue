<script setup>
import { computed, nextTick, onBeforeUnmount, ref, watch } from "vue";

import {
  deleteDocument,
  downloadDocument,
  generateBilingualDocument,
  getOnlineSummaryDetail,
  listEntryDocuments,
  previewDocument,
  saveBilingualEditor,
  uploadEntryDocument,
} from "../api/documents.js";
import { clearCachedResource, getCachedResource, setCachedResource } from "../stores/resourceCache.js";
import { currentUiLanguage, t } from "../stores/uiLanguage.js";
import { closeDialogWithAnimation, getDialogOriginFromEvent, openDialogWithAnimation, resetDialogMotion } from "../utils/dialogMotion.js";
import { formatDateTime } from "../utils/format.js";
import {
  buildOnlineSummaryPreviewHtml as buildOnlineSummaryPreviewHtmlTemplate,
  downloadOnlineSummaryAsWord as downloadOnlineSummaryAsWordFile,
} from "../utils/onlineSummaryDocument.js";
import EmptyState from "./EmptyState.vue";
import ErrorAlert from "./ErrorAlert.vue";
import LoadingBlock from "./LoadingBlock.vue";

const props = defineProps({
  entryId: {
    type: [String, Number],
    default: null,
  },
  canFillSimple: {
    type: Boolean,
    default: false,
  },
  canUpload: {
    type: Boolean,
    default: false,
  },
  canDelete: {
    type: Boolean,
    default: false,
  },
});

const emit = defineEmits(["updated", "fill-simple", "close-all"]);

const documents = ref([]);
const loading = ref(false);
const errorMessage = ref("");
const uploadBusy = ref(false);
const actionBusyId = ref(null);

const previewDialog = ref(null);
const previewTitle = ref(t("document.previewTitle"));
const previewLoading = ref(false);
const previewHtml = ref("");
const previewStructuredData = ref(null);
const previewDialogFullscreen = ref(false);
const activeSubDialog = ref("");

const confirmDialog = ref(null);
const confirmActionType = ref("");
const confirmDocumentId = ref(null);
const confirmOriginPoint = ref(null);

const editorDialog = ref(null);
const editorDialogFullscreen = ref(false);
const editorLoading = ref(false);
const editorSaving = ref(false);
const editorCloseConfirmDialog = ref(null);
const editorData = ref(null);
const editorPreviewFallback = ref(null);
const editorHtml = ref("");
const editorCanEdit = ref(false);
const editingDocumentId = ref(null);
const editorInitialSnapshot = ref("");
const structuredEditorSectionKeys = ["short_fields", "work_experiences", "education_experiences", "long_fields"];
const generateProgress = ref(0);
let generateProgressTimer = null;

const originalDocx = computed(() => documents.value.find((item) => item.document_kind === "original" && item.file_type === "docx") || null);
const onlineSummaryDocument = computed(
  () => documents.value.find((item) => isOnlineSummaryDocument(item)) || null
);
const generateSourceDocument = computed(() => originalDocx.value || onlineSummaryDocument.value || null);
const originalResumeDocument = computed(() => documents.value.find((item) => item.document_kind === "original") || null);
const uploadDisabled = computed(() => !props.canUpload || !!originalResumeDocument.value || !!onlineSummaryDocument.value || uploadBusy.value);
const fillSimpleDisabled = computed(() => !props.canFillSimple || !!originalResumeDocument.value || !!actionBusyId.value || uploadBusy.value);
const documentsCacheKey = computed(() => `entry:documents:${props.entryId || ""}`);
const generateStateCacheKey = computed(() => `entry:documents:generate:${props.entryId || ""}`);
const editingDocumentInfo = computed(() => documents.value.find((item) => String(item.id) === String(editingDocumentId.value)) || null);
const editorDialogTitle = computed(() => editingDocumentInfo.value?.original_filename || t("document.editorTitle"));
const editorCloseConfirmTitle = computed(() => (currentUiLanguage.value === "en-US" ? "Confirm Close" : "确认关闭"));
const editorCloseConfirmBody = computed(() =>
  currentUiLanguage.value === "en-US" ? "Content is not saved. Are you sure you want to close?" : "内容未保存，确认关闭？"
);
const getPreviewCacheKey = (documentId) => `document:preview:${documentId || ""}`;
const getEditorCacheKey = (documentId) => `document:editor:${documentId || ""}`;
const hasStructuredEditorSections = computed(
  () =>
    !!(
      (editorData.value?.short_fields || []).length ||
      (editorData.value?.work_experiences || []).length ||
      (editorData.value?.education_experiences || []).length ||
      (editorData.value?.long_fields || []).length
    )
);
const genericEditorSections = computed(() => {
  if (!editorData.value || typeof editorData.value !== "object") {
    return [];
  }

  return Object.entries(editorData.value)
    .filter(([key, value]) => !structuredEditorSectionKeys.includes(key) && value !== null && value !== undefined)
    .map(([key, value]) => ({
      key,
      title: formatEditorLabel(key),
      blocks: buildGenericEditorBlocks(key, value),
    }))
    .filter((section) => section.blocks.length > 0);
});
function resolveStructuredBilingualSheetFromData(data) {
  const shortFields = data?.short_fields || [];
  const longFields = data?.long_fields || [];
  const findShort = (aliases) => findEditorFieldByAliases(shortFields, aliases);
  const findLong = (aliases) => findEditorFieldByAliases(longFields, aliases);

  return {
    name: findShort(["name", "姓名"]),
    dateOfBirth: findShort(["dateofbirth", "date birth", "出生日期", "生日"]),
    gender: findShort(["gender", "性别"]),
    nationality: findShort(["nationality", "国籍"]),
    organization: findShort(["organizationname", "companyname", "公司名称"]),
    position: findShort(["position", "positiontitle", "title", "职务", "职位"]),
    assets: findShort(["assets", "asset", "totalassets", "total_assets"]),
    employees: findShort(["employees", "员工人数"]),
    revenue: findShort(["revenue", "营收", "营业收入", "企业营收"]),
    industry: findShort(["industry", "行业", "公司行业"]),
    introduction: findLong(["introduction", "companyprofile", "company_profile", "companyintroduction"]),
    professionalExperience: findLong(["professionalexperience", "个人职业经历", "workexperience"]),
    programMotivation: findLong([
      "programmotivation",
      "whydoyouwanttojointhisprogramandwhatdoyouhopetogainfromit",
      "课程",
      "动机",
    ]),
    note: findLong(["note", "备注"]),
    workExperiences: data?.work_experiences || [],
    educationExperiences: data?.education_experiences || [],
  };
}

function resolveStructuredBilingualSheetWithFallback(data) {
  const structured = resolveStructuredBilingualSheetFromData(data);
  const shortFields = data?.short_fields || [];
  const longFields = data?.long_fields || [];

  return {
    ...structured,
    name: structured.name || findEditorFieldByAliases(shortFields, ["full_name", "candidate_name", "applicantname"]),
    dateOfBirth:
      structured.dateOfBirth ||
      findEditorFieldByAliases(shortFields, [
        "birthdate",
        "dob",
        "date_of_birth",
        "birthday",
        "dateofbirthformatddmmyyyy",
        "dateofbirthformatdaymonthyear",
      ]),
    gender: structured.gender || findEditorFieldByAliases(shortFields, ["sex", "gendervalue", "gender_value", "gendermalefemale", "sexmalefemale"]),
    nationality: structured.nationality || findEditorFieldByAliases(shortFields, ["citizenship", "country", "nationalitystatus"]),
    organization: structured.organization || findEditorFieldByAliases(shortFields, ["company", "organization", "organization_name", "company_name"]),
    position: structured.position || findEditorFieldByAliases(shortFields, ["jobtitle", "job_position"]),
    assets: structured.assets || findEditorFieldByAliases(shortFields, ["asset", "totalassets", "total_assets"]),
    employees: structured.employees || findEditorFieldByAliases(shortFields, ["employee", "staff", "staffcount", "employeecount"]),
    revenue: structured.revenue || findEditorFieldByAliases(shortFields, ["turnover", "income", "annualrevenue"]),
    industry: structured.industry || findEditorFieldByAliases(shortFields, ["businessindustry", "companyindustry"]),
    introduction: structured.introduction || findEditorFieldByAliases(longFields, ["companyintroduction", "company_profile"]),
    professionalExperience: structured.professionalExperience || findEditorFieldByAliases(longFields, ["individualexperience", "careerhistory"]),
    programMotivation: structured.programMotivation || findEditorFieldByAliases(longFields, ["motivation", "reason", "program_reason"]),
    note: structured.note || findEditorFieldByAliases(longFields, ["remark", "remarks", "memo"]),
  };
}

const resolvedStructuredBilingualSheet = computed(() => resolveStructuredBilingualSheetWithFallback(editorData.value));
const previewStructuredBilingualSheet = computed(() => resolveStructuredBilingualSheetWithFallback(previewStructuredData.value));
const generateButtonProgressStyle = computed(() => ({
  "--generate-progress-width": `${generateProgress.value}%`,
}));
const generateButtonLabel = computed(() =>
  actionBusyId.value?.startsWith("generate-") ? `${t("document.generateBilingual")} ${generateProgress.value}%` : t("document.generateBilingual")
);
const confirmDialogTitle = computed(() => t("common.confirm"));
const confirmDialogBody = computed(() =>
  confirmActionType.value === "generate" ? t("document.generateConfirm") : t("document.deleteConfirm")
);
const confirmDialogActionLabel = computed(() =>
  confirmActionType.value === "generate" ? t("document.generateBilingual") : t("document.delete")
);
const confirmDialogActionClass = computed(() => (confirmActionType.value === "delete" ? "btn btn-danger" : "btn btn-primary"));
const fillSimpleButtonLabel = computed(() => (currentUiLanguage.value === "en-US" ? "Fill Summary Sheet" : "简表填写"));
const previewDialogToggleLabel = computed(() => (previewDialogFullscreen.value ? (currentUiLanguage.value === "en-US" ? "Windowed" : "窗口展示") : currentUiLanguage.value === "en-US" ? "Fullscreen" : "全屏展示"));
const editorDialogToggleLabel = computed(() => (editorDialogFullscreen.value ? (currentUiLanguage.value === "en-US" ? "Windowed" : "窗口展示") : currentUiLanguage.value === "en-US" ? "Fullscreen" : "全屏展示"));
let restoreGenerateTaskPromise = null;

function isPlainObject(value) {
  return Object.prototype.toString.call(value) === "[object Object]";
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function isOnlineSummaryDocument(document) {
  return document?.source_type === "online" && document?.document_kind === "candidate_summary";
}

function triggerBrowserDownload(blob, filename) {
  const objectUrl = window.URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = objectUrl;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(objectUrl);
}

function buildOnlineSummaryDownloadFilename(document) {
  const rawName = String(document?.original_filename || document?.name || "candidate-summary").trim();
  return /\.json$/i.test(rawName) ? rawName : `${rawName}.json`;
}

function buildOnlineSummaryPreviewHtml(detail) {
  const workHtml = workRows
    .map(
      (item) => `
        <tr>
          <td>${escapeHtml(item?.dates_of_employment)}</td>
          <td>${escapeHtml(item?.organization)}</td>
          <td>${escapeHtml(item?.position_title)}</td>
        </tr>
      `
    )
    .join("");

  const educationHtml = educationRows
    .map(
      (item) => `
        <tr>
          <td>${escapeHtml(item?.dates_of_attendance)}</td>
          <td>${escapeHtml(item?.institution)}</td>
          <td>${escapeHtml(item?.field_of_study)}</td>
          <td>${escapeHtml(item?.degree_obtained)}</td>
        </tr>
      `
    )
    .join("");

  const block = (titleEn, titleZh, value) => `
    <h2>${escapeHtml(titleEn)}<br>${escapeHtml(titleZh)}</h2>
    <p>${escapeHtml(value).replace(/\n/g, "<br>")}</p>
  `;

  return `
    <h1 style="text-align:center;">Candidate Summary Sheet<br>\u5019\u9009\u4eba\u7b80\u8868</h1>
    <table>
      <tbody>
        <tr><th colspan="4">Basic Information<br>基本信息</th></tr>
        <tr>
          <td>Name<br>姓名</td>
          <td>${escapeHtml(detail?.name)}</td>
          <td>Date of Birth<br>出生日期<br>（格式：日/月/年）</td>
          <td>${escapeHtml(detail?.date_of_birth)}</td>
        </tr>
        <tr>
          <td>Gender<br>性别</td>
          <td>${escapeHtml(detail?.gender)}</td>
          <td>Nationality<br>国籍</td>
          <td>${escapeHtml(detail?.nationality)}</td>
        </tr>
        <tr>
          <td>Organization Name<br>公司名称</td>
          <td colspan="2">${escapeHtml(detail?.organization_name)}</td>
          <td>Position<br>职务<br><br>${escapeHtml(detail?.position)}</td>
        </tr>
        <tr><th colspan="4">Company Profile<br>公司概况</th></tr>
        <tr>
          <td>Assets<br>总资产</td>
          <td>${escapeHtml(detail?.assets)}</td>
          <td>Employees<br>员工人数</td>
          <td>${escapeHtml(detail?.employees)}</td>
        </tr>
        <tr>
          <td>Revenue<br>企业营收</td>
          <td>${escapeHtml(detail?.revenue)}</td>
          <td>Industry<br>公司行业</td>
          <td>${escapeHtml(detail?.industry)}</td>
        </tr>
      </tbody>
    </table>
    <h3>Work Experience<br>工作经历</h3>
    <table>
      <tbody>
        <tr>
          <th>起止日期（年/月）<br>Dates of Employment</th>
          <th>工作单位<br>Organization</th>
          <th>担任职务<br>Position/Title</th>
        </tr>
        ${workHtml}
      </tbody>
    </table>
    <h3>Educational Background<br>教育经历</h3>
    <table>
      <tbody>
        <tr>
          <th>起止日期<br>Dates of Attendance</th>
          <th>毕业院校<br>Institution</th>
          <th>学习专业<br>Field of Study</th>
          <th>学历/学位<br>Degree Obtained</th>
        </tr>
        ${educationHtml}
      </tbody>
    </table>
    ${block("Introduction", "\u4f01\u4e1a\u7b80\u4ecb", detail?.introduction)}
    ${block("Professional Experience", "个人职业经历", detail?.professional_experience)}
    ${block("Why do you want to join this program, and what do you hope to gain from it?", "您为什么想参加这个项目？您希望通过课程获得什么？", detail?.program_motivation)}
    ${block("Note", "备注", detail?.note)}
  `;
}

function buildOnlineSummaryPreviewHtmlSafe(detail) {
  const workRows = Array.from({ length: 3 }, (_, index) => detail?.work_experiences?.[index] || {});
  const educationRows = Array.from({ length: 3 }, (_, index) => detail?.education_backgrounds?.[index] || {});

  const workHtml = workRows
    .map(
      (item) => `
        <tr>
          <td>${escapeHtml(item?.dates_of_employment)}</td>
          <td>${escapeHtml(item?.organization)}</td>
          <td>${escapeHtml(item?.position_title)}</td>
        </tr>
      `
    )
    .join("");

  const educationHtml = educationRows
    .map(
      (item) => `
        <tr>
          <td>${escapeHtml(item?.dates_of_attendance)}</td>
          <td>${escapeHtml(item?.institution)}</td>
          <td>${escapeHtml(item?.field_of_study)}</td>
          <td>${escapeHtml(item?.degree_obtained)}</td>
        </tr>
      `
    )
    .join("");

  const block = (titleEn, titleZh, value) => `
    <h2>${escapeHtml(titleEn)}<br>${escapeHtml(titleZh)}</h2>
    <p>${escapeHtml(value).replace(/\n/g, "<br>")}</p>
  `;

  return `
    <h1 style="text-align:center;">Candidate Summary Sheet<br>\u5019\u9009\u4eba\u7b80\u8868</h1>
    <table>
      <tbody>
        <tr><th colspan="4">Basic Information<br>基本信息</th></tr>
        <tr>
          <td>Name<br>姓名</td>
          <td>${escapeHtml(detail?.name)}</td>
          <td>Date of Birth<br>出生日期<br>（格式：日/月/年）</td>
          <td>${escapeHtml(detail?.date_of_birth)}</td>
        </tr>
        <tr>
          <td>Gender<br>性别</td>
          <td>${escapeHtml(detail?.gender)}</td>
          <td>Nationality<br>国籍</td>
          <td>${escapeHtml(detail?.nationality)}</td>
        </tr>
        <tr>
          <td>Organization Name<br>公司名称</td>
          <td colspan="2">${escapeHtml(detail?.organization_name)}</td>
          <td>Position<br>职务<br><br>${escapeHtml(detail?.position)}</td>
        </tr>
        <tr><th colspan="4">Company Profile<br>公司概况</th></tr>
        <tr>
          <td>Assets<br>总资产</td>
          <td>${escapeHtml(detail?.assets)}</td>
          <td>Employees<br>员工人数</td>
          <td>${escapeHtml(detail?.employees)}</td>
        </tr>
        <tr>
          <td>Revenue<br>企业营收</td>
          <td>${escapeHtml(detail?.revenue)}</td>
          <td>Industry<br>公司行业</td>
          <td>${escapeHtml(detail?.industry)}</td>
        </tr>
      </tbody>
    </table>
    <h3>Work Experience<br>工作经历</h3>
    <table>
      <tbody>
        <tr>
          <th>起止日期（年/月）<br>Dates of Employment</th>
          <th>工作单位<br>Organization</th>
          <th>担任职务<br>Position/Title</th>
        </tr>
        ${workHtml}
      </tbody>
    </table>
    <h3>Educational Background<br>教育经历</h3>
    <table>
      <tbody>
        <tr>
          <th>起止日期<br>Dates of Attendance</th>
          <th>毕业院校<br>Institution</th>
          <th>学习专业<br>Field of Study</th>
          <th>学历/学位<br>Degree Obtained</th>
        </tr>
        ${educationHtml}
      </tbody>
    </table>
    ${block("Introduction", "\u4f01\u4e1a\u7b80\u4ecb", detail?.introduction)}
    ${block("Professional Experience", "个人职业经历", detail?.professional_experience)}
    ${block("Why do you want to join this program, and what do you hope to gain from it?", "您为什么想参加这个项目？您希望通过课程获得什么？", detail?.program_motivation)}
    ${block("Note", "备注", detail?.note)}
  `;
}

function formatEditorLabel(value) {
  return String(value || "")
    .replace(/[_-]+/g, " ")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^./, (char) => char.toUpperCase());
}

function normalizeEditorAlias(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[\s\r\n/()（）:：,，"?_\-]+/g, "");
}

function findEditorFieldByAliases(fields, aliases = []) {
  const normalizedAliases = aliases.map(normalizeEditorAlias).filter(Boolean);
  return (
    (fields || []).find((field) => {
      const candidates = [field?.label, field?.key, field?.name, field?.title, field?.field_key, field?.section_title]
        .map(normalizeEditorAlias)
        .filter(Boolean);
      return normalizedAliases.some((alias) =>
        candidates.some((candidate) => {
          if (candidate === alias) {
            return true;
          }

          // Only allow partial matches for sufficiently specific aliases so
          // generic labels like "name" do not incorrectly bind to
          // "organization name" or similar fields.
          return alias.length >= 5 && candidate.includes(alias);
        })
      );
    }) || null
  );
}

function getEditorFieldValue(field, prop = "zh_text") {
  if (!field || typeof field !== "object") {
    return "";
  }

  return String(
    field?.[prop] ||
      field?.value ||
      field?.text ||
      field?.content ||
      field?.source_text ||
      field?.translated_text ||
      ""
  );
}

function setEditorFieldValue(field, prop, value) {
  if (!field || typeof field !== "object") {
    return;
  }
  field[prop] = value;
}

function getEditorObjectValue(source, aliases = []) {
  if (!source || typeof source !== "object") {
    return "";
  }

  const key = aliases.find((alias) => alias in source) || aliases[0];
  return String(source?.[key] || "");
}

function setEditorObjectValue(source, aliases = [], value) {
  if (!source || typeof source !== "object" || !aliases.length) {
    return;
  }

  const key = aliases.find((alias) => alias in source) || aliases[0];
  source[key] = value;
}

function getGenericBlockTitle(sectionKey, item, index) {
  if (item && typeof item === "object") {
    const preferred = item.title || item.label || item.name || item.heading || item.section_title;
    if (preferred) {
      return String(preferred);
    }
  }

  return `${formatEditorLabel(sectionKey)} ${index + 1}`;
}

function getFieldControl(fieldValue) {
  if (typeof fieldValue === "string" && (fieldValue.includes("\n") || fieldValue.length > 120)) {
    return "textarea";
  }
  return "input";
}

function createGenericField(holder, prop, label) {
  const currentValue = holder?.[prop];
  const normalizedValue =
    typeof currentValue === "string" || typeof currentValue === "number" || typeof currentValue === "boolean"
      ? currentValue
      : JSON.stringify(currentValue ?? "", null, 2);

  if (holder && holder[prop] !== normalizedValue) {
    holder[prop] = normalizedValue;
  }

  return {
    key: `${label}-${prop}`,
    holder,
    prop,
    label: formatEditorLabel(label),
    control: getFieldControl(normalizedValue),
  };
}

function buildFieldsFromObject(source) {
  if (!isPlainObject(source)) {
    return [];
  }

  return Object.keys(source).map((fieldKey) => createGenericField(source, fieldKey, fieldKey));
}

function buildGenericEditorBlocks(sectionKey, value) {
  if (Array.isArray(value)) {
    return value
      .map((item, index) => {
        if (isPlainObject(item)) {
          return {
            key: `${sectionKey}-${index}`,
            title: getGenericBlockTitle(sectionKey, item, index),
            fields: buildFieldsFromObject(item),
          };
        }

        const holder = { value: typeof item === "string" ? item : JSON.stringify(item ?? "", null, 2) };
        return {
          key: `${sectionKey}-${index}`,
          title: `${formatEditorLabel(sectionKey)} ${index + 1}`,
          fields: [createGenericField(holder, "value", "content")],
        };
      })
      .filter((block) => block.fields.length > 0);
  }

  if (isPlainObject(value)) {
    return [
      {
        key: `${sectionKey}-object`,
        title: formatEditorLabel(sectionKey),
        fields: buildFieldsFromObject(value),
      },
    ].filter((block) => block.fields.length > 0);
  }

  const holder = { value: typeof value === "string" ? value : JSON.stringify(value ?? "", null, 2) };
  return [
    {
      key: `${sectionKey}-scalar`,
      title: formatEditorLabel(sectionKey),
      fields: [createGenericField(holder, "value", sectionKey)],
    },
  ];
}

function hasTextContent(value) {
  return typeof value === "string" ? value.trim().length > 0 : value !== null && value !== undefined && String(value).trim().length > 0;
}

function hasMeaningfulStructuredContent(editor) {
  if (!editor || typeof editor !== "object") {
    return false;
  }

  const shortFields = (editor.short_fields || []).some((item) => hasTextContent(item?.zh_text) || hasTextContent(item?.en_text));
  const workExperiences = (editor.work_experiences || []).some((item) =>
    [
      item?.organization_zh,
      item?.organization_en,
      item?.position_zh,
      item?.position_en,
      item?.description_zh,
      item?.description_en,
    ].some(hasTextContent)
  );
  const educationExperiences = (editor.education_experiences || []).some((item) =>
    [
      item?.institution_zh,
      item?.institution_en,
      item?.course_zh,
      item?.course_en,
      item?.degree_zh,
      item?.degree_en,
      item?.description_zh,
      item?.description_en,
    ].some(hasTextContent)
  );
  const longFields = (editor.long_fields || []).some((item) => hasTextContent(item?.zh_text) || hasTextContent(item?.en_text));

  return shortFields || workExperiences || educationExperiences || longFields;
}

function decodeHtmlText(value) {
  if (typeof window === "undefined" || typeof DOMParser === "undefined") {
    return String(value || "");
  }

  const parser = new DOMParser();
  return parser.parseFromString(String(value || ""), "text/html").documentElement.textContent || "";
}

function normalizePreviewText(value) {
  return decodeHtmlText(value)
    .replace(/\u00a0/g, " ")
    .replace(/\r/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function cleanLanguageChunk(value) {
  return String(value || "")
    .replace(/[ \t]+/g, " ")
    .replace(/\s*([,.;:!?])/g, "$1")
    .replace(/\(\s+/g, "(")
    .replace(/\s+\)/g, ")")
    .trim();
}

function splitMixedLanguageText(value) {
  const text = String(value || "").trim();
  if (!text) {
    return { zh: "", en: "" };
  }

  const displaySplit = splitDisplayBilingualText(text);
  if (displaySplit) {
    return {
      zh: cleanLanguageChunk(displaySplit.zh),
      en: cleanLanguageChunk(displaySplit.en),
    };
  }

  const tokens = text.match(/[\u4e00-\u9fff][\u4e00-\u9fffA-Za-z0-9，。；：、“”‘’《》【】（）-]*|[A-Za-z][A-Za-z0-9\s,.;:!?()\-/'"%&]+|[0-9]+|[^\s]/g) || [text];
  const zhParts = [];
  const enParts = [];

  tokens.forEach((token) => {
    const hasZh = /[\u4e00-\u9fff]/.test(token);
    const hasEn = /[A-Za-z]/.test(token);

    if (hasZh && !hasEn) {
      zhParts.push(token);
      return;
    }

    if (hasEn && !hasZh) {
      enParts.push(token);
      return;
    }

    if (hasZh && hasEn) {
      const zhOnly = token.replace(/[A-Za-z0-9\s,.;:!?()\-/'"%&]+/g, "");
      const enOnly = token.replace(/[\u4e00-\u9fff，。；：“”‘’（）《》【】]/g, " ");
      if (zhOnly.trim()) zhParts.push(zhOnly);
      if (enOnly.trim()) enParts.push(enOnly);
      return;
    }

    if (/[\u4e00-\u9fff，。；：“”‘’（）《》【】]/.test(token)) {
      zhParts.push(token);
      return;
    }

    enParts.push(token);
  });

  return {
    zh: cleanLanguageChunk(zhParts.join(" ")),
    en: cleanLanguageChunk(enParts.join(" ")),
  };
}

function buildParagraphFields(lines, fallbackTitle) {
  const paragraphs = [];
  let currentParagraph = [];

  lines.forEach((line) => {
    if (!line.trim()) {
      if (currentParagraph.length) {
        paragraphs.push(currentParagraph.join("\n"));
        currentParagraph = [];
      }
      return;
    }
    currentParagraph.push(line);
  });

  if (currentParagraph.length) {
    paragraphs.push(currentParagraph.join("\n"));
  }

  return paragraphs
    .map((paragraph, index) => {
      const { zh, en } = splitMixedLanguageText(paragraph);
      if (!zh && !en) {
        return null;
      }

      return {
        key: `fallback-paragraph-${index + 1}`,
        label: paragraphs.length === 1 ? fallbackTitle || t("document.editorTitle") : `${fallbackTitle || t("document.editorTitle")} ${index + 1}`,
        zh_text: zh,
        en_text: en,
      };
    })
    .filter(Boolean);
}

function buildFallbackEditorFromPreviewHtml(html, fallbackTitle) {
  const normalizedText = normalizePreviewText(html);
  if (!normalizedText) {
    return null;
  }

  const lines = normalizedText
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  const shortFields = [];
  const longChunks = [];

  lines.forEach((line) => {
    const match = line.match(/^([^:：]{1,40})\s*[:：]\s*(.+)$/);
    if (match) {
      const [, label, value] = match;
      const separated = splitMixedLanguageText(value.trim());
      shortFields.push({
        key: `fallback-short-${shortFields.length + 1}`,
        label: label.trim(),
        zh_text: separated.zh || value.trim(),
        en_text: separated.en || "",
      });
      return;
    }

    longChunks.push(line);
  });

  const longFields = buildParagraphFields(longChunks, fallbackTitle || t("document.editorTitle"));

  if (!shortFields.length && !longFields.length) {
    return null;
  }

  return {
    short_fields: shortFields,
    work_experiences: [],
    education_experiences: [],
    long_fields: longFields,
  };
}

function extractPreviewTableFieldPairs(html) {
  if (typeof window === "undefined" || typeof DOMParser === "undefined") {
    return [];
  }

  const parser = new DOMParser();
  const doc = parser.parseFromString(String(html || ""), "text/html");
  const tables = Array.from(doc.querySelectorAll("table"));
  const basicInfoTable =
    tables.find((table) => {
      const tableText = normalizeEditorAlias(normalizePreviewText(table.textContent || ""));
      return (
        tableText.includes("name") &&
        tableText.includes("dateofbirth") &&
        tableText.includes("gender") &&
        tableText.includes("nationality") &&
        tableText.includes("organizationname") &&
        tableText.includes("assets")
      );
    }) || null;
  const rows = basicInfoTable ? Array.from(basicInfoTable.querySelectorAll("tr")) : [];
  const pairs = [];

  rows.forEach((row) => {
    const cells = Array.from(row.children).filter((cell) => /^(TD|TH)$/i.test(cell.tagName));
    if (!cells.length || cells.every((cell) => cell.tagName === "TH")) {
      return;
    }

    cells.forEach((cell, index) => {
      const label = normalizePreviewText(cell.textContent || "");
      if (!label || index >= cells.length - 1) {
        return;
      }

      const nextCell = cells[index + 1];
      const nextText = normalizePreviewText(nextCell?.textContent || "");
      if (!nextText) {
        return;
      }

      if (
        /name|姓名|date of birth|出生日期|gender|性别|nationality|国籍|organization name|公司名称|position|职务|assets|总资产|employees|员工人数|revenue|企业营收|industry|公司行业/i.test(
          label
        )
      ) {
        pairs.push({ label, value: nextText });
      }
    });
  });

  return pairs;
}

function getStructuredShortFieldMetaFromLabel(label) {
  const normalized = normalizeEditorAlias(label);
  if (!normalized) {
    return null;
  }

  const definitions = [
    { match: ["name", "姓名"], key: "name", label: "Name" },
    { match: ["dateofbirth", "出生日期", "birthday"], key: "dateofbirth", label: "Date of Birth" },
    { match: ["gender", "性别", "sex"], key: "gender", label: "Gender" },
    { match: ["nationality", "国籍", "citizenship"], key: "nationality", label: "Nationality" },
    { match: ["organizationname", "公司名称", "companyname"], key: "organizationname", label: "Organization Name" },
    { match: ["position", "职务", "职位"], key: "position", label: "Position" },
    { match: ["assets", "总资产", "totalassets"], key: "assets", label: "Assets" },
    { match: ["employees", "员工人数", "employeecount", "staffcount"], key: "employees", label: "Employees" },
    { match: ["revenue", "企业营收", "营业收入", "turnover"], key: "revenue", label: "Revenue" },
    { match: ["industry", "公司行业", "行业", "businessindustry"], key: "industry", label: "Industry" },
  ];

  return (
    definitions.find((item) => item.match.some((token) => normalized.includes(normalizeEditorAlias(token)))) || null
  );
}

function getStructuredLongFieldMetaFromHeading(label) {
  const normalized = normalizeEditorAlias(label);
  if (!normalized) {
    return null;
  }

  const definitions = [
    { match: ["introduction", "企业简介", "companyprofile", "companyintroduction"], key: "introduction", label: "Introduction" },
    { match: ["professionalexperience", "个人职业经历", "individualexperience", "careerhistory", "workexperience"], key: "professionalexperience", label: "Professional Experience" },
    {
      match: ["whydoyouwanttojointhisprogramandwhatdoyouhopetogainfromit", "您为什么想参加这个项目", "programmotivation", "programreason", "motivation"],
      key: "programmotivation",
      label: "Program Motivation",
    },
    { match: ["note", "备注", "remark", "memo"], key: "note", label: "Note" },
  ];

  return (
    definitions.find((item) => item.match.some((token) => normalized.includes(normalizeEditorAlias(token)))) || null
  );
}

function composeEditorMixedText(zh, en) {
  const normalizedZh = String(zh || "").trim();
  const normalizedEn = String(en || "").trim();
  if (normalizedZh && normalizedEn) {
    return `${normalizedZh} / ${normalizedEn}`;
  }
  return normalizedZh || normalizedEn || "";
}

function mergeEditorFieldValue(targetField, fallbackField) {
  if (!targetField || !fallbackField) {
    return;
  }

  const targetValue = splitEditorMixedValue(getEditorMixedText(targetField), String(targetField?.en_text || "").trim() && !String(targetField?.zh_text || "").trim() ? "en" : "zh");
  const fallbackValue = splitEditorMixedValue(getEditorMixedText(fallbackField), String(fallbackField?.en_text || "").trim() && !String(fallbackField?.zh_text || "").trim() ? "en" : "zh");
  const mergedText = composeEditorMixedText(targetValue.zh || fallbackValue.zh, targetValue.en || fallbackValue.en);

  if (mergedText && mergedText !== getEditorMixedText(targetField)) {
    setEditorMixedText(targetField, mergedText);
  }
}

function mergeEditorRowValue(targetRow, fallbackRow, aliasesZh = [], aliasesEn = [], rawAliases = []) {
  if (!targetRow || !fallbackRow) {
    return;
  }

  const targetText = getEditorRowMixedText(targetRow, aliasesZh, aliasesEn, rawAliases);
  const fallbackText = getEditorRowMixedText(fallbackRow, aliasesZh, aliasesEn, rawAliases);
  const targetValue = splitEditorMixedValue(targetText, "zh");
  const fallbackValue = splitEditorMixedValue(fallbackText, "zh");
  const mergedText = composeEditorMixedText(targetValue.zh || fallbackValue.zh, targetValue.en || fallbackValue.en);

  if (mergedText && mergedText !== targetText) {
    setEditorRowMixedText(targetRow, aliasesZh, aliasesEn, mergedText, rawAliases);
  }

  if (rawAliases.length) {
    const rawValue = getEditorObjectValue(fallbackRow, rawAliases);
    if (rawValue && !getEditorObjectValue(targetRow, rawAliases)) {
      setEditorObjectValue(targetRow, rawAliases, rawValue);
    }
  }
}

function buildStructuredFallbackEditorFromPreviewHtml(html) {
  const pairs = extractPreviewTableFieldPairs(html);
  if (typeof window === "undefined" || typeof DOMParser === "undefined") {
    return pairs.length
      ? {
          short_fields: pairs.map((pair, index) => {
            const separated = splitMixedLanguageText(pair.value);
            const meta = getStructuredShortFieldMetaFromLabel(pair.label);
            return {
              key: meta?.key || `table-fallback-short-${index + 1}`,
              label: meta?.label || pair.label,
              zh_text: separated.zh || pair.value,
              en_text: separated.en || "",
            };
          }),
          work_experiences: [],
          education_experiences: [],
          long_fields: [],
        }
      : null;
  }

  const parser = new DOMParser();
  const doc = parser.parseFromString(String(html || ""), "text/html");
  const headings = Array.from(doc.querySelectorAll("h1, h2, h3, h4, h5, h6"));
  const allTables = Array.from(doc.querySelectorAll("table"));

  const parseMixedCell = (value) => {
    const text = normalizePreviewText(value || "");
    const displaySplit = splitDisplayBilingualText(text);
    const separated = splitMixedLanguageText(text);
    return {
      zh: displaySplit?.zh || separated.zh || text,
      en: displaySplit?.en || separated.en || "",
    };
  };

  const parseTableRows = (tableElement, cellKeys) => {
    if (!tableElement || tableElement.tagName !== "TABLE") {
      return [];
    }

    return Array.from(tableElement.querySelectorAll("tr"))
      .slice(1)
      .map((row, index) => {
        const cells = Array.from(row.children).filter((cell) => /^(TD|TH)$/i.test(cell.tagName));
        if (!cells.length) {
          return null;
        }

        const texts = cells.map((cell) => normalizePreviewText(cell.textContent || ""));
        if (!texts.some(Boolean)) {
          return null;
        }

        const item = { index: index + 1 };
        cellKeys.forEach((keys, cellIndex) => {
          const rawText = texts[cellIndex] || "";
          const parsed = parseMixedCell(rawText);
          item[keys.zh] = parsed.zh;
          item[keys.en] = parsed.en;
          if (keys.raw) {
            item[keys.raw] = rawText;
          }
        });
        return item;
      })
      .filter(Boolean);
  };

  const findTableByKeywords = (keywords = []) => {
    const normalizedKeywords = keywords.map(normalizeEditorAlias).filter(Boolean);
    return (
      allTables.find((table) => {
        const tableText = normalizeEditorAlias(normalizePreviewText(table.textContent || ""));
        return normalizedKeywords.every((keyword) => tableText.includes(keyword));
      }) || null
    );
  };

  const shortFields = pairs.map((pair, index) => {
    const separated = splitMixedLanguageText(pair.value);
    const meta = getStructuredShortFieldMetaFromLabel(pair.label);
    return {
      key: meta?.key || `table-fallback-short-${index + 1}`,
      label: meta?.label || pair.label,
      zh_text: separated.zh || pair.value,
      en_text: separated.en || "",
    };
  });

  const workExperiences = parseTableRows(
    findTableByKeywords(["dates of employment", "organization", "position/title"]) ||
      findTableByKeywords(["起止日期", "工作单位", "担任职务"]),
    [
    { zh: "dates_zh", en: "dates_en", raw: "dates_display" },
    { zh: "organization_zh", en: "organization_en" },
    { zh: "position_zh", en: "position_en" },
    ]
  );

  const educationExperiences = parseTableRows(
    findTableByKeywords(["dates of attendance", "institution", "field of study", "degree obtained"]) ||
      findTableByKeywords(["起止日期", "毕业院校", "学习专业", "学历学位"]),
    [
    { zh: "dates_zh", en: "dates_en", raw: "dates_display" },
    { zh: "institution_zh", en: "institution_en" },
    { zh: "course_zh", en: "course_en" },
    { zh: "degree_zh", en: "degree_en" },
    ]
  );

  const previewLines = normalizePreviewText(html)
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  const longFieldDefinitions = [
    { key: "introduction", label: "Introduction", test: /^(introduction|企业简介)$/i },
    { key: "professionalexperience", label: "Professional Experience", test: /^(professional experience|个人职业经历)$/i },
    { key: "programmotivation", label: "Program Motivation", test: /^(why do you want to join this program.*|您为什么想参加这个项目.*)$/i },
    { key: "note", label: "Note", test: /^(note|备注)$/i },
  ];
  const longFields = longFieldDefinitions
    .map((definition, index) => {
      const startIndex = previewLines.findIndex((line) => definition.test.test(line));
      if (startIndex < 0) {
        return null;
      }

      const nextStartCandidates = longFieldDefinitions
        .slice(index + 1)
        .map((item) => previewLines.findIndex((line, lineIndex) => lineIndex > startIndex && item.test.test(line)))
        .filter((value) => value > startIndex);
      const nextStartIndex = nextStartCandidates.length ? Math.min(...nextStartCandidates) : previewLines.length;
      const text = previewLines.slice(startIndex + 1, nextStartIndex).join("\n").trim();
      if (!text) {
        return null;
      }

      const separated = splitMixedLanguageText(text);
      return {
        key: definition.key,
        label: definition.label,
        zh_text: separated.zh || text,
        en_text: separated.en || "",
      };
    })
    .filter(Boolean);

  if (!pairs.length && !workExperiences.length && !educationExperiences.length && !longFields.length) {
    return null;
  }

  return {
    short_fields: shortFields,
    work_experiences: workExperiences,
    education_experiences: educationExperiences,
    long_fields: longFields,
  };
}

function isEditorFieldEmpty(field) {
  return !String(getEditorMixedText(field) || "").trim();
}

function mergeMissingEditorField(targetEditor, fallbackEditor, sectionKey, aliasGroups = []) {
  if (!targetEditor || !fallbackEditor) {
    return;
  }

  if (!Array.isArray(targetEditor[sectionKey])) {
    targetEditor[sectionKey] = [];
  }

  const targetFields = targetEditor[sectionKey];
  const fallbackFields = Array.isArray(fallbackEditor?.[sectionKey]) ? fallbackEditor[sectionKey] : [];

  aliasGroups.forEach((aliases) => {
    const targetField = findEditorFieldByAliases(targetFields, aliases);
    const fallbackField = findEditorFieldByAliases(fallbackFields, aliases);

    if (!fallbackField) {
      return;
    }

    if (targetField) {
      mergeEditorFieldValue(targetField, fallbackField);
      return;
    }

    targetFields.push({ ...fallbackField });
  });
}

function mergeMissingStructuredEditorValues(targetEditor, fallbackEditor) {
  if (!targetEditor || !fallbackEditor) {
    return targetEditor;
  }

  mergeMissingEditorField(targetEditor, fallbackEditor, "short_fields", [
    ["name", "full_name", "candidate_name", "applicantname"],
    ["dateofbirth", "date birth", "date_of_birth", "birthdate", "dob", "birthday", "dateofbirthformatddmmyyyy", "dateofbirthformatdaymonthyear"],
    ["gender", "sex", "gendervalue", "gender_value", "gendermalefemale", "sexmalefemale"],
    ["nationality", "citizenship", "country", "nationalitystatus"],
    ["organizationname", "organization_name", "companyname", "company_name", "company", "organization"],
    ["position", "positiontitle", "title", "jobtitle", "job_position"],
    ["assets", "asset", "totalassets", "total_assets"],
    ["employees", "employee", "staff", "staffcount", "employeecount"],
    ["revenue", "turnover", "income", "annualrevenue"],
    ["industry", "businessindustry", "companyindustry"],
  ]);

  mergeMissingEditorField(targetEditor, fallbackEditor, "long_fields", [
    ["introduction", "companyintroduction", "company_profile", "companyprofile"],
    ["professionalexperience", "individualexperience", "careerhistory", "workexperience"],
    ["programmotivation", "motivation", "reason", "program_reason", "whydoyouwanttojointhisprogramandwhatdoyouhopetogainfromit"],
    ["note", "remark", "remarks", "memo"],
  ]);

  const mergeRowSection = (sectionKey, fieldGroups) => {
    const targetRows = Array.isArray(targetEditor[sectionKey]) ? targetEditor[sectionKey] : [];
    const fallbackRows = Array.isArray(fallbackEditor[sectionKey]) ? fallbackEditor[sectionKey] : [];

    fallbackRows.forEach((fallbackRow, index) => {
      if (!targetRows[index]) {
        targetRows[index] = { ...fallbackRow };
        return;
      }

      fieldGroups.forEach(({ zh, en, raw }) => {
        mergeEditorRowValue(targetRows[index], fallbackRow, zh, en, raw);
      });
    });

    targetEditor[sectionKey] = targetRows;
  };

  mergeRowSection("work_experiences", [
    { zh: ["dates_zh", "date_zh", "dates_of_employment_zh", "employment_dates_zh", "dates_of_employment"], en: ["dates_en", "date_en", "dates_of_employment_en", "employment_dates_en"], raw: ["dates_display"] },
    { zh: ["organization_zh", "organization", "company_zh"], en: ["organization_en", "organization_en_text", "company_en"] },
    { zh: ["position_zh", "position_title_zh", "title_zh"], en: ["position_en", "position_title_en", "title_en"] },
  ]);

  mergeRowSection("education_experiences", [
    { zh: ["dates_zh", "date_zh", "dates_of_attendance_zh", "attendance_dates_zh", "dates_of_attendance"], en: ["dates_en", "date_en", "dates_of_attendance_en", "attendance_dates_en"], raw: ["dates_display"] },
    { zh: ["institution_zh", "school_zh"], en: ["institution_en", "school_en"] },
    { zh: ["course_zh", "field_of_study_zh", "major_zh"], en: ["course_en", "field_of_study_en", "major_en"] },
    { zh: ["degree_zh", "degree_obtained_zh"], en: ["degree_en", "degree_obtained_en"] },
  ]);

  return targetEditor;
}

function hasStructuredBilingualEditorPayload(editor) {
  return !!(
    editor &&
    typeof editor === "object" &&
    (Array.isArray(editor.short_fields) ||
      Array.isArray(editor.work_experiences) ||
      Array.isArray(editor.education_experiences) ||
      Array.isArray(editor.long_fields))
  );
}

function getEditorFieldByAliasesFromEditor(editor, sectionKey, aliases = []) {
  const fields = Array.isArray(editor?.[sectionKey]) ? editor[sectionKey] : [];
  return findEditorFieldByAliases(fields, aliases);
}

function getEditorMixedText(field) {
  const zh = String(
    field?.zh_text ||
      field?.source_text ||
      field?.source ||
      field?.value_zh ||
      field?.text_zh ||
      ""
  ).trim();
  const en = String(
    field?.en_text ||
      field?.translated_text ||
      field?.translation ||
      field?.value_en ||
      field?.text_en ||
      ""
  ).trim();
  const single = String(field?.value || field?.text || field?.content || "").trim();
  if (zh && en) {
    return `${zh} / ${en}`;
  }
  return zh || en || single || "";
}

function getEditorRowMixedText(item, aliasesZh = [], aliasesEn = [], rawAliases = []) {
  const raw = getEditorObjectValue(item, rawAliases).trim();
  if (raw) {
    return raw;
  }

  const zh = getEditorObjectValue(item, [...aliasesZh, "value_zh", "text_zh", "source_text"]).trim();
  const en = getEditorObjectValue(item, [...aliasesEn, "value_en", "text_en", "translated_text"]).trim();
  const single = getEditorObjectValue(item, [
    "value",
    "text",
    "content",
    "dates_of_employment",
    "dates_of_attendance",
    "date",
    "dates",
  ]).trim();
  if (zh && en) {
    return `${zh} / ${en}`;
  }

  if (zh && !en) {
    const parsed = splitEditorMixedValue(zh, "zh");
    if (parsed.zh && parsed.en) {
      return `${parsed.zh} / ${parsed.en}`;
    }
  }

  if (!zh && en) {
    const parsed = splitEditorMixedValue(en, "en");
    if (parsed.zh && parsed.en) {
      return `${parsed.zh} / ${parsed.en}`;
    }
  }

  if (single) {
    const parsed = splitEditorMixedValue(single, "zh");
    if (parsed.zh && parsed.en) {
      return `${parsed.zh} / ${parsed.en}`;
    }
  }

  return zh || en || single || "";
}

function getEditorDateDisplayText(item, fallbackItem, aliasesZh = [], aliasesEn = [], rawAliases = []) {
  const fallbackRaw = getEditorObjectValue(fallbackItem, rawAliases).trim();
  if (fallbackRaw) {
    return fallbackRaw;
  }

  const fallbackMixed = getEditorRowMixedText(fallbackItem, aliasesZh, aliasesEn, rawAliases);
  if (String(fallbackMixed || "").trim()) {
    return fallbackMixed;
  }

  return getEditorRowMixedText(item, aliasesZh, aliasesEn, rawAliases);
}

function splitDisplayBilingualText(value) {
  const text = String(value || "").trim();
  if (!text) {
    return null;
  }

  const divider = text.match(/\s+\/\s+/);
  if (!divider) {
    return null;
  }

  const parts = text.split(/\s+\/\s+/);
  if (parts.length < 2) {
    return null;
  }

  const zh = parts.shift()?.trim() || "";
  const en = parts.join(" / ").trim();
  if (!zh || !en) {
    return null;
  }

  return { zh, en };
}

function splitEditorMixedValue(value, preferredLanguage = "zh") {
  const text = String(value || "").trim();
  if (!text) {
    return { zh: "", en: "" };
  }

  const displaySplit = splitDisplayBilingualText(text);
  if (displaySplit) {
    return displaySplit;
  }

  const separated = splitMixedLanguageText(text);
  if (separated.zh && separated.en) {
    return separated;
  }

  return preferredLanguage === "en"
    ? { zh: "", en: text }
    : { zh: text, en: "" };
}

function setEditorMixedText(field, value) {
  if (!field || typeof field !== "object") {
    return;
  }

  const preferredLanguage = String(field?.zh_text || "").trim() ? "zh" : String(field?.en_text || "").trim() ? "en" : "zh";
  const nextValue = splitEditorMixedValue(value, preferredLanguage);
  if ("zh_text" in field || "en_text" in field || (!("value" in field) && !("text" in field))) {
    field.zh_text = nextValue.zh;
    field.en_text = nextValue.en;
    return;
  }

  if ("value" in field) {
    field.value = value;
    return;
  }

  if ("text" in field) {
    field.text = value;
  }
}

function setEditorRowMixedText(item, aliasesZh = [], aliasesEn = [], value, rawAliases = []) {
  if (!item || typeof item !== "object") {
    return;
  }

  const currentZh = getEditorObjectValue(item, aliasesZh).trim();
  const currentEn = getEditorObjectValue(item, aliasesEn).trim();
  const currentSingle = getEditorObjectValue(item, [
    "value",
    "text",
    "content",
    "dates_of_employment",
    "dates_of_attendance",
    "date",
    "dates",
  ]).trim();
  const preferredLanguage = currentZh ? "zh" : currentEn ? "en" : "zh";
  const nextValue = splitEditorMixedValue(value, preferredLanguage);

  if (!currentZh && !currentEn && currentSingle) {
    const singleKey = ["value", "text", "content", "dates_of_employment", "dates_of_attendance", "date", "dates"].find((alias) => alias in item);
    if (singleKey) {
      item[singleKey] = value;
      return;
    }
  }

  setEditorObjectValue(item, aliasesZh, nextValue.zh);
  setEditorObjectValue(item, aliasesEn, nextValue.en);
  if (rawAliases.length) {
    setEditorObjectValue(item, rawAliases, value);
  }
}

function cloneEditorValue(value) {
  if (value == null) {
    return value;
  }

  if (typeof structuredClone === "function") {
    try {
      return structuredClone(value);
    } catch {}
  }

  return JSON.parse(JSON.stringify(value));
}

function syncFieldLanguageValues(field) {
  if (!field || typeof field !== "object") {
    return;
  }

  const zh = String(
    field?.zh_text ??
      field?.source_text ??
      field?.value_zh ??
      field?.text_zh ??
      ""
  ).trim();
  const en = String(
    field?.en_text ??
      field?.translated_text ??
      field?.translation ??
      field?.value_en ??
      field?.text_en ??
      ""
  ).trim();

  if ("zh_text" in field || "source_text" in field || "value_zh" in field || "text_zh" in field) {
    field.zh_text = zh;
    if ("source_text" in field) field.source_text = zh;
    if ("value_zh" in field) field.value_zh = zh;
    if ("text_zh" in field) field.text_zh = zh;
  }

  if ("en_text" in field || "translated_text" in field || "translation" in field || "value_en" in field || "text_en" in field) {
    field.en_text = en;
    if ("translated_text" in field) field.translated_text = en;
    if ("translation" in field) field.translation = en;
    if ("value_en" in field) field.value_en = en;
    if ("text_en" in field) field.text_en = en;
  }
}

function syncRowLanguageValues(item, aliasesZh = [], aliasesEn = [], rawAliases = []) {
  if (!item || typeof item !== "object") {
    return;
  }

  const mixedValue = getEditorRowMixedText(item, aliasesZh, aliasesEn, rawAliases);
  const nextValue = splitEditorMixedValue(mixedValue, "zh");

  aliasesZh.forEach((alias) => {
    if (alias in item) {
      item[alias] = nextValue.zh;
    }
  });
  aliasesEn.forEach((alias) => {
    if (alias in item) {
      item[alias] = nextValue.en;
    }
  });

  if (!aliasesZh.some((alias) => alias in item) && aliasesZh[0]) {
    item[aliasesZh[0]] = nextValue.zh;
  }
  if (!aliasesEn.some((alias) => alias in item) && aliasesEn[0]) {
    item[aliasesEn[0]] = nextValue.en;
  }

  if (rawAliases.length) {
    rawAliases.forEach((alias) => {
      if (alias in item) {
        item[alias] = mixedValue;
      }
    });
    if (!rawAliases.some((alias) => alias in item) && rawAliases[0]) {
      item[rawAliases[0]] = mixedValue;
    }
  }
}

function normalizeEditorPayloadForSave(editor) {
  const payload = cloneEditorValue(editor);
  if (!payload || typeof payload !== "object") {
    return payload;
  }

  (payload.short_fields || []).forEach(syncFieldLanguageValues);
  (payload.long_fields || []).forEach(syncFieldLanguageValues);

  (payload.work_experiences || []).forEach((item) => {
    syncRowLanguageValues(
      item,
      ["dates_zh", "date_zh", "dates_of_employment_zh", "employment_dates_zh", "dates_of_employment"],
      ["dates_en", "date_en", "dates_of_employment_en", "employment_dates_en"],
      ["dates_display"]
    );
    syncRowLanguageValues(
      item,
      ["organization_zh", "organization", "company_zh"],
      ["organization_en", "organization_en_text", "company_en"]
    );
    syncRowLanguageValues(
      item,
      ["position_zh", "position_title_zh", "title_zh"],
      ["position_en", "position_title_en", "title_en"]
    );
  });

  (payload.education_experiences || []).forEach((item) => {
    syncRowLanguageValues(
      item,
      ["dates_zh", "date_zh", "dates_of_attendance_zh", "attendance_dates_zh", "dates_of_attendance"],
      ["dates_en", "date_en", "dates_of_attendance_en", "attendance_dates_en"],
      ["dates_display"]
    );
    syncRowLanguageValues(item, ["institution_zh", "school_zh"], ["institution_en", "school_en"]);
    syncRowLanguageValues(item, ["course_zh", "field_of_study_zh", "major_zh"], ["course_en", "field_of_study_en", "major_en"]);
    syncRowLanguageValues(item, ["degree_zh", "degree_obtained_zh"], ["degree_en", "degree_obtained_en"]);
  });

  return payload;
}

function buildBilingualPreviewHtmlFromEditor(editor) {
  if (!hasStructuredBilingualEditorPayload(editor)) {
    return "";
  }

  const workRows = Array.from({ length: 3 }, (_, index) => editor?.work_experiences?.[index] || {});
  const educationRows = Array.from({ length: 3 }, (_, index) => editor?.education_experiences?.[index] || {});

  const nameField = getEditorFieldByAliasesFromEditor(editor, "short_fields", ["name", "full_name", "candidate_name", "applicantname"]);
  const dobField = getEditorFieldByAliasesFromEditor(editor, "short_fields", [
    "dateofbirth",
    "date birth",
    "date_of_birth",
    "birthdate",
    "dob",
    "birthday",
    "dateofbirthformatddmmyyyy",
    "dateofbirthformatdaymonthyear",
  ]);
  const genderField = getEditorFieldByAliasesFromEditor(editor, "short_fields", [
    "gender",
    "sex",
    "gendervalue",
    "gender_value",
    "gendermalefemale",
    "sexmalefemale",
  ]);
  const nationalityField = getEditorFieldByAliasesFromEditor(editor, "short_fields", ["nationality", "citizenship", "country", "nationalitystatus"]);
  const organizationField = getEditorFieldByAliasesFromEditor(editor, "short_fields", ["organizationname", "organization_name", "companyname", "company_name", "company", "organization"]);
  const positionField = getEditorFieldByAliasesFromEditor(editor, "short_fields", ["position", "positiontitle", "title", "jobtitle", "job_position"]);
  const assetsField = getEditorFieldByAliasesFromEditor(editor, "short_fields", ["assets", "asset", "totalassets", "total_assets"]);
  const employeesField = getEditorFieldByAliasesFromEditor(editor, "short_fields", ["employees", "employee", "staff", "staffcount", "employeecount"]);
  const revenueField = getEditorFieldByAliasesFromEditor(editor, "short_fields", ["revenue", "turnover", "income", "annualrevenue"]);
  const industryField = getEditorFieldByAliasesFromEditor(editor, "short_fields", ["industry", "businessindustry", "companyindustry"]);

  const introductionField = getEditorFieldByAliasesFromEditor(editor, "long_fields", ["introduction", "companyintroduction", "company_profile", "companyprofile"]);
  const professionalExperienceField = getEditorFieldByAliasesFromEditor(editor, "long_fields", ["professionalexperience", "individualexperience", "careerhistory", "workexperience"]);
  const programMotivationField = getEditorFieldByAliasesFromEditor(editor, "long_fields", [
    "programmotivation",
    "motivation",
    "reason",
    "program_reason",
    "whydoyouwanttojointhisprogramandwhatdoyouhopetogainfromit",
  ]);
  const noteField = getEditorFieldByAliasesFromEditor(editor, "long_fields", ["note", "remark", "remarks", "memo"]);

  const workHtml = workRows
    .map(
      (item) => `
        <tr>
          <td>${escapeHtml(getEditorRowMixedText(item, ["dates_zh", "date_zh", "dates_of_employment_zh", "employment_dates_zh", "dates_of_employment"], ["dates_en", "date_en", "dates_of_employment_en", "employment_dates_en"], ["dates_display"]))}</td>
          <td>${escapeHtml(getEditorRowMixedText(item, ["organization_zh", "organization", "company_zh"], ["organization_en", "organization_en_text", "company_en"]))}</td>
          <td>${escapeHtml(getEditorRowMixedText(item, ["position_zh", "position_title_zh", "title_zh"], ["position_en", "position_title_en", "title_en"]))}</td>
        </tr>
      `
    )
    .join("");

  const educationHtml = educationRows
    .map(
      (item) => `
        <tr>
          <td>${escapeHtml(getEditorRowMixedText(item, ["dates_zh", "date_zh", "dates_of_attendance_zh", "attendance_dates_zh", "dates_of_attendance"], ["dates_en", "date_en", "dates_of_attendance_en", "attendance_dates_en"], ["dates_display"]))}</td>
          <td>${escapeHtml(getEditorRowMixedText(item, ["institution_zh", "school_zh"], ["institution_en", "school_en"]))}</td>
          <td>${escapeHtml(getEditorRowMixedText(item, ["course_zh", "field_of_study_zh", "major_zh"], ["course_en", "field_of_study_en", "major_en"]))}</td>
          <td>${escapeHtml(getEditorRowMixedText(item, ["degree_zh", "degree_obtained_zh"], ["degree_en", "degree_obtained_en"]))}</td>
        </tr>
      `
    )
    .join("");

  const block = (titleEn, titleZh, field) => `
    <h3>${escapeHtml(titleEn)}<br>${escapeHtml(titleZh)}</h3>
    <div class="document-preview-paragraph">${escapeHtml(getEditorMixedText(field)).replace(/\n/g, "<br>")}</div>
  `;

  return `
    <div class="document-preview-sheet">
      <table>
        <tbody>
          <tr><th colspan="4">Candidate Summary Sheet<br>\u5019\u9009\u4eba\u7b80\u8868</th></tr>
          <tr><th colspan="4">Basic Information<br>基本信息</th></tr>
          <tr>
            <td>Name<br>姓名</td>
            <td>${escapeHtml(getEditorMixedText(nameField))}</td>
            <td>Date of Birth<br>出生日期<br>（格式：日/月/年）</td>
            <td>${escapeHtml(getEditorMixedText(dobField))}</td>
          </tr>
          <tr>
            <td>Gender<br>性别</td>
            <td>${escapeHtml(getEditorMixedText(genderField))}</td>
            <td>Nationality<br>国籍</td>
            <td>${escapeHtml(getEditorMixedText(nationalityField))}</td>
          </tr>
          <tr>
            <td>Organization Name<br>公司名称</td>
            <td colspan="2">${escapeHtml(getEditorMixedText(organizationField))}</td>
            <td>Position<br>职务<br><br>${escapeHtml(getEditorMixedText(positionField))}</td>
          </tr>
          <tr><th colspan="4">Company Profile<br>公司概况</th></tr>
          <tr>
            <td>Assets<br>总资产</td>
            <td>${escapeHtml(getEditorMixedText(assetsField))}</td>
            <td>Employees<br>员工人数</td>
            <td>${escapeHtml(getEditorMixedText(employeesField))}</td>
          </tr>
          <tr>
            <td>Revenue<br>企业营收</td>
            <td>${escapeHtml(getEditorMixedText(revenueField))}</td>
            <td>Industry<br>公司行业</td>
            <td>${escapeHtml(getEditorMixedText(industryField))}</td>
          </tr>
        </tbody>
      </table>
      <h3>Work Experience<br>工作经历</h3>
      <table>
        <tbody>
          <tr>
            <th>Dates of Employment<br>起止日期（年/月）</th>
            <th>Organization<br>工作单位</th>
            <th>Position/Title<br>担任职务</th>
          </tr>
          ${workHtml}
        </tbody>
      </table>
      <h3>Educational Background<br>教育经历</h3>
      <table>
        <tbody>
          <tr>
            <th>Dates of Attendance<br>起止日期</th>
            <th>Institution<br>毕业院校</th>
            <th>Field of Study<br>学习专业</th>
            <th>Degree Obtained<br>学历/学位</th>
          </tr>
          ${educationHtml}
        </tbody>
      </table>
      ${block("Introduction", "\u4f01\u4e1a\u7b80\u4ecb", introductionField)}
      ${block("Professional Experience", "个人职业经历", professionalExperienceField)}
      ${block("Why do you want to join this program, and what do you hope to gain from it?", "您为什么想参加这个项目？", programMotivationField)}
      ${block("Note", "备注", noteField)}
    </div>
  `;
}

function normalizeEditorSnapshotText(value) {
  return String(value || "").replace(/\r\n/g, "\n").trim();
}

function isEmptyEditorSnapshotValue(value) {
  if (Array.isArray(value)) {
    return value.every((item) => isEmptyEditorSnapshotValue(item));
  }

  if (isPlainObject(value)) {
    return Object.values(value).every((item) => isEmptyEditorSnapshotValue(item));
  }

  return !normalizeEditorSnapshotText(value);
}

function normalizeGenericEditorSnapshotValue(value) {
  if (Array.isArray(value)) {
    const normalized = value.map((item) => normalizeGenericEditorSnapshotValue(item));
    while (normalized.length && isEmptyEditorSnapshotValue(normalized[normalized.length - 1])) {
      normalized.pop();
    }
    return normalized;
  }

  if (isPlainObject(value)) {
    return Object.keys(value)
      .sort()
      .reduce((result, key) => {
        result[key] = normalizeGenericEditorSnapshotValue(value[key]);
        return result;
      }, {});
  }

  return typeof value === "string" ? normalizeEditorSnapshotText(value) : value ?? "";
}

function buildStructuredEditorPersistenceSnapshot(editor) {
  const snapshot = {
    short_fields: {
      name: normalizeEditorSnapshotText(
        getEditorMixedText(getEditorFieldByAliasesFromEditor(editor, "short_fields", ["name", "full_name", "candidate_name", "applicantname", "姓名"]))
      ),
      date_of_birth: normalizeEditorSnapshotText(
        getEditorMixedText(
          getEditorFieldByAliasesFromEditor(editor, "short_fields", [
            "dateofbirth",
            "date birth",
            "date_of_birth",
            "birthdate",
            "dob",
            "birthday",
            "dateofbirthformatddmmyyyy",
            "dateofbirthformatdaymonthyear",
            "出生日期",
            "生日",
          ])
        )
      ),
      gender: normalizeEditorSnapshotText(
        getEditorMixedText(
          getEditorFieldByAliasesFromEditor(editor, "short_fields", [
            "gender",
            "sex",
            "gendervalue",
            "gender_value",
            "gendermalefemale",
            "sexmalefemale",
            "性别",
          ])
        )
      ),
      nationality: normalizeEditorSnapshotText(
        getEditorMixedText(
          getEditorFieldByAliasesFromEditor(editor, "short_fields", ["nationality", "citizenship", "country", "nationalitystatus", "国籍"])
        )
      ),
      organization: normalizeEditorSnapshotText(
        getEditorMixedText(
          getEditorFieldByAliasesFromEditor(editor, "short_fields", [
            "organizationname",
            "organization_name",
            "companyname",
            "company_name",
            "company",
            "organization",
            "公司名称",
          ])
        )
      ),
      position: normalizeEditorSnapshotText(
        getEditorMixedText(
          getEditorFieldByAliasesFromEditor(editor, "short_fields", ["position", "positiontitle", "title", "jobtitle", "job_position", "职务", "职位"])
        )
      ),
      assets: normalizeEditorSnapshotText(
        getEditorMixedText(getEditorFieldByAliasesFromEditor(editor, "short_fields", ["assets", "asset", "totalassets", "total_assets", "总资产"]))
      ),
      employees: normalizeEditorSnapshotText(
        getEditorMixedText(getEditorFieldByAliasesFromEditor(editor, "short_fields", ["employees", "employee", "staff", "staffcount", "employeecount", "员工人数"]))
      ),
      revenue: normalizeEditorSnapshotText(
        getEditorMixedText(getEditorFieldByAliasesFromEditor(editor, "short_fields", ["revenue", "turnover", "income", "annualrevenue", "营收", "营业收入", "企业营收"]))
      ),
      industry: normalizeEditorSnapshotText(
        getEditorMixedText(getEditorFieldByAliasesFromEditor(editor, "short_fields", ["industry", "businessindustry", "companyindustry", "行业", "公司行业"]))
      ),
    },
    long_fields: {
      introduction: normalizeEditorSnapshotText(
        getEditorMixedText(
          getEditorFieldByAliasesFromEditor(editor, "long_fields", ["introduction", "companyintroduction", "company_profile", "companyprofile"])
        )
      ),
      professional_experience: normalizeEditorSnapshotText(
        getEditorMixedText(
          getEditorFieldByAliasesFromEditor(editor, "long_fields", ["professionalexperience", "individualexperience", "careerhistory", "workexperience", "个人职业经历"])
        )
      ),
      program_motivation: normalizeEditorSnapshotText(
        getEditorMixedText(
          getEditorFieldByAliasesFromEditor(editor, "long_fields", [
            "programmotivation",
            "program_motivation",
            "motivation",
            "reason",
            "program_reason",
            "whydoyouwanttojointhisprogramandwhatdoyouhopetogainfromit",
            "您为什么想参加这个项目？",
          ])
        )
      ),
      note: normalizeEditorSnapshotText(
        getEditorMixedText(getEditorFieldByAliasesFromEditor(editor, "long_fields", ["note", "remark", "remarks", "memo", "备注"]))
      ),
    },
    work_experiences: (editor?.work_experiences || [])
      .map((item) => ({
        dates: normalizeEditorSnapshotText(
          getEditorRowMixedText(item, ["dates_zh", "date_zh", "dates_of_employment_zh", "employment_dates_zh", "dates_of_employment"], ["dates_en", "date_en", "dates_of_employment_en", "employment_dates_en"], ["dates_display"])
        ),
        organization: normalizeEditorSnapshotText(
          getEditorRowMixedText(item, ["organization_zh", "organization", "company_zh"], ["organization_en", "organization_en_text", "company_en"])
        ),
        position: normalizeEditorSnapshotText(
          getEditorRowMixedText(item, ["position_zh", "position_title_zh", "title_zh"], ["position_en", "position_title_en", "title_en"])
        ),
      }))
      .filter((item) => !isEmptyEditorSnapshotValue(item)),
    education_experiences: (editor?.education_experiences || [])
      .map((item) => ({
        dates: normalizeEditorSnapshotText(
          getEditorRowMixedText(item, ["dates_zh", "date_zh", "dates_of_attendance_zh", "attendance_dates_zh", "dates_of_attendance"], ["dates_en", "date_en", "dates_of_attendance_en", "attendance_dates_en"], ["dates_display"])
        ),
        institution: normalizeEditorSnapshotText(
          getEditorRowMixedText(item, ["institution_zh", "school_zh"], ["institution_en", "school_en"])
        ),
        course: normalizeEditorSnapshotText(
          getEditorRowMixedText(item, ["course_zh", "field_of_study_zh", "major_zh"], ["course_en", "field_of_study_en", "major_en"])
        ),
        degree: normalizeEditorSnapshotText(
          getEditorRowMixedText(item, ["degree_zh", "degree_obtained_zh"], ["degree_en", "degree_obtained_en"])
        ),
      }))
      .filter((item) => !isEmptyEditorSnapshotValue(item)),
  };

  return snapshot;
}

function buildEditorPersistenceSnapshot(editor) {
  const normalizedEditor = normalizeEditorPayloadForSave(editor || {});
  const snapshot = {};

  if (hasStructuredBilingualEditorPayload(normalizedEditor)) {
    snapshot.structured = buildStructuredEditorPersistenceSnapshot(normalizedEditor);
  }

  const genericSections = Object.entries(normalizedEditor || {})
    .filter(([key, value]) => !structuredEditorSectionKeys.includes(key) && value !== null && value !== undefined)
    .sort(([leftKey], [rightKey]) => leftKey.localeCompare(rightKey))
    .reduce((result, [key, value]) => {
      result[key] = normalizeGenericEditorSnapshotValue(value);
      return result;
    }, {});

  if (Object.keys(genericSections).length) {
    snapshot.generic = genericSections;
  }

  return snapshot;
}

function serializeEditorSnapshot(editor) {
  return JSON.stringify(buildEditorPersistenceSnapshot(editor));
}

function syncEditorInitialSnapshot(editor) {
  editorInitialSnapshot.value = serializeEditorSnapshot(editor);
}

function hasUnsavedEditorChanges() {
  if (!editingDocumentId.value) {
    return false;
  }

  const editableEl = getEditorEditableElement();
  if (!editableEl) {
    return false;
  }

  return normalizeEditorSnapshotText(editableEl.innerHTML) !== editorInitialSnapshot.value;
}

function getEditorEditableElement() {
  return editorDialog.value?.querySelector?.("#bilingual-preview-content") || null;
}

async function loadBilingualPreview(documentId) {
  const result = await previewDocument(documentId);
  const data = result?.data || {};

  if (!data?.html) {
    throw new Error(currentUiLanguage.value === "en-US" ? "Server did not return preview HTML." : "后端未返回双语预览 HTML。");
  }

  return data;
}

function resolveBilingualSavePayload(result) {
  if (!result?.success) {
    throw new Error(result?.message || (currentUiLanguage.value === "en-US" ? "Failed to save bilingual document." : "保存双语简表失败。"));
  }

  return result?.data || {};
}

async function syncEditorInitialHtmlSnapshot() {
  await nextTick();
  editorInitialSnapshot.value = normalizeEditorSnapshotText(getEditorEditableElement()?.innerHTML || "");
}

function closePreviewDialog() {
  closeDialogWithAnimation(previewDialog);
}

function togglePreviewDialogFullscreen() {
  previewDialogFullscreen.value = !previewDialogFullscreen.value;
}

function closeConfirmDialog() {
  closeDialogWithAnimation(confirmDialog);
}

function closeEditorDialog() {
  if (editorSaving.value || editorLoading.value) {
    return;
  }

  if (hasUnsavedEditorChanges()) {
    openDialogWithAnimation(editorCloseConfirmDialog, {
      originPoint: {
        x: window.innerWidth * 0.76,
        y: window.innerHeight * 0.2,
      },
    });
    return;
  }

  closeDialogWithAnimation(editorDialog);
}

function closeEditorCloseConfirmDialog() {
  if (editorCloseConfirmDialog.value?.open) {
    closeDialogWithAnimation(editorCloseConfirmDialog);
  }
}

function confirmCloseEditorDialog() {
  closeEditorCloseConfirmDialog();
  closeDialogWithAnimation(editorDialog);
}

function toggleEditorDialogFullscreen() {
  editorDialogFullscreen.value = !editorDialogFullscreen.value;
}

function resetPreviewDialogState() {
  activeSubDialog.value = "";
  previewHtml.value = "";
  previewStructuredData.value = null;
  previewDialogFullscreen.value = false;
}

function resetConfirmDialogState() {
  activeSubDialog.value = "";
  confirmActionType.value = "";
  confirmDocumentId.value = null;
  confirmOriginPoint.value = null;
}

function resetEditorDialogState() {
  activeSubDialog.value = "";
  editorLoading.value = false;
  editorSaving.value = false;
  editorData.value = null;
  editorPreviewFallback.value = null;
  editorHtml.value = "";
  editorCanEdit.value = false;
  editingDocumentId.value = null;
  editorInitialSnapshot.value = "";
  editorDialogFullscreen.value = false;
}

function delay(ms) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function getBilingualDocumentSignature(items) {
  return (items || [])
    .filter((item) => item.document_kind === "bilingual")
    .map((item) => `${item.id}:${item.updated_at || item.created_at || ""}`)
    .sort()
    .join("|");
}

function hasBilingualDocx(items) {
  return (items || []).some((item) => item.document_kind === "bilingual" && item.file_type === "docx");
}

function getCachedGenerateState() {
  if (!props.entryId) {
    return null;
  }

  const cached = getCachedResource(generateStateCacheKey.value);
  if (!cached?.documentId) {
    return null;
  }

  if (Date.now() - Number(cached.updatedAt || 0) > 5 * 60 * 1000) {
    clearCachedResource(generateStateCacheKey.value);
    return null;
  }

  return cached;
}

function persistGenerateState(patch = {}) {
  if (!props.entryId) {
    return;
  }

  const current = getCachedResource(generateStateCacheKey.value) || {};
  setCachedResource(generateStateCacheKey.value, {
    ...current,
    ...patch,
    progress: typeof patch.progress === "number" ? patch.progress : generateProgress.value,
    updatedAt: Date.now(),
  });
}

function clearGenerateState() {
  if (!props.entryId) {
    return;
  }
  clearCachedResource(generateStateCacheKey.value);
}

function applyCachedGenerateState() {
  const cached = getCachedGenerateState();
  if (!cached) {
    return null;
  }

  actionBusyId.value = `generate-${cached.documentId}`;
  generateProgress.value = Math.max(Number(cached.progress || 8), 8);
  return cached;
}

function stopGenerateProgress(finalValue = null) {
  if (generateProgressTimer) {
    window.clearInterval(generateProgressTimer);
    generateProgressTimer = null;
  }
  if (typeof finalValue === "number") {
    generateProgress.value = finalValue;
  }
}

function startGenerateProgress(startValue = 6, ceiling = 88) {
  stopGenerateProgress(startValue);
  persistGenerateState({ progress: startValue, phase: "request" });
  generateProgressTimer = window.setInterval(() => {
    const nextStep =
      generateProgress.value < 32 ? 6 : generateProgress.value < 56 ? 4 : generateProgress.value < 76 ? 2 : 1;
    generateProgress.value = Math.min(ceiling, generateProgress.value + nextStep);
    persistGenerateState({ progress: generateProgress.value, phase: "request" });
  }, 260);
}

function startGenerateFinalizeProgress() {
  stopGenerateProgress(Math.max(generateProgress.value, 90));
  persistGenerateState({ progress: generateProgress.value, phase: "syncing" });
  generateProgressTimer = window.setInterval(() => {
    generateProgress.value = Math.min(99, generateProgress.value + 1);
    persistGenerateState({ progress: generateProgress.value, phase: "syncing" });
  }, 420);
}

async function fetchDocumentsFresh() {
  const result = await listEntryDocuments(props.entryId);
  const items = result?.data?.items || [];
  documents.value = items;
  setCachedResource(documentsCacheKey.value, items);
  return items;
}

async function waitForBilingualDocument(previousSignature) {
  const maxAttempts = 45;

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const items = await fetchDocumentsFresh();
    const nextSignature = getBilingualDocumentSignature(items);

    if (nextSignature && nextSignature !== previousSignature) {
      return { items, confirmed: true };
    }

    if (!previousSignature && hasBilingualDocx(items)) {
      return { items, confirmed: true };
    }

    await delay(700);
  }

  return { items: documents.value, confirmed: false };
}

async function restoreGenerateStateIfNeeded() {
  const cached = applyCachedGenerateState();
  if (!cached || restoreGenerateTaskPromise) {
    return;
  }

  if (cached.phase === "syncing") {
    startGenerateFinalizeProgress();
  } else {
    startGenerateProgress(generateProgress.value, 88);
  }

  restoreGenerateTaskPromise = (async () => {
    try {
      const { confirmed } = await waitForBilingualDocument(cached.previousSignature || "");
      if (!confirmed) {
        errorMessage.value = t("document.generateFailed");
        clearGenerateState();
        stopGenerateProgress(0);
        actionBusyId.value = null;
        return;
      }

      stopGenerateProgress(100);
      persistGenerateState({ progress: 100, phase: "done" });
      await delay(280);
      clearGenerateState();
      actionBusyId.value = null;
      generateProgress.value = 0;
      emit("updated");
    } catch (error) {
      errorMessage.value = error.message || t("document.generateFailed");
      clearGenerateState();
      stopGenerateProgress(0);
      actionBusyId.value = null;
    } finally {
      restoreGenerateTaskPromise = null;
    }
  })();
}

async function loadDocuments() {
  if (!props.entryId) {
    documents.value = [];
    return;
  }

  const cached = getCachedResource(documentsCacheKey.value);
  if (cached) {
    documents.value = cached;
    loading.value = false;
  } else {
    loading.value = true;
  }

  errorMessage.value = "";

  try {
    await fetchDocumentsFresh();
  } catch (error) {
    errorMessage.value = error.message || t("document.loadFailed");
  } finally {
    loading.value = false;
    void restoreGenerateStateIfNeeded();
  }
}

async function handleUpload(event) {
  const [file] = event.target.files || [];
  if (!file || !props.entryId) return;

  uploadBusy.value = true;

  try {
    await uploadEntryDocument(props.entryId, file);
    await loadDocuments();
    emit("updated");
  } catch (error) {
    errorMessage.value = error.message || t("document.uploadFailed");
  } finally {
    uploadBusy.value = false;
    event.target.value = "";
  }
}

async function handlePreview(documentId, event) {
  previewHtml.value = "";
  previewStructuredData.value = null;
  previewTitle.value = t("document.previewTitle");
  previewLoading.value = true;
  activeSubDialog.value = "preview";
  openDialogWithAnimation(previewDialog, {
    originPoint: getDialogOriginFromEvent(event, {
      x: window.innerWidth * 0.72,
      y: window.innerHeight * 0.28,
    }),
  });

  try {
    const targetDocument = documents.value.find((item) => String(item.id) === String(documentId)) || null;
    const cachedPreviewHtml = getCachedResource(getPreviewCacheKey(documentId));
    const cachedEditor = getCachedResource(getEditorCacheKey(documentId));
    if (isOnlineSummaryDocument(targetDocument)) {
      const result = await getOnlineSummaryDetail(documentId);
      previewHtml.value = buildOnlineSummaryPreviewHtmlTemplate(result?.data || {});
    } else if (targetDocument?.document_kind === "bilingual") {
      const data = await loadBilingualPreview(documentId);
      previewHtml.value = String(data.html || cachedPreviewHtml || "");
      setCachedResource(getPreviewCacheKey(data.document_id || documentId), previewHtml.value);
    } else {
      const result = await previewDocument(documentId);
      const html = String(result?.data?.html || "");
      const normalizedPreview = normalizePreviewText(html);
      const looksPlainTextFallback =
        !html.trim() ||
        !/<table[\s>]/i.test(html) ||
        (/^name\s*:/i.test(normalizedPreview) && /^assets\s*:/im.test(normalizedPreview));

      previewHtml.value = html || cachedPreviewHtml || (cachedEditor ? buildBilingualPreviewHtmlFromEditor(cachedEditor) : "");
    }
  } catch (error) {
    previewDialog.value?.close();
    errorMessage.value = error.message || t("document.previewFailed");
  } finally {
    previewLoading.value = false;
  }
}

async function handleDownload(document) {
  if (!document?.id) {
    return;
  }

  try {
    if (isOnlineSummaryDocument(document)) {
      const result = await getOnlineSummaryDetail(document.id);
      downloadOnlineSummaryAsWordFile(result?.data || {}, document?.original_filename || document?.name || "candidate-summary");
      return;
    }

    await downloadDocument(document.id);
  } catch (error) {
    errorMessage.value = error.message || t("document.loadFailed");
  }
}

function openGenerateConfirm(event) {
  if (!generateSourceDocument.value) {
    errorMessage.value = t("document.needOriginalDocx");
    return;
  }

  confirmActionType.value = "generate";
  confirmDocumentId.value = generateSourceDocument.value.id;
  confirmOriginPoint.value = getDialogOriginFromEvent(event, {
    x: window.innerWidth * 0.7,
    y: window.innerHeight * 0.26,
  });
  activeSubDialog.value = "confirm";
  openDialogWithAnimation(confirmDialog, { originPoint: confirmOriginPoint.value });
}

function openDeleteConfirm(documentId, event) {
  confirmActionType.value = "delete";
  confirmDocumentId.value = documentId;
  confirmOriginPoint.value = getDialogOriginFromEvent(event, {
    x: window.innerWidth * 0.72,
    y: window.innerHeight * 0.34,
  });
  activeSubDialog.value = "confirm";
  openDialogWithAnimation(confirmDialog, { originPoint: confirmOriginPoint.value });
}

async function executeGenerateBilingual() {
  if (!confirmDocumentId.value) {
    return;
  }

  const documentId = confirmDocumentId.value;
  const previousSignature = getBilingualDocumentSignature(documents.value);
  let generatedBilingualDocumentId = null;
  let completed = false;
  actionBusyId.value = `generate-${documentId}`;
  persistGenerateState({
    documentId,
    previousSignature,
    startedAt: Date.now(),
    progress: 8,
    phase: "request",
  });
  startGenerateProgress(8, 88);
  try {
    const result = await generateBilingualDocument(documentId);
    generatedBilingualDocumentId = result?.data?.document?.id || null;
    startGenerateFinalizeProgress();
    const { confirmed } = await waitForBilingualDocument(previousSignature);
    if (!confirmed) {
      throw new Error(t("document.generateFailed"));
    }
    stopGenerateProgress(100);
    persistGenerateState({ progress: 100, phase: "done" });
    await delay(280);
    completed = true;
    if (generatedBilingualDocumentId) {
      clearCachedResource(getPreviewCacheKey(generatedBilingualDocumentId));
      clearCachedResource(getEditorCacheKey(generatedBilingualDocumentId));
    }
    emit("updated");
  } catch (error) {
    errorMessage.value = error.message || t("document.generateFailed");
  } finally {
    if (completed) {
      clearGenerateState();
      generateProgress.value = 0;
    } else {
      clearGenerateState();
      stopGenerateProgress(0);
    }
    actionBusyId.value = null;
  }
}

async function executeDelete(documentId) {
  actionBusyId.value = `delete-${documentId}`;
  try {
    await deleteDocument(documentId);
    await loadDocuments();
    emit("updated");
  } catch (error) {
    errorMessage.value = error.message || t("document.deleteFailed");
  } finally {
    actionBusyId.value = null;
  }
}

async function confirmDocumentAction() {
  const actionType = confirmActionType.value;
  const documentId = confirmDocumentId.value;

  closeConfirmDialog();

  if (actionType === "generate") {
    await executeGenerateBilingual();
    return;
  }

  if (actionType === "delete" && documentId) {
    await executeDelete(documentId);
  }
}

async function openBilingualEditor(documentId, event) {
  editorLoading.value = true;
  editorData.value = null;
  editorPreviewFallback.value = null;
  editorHtml.value = "";
  editorCanEdit.value = false;
  editorInitialSnapshot.value = "";
  editingDocumentId.value = documentId;
  activeSubDialog.value = "editor";
  openDialogWithAnimation(editorDialog, {
    originPoint: getDialogOriginFromEvent(event, {
      x: window.innerWidth * 0.72,
      y: window.innerHeight * 0.3,
    }),
  });

  try {
    const data = await loadBilingualPreview(documentId);
    editingDocumentId.value = data.document_id || documentId;
    editorCanEdit.value = Boolean(data.can_edit);
    editorHtml.value = String(data.html || "");
    setCachedResource(getPreviewCacheKey(editingDocumentId.value), editorHtml.value);
    await syncEditorInitialHtmlSnapshot();
  } catch (error) {
    editorDialog.value?.close();
    errorMessage.value = error.message || t("document.editorLoadFailed");
  } finally {
    editorLoading.value = false;
  }
}

async function handleSaveEditor() {
  if (!editingDocumentId.value) return;

  if (!editorCanEdit.value) {
    errorMessage.value = currentUiLanguage.value === "en-US" ? "You do not have permission to edit this bilingual document." : "当前用户无权编辑双语简表。";
    return;
  }

  const editableEl = getEditorEditableElement();
  if (!editableEl) {
    errorMessage.value = currentUiLanguage.value === "en-US" ? "Editable bilingual content was not found." : "未找到可编辑的双语内容区域。";
    return;
  }

  editorSaving.value = true;

  try {
    const saveData = resolveBilingualSavePayload(
      await saveBilingualEditor(editingDocumentId.value, editableEl.innerHTML)
    );
    const data = await loadBilingualPreview(editingDocumentId.value);
    if (saveData.content_hash && data.content_hash && saveData.content_hash !== data.content_hash) {
      console.warn("Bilingual save content hash mismatch between save response and preview response.");
    }
    editingDocumentId.value = data.document_id || editingDocumentId.value;
    editorCanEdit.value = Boolean(data.can_edit);
    editorHtml.value = String(data.html || "");
    setCachedResource(getPreviewCacheKey(editingDocumentId.value), editorHtml.value);
    await syncEditorInitialHtmlSnapshot();
    await fetchDocumentsFresh();
    emit("updated");
  } catch (error) {
    errorMessage.value = error.message || t("document.editorSaveFailed");
  } finally {
    editorSaving.value = false;
  }
}

watch(
  () => props.entryId,
  () => {
    applyCachedGenerateState();
    loadDocuments();
  },
  { immediate: true }
);

onBeforeUnmount(() => {
  stopGenerateProgress();
  resetDialogMotion(confirmDialog);
  resetDialogMotion(previewDialog);
  resetDialogMotion(editorDialog);
  resetDialogMotion(editorCloseConfirmDialog);
});
</script>

<template>
  <section class="panel document-manager">
    <div class="panel-header">
      <h2>{{ t("fill.documentTitle") }}</h2>
      <div class="form-actions">
        <button v-if="canFillSimple" class="btn btn-secondary" type="button" :disabled="fillSimpleDisabled" @click="emit('fill-simple', $event)">
          {{ fillSimpleButtonLabel }}
        </button>
        <label v-if="canUpload" class="btn btn-primary document-upload-label" :class="{ 'is-disabled': uploadDisabled }">
          {{ uploadBusy ? t("document.uploading") : t("document.upload") }}
          <input class="hidden-input" type="file" accept=".docx,.pdf" :disabled="uploadDisabled" @change="handleUpload" />
        </label>
        <button
          class="btn btn-secondary document-generate-btn"
          :class="{ 'is-running': actionBusyId?.startsWith('generate-') }"
          :style="generateButtonProgressStyle"
          type="button"
          :disabled="!generateSourceDocument || !!actionBusyId"
          @click="openGenerateConfirm($event)"
        >
          <span class="document-generate-btn-label">{{ generateButtonLabel }}</span>
        </button>
      </div>
    </div>

    <div class="panel-body">
      <ErrorAlert :message="errorMessage" />
      <LoadingBlock v-if="loading" :label="t('common.loading')" />
      <EmptyState v-else-if="!documents.length" :title="t('document.empty')" />

      <div v-else class="document-list">
        <article v-for="document in documents" :key="document.id" class="document-item">
          <div class="document-item-meta">
            <strong>{{ document.original_filename }}</strong>
            <span class="muted-text">{{ document.file_type.toUpperCase() }} | {{ formatDateTime(document.created_at) }} | {{ document.document_kind }}</span>
          </div>

          <div class="form-actions document-item-actions">
            <button class="btn btn-secondary" type="button" :disabled="!!actionBusyId" @click="handleDownload(document)">{{ t("document.download") }}</button>
            <button
              v-if="document.file_type === 'docx' || isOnlineSummaryDocument(document)"
              class="btn btn-secondary"
              type="button"
              :disabled="!!actionBusyId"
              @click="handlePreview(document.id, $event)"
            >
              {{ t("document.preview") }}
            </button>
            <button
              v-if="document.file_type === 'docx' && document.document_kind === 'bilingual'"
              class="btn btn-secondary"
              type="button"
              :disabled="!!actionBusyId"
              @click="openBilingualEditor(document.id, $event)"
            >
              {{ t("document.editBilingual") }}
            </button>
            <button v-if="canDelete" class="btn btn-danger" type="button" :disabled="!!actionBusyId" @click="openDeleteConfirm(document.id, $event)">{{ t("document.delete") }}</button>
          </div>
        </article>
      </div>
    </div>

    <dialog ref="confirmDialog" class="modal-dialog document-confirm-dialog" @close="resetConfirmDialogState">
      <div class="modal-shell document-confirm-dialog-shell">
        <div class="modal-surface document-confirm-dialog-surface">
          <div class="panel-header modal-header document-confirm-dialog-header">
            <h3>{{ confirmDialogTitle }}</h3>
          </div>
          <div class="panel-body stack-form modal-body document-confirm-dialog-body">
            <p class="document-confirm-copy">{{ confirmDialogBody }}</p>
            <div class="form-actions document-confirm-actions">
              <button :class="confirmDialogActionClass" type="button" @click="confirmDocumentAction">{{ confirmDialogActionLabel }}</button>
              <button class="btn btn-secondary" type="button" @click="closeConfirmDialog">{{ t("common.cancel") }}</button>
            </div>
          </div>
        </div>
      </div>
    </dialog>

    <dialog ref="previewDialog" class="modal-dialog document-preview-dialog" :class="{ 'is-fullscreen': previewDialogFullscreen }" @close="resetPreviewDialogState">
      <div class="modal-shell document-preview-dialog-shell">
        <div class="modal-surface document-preview-dialog-surface">
          <div class="panel-header modal-header document-preview-dialog-header">
            <h3>{{ previewTitle }}</h3>
            <div class="form-actions document-preview-dialog-header-actions">
              <button class="btn btn-secondary document-preview-toggle-btn" type="button" @click="togglePreviewDialogFullscreen">
                {{ previewDialogToggleLabel }}
              </button>
              <button class="btn btn-secondary" type="button" @click="closePreviewDialog">{{ t("common.close") }}</button>
            </div>
          </div>
          <div class="panel-body stack-form modal-body document-preview-dialog-body">
            <div v-if="previewLoading" class="modal-note">{{ t("common.loading") }}</div>
            <div v-else class="docx-preview-content document-preview-html" v-html="previewHtml" />
          </div>
        </div>
      </div>
    </dialog>

    <dialog
      ref="editorDialog"
      class="modal-dialog document-editor-dialog"
      :class="{ 'is-fullscreen': editorDialogFullscreen }"
      @cancel.prevent="closeEditorDialog"
      @close="resetEditorDialogState"
    >
      <div class="modal-shell document-editor-dialog-shell">
        <div class="modal-surface document-editor-dialog-surface">
          <div class="panel-header modal-header document-editor-dialog-header">
            <h3>{{ editorDialogTitle }}</h3>
            <div class="form-actions document-editor-dialog-header-actions">
              <button class="btn btn-secondary document-preview-toggle-btn" type="button" @click="toggleEditorDialogFullscreen">
                {{ editorDialogToggleLabel }}
              </button>
              <button class="btn btn-primary" type="button" :disabled="editorSaving || editorLoading || !editorHtml || !editorCanEdit" @click="handleSaveEditor">
                {{ editorSaving ? t("document.saving") : t("document.save") }}
              </button>
              <button class="btn btn-secondary" type="button" :disabled="editorSaving || editorLoading" @click="closeEditorDialog">{{ t("common.close") }}</button>
            </div>
          </div>
          <div class="panel-body stack-form modal-body document-editor-dialog-body">
            <div v-if="editorLoading" class="modal-note">{{ t("common.loading") }}</div>
            <template v-else-if="editorHtml">
              <p v-if="!editorCanEdit" class="muted-text">
                {{ currentUiLanguage === "en-US" ? "This bilingual preview is read-only." : "当前双语预览不可编辑。" }}
              </p>
              <div class="docx-preview-content document-preview-html" v-html="editorHtml" />
            </template>
            <EmptyState v-else :title="t('feedback.noData')" />
          </div>
        </div>
      </div>
    </dialog>

    <dialog ref="editorCloseConfirmDialog" class="modal-dialog document-confirm-dialog" @close="() => {}">
      <div class="modal-shell document-confirm-dialog-shell">
        <div class="modal-surface document-confirm-dialog-surface">
          <div class="panel-header modal-header document-confirm-dialog-header">
            <h3>{{ editorCloseConfirmTitle }}</h3>
          </div>
          <div class="panel-body stack-form modal-body document-confirm-dialog-body">
            <p class="document-confirm-copy">{{ editorCloseConfirmBody }}</p>
            <div class="form-actions document-confirm-actions">
              <button class="btn btn-primary" type="button" @click="confirmCloseEditorDialog">{{ t("common.confirm") }}</button>
              <button class="btn btn-secondary" type="button" @click="closeEditorCloseConfirmDialog">{{ t("common.cancel") }}</button>
            </div>
          </div>
        </div>
      </div>
    </dialog>
  </section>
</template>
