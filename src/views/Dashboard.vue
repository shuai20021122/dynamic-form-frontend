<script setup>
import { onMounted, ref } from "vue";
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

onMounted(loadCurrentUser);
</script>

<template>
  <AppLayout
    title="Dashboard"
    subtitle="Vue 前端迁移壳页已经接通认证、导航和基础会话恢复。"
    :current-user="currentUser"
    @logout="handleLogout"
  >
    <ErrorAlert :message="errorMessage" />
    <LoadingBlock v-if="loading" label="正在获取当前用户..." />

    <section v-else-if="currentUser" class="page-grid two-columns">
      <article class="panel">
        <div class="panel-header">
          <div>
            <h2>当前登录用户</h2>
            <p class="muted-text">这个区域通过 `GET /api/auth/me` 获取会话信息。</p>
          </div>
        </div>

        <div class="summary-grid">
          <div class="summary-card">
            <span class="meta-label">用户名</span>
            <strong>{{ currentUser.username }}</strong>
          </div>
          <div class="summary-card">
            <span class="meta-label">姓名</span>
            <strong>{{ currentUser.real_name }}</strong>
          </div>
          <div class="summary-card">
            <span class="meta-label">角色</span>
            <strong>{{ getRoleLabel(currentUser.role) }}</strong>
          </div>
          <div class="summary-card">
            <span class="meta-label">团队 ID</span>
            <strong>{{ currentUser.team_id ?? "-" }}</strong>
          </div>
        </div>
      </article>

      <article class="panel">
        <div class="panel-header">
          <div>
            <h2>迁移进度</h2>
            <p class="muted-text">当前阶段已将主要业务页迁入 Vue 前端，但仍保留 Flask 模板页兼容访问。</p>
          </div>
        </div>

        <ul class="simple-list">
          <li>认证：登录、当前用户、退出登录</li>
          <li>基础页面：Dashboard、用户、团队、表单、设计、填写、历史、文档、双语编辑</li>
          <li>仍保留旧 Flask 页面，不删除 `templates/` 与 `static/`</li>
        </ul>
      </article>
    </section>

    <EmptyState v-else title="当前没有可展示的用户信息" />
  </AppLayout>
</template>
