import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ProductEditForm from "../ProductEditForm.jsx";

const product = {
  id: 5,
  name: "Shirt",
  price: 100,
  currency: "SAR",
  quantity: 3,
  soldQuantity: 2,
};

function renderForm(props = {}) {
  const onSave = vi.fn().mockResolvedValue({ success: true });
  const onCancel = vi.fn();
  render(
    <ProductEditForm
      product={product}
      onSave={onSave}
      onCancel={onCancel}
      {...props}
    />,
  );
  return {
    onSave: props.onSave || onSave,
    onCancel: props.onCancel || onCancel,
    priceInput: screen.getByLabelText(/Price/),
    quantityInput: screen.getByLabelText("Quantity"),
  };
}

describe("ProductEditForm", () => {
  it("prefills current price and quantity", () => {
    const { priceInput, quantityInput } = renderForm();
    expect(priceInput).toHaveValue(100);
    expect(quantityInput).toHaveValue(3);
    expect(screen.getByText("Price (SAR)")).toBeInTheDocument();
  });

  it("sends only changed fields and closes on success", async () => {
    const { onSave, onCancel, quantityInput } = renderForm();
    await userEvent.clear(quantityInput);
    await userEvent.type(quantityInput, "10");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(onSave).toHaveBeenCalledWith(5, { quantity: 10 });
    expect(onCancel).toHaveBeenCalled();
  });

  it("closes without saving when nothing changed", async () => {
    const { onSave, onCancel } = renderForm();
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(onSave).not.toHaveBeenCalled();
    expect(onCancel).toHaveBeenCalled();
  });

  it("validates quantity is a whole number", async () => {
    const { onSave, quantityInput } = renderForm();
    await userEvent.clear(quantityInput);
    await userEvent.type(quantityInput, "2.5");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(onSave).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent(/whole number/);
  });

  it("shows server error and stays open", async () => {
    const onSave = vi
      .fn()
      .mockResolvedValue({ success: false, error: "Missing scope" });
    const { onCancel, priceInput } = renderForm({ onSave });
    await userEvent.clear(priceInput);
    await userEvent.type(priceInput, "80");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(onSave).toHaveBeenCalledWith(5, { price: 80 });
    expect(screen.getByRole("alert")).toHaveTextContent("Missing scope");
    expect(onCancel).not.toHaveBeenCalled();
  });

  it("shows Unlimited placeholder when stock is unlimited", () => {
    renderForm({ product: { ...product, quantity: null } });
    expect(screen.getByLabelText("Quantity")).toHaveAttribute(
      "placeholder",
      "Unlimited",
    );
  });
});
