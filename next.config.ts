import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // pdf.js loads its worker by file path at runtime; bundling breaks that
  // resolution, so it stays in node_modules on the server.
  serverExternalPackages: ["pdfjs-dist"],
};

export default nextConfig;
