<script setup>
import { computed, onMounted, ref } from "vue";
import { useRouter } from "vue-router";

import AppLayout from "../components/AppLayout.vue";
import EmptyState from "../components/EmptyState.vue";
import ErrorAlert from "../components/ErrorAlert.vue";
import LoadingBlock from "../components/LoadingBlock.vue";
import StatusBadge from "../components/StatusBadge.vue";
import { fetchCurrentUser, logout } from "../api/auth.js";
import { closeForm, deleteForm, listForms, publishForm, quickCreateForm, reopenForm, updateForm } from "../api/forms.js";
import { formatDateOnly, formatDateTime, getFormStatusLabel } from "../utils/format.js";

const router = useRouter();
const currentUser = ref(null);
const forms = ref([]);
const loading = ref(true);
const saving = ref(false);
const errorMessage = ref("");
const formState = ref({
  id: "",
  title: "",
  date: "",
});

const canManage = computed(() => ["super_admin", "academic_admin"].includes(currentUser.value?.role));
const activeForms = computed(() => forms.value.filter((item) => item.status === "active"));
const draftForms = computed(() => forms.value.filter((item) => item.status === "draft"));
const closedForms = computed(() => forms.value.filter((item) => item.status === "closed"));

function resetFormState() {
  formState.value = {
    id: "",
    title: "",
    date: "",
  };
}

function startEdit(form) {
  formState.value = {
    id: form.id,
    title: form.title || "",
    date: form.start_time ? new Date(form.start_time).toISOString().slice(0, 10) : "",
  };
}

function getTone(status) {
  if (status === "active") {
    return "success";
  }
  if (status === "closed") {
    return "danger";
  }
  return "warning";
}

async function loadPage() {
  loading.value = true;
  errorMessage.value = "";
  try {
    const [me, formsResult] = await Promise.all([fetchCurrentUser(true), listForms({ ui_lang: "zh-CN" })]);
    currentUser.value = me;
    forms.value = formsResult?.data?.items || [];
  } catch (error) {
    errorMessage.value = error.message || "加载表单失败";
  } finally {
    loading.value = false;
  }
}

async function handleCreateOrUpdate() {
  saving.value = true;
  errorMessage.value = "";
  try {
    if (formState.value.id) {
      await updateForm(formState.value.id, {
        title: formState.value.title.trim(),
        start_time: formState.value.date ? `${formState.value.date}T00:00:00` : null,
        end_time: formState.value.date ? `${formState.value.date}T23:59:59` : null,
      });
    } else {
      const result = await quickCreateForm({
        title: formState.value.title.trim(),
        date: formState.value.date || null,
      });
      const nextId = result?.data?.form?.id;
      if (nextId) {
        await router.push(`/forms/${nextId}/designer`);
        return;
      }
    }
    resetFormState();
    await loadPage();
  } catch (error) {
    errorMessage.value = error.message || "保存表单失败";
  } finally {
    saving.value = false;
  }
}

async function handlePublish(formId) {
  try {
    await publishForm(formId);
    await loadPage();
  } catch (error) {
    errorMessage.value = error.message || "发布失败";
  }
}

async function handleClose(formId) {
  try {
    await closeForm(formId);
    await loadPage();
  } catch (error) {
    errorMessage.value = error.message || "关闭失败";
  }
}

async function handleReopen(formId) {
  try {
    await reopenForm(formId);
    await loadPage();
  } catch (error) {
    errorMessage.value = error.message || "重新开启失败";
  }
}

async function handleDelete(formId) {
  if (!window.confirm("确认删除该表单吗？")) {
    return;
  }
  try {
    await deleteForm(formId);
    await loadPage();
  } catch (error) {
    errorMessage.value = error.message || "删除失败";
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
  <AppLayout title="表单管理" subtitle="对接 `/api/forms` 及设计、填写、历史相关入口。" :current-user="currentUser" @logout="handleLogout">
    <ErrorAlert :message="errorMessage" />
    <LoadingBlock v-if="loading" label="正在加载表单..." />

    <div v-else class="page-grid with-side-panel">
      <section class="panel">
        <div class="panel-header">
          <div>
            <h2>表单列表</h2>
            <p class="muted-text">展示名称、状态、创建时间和主要操作。</p>
          </div>
          <button class="ghost-button" type="button" @click="loadPage">刷新</button>
        </div>

        <div class="stack-sections">
          <section>
            <div class="section-head">
              <h3>草稿</h3>
            </div>
            <EmptyState v-if="!draftForms.length" title="暂无草稿表单" />
            <div v-else class="table-wrap">
              <table class="data-table">
                <thead>
                  <tr>
                    <th>表单名称</th>
                    <th>状态</th>
                    <th>日期</th>
                    <th>创建时间</th>
                    <th>操作</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="item in draftForms" :key="item.id">
                    <td>{{ item.display_title || item.title }}</td>
                    <td><StatusBadge :text="getFormStatusLabel(item.status)" :tone="getTone(item.status)" /></td>
                    <td>{{ formatDateOnly(item.start_time) }}</td>
                    <td>{{ formatDateTime(item.created_at) }}</td>
                    <td>
                      <div class="action-row">
                        <RouterLink class="ghost-button link-button" :to="`/forms/${item.id}/designer`">设计</RouterLink>
                        <button v-if="canManage" class="ghost-button" type="button" @click="startEdit(item)">编辑</button>
                        <button v-if="canManage" class="primary-button" type="button" @click="handlePublish(item.id)">发布</button>
                        <button v-if="canManage" class="danger-button" type="button" @click="handleDelete(item.id)">删除</button>
                      </div>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </section>

          <section>
            <div class="section-head">
              <h3>进行中</h3>
            </div>
            <EmptyState v-if="!activeForms.length" title="暂无进行中的表单" />
            <div v-else class="table-wrap">
              <table class="data-table">
                <thead>
                  <tr>
                    <th>表单名称</th>
                    <th>状态</th>
                    <th>日期</th>
                    <th>创建时间</th>
                    <th>操作</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="item in activeForms" :key="item.id">
                    <td>{{ item.display_title || item.title }}</td>
                    <td><StatusBadge :text="getFormStatusLabel(item.status)" :tone="getTone(item.status)" /></td>
                    <td>{{ formatDateOnly(item.start_time) }}</td>
                    <td>{{ formatDateTime(item.created_at) }}</td>
                    <td>
                      <div class="action-row">
                        <RouterLink class="ghost-button link-button" :to="`/forms/${item.id}/designer`">设计</RouterLink>
                        <RouterLink class="ghost-button link-button" :to="`/forms/${item.id}/fill`">填写</RouterLink>
                        <RouterLink class="ghost-button link-button" :to="{ path: '/history', query: { formId: item.id } }">历史</RouterLink>
                        <button v-if="canManage" class="danger-button" type="button" @click="handleClose(item.id)">关闭</button>
                      </div>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </section>

          <section>
            <div class="section-head">
              <h3>已关闭</h3>
            </div>
            <EmptyState v-if="!closedForms.length" title="暂无已关闭表单" />
            <div v-else class="table-wrap">
              <table class="data-table">
                <thead>
                  <tr>
                    <th>表单名称</th>
                    <th>状态</th>
                    <th>日期</th>
                    <th>创建时间</th>
                    <th>操作</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="item in closedForms" :key="item.id">
                    <td>{{ item.display_title || item.title }}</td>
                    <td><StatusBadge :text="getFormStatusLabel(item.status)" :tone="getTone(item.status)" /></td>
                    <td>{{ formatDateOnly(item.start_time) }}</td>
                    <td>{{ formatDateTime(item.created_at) }}</td>
                    <td>
                      <div class="action-row">
                        <RouterLink class="ghost-button link-button" :to="{ path: '/history', query: { formId: item.id } }">历史</RouterLink>
                        <button v-if="canManage" class="ghost-button" type="button" @click="handleReopen(item.id)">重新开启</button>
                      </div>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </section>
        </div>
      </section>

      <section v-if="canManage" class="panel side-panel">
        <div class="panel-header">
          <div>
            <h2>{{ formState.id ? "编辑表单" : "快速创建表单" }}</h2>
            <p class="muted-text">新建时优先走 `POST /api/forms/quick-create`，直接进入设计页。</p>
          </div>
        </div>

        <form class="stack-form" @submit.prevent="handleCreateOrUpdate">
          <label class="field-block">
            <span>表单名称</span>
            <input v-model="formState.title" type="text" required />
          </label>
          <label class="field-block">
            <span>日期</span>
            <input v-model="formState.date" type="date" />
          </label>
          <div class="action-row">
            <button class="primary-button" type="submit" :disabled="saving">
              {{ saving ? "保存中..." : formState.id ? "保存修改" : "创建并进入设计页" }}
            </button>
            <button class="ghost-button" type="button" @click="resetFormState">重置</button>
          </div>
        </form>
      </section>
    </div>
  </AppLayout>
</template>
