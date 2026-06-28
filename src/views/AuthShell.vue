<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import { RouterView, useRoute, useRouter } from "vue-router";

import AppLayout from "../components/AppLayout.vue";
import { clearCachedCurrentUser, fetchCurrentUser, logout } from "../api/auth.js";
import { resetAuthExpiredNotice } from "../api/request.js";
import { getRouteTitle, t } from "../stores/uiLanguage.js";
import { closeDialogWithAnimation, openDialogWithAnimation, resetDialogMotion } from "../utils/dialogMotion.js";

const route = useRoute();
const router = useRouter();
const currentUser = ref(null);
const sessionExpiredDialog = ref(null);
const sessionExpiredMessage = ref("身份信息已过期，请重新登录。");
const sessionExpiredOpen = ref(false);
const currentOperatorPromptPrefix = "forms:current-operator-prompt:";

const pageTitle = computed(() => getRouteTitle(route.name));

function clearCurrentOperatorPromptSession() {
  if (typeof window === "undefined") {
    return;
  }

  const keysToRemove = [];
  for (let index = 0; index < window.sessionStorage.length; index += 1) {
    const key = window.sessionStorage.key(index);
    if (key && key.startsWith(currentOperatorPromptPrefix)) {
      keysToRemove.push(key);
    }
  }

  keysToRemove.forEach((key) => {
    window.sessionStorage.removeItem(key);
  });
}

async function loadCurrentUser() {
  try {
    currentUser.value = await fetchCurrentUser();
  } catch (error) {
    clearCachedCurrentUser();
    currentUser.value = null;
    if (route.path !== "/login") {
      await router.replace({
        path: "/login",
        query: { error: "server" },
      });
    }
  }
}

async function handleLogout() {
  try {
    await logout();
  } finally {
    clearCurrentOperatorPromptSession();
    currentUser.value = null;
    await router.push("/login");
  }
}

function handleAuthExpired(event) {
  clearCachedCurrentUser();
  clearCurrentOperatorPromptSession();
  currentUser.value = null;
  sessionExpiredMessage.value = event?.detail?.message || t("layout.sessionExpiredBody");

  if (route.path === "/login") {
    resetAuthExpiredNotice();
    return;
  }

  if (sessionExpiredOpen.value) {
    return;
  }

  sessionExpiredOpen.value = true;
  openDialogWithAnimation(sessionExpiredDialog, {
    originPoint: {
      x: window.innerWidth / 2,
      y: window.innerHeight * 0.22,
    },
  });
}

function handleCurrentUserUpdated(event) {
  if (!event?.detail?.user) {
    return;
  }

  currentUser.value = {
    ...(currentUser.value || {}),
    ...event.detail.user,
  };
}

async function acknowledgeSessionExpired() {
  sessionExpiredOpen.value = false;
  closeDialogWithAnimation(sessionExpiredDialog, {
    afterClose: async () => {
      resetAuthExpiredNotice();
      await router.replace("/login");
    },
  });
}

onMounted(loadCurrentUser);

onMounted(() => {
  window.addEventListener("app:auth-expired", handleAuthExpired);
  window.addEventListener("app:current-user-updated", handleCurrentUserUpdated);
});

onBeforeUnmount(() => {
  resetDialogMotion(sessionExpiredDialog);
  window.removeEventListener("app:auth-expired", handleAuthExpired);
  window.removeEventListener("app:current-user-updated", handleCurrentUserUpdated);
});
</script>

<template>
  <AppLayout :title="pageTitle" :current-user="currentUser" @logout="handleLogout">
    <RouterView />
  </AppLayout>

  <dialog ref="sessionExpiredDialog" class="modal-dialog auth-expired-dialog">
    <div class="modal-shell auth-expired-dialog-shell">
      <div class="modal-surface auth-expired-dialog-surface">
        <div class="panel-header modal-header auth-expired-dialog-header">
          <h3>{{ t("layout.sessionExpiredTitle") }}</h3>
        </div>
        <div class="panel-body stack-form modal-body auth-expired-dialog-body">
          <p class="auth-expired-copy">{{ sessionExpiredMessage }}</p>
          <div class="form-actions auth-expired-actions">
            <button class="btn btn-primary" type="button" @click="acknowledgeSessionExpired">{{ t("common.relogin") }}</button>
          </div>
        </div>
      </div>
    </div>
  </dialog>
</template>
