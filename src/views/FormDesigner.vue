<script setup>
import { computed, onMounted, ref } from "vue";
import { useRoute } from "vue-router";

import bossKnowLogo from "../assets/boss-know-logo.png";
import ErrorAlert from "../components/ErrorAlert.vue";
import LoadingBlock from "../components/LoadingBlock.vue";
import StatusBadge from "../components/StatusBadge.vue";
import UiSelect from "../components/UiSelect.vue";
import { fetchCurrentUser } from "../api/auth.js";
import { getForm, getSimpleDesigner, publishForm, saveSimpleDesigner } from "../api/forms.js";
import { getCachedResource, setCachedResource } from "../stores/resourceCache.js";
import { currentUiLanguage } from "../stores/uiLanguage.js";
import { formatDateOnly, getFormStatusLabel } from "../utils/format.js";

const route = useRoute();
const formId = computed(() => route.params.id);

const currentUser = ref(null);
const form = ref(null);
const design = ref(null);
const loading = ref(true);
const saving = ref(false);
const publishing = ref(false);
const errorMessage = ref("");
const slots = ref([]);
const disabledSlots = ref([]);
const designerCacheKey = computed(() => `forms:designer:${formId.value}:${currentUiLanguage.value}`);

function formatTimeValue(totalMinutes) {
  const hours = String(Math.floor(totalMinutes / 60)).padStart(2, "0");
  const minutes = String(totalMinutes % 60).padStart(2, "0");
  return `${hours}:${minutes}`;
}

const baseTimeSlotOptions = Array.from({ length: 32 }, (_, index) => {
  const startMinutes = 5 * 60 + index * 30;
  const endMinutes = startMinutes + 30;
  const label = `${formatTimeValue(startMinutes)} - ${formatTimeValue(endMinutes)}`;
  return { value: label, label };
});

const timeSlotOptions = computed(() => {
  const knownValues = new Set(baseTimeSlotOptions.map((option) => option.value));
  const customOptions = slots.value
    .map((slot) => String(slot || "").trim())
    .filter((slot) => slot && !knownValues.has(slot))
    .map((slot) => ({ value: slot, label: slot }));

  return [...baseTimeSlotOptions, ...customOptions];
});

function getAvailableTimeSlotOptions(rowIndex) {
  const currentValue = String(slots.value[rowIndex] || "").trim();
  const selectedValues = new Set(
    slots.value
      .map((slot, index) => (index === rowIndex ? "" : String(slot || "").trim()))
      .filter(Boolean)
  );

  return timeSlotOptions.value.filter((option) => {
    const value = String(option.value);
    if (value === currentValue) {
      return true;
    }
    if (disabledSlots.value.includes(value)) {
      return false;
    }
    return !selectedValues.has(value);
  });
}

function isSlotDisabled(slot) {
  return disabledSlots.value.includes(String(slot || "").trim());
}

function toggleSlotDisabled(slot) {
  const value = String(slot || "").trim();
  if (!value) {
    return;
  }

  if (disabledSlots.value.includes(value)) {
    disabledSlots.value = disabledSlots.value.filter((item) => item !== value);
    return;
  }

  disabledSlots.value = [...disabledSlots.value, value];
}

const fixedHeaders = computed(() => {
  if (currentUiLanguage.value === "en-US") {
    return [
      "Name",
      "Gender",
      "Company Name (CN)",
      "Company Name (EN)",
      "Listed Company",
      "Position",
      "Format",
      "Language",
      "Admission Status",
    ];
  }

  return ["姓名", "性别", "公司名称（中文）", "公司名称（英文）", "公司是否上市", "职务", "线上/现场", "语言", "录取状态"];
});

const copy = computed(() => {
  if (currentUiLanguage.value === "en-US") {
    return {
      loading: "Loading designer...",
      heroSuffix: "Form Designer",
      heroNote:
        "Header fields are fixed for all accounts. You only need to maintain the time slots in the first column.",
      date: "Date",
      status: "Status",
      toolsTitle: "Design Controls",
      toolsNote: "The top header row is fixed. Here you can only add, remove, and adjust time slots.",
      columns: "Fixed Headers",
      rows: "Rows",
      addRow: "Add Row",
      removeRow: "Remove Row",
      preview: "Preview Fill Page",
      save: "Save Design",
      saving: "Saving...",
      publish: "Publish Form",
      publishing: "Publishing...",
      tableTitle: "Table Blueprint",
      tableNote: "The top header row is fixed. Only the first-column time slots can be modified.",
      time: "Time",
      actions: "Actions",
      slotLabel: "Time Slot",
      slotPlaceholder: (index) => `Time Slot ${index}`,
      emptyCell: "Reserved Cell",
      rowIndicator: (index) => `Row ${index}`,
      loadFailed: "Failed to load form designer",
      saveFailed: "Failed to save design",
      publishFailed: "Failed to publish form",
    };
  }

  return {
    loading: "正在加载表单设计...",
    heroSuffix: "表格设计界面",
    heroNote: "顶部表头字段固定不变，您只需要维护第一列的时间段。中间单元格无需填写，会保留给填写账号后续使用。",
    date: "日期",
    status: "状态",
    toolsTitle: "设计工具",
    toolsNote: "顶部表头对所有账号都是固定的，这里只需要新增、删除和调整时间段。",
    columns: "固定表头",
    rows: "行数",
    addRow: "新增行",
    removeRow: "删除行",
    preview: "预览填写页",
    save: "保存设计",
    saving: "保存中...",
    publish: "发布表单",
    publishing: "发布中...",
    tableTitle: "表格蓝图",
    tableNote: "顶部表头固定，只有第一列时间段支持修改。",
    time: "时间",
    actions: "操作",
    slotLabel: "时间段",
    slotPlaceholder: (index) => `时间段 ${index}`,
    emptyCell: "预留单元格",
    rowIndicator: (index) => `第 ${index} 行`,
    loadFailed: "加载表单设计失败",
    saveFailed: "保存设计失败",
    publishFailed: "发布表单失败",
  };
});

const headerCount = computed(() => fixedHeaders.value.length);
const slotCount = computed(() => slots.value.length);
const canRemoveSlot = computed(() => slots.value.length > 2);

function ensureMinimum() {
  if (!slots.value.length) {
    slots.value = baseTimeSlotOptions.slice(0, 2).map((option) => option.value);
  }
  while (slots.value.length < 2) slots.value.push("");
  disabledSlots.value = disabledSlots.value.filter((slot) => slots.value.includes(slot));
}

function addSlot() {
  const selected = new Set(slots.value.map((slot) => String(slot || "").trim()).filter(Boolean));
  const nextOption = baseTimeSlotOptions.find((option) => !selected.has(option.value));
  slots.value.push(nextOption?.value || "");
}

function removeSlot() {
  if (!canRemoveSlot.value) return;
  slots.value.pop();
  ensureMinimum();
}

function normalize(items) {
  return items.map((item) => item.trim()).filter(Boolean);
}

function getStatusTone(status) {
  if (status === "active") return "success";
  if (status === "draft") return "warning";
  return "neutral";
}

async function loadPage() {
  const cached = getCachedResource(designerCacheKey.value);
  if (cached) {
    currentUser.value = cached.currentUser || currentUser.value;
    form.value = cached.form || form.value;
    design.value = cached.design || design.value;
    slots.value = [...(cached.slots || slots.value)];
    disabledSlots.value = [...(cached.disabledSlots || disabledSlots.value)];
    loading.value = false;
  } else {
    loading.value = true;
  }

  errorMessage.value = "";

  try {
    const [me, formResult, designResult] = await Promise.all([fetchCurrentUser(), getForm(formId.value), getSimpleDesigner(formId.value)]);
    currentUser.value = me;
    form.value = formResult?.data?.form || null;
    design.value = designResult?.data || {};
    slots.value = [...(design.value?.slots || [])];
    disabledSlots.value = [...(design.value?.disabled_slots || [])];
    ensureMinimum();
    setCachedResource(designerCacheKey.value, {
      currentUser: me,
      form: form.value,
      design: design.value,
      slots: slots.value,
      disabledSlots: disabledSlots.value,
    });
  } catch (error) {
    errorMessage.value = error.message || copy.value.loadFailed;
  } finally {
    loading.value = false;
  }
}

async function handleSave() {
  saving.value = true;
  errorMessage.value = "";

  try {
    const normalizedSlots = normalize(slots.value);
    await saveSimpleDesigner(formId.value, {
      headers: fixedHeaders.value,
      required_headers: [],
      slots: normalizedSlots,
      disabled_slots: normalize(disabledSlots.value).filter((slot) => normalizedSlots.includes(slot)),
    });
    await loadPage();
  } catch (error) {
    errorMessage.value = error.message || copy.value.saveFailed;
  } finally {
    saving.value = false;
  }
}

async function handlePublish() {
  publishing.value = true;
  errorMessage.value = "";

  try {
    await publishForm(formId.value);
    await loadPage();
  } catch (error) {
    errorMessage.value = error.message || copy.value.publishFailed;
  } finally {
    publishing.value = false;
  }
}

onMounted(loadPage);
</script>

<template>
  <ErrorAlert :message="errorMessage" />
  <LoadingBlock v-if="loading" :label="copy.loading" />

  <div v-else-if="form" class="designer-page">
    <section class="designer-hero panel">
      <div class="designer-hero-body">
        <img class="designer-hero-logo" :src="bossKnowLogo" alt="BOSS KNOW" />

        <div class="designer-hero-copy">
          <h2 id="designer-form-title" class="designer-hero-title">
            {{ form.display_title || form.title }} - {{ copy.heroSuffix }}
          </h2>

          <div class="designer-hero-meta">
            <span>{{ copy.date }}: {{ formatDateOnly(form.start_time) }}</span>
            <span class="designer-hero-meta-separator"></span>
            <span>{{ copy.status }}:</span>
            <StatusBadge :text="getFormStatusLabel(form.status)" :tone="getStatusTone(form.status)" />
          </div>

          <p id="designer-form-meta" class="muted-text designer-hero-note">
            {{ copy.heroNote }}
          </p>
        </div>
      </div>
    </section>

    <section class="designer-workspace panel">
      <div class="panel-header designer-workspace-header">
        <div class="designer-workspace-titlewrap">
          <h3>{{ copy.toolsTitle }}</h3>
          <p class="muted-text designer-workspace-note">{{ copy.toolsNote }}</p>
        </div>

        <div class="designer-stats">
          <div class="designer-stat-chip">
            <span class="designer-stat-label">{{ copy.columns }}</span>
            <strong>{{ headerCount }}</strong>
          </div>
          <div class="designer-stat-chip">
            <span class="designer-stat-label">{{ copy.rows }}</span>
            <strong>{{ slotCount }}</strong>
          </div>
        </div>
      </div>

      <div class="panel-body designer-workspace-body">
        <div class="designer-toolbar">
          <button class="btn btn-secondary" type="button" @click="addSlot">{{ copy.addRow }}</button>
          <button class="btn btn-secondary" type="button" :disabled="!canRemoveSlot" @click="removeSlot">{{ copy.removeRow }}</button>
          <RouterLink class="btn btn-secondary" :to="`/forms/${form.id}/fill`">{{ copy.preview }}</RouterLink>
          <button class="btn btn-primary" type="button" :disabled="saving" @click="handleSave">
            {{ saving ? copy.saving : copy.save }}
          </button>
          <button class="btn btn-secondary" type="button" :disabled="publishing" @click="handlePublish">
            {{ publishing ? copy.publishing : copy.publish }}
          </button>
        </div>

        <div class="designer-grid-card">
          <div class="designer-grid-head">
            <div>
              <h4>{{ copy.tableTitle }}</h4>
              <p class="muted-text designer-grid-note">{{ copy.tableNote }}</p>
            </div>
          </div>

          <div class="table-wrap designer-table-wrap">
            <table class="data-table designer-table">
              <thead>
                <tr>
                  <th class="designer-time-head">{{ copy.time }}</th>
                  <th v-for="(header, index) in fixedHeaders" :key="`header-${index}`">
                    <div class="designer-header-field">
                      <span class="designer-cell-label">{{ `${copy.columns} ${index + 1}` }}</span>
                      <div class="designer-fixed-header">{{ header }}</div>
                    </div>
                  </th>
                  <th class="designer-actions-head">{{ copy.actions }}</th>
                </tr>
              </thead>

              <tbody>
                <tr v-for="(slot, rowIndex) in slots" :key="`slot-${rowIndex}`">
                  <td class="designer-slot-cell">
                    <div class="designer-slot-field">
                      <span class="designer-cell-label">{{ copy.slotLabel }}</span>
                      <UiSelect
                        v-model="slots[rowIndex]"
                        class="designer-slot-select"
                        :options="getAvailableTimeSlotOptions(rowIndex)"
                        :disabled="saving || publishing"
                        :placeholder="copy.slotPlaceholder(rowIndex + 1)"
                      />
                    </div>
                  </td>

                  <td v-for="(_, colIndex) in fixedHeaders" :key="`${rowIndex}-${colIndex}`" class="designer-reserved-cell">
                    <div class="designer-reserved-field">
                      <span class="designer-cell-label designer-cell-label--ghost" aria-hidden="true">{{ copy.slotLabel }}</span>
                      <div class="designer-reserved-box">
                        <span>{{ copy.emptyCell }}</span>
                      </div>
                    </div>
                  </td>

                  <td class="designer-row-indicator">
                    <div class="designer-row-indicator-inner">
                      <span class="designer-cell-label designer-cell-label--ghost" aria-hidden="true">{{ copy.slotLabel }}</span>
                      <span>{{ copy.rowIndicator(rowIndex + 1) }}</span>
                    </div>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </section>
  </div>
</template>
