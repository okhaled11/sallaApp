import { useState } from "react";
import Button from "./forms/Button.jsx";

/**
 * Inline form to edit a product's price and stock quantity.
 * Only fields that actually changed are sent.
 */
export default function ProductEditForm({ product, onSave, onCancel }) {
  const [price, setPrice] = useState(
    product.price == null ? "" : String(product.price),
  );
  const [quantity, setQuantity] = useState(
    product.quantity == null ? "" : String(product.quantity),
  );
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);

    const changes = {};

    if (price.trim() !== "") {
      const value = Number(price);
      if (!Number.isFinite(value) || value < 0) {
        setError("Price must be 0 or more");
        return;
      }
      if (value !== product.price) changes.price = value;
    }

    if (quantity.trim() !== "") {
      const value = Number(quantity);
      if (!Number.isInteger(value) || value < 0) {
        setError("Quantity must be a whole number, 0 or more");
        return;
      }
      if (value !== product.quantity) changes.quantity = value;
    }

    if (Object.keys(changes).length === 0) {
      onCancel();
      return;
    }

    setIsSaving(true);
    const result = await onSave(product.id, changes);
    setIsSaving(false);

    if (result.success) {
      onCancel();
    } else {
      setError(result.error);
    }
  };

  return (
    <form className="product-edit" onSubmit={handleSubmit} noValidate>
      <label className="product-edit-field">
        <span>Price{product.currency ? ` (${product.currency})` : ""}</span>
        <input
          type="number"
          min="0"
          step="0.01"
          inputMode="decimal"
          value={price}
          onChange={(e) => setPrice(e.target.value)}
          disabled={isSaving}
        />
      </label>
      <label className="product-edit-field">
        <span>Quantity</span>
        <input
          type="number"
          min="0"
          step="1"
          inputMode="numeric"
          placeholder={product.quantity == null ? "Unlimited" : ""}
          value={quantity}
          onChange={(e) => setQuantity(e.target.value)}
          disabled={isSaving}
        />
      </label>
      <div className="product-edit-actions">
        <Button type="submit" variant="primary" disabled={isSaving}>
          {isSaving ? "Saving..." : "Save"}
        </Button>
        <Button type="button" onClick={onCancel} disabled={isSaving}>
          Cancel
        </Button>
      </div>
      {error && (
        <p className="product-edit-error" role="alert">
          {error}
        </p>
      )}
    </form>
  );
}
