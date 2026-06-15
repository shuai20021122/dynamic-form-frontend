<script setup>
defineProps({
  label: {
    type: String,
    default: "加载中...",
  },
});
</script>

<template>
  <div class="feedback-card">
    <p class="muted-text">{{ label }}</p>
  </div>
</template>
