import { request } from "./request.js";

export function fetchTodayInterviewAccessCodes() {
  return request("/api/interview-access-codes/today");
}

export function verifyInterviewerAccess(accessId) {
  return request("/api/interviewer/access/verify", {
    method: "POST",
    body: JSON.stringify({
      access_id: String(accessId || "").trim().toUpperCase(),
    }),
  });
}

export function fetchCurrentInterviewerAccess() {
  return request("/api/interviewer/access/current");
}

export function clearCurrentInterviewerAccess() {
  return request("/api/interviewer/access/current", {
    method: "DELETE",
  });
}
