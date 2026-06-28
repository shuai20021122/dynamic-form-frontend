<script setup>
import { computed, onMounted, reactive, ref } from "vue";
import { useRoute, useRouter } from "vue-router";

import bossKnowLogo from "../assets/boss-know-logo.png";
import blueBossKnowLogo from "../assets/zz-logo-login.png";
import { fetchCaptcha, getDefaultLandingPath, login } from "../api/auth.js";
import LoginParticleField from "../components/LoginParticleField.vue";
import { t } from "../stores/uiLanguage.js";

const router = useRouter();
const route = useRoute();

const username = ref("");
const password = ref("");
const captchaAnswer = ref("");
const captchaQuestion = ref("");
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

const usernameRule = /^[A-Za-z0-9._@-]{5,32}$/;
const passwordRule = /^(?=.*[A-Za-z])(?=.*\d)(?=.*[^A-Za-z\d\s])\S{6,18}$/;
const captchaRule = /^\d+$/;

const passwordInputType = computed(() => (showPassword.value ? "text" : "password"));
const serverErrorMessage = computed(() =>
  route.query.error === "server" ? "链路服务暂时不可用，请稍后重试。" : ""
);

function clearCredentialErrors() {
  credentialError.value = false;
  if (fieldErrors.password === t("login.credentialIncorrect")) {
    fieldErrors.password = "";
  }
}

function setCredentialError() {
  credentialError.value = true;
  fieldErrors.password = t("login.credentialIncorrect");
}

function validateUsername() {
  const value = username.value.trim();
  if (!value) {
    fieldErrors.username = t("login.usernameRequired");
    return false;
  }
  if (!usernameRule.test(value)) {
    fieldErrors.username = t("login.usernameInvalid");
    return false;
  }
  fieldErrors.username = "";
  return true;
}

function validatePassword() {
  const value = password.value;
  if (!value) {
    fieldErrors.password = t("login.passwordRequired");
    return false;
  }
  if (!passwordRule.test(value)) {
    fieldErrors.password = t("login.passwordInvalid");
    return false;
  }
  fieldErrors.password = "";
  return true;
}

function validateCaptcha() {
  const value = captchaAnswer.value.trim();
  if (!value) {
    fieldErrors.captcha = t("login.captchaRequired");
    return false;
  }
  if (!captchaRule.test(value)) {
    fieldErrors.captcha = t("login.captchaInvalid");
    return false;
  }
  fieldErrors.captcha = "";
  return true;
}

function validateForm() {
  return validateUsername() && validatePassword() && validateCaptcha();
}

function handleUsernameInput() {
  errorMessage.value = "";
  clearCredentialErrors();
  if (fieldErrors.username) validateUsername();
}

function handlePasswordInput() {
  errorMessage.value = "";
  clearCredentialErrors();
  if (fieldErrors.password) validatePassword();
}

function handleCaptchaInput(event) {
  captchaAnswer.value = String(event.target.value || "").replace(/\D/g, "");
  errorMessage.value = "";
  if (fieldErrors.captcha) validateCaptcha();
}

function resolveLoginError(error) {
  const message = String(error?.message || "");
  const normalizedMessage = message.toLowerCase();

  if (error?.status >= 500) {
    return "后端服务当前不可用，请先确认后端已启动，或检查 VITE_API_PROXY_TARGET 是否指向正确地址。";
  }

  if (normalizedMessage.includes("captcha") || message.includes("验证码")) {
    fieldErrors.captcha = t("login.captchaIncorrect");
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

  return message || t("login.failed");
}

async function loadCaptcha() {
  loadingCaptcha.value = true;
  errorMessage.value = "";
  fieldErrors.captcha = "";

  try {
    const result = await fetchCaptcha();
    captchaQuestion.value = result?.data?.question || t("login.refreshCaptcha");
  } catch (error) {
    captchaQuestion.value = t("login.captchaFailed");
    errorMessage.value =
      error?.status >= 500 ? "验证码加载失败：后端服务未连接，请检查后端是否启动。" : error.message || t("login.captchaFailed");
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
    <LoginParticleField />

    <section class="login-showcase">
      <img class="login-showcase-logo" :src="bossKnowLogo" alt="Bossknow" />
      <h1 class="login-showcase-title">{{ t("login.showcaseTitle") }}</h1>
      <p class="login-showcase-subtitle">{{ t("login.showcaseSubtitle") }}</p>
    </section>

    <section class="login-card login-card--boss">
      <div class="login-header login-header--boss">
        <img class="login-header-logo" :src="blueBossKnowLogo" alt="Bossknow" />
      </div>

      <form class="login-form login-form--boss" novalidate @submit.prevent="handleSubmit">
        <div class="login-form-section">
          <label class="login-form-label" for="login-username">{{ t("login.username") }}</label>
          <div class="login-form-control login-input-wrap" :class="{ 'login-input-wrap--error': fieldErrors.username || credentialError }">
            <input
              id="login-username"
              v-model="username"
              class="login-input login-input--boss"
              type="text"
              autocomplete="username"
              :placeholder="t('login.enterUsername')"
              @input="handleUsernameInput"
              @blur="validateUsername"
            />
          </div>
          <p v-if="fieldErrors.username" class="login-field-error" role="alert">{{ fieldErrors.username }}</p>
        </div>

        <div class="login-form-section">
          <label class="login-form-label" for="login-password">{{ t("login.password") }}</label>
          <div class="login-form-control login-input-wrap" :class="{ 'login-input-wrap--error': fieldErrors.password }">
            <input
              id="login-password"
              v-model="password"
              class="login-input login-input--boss login-input--with-trailing"
              :type="passwordInputType"
              autocomplete="current-password"
              :placeholder="t('login.enterPassword')"
              @input="handlePasswordInput"
              @blur="validatePassword"
            />
            <button class="login-input-toggle" type="button" @click="togglePasswordVisibility">
              {{ showPassword ? "隐藏" : "显示" }}
            </button>
          </div>
          <p v-if="fieldErrors.password" class="login-field-error" role="alert">{{ fieldErrors.password }}</p>
        </div>

        <div class="login-form-section">
          <label class="login-form-label" for="login-captcha">{{ t("login.captcha") }}</label>
          <div class="login-form-control login-captcha-layout">
            <div class="login-input-wrap login-captcha-input" :class="{ 'login-input-wrap--error': fieldErrors.captcha }">
              <input
                id="login-captcha"
                v-model="captchaAnswer"
                class="login-input login-input--boss"
                type="text"
                :placeholder="t('login.enterCaptcha')"
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
              :title="loadingCaptcha ? t('login.refreshingCaptcha') : t('login.refreshCaptcha')"
            >
              {{ loadingCaptcha ? t("common.loading") : captchaQuestion || t("login.captchaLoading") }}
            </button>
          </div>
          <p v-if="fieldErrors.captcha" class="login-field-error" role="alert">{{ fieldErrors.captcha }}</p>
        </div>

        <p v-if="serverErrorMessage" class="error-alert login-error-alert" role="alert">{{ serverErrorMessage }}</p>
        <p v-if="errorMessage" class="error-alert login-error-alert" role="alert">{{ errorMessage }}</p>

        <button class="btn btn-primary btn-block login-submit login-submit--boss" type="submit" :disabled="submitting">
          {{ submitting ? t("login.loggingIn") : t("login.login") }}
        </button>
      </form>
    </section>
  </div>
</template>
