import type { Exercise } from '../../types';

// Exercises for javascript.ts, one per lesson that has one. Every starter must
// fail its check and every solution must pass it.

export const helloWorld: Exercise = {
    prompt: 'Write a script that logs exactly `Hello, World!` with `console.log()`.',
    files: { 'hello.js': '// Log Hello, World! below\n' },
    check: { type: 'output', cases: [{ expected: 'Hello, World!' }] },
    hints: [
        '`console.log()` prints whatever you pass it.',
        'Text is a string: put it in quotes, like `"this"`.',
        'Match it exactly: a capital H, a comma, a space, a capital W and an exclamation mark.',
    ],
    solution: 'console.log("Hello, World!");\n',
};

export const templateLiterals: Exercise = {
    prompt: 'Finish `greet(name, city)` with a template literal so it returns a string like `"Hello, Ada from London!"`.',
    files: {
        'greet.js': `function greet(name, city) {
  return "Hello, name from city!";
}
`,
    },
    check: {
        type: 'function',
        function: 'greet',
        cases: [
            { args: ['Ada', 'London'], expected: 'Hello, Ada from London!' },
            { args: ['Linus', 'Helsinki'], expected: 'Hello, Linus from Helsinki!' },
        ],
    },
    hints: [
        'Template literals use backticks (`` ` ``) instead of quotes.',
        'Inside backticks, `${name}` is replaced by the value of `name`.',
        'Swap the quotes for backticks and write `${name}` and `${city}` where the words are.',
    ],
    solution: 'function greet(name, city) {\n  return `Hello, ${name} from ${city}!`;\n}\n',
};

export const ternary: Exercise = {
    prompt: 'Finish `ticketPrice(age)` with the ternary operator: children under 12 pay `5`, everyone else pays `10`.',
    files: {
        'tickets.js': `function ticketPrice(age) {
  // condition ? valueIfTrue : valueIfFalse
  return 10;
}
`,
    },
    check: {
        type: 'function',
        function: 'ticketPrice',
        cases: [
            { args: [8], expected: 5 },
            { args: [11], expected: 5 },
            { args: [12], expected: 10 },
            { args: [40], expected: 10 },
        ],
    },
    hints: [
        'The ternary operator picks one of two values: `condition ? a : b`.',
        '"Under 12" is `age < 12`. Exactly 12 pays the full price.',
        '`return age < 12 ? 5 : 10;`',
    ],
    solution: `function ticketPrice(age) {
  return age < 12 ? 5 : 10;
}
`,
};

export const nullish: Exercise = {
    prompt: 'Fix `displayName(user)` so it uses the nickname if there is one, then the name, then `"Anonymous"`. A nickname of `""` counts as a nickname the user chose, so keep it. Only `null` and `undefined` should fall through.',
    files: {
        'display-name.js': `function displayName(user) {
  return user.nickname || user.name || "Anonymous";
}
`,
    },
    check: {
        type: 'function',
        function: 'displayName',
        cases: [
            { name: 'Uses the nickname', args: [{ name: 'Ada', nickname: 'Countess' }], expected: 'Countess' },
            { name: 'Falls back to the name', args: [{ name: 'Linus', nickname: null }], expected: 'Linus' },
            { name: 'Keeps an empty nickname', args: [{ name: 'Grace', nickname: '' }], expected: '' },
            { name: 'Anonymous when nothing is set', args: [{}], expected: 'Anonymous' },
        ],
    },
    hints: [
        '`||` skips every "falsy" value, and the empty string `""` is falsy.',
        '`??` only skips `null` and `undefined`.',
        'Replace both `||` with `??`.',
    ],
    solution: `function displayName(user) {
  return user.nickname ?? user.name ?? "Anonymous";
}
`,
};

export const forLoop: Exercise = {
    prompt: 'Finish `sumArray(numbers)` so it adds up all the numbers in the array with a `for` loop. `sumArray([1, 2, 3])` is `6`, and an empty array sums to `0`.',
    files: {
        'sum.js': `function sumArray(numbers) {
  let total = 0;
  // Loop over numbers here
  return total;
}
`,
    },
    check: {
        type: 'function',
        function: 'sumArray',
        cases: [
            { args: [[1, 2, 3]], expected: 6 },
            { args: [[10, -4]], expected: 6 },
            { args: [[]], expected: 0 },
            { args: [[0.5, 0.25]], expected: 0.75 },
        ],
    },
    hints: [
        'A classic for loop: `for (let i = 0; i < numbers.length; i++) { ... }`.',
        'Inside the loop, `numbers[i]` is the current number.',
        'Add each one to the running total: `total += numbers[i];`',
    ],
    solution: `function sumArray(numbers) {
  let total = 0;
  for (let i = 0; i < numbers.length; i++) {
    total += numbers[i];
  }
  return total;
}
`,
};

export const switchCase: Exercise = {
    prompt: 'Finish `dayName(day)` with a `switch`: 0 is `"Sunday"`, 1 `"Monday"`, … 6 `"Saturday"`. Any other number returns `"Invalid day"`.',
    files: {
        'days.js': `function dayName(day) {
  switch (day) {
    case 0:
      return "Sunday";
  }
}
`,
    },
    check: {
        type: 'function',
        function: 'dayName',
        cases: [
            { args: [0], expected: 'Sunday' },
            { args: [1], expected: 'Monday' },
            { args: [6], expected: 'Saturday' },
            { args: [7], expected: 'Invalid day' },
        ],
    },
    hints: [
        'Add one `case` per day, each with its own `return`.',
        'Because each case returns, you don\'t need `break` here.',
        '`default: return "Invalid day";` handles every number without a case.',
    ],
    solution: `function dayName(day) {
  switch (day) {
    case 0: return "Sunday";
    case 1: return "Monday";
    case 2: return "Tuesday";
    case 3: return "Wednesday";
    case 4: return "Thursday";
    case 5: return "Friday";
    case 6: return "Saturday";
    default: return "Invalid day";
  }
}
`,
};

export const largest: Exercise = {
    prompt: 'Finish `largest(numbers)` so it returns the biggest number in the array, without `Math.max`. Return `null` for an empty array.',
    files: {
        'largest.js': `function largest(numbers) {
  let biggest = 0;
  for (const n of numbers) {
    if (n > biggest) biggest = n;
  }
  return biggest;
}
`,
    },
    check: {
        type: 'function',
        function: 'largest',
        cases: [
            { args: [[3, 7, 2]], expected: 7 },
            { name: 'All negative numbers', args: [[-5, -1, -9]], expected: -1 },
            { args: [[4]], expected: 4 },
            { name: 'Empty array', args: [[]], expected: null },
        ],
    },
    hints: [
        'Try it with `[-5, -1, -9]`: starting at 0, no number is ever bigger than `biggest`.',
        'Start with the first number of the array instead of 0.',
        'Handle the empty array first (`if (numbers.length === 0) return null;`), then start with `let biggest = numbers[0];`.',
    ],
    solution: `function largest(numbers) {
  if (numbers.length === 0) return null;
  let biggest = numbers[0];
  for (const n of numbers) {
    if (n > biggest) biggest = n;
  }
  return biggest;
}
`,
};

export const objectLiterals: Exercise = {
    prompt: 'Finish `createAddress(street, city, zipCode)` so it returns an object with those three properties, like `{ street: "1 Main St", city: "Springfield", zipCode: "12345" }`.',
    files: {
        'address.js': `function createAddress(street, city, zipCode) {
  return {};
}
`,
    },
    check: {
        type: 'function',
        function: 'createAddress',
        cases: [
            { args: ['1 Main St', 'Springfield', '12345'], expected: { street: '1 Main St', city: 'Springfield', zipCode: '12345' } },
            { args: ['221B Baker St', 'London', 'NW1'], expected: { street: '221B Baker St', city: 'London', zipCode: 'NW1' } },
        ],
    },
    hints: [
        'An object literal lists `key: value` pairs between braces.',
        'The keys must be exactly `street`, `city` and `zipCode`.',
        'When a variable has the same name as the key, you can write just the name: `{ street, city, zipCode }`.',
    ],
    solution: `function createAddress(street, city, zipCode) {
  return { street, city, zipCode };
}
`,
};
