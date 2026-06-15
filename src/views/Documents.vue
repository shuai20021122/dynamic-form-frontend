<script setup>
import { computed, onMounted, ref } from "vue";
import { useRoute, useRouter } from "vue-router";

import AppLayout from "../components/AppLayout.vue";
import DocumentManager from "../components/DocumentManager.vue";
import EmptyState from "../components/EmptyState.vue";
import { fetchCurrentUser, logout } from "../api/auth.js";

const route = useRoute();
const router = useRouter();

const currentUser = ref(null);
const loading = ref(true);
const entryId = computed(() => route.query.entryId || "");

async function loadPage() {
  loading.value = true;
  try {
    currentUser.value = await fetchCurrentUser(true);
  } finally {
    loading.value = false;
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
    title="文档中心"
    subtitle="当前后端没有“全局文档列表”接口，这里先按 entryId 查询对应记录的文档。"
    :current-user="currentUser"
    @logout="handleLogout"
  >
    <section class="panel">
      <div class="panel-header">
        <div>
          <h2>按报名记录查看文档</h2>
          <p class="muted-text">请通过 `?entryId=123` 打开，或从填写页进入。</p>
        </div>
      </div>

      <EmptyState
        v-if="!entryId"
        title="当前没有 entryId"
        description="示例：/documents?entryId=1。填写页里的“文档”入口会自动带上 entryId。"
      />
      <DocumentManager v-else :entry-id="entryId" :can-upload="true" :can-delete="true" />
    </section>
  </AppLayout>
</template>
