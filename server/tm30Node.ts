import { existsSync, readFileSync } from "node:fs";
import { isAbsolute, resolve } from "node:path";
import * as XLSX from "xlsx";
import { createMappedTemplateWorkbook, registerTm30TemplateLoader } from "./tm30";

const defaultTemplatePath = resolve(
  process.cwd(),
  "server/assets/Template-InformAccom-ImportExcel.xlsx"
);

export function getTm30TemplatePath(): string {
  const configuredTemplatePath = process.env.TM30_TEMPLATE_PATH?.trim();
  return configuredTemplatePath
    ? isAbsolute(configuredTemplatePath)
      ? configuredTemplatePath
      : resolve(process.cwd(), configuredTemplatePath)
    : defaultTemplatePath;
}

export function loadNodeTm30Template(): XLSX.WorkBook {
  const configuredTemplatePath = process.env.TM30_TEMPLATE_PATH?.trim();
  const templatePath = getTm30TemplatePath();

  if (!existsSync(templatePath)) {
    if (configuredTemplatePath) {
      throw new Error(
        `TM.30 template not found at "${templatePath}". Set TM30_TEMPLATE_PATH to a readable .xls/.xlsx file.`
      );
    }
    return createMappedTemplateWorkbook();
  }

  return XLSX.read(readFileSync(templatePath), {
    type: "buffer",
    cellStyles: true,
  });
}

export function initNodeTm30() {
  registerTm30TemplateLoader(loadNodeTm30Template);
}
