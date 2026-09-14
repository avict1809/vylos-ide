# @vylos/sdk

Types for Vylos code extensions: tutor tools, hint ladders, explainers,
coaches, AI, workspace files, the terminal and learner events.

```js
const vylos = require('@vylos/sdk');

exports.activate = (context) => {
    context.subscriptions.push(
        vylos.tutor.registerTool(
            { name: 'say_hello', description: 'Greets the learner by name', parameters: { type: 'OBJECT', properties: { name: { type: 'STRING' } } } },
            ({ name }) => ({ greeting: `Hello, ${name}!` })
        )
    );
};
```

Extensions run sandboxed: no Node.js modules, no DOM, no network. Everything
goes through this API, gated by the permissions in your `package.json` that
the learner approves. See [docs/EXTENSIONS.md](../../docs/EXTENSIONS.md) for
the full guide, and `index.d.ts` for every function.

Status: 0.x, proposed. APIs may change between minor versions.
