import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ['pdfjs-dist'],
  // pdfjs-dist's Node "fake worker" fallback still dynamically imports
  // pdf.worker.mjs (a sibling of pdf.mjs) to get its message handler, even
  // though it never spawns a real worker thread. Because pdfjs-dist is a
  // serverExternalPackage, Next.js resolves it from node_modules at runtime
  // rather than bundling it — and file tracing doesn't follow that dynamic
  // import, so pdf.worker.mjs was missing from the deployed function,
  // producing "Setting up fake worker failed: Cannot find module
  // .../pdf.worker.mjs". Force it into the trace explicitly.
  outputFileTracingIncludes: {
    '/api/extract-invoice': ['./node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs'],
  },
};

export default nextConfig satisfies NextConfig;
