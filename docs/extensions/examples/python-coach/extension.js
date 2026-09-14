// Python Coach: an example Vylos code extension (see docs/EXTENSIONS.md).
// Plain CommonJS, no build step. It runs in Vylos's sandbox, so it can only
// use the vylos API and the "workspace.read" permission in package.json.
const vylos = require('@vylos/sdk');

// Things worth learning about, spotted line by line
const RULES = [
    {
        pattern: /[=!]=\s*None\b/,
        message: 'Compare with None using "is" or "is not"',
        why: 'None is a single object, so "x is None" asks exactly the right question. "==" can be redefined by a class and give surprising answers.',
    },
    {
        pattern: /^\s*except\s*:/,
        message: 'This catches every error, including typos and Ctrl+C',
        why: 'Catch the error you expect, like "except ValueError:", so real bugs still show up instead of disappearing silently.',
        severity: 'warning',
    },
    {
        pattern: /^\s*def\s+\w+\s*\([^)]*=\s*(\[\]|\{\}|set\(\))/,
        message: 'This default list, dict or set is shared between calls',
        why: 'Python creates a default value once, when the function is defined, so every call that changes it changes it for the next call too. Use None and create the list inside the function.',
        severity: 'warning',
    },
    {
        pattern: /^\s*print\s+[^\s(=]/,
        message: 'In Python 3, print is a function: print("...")',
        why: 'Python 2 wrote print "hi"; Python 3 needs the parentheses. Old tutorials still show the Python 2 form.',
        severity: 'warning',
    },
    {
        pattern: /^\s*(if|elif|while)\s+.*==\s*(True|False)\s*:/,
        message: 'No need to compare with True or False',
        why: '"if done:" reads better than "if done == True:" and works for any value Python treats as true or false.',
    },
];

function check({ code }) {
    const notes = [];
    code.split('\n').forEach((text, i) => {
        if (text.trim().startsWith('#')) return;
        for (const rule of RULES) {
            if (rule.pattern.test(text)) {
                notes.push({ line: i + 1, message: rule.message, why: rule.why, severity: rule.severity || 'info' });
            }
        }
    });
    return notes;
}

// Python's special "dunder" methods, which beginners meet before they know why they exist
const DUNDERS = {
    __init__: 'sets up a new object. Python calls it right after creating the object, with the arguments you passed to the class.',
    __str__: 'returns the friendly text that print() and str() show.',
    __repr__: 'returns an unambiguous description for developers, shown in the REPL and when debugging. Ideally it looks like the code that would recreate the object.',
    __len__: 'answers len(obj). It must return a whole number, 0 or more.',
    __eq__: 'decides what == means for these objects. Without it, == only asks "is this the very same object?".',
    __iter__: 'makes the object work in a for loop, by returning an iterator.',
    __getitem__: 'makes obj[key] work, like indexing a list or dict.',
    __enter__: 'runs at the start of a "with" block; what it returns is what "as" names.',
    __exit__: 'runs when a "with" block ends, even after an error, which makes it the place for cleanup.',
};

exports.activate = (context) => {
    context.subscriptions.push(
        vylos.coach.registerCoach({ label: 'Python Coach', languages: ['python'], check }),

        // Answers only for dunder methods; anything else falls through to Vylos AI
        vylos.learning.registerExplainer({
            label: 'Python Coach',
            languages: ['python'],
            explain: ({ name }) =>
                DUNDERS[name] ? `\`${name}\` is a special method: you rarely call it yourself, Python calls it for you. It ${DUNDERS[name]}` : null,
        }),

        vylos.tutor.registerTool(
            {
                name: 'review_python_style',
                description: "Lists beginner-level issues in the learner's open Python file, each with why it matters. Use it after the learner writes some code, then talk through one issue at a time.",
            },
            async () => {
                const file = await vylos.workspace.getActiveFile();
                if (!file) return { error: 'No file is open in the editor.' };
                if (file.languageId !== 'python') return { error: 'The open file is not a Python file.' };
                const issues = check({ code: file.text });
                return { file: file.path, issues: issues.slice(0, 20), summary: issues.length ? `${issues.length} issue(s)` : 'No issues found.' };
            }
        )
    );
    console.log('Python Coach is ready');
};
