<script setup>
import { computed } from "vue";

import { t } from "../stores/uiLanguage.js";

const props = defineProps({
  label: {
    type: String,
    default: "",
  },
});

const resolvedLabel = computed(() => props.label || t("feedback.loading"));
</script>

<template>
  <div class="feedback-card">
    <p class="muted-text">{{ resolvedLabel }}</p>
  </div>
</template>
