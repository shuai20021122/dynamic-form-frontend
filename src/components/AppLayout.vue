<script setup>
defineProps({
  currentUser: {
    type: Object,
    default: null,
  },
});

const emit = defineEmits(["logout"]);
</script>

<template>
  <div class="app-layout">
    <aside class="sidebar">
      <div class="brand">
        <div class="brand-mark">DF</div>
        <div>
          <div class="brand-title">Dynamic Form</div>
          <div class="brand-subtitle">Frontend Shell</div>
        </div>
      </div>

      <nav class="sidebar-nav">
        <RouterLink class="nav-link" to="/dashboard">Dashboard</RouterLink>
      </nav>
    </aside>

    <div class="layout-main">
      <header class="topbar">
        <div>
          <h1 class="topbar-title">Dashboard</h1>
          <p class="topbar-subtitle">Second-phase Vue shell</p>
        </div>

        <div class="topbar-actions">
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
