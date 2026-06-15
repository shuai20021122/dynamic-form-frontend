<script setup>
import { computed, ref, watch } from "vue";
import { RouterLink } from "vue-router";

import {
  deleteDocument,
  downloadDocument,
  generateBilingualDocument,
  listEntryDocuments,
  previewDocument,
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
  embedded: {
    type: Boolean,
    default: false,
  },
});

const emit = defineEmits(["updated"]);

const documents = ref([]);
const loading = ref(false);
const errorMessage = ref("");
const uploadBusy = ref(false);
const previewHtml = ref("");
const translatePreview = ref(null);
const actionBusyId = ref(null);

const originalDocx = computed(() =>
  documents.value.find((item) => item.document_kind === "original" && item.file_type === "docx") || null
);

function getStatusTone(status) {
  if (status === "generated") {
    return "success";
  }
  return "warning";
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
  if (!file || !props.entryId) {
    return;
  }

  uploadBusy.value = true;
  errorMessage.value = "";
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
  actionBusyId.value = `preview-${documentId}`;
  previewHtml.value = "";
  translatePreview.value = null;
  try {
    const result = await previewDocument(documentId);
    previewHtml.value = result?.data?.html || "";
  } catch (error) {
    errorMessage.value = error.message || "预览失败";
  } finally {
    actionBusyId.value = null;
  }
}

async function handleTranslatePreview(documentId) {
  actionBusyId.value = `translate-${documentId}`;
  previewHtml.value = "";
  translatePreview.value = null;
  try {
    const result = await translatePreviewDocument(documentId);
    translatePreview.value = result?.data || null;
  } catch (error) {
    errorMessage.value = error.message || "翻译预览失败";
  } finally {
    actionBusyId.value = null;
  }
}

async function handleGenerateBilingual() {
  if (!originalDocx.value) {
    errorMessage.value = "当前没有可生成双语简表的原始 DOCX 文档";
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
  if (!window.confirm("确认删除该文档吗？")) {
    return;
  }
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

watch(
  () => props.entryId,
  () => {
    previewHtml.value = "";
    translatePreview.value = null;
    loadDocuments();
  },
  { immediate: true }
);
</script>

<template>
  <section class="panel">
    <div class="panel-header">
      <div>
        <h2>文档与双语简表</h2>
        <p class="muted-text">上传简表、查看列表、预览、下载和双语编辑都通过现有后端接口完成。</p>
      </div>
      <div class="action-row">
        <label v-if="canUpload" class="button-like primary-button">
          {{ uploadBusy ? "上传中..." : "上传文档" }}
          <input class="hidden-input" type="file" accept=".docx,.pdf" :disabled="uploadBusy" @change="handleUpload" />
        </label>
        <button class="ghost-button" type="button" :disabled="!originalDocx || !!actionBusyId" @click="handleGenerateBilingual">
          生成双语简表
        </button>
      </div>
    </div>

    <ErrorAlert :message="errorMessage" />

    <LoadingBlock v-if="loading" label="正在加载文档列表..." />
    <EmptyState
      v-else-if="!documents.length"
      title="暂无文档"
      description="上传原始 DOCX 或 PDF 后，可在这里下载、预览或生成双语简表。"
    />

    <div v-else class="stack-list">
      <article v-for="document in documents" :key="document.id" class="list-card">
        <div class="list-card-head">
          <div>
            <h3>{{ document.original_filename }}</h3>
            <p class="muted-text">
              {{ document.file_type.toUpperCase() }} · {{ formatDateTime(document.created_at) }} · {{ document.document_kind }}
            </p>
          </div>
          <StatusBadge :text="document.translation_status" :tone="getStatusTone(document.translation_status)" />
        </div>

        <div class="action-row">
          <button class="ghost-button" type="button" :disabled="!!actionBusyId" @click="downloadDocument(document.id)">下载</button>
          <button
            v-if="document.file_type === 'docx'"
            class="ghost-button"
            type="button"
            :disabled="!!actionBusyId"
            @click="handlePreview(document.id)"
          >
            预览
          </button>
          <button
            v-if="document.file_type === 'docx' && document.document_kind === 'original'"
            class="ghost-button"
            type="button"
            :disabled="!!actionBusyId"
            @click="handleTranslatePreview(document.id)"
          >
            翻译预览
          </button>
          <RouterLink
            v-if="document.file_type === 'docx' && document.document_kind === 'bilingual'"
            class="ghost-button link-button"
            :to="`/documents/${document.id}/bilingual-editor`"
          >
            双语编辑
          </RouterLink>
          <button
            v-if="canDelete"
            class="danger-button"
            type="button"
            :disabled="!!actionBusyId"
            @click="handleDelete(document.id)"
          >
            删除
          </button>
        </div>
      </article>
    </div>

    <div v-if="previewHtml" class="preview-panel">
      <h3>文档预览</h3>
      <div class="html-preview" v-html="previewHtml" />
    </div>

    <div v-if="translatePreview" class="preview-panel split-preview">
      <div>
        <h3>原文</h3>
        <pre>{{ translatePreview.original_text }}</pre>
      </div>
      <div>
        <h3>英文预览</h3>
        <pre>{{ translatePreview.translated_text }}</pre>
      </div>
    </div>
  </section>
</template>
