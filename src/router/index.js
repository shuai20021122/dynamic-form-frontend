import { createRouter, createWebHistory } from "vue-router";

import { clearCachedCurrentUser, fetchCurrentUser, getDefaultLandingPath } from "../api/auth.js";
import { ApiError } from "../api/request.js";
import BilingualEditor from "../views/BilingualEditor.vue";
import AuthShell from "../views/AuthShell.vue";
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
    redirect: "/forms",
  },
  {
    path: "/login",
    name: "login",
    component: Login,
    meta: { guestOnly: true },
  },
  {
    path: "/",
    component: AuthShell,
    meta: { requiresAuth: true },
    children: [
      {
        path: "dashboard",
        redirect: "/forms",
      },
      {
        path: "users",
        name: "users",
        component: Users,
        meta: { title: "账号管理" },
      },
      {
        path: "teams",
        name: "teams",
        component: Teams,
        meta: { title: "团队管理" },
      },
      {
        path: "forms",
        name: "forms",
        component: Forms,
        meta: { title: "表单管理" },
      },
      {
        path: "forms/:id/designer",
        name: "form-designer",
        component: FormDesigner,
        meta: { title: "表格设计界面" },
      },
      {
        path: "forms/:id/fill",
        name: "form-fill",
        component: FormFill,
        meta: { title: "表单填写" },
      },
      {
        path: "history",
        name: "history",
        component: FormHistory,
        meta: { title: "历史表单" },
      },
      {
        path: "documents",
        name: "documents",
        component: Documents,
        meta: { title: "文档中心" },
      },
      {
        path: "documents/:id/bilingual-editor",
        name: "bilingual-editor",
        component: BilingualEditor,
        meta: { title: "编辑双语简表" },
      },
    ],
  },
];

const router = createRouter({
  history: createWebHistory(),
  routes,
});

function buildLoginRedirectTarget(to, error) {
  const query = {};

  if (to.fullPath !== "/forms") {
    query.redirect = to.fullPath;
  }

  if (!(error instanceof ApiError) || error.status !== 401) {
    query.error = "server";
  }

  return {
    path: "/login",
    query: Object.keys(query).length ? query : undefined,
  };
}

router.beforeEach(async (to) => {
  if (to.meta.requiresAuth) {
    try {
      await fetchCurrentUser();
    } catch (error) {
      clearCachedCurrentUser();
      return buildLoginRedirectTarget(to, error);
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
      return true;
    }
  }

  return true;
});

export default router;
