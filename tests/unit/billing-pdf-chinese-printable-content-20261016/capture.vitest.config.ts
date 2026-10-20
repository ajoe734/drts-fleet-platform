import before from "./before.vitest.config";
export default {
  ...before,
  test: {
    ...before.test,
    include: [
      "tests/unit/billing-pdf-chinese-printable-content-20261016/capture-accepted-legacy.ts",
    ],
  },
};
