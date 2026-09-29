import {
  describe,
  it,
  expect,
  vi,
  beforeAll,
  beforeEach,
  afterEach,
} from "vitest";
import { render, screen, within, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import CampaignBuilder from "../CampaignBuilder.jsx";

// Use the real storefront renderer for the preview
beforeAll(async () => {
  await import("../../../../public/storefront/campaign.js");
});

const product = (id, name, overrides = {}) => ({
  id,
  name,
  price: 100,
  salePrice: null,
  currency: "SAR",
  image: null,
  url: `https://store.test/p/${id}`,
  quantity: 10,
  soldQuantity: 5,
  categories: [],
  ...overrides,
});

const products = [
  product(1, "Best seller", { soldQuantity: 40 }),
  product(2, "Idle oud", { soldQuantity: 0, quantity: 30 }),
  product(3, "Idle musk", { soldQuantity: 0, quantity: 5 }),
];

function renderBuilder(props = {}) {
  const handlers = {
    onPublish: vi.fn().mockResolvedValue({ success: true }),
    onStop: vi.fn().mockResolvedValue({ success: true }),
  };
  const utils = render(
    <CampaignBuilder
      products={products}
      campaign={null}
      isLoading={false}
      isSaving={false}
      error={null}
      embedded={null}
      {...handlers}
      {...props}
    />,
  );
  return { ...handlers, ...utils };
}

const previewRoot = () =>
  document.querySelector(".campaign-preview-host").shadowRoot;

describe("CampaignBuilder", () => {
  beforeEach(() => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("pre-selects the idle products and lists them first", () => {
    renderBuilder();
    const options = screen.getAllByRole("checkbox");
    expect(options.map((o) => o.closest("label").textContent)).toEqual([
      expect.stringContaining("Idle oud"),
      expect.stringContaining("Idle musk"),
      expect.stringContaining("Best seller"),
    ]);
    expect(screen.getByRole("checkbox", { name: /Idle oud/ })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: /Idle musk/ })).toBeChecked();
    expect(
      screen.getByRole("checkbox", { name: /Best seller/ }),
    ).not.toBeChecked();
    expect(screen.getByText("2/6")).toBeInTheDocument();
  });

  it("renders the live preview with the real storefront script", async () => {
    renderBuilder();
    await waitFor(() =>
      expect(previewRoot()?.querySelector(".badge")).toBeTruthy(),
    );
    expect(previewRoot().querySelector(".badge").textContent).toBe("خصم 20%");
    expect(previewRoot().querySelectorAll(".product")).toHaveLength(2);
  });

  it("updates the preview as the merchant edits", async () => {
    renderBuilder();
    const title = screen.getByLabelText("Title");
    await userEvent.clear(title);
    await userEvent.type(title, "Last chance");
    const discount = screen.getByLabelText("Discount");
    await userEvent.clear(discount);
    await userEvent.type(discount, "35");

    await waitFor(() =>
      expect(previewRoot().getElementById("promo-title").textContent).toBe(
        "Last chance",
      ),
    );
    expect(previewRoot().querySelector(".badge").textContent).toBe("خصم 35%");
    // 100 - 35%
    expect(previewRoot().querySelector(".product strong").textContent).toBe(
      "65 ر.س",
    );
  });

  it("switches theme and position in the preview", async () => {
    renderBuilder();
    await userEvent.click(screen.getByRole("radio", { name: "Dark" }));
    await userEvent.click(screen.getByRole("radio", { name: "Bottom sheet" }));
    await waitFor(() => {
      const overlay = previewRoot().querySelector(".overlay");
      expect(overlay.classList.contains("theme-dark")).toBe(true);
      expect(overlay.classList.contains("pos-bottom")).toBe(true);
    });
  });

  it("blocks publishing an invalid campaign and says why", async () => {
    renderBuilder();
    await userEvent.click(screen.getByRole("checkbox", { name: /Idle oud/ }));
    await userEvent.click(screen.getByRole("checkbox", { name: /Idle musk/ }));

    expect(screen.getByRole("alert")).toHaveTextContent(
      "Choose at least one product",
    );
    expect(
      screen.getByRole("button", { name: "Publish to store" }),
    ).toBeDisabled();
  });

  it("confirms, then publishes the validated campaign", async () => {
    const { onPublish } = renderBuilder();
    await userEvent.click(
      screen.getByRole("button", { name: "Publish to store" }),
    );

    expect(window.confirm).toHaveBeenCalledWith(
      expect.stringContaining("20% discount on 2 products"),
    );
    expect(onPublish).toHaveBeenCalledWith(
      expect.objectContaining({
        productIds: [2, 3],
        discountPercent: 20,
        design: expect.objectContaining({ accentColor: "#004d5b" }),
        trigger: { delaySeconds: 3, frequency: "session" },
      }),
    );
  });

  it("does not publish when the merchant cancels", async () => {
    window.confirm.mockReturnValue(false);
    const { onPublish } = renderBuilder();
    await userEvent.click(
      screen.getByRole("button", { name: "Publish to store" }),
    );
    expect(onPublish).not.toHaveBeenCalled();
  });

  it("uses the dashboard's confirm dialog inside Salla", async () => {
    const parent = vi.spyOn(window, "parent", "get").mockReturnValue({});
    const embedded = {
      ui: { confirm: vi.fn().mockResolvedValue({ confirmed: true }) },
    };
    const { onPublish } = renderBuilder({ embedded });

    await userEvent.click(
      screen.getByRole("button", { name: "Publish to store" }),
    );
    expect(embedded.ui.confirm).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "Publish the popup?",
        variant: "warning",
      }),
    );
    expect(window.confirm).not.toHaveBeenCalled();
    expect(onPublish).toHaveBeenCalled();
    parent.mockRestore();
  });

  it("limits the selection to 6 products", async () => {
    const many = Array.from({ length: 8 }, (_, i) =>
      product(10 + i, `Item ${i + 1}`, { soldQuantity: 0 }),
    );
    renderBuilder({ products: many });
    const boxes = screen.getAllByRole("checkbox");
    for (const box of boxes.slice(3, 6)) await userEvent.click(box);

    expect(screen.getByText("6/6")).toBeInTheDocument();
    expect(boxes[6]).toBeDisabled();
    expect(boxes[7]).toBeDisabled();
  });

  it("restores a published campaign and can stop it", async () => {
    const campaign = {
      enabled: true,
      discountPercent: 30,
      endsAt: new Date(Date.now() + 3600_000).toISOString(),
      design: {
        title: "Live now",
        buttonText: "Go",
        accentColor: "#123456",
        theme: "light",
        position: "center",
        message: "",
      },
      trigger: { delaySeconds: 5, frequency: "day" },
      products: [{ id: 1 }],
      updatedAt: "v1",
    };
    const { onStop } = renderBuilder({ campaign });

    expect(screen.getByLabelText("Title")).toHaveValue("Live now");
    expect(screen.getByLabelText("Discount")).toHaveValue(30);
    expect(screen.getByRole("checkbox", { name: /Best seller/ })).toBeChecked();
    expect(screen.getByText(/Live until/)).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Stop popup" }));
    expect(onStop).toHaveBeenCalled();
  });

  it("shows a JavaScript snippet (not an HTML tag) to add in Salla Partners", async () => {
    renderBuilder();
    await userEvent.click(screen.getByText("Store setup (one time)"));
    const setup = screen.getByText("Store setup (one time)").closest("details");
    const code = within(setup).getByText(/createElement\("script"\)/);
    expect(code.textContent).toMatch(/\/storefront\/campaign\.js/);
    expect(code.textContent).not.toMatch(/<script/);
    expect(within(setup).getByText("promo_campaign")).toBeInTheDocument();
  });

  it("shows a loading state", () => {
    renderBuilder({ isLoading: true });
    expect(screen.getByText("Loading campaign...")).toBeInTheDocument();
  });
});
