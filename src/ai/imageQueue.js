import { logger } from './logger.js';

/**
 * Image Generation Queue
 * Limits concurrent image generation requests (max 100)
 */
export class ImageQueue {
    constructor(maxConcurrent = 100) {
        this.maxConcurrent = maxConcurrent;
        this.activeCount = 0;
        this.queue = [];
    }

    /**
     * Add an image request to the queue
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
                logger.imageQueue(this.activeCount, this.maxConcurrent, this.queue.length);
            }
        });
    }

    async _execute(task) {
        this.activeCount++;
        logger.imageQueue(this.activeCount, this.maxConcurrent, this.queue.length);

        try {
            const result = await task.requestFn();
            task.resolve(result);
        } catch (error) {
            task.reject(error);
        } finally {
            this.activeCount--;
            logger.imageQueue(this.activeCount, this.maxConcurrent, this.queue.length);
            this._processNext();
        }
    }

    _processNext() {
        if (this.queue.length > 0 && this.activeCount < this.maxConcurrent) {
            const nextTask = this.queue.shift();
            this._execute(nextTask);
        }
    }

    getStatus() {
        return {
            active: this.activeCount,
            queued: this.queue.length,
            maxConcurrent: this.maxConcurrent
        };
    }
}
