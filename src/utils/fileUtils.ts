
export const hashString = (s: string) => {
    let h = 5381;
    for (let i = 0; i < s.length; i++) {
        h = ((h << 5) + h) ^ s.charCodeAt(i);
    }
    return (h >>> 0).toString(16);
};

export const computeFileId = (name: string, filePath?: string) => {
    const base = name.replace(/[^a-z0-9]/gi, '_').toLowerCase();
    const suffix = filePath ? `_${hashString(String(filePath))}` : '';
    return `${base}${suffix}.json`;
};

export const projectFileIdFromName = (name: string) => {
    // This seems to simply correspond to the base name sanitization in some contexts, 
    // but in App.tsx it was used. ensuring consistency.
    return computeFileId(name);
};
