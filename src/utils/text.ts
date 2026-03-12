/**
 * Removes UUIDs and trailing dashes/em-dashes from a string.
 * Used for cleaning up field names or other identifiers that might have concatenated IDs.
 */
export function cleanName(name: string): string {
    const uuidRegex = /[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}/gi;
    return name
        .replace(uuidRegex, '')
        .trim()
        .replace(/\s*—\s*$/, '')
        .replace(/\s*-\s*$/, '');
}
