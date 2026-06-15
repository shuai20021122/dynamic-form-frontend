export const ROLE_LABELS = {
  super_admin: "超级管理员",
  academic_admin: "教务账号",
  team_admin: "团队账号",
  personal: "个人账号",
  interviewer: "面试官",
};

export const FORM_STATUS_LABELS = {
  draft: "草稿",
  active: "进行中",
  closed: "已结束",
};

export const ENTRY_STATUS_LABELS = {
  empty: "空闲",
  filled: "已填写",
  occupied: "已被其他账号占用",
};

export const REVIEW_RESULT_LABELS = {
  pending: "待定",
  pass: "通过",
  reject: "不通过",
};

export function formatDateTime(value) {
  if (!value) {
    return "-";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleString("zh-CN", { hour12: false });
}

export function formatDateOnly(value) {
  if (!value) {
    return "-";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toISOString().slice(0, 10);
}

export function getRoleLabel(role) {
  return ROLE_LABELS[role] || role || "-";
}

export function getFormStatusLabel(status) {
  return FORM_STATUS_LABELS[status] || status || "-";
}

export function getEntryStatusLabel(status) {
  return ENTRY_STATUS_LABELS[status] || status || "-";
}

export function getReviewResultLabel(result) {
  return REVIEW_RESULT_LABELS[result] || result || "-";
}

export function buildValueSummary(values) {
  return Object.values(values || {})
    .map((item) => `${item.display_label || item.field_label}: ${item.display_value || item.value || "-"}`)
    .join("\n");
}
