/**
 * The code that runs inside the extension sandbox. code-host.ts puts HOST_HTML
 * in a hidden `<iframe sandbox="allow-scripts">`, which starts one Web Worker
 * per extension from WORKER_RUNTIME and then loads the extension's code into
 * it. Inside a worker there is no Node, no DOM, no storage and (through the
 * CSP below, which workers inherit) no network: the only way out is
 * postMessage to code-host.ts, which checks every request against the
 * permissions the learner approved.
 *
 * Both are plain JavaScript strings so they run exactly as written in every
 * build. Keep them free of backticks and "${".
 */

/** The iframe document: relays messages between code-host.ts and the extension workers. */
export const HOST_HTML = String.raw`<!doctype html>
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline' blob:; worker-src blob:">
<script>
'use strict';
var port = null;
var workers = new Map();
window.addEventListener('message', function (event) {
    // The first message carries the only channel to the app; nothing else is accepted
    if (port || !event.ports || !event.ports[0]) return;
    port = event.ports[0];
    port.onmessage = function (m) {
        var msg = m.data || {};
        if (msg.type === 'start') {
            var id = msg.extension.id;
            var worker = new Worker(URL.createObjectURL(new Blob([msg.runtime], { type: 'text/javascript' })), { name: id });
            workers.set(id, worker);
            worker.onmessage = function (x) { port.postMessage({ extId: id, msg: x.data }); };
            worker.onerror = function (x) {
                x.preventDefault();
                port.postMessage({ extId: id, msg: { type: 'log', level: 'error', text: 'Uncaught ' + (x.message || 'error') } });
            };
            worker.postMessage({ type: 'load', extension: msg.extension, main: msg.main, code: msg.code });
        } else if (msg.type === 'toWorker') {
            var target = workers.get(msg.extId);
            if (target) target.postMessage(msg.msg);
        } else if (msg.type === 'terminate') {
            var doomed = workers.get(msg.extId);
            if (doomed) { doomed.terminate(); workers.delete(msg.extId); }
        }
    };
    port.postMessage({ type: 'ready' });
});
</script>`;

/** Runs first in every extension worker: provides the vylos API (see packages/sdk/index.d.ts). */
export const WORKER_RUNTIME = String.raw`'use strict';
(function () {
    var post = self.postMessage.bind(self);
    var pending = new Map();
    var handlers = new Map();
    var lessonListeners = new Set();
    var nextCall = 1, nextHandle = 1, nextReg = 1;
    var extensionExports = null;
    var context = null;

    function format(value) {
        if (typeof value === 'string') return value;
        if (value instanceof Error) return value.stack || String(value);
        try { return JSON.stringify(value); } catch (e) { return String(value); }
    }
    ['log', 'info', 'warn', 'error', 'debug'].forEach(function (level) {
        console[level] = function () {
            post({ type: 'log', level: level, text: Array.prototype.map.call(arguments, format).join(' ') });
        };
    });
    self.addEventListener('unhandledrejection', function (e) {
        console.error('Unhandled promise rejection:', e.reason);
    });

    function call(method, params) {
        return new Promise(function (resolve, reject) {
            var id = nextCall++;
            pending.set(id, { resolve: resolve, reject: reject });
            post({ type: 'call', id: id, method: method, params: params });
        });
    }

    function handle(fn, what) {
        if (typeof fn !== 'function') throw new TypeError(what + ' must be a function');
        var h = nextHandle++;
        handlers.set(h, fn);
        return h;
    }

    // Registrations are checked by Vylos; a refusal is logged and shown in the Extensions panel
    function register(kind, spec, handles) {
        var reg = nextReg++;
        spec.reg = reg;
        call('register', { kind: kind, spec: spec }).catch(function (e) {
            console.error('Could not register the ' + kind + ': ' + e.message);
        });
        var disposed = false;
        return {
            dispose: function () {
                if (disposed) return;
                disposed = true;
                handles.forEach(function (h) { handlers.delete(h); });
                call('unregister', { reg: reg }).catch(function () {});
            }
        };
    }

    function obj(value, what) {
        if (!value || typeof value !== 'object') throw new TypeError(what + ' must be an object');
        return value;
    }

    var vylos = Object.freeze({
        tutor: Object.freeze({
            registerTool: function (declaration, execute) {
                obj(declaration, 'The tool declaration');
                var h = handle(execute, 'The tool handler');
                return register('tutorTool', { declaration: declaration, handle: h }, [h]);
            }
        }),
        hints: Object.freeze({
            registerHintLadder: function (ladder) {
                obj(ladder, 'The hint ladder');
                var handles = [];
                var steps = (ladder.steps || []).map(function (step) {
                    var h = handle(step && step.produce, "Each step's produce");
                    handles.push(h);
                    return { level: step.level, label: step.label, title: step.title, format: step.format, handle: h };
                });
                return register('hintLadder', { languages: ladder.languages, steps: steps }, handles);
            }
        }),
        learning: Object.freeze({
            registerExplainer: function (explainer) {
                obj(explainer, 'The explainer');
                var h = handle(explainer.explain, 'explain');
                return register('explainer', { label: explainer.label, languages: explainer.languages, handle: h }, [h]);
            }
        }),
        coach: Object.freeze({
            registerCoach: function (coach) {
                obj(coach, 'The coach');
                var h = handle(coach.check, 'check');
                return register('coach', { label: coach.label, languages: coach.languages, handle: h }, [h]);
            }
        }),
        ai: Object.freeze({
            generate: function (prompt) { return call('ai.generate', { prompt: prompt }); }
        }),
        workspace: Object.freeze({
            getRoot: function () { return call('workspace.getRoot', {}); },
            readFile: function (path) { return call('workspace.readFile', { path: path }); },
            writeFile: function (path, content) { return call('workspace.writeFile', { path: path, content: content }); },
            listFiles: function (path) { return call('workspace.listFiles', { path: path || '' }); },
            getActiveFile: function () { return call('workspace.getActiveFile', {}); }
        }),
        terminal: Object.freeze({
            run: function (command, options) {
                options = options || {};
                return call('terminal.run', { command: command, cwd: options.cwd, timeoutSeconds: options.timeoutSeconds });
            }
        }),
        learner: Object.freeze({
            getCompletedLessons: function (courseId) { return call('learner.getCompletedLessons', { courseId: courseId }); },
            onLessonCompleted: function (listener) {
                if (typeof listener !== 'function') throw new TypeError('The listener must be a function');
                lessonListeners.add(listener);
                call('learner.subscribe', {}).catch(function (e) { console.error(e.message); });
                return { dispose: function () { lessonListeners.delete(listener); } };
            }
        })
    });
    self.vylos = vylos;

    function reply(id, result) {
        try {
            post({ type: 'invokeResult', id: id, result: result === undefined ? null : result });
        } catch (e) {
            post({ type: 'invokeResult', id: id, error: 'The result must be plain data (JSON): ' + e.message });
        }
    }

    function load(msg) {
        context = { subscriptions: [], extension: Object.freeze({ id: msg.extension.id, version: msg.extension.version }) };
        var module = { exports: {} };
        var require = function (name) {
            if (name === '@vylos/sdk') return vylos;
            throw new Error("Cannot find module '" + name + "': extensions run in a sandbox, so bundle dependencies into one file");
        };
        self.__vylosDefine = function (factory) { factory.call(module.exports, module, module.exports, require); };
        try {
            var source = 'self.__vylosDefine(function (module, exports, require) {\n' + msg.code + '\n});\n//# sourceURL=' + msg.extension.id + '/' + msg.main;
            importScripts(URL.createObjectURL(new Blob([source], { type: 'text/javascript' })));
        } catch (e) {
            post({ type: 'failed', error: 'Loading ' + msg.main + ' failed: ' + ((e && e.message) || e) });
            return;
        } finally {
            delete self.__vylosDefine;
        }
        extensionExports = module.exports || {};
        if (typeof extensionExports.activate !== 'function') {
            post({ type: 'failed', error: msg.main + ' must export an activate(context) function' });
            return;
        }
        Promise.resolve()
            .then(function () { return extensionExports.activate(context); })
            .then(function () { post({ type: 'activated' }); },
                function (e) { post({ type: 'failed', error: 'activate() failed: ' + ((e && e.message) || e) }); });
    }

    function stop() {
        Promise.resolve()
            .then(function () {
                if (context) context.subscriptions.forEach(function (d) { try { d.dispose(); } catch (e) {} });
                if (extensionExports && typeof extensionExports.deactivate === 'function') return extensionExports.deactivate();
            })
            .catch(function (e) { console.error('deactivate() failed:', e); })
            .then(function () { post({ type: 'stopped' }); });
    }

    self.onmessage = function (event) {
        var msg = event.data || {};
        if (msg.type === 'result') {
            var p = pending.get(msg.id);
            if (!p) return;
            pending.delete(msg.id);
            if (msg.error) p.reject(new Error(msg.error)); else p.resolve(msg.result);
        } else if (msg.type === 'invoke') {
            var fn = handlers.get(msg.handle);
            Promise.resolve()
                .then(function () {
                    if (!fn) throw new Error('This registration was disposed');
                    return fn.apply(null, msg.args || []);
                })
                .then(function (result) { reply(msg.id, result); },
                    function (e) { post({ type: 'invokeResult', id: msg.id, error: (e && e.message) || String(e) }); });
        } else if (msg.type === 'event' && msg.name === 'lessonCompleted') {
            lessonListeners.forEach(function (l) { try { l(msg.data); } catch (e) { console.error(e); } });
        } else if (msg.type === 'load') {
            load(msg);
        } else if (msg.type === 'stop') {
            stop();
        }
    };
})();
`;
