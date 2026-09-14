# Making Vylos extensions

A Vylos extension is a folder that teaches something. It can be:

- **A course pack**: JSON files that add courses to Vylos Academia. No code:
  you describe a course and its lessons, and the voice tutor teaches them with
  the same teach → practice → quiz loop as the built-in courses.
- **A code extension**: JavaScript that gives the voice tutor new tools,
  explains code on hover, coaches the learner as they type, or changes the
  step-by-step hints. It runs in a sandbox and can only do what the learner
  approves. See [Code extensions](#code-extensions).

One extension can be both.

## Try the example

1. Copy [`docs/extensions/examples/python-first-steps`](extensions/examples/python-first-steps)
   into your extensions folder:

   | System        | Extensions folder              |
   | ------------- | ------------------------------ |
   | Linux / macOS | `~/.vylos/extensions`          |
   | Windows       | `%USERPROFILE%\.vylos\extensions` |

   Or open Vylos, click **Extensions** (the puzzle piece) and **Open Folder**.
2. The **Extensions** panel lists *Python First Steps* as **Active**, and the
   course appears under **Learning Path → Languages**, marked *by vylos-examples*.

Vylos watches the folder: adding, editing or deleting a pack takes effect
within a second, with no restart.

## Layout

```
my-pack/
├── package.json          the manifest
└── courses/
    └── my-course.json    one file per course
```

While you work on a pack, keep it anywhere and link it into the extensions
folder, so every save reloads it:

```sh
ln -s "$PWD/my-pack" ~/.vylos/extensions/my-pack
```

## package.json

```json
{
    "$schema": "https://raw.githubusercontent.com/avict1809/vylos-ide/main/docs/extensions/schemas/extension.schema.json",
    "name": "python-basics",
    "publisher": "pyschool",
    "displayName": "PySchool Python Basics",
    "description": "PySchool's beginner Python track.",
    "version": "1.0.0",
    "engines": { "vylos": ">=0.1.3" },
    "contributes": {
        "courses": ["courses/python-basics.json"]
    }
}
```

| Field | Required | Notes |
| --- | --- | --- |
| `name` | yes | Lowercase letters, digits, dashes. The extension's id is `<publisher>.<name>`. |
| `publisher` | yes | Same rules. Shown on every course as *by &lt;publisher&gt;*. |
| `version` | yes | `1.0.0`. If two folders hold the same extension, the higher version loads and the other is skipped. |
| `engines.vylos` | yes | Vylos versions it works with: `*`, `1.2.3`, `>=1.2.3`, `^1.2.3` or `~1.2.3`. |
| `contributes.courses` | yes, unless `main` is set | Paths to course files. They must be inside the pack's folder. |
| `displayName`, `description` | no | Shown in the Extensions panel. |

## Course files

```json
{
    "$schema": "https://raw.githubusercontent.com/avict1809/vylos-ide/main/docs/extensions/schemas/course.schema.json",
    "id": "python-basics",
    "title": "Python Basics",
    "tagline": "From print() to your first small program.",
    "level": "Beginner",
    "hours": 6,
    "accent": "#3776AB",
    "badge": "PY",
    "category": "language",
    "stack": "Python",
    "tutorGuidelines": ["Keep every example under 10 lines and run it."],
    "modules": [
        {
            "title": "Getting Started",
            "description": "Run your first program.",
            "lessons": [
                "What a program is",
                { "id": "running-a-script", "title": "Running a .py file from the terminal" }
            ]
        }
    ]
}
```

| Field | Required | Notes |
| --- | --- | --- |
| `id` | yes | Vylos registers the course as `<publisher>.<id>`, so it never clashes with built-in courses or other publishers. Learners' progress is stored under it: don't change it after release. |
| `title`, `tagline` | yes | Up to 80 and 200 characters. |
| `hours` | yes | Rough time to finish. |
| `modules` | yes | 1–50 modules, each with a `title`, an optional `description` and 1–200 `lessons`. |
| `category` | no | Catalog section: `language` (default), `framework`, `ai`, `security`, `essentials`. |
| `level`, `stack`, `accent`, `badge` | no | Shown on the catalog card. |
| `tutorGuidelines` | no | Up to 20 notes for the voice tutor on what to teach and how. |

Add the `$schema` line and editors such as VS Code autocomplete every field
and underline mistakes as you type.

### Lesson ids and progress

A lesson written as a plain title gets its id from the title:
`"Numbers and strings"` → `numbers-and-strings`. Learners' progress is saved
by that id, so you can add, remove and reorder lessons freely.

Rewording a title changes its id, and learners who finished that lesson lose
the checkmark. To reword a title safely, keep its old id:

```json
{ "id": "numbers-and-strings", "title": "Numbers, strings and booleans" }
```

Two lessons in one course can't have the same id.

### What the tutor sees

When a learner starts one of your lessons, the voice tutor gets the course
title, the current module's lessons, and your `tutorGuidelines`, labelled as
notes from your extension. Those notes guide what and how it teaches, but they
can't override Vylos's own rules: the tutor won't skip asking the learner
before installing anything or run destructive commands because a note says so.

## When something is wrong

A pack loads completely or not at all. If any file has a problem, none of its
courses appear, and the Extensions panel shows the pack as **Not loaded** with
every problem and where it is:

```
courses/python-basics.json: modules[1].lessons[3]: a lesson title must be 1 to 200 characters
package.json: engines.vylos: this extension needs Vylos >=0.3.0, but this is Vylos 0.1.3
```

Warnings, such as a misspelled field name, don't stop a pack from loading.

## Code extensions

Add a `main` file and the `permissions` it needs to `package.json`:

```json
{
    "name": "python-coach",
    "publisher": "vylos-examples",
    "version": "1.0.0",
    "engines": { "vylos": ">=0.1.3" },
    "main": "extension.js",
    "permissions": ["workspace.read"]
}
```

`main` is a CommonJS file that exports `activate(context)`:

```js
const vylos = require('@vylos/sdk');

exports.activate = (context) => {
    context.subscriptions.push(
        vylos.coach.registerCoach({
            label: 'Python Coach',
            languages: ['python'],
            check: ({ code }) => code.split('\n').flatMap((text, i) =>
                /[=!]=\s*None\b/.test(text)
                    ? [{ line: i + 1, message: 'Compare with None using "is"', why: 'None is a single object, so "is" asks exactly the right question.' }]
                    : []),
        })
    );
};
```

[`docs/extensions/examples/python-coach`](extensions/examples/python-coach)
is a complete example: a coach, a hover explainer and a tutor tool in about
100 lines. Copy it into your extensions folder to try it.

### The sandbox

Each code extension runs in its own sandboxed Web Worker:

- **No Node.js.** `require('fs')` and friends fail; only `require('@vylos/sdk')`
  works. To use npm packages, bundle everything into one file, e.g.
  `esbuild src/extension.js --bundle --format=cjs --external:@vylos/sdk --outfile=extension.js`.
- **No network.** `fetch`, `WebSocket` and loading remote scripts are blocked.
- **No DOM** and no storage. Keep state in memory.

Everything happens through the `vylos` API, and Vylos checks every call
against the permissions the learner approved.

### Permissions and approval

When Vylos finds a code extension, the Extensions panel shows it as **Needs
approval**, with what it will be able to do in plain words. Its code doesn't
run until the learner clicks **Allow and enable**. If an update asks for more
permissions, it waits for approval again. **Disable** turns it off.

| Permission | Lets the extension | Needed for |
| --- | --- | --- |
| `workspace.read` | Read files in the open project and the file being edited | `vylos.workspace.readFile/listFiles/getActiveFile/getRoot`, and explainers, coaches and hint ladders (they receive the learner's code) |
| `workspace.write` | Create and change files in the open project | `vylos.workspace.writeFile` |
| `terminal.run` | Run commands in the learner's terminal, where they see them | `vylos.terminal.run` |
| `ai.generate` | Ask Vylos AI, up to 50 times a day, counted toward the learner's limit | `vylos.ai.generate` |
| `learner.read` | See which lessons the learner completed | `vylos.learner.*` |

Ask for as little as you can: learners are right to be wary of
`terminal.run`, which gives an extension the same access to their computer
as they have. Paths are always relative to the open project, and nothing
outside it can be reached through `vylos.workspace`.

### The API

[`packages/sdk/index.d.ts`](../packages/sdk/index.d.ts) documents every
function. In short:

| API | What it adds |
| --- | --- |
| `vylos.tutor.registerTool(declaration, execute)` | A tool the voice tutor can call. It sees it as `ext_<publisher>_<name>`, from the next tutor session on. Parameters can be `STRING`, `NUMBER`, `INTEGER` or `BOOLEAN`. |
| `vylos.coach.registerCoach({ label, languages, check })` | Notes on the learner's code as they type, each with *why it matters*. |
| `vylos.learning.registerExplainer({ label, languages, explain })` | What the hover over a function or class says. Return `null` to let the next explainer (finally Vylos AI) answer. |
| `vylos.hints.registerHintLadder({ languages, steps })` | Your own rungs for the step-by-step problem solver. Rungs must never give away more than the ones after them. |
| `vylos.ai.generate(prompt)` | Text from Vylos AI. |
| `vylos.workspace.*`, `vylos.terminal.run`, `vylos.learner.*` | Files, commands and progress, as permitted. |

Push what you register onto `context.subscriptions`, and Vylos removes it
when the extension stops. An optional `exports.deactivate()` gets about one
second to clean up.

### Limits

A misbehaving extension is stopped until the next reload, and the panel says
why. `activate()` gets 10 seconds, a coach's `check()` 10 seconds, an
explainer 30, a hint rung 60 and a tutor tool 150.

### Debugging

`console.log` (and `warn`, `error`) from your extension appears under
**Output** on its card in the Extensions panel, along with any error that
stopped it. Saving a file in the extension folder reloads it.

## What's next

Coming in later releases of the extension platform:

- **Exercises**: starter files, hidden tests and built-in checkers (`pytest`, `jest`, …), with `vylos.learning.registerChecker` for custom grading.
- **Lesson content**: Markdown pages alongside the tutor.
- **Tooling**: `vylos ext dev`, `vylos ext test` (the starter fails, the solution passes) and `vylos ext pack`.
- **Network access** for extensions that need it, limited to the hosts they declare.
