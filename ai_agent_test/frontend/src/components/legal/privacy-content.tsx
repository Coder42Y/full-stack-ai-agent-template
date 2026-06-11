import Link from "next/link";

import { APP_NAME } from "@/lib/constants";

export function PrivacyBodyEn() {
  return (
    <>
      <p>
        This Privacy Policy explains how {APP_NAME} (&ldquo;we&rdquo;, &ldquo;us&rdquo;) collects,
        uses, shares, and protects information when you use the Service.
      </p>

      <h2>1. What we collect</h2>
      <h3>Information you provide</h3>
      <ul>
        <li>
          <strong>Account info</strong> — name, email, hashed password, optional avatar.
        </li>
        <li>
          <strong>Customer Data</strong> — prompts, documents you upload, chat conversations,
          knowledge base content.
        </li>
        <li>
          <strong>Billing info</strong> — handled by our payment processor (Stripe). We never see
          your card number.
        </li>
        <li>
          <strong>Support correspondence</strong> — when you email us.
        </li>
      </ul>
      <h3>Information collected automatically</h3>
      <ul>
        <li>
          <strong>Usage data</strong> — request paths, response times, feature usage, error stack
          traces.
        </li>
        <li>
          <strong>Device data</strong> — browser, OS, IP address (for security and rate limiting).
        </li>
        <li>
          <strong>Cookies</strong> — see our <Link href="/legal/cookies">Cookie Policy</Link>.
        </li>
      </ul>

      <h2>2. Why we use it</h2>
      <ul>
        <li>To operate, maintain, and improve the Service;</li>
        <li>To process subscriptions and prevent fraud;</li>
        <li>To send transactional email (account, billing, security alerts);</li>
        <li>To respond to support requests;</li>
        <li>To detect abuse and enforce our Terms.</li>
      </ul>

      <h2>3. AI processing</h2>
      <p>
        When you use AI features, your prompts and the relevant context are sent to our configured
        model providers (e.g. OpenAI, Anthropic, Google) for processing. We choose providers that
        contractually agree not to use your data for training.
      </p>
      <p>
        <strong>We don&apos;t train any of our own models on your data.</strong>
      </p>

      <h2>4. Data sharing</h2>
      <p>We share data only with:</p>
      <ul>
        <li>
          <strong>Sub-processors</strong> we use to operate the Service (hosting, model providers,
          payment processor, email delivery, error monitoring). A current list is available on
          request.
        </li>
        <li>
          <strong>Authorities</strong> if required by law, but we&apos;ll push back where we can and
          notify affected users where legally permitted.
        </li>
        <li>
          <strong>An acquirer</strong> in the event of a merger or sale, with continuing obligations
          under this Policy.
        </li>
      </ul>

      <h2>5. Retention</h2>
      <p>
        We keep Customer Data for as long as your account is active. After deletion, backups are
        purged within 30 days. Logs and metrics are retained up to 90 days for security and
        operational analysis.
      </p>

      <h2>6. Your rights</h2>
      <p>
        Depending on where you live, you may have rights to access, correct, delete, or export your
        personal data, and to object to or restrict certain processing. Email{" "}
        <a href="mailto:privacy@example.com">privacy@example.com</a> to exercise them. We respond
        within 30 days.
      </p>

      <h2>7. International transfers</h2>
      <p>
        We host primarily in the EU. Where data is processed outside your country, we rely on
        standard contractual clauses or equivalent safeguards.
      </p>

      <h2>8. Security</h2>
      <p>
        We use TLS in transit, AES-256 at rest, role-based access control, and audit-logged admin
        actions. See the <Link href="/security">Security page</Link> for details.
      </p>

      <h2>9. Children</h2>
      <p>
        The Service isn&apos;t directed to children under 16. We don&apos;t knowingly collect
        information from them.
      </p>

      <h2>10. Changes</h2>
      <p>
        We&apos;ll notify you in-app or via email before any material change takes effect. Continued
        use after the effective date constitutes acceptance.
      </p>

      <h2>11. Contact</h2>
      <p>
        Questions or requests: <a href="mailto:privacy@example.com">privacy@example.com</a>.
      </p>
    </>
  );
}
