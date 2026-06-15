<script setup>
import { onMounted, ref } from "vue";
import { useRoute, useRouter } from "vue-router";

import { fetchCaptcha, login } from "../api/auth.js";

const router = useRouter();
const route = useRoute();

const username = ref("");
const password = ref("");
const captchaAnswer = ref("");
const captchaQuestion = ref("加载中...");
const submitting = ref(false);
const loadingCaptcha = ref(false);
const errorMessage = ref("");

async function loadCaptcha() {
  loadingCaptcha.value = true;
  errorMessage.value = "";
  try {
    const result = await fetchCaptcha();
    captchaQuestion.value = result?.data?.question || "请刷新验证码";
  } catch (error) {
    captchaQuestion.value = "验证码加载失败";
    errorMessage.value = error.message || "验证码加载失败";
  } finally {
    loadingCaptcha.value = false;
  }
}

async function handleSubmit() {
  submitting.value = true;
  errorMessage.value = "";
  try {
    await login({
      username: username.value.trim(),
      password: password.value,
      captcha_answer: captchaAnswer.value.trim(),
    });
    const redirect = typeof route.query.redirect === "string" ? route.query.redirect : "/dashboard";
    await router.push(redirect);
  } catch (error) {
    errorMessage.value = error.message || "登录失败";
    captchaAnswer.value = "";
    await loadCaptcha();
  } finally {
    submitting.value = false;
  }
}

onMounted(() => {
  loadCaptcha();
});
</script>

<template>
  <div class="login-page">
    <div class="login-card">
      <div class="login-header">
        <p class="eyebrow">Dynamic Form Frontend</p>
        <h1>登录</h1>
        <p class="login-copy">这是第二阶段的独立 Vue 前端最小闭环，当前只接入认证与 Dashboard 壳页。</p>
      </div>

      <form class="login-form" @submit.prevent="handleSubmit">
        <label class="field-block">
          <span>用户名</span>
          <input v-model="username" type="text" autocomplete="username" required />
        </label>

        <label class="field-block">
          <span>密码</span>
          <input v-model="password" type="password" autocomplete="current-password" required />
        </label>

        <div class="field-block">
          <div class="captcha-row">
            <div>
              <span class="field-label">验证码</span>
              <strong class="captcha-question">{{ captchaQuestion }}</strong>
            </div>
            <button class="ghost-button" type="button" :disabled="loadingCaptcha" @click="loadCaptcha">
              {{ loadingCaptcha ? "刷新中..." : "刷新" }}
            </button>
          </div>
          <input v-model="captchaAnswer" type="text" inputmode="numeric" required />
        </div>

        <p v-if="errorMessage" class="error-text">{{ errorMessage }}</p>

        <button class="primary-button" type="submit" :disabled="submitting">
          {{ submitting ? "登录中..." : "登录" }}
        </button>
      </form>
    </div>
  </div>
</template>
