export type RasterizedPage = {
  uri: string;
  width: number;
  height: number;
  dpi?: number;
};

export type RasterizeResult = {
  pages: RasterizedPage[];
  cleanup: () => Promise<void>;
};

export const hasNativePdfRasterizer = false;

export async function rasterizePdf(_source: string, _dpi = 300): Promise<RasterizeResult> {
  throw new Error('PDF rasterization is only supported on native platforms.');
}
