import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import App from "../App.jsx";

const bootstrapState = {
  isReady: false,
  layout: null,
  token: null,
  verifyStatus: "idle",
  error: null,
};

vi.mock("../hooks/useAppBootstrap.js", () => ({
  useAppBootstrap: () => ({
    ...bootstrapState,
    bootstrap: vi.fn().mockResolvedValue(undefined),
  }),
}));

const productsState = {
  products: [],
  totalSold: 0,
  isLoading: false,
  error: null,
  reload: vi.fn(),
};

vi.mock("../hooks/useProducts.js", () => ({
  useProducts: () => productsState,
}));

describe("App", () => {
  beforeEach(() => {
    Object.assign(bootstrapState, {
      isReady: false,
      layout: null,
      token: null,
      verifyStatus: "idle",
      error: null,
    });
    Object.assign(productsState, { products: [], totalSold: 0 });
  });

  it("has no header of its own (the dashboard shows the title)", () => {
    render(<App />);
    expect(screen.queryByRole("banner")).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { level: 1 })).not.toBeInTheDocument();
  });

  it("shows the developer status bar only outside the dashboard", () => {
    render(<App />);
    // jsdom runs top-level (standalone)
    expect(screen.getByText("Mode:")).toBeInTheDocument();
    expect(document.querySelector(".app")).toHaveClass("app-standalone");
  });

  it("hides the status bar inside the dashboard iframe", () => {
    const parent = {};
    const spy = vi.spyOn(window, "parent", "get").mockReturnValue(parent);
    try {
      render(<App />);
      expect(screen.queryByText("Mode:")).not.toBeInTheDocument();
      expect(document.querySelector(".app")).not.toHaveClass("app-standalone");
    } finally {
      spy.mockRestore();
    }
  });

  it("asks to open from the dashboard when running standalone", () => {
    render(<App />);
    expect(
      screen.getByText(/Open this app from the Salla merchant dashboard/),
    ).toBeInTheDocument();
  });

  it("renders GrowthCopilotHub when products are loaded in dashboard mode", () => {
    const parent = {};
    const spy = vi.spyOn(window, "parent", "get").mockReturnValue(parent);
    Object.assign(bootstrapState, {
      isReady: true,
      token: "test-token",
      layout: { currency: "SAR", theme: "light" },
      verifyStatus: "verified",
    });
    Object.assign(productsState, {
      products: [
        {
          id: 1,
          name: "قهوة سعودية مختصة",
          price: 50,
          soldQuantity: 15,
          quantity: 20,
        },
      ],
      totalSold: 15,
    });

    try {
      render(<App />);
      expect(screen.getByText("مساعد النمو الذكي للكتالوج")).toBeInTheDocument();
    } finally {
      spy.mockRestore();
    }
  });
});
