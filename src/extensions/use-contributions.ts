import {
  selectActivityBarItems,
  selectCommands,
  selectViews,
  useContributionRegistry,
} from "./contribution-registry";
import type { ActivityBarItem, CommandItem, ViewItem } from "./types";

/**
 * React hooks exposing the contribution registry to host UI. Each selects a single
 * slice so a component only re-renders when its relevant contributions change.
 */

export function useActivityBarItems(): ActivityBarItem[] {
  return useContributionRegistry(selectActivityBarItems);
}

export function useExtensionCommands(): CommandItem[] {
  return useContributionRegistry(selectCommands);
}

export function useExtensionViews(): ViewItem[] {
  return useContributionRegistry(selectViews);
}
