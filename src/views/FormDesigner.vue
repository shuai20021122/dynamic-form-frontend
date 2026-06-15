<script setup>
import { computed, onMounted, ref } from "vue";
import { useRoute, useRouter } from "vue-router";

import AppLayout from "../components/AppLayout.vue";
import ErrorAlert from "../components/ErrorAlert.vue";
import LoadingBlock from "../components/LoadingBlock.vue";
import { fetchCurrentUser, logout } from "../api/auth.js";
import { getForm, getSimpleDesigner, publishForm, saveSimpleDesigner } from "../api/forms.js";
import { formatDateOnly, getFormStatusLabel } from "../utils/format.js";

const route = useRoute();
const router = useRouter();
const formId = computed(() => route.params.id);

const currentUser = ref(null);
const form = ref(null);
const design = ref(null);
const loading = ref(true);
const saving = ref(false);
const publishing = ref(false);
const errorMessage = ref("");
const headers = ref([]);
const slots = ref([]);

function ensureMinimum() {
  if (!headers.value.length) headers.value = ["", "", ""];
  if (!slots.value.length) slots.value = ["", ""];
}

function addHeader() {
  headers.value.push("");
}

function removeHeader() {
  headers.value.pop();
  ensureMinimum();
}

function addSlot() {
  slots.value.push("");
}

function removeSlot() {
  slots.value.pop();
  ensureMinimum();
}

function normalize(items) {
  return items.map((item) => item.trim()).filter(Boolean);
}

async function loadPage() {
  loading.value = true;
  errorMessage.value = "";
  try {
    const [me, formResult, designResult] = await Promise.all([
      fetchCurrentUser(true),
      getForm(formId.value),
      getSimpleDesigner(formId.value),
    ]);
    currentUser.value = me;
    form.value = formResult?.data?.form || null;
    design.value = designResult?.data || null;
    headers.value = [...(design.value?.headers || [])];
    slots.value = [...(design.value?.slots || [])];
    ensureMinimum();
  } catch (error) {
    errorMessage.value = error.message || "加载表单设计失败";
  } finally {
    loading.value = false;
  }
}

async function handleSave() {
  saving.value = true;
  errorMessage.value = "";
  try {
    await saveSimpleDesigner(formId.value, {
      headers: normalize(headers.value),
      required_headers: [],
      slots: normalize(slots.value),
    });
    await loadPage();
  } catch (error) {
    errorMessage.value = error.message || "保存设计失败";
  } finally {
    saving.value = false;
  }
}

async function handlePublish() {
  publishing.value = true;
  errorMessage.value = "";
  try {
    await publishForm(formId.value);
    await loadPage();
  } catch (error) {
    errorMessage.value = error.message || "发布失败";
  } finally {
    publishing.value = false;
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
  <AppLayout title="表格设计界面" :current-user="currentUser" @logout="handleLogout">
    <ErrorAlert :message="errorMessage" />
    <LoadingBlock v-if="loading" label="正在加载表单设计..." />

    <template v-else-if="form && design">
      <section class="panel">
        <div class="panel-header">
          <h2 id="designer-form-title">{{ form.display_title || form.title }} - 表格设计界面</h2>
          <RouterLink class="btn btn-secondary" to="/forms">返回表单列表</RouterLink>
        </div>
        <div class="panel-body stack-form">
          <p id="designer-form-meta" class="muted-text">日期：{{ formatDateOnly(form.start_time) }} | 状态：{{ getFormStatusLabel(form.status) }}</p>
          <p class="muted-text">先在第一行填写表头，再在第一列填写时间段。中间空白格不需要填写，那些位置留给个人账号后续填写。</p>
        </div>
      </section>

      <section class="panel">
        <div class="panel-header">
          <h2>设计表格</h2>
          <div class="form-actions">
            <button class="btn btn-secondary" type="button" @click="addHeader">新增列</button>
            <button class="btn btn-secondary" type="button" @click="removeHeader">删除列</button>
            <button class="btn btn-secondary" type="button" @click="addSlot">新增行</button>
            <button class="btn btn-secondary" type="button" @click="removeSlot">删除行</button>
            <RouterLink class="btn btn-secondary" :to="`/forms/${form.id}/fill`">预览填写页</RouterLink>
            <button class="btn btn-primary" type="button" :disabled="saving" @click="handleSave">
              {{ saving ? "保存中..." : "保存设计" }}
            </button>
            <button class="btn btn-secondary" type="button" :disabled="publishing" @click="handlePublish">
              {{ publishing ? "发布中..." : "发布表单" }}
            </button>
          </div>
        </div>
        <div class="panel-body">
          <div class="table-wrap">
            <table class="data-table">
              <thead>
                <tr>
                  <th>时间</th>
                  <th v-for="(header, index) in headers" :key="`header-${index}`">
                    <input v-model="headers[index]" type="text" :placeholder="`空白表头${index + 1}`" />
                  </th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="(slot, rowIndex) in slots" :key="`slot-${rowIndex}`">
                  <td>
                    <input v-model="slots[rowIndex]" type="text" placeholder="空白时间段" />
                  </td>
                  <td v-for="(_, colIndex) in headers" :key="`${rowIndex}-${colIndex}`"></td>
                  <td><span class="muted-text">删除行</span></td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </template>
  </AppLayout>
</template>
