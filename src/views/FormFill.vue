<script setup>
import { computed, onMounted, ref } from "vue";
import { useRoute, useRouter } from "vue-router";

import AppLayout from "../components/AppLayout.vue";
import DocumentManager from "../components/DocumentManager.vue";
import EmptyState from "../components/EmptyState.vue";
import ErrorAlert from "../components/ErrorAlert.vue";
import LoadingBlock from "../components/LoadingBlock.vue";
import StatusBadge from "../components/StatusBadge.vue";
import { fetchCurrentUser, logout } from "../api/auth.js";
import { createEntry, deleteEntry, updateEntry } from "../api/entries.js";
import { getFormTable } from "../api/forms.js";
import { buildValueSummary, getEntryStatusLabel, getFormStatusLabel } from "../utils/format.js";

const route = useRoute();
const router = useRouter();
const formId = computed(() => route.params.id);

const currentUser = ref(null);
const tableData = ref(null);
const loading = ref(true);
const saving = ref(false);
const errorMessage = ref("");
const editorVisible = ref(false);
const editingRow = ref(null);
const entryValues = ref({});
const documentRow = ref(null);

function getTone(status) {
  if (status === "filled") {
    return "success";
  }
  if (status === "occupied") {
    return "danger";
  }
  return "warning";
}

function openEditor(row) {
  editingRow.value = row;
  editorVisible.value = true;
  entryValues.value = {};
  (tableData.value?.fields || []).forEach((field) => {
    entryValues.value[field.field_key] = row.values?.[field.field_key]?.value || "";
  });
}

function closeEditor() {
  editorVisible.value = false;
  editingRow.value = null;
  entryValues.value = {};
}

async function loadPage() {
  loading.value = true;
  errorMessage.value = "";
  try {
    const [me, tableResult] = await Promise.all([fetchCurrentUser(true), getFormTable(formId.value, { ui_lang: "zh-CN" })]);
    currentUser.value = me;
    tableData.value = tableResult?.data || null;
  } catch (error) {
    errorMessage.value = error.message || "加载填写页失败";
  } finally {
    loading.value = false;
  }
}

async function handleSaveEntry() {
  if (!editingRow.value) {
    return;
  }
  saving.value = true;
  errorMessage.value = "";
  try {
    if (editingRow.value.entry?.id) {
      await updateEntry(editingRow.value.entry.id, {
        values: entryValues.value,
      });
    } else {
      await createEntry(formId.value, {
        slot_id: editingRow.value.slot.id,
        values: entryValues.value,
      });
    }
    closeEditor();
    await loadPage();
  } catch (error) {
    errorMessage.value = error.message || "保存填写内容失败";
  } finally {
    saving.value = false;
  }
}

async function handleDeleteEntry(row) {
  if (!row.entry?.id || !window.confirm("确认删除这条填写记录吗？")) {
    return;
  }
  try {
    await deleteEntry(row.entry.id);
    if (documentRow.value?.entry?.id === row.entry.id) {
      documentRow.value = null;
    }
    await loadPage();
  } catch (error) {
    errorMessage.value = error.message || "删除填写记录失败";
  }
}

async function handleLogout() {
  try {
    await logout();
  } finally {
    await router.push("/login");
  }
}

onMounted(loadPage);
</script>

<template>
  <AppLayout
    :title="tableData?.form?.display_title || tableData?.form?.title || '表单填写'"
    :subtitle="tableData?.form ? `状态：${getFormStatusLabel(tableData.form.status)}` : '对接 `/api/forms/{id}/table`。'"
    :current-user="currentUser"
    @logout="handleLogout"
  >
    <ErrorAlert :message="errorMessage" />
    <LoadingBlock v-if="loading" label="正在加载表格视图..." />

    <div v-else-if="tableData" class="page-grid two-columns">
      <section class="panel">
        <div class="panel-header">
          <div>
            <h2>填写表格</h2>
            <p class="muted-text">支持填写、编辑、删除，以及进入文档管理入口。</p>
          </div>
          <button class="ghost-button" type="button" @click="loadPage">刷新</button>
        </div>

        <EmptyState v-if="!tableData.rows.length" title="当前表单暂无可展示的空位" />
        <div v-else class="table-wrap">
          <table class="data-table">
            <thead>
              <tr>
                <th>空位</th>
                <th v-for="field in tableData.fields" :key="field.id">{{ field.display_label || field.field_label }}</th>
                <th>状态</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="row in tableData.rows" :key="row.slot.id">
                <td>{{ row.slot.title }}</td>
                <td v-for="field in tableData.fields" :key="`${row.slot.id}-${field.id}`">
                  {{ row.values?.[field.field_key]?.display_value || row.values?.[field.field_key]?.value || (row.can_view ? "-" : "不可见") }}
                </td>
                <td>
                  <StatusBadge :text="getEntryStatusLabel(row.status)" :tone="getTone(row.status)" />
                </td>
                <td>
                  <div class="action-row">
                    <button v-if="row.can_fill" class="primary-button" type="button" @click="openEditor(row)">填写</button>
                    <button v-if="row.can_edit" class="ghost-button" type="button" @click="openEditor(row)">编辑</button>
                    <button v-if="row.can_edit" class="ghost-button" type="button" @click="documentRow = row">文档</button>
                    <button v-if="row.can_edit" class="danger-button" type="button" @click="handleDeleteEntry(row)">删除</button>
                    <button
                      v-if="row.status === 'filled' && row.can_view && !row.can_edit"
                      class="ghost-button"
                      type="button"
                      @click="documentRow = row"
                    >
                      文档
                    </button>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <section class="panel side-panel">
        <div class="panel-header">
          <div>
            <h2>{{ editorVisible ? "填写内容" : documentRow ? "文档管理" : "详情面板" }}</h2>
            <p class="muted-text">
              <template v-if="editorVisible">根据当前空位填写字段并保存到 `/api/forms/{id}/entries` 或 `/api/entries/{id}`。</template>
              <template v-else-if="documentRow">当前入口直接复用后端文档 API，不在前端重写简表逻辑。</template>
              <template v-else>选择一个空位进行填写，或从已填写行进入文档管理。</template>
            </p>
          </div>
        </div>

        <form v-if="editorVisible && editingRow" class="stack-form" @submit.prevent="handleSaveEntry">
          <div class="summary-card">
            <span class="meta-label">当前空位</span>
            <strong>{{ editingRow.slot.title }}</strong>
          </div>
          <label v-for="field in tableData.fields" :key="field.id" class="field-block">
            <span>{{ field.display_label || field.field_label }}<em v-if="field.is_required"> *</em></span>
            <textarea
              v-if="field.field_type === 'textarea'"
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
          <div class="action-row">
            <button class="primary-button" type="submit" :disabled="saving">{{ saving ? "保存中..." : "保存" }}</button>
            <button class="ghost-button" type="button" @click="closeEditor">取消</button>
          </div>
        </form>

        <DocumentManager
          v-else-if="documentRow?.entry?.id"
          :entry-id="documentRow.entry.id"
          :can-upload="documentRow.can_upload_document"
          :can-delete="documentRow.can_delete_document"
          :embedded="true"
          @updated="loadPage"
        />

        <div v-else class="feedback-card">
          <p class="muted-text">这里会显示当前选中行的文档管理或填写表单。</p>
        </div>

        <div v-if="documentRow?.entry" class="panel inset-panel">
          <div class="panel-header compact">
            <h3>当前已选记录</h3>
          </div>
          <pre class="value-summary">{{ buildValueSummary(documentRow.values) || "暂无填写内容" }}</pre>
        </div>
      </section>
    </div>
  </AppLayout>
</template>
