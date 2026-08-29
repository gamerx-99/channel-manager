import "dotenv/config";
import { existsSync } from "node:fs";
import { isAbsolute, resolve } from "node:path";
import * as XLSX from "xlsx";

const configuredPath = process.env.TM30_TEMPLATE_PATH?.trim();
const templatePath = configuredPath
  ? isAbsolute(configuredPath)
    ? configuredPath
    : resolve(process.cwd(), configuredPath)
  : resolve(
      process.cwd(),
      "server/assets/Template-InformAccom-ImportExcel.xlsx"
    );

if (!existsSync(templatePath)) {
  throw new Error(
    `TM.30 template not found at "${templatePath}". Set TM30_TEMPLATE_PATH to the approved .xls/.xlsx file.`
  );
}

const workbook = XLSX.readFile(templatePath, { cellDates: true });
const sheetName = workbook.SheetNames[0];
const sheet = workbook.Sheets[sheetName];
const rows = XLSX.utils.sheet_to_json(sheet, {
  header: 1,
  defval: null,
  blankrows: false,
});
console.log(
  JSON.stringify(
    { templatePath, sheetName, ref: sheet["!ref"], rows: rows.slice(0, 12) },
    null,
    2
  )
);
