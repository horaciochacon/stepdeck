// Loaded with `node --import` (test/unit/cli-no-ajv.test.mjs): makes every import of `ajv` fail
// the way a missing node_modules does (ERR_MODULE_NOT_FOUND), without touching node_modules.
import { registerHooks } from "node:module";

registerHooks({
  resolve(specifier, context, next) {
    if (specifier === "ajv" || specifier.startsWith("ajv/")) {
      const error = new Error(`Cannot find package 'ajv' imported from ${context.parentURL}`);
      error.code = "ERR_MODULE_NOT_FOUND";
      throw error;
    }
    return next(specifier, context);
  },
});
