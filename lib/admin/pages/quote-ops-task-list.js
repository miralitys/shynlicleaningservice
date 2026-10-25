"use strict";

// Task IDs are only unique within an entry, including imported history.
const taskListKey = task => JSON.stringify([task.entry.id, task.id]);
const taskListDialogId = task => "admin-quote-task-result-dialog-" +
  Buffer.from(taskListKey(task)).toString("base64url");

module.exports = { taskListKey, taskListDialogId };
