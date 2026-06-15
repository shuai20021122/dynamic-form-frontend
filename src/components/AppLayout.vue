<script setup>
import { computed, ref } from "vue";
import { useRoute, useRouter } from "vue-router";

const props = defineProps({
  title: {
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
const sidebarCollapsed = ref(false);

const navItems = computed(() => {
  const role = props.currentUser?.role;
  const items = [];
  if (["super_admin", "academic_admin"].includes(role)) {
    items.push({ label: "工作台", to: "/dashboard" });
  }
  if (role === "super_admin") {
    items.push({ label: "账号管理", to: "/users" });
    items.push({ label: "团队管理", to: "/teams" });
  }
  items.push({ label: "表单管理", to: "/forms" });
  items.push({ label: "历史表单", to: "/history" });
  return items;
});

function toggleSidebar() {
  sidebarCollapsed.value = !sidebarCollapsed.value;
}

function goHome() {
  router.push("/dashboard");
}
</script>

<template>
  <div class="app-shell" :class="{ 'sidebar-collapsed': sidebarCollapsed }">
    <aside class="sidebar" id="app-sidebar">
      <div class="brand">
        <button class="brand-button" type="button" @click="goHome">
          <div class="brand-mark">DF</div>
          <div class="brand-copy">
            <div class="brand-title">动态表单协同</div>
            <div class="brand-subtitle">管理后台</div>
          </div>
        </button>
      </div>

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

    <button
      class="sidebar-toggle"
      id="sidebar-toggle"
      type="button"
      aria-controls="app-sidebar"
      :aria-expanded="sidebarCollapsed ? 'false' : 'true'"
      :aria-label="sidebarCollapsed ? '展开侧边栏' : '收起侧边栏'"
      @click="toggleSidebar"
    >
      <span class="sidebar-toggle-icon" aria-hidden="true">{{ sidebarCollapsed ? "›" : "‹" }}</span>
    </button>

    <div class="main-shell">
      <header class="topbar">
        <div class="page-heading">
          <h1 class="page-title">{{ title }}</h1>
        </div>

        <div class="topbar-actions">
          <div v-if="currentUser" class="user-chip">
            <span class="user-chip-name">{{ currentUser.real_name || currentUser.username }}</span>
            <span class="user-chip-role">{{ currentUser.role }}</span>
          </div>
          <button class="btn btn-secondary" type="button">修改密码</button>
          <button class="btn btn-secondary" type="button" @click="emit('logout')">退出登录</button>
        </div>
      </header>

      <main class="page-content">
        <slot />
      </main>
    </div>
  </div>
</template>
