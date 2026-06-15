import { downloadFile } from "./request.js";

export function exportForm(formId) {
  return downloadFile(`/api/export/forms/${formId}`);
}
