import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async redirects() {
    return [
      {
        source: "/:path*",
        has: [
          {
            type: "host",
            value: "tornei-app.vercel.app",
          },
        ],
        destination: "https://tornei.movipadel.it/:path*",
        permanent: true,
      },
    ];
  },
};

export default nextConfig;
