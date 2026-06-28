export class ApiError extends Error {
  constructor(message, status, payload = null) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.payload = payload;
  }
}

let authExpiredNoticeSent = false;

export function resetAuthExpiredNotice() {
  authExpiredNoticeSent = false;
}

export function buildQuery(params = {}) {
  const searchParams = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") {
      searchParams.set(key, String(value));
    }
  });
  const query = searchParams.toString();
  return query ? `?${query}` : "";
}

function getDefaultErrorMessage(status, url) {
  if (status >= 500) {
    if (url.startsWith("/api/auth/")) {
      return "后端认证服务不可用，请检查后端是否启动或代理地址是否正确。";
    }
    return "后端服务暂时不可用，请稍后重试。";
  }

  if (status === 403) {
    return "当前账号暂无权限执行该操作。";
  }

  return "Request failed";
}

export async function request(url, options = {}) {
  const isFormData = options.body instanceof FormData;
  const response = await fetch(url, {
    credentials: "include",
    headers: isFormData
      ? { ...(options.headers || {}) }
      : {
          "Content-Type": "application/json",
          ...(options.headers || {}),
        },
    ...options,
  });

  const contentType = response.headers.get("content-type") || "";
  const isJson = contentType.includes("application/json");
  const payload = isJson ? await response.json() : null;

  if (!response.ok) {
    if (response.status === 401 && url !== "/api/auth/logout" && !authExpiredNoticeSent) {
      authExpiredNoticeSent = true;
      if (typeof window !== "undefined") {
        window.dispatchEvent(
          new CustomEvent("app:auth-expired", {
            detail: {
              url,
              status: response.status,
              message: (payload && payload.message) || "身份信息已过期，请重新登录。",
            },
          })
        );
      }
    }
    throw new ApiError((payload && payload.message) || getDefaultErrorMessage(response.status, url), response.status, payload);
  }

  return payload;
}

export async function downloadFile(url) {
  const response = await fetch(url, {
    credentials: "include",
  });

  const contentType = response.headers.get("content-type") || "";
  if (!response.ok) {
    let message = "Download failed";
    if (contentType.includes("application/json")) {
      const payload = await response.json();
      message = payload.message || message;
      if (response.status === 401 && !authExpiredNoticeSent) {
        authExpiredNoticeSent = true;
        if (typeof window !== "undefined") {
          window.dispatchEvent(
            new CustomEvent("app:auth-expired", {
              detail: {
                url,
                status: response.status,
                message,
              },
            })
          );
        }
      }
    }
    throw new ApiError(message, response.status);
  }

  const blob = await response.blob();
  const disposition = response.headers.get("content-disposition") || "";
  const matched = disposition.match(/filename="?([^"]+)"?/i);
  const filename = matched ? decodeURIComponent(matched[1]) : "download.bin";

  const objectUrl = window.URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = objectUrl;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(objectUrl);
}
