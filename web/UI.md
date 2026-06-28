# UI Implementation Plan

## Goal

Build a standalone local web app for this repo that:

- greets the user with a PNG upload surface
- asks whether the upload is `Artwork` or `Technical Drawing`
- runs the matching saved OpenCode command from `opencode.json`
- shows real progress across the workflow stages
- surfaces the final CAD Viewer link when the run completes

This document is the implementation plan only. It does not introduce code yet.

## Fixed Constraints

- Uploads must accept `PNG` only.
- The UI should be simple, modern, and visually distinct from generic SaaS dashboards.
- The app should run locally against this repo.
- The app should reuse existing saved commands instead of duplicating prompt text in the frontend.
- CAD Viewer must remain a post-export handoff, matching repo workflow rules.

## Existing Repo Hooks

The plan should reuse these existing pieces:

- `opencode.json`
  - `command.artwork`
  - `command.technicaldrawing`
- `.agents/skills/openscad/SKILL.md`
  - canonical classification split
  - validation, preview, export, and CAD Viewer workflow order
- `.agents/skills/cad-viewer/SKILL.md`
  - returned links must include absolute `?dir=` values
- local OpenCode SDK in `.opencode/node_modules/@opencode-ai/sdk`
  - can start a local OpenCode server
  - can create sessions
  - can execute named commands with file attachments
  - can subscribe to session events for progress tracking

## Product Direction

### UX Tone

Use a dark workshop interface with two visual moods:

- `Artwork`: ink, glow, soft bloom, more organic motion
- `Technical Drawing`: blueprint, grid, sharp lines, stricter geometry

The UI should still stay restrained and readable. The memorable interaction is the classification modal, not a noisy dashboard.

### Primary User Flow

1. User lands on the page.
2. User uploads one PNG.
3. App opens a modal asking:
   - `Artwork`
   - `Technical Drawing`
4. User chooses one pathway.
5. App starts a new processing session.
6. App shows progress bars for the relevant stages.
7. App shows final status and a `View in CAD Viewer` action when available.

## Scope

### In Scope

- single-file PNG upload
- single active job at a time
- local-only execution
- saved-command execution
- event-driven progress UI
- final CAD Viewer link display
- clear success and failure states

### Out of Scope For First Pass

- drag-and-drop batch uploads
- JPG, SVG, PDF, or multi-format support
- user accounts or persistence across restarts
- queueing multiple jobs
- editing OpenSCAD output from the UI
- embedded CAD Viewer inside the page

## Architecture

Create a small standalone web app under a new `web/` directory.

### Proposed Structure

```text
web/
  package.json
  server.mjs
  public/
    index.html
    styles.css
    app.js
  uploads/
```

### Rationale

- keeps the change isolated from modeling files
- avoids forcing browser concerns into repo root scripts
- allows file upload handling and OpenCode session streaming with minimal backend code
- keeps deployment assumptions simple: local server only

## Runtime Design

### Backend Responsibilities

The backend should:

- serve the static frontend
- accept one PNG upload
- write the PNG into a local upload directory
- start or reuse a local OpenCode server through the SDK
- create a new OpenCode session for each run
- execute either `artwork` or `technicaldrawing`
- subscribe to session events
- normalize those events into frontend-friendly progress updates
- return or stream the final CAD Viewer URL

### Frontend Responsibilities

The frontend should:

- render the upload hero
- validate that the chosen file is a PNG
- display the pathway choice modal
- start the run through the backend
- subscribe to server-sent progress updates
- render stage bars, status text, and terminal state
- expose the CAD Viewer link when present

## Integration With OpenCode

### Session Startup

Use the local SDK to bootstrap OpenCode locally rather than assuming an external server is already running.

Planned pattern:

1. backend starts OpenCode server through SDK if not already started
2. backend creates a fresh session
3. backend executes named command:
   - `artwork` for artwork flow
   - `technicaldrawing` for technical drawing flow
4. backend attaches the uploaded PNG to the command message

### Why Use Saved Commands

This keeps workflow logic in one place:

- command prompts stay in `opencode.json`
- frontend only chooses the pathway and starts execution
- future prompt changes do not require frontend rewrites

## File Handling Plan

### Upload Rules

- accept only `.png`
- reject all non-PNG MIME types and extensions at both frontend and backend
- allow one file only
- generate a safe local filename for storage
- keep original filename for display only

### Proposed Storage

Store uploaded files under:

```text
web/uploads/
```

Each run should use a unique filename or subdirectory so sessions do not overwrite each other.

Example:

```text
web/uploads/2026-05-31T12-44-10-house.png
```

## API Plan

### `POST /api/jobs`

Purpose:

- accept one PNG upload and the chosen pathway
- create a processing job
- start the OpenCode command

Input:

- multipart form data
- `file`: PNG
- `pathway`: `artwork` or `technicaldrawing`

Response:

- `jobId`
- `sessionId`
- initial stage list

### `GET /api/jobs/:jobId/events`

Purpose:

- stream job progress to the frontend using Server-Sent Events

Event payloads should include:

- job status
- session status
- current stage key
- per-stage progress state
- human-readable status line
- CAD Viewer URL when available
- error details when failed

### Optional `GET /api/jobs/:jobId`

Purpose:

- allow polling fallback or page refresh recovery

This is optional for first pass if SSE is sufficient.

## Frontend State Model

### Main States

- `idle`
- `file_selected`
- `classifying`
- `starting`
- `running`
- `completed`
- `failed`

### Stage Status Values

- `pending`
- `active`
- `completed`
- `skipped`
- `failed`

## Progress Stage Model

The UI should show fixed stage bars per pathway rather than generating labels dynamically.

### Artwork Stages

1. `upload`
2. `choice`
3. `magicimage`
4. `potrace`
5. `svg_cleanup`
6. `openscad_build`
7. `validate`
8. `preview`
9. `stl_export`
10. `cad_viewer`

### Technical Drawing Stages

1. `upload`
2. `choice`
3. `openscad_build`
4. `validate`
5. `preview`
6. `stl_export`
7. `cad_viewer`

### Labeling Rules

Display friendlier labels in the UI:

- `magicimage` -> `Image Cleanup`
- `potrace` -> `Vector Trace`
- `svg_cleanup` -> `SVG Cleanup`
- `openscad_build` -> `OpenSCAD Build`
- `stl_export` -> `STL Export`
- `cad_viewer` -> `CAD Viewer`

## Event Mapping Plan

Map OpenCode session events into stage transitions.

### Start Signals

- mark `upload` completed after successful backend file save
- mark `choice` completed after user selection is posted
- mark job `running` after command execution starts

### Artwork Pathway Detection

Use tool-call events to detect subagent progress:

- `imagemagick-png-inspector` -> `magicimage`
- `potrace-vectorizer` -> `potrace`
- `inkscape-svg-cleaner` -> `svg_cleanup`

### Shared Late-Stage Detection

Infer these from tool calls, tool input, or command text:

- `validate.sh` -> `validate`
- `preview.sh` or `multi-preview.sh` -> `preview`
- `export-stl.sh` -> `stl_export`

### CAD Viewer Detection

Mark `cad_viewer` active when:

- agent output mentions CAD Viewer handoff, or
- final text includes a local viewer URL

Mark `cad_viewer` completed when a valid URL is extracted.

### Session Finish Signals

- `session.idle` with no known failure -> completed
- `session.next.step.failed` or tool failure -> failed

## CAD Viewer Link Handling

The UI should not try to start CAD Viewer by itself through export scripts.

Instead:

- rely on the existing agent workflow to produce the viewer handoff
- parse the returned assistant output for the final CAD Viewer URL
- verify the URL contains:
  - `?dir=`
  - absolute file or directory path
- display a clear CTA button:
  - `Open CAD Viewer`

If the run completes without a link, show a warning state rather than pretending success.

## Visual Design Plan

### Layout

- single-page app
- centered upload hero on first load
- processing panel replaces hero after run starts
- left side: run summary and file name
- right side: vertical stage bars and live log line

### Typography

- use a characterful display face for the headline
- use a clean serif or humanist sans for body text
- avoid default generic tech startup typography

### Motion

- smooth modal entrance
- soft progress bar fill animation
- subtle pulse on active stage
- final CAD Viewer CTA should feel like a reward state, not a standard button

### Theme Behavior

Switch visual accents based on selected pathway:

- artwork: warm glow accents
- technical drawing: cyan blueprint accents

The underlying layout stays the same so implementation remains small.

## Error Handling Plan

### User Errors

- no file selected
- non-PNG upload
- missing pathway choice

### Runtime Errors

- failed upload write
- OpenCode server failed to start
- session creation failed
- command execution failed
- tool failure during workflow
- no CAD Viewer link returned

### UI Behavior On Failure

- freeze current stage state
- mark failed stage clearly
- show concise readable error summary
- expose a `Start Over` action
- keep previously uploaded filename visible for context

## Security And Safety

This is a local app, but still keep handling disciplined:

- sanitize file names
- never trust frontend MIME checks alone
- do not execute arbitrary command names from the client
- map client pathway choice to fixed server-side command names only
- do not expose arbitrary file browsing from the web UI

## Implementation Steps

### Phase 1: Scaffold

1. create `web/` directory
2. add minimal Node server and static file serving
3. add frontend shell page

Success criteria:

- app starts locally
- landing page renders

### Phase 2: Upload And Choice Flow

1. add PNG-only upload form
2. add classification modal
3. add client-side validation
4. add backend upload endpoint

Success criteria:

- user can submit one PNG and one pathway
- invalid files are rejected cleanly

### Phase 3: OpenCode Command Execution

1. wire local SDK server bootstrap
2. create session per job
3. execute `artwork` or `technicaldrawing`
4. attach uploaded file

Success criteria:

- backend starts a real OpenCode run from the uploaded PNG

### Phase 4: Progress Streaming

1. subscribe to OpenCode events
2. normalize events to stage updates
3. stream updates over SSE
4. render live bars in the frontend

Success criteria:

- stage bars move from real run events, not timers

### Phase 5: Completion And CAD Viewer

1. detect completion
2. extract CAD Viewer URL
3. show final CTA and summary state

Success criteria:

- successful runs expose a working viewer link

### Phase 6: Polish

1. refine visuals and motion
2. improve failure messaging
3. verify both pathways visually

Success criteria:

- app feels deliberate and polished, not prototype-like

## Verification Plan

### Functional Checks

1. upload valid PNG as artwork
2. upload valid PNG as technical drawing
3. reject non-PNG file
4. reject empty submission
5. confirm command selection matches pathway
6. confirm stage progress changes during run
7. confirm completed run shows CAD Viewer link

### Workflow Checks

1. artwork route shows Image Cleanup, Vector Trace, and SVG Cleanup stages
2. technical drawing route skips artwork-only stages
3. final stages reflect validate, preview, and STL export

### Failure Checks

1. simulate OpenCode startup failure
2. simulate tool failure
3. simulate missing viewer URL

## Success Criteria

The feature is complete when:

- a user can upload exactly one PNG
- the user can classify it as artwork or technical drawing
- the correct saved command runs
- the UI reflects real progress through the known workflow
- the app clearly ends in success or failure
- successful runs present a CAD Viewer link for the generated result

## Notes For Implementation

- keep the first version local-only
- keep the backend minimal
- prefer explicit fixed mappings over clever inference where possible
- do not duplicate workflow prompt logic already stored in `opencode.json`
- do not bypass the repo's OpenSCAD and CAD Viewer workflow rules
