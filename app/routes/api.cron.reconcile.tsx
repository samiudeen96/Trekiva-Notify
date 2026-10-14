import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { reconcile } from "../restock/reconcile.server";
import { checkCron } from "../utils/cron-auth.server";

// Nightly safety net for missed webhooks:
//   curl -X POST -H "Authorization: Bearer $CRON_SECRET" https://<app>/api/cron/reconcile
async function handle(request: Request) {
  const denied = checkCron(request);
  if (denied) return denied;
  return Response.json(await reconcile(), { headers: { "Cache-Control": "no-store" } });
}

export const action = ({ request }: ActionFunctionArgs) => handle(request);
export const loader = ({ request }: LoaderFunctionArgs) => handle(request);
