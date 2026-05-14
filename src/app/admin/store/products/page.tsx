"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  ImageIcon,
  Loader2,
  Package,
  Palette,
  Plus,
  Ruler,
  Save,
  Store,
  Tags,
  Trash2,
  GripVertical,
  X,
} from "lucide-react";

import {
  DndContext,
  PointerSensor,
  TouchSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";

import {
  SortableContext,
  arrayMove,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";

import { CSS } from "@dnd-kit/utilities";

type Category = { id: string; name: string };
type Line = { id: string; name: string };

type ColorRow = {
  color_name: string;
  color_hex: string;
  image_path: string;
  image_url?: string;
  is_active: boolean;
};

type SizeRow = {
  size_label: string;
  is_active: boolean;
};

type StockRow = {
  color_name: string;
  size_label: string | null;
  stock_qty: number | null;
  sku: string;
  is_active: boolean;
};

type Product = {
  id: string;
  name: string;
  sort_order: number;
  description: string | null;
  category_id: string;
  line_id: string;
  base_price_euro: number;
  base_price_points: number;
  allow_euro: boolean;
  allow_points: boolean;
  allow_mixed: boolean;
  is_active: boolean;
  colors?: any[];
  sizes?: any[];
  stock?: any[];
};

type ProductWithMeta = Product & {
  category?: Category | null;
  line?: Line | null;
  created_at?: string | null;
};

type StorePromo = {
  id: string;
  name: string;
  discount_percent: number;
  is_active: boolean;
  starts_at: string | null;
  ends_at: string | null;
  created_at?: string | null;
};

const emptyForm = {
  id: "",
  name: "",
  description: "",
  category_id: "",
  line_id: "",
  base_price_euro: "",
  base_price_points: "",
  allow_euro: true,
  allow_points: false,
  allow_mixed: false,
  is_active: true,
};

const PRESET_SIZES_CHILD = ["B6", "B8", "B10", "B12", "B14"];
const PRESET_SIZES_ADULT = ["XS", "S", "M", "L", "XL", "XXL", "XXXL"];
const PRESET_SIZES_ACCESSORIES = ["UNICA"];


export default function AdminStoreProductsPage() {
  const [products, setProducts] = useState<ProductWithMeta[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [lines, setLines] = useState<Line[]>([]);
  const [form, setForm] = useState<any>(emptyForm);
  const [colors, setColors] = useState<ColorRow[]>([]);
  const [sizes, setSizes] = useState<SizeRow[]>([]);
  const [stock, setStock] = useState<StockRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [canAccessEconomics, setCanAccessEconomics] = useState(false);

  const [sortCategoryId, setSortCategoryId] = useState("");
 const [savingSort, setSavingSort] = useState(false);

 const [sortPanelOpen, setSortPanelOpen] = useState(false);
const [catalogPanelOpen, setCatalogPanelOpen] = useState(false);

const [formOpen, setFormOpen] = useState(false);

const [promos, setPromos] = useState<StorePromo[]>([]);
const [promoPanelOpen, setPromoPanelOpen] = useState(false);
const [savingPromo, setSavingPromo] = useState(false);
const [promoForm, setPromoForm] = useState({
  id: "",
  name: "",
  discount_percent: "",
  is_active: true,
  starts_at: "",
  ends_at: "",
});

const sensors = useSensors(
  useSensor(PointerSensor, {
    activationConstraint: { distance: 6 },
  }),
  useSensor(TouchSensor, {
    activationConstraint: { delay: 180, tolerance: 6 },
  })
);

  const [newCategoryName, setNewCategoryName] = useState("");
  const [newLineName, setNewLineName] = useState("");
  const [savingCategory, setSavingCategory] = useState(false);
  const [savingLine, setSavingLine] = useState(false);

  const isEditing = Boolean(form.id);

  const selectedSortCategory = useMemo(() => {
  return categories.find((c) => c.id === sortCategoryId) ?? null;
}, [categories, sortCategoryId]);

const sortableProducts = useMemo(() => {
  if (!sortCategoryId) return [];

  return products
    .filter((p) => p.category_id === sortCategoryId)
    .sort((a, b) => {
      const ao = Number(a.sort_order ?? 0);
      const bo = Number(b.sort_order ?? 0);

      if (ao !== bo) return ao - bo;

      return String(a.created_at ?? "").localeCompare(String(b.created_at ?? ""));
    });
}, [products, sortCategoryId]);

  async function loadAll() {
    try {
      setLoading(true);

      const [p, c, l, pr] = await Promise.all([
  fetch("/api/admin/store/products", { cache: "no-store" }).then((r) => r.json()),
  fetch("/api/admin/store/categories", { cache: "no-store" }).then((r) => r.json()),
  fetch("/api/admin/store/lines", { cache: "no-store" }).then((r) => r.json()),
  fetch("/api/admin/store/promos", { cache: "no-store" }).then((r) => r.json()),
]);

      setProducts(p.data ?? []);
      setCategories(c.data ?? []);
      setLines(l.data ?? []);
      setPromos(pr.data ?? []);
    } catch {
      toast.error("Errore caricamento Store");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadAll();
  }, []);

  useEffect(() => {
  async function checkEconomicsAccess() {
    try {
      const res = await fetch("/api/admin/store/economics/access", {
        cache: "no-store",
      });

      const json = await res.json().catch(() => ({}));
      setCanAccessEconomics(Boolean(json.allowed));
    } catch {
      setCanAccessEconomics(false);
    }
  }

  checkEconomicsAccess();
}, []);

  const computedStock = useMemo(() => {
    const result: StockRow[] = [];

    for (const color of colors.filter((c) => c.color_name.trim())) {
      if (sizes.length === 0) {
        const existing = stock.find((s) => s.color_name === color.color_name && !s.size_label);

        result.push({
          color_name: color.color_name,
          size_label: null,
          stock_qty: existing?.stock_qty ?? null,
          sku: existing?.sku ?? "",
          is_active: existing?.is_active ?? true,
        });
      } else {
        for (const size of sizes.filter((s) => s.size_label.trim())) {
          const existing = stock.find(
            (s) => s.color_name === color.color_name && s.size_label === size.size_label
          );

          result.push({
            color_name: color.color_name,
            size_label: size.size_label,
            stock_qty: existing?.stock_qty ?? null,
            sku: existing?.sku ?? "",
            is_active: existing?.is_active ?? true,
          });
        }
      }
    }

    return result;
  }, [colors, sizes]);

  useEffect(() => {
    setStock((prev) =>
      computedStock.map((row) => {
        const old = prev.find(
          (p) => p.color_name === row.color_name && p.size_label === row.size_label
        );
        return old ?? row;
      })
    );
  }, [computedStock]);

  function resetForm() {
  setForm(emptyForm);
  setColors([]);
  setSizes([]);
  setStock([]);
  setFormOpen(false);
}

  function togglePresetSize(label: string) {
  setSizes((prev) => {
    const exists = prev.some(
      (s) => s.size_label.trim().toUpperCase() === label
    );

    if (exists) {
      return prev.filter(
        (s) => s.size_label.trim().toUpperCase() !== label
      );
    }

    return [...prev, { size_label: label, is_active: true }];
  });
}

  async function createCategory() {
    const name = newCategoryName.trim();
    if (!name) return toast.error("Inserisci il nome categoria");

    try {
      setSavingCategory(true);

      const res = await fetch("/api/admin/store/categories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, is_active: true }),
      });

      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || "Errore creazione categoria");

      toast.success("Categoria creata");
      setNewCategoryName("");
      await loadAll();
      setForm((prev: any) => ({ ...prev, category_id: json.data?.id || prev.category_id }));
    } catch (e: any) {
      toast.error(e?.message || "Errore");
    } finally {
      setSavingCategory(false);
    }
  }

  async function createLine() {
    const name = newLineName.trim();
    if (!name) return toast.error("Inserisci il nome linea");

    try {
      setSavingLine(true);

      const res = await fetch("/api/admin/store/lines", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, is_active: true }),
      });

      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || "Errore creazione linea");

      toast.success("Linea creata");
      setNewLineName("");
      await loadAll();
      setForm((prev: any) => ({ ...prev, line_id: json.data?.id || prev.line_id }));
    } catch (e: any) {
      toast.error(e?.message || "Errore");
    } finally {
      setSavingLine(false);
    }
  }

  function editProduct(product: ProductWithMeta) {
    setForm({
      id: product.id,
      name: product.name,
      description: product.description ?? "",
      category_id: product.category_id,
      line_id: product.line_id,
      base_price_euro: product.base_price_euro,
      base_price_points: product.base_price_points,
      allow_euro: product.allow_euro,
      allow_points: product.allow_points,
      allow_mixed: product.allow_mixed,
      is_active: product.is_active,
    });

    setColors(
      (product.colors ?? []).map((c) => ({
        color_name: c.color_name,
        color_hex: c.color_hex ?? "#000000",
        image_path: c.image_path ?? "",
        is_active: c.is_active,
      }))
    );

    setSizes(
      (product.sizes ?? []).map((s) => ({
        size_label: s.size_label,
        is_active: s.is_active,
      }))
    );

    setStock(
      (product.stock ?? []).map((s) => {
        const color = product.colors?.find((c) => c.id === s.color_id);
        const size = product.sizes?.find((z) => z.id === s.size_id);

        return {
          color_name: color?.color_name ?? "",
          size_label: size?.size_label ?? null,
          stock_qty: s.stock_qty,
          sku: s.sku ?? "",
          is_active: s.is_active,
        };
      })
    );

    
    setFormOpen(true);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function uploadColorImage(index: number, file: File) {
    try {
      const fd = new FormData();
      fd.append("file", file);

      const res = await fetch("/api/admin/store/products/image", {
        method: "POST",
        body: fd,
      });

      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || "Errore upload immagine");

      setColors((prev) =>
        prev.map((c, i) =>
          i === index ? { ...c, image_path: json.path, image_url: json.url } : c
        )
      );

      toast.success("Immagine caricata");
    } catch (e: any) {
      toast.error(e?.message || "Errore upload");
    }
  }

  async function saveProduct() {
    try {
      setSaving(true);

      const euro = Number(form.base_price_euro || 0);
      const points = Number(form.base_price_points || 0) || Math.round(euro * 10);

      const payload = {
        ...form,
        base_price_euro: euro,
        base_price_points: points,
        colors,
        sizes,
        stock,
      };

      const url = isEditing ? `/api/admin/store/products/${form.id}` : "/api/admin/store/products";

      const res = await fetch(url, {
        method: isEditing ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || "Errore salvataggio");

      toast.success(isEditing ? "Prodotto aggiornato" : "Prodotto creato");
      resetForm();
      await loadAll();
    } catch (e: any) {
      toast.error(e?.message || "Errore");
    } finally {
      setSaving(false);
    }
  }

  async function deleteProduct(id: string) {
    if (!confirm("Eliminare definitivamente questo prodotto?")) return;

    try {
      const res = await fetch(`/api/admin/store/products/${id}`, { method: "DELETE" });
      const json = await res.json().catch(() => ({}));

      if (!res.ok) throw new Error(json.error || "Errore eliminazione");

      toast.success("Prodotto eliminato");
      await loadAll();
    } catch (e: any) {
      toast.error(e?.message || "Errore");
    }
  }

  function resetPromoForm() {
  setPromoForm({
    id: "",
    name: "",
    discount_percent: "",
    is_active: true,
    starts_at: "",
    ends_at: "",
  });
}

function editPromo(promo: StorePromo) {
  setPromoForm({
    id: promo.id,
    name: promo.name ?? "",
    discount_percent: String(promo.discount_percent ?? ""),
    is_active: Boolean(promo.is_active),
    starts_at: promo.starts_at ? promo.starts_at.slice(0, 16) : "",
    ends_at: promo.ends_at ? promo.ends_at.slice(0, 16) : "",
  });
  setPromoPanelOpen(true);
}

async function savePromo() {
  try {
    setSavingPromo(true);

    const payload = {
      name: promoForm.name.trim(),
      discount_percent: Number(promoForm.discount_percent || 0),
      is_active: promoForm.is_active,
      starts_at: promoForm.starts_at || null,
      ends_at: promoForm.ends_at || null,
    };

    const url = promoForm.id
      ? `/api/admin/store/promos/${promoForm.id}`
      : "/api/admin/store/promos";

    const res = await fetch(url, {
      method: promoForm.id ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(json.error || "Errore salvataggio promo");

    toast.success(promoForm.id ? "Promo aggiornata" : "Promo creata");
    resetPromoForm();
    await loadAll();
  } catch (e: any) {
    toast.error(e?.message || "Errore promo");
  } finally {
    setSavingPromo(false);
  }
}

async function deletePromo(id: string) {
  if (!confirm("Eliminare questa promo?")) return;

  try {
    const res = await fetch(`/api/admin/store/promos/${id}`, {
      method: "DELETE",
    });

    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(json.error || "Errore eliminazione promo");

    toast.success("Promo eliminata");
    await loadAll();
  } catch (e: any) {
    toast.error(e?.message || "Errore");
  }
}

  async function saveProductSortOrder(nextProducts: ProductWithMeta[]) {
  if (!sortCategoryId) return;

  try {
    setSavingSort(true);

    const payload = {
      category_id: sortCategoryId,
      items: nextProducts.map((product, index) => ({
        id: product.id,
        sort_order: index + 1,
      })),
    };

    const res = await fetch("/api/admin/store/products/sort", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(json.error || "Errore salvataggio ordine");

    toast.success("Ordine prodotti aggiornato");

    setProducts((prev) => {
      const orderById = new Map(
        nextProducts.map((product, index) => [String(product.id), index + 1])
      );

      return prev.map((product) =>
        orderById.has(String(product.id))
          ? {
              ...product,
              sort_order: orderById.get(String(product.id)) ?? product.sort_order,
            }
          : product
      );
    });
  } catch (e: any) {
    toast.error(e?.message ?? "Errore ordinamento");
    await loadAll();
  } finally {
    setSavingSort(false);
  }
}

function handleSortEnd(event: DragEndEvent) {
  const { active, over } = event;

  if (!over || active.id === over.id) return;

  const oldIndex = sortableProducts.findIndex((p) => p.id === active.id);
  const newIndex = sortableProducts.findIndex((p) => p.id === over.id);

  if (oldIndex < 0 || newIndex < 0) return;

  const next = arrayMove(sortableProducts, oldIndex, newIndex).map((product, index) => ({
    ...product,
    sort_order: index + 1,
  }));

  setProducts((prev) => {
    const byId = new Map(next.map((p) => [String(p.id), p]));

    return prev.map((product) =>
      byId.has(String(product.id))
        ? (byId.get(String(product.id)) as ProductWithMeta)
        : product
    );
  });

  saveProductSortOrder(next);
}

  return (
  <div style={pageStyle} className="admin-store-page">
    <div style={{ maxWidth: 1180, margin: "0 auto", color: "white" }} className="admin-store-shell">
      <header style={{ marginBottom: 22 }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
            flexWrap: "wrap",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <Store className="w-7 h-7" style={{ color: "#f59e0b" }} />
            <h1 style={{ fontSize: 30, fontWeight: 950, letterSpacing: -0.9 }}>
              Store MOVI
            </h1>
          </div>
        </div>

        <p
          style={{
            marginTop: 6,
            color: "rgba(255,255,255,0.58)",
            fontWeight: 650,
          }}
        >
          Prodotti, varianti colore, taglie, stock e immagini dedicate.
        </p>
      </header>

        <section style={gridKpi} className="admin-store-kpi">
          <Kpi icon={<Package />} label="Prodotti totali" value={products.length} />
          <Kpi
            icon={<Store />}
            label="Prodotti attivi"
            value={products.filter((p) => p.is_active).length}
            tone="#86efac"
          />
          <Kpi icon={<Palette />} label="Categorie" value={categories.length} tone="#93c5fd" />
          <Kpi icon={<Ruler />} label="Linee" value={lines.length} tone="#c4b5fd" />
        </section>

        <section style={twoCol}>
          <Card title="Categorie e linee" icon={<Tags className="w-5 h-5" />}>
            <div style={manageGrid} className="admin-store-manage-grid">
              <div style={manageBox}>
                <div style={{ fontWeight: 950, marginBottom: 8 }}>Nuova categoria</div>
                <div style={inlineCreate}>
                  <Input
                    value={newCategoryName}
                    onChange={setNewCategoryName}
                    placeholder="Es. JUNIOR"
                  />
                  <button
                    type="button"
                    onClick={createCategory}
                    disabled={savingCategory}
                    style={smallPrimaryButton}
                  >
                    {savingCategory ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                  </button>
                </div>
                <div style={chipsWrap}>
                  {categories.map((c) => (
                    <span key={c.id} style={chipStyle}>
                      {c.name}
                    </span>
                  ))}
                </div>
              </div>

              <div style={manageBox}>
                <div style={{ fontWeight: 950, marginBottom: 8 }}>Nuova linea</div>
                <div style={inlineCreate}>
                  <Input
                    value={newLineName}
                    onChange={setNewLineName}
                    placeholder="Es. Movi Club"
                  />
                  <button
                    type="button"
                    onClick={createLine}
                    disabled={savingLine}
                    style={smallPrimaryButton}
                  >
                    {savingLine ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                  </button>
                </div>
                <div style={chipsWrap}>
                  {lines.map((l) => (
                    <span key={l.id} style={chipStyle}>
                      {l.name}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </Card>
        </section>

        <section style={twoColWide} className="admin-store-two-col-wide">
          <Card
  title={isEditing ? "Modifica prodotto" : "Nuovo prodotto"}
  icon={<Package className="w-5 h-5" />}
  action={
    <button
      type="button"
      onClick={() => {
        if (formOpen) {
          resetForm();
        } else {
          setFormOpen(true);
        }
      }}
      style={ghostButton}
    >
      {formOpen ? "Chiudi" : "+ Nuovo prodotto"}
    </button>
  }
>
  {formOpen ? (
  <>
            <div style={formGrid} className="admin-store-form-grid">
              <Field label="Nome prodotto">
                <Input
                  value={form.name}
                  onChange={(v: string) => setForm({ ...form, name: v })}
                  placeholder="Es. T-Shirt Tecnica Uomo"
                />
              </Field>

              <Field label="Categoria">
                <Select
                  value={form.category_id}
                  onChange={(v: string) => setForm({ ...form, category_id: v })}
                >
                  <option style={optionStyle} value="">
                    Seleziona categoria
                  </option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id} style={optionStyle}>
                      {c.name}
                    </option>
                  ))}
                </Select>
              </Field>

              <Field label="Linea">
                <Select
                  value={form.line_id}
                  onChange={(v: string) => setForm({ ...form, line_id: v })}
                >
                  <option style={optionStyle} value="">
                    Seleziona linea
                  </option>
                  {lines.map((l) => (
                    <option key={l.id} value={l.id} style={optionStyle}>
                      {l.name}
                    </option>
                  ))}
                </Select>
              </Field>

              <Field label="Prezzo in euro">
                <Input
                  type="number"
                  value={form.base_price_euro}
                  onChange={(v: string) =>
                    setForm({
                      ...form,
                      base_price_euro: v,
                      base_price_points: Math.round(Number(v || 0) * 10),
                    })
                  }
                  placeholder="Es. 15"
                />
              </Field>

              <Field label="Prezzo in punti">
                <Input
                  type="number"
                  value={form.base_price_points}
                  onChange={(v: string) => setForm({ ...form, base_price_points: v })}
                  placeholder="Es. 150"
                />
              </Field>
            </div>

            <Field label="Descrizione prodotto" style={{ marginTop: 10 }}>
              <textarea
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                placeholder="Descrizione prodotto"
                style={{
                  ...inputStyle,
                  minHeight: 88,
                  resize: "vertical",
                  width: "100%",
                }}
              />
            </Field>

            <div style={checksGrid} className="admin-store-checks-grid">
              <Check
                label="Attivo"
                checked={form.is_active}
                onChange={(v: boolean) => setForm({ ...form, is_active: v })}
              />
              <Check
                label="Pagamento euro"
                checked={form.allow_euro}
                onChange={(v: boolean) => setForm({ ...form, allow_euro: v })}
              />
              <Check
                label="Pagamento punti"
                checked={form.allow_points}
                onChange={(v: boolean) => setForm({ ...form, allow_points: v })}
              />
              <Check
                label="Pagamento misto"
                checked={form.allow_mixed}
                onChange={(v: boolean) => setForm({ ...form, allow_mixed: v })}
              />
            </div>

            <BlockTitle
              icon={<Palette className="w-4 h-4" />}
              title="Colori"
              action={() =>
                setColors([
                  ...colors,
                  { color_name: "", color_hex: "#000000", image_path: "", is_active: true },
                ])
              }
            />

            <div style={{ display: "grid", gap: 10 }}>
              {colors.map((c, i) => (
                <div key={i} style={variantRow} className="admin-store-variant-row">
                  <Input
                    value={c.color_name}
                    onChange={(v: string) =>
                      setColors((prev) =>
                        prev.map((x, idx) => (idx === i ? { ...x, color_name: v } : x))
                      )
                    }
                    placeholder="Colore"
                  />

                  <input
                    type="color"
                    value={c.color_hex || "#000000"}
                    onChange={(e) =>
                      setColors((prev) =>
                        prev.map((x, idx) =>
                          idx === i ? { ...x, color_hex: e.target.value } : x
                        )
                      )
                    }
                    style={colorInput}
                  />

                  <label style={uploadButton} className="admin-store-upload-button">
                    <ImageIcon className="w-4 h-4" />
                    Immagine
                    <input
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      hidden
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) uploadColorImage(i, file);
                      }}
                    />
                  </label>

                  <button
                    type="button"
                    onClick={() => setColors((prev) => prev.filter((_, idx) => idx !== i))}
                    style={dangerIconButton}
                  >
                    <X className="w-4 h-4" />
                  </button>

                  {c.image_path ? <div style={imagePathText}>Immagine: {c.image_path}</div> : null}
                </div>
              ))}

              {colors.length === 0 ? <div style={emptyRow}>Aggiungi almeno un colore prodotto.</div> : null}
            </div>

            <BlockTitle
              icon={<Ruler className="w-4 h-4" />}
              title="Taglie"
              action={() => setSizes([...sizes, { size_label: "", is_active: true }])}
            />

            <div style={{ display: "grid", gap: 10 }}>
  <div style={muted}>Seleziona rapidamente oppure aggiungi manualmente.</div>

  <PresetSizeGroup
    title="Bambino"
    values={PRESET_SIZES_CHILD}
    sizes={sizes}
    onToggle={togglePresetSize}
  />

  <PresetSizeGroup
    title="Adulto"
    values={PRESET_SIZES_ADULT}
    sizes={sizes}
    onToggle={togglePresetSize}
  />

  <PresetSizeGroup
    title="Accessori"
    values={PRESET_SIZES_ACCESSORIES}
    sizes={sizes}
    onToggle={togglePresetSize}
  />

              <div style={sizesGrid}>
                {sizes.map((s, i) => (
                  <div key={i} style={sizePill}>
                    <input
                      value={s.size_label}
                      onChange={(e) =>
                        setSizes((prev) =>
                          prev.map((x, idx) =>
                            idx === i ? { ...x, size_label: e.target.value } : x
                          )
                        )
                      }
                      placeholder="S / M / L / UNICA"
                      style={sizeInput}
                    />
                    <button
                      type="button"
                      onClick={() => setSizes((prev) => prev.filter((_, idx) => idx !== i))}
                      style={miniDanger}
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ))}
              </div>
            </div>

            <BlockTitle icon={<Package className="w-4 h-4" />} title="Stock" />

            <div style={{ display: "grid", gap: 10, maxHeight: 360, overflow: "auto" }} className="admin-store-stock-wrap">
              {stock.map((s, i) => (
                <div key={`${s.color_name}-${s.size_label}-${i}`} style={stockRow} className="admin-store-stock-row">
                  <div>
                    <div style={{ fontWeight: 950 }}>{s.color_name}</div>
                    <div style={muted}>{s.size_label || "Senza taglia"}</div>
                  </div>

                  <Input
                    value={s.sku}
                    onChange={(v: string) =>
                      setStock((prev) =>
                        prev.map((x, idx) => (idx === i ? { ...x, sku: v } : x))
                      )
                    }
                    placeholder="SKU"
                  />

                  <Input
                    type="number"
                    value={s.stock_qty ?? ""}
                    onChange={(v: string) =>
                      setStock((prev) =>
                        prev.map((x, idx) =>
                          idx === i ? { ...x, stock_qty: v === "" ? null : Number(v) } : x
                        )
                      )
                    }
                    placeholder="Q.tà"
                  />

                  <Check
                    label="Attivo"
                    checked={s.is_active}
                    onChange={(v: boolean) =>
                      setStock((prev) =>
                        prev.map((x, idx) => (idx === i ? { ...x, is_active: v } : x))
                      )
                    }
                  />
                </div>
              ))}

              {stock.length === 0 ? <div style={emptyRow}>Lo stock viene generato da colori e taglie.</div> : null}
            </div>

            <button type="button" onClick={saveProduct} disabled={saving} style={primaryButton}>
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              {isEditing ? "Salva modifiche" : "Crea prodotto"}
            </button>
                </>
  ) : (
    <div style={emptyRow}>
      Clicca su “+ Nuovo prodotto” per creare un prodotto, oppure usa “Modifica” dal catalogo.
    </div>
  )}
          </Card>

          <Card
  title="Catalogo prodotti"
  icon={<Store className="w-5 h-5" />}
  action={
    savingSort ? (
      <span
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 7,
          color: "#fbbf24",
          fontSize: 12,
          fontWeight: 850,
          whiteSpace: "nowrap",
        }}
      >
        <Save className="w-4 h-4" />
        Salvataggio...
      </span>
    ) : null
  }
>
  {loading ? (
  <div style={{ textAlign: "center", padding: 40 }}>
    <Loader2 className="w-8 h-8 animate-spin" />
  </div>
) : (
  <div style={{ display: "grid", gap: 12 }}>
    <button
      type="button"
      onClick={() => setSortPanelOpen((v) => !v)}
      style={{
        ...ghostButton,
        width: "100%",
        justifyContent: "center",
      }}
    >
      {sortPanelOpen ? "Nascondi ordine visualizzazione" : "Ordina visualizzazione prodotti"}
    </button>

    {sortPanelOpen ? (
      <div style={{ display: "grid", gap: 12 }}>
        <div>
          <div style={labelStyle}>Ordine visualizzazione per categoria</div>

          <select
            value={sortCategoryId}
            onChange={(e) => setSortCategoryId(e.target.value)}
            style={inputStyle}
          >
            <option value="" style={optionStyle}>
              Seleziona categoria
            </option>

            {categories.map((category) => (
              <option key={category.id} value={category.id} style={optionStyle}>
                {category.name}
              </option>
            ))}
          </select>

          <div style={{ ...muted, marginTop: 8 }}>
            Trascina i prodotti per decidere l’ordine di visualizzazione lato utente.
          </div>
        </div>

        {!sortCategoryId ? (
          <div style={emptyRow}>Seleziona una categoria per ordinare i prodotti.</div>
        ) : sortableProducts.length === 0 ? (
          <div style={emptyRow}>Nessun prodotto in questa categoria.</div>
        ) : (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleSortEnd}
          >
            <SortableContext
              items={sortableProducts.map((p) => p.id)}
              strategy={verticalListSortingStrategy}
            >
              <div style={{ display: "grid", gap: 10 }}>
                {sortableProducts.map((p) => (
                  <SortableProductRow
                    key={p.id}
                    product={p}
                    categoryName={selectedSortCategory?.name ?? ""}
                    onEdit={editProduct}
                    onDelete={deleteProduct}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>
        )}
      </div>
    ) : null}

    <button
      type="button"
      onClick={() => setCatalogPanelOpen((v) => !v)}
      style={{
        ...ghostButton,
        width: "100%",
        justifyContent: "center",
      }}
    >
      {catalogPanelOpen ? "Nascondi tutti i prodotti" : "Mostra tutti i prodotti"}
    </button>

    {catalogPanelOpen ? (
      <div style={{ display: "grid", gap: 10 }}>
        <div style={{ fontWeight: 950, color: "#ffffff" }}>Tutti i prodotti</div>

        {products.map((p) => (
          <div key={p.id} style={productRow} className="admin-store-product-row">
            <div style={{ minWidth: 0 }}>
              <div style={{ fontWeight: 950 }}>{p.name}</div>
              <div style={muted}>
                €{Number(p.base_price_euro).toFixed(2)} · {p.base_price_points} pt
              </div>
              <div style={muted}>
                Ordine #{p.sort_order ?? 0} · {p.is_active ? "Attivo" : "Nascosto"} ·{" "}
                {p.colors?.length ?? 0} colori · {p.sizes?.length ?? 0} taglie
              </div>
            </div>

            <div
              style={{ display: "flex", gap: 8, alignItems: "center" }}
              className="admin-store-product-actions"
            >
              <button type="button" onClick={() => editProduct(p)} style={smallButton}>
                Modifica
              </button>

              <button type="button" onClick={() => deleteProduct(p.id)} style={dangerIconButton}>
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          </div>
        ))}

        {products.length === 0 ? <div style={emptyRow}>Nessun prodotto inserito.</div> : null}
      </div>
    ) : null}
  </div>
)}
</Card>
<div style={{ gridColumn: "1 / -1" }}>
  <Card
    title="Promozioni Store"
    icon={<Tags className="w-5 h-5" />}
    action={
      <button
        type="button"
        onClick={() => {
          if (promoPanelOpen) {
            resetPromoForm();
            setPromoPanelOpen(false);
          } else {
            setPromoPanelOpen(true);
          }
        }}
        style={ghostButton}
      >
        {promoPanelOpen ? "Chiudi" : "Gestisci promo"}
      </button>
    }
  >
    {!promoPanelOpen ? (
      <div style={emptyRow}>
        {promos.length === 0
          ? "Nessuna promo attiva. Apri la gestione per creare Black Friday, lancio app o sconti stagionali."
          : `${promos.length} promo configurate.`}
      </div>
    ) : (
      <div style={{ display: "grid", gap: 14 }}>
        <div style={formGrid} className="admin-store-form-grid">
          <Field label="Nome promo">
            <Input
              value={promoForm.name}
              onChange={(v: string) => setPromoForm({ ...promoForm, name: v })}
              placeholder="Es. Black Friday"
            />
          </Field>

          <Field label="Sconto %">
            <Input
              type="number"
              value={promoForm.discount_percent}
              onChange={(v: string) =>
                setPromoForm({ ...promoForm, discount_percent: v })
              }
              placeholder="Es. 25"
            />
          </Field>

          <Field label="Inizio">
            <Input
              type="datetime-local"
              value={promoForm.starts_at}
              onChange={(v: string) => setPromoForm({ ...promoForm, starts_at: v })}
            />
          </Field>

          <Field label="Fine">
            <Input
              type="datetime-local"
              value={promoForm.ends_at}
              onChange={(v: string) => setPromoForm({ ...promoForm, ends_at: v })}
            />
          </Field>
        </div>

        <Check
          label="Promo attiva"
          checked={promoForm.is_active}
          onChange={(v: boolean) => setPromoForm({ ...promoForm, is_active: v })}
        />

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <button
            type="button"
            onClick={savePromo}
            disabled={savingPromo}
            style={{ ...primaryButton, marginTop: 0, width: "auto", padding: "0 18px" }}
          >
            {savingPromo ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Save className="w-4 h-4" />
            )}
            {promoForm.id ? "Salva promo" : "Crea promo"}
          </button>

          {promoForm.id ? (
            <button type="button" onClick={resetPromoForm} style={ghostButton}>
              Nuova promo
            </button>
          ) : null}
        </div>

        <div style={{ display: "grid", gap: 10 }}>
          <div style={{ fontWeight: 950 }}>Promo configurate</div>

          {promos.length === 0 ? (
            <div style={emptyRow}>Nessuna promo inserita.</div>
          ) : (
            promos.map((promo) => (
              <div key={promo.id} style={productRow}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 950 }}>{promo.name}</div>
                  <div style={muted}>
                    -{promo.discount_percent}% ·{" "}
                    {promo.is_active ? "Attiva" : "Disattivata"}
                  </div>
                  <div style={muted}>
                    {promo.starts_at ? `Dal ${new Date(promo.starts_at).toLocaleString("it-IT")}` : "Inizio libero"}{" "}
                    ·{" "}
                    {promo.ends_at ? `Fino al ${new Date(promo.ends_at).toLocaleString("it-IT")}` : "Fine libera"}
                  </div>
                </div>

                <div
                  style={{ display: "flex", gap: 8, alignItems: "center" }}
                  className="admin-store-product-actions"
                >
                  <button type="button" onClick={() => editPromo(promo)} style={smallButton}>
                    Modifica
                  </button>

                  <button
                    type="button"
                    onClick={() => deletePromo(promo.id)}
                    style={dangerIconButton}
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    )}
  </Card>
</div>
        </section>

        <style jsx global>{`
          @media (max-width: 760px) {
            .admin-store-page {
              padding: 18px 12px 34px !important;
            }

            .admin-store-kpi {
              grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
              gap: 10px !important;
            }

            .admin-store-two-col-wide {
              grid-template-columns: 1fr !important;
            }

            .admin-store-manage-grid,
            .admin-store-form-grid,
            .admin-store-checks-grid {
              grid-template-columns: 1fr !important;
            }

            .admin-store-variant-row {
              grid-template-columns: minmax(0, 1fr) 58px !important;
              gap: 8px !important;
            }

            .admin-store-upload-button {
              grid-column: 1 / 2 !important;
              width: 100% !important;
            }

            .admin-store-stock-wrap {
              max-height: none !important;
              overflow: visible !important;
            }

            .admin-store-stock-row {
              grid-template-columns: 1fr !important;
              align-items: stretch !important;
            }

            .admin-store-product-row {
              flex-direction: column !important;
              align-items: stretch !important;
            }

            .admin-store-product-actions {
              width: 100% !important;
              justify-content: space-between !important;
            }

            .admin-store-product-actions button:first-child {
              flex: 1 !important;
              min-height: 40px !important;
            }
          }

          @media (max-width: 430px) {
            .admin-store-kpi {
              grid-template-columns: 1fr !important;
            }
          }
        `}</style>
      </div>
    </div>
  );
}
      

function Kpi({ icon, label, value, tone = "#ffffff" }: any) {
  return (
    <div style={cardStyle}>
      <div style={{ color: tone }}>{icon}</div>
      <div style={{ marginTop: 12, fontSize: 25, fontWeight: 950 }}>{value}</div>
      <div style={muted}>{label}</div>
    </div>
  );
}

function Card({ title, icon, children, action }: any) {
  return (
    <div style={cardStyle}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
        <span style={{ color: "#fbbf24" }}>{icon}</span>
        <h2 style={{ fontSize: 18, fontWeight: 950 }}>{title}</h2>
        <div style={{ marginLeft: "auto" }}>{action}</div>
      </div>
      {children}
    </div>
  );
}

function Field({ label, children, style }: any) {
  return (
    <label style={{ display: "grid", gap: 7, ...style }}>
      <span style={labelStyle}>{label}</span>
      {children}
    </label>
  );
}

function Input({ value, onChange, placeholder, type = "text" }: any) {
  return (
    <input
      type={type}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      style={inputStyle}
    />
  );
}

function Select({ value, onChange, children }: any) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} style={inputStyle}>
      {children}
    </select>
  );
}

function Check({ label, checked, onChange }: any) {
  return (
    <label style={checkStyle}>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span>{label}</span>
    </label>
  );
}

function BlockTitle({ icon, title, action }: any) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 22, marginBottom: 10 }}>
      <span style={{ color: "#fbbf24" }}>{icon}</span>
      <h3 style={{ fontSize: 15, fontWeight: 950 }}>{title}</h3>
      {action ? (
        <button type="button" onClick={action} style={addButton}>
          <Plus className="w-4 h-4" />
          Aggiungi
        </button>
      ) : null}
    </div>
  );
}

function PresetSizeGroup({
  title,
  values,
  sizes,
  onToggle,
}: {
  title: string;
  values: string[];
  sizes: SizeRow[];
  onToggle: (label: string) => void;
}) {
  return (
    <div style={{ marginBottom: 10 }}>
      <div
        style={{
          fontSize: 12,
          fontWeight: 900,
          color: "rgba(255,255,255,0.6)",
          marginBottom: 6,
          textTransform: "uppercase",
        }}
      >
        {title}
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
        {values.map((label) => {
          const active = sizes.some(
            (s) => s.size_label.trim().toUpperCase() === label
          );

          return (
            <button
              key={label}
              type="button"
              onClick={() => onToggle(label)}
              style={{
                minHeight: 36,
                minWidth: 56,
                borderRadius: 999,
                border: active
                  ? "1px solid rgba(251,191,36,0.7)"
                  : "1px solid rgba(255,255,255,0.10)",
                background: active
                  ? "rgba(251,191,36,0.18)"
                  : "rgba(255,255,255,0.055)",
                color: active ? "#fbbf24" : "rgba(255,255,255,0.8)",
                fontWeight: 900,
                cursor: "pointer",
              }}
            >
              {label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function SortableProductRow({
  product,
  categoryName,
  onEdit,
  onDelete,
}: {
  product: ProductWithMeta;
  categoryName: string;
  onEdit: (product: ProductWithMeta) => void;
  onDelete: (id: string) => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: product.id });

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.72 : 1,
        display: "grid",
        gridTemplateColumns: "42px minmax(0, 1fr)",
        gap: 11,
        alignItems: "center",
        padding: 12,
        borderRadius: 18,
        background: isDragging
          ? "rgba(251,191,36,0.12)"
          : "rgba(255,255,255,0.055)",
        border: isDragging
          ? "1px solid rgba(251,191,36,0.45)"
          : "1px solid rgba(255,255,255,0.08)",
        boxShadow: isDragging ? "0 20px 45px rgba(0,0,0,0.30)" : "none",
      }}
    >
      <button
        type="button"
        {...attributes}
        {...listeners}
        title="Trascina per ordinare"
        style={{
          width: 42,
          height: 42,
          borderRadius: 14,
          border: "1px solid rgba(255,255,255,0.10)",
          background: "rgba(255,255,255,0.06)",
          color: "rgba(255,255,255,0.78)",
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          cursor: "grab",
          touchAction: "none",
        }}
      >
        <GripVertical className="w-5 h-5" />
      </button>

      <div style={{ minWidth: 0 }}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            gap: 10,
            alignItems: "center",
          }}
        >
          <div style={{ minWidth: 0 }}>
            <div style={{ fontWeight: 950, color: "#ffffff" }}>{product.name}</div>
            <div style={muted}>
              #{product.sort_order ?? 0} · {categoryName} · €{Number(product.base_price_euro).toFixed(2)}
            </div>
          </div>

          <div
            style={{ display: "flex", gap: 8, alignItems: "center" }}
            className="admin-store-product-actions"
          >
            <button type="button" onClick={() => onEdit(product)} style={smallButton}>
              Modifica
            </button>

            <button
              type="button"
              onClick={() => onDelete(product.id)}
              style={dangerIconButton}
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

const pageStyle: React.CSSProperties = {
  minHeight: "100dvh",
  background: "linear-gradient(180deg, #030712 0%, #07111f 42%, #0f172a 100%)",
  padding: "24px 16px 44px",
};

const cardStyle: React.CSSProperties = {
  borderRadius: 26,
  padding: 18,
  background: "linear-gradient(135deg, rgba(255,255,255,0.075), rgba(255,255,255,0.035))",
  border: "1px solid rgba(255,255,255,0.09)",
  boxShadow: "0 18px 42px rgba(0,0,0,0.20)",
  backdropFilter: "blur(14px)",
};

const gridKpi: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
  gap: 12,
  marginBottom: 14,
};

const twoCol: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "1fr",
  gap: 14,
  marginBottom: 14,
};

const twoColWide: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "minmax(0, 1.35fr) minmax(320px, 0.65fr)",
  gap: 14,
  alignItems: "start",
};

const manageGrid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
  gap: 12,
};

const manageBox: React.CSSProperties = {
  padding: 13,
  borderRadius: 18,
  background: "rgba(255,255,255,0.055)",
  border: "1px solid rgba(255,255,255,0.08)",
};

const inlineCreate: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "1fr 48px",
  gap: 8,
};

const chipsWrap: React.CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: 8,
  marginTop: 10,
};

const chipStyle: React.CSSProperties = {
  padding: "7px 10px",
  borderRadius: 999,
  background: "rgba(251,191,36,0.13)",
  border: "1px solid rgba(251,191,36,0.18)",
  color: "#fbbf24",
  fontSize: 12,
  fontWeight: 900,
};

const formGrid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
  gap: 10,
};

const checksGrid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
  gap: 10,
  marginTop: 10,
};

const labelStyle: React.CSSProperties = {
  color: "rgba(255,255,255,0.72)",
  fontSize: 12,
  fontWeight: 900,
  paddingLeft: 4,
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  minHeight: 46,
  borderRadius: 18,
  border: "1px solid rgba(255,255,255,0.08)",
  background: "rgba(255,255,255,0.055)",
  color: "white",
  padding: "11px 13px",
  outline: "none",
  fontWeight: 750,
};

const optionStyle: React.CSSProperties = {
  color: "#0f172a",
  background: "#ffffff",
};

const muted: React.CSSProperties = {
  color: "rgba(255,255,255,0.58)",
  fontSize: 13,
  fontWeight: 650,
};

const checkStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 9,
  padding: 12,
  borderRadius: 18,
  background: "rgba(255,255,255,0.055)",
  border: "1px solid rgba(255,255,255,0.08)",
  fontSize: 13,
  fontWeight: 850,
};

const addButton: React.CSSProperties = {
  marginLeft: "auto",
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  border: 0,
  borderRadius: 999,
  padding: "8px 11px",
  background: "rgba(251,191,36,0.16)",
  color: "#fbbf24",
  fontWeight: 950,
  cursor: "pointer",
};

const ghostButton: React.CSSProperties = {
  border: "1px solid rgba(255,255,255,0.12)",
  borderRadius: 999,
  padding: "8px 12px",
  background: "rgba(255,255,255,0.06)",
  color: "white",
  fontWeight: 950,
  cursor: "pointer",
};

const economicsButton: React.CSSProperties = {
  minHeight: 40,
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 8,
  borderRadius: 999,
  padding: "9px 13px",
  background: "rgba(16,185,129,0.13)",
  border: "1px solid rgba(16,185,129,0.24)",
  color: "#a7f3d0",
  fontSize: 13,
  fontWeight: 950,
  textDecoration: "none",
  boxShadow: "0 14px 30px rgba(0,0,0,0.18)",
};

const primaryButton: React.CSSProperties = {
  width: "100%",
  marginTop: 18,
  minHeight: 48,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 9,
  border: 0,
  borderRadius: 18,
  background: "linear-gradient(135deg, #fbbf24, #f97316)",
  color: "#111827",
  fontWeight: 950,
  cursor: "pointer",
};

const smallPrimaryButton: React.CSSProperties = {
  width: 48,
  minHeight: 46,
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  border: 0,
  borderRadius: 18,
  background: "linear-gradient(135deg, #fbbf24, #f97316)",
  color: "#111827",
  fontWeight: 950,
  cursor: "pointer",
};

const smallButton: React.CSSProperties = {
  border: 0,
  borderRadius: 999,
  padding: "8px 11px",
  background: "rgba(251,191,36,0.16)",
  color: "#fbbf24",
  fontWeight: 950,
  cursor: "pointer",
};

const dangerIconButton: React.CSSProperties = {
  minWidth: 40,
  height: 40,
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  border: "1px solid rgba(248,113,113,0.22)",
  borderRadius: 14,
  background: "rgba(248,113,113,0.12)",
  color: "#fca5a5",
  cursor: "pointer",
};

const variantRow: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "minmax(160px, 1fr) 70px 130px 42px",
  gap: 8,
  alignItems: "center",
  padding: 12,
  borderRadius: 18,
  background: "rgba(255,255,255,0.055)",
  border: "1px solid rgba(255,255,255,0.08)",
};

const colorInput: React.CSSProperties = {
  width: "100%",
  height: 46,
  border: "1px solid rgba(255,255,255,0.08)",
  borderRadius: 16,
  background: "rgba(255,255,255,0.055)",
  padding: 6,
};

const uploadButton: React.CSSProperties = {
  height: 46,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 7,
  borderRadius: 16,
  background: "rgba(255,255,255,0.07)",
  border: "1px solid rgba(255,255,255,0.08)",
  color: "white",
  fontSize: 13,
  fontWeight: 900,
  cursor: "pointer",
};

const imagePathText: React.CSSProperties = {
  gridColumn: "1 / -1",
  color: "#86efac",
  fontSize: 12,
  fontWeight: 700,
  wordBreak: "break-all",
};

const sizesGrid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))",
  gap: 8,
};

const sizePill: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  padding: 8,
  borderRadius: 18,
  background: "rgba(255,255,255,0.055)",
  border: "1px solid rgba(255,255,255,0.08)",
};

const sizeInput: React.CSSProperties = {
  minWidth: 0,
  width: "100%",
  border: 0,
  background: "transparent",
  color: "white",
  outline: "none",
  fontWeight: 900,
};

const miniDanger: React.CSSProperties = {
  width: 26,
  height: 26,
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  border: 0,
  borderRadius: 999,
  background: "rgba(248,113,113,0.16)",
  color: "#fca5a5",
  cursor: "pointer",
};

const stockRow: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "minmax(140px, 1fr) minmax(120px, 1fr) 100px 110px",
  gap: 8,
  alignItems: "center",
  padding: 12,
  borderRadius: 18,
  background: "rgba(255,255,255,0.055)",
  border: "1px solid rgba(255,255,255,0.08)",
};

const productRow: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 12,
  alignItems: "center",
  padding: 13,
  borderRadius: 18,
  background: "rgba(255,255,255,0.055)",
  border: "1px solid rgba(255,255,255,0.08)",
};

const emptyRow: React.CSSProperties = {
  padding: 13,
  borderRadius: 18,
  background: "rgba(255,255,255,0.045)",
  border: "1px solid rgba(255,255,255,0.07)",
  color: "rgba(255,255,255,0.58)",
  fontSize: 13,
  fontWeight: 700,
};