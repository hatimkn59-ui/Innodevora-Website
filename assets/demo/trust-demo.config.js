/**
 * Demo-trust feature flag.
 *
 * Priority:
 *   1. ?demoTrust=1 / ?demoTrust=0  (explicit preview override)
 *   2. localStorage["innodevora.demoTrust"]
 *   3. Production hostname guard (innodevora.com always defaults off)
 *   4. VITE_SHOW_DEMO_TRUST from Vite's import.meta.env or window bridge
 *   5. Local development is on; anything else is off by default.
 *
 * A public production release must keep VITE_SHOW_DEMO_TRUST=false. Even if it
 * is accidentally built as true, the production hostname guard keeps the
 * fictional trust content off unless someone explicitly adds ?demoTrust=1.
 */

const TRUTHY = new Set(["1", "true", "yes", "on", "preview", "demo"]);
const FALSEY = new Set(["0", "false", "no", "off", "production", "live"]);

function parseFlag(value) {
  if (value === undefined || value === null || value === "") return undefined;
  const normalized = String(value).trim().toLowerCase();
  if (TRUTHY.has(normalized)) return true;
  if (FALSEY.has(normalized)) return false;
  return undefined;
}

function readViteEnv() {
  try {
    if (typeof import.meta !== "undefined" && import.meta.env) {
      const value = parseFlag(import.meta.env.VITE_SHOW_DEMO_TRUST);
      if (value !== undefined) return value;
    }
  } catch {
    /* static builds do not expose import.meta.env */
  }

  if (typeof window !== "undefined") {
    return parseFlag(window.VITE_SHOW_DEMO_TRUST);
  }

  return undefined;
}

function readLocalStorageFlag() {
  try {
    return parseFlag(window.localStorage.getItem("innodevora.demoTrust"));
  } catch {
    return undefined;
  }
}

function isLocalPreviewHost(hostname, protocol) {
  return (
    protocol === "file:" ||
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "::1" ||
    hostname === "0.0.0.0" ||
    hostname === "" ||
    hostname.endsWith(".local")
  );
}

function isProductionHost(hostname) {
  return /(^|\.)innodevora\.com$/i.test(hostname);
}

export function getDemoTrustState() {
  if (typeof window === "undefined") {
    return { enabled: false, reason: "no-window" };
  }

  const params = new URLSearchParams(window.location.search);
  const queryValue = params.has("demoTrust")
    ? parseFlag(params.get("demoTrust"))
    : params.has("showDemoTrust")
      ? parseFlag(params.get("showDemoTrust"))
      : undefined;

  if (queryValue !== undefined) {
    return { enabled: queryValue, reason: "query" };
  }

  const storedValue = readLocalStorageFlag();
  if (storedValue !== undefined) {
    return { enabled: storedValue, reason: "local-storage" };
  }

  if (isProductionHost(window.location.hostname)) {
    return { enabled: false, reason: "production-host" };
  }

  const envValue = readViteEnv();
  if (envValue !== undefined) {
    return { enabled: envValue, reason: "vite-env" };
  }

  if (isLocalPreviewHost(window.location.hostname, window.location.protocol)) {
    return { enabled: true, reason: "local-preview" };
  }

  return { enabled: false, reason: "default-off" };
}

export function isDemoTrustEnabled() {
  return getDemoTrustState().enabled;
}

export default isDemoTrustEnabled;
