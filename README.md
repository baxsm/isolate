# isolate

> Compose two concurrent transactions, step through them, and watch the anomaly your isolation level allows.

<p align="center">
  <img src="https://img.shields.io/badge/Hermitage-10%20anomalies-5b5bd6" alt="Hermitage, 10 anomalies">
  <img src="https://img.shields.io/badge/oracles-PostgreSQL%2018.4-29a383" alt="Checked against PostgreSQL 18.4">
  <img src="https://img.shields.io/badge/tests-204%20engine%20%2B%2065%20audit-1c2024" alt="204 engine tests and 65 audit checks">
  <img src="https://img.shields.io/badge/TypeScript-strict-3178c6" alt="TypeScript strict">
</p>

<p align="center">
  <img src="frontend/public/readme/workbench.png" width="880" alt="The workbench showing Hermitage's G2-item schedule at repeatable read. Ten operations listed left, T1 in indigo and T2 in green. The timeline has both transactions committed at step 10 of 10. The version table shows key 1 dead at value 10 and live at 11, key 2 dead at 20 and live at 21, with snapshot xmin 1, xmax 3, xip [1, 2]. The dependency graph draws two dashed rw edges between T1 and T2 forming a cycle, labelled G2-item. Final state 1 => 11, 2 => 21.">
</p>

Point it at a schedule and it runs the thing itself. The version chains, the snapshot bounds, the
dependency edges and the cycle are all read out of a working MVCC engine, one operation at a time,
so a claim on screen is the engine's answer rather than an illustration of one.

The part worth checking is that the engine is not tuned to agree with the picture. Every anomaly in
Martin Kleppmann's Hermitage suite is a golden test, all seventy cells of his published matrix are
reproduced, and each expectation was also driven against a real PostgreSQL 18.4 in Docker with
concurrent psql sessions as a second, independent oracle.

## How it works

1. Build a schedule, load one of the fifteen Hermitage scenarios, or paste SQL and let the engine
   parse it.
2. The engine executes it operation by operation against an MVCC store with real snapshots and
   first-committer-wins SSI.
3. Every step returns the full state: versions, per transaction visibility, dependency edges, and
   any cycle in them.
4. The three panels render that one step, so the timeline, the version chains and the graph cannot
   disagree with each other.
5. Change the level or reorder an operation and the whole thing re-runs.

## Features

**The same schedule, one setting apart.** Write skew commits at repeatable read and leaves the
database inconsistent. At serializable the engine detects the pivot and aborts it with the error
PostgreSQL actually raises.

<p align="center">
  <img src="frontend/public/readme/serializable.png" width="880" alt="The same G2-item schedule at serializable. The step line reads: T2 commit, aborted, could not serialize access due to read/write dependencies among transactions. Key 2 now stays live at 20 with no dead row. The graph greys T2 out with its label struck through and the cycle is gone. Outcome reads Committed T1, Aborted T2, Anomalies none, Final 1 => 11, 2 => 20.">
</p>

**Every cell of the published matrix, computed live.** Seven engine and level combinations against
ten anomalies, run on demand rather than transcribed. A cell that disagrees with the published
table is marked in red instead of hidden, and every cell opens the schedule that produced it.

<p align="center">
  <img src="frontend/public/readme/matrix.png" width="880" alt="The matrix page. A legend explains allowed, safe, and the disagreement marker. Ten anomaly columns, each headed by its G-code and its plain name: G0 write cycle through P4 lost update to G2 anti dependency cycle. Seven rows: PostgreSQL at read committed, repeatable read and serializable, then MySQL/InnoDB at four levels, each row naming the isolation it actually provides underneath the label. PostgreSQL repeatable read reads safe under P4 while MySQL repeatable read reads allowed. All 70 cells reproduce the published result.">
</p>

**The labels disagree with the behaviour, and it shows.** PostgreSQL's repeatable read is snapshot
isolation. MySQL's is weaker again and loses an update where PostgreSQL raises a serialization
error. Running one schedule against different engine profiles puts that contradiction side by side.

**Anomalies are encoded by form, not by colour.** Cycle edges thicken and gain a dash animation, a
pivot node is ringed in a dash, and versions a transaction cannot see are hatched. All of it
survives greyscale, and the three transaction colours were measured at 64.2 CIE76 separation under
protanopia rather than picked by eye.

**Reorder an operation and watch the cycle appear or vanish.** The schedule is editable in place,
and it round trips through the URL so a composed one can be shared.

**An article that argues with a working engine underneath it.** Six sections, each carrying a live
figure the reader drives. Nothing is bound to scroll position: every figure owns its own schedule
and step index, and the control is always a button the reader presses.

<p align="center">
  <img src="frontend/public/readme/article.png" width="880" alt="The article page. A 32px heading reads Two transactions, one row, over serif body text at 19px. The section below, The simplest interference, names T1 in indigo and T2 in green inline in the prose, with the operation R1(1) set in mono. A figure begins underneath, showing both transactions at read committed with a seven step timeline at step 1 of 7.">
</p>

## Tech

| Layer | Choice |
| --- | --- |
| Engine | Python 3.13. MVCC store, isolation levels as data, dependency graph, anomaly detection |
| Engine API | FastAPI on uvicorn. Runs a schedule and returns every step |
| SQL | sqlglot, parsing the supported subset into operations |
| Frontend | Next.js 16 on React 19, TypeScript strict |
| Graph layout | dagre |
| Version chains | TanStack Table |
| Icons | lucide-react |
| Checks | pytest and hypothesis on the engine, Playwright and axe on the UI |

## Notes on the stack

**The timeline and the graph are hand written SVG, and the layout is not.** React Flow 12.10 and
12.11 both render zero edges on React 19.2: its own two node example from the docs produces correct
nodes, a correct store, and an empty edge layer. Rather than pin React back, the graph draws its own
edges. dagre still owns every coordinate, because a layout algorithm is exactly the kind of thing
that should not be hand rolled.

**Write-write conflicts block rather than error.** A blocked transaction queues and its later
statements wait, which is what a real engine does and what every Hermitage schedule assumes. Without
it the published schedules cannot be replayed at all.

**The panels are built so they cannot disagree.** Nothing here proves by test that the version table
matches the graph. Instead every panel takes the same step object, holds no index of its own and
never refetches, so disagreement is not a bug that can occur.

**Dark mode keeps the transaction fills fixed.** The three step 9 tokens are identical in both
themes, so a transaction never changes hue. Only the ground, the text ramp and the cycle halo flip,
because a dark halo on a dark ground is invisible.

## Requirements

- Python 3.13 and [uv](https://docs.astral.sh/uv/)
- Node 20 or newer

## Setup

Start the engine:

    cd engine
    uv sync
    uv run uvicorn isolate.api:app --port 8000

Then the frontend, in a second terminal:

    cd frontend
    npm install
    npm run dev

The frontend reads `NEXT_PUBLIC_ENGINE_URL` and falls back to `http://127.0.0.1:8000`. Set it in
`frontend/.env.local` if the engine runs anywhere else.

## Layout

    engine/     MVCC store, isolation levels, dependency graph, anomaly detection, FastAPI
    frontend/   The article, the workbench, the three panels, the matrix

## Checks

Engine, 204 tests including the Hermitage goldens and hypothesis generated schedules:

    cd engine
    uv run pytest

Frontend. The audit runs every route at 1440 and 375, and fails on nested containers, offscreen
elements, hover styles on things that cannot be clicked, missing pointer cursors, sideways scroll,
axe violations, and computed WCAG contrast in both themes:

    cd frontend
    npm run typecheck
    npm run lint
    npm run test:e2e
