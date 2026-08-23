import XLSX from 'xlsx';

const workbook = XLSX.readFile('/home/ubuntu/upload/Template-InformAccom-ImportExcel.xls', { cellDates: true });
const sheetName = workbook.SheetNames[0];
const sheet = workbook.Sheets[sheetName];
const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null, blankrows: false });
console.log(JSON.stringify({ sheetName, ref: sheet['!ref'], rows: rows.slice(0, 12) }, null, 2));
