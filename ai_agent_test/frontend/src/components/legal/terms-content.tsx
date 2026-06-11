import { APP_NAME } from "@/lib/constants";

export function TermsBodyEn() {
  return (
    <>
      <p>
        These Terms of Service (&ldquo;Terms&rdquo;) govern your access to and use of {APP_NAME}{" "}
        (the &ldquo;Service&rdquo;). By creating an account, accessing the Service, or clicking
        &ldquo;I agree,&rdquo; you accept these Terms.
      </p>
      <p>
        If you&apos;re using the Service on behalf of an organization, you&apos;re agreeing on its
        behalf and confirming you have authority to do so.
      </p>

      <h2>1. The Service</h2>
      <p>
        {APP_NAME} provides AI-assisted productivity software, including chat agents, retrieval
        augmented generation (RAG), and related developer tools. Features evolve continuously; we
        may add, change, or remove functionality.
      </p>

      <h2>2. Your account</h2>
      <p>
        You&apos;re responsible for keeping your credentials secure and for activity that happens
        under your account. Notify us at{" "}
        <a href="mailto:security@example.com">security@example.com</a> if you suspect compromise.
      </p>

      <h2>3. Acceptable use</h2>
      <p>You won&apos;t use the Service to:</p>
      <ul>
        <li>Break the law or violate someone else&apos;s rights;</li>
        <li>
          Generate content that is illegal, harmful to minors, fraudulent, or designed to deceive;
        </li>
        <li>
          Probe, scan, or test the vulnerability of the Service without prior written consent;
        </li>
        <li>Reverse-engineer the Service to compete with us;</li>
        <li>Interfere with other customers&apos; use of the Service.</li>
      </ul>

      <h2>4. Your content</h2>
      <p>
        You own what you put in — prompts, documents, chat content (&ldquo;Customer Data&rdquo;).
        You grant us a limited license to host, process, and display Customer Data only to operate
        the Service for you.
      </p>
      <p>
        <strong>We don&apos;t train on your Customer Data.</strong> Period.
      </p>

      <h2>5. Subscriptions and billing</h2>
      <p>
        Paid plans renew automatically until canceled. Fees are non-refundable except where required
        by law. You can cancel anytime — your plan stays active until the end of the current billing
        period.
      </p>
      <p>
        Credits expire at the end of each billing cycle. Pay-as-you-go top-ups don&apos;t expire.
        Taxes are added where applicable.
      </p>

      <h2>6. Third-party services</h2>
      <p>
        The Service relies on third-party providers (e.g. model APIs, payment processors). Your use
        of those features is also subject to those providers&apos; terms. We don&apos;t control them
        and aren&apos;t responsible for their actions.
      </p>

      <h2>7. Intellectual property</h2>
      <p>
        We retain all rights to the Service, including software, designs, and trademarks. You retain
        all rights to your Customer Data and any output you generate using the Service, subject to
        applicable model providers&apos; terms.
      </p>

      <h2>8. Termination</h2>
      <p>
        You can stop using the Service at any time. We may suspend or terminate your access if you
        breach these Terms or for security reasons. Sections that should survive termination (IP,
        disclaimers, limitations of liability, dispute resolution) survive.
      </p>

      <h2>9. Disclaimers</h2>
      <p>
        The Service is provided &ldquo;as is.&rdquo; To the maximum extent permitted by law, we
        disclaim all warranties — express, implied, statutory — including merchantability, fitness
        for a particular purpose, and non-infringement.
      </p>
      <p>
        AI output may contain inaccuracies.{" "}
        <strong>
          Don&apos;t rely on the Service for advice in domains where mistakes have real consequences
        </strong>{" "}
        (medical, legal, financial) without independent verification.
      </p>

      <h2>10. Limitation of liability</h2>
      <p>
        To the extent permitted by law, our aggregate liability for any claim arising from or
        related to the Service won&apos;t exceed the greater of (a) what you paid us in the 12
        months before the claim or (b) USD 100. Neither of us is liable for indirect, incidental,
        consequential, or punitive damages.
      </p>

      <h2>11. Changes to these Terms</h2>
      <p>
        We may update these Terms when the Service evolves. Material changes will be announced via
        email or in-app at least 30 days before they take effect. Continued use after the effective
        date constitutes acceptance.
      </p>

      <h2>12. Governing law</h2>
      <p>
        These Terms are governed by the laws of the jurisdiction in which the operating entity is
        registered, excluding conflict-of-law rules. Disputes go to the courts of that jurisdiction
        unless required otherwise by mandatory law.
      </p>

      <h2>13. Contact</h2>
      <p>
        Questions? Email <a href="mailto:legal@example.com">legal@example.com</a>. We respond within
        five business days for legal correspondence.
      </p>
    </>
  );
}
