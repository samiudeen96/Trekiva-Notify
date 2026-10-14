import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { Form, useActionData, useLoaderData } from "react-router";
import db from "../db.server";

const page: React.CSSProperties = {
  fontFamily: "-apple-system, Segoe UI, Helvetica, Arial, sans-serif",
  maxWidth: 420,
  margin: "15vh auto",
  padding: 24,
  textAlign: "center",
};

function tokenOf(request: Request): string {
  return new URL(request.url).searchParams.get("token") ?? "";
}

// GET only looks the link up: mail scanners open links, so a GET must never unsubscribe anyone.
export const loader = async ({ request }: LoaderFunctionArgs) => {
  const token = tokenOf(request);
  const sub = token
    ? await db.subscription.findUnique({ where: { unsubToken: token }, select: { status: true } })
    : null;
  return { valid: Boolean(sub), already: sub?.status === "UNSUBSCRIBED" };
};

// POST: the confirm button, and the one-click unsubscribe mail clients send for List-Unsubscribe-Post.
export const action = async ({ request }: ActionFunctionArgs) => {
  const token = tokenOf(request);
  if (!token) return { done: false };
  const { count } = await db.subscription.updateMany({
    where: { unsubToken: token },
    data: { status: "UNSUBSCRIBED" },
  });
  return { done: count > 0 };
};

export default function Unsubscribe() {
  const { valid, already } = useLoaderData<typeof loader>();
  const result = useActionData<typeof action>();

  if (result?.done || already) {
    return (
      <main style={page}>
        <h1>You&apos;re unsubscribed</h1>
        <p>You won&apos;t get a back in stock email for this item.</p>
      </main>
    );
  }
  if (!valid) {
    return (
      <main style={page}>
        <h1>Link not valid</h1>
        <p>This unsubscribe link is invalid or has expired.</p>
      </main>
    );
  }
  return (
    <main style={page}>
      <h1>Unsubscribe?</h1>
      <p>You will no longer be emailed when this item is back in stock.</p>
      <Form method="post">
        <button type="submit" style={{ padding: "12px 24px", fontSize: 16, cursor: "pointer" }}>
          Unsubscribe
        </button>
      </Form>
    </main>
  );
}
