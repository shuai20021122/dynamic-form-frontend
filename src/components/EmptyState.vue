<script setup>
defineProps({
  title: {
    type: String,
    default: "暂无数据",
  },
  description: {
    type: String,
    default: "",
  },
});
</script>

<template>
  <div class="feedback-card">
    <p class="empty-title">{{ title }}</p>
    <p v-if="description" class="muted-text">{{ description }}</p>
  </div>
</template>
