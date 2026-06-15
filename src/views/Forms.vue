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
const draftForms = computed(() => forms.value.filter((item) => item.status === "draft"));
const activeForms = computed(() => forms.value.filter((item) => item.status === "active"));

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
  return status === "active" ? "success" : "warning";
}

async function loadPage() {
  loading.value = true;
  errorMessage.value = "";
  try {
    const [me, formsResult] = await Promise.all([fetchCurrentUser(true), listForms({ ui_lang: "zh-CN" })]);
    currentUser.value = me;
    forms.value = (formsResult?.data?.items || []).filter((item) => item.status !== "closed");
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
      resetFormState();
      await loadPage();
      return;
    }

    const result = await quickCreateForm({
      title: formState.value.title.trim(),
      date: formState.value.date || null,
    });
    const nextId = result?.data?.form?.id;
    if (nextId) {
      await router.push(`/forms/${nextId}/designer`);
    }
  } catch (error) {
    errorMessage.value = error.message || "保存表单失败";
  } finally {
    saving.value = false;
  }
}

async function handlePublish(formId) {
  if (!window.confirm("发布后，个人账号即可开始填写该表单。确认发布吗？")) {
    return;
  }
  try {
    await publishForm(formId);
    await loadPage();
  } catch (error) {
    errorMessage.value = error.message || "发布失败";
  }
}

async function handleClose(formId) {
  if (!window.confirm("关闭后，该表单将进入历史表单，不能继续填写或修改填报。确认关闭吗？")) {
    return;
  }
  try {
    await closeForm(formId);
    await loadPage();
  } catch (error) {
    errorMessage.value = error.message || "关闭失败";
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

async function handleReopen(formId) {
  try {
    await reopenForm(formId);
    await loadPage();
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

onMounted(loadPage);
</script>

<template>
  <AppLayout title="表单管理" :current-user="currentUser" @logout="handleLogout">
    <ErrorAlert :message="errorMessage" />
    <LoadingBlock v-if="loading" label="正在加载表单..." />

    <section v-else class="page-grid" :class="{ 'two-column': canManage }">
      <section v-if="canManage" class="panel">
        <div class="panel-header">
          <h2>{{ formState.id ? "编辑表单" : "创建表单" }}</h2>
        </div>
        <form class="stack-form panel-body" @submit.prevent="handleCreateOrUpdate">
          <label class="field-block">
            <span>表单标题</span>
            <input v-model="formState.title" type="text" required />
          </label>
          <label class="field-block">
            <span>日期</span>
            <input v-model="formState.date" type="date" />
          </label>
          <p class="muted-text">创建后会直接进入 Excel 式设计页，在表格里维护表头和时间段。</p>
          <div class="form-actions">
            <button class="btn btn-primary" type="submit" :disabled="saving">
              {{ saving ? "提交中..." : formState.id ? "保存" : "创建表单" }}
            </button>
            <button class="btn btn-secondary" type="button" @click="resetFormState">取消编辑</button>
          </div>
        </form>
      </section>

      <section class="panel">
        <div class="panel-header">
          <h2>表单列表</h2>
          <button class="btn btn-secondary" type="button" @click="loadPage">刷新</button>
        </div>
        <div class="panel-body">
          <section class="forms-section">
            <div class="forms-section-header">
              <h3>待发布</h3>
            </div>
            <div class="table-wrap">
              <table class="data-table">
                <thead>
                  <tr>
                    <th>标题</th>
                    <th>状态</th>
                    <th>日期</th>
                    <th>更新时间</th>
                    <th>操作</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="item in draftForms" :key="item.id">
                    <td>{{ item.display_title || item.title }}</td>
                    <td><StatusBadge :text="getFormStatusLabel(item.status)" :tone="getTone(item.status)" /></td>
                    <td>{{ formatDateOnly(item.start_time) }}</td>
                    <td>{{ formatDateTime(item.updated_at || item.created_at) }}</td>
                    <td>
                      <div class="form-actions">
                        <RouterLink class="btn btn-secondary" :to="`/forms/${item.id}/designer`">设计</RouterLink>
                        <button v-if="canManage" class="btn btn-secondary" type="button" @click="startEdit(item)">编辑</button>
                        <button v-if="canManage" class="btn btn-primary" type="button" @click="handlePublish(item.id)">发布表单</button>
                        <button v-if="canManage" class="btn btn-danger" type="button" @click="handleDelete(item.id)">删除</button>
                      </div>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
            <div v-if="!draftForms.length" class="empty-state">暂无待发布表单</div>
          </section>

          <section class="forms-section">
            <div class="forms-section-header">
              <h3>进行中</h3>
            </div>
            <div class="table-wrap">
              <table class="data-table">
                <thead>
                  <tr>
                    <th>标题</th>
                    <th>状态</th>
                    <th>日期</th>
                    <th>更新时间</th>
                    <th>操作</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="item in activeForms" :key="item.id">
                    <td>{{ item.display_title || item.title }}</td>
                    <td><StatusBadge :text="getFormStatusLabel(item.status)" :tone="getTone(item.status)" /></td>
                    <td>{{ formatDateOnly(item.start_time) }}</td>
                    <td>{{ formatDateTime(item.updated_at || item.created_at) }}</td>
                    <td>
                      <div class="form-actions">
                        <RouterLink class="btn btn-secondary" :to="`/forms/${item.id}/fill`">填写页</RouterLink>
                        <RouterLink class="btn btn-secondary" :to="`/forms/${item.id}/designer`">设计</RouterLink>
                        <button v-if="canManage" class="btn btn-secondary" type="button" @click="handleClose(item.id)">关闭</button>
                        <button v-if="canManage" class="btn btn-secondary" type="button" @click="handleReopen(item.id)">重新开启</button>
                      </div>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
            <div v-if="!activeForms.length" class="empty-state">暂无进行中表单</div>
          </section>
        </div>
      </section>
    </section>
  </AppLayout>
</template>
