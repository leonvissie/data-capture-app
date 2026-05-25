import { PDFDocument } from 'pdf-lib';
import { deepGet } from './utils';

type FieldMap = Record<string, string>; // { pdfFieldName: 'data.path.to.value' }

/** Try to set any field type gracefully */
function setAnyField(form: any, name: string, value: any) {
  // text
  try { const f = form.getTextField(name); if (f) return f.setText(String(value)); } catch {}
  // dropdown
  try { const f = form.getDropdown(name); if (f) return f.select(String(value)); } catch {}
  // option list
  try { const f = form.getOptionList(name); if (f) return f.select(String(value)); } catch {}
  // radio
  try { const f = form.getRadioGroup(name); if (f) return f.select(String(value)); } catch {}
  // checkbox
  try {
    const f = form.getCheckBox(name);
    if (f) return (value === true || value === 'true' || value === 'X') ? f.check() : f.uncheck();
  } catch {}
  // button (rare)
  try { const f = form.getButton(name); if (f) return; } catch {}
}

export async function make518aPdf(args: {
  templateBytes: Uint8Array;
  fieldmap: FieldMap;
  data: any;               // { application, profile, firearms, ... } shaped to your map
  flatten?: boolean;
}): Promise<Uint8Array> {
  const { templateBytes, fieldmap, data, flatten = true } = args;

  const pdfDoc = await PDFDocument.load(templateBytes);
  const form = pdfDoc.getForm();

  for (const [pdfField, dataPath] of Object.entries(fieldmap)) {
    const val = deepGet(data, dataPath);
    if (val !== undefined && val !== null) {
      setAnyField(form, pdfField, val);
    }
  }

  if (flatten) form.flatten();
  return await pdfDoc.save(); // Uint8Array
}