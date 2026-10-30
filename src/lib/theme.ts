export const THEME_KEY = "careerchive-app-theme";
export const APP_ROOT_ID = "careerchive-app";
export const APP_ROOT_CLASS = "careerchive-app";
export type Theme = "light" | "dark";
export const DEFAULT_THEME: Theme = "light";

export const THEME_BOOT_SCRIPT = `(function(){try{var t=localStorage.getItem("${THEME_KEY}");if(t!=="dark"&&t!=="light")t="${DEFAULT_THEME}";var apply=function(){var el=document.getElementById("${APP_ROOT_ID}");if(el)el.setAttribute("data-theme",t);};apply();if(!document.getElementById("${APP_ROOT_ID}"))document.addEventListener("DOMContentLoaded",apply);}catch(e){}})();`;

const themeListeners = new Set<() => void>();

export function getAppRoot(): HTMLElement | null {
  if (typeof document === "undefined") return null;
  return document.getElementById(APP_ROOT_ID);
}

export function portalRoot(): HTMLElement {
  return getAppRoot() ?? document.body;
}

export function readStoredTheme(): Theme | null {
  try {
    const stored = localStorage.getItem(THEME_KEY);
    if (stored === "dark" || stored === "light") return stored;
  } catch {
    /* ignore */
  }
  return null;
}

export function subscribeTheme(onChange: () => void) {
  themeListeners.add(onChange);
  function onStorage(event: StorageEvent) {
    if (event.key === THEME_KEY) onChange();
  }
  window.addEventListener("storage", onStorage);
  return () => {
    themeListeners.delete(onChange);
    window.removeEventListener("storage", onStorage);
  };
}

export function getThemeSnapshot(): Theme {
  return readStoredTheme() ?? DEFAULT_THEME;
}

export function applyAppTheme(next: Theme) {
  const root = getAppRoot();
  if (!root) return;
  if (root.getAttribute("data-theme") !== next) {
    root.setAttribute("data-theme", next);
  }
}

export function writeTheme(next: Theme) {
  try {
    localStorage.setItem(THEME_KEY, next);
  } catch {
    /* ignore */
  }
  applyAppTheme(next);
  themeListeners.forEach((listener) => listener());
}
