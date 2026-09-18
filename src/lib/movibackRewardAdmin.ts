import type { SupabaseClient } from "@supabase/supabase-js";
import type { MovibackFulfillmentType } from "@/lib/movibackContracts";

export type RewardFulfillmentInput = {
  isActive: boolean;
  fulfillmentType: MovibackFulfillmentType | null;
  storeProductId: string | null;
  requiresStoreVariant: boolean;
};

export async function validateRewardFulfillment(
  sb: SupabaseClient,
  input: RewardFulfillmentInput
): Promise<string | null> {
  if (!input.isActive && !input.fulfillmentType) return null;
  if (!input.fulfillmentType) return "Seleziona il tipo di gestione del premio";

  if (input.fulfillmentType === "service") {
    if (input.storeProductId || input.requiresStoreVariant) {
      return "Un servizio non può avere prodotto o variante Store";
    }
    return null;
  }

  if (input.fulfillmentType === "custom_physical") {
    return input.isActive
      ? "I premi fisici personalizzati richiedono il prossimo contratto amministrativo"
      : input.storeProductId || input.requiresStoreVariant
        ? "Un premio personalizzato inattivo non può usare collegamenti Store"
        : null;
  }

  if (input.fulfillmentType === "partner") {
    return input.isActive
      ? "I premi partner richiedono metadati partner non ancora disponibili"
      : input.storeProductId || input.requiresStoreVariant
        ? "Un premio partner inattivo non può usare collegamenti Store"
        : null;
  }

  if (!input.storeProductId) return "Seleziona il prodotto Store collegato";

  const [productResult, stockResult, colorResult, sizeResult] = await Promise.all([
    sb
      .from("store_products")
      .select("id,is_active")
      .eq("id", input.storeProductId)
      .maybeSingle(),
    sb
      .from("store_product_stock")
      .select("id,color_id,size_id")
      .eq("product_id", input.storeProductId)
      .eq("is_active", true),
    sb
      .from("store_product_colors")
      .select("id")
      .eq("product_id", input.storeProductId)
      .eq("is_active", true),
    sb
      .from("store_product_sizes")
      .select("id")
      .eq("product_id", input.storeProductId)
      .eq("is_active", true),
  ]);

  if (
    productResult.error ||
    stockResult.error ||
    colorResult.error ||
    sizeResult.error
  ) {
    return "Impossibile verificare la configurazione Store";
  }
  if (!productResult.data?.is_active) return "Il prodotto Store non è attivo";

  const colorIds = new Set((colorResult.data ?? []).map((row) => row.id));
  const sizeIds = new Set((sizeResult.data ?? []).map((row) => row.id));
  const activeStock = stockResult.data ?? [];
  const invalidIdentity = activeStock.some(
    (row) =>
      !colorIds.has(row.color_id) ||
      (sizeIds.size === 0 ? row.size_id !== null : !row.size_id || !sizeIds.has(row.size_id))
  );

  if (invalidIdentity) return "Le identità stock attive non sono coerenti";
  if (input.requiresStoreVariant && activeStock.length === 0) {
    return "La scelta variante richiede almeno un'identità stock attiva";
  }
  if (!input.requiresStoreVariant && activeStock.length > 1) {
    return "Più identità stock richiedono la scelta variante cliente";
  }

  return null;
}
