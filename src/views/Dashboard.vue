<script setup>
import { computed, onMounted, ref } from "vue";
import { useRouter } from "vue-router";

import AppLayout from "../components/AppLayout.vue";
import EmptyState from "../components/EmptyState.vue";
import ErrorAlert from "../components/ErrorAlert.vue";
import LoadingBlock from "../components/LoadingBlock.vue";
import { fetchCurrentUser, logout } from "../api/auth.js";
import { getRoleLabel } from "../utils/format.js";

const router = useRouter();
const currentUser = ref(null);
const loading = ref(true);
const errorMessage = ref("");

const quickLinks = computed(() => [
  { title: "表单管理", description: "创建、发布、关闭或查看表单。", href: "/forms", visible: true },
  { title: "历史表单", description: "查看历史记录和导出数据。", href: "/history", visible: true },
  { title: "账号管理", description: "管理系统账号。", href: "/users", visible: currentUser.value?.role === "super_admin" },
  { title: "团队管理", description: "维护团队信息。", href: "/teams", visible: currentUser.value?.role === "super_admin" },
]);

async function loadCurrentUser() {
  loading.value = true;
  errorMessage.value = "";
  try {
    currentUser.value = await fetchCurrentUser(true);
  } catch (error) {
    errorMessage.value = error.message || "获取当前用户失败";
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

function jumpTo(path) {
  router.push(path);
}

onMounted(loadCurrentUser);
</script>

<template>
  <AppLayout title="工作台" :current-user="currentUser" @logout="handleLogout">
    <ErrorAlert :message="errorMessage" />
    <LoadingBlock v-if="loading" label="加载中..." />

    <template v-else-if="currentUser">
      <section class="dashboard-hero panel">
        <div class="panel-body dashboard-hero-body">
          <div class="dashboard-hero-copy">
            <div class="dashboard-hero-eyebrow">Workspace</div>
            <h2 class="dashboard-hero-title">欢迎回来</h2>
            <p class="lead-text dashboard-hero-text">{{ currentUser.real_name }}，当前角色为 {{ getRoleLabel(currentUser.role) }}。你可以从下面的快捷入口继续工作。</p>
          </div>
        </div>
      </section>

      <section class="panel">
        <div class="panel-header">
          <h2>快捷入口</h2>
        </div>
        <div class="panel-body">
          <div class="card-grid">
            <button
              v-for="item in quickLinks.filter((item) => item.visible)"
              :key="item.href"
              class="shortcut-card"
              type="button"
              @click="jumpTo(item.href)"
            >
              <h3>{{ item.title }}</h3>
              <p>{{ item.description }}</p>
              <span class="btn btn-secondary">进入</span>
            </button>
          </div>
        </div>
      </section>
    </template>

    <EmptyState v-else title="暂无数据" />
  </AppLayout>
</template>
