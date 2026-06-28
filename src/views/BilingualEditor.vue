<script setup>
import { computed, nextTick, onMounted, ref } from "vue";
import { useRoute } from "vue-router";

import EmptyState from "../components/EmptyState.vue";
import ErrorAlert from "../components/ErrorAlert.vue";
import LoadingBlock from "../components/LoadingBlock.vue";
import { fetchCurrentUser } from "../api/auth.js";
import { previewDocument, saveBilingualEditor } from "../api/documents.js";

const route = useRoute();
const documentId = computed(() => route.params.id);

const loading = ref(true);
const saving = ref(false);
const errorMessage = ref("");
const previewHtml = ref("");
const canEdit = ref(false);
const currentBilingualDocumentId = ref(null);
const editorContainer = ref(null);

function getEditableElement() {
  return editorContainer.value?.querySelector?.("#bilingual-preview-content") || null;
}

function resolvePreviewPayload(result) {
  const data = result?.data || {};

  if (!data?.html) {
    throw new Error("后端未返回双语预览 HTML");
  }

  return data;
}

function resolveSavePayload(result) {
  if (!result?.success) {
    throw new Error(result?.message || "保存双语简表失败");
  }

  return result?.data || {};
}

async function syncInitialInnerHtml() {
  await nextTick();
}

async function loadPage() {
  loading.value = true;
  errorMessage.value = "";

  try {
    await fetchCurrentUser(true);
    const data = resolvePreviewPayload(await previewDocument(documentId.value));
    currentBilingualDocumentId.value = data.document_id || documentId.value;
    previewHtml.value = data.html;
    canEdit.value = Boolean(data.can_edit);
    await syncInitialInnerHtml();
  } catch (error) {
    errorMessage.value = error.message || "加载失败";
  } finally {
    loading.value = false;
  }
}

async function handleSave() {
  if (!currentBilingualDocumentId.value) {
    errorMessage.value = "缺少双语文档 ID";
    return;
  }

  if (!canEdit.value) {
    errorMessage.value = "当前用户无权编辑双语简表";
    return;
  }

  const editableEl = getEditableElement();
  if (!editableEl) {
    errorMessage.value = "未找到可编辑的双语内容区域";
    return;
  }

  saving.value = true;
  errorMessage.value = "";

  try {
    const saveData = resolveSavePayload(
      await saveBilingualEditor(currentBilingualDocumentId.value, editableEl.innerHTML)
    );
    const data = resolvePreviewPayload(await previewDocument(currentBilingualDocumentId.value));

    if (saveData.content_hash && data.content_hash && saveData.content_hash !== data.content_hash) {
      console.warn("Bilingual save content hash mismatch between save response and preview response.");
    }

    previewHtml.value = data.html;
    canEdit.value = Boolean(data.can_edit);
    currentBilingualDocumentId.value = data.document_id || currentBilingualDocumentId.value;
    await syncInitialInnerHtml();
  } catch (error) {
    errorMessage.value = error.message || "保存失败";
  } finally {
    saving.value = false;
  }
}

onMounted(loadPage);
</script>

<template>
  <ErrorAlert :message="errorMessage" />
  <LoadingBlock v-if="loading" label="加载中..." />
  <EmptyState v-else-if="!previewHtml" title="暂无数据" />

  <div v-else class="page-grid single-column">
    <section class="panel">
      <div class="panel-header">
        <h2>编辑双语简表</h2>
        <button class="btn btn-primary" type="button" :disabled="saving || !canEdit" @click="handleSave">
          {{ saving ? "保存中..." : "保存" }}
        </button>
      </div>
      <div class="panel-body stack-form">
        <p v-if="!canEdit" class="muted-text">当前预览内容不可编辑。</p>
        <div ref="editorContainer" class="docx-preview-content document-preview-html" v-html="previewHtml" />
      </div>
    </section>
  </div>
</template>
