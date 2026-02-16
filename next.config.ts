import type { NextConfig } from "next";
import nextPwa from "@ducanh2912/next-pwa";

const withPWA = nextPwa({
  dest: "public",
  disable: process.env.NODE_ENV === "development",
});

const nextConfig: NextConfig = {
  async redirects() {
    return [
      {
        source: "/:path*",
        has: [{ type: "host", value: "tornei-app.vercel.app" }],
        destination: "https://tornei.movipadel.it/:path*",
        permanent: true,
      },
    ];
  },
};

export default withPWA(nextConfig);
