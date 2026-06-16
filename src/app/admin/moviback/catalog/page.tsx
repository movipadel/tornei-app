"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  Eye,
  EyeOff,
  Gift,
  ImagePlus,
  Loader2,
  Pencil,
  Plus,
  Trash2,
  X,
} from "lucide-react";

type Reward = {
  id: string;
  name: string;
  description: string | null;
  category: string | null;
  points_cost: number;
  image_path: string | null;
  is_active: boolean;
  stock_qty: number | null;
  reward_type: "club" | "partner";
  created_at: string | null;
  updated_at: string | null;

  store_product_id?: string | null;
  requires_store_variant?: boolean;
};

type RewardCategory = {
  id: string;
  name: string;
  sort_order: number;
  is_active: boolean;
};

type RewardPointRange = {
  id: string;
  label: string;
  min_points: number | null;
  max_points: number | null;
  sort_order: number;
  is_active: boolean;
};

const emptyForm = {
  name: "",
  description: "",
  category: "",
  points_cost: "",
  image_path: "",
  stock_qty: "",
  is_active: true,

  store_product_id: "",
  requires_store_variant: false,
};

const emptyCategoryForm = {
  name: "",
  sort_order: "",
  is_active: true,
};

const emptyRangeForm = {
  label: "",
  min_points: "",
  max_points: "",
  sort_order: "",
  is_active: true,
};

export default function AdminMoviBackCatalogPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [items, setItems] = useState<Reward[]>([]);
  const [storeProducts, setStoreProducts] = useState<any[]>([]);
  const [editing, setEditing] = useState<Reward | null>(null);
  const [form, setForm] = useState(emptyForm);

  const [categories, setCategories] = useState<RewardCategory[]>([]);
  const [ranges, setRanges] = useState<RewardPointRange[]>([]);

  const [categoryForm, setCategoryForm] = useState(emptyCategoryForm);
  const [editingCategory, setEditingCategory] = useState<RewardCategory | null>(null);

  const [rangeForm, setRangeForm] = useState(emptyRangeForm);
  const [editingRange, setEditingRange] = useState<RewardPointRange | null>(null);

  const [imageFile, setImageFile] = useState<File | null>(null);
  const [previewImage, setPreviewImage] = useState<string | null>(null);

  async function loadAll() {
    await Promise.all([loadRewards(), loadCategories(), loadRanges()]);
  }

  async function loadRewards() {
    try {
      setLoading(true);

      const res = await fetch("/api/admin/moviback/rewards", {
        cache: "no-store",
      });

      const json = await res.json().catch(() => ({}));

      if (!res.ok) throw new Error(json.error || "Errore caricamento premi");

      setItems((json.data ?? []) as Reward[]);
    } catch (e: any) {
      toast.error(e?.message ?? "Errore");
    } finally {
      setLoading(false);
    }
  }

  async function loadStoreProducts() {
  try {
    const res = await fetch("/api/store/products", {
      cache: "no-store",
    });

    const json = await res.json().catch(() => ({}));

    if (!res.ok) {
      throw new Error(json.error || "Errore prodotti store");
    }

    setStoreProducts(json.products ?? []);
  } catch (e) {
    console.error(e);
  }
}

  async function loadCategories() {
    try {
      const res = await fetch("/api/admin/moviback/reward-categories", {
        cache: "no-store",
      });

      const json = await res.json().catch(() => ({}));

      if (!res.ok) throw new Error(json.error || "Errore caricamento categorie");

      setCategories((json.data ?? []) as RewardCategory[]);
    } catch (e: any) {
      toast.error(e?.message ?? "Errore categorie");
    }
  }

  async function loadRanges() {
    try {
      const res = await fetch("/api/admin/moviback/reward-point-ranges", {
        cache: "no-store",
      });

      const json = await res.json().catch(() => ({}));

      if (!res.ok) throw new Error(json.error || "Errore caricamento fasce punti");

      setRanges((json.data ?? []) as RewardPointRange[]);
    } catch (e: any) {
      toast.error(e?.message ?? "Errore fasce punti");
    }
  }

  useEffect(() => {
  loadAll();
  loadStoreProducts();
}, []);

  function resetForm() {
    setEditing(null);
    setForm(emptyForm);
    setImageFile(null);
  }

  function startEdit(reward: Reward) {
    setEditing(reward);
    setForm({
      name: reward.name ?? "",
      description: reward.description ?? "",
      category: reward.category ?? "",
      points_cost: String(reward.points_cost ?? ""),
      image_path: reward.image_path ?? "",
      stock_qty: reward.stock_qty === null ? "" : String(reward.stock_qty),
      is_active: Boolean(reward.is_active),
      store_product_id: reward.store_product_id ?? "",
      requires_store_variant: Boolean(
      reward.requires_store_variant
      ),
    });
    setImageFile(null);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function uploadImageIfNeeded() {
    if (!imageFile) return form.image_path || null;

    const fd = new FormData();
    fd.append("file", imageFile);

    const res = await fetch("/api/admin/moviback/rewards/image", {
      method: "POST",
      body: fd,
    });

    const json = await res.json().catch(() => ({}));

    if (!res.ok) throw new Error(json.error || "Errore upload immagine");

    return json.url as string;
  }

  async function saveReward(e: React.FormEvent) {
    e.preventDefault();
    if (saving) return;

    try {
      setSaving(true);

      const imageUrl = await uploadImageIfNeeded();

      const payload = {
  name: form.name,
  description: form.description,
  category: form.category,
  points_cost: Number(form.points_cost),
  image_path: imageUrl,
  stock_qty: form.stock_qty === "" ? null : Number(form.stock_qty),
  is_active: form.is_active,
  store_product_id: form.store_product_id || null,
  requires_store_variant: form.requires_store_variant,
};

      const url = editing
        ? `/api/admin/moviback/rewards/${editing.id}`
        : "/api/admin/moviback/rewards";

      const res = await fetch(url, {
        method: editing ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const json = await res.json().catch(() => ({}));

      if (!res.ok) throw new Error(json.error || "Errore salvataggio premio");

      toast.success(editing ? "Premio aggiornato" : "Premio creato");

      resetForm();
      await loadRewards();
    } catch (e: any) {
      toast.error(e?.message ?? "Errore");
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(reward: Reward) {
    try {
      const res = await fetch(`/api/admin/moviback/rewards/${reward.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
  name: reward.name,
  description: reward.description ?? "",
  category: reward.category ?? "",
  points_cost: reward.points_cost,
  image_path: reward.image_path ?? "",
  stock_qty: reward.stock_qty,
  is_active: !reward.is_active,
  store_product_id: reward.store_product_id ?? null,
  requires_store_variant: Boolean(reward.requires_store_variant),
}),
      });

      const json = await res.json().catch(() => ({}));

      if (!res.ok) throw new Error(json.error || "Errore aggiornamento premio");

      toast.success(reward.is_active ? "Premio nascosto" : "Premio riattivato");
      await loadRewards();
    } catch (e: any) {
      toast.error(e?.message ?? "Errore");
    }
  }

  async function deleteReward(id: string) {
    const ok = confirm(
      "Eliminare DEFINITIVAMENTE questo premio?\n\nUsa questa opzione solo per premi creati per errore. Per nasconderlo dal catalogo usa il bottone Nascondi."
    );
    if (!ok) return;

    try {
      const res = await fetch(`/api/admin/moviback/rewards/${id}`, {
        method: "DELETE",
      });

      const json = await res.json().catch(() => ({}));

      if (!res.ok) throw new Error(json.error || "Errore eliminazione premio");

      toast.success("Premio eliminato");
      await loadRewards();
    } catch (e: any) {
      toast.error(e?.message ?? "Errore");
    }
  }

  function startEditCategory(category: RewardCategory) {
    setEditingCategory(category);
    setCategoryForm({
      name: category.name,
      sort_order: String(category.sort_order ?? 0),
      is_active: Boolean(category.is_active),
    });
  }

  function resetCategoryForm() {
    setEditingCategory(null);
    setCategoryForm(emptyCategoryForm);
  }

  async function saveCategory(e: React.FormEvent) {
    e.preventDefault();

    try {
      const payload = {
        name: categoryForm.name,
        sort_order: categoryForm.sort_order === "" ? 0 : Number(categoryForm.sort_order),
        is_active: categoryForm.is_active,
      };

      const url = editingCategory
        ? `/api/admin/moviback/reward-categories/${editingCategory.id}`
        : "/api/admin/moviback/reward-categories";

      const res = await fetch(url, {
        method: editingCategory ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const json = await res.json().catch(() => ({}));

      if (!res.ok) throw new Error(json.error || "Errore salvataggio categoria");

      toast.success(editingCategory ? "Categoria aggiornata" : "Categoria creata");
      resetCategoryForm();
      await loadCategories();
    } catch (e: any) {
      toast.error(e?.message ?? "Errore");
    }
  }

  async function deleteCategory(id: string) {
    const ok = confirm("Eliminare questa categoria?");
    if (!ok) return;

    try {
      const res = await fetch(`/api/admin/moviback/reward-categories/${id}`, {
        method: "DELETE",
      });

      const json = await res.json().catch(() => ({}));

      if (!res.ok) throw new Error(json.error || "Errore eliminazione categoria");

      toast.success("Categoria eliminata");
      await loadCategories();
    } catch (e: any) {
      toast.error(e?.message ?? "Errore");
    }
  }

  function startEditRange(range: RewardPointRange) {
    setEditingRange(range);
    setRangeForm({
      label: range.label,
      min_points: range.min_points === null ? "" : String(range.min_points),
      max_points: range.max_points === null ? "" : String(range.max_points),
      sort_order: String(range.sort_order ?? 0),
      is_active: Boolean(range.is_active),
    });
  }

  function resetRangeForm() {
    setEditingRange(null);
    setRangeForm(emptyRangeForm);
  }

  async function saveRange(e: React.FormEvent) {
    e.preventDefault();

    try {
      const payload = {
        label: rangeForm.label,
        min_points: rangeForm.min_points,
        max_points: rangeForm.max_points,
        sort_order: rangeForm.sort_order === "" ? 0 : Number(rangeForm.sort_order),
        is_active: rangeForm.is_active,
      };

      const url = editingRange
        ? `/api/admin/moviback/reward-point-ranges/${editingRange.id}`
        : "/api/admin/moviback/reward-point-ranges";

      const res = await fetch(url, {
        method: editingRange ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const json = await res.json().catch(() => ({}));

      if (!res.ok) throw new Error(json.error || "Errore salvataggio fascia punti");

      toast.success(editingRange ? "Fascia aggiornata" : "Fascia creata");
      resetRangeForm();
      await loadRanges();
    } catch (e: any) {
      toast.error(e?.message ?? "Errore");
    }
  }

  async function deleteRange(id: string) {
    const ok = confirm("Eliminare questa fascia punti?");
    if (!ok) return;

    try {
      const res = await fetch(`/api/admin/moviback/reward-point-ranges/${id}`, {
        method: "DELETE",
      });

      const json = await res.json().catch(() => ({}));

      if (!res.ok) throw new Error(json.error || "Errore eliminazione fascia");

      toast.success("Fascia eliminata");
      await loadRanges();
    } catch (e: any) {
      toast.error(e?.message ?? "Errore");
    }
  }

  return (
    <div style={pageStyle}>
      <div style={{ maxWidth: 1120, margin: "0 auto", color: "white" }}>
        <div style={{ marginBottom: 22 }}>
          <div style={titleRow}>
            <Gift className="w-7 h-7" style={{ color: "#f59e0b" }} />
            Catalogo premi
          </div>

          <div style={muted}>
            Crea premi, categorie e fasce punti del catalogo MoviBack.
          </div>
        </div>

        <form onSubmit={saveReward} style={cardStyle}>
          <div style={sectionTitle}>{editing ? "Modifica premio" : "Nuovo premio"}</div>

          <div style={{ display: "grid", gap: 12 }}>
            <input
              value={form.name}
              onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
              placeholder="Nome premio"
              required
              style={inputStyle}
            />

            <textarea
              value={form.description}
              onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))}
              placeholder="Descrizione"
              rows={4}
              style={{ ...inputStyle, minHeight: 110, paddingTop: 12, resize: "vertical" }}
            />

            <div style={twoCols}>
              <select
                value={form.category}
                onChange={(e) => setForm((p) => ({ ...p, category: e.target.value }))}
                style={selectStyle}
              >
                <option value="" style={optionStyle}>
                  Seleziona categoria
                </option>
                {categories.map((c) => (
                  <option key={c.id} value={c.name} style={optionStyle}>
                    {c.name}
                  </option>
                ))}
              </select>

              <input
                type="number"
                value={form.points_cost}
                onChange={(e) => setForm((p) => ({ ...p, points_cost: e.target.value }))}
                placeholder="Valore punti"
                required
                min={1}
                style={inputStyle}
              />
            </div>

            <select
  value={form.store_product_id}
  onChange={(e) =>
    setForm((p) => ({
      ...p,
      store_product_id: e.target.value,
      requires_store_variant: e.target.value
        ? p.requires_store_variant
        : false,
    }))
  }
  style={selectStyle}
>
  <option value="" style={optionStyle}>
    Nessun collegamento Store
  </option>

  {storeProducts.map((p) => (
    <option key={p.id} value={p.id} style={optionStyle}>
      {p.name}
    </option>
  ))}
</select>

{form.store_product_id ? (
  <label style={checkboxLabel}>
    <input
      type="checkbox"
      checked={form.requires_store_variant}
      onChange={(e) =>
        setForm((p) => ({
          ...p,
          requires_store_variant: e.target.checked,
        }))
      }
    />
    Richiede scelta colore/taglia
  </label>
) : null}

            <input
              type="number"
              value={form.stock_qty}
              onChange={(e) => setForm((p) => ({ ...p, stock_qty: e.target.value }))}
              placeholder="Quantità disponibile (vuoto = illimitata)"
              min={0}
              style={inputStyle}
            />

            <label style={uploadLabel}>
              <ImagePlus className="w-5 h-5" strokeWidth={1.7} style={{ color: "#f59e0b", flexShrink: 0 }} />
              <span style={uploadText(imageFile, form.image_path)}>
                {imageFile
                  ? imageFile.name
                  : form.image_path
                    ? "Immagine già caricata"
                    : "Carica immagine JPG, PNG o WEBP · consigliato 800x800 px"}
              </span>

              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                style={{ display: "none" }}
                onChange={(e) => setImageFile(e.target.files?.[0] ?? null)}
              />
            </label>

            {form.image_path ? (
              <button type="button" onClick={() => setPreviewImage(form.image_path)} style={secondaryBtn}>
                Visualizza immagine caricata
              </button>
            ) : null}

            <label style={checkboxLabel}>
              <input
                type="checkbox"
                checked={form.is_active}
                onChange={(e) => setForm((p) => ({ ...p, is_active: e.target.checked }))}
              />
              Premio visibile nel catalogo
            </label>

            <div style={{ display: "grid", gridTemplateColumns: editing ? "1fr 1fr" : "1fr", gap: 10 }}>
              {editing ? (
                <button type="button" onClick={resetForm} disabled={saving} style={secondaryBtn}>
                  Annulla modifica
                </button>
              ) : null}

              <button type="submit" disabled={saving} style={{ ...primaryBtn, opacity: saving ? 0.65 : 1 }}>
                {saving ? "Salvataggio..." : editing ? "Salva modifiche" : "Crea premio"}
              </button>
            </div>
          </div>
        </form>

        <section style={twoPanelGrid}>
          <form onSubmit={saveCategory} style={cardStyle}>
            <div style={sectionTitle}>{editingCategory ? "Modifica categoria" : "Categorie premio"}</div>

            <div style={{ display: "grid", gap: 10 }}>
              <input
                value={categoryForm.name}
                onChange={(e) => setCategoryForm((p) => ({ ...p, name: e.target.value }))}
                placeholder="Nome categoria es. Abbigliamento"
                required
                style={inputStyle}
              />

              <input
                type="number"
                value={categoryForm.sort_order}
                onChange={(e) => setCategoryForm((p) => ({ ...p, sort_order: e.target.value }))}
                placeholder="Ordine visualizzazione"
                style={inputStyle}
              />

              <label style={checkboxLabel}>
                <input
                  type="checkbox"
                  checked={categoryForm.is_active}
                  onChange={(e) => setCategoryForm((p) => ({ ...p, is_active: e.target.checked }))}
                />
                Categoria attiva
              </label>

              <div style={{ display: "grid", gridTemplateColumns: editingCategory ? "1fr 1fr" : "1fr", gap: 10 }}>
                {editingCategory ? (
                  <button type="button" onClick={resetCategoryForm} style={secondaryBtn}>
                    Annulla
                  </button>
                ) : null}

                <button type="submit" style={primaryBtn}>
                  {editingCategory ? "Salva categoria" : "Crea categoria"}
                </button>
              </div>

              <div style={{ display: "grid", gap: 8, marginTop: 4 }}>
                {categories.map((c) => (
                  <MiniRow
                    key={c.id}
                    title={c.name}
                    subtitle={`Ordine ${c.sort_order} · ${c.is_active ? "Attiva" : "Nascosta"}`}
                    onEdit={() => startEditCategory(c)}
                    onDelete={() => deleteCategory(c.id)}
                  />
                ))}
              </div>
            </div>
          </form>

          <form onSubmit={saveRange} style={cardStyle}>
            <div style={sectionTitle}>{editingRange ? "Modifica fascia" : "Fasce punti"}</div>

            <div style={{ display: "grid", gap: 10 }}>
              <input
                value={rangeForm.label}
                onChange={(e) => setRangeForm((p) => ({ ...p, label: e.target.value }))}
                placeholder="Etichetta es. Fino a 50 pt"
                required
                style={inputStyle}
              />

              <div style={twoCols}>
                <input
                  type="number"
                  value={rangeForm.min_points}
                  onChange={(e) => setRangeForm((p) => ({ ...p, min_points: e.target.value }))}
                  placeholder="Min punti"
                  min={0}
                  style={inputStyle}
                />

                <input
                  type="number"
                  value={rangeForm.max_points}
                  onChange={(e) => setRangeForm((p) => ({ ...p, max_points: e.target.value }))}
                  placeholder="Max punti vuoto = infinito"
                  min={0}
                  style={inputStyle}
                />
              </div>

              <input
                type="number"
                value={rangeForm.sort_order}
                onChange={(e) => setRangeForm((p) => ({ ...p, sort_order: e.target.value }))}
                placeholder="Ordine visualizzazione"
                style={inputStyle}
              />

              <label style={checkboxLabel}>
                <input
                  type="checkbox"
                  checked={rangeForm.is_active}
                  onChange={(e) => setRangeForm((p) => ({ ...p, is_active: e.target.checked }))}
                />
                Fascia attiva
              </label>

              <div style={{ display: "grid", gridTemplateColumns: editingRange ? "1fr 1fr" : "1fr", gap: 10 }}>
                {editingRange ? (
                  <button type="button" onClick={resetRangeForm} style={secondaryBtn}>
                    Annulla
                  </button>
                ) : null}

                <button type="submit" style={primaryBtn}>
                  {editingRange ? "Salva fascia" : "Crea fascia"}
                </button>
              </div>

              <div style={{ display: "grid", gap: 8, marginTop: 4 }}>
                {ranges.map((r) => (
                  <MiniRow
                    key={r.id}
                    title={r.label}
                    subtitle={`${r.min_points ?? 0} → ${r.max_points ?? "∞"} pt · Ordine ${r.sort_order} · ${r.is_active ? "Attiva" : "Nascosta"}`}
                    onEdit={() => startEditRange(r)}
                    onDelete={() => deleteRange(r.id)}
                  />
                ))}
              </div>
            </div>
          </form>
        </section>

        {loading ? (
          <div style={{ textAlign: "center", padding: 30 }}>
            <Loader2 className="w-7 h-7 animate-spin" />
          </div>
        ) : items.length === 0 ? (
          <div style={emptyState}>Nessun premio nel catalogo.</div>
        ) : (
          <div style={{ display: "grid", gap: 14 }}>
            {items.map((reward) => (
              <div
                key={reward.id}
                style={{
                  display: "grid",
                  gridTemplateColumns: "82px minmax(0, 1fr)",
                  gap: 13,
                  alignItems: "center",
                  borderRadius: 24,
                  padding: 12,
                  background: reward.is_active ? "rgba(255,255,255,0.055)" : "rgba(255,255,255,0.02)",
                  opacity: reward.is_active ? 1 : 0.58,
                  border: "1px solid rgba(255,255,255,0.08)",
                  boxShadow: "0 14px 34px rgba(0,0,0,0.16)",
                }}
              >
                <button
                  type="button"
                  onClick={() => reward.image_path ? setPreviewImage(reward.image_path) : null}
                  style={thumbBtn}
                >
                  {reward.image_path ? (
                    <img src={reward.image_path} alt={reward.name} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
                  ) : (
                    <div style={thumbFallback}>
                      <Gift className="w-6 h-6" />
                    </div>
                  )}
                </button>

                <div style={{ minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10 }}>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ color: "#ffffff", fontSize: 17, fontWeight: 900, lineHeight: 1.1 }}>
                        {reward.name}
                      </div>

                      <div style={descriptionText}>{reward.description || "Nessuna descrizione"}</div>
                    </div>

                    <div style={{ flexShrink: 0, color: "#fbbf24", fontWeight: 950, fontSize: 15 }}>
                      {reward.points_cost} pt
                    </div>
                  </div>

                  <div style={{ marginTop: 11, display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8 }}>
                    <span style={pillStyle}>{reward.category || "Senza categoria"}</span>
                    <span style={pillStyle}>Stock: {reward.stock_qty === null ? "∞" : reward.stock_qty}</span>

                    <button type="button" onClick={() => startEdit(reward)} style={iconBtn} title="Modifica">
                      <Pencil className="w-4 h-4" />
                    </button>

                    <button
                      type="button"
                      onClick={() => toggleActive(reward)}
                      style={{
                        ...iconBtn,
                        color: reward.is_active ? "#fbbf24" : "#86efac",
                        border: reward.is_active
                          ? "1px solid rgba(245,158,11,0.24)"
                          : "1px solid rgba(34,197,94,0.24)",
                      }}
                      title={reward.is_active ? "Nascondi premio" : "Riattiva premio"}
                    >
                      {reward.is_active ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>

                    <button
                      type="button"
                      onClick={() => deleteReward(reward.id)}
                      style={{ ...iconBtn, color: "#f87171", border: "1px solid rgba(239,68,68,0.24)" }}
                      title="Elimina"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {previewImage ? (
          <div onClick={() => setPreviewImage(null)} style={previewOverlay}>
            <div onClick={(e) => e.stopPropagation()} style={previewBox}>
              <button type="button" onClick={() => setPreviewImage(null)} style={previewCloseBtn}>
                <X className="w-5 h-5" />
              </button>

              <img src={previewImage} alt="Anteprima premio" style={{ width: "100%", maxHeight: "78dvh", objectFit: "contain", display: "block" }} />
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function MiniRow({
  title,
  subtitle,
  onEdit,
  onDelete,
}: {
  title: string;
  subtitle: string;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <div style={miniRowStyle}>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontWeight: 900, color: "white", fontSize: 14 }}>{title}</div>
        <div style={{ color: "rgba(255,255,255,0.52)", fontSize: 12, fontWeight: 650, marginTop: 2 }}>
          {subtitle}
        </div>
      </div>

      <button type="button" onClick={onEdit} style={iconBtn}>
        <Pencil className="w-4 h-4" />
      </button>

      <button type="button" onClick={onDelete} style={{ ...iconBtn, color: "#f87171" }}>
        <Trash2 className="w-4 h-4" />
      </button>
    </div>
  );
}

const pageStyle: React.CSSProperties = {
  minHeight: "100dvh",
  background: "linear-gradient(180deg, #030712 0%, #07111f 42%, #0f172a 100%)",
  padding: "24px 16px",
};

const titleRow: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 10,
  fontSize: 28,
  fontWeight: 950,
  letterSpacing: -0.8,
};

const muted: React.CSSProperties = {
  marginTop: 6,
  color: "rgba(255,255,255,0.58)",
  fontSize: 14,
  fontWeight: 600,
};

const sectionTitle: React.CSSProperties = {
  fontSize: 18,
  fontWeight: 900,
  marginBottom: 14,
};

const cardStyle: React.CSSProperties = {
  borderRadius: 26,
  padding: 18,
  marginBottom: 22,
  background: "linear-gradient(135deg, rgba(255,255,255,0.075), rgba(255,255,255,0.035))",
  border: "1px solid rgba(255,255,255,0.09)",
  boxShadow: "0 18px 42px rgba(0,0,0,0.20)",
  backdropFilter: "blur(14px)",
};

const twoPanelGrid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(310px, 1fr))",
  gap: 14,
};

const twoCols: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "1fr 1fr",
  gap: 10,
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  minHeight: 48,
  borderRadius: 16,
  border: "1px solid rgba(255,255,255,0.10)",
  background: "rgba(255,255,255,0.06)",
  color: "#ffffff",
  padding: "0 13px",
  outline: "none",
  fontWeight: 700,
  fontSize: 15,
};

const selectStyle: React.CSSProperties = {
  ...inputStyle,
  appearance: "none",
};

const optionStyle: React.CSSProperties = {
  color: "#0f172a",
  background: "#ffffff",
};

const uploadLabel: React.CSSProperties = {
  minHeight: 54,
  borderRadius: 18,
  border: "1px dashed rgba(255,255,255,0.18)",
  background: "rgba(255,255,255,0.055)",
  display: "flex",
  alignItems: "center",
  gap: 11,
  padding: "12px 13px",
  cursor: "pointer",
};

function uploadText(imageFile: File | null, imagePath: string | null): React.CSSProperties {
  return {
    color: imageFile || imagePath ? "#ffffff" : "rgba(255,255,255,0.58)",
    fontWeight: 750,
    fontSize: 13,
    minWidth: 0,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  };
}

const checkboxLabel: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 10,
  color: "rgba(255,255,255,0.78)",
  fontWeight: 750,
  fontSize: 14,
};

const primaryBtn: React.CSSProperties = {
  minHeight: 50,
  borderRadius: 17,
  border: 0,
  background: "linear-gradient(135deg, #f59e0b 0%, #fbbf24 100%)",
  color: "#111827",
  fontWeight: 950,
  fontSize: 15,
  cursor: "pointer",
};

const secondaryBtn: React.CSSProperties = {
  minHeight: 50,
  borderRadius: 17,
  border: "1px solid rgba(255,255,255,0.10)",
  background: "rgba(255,255,255,0.06)",
  color: "rgba(255,255,255,0.82)",
  fontWeight: 850,
  fontSize: 15,
  cursor: "pointer",
};

const emptyState: React.CSSProperties = {
  borderRadius: 24,
  padding: 26,
  textAlign: "center",
  background: "rgba(255,255,255,0.055)",
  border: "1px solid rgba(255,255,255,0.08)",
  color: "rgba(255,255,255,0.58)",
  fontWeight: 700,
};

const thumbBtn: React.CSSProperties = {
  width: 82,
  height: 82,
  borderRadius: 18,
  overflow: "hidden",
  border: "1px solid rgba(255,255,255,0.10)",
  background: "rgba(255,255,255,0.06)",
  padding: 0,
  cursor: "pointer",
};

const thumbFallback: React.CSSProperties = {
  height: "100%",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  color: "rgba(255,255,255,0.38)",
};

const descriptionText: React.CSSProperties = {
  marginTop: 5,
  color: "rgba(255,255,255,0.55)",
  fontSize: 13,
  fontWeight: 600,
  lineHeight: 1.3,
};

const pillStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  minHeight: 28,
  padding: "0 10px",
  borderRadius: 999,
  background: "rgba(255,255,255,0.07)",
  border: "1px solid rgba(255,255,255,0.09)",
  color: "rgba(255,255,255,0.68)",
  fontSize: 11,
  fontWeight: 850,
};

const iconBtn: React.CSSProperties = {
  width: 34,
  height: 34,
  borderRadius: 999,
  border: "1px solid rgba(255,255,255,0.10)",
  background: "rgba(255,255,255,0.06)",
  color: "rgba(255,255,255,0.82)",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  cursor: "pointer",
};

const miniRowStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "minmax(0, 1fr) 34px 34px",
  gap: 8,
  alignItems: "center",
  padding: 10,
  borderRadius: 16,
  background: "rgba(255,255,255,0.055)",
  border: "1px solid rgba(255,255,255,0.08)",
};

const previewOverlay: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  zIndex: 100,
  background: "rgba(0,0,0,0.82)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: 18,
};

const previewBox: React.CSSProperties = {
  position: "relative",
  width: "100%",
  maxWidth: 560,
  borderRadius: 26,
  overflow: "hidden",
  background: "#020617",
  border: "1px solid rgba(255,255,255,0.12)",
};

const previewCloseBtn: React.CSSProperties = {
  position: "absolute",
  top: 10,
  right: 10,
  width: 38,
  height: 38,
  borderRadius: 999,
  border: "1px solid rgba(255,255,255,0.18)",
  background: "rgba(0,0,0,0.45)",
  color: "white",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  zIndex: 2,
};