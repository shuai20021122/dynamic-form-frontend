<script setup>
import { computed, ref, watch } from "vue";

import {
  deleteDocument,
  downloadDocument,
  generateBilingualDocument,
  getBilingualEditor,
  listEntryDocuments,
  previewDocument,
  saveBilingualEditor,
  translatePreviewDocument,
  uploadEntryDocument,
} from "../api/documents.js";
import { formatDateTime } from "../utils/format.js";
import EmptyState from "./EmptyState.vue";
import ErrorAlert from "./ErrorAlert.vue";
import LoadingBlock from "./LoadingBlock.vue";
import StatusBadge from "./StatusBadge.vue";

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
const previewTitle = ref("简表预览");
const previewLoading = ref(false);
const previewHtml = ref("");
const previewOriginalText = ref("");
const previewTranslatedText = ref("");
const previewMode = ref("html");

const editorDialog = ref(null);
const editorLoading = ref(false);
const editorSaving = ref(false);
const editorData = ref(null);
const editingDocumentId = ref(null);

const originalDocx = computed(() => documents.value.find((item) => item.document_kind === "original" && item.file_type === "docx") || null);

function getStatusTone(status) {
  return status === "generated" ? "success" : "warning";
}

function closePreviewDialog() {
  previewDialog.value?.close();
}

function closeEditorDialog() {
  editorDialog.value?.close();
}

function resetPreviewState() {
  previewHtml.value = "";
  previewOriginalText.value = "";
  previewTranslatedText.value = "";
}

async function loadDocuments() {
  if (!props.entryId) {
    documents.value = [];
    return;
  }
  loading.value = true;
  errorMessage.value = "";
  try {
    const result = await listEntryDocuments(props.entryId);
    documents.value = result?.data?.items || [];
  } catch (error) {
    errorMessage.value = error.message || "加载文档失败";
  } finally {
    loading.value = false;
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
    errorMessage.value = error.message || "上传失败";
  } finally {
    uploadBusy.value = false;
    event.target.value = "";
  }
}

async function handlePreview(documentId) {
  resetPreviewState();
  previewTitle.value = "简表预览";
  previewMode.value = "html";
  previewLoading.value = true;
  previewDialog.value?.showModal();
  try {
    const result = await previewDocument(documentId);
    previewHtml.value = result?.data?.html || "";
  } catch (error) {
    previewDialog.value?.close();
    errorMessage.value = error.message || "预览失败";
  } finally {
    previewLoading.value = false;
  }
}

async function handleTranslatePreview(documentId) {
  resetPreviewState();
  previewTitle.value = "翻译预览";
  previewMode.value = "translate";
  previewLoading.value = true;
  previewDialog.value?.showModal();
  try {
    const result = await translatePreviewDocument(documentId);
    previewOriginalText.value = result?.data?.original_text || "";
    previewTranslatedText.value = result?.data?.translated_text || "";
  } catch (error) {
    previewDialog.value?.close();
    errorMessage.value = error.message || "翻译预览失败";
  } finally {
    previewLoading.value = false;
  }
}

async function handleGenerateBilingual() {
  if (!originalDocx.value) {
    errorMessage.value = "请先上传中文 DOCX 简表文件";
    return;
  }
  if (!window.confirm("将调用 AI 生成中英双语简表，可能需要几十秒。\n确认生成吗？")) {
    return;
  }
  actionBusyId.value = `generate-${originalDocx.value.id}`;
  try {
    await generateBilingualDocument(originalDocx.value.id);
    await loadDocuments();
    emit("updated");
  } catch (error) {
    errorMessage.value = error.message || "生成双语简表失败";
  } finally {
    actionBusyId.value = null;
  }
}

async function handleDelete(documentId) {
  if (!window.confirm("确认删除该简表文件吗？")) return;
  actionBusyId.value = `delete-${documentId}`;
  try {
    await deleteDocument(documentId);
    await loadDocuments();
    emit("updated");
  } catch (error) {
    errorMessage.value = error.message || "删除失败";
  } finally {
    actionBusyId.value = null;
  }
}

async function openBilingualEditor(documentId) {
  editorLoading.value = true;
  editorData.value = null;
  editingDocumentId.value = documentId;
  editorDialog.value?.showModal();
  try {
    const result = await getBilingualEditor(documentId);
    editorData.value = result?.data?.editor || null;
  } catch (error) {
    editorDialog.value?.close();
    errorMessage.value = error.message || "加载双语编辑器失败";
  } finally {
    editorLoading.value = false;
  }
}

async function handleSaveEditor() {
  if (!editingDocumentId.value || !editorData.value) return;
  editorSaving.value = true;
  try {
    await saveBilingualEditor(editingDocumentId.value, editorData.value);
    editorDialog.value?.close();
    await loadDocuments();
    emit("updated");
  } catch (error) {
    errorMessage.value = error.message || "保存失败";
  } finally {
    editorSaving.value = false;
  }
}

watch(
  () => props.entryId,
  () => {
    loadDocuments();
  },
  { immediate: true }
);
</script>

<template>
  <section class="panel">
    <div class="panel-header">
      <h2>简表管理</h2>
      <div class="form-actions">
        <label v-if="canUpload" class="btn btn-primary">
          {{ uploadBusy ? "上传中..." : "上传简表" }}
          <input class="hidden-input" type="file" accept=".docx,.pdf" :disabled="uploadBusy" @change="handleUpload" />
        </label>
        <button class="btn btn-secondary" type="button" :disabled="!originalDocx || !!actionBusyId" @click="handleGenerateBilingual">
          生成中英双语简表
        </button>
      </div>
    </div>

    <div class="panel-body">
      <ErrorAlert :message="errorMessage" />
      <LoadingBlock v-if="loading" label="加载中..." />
      <EmptyState v-else-if="!documents.length" title="暂无简表文件" />

      <div v-else class="document-list">
        <article v-for="document in documents" :key="document.id" class="document-item">
          <div class="document-item-meta">
            <strong>{{ document.original_filename }}</strong>
            <span class="muted-text">{{ document.file_type.toUpperCase() }} | {{ formatDateTime(document.created_at) }} | {{ document.document_kind }}</span>
          </div>

          <div class="form-actions">
            <StatusBadge :text="document.translation_status" :tone="getStatusTone(document.translation_status)" />
            <button class="btn btn-secondary" type="button" :disabled="!!actionBusyId" @click="downloadDocument(document.id)">下载</button>
            <button v-if="document.file_type === 'docx'" class="btn btn-secondary" type="button" :disabled="!!actionBusyId" @click="handlePreview(document.id)">预览</button>
            <button
              v-if="document.file_type === 'docx' && document.document_kind === 'original'"
              class="btn btn-secondary"
              type="button"
              :disabled="!!actionBusyId"
              @click="handleTranslatePreview(document.id)"
            >
              翻译预览
            </button>
            <button
              v-if="document.file_type === 'docx' && document.document_kind === 'bilingual'"
              class="btn btn-secondary"
              type="button"
              :disabled="!!actionBusyId"
              @click="openBilingualEditor(document.id)"
            >
              编辑双语
            </button>
            <button v-if="canDelete" class="btn btn-danger" type="button" :disabled="!!actionBusyId" @click="handleDelete(document.id)">删除</button>
          </div>
        </article>
      </div>
    </div>

    <dialog ref="previewDialog" class="panel modal-dialog">
      <div class="modal-shell">
        <div class="panel-header modal-header">
          <h3>{{ previewTitle }}</h3>
          <button class="btn btn-secondary" type="button" @click="closePreviewDialog">关闭</button>
        </div>
        <div class="panel-body stack-form modal-body">
          <div v-if="previewLoading" class="modal-note">加载中...</div>
          <div v-else-if="previewMode === 'html'" class="docx-preview-content" v-html="previewHtml" />
          <div v-else class="split-preview">
            <div>
              <strong>原文预览</strong>
              <pre class="preview-box">{{ previewOriginalText }}</pre>
            </div>
            <div>
              <strong>英文预览</strong>
              <pre class="preview-box">{{ previewTranslatedText }}</pre>
            </div>
          </div>
        </div>
      </div>
    </dialog>

    <dialog ref="editorDialog" class="panel modal-dialog bilingual-editor-modal">
      <div class="modal-shell">
        <div class="panel-header modal-header">
          <h3>编辑双语简表</h3>
          <button class="btn btn-secondary" type="button" @click="closeEditorDialog">关闭</button>
        </div>
        <div class="panel-body stack-form modal-body">
          <div v-if="editorLoading" class="modal-note">加载中...</div>
          <template v-else-if="editorData">
            <div v-for="item in editorData.short_fields || []" :key="item.key" class="bilingual-row">
              <div class="bilingual-head"><strong>{{ item.label }}</strong></div>
              <div class="bilingual-columns">
                <label class="field-block"><span>中文</span><input :value="item.zh_text" readonly /></label>
                <label class="field-block"><span>English</span><input v-model="item.en_text" /></label>
              </div>
            </div>

            <div v-for="item in editorData.work_experiences || []" :key="`work-${item.index}`" class="bilingual-editor-block">
              <strong>工作经历 {{ item.index }}</strong>
              <div class="bilingual-columns">
                <label class="field-block"><span>公司中文</span><input :value="item.organization_zh" readonly /></label>
                <label class="field-block"><span>公司英文</span><input v-model="item.organization_en" /></label>
                <label class="field-block"><span>职务中文</span><input :value="item.position_zh" readonly /></label>
                <label class="field-block"><span>职务英文</span><input v-model="item.position_en" /></label>
              </div>
            </div>

            <div v-for="item in editorData.education_experiences || []" :key="`edu-${item.index}`" class="bilingual-editor-block">
              <strong>教育经历 {{ item.index }}</strong>
              <div class="bilingual-columns">
                <label class="field-block"><span>院校中文</span><input :value="item.institution_zh" readonly /></label>
                <label class="field-block"><span>院校英文</span><input v-model="item.institution_en" /></label>
                <label class="field-block"><span>课程中文</span><input :value="item.course_zh" readonly /></label>
                <label class="field-block"><span>课程英文</span><input v-model="item.course_en" /></label>
                <label class="field-block"><span>学位中文</span><input :value="item.degree_zh" readonly /></label>
                <label class="field-block"><span>学位英文</span><input v-model="item.degree_en" /></label>
              </div>
            </div>

            <div v-for="item in editorData.long_fields || []" :key="item.key" class="bilingual-row">
              <div class="bilingual-head"><strong>{{ item.label }}</strong></div>
              <div class="bilingual-columns">
                <label class="field-block"><span>中文</span><textarea :value="item.zh_text" rows="8" readonly /></label>
                <label class="field-block"><span>English</span><textarea v-model="item.en_text" rows="8" /></label>
              </div>
            </div>

            <div class="form-actions">
              <button class="btn btn-primary" type="button" :disabled="editorSaving" @click="handleSaveEditor">
                {{ editorSaving ? "保存中..." : "保存" }}
              </button>
              <button class="btn btn-secondary" type="button" @click="closeEditorDialog">取消</button>
            </div>
          </template>
        </div>
      </div>
    </dialog>
  </section>
</template>
