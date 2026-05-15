import { useMutation, useQueryClient } from "@tanstack/react-query";
import SkillsService from "#/api/skills-service";

export const useUninstallSkill = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (name: string) => SkillsService.uninstallSkill(name),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["installed-skills"] });
      void queryClient.invalidateQueries({ queryKey: ["skills"] });
    },
  });
};
