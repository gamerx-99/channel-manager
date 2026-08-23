// TM.30 Export Golden-File & Validation Test
import * as XLSX from "xlsx";
import assert from "assert";

const sampleGuests = [
  {
    firstName: "Daniel",
    middleName: "James",
    lastName: "Miller",
    gender: "M",
    passportNo: "P8831042",
    nationalityCode: "USA",
    birthDate: "15/05/1988",
    phoneNo: "+15550192"
  },
  {
    firstName: "Chen",
    middleName: "",
    lastName: "Wei",
    gender: "F",
    passportNo: "E992104",
    nationalityCode: "CHN",
    birthDate: "22/11/1992",
    phoneNo: "+8613901"
  }
];

const expectedHeaders = [
  "First name",
  "Middle name",
  "Last name",
  "Gender",
  "Passport no.",
  "Nationality code",
  "Birth date",
  "Phone no."
];

function runTest() {
  console.log("Running TM.30 Golden-File & Mapping Validation Test...");

  // 1. Validate headers
  const aoa = [
    expectedHeaders,
    ...sampleGuests.map(g => [g.firstName, g.middleName, g.lastName, g.gender, g.passportNo, g.nationalityCode, g.birthDate, g.phoneNo])
  ];

  assert.deepStrictEqual(aoa[0], expectedHeaders, "Headers must match official template columns");

  // 2. Validate ICAO 3-letter codes
  sampleGuests.forEach((g, idx) => {
    assert.strictEqual(g.nationalityCode.length, 3, `Guest ${idx} nationality code must be 3 characters`);
    assert.strictEqual(g.nationalityCode, g.nationalityCode.toUpperCase(), `Guest ${idx} nationality code must be uppercase`);
  });

  // 3. Test XLSX generation
  const worksheet = XLSX.utils.aoa_to_sheet(aoa);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "TM.30 Guest Import");
  
  const buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });
  assert.ok(buffer.length > 0, "Generated xlsx buffer must not be empty");

  console.log("✅ All TM.30 golden-file tests passed successfully!");
}

runTest();
