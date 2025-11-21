// cli.ts
import React from 'react';
import {render} from 'ink';
import App from './app.js';
import ErrorBoundary, {ErrorBoundaryInner} from './ErrorBoundary.js';

export const boundaryRef = React.createRef<ErrorBoundaryInner>();

render(
	React.createElement(
		ErrorBoundary,
		// @ts-ignore
		{ref: boundaryRef},
		React.createElement(App, {boundaryRef}),
	),
);
