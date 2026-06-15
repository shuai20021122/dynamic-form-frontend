<script setup>
import { computed, onMounted, ref } from "vue";
import { useRouter } from "vue-router";

import AppLayout from "../components/AppLayout.vue";
import EmptyState from "../components/EmptyState.vue";
import ErrorAlert from "../components/ErrorAlert.vue";
import LoadingBlock from "../components/LoadingBlock.vue";
import StatusBadge from "../components/StatusBadge.vue";
import { fetchCurrentUser, logout } from "../api/auth.js";
import { listTeams } from "../api/teams.js";
import { createUser, deleteUser, disableUser, listUsers, resetUserPassword, updateUser } from "../api/users.js";
import { getRoleLabel } from "../utils/format.js";

const router = useRouter();
const currentUser = ref(null);
const users = ref([]);
const teams = ref([]);
const loading = ref(true);
const errorMessage = ref("");
const saving = ref(false);
const formVisible = ref(false);
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
    team_id: user.team_id || "",
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
  loading.value = true;
  errorMessage.value = "";
  try {
    const [me, usersResult, teamsResult] = await Promise.all([fetchCurrentUser(true), listUsers(), listTeams()]);
    currentUser.value = me;
    users.value = usersResult?.data?.items || [];
    teams.value = teamsResult?.data?.items || [];
  } catch (error) {
    errorMessage.value = error.message || "加载用户管理页面失败";
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
    errorMessage.value = error.message || "保存用户失败";
  } finally {
    saving.value = false;
  }
}

async function handleDisable(user) {
  if (!window.confirm(`确认停用账号 ${user.username} 吗？`)) {
    return;
  }
  try {
    await disableUser(user.id);
    await loadPage();
  } catch (error) {
    errorMessage.value = error.message || "停用失败";
  }
}

async function handleResetPassword(user) {
  const password = window.prompt(`请输入账号 ${user.username} 的新密码`, "");
  if (!password) {
    return;
  }
  try {
    await resetUserPassword(user.id, password);
    window.alert("密码已重置。");
    await loadPage();
  } catch (error) {
    errorMessage.value = error.message || "重置密码失败";
  }
}

async function handleDelete(user) {
  if (!window.confirm(`确认删除账号 ${user.username} 吗？删除后不可恢复。`)) {
    return;
  }
  try {
    await deleteUser(user.id);
    await loadPage();
  } catch (error) {
    errorMessage.value = error.message || "删除失败";
  }
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

async function handleLogout() {
  try {
    await logout();
  } finally {
    await router.push("/login");
  }
}

onMounted(async () => {
  formVisible.value = false;
  await loadPage();
});
</script>

<template>
  <AppLayout title="账号管理" :current-user="currentUser" @logout="handleLogout">
    <ErrorAlert :message="errorMessage" />
    <LoadingBlock v-if="loading" label="正在加载用户与团队..." />

    <section v-else class="page-grid two-column">
      <section class="panel">
        <div class="panel-header">
          <h2 id="user-form-title">{{ formTitle }}</h2>
          <button v-if="!formVisible" class="btn btn-primary" type="button" @click="openCreateForm">新建账号</button>
        </div>
        <div class="panel-body" :class="{ hidden: !formVisible }">
          <form class="stack-form" @submit.prevent="handleSubmit">
            <label class="field-block">
              <span>用户名</span>
              <input v-model="formState.username" :disabled="editing" type="text" required />
            </label>
            <label class="field-block">
              <span>密码</span>
              <input v-model="formState.password" type="password" :required="!editing" />
            </label>
            <label class="field-block">
              <span>真实姓名</span>
              <input v-model="formState.real_name" type="text" required />
            </label>
            <label class="field-block">
              <span>角色</span>
              <select v-model="formState.role" required>
                <option value="super_admin">超级管理员</option>
                <option value="academic_admin">教务账号</option>
                <option value="team_admin">团队账号</option>
                <option value="personal">个人账号</option>
                <option value="interviewer">面试官</option>
              </select>
            </label>
            <label class="field-block">
              <span>所属团队</span>
              <select v-model="formState.team_id">
                <option value="">不绑定团队</option>
                <option v-for="team in teams" :key="team.id" :value="team.id">{{ team.name }}</option>
              </select>
            </label>
            <p class="muted-text">{{ requiresTeam ? "当前角色必须选择团队。" : "超级管理员和教务账号可以不绑定团队。" }}</p>
            <label class="checkbox-line">
              <input v-model="formState.is_active" type="checkbox" />
              <span>启用账号</span>
            </label>
            <div class="form-actions">
              <button class="btn btn-primary" type="submit" :disabled="saving">
                {{ saving ? "提交中..." : submitLabel }}
              </button>
              <button class="btn btn-secondary" type="button" @click="closeForm">取消</button>
            </div>
          </form>
        </div>
      </section>

      <section class="panel">
        <div class="panel-header">
          <h2>账号列表</h2>
          <button class="btn btn-secondary" type="button" @click="loadPage">刷新</button>
        </div>
        <div class="panel-body">
          <div class="filter-toolbar">
            <label class="field-block filter-field">
              <span>搜索</span>
              <input v-model="filters.keyword" type="text" placeholder="搜索用户名 / 姓名" />
            </label>
            <label class="field-block filter-field">
              <span>角色</span>
              <select v-model="filters.role">
                <option value="">全部角色</option>
                <option value="super_admin">超级管理员</option>
                <option value="academic_admin">教务账号</option>
                <option value="team_admin">团队账号</option>
                <option value="personal">个人账号</option>
              </select>
            </label>
            <label class="field-block filter-field">
              <span>团队</span>
              <select v-model="filters.teamId">
                <option value="">全部团队</option>
                <option v-for="team in teams" :key="team.id" :value="String(team.id)">{{ team.name }}</option>
              </select>
            </label>
            <label class="field-block filter-field">
              <span>状态</span>
              <select v-model="filters.status">
                <option value="">全部状态</option>
                <option value="active">启用</option>
                <option value="inactive">禁用</option>
              </select>
            </label>
            <div class="filter-actions">
              <button class="btn btn-secondary" type="button" @click="resetFilters">重置筛选</button>
            </div>
          </div>

          <EmptyState v-if="!filteredUsers.length" title="暂无数据" />
          <div v-else class="table-wrap">
            <table class="data-table">
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
                  <td>{{ user.username }}</td>
                  <td>{{ user.real_name }}</td>
                  <td>{{ getRoleLabel(user.role) }}</td>
                  <td>{{ getTeamName(user.team_id) }}</td>
                  <td>
                    <StatusBadge :text="user.is_active ? '启用' : '禁用'" :tone="user.is_active ? 'success' : 'danger'" />
                  </td>
                  <td>
                    <div class="form-actions">
                      <button class="btn btn-secondary" type="button" @click="startEdit(user)">编辑</button>
                      <button class="btn btn-secondary" type="button" @click="handleResetPassword(user)">重置密码</button>
                      <button v-if="user.is_active" class="btn btn-danger" type="button" @click="handleDisable(user)">禁用</button>
                      <button v-else class="btn btn-primary" type="button" @click="handleEnable(user)">启用</button>
                      <button class="btn btn-danger" type="button" @click="handleDelete(user)">删除</button>
                    </div>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </section>
  </AppLayout>
</template>
