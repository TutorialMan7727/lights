// App.tsx
import React, {useEffect, useRef, useState} from 'react';
import {Box, Text, useInput} from 'ink';
import noble, {Characteristic} from '@abandonware/noble';
import {connect, setColor} from './bt.js';
import {ErrorBoundaryInner} from './ErrorBoundary.js';

type MonitorId = 1 | 2 | 3;

interface AppProps {
	boundaryRef?: React.RefObject<ErrorBoundaryInner>;
}

function clamp(value: number, min: number, max: number) {
	return Math.max(min, Math.min(max, value));
}

const deviceAddresses: Record<MonitorId, string> = {
	1: 'be:16:87:00:06:2c',
	2: 'be:16:75:00:7f:09',
	3: 'be:16:75:00:90:2a',
};

const PRESETS = [
	{key: '0', name: 'Off', r: 0, g: 0, b: 0},
	{key: '1', name: 'Warm White', r: 255, g: 180, b: 120},
	{key: '2', name: 'Red', r: 255, g: 0, b: 0},
	{key: '3', name: 'Green', r: 0, g: 255, b: 0},
	{key: '4', name: 'Blue', r: 0, g: 0, b: 255},
	{key: '5', name: 'Cool Blue', r: 0, g: 120, b: 255},
];

export default function App({boundaryRef}: AppProps) {
	const chars = useRef<Record<string, Characteristic | null>>({});
	const [selected, setSelected] = useState<MonitorId[]>([]);
	const [brightness, setBrightness] = useState<number>(100);
	const [rValue, setRValue] = useState<number>(0);
	const [gValue, setGValue] = useState<number>(0);
	const [bValue, setBValue] = useState<number>(255);
	const [monitorCursor, setMonitorCursor] = useState<MonitorId>(1);
	const [focus, setFocus] = useState<'left' | 'right'>('left');
	const [leftCursor, setLeftCursor] = useState<
		'brightness' | 'r' | 'g' | 'b' | 'apply' | 'presets'
	>('brightness');
	const [autoApply, setAutoApply] = useState<boolean>(false);

	const HORIZONTAL_ADJ: Record<MonitorId, MonitorId | null> = {
		1: 3,
		2: 3,
		3: 1,
	};

	// === Error helper ===
	const reportError = (err: any) => {
		if (boundaryRef?.current) boundaryRef.current.reportError(err);
		else console.error(err);
	};

	useEffect(() => {
		let mounted = true;

		const start = async () => {
			const onStateChange = async (state: string) => {
				if (!mounted) return;
				if (state !== 'poweredOn') return;

				const connectedChars: Characteristic[] = [];

				for (const id of [1, 2, 3] as MonitorId[]) {
					const addr = deviceAddresses[id];
					if (!addr) continue;

					try {
						const char = await connect(addr);
						chars.current[addr] = char;
						connectedChars.push(char);

						// Set to red immediately on connect
						await setColor(char, 255, 0, 0);

						// Auto-select the monitor
						setSelected(sel => (sel.includes(id) ? sel : [...sel, id]));
					} catch (err) {
						chars.current[addr] = null;
						reportError(`Failed to connect to ${addr}: ${err}`);
					}
				}

				// Once all are connected, set to blue
				if (connectedChars.length === 3) {
					for (const char of connectedChars) {
						setTimeout(async () => {
							await setColor(char, 0, 0, 255);
						}, 500);
					}
				}
			};

			noble.on('stateChange', onStateChange);
		};

		start();
		return () => {
			mounted = false;
			noble.removeAllListeners('stateChange');
		};
	}, []);

	// === Scale colors safely ===
	const scaledColor = (bri: number, r: number, g: number, b: number) => {
		const scale = clamp(bri, 0, 100) / 100;
		return {
			r: clamp(Math.round(r * scale), 0, 255),
			g: clamp(Math.round(g * scale), 0, 255),
			b: clamp(Math.round(b * scale), 0, 255),
		};
	};

	// === Apply colors to selected monitors ===
	const applyToSelected = async () => {
		try {
			const {r, g, b} = scaledColor(brightness, rValue, gValue, bValue);
			await Promise.all(
				selected.map(async id => {
					const addr = deviceAddresses[id];
					const char = chars.current[addr];
					if (!char) return;
					await setColor(char, r, g, b);
				}),
			);
		} catch (err) {
			reportError(err);
		}
	};

	// === Apply preset ===
	const applyPreset = async (presetIndex: number) => {
		try {
			const p = PRESETS[presetIndex];
			if (!p) return;
			setRValue(clamp(p.r, 0, 255));
			setGValue(clamp(p.g, 0, 255));
			setBValue(clamp(p.b, 0, 255));
			await applyToSelected();
		} catch (err) {
			reportError(err);
		}
	};

	// === Auto-apply side effect ===
	useEffect(() => {
		if (!autoApply || selected.length === 0) return;
		applyToSelected().catch(reportError);
	}, [brightness, rValue, gValue, bValue, autoApply, selected.join(',')]);

	// === Input handling ===
	useInput((input, key) => {
		try {
			if (key.tab) {
				setFocus(f => (f === 'left' ? 'right' : 'left'));
				return;
			}
			if (input === 'a') {
				void applyToSelected();
				return;
			}
			if (input === 't') {
				setAutoApply(p => !p);
				return;
			}
			if (['0', '1', '2', '3', '4', '5'].includes(input)) {
				void applyPreset(parseInt(input, 10));
				return;
			}
			if (key.return) {
				console.clear();
				process.exit(0);
			}

			// Left panel
			if (focus === 'left') {
				if (key.upArrow)
					setLeftCursor(
						prev =>
							({apply: 'b', b: 'g', g: 'r', r: 'brightness'}[prev] ??
							'brightness'),
					);
				if (key.downArrow)
					setLeftCursor(
						prev =>
							({brightness: 'r', r: 'g', g: 'b', b: 'apply'}[prev] ?? 'apply'),
					);
				if (key.leftArrow || key.rightArrow) {
					const delta = key.leftArrow ? -1 : 1;
					if (leftCursor === 'brightness')
						setBrightness(p => clamp(p + delta * 5, 0, 100));
					if (leftCursor === 'r') setRValue(p => clamp(p + delta * 5, 0, 255));
					if (leftCursor === 'g') setGValue(p => clamp(p + delta * 5, 0, 255));
					if (leftCursor === 'b') setBValue(p => clamp(p + delta * 5, 0, 255));
				}
				if (leftCursor === 'apply' && input === ' ') void applyToSelected();
			}

			// Right panel
			if (focus === 'right') {
				if (key.upArrow) setMonitorCursor(m => (m === 1 ? 2 : m === 3 ? 1 : m));
				if (key.downArrow)
					setMonitorCursor(m => (m === 2 ? 1 : m === 1 ? 3 : m));
				if (key.rightArrow && HORIZONTAL_ADJ[monitorCursor])
					setMonitorCursor(HORIZONTAL_ADJ[monitorCursor]!);
				if (key.leftArrow && monitorCursor === 3)
					setMonitorCursor(HORIZONTAL_ADJ[monitorCursor]!);
				if (input === ' ')
					setSelected(sel =>
						sel.includes(monitorCursor)
							? sel.filter(id => id !== monitorCursor)
							: [...sel, monitorCursor],
					);
			}
		} catch (err) {
			reportError(err);
		}
	});

	const isSelected = (id: MonitorId) => selected.includes(id);
	const isMonitorCursor = (id: MonitorId) =>
		focus === 'right' && id === monitorCursor;

	return (
		<Box
			flexDirection="column"
			height={process.stdout.rows ?? 20}
			justifyContent="center"
			alignItems="center"
		>
			<Box flexDirection="row" gap={10} alignItems="center">
				{/* Left panel */}
				<Box
					flexDirection="column"
					borderStyle="round"
					borderColor={focus === 'left' ? 'cyan' : 'gray'}
					padding={1}
					width={50}
				>
					<Text bold>Controls</Text>
					<Box marginTop={1} flexDirection="column">
						<Text color={leftCursor === 'brightness' ? 'cyan' : undefined}>
							Brightness: {brightness}%
						</Text>
						<Text color={leftCursor === 'r' ? 'cyan' : undefined}>
							R: {rValue}
						</Text>
						<Text color={leftCursor === 'g' ? 'cyan' : undefined}>
							G: {gValue}
						</Text>
						<Text color={leftCursor === 'b' ? 'cyan' : undefined}>
							B: {bValue}
						</Text>
					</Box>
					<Box
						marginTop={1}
						borderStyle="round"
						borderColor={leftCursor === 'apply' ? 'cyan' : 'gray'}
						paddingX={1}
					>
						<Text>Apply (Space)</Text>
					</Box>
					<Box marginTop={1} flexDirection="column">
						<Text>
							Auto-apply: {autoApply ? <Text color="green">ON</Text> : 'OFF'}
						</Text>
					</Box>
					<Box marginTop={1} flexDirection="column">
						<Text bold>Presets</Text>
						{PRESETS.map(p => (
							<Text key={p.name}>
								[{p.key}] {p.name} — ({p.r},{p.g},{p.b})
							</Text>
						))}
					</Box>
				</Box>

				{/* Right panel */}
				<Box flexDirection="row" gap={1}>
					<Box flexDirection="column">
						<MonitorBox
							label="Screen 2"
							selected={isSelected(2)}
							cursor={isMonitorCursor(2)}
						/>
						<MonitorBox
							label="Screen 1"
							selected={isSelected(1)}
							cursor={isMonitorCursor(1)}
						/>
					</Box>
					<Box>
						<MonitorBox
							label="Screen 3"
							selected={isSelected(3)}
							cursor={isMonitorCursor(3)}
							tall
						/>
					</Box>
				</Box>
			</Box>
		</Box>
	);
}

function MonitorBox({
	label,
	selected,
	cursor,
	tall,
}: {
	label: string;
	selected: boolean;
	cursor: boolean;
	tall?: boolean;
}) {
	const borderColor = cursor ? 'cyan' : selected ? 'green' : 'gray';
	return (
		<Box
			borderStyle="round"
			borderColor={borderColor}
			paddingX={1}
			width={20}
			height={tall ? 20 : 10}
			flexDirection="column"
			justifyContent="center"
			alignItems="center"
		>
			<Text>
				{cursor ? '➤ ' : '  '}
				{label}
			</Text>
			<Text>{selected ? '✓ Selected' : '○ Not selected'}</Text>
		</Box>
	);
}
