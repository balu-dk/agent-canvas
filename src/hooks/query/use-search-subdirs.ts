import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FileClient } from "@openhands/typescript-client/clients";
import { getAgentServerClientOptions } from "#/api/agent-server-client-options";
import { useActiveBackend } from "#/contexts/active-backend-context";

export interface FileBrowserEntry {
  label: string;
  path: string;
}

export interface HomeDirectoryResponse {
  home: string;
  favorites?: FileBrowserEntry[];
  locations?: FileBrowserEntry[];
}

function getFileClient() {
  return new FileClient(getAgentServerClientOptions());
}

export const useSearchSubdirs = (path: string | null) => {
  const active = useActiveBackend();
  return useQuery({
    queryKey: ["file", "search_subdirs", path, active.backend.id, active.orgId],
    queryFn: () => getFileClient().searchSubdirectories(path as string),
    enabled: !!path,
    retry: false,
    meta: { disableToast: true },
  });
};

/**
 * Create a new subdirectory under `parentPath`. The agent-server has no
 * mkdir endpoint, but `/api/file/upload` `mkdir -p`s the destination, so we
 * create the folder by writing an empty `.gitkeep` placeholder into it.
 * Invalidates the parent listing so the new folder appears.
 */
export const useCreateSubdir = () => {
  const active = useActiveBackend();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      parentPath,
      name,
    }: {
      parentPath: string;
      name: string;
    }): Promise<string> => {
      const newPath = `${parentPath.replace(/\/+$/, "")}/${name}`;
      await getFileClient().uploadTextFile("", newPath, ".gitkeep");
      return newPath;
    },
    onSuccess: (_newPath, { parentPath }) => {
      queryClient.invalidateQueries({
        queryKey: [
          "file",
          "search_subdirs",
          parentPath,
          active.backend.id,
          active.orgId,
        ],
      });
    },
  });
};

export const useHomeDirectory = () => {
  const active = useActiveBackend();
  return useQuery({
    queryKey: ["file", "home", active.backend.id, active.orgId],
    queryFn: async (): Promise<HomeDirectoryResponse> =>
      getFileClient().getHome(),
    retry: false,
    meta: { disableToast: true },
    staleTime: Infinity,
  });
};
