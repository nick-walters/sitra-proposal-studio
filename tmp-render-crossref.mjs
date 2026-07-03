import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ImpactCanvasCrossRefDropdown } from '/dev-server/src/components/ImpactCanvasCrossRefDropdown.tsx';
const fakeEditor={chain(){return {focus(){return this}, insertWPReference(){return this}, insertCaseReference(){return this}, insertTaskReference(){return this}, insertDeliverableReference(){return this}, insertContent(){return this}, unsetBold(){return this}, unsetItalic(){return this}, run(){return true}}}};
console.log(renderToStaticMarkup(React.createElement(ImpactCanvasCrossRefDropdown,{proposalId:'p', activeEditor: fakeEditor, disabled:false})));
