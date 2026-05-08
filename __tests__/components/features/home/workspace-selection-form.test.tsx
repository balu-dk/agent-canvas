import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, vi, beforeEach, it } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { WorkspaceSelectionForm } from "#/components/features/home/workspace-selection-form";
import AgentServerConversationService from "#/api/conversation-service/agent-server-conversation-service.api";
import FilesService from "#/api/files-service/files-service.api";
import { useWorkspacesStore } from "#/stores/workspaces-store";
import { LocalWorkspace } from "#/types/workspace";

const mockNavigate = vi.fn();
const mockUseIsCreatingConversation = vi.fn();

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock("#/context/navigation-context", () => ({
  useNavigation: () => ({
    currentPath: "/",
    conversationId: null,
    isNavigating: false,
    navigate: mockNavigate,
  }),
}));

vi.mock("#/hooks/use-is-creating-conversation", () => ({
  useIsCreatingConversation: () => mockUseIsCreatingConversation(),
}));

vi.mock("#/hooks/use-tracking", () => ({
  useTracking: () => ({
    trackConversationCreated: vi.fn(),
    trackLoginButtonClick: vi.fn(),
  }),
}));

mockUseIsCreatingConversation.mockReturnValue(false);

function makeStartTask(overrides: Record<string, unknown> = {}) {
  return {
    id: "conv-abc",
    created_by_user_id: null,
    status: "READY",
    detail: null,
    app_conversation_id: "conv-abc",
    agent_server_url: "http://agent-server.local",
    request: { initial_message: undefined, plugins: null },
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  } as never;
}

function renderForm(initialWorkspaces: LocalWorkspace[] = []) {
  useWorkspacesStore.setState({
    workspaces: initialWorkspaces,
    workspaceParents: [],
  });
  return render(<WorkspaceSelectionForm />, {
    wrapper: ({ children }) => (
      <QueryClientProvider
        client={
          new QueryClient({
            defaultOptions: {
              queries: { retry: false },
              mutations: { retry: false },
            },
          })
        }
      >
        {children}
      </QueryClientProvider>
    ),
  });
}

describe("WorkspaceSelectionForm", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.restoreAllMocks();
    mockUseIsCreatingConversation.mockReturnValue(false);
    useWorkspacesStore.setState({ workspaces: [], workspaceParents: [] });
  });

  it("shows empty message when no workspaces are added", () => {
    renderForm();
    expect(screen.getByText("HOME$NO_WORKSPACES")).toBeInTheDocument();
  });

  it("renders readable workspace rows and launches by clicking an item", async () => {
    const workspaces: LocalWorkspace[] = [
      { id: "/Users/me/dev/repo1", name: "repo1", path: "/Users/me/dev/repo1" },
      { id: "/Users/me/dev/repo2", name: "repo2", path: "/Users/me/dev/repo2" },
    ];
    const createSpy = vi
      .spyOn(AgentServerConversationService, "createConversation")
      .mockResolvedValue(makeStartTask({ app_conversation_id: "conv-xyz" }));

    renderForm(workspaces);
    const user = userEvent.setup();

    const repo1Item = screen.getByTestId("workspace-item-repo1");
    expect(repo1Item).toBeInTheDocument();
    expect(screen.getByTestId("workspace-item-repo2")).toBeInTheDocument();
    expect(repo1Item).toHaveAttribute(
      "title",
      "repo1\n/Users/me/dev/repo1",
    );
    expect(repo1Item).toHaveTextContent("repo1");
    expect(repo1Item).toHaveTextContent("HOME$LOCAL_FOLDER_TOOLTIP");
    expect(repo1Item).toHaveTextContent("/Users/me/dev/repo1");
    expect(repo1Item).not.toHaveTextContent("HOME$LOCAL_FOLDER_TOOLTIP ·");
    expect(screen.getByText("/Users/me/dev/repo1")).toHaveAttribute(
      "title",
      "/Users/me/dev/repo1",
    );

    await user.click(screen.getByTestId("workspace-item-repo2"));

    await waitFor(() => expect(createSpy).toHaveBeenCalledTimes(1));
    expect(createSpy).toHaveBeenCalledWith(
      undefined,
      undefined,
      undefined,
      null,
      "/Users/me/dev/repo2",
      undefined,
      undefined,
    );
    await waitFor(() =>
      expect(mockNavigate).toHaveBeenCalledWith("/conversations/conv-xyz"),
    );
  });

  it("Add Folder adds only the chosen folder, not its subdirectories", async () => {
    vi.spyOn(FilesService, "getHome").mockResolvedValue({ home: "/Users/me" });
    const searchSpy = vi
      .spyOn(FilesService, "searchSubdirs")
      .mockImplementation(async (path: string) => {
        if (path === "/Users/me") {
          return {
            items: [{ name: "dev", path: "/Users/me/dev" }],
            next_page_id: null,
          };
        }
        if (path === "/Users/me/dev") {
          return {
            items: [
              { name: "repo1", path: "/Users/me/dev/repo1" },
              { name: "repo2", path: "/Users/me/dev/repo2" },
            ],
            next_page_id: null,
          };
        }
        throw new Error(`unexpected path ${path}`);
      });

    renderForm();
    const user = userEvent.setup();

    await user.click(screen.getByTestId("add-workspace-button"));
    await screen.findByTestId("folder-browser-modal");
    expect(
      screen.queryByTestId("folder-browser-add-all-subdirs"),
    ).not.toBeInTheDocument();

    await user.click(await screen.findByTestId("folder-browser-entry-dev"));
    await screen.findByTestId("folder-browser-entry-repo1");
    await user.click(screen.getByTestId("folder-browser-use"));

    await waitFor(() =>
      expect(
        screen.queryByTestId("folder-browser-modal"),
      ).not.toBeInTheDocument(),
    );

    const stored = useWorkspacesStore.getState().workspaces;
    expect(stored).toHaveLength(1);
    expect(stored[0].path).toBe("/Users/me/dev");
    expect(stored[0].name).toBe("dev");
    expect(searchSpy).toHaveBeenCalledWith("/Users/me/dev");
  });

  it("can remove a workspace from the list", async () => {
    renderForm([
      { id: "/Users/me/dev/repo1", name: "repo1", path: "/Users/me/dev/repo1" },
    ]);
    const user = userEvent.setup();

    expect(screen.getByTestId("workspace-item-repo1")).toBeInTheDocument();

    await user.click(screen.getByTestId("workspace-remove-repo1"));

    expect(useWorkspacesStore.getState().workspaces).toHaveLength(0);
  });
});
