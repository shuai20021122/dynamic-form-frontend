<script setup>
import { computed } from "vue";

const props = defineProps({
  variant: {
    type: String,
    default: "hero",
  },
});

const sidebarLines = [
  {
    top: "7%",
    left: "-34%",
    opacity: 0.16,
    blur: "0px",
    duration: "22s",
    delay: "-4s",
    fromX: "-110px",
    toX: "88px",
    fromY: "0px",
    toY: "1px",
    text:
      "const session = await auth.verify(token);    watchEffect(() => preload(currentRoute.value));    return permissions.includes('view_forms');    ",
  },
  {
    top: "13%",
    left: "-20%",
    opacity: 0.15,
    blur: "0.05px",
    duration: "27s",
    delay: "-9s",
    fromX: "82px",
    toX: "-78px",
    fromY: "0px",
    toY: "1px",
    text:
      "const dashboard = stream.merge(queue, workers);    return response.json({ ok: true, payload });    watchEffect(() => hydratePanel(activeView.value));    ",
  },
  {
    top: "20%",
    left: "-18%",
    opacity: 0.15,
    blur: "0.1px",
    duration: "31s",
    delay: "-11s",
    fromX: "96px",
    toX: "-92px",
    fromY: "0px",
    toY: "1px",
    text:
      "if (user.role === 'admin') grant(access);    const cacheKey = `team:${teamId}:forms`;    export const status = computed(() => state.ready);    ",
  },
  {
    top: "24%",
    left: "-10%",
    opacity: 0.14,
    blur: "0.08px",
    duration: "29s",
    delay: "-12s",
    fromX: "88px",
    toX: "-74px",
    fromY: "0px",
    toY: "1px",
    text:
      "const accessScope = computeAccess(actor, workspaceId);    await service.refreshBoard(summaryId);    return queue.filter(Boolean).length;    ",
  },
  {
    top: "27%",
    left: "-30%",
    opacity: 0.14,
    blur: "0.08px",
    duration: "24s",
    delay: "-6s",
    fromX: "-104px",
    toX: "88px",
    fromY: "0px",
    toY: "-1px",
    text:
      "await service.pushMetrics(batch);    const matrix = lanes.filter(Boolean).map(syncNode);    export const runtime = computed(() => flow.ready);    ",
  },
  {
    top: "32%",
    left: "-22%",
    opacity: 0.14,
    blur: "0.06px",
    duration: "22s",
    delay: "-10s",
    fromX: "-96px",
    toX: "86px",
    fromY: "0px",
    toY: "-1px",
    text:
      "watchEffect(() => syncSlots(activeSchedule.value));    const pending = requests.find(item => item.open);    return permissions.includes('view_history');    ",
  },
  {
    top: "36%",
    left: "-32%",
    opacity: 0.15,
    blur: "0px",
    duration: "26s",
    delay: "-7s",
    fromX: "-126px",
    toX: "96px",
    fromY: "0px",
    toY: "-1px",
    text:
      "await api.post('/workflow/approve', payload);    db.transaction(() => saveDraft(editorState));    const next = queue.shift() || createTask();    ",
  },
  {
    top: "44%",
    left: "-16%",
    opacity: 0.14,
    blur: "0.1px",
    duration: "34s",
    delay: "-15s",
    fromX: "96px",
    toX: "-84px",
    fromY: "0px",
    toY: "1px",
    text:
      "const access = resolveScope(actor, boardId);    await syncPipeline(activeTasks);    return permissions.includes('manage_history');    ",
  },
  {
    top: "48%",
    left: "-26%",
    opacity: 0.13,
    blur: "0.1px",
    duration: "33s",
    delay: "-17s",
    fromX: "-102px",
    toX: "80px",
    fromY: "0px",
    toY: "1px",
    text:
      "const stateView = normalizeBoard(rawBoardState);    await preloadMembers(currentTeam.value);    const jobs = pipeline.slice(0, visibleCount);    ",
  },
  {
    top: "52%",
    left: "-14%",
    opacity: 0.14,
    blur: "0.12px",
    duration: "38s",
    delay: "-14s",
    fromX: "104px",
    toX: "-84px",
    fromY: "0px",
    toY: "2px",
    text:
      "router.beforeEach((to, from, next) => next());    const profile = normalizeCandidate(rawPayload);    while (jobs.length) await worker.run(jobs.pop());    ",
  },
  {
    top: "59%",
    left: "-18%",
    opacity: 0.13,
    blur: "0.12px",
    duration: "27s",
    delay: "-13s",
    fromX: "94px",
    toX: "-82px",
    fromY: "0px",
    toY: "1px",
    text:
      "const reviewerMap = new Map(entries.map(buildKey));    await syncHistoryPanels(currentRoute.value);    return rows.filter(item => item.enabled);    ",
  },
  {
    top: "63%",
    left: "-24%",
    opacity: 0.13,
    blur: "0.12px",
    duration: "30s",
    delay: "-14s",
    fromX: "-108px",
    toX: "84px",
    fromY: "0px",
    toY: "1px",
    text:
      "const queueState = tasks.reduce(rebuildLaneMap, seedState);    await fetchSummaryMetrics(activeFormId);    return timelineRows.filter(Boolean);    ",
  },
  {
    top: "65%",
    left: "-28%",
    opacity: 0.13,
    blur: "0.15px",
    duration: "23s",
    delay: "-9s",
    fromX: "-138px",
    toX: "102px",
    fromY: "0px",
    toY: "1px",
    text:
      "return response.json({ code: 200, data });    function resolveTeamScope(actor, formId) { return scope; }    if (!entry.isActive) throw new AccessError();    ",
  },
  {
    top: "69%",
    left: "-14%",
    opacity: 0.12,
    blur: "0.14px",
    duration: "26s",
    delay: "-18s",
    fromX: "92px",
    toX: "-86px",
    fromY: "0px",
    toY: "-1px",
    text:
      "const detailState = normalizeEntry(rows[currentIndex]);    await hydrateDocuments(currentRecordId);    return permissions.includes('review_result');    ",
  },
  {
    top: "74%",
    left: "-12%",
    opacity: 0.13,
    blur: "0.18px",
    duration: "42s",
    delay: "-19s",
    fromX: "92px",
    toX: "-86px",
    fromY: "0px",
    toY: "-1px",
    text:
      "form.entries.map(item => sync(item.id));    await translate.resume(source, { mode: 'bilingual' });    const result = await service.generateDocument(id);    ",
  },
  {
    top: "77%",
    left: "-22%",
    opacity: 0.12,
    blur: "0.18px",
    duration: "37s",
    delay: "-21s",
    fromX: "-104px",
    toX: "78px",
    fromY: "0px",
    toY: "1px",
    text:
      "const panelRows = visibleRows.map(linkReviewStatus);    await service.syncSnapshots(runtimeCache);    const stateCode = getBoardState(currentView);    ",
  },
  {
    top: "81%",
    left: "-30%",
    opacity: 0.12,
    blur: "0.18px",
    duration: "28s",
    delay: "-16s",
    fromX: "-124px",
    toX: "94px",
    fromY: "0px",
    toY: "1px",
    text:
      "const dashboard = stream.merge(queue, workers);    return response.json({ ok: true, payload });    watchEffect(() => hydratePanel(activeView.value));    ",
  },
  {
    top: "85%",
    left: "-18%",
    opacity: 0.11,
    blur: "0.19px",
    duration: "29s",
    delay: "-24s",
    fromX: "96px",
    toX: "-82px",
    fromY: "0px",
    toY: "1px",
    text:
      "const summaryRows = interviewRows.filter(hasPreview);    await refreshReviewerPanel(currentReviewer.value);    return activeSlots.map(formatSlotKey);    ",
  },
  {
    top: "88%",
    left: "-16%",
    opacity: 0.11,
    blur: "0.2px",
    duration: "35s",
    delay: "-22s",
    fromX: "110px",
    toX: "-96px",
    fromY: "0px",
    toY: "-1px",
    text:
      "await service.pushMetrics(batch);    const matrix = lanes.filter(Boolean).map(syncNode);    export const runtime = computed(() => flow.ready);    ",
  },
  {
    top: "92%",
    left: "-28%",
    opacity: 0.1,
    blur: "0.2px",
    duration: "34s",
    delay: "-26s",
    fromX: "-92px",
    toX: "76px",
    fromY: "0px",
    toY: "-1px",
    text:
      "const archiveView = historyItems.slice(0, pageSize);    await preloadPreviewMap(activeEntryIds);    return documentQueue.filter(isVisible);    ",
  },
];

const bannerLines = [
  {
    top: "14%",
    left: "-18%",
    opacity: 0.18,
    blur: "0px",
    duration: "24s",
    delay: "-5s",
    fromX: "-126px",
    toX: "112px",
    fromY: "0px",
    toY: "1px",
    text:
      "const session = await auth.verify(token);    watchEffect(() => preload(currentRoute.value));    return permissions.includes('view_forms');    if (!entry.isActive) throw new AccessError();    ",
  },
  {
    top: "28%",
    left: "-2%",
    opacity: 0.15,
    blur: "0.08px",
    duration: "32s",
    delay: "-13s",
    fromX: "118px",
    toX: "-108px",
    fromY: "0px",
    toY: "1px",
    text:
      "await api.post('/workflow/approve', payload);    const cacheKey = `team:${teamId}:forms`;    export const status = computed(() => state.ready);    ",
  },
  {
    top: "44%",
    left: "-16%",
    opacity: 0.14,
    blur: "0px",
    duration: "25s",
    delay: "-8s",
    fromX: "-104px",
    toX: "92px",
    fromY: "0px",
    toY: "-1px",
    text:
      "db.transaction(() => saveDraft(editorState));    const next = queue.shift() || createTask();    router.beforeEach((to, from, next) => next());    ",
  },
  {
    top: "61%",
    left: "2%",
    opacity: 0.12,
    blur: "0.12px",
    duration: "39s",
    delay: "-18s",
    fromX: "102px",
    toX: "-94px",
    fromY: "0px",
    toY: "2px",
    text:
      "const profile = normalizeCandidate(rawPayload);    while (jobs.length) await worker.run(jobs.pop());    return response.json({ code: 200, data });    ",
  },
];

const defaultLines = [
  {
    top: "18%",
    left: "-8%",
    opacity: 0.16,
    blur: "0px",
    duration: "24s",
    delay: "-5s",
    fromX: "-10px",
    toX: "16px",
    fromY: "0px",
    toY: "2px",
    text: "const result = await service.generateDocument(id);    return response.json({ code: 200, data });    ",
  },
];

const lineSet = computed(() => {
  if (props.variant === "sidebar") {
    return sidebarLines;
  }
  if (props.variant === "banner") {
    return bannerLines;
  }
  return defaultLines;
});

function buildLineStyle(line) {
  return {
    top: line.top,
    left: line.left,
    opacity: String(line.opacity),
    filter: `blur(${line.blur})`,
    "--flow-duration": line.duration,
    "--flow-delay": line.delay,
    "--flow-from-x": line.fromX,
    "--flow-to-x": line.toX,
    "--flow-from-y": line.fromY,
    "--flow-to-y": line.toY,
  };
}
</script>

<template>
  <div class="code-flow-backdrop" :class="`code-flow-backdrop--${variant}`" aria-hidden="true">
    <div class="code-flow-backdrop__code-flow">
      <div v-for="(line, index) in lineSet" :key="`${variant}-${index}`" class="code-flow-backdrop__code-line" :style="buildLineStyle(line)">
        <span class="code-flow-backdrop__code-line-text">{{ line.text }}</span>
        <span class="code-flow-backdrop__code-line-text" aria-hidden="true">{{ line.text }}</span>
      </div>
    </div>
    <div class="code-flow-backdrop__veil"></div>
    <div class="code-flow-backdrop__glow"></div>
    <div class="code-flow-backdrop__particles"></div>
    <div class="code-flow-backdrop__grid"></div>
    <div class="code-flow-backdrop__vignette"></div>
  </div>
</template>
