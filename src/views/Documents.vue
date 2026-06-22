<script setup>
import { computed, onMounted, ref } from "vue";
import { useRoute } from "vue-router";

import DocumentManager from "../components/DocumentManager.vue";
import EmptyState from "../components/EmptyState.vue";
import { fetchCurrentUser } from "../api/auth.js";

const route = useRoute();

const currentUser = ref(null);
const loading = ref(true);
const entryId = computed(() => route.query.entryId || "");

async function loadPage() {
  loading.value = true;
  try {
    currentUser.value = await fetchCurrentUser(true);
  } finally {
    loading.value = false;
  }
}

onMounted(loadPage);
</script>

<template>
  <section class="panel">
    <div class="panel-header">
      <h2>文档中心</h2>
    </div>
    <div class="panel-body">
      <EmptyState v-if="!entryId" title="暂无数据" />
      <DocumentManager v-else :entry-id="entryId" :can-upload="true" :can-delete="true" />
    </div>
  </section>
</template>
