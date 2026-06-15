import { request } from "./request.js";

export function listUsers() {
  return request("/api/users");
}

export function createUser(payload) {
  return request("/api/users", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function updateUser(userId, payload) {
  return request(`/api/users/${userId}`, {
    method: "PUT",
    body: JSON.stringify(payload),
  });
}

export function disableUser(userId) {
  return request(`/api/users/${userId}/disable`, {
    method: "POST",
  });
}

export function resetUserPassword(userId, password) {
  return request(`/api/users/${userId}/reset-password`, {
    method: "POST",
    body: JSON.stringify({ password }),
  });
}

export function deleteUser(userId) {
  return request(`/api/users/${userId}`, {
    method: "DELETE",
  });
}
