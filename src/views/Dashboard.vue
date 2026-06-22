<script setup>
import { computed, onMounted, ref } from "vue";
import { useRouter } from "vue-router";

import quickAccountBadgeIcon from "../assets/ui-icons/quick_account_badge_blue.svg";
import cardChevronRightIcon from "../assets/ui-icons/card_chevron_right_gray.svg";
import quickFormBadgeIcon from "../assets/ui-icons/quick_form_badge_blue.svg";
import quickHistoryBadgeIcon from "../assets/ui-icons/quick_history_badge_blue.svg";
import quickTeamBadgeIcon from "../assets/ui-icons/quick_team_badge_blue.svg";
import EmptyState from "../components/EmptyState.vue";
import ErrorAlert from "../components/ErrorAlert.vue";
import LoadingBlock from "../components/LoadingBlock.vue";
import { fetchCurrentUser } from "../api/auth.js";
import { getRoleLabel } from "../utils/format.js";

const router = useRouter();
const currentUser = ref(null);
const loading = ref(true);
const errorMessage = ref("");

const quickLinks = computed(() => [
  {
    title: "表单管理",
    description: "创建、发布、关闭或者查看表单。",
    href: "/forms",
    icon: quickFormBadgeIcon,
    visible: true,
  },
  {
    title: "历史表单",
    description: "查看历史记录和导出数据。",
    href: "/history",
    icon: quickHistoryBadgeIcon,
    visible: true,
  },
  {
    title: "账号管理",
    description: "管理系统账号。",
    href: "/users",
    icon: quickAccountBadgeIcon,
    visible: currentUser.value?.role === "super_admin",
  },
  {
    title: "团队管理",
    description: "维护团队队伍信息。",
    href: "/teams",
    icon: quickTeamBadgeIcon,
    visible: currentUser.value?.role === "super_admin",
  },
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

function jumpTo(path) {
  router.push(path);
}

onMounted(loadCurrentUser);
</script>

<template>
  <ErrorAlert :message="errorMessage" />
  <LoadingBlock v-if="loading" label="加载中..." />

  <template v-else-if="currentUser">
    <section class="dashboard-hero panel">
      <div class="panel-body dashboard-hero-body">
        <div class="dashboard-hero-copy">
          <h2 class="dashboard-hero-title">欢迎回来</h2>
          <p class="lead-text dashboard-hero-text">
            {{ currentUser.real_name || currentUser.username }}，当前你作为{{ getRoleLabel(currentUser.role) }}，<br />
            你可以从下面的快捷入口继续工作。
          </p>
        </div>
      </div>
    </section>

    <section class="dashboard-shortcuts">
      <div class="dashboard-shortcuts-header">
        <h2>快捷入口</h2>
      </div>

      <div class="dashboard-shortcut-grid">
        <button
          v-for="item in quickLinks.filter((item) => item.visible)"
          :key="item.href"
          class="dashboard-shortcut-card"
          type="button"
          @click="jumpTo(item.href)"
        >
          <span class="dashboard-shortcut-icon-wrap" aria-hidden="true">
            <img class="dashboard-shortcut-icon" :src="item.icon" :alt="item.title" />
          </span>

          <span class="dashboard-shortcut-copy">
            <span class="dashboard-shortcut-title">{{ item.title }}</span>
            <span class="dashboard-shortcut-text">{{ item.description }}</span>
          </span>

          <span class="dashboard-shortcut-arrow" aria-hidden="true">
            <img :src="cardChevronRightIcon" alt="" />
          </span>
        </button>
      </div>
    </section>
  </template>

  <EmptyState v-else title="暂无数据" />
</template>
