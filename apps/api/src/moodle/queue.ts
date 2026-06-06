// Shared queue name so the finance module can enqueue without importing the
// Moodle service (avoids a module cycle).
export const MOODLE_PROVISION_QUEUE = 'moodle-provision';
