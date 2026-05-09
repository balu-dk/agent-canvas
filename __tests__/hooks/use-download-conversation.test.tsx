import React from "react";
import { act, renderHook } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useDownloadConversation } from "#/hooks/use-download-conversation";
import AgentServerConversationService from "#/api/conversation-service/agent-server-conversation-service.api";
import ConversationService from "#/api/conversation-service/conversation-service.api";
import { downloadTrajectory } from "#/utils/download-trajectory";

const mockPosthogCapture = vi.fn();

vi.mock("posthog-js/react", () => ({
  usePostHog: () => ({ capture: mockPosthogCapture }),
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

vi.mock("#/utils/custom-toast-handlers", () => ({
  displayErrorToast: vi.fn(),
}));

vi.mock("#/utils/download-trajectory", () => ({
  downloadTrajectory: vi.fn(),
}));

vi.mock("#/utils/utils", () => ({
  downloadBlob: vi.fn(),
}));

vi.mock("#/api/conversation-service/conversation-service.api", () => ({
  default: {
    getTrajectory: vi.fn(),
  },
}));

vi.mock(
  "#/api/conversation-service/agent-server-conversation-service.api",
  () => ({
    default: {
      downloadConversation: vi.fn(),
    },
  }),
);

const createWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      mutations: { retry: false },
      queries: { retry: false },
    },
  });

  return function Wrapper({ children }: React.PropsWithChildren) {
    return (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
  };
};

describe("useDownloadConversation", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("exports the trajectory from the events API instead of the server-side zip endpoint", async () => {
    const trajectory = [{ id: "event-1" }];
    vi.mocked(ConversationService.getTrajectory).mockResolvedValue({
      trajectory,
    });
    vi.mocked(
      AgentServerConversationService.downloadConversation,
    ).mockResolvedValue(new Blob(["zip-bytes"], { type: "application/zip" }));

    const { result } = renderHook(() => useDownloadConversation(), {
      wrapper: createWrapper(),
    });

    await act(async () => {
      await result.current.mutateAsync("conv-123");
    });

    expect(mockPosthogCapture).toHaveBeenCalledWith(
      "download_trajectory_button_clicked",
    );
    expect(ConversationService.getTrajectory).toHaveBeenCalledWith("conv-123");
    expect(downloadTrajectory).toHaveBeenCalledWith("conv-123", trajectory);
    expect(
      AgentServerConversationService.downloadConversation,
    ).not.toHaveBeenCalled();
  });
});
