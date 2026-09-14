import { CourseDefinition } from '../types';

export const git: CourseDefinition = {
    id: 'git',
    title: 'Git & GitHub',
    tagline: 'Track every change, undo mistakes, and collaborate like a professional team.',
    level: 'Beginner',
    hours: 15,
    accent: '#F05032',
    badge: 'GIT',
    category: 'essentials',
    stack: 'Git',
    tutorGuidelines: [
        'Practice in a scratch repository created for the lesson (e.g. ~/vylos-git-practice), not in the learner\'s real projects.',
        'The tutor terminal is not interactive. Use commands that never open an editor or pager: git commit -m, git --no-pager log, git --no-pager diff, git merge --no-edit. Let the learner run interactive commands such as git rebase -i themselves.',
        'Never run destructive commands (git reset --hard, git push --force, git clean -fd, deleting branches) outside the scratch repo, and ask before running them even there.',
        'Never push to a remote, create repositories on GitHub, or change global git config without the learner\'s explicit go-ahead.',
        'Git output and defaults vary by version (e.g. the default branch name). Check git --version and show real command output rather than describing it from memory.',
    ],
    modules: [
        {
            title: 'Why Version Control',
            description: 'The problem Git solves, and setting it up.',
            lessons: [
                'What version control is and why everyone uses it',
                'Git vs GitHub',
                'Installing Git and checking the version',
                'Configuring your name and email',
            ],
        },
        {
            title: 'Git Basics',
            description: 'The everyday commit workflow.',
            lessons: [
                'Creating a repository with git init',
                'The working tree, staging area, and repository',
                'git status and git add',
                'Making commits',
                'Viewing history with git log',
                'Seeing changes with git diff',
                'Ignoring files with .gitignore',
                'Writing good commit messages',
            ],
        },
        {
            title: 'Undoing Things',
            description: 'Fix mistakes without panic.',
            lessons: [
                'Discarding changes with git restore',
                'Unstaging files',
                'Amending the last commit',
                'git revert: safely undoing a commit',
                'git reset: soft, mixed, and hard',
                'Recovering "lost" work with git reflog',
            ],
        },
        {
            title: 'Branching & Merging',
            description: 'Work on features in parallel.',
            lessons: [
                'What branches really are',
                'Creating and switching branches',
                'Merging branches',
                'Resolving merge conflicts',
                'Rebasing: the idea and the golden rule',
            ],
        },
        {
            title: 'Remotes & GitHub',
            description: 'Share your code and back it up.',
            lessons: [
                'Creating a GitHub account and repository',
                'SSH keys for GitHub',
                'Cloning a repository',
                'Pushing and pulling',
                'Fetch vs pull',
                'Tracking branches',
            ],
        },
        {
            title: 'Collaboration',
            description: 'How teams work together on GitHub.',
            lessons: [
                'Forks and pull requests',
                'Reviewing code in a pull request',
                'Issues and project boards',
                'Keeping your fork up to date',
            ],
        },
        {
            title: 'Workflows & Releases',
            description: 'Conventions that keep a project healthy.',
            lessons: [
                'Feature branch workflow',
                'Trunk-based development',
                'Tags and releases',
                'Semantic versioning',
                'Continuous integration with GitHub Actions: a first workflow',
            ],
        },
        {
            title: 'Advanced Git',
            description: 'Power tools for tricky situations.',
            lessons: [
                'Stashing work in progress',
                'Cherry-picking commits',
                'Finding a bug with git bisect',
                'Interactive rebase to clean up history',
                'Git hooks',
            ],
        },
        {
            title: 'Capstone Project',
            description: 'Run a small project with a real Git workflow.',
            lessons: [
                'Setting up the repository and README',
                'Building features on branches',
                'Opening and reviewing pull requests',
                'Resolving a conflict',
                'Tagging a release',
            ],
        },
    ],
};
