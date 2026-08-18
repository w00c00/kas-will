const SUPPORTED_LANGUAGES = new Set(["zh", "en"]);

const CHINESE_TIME_ZONES = new Set([
  "Asia/Shanghai",
  "Asia/Chongqing",
  "Asia/Harbin",
  "Asia/Urumqi",
  "Asia/Hong_Kong",
  "Asia/Macau",
  "Asia/Taipei",
  "PRC",
  "Hongkong",
  "ROC"
]);

function normalizedLanguages(languages, language) {
  const values = Array.isArray(languages) ? languages : [];
  return [...values, language]
    .map((value) => String(value || "").trim().toLowerCase())
    .filter(Boolean);
}

export function detectPreferredLanguage({
  storedLanguage = "",
  languages = [],
  language = "",
  timeZone = ""
} = {}) {
  if (SUPPORTED_LANGUAGES.has(storedLanguage)) return storedLanguage;

  const systemLanguages = normalizedLanguages(languages, language);
  const primaryLanguage = systemLanguages[0] || "";
  if (primaryLanguage === "zh" || primaryLanguage.startsWith("zh-")) return "zh";
  if (primaryLanguage === "en" || primaryLanguage.startsWith("en-")) return "en";

  return CHINESE_TIME_ZONES.has(String(timeZone || "")) ? "zh" : "en";
}

export function detectBrowserLanguage(storage) {
  let storedLanguage = "";
  try {
    storedLanguage = (storage || globalThis.localStorage)?.getItem("kas-will-language") || "";
  } catch {
    // Storage may be unavailable in hardened webviews; automatic detection still works.
  }

  let timeZone = "";
  try {
    timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || "";
  } catch {
    // An unavailable time zone falls back to the system language or English.
  }

  let languages = [];
  let language = "";
  try {
    languages = globalThis.navigator?.languages;
    language = globalThis.navigator?.language;
  } catch {
    // A restricted navigator falls back to the time zone or English.
  }

  return detectPreferredLanguage({
    storedLanguage,
    languages,
    language,
    timeZone
  });
}
