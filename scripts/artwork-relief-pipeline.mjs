#!/usr/bin/env node

import { spawn } from "node:child_process";
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { createCadViewerUrlForFile } from "../web/cad-viewer.mjs";

const __filename = fileURLToPath(import.meta.url);
const scriptsDir = path.dirname(__filename);
const repoRoot = path.resolve(scriptsDir, "..");
const modelsDir = path.join(repoRoot, "models");
const cadViewerScriptDir = path.join(repoRoot, ".agents", "skills", "cad-viewer", "scripts", "viewer");
const openscadToolsDir = path.join(repoRoot, ".agents", "skills", "openscad", "tools");

const stageKeyByName = {
  preprocess: "magicimage",
  vectorize: "potrace",
  normalize_svg: "svg_cleanup",
  build_scad: "openscad_build",
  validate_scad: "validate",
  render_previews: "preview",
  export_stl: "stl_export",
  cad_viewer: "cad_viewer",
};

const defaultParameters = {
  targetWidth: 120,
  baseMargin: 4,
  baseThickness: 2,
  reliefHeight: 2.4,
  baseCornerRadius: 3,
  artworkOffset: 0.25,
  threshold: 55,
};

function printHelp() {
  process.stdout.write(`Deterministic artwork relief pipeline\n\n`);
  process.stdout.write(`Usage:\n`);
  process.stdout.write(`  node scripts/artwork-relief-pipeline.mjs --input <file.png> --output-dir <dir> --name <name> [options]\n\n`);
  process.stdout.write(`Required:\n`);
  process.stdout.write(`  --input <path>                Source PNG artwork\n`);
  process.stdout.write(`  --output-dir <path>           Output artifact directory\n`);
  process.stdout.write(`  --name <value>                Artifact name stem\n\n`);
  process.stdout.write(`Optional:\n`);
  process.stdout.write(`  --target-width <mm>           Default: 120\n`);
  process.stdout.write(`  --base-margin <mm>            Default: 4\n`);
  process.stdout.write(`  --base-thickness <mm>         Default: 2\n`);
  process.stdout.write(`  --relief-height <mm>          Default: 2.4\n`);
  process.stdout.write(`  --base-corner-radius <mm>     Default: 3\n`);
  process.stdout.write(`  --artwork-offset <mm>         Default: 0.25\n`);
  process.stdout.write(`  --threshold <percent>         Default: 55\n`);
}

function fail(message) {
  throw new Error(message);
}

function parseNumber(value, label) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    fail(`${label} must be a valid number.`);
  }
  return parsed;
}

function parseArgs(argv) {
  const options = {
    input: null,
    outputDir: null,
    name: null,
    ...defaultParameters,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];

    if (argument === "--help" || argument === "-h") {
      options.help = true;
      continue;
    }

    const nextValue = argv[index + 1];
    if (nextValue == null) {
      fail(`Missing value for ${argument}.`);
    }

    switch (argument) {
      case "--input":
        options.input = nextValue;
        index += 1;
        break;
      case "--output-dir":
        options.outputDir = nextValue;
        index += 1;
        break;
      case "--name":
        options.name = nextValue;
        index += 1;
        break;
      case "--target-width":
        options.targetWidth = parseNumber(nextValue, "--target-width");
        index += 1;
        break;
      case "--base-margin":
        options.baseMargin = parseNumber(nextValue, "--base-margin");
        index += 1;
        break;
      case "--base-thickness":
        options.baseThickness = parseNumber(nextValue, "--base-thickness");
        index += 1;
        break;
      case "--relief-height":
        options.reliefHeight = parseNumber(nextValue, "--relief-height");
        index += 1;
        break;
      case "--base-corner-radius":
        options.baseCornerRadius = parseNumber(nextValue, "--base-corner-radius");
        index += 1;
        break;
      case "--artwork-offset":
        options.artworkOffset = parseNumber(nextValue, "--artwork-offset");
        index += 1;
        break;
      case "--threshold":
        options.threshold = parseNumber(nextValue, "--threshold");
        index += 1;
        break;
      default:
        fail(`Unknown argument: ${argument}`);
    }
  }

  return options;
}

function emitProgress(event) {
  process.stdout.write(`${JSON.stringify(event)}\n`);
}

async function runCommand(command, args, { cwd = repoRoot } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd });
    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });

    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });

    child.on("error", (error) => {
      reject(error);
    });

    child.on("close", (code) => {
      if (code === 0) {
        resolve({ stdout, stderr });
        return;
      }

      const combinedOutput = [stderr.trim(), stdout.trim()].filter(Boolean).join("\n");
      reject(new Error(combinedOutput || `${command} exited with code ${code}.`));
    });
  });
}

async function captureVersion(command, args) {
  try {
    const { stdout, stderr } = await runCommand(command, args);
    return (stdout || stderr).trim().split("\n")[0] ?? null;
  } catch {
    return null;
  }
}

async function captureOpenScadVersion() {
  const commonScriptPath = path.join(openscadToolsDir, "common.sh");
  return captureVersion("/bin/bash", ["-lc", `. "${commonScriptPath}" && openscad_version`]);
}

async function ensureCommandAvailable(command, versionArgs = ["--version"]) {
  try {
    await runCommand(command, versionArgs);
  } catch (error) {
    fail(`Required command is unavailable: ${command}. ${error.message}`);
  }
}

async function readPngSignature(filePath) {
  const fileHandle = await fs.open(filePath, "r");
  try {
    const buffer = Buffer.alloc(8);
    const { bytesRead } = await fileHandle.read(buffer, 0, 8, 0);
    if (bytesRead < 8) {
      return null;
    }
    return [...buffer];
  } finally {
    await fileHandle.close();
  }
}

function isPngSignature(signature) {
  return JSON.stringify(signature) === JSON.stringify([137, 80, 78, 71, 13, 10, 26, 10]);
}

async function assertFileExists(filePath, description) {
  let stats;
  try {
    stats = await fs.stat(filePath);
  } catch {
    fail(`${description} was not created: ${filePath}`);
  }

  if (!stats.isFile() || stats.size === 0) {
    fail(`${description} is empty: ${filePath}`);
  }
}

function sanitizeArtifactName(name) {
  const sanitized = String(name)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  if (!sanitized) {
    fail(`--name must contain at least one alphanumeric character.`);
  }

  return sanitized;
}

function parseSvgDimensions(svgSource) {
  const viewBoxMatch = svgSource.match(/viewBox\s*=\s*"([^"]+)"/i);
  if (viewBoxMatch) {
    const values = viewBoxMatch[1].trim().split(/[\s,]+/).map(Number);
    if (values.length === 4 && values.every(Number.isFinite) && values[2] > 0 && values[3] > 0) {
      return { width: values[2], height: values[3] };
    }
  }

  const widthMatch = svgSource.match(/width\s*=\s*"([^"]+)"/i);
  const heightMatch = svgSource.match(/height\s*=\s*"([^"]+)"/i);
  const width = widthMatch ? Number.parseFloat(widthMatch[1]) : NaN;
  const height = heightMatch ? Number.parseFloat(heightMatch[1]) : NaN;

  if (Number.isFinite(width) && Number.isFinite(height) && width > 0 && height > 0) {
    return { width, height };
  }

  fail(`Could not determine SVG bounds from the cleaned SVG.`);
}

function toPosixRelativePath(fromDir, targetPath) {
  return path.relative(fromDir, targetPath).split(path.sep).join("/");
}

function buildScadWrapper({ relativeSvgPath, sourceArtworkWidth, sourceArtworkHeight, parameters }) {
  return `/* [Export] */
export_part = "all";       // [all, base, artwork]

/* [Size] */
target_width = ${parameters.targetWidth};        // [40:1:220] Final artwork width in mm
base_margin = ${parameters.baseMargin};          // [0:0.5:15] Border around the artwork

/* [Heights] */
base_thickness = ${parameters.baseThickness};    // [1:0.2:6] Flat backing plate thickness
relief_height = ${parameters.reliefHeight};      // [0.6:0.2:8] Raised artwork height above the base

/* [Shape] */
base_corner_radius = ${parameters.baseCornerRadius}; // [0:0.5:12] Rounded backing plate corners
artwork_offset = ${parameters.artworkOffset};    // [-0.5:0.05:1.5] Grow/shrink artwork contours in mm
show_base = true;                                // Add a backing plate

/* [Preview Colors] */
base_color = "#f8f5ef";    // STL exports do not preserve preview color.
artwork_color = "#111111"; // Assign print colors in the slicer after export.

source_artwork_width = ${sourceArtworkWidth};
source_artwork_height = ${sourceArtworkHeight};
epsilon = 0.01;

function artwork_scale_factor() = target_width / source_artwork_width;
function scaled_artwork_height() = source_artwork_height * artwork_scale_factor();
function base_plate_width() = target_width + base_margin * 2;
function base_plate_height() = scaled_artwork_height() + base_margin * 2;
function clamped_corner_radius() = min(base_corner_radius, min(base_plate_width(), base_plate_height()) / 2);
function artwork_export_bottom_z() = show_base && export_part == "all" ? base_thickness - epsilon / 2 : 0;

main();

module main() {
    if (export_part == "base") {
        backing_plate_3d();
    } else if (export_part == "artwork") {
        raised_artwork_3d();
    } else {
        if (show_base) {
            color(base_color) {
                backing_plate_3d();
            }
        }

        color(artwork_color) {
            raised_artwork_3d();
        }
    }
}

module backing_plate_3d() {
    linear_extrude(height = base_thickness)
        centered_backing_plate_2d();
}

module raised_artwork_3d() {
    translate([0, 0, artwork_export_bottom_z()])
        linear_extrude(height = relief_height + epsilon)
            artwork_profile_2d();
}

module artwork_profile_2d() {
    if (artwork_offset == 0) {
        centered_artwork_2d();
    } else {
        offset(delta = artwork_offset)
            centered_artwork_2d();
    }
}

module centered_artwork_2d() {
    translate([-target_width / 2, -scaled_artwork_height() / 2])
        scale([artwork_scale_factor(), artwork_scale_factor()])
            import("${relativeSvgPath}");
}

module centered_backing_plate_2d() {
    if (clamped_corner_radius() <= 0) {
        square([base_plate_width(), base_plate_height()], center = true);
    } else {
        offset(r = clamped_corner_radius())
            square(
                [
                    base_plate_width() - clamped_corner_radius() * 2,
                    base_plate_height() - clamped_corner_radius() * 2,
                ],
                center = true
            );
    }
}
`;
}

function createManifest({ options, outputDir, modelPath, manifestPath }) {
  return {
    pathway: "artwork",
    status: "running",
    startedAt: new Date().toISOString(),
    completedAt: null,
    manifestPath,
    parameters: {
      targetWidth: options.targetWidth,
      baseMargin: options.baseMargin,
      baseThickness: options.baseThickness,
      reliefHeight: options.reliefHeight,
      baseCornerRadius: options.baseCornerRadius,
      artworkOffset: options.artworkOffset,
      threshold: options.threshold,
    },
    artifacts: {
      inputPng: options.input,
      refinedPng: null,
      potraceInputPbm: null,
      tracedSvg: null,
      cleanedSvg: null,
      finalScad: modelPath,
      previewImages: [],
      stl: null,
      cadViewerUrl: null,
    },
    stages: {},
    timingsMs: {},
    versions: {
      magick: null,
      potrace: null,
      openscad: null,
    },
  };
}

async function writeManifest(manifest) {
  await fs.writeFile(manifest.manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
}

async function runStage(manifest, stageName, action, message) {
  const stageKey = stageKeyByName[stageName] ?? stageName;
  manifest.stages[stageName] = "running";
  emitProgress({ type: "stage", stage: stageKey, status: "active", message });
  const startedAt = Date.now();

  try {
    const result = await action();
    manifest.stages[stageName] = "completed";
    manifest.timingsMs[stageName] = Date.now() - startedAt;
    await writeManifest(manifest);
    emitProgress({
      type: "stage",
      stage: stageKey,
      status: "completed",
      message: `${message} complete.`,
    });
    return result;
  } catch (error) {
    manifest.stages[stageName] = "failed";
    manifest.timingsMs[stageName] = Date.now() - startedAt;
    manifest.status = "failed";
    manifest.completedAt = new Date().toISOString();
    await writeManifest(manifest);
    emitProgress({
      type: "stage",
      stage: stageKey,
      status: "failed",
      message: error.message,
    });
    throw error;
  }
}

async function main() {
  const options = parseArgs(process.argv.slice(2));

  if (options.help) {
    printHelp();
    return;
  }

  if (!options.input || !options.outputDir || !options.name) {
    fail(`--input, --output-dir, and --name are required.`);
  }

  options.input = path.resolve(repoRoot, options.input);
  options.outputDir = path.resolve(repoRoot, options.outputDir);
  options.name = sanitizeArtifactName(options.name);

  const inputStats = await fs.stat(options.input).catch(() => null);
  if (!inputStats?.isFile()) {
    fail(`Input PNG was not found: ${options.input}`);
  }

  if (path.extname(options.input).toLowerCase() !== ".png") {
    fail(`Input file must end in .png.`);
  }

  const signature = await readPngSignature(options.input);
  if (!isPngSignature(signature)) {
    fail(`Input file is not a valid PNG.`);
  }

  await ensureCommandAvailable("magick");
  await ensureCommandAvailable("potrace", ["--version"]);
  await fs.mkdir(options.outputDir, { recursive: true });
  await fs.mkdir(modelsDir, { recursive: true });

  const manifestPath = path.join(options.outputDir, "manifest.json");
  const modelPath = path.join(modelsDir, `${options.name}-svg-final.scad`);
  const refinedPngPath = path.join(options.outputDir, `${options.name}-refined.png`);
  const potraceInputPath = path.join(options.outputDir, `${options.name}-potrace-input.pbm`);
  const tracedSvgPath = path.join(options.outputDir, `${options.name}-potrace.svg`);
  const cleanedSvgPath = path.join(options.outputDir, `${options.name}-openscad-clean.svg`);
  const previewDir = path.join(options.outputDir, "preview");
  const stlPath = path.join(options.outputDir, `${options.name}.stl`);

  const manifest = createManifest({ options, outputDir: options.outputDir, modelPath, manifestPath });
  manifest.versions.magick = await captureVersion("magick", ["--version"]);
  manifest.versions.potrace = await captureVersion("potrace", ["--version"]);
  manifest.versions.openscad = await captureOpenScadVersion();
  await writeManifest(manifest);

  await runStage(manifest, "preprocess", async () => {
    await runCommand("magick", [
      options.input,
      "-background",
      "white",
      "-alpha",
      "remove",
      "-alpha",
      "off",
      "-colorspace",
      "Gray",
      "-contrast-stretch",
      "0.5%x0.5%",
      "-threshold",
      `${options.threshold}%`,
      refinedPngPath,
    ]);
    await runCommand("magick", [refinedPngPath, "-compress", "none", potraceInputPath]);
    await assertFileExists(refinedPngPath, "Refined PNG");
    await assertFileExists(potraceInputPath, "Potrace PBM");
    manifest.artifacts.refinedPng = refinedPngPath;
    manifest.artifacts.potraceInputPbm = potraceInputPath;
  }, "Preparing a trace-ready monochrome source");

  await runStage(manifest, "vectorize", async () => {
    await runCommand("potrace", [potraceInputPath, "--svg", "--tight", "--output", tracedSvgPath]);
    await assertFileExists(tracedSvgPath, "Traced SVG");
    const tracedSvgSource = await fs.readFile(tracedSvgPath, "utf8");
    if (!/<path\b/i.test(tracedSvgSource)) {
      fail(`Traced SVG does not contain any path geometry.`);
    }
    manifest.artifacts.tracedSvg = tracedSvgPath;
  }, "Tracing vector paths with potrace");

  let cleanedSvgDimensions = null;
  await runStage(manifest, "normalize_svg", async () => {
    const tracedSvgSource = await fs.readFile(tracedSvgPath, "utf8");
    const cleanedSvgSource = tracedSvgSource.replace(/<image\b[^>]*>(?:[\s\S]*?<\/image>)?/gi, "").replace(/<image\b[^>]*\/?>/gi, "");
    await fs.writeFile(cleanedSvgPath, cleanedSvgSource);
    await assertFileExists(cleanedSvgPath, "Clean SVG");
    if (!/<path\b/i.test(cleanedSvgSource)) {
      fail(`Clean SVG does not contain any path geometry.`);
    }
    if (/<image\b/i.test(cleanedSvgSource)) {
      fail(`Clean SVG still contains embedded raster content.`);
    }
    cleanedSvgDimensions = parseSvgDimensions(cleanedSvgSource);
    manifest.artifacts.cleanedSvg = cleanedSvgPath;
  }, "Normalizing the SVG for OpenSCAD import");

  await runStage(manifest, "build_scad", async () => {
    const relativeSvgPath = toPosixRelativePath(path.dirname(modelPath), cleanedSvgPath);
    const scadSource = buildScadWrapper({
      relativeSvgPath,
      sourceArtworkWidth: cleanedSvgDimensions.width,
      sourceArtworkHeight: cleanedSvgDimensions.height,
      parameters: options,
    });
    await fs.writeFile(modelPath, scadSource);
    await assertFileExists(modelPath, "OpenSCAD wrapper");
  }, "Building the final OpenSCAD wrapper");

  await runStage(manifest, "validate_scad", async () => {
    await runCommand(path.join(openscadToolsDir, "validate.sh"), [modelPath]);
  }, "Validating the OpenSCAD wrapper");

  await runStage(manifest, "render_previews", async () => {
    await fs.mkdir(previewDir, { recursive: true });
    await runCommand(path.join(openscadToolsDir, "multi-preview.sh"), [modelPath, previewDir]);
    const previewEntries = await fs.readdir(previewDir);
    const previewImages = previewEntries
      .filter((entry) => entry.toLowerCase().endsWith(".png"))
      .sort()
      .map((entry) => path.join(previewDir, entry));
    if (previewImages.length === 0) {
      fail(`Preview generation did not produce any PNG files.`);
    }
    manifest.artifacts.previewImages = previewImages;
  }, "Rendering multi-angle previews");

  await runStage(manifest, "export_stl", async () => {
    await runCommand(path.join(openscadToolsDir, "export-stl.sh"), [modelPath, stlPath]);
    await assertFileExists(stlPath, "STL export");
    manifest.artifacts.stl = stlPath;
  }, "Exporting STL geometry");

  await runStage(manifest, "cad_viewer", async () => {
    const cadViewerUrl = await createCadViewerUrlForFile({
      repoRoot,
      scriptDir: cadViewerScriptDir,
      artifactRoot: options.outputDir,
      filePath: stlPath,
    });
    manifest.artifacts.cadViewerUrl = cadViewerUrl;
  }, "Creating the CAD Viewer handoff");

  manifest.status = "completed";
  manifest.completedAt = new Date().toISOString();
  await writeManifest(manifest);
  emitProgress({
    type: "result",
    status: "completed",
    manifestPath,
    cadViewerUrl: manifest.artifacts.cadViewerUrl,
    stlPath: manifest.artifacts.stl,
  });
}

main().catch(async (error) => {
  emitProgress({
    type: "result",
    status: "failed",
    error: error.message,
  });
  process.exitCode = 1;
});
