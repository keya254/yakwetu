import type { NextConfig } from "next";

const publicHost = process.env.PUBLIC_SITE_URL ? new URL(process.env.PUBLIC_SITE_URL).hostname : null;

const nextConfig: NextConfig = {
  ...(publicHost ? { allowedDevOrigins: [publicHost] } : {}),
  // Loaded by Node at runtime rather than bundled: amqplib uses Node's net/tls.
  serverExternalPackages: ["amqplib"],
  images: {
    // OMDb posters are served from Amazon's IMDb image CDN; video stills from YouTube's.
    remotePatterns: [
      { protocol: "https", hostname: "m.media-amazon.com", pathname: "/images/**" },
      { protocol: "https", hostname: "i.ytimg.com", pathname: "/vi/**" },
    ],
  },
};

export default nextConfig;
