import { request, resetAuthExpiredNotice } from "./request.js";

let currentUserCache = null;

export function getCachedCurrentUser() {
  return currentUserCache;
}

export function clearCachedCurrentUser() {
  currentUserCache = null;
}

export function getDefaultLandingPath(role) {
  if (role === "super_admin") {
    return "/users";
  }
  return "/forms";
}

export async function fetchCaptcha() {
  return request("/api/auth/captcha");
}

export async function login(payload) {
  const result = await request("/api/auth/login", {
    method: "POST",
    body: JSON.stringify(payload),
  });
  resetAuthExpiredNotice();
  currentUserCache = result?.data?.user || null;
  return result;
}

export async function fetchCurrentUser(force = false) {
  if (!force && currentUserCache) {
    return currentUserCache;
  }

  const result = await request("/api/auth/me");
  resetAuthExpiredNotice();
  currentUserCache = result?.data?.user || null;
  return currentUserCache;
}

export async function logout() {
  const result = await request("/api/auth/logout", {
    method: "POST",
  });
  resetAuthExpiredNotice();
  currentUserCache = null;
  return result;
}

export async function changePassword(payload) {
  return request("/api/auth/change-password", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}
