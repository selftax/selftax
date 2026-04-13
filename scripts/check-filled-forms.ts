import { readFileSync, writeFileSync, unlinkSync, mkdtempSync } from 'fs';
import { resolve, join } from 'path';
import { tmpdir } from 'os';

const FILES = [
  'P001339039-1775860105-f1040.pdf',
  'P001339039-1775860118-f1040s1.pdf',
  'P001339039-1775860126-f1040s3.pdf',
  'P001339039-1775860134-f1040sa.pdf',
  'P001339039-1775860143-f1040se1.pdf',
  'P001339039-1775860152-f2441.pdf',
];

async function main() {
  const { extractTextFromPDF } = await import('../packages/mcp/src/extraction/pdfExtractor.js');

  for (const file of FILES) {
    const filePath = resolve(process.env.HOME!, 'Downloads', file);
    const tmpDir = mkdtempSync(join(tmpdir(), 'st-'));
    const tmpFile = join(tmpDir, 'test.pdf');
    try {
      writeFileSync(tmpFile, readFileSync(filePath));
      const text = await extractTextFromPDF(tmpFile);
      unlinkSync(tmpFile);

      // Extract form name and key numbers
      const formName = file.replace(/P\d+-\d+-/, '').replace('.pdf', '');
      console.log(`\n${'='.repeat(60)}`);
      console.log(`${formName} — ${text.length} chars`);
      console.log('='.repeat(60));

      // Print lines that have dollar amounts or key values
      const lines = text.split('\n');
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        // Show lines with numbers (likely filled fields)
        if (/\d{2,}/.test(trimmed) && trimmed.length < 200) {
          console.log(`  ${trimmed}`);
        }
      }
    } catch (err) {
      console.log(`ERROR reading ${file}: ${(err as Error).message}`);
    }
  }
}

main().catch(console.error);
