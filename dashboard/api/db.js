/**
 * Dashboard Database Helper
 * 
 * Re-exports the shared database module for use in the dashboard API.
 * This ensures both the bot and dashboard use the same database connection.
 */

// Re-export everything from the shared database module
// Path: dashboard/api/db.js -> src/shared/database.js (go up 2 levels)
export * from '../../src/shared/database.js';
export { default } from '../../src/shared/database.js';
