declare module "qrcode" {
  type ErrorCorrectionLevel = "L" | "M" | "Q" | "H";

  type RenderOptions = {
    errorCorrectionLevel?: ErrorCorrectionLevel;
    margin?: number;
    width?: number;
    color?: {
      dark?: string;
      light?: string;
    };
  };

  type SvgOptions = RenderOptions & {
    type: "svg";
  };

  const QRCode: {
    toCanvas(canvas: HTMLCanvasElement, text: string, options?: RenderOptions): Promise<void>;
    toString(text: string, options: SvgOptions): Promise<string>;
  };

  export default QRCode;
}
