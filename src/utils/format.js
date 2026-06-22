import { currentUiLanguage, t } from "../stores/uiLanguage.js";

export function formatDateTime(value) {
  if (!value) {
    return "-";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleString(currentUiLanguage.value === "en-US" ? "en-US" : "zh-CN", { hour12: false });
}

export function formatDateOnly(value) {
  if (!value) {
    return "-";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  if (currentUiLanguage.value === "en-US") {
    return date.toLocaleDateString("en-CA");
  }
  return date.toISOString().slice(0, 10);
}

export function getRoleLabel(role) {
  return t(`role.${role}`) || role || "-";
}

export function getFormStatusLabel(status) {
  return t(`formStatus.${status}`) || status || "-";
}

export function getEntryStatusLabel(status) {
  return t(`entryStatus.${status}`) || status || "-";
}

export function getReviewResultLabel(result) {
  return t(`review.${result}`) || result || "-";
}

export function buildValueSummary(values) {
  return Object.values(values || {})
    .map((item) => `${item.display_label || item.field_label}: ${item.display_value || item.value || "-"}`)
    .join("\n");
}
