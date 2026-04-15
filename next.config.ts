import type { NextConfig } from "next";
import nextPwa from "@ducanh2912/next-pwa";

const withPWA = nextPwa({
  dest: "public",
  disable: process.env.NODE_ENV === "development",
});

const nextConfig: NextConfig = {
  serverExternalPackages: [
    "@resvg/resvg-js",
    "@resvg/resvg-js-win32-x64-msvc",
  ],

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