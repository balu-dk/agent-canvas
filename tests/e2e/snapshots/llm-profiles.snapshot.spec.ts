import { test, expect, Page } from "@playwright/test";
import { seedLocalStorage } from "./support/seed-local-storage";

/**
 * Visual snapshot tests for the LLM Profiles management UI.
 *
 * Covers:
 *   1. Empty state (no profiles saved)
 *   2. Profile list with active badge and action menu
 *   3. Create profile — blank form
 *   4. Create profile — filled form with Save enabled
 *   5. Delete confirmation modal
 *   6. Activated profile — active badge moves after activation
 *
 * The test server runs with VITE_MOCK_API=true (npm run dev:mock).
 * MSW handles /api/profiles CRUD (settings-handlers.ts).
 */

/** Seed profiles into MSW state via fetch calls intercepted by the service worker. */
async function seedProfiles(
  page: Page,
  profiles: { name: string; model: string; apiKey?: string }[],
  activeProfile?: string,
) {
  for (const p of profiles) {
    await page.evaluate(
      async ({ name, model, apiKey }) => {
        const llm: Record<string, string> = { model };
        if (apiKey) llm.api_key = apiKey;
        await fetch(`/api/profiles/${encodeURIComponent(name)}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ llm }),
        });
      },
      { name: p.name, model: p.model, apiKey: p.apiKey },
    );
  }

  if (activeProfile) {
    await page.evaluate(async (name) => {
      await fetch(`/api/profiles/${encodeURIComponent(name)}/activate`, {
        method: "POST",
      });
    }, activeProfile);
  }
}

async function dismissConsentModal(page: Page) {
  await page
    .getByRole("button", { name: "Confirm preferences" })
    .click({ timeout: 3_000 })
    .catch(() => undefined);
}

async function setupMocks(page: Page) {
  await seedLocalStorage(page);

  await page.route("**/api/conversations/search**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ results: [] }),
    });
  });
}

/** Navigate to the LLM settings page and wait for it to stabilise. */
async function navigateToLlmSettings(page: Page) {
  await page.goto("/settings/llm", { waitUntil: "domcontentloaded" });
  await dismissConsentModal(page);
  await page.waitForLoadState("networkidle");
  await expect(page.getByTestId("root-layout")).toBeVisible({ timeout: 15_000 });
}

const SCREENSHOT_OPTS = { animations: "disabled" as const, maxDiffPixelRatio: 0.01 };

test.describe("LLM Profiles Visual Snapshots", () => {
  test.setTimeout(60_000);

  // ── 1. Empty state ──────────────────────────────────────────────────

  test("empty profile list shows empty state and Add button", async ({ page }) => {
    await setupMocks(page);
    await navigateToLlmSettings(page);

    // Verify the Add button and empty state text are visible
    await expect(page.getByTestId("add-llm-profile")).toBeVisible({ timeout: 10_000 });

    const rootLayout = page.getByTestId("root-layout");
    await expect(rootLayout).toHaveScreenshot("llm-profiles-empty.png", SCREENSHOT_OPTS);
  });

  // ── 2. Profile list with active badge ───────────────────────────────

  test("profile list with 3 profiles and active badge renders correctly", async ({
    page,
  }) => {
    await setupMocks(page);

    // Seed profiles before navigating (MSW is loaded on any page)
    await page.goto("about:blank");
    await seedProfiles(
      page,
      [
        { name: "gpt4-main", model: "openai/gpt-4o", apiKey: "sk-test-key" },
        { name: "claude-sonnet", model: "anthropic/claude-sonnet-4-20250514" },
        { name: "local-llama", model: "ollama/llama3.2" },
      ],
      "gpt4-main",
    );

    await navigateToLlmSettings(page);

    // Verify profiles loaded
    const profileRows = page.getByTestId("profile-row");
    await expect(profileRows).toHaveCount(3, { timeout: 10_000 });
    await expect(page.getByTestId("profile-active-badge")).toBeVisible();

    const rootLayout = page.getByTestId("root-layout");
    await expect(rootLayout).toHaveScreenshot("llm-profiles-list.png", SCREENSHOT_OPTS);
  });

  // ── 3. Create profile — blank form ──────────────────────────────────

  test("blank create profile form renders correctly", async ({ page }) => {
    await setupMocks(page);
    await navigateToLlmSettings(page);

    // Click the Add button to enter create mode
    await page.getByTestId("add-llm-profile").click();

    // Wait for the create form to appear
    await expect(page.getByTestId("profile-editor-title")).toBeVisible({ timeout: 10_000 });
    await expect(page.getByTestId("profile-name-input")).toBeVisible();
    await expect(page.getByTestId("save-profile-btn")).toBeVisible();

    const rootLayout = page.getByTestId("root-layout");
    await expect(rootLayout).toHaveScreenshot(
      "llm-profiles-create-empty.png",
      SCREENSHOT_OPTS,
    );
  });

  // ── 4. Create profile — filled form ─────────────────────────────────

  test("filled create profile form with Save enabled renders correctly", async ({
    page,
  }) => {
    await setupMocks(page);
    await navigateToLlmSettings(page);

    await page.getByTestId("add-llm-profile").click();
    await expect(page.getByTestId("profile-editor-title")).toBeVisible({ timeout: 10_000 });

    // Fill in the profile name
    const nameInput = page.getByTestId("profile-name-input");
    await nameInput.click();
    await nameInput.fill("my-new-profile");

    // Fill in the model field using the custom model input (advanced view)
    // The form starts in basic view with ModelSelector; type a model string
    // into the custom model input if available, or use the basic model field.
    const customModelInput = page.getByTestId("llm-custom-model-input");
    if (await customModelInput.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await customModelInput.click();
      await customModelInput.fill("openai/gpt-4o");
    } else {
      // Basic view — type into the model selector combobox
      const modelCombobox = page.getByRole("combobox").first();
      await modelCombobox.click();
      await modelCombobox.fill("openai/gpt-4o");
      // Select the first matching option
      const option = page.getByRole("option").first();
      if (await option.isVisible({ timeout: 3_000 }).catch(() => false)) {
        await option.click();
      }
    }

    // Fill in the API key
    const apiKeyInput = page.getByTestId("llm-api-key-input");
    await apiKeyInput.click();
    await apiKeyInput.fill("sk-test-key-123");

    // Verify Save is enabled (not disabled)
    const saveBtn = page.getByTestId("save-profile-btn");
    await expect(saveBtn).toBeEnabled({ timeout: 5_000 });

    const rootLayout = page.getByTestId("root-layout");
    await expect(rootLayout).toHaveScreenshot(
      "llm-profiles-create-filled.png",
      SCREENSHOT_OPTS,
    );
  });

  // ── 5. Delete confirmation modal ────────────────────────────────────

  test("delete profile confirmation modal renders correctly", async ({
    page,
  }) => {
    await setupMocks(page);

    // Seed a profile to delete
    await page.goto("about:blank");
    await seedProfiles(page, [
      { name: "profile-to-delete", model: "openai/gpt-4o" },
    ]);

    await navigateToLlmSettings(page);

    // Wait for the profile row
    const profileRow = page.getByTestId("profile-row");
    await expect(profileRow).toBeVisible({ timeout: 10_000 });

    // Open the actions menu
    await page.getByTestId("profile-menu-trigger").click();
    await expect(page.getByTestId("profile-actions-menu")).toBeVisible({ timeout: 5_000 });

    // Click Delete
    await page.getByTestId("profile-delete").click();

    // Wait for the delete confirmation modal
    await expect(page.getByTestId("delete-profile-confirm")).toBeVisible({
      timeout: 5_000,
    });

    const rootLayout = page.getByTestId("root-layout");
    await expect(rootLayout).toHaveScreenshot(
      "llm-profiles-delete-modal.png",
      SCREENSHOT_OPTS,
    );
  });

  // ── 6. Rename active profile — badge follows the new name ────────────

  test("renaming the active profile keeps the active badge on the renamed entry", async ({
    page,
  }) => {
    await setupMocks(page);

    await page.goto("about:blank");
    await seedProfiles(
      page,
      [
        { name: "my-profile", model: "openai/gpt-4o", apiKey: "sk-key" },
        { name: "other-profile", model: "anthropic/claude-sonnet-4-20250514" },
      ],
      "my-profile",
    );

    await navigateToLlmSettings(page);

    const profileRows = page.getByTestId("profile-row");
    await expect(profileRows).toHaveCount(2, { timeout: 10_000 });

    // Verify "my-profile" row has the active badge
    const firstRow = profileRows.nth(0);
    await expect(firstRow.getByTestId("profile-active-badge")).toBeVisible();

    // Open actions menu on the active profile and click Rename
    await firstRow.getByTestId("profile-menu-trigger").click();
    await expect(page.getByTestId("profile-actions-menu")).toBeVisible({ timeout: 5_000 });
    await page.getByTestId("profile-rename").click();

    // Wait for the rename modal
    await expect(page.getByTestId("rename-profile-modal")).toBeVisible({ timeout: 5_000 });

    // Clear and type the new name
    const renameInput = page.getByTestId("rename-profile-input");
    await renameInput.clear();
    await renameInput.fill("my-profile-renamed");

    // Submit
    await page.getByTestId("rename-profile-submit").click();

    // Wait for the modal to close and the list to update
    await expect(page.getByTestId("rename-profile-modal")).toBeHidden({ timeout: 10_000 });

    // The renamed profile should still have the active badge
    const updatedRows = page.getByTestId("profile-row");
    await expect(updatedRows).toHaveCount(2, { timeout: 10_000 });

    // Find the row containing the new name and assert its badge
    const renamedRow = updatedRows.filter({ hasText: "my-profile-renamed" });
    await expect(renamedRow).toBeVisible({ timeout: 10_000 });
    await expect(renamedRow.getByTestId("profile-active-badge")).toBeVisible();

    // The old name should be gone
    await expect(page.getByText("my-profile", { exact: true })).toBeHidden();

    // The other profile should NOT have the badge
    const otherRow = updatedRows.filter({ hasText: "other-profile" });
    await expect(otherRow.getByTestId("profile-active-badge")).toBeHidden();

    const rootLayout = page.getByTestId("root-layout");
    await expect(rootLayout).toHaveScreenshot(
      "llm-profiles-rename-active.png",
      SCREENSHOT_OPTS,
    );
  });

  // ── 7. Delete active profile — no active badge left ─────────────────

  test("deleting the active profile leaves no active badge", async ({ page }) => {
    await setupMocks(page);

    await page.goto("about:blank");
    await seedProfiles(
      page,
      [
        { name: "active-one", model: "openai/gpt-4o", apiKey: "sk-key-a" },
        { name: "inactive-two", model: "anthropic/claude-sonnet-4-20250514" },
      ],
      "active-one",
    );

    await navigateToLlmSettings(page);

    const profileRows = page.getByTestId("profile-row");
    await expect(profileRows).toHaveCount(2, { timeout: 10_000 });

    // Verify "active-one" has the badge
    const activeRow = profileRows.filter({ hasText: "active-one" });
    await expect(activeRow.getByTestId("profile-active-badge")).toBeVisible();

    // Open actions menu on the active profile and click Delete
    await activeRow.getByTestId("profile-menu-trigger").click();
    await expect(page.getByTestId("profile-actions-menu")).toBeVisible({ timeout: 5_000 });
    await page.getByTestId("profile-delete").click();

    // Confirm deletion
    await expect(page.getByTestId("delete-profile-confirm")).toBeVisible({ timeout: 5_000 });
    await page.getByTestId("delete-profile-confirm").click();

    // Wait for the modal to close and the list to update
    await expect(page.getByTestId("delete-profile-confirm")).toBeHidden({ timeout: 10_000 });

    // Only one profile should remain
    const remainingRows = page.getByTestId("profile-row");
    await expect(remainingRows).toHaveCount(1, { timeout: 10_000 });
    await expect(remainingRows.filter({ hasText: "inactive-two" })).toBeVisible();

    // No profile should have the active badge
    await expect(page.getByTestId("profile-active-badge")).toBeHidden();

    const rootLayout = page.getByTestId("root-layout");
    await expect(rootLayout).toHaveScreenshot(
      "llm-profiles-delete-active.png",
      SCREENSHOT_OPTS,
    );
  });

  // ── 8. Activated profile — badge moves ──────────────────────────────

  test("activating a profile moves the active badge", async ({ page }) => {
    await setupMocks(page);

    // Seed two profiles, first one active
    await page.goto("about:blank");
    await seedProfiles(
      page,
      [
        { name: "profile-a", model: "openai/gpt-4o", apiKey: "sk-key-a" },
        { name: "profile-b", model: "anthropic/claude-sonnet-4-20250514", apiKey: "sk-key-b" },
      ],
      "profile-a",
    );

    await navigateToLlmSettings(page);

    // Verify profile-a has the active badge
    const profileRows = page.getByTestId("profile-row");
    await expect(profileRows).toHaveCount(2, { timeout: 10_000 });
    await expect(page.getByTestId("profile-active-badge")).toBeVisible();

    // Open the actions menu on profile-b (the second row)
    const secondRow = profileRows.nth(1);
    await secondRow.getByTestId("profile-menu-trigger").click();
    await expect(page.getByTestId("profile-actions-menu")).toBeVisible({ timeout: 5_000 });

    // Click "Set Active"
    await page.getByTestId("profile-set-active").click();

    // Wait for the badge to move — profile-b should now have it
    // The activate call goes through MSW, invalidates the query, and
    // the list re-renders with the new active_profile.
    await expect(
      secondRow.getByTestId("profile-active-badge"),
    ).toBeVisible({ timeout: 10_000 });

    const rootLayout = page.getByTestId("root-layout");
    await expect(rootLayout).toHaveScreenshot(
      "llm-profiles-activated.png",
      SCREENSHOT_OPTS,
    );
  });
});
