import { buildQuery, request } from "./request.js";

export function listForms(params = {}) {
  return request(`/api/forms${buildQuery(params)}`);
}

export function listHistoryForms(params = {}) {
  return request(`/api/forms/history${buildQuery(params)}`);
}

export function createForm(payload) {
  return request("/api/forms", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function quickCreateForm(payload) {
  return request("/api/forms/quick-create", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function getForm(formId, params = {}) {
  return request(`/api/forms/${formId}${buildQuery(params)}`);
}

export function updateForm(formId, payload) {
  return request(`/api/forms/${formId}`, {
    method: "PUT",
    body: JSON.stringify(payload),
  });
}

export function publishForm(formId) {
  return request(`/api/forms/${formId}/publish`, {
    method: "POST",
  });
}

export function closeForm(formId) {
  return request(`/api/forms/${formId}/close`, {
    method: "POST",
  });
}

export function reopenForm(formId) {
  return request(`/api/forms/${formId}/reopen`, {
    method: "POST",
  });
}

export function deleteForm(formId) {
  return request(`/api/forms/${formId}`, {
    method: "DELETE",
  });
}

export function getFormTable(formId, params = {}) {
  return request(`/api/forms/${formId}/table${buildQuery(params)}`);
}

export function getFormEntries(formId, params = {}) {
  return request(`/api/forms/${formId}/entries${buildQuery(params)}`);
}

export function getSimpleDesigner(formId) {
  return request(`/api/forms/${formId}/simple-designer`);
}

export function saveSimpleDesigner(formId, payload) {
  return request(`/api/forms/${formId}/simple-designer`, {
    method: "PUT",
    body: JSON.stringify(payload),
  });
}

export function listFields(formId) {
  return request(`/api/forms/${formId}/fields`);
}

export function createField(formId, payload) {
  return request(`/api/forms/${formId}/fields`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function updateField(fieldId, payload) {
  return request(`/api/fields/${fieldId}`, {
    method: "PUT",
    body: JSON.stringify(payload),
  });
}

export function deleteField(fieldId) {
  return request(`/api/fields/${fieldId}`, {
    method: "DELETE",
  });
}

export function listSlots(formId) {
  return request(`/api/forms/${formId}/slots`);
}

export function createSlot(formId, payload) {
  return request(`/api/forms/${formId}/slots`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function updateSlot(slotId, payload) {
  return request(`/api/slots/${slotId}`, {
    method: "PUT",
    body: JSON.stringify(payload),
  });
}

export function deleteSlot(slotId) {
  return request(`/api/slots/${slotId}`, {
    method: "DELETE",
  });
}
