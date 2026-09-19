export type SupplierExportItem = {
  id: string;
  order_id: string;
  product_id: string | null;
  color_id: string | null;
  size_id: string | null;
  product_name: string | null;
  custom_product_name: string | null;
  color_name: string | null;
  size_label: string | null;
  custom_variant: string | null;
  quantity: number;
};

export type SupplierExportRow = {
  product: string;
  color: string;
  size: string;
  quantity: number;
};

function identityPart(id: string | null, fallback: string | null) {
  return id ? `id:${id}` : `snapshot:${String(fallback ?? "").trim().toLowerCase()}`;
}

export function aggregateSupplierExportItems(items: SupplierExportItem[]) {
  const rows = new Map<string, SupplierExportRow>();

  for (const item of items) {
    const product = item.custom_product_name?.trim() || item.product_name?.trim() || "Prodotto";
    const color = item.color_name?.trim() || "";
    const size = item.size_label?.trim() || item.custom_variant?.trim() || "";
    const key = [
      identityPart(item.product_id, item.custom_product_name || item.product_name),
      identityPart(item.color_id, color),
      identityPart(item.size_id, size),
    ].join("|");
    const existing = rows.get(key);

    if (existing) {
      existing.quantity += Number(item.quantity || 0);
    } else {
      rows.set(key, {
        product,
        color,
        size,
        quantity: Number(item.quantity || 0),
      });
    }
  }

  return Array.from(rows.values()).sort((a, b) =>
    [a.product, a.color, a.size]
      .join("|")
      .localeCompare([b.product, b.color, b.size].join("|"), "it")
  );
}

function xml(value: unknown) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export function createSupplierExcelXml(rows: SupplierExportRow[]) {
  const header = ["Prodotto", "Colore", "Taglia", "Quantità"]
    .map((value) => `<Cell><Data ss:Type="String">${xml(value)}</Data></Cell>`)
    .join("");
  const body = rows
    .map(
      (row) =>
        `<Row><Cell><Data ss:Type="String">${xml(row.product)}</Data></Cell>` +
        `<Cell><Data ss:Type="String">${xml(row.color)}</Data></Cell>` +
        `<Cell><Data ss:Type="String">${xml(row.size)}</Data></Cell>` +
        `<Cell><Data ss:Type="Number">${row.quantity}</Data></Cell></Row>`
    )
    .join("");

  return (
    `<?xml version="1.0"?>` +
    `<?mso-application progid="Excel.Sheet"?>` +
    `<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" ` +
    `xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">` +
    `<Worksheet ss:Name="Riepilogo fornitore"><Table>` +
    `<Row>${header}</Row>${body}` +
    `</Table></Worksheet></Workbook>`
  );
}
