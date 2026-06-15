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

    resetForm();
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

async function handleResetPassword(user) {
  const password = window.prompt(`请输入账号 ${user.username} 的新密码`, "");
  if (!password) {
    return;
  }
  try {
    await resetUserPassword(user.id, password);
    window.alert("密码已重置。");
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

async function handleLogout() {
  try {
    await logout();
  } finally {
    await router.push("/login");
  }
}

onMounted(loadPage);
</script>

<template>
  <AppLayout title="用户管理" subtitle="对接 `/api/users` 与 `/api/teams`。" :current-user="currentUser" @logout="handleLogout">
    <ErrorAlert :message="errorMessage" />
    <LoadingBlock v-if="loading" label="正在加载用户与团队..." />

    <div v-else class="page-grid with-side-panel">
      <section class="panel">
        <div class="panel-header">
          <div>
            <h2>用户列表</h2>
            <p class="muted-text">支持列表、新增、编辑、停用、启用、重置密码与删除。</p>
          </div>
          <button class="ghost-button" type="button" @click="loadPage">刷新</button>
        </div>

        <div class="filter-grid">
          <input v-model="filters.keyword" class="table-filter" type="text" placeholder="搜索用户名或姓名" />
          <select v-model="filters.role" class="table-filter">
            <option value="">全部角色</option>
            <option value="super_admin">超级管理员</option>
            <option value="academic_admin">教务账号</option>
            <option value="team_admin">团队账号</option>
            <option value="personal">个人账号</option>
            <option value="interviewer">面试官</option>
          </select>
          <select v-model="filters.teamId" class="table-filter">
            <option value="">全部团队</option>
            <option v-for="team in teams" :key="team.id" :value="String(team.id)">{{ team.name }}</option>
          </select>
          <select v-model="filters.status" class="table-filter">
            <option value="">全部状态</option>
            <option value="active">启用</option>
            <option value="inactive">停用</option>
          </select>
        </div>

        <EmptyState v-if="!filteredUsers.length" title="暂无符合条件的用户" />
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
                  <StatusBadge :text="user.is_active ? '启用' : '停用'" :tone="user.is_active ? 'success' : 'danger'" />
                </td>
                <td>
                  <div class="action-row">
                    <button class="ghost-button" type="button" @click="startEdit(user)">编辑</button>
                    <button class="ghost-button" type="button" @click="handleResetPassword(user)">重置密码</button>
                    <button
                      v-if="user.is_active"
                      class="danger-button"
                      type="button"
                      @click="handleDisable(user)"
                    >
                      停用
                    </button>
                    <button
                      v-else
                      class="primary-button"
                      type="button"
                      @click="handleEnable(user)"
                    >
                      启用
                    </button>
                    <button class="danger-button" type="button" @click="handleDelete(user)">删除</button>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <section class="panel side-panel">
        <div class="panel-header">
          <div>
            <h2>{{ editing ? "编辑用户" : "新增用户" }}</h2>
            <p class="muted-text">当前后端没有单独的启用接口，启用动作通过 `PUT /api/users/:id` 完成。</p>
          </div>
        </div>

        <form class="stack-form" @submit.prevent="handleSubmit">
          <label class="field-block">
            <span>用户名</span>
            <input v-model="formState.username" :disabled="editing" type="text" required />
          </label>
          <label class="field-block">
            <span>{{ editing ? "新密码（可选）" : "初始密码" }}</span>
            <input v-model="formState.password" type="password" :required="!editing" />
          </label>
          <label class="field-block">
            <span>姓名</span>
            <input v-model="formState.real_name" type="text" required />
          </label>
          <label class="field-block">
            <span>角色</span>
            <select v-model="formState.role">
              <option value="super_admin">超级管理员</option>
              <option value="academic_admin">教务账号</option>
              <option value="team_admin">团队账号</option>
              <option value="personal">个人账号</option>
              <option value="interviewer">面试官</option>
            </select>
          </label>
          <label class="field-block">
            <span>团队</span>
            <select v-model="formState.team_id" :required="requiresTeam">
              <option value="">不绑定团队</option>
              <option v-for="team in teams" :key="team.id" :value="team.id">{{ team.name }}</option>
            </select>
          </label>
          <label class="checkbox-field">
            <input v-model="formState.is_active" type="checkbox" />
            <span>启用状态</span>
          </label>
          <div class="action-row">
            <button class="primary-button" type="submit" :disabled="saving">
              {{ saving ? "保存中..." : editing ? "保存修改" : "创建用户" }}
            </button>
            <button class="ghost-button" type="button" @click="resetForm">重置</button>
          </div>
        </form>
      </section>
    </div>
  </AppLayout>
</template>
