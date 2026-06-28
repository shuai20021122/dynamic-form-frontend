import { request } from "./request.js";

export function createEntry(formId, payload) {
  return request(`/api/forms/${formId}/entries`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function updateEntry(entryId, payload) {
  return request(`/api/entries/${entryId}`, {
    method: "PUT",
    body: JSON.stringify(payload),
  });
}

export function deleteEntry(entryId) {
  return request(`/api/entries/${entryId}`, {
    method: "DELETE",
  });
}

export function moveEntrySlot(entryId, slotId) {
  return request(`/api/entries/${entryId}/move-slot`, {
    method: "POST",
    body: JSON.stringify({ slot_id: slotId }),
  });
}

export function listReviews(entryId) {
  return request(`/api/entries/${entryId}/reviews`);
}

export function saveReview(entryId, payload) {
  const normalizedPayload = {
    result: payload?.result ?? "pending",
    review_result: payload?.result ?? "pending",
    status: payload?.result ?? "pending",
    comment: payload?.comment ?? "",
    review_comment: payload?.comment ?? "",
    remarks: payload?.comment ?? "",
    content: payload?.comment ?? "",
  };

  return request(`/api/entries/${entryId}/review`, {
    method: "POST",
    body: JSON.stringify(normalizedPayload),
  });
}
