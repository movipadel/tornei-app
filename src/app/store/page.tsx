"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  Check,
  Loader2,
  Minus,
  Package,
  Plus,
  ShoppingBag,
  ShoppingCart,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";

import PublicNav from "@/components/PublicNav";
import UserLoginDialog from "@/components/UserLoginDialog";

type Category = { id: string; name: string; slug: string };
type Line = { id: string; name: string; slug: string };

type StoreColor = {
  id: string;
  color_name: string;
  color_hex: string | null;
  image_path: string | null;
};

type StoreSize = {
  id: string;
  size_label: string;
};

type StoreStock = {
  id: string;
  product_id: string;
  color_id: string;
  size_id: string | null;
  stock_qty: number | null;
  sku: string | null;
};

type Product = {
  id: string;
  name: string;
  description: string | null;
  category_id: string;
  line_id: string;
  base_price_euro: number;
  base_price_points: number;
  allow_euro: boolean;
  allow_points: boolean;
  allow_mixed: boolean;
  category?: Category;
  line?: Line;
  colors: StoreColor[];
  sizes: StoreSize[];
  stock: StoreStock[];
};

type CartItem = {
  key: string;
  product_id: string;
  color_id: string;
  size_id: string | null;
  product_name: string;
  color_name: string;
  size_label: string | null;
  quantity: number;
  unit_price_euro: number;
  unit_price_points: number;
  image_path: string | null;
};

const CLUBS = ["CENTALLO", "COSTIGLIOLE", "MANTA", "SALUZZO", "REVELLO"];

const pageBg = "linear-gradient(180deg, #030712 0%, #07111f 42%, #0f172a 100%)";

const glassCard: React.CSSProperties = {
  borderRadius: 26,
  background:
    "linear-gradient(135deg, rgba(255,255,255,0.075), rgba(255,255,255,0.035))",
  border: "1px solid rgba(255,255,255,0.09)",
  boxShadow: "0 18px 42px rgba(0,0,0,0.20)",
  backdropFilter: "blur(14px)",
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  minHeight: 46,
  borderRadius: 16,
  border: "1px solid rgba(255,255,255,0.10)",
  background: "rgba(255,255,255,0.07)",
  color: "#ffffff",
  padding: "0 13px",
  outline: "none",
  fontWeight: 650,
};

const labelStyle: React.CSSProperties = {
  color: "rgba(255,255,255,0.72)",
  fontSize: 13,
  fontWeight: 750,
  marginBottom: 7,
};

function imageUrl(path?: string | null) {
  if (!path) return "";
  if (path.startsWith("http")) return path;

  const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!base) return "";

  return `${base}/storage/v1/object/public/store-images/${path}`;
}

export default function StorePage() {
  const [loading, setLoading] = useState(true);
  const [checkingOut, setCheckingOut] = useState(false);
  const [loginOpen, setLoginOpen] = useState(false);

  const [categories, setCategories] = useState<Category[]>([]);
  const [lines, setLines] = useState<Line[]>([]);
  const [products, setProducts] = useState<Product[]>([]);

  const [categoryId, setCategoryId] = useState("all");
  const [lineId, setLineId] = useState("all");
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [selectedColorId, setSelectedColorId] = useState("");
  const [selectedSizeId, setSelectedSizeId] = useState<string | null>(null);
  const [qty, setQty] = useState(1);

  const [cart, setCart] = useState<CartItem[]>([]);
  const [cartOpen, setCartOpen] = useState(false);

  const [pickupClub, setPickupClub] = useState("");
  const [paymentMode, setPaymentMode] = useState<"euro" | "points" | "mixed">("euro");
  const [pointsToUse, setPointsToUse] = useState("");
  const [notes, setNotes] = useState("");

  async function loadStore() {
    try {
      setLoading(true);

      const res = await fetch("/api/store/products", { cache: "no-store" });
      const json = await res.json().catch(() => ({}));

      if (!res.ok) throw new Error(json.error || "Errore caricamento Store");

      setCategories(json.data?.categories ?? []);
      setLines(json.data?.lines ?? []);
      setProducts(json.data?.products ?? []);
    } catch (e: any) {
      toast.error(e?.message || "Errore caricamento Store");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadStore();
  }, []);

  const filteredProducts = useMemo(() => {
    return products.filter((p) => {
      if (categoryId !== "all" && p.category_id !== categoryId) return false;
      if (lineId !== "all" && p.line_id !== lineId) return false;
      return true;
    });
  }, [products, categoryId, lineId]);

  const cartTotals = useMemo(() => {
    const euro = cart.reduce((sum, item) => sum + item.unit_price_euro * item.quantity, 0);
    const points = cart.reduce((sum, item) => sum + item.unit_price_points * item.quantity, 0);

    const usedPoints =
      paymentMode === "mixed"
        ? Math.max(0, Math.min(Number(pointsToUse || 0), points))
        : paymentMode === "points"
          ? points
          : 0;

    const residualEuro =
      paymentMode === "mixed"
        ? Math.max(0, euro - usedPoints / 10)
        : paymentMode === "points"
          ? 0
          : euro;

    return {
      euro,
      points,
      usedPoints,
      residualEuro,
    };
  }, [cart, paymentMode, pointsToUse]);

  function openProduct(product: Product) {
    const firstColor = product.colors?.[0];

    setSelectedProduct(product);
    setSelectedColorId(firstColor?.id || "");
    setSelectedSizeId(product.sizes?.[0]?.id ?? null);
    setQty(1);
  }

  function currentColor(product: Product | null) {
    if (!product) return null;
    return product.colors.find((c) => c.id === selectedColorId) ?? product.colors[0] ?? null;
  }

  function currentSize(product: Product | null) {
    if (!product || !selectedSizeId) return null;
    return product.sizes.find((s) => s.id === selectedSizeId) ?? null;
  }

  function selectedStock(product: Product | null) {
    if (!product) return null;

    return (
      product.stock.find(
        (s) =>
          s.color_id === selectedColorId &&
          (selectedSizeId ? s.size_id === selectedSizeId : !s.size_id)
      ) ?? null
    );
  }

  function addToCart() {
    if (!selectedProduct) return;

    const color = currentColor(selectedProduct);
    const size = currentSize(selectedProduct);
    const stock = selectedStock(selectedProduct);

    if (!color) {
      toast.error("Seleziona un colore");
      return;
    }

    if (selectedProduct.sizes.length > 0 && !size) {
      toast.error("Seleziona una taglia");
      return;
    }

    if (stock?.stock_qty !== null && stock?.stock_qty !== undefined && qty > stock.stock_qty) {
      toast.error("Quantità non disponibile");
      return;
    }

    const key = `${selectedProduct.id}:${color.id}:${size?.id || "no-size"}`;

    setCart((prev) => {
      const existing = prev.find((item) => item.key === key);

      if (existing) {
        return prev.map((item) =>
          item.key === key ? { ...item, quantity: item.quantity + qty } : item
        );
      }

      return [
        ...prev,
        {
          key,
          product_id: selectedProduct.id,
          color_id: color.id,
          size_id: size?.id ?? null,
          product_name: selectedProduct.name,
          color_name: color.color_name,
          size_label: size?.size_label ?? null,
          quantity: qty,
          unit_price_euro: Number(selectedProduct.base_price_euro || 0),
          unit_price_points: Number(selectedProduct.base_price_points || 0),
          image_path: color.image_path,
        },
      ];
    });

    toast.success("Prodotto aggiunto al carrello");
    setSelectedProduct(null);
    setCartOpen(true);
  }

  async function checkout() {
    if (cart.length === 0) {
      toast.error("Il carrello è vuoto");
      return;
    }

    if (!pickupClub) {
      toast.error("Seleziona il club di ritiro");
      return;
    }

    try {
      setCheckingOut(true);

      const res = await fetch("/api/store/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pickup_club: pickupClub,
          payment_mode: paymentMode,
          points_to_use: paymentMode === "mixed" ? Number(pointsToUse || 0) : undefined,
          notes,
          items: cart.map((item) => ({
            product_id: item.product_id,
            color_id: item.color_id,
            size_id: item.size_id,
            quantity: item.quantity,
          })),
        }),
      });

      const json = await res.json().catch(() => ({}));

      if (res.status === 401) {
        setLoginOpen(true);
        return;
      }

      if (!res.ok) throw new Error(json.error || "Errore invio ordine");

      toast.success("Ordine inviato alla segreteria");
      setCart([]);
      setCartOpen(false);
      setNotes("");
      setPointsToUse("");
    } catch (e: any) {
      toast.error(e?.message || "Errore ordine");
    } finally {
      setCheckingOut(false);
    }
  }

  return (
    <div style={{ minHeight: "100dvh", background: pageBg }}>
      <PublicNav />

      <FloatingCartButton
  count={cart.reduce((s, i) => s + i.quantity, 0)}
  total={cartTotals.euro}
  onClick={() => setCartOpen(true)}
/>

      <div className="base44-home-container" style={{ paddingTop: 6, paddingBottom: 100 }}>
        {loading ? (
          <div
            style={{
              minHeight: "70dvh",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Loader2 className="w-8 h-8 animate-spin" style={{ color: "#2dd4bf" }} />
          </div>
        ) : (
          <>
            <section
              style={{
                position: "relative",
                marginBottom: 18,
                padding: "24px 20px 22px",
                borderRadius: 28,
                overflow: "hidden",
                color: "white",
                background:
                  "linear-gradient(135deg, rgba(245,158,11,0.24), rgba(255,255,255,0.045))",
                border: "1px solid rgba(255,255,255,0.10)",
                boxShadow: "0 18px 42px rgba(0,0,0,0.22)",
                backdropFilter: "blur(14px)",
              }}
            >
              <div
                aria-hidden
                style={{
                  position: "absolute",
                  inset: "-90px -60px auto -60px",
                  height: 290,
                  background:
                    "radial-gradient(circle at 15% 0%, rgba(251,191,36,0.30), transparent 34%), radial-gradient(circle at 88% 18%, rgba(249,115,22,0.26), transparent 38%)",
                  pointerEvents: "none",
                }}
              />

              <div style={{ position: "relative", zIndex: 1 }}>
                <div
                  style={{
                    width: 54,
                    height: 34,
                    backgroundImage: "url('/home/movi-logo.png')",
                    backgroundSize: "contain",
                    backgroundRepeat: "no-repeat",
                    backgroundPosition: "left center",
                    opacity: 0.92,
                  }}
                />

                <div
                  style={{
                    marginTop: 16,
                    fontSize: 11,
                    fontWeight: 750,
                    color: "rgba(255,255,255,0.56)",
                    letterSpacing: "0.14em",
                    textTransform: "uppercase",
                  }}
                >
                  MOVI LINE by BEEBEK
                </div>

                <div
                  style={{
                    marginTop: 8,
                    fontSize: "clamp(31px, 7vw, 42px)",
                    fontWeight: 850,
                    lineHeight: 1,
                    letterSpacing: -1.15,
                    color: "#ffffff",
                  }}
                >
                  Store MOVI
                </div>

                <div
                  style={{
                    marginTop: 10,
                    color: "rgba(255,255,255,0.66)",
                    fontWeight: 560,
                    fontSize: 14,
                    lineHeight: 1.35,
                    maxWidth: 520,
                  }}
                >
                  Wear MOVI, Play smarter. Ordina la linea riservata agli associati:
                  pagamento in segreteria e ritiro presso il club.
                </div>

                
              </div>
            </section>

            <section style={{ marginBottom: 18 }}>
  {/* LINEA */}
  <div style={{ ...premiumSectionHeader, marginBottom: 10 }}>
    Linea
  </div>

  <select
    value={lineId}
    onChange={(e) => setLineId(e.target.value)}
    style={{
      ...inputStyle,
      marginBottom: 16,
    }}
  >
    <option value="all" style={{ color: "#0f172a" }}>
      Tutte le linee
    </option>
    {lines.map((l) => (
      <option key={l.id} value={l.id} style={{ color: "#0f172a" }}>
        {l.name}
      </option>
    ))}
  </select>

  {/* CATEGORIA */}
  <div style={{ ...premiumSectionHeader, marginBottom: 10 }}>
    Categoria
  </div>

  <div style={categoryGrid} className="store-category-grid">
    {[
      { id: "all", label: "Tutto" },
      ...categories.map((c) => ({ id: c.id, label: c.name })),
    ].map((c) => {
      const active = categoryId === c.id;

      return (
        <button
          key={c.id}
          onClick={() => setCategoryId(c.id)}
          style={{
            ...categoryPill,
            background: active
              ? "linear-gradient(135deg,#f59e0b,#fbbf24)"
              : "rgba(255,255,255,0.055)",
            color: active ? "#111827" : "rgba(255,255,255,0.72)",
            border: active
              ? "1px solid rgba(251,191,36,0.72)"
              : "1px solid rgba(255,255,255,0.10)",
            boxShadow: active
              ? "0 10px 24px rgba(245,158,11,0.24)"
              : "none",
          }}
        >
          {c.label}
        </button>
      );
    })}
  </div>
</section>

            <section
  style={{
    display: "grid",
    gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
    gap: 14,
  }}
>
  {filteredProducts.map((product) => {
    const firstColor = product.colors?.[0];
    const img = imageUrl(firstColor?.image_path);

    return (
      <button
        key={product.id}
        type="button"
        onClick={() => openProduct(product)}
        style={{
          border: 0,
          background: "transparent",
          color: "white",
          textAlign: "left",
          padding: 0,
          cursor: "pointer",
          minWidth: 0,
        }}
      >
        <div
          style={{
            width: "100%",
            aspectRatio: "1 / 1.18",
            borderRadius: 24,
            overflow: "hidden",
            background:
  "radial-gradient(circle at 30% 20%, rgba(255,255,255,0.75), transparent 30%), linear-gradient(145deg, #f1f5f9 0%, #cbd5e1 35%, #94a3b8 60%, #334155 100%)",
border: "1px solid rgba(255,255,255,0.28)",
boxShadow:
  "inset 0 2px 6px rgba(255,255,255,0.35), inset 0 -30px 60px rgba(15,23,42,0.35)",
  filter: "brightness(1.05)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          {img ? (
            <img
              src={img}
              alt={product.name}
              style={{
                width: "100%",
                height: "100%",
                objectFit: "contain",
                display: "block",
                padding: 12,
              }}
            />
          ) : (
            <Package className="w-8 h-8" style={{ color: "#fbbf24" }} />
          )}
        </div>

        <div style={{ marginTop: 10 }}>
          <div
            style={{
              fontSize: 15,
              fontWeight: 950,
              lineHeight: 1.12,
              letterSpacing: -0.25,
              color: "#ffffff",
            }}
          >
            {product.name}
          </div>

          <div
            style={{
              marginTop: 4,
              color: "rgba(255,255,255,0.46)",
              fontSize: 11,
              fontWeight: 850,
              textTransform: "uppercase",
              letterSpacing: "0.04em",
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            {product.category?.name} · {product.line?.name}
          </div>

          <div
            style={{
              marginTop: 8,
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 8,
            }}
          >
            <div>
              <div style={{ color: "#fbbf24", fontWeight: 950, fontSize: 15 }}>
                €{Number(product.base_price_euro).toFixed(2)}
              </div>
              <div
                style={{
                  marginTop: 2,
                  color: "rgba(255,255,255,0.42)",
                  fontSize: 11,
                  fontWeight: 800,
                }}
              >
                {product.base_price_points} pt
              </div>
            </div>

            <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
              {product.colors.slice(0, 3).map((c) => (
                <span
                  key={c.id}
                  title={c.color_name}
                  style={{
                    width: 13,
                    height: 13,
                    borderRadius: 999,
                    background: c.color_hex || "rgba(255,255,255,0.25)",
                    border: "1px solid rgba(255,255,255,0.34)",
                  }}
                />
              ))}

              {product.colors.length > 3 ? (
                <span
                  style={{
                    color: "rgba(255,255,255,0.48)",
                    fontSize: 10,
                    fontWeight: 900,
                  }}
                >
                  +{product.colors.length - 3}
                </span>
              ) : null}
            </div>
          </div>
        </div>
      </button>
    );
  })}

  {filteredProducts.length === 0 ? (
    <div
      style={{
        gridColumn: "1 / -1",
        ...glassCard,
        padding: 18,
        color: "white",
      }}
    >
      <Sparkles className="w-6 h-6" style={{ color: "#fbbf24" }} />
      <div style={{ marginTop: 10, fontSize: 19, fontWeight: 850 }}>
        Nessun prodotto disponibile
      </div>
      <div
        style={{
          marginTop: 7,
          color: "rgba(255,255,255,0.60)",
          fontSize: 14,
          fontWeight: 560,
        }}
      >
        Prova a cambiare categoria o linea.
      </div>
    </div>
  ) : null}
</section>
          </>
        )}
      </div>

      {selectedProduct ? (
        <ProductModal
          product={selectedProduct}
          color={currentColor(selectedProduct)}
          size={currentSize(selectedProduct)}
          selectedColorId={selectedColorId}
          selectedSizeId={selectedSizeId}
          qty={qty}
          stock={selectedStock(selectedProduct)}
          onClose={() => setSelectedProduct(null)}
          onColor={setSelectedColorId}
          onSize={setSelectedSizeId}
          onQty={setQty}
          onAdd={addToCart}
        />
      ) : null}

      {cartOpen ? (
        <CartDrawer
          cart={cart}
          setCart={setCart}
          pickupClub={pickupClub}
          setPickupClub={setPickupClub}
          paymentMode={paymentMode}
          setPaymentMode={setPaymentMode}
          pointsToUse={pointsToUse}
          setPointsToUse={setPointsToUse}
          notes={notes}
          setNotes={setNotes}
          totals={cartTotals}
          checkingOut={checkingOut}
          onClose={() => setCartOpen(false)}
          onCheckout={checkout}
        />
      ) : null}

      <UserLoginDialog
        open={loginOpen}
        onClose={() => setLoginOpen(false)}
        onSaved={async () => {
          setLoginOpen(false);
          toast.success("Dati salvati");
        }}
      />
      <style jsx global>{`
  @media (max-width: 390px) {
    .store-category-grid {
      grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
    }
  }
`}</style>
    </div>
  );
}

function FloatingCartButton({
  count,
  total,
  onClick,
}: {
  count: number;
  total: number;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Apri carrello"
      style={{
        position: "fixed",
        top: 86,
        right: 14,
        zIndex: 70,
        width: 52,
        height: 52,
        borderRadius: 999,
        border: "1px solid rgba(255,255,255,0.12)",
        background:
          count > 0
            ? "linear-gradient(135deg,#f59e0b,#fbbf24)"
            : "rgba(15,23,42,0.78)",
        color: count > 0 ? "#111827" : "#ffffff",
        boxShadow:
          count > 0
            ? "0 18px 42px rgba(245,158,11,0.32)"
            : "0 18px 42px rgba(0,0,0,0.30)",
        backdropFilter: "blur(14px)",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        cursor: "pointer",
      }}
    >
      <ShoppingCart className="w-5 h-5" />

      {count > 0 ? (
        <span
          style={{
            position: "absolute",
            top: -5,
            right: -5,
            minWidth: 22,
            height: 22,
            borderRadius: 999,
            background: "#ef4444",
            color: "#ffffff",
            border: "2px solid #020617",
            fontSize: 12,
            fontWeight: 950,
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "0 6px",
          }}
        >
          {count}
        </span>
      ) : null}
    </button>
  );
}

function PillRow({ children }: any) {
  return (
    <div
      style={{
        display: "flex",
        gap: 8,
        overflowX: "auto",
        paddingBottom: 2,
      }}
    >
      {children}
    </div>
  );
}

function FilterPill({ active, onClick, children }: any) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        flexShrink: 0,
        minHeight: 38,
        padding: "0 14px",
        borderRadius: 999,
        border: active ? "1px solid rgba(251,191,36,0.75)" : "1px solid rgba(255,255,255,0.10)",
        background: active ? "rgba(251,191,36,0.17)" : "rgba(255,255,255,0.055)",
        color: active ? "#fbbf24" : "rgba(255,255,255,0.72)",
        fontWeight: 900,
        fontSize: 13,
      }}
    >
      {children}
    </button>
  );
}

function ProductModal({
  product,
  color,
  size,
  selectedColorId,
  selectedSizeId,
  qty,
  stock,
  onClose,
  onColor,
  onSize,
  onQty,
  onAdd,
}: any) {
  const img = imageUrl(color?.image_path);
  const availableQty = stock?.stock_qty;

  return (
    <div style={modalOverlay} onClick={onClose}>
      <div style={modalCard} onClick={(e) => e.stopPropagation()}>
        <button type="button" onClick={onClose} style={closeButton}>
          <X className="w-5 h-5" />
        </button>

        {img ? (
  <div
    style={{
      width: "100%",
      aspectRatio: "1 / 1",
      maxHeight: 360,
      borderRadius: 22,
      overflow: "hidden",
      background:
  "radial-gradient(circle at 30% 20%, rgba(255,255,255,0.75), transparent 30%), linear-gradient(145deg, #f1f5f9 0%, #cbd5e1 35%, #94a3b8 60%, #334155 100%)",
border: "1px solid rgba(255,255,255,0.28)",
boxShadow:
  "inset 0 2px 6px rgba(255,255,255,0.35), inset 0 -30px 60px rgba(15,23,42,0.35)",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
    }}
  >
    <img
      src={img}
      alt={product.name}
      style={{
        width: "100%",
        height: "100%",
        padding: 16,
        objectFit: "contain",
        display: "block",
      }}
    />
  </div>
) : null}

        <div style={{ marginTop: 16, fontSize: 23, fontWeight: 900 }}>{product.name}</div>
        <div style={{ marginTop: 7, color: "rgba(255,255,255,0.58)", fontSize: 14 }}>
          {product.description || "Seleziona colore, taglia e quantità."}
        </div>

        <div style={{ marginTop: 18 }}>
  <div style={premiumSectionHeader}>
    <span>Colore</span>
    <strong>{color?.color_name ?? "Seleziona"}</strong>
  </div>

  <div style={colorSwatchGrid}>
    {product.colors.map((c: StoreColor) => {
      const active = selectedColorId === c.id;

      return (
        <button
          key={c.id}
          type="button"
          onClick={() => onColor(c.id)}
          title={c.color_name}
          aria-label={c.color_name}
          style={{
            ...colorSwatchButton,
            border: active
              ? "2px solid rgba(251,191,36,0.95)"
              : "1px solid rgba(255,255,255,0.14)",
            boxShadow: active
              ? "0 0 0 5px rgba(251,191,36,0.13), 0 14px 34px rgba(0,0,0,0.30)"
              : "0 10px 24px rgba(0,0,0,0.18)",
            transform: active ? "scale(1.06)" : "scale(1)",
          }}
        >
          <span
            style={{
              width: 34,
              height: 34,
              borderRadius: 999,
              background: c.color_hex || "rgba(255,255,255,0.25)",
              border: "2px solid rgba(255,255,255,0.35)",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            {active ? (
              <Check
                className="w-4 h-4"
                style={{
                  color:
                    String(c.color_hex ?? "").toLowerCase() === "#ffffff" ||
                    String(c.color_hex ?? "").toLowerCase() === "#fff"
                      ? "#111827"
                      : "#ffffff",
                  filter: "drop-shadow(0 1px 2px rgba(0,0,0,0.55))",
                }}
              />
            ) : null}
          </span>
        </button>
      );
    })}
  </div>
</div>

        {product.sizes.length > 0 ? (
  <div style={{ marginTop: 18 }}>
    <div style={premiumSectionHeader}>
      <span>Taglia</span>
      <strong>{size?.size_label ?? "Seleziona"}</strong>
    </div>

    <div style={sizeGrid}>
      {product.sizes.map((s: StoreSize) => {
        const active = selectedSizeId === s.id;

        return (
          <button
            key={s.id}
            type="button"
            onClick={() => onSize(s.id)}
            style={{
              ...sizeButton,
              border: active
                ? "1px solid rgba(45,212,191,0.95)"
                : "1px solid rgba(255,255,255,0.10)",
              background: active
                ? "linear-gradient(135deg, rgba(20,184,166,0.28), rgba(45,212,191,0.13))"
                : "rgba(255,255,255,0.055)",
              boxShadow: active
                ? "0 0 0 4px rgba(45,212,191,0.10), 0 14px 30px rgba(0,0,0,0.22)"
                : "none",
              color: active ? "#ffffff" : "rgba(255,255,255,0.82)",
            }}
          >
            {s.size_label}
          </button>
        );
      })}
    </div>
  </div>
) : null}

        <div style={{ marginTop: 15 }}>
          <div style={labelStyle}>Quantità</div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <button type="button" onClick={() => onQty(Math.max(1, qty - 1))} style={qtyButton}>
              <Minus className="w-4 h-4" />
            </button>
            <div style={{ fontSize: 22, fontWeight: 900, minWidth: 34, textAlign: "center" }}>
              {qty}
            </div>
            <button type="button" onClick={() => onQty(qty + 1)} style={qtyButton}>
              <Plus className="w-4 h-4" />
            </button>
          </div>

          <div style={{ marginTop: 8, color: "rgba(255,255,255,0.55)", fontSize: 12 }}>
            {availableQty === null || availableQty === undefined
              ? "Disponibilità da confermare in segreteria"
              : `${availableQty} disponibili`}
          </div>
        </div>

        <button type="button" onClick={onAdd} style={mainButton}>
          <ShoppingBag className="w-5 h-5" />
          Aggiungi · €{(Number(product.base_price_euro) * qty).toFixed(2)}
        </button>
      </div>
    </div>
  );
}

function CartDrawer({
  cart,
  setCart,
  pickupClub,
  setPickupClub,
  paymentMode,
  setPaymentMode,
  pointsToUse,
  setPointsToUse,
  notes,
  setNotes,
  totals,
  checkingOut,
  onClose,
  onCheckout,
}: any) {
  return (
    <div style={modalOverlay} onClick={onClose}>
      <div style={modalCard} onClick={(e) => e.stopPropagation()}>
        <button type="button" onClick={onClose} style={closeButton}>
          <X className="w-5 h-5" />
        </button>

        <div style={{ fontSize: 23, fontWeight: 900 }}>Carrello</div>
        <div style={{ marginTop: 6, color: "rgba(255,255,255,0.58)", fontSize: 14 }}>
          Pagamento in segreteria e ritiro al club.
        </div>

        <div style={{ display: "grid", gap: 10, marginTop: 16 }}>
          {cart.map((item: CartItem) => (
            <div key={item.key} style={cartRow}>
              {imageUrl(item.image_path) ? (
                <img
                  src={imageUrl(item.image_path)}
                  alt={item.product_name}
                  style={{ width: 58, height: 58, objectFit: "cover", borderRadius: 15 }}
                />
              ) : null}

              <div style={{ minWidth: 0 }}>
                <div style={{ fontWeight: 900 }}>{item.product_name}</div>
                <div style={{ color: "rgba(255,255,255,0.55)", fontSize: 12, marginTop: 3 }}>
                  {item.color_name}
                  {item.size_label ? ` / ${item.size_label}` : ""} · x{item.quantity}
                </div>
              </div>

              <button
                type="button"
                onClick={() => setCart((prev: CartItem[]) => prev.filter((x) => x.key !== item.key))}
                style={trashButton}
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>

        <div style={{ marginTop: 16 }}>
          <div style={labelStyle}>Club di ritiro</div>
          <select value={pickupClub} onChange={(e) => setPickupClub(e.target.value)} style={inputStyle}>
            <option value="" style={{ color: "#0f172a", background: "#fff" }}>
              Seleziona club
            </option>
            {CLUBS.map((club) => (
              <option key={club} value={club} style={{ color: "#0f172a", background: "#fff" }}>
                {club}
              </option>
            ))}
          </select>
        </div>

        <div style={{ marginTop: 13 }}>
          <div style={labelStyle}>Pagamento</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
            {[
              ["euro", "Euro"],
              ["points", "Punti"],
              ["mixed", "Misto"],
            ].map(([mode, label]) => (
              <button
                key={mode}
                type="button"
                onClick={() => setPaymentMode(mode)}
                style={{
                  minHeight: 44,
                  borderRadius: 16,
                  border:
                    paymentMode === mode
                      ? "1px solid rgba(251,191,36,0.78)"
                      : "1px solid rgba(255,255,255,0.10)",
                  background:
                    paymentMode === mode ? "rgba(251,191,36,0.16)" : "rgba(255,255,255,0.055)",
                  color: "white",
                  fontWeight: 900,
                }}
              >
                {paymentMode === mode ? <Check className="w-4 h-4 inline-block" /> : null} {label}
              </button>
            ))}
          </div>
        </div>

        {paymentMode === "mixed" ? (
          <div style={{ marginTop: 13 }}>
            <div style={labelStyle}>Punti da usare</div>
            <input
              type="number"
              value={pointsToUse}
              onChange={(e) => setPointsToUse(e.target.value)}
              placeholder="Es. 150"
              style={inputStyle}
            />
          </div>
        ) : null}

        <div style={{ marginTop: 13 }}>
          <div style={labelStyle}>Note ordine</div>
          <input
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Eventuali note per la segreteria"
            style={inputStyle}
          />
        </div>

        <div style={{ ...glassCard, padding: 14, marginTop: 16, borderRadius: 20 }}>
          <Summary label="Totale prodotti" value={`€${totals.euro.toFixed(2)} / ${totals.points} pt`} />
          {paymentMode === "mixed" ? (
            <>
              <Summary label="Punti usati" value={`${totals.usedPoints} pt`} />
              <Summary label="Da pagare in segreteria" value={`€${totals.residualEuro.toFixed(2)}`} />
            </>
          ) : paymentMode === "points" ? (
            <Summary label="Pagamento" value={`${totals.points} punti`} />
          ) : (
            <Summary label="Pagamento" value={`€${totals.euro.toFixed(2)}`} />
          )}
        </div>

        <button type="button" onClick={onCheckout} disabled={checkingOut} style={mainButton}>
          {checkingOut ? <Loader2 className="w-5 h-5 animate-spin" /> : <ShoppingBag className="w-5 h-5" />}
          Conferma ordine
        </button>
      </div>
    </div>
  );
}

function Summary({ label, value }: any) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 12, marginBottom: 8 }}>
      <span style={{ color: "rgba(255,255,255,0.58)", fontWeight: 650 }}>{label}</span>
      <span style={{ color: "white", fontWeight: 950 }}>{value}</span>
    </div>
  );
}

const modalOverlay: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  zIndex: 90,
  background: "rgba(3,7,18,0.72)",
  backdropFilter: "blur(10px)",
  display: "flex",
  alignItems: "flex-end",
  justifyContent: "center",
  padding: 14,
};

const modalCard: React.CSSProperties = {
  width: "100%",
  maxWidth: 560,
  maxHeight: "92dvh",
  overflow: "auto",
  borderRadius: 28,
  background: "linear-gradient(180deg, rgba(15,23,42,0.98), rgba(3,7,18,0.98))",
  border: "1px solid rgba(255,255,255,0.10)",
  boxShadow: "0 26px 70px rgba(0,0,0,0.45)",
  padding: 18,
  color: "white",
  position: "relative",
};

const closeButton: React.CSSProperties = {
  position: "absolute",
  right: 14,
  top: 14,
  zIndex: 3,
  width: 40,
  height: 40,
  borderRadius: 999,
  border: "1px solid rgba(255,255,255,0.12)",
  background: "rgba(3,7,18,0.58)",
  color: "white",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
};

const qtyButton: React.CSSProperties = {
  width: 42,
  height: 42,
  borderRadius: 15,
  border: "1px solid rgba(255,255,255,0.10)",
  background: "rgba(255,255,255,0.07)",
  color: "white",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
};

const premiumSectionHeader: React.CSSProperties = {
  display: "flex",
  alignItems: "baseline",
  justifyContent: "space-between",
  gap: 12,
  marginBottom: 10,
  color: "rgba(255,255,255,0.72)",
  fontSize: 13,
  fontWeight: 800,
};

const colorSwatchGrid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(5, minmax(0, 1fr))",
  gap: 11,
};

const colorSwatchButton: React.CSSProperties = {
  height: 58,
  borderRadius: 999,
  background:
    "linear-gradient(180deg, rgba(255,255,255,0.09), rgba(255,255,255,0.045))",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  transition: "transform 150ms ease, box-shadow 150ms ease, border 150ms ease",
};

const sizeGrid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
  gap: 10,
};

const sizeButton: React.CSSProperties = {
  minHeight: 48,
  borderRadius: 17,
  fontSize: 15,
  fontWeight: 950,
  letterSpacing: 0.2,
  transition: "background 150ms ease, box-shadow 150ms ease, border 150ms ease",
};

const mainButton: React.CSSProperties = {
  marginTop: 18,
  width: "100%",
  minHeight: 52,
  borderRadius: 18,
  border: 0,
  background: "linear-gradient(135deg,#f59e0b,#fbbf24)",
  color: "#111827",
  fontWeight: 950,
  fontSize: 15,
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 9,
};

const cartRow: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "58px 1fr 40px",
  gap: 11,
  alignItems: "center",
  padding: 12,
  borderRadius: 20,
  background: "rgba(255,255,255,0.055)",
  border: "1px solid rgba(255,255,255,0.08)",
};

const trashButton: React.CSSProperties = {
  width: 38,
  height: 38,
  borderRadius: 14,
  border: "1px solid rgba(248,113,113,0.22)",
  background: "rgba(248,113,113,0.12)",
  color: "#fca5a5",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
};

const segmentedWrapper: React.CSSProperties = {
  display: "flex",
  borderRadius: 999,
  padding: 4,
  background: "rgba(255,255,255,0.06)",
  border: "1px solid rgba(255,255,255,0.08)",
};

const segmentedButton: React.CSSProperties = {
  flex: 1,
  height: 40,
  borderRadius: 999,
  border: "none",
  fontWeight: 900,
  fontSize: 13,
  transition: "all 150ms ease",
};

const categoryGrid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
  gap: 8,
};

const categoryPill: React.CSSProperties = {
  minHeight: 42,
  borderRadius: 999,
  padding: "0 10px",
  fontSize: 12,
  fontWeight: 950,
  letterSpacing: "0.02em",
  textTransform: "uppercase",
  whiteSpace: "nowrap",
  overflow: "hidden",
  textOverflow: "ellipsis",
};