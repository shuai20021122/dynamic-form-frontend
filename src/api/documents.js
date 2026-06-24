import { downloadFile, request } from "./request.js";

export function listEntryDocuments(entryId) {
  return request(`/api/entries/${entryId}/documents`);
}

export function uploadEntryDocument(entryId, file) {
  const formData = new FormData();
  formData.append("file", file);
  return request(`/api/entries/${entryId}/documents`, {
    method: "POST",
    body: formData,
  });
}

export function downloadDocument(documentId) {
  return downloadFile(`/api/documents/${documentId}/download`);
}

export function previewDocument(documentId) {
  return request(`/api/documents/${documentId}/preview`);
}

export function createOnlineSummary(payload) {
  return request("/api/documents/online-summary", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function getOnlineSummaryDetail(documentId) {
  return request(`/api/documents/${documentId}/online-summary`);
}

export function updateOnlineSummary(documentId, payload) {
  return request(`/api/documents/${documentId}/online-summary`, {
    method: "PUT",
    body: JSON.stringify(payload),
  });
}

export function getBilingualEditor(documentId) {
  return request(`/api/documents/${documentId}/bilingual-editor`);
}

export function saveBilingualEditor(documentId, editor) {
  return request(`/api/documents/${documentId}/bilingual-editor`, {
    method: "PUT",
    body: JSON.stringify({ editor }),
  });
}

export function translatePreviewDocument(documentId) {
  return request(`/api/documents/${documentId}/translate-preview`, {
    method: "POST",
  });
}

export function generateBilingualDocument(documentId) {
  return request(`/api/documents/${documentId}/generate-bilingual`, {
    method: "POST",
  });
}

export function deleteDocument(documentId) {
  return request(`/api/documents/${documentId}`, {
    method: "DELETE",
  });
}
