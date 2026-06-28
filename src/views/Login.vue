<script setup>
import { computed, onBeforeUnmount, onMounted, reactive, ref } from "vue";
import { useRoute, useRouter } from "vue-router";

import { fetchCaptcha, getDefaultLandingPath, login } from "../api/auth.js";
import { t } from "../stores/uiLanguage.js";

const router = useRouter();
const route = useRoute();

const codeCanvasRef = ref(null);
const username = ref("");
const password = ref("");
const captchaAnswer = ref("");
const captchaQuestion = ref("");
const submitting = ref(false);
const loadingCaptcha = ref(false);
const errorMessage = ref("");
const showPassword = ref(false);
const credentialError = ref(false);
const loginModalOpen = ref(false);
const fieldErrors = reactive({
  username: "",
  password: "",
  captcha: "",
});

const usernameRule = /^[A-Za-z0-9._@-]{5,32}$/;
const passwordRule = /^(?=.*[A-Za-z])(?=.*\d)(?=.*[^A-Za-z\d\s])\S{6,18}$/;
const captchaRule = /^\d+$/;

const passwordInputType = computed(() => (showPassword.value ? "text" : "password"));
const isEnglish = computed(() => t("login.login") === "Sign In");
const serverErrorMessage = computed(() =>
  route.query.error === "server" ? "服务暂时不可用，请稍后重试。" : ""
);
const loginSubheading = computed(() =>
  isEnglish.value ? "Access the Bossknow admin workspace" : "进入 Bossknow 管理后台"
);
const loginModalTitle = computed(() =>
  isEnglish.value ? "Sign in to your account" : "登入你的账户"
);
const brandSubline = computed(() => "链接全球智慧·赋能中国企业");
const primaryActionLabel = computed(() => (isEnglish.value ? "Sign In" : "登录"));

let animationFrameId = 0;
let lastFrameTime = 0;
let width = 0;
let height = 0;
let dpr = 1;
let rows = [];

const canvasConfig = {
  fontSize: 14,
  rowGap: 18,
  speedMin: 16,
  speedMax: 58,
  alphaMin: 0.42,
  alphaMax: 0.9,
  lineGap: 64,
};

const fakeCodeSnippets = [
  "const session = await auth.verify(token);",
  "if (user.role === 'admin') grant(access);",
  "form.entries.map(item => sync(item.id));",
  "await api.post('/workflow/approve', payload);",
  "function resolveTeamScope(actor, formId) { return scope; }",
  "const cacheKey = `team:${teamId}:forms`;",
  "return permissions.includes('view_forms');",
  "db.transaction(() => saveDraft(editorState));",
  "const next = queue.shift() || createTask();",
  "router.beforeEach((to, from, next) => next());",
  "if (!entry.isActive) throw new AccessError();",
  "const profile = normalizeCandidate(rawPayload);",
  "export const status = computed(() => state.ready);",
  "await translate.resume(source, { mode: 'bilingual' });",
  "while (jobs.length) await worker.run(jobs.pop());",
  "const result = await service.generateDocument(id);",
  "return response.json({ code: 200, data });",
  "watchEffect(() => preload(currentRoute.value));",
  "const rules = ['view', 'edit', 'export'];",
  "if (scope.teamId !== actor.teamId) return null;",
];

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
    return "后端服务当前不可用，请确认服务已经启动。";
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
      error?.status >= 500
        ? "验证码加载失败，请检查后端服务连接。"
        : error.message || t("login.captchaFailed");
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
    const redirect =
      typeof route.query.redirect === "string"
        ? route.query.redirect
        : getDefaultLandingPath(role);
    loginModalOpen.value = false;
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

function openLoginModal() {
  loginModalOpen.value = true;
  errorMessage.value = "";
}

function closeLoginModal() {
  loginModalOpen.value = false;
  errorMessage.value = "";
}

function handleWindowKeydown(event) {
  if (event.key === "Escape" && loginModalOpen.value) {
    closeLoginModal();
  }
}

function randomBetween(min, max) {
  return min + Math.random() * (max - min);
}

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function smoothstep(edge0, edge1, x) {
  const tValue = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return tValue * tValue * (3 - 2 * tValue);
}

function wrap(value, max) {
  return ((value % max) + max) % max;
}

function createCodeLine() {
  const parts = [];
  const count = Math.floor(randomBetween(3, 6));

  for (let i = 0; i < count; i += 1) {
    parts.push(pick(fakeCodeSnippets));
  }

  return parts.join("    ");
}

function createRows(ctx) {
  rows = [];
  ctx.font = `${canvasConfig.fontSize}px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace`;

  const startY = Math.floor(height * 0.04);
  const endY = Math.floor(height * 0.92);

  let rowIndex = 0;

  for (let y = startY; y <= endY; y += canvasConfig.rowGap) {
    const text = createCodeLine();
    const textWidth = ctx.measureText(text).width;
    const patternWidth = Math.max(textWidth + canvasConfig.lineGap, width * 1.4);

    rows.push({
      y,
      text,
      textWidth,
      patternWidth,
      direction: rowIndex % 2 === 0 ? 1 : -1,
      speed: randomBetween(canvasConfig.speedMin, canvasConfig.speedMax),
      offset: Math.random() * patternWidth,
      alpha: randomBetween(canvasConfig.alphaMin, canvasConfig.alphaMax),
    });

    rowIndex += 1;
  }
}

function maskValue(x, y) {
  const cx = width / 2;
  const nx = (x - cx) / Math.min(width, 900);
  const ny = (y - height / 2) / Math.min(height, 1200);

  const verticalCore = Math.exp(-Math.pow(nx * 1.18, 2));
  const sideGlow = Math.exp(-Math.pow(Math.abs(nx) * 0.9, 2));
  const waveA = Math.sin(nx * 15 + ny * 8) * 0.5 + 0.5;
  const waveB = Math.cos(nx * 7 - ny * 17) * 0.5 + 0.5;
  const ring = Math.abs(Math.sin((nx * nx * 5.2 + ny * ny * 7.4) * Math.PI));

  const topFade = smoothstep(0.025, 0.15, y / height);
  const bottomFade = 1 - smoothstep(0.86, 1, y / height);

  const shape =
    verticalCore * 1.08 +
    sideGlow * 0.18 +
    waveA * 0.22 +
    waveB * 0.16 +
    ring * 0.22;

  return Math.max(0, Math.min(1, shape * topFade * bottomFade * 1.64));
}

function drawBackground(ctx) {
  ctx.fillStyle = "#151717";
  ctx.fillRect(0, 0, width, height);

  const glow = ctx.createRadialGradient(
    width / 2,
    height / 2,
    0,
    width / 2,
    height / 2,
    Math.min(width, height) * 0.62
  );

  glow.addColorStop(0, "rgba(255,255,255,0.24)");
  glow.addColorStop(0.32, "rgba(255,255,255,0.11)");
  glow.addColorStop(0.62, "rgba(255,255,255,0.026)");
  glow.addColorStop(1, "rgba(255,255,255,0)");

  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, width, height);
}

function drawRows(ctx, delta) {
  ctx.save();
  ctx.textBaseline = "middle";
  ctx.font = `${canvasConfig.fontSize}px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace`;

  for (const row of rows) {
    row.offset = wrap(row.offset + row.direction * row.speed * delta, row.patternWidth);

    for (let repeat = -2; repeat <= 3; repeat += 1) {
      let x = repeat * row.patternWidth + row.offset;

      if (row.direction === -1) {
        x = width - x;
      }

      x -= row.patternWidth / 2;

      if (x > width + row.textWidth || x < -row.textWidth - 120) {
        continue;
      }

      const mask = maskValue(x + row.textWidth / 2, row.y);
      if (mask < 0.03) {
        continue;
      }

      const alpha = Math.min(1, row.alpha * mask * 2.7);
      if (alpha < 0.02) {
        continue;
      }

      ctx.fillStyle = `rgba(250, 251, 251, ${alpha})`;
      ctx.fillText(row.text, x, row.y);
    }
  }

  ctx.restore();
}

function resizeCanvas() {
  const canvas = codeCanvasRef.value;
  if (!canvas) return;

  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  width = window.innerWidth;
  height = window.innerHeight;
  dpr = Math.min(window.devicePixelRatio || 1, 2);

  canvas.width = Math.floor(width * dpr);
  canvas.height = Math.floor(height * dpr);
  canvas.style.width = `${width}px`;
  canvas.style.height = `${height}px`;

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  createRows(ctx);
}

function animateCanvas(now) {
  const canvas = codeCanvasRef.value;
  const ctx = canvas?.getContext("2d");
  if (!canvas || !ctx) return;

  if (!lastFrameTime) {
    lastFrameTime = now;
  }

  const delta = Math.min(0.035, (now - lastFrameTime) / 1000);
  lastFrameTime = now;

  drawBackground(ctx);
  drawRows(ctx, delta);

  animationFrameId = window.requestAnimationFrame(animateCanvas);
}

function startCanvas() {
  lastFrameTime = 0;
  resizeCanvas();
  if (animationFrameId) {
    window.cancelAnimationFrame(animationFrameId);
  }
  animationFrameId = window.requestAnimationFrame(animateCanvas);
}

onMounted(async () => {
  await loadCaptcha();
  startCanvas();
  window.addEventListener("resize", resizeCanvas);
  window.addEventListener("keydown", handleWindowKeydown);
});

onBeforeUnmount(() => {
  window.removeEventListener("resize", resizeCanvas);
  window.removeEventListener("keydown", handleWindowKeydown);
  if (animationFrameId) {
    window.cancelAnimationFrame(animationFrameId);
  }
});
</script>

<template>
  <main class="login-page">
    <canvas ref="codeCanvasRef" class="login-page__canvas"></canvas>
    <div class="login-page__shade"></div>

    <section class="login-page__content">
      <div class="login-page__brand" aria-hidden="true">
        <div class="login-page__brand-main">
          <span class="login-page__brand-en">BOSSKNOW</span>
          <span class="login-page__brand-cn">总知</span>
        </div>
        <div class="login-page__brand-sub">{{ brandSubline }}</div>
      </div>

      <div class="login-page__actions">
        <button class="login-page__signin" type="button" @click="openLoginModal">
          {{ primaryActionLabel }}
        </button>
      </div>
    </section>

    <transition name="login-modal-fade">
      <div v-if="loginModalOpen" class="login-modal-backdrop" @click.self="closeLoginModal">
        <section class="login-modal-card">
          <div class="login-modal-head">
            <h1 class="login-modal-title">{{ loginModalTitle }}</h1>
            <p class="login-modal-copy">{{ loginSubheading }}</p>
          </div>

          <form class="login-modal-form" novalidate @submit.prevent="handleSubmit">
            <label class="login-modal-field">
              <span class="login-modal-label">{{ t("login.username") }}</span>
              <input
                v-model="username"
                class="login-modal-input"
                :class="{ 'is-error': fieldErrors.username || credentialError }"
                type="text"
                autocomplete="username"
                :placeholder="t('login.enterUsername')"
                @input="handleUsernameInput"
                @blur="validateUsername"
              />
              <small v-if="fieldErrors.username" class="login-modal-error">{{ fieldErrors.username }}</small>
            </label>

            <label class="login-modal-field">
              <span class="login-modal-label">{{ t("login.password") }}</span>
              <div class="login-modal-password-box">
                <input
                  v-model="password"
                  class="login-modal-input"
                  :class="{ 'is-error': fieldErrors.password }"
                  :type="passwordInputType"
                  autocomplete="current-password"
                  :placeholder="t('login.enterPassword')"
                  @input="handlePasswordInput"
                  @blur="validatePassword"
                />
                <button class="login-modal-icon-toggle" type="button" @click="togglePasswordVisibility">
                  <svg v-if="showPassword" viewBox="0 0 24 24" aria-hidden="true">
                    <path
                      d="M3 3l18 18m-9-3c-4.2 0-7.9-2.3-10-6 1-1.8 2.4-3.3 4.2-4.3m3-1.1A10.4 10.4 0 0112 6c4.2 0 7.9 2.3 10 6a12 12 0 01-3.7 4.1M10.6 10.6a2 2 0 002.8 2.8"
                      fill="none"
                      stroke="currentColor"
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      stroke-width="1.8"
                    />
                  </svg>
                  <svg v-else viewBox="0 0 24 24" aria-hidden="true">
                    <path
                      d="M2 12s3.6-6 10-6 10 6 10 6-3.6 6-10 6S2 12 2 12zm10 3a3 3 0 100-6 3 3 0 000 6z"
                      fill="none"
                      stroke="currentColor"
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      stroke-width="1.8"
                    />
                  </svg>
                </button>
              </div>
              <small v-if="fieldErrors.password" class="login-modal-error">{{ fieldErrors.password }}</small>
            </label>

            <label class="login-modal-field">
              <span class="login-modal-label">{{ t("login.captcha") }}</span>
              <div class="login-modal-inline">
                <input
                  v-model="captchaAnswer"
                  class="login-modal-input"
                  :class="{ 'is-error': fieldErrors.captcha }"
                  type="text"
                  inputmode="numeric"
                  :placeholder="t('login.enterCaptcha')"
                  @input="handleCaptchaInput"
                  @blur="validateCaptcha"
                />
                <button
                  class="login-modal-mini login-modal-mini--captcha"
                  type="button"
                  :disabled="loadingCaptcha"
                  @click="loadCaptcha"
                  :title="loadingCaptcha ? t('login.refreshingCaptcha') : t('login.refreshCaptcha')"
                >
                  {{ loadingCaptcha ? t("common.loading") : captchaQuestion || t("login.captchaLoading") }}
                </button>
              </div>
              <small v-if="fieldErrors.captcha" class="login-modal-error">{{ fieldErrors.captcha }}</small>
            </label>

            <p v-if="serverErrorMessage" class="login-modal-alert" role="alert">{{ serverErrorMessage }}</p>
            <p v-if="errorMessage" class="login-modal-alert" role="alert">{{ errorMessage }}</p>

            <button class="login-modal-submit" type="submit" :disabled="submitting">
              {{ submitting ? t("login.loggingIn") : primaryActionLabel }}
            </button>
          </form>
        </section>
      </div>
    </transition>
  </main>
</template>

<style scoped>
:global(html),
:global(body),
:global(#app) {
  width: 100%;
  height: 100%;
  margin: 0;
  overflow: hidden;
  background: #151717;
}

* {
  box-sizing: border-box;
}

.login-page {
  position: relative;
  width: 100%;
  height: 100dvh;
  min-height: 100dvh;
  overflow: hidden;
  background:
    radial-gradient(circle at center, rgba(255, 255, 255, 0.09), transparent 44%),
    linear-gradient(180deg, #151717 0%, #101212 100%);
  color: #e8e8e8;
  isolation: isolate;
}

.login-page::after {
  content: "";
  position: absolute;
  inset: 0;
  z-index: 2;
  pointer-events: none;
  background:
    radial-gradient(circle at center, rgba(255, 255, 255, 0.1) 0%, rgba(255, 255, 255, 0.05) 18%, rgba(255, 255, 255, 0.015) 34%, rgba(0, 0, 0, 0) 52%),
    radial-gradient(circle at center, rgba(0, 0, 0, 0) 44%, rgba(0, 0, 0, 0.2) 66%, rgba(0, 0, 0, 0.48) 82%, rgba(0, 0, 0, 0.72) 100%),
    radial-gradient(circle at top left, rgba(0, 0, 0, 0) 10%, rgba(0, 0, 0, 0.76) 100%),
    radial-gradient(circle at top right, rgba(0, 0, 0, 0) 10%, rgba(0, 0, 0, 0.76) 100%),
    radial-gradient(circle at bottom left, rgba(0, 0, 0, 0) 10%, rgba(0, 0, 0, 0.76) 100%),
    radial-gradient(circle at bottom right, rgba(0, 0, 0, 0) 10%, rgba(0, 0, 0, 0.76) 100%);
}

.login-page__canvas {
  position: absolute;
  inset: 0;
  z-index: 1;
  width: 100%;
  height: 100%;
  display: block;
}

.login-page__shade {
  position: absolute;
  inset: 0;
  z-index: 1;
  pointer-events: none;
  background:
    linear-gradient(180deg, rgba(21, 23, 23, 0.02), rgba(21, 23, 23, 0.14));
}

.login-page__content {
  position: relative;
  z-index: 3;
  width: 100%;
  height: 100%;
}

.login-page__brand {
  position: absolute;
  top: 47%;
  left: 50%;
  transform: translate(-50%, -50%);
  display: flex;
  flex-direction: column;
  align-items: center;
  user-select: none;
}

.login-page__brand-main {
  display: flex;
  align-items: baseline;
  gap: 10px;
  line-height: 1;
  text-shadow: 0 0 32px rgba(255, 255, 255, 0.18);
  font-family: Inter, "Arial Black", "PingFang SC", "Microsoft YaHei", sans-serif;
  font-weight: 900;
}

.login-page__brand-en {
  font-size: clamp(46px, 7vw, 78px);
  font-weight: 900;
  letter-spacing: -0.075em;
  color: rgba(235, 235, 235, 0.94);
  font-family: Inter, "Arial Black", sans-serif;
}

.login-page__brand-cn {
  font-size: clamp(28px, 4vw, 46px);
  font-weight: 900;
  color: rgba(235, 235, 235, 0.9);
  letter-spacing: -0.05em;
  font-family: Inter, "PingFang SC", "Microsoft YaHei", "SimHei", sans-serif;
}

.login-page__brand-sub {
  position: relative;
  margin-top: 18px;
  padding: 0 54px;
  font-size: 11px;
  letter-spacing: 1.1em;
  color: rgba(220, 220, 220, 0.62);
  white-space: nowrap;
}

.login-page__brand-sub::before,
.login-page__brand-sub::after {
  content: "";
  position: absolute;
  top: 50%;
  width: 38px;
  height: 1px;
  background: rgba(220, 220, 220, 0.46);
}

.login-page__brand-sub::before {
  left: 0;
}

.login-page__brand-sub::after {
  right: 0;
}

.login-page__actions {
  position: absolute;
  bottom: 76px;
  left: 50%;
  transform: translateX(-50%);
  width: min(300px, 78vw);
}

.login-page__signin {
  width: 100%;
  height: 54px;
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 999px;
  background: #e7e7e7;
  color: #1c1d1d;
  font-size: 16px;
  font-weight: 700;
  cursor: pointer;
  transition: transform 0.25s ease, background 0.25s ease;
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.8),
    0 12px 30px rgba(0, 0, 0, 0.28);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
}

.login-page__signin:hover {
  background: #ffffff;
  transform: translateY(-1px);
}

.login-modal-backdrop {
  position: fixed;
  inset: 0;
  z-index: 8;
  display: grid;
  place-items: center;
  padding: 24px 16px;
  background: rgba(7, 9, 10, 0.28);
  backdrop-filter: blur(18px) saturate(140%);
}

.login-modal-card {
  width: min(440px, calc(100vw - 32px));
  position: relative;
  overflow: hidden;
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 34px;
  background:
    linear-gradient(180deg, rgba(255, 255, 255, 0.09), rgba(255, 255, 255, 0.02)),
    linear-gradient(135deg, rgba(255, 255, 255, 0.06), transparent 26%, transparent 62%, rgba(255, 255, 255, 0.035) 100%),
    rgba(17, 20, 24, 0.72);
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.24),
    inset 0 -1px 0 rgba(255, 255, 255, 0.03),
    0 30px 72px rgba(0, 0, 0, 0.42);
  backdrop-filter: blur(30px) saturate(145%);
  -webkit-backdrop-filter: blur(30px) saturate(145%);
  padding: 30px 30px 26px;
}

.login-modal-card::before {
  content: "";
  position: absolute;
  inset: 0;
  pointer-events: none;
  background:
    radial-gradient(circle at 12% 0%, rgba(255, 255, 255, 0.42), transparent 18%),
    linear-gradient(104deg, transparent 0%, transparent 54%, rgba(255, 255, 255, 0.11) 68%, rgba(255, 255, 255, 0.035) 78%, transparent 88%),
    linear-gradient(180deg, rgba(255, 255, 255, 0.055), transparent 22%, transparent 100%);
  opacity: 0.92;
}

.login-modal-card::after {
  content: "";
  position: absolute;
  inset: 1px;
  border-radius: 33px;
  pointer-events: none;
  border: 1px solid rgba(255, 255, 255, 0.08);
  mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
  mask-composite: exclude;
  padding: 1px;
}

.login-modal-head {
  display: grid;
  gap: 8px;
  margin-bottom: 22px;
  position: relative;
  z-index: 1;
}

.login-modal-title {
  margin: 0;
  font-size: clamp(20px, 2.2vw, 28px);
  font-weight: 800;
  letter-spacing: -0.04em;
  color: #ffffff;
}

.login-modal-copy {
  margin: 0;
  font-size: 15px;
  color: rgba(229, 232, 237, 0.56);
  line-height: 1.65;
}

.login-modal-form {
  display: grid;
  gap: 18px;
  position: relative;
  z-index: 1;
}

.login-modal-field {
  display: grid;
  gap: 8px;
}

.login-modal-label {
  font-size: 13px;
  font-weight: 600;
  color: rgba(235, 237, 241, 0.72);
}

.login-modal-inline {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 10px;
}

.login-modal-password-box {
  position: relative;
}

.login-modal-input,
.login-modal-submit,
.login-modal-mini,
.login-modal-icon-toggle {
  font: inherit;
}

.login-modal-input {
  width: 100%;
  height: 54px;
  padding: 0 16px;
  border: 1px solid rgba(255, 255, 255, 0.07);
  border-radius: 999px;
  background:
    linear-gradient(180deg, rgba(255, 255, 255, 0.08), rgba(255, 255, 255, 0.02) 38%, rgba(255, 255, 255, 0.01)),
    rgba(255, 255, 255, 0.03);
  color: #ffffff;
  outline: none;
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.08),
    inset 0 16px 24px rgba(255, 255, 255, 0.018),
    0 0 0 1px rgba(255, 255, 255, 0.025);
  transition: border-color 0.2s ease, background 0.2s ease, box-shadow 0.2s ease, transform 0.2s ease;
}

.login-modal-password-box .login-modal-input {
  padding-right: 56px;
}

.login-modal-password-box .login-modal-input::-ms-reveal,
.login-modal-password-box .login-modal-input::-ms-clear {
  display: none;
  width: 0;
  height: 0;
}

.login-modal-input::placeholder {
  color: rgba(232, 234, 239, 0.34);
}

.login-modal-input:focus {
  border-color: rgba(120, 255, 208, 0.34);
  background:
    linear-gradient(180deg, rgba(255, 255, 255, 0.1), rgba(255, 255, 255, 0.035)),
    rgba(255, 255, 255, 0.03);
  box-shadow:
    0 0 0 4px rgba(111, 255, 204, 0.08),
    inset 0 1px 0 rgba(255, 255, 255, 0.08),
    inset 0 18px 28px rgba(255, 255, 255, 0.02);
  transform: translateY(-1px);
}

.login-modal-input.is-error {
  border-color: rgba(255, 129, 129, 0.65);
}

.login-modal-icon-toggle {
  position: absolute;
  top: 50%;
  right: 14px;
  width: 32px;
  height: 32px;
  display: grid;
  place-items: center;
  padding: 0;
  border: 1px solid rgba(255, 255, 255, 0.06);
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.04);
  color: rgba(248, 249, 251, 0.68);
  cursor: pointer;
  transform: translateY(-50%);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.05);
  transition: color 0.2s ease, transform 0.2s ease, background 0.2s ease, border-color 0.2s ease;
}

.login-modal-icon-toggle:hover {
  color: #ffffff;
  background: rgba(122, 255, 206, 0.1);
  border-color: rgba(122, 255, 206, 0.22);
}

.login-modal-icon-toggle svg {
  width: 20px;
  height: 20px;
}

.login-modal-mini {
  min-width: 94px;
  padding: 0 18px;
  border: 1px solid rgba(255, 255, 255, 0.07);
  border-radius: 999px;
  background:
    linear-gradient(180deg, rgba(255, 255, 255, 0.07), rgba(255, 255, 255, 0.02)),
    rgba(255, 255, 255, 0.03);
  color: rgba(248, 249, 251, 0.82);
  cursor: pointer;
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.08),
    inset 0 14px 22px rgba(255, 255, 255, 0.014);
  transition: transform 0.2s ease, background 0.2s ease, color 0.2s ease, border-color 0.2s ease;
}

.login-modal-mini:hover {
  background:
    linear-gradient(180deg, rgba(116, 255, 210, 0.09), rgba(255, 255, 255, 0.03)),
    rgba(255, 255, 255, 0.04);
  border-color: rgba(116, 255, 210, 0.18);
  color: #ffffff;
  transform: translateY(-1px);
}

.login-modal-mini--captcha {
  min-width: 138px;
}

.login-modal-error,
.login-modal-alert {
  font-size: 12px;
  line-height: 1.55;
  color: #ffb2b2;
}

.login-modal-alert {
  padding: 10px 12px;
  border-radius: 14px;
  background: rgba(255, 112, 112, 0.08);
  border: 1px solid rgba(255, 129, 129, 0.22);
}

.login-modal-submit {
  width: 100%;
  height: 56px;
  margin-top: 10px;
  border: 0;
  border-radius: 999px;
  background:
    linear-gradient(135deg, #f2f4f4 0%, #ffffff 22%, #e6ecec 100%);
  color: #13201d;
  font-size: 16px;
  font-weight: 700;
  cursor: pointer;
  transition: transform 0.2s ease, background 0.2s ease, box-shadow 0.2s ease;
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.92),
    0 14px 30px rgba(78, 255, 184, 0.16),
    0 12px 30px rgba(0, 0, 0, 0.24);
}

.login-modal-submit:hover:not(:disabled) {
  background:
    linear-gradient(135deg, #ffffff 0%, #f4f6f6 28%, #e1e7e7 100%);
  transform: translateY(-1px);
}

.login-modal-submit:disabled,
.login-modal-mini:disabled {
  opacity: 0.72;
  cursor: not-allowed;
  transform: none;
}

.login-modal-fade-enter-active,
.login-modal-fade-leave-active {
  transition: opacity 0.22s ease;
}

.login-modal-fade-enter-from,
.login-modal-fade-leave-to {
  opacity: 0;
}

.login-modal-fade-enter-from .login-modal-card,
.login-modal-fade-leave-to .login-modal-card {
  transform: translateY(12px) scale(0.98);
}

@media (max-width: 520px) {
  .login-page__brand {
    top: 46%;
  }

  .login-page__brand-sub {
    font-size: 9px;
    letter-spacing: 0.28em;
    padding: 0 42px;
  }

  .login-page__brand-sub::before,
  .login-page__brand-sub::after {
    width: 28px;
  }

  .login-page__actions {
    bottom: 44px;
  }

  .login-page__signin {
    height: 50px;
    font-size: 15px;
  }

  .login-modal-card {
    padding: 22px 18px 18px;
    border-radius: 24px;
  }

  .login-modal-inline {
    grid-template-columns: 1fr;
  }

  .login-modal-mini {
    min-height: 48px;
  }

  .login-modal-icon-toggle {
    right: 16px;
  }
}
</style>
