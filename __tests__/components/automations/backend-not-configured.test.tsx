import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { BackendNotConfigured } from "#/components/features/automations/backend-not-configured";
import { I18nKey } from "#/i18n/declaration";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => {
      const translations: Record<string, string> = {
        [I18nKey.AUTOMATIONS$BACKEND_NOT_CONFIGURED_TITLE]:
          "Automations Backend Not Configured",
        [I18nKey.AUTOMATIONS$BACKEND_NOT_CONFIGURED_MESSAGE]:
          "The automations backend is not running or not reachable.",
        [I18nKey.AUTOMATIONS$BACKEND_NOT_CONFIGURED_RETRY]: "Retry Connection",
      };
      return translations[key] || key;
    },
  }),
}));

vi.mock("#/api/agent-server-config", () => ({
  getAgentServerBaseUrl: () => "http://localhost:18000",
}));

describe("BackendNotConfigured", () => {
  it("renders the not configured message", () => {
    const onRetry = vi.fn();
    render(<BackendNotConfigured onRetry={onRetry} />);

    expect(
      screen.getByText("Automations Backend Not Configured"),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "The automations backend is not running or not reachable.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByText("http://localhost:18000")).toBeInTheDocument();
  });

  it("displays the retry button", () => {
    const onRetry = vi.fn();
    render(<BackendNotConfigured onRetry={onRetry} />);

    const retryButton = screen.getByRole("button", { name: "Retry Connection" });
    expect(retryButton).toBeInTheDocument();
  });

  it("calls onRetry when retry button is clicked", () => {
    const onRetry = vi.fn();
    render(<BackendNotConfigured onRetry={onRetry} />);

    const retryButton = screen.getByRole("button", { name: "Retry Connection" });
    fireEvent.click(retryButton);

    expect(onRetry).toHaveBeenCalledTimes(1);
  });
});
