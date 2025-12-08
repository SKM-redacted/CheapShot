import { logger } from './logger.js';

/**
 * Request Queue Manager
 * Limits concurrent AI requests to prevent server overload
 */
export class RequestQueue {
    constructor(maxConcurrent = 3) {
        this.maxConcurrent = maxConcurrent;
        this.activeCount = 0;
        this.queue = [];
    }

    /**
     * Add a request to the queue
     * @param {Function} requestFn - Async function to execute
     * @returns {Promise} - Resolves when the request completes
     */
    async enqueue(requestFn) {
        return new Promise((resolve, reject) => {
            const task = {
                requestFn,
                resolve,
                reject
            };

            if (this.activeCount < this.maxConcurrent) {
                this._execute(task);
            } else {
                this.queue.push(task);
                logger.requestQueueStatus(this.activeCount, this.maxConcurrent, this.queue.length);
            }
        });
    }

    /**
     * Execute a task
     * @param {Object} task - Task object with requestFn, resolve, reject
     */
    async _execute(task) {
        this.activeCount++;
        logger.requestQueueStatus(this.activeCount, this.maxConcurrent, this.queue.length);

        try {
            const result = await task.requestFn();
            task.resolve(result);
        } catch (error) {
            task.reject(error);
        } finally {
            this.activeCount--;
            this._processNext();
            logger.requestQueueStatus(this.activeCount, this.maxConcurrent, this.queue.length);
        }
    }

    /**
     * Process the next item in the queue
     */
    _processNext() {
        if (this.queue.length > 0 && this.activeCount < this.maxConcurrent) {
            const nextTask = this.queue.shift();
            // logger.debug('QUEUE', 'Dequeuing request', { queued: this.queue.length });
            this._execute(nextTask);
        }
    }

    /**
     * Get current queue status
     * @returns {Object} - Queue status
     */
    getStatus() {
        return {
            active: this.activeCount,
            queued: this.queue.length,
            maxConcurrent: this.maxConcurrent
        };
    }
}
