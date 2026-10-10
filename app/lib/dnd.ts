'use client';

/**
 * dataTransfer types for the drags that cross components.
 *
 * A drag can carry more than one: an explorer file sets both PATH_DRAG (so
 * dropping it on a folder moves it) and FILE_DRAG (so dropping it on an editor
 * group opens it there).
 */

/** An explorer entry, file or folder. Value: its path. Dropped on a folder, it moves. */
export const PATH_DRAG = 'application/x-vylos-path';

/** A file an editor group can open. Value: its path. Folders never set this. */
export const FILE_DRAG = 'application/x-vylos-file';

/** An already-open editor tab, dragged between groups. Value: its path. */
export const TAB_DRAG = 'application/x-vylos-tab';

/** True when a drag carries something an editor group accepts. */
export const isEditorDrag = (types: DataTransfer['types']) =>
    types.includes(FILE_DRAG) || types.includes(TAB_DRAG);
