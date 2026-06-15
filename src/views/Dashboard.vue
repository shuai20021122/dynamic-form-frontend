<script setup>
import { onMounted, ref } from "vue";
import { useRouter } from "vue-router";

import AppLayout from "../components/AppLayout.vue";
import { fetchCurrentUser, logout } from "../api/auth.js";

const router = useRouter();
const currentUser = ref(null);
const loading = ref(true);
const errorMessage = ref("");

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

onMounted(() => {
  loadCurrentUser();
});
</script>

<template>
  <AppLayout :current-user="currentUser" @logout="handleLogout">
    <section class="dashboard-card">
      <p class="eyebrow">Dashboard</p>
      <h2>最小可运行前端已接通</h2>

      <p v-if="loading" class="muted-text">正在获取当前登录用户...</p>
      <p v-else-if="errorMessage" class="error-text">{{ errorMessage }}</p>

      <div v-else-if="currentUser" class="user-panel">
        <div class="user-grid">
          <div>
            <span class="meta-label">用户名</span>
            <strong>{{ currentUser.username }}</strong>
          </div>
          <div>
            <span class="meta-label">姓名</span>
            <strong>{{ currentUser.real_name }}</strong>
          </div>
          <div>
            <span class="meta-label">角色</span>
            <strong>{{ currentUser.role }}</strong>
          </div>
          <div>
            <span class="meta-label">团队 ID</span>
            <strong>{{ currentUser.team_id ?? "-" }}</strong>
          </div>
        </div>
      </div>

      <div class="info-block">
        <p>当前阶段只迁移了认证和 Dashboard 空壳页。</p>
        <p>后续页面会逐步从 Flask templates 迁移到独立 Vue 前端。</p>
      </div>
    </section>
  </AppLayout>
</template>
