<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import { useRoute, useRouter } from "vue-router";

import bossKnowLogo from "../assets/boss-know-logo.png";
import CodeFlowBackdrop from "../components/CodeFlowBackdrop.vue";
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
const router = useRouter();
const formId = computed(() => route.params.id);
const designerToastStorageKey = "forms:designer:toast";

const currentUser = ref(null);
const form = ref(null);
const design = ref(null);
const loading = ref(true);
const saving = ref(false);
const publishing = ref(false);
const errorMessage = ref("");
const slots = ref([]);
const toastMessage = ref("");
const designerCacheKey = computed(() => `forms:designer:${formId.value}:${currentUiLanguage.value}`);
let toastTimer = null;

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
    .map((slot) => getSlotTitle(slot))
    .filter((slot) => slot && !knownValues.has(slot))
    .map((slot) => ({ value: slot, label: slot }));

  return [...baseTimeSlotOptions, ...customOptions];
});

function normalizeSlotItem(slot) {
  const normalizeIsActive = (value) => {
    if (value === false || value === 0) return false;
    const normalizedValue = String(value ?? "").trim().toLowerCase();
    if (normalizedValue === "false" || normalizedValue === "0" || normalizedValue === "disabled") {
      return false;
    }
    return true;
  };

  if (typeof slot === "string") {
    return {
      title: String(slot || "").trim(),
      is_active: true,
    };
  }

  return {
    ...(slot || {}),
    title: String(slot?.title || slot?.label || slot?.value || "").trim(),
    is_active: normalizeIsActive(slot?.is_active),
  };
}

function normalizeSlotMatchKey(value) {
  return String(value || "")
    .trim()
    .replace(/[–—]/g, "-")
    .replace(/\s*-\s*/g, "-")
    .replace(/\s+/g, "");
}

function getSlotTitle(slot) {
  return normalizeSlotItem(slot).title;
}

function isSlotActive(slot) {
  return normalizeSlotItem(slot).is_active !== false;
}

function normalizeSlots(slotsList = [], disabledSlotTitles = []) {
  const disabledSet = new Set((disabledSlotTitles || []).map((slot) => String(slot || "").trim()).filter(Boolean));
  return (slotsList || []).map((slot) => {
    const normalizedSlot = normalizeSlotItem(slot);
    if (disabledSet.has(normalizedSlot.title)) {
      return {
        ...normalizedSlot,
        is_active: false,
      };
    }
    return normalizedSlot;
  });
}

function getDesignerSlotDetailList(data = {}) {
  if (Array.isArray(data?.slot_details) && data.slot_details.length) {
    return data.slot_details;
  }

  return normalizeSlots(data?.slots || [], data?.disabled_slots || []);
}

function buildSlotsFromDesignerData(data = {}) {
  return getDesignerSlotDetailList(data)
    .map((slot) => normalizeSlotItem(slot))
    .filter((slot) => slot.title);
}

function getAvailableTimeSlotOptions(rowIndex) {
  const currentValue = getSlotTitle(slots.value[rowIndex]);
  const selectedValues = new Set(
    slots.value
      .map((slot, index) => (index === rowIndex ? "" : normalizeSlotMatchKey(getSlotTitle(slot))))
      .filter(Boolean)
  );

  return timeSlotOptions.value.filter((option) => {
    const value = String(option.value);
    if (normalizeSlotMatchKey(value) === normalizeSlotMatchKey(currentValue)) {
      return true;
    }
    return !selectedValues.has(normalizeSlotMatchKey(value));
  });
}

function isSlotDisabled(slot) {
  return !isSlotActive(slot);
}

function toggleSlotDisabled(rowIndex) {
  const currentSlot = normalizeSlotItem(slots.value[rowIndex]);
  if (!currentSlot.title) {
    return;
  }

  const nextSlots = [...slots.value];
  nextSlots[rowIndex] = {
    ...currentSlot,
    is_active: !currentSlot.is_active,
  };
  slots.value = nextSlots;
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
    ];
  }

  return ["姓名", "性别", "公司名称（中文）", "公司名称（英文）", "公司是否上市", "职务", "线上/现场", "语言"];
});

const copy = computed(() => {
  if (currentUiLanguage.value === "en-US") {
    return {
      loading: "Loading designer...",
      heroSuffix: "Form Editor",
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
      save: "Save Form",
      saving: "Saving...",
      publish: "Publish Form",
      publishing: "Publishing...",
      tableTitle: "Table Blueprint",
      tableNote: "The top header row is fixed. Only the first-column time slots can be modified.",
      time: "Time",
      actions: "Actions",
      slotToggle: "Disable / Enable",
      slotLabel: "Time Slot",
      disableSlot: "Disable",
      enableSlot: "Enable",
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
    heroSuffix: "表单编辑",
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
    save: "保存表单",
    saving: "保存中...",
    publish: "发布表单",
    publishing: "发布中...",
    tableTitle: "表格蓝图",
    tableNote: "顶部表头固定，只有第一列时间段支持修改。",
    time: "时间",
    actions: "操作",
    slotToggle: "时间段禁用启用",
    slotLabel: "时间段",
    disableSlot: "禁用",
    enableSlot: "启用",
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
const canPublish = computed(() => form.value?.status !== "active");

function ensureMinimum() {
  if (!slots.value.length) {
    slots.value = baseTimeSlotOptions.slice(0, 2).map((option) => ({
      title: option.value,
      is_active: true,
    }));
  }
  slots.value = slots.value.map((slot) => normalizeSlotItem(slot));
  while (slots.value.length < 2) {
    slots.value.push({
      title: "",
      is_active: true,
    });
  }
}

function addSlot() {
  const normalizedSlots = slots.value.map((slot) => getSlotTitle(slot));
  const lastSelectedSlot = [...normalizedSlots].reverse().find(Boolean) || "";
  const orderedValues = timeSlotOptions.value.map((option) => String(option.value || "").trim()).filter(Boolean);
  const lastSelectedIndex = orderedValues.indexOf(lastSelectedSlot);

  if (lastSelectedIndex >= 0) {
    slots.value.push({
      title: orderedValues[lastSelectedIndex + 1] || "",
      is_active: true,
    });
    return;
  }

  const selected = new Set(normalizedSlots.filter(Boolean));
  const nextOption = baseTimeSlotOptions.find((option) => !selected.has(option.value));
  slots.value.push({
    title: nextOption?.value || "",
    is_active: true,
  });
}

function removeSlot() {
  if (!canRemoveSlot.value) return;
  slots.value.pop();
  ensureMinimum();
}

function handleSlotChange(rowIndex, value) {
  const nextSlots = [...slots.value];
  nextSlots[rowIndex] = {
    ...normalizeSlotItem(nextSlots[rowIndex]),
    title: String(value || "").trim(),
  };

  const orderedValues = timeSlotOptions.value.map((option) => String(option.value || "").trim()).filter(Boolean);
  const selectedIndex = orderedValues.indexOf(String(value || "").trim());

  if (selectedIndex >= 0) {
    for (let index = rowIndex + 1; index < nextSlots.length; index += 1) {
      nextSlots[index] = {
        ...normalizeSlotItem(nextSlots[index]),
        title: orderedValues[selectedIndex + (index - rowIndex)] || "",
      };
    }
  }

  slots.value = nextSlots;
}

function getStatusTone(status) {
  if (status === "active") return "success";
  if (status === "draft") return "warning";
  return "neutral";
}

function buildDesignerPayload() {
  const normalizedSlots = slots.value
    .map((slot) => normalizeSlotItem(slot))
    .filter((slot) => slot.title);
  return {
    headers: fixedHeaders.value,
    required_headers: [],
    slots: normalizedSlots.map((slot) => ({
      title: slot.title,
      is_active: slot.is_active !== false,
    })),
  };
}

function syncDesignerState(payload, overrides = {}) {
  const normalizedSlotDetails = Array.isArray(payload?.slot_details)
    ? payload.slot_details
    : Array.isArray(payload?.slots)
      ? payload.slots
      : [];
  slots.value = normalizedSlotDetails.map((slot) => normalizeSlotItem(slot));
  design.value = {
    ...(design.value || {}),
    ...(payload || {}),
  };

  if (overrides.formStatus && form.value) {
    form.value = {
      ...form.value,
      status: overrides.formStatus,
    };
  }

  setCachedResource(designerCacheKey.value, {
    currentUser: currentUser.value,
    form: form.value,
    design: design.value,
    slots: slots.value,
  });
}

async function loadPage() {
  const cached = getCachedResource(designerCacheKey.value);
  if (cached) {
    currentUser.value = cached.currentUser || currentUser.value;
    form.value = cached.form || form.value;
    design.value = cached.design || design.value;
    slots.value = (cached.slots || slots.value).map((slot) => normalizeSlotItem(slot));
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
    slots.value = buildSlotsFromDesignerData(design.value);
    ensureMinimum();
    setCachedResource(designerCacheKey.value, {
      currentUser: me,
      form: form.value,
      design: design.value,
      slots: slots.value,
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
    const payload = buildDesignerPayload();
    await saveSimpleDesigner(formId.value, payload);
    syncDesignerState(payload);
    showToast(currentUiLanguage.value === "en-US" ? "Form saved successfully" : "保存成功");
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
    const payload = buildDesignerPayload();
    await saveSimpleDesigner(formId.value, payload);
    await publishForm(formId.value);
    syncDesignerState(payload, { formStatus: "active" });
    if (typeof window !== "undefined") {
      window.sessionStorage.setItem(
        designerToastStorageKey,
        currentUiLanguage.value === "en-US" ? "Form published successfully" : "发布成功"
      );
    }
    await router.push("/forms");
  } catch (error) {
    errorMessage.value = error.message || copy.value.publishFailed;
  } finally {
    publishing.value = false;
  }
}

onMounted(loadPage);
onBeforeUnmount(() => {
  if (toastTimer) {
    window.clearTimeout(toastTimer);
    toastTimer = null;
  }
});
</script>

<template>
  <ErrorAlert :message="errorMessage" />
  <div v-if="toastMessage" class="light-toast" role="status" aria-live="polite">{{ toastMessage }}</div>
  <LoadingBlock v-if="loading" :label="copy.loading" />

  <div v-else-if="form" class="designer-page">
    <section class="designer-hero panel">
      <CodeFlowBackdrop variant="banner" />
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
          <button class="btn btn-secondary" type="button" :disabled="saving" @click="handleSave">
            {{ saving ? copy.saving : copy.save }}
          </button>
          <button v-if="canPublish" class="btn btn-primary" type="button" :disabled="publishing" @click="handlePublish">
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
                  <th class="designer-time-head"></th>
                  <th v-for="(header, index) in fixedHeaders" :key="`header-${index}`">
                    <div class="designer-header-field">
                      <span class="designer-cell-label">{{ `${copy.columns} ${index + 1}` }}</span>
                      <div class="designer-fixed-header">{{ header }}</div>
                    </div>
                  </th>
                  <th class="designer-actions-head">{{ copy.actions }}</th>
                  <th class="designer-actions-head">{{ copy.slotToggle }}</th>
                </tr>
              </thead>

              <tbody>
                <tr v-for="(slot, rowIndex) in slots" :key="`slot-${rowIndex}`" :class="{ 'is-disabled-slot': isSlotDisabled(slot) }">
                  <td class="designer-slot-cell">
                    <div class="designer-slot-field">
                      <span class="designer-cell-label">{{ copy.slotLabel }}</span>
                      <UiSelect
                        :model-value="getSlotTitle(slots[rowIndex])"
                        class="designer-slot-select"
                        :options="getAvailableTimeSlotOptions(rowIndex)"
                        :disabled="saving || publishing"
                        :placeholder="copy.slotPlaceholder(rowIndex + 1)"
                        @update:model-value="handleSlotChange(rowIndex, $event)"
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
                  <td class="designer-row-toggle">
                    <div class="designer-row-toggle-inner">
                      <span class="designer-cell-label designer-cell-label--ghost" aria-hidden="true">{{ copy.slotLabel }}</span>
                      <button
                        class="btn btn-secondary designer-slot-toggle"
                        type="button"
                        :disabled="!getSlotTitle(slot) || saving || publishing"
                        @click="toggleSlotDisabled(rowIndex)"
                      >
                        {{ isSlotDisabled(slot) ? copy.enableSlot : copy.disableSlot }}
                      </button>
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
