import { request } from "./request.js";

export function listTeams() {
  return request("/api/teams");
}

export function createTeam(payload) {
  return request("/api/teams", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function updateTeam(teamId, payload) {
  return request(`/api/teams/${teamId}`, {
    method: "PUT",
    body: JSON.stringify(payload),
  });
}
