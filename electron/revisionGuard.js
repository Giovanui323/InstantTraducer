export const createRevisionGuard = () => {
  const highestSeenRevisionByFileId = new Map();

  const checkAndUpdate = (fileId, revision) => {
    const rev = Number.isFinite(Number(revision)) ? Number(revision) : null;
    if (rev === null) return { skip: false, revision: null, highestSeen: null };

    const prevSeen = highestSeenRevisionByFileId.get(fileId) ?? -1;
    if (rev < prevSeen) return { skip: true, revision: rev, highestSeen: prevSeen };

    highestSeenRevisionByFileId.set(fileId, rev);
    return { skip: false, revision: rev, highestSeen: rev };
  };

  return { checkAndUpdate };
};

