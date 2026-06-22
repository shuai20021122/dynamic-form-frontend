<script setup>
import { computed } from "vue";

import { t } from "../stores/uiLanguage.js";

const props = defineProps({
  title: {
    type: String,
    default: "",
  },
  description: {
    type: String,
    default: "",
  },
});

const resolvedTitle = computed(() => props.title || t("feedback.noData"));
</script>

<template>
  <div class="feedback-card">
    <p class="empty-title">{{ resolvedTitle }}</p>
    <p v-if="description" class="muted-text">{{ description }}</p>
  </div>
</template>
