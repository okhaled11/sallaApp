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
    factors: { width: 0.98, sink: 0.25 },
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
    hint: "لا تحتاج صورة: اختر اللون ودرجة الشفافية واللمعة.",
  },
  blush: {
    label: "أحمر خدود / بلاشر",
    needsImage: false,
    hint: "لا تحتاج صورة: تندمج تلقائياً على وجنتي الخدين بلون وتدرج ناعم.",
  },
  eyeshadow: {
    label: "ظلال عيون / آيشادو",
    needsImage: false,
    hint: "لا تحتاج صورة: تغطي الجفن العلوي للعينين بتظليل متناغم.",
  },
  eyeliner: {
    label: "آيلاينر / محدد عيون",
    needsImage: false,
    hint: "لا تحتاج صورة: يحدد خط الرموش العلوي بدقة حركية انسيابية.",
  },
};

export const TRYON_TYPE_IDS = Object.keys(TRYON_TYPES);

export const DEFAULT_MAKEUP = {
  lipstick: { color: "#c2185b", opacity: 0.7, finish: "matte" },
  blush: { color: "#e57373", opacity: 0.5, finish: "matte" },
  eyeshadow: { color: "#8d6e63", opacity: 0.6, finish: "shimmer" },
  eyeliner: { color: "#1a1a1a", opacity: 0.9, finish: "matte" },
};

export const DEFAULT_LIPSTICK = DEFAULT_MAKEUP.lipstick;

export const isMakeupType = (type) => ["lipstick", "blush", "eyeshadow", "eyeliner"].includes(type);

export const typeOf = (item) => (item && TRYON_TYPES[item.type] ? item.type : "glasses");

/** An item the storefront can use: image types need an image, makeup types do not. */
export const isItemComplete = (item) => !TRYON_TYPES[typeOf(item)].needsImage || Boolean(item.image);
