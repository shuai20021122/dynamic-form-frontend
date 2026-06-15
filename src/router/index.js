import { createRouter, createWebHistory } from "vue-router";

import { clearCachedCurrentUser, fetchCurrentUser, getDefaultLandingPath } from "../api/auth.js";
import { ApiError } from "../api/request.js";
import BilingualEditor from "../views/BilingualEditor.vue";
import Dashboard from "../views/Dashboard.vue";
import Documents from "../views/Documents.vue";
import FormDesigner from "../views/FormDesigner.vue";
import FormFill from "../views/FormFill.vue";
import FormHistory from "../views/FormHistory.vue";
import Forms from "../views/Forms.vue";
import Login from "../views/Login.vue";
import Teams from "../views/Teams.vue";
import Users from "../views/Users.vue";

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
  {
    path: "/users",
    name: "users",
    component: Users,
    meta: { requiresAuth: true },
  },
  {
    path: "/teams",
    name: "teams",
    component: Teams,
    meta: { requiresAuth: true },
  },
  {
    path: "/forms",
    name: "forms",
    component: Forms,
    meta: { requiresAuth: true },
  },
  {
    path: "/forms/:id/designer",
    name: "form-designer",
    component: FormDesigner,
    meta: { requiresAuth: true },
  },
  {
    path: "/forms/:id/fill",
    name: "form-fill",
    component: FormFill,
    meta: { requiresAuth: true },
  },
  {
    path: "/history",
    name: "history",
    component: FormHistory,
    meta: { requiresAuth: true },
  },
  {
    path: "/documents",
    name: "documents",
    component: Documents,
    meta: { requiresAuth: true },
  },
  {
    path: "/documents/:id/bilingual-editor",
    name: "bilingual-editor",
    component: BilingualEditor,
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
      const user = await fetchCurrentUser();
      return getDefaultLandingPath(user?.role);
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
