<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { useRouter } from "vue-router";

import ErrorAlert from "../components/ErrorAlert.vue";
import LoadingBlock from "../components/LoadingBlock.vue";
import StatusBadge from "../components/StatusBadge.vue";
import { fetchCurrentUser } from "../api/auth.js";
import { exportForm } from "../api/export.js";
import { closeForm, deleteForm, getFormTable, listForms, publishForm, quickCreateForm, updateForm } from "../api/forms.js";
import refreshIcon from "../assets/ui-icons/refresh_gray.svg";
import { getCachedResource, setCachedResource } from "../stores/resourceCache.js";
import { currentUiLanguage, t } from "../stores/uiLanguage.js";
import { closeDialogWithAnimation, getDialogOriginFromEvent, openDialogWithAnimation, resetDialogMotion } from "../utils/dialogMotion.js";
import { formatDateOnly, formatDateTime, getFormStatusLabel } from "../utils/format.js";

const router = useRouter();
const designerToastStorageKey = "forms:designer:toast";
const currentUser = ref(null);
const forms = ref([]);
const loading = ref(true);
const saving = ref(false);
const errorMessage = ref("");
const toastMessage = ref("");
const formSlotStatsMap = ref({});
const activeTitleId = ref("");
const dateInputRef = ref(null);
const actionDialog = ref(null);
const actionSubmitting = ref(false);
const actionFormId = ref("");
const actionType = ref("");
const actionDialogTitle = ref("");
const actionDialogMessage = ref("");
const actionDialogConfirmText = ref("");
const actionDialogTone = ref("danger");
let toastTimer = null;
const formState = ref({
  id: "",
  title: "",
  date: "",
});

function showToast(message) {
  toastMessage.value = message;
  if (toastTimer) {
    window.clearTimeout(toastTimer);
  }
  toastTimer = window.setTimeout(() => {
    toastMessage.value = "";
    toastTimer = null;
  }, 2200);
}

const canManage = computed(() => ["super_admin", "academic_admin"].includes(currentUser.value?.role));
const showSlotUsageColumn = computed(() => !canManage.value);
const draftForms = computed(() => forms.value.filter((item) => item.status === "draft"));
const activeForms = computed(() => forms.value.filter((item) => item.status === "active"));
const formsCacheKey = computed(() => `forms:list:${currentUiLanguage.value}`);
const viewActionLabel = computed(() => {
  if (currentUser.value?.role === "interviewer") {
    return currentUiLanguage.value === "en-US" ? "Enter Interview Review" : "进入面试评审";
  }

  return currentUiLanguage.value === "en-US" ? "View" : "查看";
});
const dateDisplayValue = computed(() => {
  if (!formState.value.date) {
    return t("forms.datePlaceholder");
  }

  const [year, month, day] = String(formState.value.date).split("-");
  if (!year || !month || !day) {
    return formState.value.date;
  }

  return currentUiLanguage.value === "en-US" ? `${year} / ${month} / ${day}` : `${year} / ${month} / ${day}`;
});

function resetFormState() {
  formState.value = {
    id: "",
    title: "",
    date: "",
  };
}

function startEdit(form) {
  formState.value = {
    id: form.id,
    title: form.title || "",
    date: form.start_time ? new Date(form.start_time).toISOString().slice(0, 10) : "",
  };
}

function getTone(status) {
  return status === "active" ? "success" : "warning";
}

function getTitleKey(prefix, id) {
  return `${prefix}-${id}`;
}

function toggleTitleBubble(key) {
  activeTitleId.value = activeTitleId.value === key ? "" : key;
}

function closeTitleBubble() {
  activeTitleId.value = "";
}

function openDatePicker() {
  if (!dateInputRef.value) return;

  if (typeof dateInputRef.value.showPicker === "function") {
    dateInputRef.value.showPicker();
    return;
  }

  dateInputRef.value.focus();
  dateInputRef.value.click();
}

function buildDefaultSlotStats() {
  return {
    total: 0,
    booked: 0,
    free: 0,
  };
}

function buildFormSlotStats(rows = []) {
  const stats = buildDefaultSlotStats();
  const normalizedRows = Array.isArray(rows) ? rows : [];

  normalizedRows.forEach((row) => {
    stats.total += 1;

    if (row?.status === "empty") {
      stats.free += 1;
    }

    if (row?.status === "occupied" || row?.status === "filled" || row?.entry?.id) {
      stats.booked += 1;
    }
  });

  return stats;
}

function getFormSlotStats(formId) {
  return formSlotStatsMap.value[String(formId)] || buildDefaultSlotStats();
}

async function loadReadonlyFormSlotStats(items = []) {
  if (canManage.value) {
    formSlotStatsMap.value = {};
    return;
  }

  const activeItems = (items || []).filter((item) => item?.status === "active" && item?.id);
  if (!activeItems.length) {
    formSlotStatsMap.value = {};
    return;
  }

  const results = await Promise.allSettled(
    activeItems.map((item) => getFormTable(item.id, { ui_lang: currentUiLanguage.value }))
  );

  const nextMap = {};
  results.forEach((result, index) => {
    const formId = String(activeItems[index]?.id || "");
    if (!formId) {
      return;
    }

    if (result.status === "fulfilled") {
      nextMap[formId] = buildFormSlotStats(result.value?.data?.rows || []);
      return;
    }

    nextMap[formId] = buildDefaultSlotStats();
  });

  formSlotStatsMap.value = nextMap;
}

async function loadPage() {
  const cached = getCachedResource(formsCacheKey.value);
  if (cached) {
    currentUser.value = cached.currentUser || currentUser.value;
    forms.value = cached.forms || [];
    loading.value = false;
  } else {
    loading.value = true;
  }

  errorMessage.value = "";

  try {
    const [me, formsResult] = await Promise.all([fetchCurrentUser(), listForms({ ui_lang: currentUiLanguage.value })]);
    currentUser.value = me;
    forms.value = (formsResult?.data?.items || []).filter((item) => item.status !== "closed");
    await loadReadonlyFormSlotStats(forms.value);
    setCachedResource(formsCacheKey.value, {
      currentUser: me,
      forms: forms.value,
    });
  } catch (error) {
    errorMessage.value = error.message || t("common.loading");
  } finally {
    loading.value = false;
  }
}

async function handleCreateOrUpdate() {
  saving.value = true;
  errorMessage.value = "";

  try {
    if (formState.value.id) {
      await updateForm(formState.value.id, {
        title: formState.value.title.trim(),
        start_time: formState.value.date ? `${formState.value.date}T00:00:00` : null,
        end_time: formState.value.date ? `${formState.value.date}T23:59:59` : null,
      });
      resetFormState();
      await loadPage();
      return;
    }

    const result = await quickCreateForm({
      title: formState.value.title.trim(),
      date: formState.value.date || null,
    });
    const nextId = result?.data?.form?.id;
    if (nextId) {
      await router.push(`/forms/${nextId}/designer`);
    }
  } catch (error) {
    errorMessage.value = error.message || t("forms.submitSave");
  } finally {
    saving.value = false;
  }
}

async function handlePublish(formId) {
  openActionDialog(formId, "publish");
}

function openActionDialog(formId, type, event = null) {
  actionFormId.value = formId;
  actionType.value = type;
  actionSubmitting.value = false;

  if (type === "publish") {
    actionDialogTitle.value = t("forms.publish");
    actionDialogMessage.value = t("forms.publishConfirm");
    actionDialogConfirmText.value = t("forms.publish");
    actionDialogTone.value = "primary";
  } else if (type === "close") {
    actionDialogTitle.value = t("forms.close");
    actionDialogMessage.value = t("forms.closeConfirm");
    actionDialogConfirmText.value = t("forms.close");
    actionDialogTone.value = "danger";
  } else {
    actionDialogTitle.value = t("forms.delete");
    actionDialogMessage.value = t("forms.deleteConfirm");
    actionDialogConfirmText.value = t("forms.delete");
    actionDialogTone.value = "danger";
  }

  openDialogWithAnimation(actionDialog, {
    originPoint: getDialogOriginFromEvent(event, {
      x: window.innerWidth * 0.72,
      y: window.innerHeight * 0.3,
    }),
  });
}

function closeActionDialog() {
  closeDialogWithAnimation(actionDialog);
}

function resetActionDialog() {
  resetDialogMotion(actionDialog);
  actionSubmitting.value = false;
  actionFormId.value = "";
  actionType.value = "";
  actionDialogTitle.value = "";
  actionDialogMessage.value = "";
  actionDialogConfirmText.value = "";
  actionDialogTone.value = "danger";
}

async function confirmActionDialog() {
  if (!actionFormId.value || !actionType.value) {
    return;
  }

  actionSubmitting.value = true;

  try {
    if (actionType.value === "publish") {
      await publishForm(actionFormId.value);
    } else if (actionType.value === "close") {
      await closeForm(actionFormId.value);
    } else if (actionType.value === "delete") {
      await deleteForm(actionFormId.value);
    }

    closeDialogWithAnimation(actionDialog, {
      afterClose: () => {
        loadPage();
      },
    });
  } catch (error) {
    errorMessage.value =
      error.message ||
      (actionType.value === "publish" ? t("forms.publish") : actionType.value === "close" ? t("forms.close") : t("forms.delete"));
  } finally {
    actionSubmitting.value = false;
  }
}

function handleDelete(formId) {
  openActionDialog(formId, "delete");
}

function handleInterviewerAccessGranted() {
  loadPage();
}

onMounted(() => {
  if (typeof window !== "undefined") {
    const storedToast = window.sessionStorage.getItem(designerToastStorageKey);
    if (storedToast) {
      showToast(storedToast);
      window.sessionStorage.removeItem(designerToastStorageKey);
    }
  }
  loadPage();
  document.addEventListener("click", closeTitleBubble);
  window.addEventListener("app:interviewer-access-granted", handleInterviewerAccessGranted);
});

onBeforeUnmount(() => {
  document.removeEventListener("click", closeTitleBubble);
  window.removeEventListener("app:interviewer-access-granted", handleInterviewerAccessGranted);
  if (toastTimer) {
    window.clearTimeout(toastTimer);
    toastTimer = null;
  }
  resetDialogMotion(actionDialog);
});

watch(currentUiLanguage, () => {
  loadPage();
});
</script>

<template>
  <ErrorAlert :message="errorMessage" />
  <div v-if="toastMessage" class="light-toast" role="status" aria-live="polite">{{ toastMessage }}</div>
  <LoadingBlock v-if="loading" :label="t('common.loading')" />

  <section v-else class="forms-page" :class="{ 'forms-page--readonly': !canManage }">
    <section v-if="canManage" class="forms-side-card">
      <div class="users-side-head">
        <h2 class="users-side-title">{{ formState.id ? t("forms.editForm") : t("forms.createForm") }}</h2>
      </div>

      <form class="stack-form users-form forms-create-form" @submit.prevent="handleCreateOrUpdate">
        <label class="field-block">
          <span>{{ t("forms.formTitle") }}</span>
          <input v-model="formState.title" type="text" required />
        </label>
        <label class="field-block forms-date-field">
          <span>{{ t("forms.date") }}</span>
          <button class="forms-date-trigger" type="button" @click="openDatePicker">
            <span class="forms-date-display" :class="{ 'is-placeholder': !formState.date }">{{ dateDisplayValue }}</span>
            <input ref="dateInputRef" v-model="formState.date" class="forms-date-input" type="date" tabindex="-1" />
          </button>
        </label>
        <p class="muted-text users-form-hint forms-form-hint">{{ t("forms.hint") }}</p>
        <div class="form-actions users-form-actions forms-form-actions">
          <button class="btn btn-primary forms-submit-button" type="submit" :disabled="saving">
            {{ saving ? t("forms.submitting") : formState.id ? t("forms.submitSave") : t("forms.submitCreate") }}
          </button>
        </div>
      </form>
    </section>

    <section class="forms-main-card">
      <div class="users-main-head forms-main-head">
        <h2 class="users-main-title">{{ t("forms.title") }}</h2>
        <button class="btn btn-secondary users-refresh-button" type="button" @click="loadPage">
          <img :src="refreshIcon" alt="" aria-hidden="true" />
          {{ t("common.refresh") }}
        </button>
      </div>

      <div class="forms-main-body">
        <section v-if="canManage" class="forms-section forms-panel-block">
          <div class="forms-section-header forms-panel-block-head">
            <h3>{{ t("forms.draft") }}</h3>
          </div>
          <div class="forms-table-shell">
            <div class="table-wrap forms-table-wrap">
              <table class="data-table forms-table">
                <thead>
                  <tr>
                    <th>{{ t("forms.formTitle") }}</th>
                    <th>{{ t("forms.status") }}</th>
                    <th>{{ t("forms.date") }}</th>
                    <th>{{ t("forms.updatedAt") }}</th>
                    <th v-if="showSlotUsageColumn">{{ t("forms.slotUsage") }}</th>
                    <th>{{ t("forms.actions") }}</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-if="!draftForms.length">
                    <td class="forms-empty-row" :colspan="showSlotUsageColumn ? 6 : 5">{{ t("common.noData") }}</td>
                  </tr>
                  <tr v-for="item in draftForms" :key="item.id">
                    <td>
                      <div class="forms-table-title-wrap">
                        <button
                          class="forms-table-title"
                          type="button"
                          @click.stop="toggleTitleBubble(getTitleKey('draft', item.id))"
                        >
                          {{ item.display_title || item.title }}
                        </button>
                        <div
                          v-if="activeTitleId === getTitleKey('draft', item.id)"
                          class="forms-title-bubble"
                          @click.stop
                        >
                          {{ item.display_title || item.title }}
                        </div>
                      </div>
                    </td>
                    <td><StatusBadge :text="getFormStatusLabel(item.status)" :tone="getTone(item.status)" /></td>
                    <td class="forms-table-date">{{ formatDateOnly(item.start_time) }}</td>
                    <td class="forms-table-datetime">{{ formatDateTime(item.updated_at || item.created_at) }}</td>
                    <td v-if="showSlotUsageColumn" class="forms-slot-usage-cell">
                      <div class="forms-slot-usage">
                        <span>{{ t("forms.slotsTotal") }} {{ getFormSlotStats(item.id).total }}</span>
                        <span>{{ t("forms.slotsBooked") }} {{ getFormSlotStats(item.id).booked }}</span>
                        <span>{{ t("forms.slotsFree") }} {{ getFormSlotStats(item.id).free }}</span>
                      </div>
                    </td>
                    <td>
                      <div class="users-table-actions forms-table-actions">
                        <RouterLink class="users-action-btn users-action-btn--blue" :to="`/forms/${item.id}/designer`">{{ t("forms.design") }}</RouterLink>
                        <button
                          v-if="canManage"
                          class="users-action-btn users-action-btn--blue"
                          type="button"
                          @click="startEdit(item)"
                        >
                          {{ currentUiLanguage === "en-US" ? "Edit Create Form" : "创建表单编辑" }}
                        </button>
                        <button
                          v-if="canManage"
                          class="users-action-btn users-action-btn--green"
                          type="button"
                          @click="openActionDialog(item.id, 'publish', $event)"
                        >
                          {{ t("forms.publish") }}
                        </button>
                        <button
                          v-if="canManage"
                          class="users-action-btn users-action-btn--red"
                          type="button"
                          @click="openActionDialog(item.id, 'delete', $event)"
                        >
                          {{ t("forms.delete") }}
                        </button>
                      </div>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </section>

        <section class="forms-section forms-panel-block">
          <div class="forms-section-header forms-panel-block-head">
            <h3>{{ t("forms.active") }}</h3>
          </div>
          <div class="forms-table-shell">
            <div class="table-wrap forms-table-wrap">
              <table class="data-table forms-table">
                <thead>
                  <tr>
                    <th>{{ t("forms.formTitle") }}</th>
                    <th>{{ t("forms.status") }}</th>
                    <th>{{ t("forms.date") }}</th>
                    <th>{{ t("forms.updatedAt") }}</th>
                    <th v-if="showSlotUsageColumn">{{ t("forms.slotUsage") }}</th>
                    <th>{{ t("forms.actions") }}</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-if="!activeForms.length">
                    <td class="forms-empty-row" :colspan="showSlotUsageColumn ? 6 : 5">{{ t("common.noData") }}</td>
                  </tr>
                  <tr v-for="item in activeForms" :key="item.id">
                    <td>
                      <div class="forms-table-title-wrap">
                        <button
                          class="forms-table-title"
                          type="button"
                          @click.stop="toggleTitleBubble(getTitleKey('active', item.id))"
                        >
                          {{ item.display_title || item.title }}
                        </button>
                        <div
                          v-if="activeTitleId === getTitleKey('active', item.id)"
                          class="forms-title-bubble"
                          @click.stop
                        >
                          {{ item.display_title || item.title }}
                        </div>
                      </div>
                    </td>
                    <td><StatusBadge :text="getFormStatusLabel(item.status)" :tone="getTone(item.status)" /></td>
                    <td class="forms-table-date">{{ formatDateOnly(item.start_time) }}</td>
                    <td class="forms-table-datetime">{{ formatDateTime(item.updated_at || item.created_at) }}</td>
                    <td v-if="showSlotUsageColumn" class="forms-slot-usage-cell">
                      <div class="forms-slot-usage">
                        <span>{{ t("forms.slotsTotal") }} {{ getFormSlotStats(item.id).total }}</span>
                        <span>{{ t("forms.slotsBooked") }} {{ getFormSlotStats(item.id).booked }}</span>
                        <span>{{ t("forms.slotsFree") }} {{ getFormSlotStats(item.id).free }}</span>
                      </div>
                    </td>
                    <td>
                      <div class="users-table-actions forms-table-actions">
                        <template v-if="canManage">
                          <RouterLink class="users-action-btn users-action-btn--blue" :to="`/forms/${item.id}/fill`">{{ t("forms.fill") }}</RouterLink>
                          <RouterLink class="users-action-btn users-action-btn--blue" :to="`/forms/${item.id}/designer`">{{ t("forms.design") }}</RouterLink>
                          <button
                            class="users-action-btn users-action-btn--orange"
                            type="button"
                            @click="openActionDialog(item.id, 'close', $event)"
                          >
                            {{ t("forms.close") }}
                          </button>
                          <button
                            class="users-action-btn users-action-btn--blue"
                            type="button"
                            @click="exportForm(item.id)"
                          >
                            {{ t("history.export") }}
                          </button>
                        </template>
                        <RouterLink v-else class="users-action-btn users-action-btn--blue" :to="`/forms/${item.id}/fill`">
                          {{ viewActionLabel }}
                        </RouterLink>
                      </div>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </section>
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
            <button
              class="btn"
              :class="actionDialogTone === 'danger' ? 'btn-danger' : 'btn-primary'"
              type="button"
              :disabled="actionSubmitting"
              @click="confirmActionDialog"
            >
              {{ actionSubmitting ? t("forms.submitting") : actionDialogConfirmText }}
            </button>
            <button class="btn btn-secondary" type="button" :disabled="actionSubmitting" @click="closeActionDialog">
              {{ t("common.cancel") }}
            </button>
          </div>
        </div>
      </div>
    </div>
  </dialog>
</template>
