import { request } from "./request.js";

let currentUserCache = null;

export function getCachedCurrentUser() {
  return currentUserCache;
}

export function clearCachedCurrentUser() {
  currentUserCache = null;
}

export function getDefaultLandingPath(role) {
  if (role === "team_admin" || role === "personal" || role === "interviewer") {
    return "/forms";
  }
  return "/dashboard";
}

export async function fetchCaptcha() {
  return request("/api/auth/captcha");
}

export async function login(payload) {
  const result = await request("/api/auth/login", {
    method: "POST",
    body: JSON.stringify(payload),
  });
  currentUserCache = result?.data?.user || null;
  return result;
}

export async function fetchCurrentUser(force = false) {
  if (!force && currentUserCache) {
    return currentUserCache;
  }

  const result = await request("/api/auth/me");
  currentUserCache = result?.data?.user || null;
  return currentUserCache;
}

export async function logout() {
  const result = await request("/api/auth/logout", {
    method: "POST",
  });
  currentUserCache = null;
  return result;
}
