<script setup>
import { onMounted, ref } from "vue";
import { useRoute, useRouter } from "vue-router";

import { fetchCaptcha, getDefaultLandingPath, login } from "../api/auth.js";

const router = useRouter();
const route = useRoute();

const username = ref("");
const password = ref("");
const captchaAnswer = ref("");
const captchaQuestion = ref("验证码加载中...");
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
    const result = await login({
      username: username.value.trim(),
      password: password.value,
      captcha_answer: captchaAnswer.value.trim(),
    });
    const role = result?.data?.user?.role || "";
    const redirect = typeof route.query.redirect === "string" ? route.query.redirect : getDefaultLandingPath(role);
    await router.push(redirect);
  } catch (error) {
    errorMessage.value = error.message || "登录失败";
    captchaAnswer.value = "";
    await loadCaptcha();
  } finally {
    submitting.value = false;
  }
}

onMounted(loadCaptcha);
</script>

<template>
  <div class="login-page">
    <div class="login-card">
      <div class="login-header">
        <div class="brand-mark large login-brand-mark">DF</div>
        <h1>动态表单协同管理系统</h1>
        <p>使用公司账号登录后台</p>
      </div>

      <form class="stack-form" @submit.prevent="handleSubmit">
        <label class="field-block">
          <span>用户名</span>
          <input class="login-input" v-model="username" type="text" autocomplete="username" required />
        </label>
        <label class="field-block">
          <span>密码</span>
          <input class="login-input" v-model="password" type="password" autocomplete="current-password" required />
        </label>
        <div class="field-block">
          <span>验证码</span>
          <div class="login-captcha-bar">
            <div class="login-captcha-question">{{ captchaQuestion }}</div>
            <button class="login-captcha-refresh" type="button" :disabled="loadingCaptcha" @click="loadCaptcha">
              换一个
            </button>
          </div>
          <input class="login-input" v-model="captchaAnswer" type="text" required />
        </div>
        <button class="btn btn-primary btn-block login-submit" type="submit" :disabled="submitting">登录</button>
      </form>

      <div v-if="errorMessage" class="error-alert" role="alert">{{ errorMessage }}</div>
    </div>
  </div>
</template>
