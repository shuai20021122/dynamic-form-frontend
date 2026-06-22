<script setup>
import { computed, onMounted, ref, watch } from "vue";
import { useRoute } from "vue-router";

import ErrorAlert from "../components/ErrorAlert.vue";
import LoadingBlock from "../components/LoadingBlock.vue";
import StatusBadge from "../components/StatusBadge.vue";
import { fetchCurrentUser } from "../api/auth.js";
import { exportForm } from "../api/export.js";
import { getFormEntries, listHistoryForms, reopenForm } from "../api/forms.js";
import historyEmptyIllustration from "../assets/ui-icons/history_empty_clipboard_illustration.svg";
import searchIcon from "../assets/ui-icons/account_search_gray.svg";
import { getCachedResource, setCachedResource } from "../stores/resourceCache.js";
import { currentUiLanguage, t } from "../stores/uiLanguage.js";
import { buildValueSummary, formatDateTime, getFormStatusLabel } from "../utils/format.js";

const route = useRoute();

const currentUser = ref(null);
const forms = ref([]);
const selectedForm = ref(null);
const selectedEntries = ref([]);
const loading = ref(true);
const entriesLoading = ref(false);
const errorMessage = ref("");
const keyword = ref("");
const page = ref(1);
const pageSize = ref(10);
const total = ref(0);
const historyCacheKey = computed(() => `forms:history:${currentUiLanguage.value}:${keyword.value.trim()}:${page.value}:${pageSize.value}`);

const totalPages = computed(() => Math.max(1, Math.ceil(total.value / pageSize.value)));

function getTone(status) {
  if (status === "closed") return "neutral";
  if (status === "active") return "success";
  return "warning";
}

function isSelected(formId) {
  return String(selectedForm.value?.id || "") === String(formId);
}

async function loadHistory() {
  const cached = getCachedResource(historyCacheKey.value);
  if (cached) {
    currentUser.value = cached.currentUser || currentUser.value;
    forms.value = cached.forms || [];
    total.value = cached.total || 0;
    loading.value = false;
  } else {
    loading.value = true;
  }
  errorMessage.value = "";
  try {
    const [me, result] = await Promise.all([
      fetchCurrentUser(),
      listHistoryForms({
        keyword: keyword.value.trim(),
        page: page.value,
        page_size: pageSize.value,
        ui_lang: currentUiLanguage.value,
      }),
    ]);
    currentUser.value = me;
    forms.value = result?.data?.items || [];
    total.value = result?.data?.pagination?.total || 0;
    setCachedResource(historyCacheKey.value, {
      currentUser: me,
      forms: forms.value,
      total: total.value,
    });
  } catch (error) {
    errorMessage.value = error.message || t("history.pageTitle");
  } finally {
    loading.value = false;
  }
}

async function loadEntries(form) {
  selectedForm.value = form;
  const cacheKey = `forms:entries:${currentUiLanguage.value}:${form.id}`;
  const cached = getCachedResource(cacheKey);
  if (cached) {
    selectedEntries.value = cached;
    entriesLoading.value = false;
  } else {
    entriesLoading.value = true;
  }
  errorMessage.value = "";
  try {
    const result = await getFormEntries(form.id, { ui_lang: currentUiLanguage.value });
    selectedEntries.value = result?.data?.items || [];
    setCachedResource(cacheKey, selectedEntries.value);
  } catch (error) {
    errorMessage.value = error.message || t("history.recordsTitle");
  } finally {
    entriesLoading.value = false;
  }
}

async function handleReopen(formId) {
  try {
    await reopenForm(formId);
    if (selectedForm.value?.id === formId) {
      selectedForm.value = null;
      selectedEntries.value = [];
    }
    await loadHistory();
  } catch (error) {
    errorMessage.value = error.message || t("history.reopen");
  }
}

function handleSearch() {
  page.value = 1;
  loadHistory();
}

function resetSearch() {
  keyword.value = "";
  page.value = 1;
  loadHistory();
}

watch(
  () => route.query.formId,
  async (formId) => {
    if (!formId || !forms.value.length) return;
    const matched = forms.value.find((item) => String(item.id) === String(formId));
    if (matched) await loadEntries(matched);
  }
);

onMounted(async () => {
  await loadHistory();
  if (route.query.formId) {
    const matched = forms.value.find((item) => String(item.id) === String(route.query.formId));
    if (matched) await loadEntries(matched);
  }
});

watch(currentUiLanguage, async () => {
  await loadHistory();
  if (selectedForm.value) {
    const matched = forms.value.find((item) => String(item.id) === String(selectedForm.value?.id));
    if (matched) {
      await loadEntries(matched);
      return;
    }
    selectedForm.value = null;
    selectedEntries.value = [];
  }
});
</script>

<template>
  <ErrorAlert :message="errorMessage" />
  <LoadingBlock v-if="loading" :label="t('common.loading')" />

  <section v-else class="history-page">
    <section class="history-search-card">
      <div class="history-search-head">
        <h2 class="history-card-title-main">{{ t("history.pageTitle") }}</h2>
      </div>
      <form class="history-search-form" @submit.prevent="handleSearch">
        <label class="history-search-field" for="history-keyword">
          <img :src="searchIcon" alt="" aria-hidden="true" />
          <input id="history-keyword" v-model="keyword" type="text" :placeholder="t('history.searchPlaceholder')" />
        </label>
        <div class="history-search-actions">
          <button class="btn btn-primary history-search-button" type="submit">{{ t("history.search") }}</button>
          <button class="btn btn-secondary history-reset-button" type="button" @click="resetSearch">{{ t("history.reset") }}</button>
        </div>
      </form>
    </section>

    <section class="history-layout">
      <section class="history-list-card">
        <div class="history-panel-head">
          <h2 class="history-card-title-main">{{ t("history.listTitle") }}</h2>
        </div>

        <div class="history-list-body">
          <div v-if="!forms.length" class="history-list-empty">{{ t("history.noHistory") }}</div>

          <button
            v-for="form in forms"
            v-else
            :key="form.id"
            class="history-item-card"
            :class="{ 'is-active': isSelected(form.id) }"
            type="button"
            @click="loadEntries(form)"
          >
            <div class="history-item-top">
              <strong class="history-item-title">{{ form.display_title || form.title }}</strong>
            </div>
            <div class="history-item-meta">
              <StatusBadge :text="getFormStatusLabel(form.status)" :tone="getTone(form.status)" />
              <span class="history-item-date">{{ formatDateTime(form.updated_at) }}</span>
            </div>
            <div class="history-item-actions">
              <button class="btn btn-secondary history-item-action" type="button" @click.stop="loadEntries(form)">{{ t("history.viewRecords") }}</button>
              <button class="btn btn-primary history-item-action" type="button" @click.stop="exportForm(form.id)">{{ t("history.export") }}</button>
              <button class="btn btn-secondary history-item-action" type="button" @click.stop="handleReopen(form.id)">{{ t("history.reopen") }}</button>
            </div>
          </button>
        </div>

        <p class="history-list-note">{{ t("history.note") }}</p>

        <div class="history-pager">
          <button class="btn btn-secondary history-pager-btn" type="button" :disabled="page <= 1" @click="page -= 1; loadHistory()">{{ t("history.prevPage") }}</button>
          <span class="history-pager-text">{{ t("history.pageInfo", { page, totalPages, total }) }}</span>
          <button
            class="btn btn-secondary history-pager-btn"
            type="button"
            :disabled="page >= totalPages"
            @click="page += 1; loadHistory()"
          >
            {{ t("history.nextPage") }}
          </button>
        </div>
      </section>

      <section class="history-records-card">
        <div class="history-panel-head">
          <h2 class="history-card-title-main">{{ t("history.recordsTitle") }}</h2>
        </div>

        <div class="history-records-shell">
          <LoadingBlock v-if="entriesLoading" :label="t('common.loading')" />

          <template v-else-if="selectedForm">
            <div class="table-wrap history-records-table-wrap">
              <table class="data-table history-records-table">
                <thead>
                  <tr>
                    <th>{{ t("history.time") }}</th>
                    <th>{{ t("history.submitter") }}</th>
                    <th>{{ t("history.team") }}</th>
                    <th>{{ t("history.updatedAt") }}</th>
                    <th>{{ t("history.content") }}</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-if="!selectedEntries.length">
                    <td class="history-records-empty-row" colspan="5">{{ t("history.noRecords") }}</td>
                  </tr>
                  <tr v-for="entry in selectedEntries" :key="entry.id">
                    <td>{{ entry.slot_title || "-" }}</td>
                    <td>{{ entry.user_real_name || "-" }}</td>
                    <td>{{ entry.team_name || "-" }}</td>
                    <td class="history-records-datetime">{{ formatDateTime(entry.updated_at) }}</td>
                    <td><pre class="value-summary history-value-summary">{{ buildValueSummary(entry.values) }}</pre></td>
                  </tr>
                </tbody>
              </table>
            </div>
          </template>

          <div v-else class="history-records-empty">
            <img :src="historyEmptyIllustration" alt="" aria-hidden="true" />
            <p>{{ t("history.selectPrompt") }}</p>
          </div>
        </div>
      </section>
    </section>
  </section>
</template>
