/** @type {import('next').NextConfig} */
const { withSentryConfig } = require("@sentry/nextjs");

const nextConfig = {
  images: {
    domains: ["images.unsplash.com"],
  },
  // Sentry configuration
  sentry: {
    hideSourceMaps: true,
    widenClientFileUpload: true,
  },
};

if (process.env.NEXT_PUBLIC_TEMPO) {
  nextConfig["experimental"] = {
    // NextJS 13.4.8 up to 14.1.3:
    // swcPlugins: [[require.resolve("tempo-devtools/swc/0.86"), {}]],
    // NextJS 14.1.3 to 14.2.11:
    swcPlugins: [[require.resolve("tempo-devtools/swc/0.90"), {}]],

    // NextJS 15+ (Not yet supported, coming soon)
  };
}

// Wrap with Sentry configuration
const sentryWebpackPluginOptions = {
  silent: true,
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  authToken: process.env.SENTRY_AUTH_TOKEN,
};

module.exports =
  process.env.NODE_ENV === "production"
    ? withSentryConfig(nextConfig, sentryWebpackPluginOptions)
    : nextConfig;
