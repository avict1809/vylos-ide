import { CourseDefinition } from '../types';

export const qt: CourseDefinition = {
    id: 'qt',
    title: 'Desktop Apps with Qt',
    tagline: 'Cross-platform C++ GUIs — one codebase for Windows, macOS, and Linux.',
    level: 'Intermediate (C++ required)',
    hours: 18,
    accent: '#41CD52',
    badge: 'QT',
    category: 'framework',
    stack: 'C++',
    modules: [
        {
            title: 'Getting Started',
            description: 'The Qt ecosystem and your first window.',
            lessons: [
                'What Qt is (widgets, Quick, tooling)',
                'Installing Qt and Qt Creator',
                'Your first widgets application',
                'QApplication and the event loop',
                'Building with CMake',
            ],
        },
        {
            title: 'Widgets & Layouts',
            description: 'The building blocks of desktop UIs.',
            lessons: [
                'Common widgets: labels, buttons, inputs',
                'Layouts: VBox, HBox, Grid, Form',
                'Nesting layouts',
                'Size policies and stretching',
                'Designer (.ui files) vs code-only UIs',
                'Exercise: a settings panel',
            ],
        },
        {
            title: 'Signals & Slots',
            description: 'Qt’s signature communication mechanism.',
            lessons: [
                'The signals & slots model',
                'connect() syntax (modern pointer-based)',
                'Lambdas as slots',
                'Defining custom signals',
                'Q_OBJECT and moc (what the magic is)',
                'Exercise: live form preview',
            ],
        },
        {
            title: 'Main Windows & Dialogs',
            description: 'Real application scaffolding.',
            lessons: [
                'QMainWindow: menus, toolbars, status bar',
                'Actions and keyboard shortcuts',
                'Standard dialogs (file, message, input)',
                'Custom dialogs',
                'Persisting window state with QSettings',
            ],
        },
        {
            title: 'Model/View Programming',
            description: 'Display data sets the scalable way.',
            lessons: [
                'The model/view idea',
                'QListWidget vs QListView (convenience vs power)',
                'QStandardItemModel',
                'Table views',
                'Custom models (QAbstractListModel)',
                'Selection handling',
            ],
        },
        {
            title: 'Files & Data',
            description: 'Persistence for desktop apps.',
            lessons: [
                'QFile and QTextStream',
                'JSON with QJsonDocument',
                'SQLite via Qt SQL',
                'Exercise: contact book with SQLite',
            ],
        },
        {
            title: 'Painting & Custom Widgets',
            description: 'When built-in widgets are not enough.',
            lessons: [
                'QPainter basics',
                'paintEvent and update()',
                'Handling mouse events',
                'A custom chart/canvas widget',
            ],
        },
        {
            title: 'Qt Quick / QML Overview',
            description: 'The declarative side of Qt.',
            lessons: [
                'What QML is and when to choose it',
                'A small QML UI',
                'Connecting QML to C++',
                'Widgets vs Quick: a decision guide',
            ],
        },
        {
            title: 'Packaging & Deployment',
            description: 'Shipping to all three desktops.',
            lessons: [
                'Release builds',
                'windeployqt / macdeployqt / Linux packaging',
                'Icons and app metadata',
                'Installer basics',
            ],
        },
        {
            title: 'Capstone Project',
            description: 'A complete cross-platform desktop tool.',
            lessons: [
                'Scoping: notes manager or log viewer',
                'Main window and menus',
                'Model/view data display',
                'SQLite persistence',
                'Polish and shortcuts',
                'Package for your OS',
            ],
        },
    ],
};
