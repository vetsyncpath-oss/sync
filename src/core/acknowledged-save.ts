/** Each caller awaits its own immutable snapshot, including when another save is active. */
export class AcknowledgedSave<T> {
    private tail: Promise<void> = Promise.resolve();
    constructor(private readonly write: (snapshot: T) => Promise<void>) {}
    save(value: T): Promise<void> {
        const snapshot = structuredClone(value);
        const result = this.tail.then(() => this.write(snapshot));
        // A rejected save must reach its caller without poisoning a later explicit retry.
        this.tail = result.catch(() => {});
        return result;
    }
}
