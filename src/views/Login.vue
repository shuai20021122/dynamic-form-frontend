<script setup>
import { computed, onMounted, reactive, ref } from "vue";
import { useRoute, useRouter } from "vue-router";

import bossKnowLogo from "../assets/boss-know-logo.png";
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
const showPassword = ref(false);
const credentialError = ref(false);
const fieldErrors = reactive({
  username: "",
  password: "",
  captcha: "",
});

const usernameRule = /^[A-Za-z0-9]{5,12}$/;
const passwordRule = /^(?=.*[A-Za-z])(?=.*\d)(?=.*[^A-Za-z\d\s])\S{6,18}$/;
const captchaRule = /^\d+$/;

const passwordInputType = computed(() => (showPassword.value ? "text" : "password"));

function clearCredentialErrors() {
  credentialError.value = false;

  if (fieldErrors.password === "账号或密码不正确") {
    fieldErrors.password = "";
  }
}

function setCredentialError() {
  credentialError.value = true;
  fieldErrors.password = "账号或密码不正确";
}

function validateUsername() {
  const value = username.value.trim();

  if (!value) {
    fieldErrors.username = "账号不能为空，请输入5-12位字母或数字";
    return false;
  }

  if (!usernameRule.test(value)) {
    fieldErrors.username = "账号格式错误，请输入5-12位字母或数字";
    return false;
  }

  if (!credentialError.value) {
    fieldErrors.username = "";
  }

  fieldErrors.username = "";
  return true;
}

function validatePassword() {
  const value = password.value;

  if (!value) {
    fieldErrors.password = "密码不能为空，请输入6-18位并包含字母、数字、符号";
    return false;
  }

  if (!passwordRule.test(value)) {
    fieldErrors.password = "密码格式错误，请输入6-18位并包含字母、数字、符号";
    return false;
  }

  fieldErrors.password = "";
  return true;
}

function validateCaptcha() {
  const value = captchaAnswer.value.trim();

  if (!value) {
    fieldErrors.captcha = "验证码不能为空，只能输入数字";
    return false;
  }

  if (!captchaRule.test(value)) {
    fieldErrors.captcha = "验证码格式错误，只能输入数字";
    return false;
  }

  fieldErrors.captcha = "";
  return true;
}

function validateForm() {
  const isUsernameValid = validateUsername();
  const isPasswordValid = validatePassword();
  const isCaptchaValid = validateCaptcha();

  return isUsernameValid && isPasswordValid && isCaptchaValid;
}

function handleUsernameInput() {
  errorMessage.value = "";
  clearCredentialErrors();

  if (fieldErrors.username) {
    validateUsername();
  }
}

function handlePasswordInput() {
  errorMessage.value = "";
  clearCredentialErrors();

  if (fieldErrors.password) {
    validatePassword();
  }
}

function handleCaptchaInput(event) {
  captchaAnswer.value = String(event.target.value || "").replace(/\D/g, "");
  errorMessage.value = "";

  if (fieldErrors.captcha) {
    validateCaptcha();
  }
}

function resolveLoginError(error) {
  const message = String(error?.message || "");
  const normalizedMessage = message.toLowerCase();

  if (normalizedMessage.includes("captcha") || message.includes("验证码")) {
    fieldErrors.captcha = "验证码错误，请重新输入";
    return "";
  }

  if (
    normalizedMessage.includes("username") ||
    normalizedMessage.includes("password") ||
    normalizedMessage.includes("account") ||
    message.includes("账号") ||
    message.includes("用户名") ||
    message.includes("密码")
  ) {
    setCredentialError();
    return "";
  }

  if (error?.status === 401 || error?.status === 403) {
    setCredentialError();
    return "";
  }

  return message || "登录失败，请稍后重试";
}

async function loadCaptcha() {
  loadingCaptcha.value = true;
  errorMessage.value = "";
  fieldErrors.captcha = "";

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
  errorMessage.value = "";
  clearCredentialErrors();

  if (!validateForm()) {
    return;
  }

  submitting.value = true;

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
    errorMessage.value = resolveLoginError(error);
    captchaAnswer.value = "";
    await loadCaptcha();
  } finally {
    submitting.value = false;
  }
}

function togglePasswordVisibility() {
  showPassword.value = !showPassword.value;
}

onMounted(loadCaptcha);
</script>

<template>
  <div class="login-page login-page--boss">
    <section class="login-showcase">
      <img class="login-showcase-logo" :src="bossKnowLogo" alt="Bossknow 总知" />
      <h1 class="login-showcase-title">总知管理平台</h1>
      <p class="login-showcase-subtitle">Bossknow Management Platform</p>
    </section>

    <section class="login-card login-card--boss">
      <div class="login-header login-header--boss">
        <img class="login-header-logo" :src="bossKnowLogo" alt="Bossknow 总知" />
      </div>

      <form class="login-form login-form--boss" novalidate @submit.prevent="handleSubmit">
        <div class="login-form-section">
          <label class="login-form-label" for="login-username">账号</label>
          <div class="login-form-control login-input-wrap" :class="{ 'login-input-wrap--error': fieldErrors.username || credentialError }">
            <span class="login-input-icon" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none">
                <circle cx="12" cy="8" r="3.5" stroke="currentColor" stroke-width="1.8" />
                <path d="M4.5 19.5C6.4 16.6 9 15.25 12 15.25C15 15.25 17.6 16.6 19.5 19.5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" />
              </svg>
            </span>
            <input
              id="login-username"
              v-model="username"
              class="login-input login-input--boss"
              type="text"
              autocomplete="username"
              placeholder="请输入账号"
              @input="handleUsernameInput"
              @blur="validateUsername"
            />
          </div>
          <p v-if="fieldErrors.username" class="login-field-error" role="alert">{{ fieldErrors.username }}</p>
        </div>

        <div class="login-form-section">
          <label class="login-form-label" for="login-password">密码</label>
          <div class="login-form-control login-input-wrap" :class="{ 'login-input-wrap--error': fieldErrors.password }">
            <span class="login-input-icon" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none">
                <path d="M8 10V7.5C8 5.29 9.79 3.5 12 3.5C14.21 3.5 16 5.29 16 7.5V10" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" />
                <rect x="5" y="10" width="14" height="10" rx="2.2" stroke="currentColor" stroke-width="1.8" />
                <path d="M12 13.5V16.5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" />
              </svg>
            </span>
            <input
              id="login-password"
              v-model="password"
              class="login-input login-input--boss login-input--with-trailing"
              :type="passwordInputType"
              autocomplete="current-password"
              placeholder="请输入密码"
              @input="handlePasswordInput"
              @blur="validatePassword"
            />
            <button class="login-input-toggle" type="button" @click="togglePasswordVisibility">
              <svg v-if="showPassword" viewBox="0 0 24 24" fill="none">
                <path d="M3 12C5.3 8.35 8.31 6.52 12 6.52C15.69 6.52 18.7 8.35 21 12C18.7 15.65 15.69 17.48 12 17.48C8.31 17.48 5.3 15.65 3 12Z" stroke="currentColor" stroke-width="1.8" />
                <circle cx="12" cy="12" r="2.7" stroke="currentColor" stroke-width="1.8" />
              </svg>
              <svg v-else viewBox="0 0 24 24" fill="none">
                <path d="M3 12C5.3 8.35 8.31 6.52 12 6.52C15.69 6.52 18.7 8.35 21 12C18.7 15.65 15.69 17.48 12 17.48C8.31 17.48 5.3 15.65 3 12Z" stroke="currentColor" stroke-width="1.8" />
                <circle cx="12" cy="12" r="2.7" stroke="currentColor" stroke-width="1.8" />
                <path d="M4 20L20 4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" />
              </svg>
            </button>
          </div>
          <p v-if="fieldErrors.password" class="login-field-error" role="alert">{{ fieldErrors.password }}</p>
        </div>

        <div class="login-form-section">
          <label class="login-form-label" for="login-captcha">验证码</label>
          <div class="login-form-control login-captcha-layout">
            <div class="login-input-wrap login-captcha-input" :class="{ 'login-input-wrap--error': fieldErrors.captcha }">
              <span class="login-input-icon" aria-hidden="true">
                <svg viewBox="0 0 24 24" fill="none">
                  <path d="M12 3.8L18.2 6.2V11.8C18.2 15.74 15.55 19.34 12 20.2C8.45 19.34 5.8 15.74 5.8 11.8V6.2L12 3.8Z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" />
                  <path d="M9.4 12.1L11.2 13.9L14.8 10.2" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" />
                </svg>
              </span>
              <input
                id="login-captcha"
                v-model="captchaAnswer"
                class="login-input login-input--boss"
                type="text"
                placeholder="请输入验证码"
                inputmode="numeric"
                @input="handleCaptchaInput"
                @blur="validateCaptcha"
              />
            </div>
            <button
              class="login-captcha-code"
              type="button"
              :disabled="loadingCaptcha"
              @click="loadCaptcha"
              :title="loadingCaptcha ? '验证码刷新中' : '点击刷新验证码'"
            >
              {{ loadingCaptcha ? "刷新中..." : captchaQuestion }}
            </button>
          </div>
          <p v-if="fieldErrors.captcha" class="login-field-error" role="alert">{{ fieldErrors.captcha }}</p>
        </div>

        <p v-if="errorMessage" class="error-alert login-error-alert" role="alert">{{ errorMessage }}</p>

        <button class="btn btn-primary btn-block login-submit login-submit--boss" type="submit" :disabled="submitting">
          {{ submitting ? "登录中..." : "登录" }}
        </button>
      </form>
    </section>
  </div>
</template>
