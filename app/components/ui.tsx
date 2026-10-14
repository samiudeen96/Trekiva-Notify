import type { CSSProperties, ReactNode } from "react";

export type Tone = "neutral" | "success" | "info" | "warning" | "critical";

/** Shopify-like accent colours: a strong one for lines and icons, a soft one for backgrounds. */
const ACCENT: Record<Tone, { strong: string; soft: string }> = {
  neutral: { strong: "#8c9196", soft: "#f1f1f1" },
  success: { strong: "#008060", soft: "#e3f5ec" },
  info: { strong: "#2c6ecb", soft: "#e5f0ff" },
  warning: { strong: "#b98900", soft: "#fff3d6" },
  critical: { strong: "#d72c0d", soft: "#fde8e4" },
};

const AVATAR_TONES: Tone[] = ["info", "success", "warning", "critical"];

/** A big, easy-to-scan number. */
export function BigNumber({ children }: { children: ReactNode }) {
  return <div style={{ fontSize: 28, fontWeight: 650, lineHeight: 1.15, letterSpacing: "-0.02em" }}>{children}</div>;
}

/** An icon inside a soft coloured circle. */
export function IconBadge(props: { icon: "cart" | "chat" | "email" | "notification" | "check"; tone?: Tone }) {
  const c = ACCENT[props.tone ?? "neutral"];
  return (
    <div
      style={{
        width: 40,
        height: 40,
        borderRadius: 20,
        background: c.soft,
        color: c.strong,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        flex: "none",
      }}
    >
      <s-icon type={props.icon} />
    </div>
  );
}

/** Initial letter on a soft coloured circle; the colour is stable per name. */
export function Avatar({ name }: { name: string }) {
  const sum = [...name].reduce((n, ch) => n + ch.charCodeAt(0), 0);
  const c = ACCENT[AVATAR_TONES[sum % AVATAR_TONES.length]!];
  return (
    <div
      aria-hidden="true"
      style={{
        width: 32,
        height: 32,
        borderRadius: 16,
        background: c.soft,
        color: c.strong,
        fontWeight: 650,
        fontSize: 13,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        flex: "none",
        textTransform: "uppercase",
      }}
    >
      {name.trim().charAt(0) || "?"}
    </div>
  );
}

/** One number with a label, for the overview rows. The coloured bar on the left tells the tiles apart. */
export function StatTile(props: { label: string; value: string | number; hint?: string; href?: string; tone?: Tone }) {
  const accent = ACCENT[props.tone ?? "neutral"].strong;
  const body = (
    <s-box padding="base" border="base" borderRadius="base" background="base">
      <div style={{ display: "flex", gap: 12 }}>
        <div style={{ width: 4, borderRadius: 4, background: accent, flex: "none" }} />
        <div style={{ display: "flex", flexDirection: "column", gap: 4, minWidth: 0 }}>
          <s-text color="subdued">{props.label}</s-text>
          <BigNumber>{props.value}</BigNumber>
          {props.hint && <s-text color="subdued">{props.hint}</s-text>}
        </div>
      </div>
    </s-box>
  );
  return props.href ? <s-clickable href={props.href} borderRadius="base">{body}</s-clickable> : body;
}

/** Tiles in a row that wraps to two columns on narrow screens. */
export function StatGrid(props: { children: ReactNode; columns?: 3 | 4 }) {
  const wide = props.columns === 3 ? "1fr 1fr 1fr" : "1fr 1fr 1fr 1fr";
  return (
    <s-grid gridTemplateColumns={`@container (inline-size <= 560px) 1fr 1fr, ${wide}`} gap="base">
      {props.children}
    </s-grid>
  );
}

/** A card that opens the editor on one tab, with a one-line summary of what is currently set. */
export function ActionCard(props: {
  icon: "cart" | "chat" | "email";
  tone?: Tone;
  title: string;
  summary: string;
  href: string;
  cta?: string;
}) {
  return (
    <s-box padding="base" border="base" borderRadius="base" background="base">
      <div style={{ display: "flex", flexDirection: "column", gap: 14, height: "100%" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <IconBadge icon={props.icon} tone={props.tone} />
          <s-heading>{props.title}</s-heading>
        </div>
        <div style={{ flex: 1 }}>
          <s-text color="subdued">{props.summary}</s-text>
        </div>
        <div>
          <s-button href={props.href}>{props.cta ?? "Customize"}</s-button>
        </div>
      </div>
    </s-box>
  );
}

/** Title and explanation on the left, the controls on the right: one row per settings topic. */
export function SettingsRow(props: { title: string; description?: string; children: ReactNode }) {
  return (
    <s-box paddingBlock="base">
      <s-grid gridTemplateColumns="@container (inline-size <= 640px) 1fr, 1fr 2fr" gap="large">
        <s-stack gap="small-200">
          <s-heading>{props.title}</s-heading>
          {props.description && <s-text color="subdued">{props.description}</s-text>}
        </s-stack>
        <s-stack gap="base">{props.children}</s-stack>
      </s-grid>
    </s-box>
  );
}

export function EmptyState(props: { title: string; description: string; actionLabel?: string; actionHref?: string }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10, padding: "28px 16px", textAlign: "center" }}>
      <IconBadge icon="notification" tone="info" />
      <s-heading>{props.title}</s-heading>
      <div style={{ maxWidth: 420 }}>
        <s-text color="subdued">{props.description}</s-text>
      </div>
      {props.actionHref && <s-button href={props.actionHref}>{props.actionLabel ?? "Open"}</s-button>}
    </div>
  );
}

/** A progress bar: `value` of `max` done. */
export function ProgressBar({ value, max }: { value: number; max: number }) {
  const pct = Math.max(0, Math.min(100, (value / max) * 100));
  const track: CSSProperties = { height: 8, borderRadius: 4, background: "#e3e3e3", overflow: "hidden" };
  return (
    <div role="progressbar" aria-valuenow={value} aria-valuemin={0} aria-valuemax={max} style={track}>
      <div style={{ width: `${pct}%`, height: "100%", background: ACCENT.success.strong, borderRadius: 4, transition: "width .3s" }} />
    </div>
  );
}

/** One row of a checklist: number or tick, title, explanation, and the action on the right. */
export function Step(props: { n: number; done: boolean; title: string; description?: string; children?: ReactNode }) {
  const c = ACCENT.success.strong;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 14, padding: "12px 0", borderTop: "1px solid #f1f1f1" }}>
      <div
        aria-hidden="true"
        style={{
          width: 28,
          height: 28,
          borderRadius: 14,
          flex: "none",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 13,
          fontWeight: 650,
          background: props.done ? c : "transparent",
          color: props.done ? "#fff" : "#6d7175",
          border: props.done ? `2px solid ${c}` : "2px solid #c9cccf",
        }}
      >
        {props.done ? "✓" : props.n}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 600, opacity: props.done ? 0.6 : 1 }}>{props.title}</div>
        {props.description && <s-text color="subdued">{props.description}</s-text>}
      </div>
      {!props.done && <div style={{ display: "flex", gap: 8, alignItems: "center", flex: "none" }}>{props.children}</div>}
    </div>
  );
}

export type SubStatus = "PENDING" | "NOTIFIED" | "UNSUBSCRIBED" | "FAILED";

export const STATUS_LABEL: Record<SubStatus, string> = {
  PENDING: "Pending",
  NOTIFIED: "Notified",
  UNSUBSCRIBED: "Unsubscribed",
  FAILED: "Failed",
};

export function StatusBadge({ status }: { status: SubStatus }) {
  const tone = { PENDING: "info", NOTIFIED: "success", UNSUBSCRIBED: "neutral", FAILED: "critical" } as const;
  return <s-badge tone={tone[status]}>{STATUS_LABEL[status]}</s-badge>;
}
