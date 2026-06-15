<script setup>
import { computed, onMounted, ref } from "vue";
import { useRoute, useRouter } from "vue-router";

import AppLayout from "../components/AppLayout.vue";
import EmptyState from "../components/EmptyState.vue";
import ErrorAlert from "../components/ErrorAlert.vue";
import LoadingBlock from "../components/LoadingBlock.vue";
import { fetchCurrentUser, logout } from "../api/auth.js";
import { getBilingualEditor, saveBilingualEditor } from "../api/documents.js";

const route = useRoute();
const router = useRouter();
const documentId = computed(() => route.params.id);

const currentUser = ref(null);
const loading = ref(true);
const saving = ref(false);
const errorMessage = ref("");
const documentInfo = ref(null);
const editor = ref(null);

async function loadPage() {
  loading.value = true;
  errorMessage.value = "";
  try {
    const [me, result] = await Promise.all([fetchCurrentUser(true), getBilingualEditor(documentId.value)]);
    currentUser.value = me;
    documentInfo.value = result?.data?.document || null;
    editor.value = result?.data?.editor || null;
  } catch (error) {
    errorMessage.value = error.message || "加载失败";
  } finally {
    loading.value = false;
  }
}

async function handleSave() {
  if (!editor.value) return;
  saving.value = true;
  errorMessage.value = "";
  try {
    const result = await saveBilingualEditor(documentId.value, editor.value);
    documentInfo.value = result?.data?.document || documentInfo.value;
    editor.value = result?.data?.editor || editor.value;
  } catch (error) {
    errorMessage.value = error.message || "保存失败";
  } finally {
    saving.value = false;
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
  <AppLayout title="编辑双语简表" :current-user="currentUser" @logout="handleLogout">
    <ErrorAlert :message="errorMessage" />
    <LoadingBlock v-if="loading" label="加载中..." />
    <EmptyState v-else-if="!editor" title="暂无数据" />

    <div v-else class="page-grid single-column">
      <section class="panel">
        <div class="panel-header">
          <h2>{{ documentInfo?.original_filename || "编辑双语简表" }}</h2>
          <button class="btn btn-primary" type="button" :disabled="saving" @click="handleSave">
            {{ saving ? "保存中..." : "保存" }}
          </button>
        </div>
        <div class="panel-body stack-form">
          <div v-for="item in editor.short_fields || []" :key="item.key" class="bilingual-row">
            <div class="bilingual-head"><strong>{{ item.label }}</strong></div>
            <div class="bilingual-columns">
              <label class="field-block"><span>中文</span><input :value="item.zh_text" readonly /></label>
              <label class="field-block"><span>English</span><input v-model="item.en_text" /></label>
            </div>
          </div>
        </div>
      </section>
    </div>
  </AppLayout>
</template>
