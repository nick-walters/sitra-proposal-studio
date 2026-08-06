import { Node, mergeAttributes } from '@tiptap/core';
import { ReactNodeViewRenderer } from '@tiptap/react';
import { OverviewCanvasSlotNodeView } from '@/components/OverviewCanvasSlotNodeView';

/**
 * overviewCanvasSlot — block atom holding the B1.1 project overview canvas.
 *
 * Persisted DOM shape: <div data-overview-canvas-slot></div>
 * Exactly one node is reconciled into the Objectives subsection of B1.1.
 */
export const OverviewCanvasSlotNode = Node.create({
  name: 'overviewCanvasSlot',
  group: 'block',
  atom: true,
  selectable: true,
  draggable: false,
  defining: true,

  parseHTML() {
    return [{ tag: 'div[data-overview-canvas-slot]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { 'data-overview-canvas-slot': '' })];
  },

  addNodeView() {
    return ReactNodeViewRenderer(OverviewCanvasSlotNodeView);
  },
});

export default OverviewCanvasSlotNode;
