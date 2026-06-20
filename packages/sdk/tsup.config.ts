import { defineConfig } from 'tsup';

// Bundle the SDK for npm. @specter/core is a TYPE-ONLY import, so noExternal
// inlines its types into the .d.ts and nothing from core ends up in the runtime
// bundle — the published package has zero dependencies.
export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm', 'cjs'],
  dts: true,
  clean: true,
  treeshake: true,
  sourcemap: true,
});
