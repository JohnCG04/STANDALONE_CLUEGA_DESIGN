import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,

  transpilePackages: ['@dogclaw-ad/workflow-agent'],

  /**
   * The build does not type-check: `npm run typecheck` does, as its own step,
   * so a type error in a rarely used file cannot block a deploy and the build
   * stays fast.
   */
  typescript: { ignoreBuildErrors: true },

  experimental: {
    // Uploads (images/videos) go through the `/api/v1` proxy.
    proxyClientMaxBodySize: '250mb',

    /**
     * How long the client Router Cache may reuse a route's RSC payload. Every
     * page here is a client component that fetches its own data, so reusing the
     * payload drops a request per navigation without showing a stale figure.
     */
    staleTimes: { dynamic: 30 },
  },

  /**
   * Addresses from the product app this was split from (`/app/flow…`,
   * `/app/workflow/…`): old bookmarks, OAuth returns and links the backend
   * minted. 307 rather than 308 — a permanent redirect is cached by browsers
   * indefinitely.
   */
  async redirects() {
    return [
      { source: '/app', destination: '/flow', permanent: false },
      { source: '/app/flow/:path*', destination: '/flow/:path*', permanent: false },
      { source: '/app/workflow/:path*', destination: '/workflow/:path*', permanent: false },
      { source: '/app/:path*', destination: '/flow', permanent: false },
    ];
  },
};

export default nextConfig;
