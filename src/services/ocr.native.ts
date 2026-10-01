import { recognizeText } from '@infinitered/react-native-mlkit-text-recognition';

export interface OcrResult {
  rawText: string;
  suggestedName: string;
  suggestedStrength: string;
  suggestedPackageSize: number | null;
}

const parseText = (rawText: string): OcrResult => {
  const lines = rawText.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const strength = rawText.match(/\b\d+(?:[.,]\d+)?\s?(?:mg|g|µg|mcg)\b/i)?.[0] ?? '';
  const packageMatch = rawText.match(/\b(\d{1,3})\s?(?:tablet|tbl|tobolek|cps)\b/i);
  const likelyName = lines.find((line) => /[A-Za-zÁ-ž]{4}/.test(line) && !/tablet|mg|příbal/i.test(line)) ?? '';
  return {
    rawText,
    suggestedName: likelyName.replace(/[^A-Za-zÁ-ž0-9 -]/g, '').trim(),
    suggestedStrength: strength,
    suggestedPackageSize: packageMatch ? Number(packageMatch[1]) : null,
  };
};

export async function recognizeMedicineBox(imageUri: string): Promise<OcrResult> {
  const result = await recognizeText(imageUri);
  return parseText(result.text);
}
