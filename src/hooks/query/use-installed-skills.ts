import { useQuery } from "@tanstack/react-query";
import type { InstalledSkillSummary } from "@openhands/typescript-client";
import SkillsService from "#/api/skills-service";

export const useInstalledSkills = () =>
  useQuery<InstalledSkillSummary[]>({
    queryKey: ["installed-skills"],
    queryFn: SkillsService.listInstalledSkills,
    staleTime: 1000 * 60 * 5, // 5 minutes
    refetchOnWindowFocus: false,
  });
