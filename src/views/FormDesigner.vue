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
  if (!headers.value.length) {
    headers.value = ["", "", ""];
  }
  if (!slots.value.length) {
    slots.value = ["", ""];
  }
}

function addHeader() {
  headers.value.push("");
}

function removeHeader(index) {
  headers.value.splice(index, 1);
  ensureMinimum();
}

function addSlot() {
  slots.value.push("");
}

function removeSlot(index) {
  slots.value.splice(index, 1);
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
    const result = await saveSimpleDesigner(formId.value, {
      headers: normalize(headers.value),
      required_headers: [],
      slots: normalize(slots.value),
    });
    design.value = result?.data || null;
    headers.value = [...(design.value?.headers || [])];
    slots.value = [...(design.value?.slots || [])];
    ensureMinimum();
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
  <AppLayout
    title="表单设计"
    :subtitle="form ? `${form.display_title || form.title} · ${getFormStatusLabel(form.status)}` : '兼容 simple-designer 接口的可用设计页。'"
    :current-user="currentUser"
    @logout="handleLogout"
  >
    <ErrorAlert :message="errorMessage" />
    <LoadingBlock v-if="loading" label="正在加载表单设计..." />

    <div v-else-if="form && design" class="page-grid two-columns">
      <section class="panel">
        <div class="panel-header">
          <div>
            <h2>设计编辑</h2>
            <p class="muted-text">本页优先兼容后端现有的 `simple-designer` 设计接口。</p>
          </div>
          <div class="action-row">
            <RouterLink class="ghost-button link-button" :to="`/forms/${form.id}/fill`">预览填写页</RouterLink>
            <button class="primary-button" type="button" :disabled="saving" @click="handleSave">
              {{ saving ? "保存中..." : "保存设计" }}
            </button>
            <button class="ghost-button" type="button" :disabled="publishing" @click="handlePublish">
              {{ publishing ? "发布中..." : "发布表单" }}
            </button>
          </div>
        </div>

        <div class="editor-columns">
          <div class="panel inset-panel">
            <div class="panel-header compact">
              <h3>表头 / 字段</h3>
              <button class="ghost-button" type="button" @click="addHeader">新增表头</button>
            </div>
            <div class="stack-form">
              <div v-for="(header, index) in headers" :key="`header-${index}`" class="inline-form">
                <input v-model="headers[index]" type="text" :placeholder="`字段 ${index + 1}`" />
                <button class="danger-button" type="button" @click="removeHeader(index)">删除</button>
              </div>
            </div>
          </div>

          <div class="panel inset-panel">
            <div class="panel-header compact">
              <h3>空位 / 时间段</h3>
              <button class="ghost-button" type="button" @click="addSlot">新增空位</button>
            </div>
            <div class="stack-form">
              <div v-for="(slot, index) in slots" :key="`slot-${index}`" class="inline-form">
                <input v-model="slots[index]" type="text" :placeholder="`时间段 ${index + 1}`" />
                <button class="danger-button" type="button" @click="removeSlot(index)">删除</button>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section class="panel">
        <div class="panel-header">
          <div>
            <h2>当前后端返回的设计详情</h2>
            <p class="muted-text">这里展示 `field_details` 与 `slot_details`，方便核对接口结果。</p>
          </div>
        </div>

        <div class="stack-sections">
          <section>
            <div class="section-head">
              <h3>表单元信息</h3>
            </div>
            <div class="summary-grid">
              <div class="summary-card">
                <span class="meta-label">名称</span>
                <strong>{{ form.display_title || form.title }}</strong>
              </div>
              <div class="summary-card">
                <span class="meta-label">状态</span>
                <strong>{{ getFormStatusLabel(form.status) }}</strong>
              </div>
              <div class="summary-card">
                <span class="meta-label">日期</span>
                <strong>{{ formatDateOnly(form.start_time) }}</strong>
              </div>
            </div>
          </section>

          <section>
            <div class="section-head">
              <h3>字段详情</h3>
            </div>
            <div class="table-wrap">
              <table class="data-table">
                <thead>
                  <tr>
                    <th>名称</th>
                    <th>Key</th>
                    <th>类型</th>
                    <th>必填</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="field in design.field_details || []" :key="field.id">
                    <td>{{ field.field_label }}</td>
                    <td>{{ field.field_key }}</td>
                    <td>{{ field.field_type }}</td>
                    <td>{{ field.is_required ? "是" : "否" }}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </section>

          <section>
            <div class="section-head">
              <h3>空位详情</h3>
            </div>
            <div class="table-wrap">
              <table class="data-table">
                <thead>
                  <tr>
                    <th>标题</th>
                    <th>排序</th>
                    <th>启用</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="slot in design.slot_details || []" :key="slot.id">
                    <td>{{ slot.title }}</td>
                    <td>{{ slot.sort_order }}</td>
                    <td>{{ slot.is_active ? "是" : "否" }}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </section>
        </div>
      </section>
    </div>
  </AppLayout>
</template>
