import { CourseDefinition } from '../types';
import { AI_ACCURACY_GUIDELINES } from './guidelines';

export const dataScience: CourseDefinition = {
    id: 'data-science',
    title: 'Data Science with Python',
    tagline: 'Turn raw data into answers with pandas, statistics, and clear visualizations.',
    level: 'Beginner → Intermediate (basic Python)',
    hours: 30,
    accent: '#E70488',
    badge: 'DS',
    category: 'ai',
    stack: 'Python',
    tutorGuidelines: [
        ...AI_ACCURACY_GUIDELINES,
        'Every number you say about a dataset must come from code you ran on it. Never estimate a mean, count, or correlation from memory.',
        'Stress that correlation is not causation. Do not let the learner draw causal conclusions from observational data without saying so.',
        'When you create example data, say it is synthetic. Do not present made-up numbers as real-world statistics.',
    ],
    modules: [
        {
            title: 'Getting Started',
            description: 'The data science workflow and your toolkit.',
            lessons: [
                'What data scientists actually do',
                'The workflow: question, data, analysis, communication',
                'Setting up a virtual environment with NumPy, pandas, matplotlib',
                'Scripts vs notebooks',
            ],
        },
        {
            title: 'NumPy',
            description: 'Fast numerical computing with arrays.',
            lessons: [
                'Creating arrays',
                'Indexing, slicing, and boolean masks',
                'Vectorized operations and broadcasting',
                'Aggregations along axes',
                'Random numbers and reproducibility',
            ],
        },
        {
            title: 'pandas Essentials',
            description: 'The workhorse library for tabular data.',
            lessons: [
                'Series and DataFrames',
                'Reading CSV, Excel, and JSON',
                'Selecting rows and columns (loc and iloc)',
                'Filtering with conditions',
                'Adding and transforming columns',
                'Sorting and ranking',
                'Grouping and aggregating',
                'Merging and joining tables',
                'Reshaping: pivot and melt',
                'Working with dates and times',
            ],
        },
        {
            title: 'Data Cleaning',
            description: 'Real data is messy. Make it trustworthy.',
            lessons: [
                'Finding and handling missing values',
                'Fixing data types',
                'Removing duplicates',
                'Cleaning text columns',
                'Detecting outliers',
                'Exercise: clean a messy dataset',
            ],
        },
        {
            title: 'Visualization',
            description: 'Show data so people understand it.',
            lessons: [
                'matplotlib fundamentals',
                'Line, bar, scatter, and histogram plots',
                'Choosing the right chart',
                'Plotting directly from pandas',
                'Making charts readable: labels, scales, color',
                'Charts that mislead, and how to avoid them',
            ],
        },
        {
            title: 'Statistics for Data Science',
            description: 'Draw conclusions you can defend.',
            lessons: [
                'Descriptive statistics',
                'Distributions',
                'Sampling and the central limit theorem',
                'Confidence intervals',
                'Hypothesis testing and p-values',
                'Correlation vs causation',
                'A/B testing',
            ],
        },
        {
            title: 'SQL for Data Analysis',
            description: 'Query data where it lives.',
            lessons: [
                'Querying SQLite from Python',
                'SELECT, WHERE, ORDER BY',
                'GROUP BY and aggregates',
                'JOINs',
                'Loading query results into pandas',
            ],
        },
        {
            title: 'Intro to Predictive Modeling',
            description: 'A first step from describing data to predicting with it.',
            lessons: [
                'From analysis to prediction',
                'A linear regression model with scikit-learn',
                'Train/test split and evaluation',
                'Knowing when a model is not good enough',
            ],
        },
        {
            title: 'Capstone Project',
            description: 'Answer a real question with data and present it.',
            lessons: [
                'Choosing a question and a public dataset',
                'Cleaning and exploring',
                'Analysis and statistics',
                'Visualizing the findings',
                'Writing a short report with honest limitations',
            ],
        },
    ],
};
