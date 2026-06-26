import { render, screen, fireEvent } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { SidebarContributionButton } from "#/components/features/sidebar/sidebar-contribution-button";
import type { ActivityBarItem } from "#/extensions/types";

function makeItem(overrides: Partial<ActivityBarItem> = {}): ActivityBarItem {
  return {
    extensionId: "acme.compliance",
    id: "acme.compliance.container",
    title: "Compliance",
    onSelect: vi.fn(),
    ...overrides,
  };
}

describe("SidebarContributionButton", () => {
  it("renders the item title and calls onSelect when clicked", () => {
    const onSelect = vi.fn();
    const item = makeItem({ onSelect });
    render(<SidebarContributionButton item={item} />);

    const button = screen.getByTestId(
      "sidebar-extension-acme.compliance-acme.compliance.container",
    );
    expect(button).toHaveTextContent("Compliance");

    fireEvent.click(button);
    expect(onSelect).toHaveBeenCalledTimes(1);
  });

  it("renders the bundle-provided icon as an <img> when iconUrl is set", () => {
    const item = makeItem({ iconUrl: "blob:fake-icon" });
    const { container } = render(<SidebarContributionButton item={item} />);

    const img = container.querySelector("img");
    expect(img).not.toBeNull();
    expect(img).toHaveAttribute("src", "blob:fake-icon");
  });

  it("does not call onSelect when disabled", () => {
    const onSelect = vi.fn();
    const item = makeItem({ onSelect });
    render(<SidebarContributionButton item={item} disabled />);

    const button = screen.getByTestId(
      "sidebar-extension-acme.compliance-acme.compliance.container",
    );
    fireEvent.click(button);
    expect(onSelect).not.toHaveBeenCalled();
  });
});
