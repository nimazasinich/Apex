export const DEFAULT_CHART_WIDTH = 960;
export const DEFAULT_CHART_HEIGHT = 320;
export const DEFAULT_VOLUME_HEIGHT = 56;

export type PriceChartGeometry = {
  chartWidth: number;
  chartHeight: number;
  volumeHeight: number;
  rsiHeight: number;
};

/**
 * Derives the SVG coordinate system from the observed chart container. Width
 * and height are independent so resizing a dock, drawer, or viewport does not
 * retain the former fixed 960×320 drawing surface.
 */
export function calculatePriceChartGeometry(containerWidth: number, containerHeight?: number): PriceChartGeometry {
  const chartWidth = Math.max(
    320,
    Math.round(Number.isFinite(containerWidth) && containerWidth > 0 ? containerWidth : DEFAULT_CHART_WIDTH),
  );

  const fallbackTotalHeight = DEFAULT_CHART_HEIGHT + DEFAULT_VOLUME_HEIGHT;
  const totalHeight = Math.max(
    250,
    Math.round(Number.isFinite(containerHeight) && Number(containerHeight) > 0 ? Number(containerHeight) : fallbackTotalHeight),
  );
  const volumeHeight = Math.max(40, Math.min(72, Math.round(totalHeight * 0.15)));
  const chartHeight = Math.max(200, totalHeight - volumeHeight);

  return {
    chartWidth,
    chartHeight,
    volumeHeight,
    rsiHeight: Math.max(60, Math.min(96, Math.round(chartHeight * 0.25))),
  };
}
