const STAGE_LABELS = {
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

const STAGE_ORDERS = {
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

const PATHWAY_COPY = {
  artwork: {
    label: "Artwork",
    headline: "Deterministic Relief Pipeline",
    summary: "The local pipeline is turning your artwork into an editable OpenSCAD source bundle and printable STL.",
  },
  technicaldrawing: {
    label: "Technical Drawing",
    headline: "Rebuilding a technical drawing run.",
    summary: "The blueprint track is reconstructing geometry directly in OpenSCAD before validation and export.",
  },
};

const dom = {
  body: document.body,
  heroPanel: document.getElementById("heroPanel"),
  runLayout: document.getElementById("runLayout"),
  fileInput: document.getElementById("fileInput"),
  selectedFile: document.getElementById("selectedFile"),
  formError: document.getElementById("formError"),
  choiceDialog: document.getElementById("choiceDialog"),
  choiceFileName: document.getElementById("choiceFileName"),
  chooseAnotherButton: document.getElementById("chooseAnotherButton"),
  statusChip: document.getElementById("statusChip"),
  runHeadline: document.getElementById("runHeadline"),
  summaryFile: document.getElementById("summaryFile"),
  summaryPathway: document.getElementById("summaryPathway"),
  summaryProgress: document.getElementById("summaryProgress"),
  summarySession: document.getElementById("summarySession"),
  summaryCopy: document.getElementById("summaryCopy"),
  resultCard: document.getElementById("resultCard"),
  resultLabel: document.getElementById("resultLabel"),
  resultText: document.getElementById("resultText"),
  viewerLink: document.getElementById("viewerLink"),
  downloadLink: document.getElementById("downloadLink"),
  downloadCadLink: document.getElementById("downloadCadLink"),
  startOverButton: document.getElementById("startOverButton"),
  liveLine: document.getElementById("liveLine"),
  stageList: document.getElementById("stageList"),
};

const state = {
  file: null,
  pathway: null,
  job: null,
  eventSource: null,
};

function makeStageList(pathway) {
  return STAGE_ORDERS[pathway].map((key) => ({
    key,
    label: STAGE_LABELS[key],
    status: key === "upload" || key === "choice" ? "completed" : "pending",
  }));
}

function makePlaceholderJob(pathway) {
  return {
    jobId: null,
    runId: null,
    sessionId: null,
    fileName: state.file?.name ?? "-",
    pathway,
    status: "starting",
    statusLine: "Starting the local deterministic pipeline.",
    cadViewerUrl: null,
    stlPath: null,
    scadPath: null,
    error: null,
    stages: makeStageList(pathway),
  };
}

function closeEventSource() {
  if (state.eventSource) {
    state.eventSource.close();
    state.eventSource = null;
  }
}

function resetState() {
  closeEventSource();
  state.file = null;
  state.pathway = null;
  state.job = null;

  if (dom.choiceDialog.open) {
    dom.choiceDialog.close();
  }

  dom.fileInput.value = "";
  dom.formError.textContent = "";
  dom.selectedFile.hidden = true;
  dom.body.dataset.theme = "neutral";
  render();
}

function setFormError(message) {
  dom.formError.textContent = message;
}

function isPngFile(file) {
  return Boolean(file) && file.type === "image/png" && /\.png$/i.test(file.name);
}

function statusLabel(status) {
  return {
    starting: "Starting",
    running: "Running",
    completed: "Completed",
    failed: "Failed",
  }[status] ?? "Idle";
}

function stageStatusCopy(status) {
  return {
    pending: "Pending",
    active: "Active",
    completed: "Completed",
    failed: "Failed",
    skipped: "Skipped",
  }[status] ?? "Pending";
}

function completedCount(stages) {
  return stages.filter((stage) => stage.status === "completed").length;
}

function renderStages(stages) {
  dom.stageList.innerHTML = stages
    .map(
      (stage) => `
        <article class="stage-item" data-status="${stage.status}">
          <strong>${stage.label}</strong>
          <span class="stage-meta">${stageStatusCopy(stage.status)}</span>
          <div class="stage-progress"><div class="stage-fill"></div></div>
        </article>
      `,
    )
    .join("");
}

function renderResult(job) {
  const isTerminal = job.status === "completed" || job.status === "failed";
  const hasViewerUrl = Boolean(job.cadViewerUrl);
  const hasStlDownload = Boolean(job.jobId && job.stlPath);
  const hasCadDownload = Boolean(job.jobId && job.scadPath);

  dom.resultCard.classList.toggle("hidden", !isTerminal);
  dom.startOverButton.classList.toggle("hidden", !isTerminal);

  if (!isTerminal) {
    delete dom.resultCard.dataset.state;
    dom.viewerLink.href = "#";
    dom.viewerLink.classList.add("hidden");
    dom.downloadLink.href = "#";
    dom.downloadLink.classList.add("hidden");
    dom.downloadCadLink.href = "#";
    dom.downloadCadLink.classList.add("hidden");
    return;
  }

  if (job.status === "completed" && hasViewerUrl) {
    dom.resultCard.dataset.state = "success";
    dom.resultLabel.textContent = "CAD Viewer Ready";
    dom.resultText.textContent = "The run completed and returned a CAD Viewer handoff.";
  } else if (job.status === "completed") {
    dom.resultCard.dataset.state = "error";
    dom.resultLabel.textContent = "CAD Viewer Handoff Missing";
    dom.resultText.textContent = "The run reported completion without the required CAD Viewer link.";
  } else {
    dom.resultCard.dataset.state = "error";
    dom.resultLabel.textContent = "Run Failed";
    dom.resultText.textContent = job.error || "The workflow stopped before the handoff finished.";
  }

  if (hasViewerUrl) {
    dom.viewerLink.href = job.cadViewerUrl;
    dom.viewerLink.classList.remove("hidden");
  } else {
    dom.viewerLink.href = "#";
    dom.viewerLink.classList.add("hidden");
  }

  if (hasStlDownload) {
    dom.downloadLink.href = `/api/jobs/${job.jobId}/download/stl`;
    dom.downloadLink.classList.remove("hidden");
  } else {
    dom.downloadLink.href = "#";
    dom.downloadLink.classList.add("hidden");
  }

  if (hasCadDownload) {
    dom.downloadCadLink.href = `/api/jobs/${job.jobId}/download/cad`;
    dom.downloadCadLink.classList.remove("hidden");
  } else {
    dom.downloadCadLink.href = "#";
    dom.downloadCadLink.classList.add("hidden");
  }
}

function render() {
  const hasJob = Boolean(state.job);

  dom.heroPanel.classList.toggle("hidden", hasJob);
  dom.runLayout.classList.toggle("hidden", !hasJob);

  if (!hasJob) {
    dom.body.dataset.theme = "neutral";
  }

  if (state.file && !hasJob) {
    dom.selectedFile.hidden = false;
    dom.selectedFile.textContent = state.file.name;
  }

  if (!hasJob) {
    return;
  }

  const job = state.job;
  const pathwayCopy = PATHWAY_COPY[job.pathway] ?? PATHWAY_COPY.artwork;

  dom.body.dataset.theme = job.pathway;
  dom.statusChip.textContent = statusLabel(job.status);
  dom.runHeadline.textContent = pathwayCopy.headline;
  dom.summaryFile.textContent = job.fileName;
  dom.summaryPathway.textContent = pathwayCopy.label;
  dom.summaryProgress.textContent = `${completedCount(job.stages)} / ${job.stages.length} complete`;
  dom.summarySession.textContent = job.runId || "Starting...";
  dom.summaryCopy.textContent = job.error || pathwayCopy.summary;
  dom.liveLine.textContent = job.statusLine || "Awaiting stage updates.";

  renderStages(job.stages);
  renderResult(job);
}

async function startJob(pathway) {
  if (!state.file) {
    setFormError("Choose a file before selecting a pathway.");
    return;
  }

  state.pathway = pathway;
  state.job = makePlaceholderJob(pathway);

  if (dom.choiceDialog.open) {
    dom.choiceDialog.close();
  }

  render();

  const formData = new FormData();
  formData.append("file", state.file);
  formData.append("pathway", pathway);

  try {
    const response = await fetch("/api/jobs", {
      method: "POST",
      body: formData,
    });

    const payload = await response.json();

    if (!response.ok) {
      throw new Error(payload.error || "Failed to start the processing run.");
    }

    state.job = payload;
    render();
    connectToEvents(payload.jobId);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to start the processing run.";
    state.job = null;
    state.pathway = null;
    setFormError(message);
    render();
  }
}

function connectToEvents(jobId) {
  closeEventSource();

  const source = new EventSource(`/api/jobs/${jobId}/events`);
  state.eventSource = source;

  source.onmessage = (event) => {
    state.job = JSON.parse(event.data);
    render();

    if (state.job.status === "completed" || state.job.status === "failed") {
      closeEventSource();
    }
  };

  source.onerror = () => {
    if (state.job && state.job.status !== "completed" && state.job.status !== "failed") {
      dom.liveLine.textContent = "The progress stream disconnected. Waiting to reconnect.";
    }
  };
}

dom.fileInput.addEventListener("change", () => {
  const [file] = dom.fileInput.files ?? [];
  state.file = null;
  setFormError("");

  if (!file) {
    dom.selectedFile.hidden = true;
    render();
    return;
  }

  if (!isPngFile(file)) {
    dom.fileInput.value = "";
    dom.selectedFile.hidden = true;
    setFormError("Only PNG uploads are supported right now.");
    render();
    return;
  }

  state.file = file;
  dom.choiceFileName.textContent = file.name;
  dom.selectedFile.hidden = false;
  dom.selectedFile.textContent = file.name;
  dom.choiceDialog.showModal();
  render();
});

dom.choiceDialog.querySelectorAll("[data-pathway]").forEach((button) => {
  button.addEventListener("click", () => {
    void startJob(button.dataset.pathway);
  });
});

dom.chooseAnotherButton.addEventListener("click", () => {
  state.file = null;
  dom.fileInput.value = "";
  dom.selectedFile.hidden = true;
  setFormError("");
  render();
});

dom.startOverButton.addEventListener("click", resetState);

render();
