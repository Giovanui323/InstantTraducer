import React from 'react';

export interface ReaderState {
  showHighlights: boolean;
  showUserNotes: boolean;
  showThumbnail: boolean;
  isHighlightToolActive: boolean;
  highlightColor: string;
  isNoteToolActive: boolean;
  isEraserToolActive: boolean;
  isHandToolActive: boolean;
  newNoteModal: { page: number, start: number, end: number, text: string } | null;
  viewingNoteId: { page: number, id: string } | null;
  containerWidth: number;
  isSpaceDown: boolean;
  isPanning: boolean;
  activePage: number | null;
  floatingPage: number | null;
}

export type ReaderAction =
  | { type: 'TOGGLE_THUMBNAIL' }
  | { type: 'SET_TOOL', tool: 'highlight' | 'note' | 'eraser' | 'hand' | null }
  | { type: 'SET_HIGHLIGHT_COLOR', color: string }
  | { type: 'OPEN_NOTE_MODAL', page: number, start: number, end: number, text: string }
  | { type: 'CLOSE_NOTE_MODAL' }
  | { type: 'VIEW_NOTE', page: number, id: string }
  | { type: 'CLOSE_NOTE_VIEW' }
  | { type: 'SET_CONTAINER_WIDTH', width: number }
  | { type: 'SET_SPACE_DOWN', isDown: boolean }
  | { type: 'SET_PANNING', isPanning: boolean }
  | { type: 'SET_ACTIVE_PAGE', page: number | null }
  | { type: 'SET_FLOATING_PAGE', page: number | null };

export function readerReducer(state: ReaderState, action: ReaderAction): ReaderState {
  switch (action.type) {
    case 'TOGGLE_THUMBNAIL':
      return { ...state, showThumbnail: !state.showThumbnail };
    case 'SET_TOOL':
      return {
        ...state,
        isHighlightToolActive: action.tool === 'highlight' ? !state.isHighlightToolActive : false,
        isNoteToolActive: action.tool === 'note' ? !state.isNoteToolActive : false,
        isEraserToolActive: action.tool === 'eraser' ? !state.isEraserToolActive : false,
        isHandToolActive: action.tool === 'hand' ? !state.isHandToolActive : false,
      };
    case 'SET_HIGHLIGHT_COLOR':
      return { ...state, highlightColor: action.color };
    case 'OPEN_NOTE_MODAL':
      return { ...state, newNoteModal: { page: action.page, start: action.start, end: action.end, text: action.text } };
    case 'CLOSE_NOTE_MODAL':
      return { ...state, newNoteModal: null };
    case 'VIEW_NOTE':
      return { ...state, viewingNoteId: { page: action.page, id: action.id } };
    case 'CLOSE_NOTE_VIEW':
      return { ...state, viewingNoteId: null };
    case 'SET_CONTAINER_WIDTH':
      return { ...state, containerWidth: action.width };
    case 'SET_SPACE_DOWN':
      return { ...state, isSpaceDown: action.isDown };
    case 'SET_PANNING':
      return { ...state, isPanning: action.isPanning };
    case 'SET_ACTIVE_PAGE':
      return { ...state, activePage: action.page };
    case 'SET_FLOATING_PAGE':
      return { ...state, floatingPage: action.page };
    default:
      return state;
  }
}

export const initialReaderState = (
  initialShowThumbnail: boolean
): ReaderState => ({
  showHighlights: true,
  showUserNotes: true,
  showThumbnail: initialShowThumbnail,
  isHighlightToolActive: false,
  highlightColor: 'yellow',
  isNoteToolActive: false,
  isEraserToolActive: false,
  isHandToolActive: false,
  newNoteModal: null,
  viewingNoteId: null,
  containerWidth: 0,
  isSpaceDown: false,
  isPanning: false,
  activePage: null,
  floatingPage: null,
});
