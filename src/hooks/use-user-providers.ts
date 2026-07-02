import React from "react";
import { useQuery } from "@tanstack/react-query";
import { convertRawProvidersToList } from "#/utils/convert-raw-providers-to-list";
import { useSettings } from "./query/use-settings";
import { useActiveBackend } from "#/contexts/active-backend-context";
import { SecretsService } from "#/api/secrets-service";
import { GITHUB_TOKEN_SECRET_NAME } from "#/api/git-service/github-direct";
import { Provider } from "#/types/settings";

export const useUserProviders = () => {
  const { data: settings, isLoading: isLoadingSettings } = useSettings();
  const { backend } = useActiveBackend();

  // Local backends have no provider-token registry (that's an app-server
  // concept) — but a saved GITHUB_TOKEN custom secret enables the direct
  // GitHub repo/branch listing (see api/git-service/github-direct.ts), so
  // surface "github" as an available provider when it exists.
  const { data: hasGitHubSecret } = useQuery({
    queryKey: ["secrets", "has-github-token", backend.id],
    queryFn: async () => {
      const secrets = await SecretsService.getSecrets();
      return secrets.some((secret) => secret.name === GITHUB_TOKEN_SECRET_NAME);
    },
    enabled: backend.kind === "local",
    staleTime: 5 * 60 * 1000,
    retry: false,
  });

  const providers = React.useMemo(() => {
    const fromSettings = convertRawProvidersToList(
      settings?.provider_tokens_set,
    );
    if (hasGitHubSecret && !fromSettings.includes("github" as Provider)) {
      return [...fromSettings, "github" as Provider];
    }
    return fromSettings;
  }, [settings?.provider_tokens_set, hasGitHubSecret]);

  return {
    providers,
    isLoadingSettings,
  };
};
