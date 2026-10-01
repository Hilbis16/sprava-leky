export interface OcrResult {
  rawText: string;
  suggestedName: string;
  suggestedStrength: string;
  suggestedPackageSize: number | null;
}

export async function recognizeMedicineBox(_imageUri: string): Promise<OcrResult> {
  throw new Error('OCR krabičky je dostupné v mobilním development buildu.');
}
