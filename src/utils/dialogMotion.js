function resolveDialog(dialogOrRef) {
  if (!dialogOrRef) return null;
  if (dialogOrRef instanceof HTMLDialogElement) return dialogOrRef;
  return dialogOrRef.value instanceof HTMLDialogElement ? dialogOrRef.value : null;
}

function clearDialogTimers(dialog) {
  if (!dialog) return;

  if (dialog.__dialogMotionFrame) {
    window.cancelAnimationFrame(dialog.__dialogMotionFrame);
    dialog.__dialogMotionFrame = 0;
  }

  if (dialog.__dialogMotionTimer) {
    window.clearTimeout(dialog.__dialogMotionTimer);
    dialog.__dialogMotionTimer = 0;
  }
}

function getSurface(dialog) {
  return dialog?.querySelector(".modal-surface") || null;
}

export function getDialogOriginFromEvent(event, fallbackPoint = null) {
  const triggerRect = event?.currentTarget?.getBoundingClientRect?.();
  if (triggerRect) {
    return {
      x: triggerRect.left + triggerRect.width / 2,
      y: triggerRect.top + triggerRect.height / 2,
    };
  }
  return fallbackPoint;
}

export function resetDialogMotion(dialogOrRef) {
  const dialog = resolveDialog(dialogOrRef);
  if (!dialog) return;

  clearDialogTimers(dialog);
  dialog.classList.remove("is-animating", "is-closing");
}

export function openDialogWithAnimation(dialogOrRef, { originPoint = null } = {}) {
  const dialog = resolveDialog(dialogOrRef);
  if (!dialog) return;

  const alreadyOpen = dialog.open;
  if (!alreadyOpen) {
    dialog.showModal();
  }

  const surface = getSurface(dialog);
  if (!surface) return;

  clearDialogTimers(dialog);
  dialog.classList.remove("is-closing", "is-animating");

  if (originPoint) {
    const rect = surface.getBoundingClientRect();
    const originX = Math.min(Math.max(originPoint.x - rect.left, 36), rect.width - 36);
    const originY = Math.min(Math.max(originPoint.y - rect.top, 26), rect.height - 26);
    dialog.style.setProperty("--dialog-origin-x", `${originX}px`);
    dialog.style.setProperty("--dialog-origin-y", `${originY}px`);
  }

  void dialog.offsetWidth;

  dialog.__dialogMotionFrame = window.requestAnimationFrame(() => {
    dialog.classList.add("is-animating");
    dialog.__dialogMotionFrame = 0;
  });
}

export function closeDialogWithAnimation(dialogOrRef, { afterClose, duration = 220 } = {}) {
  const dialog = resolveDialog(dialogOrRef);
  if (!dialog || !dialog.open || dialog.classList.contains("is-closing")) {
    return;
  }

  const surface = getSurface(dialog);
  if (!surface) {
    dialog.close();
    afterClose?.();
    return;
  }

  clearDialogTimers(dialog);
  dialog.classList.remove("is-animating");
  dialog.classList.add("is-closing");

  let finished = false;
  const finalize = () => {
    if (finished) return;
    finished = true;
    surface.removeEventListener("animationend", handleAnimationEnd);
    clearDialogTimers(dialog);
    dialog.classList.remove("is-closing");
    dialog.close();
    afterClose?.();
  };

  const handleAnimationEnd = (event) => {
    if (event.target === surface) {
      finalize();
    }
  };

  surface.addEventListener("animationend", handleAnimationEnd);
  dialog.__dialogMotionTimer = window.setTimeout(finalize, duration + 60);
}
