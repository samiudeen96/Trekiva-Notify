import { useState } from "react";
import { SAMPLE } from "../email/sample";
import { renderRestockEmail } from "../email/template";
import type { EditorValues } from "../settings/schema";

const card: React.CSSProperties = {
  background: "#fff",
  borderRadius: 12,
  boxShadow: "0 4px 24px rgba(0,0,0,.12)",
  padding: 20,
  width: "100%",
  maxWidth: 360,
  boxSizing: "border-box",
  fontFamily: "Georgia, 'Times New Roman', serif",
  color: "#111",
};

const sans = "system-ui, sans-serif";

function notifyButton(b: EditorValues["button"]): React.CSSProperties {
  return {
    display: "block",
    width: "100%",
    boxSizing: "border-box",
    padding: "11px 14px",
    textAlign: "center",
    fontFamily: sans,
    fontWeight: 600,
    fontSize: 14,
    color: b.textColor,
    background: b.background,
    border: `1px solid ${b.background}`,
    borderRadius: b.borderRadius,
  };
}

/** The product-page block as the customer sees it when the selected variant is sold out. */
export function ButtonPreview({ button }: { button: EditorValues["button"] }) {
  return (
    <div style={card}>
      <div style={{ fontSize: 24, fontWeight: 700 }}>Hiking shoes</div>
      <div style={{ fontSize: 16, fontWeight: 700, margin: "6px 0 12px" }}>$100.00</div>
      <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
        {["S", "M", "L"].map((s) => (
          <span
            key={s}
            style={{
              padding: "8px 14px",
              borderRadius: 20,
              fontSize: 12,
              border: "1px solid #c9cccf",
              ...(s === "L" ? { background: "#111", color: "#fff", borderColor: "#111" } : {}),
            }}
          >
            {s}
          </span>
        ))}
      </div>
      <div style={{ border: "1px solid #c9cccf", borderRadius: 8, padding: "11px 14px", textAlign: "center", color: "#8c9196", marginBottom: 8 }}>
        Sold out
      </div>
      <div style={notifyButton(button)}>{button.text || "Notify me when available"}</div>
      {button.mixedSubtext && (
        <div style={{ marginTop: 6, fontSize: 12, textAlign: "center", color: button.subtextColor, fontFamily: sans }}>
          {button.mixedSubtext}
        </div>
      )}
    </div>
  );
}

function PreviewTab(props: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={props.onClick}
      style={{
        border: "1px solid #c9cccf",
        background: props.on ? "#303030" : "#fff",
        color: props.on ? "#fff" : "#303030",
        borderRadius: 8,
        padding: "4px 12px",
        fontSize: 12,
        cursor: "pointer",
      }}
    >
      {props.children}
    </button>
  );
}

/** The signup modal, with a switch to the confirmation shown after submitting. */
export function FormPreview({ form, button }: { form: EditorValues["form"]; button: EditorValues["button"] }) {
  const [confirmed, setConfirmed] = useState(false);
  const field: React.CSSProperties = {
    border: "1px solid #c9cccf",
    borderRadius: 8,
    padding: "10px 12px",
    marginBottom: 10,
    fontSize: 13,
    color: "#8c9196",
    fontFamily: sans,
  };
  return (
    <div style={{ width: "100%", maxWidth: 360 }}>
      <div style={{ display: "flex", gap: 8, justifyContent: "center", marginBottom: 12 }}>
        <PreviewTab on={!confirmed} onClick={() => setConfirmed(false)}>Form</PreviewTab>
        <PreviewTab on={confirmed} onClick={() => setConfirmed(true)}>Confirmation</PreviewTab>
      </div>
      <div style={card}>
        {confirmed ? (
          <div style={{ textAlign: "center", padding: "8px 0" }}>
            <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 6 }}>{form.confirmHeader}</div>
            <div style={{ fontSize: 13, color: "#444", fontFamily: sans }}>{form.confirmDescription}</div>
          </div>
        ) : (
          <>
            <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 6 }}>🔔 {form.header}</div>
            <div style={{ fontSize: 13, color: "#444", marginBottom: 14, fontFamily: sans }}>{form.description}</div>
            <div style={{ ...field, background: "#f6f6f7", color: "#444" }}>Medium / Black</div>
            <div style={field}>{form.emailPlaceholder}</div>
            {form.marketingOptIn && (
              <div style={{ fontSize: 12, marginBottom: 10, fontFamily: sans }}>☐ {form.marketingLabel}</div>
            )}
            <div style={notifyButton(button)}>{form.buttonText}</div>
            <div style={{ marginTop: 10, fontSize: 12, color: "#6d7175", fontFamily: sans }}>{form.terms}</div>
          </>
        )}
      </div>
    </div>
  );
}

/** The real email template rendered with sample data, in a sandboxed frame. */
export function EmailPreview({ email }: { email: EditorValues["email"] }) {
  return (
    <iframe
      title="Email preview"
      sandbox=""
      srcDoc={renderRestockEmail(email, SAMPLE).html}
      style={{ width: "100%", maxWidth: 560, height: 560, border: "1px solid #e1e3e5", borderRadius: 12, background: "#fff" }}
    />
  );
}

/** How the email looks in an inbox list: sender, subject and preview text. */
export function InboxPreview({ email }: { email: EditorValues["email"] }) {
  const mail = renderRestockEmail(email, SAMPLE);
  const preview = renderRestockEmail({ ...email, subject: email.previewText }, SAMPLE).subject;
  const row = (sender: string, subject: string, when: string, bold = false): React.ReactNode => (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "140px 1fr 50px",
        gap: 12,
        padding: "12px 14px",
        fontSize: 13,
        background: bold ? "#eaf1fb" : "transparent",
        fontWeight: bold ? 700 : 400,
        color: bold ? "#111" : "#5f6368",
        fontFamily: sans,
        borderTop: "1px solid #f1f1f1",
      }}
    >
      <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{sender}</span>
      <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {subject}
        {bold && <span style={{ fontWeight: 400, color: "#5f6368" }}> — {preview}</span>}
      </span>
      <span style={{ textAlign: "right" }}>{when}</span>
    </div>
  );
  return (
    <div style={{ width: "100%", maxWidth: 600, background: "#fff", borderRadius: 12, boxShadow: "0 4px 24px rgba(0,0,0,.12)", overflow: "hidden" }}>
      <div style={{ padding: 12, background: "#f6f8fc", fontSize: 13, color: "#5f6368", fontFamily: sans }}>Search mail</div>
      {row("Shopify", "Order #1042 confirmed — Your order is on the way", "Mon")}
      {row(mail.fromName, mail.subject, "Now", true)}
      {row("Google", "Security alert — New sign-in on Chrome", "Sun")}
    </div>
  );
}
