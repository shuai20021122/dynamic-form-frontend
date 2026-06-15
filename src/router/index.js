import { createRouter, createWebHistory } from "vue-router";

import { ApiError } from "../api/request.js";
import { clearCachedCurrentUser, fetchCurrentUser } from "../api/auth.js";
import Dashboard from "../views/Dashboard.vue";
import Login from "../views/Login.vue";

const routes = [
  {
    path: "/",
    redirect: "/dashboard",
  },
  {
    path: "/login",
    name: "login",
    component: Login,
    meta: { guestOnly: true },
  },
  {
    path: "/dashboard",
    name: "dashboard",
    component: Dashboard,
    meta: { requiresAuth: true },
  },
];

const router = createRouter({
  history: createWebHistory(),
  routes,
});

router.beforeEach(async (to) => {
  if (to.meta.requiresAuth) {
    try {
      await fetchCurrentUser();
    } catch (error) {
      clearCachedCurrentUser();
      if (error instanceof ApiError && error.status === 401) {
        return {
          path: "/login",
          query: to.fullPath !== "/dashboard" ? { redirect: to.fullPath } : undefined,
        };
      }
      throw error;
    }
  }

  if (to.meta.guestOnly) {
    try {
      await fetchCurrentUser();
      return "/dashboard";
    } catch (error) {
      clearCachedCurrentUser();
      if (error instanceof ApiError && error.status === 401) {
        return true;
      }
      throw error;
    }
  }

  return true;
});

export default router;
