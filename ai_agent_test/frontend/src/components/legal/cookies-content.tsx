export function CookiesBodyEn() {
  return (
    <>
      <p>
        We use cookies and similar technologies (collectively, &ldquo;cookies&rdquo;) to operate the
        Service and improve it. This page explains what we use and how to control it.
      </p>

      <h2>What is a cookie?</h2>
      <p>
        A small file your browser stores on your device when you visit a website. Cookies let us
        keep you logged in, remember preferences, and understand how features are used.
      </p>

      <h2>Categories</h2>
      <h3>Essential</h3>
      <p>
        Required for the Service to work. These can&apos;t be disabled. Examples: session token,
        CSRF token, preferred theme.
      </p>
      <ul>
        <li>
          <code>auth.session</code> — your authenticated session (httpOnly).
        </li>
        <li>
          <code>theme</code> — light/dark preference.
        </li>
        <li>
          <code>locale</code> — your selected language.
        </li>
      </ul>

      <h3>Analytics</h3>
      <p>
        Help us understand how the Service is used so we can improve it. We anonymize IP addresses
        and don&apos;t share with third parties for advertising.
      </p>
      <ul>
        <li>
          <code>analytics.session</code> — pageview and feature-usage counters.
        </li>
      </ul>

      <h3>Functional</h3>
      <p>Remember your choices to make the Service feel less repetitive. Optional.</p>
      <ul>
        <li>
          <code>onboarding.completed_at</code> — whether you finished the setup wizard.
        </li>
        <li>
          <code>cookie.consent</code> — your response to the cookie banner.
        </li>
      </ul>

      <h2>Your choices</h2>
      <p>
        You can accept, reject, or customize categories from the cookie banner shown on first visit.
        You can change your choice anytime from the link in the footer.
      </p>
      <p>
        You can also block cookies in your browser settings. Note: blocking essential cookies will
        break parts of the Service (e.g. you won&apos;t stay logged in).
      </p>

      <h2>Third-party cookies</h2>
      <p>
        We don&apos;t set advertising cookies. Some embedded content (videos, payment widgets) may
        set cookies — those are governed by their providers&apos; policies.
      </p>

      <h2>Contact</h2>
      <p>
        Questions: <a href="mailto:privacy@example.com">privacy@example.com</a>.
      </p>
    </>
  );
}
