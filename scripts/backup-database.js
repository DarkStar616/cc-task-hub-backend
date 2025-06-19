#!/usr/bin/env node

/**
 * Automated Database Backup Script for Coot Club Task Hub
 *
 * This script creates backups of critical tables using Supabase's REST API
 * and stores them in JSON format with optional compression.
 *
 * Usage:
 *   node scripts/backup-database.js [options]
 *
 * Options:
 *   --tables <table1,table2>  Specific tables to backup (default: all critical tables)
 *   --output <path>           Output directory (default: ./backups)
 *   --compress                Compress backup files with gzip
 *   --retention <days>        Delete backups older than N days (default: 30)
 *   --format <json|sql>       Backup format (default: json)
 *   --verbose                 Verbose logging
 *
 * Environment Variables:
 *   SUPABASE_URL              Supabase project URL
 *   SUPABASE_SERVICE_KEY      Supabase service role key
 *   BACKUP_STORAGE_PATH       Custom backup storage path
 *   BACKUP_RETENTION_DAYS     Default retention period
 */

const fs = require("fs").promises;
const path = require("path");
const zlib = require("zlib");
const { promisify } = require("util");
const gzip = promisify(zlib.gzip);

// Configuration
const CRITICAL_TABLES = [
  "users",
  "roles",
  "departments",
  "tasks",
  "sops",
  "clock_sessions",
  "reminders",
  "feedback",
  "audit_logs",
  "analytics",
  "notifications",
];

const DEFAULT_CONFIG = {
  outputDir: process.env.BACKUP_STORAGE_PATH || "./backups",
  retentionDays: parseInt(process.env.BACKUP_RETENTION_DAYS || "30"),
  format: "json",
  compress: false,
  verbose: false,
  tables: CRITICAL_TABLES,
};

class DatabaseBackup {
  constructor(config = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.supabaseUrl = process.env.SUPABASE_URL;
    this.supabaseKey = process.env.SUPABASE_SERVICE_KEY;

    if (!this.supabaseUrl || !this.supabaseKey) {
      throw new Error(
        "SUPABASE_URL and SUPABASE_SERVICE_KEY environment variables are required",
      );
    }
  }

  log(message, level = "info") {
    if (this.config.verbose || level === "error") {
      const timestamp = new Date().toISOString();
      console.log(`[${timestamp}] [${level.toUpperCase()}] ${message}`);
    }
  }

  async ensureOutputDirectory() {
    try {
      await fs.access(this.config.outputDir);
    } catch (error) {
      this.log(`Creating output directory: ${this.config.outputDir}`);
      await fs.mkdir(this.config.outputDir, { recursive: true });
    }
  }

  async fetchTableData(tableName) {
    const url = `${this.supabaseUrl}/rest/v1/${tableName}?select=*`;

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

      const data = await response.json();
      this.log(`Fetched ${data.length} records from ${tableName}`);
      return data;
    } catch (error) {
      this.log(
        `Error fetching data from ${tableName}: ${error.message}`,
        "error",
      );
      throw error;
    }
  }

  async backupTable(tableName) {
    this.log(`Starting backup for table: ${tableName}`);

    try {
      const data = await this.fetchTableData(tableName);
      const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
      const filename = `${tableName}_${timestamp}.${this.config.format}`;
      const filepath = path.join(this.config.outputDir, filename);

      let content;
      if (this.config.format === "json") {
        content = JSON.stringify(
          {
            table: tableName,
            timestamp: new Date().toISOString(),
            recordCount: data.length,
            data: data,
          },
          null,
          2,
        );
      } else if (this.config.format === "sql") {
        content = this.generateSQLInserts(tableName, data);
      }

      if (this.config.compress) {
        const compressed = await gzip(content);
        await fs.writeFile(`${filepath}.gz`, compressed);
        this.log(`Compressed backup saved: ${filepath}.gz`);
      } else {
        await fs.writeFile(filepath, content, "utf8");
        this.log(`Backup saved: ${filepath}`);
      }

      return {
        table: tableName,
        filename: this.config.compress ? `${filename}.gz` : filename,
        recordCount: data.length,
        size: content.length,
      };
    } catch (error) {
      this.log(
        `Failed to backup table ${tableName}: ${error.message}`,
        "error",
      );
      throw error;
    }
  }

  generateSQLInserts(tableName, data) {
    if (data.length === 0) {
      return `-- No data found for table ${tableName}\n`;
    }

    const columns = Object.keys(data[0]);
    let sql = `-- Backup for table ${tableName}\n`;
    sql += `-- Generated on ${new Date().toISOString()}\n`;
    sql += `-- Record count: ${data.length}\n\n`;

    sql += `TRUNCATE TABLE ${tableName} CASCADE;\n\n`;

    for (const row of data) {
      const values = columns
        .map((col) => {
          const value = row[col];
          if (value === null) return "NULL";
          if (typeof value === "string")
            return `'${value.replace(/'/g, "''")}'`;
          if (typeof value === "object")
            return `'${JSON.stringify(value).replace(/'/g, "''")}'`;
          return value;
        })
        .join(", ");

      sql += `INSERT INTO ${tableName} (${columns.join(", ")}) VALUES (${values});\n`;
    }

    return sql;
  }

  async cleanupOldBackups() {
    this.log("Cleaning up old backups...");

    try {
      const files = await fs.readdir(this.config.outputDir);
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - this.config.retentionDays);

      let deletedCount = 0;

      for (const file of files) {
        const filepath = path.join(this.config.outputDir, file);
        const stats = await fs.stat(filepath);

        if (stats.mtime < cutoffDate) {
          await fs.unlink(filepath);
          this.log(`Deleted old backup: ${file}`);
          deletedCount++;
        }
      }

      this.log(`Cleanup completed. Deleted ${deletedCount} old backup files.`);
    } catch (error) {
      this.log(`Error during cleanup: ${error.message}`, "error");
    }
  }

  async createManifest(backupResults) {
    const manifest = {
      timestamp: new Date().toISOString(),
      version: "1.0",
      config: {
        format: this.config.format,
        compressed: this.config.compress,
        retentionDays: this.config.retentionDays,
      },
      backups: backupResults,
      totalTables: backupResults.length,
      totalRecords: backupResults.reduce(
        (sum, backup) => sum + backup.recordCount,
        0,
      ),
    };

    const manifestPath = path.join(
      this.config.outputDir,
      "backup-manifest.json",
    );
    await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2));
    this.log(`Backup manifest created: ${manifestPath}`);
  }

  async run() {
    const startTime = Date.now();
    this.log("Starting database backup process...");

    try {
      await this.ensureOutputDirectory();

      const backupResults = [];

      for (const table of this.config.tables) {
        try {
          const result = await this.backupTable(table);
          backupResults.push(result);
        } catch (error) {
          this.log(
            `Skipping table ${table} due to error: ${error.message}`,
            "error",
          );
          backupResults.push({
            table,
            error: error.message,
            recordCount: 0,
            size: 0,
          });
        }
      }

      await this.createManifest(backupResults);
      await this.cleanupOldBackups();

      const duration = Date.now() - startTime;
      const successfulBackups = backupResults.filter((r) => !r.error).length;

      this.log(`Backup process completed in ${duration}ms`);
      this.log(
        `Successfully backed up ${successfulBackups}/${this.config.tables.length} tables`,
      );

      return {
        success: true,
        duration,
        backups: backupResults,
        successfulBackups,
        totalTables: this.config.tables.length,
      };
    } catch (error) {
      this.log(`Backup process failed: ${error.message}`, "error");
      throw error;
    }
  }
}

// CLI interface
if (require.main === module) {
  const args = process.argv.slice(2);
  const config = { ...DEFAULT_CONFIG };

  // Parse command line arguments
  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case "--tables":
        config.tables = args[++i].split(",").map((t) => t.trim());
        break;
      case "--output":
        config.outputDir = args[++i];
        break;
      case "--compress":
        config.compress = true;
        break;
      case "--retention":
        config.retentionDays = parseInt(args[++i]);
        break;
      case "--format":
        config.format = args[++i];
        break;
      case "--verbose":
        config.verbose = true;
        break;
      case "--help":
        console.log(`
Coot Club Database Backup Tool

Usage: node scripts/backup-database.js [options]

Options:
  --tables <table1,table2>  Specific tables to backup
  --output <path>           Output directory (default: ./backups)
  --compress                Compress backup files with gzip
  --retention <days>        Delete backups older than N days (default: 30)
  --format <json|sql>       Backup format (default: json)
  --verbose                 Verbose logging
  --help                    Show this help message

Environment Variables:
  SUPABASE_URL              Supabase project URL (required)
  SUPABASE_SERVICE_KEY      Supabase service role key (required)
  BACKUP_STORAGE_PATH       Custom backup storage path
  BACKUP_RETENTION_DAYS     Default retention period

Examples:
  node scripts/backup-database.js --verbose
  node scripts/backup-database.js --tables users,tasks --compress
  node scripts/backup-database.js --format sql --output /backups
`);
        process.exit(0);
        break;
    }
  }

  // Run backup
  const backup = new DatabaseBackup(config);
  backup
    .run()
    .then((result) => {
      console.log("\n✅ Backup completed successfully!");
      console.log(
        `📊 ${result.successfulBackups}/${result.totalTables} tables backed up`,
      );
      console.log(`⏱️  Duration: ${result.duration}ms`);
      process.exit(0);
    })
    .catch((error) => {
      console.error("\n❌ Backup failed:", error.message);
      process.exit(1);
    });
}

module.exports = DatabaseBackup;
