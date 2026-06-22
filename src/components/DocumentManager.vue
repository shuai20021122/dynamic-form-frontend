<script setup>
import { computed, onBeforeUnmount, ref, watch } from "vue";

import {
  deleteDocument,
  downloadDocument,
  generateBilingualDocument,
  getBilingualEditor,
  listEntryDocuments,
  previewDocument,
  saveBilingualEditor,
  uploadEntryDocument,
} from "../api/documents.js";
import { clearCachedResource, getCachedResource, setCachedResource } from "../stores/resourceCache.js";
import { t } from "../stores/uiLanguage.js";
import { closeDialogWithAnimation, getDialogOriginFromEvent, openDialogWithAnimation, resetDialogMotion } from "../utils/dialogMotion.js";
import { formatDateTime } from "../utils/format.js";
import EmptyState from "./EmptyState.vue";
import ErrorAlert from "./ErrorAlert.vue";
import LoadingBlock from "./LoadingBlock.vue";

const props = defineProps({
  entryId: {
    type: [String, Number],
    default: null,
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

const emit = defineEmits(["updated"]);

const documents = ref([]);
const loading = ref(false);
const errorMessage = ref("");
const uploadBusy = ref(false);
const actionBusyId = ref(null);

const previewDialog = ref(null);
const previewTitle = ref(t("document.previewTitle"));
const previewLoading = ref(false);
const previewHtml = ref("");
const activeSubDialog = ref("");

const confirmDialog = ref(null);
const confirmActionType = ref("");
const confirmDocumentId = ref(null);
const confirmOriginPoint = ref(null);

const editorDialog = ref(null);
const editorLoading = ref(false);
const editorSaving = ref(false);
const editorData = ref(null);
const editingDocumentId = ref(null);
const structuredEditorSectionKeys = ["short_fields", "work_experiences", "education_experiences", "long_fields"];
const generateProgress = ref(0);
let generateProgressTimer = null;

const originalDocx = computed(() => documents.value.find((item) => item.document_kind === "original" && item.file_type === "docx") || null);
const documentsCacheKey = computed(() => `entry:documents:${props.entryId || ""}`);
const generateStateCacheKey = computed(() => `entry:documents:generate:${props.entryId || ""}`);
const editingDocumentInfo = computed(() => documents.value.find((item) => String(item.id) === String(editingDocumentId.value)) || null);
const editorDialogTitle = computed(() => editingDocumentInfo.value?.original_filename || t("document.editorTitle"));
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
let restoreGenerateTaskPromise = null;

function isPlainObject(value) {
  return Object.prototype.toString.call(value) === "[object Object]";
}

function formatEditorLabel(value) {
  return String(value || "")
    .replace(/[_-]+/g, " ")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^./, (char) => char.toUpperCase());
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

  const tokens = text.match(/[\u4e00-\u9fff][\u4e00-\u9fffA-Za-z0-9，。；：、“”‘’《》【】（）\-]*|[A-Za-z][A-Za-z0-9\s,.;:!?()\-/'"%&]+|[0-9]+|[^\s]/g) || [text];
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
      const enOnly = token.replace(/[\u4e00-\u9fff，。；：、“”‘’《》【】（）]/g, " ");
      if (zhOnly.trim()) zhParts.push(zhOnly);
      if (enOnly.trim()) enParts.push(enOnly);
      return;
    }

    if (/[，。；：、“”‘’《》【】（）]/.test(token)) {
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

function closePreviewDialog() {
  closeDialogWithAnimation(previewDialog);
}

function closeConfirmDialog() {
  closeDialogWithAnimation(confirmDialog);
}

function closeEditorDialog() {
  closeDialogWithAnimation(editorDialog);
}

function resetPreviewDialogState() {
  activeSubDialog.value = "";
  previewHtml.value = "";
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
  editingDocumentId.value = null;
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
    const result = await previewDocument(documentId);
    previewHtml.value = result?.data?.html || "";
  } catch (error) {
    previewDialog.value?.close();
    errorMessage.value = error.message || t("document.previewFailed");
  } finally {
    previewLoading.value = false;
  }
}

function openGenerateConfirm(event) {
  if (!originalDocx.value) {
    errorMessage.value = t("document.needOriginalDocx");
    return;
  }

  confirmActionType.value = "generate";
  confirmDocumentId.value = originalDocx.value.id;
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
    await generateBilingualDocument(documentId);
    startGenerateFinalizeProgress();
    const { confirmed } = await waitForBilingualDocument(previousSignature);
    if (!confirmed) {
      throw new Error(t("document.generateFailed"));
    }
    stopGenerateProgress(100);
    persistGenerateState({ progress: 100, phase: "done" });
    await delay(280);
    completed = true;
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
  editingDocumentId.value = documentId;
  activeSubDialog.value = "editor";
  openDialogWithAnimation(editorDialog, {
    originPoint: getDialogOriginFromEvent(event, {
      x: window.innerWidth * 0.72,
      y: window.innerHeight * 0.3,
    }),
  });

  try {
    const result = await getBilingualEditor(documentId);
    const backendEditor = result?.data?.editor || null;

    if (hasMeaningfulStructuredContent(backendEditor)) {
      editorData.value = backendEditor;
      return;
    }

    const previewResult = await previewDocument(documentId);
    const previewFallback = buildFallbackEditorFromPreviewHtml(
      previewResult?.data?.html || "",
      result?.data?.document?.original_filename || editingDocumentInfo.value?.original_filename || t("document.editorTitle")
    );

    editorData.value = previewFallback || backendEditor;
  } catch (error) {
    editorDialog.value?.close();
    errorMessage.value = error.message || t("document.editorLoadFailed");
  } finally {
    editorLoading.value = false;
  }
}

async function handleSaveEditor() {
  if (!editingDocumentId.value || !editorData.value) return;

  editorSaving.value = true;

  try {
    await saveBilingualEditor(editingDocumentId.value, editorData.value);
    closeDialogWithAnimation(editorDialog, {
      afterClose: () => {
        loadDocuments();
        emit("updated");
      },
    });
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
});
</script>

<template>
  <section class="panel document-manager">
    <div class="panel-header">
      <h2>{{ t("fill.documentTitle") }}</h2>
      <div class="form-actions">
        <label v-if="canUpload" class="btn btn-primary">
          {{ uploadBusy ? t("document.uploading") : t("document.upload") }}
          <input class="hidden-input" type="file" accept=".docx,.pdf" :disabled="uploadBusy" @change="handleUpload" />
        </label>
        <button
          class="btn btn-secondary document-generate-btn"
          :class="{ 'is-running': actionBusyId?.startsWith('generate-') }"
          :style="generateButtonProgressStyle"
          type="button"
          :disabled="!originalDocx || !!actionBusyId"
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
            <button class="btn btn-secondary" type="button" :disabled="!!actionBusyId" @click="downloadDocument(document.id)">{{ t("document.download") }}</button>
            <button v-if="document.file_type === 'docx'" class="btn btn-secondary" type="button" :disabled="!!actionBusyId" @click="handlePreview(document.id, $event)">{{ t("document.preview") }}</button>
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

    <dialog ref="previewDialog" class="modal-dialog document-preview-dialog" @close="resetPreviewDialogState">
      <div class="modal-shell document-preview-dialog-shell">
        <div class="modal-surface document-preview-dialog-surface">
          <div class="panel-header modal-header document-preview-dialog-header">
            <h3>{{ previewTitle }}</h3>
            <button class="btn btn-secondary" type="button" @click="closePreviewDialog">{{ t("common.close") }}</button>
          </div>
          <div class="panel-body stack-form modal-body document-preview-dialog-body">
            <div v-if="previewLoading" class="modal-note">{{ t("common.loading") }}</div>
            <div v-else class="docx-preview-content document-preview-html" v-html="previewHtml" />
          </div>
        </div>
      </div>
    </dialog>

    <dialog ref="editorDialog" class="modal-dialog document-editor-dialog" @close="resetEditorDialogState">
      <div class="modal-shell document-editor-dialog-shell">
        <div class="modal-surface document-editor-dialog-surface">
          <div class="panel-header modal-header document-editor-dialog-header">
            <h3>{{ editorDialogTitle }}</h3>
            <button class="btn btn-secondary" type="button" @click="closeEditorDialog">{{ t("common.close") }}</button>
          </div>
          <div class="panel-body stack-form modal-body document-editor-dialog-body">
            <div v-if="editorLoading" class="modal-note">{{ t("common.loading") }}</div>
            <template v-else-if="editorData">
              <div v-for="item in editorData.short_fields || []" :key="item.key" class="bilingual-row">
                <div class="bilingual-head"><strong>{{ item.label }}</strong></div>
                <div class="bilingual-columns">
                  <label class="field-block"><span>{{ t("document.cn") }}</span><input :value="item.zh_text" readonly /></label>
                  <label class="field-block"><span>{{ t("document.en") }}</span><input v-model="item.en_text" /></label>
                </div>
              </div>

              <div v-for="item in editorData.work_experiences || []" :key="`work-${item.index}`" class="bilingual-editor-block">
                <strong>{{ t("document.workExperience", { index: item.index }) }}</strong>
                <div class="bilingual-columns">
                  <label class="field-block"><span>{{ t("document.companyZh") }}</span><input :value="item.organization_zh" readonly /></label>
                  <label class="field-block"><span>{{ t("document.companyEn") }}</span><input v-model="item.organization_en" /></label>
                  <label class="field-block"><span>{{ t("document.positionZh") }}</span><input :value="item.position_zh" readonly /></label>
                  <label class="field-block"><span>{{ t("document.positionEn") }}</span><input v-model="item.position_en" /></label>
                </div>
              </div>

              <div v-for="item in editorData.education_experiences || []" :key="`edu-${item.index}`" class="bilingual-editor-block">
                <strong>{{ t("document.educationExperience", { index: item.index }) }}</strong>
                <div class="bilingual-columns">
                  <label class="field-block"><span>{{ t("document.schoolZh") }}</span><input :value="item.institution_zh" readonly /></label>
                  <label class="field-block"><span>{{ t("document.schoolEn") }}</span><input v-model="item.institution_en" /></label>
                  <label class="field-block"><span>{{ t("document.courseZh") }}</span><input :value="item.course_zh" readonly /></label>
                  <label class="field-block"><span>{{ t("document.courseEn") }}</span><input v-model="item.course_en" /></label>
                  <label class="field-block"><span>{{ t("document.degreeZh") }}</span><input :value="item.degree_zh" readonly /></label>
                  <label class="field-block"><span>{{ t("document.degreeEn") }}</span><input v-model="item.degree_en" /></label>
                </div>
              </div>

              <div v-for="item in editorData.long_fields || []" :key="item.key" class="bilingual-row">
                <div class="bilingual-head"><strong>{{ item.label }}</strong></div>
                <div class="bilingual-columns">
                  <label class="field-block"><span>{{ t("document.cn") }}</span><textarea :value="item.zh_text" rows="8" readonly /></label>
                  <label class="field-block"><span>{{ t("document.en") }}</span><textarea v-model="item.en_text" rows="8" /></label>
                </div>
              </div>

              <div
                v-for="section in genericEditorSections"
                :key="section.key"
                class="bilingual-editor-block bilingual-editor-block--generic"
              >
                <strong>{{ section.title }}</strong>
                <div v-for="block in section.blocks" :key="block.key" class="bilingual-row">
                  <div class="bilingual-head"><strong>{{ block.title }}</strong></div>
                  <div class="bilingual-columns">
                    <label v-for="field in block.fields" :key="field.key" class="field-block">
                      <span>{{ field.label }}</span>
                      <textarea
                        v-if="field.control === 'textarea'"
                        v-model="field.holder[field.prop]"
                        rows="8"
                      />
                      <input v-else v-model="field.holder[field.prop]" />
                    </label>
                  </div>
                </div>
              </div>

              <div class="form-actions">
                <button class="btn btn-primary" type="button" :disabled="editorSaving" @click="handleSaveEditor">
                  {{ editorSaving ? t("document.saving") : t("document.save") }}
                </button>
                <button class="btn btn-secondary" type="button" @click="closeEditorDialog">{{ t("common.cancel") }}</button>
              </div>
            </template>
            <EmptyState v-else :title="t('feedback.noData')" />
          </div>
        </div>
      </div>
    </dialog>
  </section>
</template>
