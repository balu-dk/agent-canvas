import { useMutation, useQueryClient } from "@tanstack/react-query";
import SkillsService from "#/api/skills-service";

export const useInstallSkill = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (source: string) => SkillsService.installSkill(source),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["installed-skills"] });
      void queryClient.invalidateQueries({ queryKey: ["skills"] });
    },
  });
};
