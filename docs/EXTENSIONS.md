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
    "engines": { "vylos": ">=0.2.0" },
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
| `modules` | yes | 1–50 modules, each with a `title`, an optional `description` and 1–200 `lessons`. A lesson is a title, or an object with a `title` and optionally an `id` and an [`exercise`](#exercises). |
| `category` | no | Catalog section: `language` (default), `framework`, `ai`, `vibe`, `security`, `essentials`. |
| `level`, `stack`, `accent`, `badge` | no | Shown on the catalog card. |
| `requires` | no | Tools the learner needs, from: `python`, `node`, `java`, `kotlin`, `cc`, `go`, `rust`, `dotnet`, `ruby`, `php`, `git`, `docker`, `sqlite`, `psql`, `swift`. When the course opens, Vylos checks each one and shows install steps for the learner's system if it's missing. You can't add your own checks. |
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

### Exercises

Give a lesson an `exercise` and learners get a coding task with a **Check**
button. The check runs on their computer against your test cases, and passing
it completes the lesson. The voice tutor sees the task too: it opens the
exercise, lets the learner write the code, and calls the same check.

```json
{
    "title": "Summing a list",
    "exercise": {
        "prompt": "Finish `total(nums)` so it returns the sum of `nums`.",
        "files": {
            "total.py": "def total(nums):\n    return 0\n"
        },
        "check": {
            "type": "function",
            "function": "total",
            "cases": [
                { "args": [[1, 2, 3]], "expected": 6 },
                { "args": [[]], "expected": 0 }
            ]
        },
        "hints": [
            "What should the total be before you've looked at any number?",
            "Start at 0 and add each number inside a for loop."
        ],
        "solution": "def total(nums):\n    result = 0\n    for n in nums:\n        result += n\n    return result\n"
    }
}
```

| Field | Required | Notes |
| --- | --- | --- |
| `prompt` | yes | The task. `code` in backticks is shown as code. |
| `files` | yes | Starter files by plain name (no folders). The **first** file is the main file: it opens in the editor, it's what gets checked, and its extension picks the language. |
| `check` | yes | `output` or `function`, below. |
| `hints` | no | Shown one at a time when the learner asks. |
| `solution` | no | The main file, solved. Vylos shows it only after `solutionAfter` checks that didn't pass (default 3) and an "are you sure?". |

**`"type": "output"`** runs the main file and compares what it prints. It works
for any language the Run button knows (Python, JavaScript, C, C++, Java, Go,
Rust…). Each case can give `input`: what the learner would type, one line per
`\n`. Trailing spaces and blank lines don't matter. Set `"match": "contains"`
when the program also prints prompts, or `"regex"` for a pattern.

```json
"check": {
    "type": "output",
    "cases": [
        { "name": "3 and 5 make 8", "input": "3\n5", "expected": "8", "match": "contains" }
    ]
}
```

**`"type": "function"`** calls a function in a `.py` or `.js` main file with each
case's `args` and compares the return value with `expected` (JSON: `null` is
`None` in Python, and numbers are compared with a tiny tolerance). No test
framework needs to be installed, and learners see exactly which call failed:
*`total([1, 2, 3])` returned 5, expected 6*.

Exercises can't run commands of their own. Vylos runs the main file with its
fixed command for that language and passes your cases through files, so a pack
never gets to put anything into a shell.

Checks run on the learner's own computer, so a determined learner can read
the test cases. That's fine for practice; don't use them to hand out
certificates.

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
package.json: engines.vylos: this extension needs Vylos >=0.3.0, but this is Vylos 0.2.0
```

Warnings, such as a misspelled field name, don't stop a pack from loading.

## Code extensions

Add a `main` file and the `permissions` it needs to `package.json`:

```json
{
    "name": "python-coach",
    "publisher": "vylos-examples",
    "version": "1.0.0",
    "engines": { "vylos": ">=0.2.0" },
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

- **More checkers**: `pytest`, `jest` and `go test` for exercises with test files, and `vylos.learning.registerChecker` for custom grading.
- **Lesson content**: Markdown pages alongside the tutor.
- **Tooling**: `vylos ext dev`, `vylos ext test` (the starter fails, the solution passes) and `vylos ext pack`.
- **Network access** for extensions that need it, limited to the hosts they declare.
