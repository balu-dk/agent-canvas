import { test, expect, Page } from "@playwright/test";

/**
 * Visual snapshot tests for the LLM settings page (/settings — LLM index route).
 *
 * The LLM settings page (`routes/llm-settings.tsx`) renders:
 *   1. A Basic/Advanced/All view toggle
 *   2. A header section with Model selector + API key input (+ Base URL in advanced view)
 *   3. Schema-driven minor fields (temperature, etc.)
 *   4. A save button
 *   5. The LlmProfilesManager section with the two MSW-seeded profiles
 *
 * Five snapshots:
 *   1. `settings-llm-advanced.png`   — "Advanced" tab active; custom model + base URL visible
 *   2. `settings-llm-api-key-set.png`— API key filled, saved, key-set indicator rendered
 *   3. `settings-llm-profiles.png`   — Two profile rows visible in the profiles manager
 *   4. `settings-llm-rename-modal.png` — Rename modal open for first profile
 *   5. `settings-llm-delete-modal.png` — Delete confirmation modal open for second profile
 *
 * MSW state note: Playwright gives each test a fresh browser context by default,
 * so MOCK_PROFILES module-level state re-initialises to the two seeded defaults
 * automatically before every test — no explicit beforeEach reset is needed.
 * Tests 3-5 also only open modals without submitting them, so MOCK_PROFILES is
 * never mutated within a test run.
 */

async function dismissConsentModal(page: Page) {
  await page
    .getByRole("button", { name: "Confirm preferences" })
    .click({ timeout: 3_000 })
    .catch(() => undefined);
}

async function setupMocks(page: Page) {
  await page.addInitScript(() => {
    window.localStorage.setItem("openhands-onboarded", "true");
  });
}

/** Navigate to /settings and wait for the LLM settings form to be ready. */
async function navigateToLlmSettings(page: Page) {
  await setupMocks(page);
  await page.goto("/settings");
  await dismissConsentModal(page);
  await page.waitForLoadState("networkidle");
  // Basic form is the default view; wait for it to confirm the page is loaded.
  await expect(page.getByTestId("llm-settings-form-basic")).toBeVisible({
    timeout: 15_000,
  });
}

/** Scroll down until the profiles section is visible and both rows have loaded. */
async function waitForProfileRows(page: Page) {
  const firstRow = page.getByTestId("profile-row").first();
  await firstRow.scrollIntoViewIfNeeded();
  await expect(firstRow).toBeVisible({ timeout: 10_000 });
  await expect(page.getByTestId("profile-row")).toHaveCount(2, {
    timeout: 10_000,
  });
}

test.describe("LLM Settings Visual Snapshots", () => {
  test.setTimeout(60_000);
  // Run in serial to avoid MSW profile-store races across tests
  test.describe.configure({ mode: "serial" });

  test("LLM settings advanced tab shows extra fields", async ({ page }) => {
    await navigateToLlmSettings(page);

    // Click the "Advanced" toggle (rendered by ViewToggle with testId sdk-section-advanced-toggle)
    await page.getByTestId("sdk-section-advanced-toggle").click();

    // The advanced form div should now be visible (custom model + base URL inputs)
    await expect(page.getByTestId("llm-settings-form-advanced")).toBeVisible({
      timeout: 5_000,
    });
    // Confirm a known advanced-only field is present
    await expect(page.getByTestId("llm-custom-model-input")).toBeVisible();

    await expect(page.getByTestId("root-layout")).toHaveScreenshot(
      "settings-llm-advanced.png",
      { animations: "disabled", maxDiffPixelRatio: 0.01 },
    );
  });

  test("LLM settings shows key-set indicator after entering an API key", async ({
    page,
  }) => {
    await navigateToLlmSettings(page);

    // Fill the API key password input
    await page.getByTestId("llm-api-key-input").fill("sk-test-key-for-snapshot");

    // The Save button should now be enabled (field is dirty)
    await expect(page.getByTestId("save-button")).not.toBeDisabled({
      timeout: 3_000,
    });

    // Save to let the mock sync llm_api_key_is_set → true
    await page.getByTestId("save-button").click();

    // After the settings re-fetch, the KeyStatusIcon with testId "set-indicator" should appear
    await expect(page.getByTestId("set-indicator")).toBeVisible({
      timeout: 10_000,
    });

    await expect(page.getByTestId("root-layout")).toHaveScreenshot(
      "settings-llm-api-key-set.png",
      { animations: "disabled", maxDiffPixelRatio: 0.01 },
    );
  });

  test("LLM profiles manager shows two profile rows", async ({ page }) => {
    await navigateToLlmSettings(page);
    await waitForProfileRows(page);

    await expect(page.getByTestId("root-layout")).toHaveScreenshot(
      "settings-llm-profiles.png",
      { animations: "disabled", maxDiffPixelRatio: 0.01 },
    );
  });

  test("LLM profile rename modal opens with correct profile name", async ({
    page,
  }) => {
    await navigateToLlmSettings(page);
    await waitForProfileRows(page);

    // Open the actions menu for the first profile row ("gpt-4o-default")
    await page.getByTestId("profile-menu-trigger").first().click();
    await expect(page.getByTestId("profile-actions-menu")).toBeVisible({
      timeout: 3_000,
    });

    // Click the Rename menu item
    await page.getByTestId("profile-rename").click();

    // The rename modal should appear
    await expect(page.getByTestId("rename-profile-modal")).toBeVisible({
      timeout: 5_000,
    });

    // The modal input should be pre-populated with the profile name
    await expect(page.getByTestId("rename-profile-input")).toHaveValue(
      "gpt-4o-default",
    );

    await expect(page.getByTestId("root-layout")).toHaveScreenshot(
      "settings-llm-rename-modal.png",
      { animations: "disabled", maxDiffPixelRatio: 0.01 },
    );
  });

  test("LLM profile delete confirmation modal opens", async ({ page }) => {
    await navigateToLlmSettings(page);
    await waitForProfileRows(page);

    // Open the actions menu for the second profile row ("claude-haiku-fast")
    await page.getByTestId("profile-menu-trigger").nth(1).click();
    await expect(page.getByTestId("profile-actions-menu")).toBeVisible({
      timeout: 3_000,
    });

    // Click the Delete menu item
    await page.getByTestId("profile-delete").click();

    // The delete confirmation modal should appear (identified by its confirm button)
    await expect(page.getByTestId("delete-profile-confirm")).toBeVisible({
      timeout: 5_000,
    });

    // The modal body should mention the profile name (use a paragraph selector to
    // avoid strict-mode violations since the profile row also contains the name)
    await expect(page.locator("p.break-all")).toContainText("claude-haiku-fast");

    await expect(page.getByTestId("root-layout")).toHaveScreenshot(
      "settings-llm-delete-modal.png",
      { animations: "disabled", maxDiffPixelRatio: 0.01 },
    );
  });
});
