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

  it("renders the header", () => {
    render(<App />);
    expect(
      screen.getByRole("heading", { name: "Product Sales", level: 1 }),
    ).toBeInTheDocument();
  });

  it("asks to open from the dashboard when running standalone", () => {
    render(<App />);
    expect(
      screen.getByText(/Open this app from the Salla merchant dashboard/),
    ).toBeInTheDocument();
  });
});
