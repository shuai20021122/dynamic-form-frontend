<script setup>
import { computed, onMounted, ref } from "vue";
import { useRoute, useRouter } from "vue-router";

import bossKnowLogo from "../assets/boss-know-logo.png";
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
  if (status === "filled") return "success";
  if (status === "occupied") return "neutral";
  return "warning";
}

function openEditor(row) {
  editingRow.value = row;
  editorVisible.value = true;
  documentRow.value = null;
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
    closeEditor();
    await loadPage();
  } catch (error) {
    errorMessage.value = error.message || "保存填写内容失败";
  } finally {
    saving.value = false;
  }
}

async function handleDeleteEntry(row) {
  if (!row.entry?.id || !window.confirm("确认删除这条填报记录吗？")) return;
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
    :title="'表单填写'"
    :subtitle="tableData?.form ? `${tableData.form.display_title || tableData.form.title}` : ''"
    :current-user="currentUser"
    @logout="handleLogout"
  >
    <ErrorAlert :message="errorMessage" />
    <LoadingBlock v-if="loading" label="正在加载表格视图..." />

    <div v-else-if="tableData" class="fill-page">
      <section class="fill-hero panel">
        <div class="fill-hero-body">
          <img class="fill-hero-logo" :src="bossKnowLogo" alt="BOSS KNOW" />
          <div class="fill-hero-copy">
            <h2 id="fill-form-title" class="fill-hero-title">{{ tableData.form.display_title || tableData.form.title }} - 表单填写</h2>
            <p id="fill-form-meta" class="muted-text fill-hero-meta">当前状态：{{ getFormStatusLabel(tableData.form.status) }}</p>
          </div>
          <div class="fill-hero-actions">
            <RouterLink class="btn btn-secondary" to="/forms">返回表单列表</RouterLink>
          </div>
        </div>
      </section>

      <section class="panel fill-panel">
        <div class="panel-body fill-panel-body">
          <div class="fill-panel-head">
            <div class="fill-panel-intro">
              <div class="fill-panel-icon" aria-hidden="true">✥</div>
              <div class="fill-panel-titlewrap">
                <h2 id="fill-table-section-title">填写表格</h2>
                <p id="fill-note" class="muted-text fill-note">灰色“已被其他账号占用”表示该时间段已经被其他账号填写，您无权查看内容。</p>
              </div>
            </div>
            <button class="btn btn-secondary" type="button" @click="loadPage">刷新状态</button>
          </div>
          <div class="fill-panel-divider"></div>

          <EmptyState v-if="!tableData.rows.length" title="暂无数据" />
          <div v-else class="table-wrap fill-table-wrap">
            <table class="data-table excel-table">
              <thead>
                <tr>
                  <th>时间 / 空位</th>
                  <th v-for="field in tableData.fields" :key="field.id">{{ field.display_label || field.field_label }}</th>
                  <th>状态</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="row in tableData.rows" :key="row.slot.id">
                  <td>{{ row.slot.title }}</td>
                  <td v-for="field in tableData.fields" :key="`${row.slot.id}-${field.id}`">
                    {{ row.values?.[field.field_key]?.display_value || row.values?.[field.field_key]?.value || (row.can_view ? "-" : "不可查看") }}
                  </td>
                  <td>
                    <StatusBadge :text="getEntryStatusLabel(row.status)" :tone="getTone(row.status)" />
                  </td>
                  <td>
                    <div class="form-actions">
                      <button v-if="row.can_fill" class="btn btn-primary" type="button" @click="openEditor(row)">填写</button>
                      <button v-if="row.can_edit" class="btn btn-secondary" type="button" @click="openEditor(row)">编辑</button>
                      <button v-if="row.entry?.id" class="btn btn-secondary" type="button" @click="documentRow = row; editorVisible = false">简表</button>
                      <button v-if="row.can_edit" class="btn btn-danger" type="button" @click="handleDeleteEntry(row)">删除</button>
                    </div>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <section v-if="editorVisible && editingRow" id="entry-editor-panel" class="panel">
        <div class="panel-header">
          <h2 id="entry-editor-title">填写内容</h2>
        </div>
        <form class="stack-form panel-body" @submit.prevent="handleSaveEntry">
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
          <div class="form-actions">
            <button class="btn btn-primary" type="submit" :disabled="saving">{{ saving ? "提交中..." : "提交" }}</button>
            <button class="btn btn-secondary" type="button" @click="closeEditor">取消</button>
          </div>
        </form>
      </section>

      <DocumentManager
        v-if="documentRow?.entry?.id"
        :entry-id="documentRow.entry.id"
        :can-upload="documentRow.can_upload_document"
        :can-delete="documentRow.can_delete_document"
        :embedded="true"
        @updated="loadPage"
      />

      <section v-if="documentRow?.entry" class="panel">
        <div class="panel-header compact">
          <h3>当前记录</h3>
        </div>
        <div class="panel-body">
          <pre class="value-summary">{{ buildValueSummary(documentRow.values) || "暂无填写内容" }}</pre>
        </div>
      </section>
    </div>
  </AppLayout>
</template>
