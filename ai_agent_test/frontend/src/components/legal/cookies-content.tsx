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

export function CookiesBodyZh() {
  return (
    <>
      <p>
        我们使用 Cookie 及类似技术（合称“Cookie”）来运行并改进本服务。本页说明我们使用哪些 Cookie，以及你如何控制它们。
      </p>

      <h2>什么是 Cookie？</h2>
      <p>
        Cookie 是浏览器在你访问网站时存储在设备上的小文件。它让我们能保持你的登录状态、记住偏好，并了解功能使用情况。
      </p>

      <h2>分类</h2>
      <h3>必要 Cookie</h3>
      <p>
        本服务运行所必需，无法禁用。例如：会话令牌、CSRF 令牌、主题偏好。
      </p>
      <ul>
        <li>
          <code>auth.session</code>——你的登录会话（httpOnly）。
        </li>
        <li>
          <code>theme</code>——亮色/暗色偏好。
        </li>
        <li>
          <code>locale</code>——你选择的语言。
        </li>
      </ul>

      <h3>统计 Cookie</h3>
      <p>
        帮助我们了解服务使用情况以便改进。我们会对 IP 地址做匿名化处理，且不会为广告目的与第三方共享。
      </p>
      <ul>
        <li>
          <code>analytics.session</code>——页面浏览与功能使用计数。
        </li>
      </ul>

      <h3>功能 Cookie</h3>
      <p>记住你的选择，让服务更贴合个人习惯。可选的。</p>
      <ul>
        <li>
          <code>onboarding.completed_at</code>——你是否完成了引导流程。
        </li>
        <li>
          <code>cookie.consent</code>——你对 Cookie 弹窗的回应。
        </li>
      </ul>

      <h2>你的选择</h2>
      <p>
        首次访问时，你可以从 Cookie 弹窗中选择接受、拒绝或自定义各类别。你也可以随时通过页脚链接更改选择。
      </p>
      <p>
        你还可以在浏览器设置中屏蔽 Cookie。请注意：屏蔽必要 Cookie 会导致部分功能不可用（例如无法保持登录）。
      </p>

      <h2>第三方 Cookie</h2>
      <p>
        我们不会设置广告类 Cookie。部分嵌入内容（视频、支付组件）可能设置 Cookie，这些行为由对应提供商的政策约束。
      </p>

      <h2>联系我们</h2>
      <p>
        如有疑问：<a href="mailto:privacy@example.com">privacy@example.com</a>。
      </p>
    </>
  );
}
