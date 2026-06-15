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
  return request(`/api/entries/${entryId}/review`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}
