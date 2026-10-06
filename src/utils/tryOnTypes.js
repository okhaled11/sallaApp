/**
 * What the try-on can be applied to. `factors` are fractions of the face width and must
 * match TYPE_FACTORS in public/storefront/tryon.js (a test keeps the two in sync).
 */
export const TRYON_TYPES = {
  glasses: {
    label: "نظارات",
    needsImage: true,
    hint: "صورة للنظارة من الأمام بخلفية شفافة (النظارة وحدها بدون وجه).",
  },
  earrings: {
    label: "أقراط / حلق",
    needsImage: true,
    factors: { width: 0.13, outward: 0.04, drop: 0.06 },
    hint: "صورة لقرط واحد بخلفية شفافة. نعكسه تلقائياً للأذن الأخرى.",
  },
  hat: {
    label: "قبعة / كاب / إيشارب راس",
    needsImage: true,
    factors: { width: 1.25, sink: 0.05 },
    hint: "صورة للقبعة من الأمام بخلفية شفافة. حافتها السفلية تستقر على الجبهة.",
  },
  necklace: {
    label: "سلسلة / عقد",
    needsImage: true,
    factors: { width: 0.95, drop: 0.18 },
    hint: "صورة للسلسلة من الأمام بخلفية شفافة. تُوضع تحت الذقن على الرقبة.",
  },
  lipstick: {
    label: "أحمر شفاه",
    needsImage: false,
    hint: "لا تحتاج صورة: اختر اللون ودرجة الشفافية.",
  },
};

export const TRYON_TYPE_IDS = Object.keys(TRYON_TYPES);

export const DEFAULT_LIPSTICK = { color: "#c2185b", opacity: 0.7, finish: "matte" };

export const typeOf = (item) => (item && TRYON_TYPES[item.type] ? item.type : "glasses");

/** An item the storefront can use: image types need an image, lipstick does not. */
export const isItemComplete = (item) => !TRYON_TYPES[typeOf(item)].needsImage || Boolean(item.image);
