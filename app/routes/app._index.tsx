import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { useLoaderData } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import db from "../db.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const [pending, notified] = await Promise.all([
    db.subscription.count({ where: { shopDomain: session.shop, status: "PENDING" } }),
    db.subscription.count({ where: { shopDomain: session.shop, status: "NOTIFIED" } }),
  ]);
  return { pending, notified };
};

export default function Home() {
  const { pending, notified } = useLoaderData<typeof loader>();
  return (
    <s-page heading="Trekiva Notify">
      <s-section heading="Back in stock alerts">
        <s-paragraph>Pending requests: {pending}</s-paragraph>
        <s-paragraph>Notified requests: {notified}</s-paragraph>
      </s-section>
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => boundary.headers(headersArgs);
