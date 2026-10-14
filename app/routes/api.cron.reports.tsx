import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { runReports } from "../reports/reports.server";
import { checkCron } from "../utils/cron-auth.server";

// Call hourly; each shop's own schedule (daily 4 AM, weekly Tue 10 AM, monthly first Tue 10 AM in
// its time zone) decides whether a report goes out:
//   curl -X POST -H "Authorization: Bearer $CRON_SECRET" https://<app>/api/cron/reports
async function handle(request: Request) {
  const denied = checkCron(request);
  if (denied) return denied;
  return Response.json(await runReports(), { headers: { "Cache-Control": "no-store" } });
}

export const action = ({ request }: ActionFunctionArgs) => handle(request);
export const loader = ({ request }: LoaderFunctionArgs) => handle(request);
