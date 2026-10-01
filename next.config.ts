import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

const nextConfig: NextConfig = {
  // @napi-rs/canvas ships a native binding (js-binding.js) that Turbopack
  // cannot place in an ESM chunk; pdfjs-dist pulls it in transitively via
  // src/features/documents/services/ocr.ts. Both must load via native
  // require() at runtime instead of being bundled.
  serverExternalPackages: ["@napi-rs/canvas", "pdfjs-dist"],
  turbopack: {
    resolveAlias: {
      "@huggingface/transformers":
        "@huggingface/transformers/dist/transformers.web.js",
    },
  },
};

export default withSentryConfig(nextConfig, {
  silent: true,
});
