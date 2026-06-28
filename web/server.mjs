import http from "node:http";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { createCadViewerUrlForFile } from "./cad-viewer.mjs";

const __filename = fileURLToPath(import.meta.url);
const webRoot = path.dirname(__filename);
const repoRoot = path.resolve(webRoot, "..");
const publicDir = path.join(webRoot, "public");
const uploadsDir = path.join(webRoot, "uploads");
const exportsDir = path.join(repoRoot, "exports");
const cadViewerScriptDir = path.join(repoRoot, ".agents", "skills", "cad-viewer", "scripts", "viewer");
const pipelineScriptPath = path.join(repoRoot, "scripts", "artwork-relief-pipeline.mjs");
const port = Number(process.env.PORT || 4317);

const stageOrderByPathway = {
  artwork: [
    "upload",
    "choice",
    "magicimage",
    "potrace",
    "svg_cleanup",
    "openscad_build",
    "validate",
    "preview",
    "stl_export",
    "cad_viewer",
  ],
  technicaldrawing: [
    "upload",
    "choice",
    "openscad_build",
    "validate",
    "preview",
    "stl_export",
    "cad_viewer",
  ],
};

const stageLabels = {
  upload: "Upload",
  choice: "Choice",
  magicimage: "Image Cleanup",
  potrace: "Vector Trace",
  svg_cleanup: "SVG Cleanup",
  openscad_build: "OpenSCAD Build",
  validate: "Validate",
  preview: "Preview",
  stl_export: "STL Export",
  cad_viewer: "CAD Viewer",
};

const staticFiles = {
  "/": { file: path.join(publicDir, "index.html"), type: "text/html; charset=utf-8" },
  "/styles.css": { file: path.join(publicDir, "styles.css"), type: "text/css; charset=utf-8" },
  "/app.js": { file: path.join(publicDir, "app.js"), type: "text/javascript; charset=utf-8" },
};

const terminalStatuses = new Set(["completed", "failed"]);
const pngSignature = [137, 80, 78, 71, 13, 10, 26, 10];

const jobs = new Map();
let activeJobId = null;

await fs.mkdir(uploadsDir, { recursive: true });
await fs.mkdir(exportsDir, { recursive: true });

function createStages(pathway) {
  return stageOrderByPathway[pathway].map((key) => ({
    key,
    label: stageLabels[key],
    status: key === "upload" || key === "choice" ? "completed" : "pending",
  }));
}

function createJob({ fileName, pathway, storedFilePath, outputDir, artifactName }) {
  const jobId = randomUUID();

  return {
    id: jobId,
    runId: jobId.slice(0, 8),
    fileName,
    pathway,
    storedFilePath,
    outputDir,
    artifactName,
    status: "starting",
    statusLine: "Saved the file locally. Starting the deterministic pipeline.",
    cadViewerUrl: null,
    stlPath: null,
    scadPath: null,
    error: null,
    stages: createStages(pathway),
    currentStageKey: null,
    clients: new Set(),
    lastSnapshot: "",
    manifestPath: null,
    childProcess: null,
    stderrBuffer: "",
  };
}

function snapshotJob(job) {
  return {
    jobId: job.id,
    runId: job.runId,
    sessionId: null,
    fileName: job.fileName,
    pathway: job.pathway,
    status: job.status,
    statusLine: job.statusLine,
    cadViewerUrl: job.cadViewerUrl,
    stlPath: job.stlPath,
    scadPath: job.scadPath,
    error: job.error,
    stages: job.stages,
  };
}

function emitJob(job) {
  const payload = JSON.stringify(snapshotJob(job));
  if (payload === job.lastSnapshot) {
    return;
  }

  job.lastSnapshot = payload;

  for (const client of [...job.clients]) {
    if (client.destroyed || client.writableEnded) {
      job.clients.delete(client);
      continue;
    }

    client.write(`data: ${payload}\n\n`);
  }
}

function getStage(job, key) {
  return job.stages.find((stage) => stage.key === key) ?? null;
}

function setStageActive(job, key, statusLine) {
  const nextIndex = job.stages.findIndex((stage) => stage.key === key);
  if (nextIndex === -1) {
    return;
  }

  for (let index = 0; index < nextIndex; index += 1) {
    if (job.stages[index].status === "pending" || job.stages[index].status === "active") {
      job.stages[index].status = "completed";
    }
  }

  const nextStage = job.stages[nextIndex];
  if (nextStage.status !== "completed") {
    nextStage.status = "active";
  }

  job.currentStageKey = key;
  if (!terminalStatuses.has(job.status)) {
    job.status = "running";
  }

  if (statusLine) {
    job.statusLine = statusLine;
  }

  emitJob(job);
}

function completeStage(job, key, statusLine) {
  const stage = getStage(job, key);
  if (!stage) {
    return;
  }

  stage.status = "completed";
  if (job.currentStageKey === key) {
    job.currentStageKey = null;
  }

  if (statusLine) {
    job.statusLine = statusLine;
  }

  emitJob(job);
}

function failJob(job, message, stageKey = job.currentStageKey ?? "cad_viewer") {
  if (job.status === "failed") {
    return;
  }

  const stage = getStage(job, stageKey);
  if (stage) {
    stage.status = "failed";
  }

  job.status = "failed";
  job.error = message;
  job.statusLine = message;
  job.currentStageKey = stageKey;
  emitJob(job);
}

function completeJob(job, { cadViewerUrl, stlPath, scadPath }) {
  const stage = getStage(job, "cad_viewer");
  if (stage && stage.status !== "completed") {
    stage.status = cadViewerUrl ? "completed" : "failed";
  }

  job.cadViewerUrl = cadViewerUrl;
  job.stlPath = stlPath;
  job.scadPath = scadPath;

  if (!cadViewerUrl) {
    failJob(job, "Run completed, but CAD Viewer did not return a valid handoff link.", "cad_viewer");
    return;
  }

  job.status = "completed";
  job.error = null;
  job.currentStageKey = null;
  job.statusLine = "Deterministic pipeline completed. CAD Viewer handoff ready.";
  emitJob(job);
}

function activeJob() {
  return activeJobId ? jobs.get(activeJobId) ?? null : null;
}

function isJobRunning() {
  const job = activeJob();
  return Boolean(job && !terminalStatuses.has(job.status));
}

function sanitizeBaseName(fileName) {
  const stem = path.basename(fileName, path.extname(fileName));
  const safeStem = stem
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return safeStem || "upload";
}

function buildStoredFileName(originalFileName) {
  const stamp = new Date().toISOString().replace(/[.:]/g, "-");
  return `${stamp}-${sanitizeBaseName(originalFileName)}.png`;
}

function isPngBuffer(buffer) {
  if (buffer.byteLength < pngSignature.length) {
    return false;
  }

  return pngSignature.every((value, index) => buffer[index] === value);
}

function normalizeError(error) {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  if (typeof error === "string") {
    return error;
  }

  return "Unexpected pipeline failure.";
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

    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve({ stdout, stderr });
        return;
      }

      reject(new Error((stderr || stdout).trim() || `${command} exited with code ${code}.`));
    });
  });
}

async function parseFormData(req, pathname) {
  const headers = new Headers();

  for (const [key, value] of Object.entries(req.headers)) {
    if (Array.isArray(value)) {
      headers.set(key, value.join(", "));
      continue;
    }

    if (typeof value === "string") {
      headers.set(key, value);
    }
  }

  const request = new Request(new URL(pathname, "http://127.0.0.1"), {
    method: req.method,
    headers,
    body: req,
    duplex: "half",
  });

  return request.formData();
}

async function readManifest(manifestPath) {
  const contents = await fs.readFile(manifestPath, "utf8");
  return JSON.parse(contents);
}

async function finalizeFromManifest(job, manifestPath, pipelineResult = {}) {
  job.manifestPath = manifestPath;
  const manifest = await readManifest(manifestPath);

  const manifestStlPath = manifest?.artifacts?.stl ?? pipelineResult.stlPath ?? null;
  const manifestScadPath = manifest?.artifacts?.finalScad ?? null;
  let manifestCadViewerUrl = manifest?.artifacts?.cadViewerUrl ?? pipelineResult.cadViewerUrl ?? null;

  if (!manifestCadViewerUrl && manifestStlPath) {
    manifestCadViewerUrl = await createCadViewerUrlForFile({
      repoRoot,
      scriptDir: cadViewerScriptDir,
      artifactRoot: job.outputDir,
      filePath: manifestStlPath,
    });
  }

  completeJob(job, {
    cadViewerUrl: manifestCadViewerUrl,
    stlPath: manifestStlPath,
    scadPath: manifestScadPath,
  });
}

async function createCadBundle(job) {
  if (!job.manifestPath || !job.scadPath) {
    throw new Error("No CAD source bundle is available for this job yet.");
  }

  const manifest = await readManifest(job.manifestPath);
  const cleanedSvgPath = manifest?.artifacts?.cleanedSvg;

  if (!cleanedSvgPath) {
    throw new Error("The CAD source SVG is missing from the manifest.");
  }

  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "cad-bundle-"));
  const bundleRoot = path.join(tempRoot, `${job.artifactName}-cad-bundle`);
  const bundleScadPath = path.join(bundleRoot, path.relative(repoRoot, job.scadPath));
  const bundleSvgPath = path.join(bundleRoot, path.relative(repoRoot, cleanedSvgPath));
  const bundleManifestPath = path.join(bundleRoot, path.relative(repoRoot, job.manifestPath));
  const bundleZipPath = path.join(tempRoot, `${job.artifactName}-cad-bundle.zip`);

  await fs.mkdir(path.dirname(bundleScadPath), { recursive: true });
  await fs.mkdir(path.dirname(bundleSvgPath), { recursive: true });
  await fs.mkdir(path.dirname(bundleManifestPath), { recursive: true });
  await fs.copyFile(job.scadPath, bundleScadPath);
  await fs.copyFile(cleanedSvgPath, bundleSvgPath);
  await fs.copyFile(job.manifestPath, bundleManifestPath);

  try {
    await runCommand("zip", ["-rq", bundleZipPath, path.basename(bundleRoot)], { cwd: tempRoot });
    const contents = await fs.readFile(bundleZipPath);
    return {
      contents,
      fileName: `${job.artifactName}-cad-bundle.zip`,
      contentType: "application/zip",
    };
  } finally {
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
}

async function handlePipelineMessage(job, event) {
  if (event.type === "stage") {
    if (!event.stage) {
      return;
    }

    if (event.status === "active") {
      setStageActive(job, event.stage, event.message);
      return;
    }

    if (event.status === "completed") {
      completeStage(job, event.stage, event.message);
      return;
    }

    if (event.status === "failed") {
      failJob(job, event.message || `Failed during ${stageLabels[event.stage] ?? event.stage}.`, event.stage);
    }

    return;
  }

  if (event.type === "result") {
    if (event.status === "completed") {
      if (!event.manifestPath) {
        failJob(job, "Pipeline completed without a manifest path.", "cad_viewer");
        return;
      }

      await finalizeFromManifest(job, event.manifestPath, event);
      return;
    }

    if (event.status === "failed") {
      failJob(job, event.error || "Deterministic pipeline failed.");
    }
  }
}

function startJobRun(job) {
  const child = spawn(
    process.execPath,
    [
      pipelineScriptPath,
      "--input",
      job.storedFilePath,
      "--output-dir",
      job.outputDir,
      "--name",
      job.artifactName,
    ],
    {
      cwd: repoRoot,
      stdio: ["ignore", "pipe", "pipe"],
    },
  );

  job.childProcess = child;
  job.status = "running";
  job.statusLine = "Launching the deterministic artwork pipeline.";
  emitJob(job);

  let stdoutBuffer = "";

  child.stdout.on("data", (chunk) => {
    stdoutBuffer += chunk.toString();
    const lines = stdoutBuffer.split("\n");
    stdoutBuffer = lines.pop() ?? "";

    for (const line of lines) {
      const trimmedLine = line.trim();
      if (!trimmedLine) {
        continue;
      }

      try {
        const event = JSON.parse(trimmedLine);
        void handlePipelineMessage(job, event);
      } catch {
        job.statusLine = trimmedLine;
        emitJob(job);
      }
    }
  });

  child.stderr.on("data", (chunk) => {
    job.stderrBuffer += chunk.toString();
  });

  child.on("error", (error) => {
    failJob(job, normalizeError(error));
  });

  child.on("close", async (code) => {
    if (stdoutBuffer.trim()) {
      try {
        await handlePipelineMessage(job, JSON.parse(stdoutBuffer.trim()));
      } catch {
        // Ignore trailing non-JSON output.
      }
    }

    if (!terminalStatuses.has(job.status) && code !== 0) {
      const stderrMessage = job.stderrBuffer.trim();
      failJob(job, stderrMessage || `Deterministic pipeline exited with code ${code}.`);
      return;
    }

    if (!terminalStatuses.has(job.status) && job.manifestPath) {
      try {
        await finalizeFromManifest(job, job.manifestPath);
      } catch (error) {
        failJob(job, `Failed to read the pipeline manifest: ${normalizeError(error)}`, "cad_viewer");
      }
    }
  });
}

async function handleCreateJob(req, res, pathname) {
  if (isJobRunning()) {
    sendJson(res, 409, { error: "Only one active job is supported at a time." });
    return;
  }

  let formData;

  try {
    formData = await parseFormData(req, pathname);
  } catch {
    sendJson(res, 400, { error: "Expected multipart form data with one file." });
    return;
  }

  const pathway = formData.get("pathway");
  const files = formData.getAll("file");

  if (pathway !== "artwork" && pathway !== "technicaldrawing") {
    sendJson(res, 400, { error: "Choose either artwork or technicaldrawing." });
    return;
  }

  if (pathway !== "artwork") {
    sendJson(res, 400, {
      error: "Deterministic mode currently supports the Artwork pathway only.",
    });
    return;
  }

  if (files.length !== 1) {
    sendJson(res, 400, { error: "Upload exactly one file." });
    return;
  }

  const uploadedFile = files[0];
  if (!(uploadedFile instanceof File)) {
    sendJson(res, 400, { error: "Missing file upload." });
    return;
  }

  if (uploadedFile.type !== "image/png" || !/\.png$/i.test(uploadedFile.name)) {
    sendJson(res, 400, { error: "Only PNG uploads are supported right now." });
    return;
  }

  const buffer = Buffer.from(await uploadedFile.arrayBuffer());
  if (!isPngBuffer(buffer)) {
    sendJson(res, 400, { error: "The uploaded file is not a valid PNG." });
    return;
  }

  const storedFilePath = path.join(uploadsDir, buildStoredFileName(uploadedFile.name));
  await fs.writeFile(storedFilePath, buffer);

  const artifactName = sanitizeBaseName(uploadedFile.name);
  const jobOutputDir = path.join(exportsDir, `${new Date().toISOString().replace(/[.:]/g, "-")}-${artifactName}`);

  const job = createJob({
    fileName: uploadedFile.name,
    pathway,
    storedFilePath,
    outputDir: jobOutputDir,
    artifactName,
  });

  jobs.set(job.id, job);
  activeJobId = job.id;

  try {
    startJobRun(job);
    sendJson(res, 200, snapshotJob(job));
  } catch (error) {
    jobs.delete(job.id);
    activeJobId = null;
    sendJson(res, 500, { error: normalizeError(error) });
  }
}

function attachSseClient(job, res) {
  res.writeHead(200, {
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
  });

  job.clients.add(res);
  res.write("retry: 1000\n\n");
  res.write(`data: ${JSON.stringify(snapshotJob(job))}\n\n`);

  const heartbeat = setInterval(() => {
    if (!res.destroyed) {
      res.write(": keepalive\n\n");
    }
  }, 15000);

  res.on("close", () => {
    clearInterval(heartbeat);
    job.clients.delete(res);
  });
}

function sendJson(res, statusCode, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body),
  });
  res.end(body);
}

async function serveStatic(res, fileInfo) {
  try {
    const contents = await fs.readFile(fileInfo.file);
    res.writeHead(200, { "Content-Type": fileInfo.type });
    res.end(contents);
  } catch {
    res.writeHead(404);
    res.end("Not found");
  }
}

async function handleDownloadJobArtifact(res, job, artifactType) {
  if (artifactType === "cad") {
    let cadBundle;

    try {
      cadBundle = await createCadBundle(job);
    } catch (error) {
      sendJson(res, 404, { error: normalizeError(error) });
      return;
    }

    res.writeHead(200, {
      "Content-Type": cadBundle.contentType,
      "Content-Length": cadBundle.contents.byteLength,
      "Content-Disposition": `attachment; filename="${cadBundle.fileName}"`,
    });
    res.end(cadBundle.contents);
    return;
  }

  const filePath = job.stlPath;

  if (!filePath) {
    sendJson(res, 404, {
      error: "No STL is available for this job yet.",
    });
    return;
  }

  let contents;

  try {
    contents = await fs.readFile(filePath);
  } catch {
    sendJson(res, 404, {
      error: "The STL file could not be found on disk.",
    });
    return;
  }

  res.writeHead(200, {
    "Content-Type": "model/stl",
    "Content-Length": contents.byteLength,
    "Content-Disposition": `attachment; filename="${path.basename(filePath)}"`,
  });
  res.end(contents);
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "127.0.0.1"}`);
  const pathname = url.pathname;

  try {
    if (req.method === "POST" && pathname === "/api/jobs") {
      await handleCreateJob(req, res, pathname);
      return;
    }

    const eventsMatch = pathname.match(/^\/api\/jobs\/([^/]+)\/events$/);
    if (req.method === "GET" && eventsMatch) {
      const job = jobs.get(eventsMatch[1]);

      if (!job) {
        sendJson(res, 404, { error: "Unknown job." });
        return;
      }

      attachSseClient(job, res);
      return;
    }

    const downloadMatch = pathname.match(/^\/api\/jobs\/([^/]+)\/download(?:\/(stl|cad))?$/);
    if (req.method === "GET" && downloadMatch) {
      const job = jobs.get(downloadMatch[1]);

      if (!job) {
        sendJson(res, 404, { error: "Unknown job." });
        return;
      }

      await handleDownloadJobArtifact(res, job, downloadMatch[2] ?? "stl");
      return;
    }

    const jobMatch = pathname.match(/^\/api\/jobs\/([^/]+)$/);
    if (req.method === "GET" && jobMatch) {
      const job = jobs.get(jobMatch[1]);

      if (!job) {
        sendJson(res, 404, { error: "Unknown job." });
        return;
      }

      sendJson(res, 200, snapshotJob(job));
      return;
    }

    if (req.method === "GET" && staticFiles[pathname]) {
      await serveStatic(res, staticFiles[pathname]);
      return;
    }

    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Not found");
  } catch (error) {
    sendJson(res, 500, { error: normalizeError(error) });
  }
});

server.listen(port, "127.0.0.1", () => {
  console.log(`Local Workshop listening on http://127.0.0.1:${port}`);
});

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    const job = activeJob();
    if (job?.childProcess && !job.childProcess.killed) {
      job.childProcess.kill("SIGTERM");
    }

    server.close(() => process.exit(0));
  });
}
