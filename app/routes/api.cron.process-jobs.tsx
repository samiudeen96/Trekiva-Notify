import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { processJobs } from "../restock/jobs.server";
import { checkCron } from "../utils/cron-auth.server";

// Call every minute (retries after a failed send, jobs left behind by a restart):
//   curl -X POST -H "Authorization: Bearer $CRON_SECRET" https://<app>/api/cron/process-jobs
async function handle(request: Request) {
  const denied = checkCron(request);
  if (denied) return denied;
  return Response.json(await processJobs(), { headers: { "Cache-Control": "no-store" } });
}

export const action = ({ request }: ActionFunctionArgs) => handle(request);
export const loader = ({ request }: LoaderFunctionArgs) => handle(request);
