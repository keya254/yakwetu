import type { NextConfig } from "next";

const nextConfig: NextConfig = {
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
