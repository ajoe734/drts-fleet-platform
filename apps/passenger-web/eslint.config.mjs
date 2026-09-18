import nextConfig from "../../packages/eslint-config/next.mjs";

export default [
  ...nextConfig,
  {
    // The service worker runs in its own global scope (no `window`); it
    // needs `self`/`clients`/`registration`/etc. rather than the browser
    // globals the rest of this app's `.ts`/`.tsx` files get from `next.mjs`.
    files: ["public/sw.js"],
    languageOptions: {
      globals: {
        self: "readonly",
        clients: "readonly",
        registration: "readonly",
        caches: "readonly",
        fetch: "readonly",
      },
    },
  },
];
