import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import ts from "typescript";

const workspaceRoot = process.cwd();

function loadTypeScriptModule(relativePath, mocks = {}) {
  const absolutePath = path.join(workspaceRoot, relativePath);
  const source = fs.readFileSync(absolutePath, "utf8");
  const output = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      esModuleInterop: true,
    },
    fileName: absolutePath,
  });
  const compiledModule = { exports: {} };

  const localRequire = (id) => {
    if (Object.hasOwn(mocks, id)) {
      return mocks[id];
    }

    throw new Error(`Unexpected import while loading ${relativePath}: ${id}`);
  };

  const factory = new Function(
    "require",
    "exports",
    "module",
    output.outputText
  );
  factory(localRequire, compiledModule.exports, compiledModule);

  return compiledModule.exports;
}

const scopeModule = loadTypeScriptModule("lib/tryon-scope.ts");
const aspectModule = loadTypeScriptModule("lib/tryon-aspect.ts");
const promptModule = loadTypeScriptModule("lib/tryon-prompts.ts", {
  "@/lib/tryon-scope": scopeModule,
});

const { TRY_ON_GARMENT_SCOPE_OPTIONS, normalizeTryOnGarmentScope } = scopeModule;
const { buildStrictTryOnPrompt } = promptModule;
const {
  getAspectRatio,
  getCanvasDimensionsForAspect,
  getClosestTryOnSizeForAspect,
} = aspectModule;

assert.equal(normalizeTryOnGarmentScope("upper"), "upper");
assert.equal(normalizeTryOnGarmentScope("lower"), "lower");
assert.equal(normalizeTryOnGarmentScope("full"), "full");
assert.equal(normalizeTryOnGarmentScope("unknown"), "upper");

assert.deepEqual(
  TRY_ON_GARMENT_SCOPE_OPTIONS.map((option) => [
    option.value,
    option.fashnCategory,
  ]),
  [
    ["upper", "tops"],
    ["lower", "bottoms"],
    ["full", "one-pieces"],
  ]
);

const upperPrompt = buildStrictTryOnPrompt("blue cotton shirt", "upper");
assert.match(upperPrompt, /UPPER BODY \/ TOP ONLY/);
assert.match(upperPrompt, /Replace only the top\/upper-body garment/);
assert.match(upperPrompt, /Keep the original pants, skirt, shorts, legs, shoes/);
assert.match(upperPrompt, /Do not replace, recolor, redesign, or remove clothing outside the selected scope/);
assert.match(upperPrompt, /aspect ratio the same as image 2/);

const lowerPrompt = buildStrictTryOnPrompt("black trousers", "lower");
assert.match(lowerPrompt, /LOWER BODY \/ BOTTOM ONLY/);
assert.match(lowerPrompt, /Replace only the lower-body garment/);
assert.match(lowerPrompt, /Keep the original top, sleeves, torso, arms, hands, face, hair/);

const fullPrompt = buildStrictTryOnPrompt("matching set", "full");
assert.match(fullPrompt, /FULL OUTFIT \/ WHOLE VISIBLE CLOTHING/);
assert.match(fullPrompt, /Replace the visible outfit only/);
assert.match(fullPrompt, /Do not regenerate the person, pose, body proportions, face, hair, hands/);

assert.equal(
  getClosestTryOnSizeForAspect("nano_banana_pro", {
    width: 1200,
    height: 1800,
  }),
  "1024x1536"
);
assert.equal(
  getClosestTryOnSizeForAspect("nano_banana_pro", {
    width: 1800,
    height: 1200,
  }),
  "1536x1024"
);
assert.equal(
  getClosestTryOnSizeForAspect("image2", {
    width: 1200,
    height: 1800,
  }),
  "1024x1792"
);
assert.equal(
  getClosestTryOnSizeForAspect("image2", {
    width: 1800,
    height: 1200,
  }),
  "1792x1024"
);

const correctedCanvas = getCanvasDimensionsForAspect(
  { width: 1024, height: 1024 },
  { width: 1200, height: 1800 }
);
const correctedRatio = getAspectRatio(correctedCanvas);
assert.ok(Math.abs(correctedRatio - 1200 / 1800) < 0.002);

console.log("try-on scope and aspect verification passed");
