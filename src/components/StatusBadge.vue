<script setup>
import { computed } from "vue";

const props = defineProps({
  text: {
    type: String,
    default: "",
  },
  tone: {
    type: String,
    default: "neutral",
  },
});

const classes = computed(() => ["status-badge", `tone-${props.tone}`]);
</script>

<template>
  <span :class="classes">{{ text }}</span>
</template>
