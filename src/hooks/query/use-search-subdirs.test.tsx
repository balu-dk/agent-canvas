import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useCreateSubdir } from "./use-search-subdirs";

const { uploadTextFile } = vi.hoisted(() => ({
  uploadTextFile: vi.fn(),
}));

vi.mock("@openhands/typescript-client/clients", () => ({
  FileClient: class {
    uploadTextFile = uploadTextFile;
  },
}));
vi.mock("#/api/agent-server-client-options", () => ({
  getAgentServerClientOptions: () => ({}),
}));
vi.mock("#/contexts/active-backend-context", () => ({
  useActiveBackend: () => ({ backend: { id: "b1" }, orgId: null }),
}));

function wrapper({ children }: { children: ReactNode }) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

describe("useCreateSubdir", () => {
  beforeEach(() => {
    uploadTextFile.mockReset();
    uploadTextFile.mockResolvedValue({});
  });

  it("creates a folder by writing a .gitkeep placeholder into the new path", async () => {
    const { result } = renderHook(() => useCreateSubdir(), { wrapper });

    const created = await result.current.mutateAsync({
      parentPath: "/projects",
      name: "my-app",
    });

    expect(created).toBe("/projects/my-app");
    expect(uploadTextFile).toHaveBeenCalledWith(
      "",
      "/projects/my-app",
      ".gitkeep",
    );
  });

  it("does not double the separator when the parent path has a trailing slash", async () => {
    const { result } = renderHook(() => useCreateSubdir(), { wrapper });

    await result.current.mutateAsync({ parentPath: "/projects/", name: "app" });

    await waitFor(() =>
      expect(uploadTextFile).toHaveBeenCalledWith(
        "",
        "/projects/app",
        ".gitkeep",
      ),
    );
  });
});
