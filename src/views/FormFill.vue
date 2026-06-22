<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { useRoute } from "vue-router";

import bossKnowLogo from "../assets/boss-know-logo.png";
import DocumentManager from "../components/DocumentManager.vue";
import EmptyState from "../components/EmptyState.vue";
import ErrorAlert from "../components/ErrorAlert.vue";
import LoadingBlock from "../components/LoadingBlock.vue";
import StatusBadge from "../components/StatusBadge.vue";
import UiSelect from "../components/UiSelect.vue";
import { fetchCurrentUser } from "../api/auth.js";
import { listEntryDocuments, previewDocument } from "../api/documents.js";
import { createEntry, deleteEntry, listReviews, moveEntrySlot, saveReview, updateEntry } from "../api/entries.js";
import { getFormTable } from "../api/forms.js";
import { getCachedResource, setCachedResource } from "../stores/resourceCache.js";
import { currentUiLanguage, t } from "../stores/uiLanguage.js";
import { closeDialogWithAnimation, getDialogOriginFromEvent, openDialogWithAnimation, resetDialogMotion } from "../utils/dialogMotion.js";
import { buildValueSummary, getEntryStatusLabel, getFormStatusLabel, getReviewResultLabel } from "../utils/format.js";

const route = useRoute();
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
const documentRow = ref(null);
const documentDialog = ref(null);
const interviewerReviewDialog = ref(null);
const interviewerPreviewLoading = ref(false);
const interviewerPreviewHtml = ref("");
const interviewerReviewLoading = ref(false);
const interviewerReviewSaving = ref(false);
const interviewerReviewRow = ref(null);
const interviewerReviewResult = ref("pending");
const interviewerReviewComment = ref("");
const deletingEntry = ref(false);
const deleteDialog = ref(null);
const deletingRow = ref(null);
const moveSlotDialog = ref(null);
const movingRow = ref(null);
const targetSlotId = ref("");
const isAdminViewer = computed(() => ["super_admin", "academic_admin"].includes(currentUser.value?.role || ""));
const canViewInterviewDetail = computed(() => isInterviewer.value || isAdminViewer.value);
const canEditInterviewReview = computed(() => isInterviewer.value);
const tableCacheKey = computed(() => `forms:table:${formId.value}:${currentUiLanguage.value}`);
const isInterviewer = computed(() => currentUser.value?.role === "interviewer");
const isPersonalUser = computed(() => currentUser.value?.role === "personal");
const showStatusColumn = computed(() => !isInterviewer.value);
const documentActionLabel = computed(() => (isInterviewer.value ? (currentUiLanguage.value === "en-US" ? "View" : "查看") : t("fill.resume")));
const interviewerDocumentNote = computed(() =>
  currentUiLanguage.value === "en-US"
    ? "Blue outline means no resume has been uploaded yet. Green outline means a resume has already been uploaded and can be viewed."
    : "蓝色描边表示尚未上传简表，绿色描边表示已上传简表，可直接查看。"
);
const documentUploadStateMap = ref({});
const entryDocumentsMap = ref({});
const reviewResultStateMap = ref({});
const reviewResultOptions = computed(() => [
  { value: "pending", label: getReviewResultLabel("pending") },
  { value: "pass", label: getReviewResultLabel("pass") },
  { value: "reject", label: getReviewResultLabel("reject") },
]);
const interviewerDialogTitle = computed(() => (currentUiLanguage.value === "en-US" ? "Resume Review" : "简表查看与评价"));
const interviewerReviewTitle = computed(() => (currentUiLanguage.value === "en-US" ? "Evaluation" : "评价"));
const interviewerReviewResultLabel = computed(() => (currentUiLanguage.value === "en-US" ? "Result" : "评价结果"));
const interviewerReviewCommentLabel = computed(() => (currentUiLanguage.value === "en-US" ? "Comments" : "评价内容"));
const interviewerReviewPlaceholder = computed(() => (currentUiLanguage.value === "en-US" ? "Enter your evaluation notes" : "请输入评价内容"));
const interviewerReviewEmpty = computed(() => (currentUiLanguage.value === "en-US" ? "No resume preview available yet." : "当前暂无可预览的简表。"));
const reviewerResultColumnLabel = computed(() => (currentUiLanguage.value === "en-US" ? "Review Result" : "评价结果"));
const interviewDetailActionLabel = computed(() => (currentUiLanguage.value === "en-US" ? "Interview Detail" : "面试详情"));

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

function getTone(status) {
  if (status === "filled") return "success";
  if (status === "occupied") return "neutral";
  return "warning";
}

function normalizeFieldLabel(field) {
  return String(field?.display_label || field?.field_label || "").replace(/\s+/g, "");
}

function getBubbleSelectKind(field) {
  const label = normalizeFieldLabel(field);
  if (label === "性别") return "gender";
  if (label === "线上/现场" || label === "线上现场") return "attendance";
  return "";
}

function getBubbleSelectOptions(field) {
  const kind = getBubbleSelectKind(field);
  return kind ? bubbleSelectOptions[kind] : [];
}

function isHiddenPersonalField(field) {
  if (!isPersonalUser.value) {
    return false;
  }

  const label = normalizeFieldLabel(field);
  const key = String(field?.field_key || "").trim().toLowerCase();
  return label === "状态" || key === "status";
}

const visibleFields = computed(() => (tableData.value?.fields || []).filter((field) => !isHiddenPersonalField(field)));

function getEntryDocumentsCacheKey(entryId) {
  return `entry:documents:${entryId || ""}`;
}

function hasUploadedDocument(row) {
  const entryId = String(row?.entry?.id || "");
  return !!(entryId && documentUploadStateMap.value[entryId]);
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

function getReviewResultTone(row) {
  const result = getReviewResultValue(row);
  if (result === "pass") return "success";
  if (result === "reject") return "danger";
  return "neutral";
}

async function loadInterviewerReviewStates(rows) {
  if (!isInterviewer.value) {
    reviewResultStateMap.value = {};
    return;
  }

  const entryIds = (rows || [])
    .map((row) => String(row?.entry?.id || ""))
    .filter(Boolean);

  if (!entryIds.length) {
    reviewResultStateMap.value = {};
    return;
  }

  const results = await Promise.allSettled(entryIds.map((entryId) => listReviews(entryId)));
  const nextMap = {};

  results.forEach((result, index) => {
    const entryId = entryIds[index];
    if (result.status !== "fulfilled") {
      nextMap[entryId] = "pending";
      return;
    }

    const payload = result.value?.data;
    const reviews = payload?.items || payload?.reviews || [];
    const latestReview = Array.isArray(reviews) && reviews.length ? reviews[0] : payload?.review || payload || null;
    nextMap[entryId] = latestReview?.result || latestReview?.review_result || latestReview?.status || "pending";
  });

  reviewResultStateMap.value = nextMap;
}

async function loadInterviewerDocumentStates(rows) {
  if (!canViewInterviewDetail.value) {
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
  editingRow.value = row;
  editorVisible.value = true;
  documentRow.value = null;
  entryValues.value = {};
  visibleFields.value.forEach((field) => {
    entryValues.value[field.field_key] = row.values?.[field.field_key]?.value || "";
  });
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

function resetDocumentDialogState() {
  documentRow.value = null;
}

function closeDocumentDialog() {
  if (documentDialog.value?.open) {
    closeDialogWithAnimation(documentDialog);
    return;
  }
  resetDocumentDialogState();
}

function openDocumentDialog(row, event) {
  documentRow.value = row;
  editorVisible.value = false;
  openDialogWithAnimation(documentDialog, {
    originPoint: getDialogOriginFromEvent(event, {
      x: window.innerWidth * 0.72,
      y: window.innerHeight * 0.28,
    }),
  });
}

async function openInterviewerPreview(row, event) {
  interviewerReviewRow.value = row;
  interviewerPreviewHtml.value = "";
  interviewerPreviewLoading.value = true;
  interviewerReviewLoading.value = true;
  interviewerReviewResult.value = "pending";
  interviewerReviewComment.value = "";
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
          const payload = result?.data;
          const reviews = payload?.items || payload?.reviews || [];
          const latestReview = Array.isArray(reviews) && reviews.length ? reviews[0] : payload?.review || payload || null;
          interviewerReviewResult.value = latestReview?.result || latestReview?.review_result || latestReview?.status || "pending";
          interviewerReviewComment.value =
            latestReview?.comment || latestReview?.review_comment || latestReview?.remarks || latestReview?.content || "";
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

function resetInterviewerReviewDialog() {
  interviewerReviewRow.value = null;
  interviewerPreviewLoading.value = false;
  interviewerPreviewHtml.value = "";
  interviewerReviewLoading.value = false;
  interviewerReviewSaving.value = false;
  interviewerReviewResult.value = "pending";
  interviewerReviewComment.value = "";
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

const availableSlotOptions = computed(() => {
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
    }));
});

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

async function loadPage() {
  const cached = getCachedResource(tableCacheKey.value);
  if (cached) {
    currentUser.value = cached.currentUser || currentUser.value;
    tableData.value = cached.tableData || tableData.value;
    loading.value = false;
  } else {
    loading.value = true;
  }
  errorMessage.value = "";
  try {
    const [me, tableResult] = await Promise.all([fetchCurrentUser(), getFormTable(formId.value, { ui_lang: currentUiLanguage.value })]);
    currentUser.value = me;
    tableData.value = tableResult?.data || null;
    await Promise.all([loadInterviewerDocumentStates(tableData.value?.rows || []), loadInterviewerReviewStates(tableData.value?.rows || [])]);
    setCachedResource(tableCacheKey.value, {
      currentUser: me,
      tableData: tableData.value,
    });
  } catch (error) {
    errorMessage.value = error.message || t("common.loading");
  } finally {
    loading.value = false;
  }
}

async function handleSaveEntry() {
  if (!editingRow.value) return;
  saving.value = true;
  errorMessage.value = "";
  try {
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

onMounted(loadPage);

onBeforeUnmount(() => {
  resetDialogMotion(editorDialog);
  resetDialogMotion(documentDialog);
  resetDialogMotion(deleteDialog);
  resetDialogMotion(moveSlotDialog);
});

watch(currentUiLanguage, () => {
  loadPage();
});
</script>

<template>
  <ErrorAlert :message="errorMessage" />
  <LoadingBlock v-if="loading" :label="t('common.loading')" />

  <div v-else-if="tableData" class="fill-page">
    <section class="fill-hero panel">
      <div class="fill-hero-body">
        <img class="fill-hero-logo" :src="bossKnowLogo" alt="BOSS KNOW" />
        <div class="fill-hero-copy">
          <h2 id="fill-form-title" class="fill-hero-title">
            {{ tableData.form.display_title || tableData.form.title }} - {{ t("fill.heroTitleSuffix") }}
          </h2>
          <p id="fill-form-meta" class="muted-text fill-hero-meta">
            {{ t("fill.currentStatus", { status: getFormStatusLabel(tableData.form.status) }) }}
          </p>
        </div>
      </div>
    </section>

    <dialog ref="editorDialog" class="modal-dialog fill-editor-dialog" @close="resetEditorState">
      <div class="modal-shell fill-editor-dialog-shell">
        <div class="modal-surface fill-editor-dialog-surface">
          <div class="panel-header modal-header fill-editor-dialog-header">
            <h3>{{ editingRow?.entry?.id ? t("fill.edit") : t("fill.contentTitle") }}</h3>
            <button class="btn btn-secondary" type="button" @click="closeEditor">{{ t("common.close") }}</button>
          </div>
          <form v-if="editorVisible && editingRow" class="stack-form panel-body modal-body fill-editor-dialog-body" @submit.prevent="handleSaveEntry">
            <label v-for="field in visibleFields" :key="field.id" class="field-block">
              <span>{{ field.display_label || field.field_label }}<em v-if="field.is_required"> *</em></span>
              <UiSelect
                v-if="getBubbleSelectKind(field)"
                v-model="entryValues[field.field_key]"
                class="fill-editor-select"
                :options="getBubbleSelectOptions(field)"
                :disabled="saving"
                :placeholder="t('common.select')"
              />
              <textarea
                v-else-if="field.field_type === 'textarea'"
                v-model="entryValues[field.field_key]"
                rows="3"
                :required="field.is_required"
              />
              <input
                v-else
                v-model="entryValues[field.field_key]"
                :type="field.field_type === 'number' ? 'number' : field.field_type === 'date' ? 'date' : 'text'"
                :required="field.is_required"
              />
            </label>
            <div class="form-actions fill-editor-actions">
              <button class="btn btn-primary" type="submit" :disabled="saving">{{ saving ? t("fill.submitting") : t("fill.submit") }}</button>
              <button class="btn btn-secondary" type="button" @click="closeEditor">{{ t("common.cancel") }}</button>
            </div>
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
              <p id="fill-note" class="muted-text fill-note">{{ t("fill.note") }}</p>
              <p v-if="isInterviewer" class="muted-text fill-note fill-note--detail">{{ interviewerDocumentNote }}</p>
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
                <th v-for="field in visibleFields" :key="field.id">{{ field.display_label || field.field_label }}</th>
                <th v-if="showStatusColumn">{{ t("forms.status") }}</th>
                <th>{{ t("fill.action") }}</th>
                <th v-if="isInterviewer">{{ reviewerResultColumnLabel }}</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="row in tableData.rows" :key="row.slot.id">
                <td>{{ row.slot.title }}</td>
                <td v-for="field in visibleFields" :key="`${row.slot.id}-${field.id}`">
                  {{ row.values?.[field.field_key]?.display_value || row.values?.[field.field_key]?.value || (row.can_view ? "-" : "不可查看") }}
                </td>
                <td v-if="showStatusColumn">
                  <StatusBadge :text="getEntryStatusLabel(row.status)" :tone="getTone(row.status)" />
                </td>
                <td>
                  <div class="form-actions fill-row-actions">
                    <button v-if="row.can_fill" class="btn btn-primary" type="button" @click="openEditor(row, $event)">{{ t("fill.fill") }}</button>
                    <button v-if="row.can_edit" class="btn btn-secondary" type="button" @click="openEditor(row, $event)">{{ t("fill.edit") }}</button>
                    <button v-if="row.can_edit && row.entry?.id" class="btn btn-secondary" type="button" @click="openMoveSlotDialog(row, $event)">{{ t("fill.changeSlot") }}</button>
                    <button
                      v-if="row.entry?.id"
                      class="btn"
                      :class="
                        isInterviewer
                          ? ['fill-row-view-btn', hasUploadedDocument(row) ? 'is-uploaded' : 'is-pending']
                          : 'btn-secondary'
                      "
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
                    <button v-if="row.can_edit" class="btn btn-danger" type="button" @click="openDeleteDialog(row, $event)">{{ t("fill.delete") }}</button>
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
          <span>{{ field.display_label || field.field_label }}<em v-if="field.is_required"> *</em></span>
          <UiSelect
            v-if="getBubbleSelectKind(field)"
            v-model="entryValues[field.field_key]"
            class="fill-editor-select"
            :options="getBubbleSelectOptions(field)"
            :disabled="saving"
            :placeholder="t('common.select')"
          />
          <textarea
            v-else-if="field.field_type === 'textarea'"
            v-model="entryValues[field.field_key]"
            rows="3"
            :required="field.is_required"
          />
          <input
            v-else
            v-model="entryValues[field.field_key]"
            :type="field.field_type === 'number' ? 'number' : field.field_type === 'date' ? 'date' : 'text'"
            :required="field.is_required"
          />
        </label>
        <div class="form-actions">
          <button class="btn btn-primary" type="submit" :disabled="saving">{{ saving ? t("fill.submitting") : t("fill.submit") }}</button>
          <button class="btn btn-secondary" type="button" @click="closeEditor">{{ t("common.cancel") }}</button>
        </div>
      </form>
    </section>

    <dialog ref="interviewerReviewDialog" class="interviewer-review-dialog" @close="resetInterviewerReviewDialog">
      <div class="interviewer-review-shell">
        <section class="interviewer-review-panel interviewer-review-panel--preview">
          <div class="interviewer-review-head">
            <h3>{{ interviewerDialogTitle }}</h3>
            <button class="btn btn-secondary" type="button" @click="closeInterviewerReviewDialog">{{ t("common.close") }}</button>
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
          <div class="interviewer-review-body interviewer-review-body--editor">
            <div v-if="interviewerReviewLoading" class="modal-note">{{ t("common.loading") }}</div>
            <template v-else>
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
          </div>
        </section>
      </div>
    </dialog>

    <dialog ref="documentDialog" class="modal-dialog fill-document-dialog" @close="resetDocumentDialogState">
      <div class="modal-shell fill-document-dialog-shell">
        <div class="modal-surface fill-document-dialog-surface">
          <div class="panel-header modal-header fill-document-dialog-header">
            <h3>{{ t("fill.documentTitle") }}</h3>
            <button class="btn btn-secondary" type="button" @click="closeDocumentDialog">{{ t("common.close") }}</button>
          </div>
          <div v-if="documentRow?.entry?.id" class="panel-body stack-form modal-body fill-document-dialog-body">
            <DocumentManager
              :entry-id="documentRow.entry.id"
              :can-upload="documentRow.can_upload_document"
              :can-delete="true"
              :embedded="true"
              @updated="loadPage"
            />

            <section class="panel fill-document-summary">
              <div class="panel-header compact">
                <h3>{{ t("fill.currentRecord") }}</h3>
              </div>
              <div class="panel-body">
                <pre class="value-summary">{{ buildValueSummary(documentRow.values) || t("fill.noContent") }}</pre>
              </div>
            </section>
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
                  :options="availableSlotOptions"
                  :disabled="!availableSlotOptions.length || movingSlot"
                  :placeholder="t('fill.selectSlot')"
                />
              </div>
            </div>
            <p v-if="!availableSlotOptions.length" class="muted-text fill-move-empty">{{ t("fill.noSlot") }}</p>
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
