import Airtable, {
  type Attachment,
  type FieldSet,
  type Records,
} from "airtable";
import axios from "axios";
import fs from "fs";
import { parse } from "json2csv";
import path from "path";

const apiKey = process.env.API_KEY;
if (!apiKey) throw new Error("Missing API_KEY environment variable");
const baseId = process.env.BASE_ID;
if (!baseId) throw new Error("Missing BASE_ID environment variable");

const base = new Airtable({ apiKey }).base(baseId);
const backupDir = path.join(__dirname, "airtable_backup");

// Ensure the backup directory exists
if (!fs.existsSync(backupDir)) {
  fs.mkdirSync(backupDir, { recursive: true });
}

async function downloadFile(url: string, filePath: string): Promise<void> {
  const response = await axios({
    method: "GET",
    url: url,
    responseType: "stream",
  });

  const writer = fs.createWriteStream(filePath);
  response.data.pipe(writer);

  return new Promise((resolve, reject) => {
    writer.on("finish", resolve);
    writer.on("error", reject);
  });
}

async function processAttachments(
  record: Airtable.Record<FieldSet>,
  tableName: string,
  fieldName: string
): Promise<void> {
  const attachments = record.get(fieldName) as Attachment[] | undefined;
  if (!attachments) return;

  const recordName = (record.get("Name") as string) || record.id;
  const sanitizedRecordName = recordName
    .replace(/[^a-z0-9]/gi, "_")
    .toLowerCase();
  const attachmentDir = path.join(
    backupDir,
    `${tableName}.${fieldName}`,
    sanitizedRecordName
  );

  if (!fs.existsSync(attachmentDir)) {
    fs.mkdirSync(attachmentDir, { recursive: true });
  }

  for (const attachment of attachments) {
    const filePath = path.join(attachmentDir, attachment.filename);
    await downloadFile(attachment.url, filePath);
    console.log(`Downloaded: ${filePath}`);
  }
}

async function backupTable(tableName: string): Promise<void> {
  console.log(`Backing up table: ${tableName}`);
  const records: Records<FieldSet> = await base(tableName).select().all();

  const csvData = records.map((record) => {
    const fields: FieldSet = { ...record.fields, id: record.id };
    for (const [key, value] of Object.entries(fields)) {
      if (
        Array.isArray(value) &&
        value[0] &&
        typeof value[0] === "object" &&
        "url" in value[0]
      ) {
        fields[key] = value
          .map((attachment: Attachment) => attachment.url)
          .join(", ");
      }
    }
    return fields;
  });

  const csv = parse(csvData);
  fs.writeFileSync(path.join(backupDir, `${tableName}.csv`), csv);

  for (const record of records) {
    for (const [fieldName, value] of Object.entries(record.fields)) {
      if (
        Array.isArray(value) &&
        value[0] &&
        typeof value[0] === "object" &&
        "url" in value[0]
      ) {
        await processAttachments(record, tableName, fieldName);
      }
    }
  }
}

async function getTableNames(): Promise<string[]> {
  try {
    const response = await axios.get(
      `https://api.airtable.com/v0/meta/bases/${baseId}/tables`,
      {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
      }
    );

    return response.data.tables.map((table: any) => table.name);
  } catch (error) {
    console.error("Error fetching table names:", error);
    throw error;
  }
}

async function backupBase(): Promise<void> {
  try {
    const tables = await getTableNames();
    for (const tableName of tables) {
      await backupTable(tableName);
    }
    console.log("Backup completed successfully!");
  } catch (error) {
    console.error("Error during backup:", error);
  }
}

backupBase();
