import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import Navbar from "../Navbar.jsx";

describe("Navbar", () => {
  it("renders both navigation tabs", () => {
    render(<Navbar activeTab="sales" onTabChange={vi.fn()} />);

    expect(screen.getByText("المبيعات والأرباح")).toBeInTheDocument();
    expect(screen.getByText("ستوديو المحتوى والسيو")).toBeInTheDocument();
  });

  it("marks the active tab appropriately with aria-selected", () => {
    const { rerender } = render(
      <Navbar activeTab="sales" onTabChange={vi.fn()} />,
    );
    expect(screen.getByRole("tab", { name: /المبيعات والأرباح/i })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(
      screen.getByRole("tab", { name: /ستوديو المحتوى والسيو/i }),
    ).toHaveAttribute("aria-selected", "false");

    rerender(<Navbar activeTab="content" onTabChange={vi.fn()} />);
    expect(screen.getByRole("tab", { name: /المبيعات والأرباح/i })).toHaveAttribute(
      "aria-selected",
      "false",
    );
    expect(
      screen.getByRole("tab", { name: /ستوديو المحتوى والسيو/i }),
    ).toHaveAttribute("aria-selected", "true");
  });

  it("calls onTabChange when a tab is clicked", async () => {
    const user = userEvent.setup();
    const handleTabChange = vi.fn();

    render(<Navbar activeTab="sales" onTabChange={handleTabChange} />);
    const contentTab = screen.getByRole("tab", { name: /ستوديو المحتوى والسيو/i });
    await user.click(contentTab);

    expect(handleTabChange).toHaveBeenCalledWith("content");
  });

  it("displays the content issues count badge when > 0", () => {
    render(
      <Navbar activeTab="sales" onTabChange={vi.fn()} contentIssuesCount={5} />,
    );
    expect(screen.getByText("5")).toBeInTheDocument();
  });
});
