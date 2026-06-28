import { spawn } from "node:child_process";
import path from "node:path";

export const cadViewerHost = "127.0.0.1";
export const cadViewerStartPort = 4178;

export async function probeCadViewerServer(portNumber) {
  try {
    const response = await fetch(`http://${cadViewerHost}:${portNumber}/__cad/server`, {
      signal: AbortSignal.timeout(1500),
    });

    if (!response.ok) {
      return null;
    }

    const payload = await response.json();

    if (
      payload?.app === "cad-viewer" &&
      payload?.dynamicRoot === true &&
      Number(payload?.serverApiVersion ?? 0) >= 2
    ) {
      return `http://${cadViewerHost}:${portNumber}`;
    }
  } catch {
    return null;
  }

  return false;
}

export async function ensureCadViewerBaseUrl({ repoRoot, scriptDir }) {
  for (let portNumber = cadViewerStartPort; portNumber < cadViewerStartPort + 10; portNumber += 1) {
    const existingBaseUrl = await probeCadViewerServer(portNumber);

    if (typeof existingBaseUrl === "string") {
      return existingBaseUrl;
    }

    if (existingBaseUrl === false) {
      continue;
    }

    const child = spawn(
      "npm",
      [
        "--prefix",
        scriptDir,
        "run",
        "start",
        "--",
        "--host",
        cadViewerHost,
        "--port",
        String(portNumber),
        "--shutdown-after",
        "12h",
      ],
      {
        cwd: repoRoot,
        detached: true,
        stdio: "ignore",
      },
    );

    child.unref();

    for (let attempt = 0; attempt < 20; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 500));
      const startedBaseUrl = await probeCadViewerServer(portNumber);

      if (typeof startedBaseUrl === "string") {
        return startedBaseUrl;
      }
    }
  }

  return null;
}

export async function createCadViewerUrlForFile({ repoRoot, scriptDir, artifactRoot, filePath }) {
  const baseUrl = await ensureCadViewerBaseUrl({ repoRoot, scriptDir });

  if (!baseUrl) {
    return null;
  }

  const directoryRoot = artifactRoot ?? path.dirname(filePath);
  return `${baseUrl}/?dir=${encodeURIComponent(directoryRoot)}&file=${encodeURIComponent(filePath)}`;
}
