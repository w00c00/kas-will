import fs from "node:fs";
import path from "node:path";
import { randomId, safeId } from "./security.mjs";

export class DraftStore {
  constructor(dataDir) {
    this.directory = path.join(dataDir, "drafts");
    fs.mkdirSync(this.directory, { recursive: true, mode: 0o700 });
  }

  create(value) {
    const id = randomId("draft");
    const record = { ...value, id, createdAt: new Date().toISOString(), status: "unsigned" };
    this.save(record);
    return record;
  }

  get(id) {
    const normalized = safeId(id, "draft id");
    try { return JSON.parse(fs.readFileSync(path.join(this.directory, `${normalized}.json`), "utf8")); } catch (error) {
      if (error.code === "ENOENT") return null;
      throw error;
    }
  }

  save(record) {
    const id = safeId(record.id, "draft id");
    const file = path.join(this.directory, `${id}.json`);
    const temporary = `${file}.${process.pid}.tmp`;
    fs.writeFileSync(temporary, `${JSON.stringify(record, null, 2)}\n`, { mode: 0o600 });
    fs.renameSync(temporary, file);
    return record;
  }
}
