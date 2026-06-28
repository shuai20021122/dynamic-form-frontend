import { request } from "./request.js";

export function fetchInterviewerProfile() {
  return request("/api/interviewer/profile");
}

export function updateInterviewerProfile(currentOperatorName) {
  return request("/api/interviewer/profile", {
    method: "PUT",
    body: JSON.stringify({
      current_operator_name: currentOperatorName,
    }),
  });
}
