import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  outputFileTracingIncludes:{"/invoices/*/pdf":["./src/server/pdf/fonts/Amiri-Regular.ttf","./public/branding/ferdous-logo.png"]},
  experimental: { serverActions: { bodySizeLimit: "6mb" } },
  async headers() {
    return [{ source: "/:path*", headers: [
      ...(process.env.NODE_ENV === "production" ? [{key:"Strict-Transport-Security",value:"max-age=31536000"}] : []),
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
      { key: "X-Frame-Options", value: "DENY" },
      { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
    ] }];
  },
};
export default nextConfig;
