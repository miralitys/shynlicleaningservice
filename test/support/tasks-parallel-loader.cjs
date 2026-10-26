"use strict";

// Loaded after the server test bootstrap, only by the paired benchmark.
if (process.env.TASKS_PARALLEL_BASELINE) require("./tasks-parallel-stand.cjs").installPairedRegistry();
