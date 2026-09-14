// Inside Vylos, require('@vylos/sdk') is answered by the sandbox, and a
// bundled copy of this file finds the same API on the worker's global scope.
// Outside Vylos (tests, type-checking) there is no API to return.
if (typeof globalThis.vylos === 'undefined') {
    throw new Error('@vylos/sdk only works inside a Vylos extension');
}
module.exports = globalThis.vylos;
