import { useQuery } from "@tanstack/react-query";
import { FileClient } from "@openhands/typescript-client/clients";
// Temporary bridge: the pinned typed `FileClient` cannot forward an
// `include_hidden` query param yet, so the hidden-folder path uses the typed
// `HttpClient` directly. Remove this once a released client adds the param to
// `FileClient.searchSubdirectories` / `getHome` (see agent-server PR adding
// `include_hidden` to /api/file/search_subdirs + /api/file/home).
// eslint-disable-next-line no-restricted-imports
import { HttpClient } from "@openhands/typescript-client/client/http-client";
import {
  getAgentServerClientOptions,
  getAgentServerHttpClientOptions,
} from "#/api/agent-server-client-options";
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

interface SubdirectoryEntry {
  name: string;
  path: string;
}

interface SubdirectoryPage {
  items: SubdirectoryEntry[];
  next_page_id: string | null;
}

const SEARCH_SUBDIRS_PATH = "/api/file/search_subdirs";
const HOME_PATH = "/api/file/home";

function getFileClient() {
  return new FileClient(getAgentServerClientOptions());
}

// The pinned typed `FileClient` does not yet forward an `include_hidden`
// query param, so the hidden-folder path goes through the (also typed and
// guard-approved) `HttpClient`. Older agent-servers simply ignore the unknown
// param and keep filtering hidden entries, so this stays backward-compatible.
function searchSubdirectories(
  path: string,
  includeHidden: boolean,
): Promise<SubdirectoryPage> {
  if (!includeHidden) {
    return getFileClient().searchSubdirectories(path);
  }
  return new HttpClient(getAgentServerHttpClientOptions())
    .get<SubdirectoryPage>(SEARCH_SUBDIRS_PATH, {
      params: { path, include_hidden: true },
    })
    .then((response) => response.data);
}

function getHomeDirectory(
  includeHidden: boolean,
): Promise<HomeDirectoryResponse> {
  if (!includeHidden) {
    return getFileClient().getHome();
  }
  return new HttpClient(getAgentServerHttpClientOptions())
    .get<HomeDirectoryResponse>(HOME_PATH, {
      params: { include_hidden: true },
    })
    .then((response) => response.data);
}

export const useSearchSubdirs = (
  path: string | null,
  includeHidden = false,
) => {
  const active = useActiveBackend();
  return useQuery({
    queryKey: [
      "file",
      "search_subdirs",
      path,
      includeHidden,
      active.backend.id,
      active.orgId,
    ],
    queryFn: () => searchSubdirectories(path as string, includeHidden),
    enabled: !!path,
    retry: false,
    meta: { disableToast: true },
  });
};

export const useHomeDirectory = (includeHidden = false) => {
  const active = useActiveBackend();
  return useQuery({
    queryKey: ["file", "home", includeHidden, active.backend.id, active.orgId],
    queryFn: async (): Promise<HomeDirectoryResponse> =>
      getHomeDirectory(includeHidden),
    retry: false,
    meta: { disableToast: true },
    staleTime: Infinity,
  });
};
