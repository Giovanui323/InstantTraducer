import { useCallback, useState } from 'react';
import { Group, ReadingProgress } from '../../types';
import { log } from '../../services/logger';

export interface GroupManagerResult {
  availableGroups: Group[];
  selectedGroupFilters: string[];
  loadGroups: () => Promise<void>;
  handleCreateGroup: (groupName: string) => void;
  handleDeleteGroup: (groupId: string) => void;
  handleToggleGroupFilter: (groupId: string) => void;
  handleAssignGroup: (fileId: string, groupIdOrName: string) => void;
}

export interface GroupManagerProps {
  showConfirm?: (title: string, message: string, onConfirm: () => void, type?: 'danger' | 'info' | 'alert') => void;
  recentBooksRef: React.MutableRefObject<Record<string, ReadingProgress>>;
  availableGroups?: Group[];
  setAvailableGroups?: React.Dispatch<React.SetStateAction<Group[]>>;
  selectedGroupFilters?: string[];
  setSelectedGroupFilters?: React.Dispatch<React.SetStateAction<string[]>>;
  updateLibrary?: (fileId: string, data: Partial<ReadingProgress> & { fileId: string }) => void;
}

export const useGroupManager = ({
  showConfirm,
  recentBooksRef,
  availableGroups,
  setAvailableGroups,
  selectedGroupFilters,
  setSelectedGroupFilters,
  updateLibrary
}: GroupManagerProps): GroupManagerResult => {
  const [internalAvailableGroups, setInternalAvailableGroups] = useState<Group[]>([]);
  const [internalSelectedGroupFilters, setInternalSelectedGroupFilters] = useState<string[]>([]);

  // Use internal state if not provided
  const groups = availableGroups ?? internalAvailableGroups;
  const setGroups = setAvailableGroups ?? setInternalAvailableGroups;
  const filters = selectedGroupFilters ?? internalSelectedGroupFilters;
  const setFilters = setSelectedGroupFilters ?? setInternalSelectedGroupFilters;

  const loadGroups = useCallback(async () => {
    try {
      const groups = await window.electronAPI?.loadGroups();
      if (groups && Array.isArray(groups)) {
        let normalizedGroups: Group[] = [];
        let hasChanges = false;

        // Migration logic: Convert strings to Objects
        normalizedGroups = groups.map((g: unknown) => {
          if (typeof g === 'string') {
            hasChanges = true;
            return { id: crypto.randomUUID(), name: g };
          }
          if (typeof g === 'object' && g !== null && 'id' in g && 'name' in g) {
            return g as Group;
          }
          // If invalid object, try to recover: has name but no id
          if (typeof g === 'object' && g !== null && 'name' in g && !('id' in g)) {
             hasChanges = true;
             return { ...(g as Record<string, unknown>), id: crypto.randomUUID() } as Group;
          }
          return null;
        }).filter(Boolean) as Group[];

        // Sort by name
        normalizedGroups.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));

        setGroups(normalizedGroups);

        if (hasChanges) {
          log.step("Migrazione gruppi legacy completata: salvataggio nuova struttura.");
          window.electronAPI?.saveGroups(normalizedGroups).catch(e => log.error("Failed to save migrated groups", e));
        }
      }
    } catch (e) {
      log.error('Failed to load groups', e);
    }
  }, []);

  const handleCreateGroup = useCallback((groupName: string) => {
    const trimmed = groupName.trim();
    if (!trimmed) return;

    setGroups(prev => {
      // Check for duplicate name
      const exists = prev.some(g => g.name.toLowerCase() === trimmed.toLowerCase());
      if (exists) return prev;

      const newGroup: Group = { id: crypto.randomUUID(), name: trimmed };
      const newGroups = [...prev, newGroup].sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));

      window.electronAPI?.saveGroups(newGroups).catch(e => log.error("Failed to save groups", e));
      setGroups(newGroups);
      return newGroups;
    });
  }, []);

  const handleDeleteGroup = useCallback((groupId: string) => {
    if (showConfirm) {
      // Find group name for display
      const groupName = groups.find(g => g.id === groupId)?.name || groupId;

      showConfirm(
        "Elimina Gruppo",
        `Sei sicuro di voler eliminare il gruppo "${groupName}" dalla lista globale? (Resterà comunque assegnato ai libri esistenti)`,
        () => {
          setGroups(prev => {
            const next = prev.filter(g => g.id !== groupId);
            window.electronAPI?.saveGroups(next).catch(e => log.error("Failed to save groups", e));
            return next;
          });
          setFilters(prev => prev.filter(g => g !== groupId));
        },
        'danger'
      );
    }
  }, [showConfirm, groups, setGroups, setFilters]);

  const handleToggleGroupFilter = useCallback((groupId: string) => {
    setFilters(prev =>
      prev.includes(groupId) ? prev.filter(g => g !== groupId) : [...prev, groupId]
    );
  }, [setFilters]);

  const handleAssignGroup = useCallback((fileId: string, groupIdOrName: string) => {
    if (!updateLibrary) return;

    // CRITICAL FIX: Use ref to avoid stale closure state
    const book = recentBooksRef.current[fileId];
    if (!book) return;

    let targetId = groupIdOrName;
    const currentGroups = book.groups || [];

    // Find the group object for the target ID
    const targetGroupObj = groups.find(g => g.id === targetId);
    const targetName = targetGroupObj?.name;

    const isAlreadyAssigned = currentGroups.some((g: string) => {
        if (g === targetId) return true;
        if (targetName && g === targetName) return true; // Match by name (legacy)
        return false;
    });

    let newGroups: string[];

    if (isAlreadyAssigned) {
        // Remove both ID and Name (clean up legacy)
        newGroups = currentGroups.filter((g: string) => g !== targetId && g !== targetName);
    } else {
        // Add ID
        newGroups = [...currentGroups, targetId];
    }

    // CRITICAL FIX: Pass explicit fileId to avoid collisions
    void updateLibrary(fileId, { fileId, groups: newGroups });
  }, [groups, recentBooksRef, updateLibrary]);

  return {
    availableGroups: groups,
    selectedGroupFilters: filters,
    loadGroups,
    handleCreateGroup,
    handleDeleteGroup,
    handleToggleGroupFilter,
    handleAssignGroup
  };
};
