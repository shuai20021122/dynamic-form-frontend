<script setup>
import { onMounted, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";

import AppLayout from "../components/AppLayout.vue";
import EmptyState from "../components/EmptyState.vue";
import ErrorAlert from "../components/ErrorAlert.vue";
import LoadingBlock from "../components/LoadingBlock.vue";
import StatusBadge from "../components/StatusBadge.vue";
import { fetchCurrentUser, logout } from "../api/auth.js";
import { exportForm } from "../api/export.js";
import { getFormEntries, listHistoryForms, reopenForm } from "../api/forms.js";
import { buildValueSummary, formatDateTime, getFormStatusLabel } from "../utils/format.js";

const route = useRoute();
const router = useRouter();

const currentUser = ref(null);
const forms = ref([]);
const selectedForm = ref(null);
const selectedEntries = ref([]);
const loading = ref(true);
const entriesLoading = ref(false);
const errorMessage = ref("");
const keyword = ref("");
const page = ref(1);
const pageSize = ref(10);
const total = ref(0);

function getTone(status) {
  if (status === "closed") {
    return "danger";
  }
  if (status === "active") {
    return "success";
  }
  return "warning";
}

async function loadHistory() {
  loading.value = true;
  errorMessage.value = "";
  try {
    const [me, result] = await Promise.all([
      fetchCurrentUser(true),
      listHistoryForms({
        keyword: keyword.value.trim(),
        page: page.value,
        page_size: pageSize.value,
        ui_lang: "zh-CN",
      }),
    ]);
    currentUser.value = me;
    forms.value = result?.data?.items || [];
    total.value = result?.data?.pagination?.total || 0;
  } catch (error) {
    errorMessage.value = error.message || "加载历史表单失败";
  } finally {
    loading.value = false;
  }
}

async function loadEntries(form) {
  selectedForm.value = form;
  entriesLoading.value = true;
  errorMessage.value = "";
  try {
    const result = await getFormEntries(form.id, { ui_lang: "zh-CN" });
    selectedEntries.value = result?.data?.items || [];
  } catch (error) {
    errorMessage.value = error.message || "加载填写记录失败";
  } finally {
    entriesLoading.value = false;
  }
}

async function handleReopen(formId) {
  try {
    await reopenForm(formId);
    if (selectedForm.value?.id === formId) {
      selectedForm.value = null;
      selectedEntries.value = [];
    }
    await loadHistory();
  } catch (error) {
    errorMessage.value = error.message || "重新开启失败";
  }
}

async function handleLogout() {
  try {
    await logout();
  } finally {
    await router.push("/login");
  }
}

watch(
  () => route.query.formId,
  async (formId) => {
    if (!formId || !forms.value.length) {
      return;
    }
    const matched = forms.value.find((item) => String(item.id) === String(formId));
    if (matched) {
      await loadEntries(matched);
    }
  }
);

onMounted(async () => {
  await loadHistory();
  if (route.query.formId) {
    const matched = forms.value.find((item) => String(item.id) === String(route.query.formId));
    if (matched) {
      await loadEntries(matched);
    }
  }
});
</script>

<template>
  <AppLayout title="历史表单" subtitle="对接 `/api/forms/history` 与历史填写记录接口。" :current-user="currentUser" @logout="handleLogout">
    <ErrorAlert :message="errorMessage" />
    <LoadingBlock v-if="loading" label="正在加载历史表单..." />

    <div v-else class="page-grid two-columns">
      <section class="panel">
        <div class="panel-header">
          <div>
            <h2>历史表单列表</h2>
            <p class="muted-text">支持搜索、查看记录、导出以及重新开启。</p>
          </div>
        </div>

        <div class="filter-grid compact-grid">
          <input v-model="keyword" class="table-filter" type="text" placeholder="按表单标题搜索" />
          <button class="primary-button" type="button" @click="page = 1; loadHistory()">搜索</button>
          <button class="ghost-button" type="button" @click="keyword = ''; page = 1; loadHistory()">重置</button>
        </div>

        <EmptyState v-if="!forms.length" title="暂无历史表单" />
        <div v-else class="stack-list">
          <article v-for="form in forms" :key="form.id" class="list-card">
            <div class="list-card-head">
              <div>
                <h3>{{ form.display_title || form.title }}</h3>
                <p class="muted-text">{{ formatDateTime(form.updated_at) }}</p>
              </div>
              <StatusBadge :text="getFormStatusLabel(form.status)" :tone="getTone(form.status)" />
            </div>
            <div class="action-row">
              <button class="ghost-button" type="button" @click="loadEntries(form)">查看记录</button>
              <button class="primary-button" type="button" @click="exportForm(form.id)">导出 Excel</button>
              <button class="ghost-button" type="button" @click="handleReopen(form.id)">重新开启</button>
            </div>
          </article>
        </div>

        <div class="pager-row">
          <button class="ghost-button" type="button" :disabled="page <= 1" @click="page -= 1; loadHistory()">上一页</button>
          <span class="muted-text">第 {{ page }} 页，共 {{ Math.max(1, Math.ceil(total / pageSize)) }} 页</span>
          <button
            class="ghost-button"
            type="button"
            :disabled="page >= Math.max(1, Math.ceil(total / pageSize))"
            @click="page += 1; loadHistory()"
          >
            下一页
          </button>
        </div>
      </section>

      <section class="panel">
        <div class="panel-header">
          <div>
            <h2>{{ selectedForm ? `${selectedForm.display_title || selectedForm.title} 的记录` : "填写记录详情" }}</h2>
            <p class="muted-text">支持查看每条记录的槽位、人员、团队和填写内容。</p>
          </div>
        </div>

        <LoadingBlock v-if="entriesLoading" label="正在加载记录..." />
        <EmptyState v-else-if="!selectedForm" title="请选择左侧表单查看记录" />
        <EmptyState v-else-if="!selectedEntries.length" title="该表单暂无历史记录" />
        <div v-else class="table-wrap">
          <table class="data-table">
            <thead>
              <tr>
                <th>空位</th>
                <th>姓名</th>
                <th>团队</th>
                <th>更新时间</th>
                <th>填写内容</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="entry in selectedEntries" :key="entry.id">
                <td>{{ entry.slot_title }}</td>
                <td>{{ entry.user_real_name }}</td>
                <td>{{ entry.team_name }}</td>
                <td>{{ formatDateTime(entry.updated_at) }}</td>
                <td><pre class="value-summary">{{ buildValueSummary(entry.values) }}</pre></td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
    </div>
  </AppLayout>
</template>
