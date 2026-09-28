import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    // OMDb posters are served from Amazon's IMDb image CDN.
    remotePatterns: [{ protocol: "https", hostname: "m.media-amazon.com", pathname: "/images/**" }],
  },
};

export default nextConfig;
