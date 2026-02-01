/**
 * MFI (Money Flow Index)
 * Volume-weighted RSI
 * Using technicalindicators library
 */

import { MFI } from "technicalindicators";

export function computeMFI(
	high: number[],
	low: number[],
	close: number[],
	volume: number[],
	period: number = 14,
): number | null {
	if (
		!Array.isArray(high) ||
		!Array.isArray(low) ||
		!Array.isArray(close) ||
		!Array.isArray(volume) ||
		high.length < period ||
		low.length < period ||
		close.length < period ||
		volume.length < period
	) {
		return null;
	}

	const mfiResult = MFI.calculate({
		high,
		low,
		close,
		volume,
		period,
	});

	return mfiResult.length > 0 ? mfiResult[mfiResult.length - 1] : null;
}
