import assert from "node:assert/strict";
import { cpSync, existsSync, mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";

const pluginRoot = process.argv[2] ?? dirname(import.meta.dirname);
const fixtureRoot = mkdtempSync(join(tmpdir(), "understand-anything-runtime-"));
const fixturePlugin = join(fixtureRoot, "plugin");
const fixtureProject = join(fixtureRoot, "project");

try {
  // Build a clean package-shaped copy. Source trees, package-manager metadata,
  // and build-only workspaces are deliberately excluded from this fixture.
  mkdirSync(fixturePlugin, { recursive: true });
  for (const name of ["agents", "hooks", "skills", "dist", "node_modules"]) {
    cpSync(join(pluginRoot, name), join(fixturePlugin, name), { recursive: true });
  }
  mkdirSync(join(fixturePlugin, "packages/core"), { recursive: true });
  cpSync(join(pluginRoot, "packages/core/dist"), join(fixturePlugin, "packages/core/dist"), { recursive: true });
  cpSync(join(pluginRoot, "packages/core/package.json"), join(fixturePlugin, "packages/core/package.json"));
  cpSync(join(pluginRoot, "package.json"), join(fixturePlugin, "package.json"));
  cpSync(join(pluginRoot, "pnpm-workspace.yaml"), join(fixturePlugin, "pnpm-workspace.yaml"));
  mkdirSync(join(fixturePlugin, "packages/viewer"), { recursive: true });
  cpSync(join(pluginRoot, "packages/viewer/dist"), join(fixturePlugin, "packages/viewer/dist"), { recursive: true });
  cpSync(join(pluginRoot, "packages/viewer/bin"), join(fixturePlugin, "packages/viewer/bin"), { recursive: true });

  mkdirSync(join(fixtureProject, "src"), { recursive: true });
  writeFileSync(join(fixtureProject, "src/helper.ts"), "export function formatMessage(value: string): string { return value.trim(); }\n");
  const source = `import { formatMessage } from "./helper";\n\nexport function greet(name: string): string {\n  return formatMessage("Hello " + name);\n}\n`;
  writeFileSync(join(fixtureProject, "src/index.ts"), source);
  const git = process.env.GIT_EXE ?? "git";
  execFileSync(git, ["init", "-q"], { cwd: fixtureProject, stdio: "ignore" });
  execFileSync(git, ["-c", "user.name=Runtime Test", "-c", "user.email=runtime@example.invalid", "add", "."], { cwd: fixtureProject, stdio: "ignore" });
  execFileSync(git, ["-c", "user.name=Runtime Test", "-c", "user.email=runtime@example.invalid", "commit", "-q", "-m", "fixture"], { cwd: fixtureProject, stdio: "ignore" });
  assert.ok(existsSync(join(fixtureProject, ".git")), "fixture must be a real Git repository");

  const core = await import(pathToFileURL(join(fixturePlugin, "node_modules/@understand-anything/core/dist/index.js")).href);
  const plugin = new core.TreeSitterPlugin();
  await plugin.init();
  const first = plugin.analyzeFileFull("src/index.ts", source);
  const second = plugin.analyzeFileFull("src/index.ts", source);

  assert.equal(first.structure.functions.length, 1);
  assert.equal(first.structure.imports.length, 1);
  assert.ok(first.callGraph.length >= 1);
  assert.deepEqual(second, first, "analysis must be deterministic across repeated calls");
  assert.ok(existsSync(join(fixturePlugin, "packages/core/dist/index.js")));
  assert.ok(existsSync(join(fixturePlugin, "node_modules/web-tree-sitter/web-tree-sitter.wasm")));
  assert.ok(existsSync(join(fixturePlugin, "packages/viewer/dist/index.html")));

  // The installed Skill entrypoint must also load without invoking a package manager.
  await import(pathToFileURL(join(fixturePlugin, "dist/index.js")).href);
  console.log(JSON.stringify({ ok: true, functions: first.structure.functions.length, imports: first.structure.imports.length, callGraph: first.callGraph.length }));
} finally {
  rmSync(fixtureRoot, { recursive: true, force: true });
}
