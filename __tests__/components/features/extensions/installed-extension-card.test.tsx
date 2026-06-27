import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { InstalledExtensionCard } from "#/components/features/extensions/installed-extension-card";
import type { InstalledExtension } from "#/extensions/installed-store";

function makeExtension(
  overrides: Partial<InstalledExtension> = {},
): InstalledExtension {
  return {
    id: "acme.hello",
    name: "Hello",
    version: "1.2.3",
    publisher: "acme",
    capabilities: ["conversation:read"],
    sourceUrl: "/__extensions/hello",
    origin: "user",
    ...overrides,
  };
}

describe("InstalledExtensionCard", () => {
  it("renders a user extension with an uninstall action", async () => {
    const user = userEvent.setup();
    const onUninstall = vi.fn();
    render(
      <InstalledExtensionCard
        extension={makeExtension()}
        onUninstall={onUninstall}
      />,
    );

    expect(
      screen.getByTestId("installed-extension-name-acme.hello"),
    ).toHaveTextContent("Hello");
    expect(
      screen.getByTestId("installed-extension-version-acme.hello"),
    ).toBeInTheDocument();

    await user.click(screen.getByTestId("uninstall-extension-acme.hello"));
    expect(onUninstall).toHaveBeenCalledTimes(1);
  });

  it("shows a dev badge and no uninstall for dev-origin extensions", () => {
    render(
      <InstalledExtensionCard
        extension={makeExtension({ origin: "dev" })}
        onUninstall={vi.fn()}
      />,
    );
    expect(
      screen.queryByTestId("uninstall-extension-acme.hello"),
    ).not.toBeInTheDocument();
  });

  it("shows the source ref for user installs", () => {
    render(
      <InstalledExtensionCard
        extension={makeExtension({ sourceRef: "npm:acme-hello@^1" })}
        onUninstall={vi.fn()}
      />,
    );
    expect(
      screen.getByTestId("installed-extension-source-acme.hello"),
    ).toHaveAttribute("title", "npm:acme-hello@^1");
  });

  it("renders an update badge and triggers onUpdate when an update is available", async () => {
    const user = userEvent.setup();
    const onUpdate = vi.fn();
    render(
      <InstalledExtensionCard
        extension={makeExtension({ sourceRef: "npm:acme-hello@^1" })}
        onUninstall={vi.fn()}
        update={{
          id: "acme.hello",
          currentVersion: "1.2.3",
          latestVersion: "1.4.0",
          sourceRef: "npm:acme-hello@^1",
        }}
        onUpdate={onUpdate}
      />,
    );

    expect(
      screen.getByTestId("installed-extension-update-badge-acme.hello"),
    ).toBeInTheDocument();
    await user.click(screen.getByTestId("update-extension-acme.hello"));
    expect(onUpdate).toHaveBeenCalledTimes(1);
  });

  it("disables the update button while updating", () => {
    render(
      <InstalledExtensionCard
        extension={makeExtension({ sourceRef: "npm:acme-hello@^1" })}
        onUninstall={vi.fn()}
        update={{
          id: "acme.hello",
          currentVersion: "1.2.3",
          latestVersion: "1.4.0",
          sourceRef: "npm:acme-hello@^1",
        }}
        onUpdate={vi.fn()}
        isUpdating
      />,
    );
    expect(screen.getByTestId("update-extension-acme.hello")).toBeDisabled();
  });

  it("does not show update affordances for dev extensions", () => {
    render(
      <InstalledExtensionCard
        extension={makeExtension({ origin: "dev" })}
        onUninstall={vi.fn()}
        update={{
          id: "acme.hello",
          currentVersion: "1.2.3",
          latestVersion: "1.4.0",
          sourceRef: "npm:acme-hello@^1",
        }}
        onUpdate={vi.fn()}
      />,
    );
    expect(
      screen.queryByTestId("update-extension-acme.hello"),
    ).not.toBeInTheDocument();
  });
});
