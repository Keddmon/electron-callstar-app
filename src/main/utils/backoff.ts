/**
 * 지수 백오프(Exponential Backoff) 재연결 로직
 */
export class ExponentialBackoff {
    private attempts = 0;
    constructor(
        private readonly task: () => Promise<boolean>,
        private readonly maxAttempts = 10,
        private readonly initialDelay = 1000,
        private readonly maxDelay = 60000,
    ) { }

    async start() {
        this.attempts = 0;
        this.run();
    }

    private async run() {
        if (this.attempts >= this.maxAttempts) {
            console.error('[backoff] Max retry attempts reached.');
            return;
        }
        try {
            const success = await this.task();
            if (success) {
                this.attempts = 0;
            } else {
                this.scheduleNext();
            }
        } catch {
            this.scheduleNext();
        }
    }

    private scheduleNext() {
        this.attempts++;
        const delay = Math.min(this.initialDelay * Math.pow(2, this.attempts), this.maxDelay);
        setTimeout(() => this.run(), delay);
    }
}