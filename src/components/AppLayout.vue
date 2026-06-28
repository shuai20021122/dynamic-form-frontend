<script setup>
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";

import logoBadgeIcon from "../assets/ui-icons/00_logo_DF_blue_badge.svg";
import collapseButtonIcon from "../assets/ui-icons/01_sidebar_collapse_button.svg";
import activeAccountIcon from "../assets/ui-icons/sidebar_active_account_user_white.svg";
import activeFormIcon from "../assets/ui-icons/sidebar_active_form_document_white.svg";
import activeHistoryIcon from "../assets/ui-icons/sidebar_active_history_clock_white.svg";
import activeTeamIcon from "../assets/ui-icons/sidebar_active_team_group_white.svg";
import inactiveAccountIcon from "../assets/ui-icons/sidebar_inactive_account_user_light.svg";
import inactiveFormIcon from "../assets/ui-icons/sidebar_inactive_form_document_light.svg";
import inactiveHistoryIcon from "../assets/ui-icons/sidebar_inactive_history_clock_light.svg";
import inactiveTeamIcon from "../assets/ui-icons/sidebar_inactive_team_group_light.svg";
import { changePassword } from "../api/auth.js";
import { fetchCurrentInterviewerAccess, fetchTodayInterviewAccessCodes, verifyInterviewerAccess } from "../api/interviewerAccess.js";
import { closeDialogWithAnimation, getDialogOriginFromEvent, openDialogWithAnimation, resetDialogMotion } from "../utils/dialogMotion.js";
import CodeFlowBackdrop from "./CodeFlowBackdrop.vue";
import ErrorAlert from "./ErrorAlert.vue";
import { currentUiLanguage, getUiLanguageLabel, t, toggleUiLanguage } from "../stores/uiLanguage.js";

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
const accountMenuOpen = ref(false);
const accountMenuRef = ref(null);
const logoutDialog = ref(null);
const passwordDialog = ref(null);
const interviewerAccessDialog = ref(null);
const passwordSubmitting = ref(false);
const passwordErrorMessage = ref("");
const skipPasswordBlurValidation = ref(false);
const academicAccessId = ref("");
const showAccessId = ref(false);
const interviewerAccessLoading = ref(false);
const interviewerAccessSubmitting = ref(false);
const interviewerAccessCode = ref("");
const interviewerAccessError = ref("");
const passwordRule = /^(?=.*[A-Za-z])(?=.*\d)(?=.*[^A-Za-z\d\s])\S{6,18}$/;
const passwordForm = reactive({
  oldPassword: "",
  newPassword: "",
  confirmPassword: "",
});
const passwordFieldErrors = reactive({
  oldPassword: "",
  newPassword: "",
  confirmPassword: "",
});

const navItems = computed(() => {
  const role = props.currentUser?.role;
  const items = [];

  if (role === "super_admin") {
    items.push({
      key: "users",
      label: t("route.users"),
      to: "/users",
      activeIcon: activeAccountIcon,
      inactiveIcon: inactiveAccountIcon,
    });
    items.push({
      key: "teams",
      label: t("route.teams"),
      to: "/teams",
      activeIcon: activeTeamIcon,
      inactiveIcon: inactiveTeamIcon,
    });
  }

  items.push({
    key: "forms",
    label: t("route.forms"),
    to: "/forms",
    activeIcon: activeFormIcon,
    inactiveIcon: inactiveFormIcon,
  });
  if (role !== "interviewer") {
    items.push({
      key: "history",
      label: t("route.history"),
      to: "/history",
      activeIcon: activeHistoryIcon,
      inactiveIcon: inactiveHistoryIcon,
    });
  }

  return items;
});

function isNavItemActive(path) {
  return route.path === path || route.path.startsWith(`${path}/`);
}

const activeNavIndex = computed(() => navItems.value.findIndex((item) => isNavItemActive(item.to)));
const activeNavIndicatorStyle = computed(() => {
  if (activeNavIndex.value < 0) {
    return {
      opacity: 0,
      transform: "translateY(0px)",
    };
  }

  return {
    opacity: 1,
    transform: `translateY(calc(${activeNavIndex.value} * (var(--sidebar-nav-item-height) + var(--sidebar-nav-gap))))`,
  };
});

const showFormsBackButton = computed(() => ["form-fill", "form-designer"].includes(String(route.name || "")));
const showLanguageSwitch = computed(() => props.currentUser?.role === "interviewer");
const languageButtonLabel = computed(() => getUiLanguageLabel(currentUiLanguage.value));
const showAcademicAccessId = computed(() => props.currentUser?.role === "academic_admin" && !!academicAccessId.value);
const displayedAcademicAccessId = computed(() => {
  if (!showAcademicAccessId.value) {
    return "";
  }

  return showAccessId.value ? academicAccessId.value : "*".repeat(String(academicAccessId.value).length);
});

async function loadAcademicAccessId() {
  if (props.currentUser?.role !== "academic_admin") {
    academicAccessId.value = "";
    return;
  }

  try {
    const result = await fetchTodayInterviewAccessCodes();
    const items = Array.isArray(result?.data?.items) ? result.data.items : [];
    academicAccessId.value = items[0]?.access_id || "";
  } catch (error) {
    academicAccessId.value = "";
  }
}

function resetInterviewerAccessDialog() {
  interviewerAccessCode.value = "";
  interviewerAccessError.value = "";
  interviewerAccessSubmitting.value = false;
}

function toggleAccessIdVisibility() {
  showAccessId.value = !showAccessId.value;
}

function openInterviewerAccessGate() {
  openDialogWithAnimation(interviewerAccessDialog, {
    originPoint: {
      x: window.innerWidth / 2,
      y: window.innerHeight * 0.22,
    },
  });
}

function closeInterviewerAccessGate() {
  closeDialogWithAnimation(interviewerAccessDialog);
}

async function ensureInterviewerAccess() {
  if (props.currentUser?.role !== "interviewer") {
    resetInterviewerAccessDialog();
    closeInterviewerAccessGate();
    return;
  }

  interviewerAccessLoading.value = true;
  interviewerAccessError.value = "";

  try {
    const result = await fetchCurrentInterviewerAccess();
    if (result?.data?.authorized) {
      resetInterviewerAccessDialog();
      closeInterviewerAccessGate();
      return;
    }

    openInterviewerAccessGate();
  } catch (error) {
    interviewerAccessError.value = error.message || "无法获取当前进入状态，请稍后重试。";
    openInterviewerAccessGate();
  } finally {
    interviewerAccessLoading.value = false;
  }
}

function handleInterviewerAccessInput(event) {
  interviewerAccessCode.value = String(event.target.value || "").trim().toUpperCase();
  interviewerAccessError.value = "";
}

async function submitInterviewerAccess() {
  interviewerAccessError.value = "";

  if (!interviewerAccessCode.value.trim()) {
    interviewerAccessError.value = "请输入教务ID。";
    return;
  }

  interviewerAccessSubmitting.value = true;

  try {
    const result = await verifyInterviewerAccess(interviewerAccessCode.value);
    if (!result?.data?.authorized) {
      interviewerAccessError.value = "教务ID错误，请重新输入。";
      return;
    }

    resetInterviewerAccessDialog();
    closeInterviewerAccessGate();
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("app:interviewer-access-granted"));
    }
  } catch (error) {
    interviewerAccessError.value = error.message || "教务ID错误或已失效，请重新输入。";
  } finally {
    interviewerAccessSubmitting.value = false;
  }
}

function cancelInterviewerAccess() {
  interviewerAccessCode.value = "";
  interviewerAccessError.value = "";
}

function returnToLoginFromInterviewerAccess() {
  closeInterviewerAccessGate();
  emit("logout");
}

function toggleSidebar() {
  sidebarCollapsed.value = !sidebarCollapsed.value;
}

function goHome() {
  if (props.currentUser?.role === "super_admin") {
    router.push("/users");
    return;
  }
  router.push("/forms");
}

function toggleAccountMenu() {
  accountMenuOpen.value = !accountMenuOpen.value;
}

function closeAccountMenu() {
  accountMenuOpen.value = false;
}

function handleLogoutClick(event) {
  closeAccountMenu();
  openDialogWithAnimation(logoutDialog, {
    originPoint: getDialogOriginFromEvent(event, {
      x: window.innerWidth * 0.76,
      y: 120,
    }),
  });
}

function handleChangePasswordClick(event) {
  closeAccountMenu();
  resetPasswordDialog();
  openDialogWithAnimation(passwordDialog, {
    originPoint: getDialogOriginFromEvent(event, {
      x: window.innerWidth * 0.72,
      y: 120,
    }),
  });
}

function closeLogoutDialog() {
  closeDialogWithAnimation(logoutDialog);
}

function confirmLogout() {
  closeDialogWithAnimation(logoutDialog, {
    afterClose: () => {
      emit("logout");
    },
  });
}

function resetPasswordDialog() {
  resetDialogMotion(passwordDialog);
  skipPasswordBlurValidation.value = false;
  passwordSubmitting.value = false;
  passwordErrorMessage.value = "";
  passwordForm.oldPassword = "";
  passwordForm.newPassword = "";
  passwordForm.confirmPassword = "";
  passwordFieldErrors.oldPassword = "";
  passwordFieldErrors.newPassword = "";
  passwordFieldErrors.confirmPassword = "";
}

function preparePasswordDialogClose() {
  skipPasswordBlurValidation.value = true;
}

function closePasswordDialog() {
  closeDialogWithAnimation(passwordDialog);
}

function validateOldPassword() {
  if (skipPasswordBlurValidation.value) {
    passwordFieldErrors.oldPassword = "";
    return true;
  }
  if (!passwordForm.oldPassword) {
    passwordFieldErrors.oldPassword = t("layout.passwordOldRequired");
    return false;
  }
  passwordFieldErrors.oldPassword = "";
  return true;
}

function validateNewPassword() {
  if (skipPasswordBlurValidation.value) {
    passwordFieldErrors.newPassword = "";
    return true;
  }
  if (!passwordForm.newPassword) {
    passwordFieldErrors.newPassword = t("layout.passwordNewRequired");
    return false;
  }
  if (!passwordRule.test(passwordForm.newPassword)) {
    passwordFieldErrors.newPassword = t("layout.passwordNewInvalid");
    return false;
  }
  passwordFieldErrors.newPassword = "";
  return true;
}

function validateConfirmPassword() {
  if (skipPasswordBlurValidation.value) {
    passwordFieldErrors.confirmPassword = "";
    return true;
  }
  if (!passwordForm.confirmPassword) {
    passwordFieldErrors.confirmPassword = t("layout.passwordConfirmRequired");
    return false;
  }
  if (passwordForm.confirmPassword !== passwordForm.newPassword) {
    passwordFieldErrors.confirmPassword = t("layout.passwordConfirmMismatch");
    return false;
  }
  passwordFieldErrors.confirmPassword = "";
  return true;
}

function validatePasswordForm() {
  const oldOk = validateOldPassword();
  const newOk = validateNewPassword();
  const confirmOk = validateConfirmPassword();
  return oldOk && newOk && confirmOk;
}

function handlePasswordFieldInput(field) {
  passwordErrorMessage.value = "";
  passwordFieldErrors[field] = "";
  if (field === "newPassword" && passwordFieldErrors.confirmPassword) {
    validateConfirmPassword();
  }
}

async function submitPasswordChange() {
  passwordErrorMessage.value = "";

  if (!validatePasswordForm()) {
    return;
  }

  passwordSubmitting.value = true;

  try {
    await changePassword({
      old_password: passwordForm.oldPassword,
      new_password: passwordForm.newPassword,
    });
    closeDialogWithAnimation(passwordDialog, {
      afterClose: () => {
        passwordErrorMessage.value = t("layout.passwordChangeSuccess");
        emit("logout");
      },
    });
  } catch (error) {
    passwordErrorMessage.value = error.message || t("layout.passwordNewInvalid");
  } finally {
    passwordSubmitting.value = false;
  }
}

function goBackToForms() {
  router.push("/forms");
}

function handlePointerDown(event) {
  if (!accountMenuRef.value?.contains(event.target)) {
    accountMenuOpen.value = false;
  }
}

onMounted(() => {
  window.addEventListener("pointerdown", handlePointerDown);
});

watch(
  () => props.currentUser,
  () => {
    loadAcademicAccessId();
    ensureInterviewerAccess();
  },
  { immediate: true }
);

onBeforeUnmount(() => {
  resetDialogMotion(passwordDialog);
  resetDialogMotion(logoutDialog);
  resetDialogMotion(interviewerAccessDialog);
  window.removeEventListener("pointerdown", handlePointerDown);
});
</script>

<template>
  <div class="app-shell" :class="{ 'sidebar-collapsed': sidebarCollapsed }">
    <aside class="sidebar" id="app-sidebar">
      <CodeFlowBackdrop variant="sidebar" />
      <div class="brand">
        <button class="brand-button" type="button" @click="goHome">
          <img class="brand-mark-image" :src="logoBadgeIcon" alt="DF" />
          <div class="brand-copy">
            <div class="brand-title">{{ t("layout.brandTitle") }}</div>
            <div class="brand-subtitle">{{ t("layout.brandSubtitle") }}</div>
          </div>
        </button>
      </div>

      <nav class="sidebar-nav">
        <span class="sidebar-nav-indicator" :style="activeNavIndicatorStyle" aria-hidden="true"></span>
        <RouterLink
          v-for="item in navItems"
          :key="item.key"
          class="nav-link"
          :class="{ active: isNavItemActive(item.to) }"
          :to="item.to"
        >
          <img class="nav-link-icon" :src="isNavItemActive(item.to) ? item.activeIcon : item.inactiveIcon" :alt="item.label" aria-hidden="true" />
          <span class="nav-link-label">{{ item.label }}</span>
        </RouterLink>
      </nav>
    </aside>

    <button
      class="sidebar-toggle"
      id="sidebar-toggle"
      type="button"
      aria-controls="app-sidebar"
      :aria-expanded="sidebarCollapsed ? 'false' : 'true'"
      :aria-label="sidebarCollapsed ? t('layout.expandSidebar') : t('layout.collapseSidebar')"
      @click="toggleSidebar"
    >
      <img class="sidebar-toggle-image" :class="{ 'is-collapsed': sidebarCollapsed }" :src="collapseButtonIcon" alt="" aria-hidden="true" />
    </button>

    <div class="main-shell">
      <header class="topbar">
        <div class="page-heading">
          <h1 class="page-title">{{ title }}</h1>
        </div>

        <div class="topbar-actions">
          <button v-if="showFormsBackButton" class="btn btn-secondary topbar-back-link" type="button" @click="goBackToForms">{{ t("common.backToForms") }}</button>
          <button v-if="showLanguageSwitch" class="btn btn-secondary topbar-language-toggle" type="button" @click="toggleUiLanguage">
            {{ languageButtonLabel }}
          </button>

          <div v-if="currentUser" ref="accountMenuRef" class="account-menu" :class="{ 'is-open': accountMenuOpen }">
            <button class="account-menu-trigger" type="button" :aria-expanded="accountMenuOpen ? 'true' : 'false'" aria-haspopup="menu" @click="toggleAccountMenu">
              <span class="account-menu-copy">
                <span class="account-menu-name">{{ currentUser.real_name || currentUser.username }}</span>
                <span class="account-menu-id">{{ currentUser.username }}</span>
                <span v-if="showAcademicAccessId" class="account-menu-academic-id">每日访问ID：{{ displayedAcademicAccessId }}</span>
              </span>
            </button>

            <div v-if="accountMenuOpen" class="account-menu-popover" role="menu">
              <button class="account-menu-item" type="button" role="menuitem" @click="handleChangePasswordClick">{{ t("common.changePassword") }}</button>
              <button class="account-menu-item account-menu-item--danger" type="button" role="menuitem" @click="handleLogoutClick">{{ t("common.logout") }}</button>
              <button
                v-if="showAcademicAccessId"
                class="account-menu-item account-menu-item--secondary"
                type="button"
                role="menuitem"
                @click="toggleAccessIdVisibility"
              >
                {{ showAccessId ? "隐藏ID" : "显示ID" }}
              </button>
            </div>
          </div>
        </div>
      </header>

      <main class="page-content">
        <slot />
      </main>
    </div>

    <dialog ref="logoutDialog" class="modal-dialog topbar-confirm-dialog">
      <div class="modal-shell topbar-confirm-dialog-shell">
        <div class="modal-surface topbar-confirm-dialog-surface">
          <div class="panel-header modal-header topbar-confirm-dialog-header">
            <h3>{{ t("layout.logoutConfirmTitle") }}</h3>
          </div>
          <div class="panel-body stack-form modal-body topbar-confirm-dialog-body">
            <p class="topbar-confirm-copy">{{ t("layout.logoutConfirmBody") }}</p>
            <div class="form-actions topbar-confirm-actions">
              <button class="btn btn-danger" type="button" @click="confirmLogout">{{ t("layout.logoutConfirmAction") }}</button>
              <button class="btn btn-secondary" type="button" @click="closeLogoutDialog">{{ t("common.cancel") }}</button>
            </div>
          </div>
        </div>
      </div>
    </dialog>

    <dialog ref="passwordDialog" class="modal-dialog topbar-password-dialog" @close="resetPasswordDialog">
      <div class="modal-shell topbar-password-dialog-shell">
        <div class="modal-surface topbar-password-dialog-surface">
          <div class="panel-header modal-header topbar-password-dialog-header">
            <h3>{{ t("layout.passwordDialogTitle") }}</h3>
          </div>
          <form class="panel-body stack-form modal-body topbar-password-dialog-body" @submit.prevent="submitPasswordChange">
            <ErrorAlert :message="passwordErrorMessage" />

            <label class="field-block">
              <span>{{ t("layout.passwordOld") }}</span>
              <input
                v-model="passwordForm.oldPassword"
                type="password"
                autocomplete="current-password"
                :placeholder="t('layout.passwordOldPlaceholder')"
                @input="handlePasswordFieldInput('oldPassword')"
                @blur="validateOldPassword"
              />
              <span v-if="passwordFieldErrors.oldPassword" class="topbar-password-field-error">{{ passwordFieldErrors.oldPassword }}</span>
            </label>

            <label class="field-block">
              <span>{{ t("layout.passwordNew") }}</span>
              <input
                v-model="passwordForm.newPassword"
                type="password"
                autocomplete="new-password"
                :placeholder="t('layout.passwordNewPlaceholder')"
                @input="handlePasswordFieldInput('newPassword')"
                @blur="validateNewPassword"
              />
              <span v-if="passwordFieldErrors.newPassword" class="topbar-password-field-error">{{ passwordFieldErrors.newPassword }}</span>
            </label>

            <label class="field-block">
              <span>{{ t("layout.passwordConfirm") }}</span>
              <input
                v-model="passwordForm.confirmPassword"
                type="password"
                autocomplete="new-password"
                :placeholder="t('layout.passwordConfirmPlaceholder')"
                @input="handlePasswordFieldInput('confirmPassword')"
                @blur="validateConfirmPassword"
              />
              <span v-if="passwordFieldErrors.confirmPassword" class="topbar-password-field-error">{{ passwordFieldErrors.confirmPassword }}</span>
            </label>

            <div class="form-actions topbar-password-actions">
              <button class="btn btn-primary" type="submit" :disabled="passwordSubmitting">
                {{ passwordSubmitting ? t("layout.passwordSubmitting") : t("layout.passwordSubmit") }}
              </button>
              <button
                class="btn btn-secondary"
                type="button"
                :disabled="passwordSubmitting"
                @mousedown="preparePasswordDialogClose"
                @click="closePasswordDialog"
              >
                {{ t("common.cancel") }}
              </button>
            </div>
          </form>
        </div>
      </div>
    </dialog>

    <dialog ref="interviewerAccessDialog" class="modal-dialog interviewer-access-dialog" @cancel.prevent>
      <div class="modal-shell interviewer-access-dialog-shell">
        <div class="modal-surface interviewer-access-dialog-surface">
          <div class="panel-header modal-header interviewer-access-dialog-header">
            <h3>请输入教务ID</h3>
          </div>
          <form class="panel-body stack-form modal-body interviewer-access-dialog-body" @submit.prevent="submitInterviewerAccess">
            <p class="interviewer-access-copy">面试官登录后需要先输入对应的教务ID，校验通过后才可以继续访问并进入对应的教务团队。</p>
            <ErrorAlert :message="interviewerAccessError" />

            <label class="field-block interviewer-access-field">
              <span>教务ID</span>
              <input
                :value="interviewerAccessCode"
                type="text"
                autocomplete="off"
                placeholder="请输入教务ID"
                :disabled="interviewerAccessLoading || interviewerAccessSubmitting"
                @input="handleInterviewerAccessInput"
              />
            </label>

            <div class="form-actions interviewer-access-actions">
              <button class="btn btn-primary" type="submit" :disabled="interviewerAccessLoading || interviewerAccessSubmitting">
                {{ interviewerAccessSubmitting ? "校验中..." : "确认进入" }}
              </button>
              <button class="btn btn-danger" type="button" :disabled="interviewerAccessSubmitting" @click="returnToLoginFromInterviewerAccess">
                返回登录页
              </button>
            </div>
          </form>
        </div>
      </div>
    </dialog>
  </div>
</template>
