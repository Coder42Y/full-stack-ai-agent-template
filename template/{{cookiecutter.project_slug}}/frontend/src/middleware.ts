import createMiddleware from "next-intl/middleware";
import { locales, defaultLocale } from "./i18n";

export default createMiddleware({
  // A list of all locales that are supported
  locales,

  // Used when no locale matches
  defaultLocale,

{%- if cookiecutter.enable_i18n %}
  // Don't prefix the default locale (e.g., /about instead of /en/about)
  localePrefix: "as-needed",
{%- else %}
  // Single-locale builds should serve clean paths without redirecting between
  // /register and /en/register.
  localePrefix: "never",
{%- endif %}

  // Always serve `defaultLocale` at root, regardless of the visitor's
  // Accept-Language header. Single-language apps should not show a switcher.
  localeDetection: false,
});

export const config = {
  // Match only internationalized pathnames
  matcher: [
    // Match all pathnames except for:
    // - /api (API routes)
    // - /_next (Next.js internals)
    // - /static (inside /public)
    // - /_vercel (Vercel internals)
    // - All root files like favicon.ico, robots.txt, etc.
    // - App-router metadata convention routes (icon, apple-icon, opengraph-image,
    //   twitter-image, manifest.*, robots, sitemap) — these are dotless URLs
    //   that Next.js generates from src/app/{icon,apple-icon,…}.tsx and would
    //   otherwise be redirected to /{locale}/icon → 404.
{%- if cookiecutter.enable_i18n %}
    "/((?!api|_next|_vercel|static|icon$|apple-icon$|opengraph-image$|twitter-image$|manifest|robots$|sitemap$|.*\\..*).*)",
{%- else %}
    "/((?!en(?:/|$)|api|_next|_vercel|static|icon$|apple-icon$|opengraph-image$|twitter-image$|manifest|robots$|sitemap$|.*\\..*).*)",
{%- endif %}
  ],
};
