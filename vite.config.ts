import { defineConfig } from "vite";

// Relative base so the build works whether deployed at the root of an org
// page (https://bitshifters.github.io/) or under a project subpath
// (https://bitshifters.github.io/envelope-tool/).
export default defineConfig({
  base: "./",
});
