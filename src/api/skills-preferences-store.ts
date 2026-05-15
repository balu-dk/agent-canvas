/**
 * Persists `default_skills` (user-chosen default skill set) to localStorage so
 * that the setting survives page reloads for both local and cloud backends.
 *
 * For cloud backends the value is also synced via the cloud settings API; here
 * we keep a local copy so the UI is instantaneous and resilient to network
 * failures.
 */

export const SKILLS_PREFERENCES_STORAGE_KEY = "openhands-skills-preferences";

export interface SkillsPreferences {
  default_skills?: string[];
}

export const readStoredSkillsPreferences = (): SkillsPreferences => {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(SKILLS_PREFERENCES_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return {};
    }
    const obj = parsed as Record<string, unknown>;
    const result: SkillsPreferences = {};
    if (
      Array.isArray(obj.default_skills) &&
      obj.default_skills.every((v) => typeof v === "string")
    ) {
      result.default_skills = obj.default_skills as string[];
    }
    return result;
  } catch {
    return {};
  }
};

export const writeStoredSkillsPreferences = (
  partial: SkillsPreferences,
): void => {
  if (typeof window === "undefined") return;
  try {
    const existing = readStoredSkillsPreferences();
    const merged: SkillsPreferences = { ...existing };
    if (partial.default_skills !== undefined) {
      merged.default_skills = partial.default_skills;
    }
    if (Object.keys(merged).length === 0) {
      window.localStorage.removeItem(SKILLS_PREFERENCES_STORAGE_KEY);
    } else {
      window.localStorage.setItem(
        SKILLS_PREFERENCES_STORAGE_KEY,
        JSON.stringify(merged),
      );
    }
  } catch {
    // localStorage may be blocked (e.g. in some private-browsing modes)
  }
};
