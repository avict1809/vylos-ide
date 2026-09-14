/** Undoes a registration. Every register* function hands one back. */
export interface Disposable {
    dispose(): void;
}
