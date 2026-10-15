import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { runReports } from "../reports/reports.server";
import { checkCron } from "../utils/cron-auth.server";

// Call hourly; each shop's own schedule (frequency, weekday or day of month, and hour, set in Settings, in
// its own time zone) decides whether a report goes out:
//   curl -X POST -H "Authorization: Bearer $CRON_SECRET" https://<app>/api/cron/reports
async function handle(request: Request) {
  const denied = checkCron(request);
  if (denied) return denied;
  return Response.json(await runReports(), { headers: { "Cache-Control": "no-store" } });
}

export const action = ({ request }: ActionFunctionArgs) => handle(request);
export const loader = ({ request }: LoaderFunctionArgs) => handle(request);
