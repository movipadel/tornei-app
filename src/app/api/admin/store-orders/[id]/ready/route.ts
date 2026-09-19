import { runStoreFulfillmentCommand } from "@/lib/storeFulfillmentContracts";

export const runtime = "nodejs";
type Params = { params: Promise<{ id: string }> };

export async function POST(req: Request, { params }: Params) {
  const { id } = await params;
  return runStoreFulfillmentCommand(req, id, "ready");
}
