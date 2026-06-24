<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from "vue";

import chevronDownIcon from "../assets/ui-icons/select_chevron_down_gray.svg";
import { t } from "../stores/uiLanguage.js";

const props = defineProps({
  modelValue: {
    type: [String, Number, Boolean, null],
    default: "",
  },
  options: {
    type: Array,
    default: () => [],
  },
  placeholder: {
    type: String,
    default: "",
  },
  disabled: {
    type: Boolean,
    default: false,
  },
});

const emit = defineEmits(["update:modelValue", "option-action"]);

const rootRef = ref(null);
const open = ref(false);

const selectedOption = computed(() => props.options.find((option) => String(option.value) === String(props.modelValue)) || null);
const resolvedPlaceholder = computed(() => props.placeholder || t("common.select"));

function close() {
  open.value = false;
}

function toggle() {
  if (props.disabled) {
    return;
  }
  open.value = !open.value;
}

function selectOption(option) {
  if (option.disabled) {
    return;
  }
  emit("update:modelValue", option.value);
  close();
}

function triggerOptionAction(option) {
  emit("option-action", option);
}

function handleDocumentPointerDown(event) {
  if (!rootRef.value?.contains(event.target)) {
    close();
  }
}

onMounted(() => {
  document.addEventListener("pointerdown", handleDocumentPointerDown);
});

onBeforeUnmount(() => {
  document.removeEventListener("pointerdown", handleDocumentPointerDown);
});
</script>

<template>
  <div ref="rootRef" class="ui-select" :class="{ 'is-open': open, 'is-disabled': disabled }">
    <button class="ui-select-trigger" type="button" :disabled="disabled" @click="toggle">
      <span class="ui-select-label">{{ selectedOption?.label || resolvedPlaceholder }}</span>
      <img class="ui-select-chevron" :src="chevronDownIcon" alt="" aria-hidden="true" />
    </button>

    <transition name="ui-select-dropdown">
      <div v-if="open" class="ui-select-dropdown">
        <div
          v-for="option in options"
          :key="`${option.label}-${option.value}`"
          class="ui-select-option"
          :class="{ 'is-selected': String(option.value) === String(modelValue), 'is-disabled': !!option.disabled, 'has-action': !!option.actionLabel }"
        >
          <button class="ui-select-option-main" type="button" :disabled="!!option.disabled" @click="selectOption(option)">
            {{ option.label }}
          </button>
          <button
            v-if="option.actionLabel"
            class="ui-select-option-action"
            type="button"
            :disabled="!!option.actionDisabled"
            @click="triggerOptionAction(option)"
          >
            {{ option.actionLabel }}
          </button>
        </div>
      </div>
    </transition>
  </div>
</template>
