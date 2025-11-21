import React from 'react';
import {Text} from 'ink';

interface Props {
	children: React.ReactNode;
}

interface State {
	error: Error | null;
}

class ErrorBoundaryInner extends React.Component<Props, State> {
	constructor(props: Props) {
		super(props);
		this.state = {error: null};
	}

	// Function you can call from App
	public reportError(error: any) {
		console.error('Reported error:', error);
		this.setState({
			error: error instanceof Error ? error : new Error(String(error)),
		});
	}

	static getDerivedStateFromError(error: any) {
		return {error};
	}

	componentDidCatch(error: any, info: any) {
		console.error('Render error:', error, info);
	}

	render() {
		if (this.state.error) {
			return <Text color="red">Error: {String(this.state.error)}</Text>;
		}
		return this.props.children;
	}
}

// Wrap in forwardRef so App can call reportError()
const ErrorBoundary = React.forwardRef<ErrorBoundaryInner, Props>(
	(props, ref) => <ErrorBoundaryInner {...props} ref={ref} />,
);

export default ErrorBoundary;
export type {ErrorBoundaryInner};
