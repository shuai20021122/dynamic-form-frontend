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
    errorMessage.value = error.message || "加载双语编辑器失败";
  } finally {
    loading.value = false;
  }
}

async function handleSave() {
  if (!editor.value) {
    return;
  }
  saving.value = true;
  errorMessage.value = "";
  try {
    const result = await saveBilingualEditor(documentId.value, editor.value);
    documentInfo.value = result?.data?.document || documentInfo.value;
    editor.value = result?.data?.editor || editor.value;
  } catch (error) {
    errorMessage.value = error.message || "保存双语编辑器失败";
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
  <AppLayout
    title="双语简表编辑"
    :subtitle="documentInfo ? documentInfo.original_filename : '编辑英文内容并保存，由后端继续负责生成 DOCX。'"
    :current-user="currentUser"
    @logout="handleLogout"
  >
    <ErrorAlert :message="errorMessage" />
    <LoadingBlock v-if="loading" label="正在加载双语编辑器..." />
    <EmptyState v-else-if="!editor" title="当前没有可编辑的双语内容" />

    <div v-else class="page-grid single-column">
      <section class="panel">
        <div class="panel-header">
          <div>
            <h2>短字段</h2>
            <p class="muted-text">中文只读，英文可编辑。保存后由后端更新双语 DOCX 文件。</p>
          </div>
          <button class="primary-button" type="button" :disabled="saving" @click="handleSave">
            {{ saving ? "保存中..." : "保存全部内容" }}
          </button>
        </div>

        <div class="stack-form">
          <div v-for="item in editor.short_fields || []" :key="item.key" class="bilingual-row">
            <div class="bilingual-head">
              <strong>{{ item.label }}</strong>
            </div>
            <div class="bilingual-columns">
              <div class="field-block">
                <span>中文</span>
                <input :value="item.zh_text" type="text" readonly />
              </div>
              <div class="field-block">
                <span>英文</span>
                <input v-model="item.en_text" type="text" />
              </div>
            </div>
          </div>
        </div>
      </section>

      <section class="panel">
        <div class="panel-header">
          <div>
            <h2>工作经历</h2>
          </div>
        </div>
        <div class="stack-form">
          <div v-for="item in editor.work_experiences || []" :key="`work-${item.index}`" class="bilingual-row">
            <div class="bilingual-head">
              <strong>工作经历 {{ item.index }}</strong>
              <span class="muted-text">{{ item.dates }}</span>
            </div>
            <div class="bilingual-columns">
              <div class="field-block">
                <span>公司中文</span>
                <input :value="item.organization_zh" readonly />
              </div>
              <div class="field-block">
                <span>公司英文</span>
                <input v-model="item.organization_en" />
              </div>
              <div class="field-block">
                <span>职务中文</span>
                <input :value="item.position_zh" readonly />
              </div>
              <div class="field-block">
                <span>职务英文</span>
                <input v-model="item.position_en" />
              </div>
            </div>
          </div>
        </div>
      </section>

      <section class="panel">
        <div class="panel-header">
          <div>
            <h2>教育经历</h2>
          </div>
        </div>
        <div class="stack-form">
          <div v-for="item in editor.education_experiences || []" :key="`edu-${item.index}`" class="bilingual-row">
            <div class="bilingual-head">
              <strong>教育经历 {{ item.index }}</strong>
              <span class="muted-text">{{ item.dates }}</span>
            </div>
            <div class="bilingual-columns">
              <div class="field-block">
                <span>院校中文</span>
                <input :value="item.institution_zh" readonly />
              </div>
              <div class="field-block">
                <span>院校英文</span>
                <input v-model="item.institution_en" />
              </div>
              <div class="field-block">
                <span>课程中文</span>
                <input :value="item.course_zh" readonly />
              </div>
              <div class="field-block">
                <span>课程英文</span>
                <input v-model="item.course_en" />
              </div>
              <div class="field-block">
                <span>学位中文</span>
                <input :value="item.degree_zh" readonly />
              </div>
              <div class="field-block">
                <span>学位英文</span>
                <input v-model="item.degree_en" />
              </div>
            </div>
          </div>
        </div>
      </section>

      <section class="panel">
        <div class="panel-header">
          <div>
            <h2>长文本内容</h2>
          </div>
        </div>
        <div class="stack-form">
          <div v-for="item in editor.long_fields || []" :key="item.key" class="bilingual-row">
            <div class="bilingual-head">
              <strong>{{ item.label }}</strong>
            </div>
            <div class="bilingual-columns">
              <div class="field-block">
                <span>中文</span>
                <textarea :value="item.zh_text" rows="8" readonly />
              </div>
              <div class="field-block">
                <span>英文</span>
                <textarea v-model="item.en_text" rows="8" />
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  </AppLayout>
</template>
