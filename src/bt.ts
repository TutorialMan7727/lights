// bt.ts
import noble, {Peripheral, Characteristic} from '@abandonware/noble';

function limitHex(v: number) {
	return Math.max(0, Math.min(255, Math.round(v)));
}

async function sendCommand(char: Characteristic, bytes: Uint8Array) {
	// characteristic writeAsync returns a Promise
	return char.writeAsync(Buffer.from(bytes), false);
}

/**
 * Send a raw color command (0..255 per channel).
 */
export async function setColor(
	char: Characteristic,
	r: number,
	g: number,
	b: number,
) {
	// command format you provided
	const cmd = new Uint8Array([
		0x7e,
		0x00,
		0x05,
		0x03,
		limitHex(r),
		limitHex(g),
		limitHex(b),
		0x00,
		0xef,
	]);
	await sendCommand(char, cmd);
}

/**
 * Connect to a device address and return the writable characteristic used for color.
 * Resolves with the characteristic or rejects on error.
 */
export async function connect(address: string): Promise<Characteristic> {
	return new Promise<Characteristic>((resolve, reject) => {
		const onDiscover = async (p: Peripheral) => {
			// some platforms report addresses in uppercase; normalize
			if (!p.address) return;
			if (p.address.toLowerCase() !== address.toLowerCase()) return;

			noble.removeListener('discover', onDiscover);
			try {
				await noble.stopScanningAsync();
			} catch (err) {
				// ignore
			}

			try {
				await p.connectAsync();

				// these service/characteristic UUIDs were in your original code
				const {characteristics} =
					await p.discoverSomeServicesAndCharacteristicsAsync(
						['0000fff0-0000-1000-8000-00805f9b34fb'],
						['0000fff3-0000-1000-8000-00805f9b34fb'],
					);

				if (!characteristics || characteristics.length === 0) {
					reject(new Error('No characteristics found'));
					return;
				}

				resolve(characteristics[0]);
			} catch (err) {
				reject(err);
			}
		};

		noble.on('discover', onDiscover);

		// start scanning (no filters) - stop scanning will be called in discover handler
		noble.startScanningAsync([], false).catch(err => {
			noble.removeListener('discover', onDiscover);
			reject(err);
		});
	});
}
