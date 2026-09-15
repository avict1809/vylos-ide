import type { Exercise } from '../../types';

// Exercises for python.ts, one per lesson that has one. Every starter must
// fail its check and every solution must pass it.

export const helloWorld: Exercise = {
    prompt: 'Write a program that prints exactly `Hello, World!`',
    files: { 'hello.py': '# Print Hello, World! below\n' },
    check: { type: 'output', cases: [{ expected: 'Hello, World!' }] },
    hints: [
        '`print()` shows whatever you put between its parentheses.',
        'Text goes inside quotes, like `"this"`.',
        'Match it exactly: a capital H, a comma, a space, a capital W and an exclamation mark.',
    ],
    solution: 'print("Hello, World!")\n',
};

export const slicing: Exercise = {
    prompt: 'Finish `middle(word)` so it returns the word without its first and last letters. `middle("python")` should return `"ytho"`.',
    files: {
        'middle.py': `def middle(word):
    # Return word without its first and last characters
    return word
`,
    },
    check: {
        type: 'function',
        function: 'middle',
        cases: [
            { args: ['python'], expected: 'ytho' },
            { args: ['cat'], expected: 'a' },
            { args: ['ab'], expected: '' },
        ],
    },
    hints: [
        'A slice `word[start:end]` gives the characters from `start` up to, but not including, `end`.',
        'Index 1 is the second character. A negative index counts from the end: -1 is the last character.',
        'Start the slice at 1 and stop it at -1.',
    ],
    solution: `def middle(word):
    return word[1:-1]
`,
};

export const fStrings: Exercise = {
    prompt: 'Finish `introduce(name, age)` so it returns a sentence like `"Hi, I\'m Ada and I\'m 36 years old."` Use an f-string.',
    files: {
        'introduce.py': `def introduce(name, age):
    # Return: Hi, I'm <name> and I'm <age> years old.
    return "Hi, I'm name and I'm age years old."
`,
    },
    check: {
        type: 'function',
        function: 'introduce',
        cases: [
            { args: ['Ada', 36], expected: "Hi, I'm Ada and I'm 36 years old." },
            { args: ['Linus', 21], expected: "Hi, I'm Linus and I'm 21 years old." },
        ],
    },
    hints: [
        'An f-string starts with an `f` right before the opening quote: `f"..."`.',
        'Inside an f-string, `{name}` is replaced by the value of the variable `name`.',
        'Put `{name}` and `{age}` where the words name and age are now, and add the `f`.',
    ],
    solution: `def introduce(name, age):
    return f"Hi, I'm {name} and I'm {age} years old."
`,
};

export const stringMethods: Exercise = {
    prompt: 'Finish `clean_username(text)`: remove spaces at both ends, make it lowercase, and replace the spaces between words with underscores. `"  Ada Lovelace "` becomes `"ada_lovelace"`.',
    files: {
        'username.py': `def clean_username(text):
    # 1. remove spaces at both ends  2. lowercase  3. spaces -> underscores
    return text.lower()
`,
    },
    check: {
        type: 'function',
        function: 'clean_username',
        cases: [
            { args: ['  Ada Lovelace '], expected: 'ada_lovelace' },
            { args: ['GRACE'], expected: 'grace' },
            { args: ['Alan Mathison Turing'], expected: 'alan_mathison_turing' },
        ],
    },
    hints: [
        'Strings have methods for each step: one removes whitespace at the ends, one lowercases, one replaces text.',
        'They are `.strip()`, `.lower()` and `.replace(old, new)`.',
        'Methods can be chained: `text.strip().lower().replace(" ", "_")`.',
    ],
    solution: `def clean_username(text):
    return text.strip().lower().replace(" ", "_")
`,
};

export const arithmetic: Exercise = {
    prompt: 'Finish `minutes_and_seconds(total)` so it turns a number of seconds into minutes and the seconds left over. `minutes_and_seconds(125)` returns `(2, 5)`. Use `//` and `%`.',
    files: {
        'time_split.py': `def minutes_and_seconds(total):
    minutes = total / 60
    seconds = 0
    return (minutes, seconds)
`,
    },
    check: {
        type: 'function',
        function: 'minutes_and_seconds',
        cases: [
            { args: [125], expected: [2, 5] },
            { args: [60], expected: [1, 0] },
            { args: [59], expected: [0, 59] },
        ],
    },
    hints: [
        '`/` always gives a float: `125 / 60` is `2.0833…`. You want the whole minutes only.',
        '`//` divides and drops the remainder. `%` gives the remainder.',
        '`minutes = total // 60` and `seconds = total % 60`.',
    ],
    solution: `def minutes_and_seconds(total):
    minutes = total // 60
    seconds = total % 60
    return (minutes, seconds)
`,
};

export const typeConversion: Exercise = {
    prompt: 'This program should ask for two whole numbers and print their sum, but for 3 and 5 it prints `35`. `input()` always gives you text. Convert both answers to numbers so it prints `8`.',
    files: {
        'add.py': `a = input("First number: ")
b = input("Second number: ")
print(a + b)
`,
    },
    check: {
        type: 'output',
        cases: [
            { name: '3 and 5 make 8', input: '3\n5', expected: '8', match: 'contains' },
            { name: '10 and 20 make 30', input: '10\n20', expected: '30', match: 'contains' },
            { name: '7 and 7 make 14', input: '7\n7', expected: '14', match: 'contains' },
        ],
    },
    hints: [
        'Adding two pieces of text joins them: `"3" + "5"` is `"35"`.',
        '`int("3")` turns the text `"3"` into the number `3`.',
        'Wrap each `input(...)` in `int(...)`, or convert `a` and `b` before adding them.',
    ],
    solution: `a = int(input("First number: "))
b = int(input("Second number: "))
print(a + b)
`,
};

export const ifElif: Exercise = {
    prompt: 'Finish `grade(score)`: 90 and above is `"A"`, 80–89 `"B"`, 70–79 `"C"`, 60–69 `"D"`, and below 60 `"F"`.',
    files: {
        'grade.py': `def grade(score):
    if score >= 90:
        return "A"
    # Add the other grades here
`,
    },
    check: {
        type: 'function',
        function: 'grade',
        cases: [
            { args: [95], expected: 'A' },
            { args: [90], expected: 'A' },
            { args: [85], expected: 'B' },
            { args: [72], expected: 'C' },
            { args: [60], expected: 'D' },
            { args: [59], expected: 'F' },
        ],
    },
    hints: [
        'Add an `elif` for each grade, checking the highest scores first.',
        'Once one condition is true, Python skips the rest, so `elif score >= 80` only runs for scores below 90.',
        'Finish with `else: return "F"` for everything below 60.',
    ],
    solution: `def grade(score):
    if score >= 90:
        return "A"
    elif score >= 80:
        return "B"
    elif score >= 70:
        return "C"
    elif score >= 60:
        return "D"
    else:
        return "F"
`,
};

export const leapYear: Exercise = {
    prompt: 'Finish `is_leap_year(year)`. A year is a leap year if it divides by 4, except years that divide by 100, unless they also divide by 400. So 2024 and 2000 are leap years; 2023 and 1900 are not.',
    files: {
        'leap.py': `def is_leap_year(year):
    return year % 4 == 0
`,
    },
    check: {
        type: 'function',
        function: 'is_leap_year',
        cases: [
            { args: [2024], expected: true },
            { args: [2023], expected: false },
            { args: [1900], expected: false },
            { args: [2000], expected: true },
        ],
    },
    hints: [
        '`year % 4 == 0` means "divides by 4". The same pattern works for 100 and 400.',
        'Leap year = divides by 4 AND (does NOT divide by 100 OR divides by 400).',
        '`return year % 4 == 0 and (year % 100 != 0 or year % 400 == 0)`',
    ],
    solution: `def is_leap_year(year):
    return year % 4 == 0 and (year % 100 != 0 or year % 400 == 0)
`,
};

export const forRange: Exercise = {
    prompt: 'Finish `sum_up_to(n)` so it adds up every whole number from 1 to `n` with a `for` loop. `sum_up_to(5)` is 1 + 2 + 3 + 4 + 5 = `15`.',
    files: {
        'sum_up_to.py': `def sum_up_to(n):
    total = 0
    for number in range(1, n):
        total += number
    return total
`,
    },
    check: {
        type: 'function',
        function: 'sum_up_to',
        cases: [
            { args: [1], expected: 1 },
            { args: [5], expected: 15 },
            { args: [100], expected: 5050 },
            { args: [0], expected: 0 },
        ],
    },
    hints: [
        'The loop is almost right. Print `list(range(1, 5))` to see which numbers it gives.',
        '`range(start, stop)` stops just before `stop`.',
        'Use `range(1, n + 1)` so `n` itself is included.',
    ],
    solution: `def sum_up_to(n):
    total = 0
    for number in range(1, n + 1):
        total += number
    return total
`,
};

export const whileLoop: Exercise = {
    prompt: 'Finish `count_digits(n)` so it returns how many digits a non-negative whole number has, using a `while` loop. `count_digits(12345)` is `5` and `count_digits(0)` is `1`.',
    files: {
        'digits.py': `def count_digits(n):
    # Hint: n // 10 drops the last digit
    count = 0
    return count
`,
    },
    check: {
        type: 'function',
        function: 'count_digits',
        cases: [
            { args: [7], expected: 1 },
            { args: [42], expected: 2 },
            { args: [12345], expected: 5 },
            { args: [0], expected: 1 },
        ],
    },
    hints: [
        'Each time you do `n = n // 10`, the number loses one digit.',
        'Every number has at least one digit, so start counting at 1.',
        'Start with `count = 1`, then `while n >= 10:` divide `n` by 10 with `//` and add 1 to `count`.',
    ],
    solution: `def count_digits(n):
    count = 1
    while n >= 10:
        n = n // 10
        count += 1
    return count
`,
};

export const fizzBuzz: Exercise = {
    prompt: 'Print the numbers from 1 to 15, one per line. For multiples of 3 print `Fizz` instead, for multiples of 5 print `Buzz`, and for multiples of both print `FizzBuzz`.',
    files: {
        'fizzbuzz.py': `for n in range(1, 16):
    print(n)
`,
    },
    check: {
        type: 'output',
        cases: [{ expected: '1\n2\nFizz\n4\nBuzz\nFizz\n7\n8\nFizz\nBuzz\n11\nFizz\n13\n14\nFizzBuzz' }],
    },
    hints: [
        '`n % 3 == 0` is true when `n` is a multiple of 3.',
        'Check "multiple of both" first. Otherwise 15 would stop at the Fizz check.',
        'Inside the loop: `if n % 15 == 0:` FizzBuzz, `elif n % 3 == 0:` Fizz, `elif n % 5 == 0:` Buzz, `else:` the number.',
    ],
    solution: `for n in range(1, 16):
    if n % 15 == 0:
        print("FizzBuzz")
    elif n % 3 == 0:
        print("Fizz")
    elif n % 5 == 0:
        print("Buzz")
    else:
        print(n)
`,
};

export const defaultArgs: Exercise = {
    prompt: 'Change `power` so the exponent is optional and defaults to 2. `power(3)` should return `9`, and `power(2, 10)` should still return `1024`.',
    files: {
        'power.py': `def power(base, exponent):
    return base ** exponent
`,
    },
    check: {
        type: 'function',
        function: 'power',
        cases: [
            { args: [3], expected: 9 },
            { args: [2, 10], expected: 1024 },
            { args: [5, 0], expected: 1 },
        ],
    },
    hints: [
        'Right now `power(3)` fails because Python wants a value for every parameter.',
        'A parameter can have a default value, used when the caller leaves it out.',
        'Write `exponent=2` in the parameter list.',
    ],
    solution: `def power(base, exponent=2):
    return base ** exponent
`,
};

export const returningNone: Exercise = {
    prompt: 'Fix `average(numbers)` so it returns `None` for an empty list instead of crashing. `average([2, 4, 6])` is `4`.',
    files: {
        'average.py': `def average(numbers):
    return sum(numbers) / len(numbers)
`,
    },
    check: {
        type: 'function',
        function: 'average',
        cases: [
            { args: [[2, 4, 6]], expected: 4 },
            { args: [[1, 2]], expected: 1.5 },
            { args: [[]], expected: null },
        ],
    },
    hints: [
        'For an empty list, `len(numbers)` is 0, and dividing by zero raises `ZeroDivisionError`.',
        'An empty list counts as false, so `if not numbers:` is true only when it\'s empty.',
        'Before dividing: `if not numbers: return None`.',
    ],
    solution: `def average(numbers):
    if not numbers:
        return None
    return sum(numbers) / len(numbers)
`,
};

export const fibonacci: Exercise = {
    prompt: 'Finish `fibonacci(n)` so it returns a list of the first `n` Fibonacci numbers. The list starts `0, 1`, and each next number is the sum of the two before it: `fibonacci(7)` is `[0, 1, 1, 2, 3, 5, 8]`.',
    files: {
        'fibonacci.py': `def fibonacci(n):
    numbers = []
    # Build the list here
    return numbers
`,
    },
    check: {
        type: 'function',
        function: 'fibonacci',
        cases: [
            { args: [0], expected: [] },
            { args: [1], expected: [0] },
            { args: [2], expected: [0, 1] },
            { args: [7], expected: [0, 1, 1, 2, 3, 5, 8] },
        ],
    },
    hints: [
        'Keep two variables for the last two numbers, starting at `a = 0` and `b = 1`.',
        'Loop `n` times. Each time, add `a` to the list, then move forward one step.',
        'Moving forward one step: `a, b = b, a + b`.',
    ],
    solution: `def fibonacci(n):
    numbers = []
    a, b = 0, 1
    for _ in range(n):
        numbers.append(a)
        a, b = b, a + b
    return numbers
`,
};

export const listComprehension: Exercise = {
    prompt: 'Finish `squares_of_evens(numbers)` with a list comprehension: return the square of every even number, in order. `squares_of_evens([1, 2, 3, 4])` is `[4, 16]`.',
    files: {
        'evens.py': `def squares_of_evens(numbers):
    return [n for n in numbers]
`,
    },
    check: {
        type: 'function',
        function: 'squares_of_evens',
        cases: [
            { args: [[1, 2, 3, 4, 5, 6]], expected: [4, 16, 36] },
            { args: [[]], expected: [] },
            { args: [[7, 9]], expected: [] },
            { args: [[-2, 3]], expected: [4] },
        ],
    },
    hints: [
        'A list comprehension has the shape `[expression for item in items if condition]`.',
        'The expression is what goes in the new list (the square); the condition picks which items to keep (the even ones).',
        '`[n * n for n in numbers if n % 2 == 0]`',
    ],
    solution: `def squares_of_evens(numbers):
    return [n * n for n in numbers if n % 2 == 0]
`,
};

export const wordFrequency: Exercise = {
    prompt: 'Finish `word_counts(text)` so it returns a dictionary of how many times each word appears, ignoring upper and lower case. `word_counts("the cat the hat")` is `{"the": 2, "cat": 1, "hat": 1}`.',
    files: {
        'words.py': `def word_counts(text):
    counts = {}
    # Count each word here
    return counts
`,
    },
    check: {
        type: 'function',
        function: 'word_counts',
        cases: [
            { args: ['the cat the hat'], expected: { the: 2, cat: 1, hat: 1 } },
            { args: ['Go go GO'], expected: { go: 3 } },
            { args: [''], expected: {} },
        ],
    },
    hints: [
        '`text.lower().split()` gives you a list of lowercase words.',
        'Loop over the words. For each one, add 1 to its count in the dictionary.',
        '`counts[word] = counts.get(word, 0) + 1`: `.get` returns 0 the first time a word is seen.',
    ],
    solution: `def word_counts(text):
    counts = {}
    for word in text.lower().split():
        counts[word] = counts.get(word, 0) + 1
    return counts
`,
};
