import type { LoaderFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import { getStorefrontConfig } from "../settings/storefront.server";

// Reached through the Shopify app proxy: /apps/notify/config
export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.public.appProxy(request);
  if (!session) return Response.json({ enabled: false }, { status: 401 });

  return Response.json(await getStorefrontConfig(session.shop), {
    // Short cache: settings edits show up within a minute without hammering the app on every card.
    headers: { "Cache-Control": "public, max-age=60" },
  });
};
