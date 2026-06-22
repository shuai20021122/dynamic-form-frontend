const resourceCache = new Map();

function cloneData(value) {
  if (value == null) return value;
  if (typeof structuredClone === "function") {
    try {
      return structuredClone(value);
    } catch {}
  }
  return JSON.parse(JSON.stringify(value));
}

export function getCachedResource(key) {
  if (!resourceCache.has(key)) {
    return null;
  }
  return cloneData(resourceCache.get(key));
}

export function setCachedResource(key, value) {
  resourceCache.set(key, cloneData(value));
}

export function clearCachedResource(key) {
  resourceCache.delete(key);
}

export function clearAllCachedResources() {
  resourceCache.clear();
}
