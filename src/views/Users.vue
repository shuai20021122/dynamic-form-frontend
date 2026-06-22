<script setup>
import { computed, onBeforeUnmount, onMounted, reactive, ref } from "vue";

import accountSearchIcon from "../assets/ui-icons/account_search_gray.svg";
import plusWhiteIcon from "../assets/ui-icons/plus_white.svg";
import refreshGrayIcon from "../assets/ui-icons/refresh_gray.svg";
import EmptyState from "../components/EmptyState.vue";
import ErrorAlert from "../components/ErrorAlert.vue";
import LoadingBlock from "../components/LoadingBlock.vue";
import StatusBadge from "../components/StatusBadge.vue";
import UiSelect from "../components/UiSelect.vue";
import { fetchCurrentUser } from "../api/auth.js";
import { listTeams } from "../api/teams.js";
import { createUser, deleteUser, disableUser, listUsers, resetUserPassword, updateUser } from "../api/users.js";
import { getCachedResource, setCachedResource } from "../stores/resourceCache.js";
import { closeDialogWithAnimation, getDialogOriginFromEvent, openDialogWithAnimation, resetDialogMotion } from "../utils/dialogMotion.js";
import { getRoleLabel } from "../utils/format.js";

const currentUser = ref(null);
const users = ref([]);
const teams = ref([]);
const loading = ref(true);
const errorMessage = ref("");
const saving = ref(false);
const formVisible = ref(false);

const actionDialog = ref(null);
const actionSubmitting = ref(false);
const actionDialogTitle = ref("");
const actionDialogMessage = ref("");
const actionDialogConfirmText = ref("");
const actionDialogTone = ref("danger");
const actionTargetUser = ref(null);
const actionType = ref("");

const resetPasswordDialog = ref(null);
const resetPasswordSaving = ref(false);
const resetPasswordErrorMessage = ref("");
const resetPasswordTargetUser = ref(null);
const passwordRule = /^(?=.*[A-Za-z])(?=.*\d)(?=.*[^A-Za-z\d\s])\S{6,18}$/;
const resetPasswordForm = reactive({
  password: "",
});
const resetPasswordFieldErrors = reactive({
  password: "",
});

const filters = ref({
  keyword: "",
  role: "",
  teamId: "",
  status: "",
});

const formState = ref({
  id: "",
  username: "",
  password: "",
  real_name: "",
  role: "personal",
  team_id: "",
  is_active: true,
});

const usersCacheKey = "admin:users:index";

const roleOptions = [
  { label: "超级管理员", value: "super_admin" },
  { label: "教务账号", value: "academic_admin" },
  { label: "团队账号", value: "team_admin" },
  { label: "个人账号", value: "personal" },
  { label: "面试官", value: "interviewer" },
];

const filterRoleOptions = [{ label: "全部角色", value: "" }, ...roleOptions];
const filterStatusOptions = [
  { label: "全部状态", value: "" },
  { label: "启用", value: "active" },
  { label: "禁用", value: "inactive" },
];

const filteredUsers = computed(() => {
  const keyword = filters.value.keyword.trim().toLowerCase();

  return users.value.filter((user) => {
    const username = (user.username || "").toLowerCase();
    const realName = (user.real_name || "").toLowerCase();

    if (keyword && !username.includes(keyword) && !realName.includes(keyword)) {
      return false;
    }

    if (filters.value.role && user.role !== filters.value.role) {
      return false;
    }

    if (filters.value.teamId && String(user.team_id || "") !== filters.value.teamId) {
      return false;
    }

    if (filters.value.status === "active" && !user.is_active) {
      return false;
    }

    if (filters.value.status === "inactive" && user.is_active) {
      return false;
    }

    return true;
  });
});

const teamOptions = computed(() => teams.value.map((team) => ({ label: team.name, value: String(team.id) })));
const filterTeamOptions = computed(() => [{ label: "全部团队", value: "" }, ...teamOptions.value]);
const formTeamOptions = computed(() => [{ label: "不绑定团队", value: "" }, ...teamOptions.value]);
const requiresTeam = computed(() => formState.value.role === "personal" || formState.value.role === "team_admin");
const editing = computed(() => Boolean(formState.value.id));
const formTitle = computed(() => (editing.value ? `编辑账号：${formState.value.username}` : "新建账号"));
const submitLabel = computed(() => (editing.value ? "保存修改" : "创建账号"));

function resetForm() {
  formState.value = {
    id: "",
    username: "",
    password: "",
    real_name: "",
    role: "personal",
    team_id: "",
    is_active: true,
  };
}

function openCreateForm() {
  resetForm();
  formVisible.value = true;
}

function closeForm() {
  resetForm();
  formVisible.value = false;
}

function getTeamName(teamId) {
  return teams.value.find((item) => item.id === teamId)?.name || "-";
}

function startEdit(user) {
  formState.value = {
    id: user.id,
    username: user.username,
    password: "",
    real_name: user.real_name || "",
    role: user.role,
    team_id: user.team_id ? String(user.team_id) : "",
    is_active: !!user.is_active,
  };
  formVisible.value = true;
}

function resetFilters() {
  filters.value = {
    keyword: "",
    role: "",
    teamId: "",
    status: "",
  };
}

async function loadPage() {
  const cached = getCachedResource(usersCacheKey);
  if (cached) {
    currentUser.value = cached.currentUser || currentUser.value;
    users.value = cached.users || [];
    teams.value = cached.teams || [];
    loading.value = false;
  } else {
    loading.value = true;
  }

  errorMessage.value = "";

  try {
    const [me, usersResult, teamsResult] = await Promise.all([fetchCurrentUser(), listUsers(), listTeams()]);
    currentUser.value = me;
    users.value = usersResult?.data?.items || [];
    teams.value = teamsResult?.data?.items || [];
    setCachedResource(usersCacheKey, {
      currentUser: me,
      users: users.value,
      teams: teams.value,
    });
  } catch (error) {
    errorMessage.value = error.message || "加载账号管理页面失败";
  } finally {
    loading.value = false;
  }
}

async function handleSubmit() {
  saving.value = true;
  errorMessage.value = "";

  try {
    const payload = {
      real_name: formState.value.real_name.trim(),
      role: formState.value.role,
      team_id: formState.value.team_id ? Number(formState.value.team_id) : null,
      is_active: formState.value.is_active,
    };

    if (requiresTeam.value && !payload.team_id) {
      throw new Error("团队账号和个人账号必须选择团队");
    }

    if (editing.value) {
      if (formState.value.password.trim()) {
        payload.password = formState.value.password.trim();
      }
      await updateUser(formState.value.id, payload);
    } else {
      payload.username = formState.value.username.trim();
      payload.password = formState.value.password.trim();
      await createUser(payload);
    }

    closeForm();
    await loadPage();
  } catch (error) {
    errorMessage.value = error.message || "保存账号失败";
  } finally {
    saving.value = false;
  }
}

function openActionDialog(user, type, event) {
  actionTargetUser.value = user;
  actionType.value = type;
  actionSubmitting.value = false;

  if (type === "disable") {
    actionDialogTitle.value = "确认禁用";
    actionDialogMessage.value = `确认禁用账号 ${user.username} 吗？`;
    actionDialogConfirmText.value = "确认禁用";
    actionDialogTone.value = "danger";
  } else {
    actionDialogTitle.value = "确认删除";
    actionDialogMessage.value = `确认删除账号 ${user.username} 吗？删除后不可恢复。`;
    actionDialogConfirmText.value = "确认删除";
    actionDialogTone.value = "danger";
  }

  openDialogWithAnimation(actionDialog, {
    originPoint: getDialogOriginFromEvent(event, {
      x: window.innerWidth * 0.72,
      y: window.innerHeight * 0.3,
    }),
  });
}

function handleDisable(user, event) {
  openActionDialog(user, "disable", event);
}

function handleDelete(user, event) {
  openActionDialog(user, "delete", event);
}

async function handleEnable(user) {
  try {
    await updateUser(user.id, {
      real_name: user.real_name,
      role: user.role,
      team_id: user.team_id,
      is_active: true,
    });
    await loadPage();
  } catch (error) {
    errorMessage.value = error.message || "启用失败";
  }
}

function closeActionDialog() {
  closeDialogWithAnimation(actionDialog);
}

function resetActionDialog() {
  resetDialogMotion(actionDialog);
  actionSubmitting.value = false;
  actionDialogTitle.value = "";
  actionDialogMessage.value = "";
  actionDialogConfirmText.value = "";
  actionDialogTone.value = "danger";
  actionTargetUser.value = null;
  actionType.value = "";
}

async function submitActionDialog() {
  if (!actionTargetUser.value || !actionType.value) {
    return;
  }

  actionSubmitting.value = true;

  try {
    if (actionType.value === "disable") {
      await disableUser(actionTargetUser.value.id);
    }

    if (actionType.value === "delete") {
      await deleteUser(actionTargetUser.value.id);
    }

    closeDialogWithAnimation(actionDialog, {
      afterClose: () => {
        loadPage();
      },
    });
  } catch (error) {
    errorMessage.value = error.message || (actionType.value === "disable" ? "禁用失败" : "删除失败");
  } finally {
    actionSubmitting.value = false;
  }
}

function handleResetPassword(user, event) {
  resetPasswordTargetUser.value = user;
  resetPasswordSaving.value = false;
  resetPasswordErrorMessage.value = "";
  resetPasswordForm.password = "";
  resetPasswordFieldErrors.password = "";
  openDialogWithAnimation(resetPasswordDialog, {
    originPoint: getDialogOriginFromEvent(event, {
      x: window.innerWidth * 0.72,
      y: window.innerHeight * 0.28,
    }),
  });
}

function closeResetPasswordDialog() {
  closeDialogWithAnimation(resetPasswordDialog);
}

function resetResetPasswordDialog() {
  resetDialogMotion(resetPasswordDialog);
  resetPasswordSaving.value = false;
  resetPasswordErrorMessage.value = "";
  resetPasswordTargetUser.value = null;
  resetPasswordForm.password = "";
  resetPasswordFieldErrors.password = "";
}

function validateResetPassword() {
  if (!resetPasswordForm.password) {
    resetPasswordFieldErrors.password = "请输入新密码";
    return false;
  }

  if (!passwordRule.test(resetPasswordForm.password)) {
    resetPasswordFieldErrors.password = "密码需为 6-18 位，且包含字母、数字和符号";
    return false;
  }

  resetPasswordFieldErrors.password = "";
  return true;
}

function handleResetPasswordInput() {
  resetPasswordErrorMessage.value = "";
  resetPasswordFieldErrors.password = "";
}

async function submitResetPassword() {
  resetPasswordErrorMessage.value = "";

  if (!resetPasswordTargetUser.value) {
    return;
  }

  if (!validateResetPassword()) {
    return;
  }

  resetPasswordSaving.value = true;

  try {
    await resetUserPassword(resetPasswordTargetUser.value.id, resetPasswordForm.password);
    closeDialogWithAnimation(resetPasswordDialog, {
      afterClose: () => {
        loadPage();
      },
    });
  } catch (error) {
    resetPasswordErrorMessage.value = error.message || "重置密码失败";
  } finally {
    resetPasswordSaving.value = false;
  }
}

onMounted(async () => {
  formVisible.value = false;
  await loadPage();
});

onBeforeUnmount(() => {
  resetDialogMotion(actionDialog);
  resetDialogMotion(resetPasswordDialog);
});
</script>

<template>
  <ErrorAlert :message="errorMessage" />
  <LoadingBlock v-if="loading" label="正在加载用户与团队..." />

  <section v-else class="users-page">
    <aside class="users-side-card">
      <div class="users-side-head">
        <h2 class="users-side-title">{{ formTitle }}</h2>
      </div>

      <button class="btn btn-primary users-create-button" type="button" @click="openCreateForm">
        <img :src="plusWhiteIcon" alt="" aria-hidden="true" />
        <span>{{ editing ? "切换为新建账号" : "新建账号" }}</span>
      </button>

      <div v-if="formVisible" class="users-form-wrap">
        <form class="stack-form users-form" @submit.prevent="handleSubmit">
          <label class="field-block">
            <span>用户名</span>
            <input v-model="formState.username" :disabled="editing" type="text" required />
          </label>

          <label class="field-block">
            <span>密码</span>
            <input v-model="formState.password" type="password" :required="!editing" />
          </label>

          <label class="field-block">
            <span>姓名</span>
            <input v-model="formState.real_name" type="text" required />
          </label>

          <label class="field-block">
            <span>角色</span>
            <UiSelect v-model="formState.role" :options="roleOptions" />
          </label>

          <label class="field-block">
            <span>团队</span>
            <UiSelect v-model="formState.team_id" :options="formTeamOptions" />
          </label>

          <p class="muted-text users-form-hint">
            {{ requiresTeam ? "团队账号和个人账号必须选择团队。" : "超级管理员和教务账号可以不绑定团队。" }}
          </p>

          <label class="checkbox-line users-form-check">
            <input v-model="formState.is_active" type="checkbox" />
            <span>启用账号</span>
          </label>

          <div class="form-actions users-form-actions">
            <button class="btn btn-primary" type="submit" :disabled="saving">
              {{ saving ? "提交中..." : submitLabel }}
            </button>
            <button class="btn btn-secondary" type="button" @click="closeForm">取消</button>
          </div>
        </form>
      </div>
    </aside>

    <section class="users-main-card">
      <div class="users-main-head">
        <div>
          <h2 class="users-main-title">账号列表</h2>
        </div>
        <button class="btn btn-secondary users-refresh-button" type="button" @click="loadPage">
          <img :src="refreshGrayIcon" alt="" aria-hidden="true" />
          <span>刷新</span>
        </button>
      </div>

      <div class="users-filter-grid">
        <label class="field-block users-filter-field users-filter-field--search">
          <span>搜索</span>
          <div class="users-search-box">
            <img :src="accountSearchIcon" alt="" aria-hidden="true" />
            <input v-model="filters.keyword" type="text" placeholder="搜索用户名 / 姓名" />
          </div>
        </label>

        <label class="field-block users-filter-field">
          <span>角色</span>
          <UiSelect v-model="filters.role" :options="filterRoleOptions" />
        </label>

        <label class="field-block users-filter-field">
          <span>团队</span>
          <UiSelect v-model="filters.teamId" :options="filterTeamOptions" />
        </label>

        <label class="field-block users-filter-field">
          <span>状态</span>
          <UiSelect v-model="filters.status" :options="filterStatusOptions" />
        </label>

        <div class="users-filter-reset">
          <button class="btn btn-secondary users-reset-button" type="button" @click="resetFilters">重置筛选</button>
        </div>
      </div>

      <EmptyState v-if="!filteredUsers.length" title="暂无数据" />

      <div v-else class="users-table-shell">
        <div class="table-wrap users-table-wrap">
          <table class="data-table users-table">
            <thead>
              <tr>
                <th>用户名</th>
                <th>姓名</th>
                <th>角色</th>
                <th>团队</th>
                <th>状态</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="user in filteredUsers" :key="user.id">
                <td class="users-table-username">{{ user.username }}</td>
                <td>{{ user.real_name }}</td>
                <td>{{ getRoleLabel(user.role) }}</td>
                <td>{{ getTeamName(user.team_id) }}</td>
                <td>
                  <StatusBadge :text="user.is_active ? '启用' : '禁用'" :tone="user.is_active ? 'success' : 'danger'" />
                </td>
                <td>
                  <div class="users-table-actions">
                    <button class="users-action-btn users-action-btn--blue" type="button" @click="startEdit(user)">编辑</button>
                    <button class="users-action-btn users-action-btn--blue" type="button" @click="handleResetPassword(user, $event)">重置密码</button>
                    <button
                      v-if="user.is_active"
                      class="users-action-btn users-action-btn--orange"
                      type="button"
                      @click="handleDisable(user, $event)"
                    >
                      禁用
                    </button>
                    <button
                      v-else
                      class="users-action-btn users-action-btn--green"
                      type="button"
                      @click="handleEnable(user)"
                    >
                      启用
                    </button>
                    <button class="users-action-btn users-action-btn--red" type="button" @click="handleDelete(user, $event)">删除</button>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </section>
  </section>

  <dialog ref="actionDialog" class="modal-dialog topbar-confirm-dialog" @close="resetActionDialog">
    <div class="modal-shell topbar-confirm-dialog-shell">
      <div class="modal-surface topbar-confirm-dialog-surface">
        <div class="panel-header modal-header topbar-confirm-dialog-header">
          <h3>{{ actionDialogTitle }}</h3>
        </div>
        <div class="panel-body stack-form modal-body topbar-confirm-dialog-body">
          <p class="topbar-confirm-copy">{{ actionDialogMessage }}</p>
          <div class="form-actions topbar-confirm-actions">
            <button class="btn" :class="actionDialogTone === 'danger' ? 'btn-danger' : 'btn-primary'" type="button" :disabled="actionSubmitting" @click="submitActionDialog">
              {{ actionSubmitting ? "处理中..." : actionDialogConfirmText }}
            </button>
            <button class="btn btn-secondary" type="button" :disabled="actionSubmitting" @click="closeActionDialog">取消</button>
          </div>
        </div>
      </div>
    </div>
  </dialog>

  <dialog ref="resetPasswordDialog" class="modal-dialog topbar-password-dialog" @close="resetResetPasswordDialog">
    <div class="modal-shell topbar-password-dialog-shell">
      <div class="modal-surface topbar-password-dialog-surface">
        <div class="panel-header modal-header topbar-password-dialog-header">
          <h3>重置密码</h3>
        </div>
        <form class="panel-body stack-form modal-body topbar-password-dialog-body" @submit.prevent="submitResetPassword">
          <ErrorAlert :message="resetPasswordErrorMessage" />

          <p class="topbar-confirm-copy">请为账号 {{ resetPasswordTargetUser?.username || "-" }} 设置新的登录密码。</p>

          <label class="field-block">
            <span>新密码</span>
            <input
              v-model="resetPasswordForm.password"
              type="password"
              autocomplete="new-password"
              placeholder="请输入新密码"
              @input="handleResetPasswordInput"
            />
            <span v-if="resetPasswordFieldErrors.password" class="topbar-password-field-error">
              {{ resetPasswordFieldErrors.password }}
            </span>
          </label>

          <div class="form-actions topbar-password-actions">
            <button class="btn btn-primary" type="submit" :disabled="resetPasswordSaving">
              {{ resetPasswordSaving ? "提交中..." : "确认重置" }}
            </button>
            <button class="btn btn-secondary" type="button" :disabled="resetPasswordSaving" @click="closeResetPasswordDialog">
              取消
            </button>
          </div>
        </form>
      </div>
    </div>
  </dialog>
</template>
