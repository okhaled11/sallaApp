import { productProfit, sellingPrice } from "./profitInsights.js";

/**
 * Escapes a cell value for CSV format.
 * Quotes the string if it contains commas, quotes, or newlines.
 *
 * @param {string|number|null|undefined} value
 * @returns {string}
 */
export function escapeCsvCell(value) {
  if (value === null || value === undefined) return "";
  const str = String(value);
  if (/[",\n\r]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

/**
 * Generates an Excel-ready CSV string (with UTF-8 BOM) for store profit and product analytics.
 *
 * @param {Array} products - Store products array
 * @param {string} [currency='SAR'] - Store currency code
 * @returns {string} CSV formatted string
 */
export function generateProfitCsv(products = [], currency = "SAR") {
  const headers = [
    "معرف المنتج",
    "اسم المنتج",
    "القسم",
    `سعر البيع (${currency})`,
    `سعر التكلفة (${currency})`,
    `ربح القطعة (${currency})`,
    "هامش الربح (%)",
    "الكمية المباعة",
    `إجمالي المبيعات (${currency})`,
    `صافي الأرباح (${currency})`,
    "الكمية المتوفرة",
    "حالة المنتج",
  ];

  const rows = products.map((product) => {
    const price = sellingPrice(product) || 0;
    const cost = product.costPrice ?? "";
    const profitData = productProfit(product);
    const categoryName = product.categories?.[0]?.name || "غير مصنف";
    const sold = product.soldQuantity || 0;
    const stock =
      product.quantity !== null && product.quantity !== undefined
        ? product.quantity
        : "غير محدود";

    let unitProfit = "";
    let marginPercent = "";
    let totalRevenue = (price * sold).toFixed(2);
    let totalProfit = "";

    if (profitData) {
      unitProfit = profitData.unitProfit.toFixed(2);
      marginPercent =
        profitData.margin !== null
          ? `${(profitData.margin * 100).toFixed(1)}%`
          : "";
      totalProfit = profitData.totalProfit.toFixed(2);
    }

    let status = "متوفر";
    if (product.quantity === 0) status = "نفد من المخزون";
    else if (sold === 0) status = "مخزون راكد";

    return [
      escapeCsvCell(product.id),
      escapeCsvCell(product.name),
      escapeCsvCell(categoryName),
      escapeCsvCell(price.toFixed(2)),
      escapeCsvCell(cost !== "" ? Number(cost).toFixed(2) : "غير محدد"),
      escapeCsvCell(unitProfit),
      escapeCsvCell(marginPercent),
      escapeCsvCell(sold),
      escapeCsvCell(totalRevenue),
      escapeCsvCell(totalProfit),
      escapeCsvCell(stock),
      escapeCsvCell(status),
    ].join(",");
  });

  // \uFEFF is the UTF-8 Byte Order Mark (BOM) needed so Excel correctly renders Arabic characters
  return (
    "\uFEFF" + [headers.map(escapeCsvCell).join(","), ...rows].join("\r\n")
  );
}

/**
 * Triggers a file download in the browser.
 *
 * @param {string} content - Text/CSV content
 * @param {string} filename - Filename to save as
 */
export function downloadFile(content, filename = "store-profit-report.csv") {
  const blob = new Blob([content], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.setAttribute("href", url);
  link.setAttribute("download", filename);
  link.style.visibility = "hidden";
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
