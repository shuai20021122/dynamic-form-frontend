<script setup>
import { onMounted, ref } from "vue";
import { useRouter } from "vue-router";

import AppLayout from "../components/AppLayout.vue";
import EmptyState from "../components/EmptyState.vue";
import ErrorAlert from "../components/ErrorAlert.vue";
import LoadingBlock from "../components/LoadingBlock.vue";
import { fetchCurrentUser, logout } from "../api/auth.js";
import { createTeam, listTeams, updateTeam } from "../api/teams.js";
import { formatDateTime } from "../utils/format.js";

const router = useRouter();
const currentUser = ref(null);
const teams = ref([]);
const loading = ref(true);
const saving = ref(false);
const errorMessage = ref("");
const formState = ref({
  id: "",
  name: "",
});

const editing = ref(false);

function resetForm() {
  editing.value = false;
  formState.value = {
    id: "",
    name: "",
  };
}

function startEdit(team) {
  editing.value = true;
  formState.value = {
    id: team.id,
    name: team.name,
  };
}

async function loadPage() {
  loading.value = true;
  errorMessage.value = "";
  try {
    const [me, teamsResult] = await Promise.all([fetchCurrentUser(true), listTeams()]);
    currentUser.value = me;
    teams.value = teamsResult?.data?.items || [];
  } catch (error) {
    errorMessage.value = error.message || "加载团队失败";
  } finally {
    loading.value = false;
  }
}

async function handleSubmit() {
  saving.value = true;
  errorMessage.value = "";
  try {
    if (editing.value) {
      await updateTeam(formState.value.id, { name: formState.value.name.trim() });
    } else {
      await createTeam({ name: formState.value.name.trim() });
    }
    resetForm();
    await loadPage();
  } catch (error) {
    errorMessage.value = error.message || "保存团队失败";
  } finally {
    saving.value = false;
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
  <AppLayout title="团队管理" subtitle="对接 `/api/teams`。" :current-user="currentUser" @logout="handleLogout">
    <ErrorAlert :message="errorMessage" />
    <LoadingBlock v-if="loading" label="正在加载团队..." />

    <div v-else class="page-grid with-side-panel">
      <section class="panel">
        <div class="panel-header">
          <div>
            <h2>团队列表</h2>
            <p class="muted-text">当前后端已提供团队列表、新增与编辑接口。</p>
          </div>
          <button class="ghost-button" type="button" @click="loadPage">刷新</button>
        </div>

        <EmptyState v-if="!teams.length" title="暂无团队" />
        <div v-else class="table-wrap">
          <table class="data-table">
            <thead>
              <tr>
                <th>团队名称</th>
                <th>创建时间</th>
                <th>更新时间</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="team in teams" :key="team.id">
                <td>{{ team.name }}</td>
                <td>{{ formatDateTime(team.created_at) }}</td>
                <td>{{ formatDateTime(team.updated_at) }}</td>
                <td>
                  <button class="ghost-button" type="button" @click="startEdit(team)">编辑</button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <section class="panel side-panel">
        <div class="panel-header">
          <div>
            <h2>{{ editing ? "编辑团队" : "新增团队" }}</h2>
          </div>
        </div>

        <form class="stack-form" @submit.prevent="handleSubmit">
          <label class="field-block">
            <span>团队名称</span>
            <input v-model="formState.name" type="text" required />
          </label>
          <div class="action-row">
            <button class="primary-button" type="submit" :disabled="saving">
              {{ saving ? "保存中..." : editing ? "保存修改" : "创建团队" }}
            </button>
            <button class="ghost-button" type="button" @click="resetForm">重置</button>
          </div>
        </form>
      </section>
    </div>
  </AppLayout>
</template>
