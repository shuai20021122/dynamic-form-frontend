<script setup>
import { onMounted, ref } from "vue";

import plusWhiteIcon from "../assets/ui-icons/plus_white.svg";
import refreshGrayIcon from "../assets/ui-icons/refresh_gray.svg";
import EmptyState from "../components/EmptyState.vue";
import ErrorAlert from "../components/ErrorAlert.vue";
import LoadingBlock from "../components/LoadingBlock.vue";
import { fetchCurrentUser } from "../api/auth.js";
import { createTeam, listTeams, updateTeam } from "../api/teams.js";
import { getCachedResource, setCachedResource } from "../stores/resourceCache.js";
import { formatDateTime } from "../utils/format.js";

const currentUser = ref(null);
const teams = ref([]);
const loading = ref(true);
const saving = ref(false);
const errorMessage = ref("");
const formVisible = ref(false);
const teamTypePickerVisible = ref(false);
const formState = ref({
  id: "",
  name: "",
  teamType: "",
});
const teamsCacheKey = "admin:teams:index";

const editing = ref(false);
const teamTypeOptions = [
  { label: "教务团队", value: "academic_team" },
  { label: "销售团队", value: "sales_team" },
];

function getTeamTypeLabel(team) {
  const teamType = team?.team_type || team?.type || "";
  if (team?.team_type_label) {
    return team.team_type_label;
  }

  return (
    teamTypeOptions.find((item) => item.value === teamType)?.label ||
    {
      academic: "教务团队",
      academic_team: "教务团队",
      sales: "销售团队",
      sales_team: "销售团队",
      interviewer_team: "面试官团队",
    }[teamType] ||
    teamType ||
    "-"
  );
}

function resetForm() {
  editing.value = false;
  teamTypePickerVisible.value = false;
  formState.value = {
    id: "",
    name: "",
    teamType: "",
  };
}

function openCreateForm() {
  resetForm();
  teamTypePickerVisible.value = true;
  formVisible.value = false;
}

function selectTeamType(teamType) {
  formState.value.teamType = teamType;
  teamTypePickerVisible.value = false;
  formVisible.value = true;
}

function closeForm() {
  resetForm();
  formVisible.value = false;
}

function startEdit(team) {
  editing.value = true;
  teamTypePickerVisible.value = false;
  formVisible.value = true;
  formState.value = {
    id: team.id,
    name: team.name,
    teamType: team.team_type || team.type || "",
  };
}

async function loadPage() {
  const cached = getCachedResource(teamsCacheKey);
  if (cached) {
    currentUser.value = cached.currentUser || currentUser.value;
    teams.value = cached.teams || [];
    loading.value = false;
  } else {
    loading.value = true;
  }
  errorMessage.value = "";

  try {
    const [me, teamsResult] = await Promise.all([fetchCurrentUser(), listTeams()]);
    currentUser.value = me;
    teams.value = teamsResult?.data?.items || [];
    setCachedResource(teamsCacheKey, {
      currentUser: me,
      teams: teams.value,
    });
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
      await updateTeam(formState.value.id, {
        name: formState.value.name.trim(),
        team_type: formState.value.teamType,
      });
    } else {
      await createTeam({
        name: formState.value.name.trim(),
        team_type: formState.value.teamType,
      });
    }

    closeForm();
    await loadPage();
  } catch (error) {
    errorMessage.value = error.message || "保存团队失败";
  } finally {
    saving.value = false;
  }
}

onMounted(async () => {
  formVisible.value = false;
  await loadPage();
});
</script>

<template>
  <ErrorAlert :message="errorMessage" />
  <LoadingBlock v-if="loading" label="正在加载团队..." />

  <section v-else class="users-page teams-page">
    <aside class="users-side-card teams-side-card">
      <div class="users-side-head">
        <h2 class="users-side-title">{{ editing ? `编辑团队：${formState.name}` : "新建团队" }}</h2>
      </div>

      <button class="btn btn-primary users-create-button" type="button" @click="openCreateForm">
        <img :src="plusWhiteIcon" alt="" aria-hidden="true" />
        <span>{{ editing ? "切换为新建团队" : "新建团队" }}</span>
      </button>

      <div v-if="teamTypePickerVisible" class="teams-type-picker">
        <p class="teams-type-picker-title">请选择团队类型</p>
        <div class="teams-type-picker-options">
          <button
            v-for="option in teamTypeOptions"
            :key="option.value"
            class="teams-type-pill"
            type="button"
            @click="selectTeamType(option.value)"
          >
            {{ option.label }}
          </button>
        </div>
      </div>

      <div v-if="!formVisible && !teamTypePickerVisible" class="teams-side-empty">
        <p class="teams-side-empty-text">点击上方按钮创建团队，或从右侧列表中选择团队进行编辑。</p>
      </div>

      <div v-else-if="formVisible" class="users-form-wrap teams-form-wrap">
        <form class="stack-form users-form" @submit.prevent="handleSubmit">
          <label class="field-block">
            <span>团队类型</span>
            <div class="teams-type-picker-options teams-type-picker-options--form">
              <button
                v-for="option in teamTypeOptions"
                :key="option.value"
                class="teams-type-pill"
                :class="{ 'is-active': formState.teamType === option.value }"
                type="button"
                @click="formState.teamType = option.value"
              >
                {{ option.label }}
              </button>
            </div>
          </label>

          <label class="field-block">
            <span>团队名称</span>
            <input v-model="formState.name" type="text" required />
          </label>

          <div class="form-actions users-form-actions">
            <button class="btn btn-primary" type="submit" :disabled="saving">
              {{ saving ? "保存中..." : "保存" }}
            </button>
            <button class="btn btn-secondary" type="button" @click="closeForm">
              {{ editing ? "取消编辑" : "取消创建" }}
            </button>
          </div>
        </form>
      </div>
    </aside>

    <section class="users-main-card teams-main-card">
      <div class="users-main-head">
        <div>
          <h2 class="users-main-title">团队列表</h2>
        </div>
        <button class="btn btn-secondary users-refresh-button" type="button" @click="loadPage">
          <img :src="refreshGrayIcon" alt="" aria-hidden="true" />
          <span>刷新</span>
        </button>
      </div>

      <EmptyState v-if="!teams.length" title="暂无数据" />

      <div v-else class="users-table-shell">
        <div class="table-wrap users-table-wrap teams-table-wrap">
          <table class="data-table users-table teams-table">
            <thead>
              <tr>
                <th>团队名称</th>
                <th>团队类型</th>
                <th>创建时间</th>
                <th>更新时间</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="team in teams" :key="team.id">
                <td class="users-table-username">{{ team.name }}</td>
                <td>{{ getTeamTypeLabel(team) }}</td>
                <td>{{ formatDateTime(team.created_at) }}</td>
                <td>{{ formatDateTime(team.updated_at) }}</td>
                <td>
                  <div class="users-table-actions teams-table-actions">
                    <button class="users-action-btn users-action-btn--blue" type="button" @click="startEdit(team)">编辑</button>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </section>
  </section>
</template>
