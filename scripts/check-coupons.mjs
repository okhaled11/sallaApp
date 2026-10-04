// Diagnostic: shows which store SALLA_ACCESS_TOKEN belongs to and which coupons it can see.
// Usage (PowerShell):  $env:SALLA_ACCESS_TOKEN="<token>"; node scripts/check-coupons.mjs [CODE]
const token = process.env.SALLA_ACCESS_TOKEN;
if (!token) {
  console.error("Set SALLA_ACCESS_TOKEN first.");
  process.exit(1);
}
const keyword = process.argv[2] || "";
const headers = { Authorization: `Bearer ${token}`, Accept: "application/json" };
const base = "https://api.salla.dev/admin/v2";

async function get(path) {
  const res = await fetch(`${base}${path}`, { headers });
  const body = await res.json().catch(() => ({}));
  return { status: res.status, body };
}

const store = await get("/store/info");
console.log("store/info ->", store.status, store.body?.data?.name ?? JSON.stringify(store.body).slice(0, 300));
if (store.body?.data?.domain) console.log("domain:", store.body.data.domain);

const list = await get(`/coupons${keyword ? `?keyword=${encodeURIComponent(keyword)}` : ""}`);
console.log("coupons ->", list.status);
if (Array.isArray(list.body?.data)) {
  console.log("count on this page:", list.body.data.length, "| pagination:", JSON.stringify(list.body.pagination));
  for (const c of list.body.data) {
    console.log(`- #${c.id} ${c.code} status=${c.status} type=${c.type} start=${c.start_date?.date ?? c.start_date} expiry=${c.expiry_date?.date ?? c.expiry_date}`);
  }
} else {
  console.log(JSON.stringify(list.body).slice(0, 500));
}
