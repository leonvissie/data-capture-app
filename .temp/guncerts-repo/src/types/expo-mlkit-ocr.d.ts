declare module 'expo-mlkit-ocr' {
  export type TextPoint = { x: number; y: number };

  export type TextElement = {
    text: string;
    cornerPoints: TextPoint[];
  };

  export type TextLine = {
    text: string;
    cornerPoints: TextPoint[];
    elements: TextElement[];
  };

  export type TextBlock = {
    text: string;
    cornerPoints: TextPoint[];
    lines: TextLine[];
  };

  export type TextRecognitionResult = {
    text: string;
    blocks: TextBlock[];
  };

  export type ExpoMlkitOcrModule = {
    recognizeText: (imageUri: string) => Promise<TextRecognitionResult>;
  };

  const module: ExpoMlkitOcrModule;
  export default module;
}
