#!/usr/bin/env node

/**
 * Database Restore Script for Coot Club Task Hub
 *
 * This script restores database backups created by backup-database.js
 *
 * Usage:
 *   node scripts/restore-database.js [options]
 *
 * Options:
 *   --backup <path>           Path to backup file or directory
 *   --table <name>            Restore specific table only
 *   --dry-run                 Show what would be restored without executing
 *   --force                   Skip confirmation prompts
 *   --verbose                 Verbose logging
 *
 * Environment Variables:
 *   SUPABASE_URL              Supabase project URL
 *   SUPABASE_SERVICE_KEY      Supabase service role key
 */

const fs = require("fs").promises;
const path = require("path");
const zlib = require("zlib");
const { promisify } = require("util");
const gunzip = promisify(zlib.gunzip);
const readline = require("readline");

class DatabaseRestore {
  constructor(config = {}) {
    this.config = {
      dryRun: false,
      force: false,
      verbose: false,
      ...config,
    };

    this.supabaseUrl = process.env.SUPABASE_URL;
    this.supabaseKey = process.env.SUPABASE_SERVICE_KEY;

    if (!this.supabaseUrl || !this.supabaseKey) {
      throw new Error(
        "SUPABASE_URL and SUPABASE_SERVICE_KEY environment variables are required",
      );
    }
  }

  log(message, level = "info") {
    if (this.config.verbose || level === "error" || level === "warn") {
      const timestamp = new Date().toISOString();
      console.log(`[${timestamp}] [${level.toUpperCase()}] ${message}`);
    }
  }

  async confirmAction(message) {
    if (this.config.force) return true;

    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    return new Promise((resolve) => {
      rl.question(`${message} (y/N): `, (answer) => {
        rl.close();
        resolve(answer.toLowerCase() === "y" || answer.toLowerCase() === "yes");
      });
    });
  }

  async readBackupFile(filePath) {
    try {
      let content;

      if (filePath.endsWith(".gz")) {
        const compressed = await fs.readFile(filePath);
        const decompressed = await gunzip(compressed);
        content = decompressed.toString("utf8");
      } else {
        content = await fs.readFile(filePath, "utf8");
      }

      if (filePath.includes(".json")) {
        return JSON.parse(content);
      } else {
        // SQL format - return as text
        return { format: "sql", content };
      }
    } catch (error) {
      throw new Error(
        `Failed to read backup file ${filePath}: ${error.message}`,
      );
    }
  }

  async getTableSchema(tableName) {
    const url = `${this.supabaseUrl}/rest/v1/${tableName}?select=*&limit=0`;

    try {
      const response = await fetch(url, {
        headers: {
          Authorization: `Bearer ${this.supabaseKey}`,
          apikey: this.supabaseKey,
          "Content-Type": "application/json",
        },
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      return true; // Table exists
    } catch (error) {
      this.log(`Table ${tableName} may not exist: ${error.message}`, "warn");
      return false;
    }
  }

  async clearTable(tableName) {
    if (this.config.dryRun) {
      this.log(`[DRY RUN] Would clear table: ${tableName}`);
      return;
    }

    const url = `${this.supabaseUrl}/rest/v1/${tableName}`;

    try {
      const response = await fetch(url, {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${this.supabaseKey}`,
          apikey: this.supabaseKey,
          "Content-Type": "application/json",
          Prefer: "return=minimal",
        },
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      this.log(`Cleared table: ${tableName}`);
    } catch (error) {
      throw new Error(`Failed to clear table ${tableName}: ${error.message}`);
    }
  }

  async insertData(tableName, data) {
    if (this.config.dryRun) {
      this.log(
        `[DRY RUN] Would insert ${data.length} records into ${tableName}`,
      );
      return;
    }

    const url = `${this.supabaseUrl}/rest/v1/${tableName}`;
    const batchSize = 100; // Insert in batches to avoid payload limits

    for (let i = 0; i < data.length; i += batchSize) {
      const batch = data.slice(i, i + batchSize);

      try {
        const response = await fetch(url, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${this.supabaseKey}`,
            apikey: this.supabaseKey,
            "Content-Type": "application/json",
            Prefer: "return=minimal",
          },
          body: JSON.stringify(batch),
        });

        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(`HTTP ${response.status}: ${errorText}`);
        }

        this.log(
          `Inserted batch ${Math.floor(i / batchSize) + 1} (${batch.length} records) into ${tableName}`,
        );
      } catch (error) {
        throw new Error(
          `Failed to insert batch into ${tableName}: ${error.message}`,
        );
      }
    }

    this.log(`Successfully inserted ${data.length} records into ${tableName}`);
  }

  async restoreTable(tableName, backupData) {
    this.log(`Starting restore for table: ${tableName}`);

    // Check if table exists
    const tableExists = await this.getTableSchema(tableName);
    if (!tableExists) {
      this.log(`Skipping ${tableName} - table does not exist`, "warn");
      return { table: tableName, status: "skipped", reason: "table_not_found" };
    }

    // Confirm destructive operation
    if (!this.config.dryRun) {
      const confirmed = await this.confirmAction(
        `⚠️  This will DELETE all existing data in table '${tableName}' and restore from backup. Continue?`,
      );

      if (!confirmed) {
        this.log(`Restore cancelled for table: ${tableName}`);
        return { table: tableName, status: "cancelled" };
      }
    }

    try {
      // Clear existing data
      await this.clearTable(tableName);

      // Insert backup data
      if (backupData.data && backupData.data.length > 0) {
        await this.insertData(tableName, backupData.data);
      } else {
        this.log(`No data to restore for table: ${tableName}`, "warn");
      }

      return {
        table: tableName,
        status: "success",
        recordCount: backupData.data ? backupData.data.length : 0,
      };
    } catch (error) {
      this.log(
        `Failed to restore table ${tableName}: ${error.message}`,
        "error",
      );
      return {
        table: tableName,
        status: "error",
        error: error.message,
      };
    }
  }

  async restoreFromFile(filePath, targetTable = null) {
    this.log(`Reading backup file: ${filePath}`);

    const backupData = await this.readBackupFile(filePath);

    if (backupData.format === "sql") {
      throw new Error(
        "SQL format restore not yet implemented. Please use JSON format backups.",
      );
    }

    if (targetTable) {
      // Restore specific table
      if (backupData.table !== targetTable) {
        throw new Error(
          `Backup file contains data for '${backupData.table}', but requested '${targetTable}'`,
        );
      }

      return [await this.restoreTable(targetTable, backupData)];
    } else {
      // Restore single table from file
      return [await this.restoreTable(backupData.table, backupData)];
    }
  }

  async restoreFromDirectory(dirPath, targetTable = null) {
    this.log(`Scanning backup directory: ${dirPath}`);

    const files = await fs.readdir(dirPath);
    const backupFiles = files.filter(
      (f) =>
        (f.endsWith(".json") || f.endsWith(".json.gz")) &&
        f !== "backup-manifest.json",
    );

    if (backupFiles.length === 0) {
      throw new Error(`No backup files found in directory: ${dirPath}`);
    }

    const results = [];

    for (const file of backupFiles) {
      const filePath = path.join(dirPath, file);

      try {
        const backupData = await this.readBackupFile(filePath);

        if (targetTable && backupData.table !== targetTable) {
          continue; // Skip files that don't match target table
        }

        const result = await this.restoreTable(backupData.table, backupData);
        results.push(result);

        if (targetTable) {
          break; // Found and restored target table
        }
      } catch (error) {
        this.log(`Error processing file ${file}: ${error.message}`, "error");
        results.push({
          table: file,
          status: "error",
          error: error.message,
        });
      }
    }

    return results;
  }

  async run(backupPath, targetTable = null) {
    const startTime = Date.now();
    this.log("Starting database restore process...");

    if (this.config.dryRun) {
      this.log("🔍 DRY RUN MODE - No changes will be made");
    }

    try {
      // Check if backup path exists
      const stats = await fs.stat(backupPath);
      let results;

      if (stats.isFile()) {
        results = await this.restoreFromFile(backupPath, targetTable);
      } else if (stats.isDirectory()) {
        results = await this.restoreFromDirectory(backupPath, targetTable);
      } else {
        throw new Error(`Invalid backup path: ${backupPath}`);
      }

      const duration = Date.now() - startTime;
      const successful = results.filter((r) => r.status === "success").length;
      const failed = results.filter((r) => r.status === "error").length;
      const skipped = results.filter((r) => r.status === "skipped").length;

      this.log(`Restore process completed in ${duration}ms`);
      this.log(`✅ Successful: ${successful}`);
      if (failed > 0) this.log(`❌ Failed: ${failed}`);
      if (skipped > 0) this.log(`⏭️  Skipped: ${skipped}`);

      return {
        success: failed === 0,
        duration,
        results,
        summary: { successful, failed, skipped },
      };
    } catch (error) {
      this.log(`Restore process failed: ${error.message}`, "error");
      throw error;
    }
  }
}

// CLI interface
if (require.main === module) {
  const args = process.argv.slice(2);
  const config = {};
  let backupPath = null;
  let targetTable = null;

  // Parse command line arguments
  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case "--backup":
        backupPath = args[++i];
        break;
      case "--table":
        targetTable = args[++i];
        break;
      case "--dry-run":
        config.dryRun = true;
        break;
      case "--force":
        config.force = true;
        break;
      case "--verbose":
        config.verbose = true;
        break;
      case "--help":
        console.log(`
Coot Club Database Restore Tool

Usage: node scripts/restore-database.js --backup <path> [options]

Options:
  --backup <path>           Path to backup file or directory (required)
  --table <name>            Restore specific table only
  --dry-run                 Show what would be restored without executing
  --force                   Skip confirmation prompts
  --verbose                 Verbose logging
  --help                    Show this help message

Environment Variables:
  SUPABASE_URL              Supabase project URL (required)
  SUPABASE_SERVICE_KEY      Supabase service role key (required)

Examples:
  node scripts/restore-database.js --backup ./backups/users_2024-01-01.json
  node scripts/restore-database.js --backup ./backups --table users --dry-run
  node scripts/restore-database.js --backup ./backups --force --verbose
`);
        process.exit(0);
        break;
    }
  }

  if (!backupPath) {
    console.error("❌ Error: --backup option is required");
    console.error("Use --help for usage information");
    process.exit(1);
  }

  // Run restore
  const restore = new DatabaseRestore(config);
  restore
    .run(backupPath, targetTable)
    .then((result) => {
      if (result.success) {
        console.log("\n✅ Restore completed successfully!");
      } else {
        console.log("\n⚠️  Restore completed with errors");
      }
      console.log(
        `📊 Summary: ${result.summary.successful} successful, ${result.summary.failed} failed, ${result.summary.skipped} skipped`,
      );
      console.log(`⏱️  Duration: ${result.duration}ms`);
      process.exit(result.success ? 0 : 1);
    })
    .catch((error) => {
      console.error("\n❌ Restore failed:", error.message);
      process.exit(1);
    });
}

module.exports = DatabaseRestore;
