<script setup>
import { computed } from "vue";
import { useRoute, useRouter } from "vue-router";

const props = defineProps({
  title: {
    type: String,
    default: "Dashboard",
  },
  subtitle: {
    type: String,
    default: "",
  },
  currentUser: {
    type: Object,
    default: null,
  },
});

const emit = defineEmits(["logout"]);
const route = useRoute();
const router = useRouter();

const navItems = computed(() => [
  { label: "Dashboard", to: "/dashboard" },
  { label: "表单管理", to: "/forms" },
  { label: "历史表单", to: "/history" },
  { label: "账号管理", to: "/users" },
  { label: "团队管理", to: "/teams" },
  { label: "文档中心", to: "/documents" },
]);

function goHome() {
  router.push("/dashboard");
}
</script>

<template>
  <div class="app-layout">
    <aside class="sidebar">
      <button class="brand-button" type="button" @click="goHome">
        <span class="brand-mark">DF</span>
        <span>
          <strong class="brand-title">Dynamic Form</strong>
          <span class="brand-subtitle">Vue Frontend</span>
        </span>
      </button>

      <nav class="sidebar-nav">
        <RouterLink
          v-for="item in navItems"
          :key="item.to"
          class="nav-link"
          :class="{ active: route.path === item.to || route.path.startsWith(`${item.to}/`) }"
          :to="item.to"
        >
          {{ item.label }}
        </RouterLink>
      </nav>
    </aside>

    <div class="layout-main">
      <header class="topbar">
        <div>
          <h1 class="topbar-title">{{ title }}</h1>
          <p v-if="subtitle" class="topbar-subtitle">{{ subtitle }}</p>
        </div>

        <div class="topbar-actions">
          <slot name="header-actions" />
          <div v-if="currentUser" class="user-chip">
            <span class="user-name">{{ currentUser.real_name }}</span>
            <span class="user-role">{{ currentUser.role }}</span>
          </div>
          <button class="ghost-button" type="button" @click="emit('logout')">退出登录</button>
        </div>
      </header>

      <main class="page-shell">
        <slot />
      </main>
    </div>
  </div>
</template>
