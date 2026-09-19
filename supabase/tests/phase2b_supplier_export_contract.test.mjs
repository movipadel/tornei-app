import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  aggregateSupplierExportItems,
  createSupplierExcelXml,
} from "../../src/lib/supplierExport.ts";

const root = new URL("../../", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");

test("supplier aggregation uses stable variant identity and sums quantities", () => {
  const rows = aggregateSupplierExportItems([
    {
      id: "i1", order_id: "o1", product_id: "p1", color_id: "c1", size_id: "s1",
      product_name: "Asciugamano Sport", custom_product_name: null,
      color_name: "Lime", size_label: "UNICA", custom_variant: null, quantity: 1,
    },
    {
      id: "i2", order_id: "o2", product_id: "p1", color_id: "c1", size_id: "s1",
      product_name: "Nome snapshot differente", custom_product_name: null,
      color_name: "Lime", size_label: "UNICA", custom_variant: null, quantity: 3,
    },
    {
      id: "i3", order_id: "o3", product_id: "balls", color_id: null, size_id: null,
      product_name: "Tubo Palline", custom_product_name: null,
      color_name: null, size_label: null, custom_variant: null, quantity: 2,
    },
  ]);
  assert.equal(rows.length, 2);
  assert.equal(rows.find((row) => row.product === "Asciugamano Sport")?.quantity, 4);
  assert.deepEqual(rows.find((row) => row.product === "Tubo Palline"), {
    product: "Tubo Palline", color: "", size: "", quantity: 2,
  });
});

test("Excel XML contains only supplier-facing aggregate columns", () => {
  const workbook = createSupplierExcelXml([
    { product: "Asciugamano & Sport", color: "Lime", size: "UNICA", quantity: 4 },
  ]);
  assert.match(workbook, /Excel\.Sheet/);
  assert.match(workbook, /Asciugamano &amp; Sport/);
  assert.match(workbook, /Quantità/);
  assert.doesNotMatch(workbook, /MOVIBACK|STORE|customer|order_id/);
});

test("route claims first, regenerates by idempotency key, and has no side effects", async () => {
  const route = await read("src/app/api/admin/store-orders/export-summary/route.ts");
  assert.match(route, /claim_supplier_export_batch/);
  assert.match(route, /supplier_export_batch_id/);
  assert.match(route, /application\/vnd\.ms-excel/);
  assert.match(route, /SUPPLIER_EXPORT_EMPTY/);
  assert.doesNotMatch(route, /\.update\(/);
  assert.doesNotMatch(route, /sendTelegram|sendAdminPush|web-push|communications/);
});

test("operator UI has one global Excel command and no supplier checkbox", async () => {
  const page = await read("src/app/admin/store-orders/page.tsx");
  assert.match(page, /Riepilogo fornitore/);
  assert.match(page, /Genera Excel/);
  assert.match(page, /supplierEligibleUnits/);
  assert.doesNotMatch(page, /Includi nel riepilogo fornitore/);
  assert.doesNotMatch(page, /supplierSelected|selectedIds/);
});
