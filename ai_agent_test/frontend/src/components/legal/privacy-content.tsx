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

export function PrivacyBodyZh() {
  return (
    <>
      <p>
        本隐私政策说明 {APP_NAME}（“我们”）在使用本服务时如何收集、使用、共享与保护你的信息。
      </p>

      <h2>一、我们收集什么</h2>
      <h3>你主动提供的信息</h3>
      <ul>
        <li>
          <strong>账号信息</strong>——姓名、邮箱、加密后的密码、选填头像。
        </li>
        <li>
          <strong>客户数据</strong>——提示词、上传的文档、对话记录、知识库内容。
        </li>
        <li>
          <strong>计费信息</strong>——由支付处理方（Stripe）处理，我们不会接触你的银行卡号。
        </li>
        <li>
          <strong>支持沟通</strong>——你联系我们时的往来内容。
        </li>
      </ul>
      <h3>自动收集的信息</h3>
      <ul>
        <li>
          <strong>使用数据</strong>——请求路径、响应时间、功能使用情况、错误堆栈。
        </li>
        <li>
          <strong>设备数据</strong>——浏览器、操作系统、IP 地址（用于安全防护与限流）。
        </li>
        <li>
          <strong>Cookie</strong>——详见我们的 <Link href="/legal/cookies">Cookie 政策</Link>。
        </li>
      </ul>

      <h2>二、使用目的</h2>
      <ul>
        <li>运营、维护并改进本服务；</li>
        <li>处理订阅并防范欺诈；</li>
        <li>发送交易类邮件（账号、计费、安全提醒）；</li>
        <li>响应支持请求；</li>
        <li>检测滥用并执行本条款。</li>
      </ul>

      <h2>三、AI 处理</h2>
      <p>
        使用 AI 功能时，你的提示词及相关上下文会发送给配置的模型供应商（如 DeepSeek）进行处理。我们选择的供应商在合同中承诺不会将你的数据用于训练。
      </p>
      <p>
        <strong>我们不会用你的数据训练任何自有模型。</strong>
      </p>

      <h2>四、数据共享</h2>
      <p>我们仅在以下情形共享数据：</p>
      <ul>
        <li>
          <strong>子处理方</strong>——用于运营本服务的托管、模型、支付、邮件与监控等服务，当前清单可按需提供。
        </li>
        <li>
          <strong>执法机关</strong>——法律要求时提供；我们会尽可能提出异议，并在法律允许时通知受影响用户。
        </li>
        <li>
          <strong>收购方</strong>——发生合并或出售时随业务转移，且继续受本政策约束。
        </li>
      </ul>

      <h2>五、数据保留</h2>
      <p>
        客户数据在你的账号存续期间保留。删除账号后，备份会在 30 天内清除。日志与指标为安全与运营分析保留不超过 90 天。
      </p>

      <h2>六、你的权利</h2>
      <p>
        根据你所在地区的法律，你可能享有访问、更正、删除或导出个人数据的权利，以及对特定处理提出异议或限制的权利。如需行使，请发送邮件至{" "}
        <a href="mailto:privacy@example.com">privacy@example.com</a>，我们会在 30 天内回复。
      </p>

      <h2>七、跨境传输</h2>
      <p>
        数据主要在本地部署环境中处理。如数据在境外处理，我们会采用标准合同条款或同等保护措施。
      </p>

      <h2>八、安全</h2>
      <p>
        我们采用传输加密（TLS）、静态加密（AES-256）、基于角色的访问控制与审计日志。详情见 <Link href="/security">安全页面</Link>。
      </p>

      <h2>九、未成年人</h2>
      <p>
        本服务面向企业员工，不面向 16 周岁以下未成年人，我们也不会主动收集未成年人信息。
      </p>

      <h2>十、政策变更</h2>
      <p>
        重大变更生效前，我们会通过站内或邮件通知。生效日后继续使用即视为接受更新后的政策。
      </p>

      <h2>十一、联系我们</h2>
      <p>
        如有疑问或请求：<a href="mailto:privacy@example.com">privacy@example.com</a>。
      </p>
    </>
  );
}
